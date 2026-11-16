"""Sestaví public/index.html ze zdrojů v src/client (jeden soubor se vším)."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'src' / 'client'
html = (src / 'shell.html').read_text(encoding='utf-8')
for tag, f in [('/*CSS*/', 'style.css'), ('/*ENGINE*/', 'engine.js'), ('/*BOT*/', 'bot.js'), ('/*I18N*/', 'i18n.js'), ('/*APP*/', 'app.js')]:
    html = html.replace(tag, (src / f).read_text(encoding='utf-8'))
out = root / 'public' / 'index.html'
out.write_text(html, encoding='utf-8')
print(out, len(html), 'bytes')
