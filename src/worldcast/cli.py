"""WorldCast evaluation CLI. Nothing runs on import or on a schedule."""

import argparse
import json
from pathlib import Path
import sys

from . import benchmark, grid, video
from .context import load_context
from .judge import Evaluator, ResponsesJudge, _atomic_json
from .rubrics import METRICS, load_rubrics, result_weight


def _judge_options(command):
    command.add_argument("--metrics", nargs="+", choices=METRICS, help="SA must be explicitly requested")
    command.add_argument("--rubrics", type=Path)
    command.add_argument("--cache-dir", type=Path, default=Path("checkpoints"))
    command.add_argument("--timeout", type=int, default=900)


def parser():
    root = argparse.ArgumentParser(prog="worldcast", description=__doc__)
    sub = root.add_subparsers(dest="command", required=True)
    download = sub.add_parser("download", help="Export the Hugging Face dataset to local Case folders")
    download.add_argument("data", type=Path)
    download.add_argument("--repo", default=benchmark.DATASET)
    grids = sub.add_parser("split-grids", help="Cut single-image grid outputs into one image per step")
    grids.add_argument("data", type=Path, help="Folder written by `worldcast download`")
    grids.add_argument("grids", type=Path, help="Generated grids: <grids>/<case_id>.png")
    grids.add_argument("outputs", type=Path, help="Folder for the split images: <outputs>/<case_id>/")
    grids.add_argument("--cases", nargs="+", type=int, help="Only these case_id values")
    grids.add_argument("--layout", help="Override ROWSxCOLS, e.g. 2x1; defaults to each Case's target_grid")
    frames = sub.add_parser("extract-frames", help="Select key frames from generated videos with the agentic video adapter")
    frames.add_argument("data", type=Path, help="Folder written by `worldcast download`")
    frames.add_argument("videos", type=Path, help="Generated videos: <videos>/<case_id>.mp4")
    frames.add_argument("outputs", type=Path, help="Folder for the selected frames: <outputs>/<case_id>/")
    frames.add_argument("--cases", nargs="+", type=int, help="Only these case_id values")
    frames.add_argument("--workers", type=int, default=1)
    frames.add_argument("--codex-bin", default="codex")
    frames.add_argument("--ffmpeg", help="ffmpeg executable; defaults to the one on PATH")
    frames.add_argument("--timeout", type=int, default=1800)
    run = sub.add_parser("run", help="Evaluate one model's outputs on the benchmark")
    run.add_argument("data", type=Path, help="Folder written by `worldcast download`")
    run.add_argument("outputs", type=Path, help="Model outputs: <outputs>/<case_id>/<ordered images>")
    run.add_argument("--results", type=Path, required=True, help="Folder for per-Case result JSON")
    run.add_argument("--cases", nargs="+", type=int, help="Only these case_id values")
    run.add_argument("--workers", type=int, default=1)
    _judge_options(run)
    summarize = sub.add_parser("summarize", help="Aggregate per-Case results into benchmark scores")
    summarize.add_argument("results", type=Path)
    summarize.add_argument("--output", type=Path, help="Also write the summary as JSON")
    rules = sub.add_parser("rubrics", help="Show the pinned evaluation rubrics")
    rules.add_argument("--metric", choices=METRICS)
    rules.add_argument("--rubrics", type=Path)
    evaluate = sub.add_parser("evaluate", help="Evaluate one Case; --dry-run makes no model call")
    evaluate.add_argument("case", type=Path)
    evaluate.add_argument("--output", type=Path, help="Result JSON; defaults to stdout")
    evaluate.add_argument("--dry-run", action="store_true")
    _judge_options(evaluate)
    return root


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        if args.command == "download":
            print(f"Exported {benchmark.download(args.data, args.repo)} Cases to {args.data}")
            return 0
        if args.command == "split-grids":
            layout = tuple(int(value) for value in args.layout.lower().split("x")) if args.layout else None
            print(f"Split {grid.split(args.data, args.grids, args.outputs, args.cases, layout)} grids to {args.outputs}")
            return 0
        if args.command == "extract-frames":
            failed = video.adapt(args.data, args.videos, args.outputs, args.cases, args.workers,
                                 codex_bin=args.codex_bin, ffmpeg=args.ffmpeg, timeout=args.timeout)
            for case_id, error in failed.items():
                print(f"worldcast: case {case_id}: {error}", file=sys.stderr)
            return 1 if failed else 0
        if args.command == "summarize":
            summary = benchmark.summarize(args.results)
            if args.output:
                _atomic_json(args.output, summary)
            print(benchmark.format_summary(summary))
            return 0
        config = load_rubrics(args.rubrics)
        if args.command == "rubrics":
            value = config["metrics"][args.metric] if args.metric else config
            print(json.dumps(value, ensure_ascii=False, indent=2))
            return 0
        if args.command == "run":
            evaluator = Evaluator(config, ResponsesJudge(args.timeout), args.cache_dir)
            benchmark.run(args.data, args.outputs, args.results, evaluator, args.cases, args.metrics, args.workers)
            print(benchmark.format_summary(benchmark.summarize(args.results)))
            return 0
        context = load_context(args.case)
        result_weight(context)  # Fail before any model call for invalid weights.
        if args.output and (args.output.resolve() == args.case.resolve() or str(args.output.resolve()) in sum(
                (context[key] for key in ("initial_images", "hint_images", "output_images")), [])):
            raise ValueError("Output path must not overwrite a Case input")
        evaluator = Evaluator(config, ResponsesJudge(args.timeout), args.cache_dir)
        # Validate every requested input before the first paid invocation.
        preview = evaluator.preview(context, args.metrics)
        if args.dry_run:
            value = {"dry_run": True, "rubric_version": config["version"], "requests": preview}
            failed = False
        else:
            value = evaluator.evaluate(context, args.metrics)
            failed = any(item["status"] == "failed" for item in value["metrics"].values())
        if args.output:
            _atomic_json(args.output, value)
        else:
            print(json.dumps(value, ensure_ascii=False, indent=2))
        return 1 if failed else 0
    except (ValueError, OSError) as exc:
        print(f"worldcast: {exc}", file=sys.stderr)
        return 2
