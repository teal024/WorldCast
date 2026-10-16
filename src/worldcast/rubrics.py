"""Pinned rubric documents and aggregation, with no database dependency."""

from importlib.resources import files
import json
import math
from pathlib import Path

METRICS = ("PA", "OC", "CP", "VC", "SA")
MAX_SCORE = {"PA": 2, "OC": 1, "CP": 3, "VC": 3, "SA": 1}


def load_rubrics(path=None):
    source = Path(path) if path else files("worldcast").joinpath("resources/rubrics.json")
    config = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(config.get("version"), str) or not config["version"]:
        raise ValueError("A rubric version is required")
    if set(config.get("metrics", {})) != set(METRICS):
        raise ValueError("Rubrics must contain PA, OC, CP, VC, and SA")
    for metric in METRICS:
        for field in ("normative_rubric", "output_contract"):
            if not isinstance(config["metrics"][metric].get(field), str) or not config["metrics"][metric][field].strip():
                raise ValueError(f"Missing {metric}.{field}")
    return config


def bench_metrics(context):
    return ("PA", "CP", "VC") if context.get("task_type") == "process-focused" else ("PA", "OC", "CP", "VC")


def result_weight(context):
    if context.get("task_type") == "process-focused":
        return 0.0
    raw = context.get("result_weight")
    if isinstance(raw, bool) or raw is None:
        raise ValueError("Non-process-focused Cases require result_weight in [0, 100]")
    weight = float(raw)
    if not math.isfinite(weight) or not 0 <= weight <= 100:
        raise ValueError("result_weight must be finite and in [0, 100]")
    return weight / 100


def combined_tc(context, scores):
    """TC on [0, 3]; a missing positive-weight component is not zero."""
    weight = result_weight(context)
    required = (("PA", 1-weight, 1), ("OC", weight, 2))
    total = 0.0
    for metric, factor, scale in required:
        if factor == 0:
            continue
        score = scores.get(metric)
        if score is None:
            return None
        if type(score) not in (int, float) or not math.isfinite(score) or not 0 <= score <= MAX_SCORE[metric]:
            raise ValueError(f"Invalid {metric} score")
        total += factor * scale * score
    return 1.5 * total


def schema(metric, step_index=None):
    if metric not in METRICS:
        raise ValueError(f"Unknown or retired metric: {metric}")
    props = {"score": {"type": "integer", "enum": list(range(MAX_SCORE[metric]+1))},
             "evidence": {"type": "string"}}
    if metric == "SA":
        if type(step_index) is not int or step_index < 1:
            raise ValueError("SA requires a positive step_index")
        props["step_index"] = {"type": "integer", "enum": [step_index]}
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


def validate_result(metric, result, step_index=None):
    shape = schema(metric, step_index)
    if not isinstance(result, dict) or set(result) != set(shape["properties"]):
        raise ValueError("Judge response fields do not match the output schema")
    if type(result["score"]) is not int or result["score"] not in shape["properties"]["score"]["enum"]:
        raise ValueError("Invalid Judge score; failures are not zero")
    if not isinstance(result["evidence"], str) or not result["evidence"].strip():
        raise ValueError("Judge evidence is required")
    if metric == "SA" and (type(result["step_index"]) is not int or result["step_index"] != step_index):
        raise ValueError("Judge returned the wrong step")
    return result
