"""Vyrobí náhledový obrázek public/og.png (1200×630) pro Google, WhatsApp apod."""
import asyncio, pathlib
from playwright.async_api import async_playwright
root = pathlib.Path(__file__).resolve().parent.parent
icon = (root / 'public' / 'icons' / 'icon.svg').read_text(encoding='utf-8')
html = f"""<html><body style="margin:0;width:1200px;height:630px;display:flex;align-items:center;gap:56px;padding:0 90px;box-sizing:border-box;
background:radial-gradient(ellipse at 40% 35%,#15524a 0%,#0d3833 55%,#072521 100%);font-family:Georgia,'DejaVu Serif',serif;color:#fbf5e6">
<div style="width:380px;height:380px;flex:none">{icon.replace('width="512" height="512"','width="380" height="380"')}</div>
<div><div style="font-size:84px;font-weight:700;line-height:1.02">Canastra<br>família Bona</div>
<div style="margin-top:26px;font-size:34px;color:#f1c34c;font-family:'DejaVu Sans',sans-serif">Brazilská kanasta · online s přáteli</div>
<div style="margin-top:12px;font-size:28px;color:#b9c8c3;font-family:'DejaVu Sans',sans-serif">Proti robotům i 2 na 2 · CS · EN · PT</div></div></body></html>"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1200, 'height': 630})
        await pg.set_content(html)
        await pg.screenshot(path=str(root / 'public' / 'og.png'))
        await b.close()
asyncio.run(main())
