#!/usr/bin/env python3
"""Export the current static site as a self-contained HTML document."""
import argparse
import json
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
dist = ROOT / 'dist'
html = (dist / 'index.html').read_text()
css = (dist / 'style.css').read_text()
core = (dist / 'core.js').read_text().replace('export ', '')
app = (dist / 'app.js').read_text().split('\n', 1)[1]
app = app.replace("const response=await fetch('./catalog.json');if(!response.ok)throw new Error('片单暂时无法读取');catalog=await response.json();videos=catalog.videos;", "catalog=JSON.parse(document.getElementById('inline-catalog').textContent);videos=catalog.videos;")
data = json.dumps(json.loads((dist / 'catalog.json').read_text()), ensure_ascii=False).replace('</', '<\\/')
html = html.replace('<link rel="stylesheet" href="./style.css">', '<style>' + css + '</style>')
html = html.replace('./assets/favicon.svg', 'data:image/svg+xml,' + quote((dist / 'assets/favicon.svg').read_text()))
script = core + '\nconst esc = escapeHtml;\n' + app
html = html.replace('<script type="module" src="./app.js"></script>', '<script type="application/json" id="inline-catalog">' + data + '</script>\n<script type="module">' + script + '</script>')
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(html)
print(args.output.resolve())
