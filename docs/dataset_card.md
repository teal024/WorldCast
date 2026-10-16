---
license: cc-by-4.0
language:
  - en
pretty_name: WorldCast
size_categories:
  - n<1K
task_categories:
  - image-to-image
  - text-to-image
tags:
  - arxiv:2610.20731
  - benchmark
  - world-state-prediction
  - multimodal
  - visual-generation
  - evaluation
configs:
  - config_name: default
    data_files:
      - split: test
        path: data/*.parquet
---

# WorldCast: Exploring Intelligent Visual Generation in World State Prediction

<div align="center">

[![arXiv](https://img.shields.io/badge/arXiv-2610.20731-b31b1b?logo=arxiv&logoColor=white)](https://arxiv.org/abs/2610.20731)
[![Project Page](https://img.shields.io/badge/Project-Page-1f6feb?logo=googlechrome&logoColor=white)](https://teal024.github.io/WorldCast/)
[![Hugging Face Dataset](https://img.shields.io/badge/🤗_Hugging_Face-Dataset-yellow)](https://huggingface.co/datasets/wenhaoyan77/WorldCast)
[![Evaluation Guide](https://img.shields.io/badge/Docs-Evaluation_Guide-2ea44f)](https://github.com/teal024/WorldCast/blob/main/docs/evaluation.md)

</div>

<p align="center">
  <img src="https://raw.githubusercontent.com/teal024/WorldCast/main/docs/images/overview-teaser.png" width="100%" alt="(a) The four-level capability tree of visual generation. (b) The WorldCast benchmark and overall results.">
</p>

WorldCast is a benchmark for **world state prediction** in visual generation: given
observations and diverse references, a model must generate the sequence of future
states that a process goes through, not just a plausible final image. Such a task
is demanding for unified systems, multi-reference image models, and video models
alike, because it requires understanding and generation to work together: the
model has to work out what each reference means, when it takes effect, and how the
world changes as a result. We offer both a benchmark of 320 manually designed
cases and a common evaluation protocol that scores grid, interleaved, and video
outputs as one ordered sequence of states, together with a diagnosis of 12
representative models.

## 🔥 News

- **`2026.10.12`** Released the WorldCast dataset, evaluation toolkit, and Judge rubrics.

## 👀 Introduction

**Higher-level generative capabilities are underexplored.** We organize visual
generation into a four-level capability tree. L1 is static text-to-image
generation. L2 adds pixel-level control and temporal transition, such as editing,
subject reference, and text- or image-to-video. L3 requires modelling complex
constraints and simulating complex causality, with multiple references, world
knowledge, and physical plausibility. L4 requires transforming real-world context
into action: implicit visual intents, spatial cues, visual goals, demonstrated
procedures, and logical patterns. Frontier models have moved quickly through L1
and L2, yet L3 and L4, where understanding and generation must be tightly
integrated, are rarely measured.

**Real-world processes are dynamic, and references do more than fix appearance.**
Prior work mostly asks whether a model can simulate the world from a static
appearance anchor such as a first frame or a subject image. In real tasks,
references intervene at different points of a process. A reference may be a state
to observe, a goal to reach, a rule to obey, a material property, or a
demonstration of how something is done. We call this **world state prediction**:
using heterogeneous context to guide an evolving real-world process. The model
must reason about each reference before it can draw the next state.

**One protocol for image and video models.** Whether a model produces a grid,
interleaved text and images, or a continuous video, its success must show up in
the resulting visual states. WorldCast therefore evaluates every output as an
ordered sequence of key frames, and each case carries human-annotated HINTS that
tell the GPT-5.5 Judge what a correct sequence must show.

**What we find from this benchmark:**

- **Frontier unified systems show early-stage world state prediction.**
  GPT-Image-2.5 scores 72.8 and handles some L3 and even L4 tasks, with emerging
  generalization across categories.
- **The gaps between models are large and widen at higher levels.** Nano Banana
  Pro reaches 42.8 and the best open-source model 20.1. Complex context, entangled
  references, and reasoning-heavy tasks are the common failure points.
- **Interleaved generation helps image models.** Generating one state at a time
  with a text plan lets frontier image models capture critical temporal
  transitions without a video architecture.
- **Strong generators draw on their language models.** Performance gaps track
  language-side planning and reasoning. Adding agentic abilities such as
  inspection-and-revision loops and coding tools brings further gains and exposes
  new challenges.

## 📊 Benchmark

WorldCast has **320 manually designed cases** requesting **1,352 visual states**
across **eight task categories**. Every case comes with human-annotated HINTS that
tell the Judge what a correct sequence must show.

<p align="center">
  <img src="https://raw.githubusercontent.com/teal024/WorldCast/main/docs/images/task-categories.png" width="100%" alt="Representative tasks from the eight WorldCast categories">
</p>

## 🏆 Leaderboard
| Model | Type | Format | L3 | L4 | Overall |
| --- | --- | --- | ---: | ---: | ---: |
| **GPT-Image-2.5** | Proprietary image | Interleaved | **73.8** | **71.6** | **72.8** |
| GPT-Image-2 | Proprietary image | Interleaved | 68.3 | 63.7 | 66.2 |
| Seedance 2.0 | Video | Video | 51.9 | 41.6 | 47.2 |
| Nano Banana Pro | Proprietary image | Interleaved | 45.6 | 39.5 | 42.8 |
| Gemini Omni | Video | Video | 45.8 | 36.8 | 41.6 |
| Wan 3.0 | Video | Video | 46.0 | 32.8 | 39.9 |
| Seedream 5.0 Pro | Proprietary image | Grid | 36.8 | 29.9 | 33.6 |
| SenseNova-U1 | Open-source image | Interleaved | 24.4 | 15.0 | 20.1 |
| Seedream 4.5 | Proprietary image | Grid | 17.6 | 14.1 | 16.0 |
| Emu3.5 | Open-source image | Interleaved | 16.5 | 7.4 | 12.3 |
| BAGEL | Open-source image | Plan & iterate | 6.7 | 6.8 | 6.8 |
| Qwen-Image | Open-source image | Grid | 6.9 | 4.0 | 5.6 |

Scores are on a 0–100 scale.
GPT-Image-2.5 is paired with GPT-6 Astra, and GPT-Image-2 with GPT-5.5.

## Usage

```python
from datasets import load_dataset

dataset = load_dataset("wenhaoyan77/WorldCast", split="test")
case = dataset[0]
print(case["case_id"], case["category"], case["steps"])
print(case["prompt"])
case["initial_images"][0]            # PIL image; order matters ("Image 1", "Image 2", ...)
case["hints_by_metric"]["TC"]["hints"]
```

To export every case as files and run the full evaluation:

```bash
pip install git+https://github.com/teal024/WorldCast.git
worldcast download data/
```

## Fields

| Field | Type | Description |
| --- | --- | --- |
| `case_id` | int | Stable case identifier. Identifiers are not contiguous. |
| `level` | string | `L3` or `L4`. |
| `category` | string | One of the eight task categories below. |
| `prompt` | string | Text instruction given to the generation model. |
| `steps` | int | Number of visual states the model must produce (2, 4 or 6). |
| `target_grid` | string | Rows × columns of the single-image grid requested from grid models: `1x2`, `2x2` or `2x3`. It fills the layout in the grid prompt, "Output N steps, and arrange the N steps in a 2×2 grid.", and cells are read left to right, top to bottom. |
| `task_type` | string | `process-focused` (only the process is scored) or `hybrid` (process and final outcome). |
| `result_weight` | float | Weight of the final outcome in Task Completion, in percent. Null for process-focused cases. |
| `initial_images` | list of images | Input and reference images given to the generation model, in prompt order. |
| `hint_images` | list of images | Reference images for the Judge only. Empty for most cases. |
| `hints_by_metric` | struct | Human-annotated HINTS for the Judge, grouped by `TC`, `CP` and `VC`. |

Each group in `hints_by_metric` has `hints`, a list of strings, and `image_indices`,
one-based indices into `hint_images`. A group may be empty.

**HINTS and `hint_images` are for evaluation only and must not be given to the
generation model.** The model receives `prompt` and `initial_images`.

## Task categories

| Level | Category | Cases |
| :---: | --- | ---: |
| L3 | Observation-Conditioned Transitions | 57 |
| L3 | Adaptive Task Completion | 55 |
| L3 | Physical Simulation | 61 |
| L4 | Visual Cues | 28 |
| L4 | Physical Properties | 28 |
| L4 | Visual Goal Realization | 28 |
| L4 | In-Context Procedural Learning | 28 |
| L4 | Logic and Rules | 35 |
| | **Total** | **320** |

200 cases are process-focused and 120 are hybrid.

## Evaluation

A Judge model scores each generated sequence on Task Completion (TC), Causal
Plausibility (CP) and Visual Consistency (VC), guided by the HINTS:

```text
Overall = (TC + CP + 0.5 × VC) / 7.5 × 100
```

See the [evaluation guide](https://github.com/teal024/WorldCast/blob/main/docs/evaluation.md) for details.

## License

The dataset is released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).


## Citation

```bibtex
@misc{yan2026worldcast,
  title={WorldCast: Exploring Intelligent Visual Generation in World State Prediction},
  author={Yan, Wenhao and Li, Haodong and Li, Xiaotong and Luo, Yaxin and Yue, Zhengrong and Zou, Jialv and Huang, Xu and Yang, Haojin and Jia, Nan and Feng, Yan and Pei, Peng and Cai, Xunliang},
  year={2026},
  eprint={2610.20731},
  archivePrefix={arXiv},
  url={https://arxiv.org/abs/2610.20731}
}
```
