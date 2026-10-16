# Evaluation guide

This guide covers the scoring rules, the file formats, and the commands of the
`worldcast` CLI. For an overview of the benchmark, see the [README](../README.md).

## Judge

The Judge is `gpt-5.5` at `medium` reasoning effort, called once per metric
through the OpenAI Responses API. The client reads `OPENAI_API_KEY`, and
`OPENAI_BASE_URL` if you use another endpoint. Each request contains the case's text instruction, the HINTS
for that metric, the input images, any hint images for that metric, and the
generated images, in that order. Images are sent as JPEG (quality 92). The reply
is plain JSON text and is validated locally against the metric's schema.

The rubrics are in `src/worldcast/resources/rubrics.json` (version
`rubrics-20260921-494aa595c6f9`) and rendered in [rubrics.html](rubrics.html).
Print them with `worldcast rubrics --metric CP`.

## Metrics

| Metric | Range | Generated images shown | HINTS used |
| --- | --- | --- | --- |
| Progress Alignment (PA) | 0–2 | Full sequence | TC |
| Outcome Completion (OC) | 0 or 1 | Final image only | TC |
| Causal Plausibility (CP) | 0–3 | Full sequence | CP |
| Visual Consistency (VC) | 0–3 | Full sequence | VC |
| Step Accuracy (SA), optional | 0 or 1 per step | One step and its text plan | TC |

With `w = result_weight / 100`, and `w = 0` for process-focused cases, which skip OC:

```text
TC      = 1.5 × ((1 − w) × PA + 2 × w × OC)
Overall = (TC + CP + 0.5 × VC) / 7.5 × 100
```

A failed or missing judgment is never counted as zero. A case has an overall
score only when TC, CP and VC are all available. `worldcast summarize` averages
the overall score over the scored cases, per category, per level and over the
whole benchmark, and reports how many cases were scored.

## Running the benchmark

```bash
worldcast download data/
worldcast run data/ outputs/<model> --results results/<model> --workers 4
worldcast summarize results/<model>
```

`outputs/<model>/<case_id>/` holds the generated images for one case. They are
ordered by filename, with numbers compared numerically, so `2.png` comes before
`10.png`. A case without output images is recorded as unscored.

Options for `run`: `--cases` to select case ids, `--metrics` to select metrics,
`--workers` for parallel cases, `--timeout` per Judge call (default 900 seconds),
`--cache-dir` for checkpoints (default `checkpoints/`), and `--rubrics` to use
another rubric file.

Successful judgments are cached by rubric and by input content, including image
bytes. Running the same command again reuses them and retries only what failed.
Do not run two jobs on the same cache directory at the same time.

### Step Accuracy

SA judges each step of an interleaved model on its own, using the text plan the
model wrote for that step. It runs only when requested:

```bash
worldcast run data/ outputs/<model> --results results/<model>-sa --metrics SA
```

Put the plans in `outputs/<model>/<case_id>/plans.json` as a list of strings, one
per image. A case is skipped if the plans are missing or the number of images
differs from `steps`. SA does not enter TC or the overall score.

## Evaluating a single case

`worldcast evaluate case.json` scores one case described by a JSON file. Image
paths are relative to that file. `python examples/make_example.py outputs/demo`
writes a complete example.

| Field | Description |
| --- | --- |
| `prompt` | Text instruction. |
| `steps` | Number of requested states. |
| `task_type` | `process-focused` or `hybrid`. |
| `result_weight` | Outcome weight in percent, 0–100. Not needed for process-focused cases. |
| `initial_images` | Ordered input images. |
| `output_images` | Ordered generated images. |
| `hints_by_metric` | `TC`, `CP` and `VC` objects, each with `hints` (list of strings) and optional `image_indices` (one-based indices into `hint_images`). |
| `hint_images` | Judge-only reference images. Optional. |
| `plans` | Text plan for each generated image. Only for SA. |
| `case_id`, `generation_id`, `model` | Optional identifiers copied to the result. |

Add `--dry-run` to print the Judge requests without calling the model.

## Generation prompts

[`worldcast.adapters`](../src/worldcast/adapters.py) contains the prompt wrappers
for grid, interleaved and video generation. [prompts.html](prompts.html) shows the
templates, including the iterative setting. In the grid template, `{{LAYOUT}}` is
the case's `target_grid`, written as 1×2, 2×2 or 2×3. The toolkit does not call generation
models. It evaluates images you have already generated.

### Grid outputs

A grid output is one image that contains all steps. It is cut into equal cells in
reading order, and the cells are scored as the ordered sequence of states. The
layout is the case's `target_grid` field, given as rows by columns: `1x2` for 2
steps, `2x2` for 4 steps and `2x3` for 6 steps.

```bash
worldcast split-grids data/ grids/<model> outputs/<model>
```

`grids/<model>/<case_id>.png` is the generated grid for one case (`.jpg` and
`.webp` also work). The cells are written as `step_1.jpg` to `step_N.jpg` in
`outputs/<model>/<case_id>/`. No model is called. If a model arranges its steps
differently, pass the layout as rows by columns, for example `--layout 2x1
--cases 519`.

### Agentic Video Adapter

Video outputs are scored on key frames. In the paper, an Agentic Video Adapter
converts each generated video into an ordered set of task-aligned key frames. It
is GPT-6 Astra at `medium` reasoning effort, run as an agent through Codex so that
it can inspect the video and extract frames. It follows an inclusion-first
principle: select frames that cover as many critical states as possible while
preserving their temporal order. The adapter only determines whether the video
contains the required key states. It does not assess the plausibility of the full
video or its visual quality.

```bash
worldcast extract-frames data/ videos/<model> outputs/<model> --workers 4
```

`videos/<model>/<case_id>.mp4` is the generated video for one case. The adapter
receives the text instruction, the input images and the video. It does not
receive the HINTS. It needs `ffmpeg` on the path and an authenticated Codex CLI.
For each case it writes `step_1.jpg` to `step_N.jpg` and a `selection.json` with
the chosen timestamps to `outputs/<model>/<case_id>/`. A selection is rejected
unless it has exactly N frames with strictly increasing timestamps. Cases that
already have a `selection.json` are skipped. The prompt template is in
[prompts.html](prompts.html#AVA).

## Maintaining the dataset

```bash
python scripts/build_hf_dataset.py <source> <output>     # Parquet files and dataset card
python scripts/upload_hf_dataset.py <output>             # needs `hf auth login`
python scripts/render_rubrics.py                         # regenerate docs/rubrics.html
```

## Development

```bash
python -m unittest discover -s tests -v
```

The tests replace the Judge with a stub and make no model calls.
