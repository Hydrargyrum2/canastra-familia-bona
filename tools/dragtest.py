"""Test přetažení karet z ruky na stůl: k vykládce, několik vybraných najednou, nová vykládka, odhoz na hromádku."""
import asyncio
from playwright.async_api import async_playwright
async def drag(pg, src, dst_sel, touch=False):
    a = await src.bounding_box(); b = await pg.locator(dst_sel).first.bounding_box()
    x0, y0 = a['x'] + a['width'] * 0.3, a['y'] + 25
    x1, y1 = b['x'] + b['width'] / 2, b['y'] + b['height'] / 2
    await pg.mouse.move(x0, y0); await pg.mouse.down()
    for k in range(1, 13): await pg.mouse.move(x0 + (x1 - x0) * k / 12, y0 + (y1 - y0) * k / 12)
    if dst_sel and not touch: await pg.screenshot(path='tools/shots/drag-to-table.png')
    await pg.mouse.up(); await pg.wait_for_timeout(500)
async def labels(pg, sel):
    return await pg.evaluate(f"[...document.querySelectorAll('{sel}')].map(e => e.getAttribute('aria-label'))")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={'width':390,'height':844}, locale='cs-CZ')).new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:8787/'); await pg.evaluate("localStorage.clear()"); await pg.reload()
        await pg.click('[data-act=solo]'); await pg.click('[data-act=new1]'); await pg.wait_for_timeout(400)
        await pg.evaluate("""() => {
          const k = 'brazilska-kanasta-v1'; const d = JSON.parse(localStorage.getItem(k)); const st = d.st;
          const pool = [...st.stock, ...st.players[0].hand, ...st.players[1].hand]; const used = new Set();
          const take = (r, s) => { const c = pool.find(c => c.r === r && c.s === s && !used.has(c.id)); used.add(c.id); return c; };
          const meld = [take('5','H'), take('6','H'), take('7','H')];
          const hand = [take('8','H'), take('9','H'), take('10','H'), take('J','S'), take('Q','S'), take('K','S'), take('5','C'), take('6','D')];
          st.stock = st.stock.filter(c => !used.has(c.id)); st.players[1].hand = st.players[1].hand.filter(c => !used.has(c.id));
          st.teams[0].melds = [{ id: 501, type: 'seq', key: 'H', cards: meld }]; st.teams[0].opened = true;
          st.players[0].hand = hand; st.current = 0; st.phase = 'play'; st.turn = Object.assign(st.turn || {}, { laid: 0, drawn: true });
          localStorage.setItem(k, JSON.stringify(d));
        }""")
        await pg.reload(); await pg.wait_for_timeout(500)
        if await pg.locator('#overlay.show [data-act=close]').count(): await pg.click('#overlay.show [data-act=close]')
        print('vykládka:', await labels(pg, '#myMelds [data-mid] .card'))
        # 1) jedna karta na postupku
        await drag(pg, pg.locator('#hand .hc[aria-label*="8"], #hand .hc').filter(has_text='8').first, '#myMelds [data-mid]')
        m1 = await pg.locator('#myMelds [data-mid] .card').count()
        print('1) po přetažení 8♥:', m1, 'karet ve vykládce')
        # 2) dvě vybrané karty najednou
        await pg.locator('#hand .hc').filter(has_text='9').first.click()
        await pg.locator('#hand .hc').filter(has_text='10').first.click()
        await drag(pg, pg.locator('#hand .hc.sel').first, '#myMelds [data-mid]')
        m2 = await pg.locator('#myMelds [data-mid] .card').count()
        print('2) po přetažení 9♥ a 10♥ najednou:', m2)
        # 3) tři vybrané karty do prázdného místa = nová vykládka
        for r in ['J', 'Q', 'K']: await pg.locator('#hand .hc').filter(has_text=r).first.click()
        await drag(pg, pg.locator('#hand .hc.sel').first, '#myMelds .mhead')
        print('3) vykládek:', await pg.locator('#myMelds [data-mid]').count())
        # 4) karta na hromádku = odhoz
        await drag(pg, pg.locator('#hand .hc').first, '#center [data-act=pile]')
        print('4) po přetažení na hromádku:', await pg.inner_text('.announce'), '| v ruce:', await pg.locator('#hand .hc').count())
        print('chyby', errs)
        await b.close()
asyncio.run(main())
