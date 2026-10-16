"""Create a tiny synthetic two-step Case for dry-run testing, not benchmark data."""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw


def create(folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    names = ["reference.png", "step_1.png", "step_2.png", "case.json"]
    if any((folder / name).exists() for name in names):
        raise FileExistsError("Use an empty example directory; existing files are preserved")
    for name, x in zip(names[:3], (45, 125, 205)):
        image = Image.new("RGB", (256, 128), "white")
        ImageDraw.Draw(image).ellipse((x-16, 48, x+16, 80), fill="red")
        image.save(folder / name)
    case = {
        "case_id": "synthetic-demo", "generation_id": "demo-v1", "model": "sensenova",
        "prompt": "Show two successive steps moving the red disk right. Keep its size and color fixed.",
        "steps": 2, "task_type": "hybrid", "result_weight": 50,
        "initial_images": ["reference.png"], "hint_images": [],
        "output_images": ["step_1.png", "step_2.png"],
        "plans": ["Move the disk to the center.", "Move the disk to the right."],
        "hints_by_metric": {
            "TC": {"hints": ["The disk moves right in both steps and finishes on the right."], "image_indices": []},
            "CP": {"hints": ["The disk moves without unexplained changes to its physical form."], "image_indices": []},
            "VC": {"hints": ["Keep one red disk of constant size on the same white background."], "image_indices": []},
        },
    }
    (folder / "case.json").write_text(json.dumps(case, indent=2)+"\n", encoding="utf-8")
    return folder / "case.json"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_dir", type=Path)
    print(create(parser.parse_args().output_dir))
