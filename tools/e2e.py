# Dva hráči v prohlížeči: registrace, stůl, pozvánka, hra, chat, emote.
import asyncio, random, string
from playwright.async_api import async_playwright
BASE = 'http://127.0.0.1:8787'
SH = 'tools/shots/'
tag = ''.join(random.choice(string.ascii_lowercase) for _ in range(4))

async def page_for(b, lang, errs, w=390, h=820):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, locale=lang)
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(lang + ': ' + str(e)))
    pg.on('console', lambda m: errs.append(lang + ' console: ' + m.text) if m.type == 'error' and 'fonts' not in m.text else None)
    await pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    await pg.goto(BASE + '/')
    await pg.wait_for_timeout(800)
    return pg

async def register(pg, name):
    await pg.click('[data-act=goonline]')
    await pg.click('[data-act=authtab][data-v=register]')
    await pg.fill('#authName', name)
    await pg.fill('#authPass', 'heslo123')
    await pg.click('#authForm button[type=submit]')
    await pg.wait_for_selector('.ohead', timeout=8000)

async def view(pg):
    return await pg.evaluate("""(()=>{ const s = document.querySelector('#score .rd'); return s ? s.textContent : '' })()""")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        errs = []
        A = await page_for(b, 'cs-CZ', errs)
        B = await page_for(b, 'pt-BR', errs)
        await register(A, 'Filip' + tag)
        await register(B, 'Bona' + tag)
        print('registrace ok')
        await A.screenshot(path=SH + 'a-online.png')
        await A.click('[data-act=create][data-v="1v1"]')
        await A.wait_for_selector('.codebox .code', timeout=8000)
        code = await A.inner_text('.codebox .code')
        print('stůl', code)
        # pozvat Bonu ze seznamu
        await A.fill('#playerSearch', 'Bona' + tag)
        await A.wait_for_timeout(900)
        btn = A.locator('.prow', has_text='Bona' + tag).locator('[data-act=invite]')
        await btn.click()
        await B.wait_for_selector('#invite:not([hidden])', timeout=8000)
        print('pozvánka:', (await B.inner_text('#invite')).replace('\n', ' | '))
        await B.screenshot(path=SH + 'b-invite.png')
        await B.click('[data-act=invaccept]')
        await A.wait_for_function("document.querySelectorAll('.seats .seatrow .pname:not(.empty)').length === 2", timeout=8000)
        await A.screenshot(path=SH + 'a-room.png')
        await A.click('[data-act=start]')
        await A.wait_for_selector('#hand .hc', timeout=8000)
        await B.wait_for_selector('#hand .hc', timeout=8000)
        print('hra běží; A karet', await A.locator('#hand .hc').count(), '| B karet', await B.locator('#hand .hc').count())
        # pár tahů: kdo je na tahu, lízne a odhodí první kartu
        for i in range(6):
            for pg in (A, B):
                if await pg.locator('[data-act=draw].btn').count():
                    await pg.click('[data-act=draw].btn')
                    await pg.wait_for_selector('[data-act=discard]', timeout=5000)
                    await pg.locator('#hand .hc').first.click()
                    await pg.click('[data-act=discard]')
                    await pg.wait_for_timeout(500)
        print('tahy ok; log A:', await A.inner_text('.announce'))
        # chat a emoty
        await A.click('#chatBtn')
        await A.fill('#chatInput', 'Bora, Bona! <script>x</script>')
        await A.click('#chatSend')
        await B.wait_for_selector('#chatBtn .nb', timeout=5000)
        print('B má nepřečtenou zprávu:', await B.inner_text('#chatBtn .nb'))
        await B.click('#chatBtn')
        await B.wait_for_timeout(300)
        print('B chat:', (await B.inner_text('#chatList')).replace('\n', ' | '))
        await B.click('[data-act=emote][data-v=tomato]')
        await A.wait_for_selector('.fx-throw, .fx-splat', timeout=4000)
        print('A vidí rajče')
        await A.wait_for_timeout(400)
        await A.screenshot(path=SH + 'a-tomato.png')
        await B.wait_for_timeout(700)
        await B.click('[data-act=emote][data-v=laugh]')
        await A.wait_for_selector('.fx-emote', timeout=4000)
        await A.wait_for_timeout(300)
        await A.screenshot(path=SH + 'a-emote.png')
        await B.screenshot(path=SH + 'b-chat.png')
        # odchod Bony → robot hraje za ni
        await B.click('[data-act=chatclose]')
        await B.click('[data-act=menu]')
        await B.click('[data-act=leavetable]')
        await A.wait_for_function("document.querySelector('#oppSeat') && document.querySelector('#oppSeat').textContent.includes('robot')", timeout=6000)
        print('po odchodu hraje za Bonu robot:', (await A.inner_text('#oppSeat')).replace('\n', ' '))
        await B.wait_for_selector('.ohead', timeout=5000)
        print('Bona je zpět v lobby')
        print('chyby:', errs)
        await b.close()
asyncio.run(main())
