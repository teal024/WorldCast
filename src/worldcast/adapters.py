"""Generation-format wrappers. These do not generate or transform images."""


def _count(steps):
    if type(steps) is not int or steps < 1:
        raise ValueError("steps must be a positive integer")
    return steps


def grid_prompt(task, steps, target_grid=None):
    """target_grid is the Case's rows-by-columns layout, e.g. "2x2"; it defaults by step count."""
    steps = _count(steps)
    base = task.strip()
    layout = (target_grid or {2: "1x2", 4: "2x2", 6: "2x3"}.get(steps, "")).replace("x", "×")
    additions = [f"Output {steps} steps, and arrange the {steps} steps in a {layout} grid.".replace("a  grid", "a grid")]
    additions.append("Please collage all the steps into one image. Do not render any step labels, "
                     "captions, instructions, explanatory text, arrows, or guide graphics inside "
                     "the image unless visible text is explicitly required by the user's task.")
    for value in additions:
        if value.lower() not in base.lower():
            base = (base + "\n" + value).strip()
    return base


def interleaved_prompt(task, steps):
    steps = _count(steps)
    base = task.strip()
    if "each step contains one textual instruction and one image" in base.lower():
        return base
    return (base + "\nEach step contains one textual instruction and one image. "
            "Don't output all steps in one image, instead output "
            f"{steps} images interleaved with text description. Do not render "
            "the textual instructions, step labels, captions, explanatory text, "
            "arrows, or guide graphics inside the images unless visible text is "
            "explicitly required by the user's task.").strip()


def video_prompt(task):
    return task.strip() + (
        "\n\nCreate a single coherent video that visually carries out the requested process "
        "from beginning to end. Show every requested stage in the specified chronological "
        "order, with each stage clearly visible and connected through natural motion. "
        "Preserve the task-relevant subjects, objects, scene layout, and visual identity "
        "throughout the video. Do not use a collage, split screen, captions, step labels, "
        "arrows, or other instructional overlays."
    )
