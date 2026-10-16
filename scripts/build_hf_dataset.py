"""Build the WorldCast Hugging Face dataset from a local source folder. Uploads nothing.

The source folder holds cases.json, a list of Cases with case_id, category, level,
prompt, steps, task_type, result_weight, hints_by_metric, and initial_images /
hint_images given as [{"path": ...}] relative to the folder. Requires `datasets`.
"""
import argparse
import json
from pathlib import Path
import shutil

from datasets import Dataset, Features, Image, List, Value, load_dataset

GROUPS = ("TC", "CP", "VC")
FEATURES = Features({
    "case_id": Value("int32"), "level": Value("string"), "category": Value("string"),
    "prompt": Value("string"), "steps": Value("int32"), "target_grid": Value("string"),
    "task_type": Value("string"), "result_weight": Value("float64"),
    "initial_images": List(Image()), "hint_images": List(Image()),
    "hints_by_metric": {group: {"hints": List(Value("string")), "image_indices": List(Value("int32"))}
                        for group in GROUPS},
})
# Rows x columns of the collage requested from grid models, by step count.
TARGET_GRIDS = {2: "1x2", 4: "2x2", 6: "2x3"}
SHARD_ROWS = 80


def build(source, output):
    source, output = Path(source), Path(output)
    records = sorted(json.loads((source / "cases.json").read_text(encoding="utf-8")), key=lambda r: r["case_id"])
    if len({record["case_id"] for record in records}) != len(records):
        raise ValueError("Duplicate case_id in cases.json")
    rows = []
    for record in records:
        record.setdefault("target_grid", TARGET_GRIDS[record["steps"]])
        row = {key: record[key] for key in FEATURES if key not in ("initial_images", "hint_images", "hints_by_metric")}
        for field in ("initial_images", "hint_images"):
            # Original bytes are embedded unchanged; only the filename is kept as the path.
            row[field] = [{"path": Path(image["path"]).name, "bytes": (source / image["path"]).read_bytes()}
                          for image in record[field]]
        row["hints_by_metric"] = {group: {"hints": record["hints_by_metric"][group]["hints"],
                                          "image_indices": record["hints_by_metric"][group].get("image_indices", [])}
                                  for group in GROUPS}
        if any(not 1 <= index <= len(row["hint_images"])
               for group in GROUPS for index in row["hints_by_metric"][group]["image_indices"]):
            raise ValueError(f"Case {record['case_id']}: image_indices must be one-based indices into hint_images")
        rows.append(row)
    (output / "data").mkdir(parents=True)
    dataset = Dataset.from_list(rows, features=FEATURES)
    starts = range(0, len(dataset), SHARD_ROWS)
    for index, start in enumerate(starts):
        dataset.select(range(start, min(start + SHARD_ROWS, len(dataset)))).to_parquet(
            output / "data" / f"test-{index:05d}-of-{len(starts):05d}.parquet")
    shutil.copyfile(Path(__file__).resolve().parents[1] / "docs/dataset_card.md", output / "README.md")
    # Reload from the written files, with a private cache, and decode every image.
    loaded = load_dataset("parquet", data_files={"test": str(output / "data/*.parquet")}, split="test",
                          cache_dir=str(output.parent / f".{output.name}-cache"))
    images = sum(image.width > 0 for row in loaded for image in row["initial_images"] + row["hint_images"])
    print(f"{len(loaded)} Cases, {sum(loaded['steps'])} requested states, {images} images -> {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", help="Folder containing cases.json and its images")
    parser.add_argument("output", help="New folder for the dataset repository contents")
    args = parser.parse_args()
    build(args.source, args.output)
