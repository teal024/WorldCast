"""Agentic Video Adapter: an agent selects one key frame per requested state from a generated video."""

from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

from .judge import _atomic_json

MODEL = "gpt-6-astra"
EFFORT = "medium"

# Prompt template from the paper appendix. Do not reword.
TEMPLATE = """You are selecting semantic benchmark frames from a generated video.

Inspect the source MP4 itself. You may repeatedly use ffmpeg to sample any
timestamps and compare frames. Use the text instruction, reference
images, complete video, and neighboring video states to identify the
{{STEP_COUNT}} frames that most clearly demonstrate the requested key steps or
milestones. The selected timestamps must be strictly increasing. Do not select
evenly spaced timestamps merely for convenience. If a requested state never
appears, select the closest visible state in its correct chronological region
and mark it as achieved=false. This is frame selection, not quality scoring.

You MUST always select and extract exactly {{STEP_COUNT}} frames, even when the
video is poor, incomplete, ambiguous, or does not visibly achieve one or more
requested states. In that extreme case, you may choose the temporal point based
on when the milestone is expected to occur as specified in the prompt. Never
omit a step, refuse selection, stop early, or leave an output file unwritten
because no ideal frame exists. For every missing state, choose the semantically
closest visible frame from the most appropriate chronological region; use
neighboring frames and the requested order to make the best approximation. Set
achieved=false and briefly explain the mismatch in evidence, but still extract
that frame and include it in the JSON result.

Use this ffmpeg executable:
{{FFMPEG_EXECUTABLE}}

Extract the final full-resolution frames to exactly these paths:
{{OUTPUT_FRAME_PATHS}}

Return the matching JSON only after every file has been written. Each filename
must be the basename only and exactly step_1.jpg through
step_{{STEP_COUNT}}.jpg; do not return a temporary sampling path such as
frames/t2.4.jpg. Before returning, verify that all {{STEP_COUNT}} required JPEG
files exist, are non-empty, and correspond one-to-one with the JSON entries.

Evaluation input:
{{EVALUATION_INPUT_JSON}}

## Output Contract

{
  "steps": [
    {
      "step": 1,
      "timestamp_seconds": 0.0,
      "filename": "step_1.jpg",
      "achieved": true,
      "evidence": "Visible evidence for the requested milestone, or a brief mismatch explanation."
    }
  ],
  "overall_notes": "Brief notes about the selection."
}
"""


def selection_schema(steps):
    step = {"type": "object", "additionalProperties": False,
            "required": ["step", "timestamp_seconds", "filename", "achieved", "evidence"],
            "properties": {"step": {"type": "integer", "minimum": 1, "maximum": steps},
                           "timestamp_seconds": {"type": "number", "minimum": 0},
                           "filename": {"type": "string"}, "achieved": {"type": "boolean"},
                           "evidence": {"type": "string"}}}
    return {"type": "object", "additionalProperties": False, "required": ["steps", "overall_notes"],
            "properties": {"steps": {"type": "array", "minItems": steps, "maxItems": steps, "items": step},
                           "overall_notes": {"type": "string"}}}


def build_prompt(case, references, video, frame_dir, ffmpeg):
    steps = case["steps"]
    payload = {"text_instruction": case["prompt"], "required_output_steps": steps,
               "reference_images": [str(path) for path in references], "source_video": str(video)}
    values = {"STEP_COUNT": str(steps), "FFMPEG_EXECUTABLE": str(ffmpeg),
              "OUTPUT_FRAME_PATHS": "\n".join(str(frame_dir / f"step_{i}.jpg") for i in range(1, steps + 1)),
              "EVALUATION_INPUT_JSON": json.dumps(payload, ensure_ascii=False, indent=2)}
    prompt = TEMPLATE
    for name, value in values.items():
        prompt = prompt.replace("{{" + name + "}}", value)
    return prompt


