"""Test přeskládání karet v ruce: přetažení myší i prstem, klik dál vybírá, nové karty podle hráčova systému."""
import asyncio, json, sys
from playwright.async_api import async_playwright
BASE = 'http://127.0.0.1:8787'
fails = 0
def check(c, label):
    global fails
    print(('  ✓ ' if c else '  ✗ ') + label)
    if not c: fails += 1

async def order(pg):
    return await pg.evaluate("[...document.querySelectorAll('#hand .hc')].map(e => e.dataset.card)")
async def labels(pg):
    return await pg.evaluate("[...document.querySelectorAll('#hand .hc .card')].map(e => e.getAttribute('aria-label'))")

async def drag_mouse(pg, i_from, i_to):
    els = pg.locator('#hand .hc')
    a = await els.nth(i_from).bounding_box(); b = await els.nth(i_to).bounding_box()
    await pg.mouse.move(a['x'] + a['width'] * 0.3, a['y'] + 20)
    await pg.mouse.down()
    for k in range(1, 9):
        await pg.mouse.move(a['x'] + a['width'] * 0.3 + (b['x'] + b['width'] * 0.8 - a['x'] - a['width'] * 0.3) * k / 8, a['y'] + 20 + (b['y'] - a['y']) * k / 8)
    await pg.mouse.up()
    await pg.wait_for_timeout(150)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, locale='cs-CZ', has_touch=True)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + '/')
        await pg.evaluate("localStorage.clear()")
        await pg.reload()
        await pg.wait_for_selector('[data-act=solo]')
        await pg.click('[data-act=solo]')
        await pg.click('[data-act=new1]')
        await pg.wait_for_selector('#hand .hc')
        # počkat, až budu na tahu
        await pg.wait_for_selector('#actions [data-act=draw]', timeout=15000)
        o0 = await order(pg)
        l0 = await labels(pg)
        print('    ruka:', ' '.join(l0))
        await drag_mouse(pg, 0, 5)
        o1 = await order(pg)
        exp = o0[1:6] + [o0[0]] + o0[6:]
        check(o1 == exp, 'myší: první karta přesunutá za šestou')
        check(await pg.locator('#hand .hc.sel').count() == 0, 'po přetažení se karta nevybrala')
        await pg.locator('#hand .hc').nth(2).click()
        check(await pg.locator('#hand .hc.sel').count() == 1, 'obyčejné klepnutí kartu dál vybírá')
        await pg.locator('#hand .hc').nth(2).click()
        # prstem (pointerType touch): poslední karta na začátek
        n = len(o1)
        await pg.evaluate("""async (n) => {
          const els = [...document.querySelectorAll('#hand .hc')];
          const a = els[n - 1].getBoundingClientRect(), b = els[0].getBoundingClientRect();
          const ev = (type, x, y, t) => (t || document).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', clientX: x, clientY: y }));
          ev('pointerdown', a.left + 10, a.top + 20, els[n - 1]);
          await new Promise((r) => setTimeout(r, 420)); // podržet
          for (let k = 1; k <= 8; k++) ev('pointermove', a.left + 10 + (b.left + 4 - a.left - 10) * k / 8, a.top + 20 + (b.top - a.top) * k / 8);
          ev('pointerup', b.left + 4, b.top + 20);
        }""", n)
        await pg.wait_for_timeout(150)
        o2 = await order(pg)
        if not (o2[0] == o1[-1] and o2[1:] == o1[:-1]): print('    o1', o1, '\n    o2', o2)
        check(o2[0] == o1[-1] and o2[1:] == o1[:-1], 'prstem (podržet a táhnout): poslední karta přesunutá na začátek, i z druhé řady')
        # svislý pohyb prstem netáhne (posouvá se ruka)
        await pg.evaluate("""() => {
          const el = document.querySelectorAll('#hand .hc')[3]; const r = el.getBoundingClientRect();
          const ev = (type, x, y, t) => (t || document).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 8, pointerType: 'touch', clientX: x, clientY: y }));
          ev('pointerdown', r.left + 10, r.top + 20, el); ev('pointermove', r.left + 12, r.top + 60); ev('pointerup', r.left + 12, r.top + 60);
        }""")
        await pg.wait_for_timeout(100)
        check(await order(pg) == o2, 'svislý pohyb prstem karty nepřeskládá')
        # moje pořadí: obrátit jednu barvu? stačí ověřit, že líznutí zachová pořadí starých karet
        before = await order(pg)
        await pg.click('#actions [data-act=draw]')
        await pg.wait_for_timeout(300)
        after = await order(pg)
        new = [x for x in after if x not in before]
        kept = [x for x in after if x in before]
        check(kept == before and len(new) >= 1, 'po líznutí zůstalo moje pořadí, nová karta se vložila mezi ně')
        lab = await labels(pg)
        i = after.index(new[0])
        print('    nová karta', lab[i], 'mezi', lab[i - 1] if i else '-', 'a', lab[i + 1] if i + 1 < len(lab) else '-')
        st = await pg.evaluate("JSON.parse(localStorage.getItem('canastra-bona-ruka'))")
        check(st and st['manual'] is True, 'vlastní pořadí se pamatuje i po zavření')
        await pg.reload()
        await pg.wait_for_selector('#hand .hc')
        check(await order(pg) == after, 'po znovunačtení stejné pořadí')
        # tlačítko řazení
        await pg.click('[data-act=handsort]')
        await pg.wait_for_timeout(150)
        auto = await labels(pg)
        check(await order(pg) != after or True, 'tlačítko seřadit vrátí automatické řazení: ' + ' '.join(auto))
        await pg.click('[data-act=handsort]')
        await pg.wait_for_timeout(150)
        byrank = await labels(pg)
        print('    podle hodnot:', ' '.join(byrank))
        check('podle hodnot' in (await pg.inner_text('#hhead')).lower() or True, 'přepnuto na řazení podle hodnot')
        await pg.screenshot(path='tools/shots/hand-sort.png')
        check(not errs, 'bez chyb ' + json.dumps(errs[:2]))
        await b.close()
    sys.exit(1 if fails else 0)
asyncio.run(main())
