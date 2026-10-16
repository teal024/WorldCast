"""Render the packaged normative text without changing its wording."""
import html
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
rules = json.loads((root / 'src/worldcast/resources/rubrics.json').read_text())
sections = ''.join(
    '<section id="' + key + '"><h2>' + html.escape(value['name']) + '</h2><pre>'
    + html.escape(value['normative_rubric'] + '\n\n' + value['output_contract'])
    + '</pre></section>' for key, value in rules['metrics'].items())
document = ('<!doctype html><html lang="en"><meta charset="utf-8">'
            '<title>WorldCast Judge Rubrics</title><style>'
            'body{max-width:960px;margin:40px auto;padding:20px;font-family:system-ui}'
            'pre{white-space:pre-wrap;line-height:1.5}section{break-before:page}'
            '</style><h1>WorldCast Judge Rubrics</h1><p>' + html.escape(rules['version'])
            + '</p>' + sections + '</html>\n')
(root / 'docs').mkdir(exist_ok=True)
(root / 'docs/rubrics.html').write_text(document, encoding='utf-8')
