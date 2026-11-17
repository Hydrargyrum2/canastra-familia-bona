"""Test nového rozhraní ve dvou prohlížečích: menu, přihlášení, přátelé, profil, obrázek, ztlumení, výuka, odpočet."""
import asyncio, random, string, sys
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__)))
from cuthelp import pass_cut
from playwright.async_api import async_playwright
BASE = 'http://127.0.0.1:8787'
SH = 'tools/shots/'
fails = 0
def check(c, label):
    global fails
    print(('  ✓ ' if c else '  ✗ ') + label)
    if not c: fails += 1

async def page(b, lang):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, locale=lang)
    pg = await ctx.new_page()
    pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e)))
    await pg.goto(BASE + '/')
    await pg.wait_for_selector('[data-act=multi]')
    return pg

async def register(pg, name):
    await pg.click('[data-act=multi]')
    await pg.click('[data-act=authtab][data-v=register]')
    await pg.fill('#authName', name)
    await pg.fill('#authPass', 'heslo123')
    await pg.click('#authForm button[type=submit]')
    await pg.wait_for_selector('[data-act=create][data-v="1v1"]')

async def main():
    tag = ''.join(random.choice(string.ascii_lowercase) for _ in range(4))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        A = await page(b, 'cs-CZ')
        B = await page(b, 'pt-BR')
        await A.screenshot(path=SH + 'home-guest.png')
        # zapomenuté heslo
        await A.click('[data-act=multi]')
        await A.click('[data-act=forgot]')
        txt = await A.inner_text('#authForm')
        check('faldik2033@seznam.cz' in txt, 'u přihlášení je kontakt pro zapomenuté heslo')
        await A.click('[data-act=tostart]')
        await register(A, 'Filip' + tag)
        await register(B, 'Bia' + tag)
        await A.screenshot(path=SH + 'multi-page.png')
        check(await A.locator('[data-act=friends]').count() == 1 and await A.locator('[data-act=players]').count() == 1, 'po přihlášení stránka Hra s přáteli: stoly, přátelé, hráči')
        # A najde B a pošle žádost
        await A.click('[data-act=players]')
        await A.fill('#playerSearch', 'Bia' + tag)
        await A.wait_for_selector(f'.pbtn:has-text("Bia{tag}")')
        await A.click(f'.pbtn:has-text("Bia{tag}")')
        await A.wait_for_selector('[data-act=freq]')
        await A.click('[data-act=freq]')
        await A.wait_for_selector('[data-act=fdel]')
        check(True, 'žádost odeslaná z profilu')
        await B.wait_for_selector('[data-act=friends] .nb', timeout=6000)
        check(await B.inner_text('[data-act=friends] .nb') == '1', 'druhému hráči svítí počet žádostí na tlačítku Přátelé')
        await B.click('[data-act=friends]')
        await B.wait_for_selector('[data-act=facc]')
        await B.screenshot(path=SH + 'friends-request-pt.png')
        await B.click('[data-act=facc]')
        await B.wait_for_selector('[data-act=facc]', state='detached', timeout=6000)
        check(await B.locator(f'.plist .pbtn:has-text("Filip{tag}")').count() == 1, 'žádost přijata, Filip je v přátelích')
        # A: obrázek
        await A.click('[data-act=back]'); await A.click('[data-act=back]'); await A.click('[data-act=back]')
        await A.wait_for_selector('.mechip')
        await A.screenshot(path=SH + 'home-user.png')
        await A.click('.mechip')
        await A.wait_for_selector('.avedit')
        await A.click('.avedit')
        await A.click('[data-act=avpick][data-v="p:jaguar"]')
        await A.wait_for_selector('.avpick.on[data-v="p:jaguar"]')
        check(True, 'výběr připraveného obrázku')
        await A.set_input_files('#avatarFile', '/tmp/photo.jpg')
        await A.wait_for_selector('.avprev img.av', timeout=8000)
        await A.screenshot(path=SH + 'avatar-page.png')
        check(await A.locator('img.av').count() >= 1, 'vlastní fotka nahrána a zobrazená')
        await A.click('[data-act=back]')
        await A.wait_for_selector('.statgrid')
        await A.screenshot(path=SH + 'profile-self.png', full_page=True)
        # A otevře profil B (přítel), ztlumí ho
        await A.click('[data-act=back]')
        await A.click('[data-act=multi]')
        await A.click('[data-act=friends]')
        await A.wait_for_selector(f'.pbtn:has-text("Bia{tag}")')
        await A.click(f'.pbtn:has-text("Bia{tag}")')
        await A.wait_for_selector('[data-act=mute]')
        await A.screenshot(path=SH + 'profile-friend.png', full_page=True)
        # hra 1 na 1: A založí stůl, pozve B ze seznamu přátel
        await A.click('[data-act=invite]')
        await B.wait_for_selector('#invite:not([hidden]) [data-act=invaccept]', timeout=8000)
        await B.click('[data-act=invaccept]')
        await A.wait_for_selector('[data-act=start]:not([disabled])', timeout=8000)
        await A.click('[data-act=start]')
        await pass_cut(A, B)
        await A.wait_for_selector('#hand .hc', timeout=8000)
        await B.wait_for_selector('#hand .hc', timeout=8000)
        # chat a ztlumení: B napíše, A ho přes jméno v chatu ztlumí
        await B.click('#chatBtn'); await B.fill('#chatInput', 'oi Filip'); await B.click('#chatSend')
        await A.click('#chatBtn')
        await A.wait_for_selector('#chatList .cname')
        await A.click('#chatList .cname')
        await A.wait_for_selector('[data-act=mute][data-on="1"]')
        await A.click('[data-act=mute][data-on="1"]')
        await A.wait_for_selector('[data-act=mute][data-on="0"]')
        await A.click('[data-act=back]')
        await B.fill('#chatInput', 'segunda mensagem'); await B.click('#chatSend')
        await A.wait_for_timeout(800)
        if not await A.locator('#chat').is_visible(): await A.click('#chatBtn')
        chat = await A.inner_text('#chatList')
        check('segunda mensagem' not in chat and 'oi Filip' not in chat, 'zprávy ztlumeného hráče se nezobrazují')
        await A.click('[data-act=chatclose]')
        # odpojení: kdo není na tahu, zavře aplikaci; druhý odehraje tah a pak vidí, že hra stojí
        for pg in (A, B):
            if await pg.locator('[data-act=chatclose]').is_visible(): await pg.click('[data-act=chatclose]')
        on = A if await A.locator('#handwrap.myturn').count() else B
        off = B if on is A else A
        check(await on.locator('.ttimer').count() == 0, 'žádný odpočet tahu')
        await off.context.close()
        await on.click('#actions [data-act=draw]')
        await on.wait_for_timeout(700)
        await on.locator('#hand .hc').first.click()
        await on.click('#actions [data-act=discard]')
        await on.wait_for_selector('.paused', timeout=10000)
        txt = await on.inner_text('#status')
        check('Čeká' in txt or 'Esperando' in txt, 'hra stojí a ukazuje, že se čeká na odpojeného hráče: ' + txt.strip())
        await on.screenshot(path=SH + 'paused.png')
        # výuka
        C = await page(b, 'cs-CZ')
        await C.click('[data-act=tutorial]')
        for i in range(5):
            await C.click('[data-act=tutnext]')
        await C.screenshot(path=SH + 'tut-intro.png')
        await C.click('[data-act=tutstart]')
        await pass_cut(C)
        await C.wait_for_selector('#coach:not([hidden])')
        tip = await C.inner_text('#coach .ct')
        check(len(tip) > 10, 'výuka: nápověda ' + tip[:60])
        await C.screenshot(path=SH + 'tut-coach.png')
        # odehrát pár tahů podle nápovědy
        for i in range(30):
            if await C.locator('[data-act=coachshow]').count():
                await C.click('[data-act=coachshow]')
                if await C.locator('[data-act=meld]:not([disabled])').count(): await C.click('[data-act=meld]')
                elif await C.locator('[data-act=discard]:not([disabled])').count(): await C.click('[data-act=discard]')
                elif await C.locator('[data-act=pile]:not([disabled])').count(): await C.click('[data-act=pile]')
            elif await C.locator('#actions [data-act=draw]').count():
                await C.click('#actions [data-act=draw]')
            await C.wait_for_timeout(300)
            if await C.locator('#overlay.show').count(): break
        log = await C.inner_text('.announce')
        check(True, 'výuka: hra běží podle nápovědy (' + log + ')')
        if await C.locator('#overlay.show [data-act=close]').count(): await C.click('#overlay.show [data-act=close]')
        elif await C.locator('#overlay.show [data-act=nextround]').count(): await C.click('#overlay.show [data-act=nextround]')
        await C.click('[data-act=menu]')
        await C.click('#overlay [data-act=tostart]')
        await C.wait_for_selector('[data-act=privacy]')
        check(await C.locator('[data-act=close]:has-text("výukové")').count() == 1, 'v hlavním menu jde pokračovat ve výukové hře')
        await C.click('[data-act=privacy]')
        await C.wait_for_selector('h2:has-text("Soukromí")')
        await C.screenshot(path=SH + 'privacy.png', full_page=True)
        for pg, n in ((on, 'na tahu'), (C, 'C')):
            check(not pg.errs, f'{n}: žádné chyby v konzoli {pg.errs[:2]}')
        await b.close()
    sys.exit(1 if fails else 0)
asyncio.run(main())
