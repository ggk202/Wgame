#!/usr/bin/env python3
"""Bundle WOLFRAM into one self-contained HTML file (used for the solo debug artifact).
Usage: python3 tools/build_single.py [out.html] [entry.js] [page.html]
  e.g. python3 tools/build_single.py dist/wolfram-viewer.html viewer.js viewer.html"""
import re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', 'wolfram-solo.html')
js_dir = os.path.join(ROOT, 'js')
imp_re = re.compile(r"^import\s+(?:[\s\S]*?)\s+from\s+'(\./[^']+)';\s*$", re.M)
three_re = re.compile(r"^import \* as THREE from 'three';\s*$", re.M)
order, seen = [], set()
def visit(name):
    if name in seen: return
    seen.add(name)
    src = open(os.path.join(js_dir, name), encoding='utf-8').read()
    for dep in imp_re.findall(src):
        visit(os.path.basename(dep))
    order.append(name)
ENTRY = sys.argv[2] if len(sys.argv) > 2 else 'main.js'
PAGE = sys.argv[3] if len(sys.argv) > 3 else 'index.html'
visit(ENTRY)
parts = []
for name in order:
    src = open(os.path.join(js_dir, name), encoding='utf-8').read()
    src = imp_re.sub('', src)
    src = three_re.sub('', src)
    src = re.sub(r'^export\s+(?=(async\s+)?(function|const|let|class)\b)', '', src, flags=re.M)
    if name == 'sounds.js':  # inline recorded sounds as data: URIs so the single file is self-contained
        import base64
        def inline(m):
            p = os.path.join(ROOT, m.group(1))
            return "'data:audio/mpeg;base64," + base64.b64encode(open(p, 'rb').read()).decode() + "'" if os.path.exists(p) else m.group(0)
        src = re.sub(r"'(sounds/[\w.-]+\.mp3)'", inline, src)
    parts.append(f'// ===== {name} =====\n{src}')
js = "import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';\nwindow.WOLFRAM_ARTIFACT = true;\n" + '\n'.join(parts)
html = open(os.path.join(ROOT, PAGE), encoding='utf-8').read()
css = open(os.path.join(ROOT, 'css', 'style.css'), encoding='utf-8').read()
html = html.replace('<link rel="stylesheet" href="css/style.css">', '')
html = html.replace('<!--INLINE-CSS-->', f'<style>\n{css}\n</style>')
html = re.sub(r'<script type="importmap">.*?</script>\n', '', html)
html = re.sub(r'<script src="https://unpkg.com/peerjs[^"]*"></script>\n', '', html)
html = html.replace(f'<script type="module" src="js/{ENTRY}"></script>', '')
html = html.replace('<!--INLINE-JS-->', f'<script type="module">\n{js}\n</script>')
html = html.replace('<title>WOLFRAM — Cooperative Hard Sci-Fi Ship Crew</title>', '<title>WOLFRAM — Solo Debug Build</title>')
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf-8').write(html)
print('wrote', out, len(html), 'bytes;', 'modules:', ', '.join(order))
