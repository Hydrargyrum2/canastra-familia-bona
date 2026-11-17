"""Přidá překlady do src/client/i18n.js: python3 tools/addi18n.py soubor.json  ({"cs":{...},"en":{...},"pt":{...}})
Klíče se vloží za řádek app_installed_toast v každém jazyce; existující klíč se přepíše."""
import json, re, sys, pathlib
p = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'client' / 'i18n.js'
s = p.read_text(encoding='utf-8')
data = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
lines = s.split('\n')
anchors = [i for i, l in enumerate(lines) if l.strip().startswith('app_installed_toast:')]
assert len(anchors) == 3, anchors
langs = ['cs', 'en', 'pt']
# pořadí jazyků v souboru = cs, en, pt
for li in sorted(range(3), reverse=True):
    lang = langs[li]
    block = data.get(lang, {})
    # smazat staré definice týchž klíčů v bloku jazyka
    start = anchors[li - 1] + 1 if li > 0 else 0
    end = anchors[li + 1] if li < 2 else len(lines)
    for k in block:
        for i in range(start, end):
            if lines[i] is not None and re.match(r'\s*' + re.escape(k) + r':\s', lines[i]) and i != anchors[li]:
                lines[i] = None
    ins = ['    %s: %s,' % (k, json.dumps(v, ensure_ascii=False)) for k, v in block.items()]
    lines[anchors[li] + 1:anchors[li] + 1] = ins
lines = [l for l in lines if l is not None]
p.write_text('\n'.join(lines), encoding='utf-8')
missing = set(data['cs']) ^ set(data['en']) | set(data['cs']) ^ set(data['pt'])
print('ok', {k: len(v) for k, v in data.items()}, 'nesoulad klíčů:', sorted(missing))
