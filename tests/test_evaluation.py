import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from worldcast.adapters import grid_prompt, interleaved_prompt, video_prompt
from worldcast.context import fingerprint, load_context, metric_inputs
from worldcast.judge import Evaluator, ResponsesJudge, build_request
from worldcast.rubrics import METRICS, bench_metrics, combined_tc, load_rubrics, result_weight, schema, validate_result

spec = importlib.util.spec_from_file_location("example", Path(__file__).parents[1]/"examples/make_example.py")
example = importlib.util.module_from_spec(spec)
spec.loader.exec_module(example)


class EvaluationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = Path(self.tmp.name)
        self.path = example.create(self.folder/"demo")
        self.ctx = load_context(self.path)
        self.config = load_rubrics()
        self.calls = []

    def fake(self, request):
        self.calls.append(request)
        result = {"score": request["schema"]["properties"]["score"]["enum"][-1],
                  "evidence": "Synthetic test evidence.", "elapsed_seconds": 0.01}
        if request["metric"] == "SA":
            result["step_index"] = request["step_index"]
        return result

    def test_rules_and_schema(self):
        self.assertEqual(set(self.config["metrics"]), set(METRICS))
        self.assertEqual(schema("OC")["properties"]["score"]["enum"], [0, 1])
        self.assertEqual(schema("PA")["properties"]["score"]["enum"], [0, 1, 2])
        for metric in ("TP", "TA", "TC"):
            with self.assertRaises(ValueError): schema(metric)

    def test_invalid_output_fails_before_transport(self):
        from worldcast.cli import main
        with patch("worldcast.judge.ResponsesJudge.__call__") as transport:
            self.assertEqual(main(["evaluate", str(self.path), "--output", str(self.path)]), 2)
            transport.assert_not_called()

    def test_all_inputs_validated_before_transport(self):
        self.ctx["hints_by_metric"].pop("VC")
        with self.assertRaises(ValueError):
            Evaluator(self.config, self.fake).evaluate(self.ctx)
        self.assertEqual(self.calls, [])

    def test_published_docs(self):
        import html
        import re
        root = Path(__file__).parents[1]
        rubric_html = html.unescape((root / "docs/rubrics.html").read_text())
        for value in self.config["metrics"].values():
            self.assertIn(value["normative_rubric"], rubric_html)
            self.assertIn(value["output_contract"], rubric_html)
        for path in (root / "docs").glob("*.html"):
            text = path.read_text()
            self.assertIsNone(re.search(r"<script|/Users/|/home/|/mnt/|127\.0\.0\.1|contenteditable", text, re.I))

    def test_result_validation(self):
        for score in (True, 1.0, -1, 2):
            with self.assertRaises(ValueError): validate_result("OC", {"score": score, "evidence": "x"})
        with self.assertRaises(ValueError): validate_result("CP", {"score": 2, "evidence": ""})
        with self.assertRaises(ValueError): validate_result("SA", {"score": 1, "evidence": "x", "step_index": 2}, 1)

    def test_aggregation(self):
        self.assertEqual(combined_tc(self.ctx, {"PA": 2, "OC": 1}), 3)
        self.assertEqual(combined_tc(self.ctx, {"PA": 2, "OC": 0}), 1.5)
        self.assertIsNone(combined_tc(self.ctx, {"PA": 2}))
        self.assertEqual(combined_tc({"task_type": "process-focused"}, {"PA": 2}), 3)
        self.assertEqual(combined_tc({"result_weight": 100}, {"OC": 1}), 3)
        self.assertEqual(combined_tc({"result_weight": 0}, {"PA": 2}), 3)
        for value in (None, True, -1, 101, float("nan")):
            with self.assertRaises(ValueError): result_weight({"result_weight": value})

    def test_default_and_process_metrics(self):
        evaluator = Evaluator(self.config, self.fake)
        result = evaluator.evaluate(self.ctx)
        self.assertEqual(list(result["metrics"]), ["PA", "OC", "CP", "VC"])
        self.assertEqual(result["overall_100"], 100)
        self.ctx["task_type"] = "process-focused"
        self.assertEqual(bench_metrics(self.ctx), ("PA", "CP", "VC"))
        before = len(self.calls)
        self.assertEqual(evaluator.evaluate(self.ctx, ["OC"])["metrics"]["OC"]["status"], "skipped")
        self.assertEqual(len(self.calls), before)

    def test_image_scopes(self):
        for metric in ("PA", "CP", "VC"):
            _, groups = metric_inputs(metric, self.ctx)
            self.assertEqual(groups[-1][1], self.ctx["output_images"])
        _, groups = metric_inputs("OC", self.ctx)
        self.assertEqual(groups[-1][1], self.ctx["output_images"][-1:])
        data, groups = metric_inputs("SA", self.ctx, 1)
        self.assertEqual(groups[-1][1], self.ctx["output_images"][:1])
        self.assertEqual(data["paired_model_text_plan"], self.ctx["plans"][0])
        self.assertNotIn(self.ctx["plans"][1], json.dumps(data))
        self.assertNotIn("paired_model_text_plan", metric_inputs("OC", self.ctx)[0])

    def test_hints_and_references(self):
        self.ctx["hint_images"] = self.ctx["output_images"]
        self.ctx["hints_by_metric"]["TC"]["image_indices"] = [2, 2]
        data, groups = metric_inputs("OC", self.ctx)
        self.assertEqual(data["case_hint_image_indices"], [2])
        self.assertEqual(groups[1][1], self.ctx["output_images"][1:])
        self.assertEqual(groups[0][1], self.ctx["initial_images"])
        self.ctx["hints_by_metric"]["TC"]["image_indices"] = [0]
        with self.assertRaises(ValueError): metric_inputs("OC", self.ctx)
        self.ctx["hints_by_metric"] = {}
        with self.assertRaises(ValueError): metric_inputs("PA", self.ctx)

    def test_sa_explicit_and_resume(self):
        evaluator = Evaluator(self.config, self.fake, self.folder/"cache")
        result = evaluator.evaluate(self.ctx, ["SA"])
        self.assertEqual(result["metrics"]["SA"]["score"], 1)
        self.assertEqual(len(self.calls), 2)
        evaluator.evaluate(self.ctx, ["SA"])
        self.assertEqual(len(self.calls), 2)
        self.ctx["plans"][0] += " Updated."
        evaluator.evaluate(self.ctx, ["SA"])
        self.assertEqual(len(self.calls), 4)

    def test_sa_eligibility(self):
        evaluator = Evaluator(self.config, self.fake)
        for key, value in (("plans", []), ("steps", 3)):
            ctx = copy.deepcopy(self.ctx)
            ctx[key] = value
            item = evaluator.evaluate(ctx, ["SA"])["metrics"]["SA"]
            self.assertEqual(item["status"], "skipped")
            self.assertNotIn("score", item)
        self.assertEqual(self.calls, [])

    def test_failure_is_not_zero_and_success_not_repeated(self):
        def fail_oc(request):
            if request["metric"] == "OC": raise RuntimeError("synthetic failure")
            return self.fake(request)
        evaluator = Evaluator(self.config, fail_oc, self.folder/"cache")
        first = evaluator.evaluate(self.ctx)
        self.assertNotIn("score", first["metrics"]["OC"])
        self.assertIsNone(first["overall_100"])
        evaluator.transport = self.fake
        second = evaluator.evaluate(self.ctx)
        self.assertEqual(second["overall_100"], 100)
        self.assertEqual(len(self.calls), 4)

    def test_partial_sa_resume(self):
        def fail_second(request):
            if request["step_index"] == 2: raise RuntimeError("synthetic failure")
            return self.fake(request)
        evaluator = Evaluator(self.config, fail_second, self.folder/"cache")
        self.assertEqual(evaluator.evaluate(self.ctx, ["SA"])["metrics"]["SA"]["status"], "failed")
        evaluator.transport = self.fake
        self.assertEqual(evaluator.evaluate(self.ctx, ["SA"])["metrics"]["SA"]["status"], "succeeded")
        self.assertEqual(len(self.calls), 2)

    def test_cache_uses_image_and_rubric_contents(self):
        from PIL import Image
        a = fingerprint(self.ctx)
        Image.new("RGB", (5, 5), "blue").save(self.ctx["output_images"][0])
        self.assertNotEqual(a, fingerprint(self.ctx))
        evaluator = Evaluator(self.config, self.fake, self.folder/"cache")
        evaluator.evaluate(self.ctx, ["PA"])
        changed = copy.deepcopy(self.config)
        changed["metrics"]["PA"]["normative_rubric"] += "\nChanged rule."
        Evaluator(changed, self.fake, self.folder/"cache").evaluate(self.ctx, ["PA"])
        self.assertEqual(len(self.calls), 2)

    def test_adapters(self):
        grid = grid_prompt("Task", 4)
        self.assertIn("\nOutput 4 steps, and arrange the 4 steps in a 2×2 grid.\n", grid)
        self.assertIn("in a 1×2 grid.", grid_prompt("Task", 2))
        self.assertIn("in a 2×1 grid.", grid_prompt("Task", 2, "2x1"))
        self.assertIn("in a grid.", grid_prompt("Task", 3))
        self.assertEqual(grid_prompt(grid, 4), grid)
        self.assertIn("2×3", grid_prompt("Task", 6))
        prompt = interleaved_prompt("Task", 4)
        self.assertEqual(interleaved_prompt(prompt, 4), prompt)
        self.assertIn("single coherent video", video_prompt("Task"))
        with self.assertRaises(ValueError): grid_prompt("Task", 0)

    def test_grid_split(self):
        from PIL import Image
        from worldcast import grid
        from worldcast.cli import main
        colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (0, 255, 255), (255, 0, 255)]
        sheet = Image.new("RGB", (300, 200))
        for index, color in enumerate(colors):
            sheet.paste(color, (index % 3 * 100, index // 3 * 100, index % 3 * 100 + 100, index // 3 * 100 + 100))
        (self.folder/"data"/"9").mkdir(parents=True)
        (self.folder/"data"/"9"/"case.json").write_text(json.dumps({"steps": 6}))
        (self.folder/"grids").mkdir()
        sheet.save(self.folder/"grids"/"9.png")
        self.assertEqual(main(["split-grids", str(self.folder/"data"), str(self.folder/"grids"), str(self.folder/"split")]), 0)
        for index, color in enumerate(colors, 1):
            with Image.open(self.folder/"split"/"9"/f"step_{index}.jpg") as cell:
                self.assertEqual(cell.size, (100, 100))
                self.assertTrue(all(abs(a-b) < 12 for a, b in zip(cell.getpixel((50, 50)), color)))
        self.assertEqual(len(grid.split_grid(self.folder/"grids"/"9.png", 2, self.folder/"tall", (2, 1))), 2)
        (self.folder/"data"/"9"/"case.json").write_text(json.dumps({"steps": 6, "target_grid": "3x2"}))
        grid.split(self.folder/"data", self.folder/"grids", self.folder/"split")
        with Image.open(self.folder/"split"/"9"/"step_1.jpg") as cell:
            self.assertEqual(cell.size, (150, 66))
        with self.assertRaises(ValueError): grid.split_grid(self.folder/"grids"/"9.png", 3, self.folder/"bad")

    def test_responses_transport_without_model_call(self):
        from types import SimpleNamespace
        request = build_request("OC", self.ctx, self.config)
        captured = {}
        def create(**kwargs):
            captured.update(kwargs)
            return SimpleNamespace(output_text='```json\n{"score": 1, "evidence": "Visible result"}\n```')
        client = SimpleNamespace(responses=SimpleNamespace(create=create))
        result = ResponsesJudge(client=client)(request)
        self.assertEqual(result["score"], 1)
        self.assertEqual((captured["model"], captured["reasoning"]), ("gpt-5.5", {"effort": "medium"}))
        content = captured["input"][0]["content"]
        self.assertEqual([part["type"] for part in content], ["input_text", "input_image", "input_image"])
        self.assertTrue(content[1]["image_url"].startswith("data:image/jpeg;base64,"))
        self.assertNotIn("text", captured)
        self.assertIn('"declared_number_of_steps": "2"', content[0]["text"])

    def test_video_adapter_without_model_call(self):
        from worldcast import video
        data = self.folder/"data"/"7"
        data.mkdir(parents=True)
        (data/"reference.png").write_bytes((self.folder/"demo/reference.png").read_bytes())
        (data/"case.json").write_text(json.dumps({"prompt": "Move the disk.", "steps": 2, "initial_images": ["reference.png"]}))
        (self.folder/"7.mp4").write_bytes(b"video")
        captured = {}
        def fake_run(command, **kwargs):
            captured.update(command=command, **kwargs)
            work = Path(command[command.index("-C")+1])
            for name in ("step_1.jpg", "step_2.jpg", "sample.jpg"):
                (work/"selected"/name).write_bytes(b"jpeg")
            steps = [{"step": i, "timestamp_seconds": float(i), "filename": f"step_{i}.jpg", "achieved": True, "evidence": "x"} for i in (1, 2)]
            Path(command[command.index("-o")+1]).write_text(json.dumps({"steps": steps, "overall_notes": ""}))
            return subprocess.CompletedProcess(command, 0, "", "")
        with patch("worldcast.video.subprocess.run", side_effect=fake_run):
            self.assertEqual(video.adapt(self.folder/"data", self.folder, self.folder/"frames", ffmpeg="/bin/ffmpeg"), {})
        self.assertEqual(sorted(p.name for p in (self.folder/"frames/7").iterdir()), ["selection.json", "step_1.jpg", "step_2.jpg"])
        self.assertIn("gpt-6-astra", captured["command"])
        self.assertIn('model_reasoning_effort="medium"', captured["command"])
        prompt = captured["input"]
        self.assertNotIn("{{", prompt)
        self.assertNotIn("HINTS", prompt)
        self.assertIn("identify the\n2 frames", prompt)
        with self.assertRaises(ValueError):
            video.validate_selection({"steps": [{"step": 1, "timestamp_seconds": 1, "filename": "step_1.jpg"},
                                                {"step": 2, "timestamp_seconds": 1, "filename": "step_2.jpg"}]}, 2, self.folder/"frames/7")

    def test_benchmark_run_and_summary(self):
        from worldcast import benchmark
        data, outputs = self.folder/"data", self.folder/"outputs"
        case = json.loads(self.path.read_text())
        for case_id, category in ((1, "Visual Cues"), (2, "Physical Simulation")):
            (data/str(case_id)).mkdir(parents=True)
            (data/str(case_id)/"reference.png").write_bytes((self.folder/"demo/reference.png").read_bytes())
            exported = {k: v for k, v in case.items() if k not in ("output_images", "plans", "model", "generation_id")}
            exported.update(case_id=case_id, category=category, level="L4" if case_id == 1 else "L3")
            (data/str(case_id)/"case.json").write_text(json.dumps(exported))
        (outputs/"1").mkdir(parents=True)
        for name in ("10.png", "2.png"):
            (outputs/"1"/name).write_bytes((self.folder/"demo/step_1.png").read_bytes())
        self.assertEqual([Path(p).name for p in benchmark.case_context(data, outputs, 1)["output_images"]], ["2.png", "10.png"])
        records = benchmark.run(data, outputs, self.folder/"results", Evaluator(self.config, self.fake))
        self.assertEqual(records[0]["overall_100"], 100)
        self.assertIsNone(records[1]["overall_100"])
        summary = benchmark.summarize(self.folder/"results")
        self.assertEqual((summary["cases"], summary["scored"], summary["overall"]), (2, 1, 100))
        self.assertEqual(summary["categories"]["Visual Cues"], 100)
        self.assertIsNone(summary["levels"]["L3"])
        self.assertIn("Scored Cases: 1/2", benchmark.format_summary(summary))

    def test_cli_dry_run(self):
        import sys
        result = subprocess.run([sys.executable, "-m", "worldcast", "evaluate", str(self.path), "--dry-run"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(json.loads(result.stdout)["requests"]), 4)


if __name__ == "__main__": unittest.main()
