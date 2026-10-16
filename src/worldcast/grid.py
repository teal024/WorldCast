"""Grid outputs: cut a single collage image into one image per requested state."""

import json
from pathlib import Path

from PIL import Image

# Rows and columns for each step count, used when a Case has no target_grid.
LAYOUTS = {2: (1, 2), 4: (2, 2), 6: (2, 3)}
SUFFIXES = (".png", ".jpg", ".jpeg", ".webp")


def split_grid(image, steps, output_dir, layout=None):
    """Cut one grid image into equal cells, row by row, and write step_1.jpg ... step_N.jpg to output_dir."""
    rows, cols = layout or LAYOUTS.get(steps) or (0, 0)
    if rows * cols != steps:
        raise ValueError(f"No {rows}x{cols} grid layout for {steps} steps")
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(image) as source:
        source = source.convert("RGB")
        width, height = source.size
        for index in range(steps):
            row, col = divmod(index, cols)
            cell = source.crop((col * width // cols, row * height // rows,
                                (col + 1) * width // cols, (row + 1) * height // rows))
            cell.save(output_dir / f"step_{index + 1}.jpg", "JPEG", quality=95)
    return [output_dir / f"step_{index + 1}.jpg" for index in range(steps)]


def split(data_dir, grids_dir, outputs_dir, case_ids=None, layout=None):
    """Convert <grids_dir>/<case_id>.<png|jpg|webp> into <outputs_dir>/<case_id>/ images. Returns the Case count."""
    data_dir, grids_dir, outputs_dir = Path(data_dir), Path(grids_dir), Path(outputs_dir)
    grids = {path.stem: path for path in sorted(grids_dir.iterdir()) if path.suffix.lower() in SUFFIXES}
    ids = [str(case_id) for case_id in case_ids] if case_ids else sorted(grids, key=int)
    if not ids:
        raise ValueError(f"No <case_id> grid images in {grids_dir}")
    for case_id in ids:
        if case_id not in grids:
            raise ValueError(f"Missing grid image for case {case_id}")
        case = json.loads((data_dir / case_id / "case.json").read_text(encoding="utf-8"))
        target = tuple(int(value) for value in case["target_grid"].split("x")) if case.get("target_grid") else None
        split_grid(grids[case_id], case["steps"], outputs_dir / case_id, layout or target)
    return len(ids)
