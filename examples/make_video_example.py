"""Create a tiny synthetic video Case for trying the video adapter, not benchmark data.

Writes <output_dir>/data/1/ (the Case) and <output_dir>/videos/1.mp4. Requires ffmpeg.
"""

import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw


def disk(x):
    image = Image.new("RGB", (256, 128), "white")
    ImageDraw.Draw(image).ellipse((x-16, 48, x+16, 80), fill="red")
    return image


def create(folder):
    folder = Path(folder)
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg was not found")
    case_dir, videos = folder / "data" / "1", folder / "videos"
    case_dir.mkdir(parents=True)
    videos.mkdir()
    disk(45).save(case_dir / "reference.png")
    with tempfile.TemporaryDirectory() as tmp:
        # Three seconds at 10 fps: the disk rests on the left, then slides to the right and rests.
        for index in range(30):
            disk(45 + round(160 * min(max((index - 5) / 20, 0), 1))).save(Path(tmp) / f"{index:03d}.png")
        subprocess.run([ffmpeg, "-v", "error", "-framerate", "10", "-i", str(Path(tmp) / "%03d.png"),
                        "-pix_fmt", "yuv420p", str(videos / "1.mp4")], check=True)
    case = {
        "case_id": 1, "level": "L3", "category": "Physical Simulation",
        "prompt": "Starting from Image 1, show two successive steps moving the red disk right. "
                  "Keep its size and color fixed.",
        "steps": 2, "task_type": "hybrid", "result_weight": 50,
        "initial_images": ["reference.png"], "hint_images": [],
        "hints_by_metric": {
            "TC": {"hints": ["The disk moves right in both steps and finishes on the right."], "image_indices": []},
            "CP": {"hints": ["The disk moves without unexplained changes to its physical form."], "image_indices": []},
            "VC": {"hints": ["Keep one red disk of constant size on the same white background."], "image_indices": []},
        },
    }
    (case_dir / "case.json").write_text(json.dumps(case, indent=2)+"\n", encoding="utf-8")
    return folder


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("output_dir", type=Path)
    print(create(parser.parse_args().output_dir))
