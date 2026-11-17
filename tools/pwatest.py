"""Test instalovatelné aplikace: manifest, service worker, offline načtení, obrazovka Aplikace."""
import asyncio, json, sys
from playwright.async_api import async_playwright
BASE = 'http://127.0.0.1:8787'
SH = 'tools/shots/'
fails = 0
def check(c, label):
    global fails
    print(('  ✓ ' if c else '  ✗ ') + label)
    if not c: fails += 1

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 820}, locale='cs-CZ',
                                  user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36')
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + '/')
        await pg.wait_for_selector('[data-act=new1]')
        cdp = await ctx.new_cdp_session(pg)
        man = await cdp.send('Page.getAppManifest')
        check(not man.get('errors'), 'manifest bez chyb ' + json.dumps(man.get('errors')))
        ok = await pg.evaluate("navigator.serviceWorker.ready.then(r => !!r.active)")
        check(ok, 'service worker běží')
        await pg.reload()
        await pg.wait_for_selector('[data-act=new1]')
        ctrl = await pg.evaluate("!!navigator.serviceWorker.controller")
        check(ctrl, 'stránku řídí service worker')
        inst = await cdp.send('Page.getInstallabilityErrors')
        check(not inst.get('installabilityErrors'), 'prohlížeč považuje stránku za instalovatelnou ' + json.dumps(inst.get('installabilityErrors')))
        # obrazovka Aplikace
        await pg.click('[data-act=app]')
        await pg.wait_for_selector('.howto')
        first = await pg.inner_text('.howto >> nth=0')
        check('Android' in first and await pg.locator('.howto.mine').count() == 1, 'návod pro Android je první a zvýrazněný')
        await pg.screenshot(path=SH + 'app-cs.png')
        await pg.click('[data-act=back]')
        await pg.wait_for_selector('[data-act=new1]')
        # offline: stránka se načte z uložené kopie a jde hrát proti robotům
        await ctx.set_offline(True)
        await pg.reload()
        await pg.wait_for_selector('#hand .hc', timeout=8000)
        n = await pg.locator('#hand .hc').count()
        check(n >= 13, f'offline se hra spustí ({n} karet v ruce)')
        log0 = await pg.inner_text('.announce')
        await pg.wait_for_function("document.querySelector('.announce') && document.querySelector('.announce').innerText !== " + json.dumps(log0), timeout=8000)
        check(True, 'offline robot hraje: ' + (await pg.inner_text('.announce')))
        await ctx.set_offline(False)
        # Windows uživatel v portugalštině
        ctx2 = await b.new_context(viewport={'width': 1280, 'height': 800}, locale='pt-BR',
                                   user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0')
        p2 = await ctx2.new_page()
        await p2.goto(BASE + '/')
        await p2.wait_for_selector('[data-act=app]')
        await p2.click('[data-act=app]')
        await p2.wait_for_selector('.howto.mine')
        mine = await p2.inner_text('.howto.mine')
        check('Windows' in mine, 'na Windows je zvýrazněný návod pro Windows (pt): ' + mine.split('\n')[0])
        await p2.screenshot(path=SH + 'app-pt-win.png')
        check(not errs, 'žádné chyby v konzoli stránky ' + json.dumps(errs))
        await b.close()
    sys.exit(1 if fails else 0)
asyncio.run(main())
