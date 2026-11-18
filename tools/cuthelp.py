"""Pomocník pro testy: projde sejmutím balíčku (kdo je na řadě, klepne do balíčku a sejme), dokud nejsou karty v ruce."""
import asyncio

async def pass_cut(*pages, timeout=20, frac=0.24):
    end = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < end:
        done = 0
        for pg in pages:
            if await pg.locator('#overlay.show .contbtn[data-act=close]').count():  # po načtení menu: pokračovat v rozehrané hře
                await pg.locator('#overlay.show .contbtn[data-act=close]').click()
                continue
            if await pg.locator('#cutDeck').count():
                box = await pg.locator('#cutDeck').bounding_box()
                await pg.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] * (1 - frac))
                await pg.locator('[data-act=cutgo]').click()
                await asyncio.sleep(0.3)
                continue
            if await pg.locator('#overlay.show .cutres').count():
                await pg.locator('#overlay [data-act=close]').click()
                continue
            if await pg.locator('#hand .hc').count():
                done += 1
        if done == len(pages):
            await asyncio.sleep(0.6)  # výsledek sejmutí ze serveru může přijít o chvilku později
            for pg in pages:
                if await pg.locator('#overlay.show .cutres').count():
                    await pg.locator('#overlay [data-act=close]').click()
            return True
        await asyncio.sleep(0.2)
    return False
