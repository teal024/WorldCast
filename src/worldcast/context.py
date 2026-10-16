"""Local-file inputs only. No endpoint, credential, or database discovery."""

import hashlib
import json
from pathlib import Path

from PIL import Image


def load_context(path):
    path = Path(path).resolve()
    return resolve_context(json.loads(path.read_text(encoding="utf-8")), path.parent)


def resolve_context(context, base):
    """Validate a Case and resolve its image paths against base."""
    base = Path(base).resolve()
    if not isinstance(context, dict) or not isinstance(context.get("prompt"), str) or not context["prompt"].strip():
        raise ValueError("A non-empty prompt is required")
    if type(context.get("steps")) is not int or context["steps"] <= 0:
        raise ValueError("steps must be a positive integer")
    if not isinstance(context.get("task_type"), str) or not context["task_type"].strip():
        raise ValueError("task_type is required (process-focused or another task type)")
    for field in ("initial_images", "hint_images", "output_images"):
        values = context.get(field, [])
        if not isinstance(values, list):
            raise ValueError(f"{field} must be an ordered array of local paths")
        resolved = []
        for value in values:
            if not isinstance(value, str) or "://" in value:
                raise ValueError("Images must be local paths; remote URLs are not fetched")
            image_path = (base / value).resolve()
            if not image_path.is_file():
                raise ValueError(f"Missing image: {image_path}")
            with Image.open(image_path) as image:
                image.verify()
            resolved.append(str(image_path))
        context[field] = resolved
    if not context["output_images"]:
        raise ValueError("At least one output image is required")
    return context


def fingerprint(context):
    """Content-address inputs, including actual image bytes, not filenames."""
    data = dict(context)
    for field in ("initial_images", "hint_images", "output_images"):
        data[field] = [hashlib.sha256(Path(path).read_bytes()).hexdigest() for path in context.get(field, [])]
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def metric_inputs(metric, context, step_index=None):
    outputs = list(context.get("output_images") or [])
    if not outputs:
        raise ValueError("No generated images")
    group = "TC" if metric in ("PA", "OC", "SA") else metric
    organized = (context.get("hints_by_metric") or {}).get(group)
    if not isinstance(organized, dict) or not isinstance(organized.get("hints"), list):
        raise ValueError(f"Missing canonical {group} HINTS; no automatic LLM reorganization")
    if not all(isinstance(hint, str) for hint in organized["hints"]):
        raise ValueError("HINTS entries must be strings")
    available = context.get("hint_images") or []
    indices = organized.get("image_indices", [])
    if not isinstance(indices, list) or any(type(i) is not int or not 1 <= i <= len(available) for i in indices):
        raise ValueError("HINTS image_indices must be valid one-based indices")
    indices = list(dict.fromkeys(indices))
    initial = list(context.get("initial_images") or [])
    if metric == "OC":
        outputs = outputs[-1:]
        scope = "Only the final generated image. No intermediate generated images are supplied."
    elif metric == "SA":
        outputs = [outputs[step_index-1]]
        scope = "Only the designated step image; judge this step, not other steps."
    else:
        scope = "All generated images in original order."
    data = {
        "text_instruction": context["prompt"], "HINTS": organized["hints"],
        "declared_number_of_steps": str(context["steps"]),
        "reference_and_initial_image_count": len(initial),
        "case_hint_image_indices": indices, "generated_image_count": len(outputs),
        "attachment_order": "Reference/initial images, then selected HINTS images, then generated image(s).",
        "generated_images_scope": scope,
    }
    if metric == "SA":
        data.update(designated_step_index=step_index, paired_model_text_plan=context["plans"][step_index-1])
    return data, (("reference", initial), ("case_hint", [available[i-1] for i in indices]), ("generated", outputs))
