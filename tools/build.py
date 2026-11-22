"""Sestaví public/index.html ze zdrojů v src/client (jeden soubor se vším)."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'src' / 'client'
html = (src / 'shell.html').read_text(encoding='utf-8')
import re


def text_scale(css):
    # Každá velikost písma se násobí proměnnou --fz. Aplikace ji nastaví, když prohlížeč
    # zvětšuje jen text (Firefox na Androidu s větším písmem v systému), aby se stůl nerozpadl.
    def size(v):
        v = v.strip()
        return 'px' in v or v.startswith('calc(') or v.startswith('var(')

    def fs(m):
        val, imp = m.group(1), m.group(2) or ''
        return f'font-size: calc(({val.strip()}) * var(--fz, 1)){imp}' if size(val) else m.group(0)

    css = re.sub(r'font-size:\s*([^;}!]+?)(\s*!important)?\s*(?=[;}])', fs, css)

    def font(m):
        return re.sub(r'(?<![\w.-])(\d+(?:\.\d+)?px)(?=\s*/|\s+[a-zA-Z"\'])', r'calc(\1 * var(--fz, 1))', m.group(0), count=1)

    return re.sub(r'(?<![-\w])font:\s*[^;}]+', font, css)


for tag, f in [('/*CSS*/', 'style.css'), ('/*ENGINE*/', 'engine.js'), ('/*BOT*/', 'bot.js'), ('/*I18N*/', 'i18n.js'), ('/*SOUND*/', 'sound.js'), ('/*APP*/', 'app.js')]:
    text = (src / f).read_text(encoding='utf-8')
    if f == 'style.css':
        text = text_scale(text)
    html = html.replace(tag, text)
out = root / 'public' / 'index.html'
out.write_text(html, encoding='utf-8')
print(out, len(html), 'bytes')
import subprocess
subprocess.run(['node', str(root / 'tools' / 'seo.js')], check=True)