def validate_selection(result, steps, frame_dir):
    items = result.get("steps") if isinstance(result, dict) else None
    if not isinstance(items, list) or len(items) != steps:
        raise ValueError(f"Expected {steps} selected frames")
    previous = -1.0
    for index, item in enumerate(items, 1):
        if item.get("step") != index or item.get("filename") != f"step_{index}.jpg":
            raise ValueError(f"Invalid selection for step {index}")
        if not float(item["timestamp_seconds"]) > previous:
            raise ValueError("Selected timestamps are not strictly increasing")
        previous = float(item["timestamp_seconds"])
        frame = frame_dir / item["filename"]
        if not frame.is_file() or not frame.stat().st_size:
            raise ValueError(f"Frame was not extracted: {frame.name}")
    return result


def select_frames(case_dir, video, output_dir, codex_bin="codex", ffmpeg=None, timeout=1800):
    """Run the adapter on one video and write step_1.jpg ... step_N.jpg plus selection.json to output_dir."""
    case_dir, video, output_dir = Path(case_dir).resolve(), Path(video).resolve(), Path(output_dir).resolve()
    case = json.loads((case_dir / "case.json").read_text(encoding="utf-8"))
    references = [case_dir / name for name in case["initial_images"]]
    ffmpeg = ffmpeg or shutil.which("ffmpeg")
    if not ffmpeg:
        raise ValueError("ffmpeg was not found; install it or pass --ffmpeg")
    # The agent works in a scratch folder, so its sampled frames never reach the outputs.
    with tempfile.TemporaryDirectory(prefix="worldcast-video-") as tmp:
        work = Path(tmp).resolve()
        frames = work / "selected"
        frames.mkdir()
        (work / "schema.json").write_text(json.dumps(selection_schema(case["steps"])), encoding="utf-8")
        command = [codex_bin, "exec", "--ephemeral", "--skip-git-repo-check", "--color", "never",
                   "--model", MODEL, "--config", f'model_reasoning_effort="{EFFORT}"',
                   "--sandbox", "workspace-write", "-C", str(work),
                   "--output-schema", str(work / "schema.json"), "-o", str(work / "result.json")]
        for path in references:
            command.extend(["-i", str(path)])
        command.append("-")
        completed = subprocess.run(command, input=build_prompt(case, references, video, frames, ffmpeg),
                                   text=True, capture_output=True, timeout=timeout, check=False)
        if completed.returncode:
            raise RuntimeError(f"Video adapter exited with status {completed.returncode}")
        result = validate_selection(json.loads((work / "result.json").read_text(encoding="utf-8")),
                                    case["steps"], frames)
        output_dir.mkdir(parents=True, exist_ok=True)
        for item in result["steps"]:
            shutil.copyfile(frames / item["filename"], output_dir / item["filename"])
    _atomic_json(output_dir / "selection.json", {"adapter_model": MODEL, "reasoning_effort": EFFORT, **result})
    return result


def adapt(data_dir, videos_dir, outputs_dir, case_ids=None, workers=1, **options):
    """Convert <videos_dir>/<case_id>.mp4 into <outputs_dir>/<case_id>/ frames. Returns failures by case id."""
    data_dir, videos_dir, outputs_dir = Path(data_dir), Path(videos_dir), Path(outputs_dir)
    ids = case_ids or sorted((path.stem for path in videos_dir.glob("*.mp4")), key=int)
    if not ids:
        raise ValueError(f"No <case_id>.mp4 files in {videos_dir}")

    def one(case_id):
        if (outputs_dir / str(case_id) / "selection.json").is_file():
            return None
        try:
            select_frames(data_dir / str(case_id), videos_dir / f"{case_id}.mp4", outputs_dir / str(case_id), **options)
        except (ValueError, OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
            return case_id, f"{type(exc).__name__}: {exc}"

    with ThreadPoolExecutor(max_workers=workers) as pool:
        return dict(filter(None, pool.map(one, ids)))
