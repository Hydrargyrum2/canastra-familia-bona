"""Vyrobí ikony aplikace (public/icons) z vlastního SVG návrhu: zelené plátno, vějíř tří karet."""
import asyncio, pathlib
from playwright.async_api import async_playwright

root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'public' / 'icons'
out.mkdir(parents=True, exist_ok=True)

HEART = "M0,14 C-20,0 -30,-12 -17,-22 C-8,-28 0,-21 0,-14 C0,-21 8,-28 17,-22 C30,-12 20,0 0,14 Z"
SPADE = "M0,-24 C-20,-6 -30,4 -16,13 C-8,17 -3,13 -1,10 L-6,24 L6,24 L1,10 C3,13 8,17 16,13 C30,4 20,-6 0,-24 Z"
STAR = "M0,-26 L7.6,-8 L26,-8 L11,3.5 L16.5,22 L0,11 L-16.5,22 L-11,3.5 L-26,-8 L-7.6,-8 Z"

def card(rot, corner, color, sym, sym_color, big):
    small = '' if not corner else f'<path d="{sym}" fill="{sym_color}" transform="translate(-50 -30) scale(0.75)"/>'
    return f'''
  <g transform="translate(256 452) rotate({rot}) translate(0 -196)">
    <rect x="-78" y="-110" width="156" height="220" rx="16" fill="#fbf5e6" stroke="#d9cfb4" stroke-width="3"/>
    <text x="-50" y="-58" text-anchor="middle" font-family="Georgia, 'DejaVu Serif', serif" font-weight="700" font-size="42" fill="{color}">{corner}</text>
    {small}
    <path d="{sym}" fill="{sym_color}" transform="translate(6 22) scale({big})"/>
  </g>'''

def svg(maskable):
    bg = '<rect width="512" height="512" fill="url(#felt)"/>' if maskable else \
         '<rect x="16" y="16" width="480" height="480" rx="108" fill="url(#felt)"/><rect x="30" y="30" width="452" height="452" rx="96" fill="none" stroke="#f1c34c" stroke-opacity="0.55" stroke-width="5"/>'
    s = 0.74 if maskable else 0.9
    cards = card(-28, 'K', '#17201e', SPADE, '#17201e', 2.0) + card(0, 'A', '#c2373a', HEART, '#c2373a', 2.0) + card(28, '', '#17201e', STAR, '#e2a92a', 2.6)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="felt" cx="50%" cy="38%" r="70%">
      <stop offset="0" stop-color="#15524a"/><stop offset="0.55" stop-color="#0d3833"/><stop offset="1" stop-color="#072521"/>
    </radialGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#000" flood-opacity="0.45"/></filter>
  </defs>
  {bg}
  <g transform="translate(256 256) scale({s}) translate(-256 -256)" filter="url(#sh)">{cards}
  </g>
</svg>'''

async def main():
    (out / 'icon.svg').write_text(svg(False), encoding='utf-8')
    jobs = [('icon-192.png', False, 192), ('icon-512.png', False, 512), ('maskable-512.png', True, 512),
            ('apple-touch-icon.png', True, 180), ('favicon-32.png', False, 32)]
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, mask, size in jobs:
            pg = await b.new_page(viewport={'width': size, 'height': size})
            html = f'<html><body style="margin:0;background:transparent">{svg(mask).replace(chr(10), "")}</body></html>'
            html = html.replace('width="512" height="512"', f'width="{size}" height="{size}"', 1)
            await pg.set_content(html)
            await pg.screenshot(path=str(out / name), omit_background=True, clip={'x': 0, 'y': 0, 'width': size, 'height': size})
            await pg.close()
        await b.close()
    print('hotovo:', sorted(x.name for x in out.iterdir()))

asyncio.run(main())
