"""Benchmark-level workflow: export the dataset to files, evaluate one model's outputs, aggregate."""

from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re

from .context import resolve_context
from .judge import _atomic_json

DATASET = "wenhaoyan77/WorldCast"
CATEGORIES = (
    ("L3", "Observation-Conditioned Transitions"), ("L3", "Adaptive Task Completion"),
    ("L3", "Physical Simulation"), ("L4", "Visual Cues"), ("L4", "Physical Properties"),
    ("L4", "Visual Goal Realization"), ("L4", "In-Context Procedural Learning"),
    ("L4", "Logic and Rules"),
)
IMAGE_FIELDS = ("initial_images", "hint_images")
IMAGE_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp")


def download(folder, repo=DATASET):
    """Write every Case to <folder>/<case_id>/: case.json plus its original image files."""
    from datasets import Image, List, load_dataset
    dataset = load_dataset(repo, split="test")
    for field in IMAGE_FIELDS:
        dataset = dataset.cast_column(field, List(Image(decode=False)))
    for row in dataset:
        target = Path(folder) / str(row["case_id"])
        target.mkdir(parents=True, exist_ok=True)
        for field in IMAGE_FIELDS:
            names = [Path(image["path"]).name for image in row[field]]
            for name, image in zip(names, row[field]):
                (target / name).write_bytes(image["bytes"])
            row[field] = names
        _atomic_json(target / "case.json", row)
    return len(dataset)


def _natural(path):
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", path.name)]


def case_context(data_dir, outputs_dir, case_id):
    """Join one exported Case with a model's output images, ordered by filename."""
    folder = Path(data_dir) / str(case_id)
    context = json.loads((folder / "case.json").read_text(encoding="utf-8"))
    generated = Path(outputs_dir).resolve() / str(case_id)
    images = sorted((p for p in generated.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES),
                    key=_natural) if generated.is_dir() else []
    context["output_images"] = [str(path) for path in images]
    plans = generated / "plans.json"
    if plans.is_file():
        context["plans"] = json.loads(plans.read_text(encoding="utf-8"))
    return resolve_context(context, folder)


def run(data_dir, outputs_dir, results_dir, evaluator, case_ids=None, metrics=None, workers=1):
    """Evaluate each Case and write <results_dir>/<case_id>.json. Unscored Cases are never zero."""
    data_dir, results_dir = Path(data_dir), Path(results_dir)
    ids = case_ids or sorted((p.parent.name for p in data_dir.glob("*/case.json")), key=int)
    if not ids:
        raise ValueError(f"No exported Cases in {data_dir}; run `worldcast download` first")

    def one(case_id):
        case = json.loads((data_dir / str(case_id) / "case.json").read_text(encoding="utf-8"))
        try:
            record = evaluator.evaluate(case_context(data_dir, outputs_dir, case_id), metrics)
        except (ValueError, OSError) as exc:
            record = {"case_id": case["case_id"], "metrics": {}, "TC": None, "overall_100": None,
                      "error": str(exc)}
        record.update(category=case["category"], level=case["level"])
        _atomic_json(results_dir / f"{case_id}.json", record)
        return record

    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(one, ids))


def _mean(values):
    values = [value for value in values if value is not None]
    return sum(values) / len(values) if values else None


def summarize(results_dir):
    """Mean over scored Cases, per category, per level and overall, on a 0-100 scale."""
    records = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(Path(results_dir).glob("*.json"))]
    if not records:
        raise ValueError(f"No result files in {results_dir}")
    scored = [record for record in records if record.get("overall_100") is not None]

    def overall(key, value):
        return _mean(record["overall_100"] for record in scored if record[key] == value)

    def component(metric):
        if metric == "TC":
            return _mean(record["TC"] for record in scored)
        return _mean(record["metrics"][metric]["score"] for record in scored)

    return {"cases": len(records), "scored": len(scored),
            "overall": _mean(record["overall_100"] for record in scored),
            "levels": {level: overall("level", level) for level in ("L3", "L4")},
            "categories": {name: overall("category", name) for _, name in CATEGORIES},
            "components": {metric: component(metric) for metric in ("TC", "CP", "VC")}}


def format_summary(summary):
    def cell(value):
        return "   -" if value is None else f"{value:5.1f}"
    lines = [f"Scored Cases: {summary['scored']}/{summary['cases']}"]
    for level in ("L3", "L4"):
        lines += [f"{cell(summary['categories'][name])}  {level} {name}" for lv, name in CATEGORIES if lv == level]
        lines.append(f"{cell(summary['levels'][level])}  {level} Overall")
    lines.append(f"{cell(summary['overall'])}  Overall")
    lines.append("Mean raw scores (0-3): " + ", ".join(
        f"{metric} {'-' if value is None else format(value, '.2f')}" for metric, value in summary["components"].items()))
    return "\n".join(lines)
