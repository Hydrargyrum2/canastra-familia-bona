# Canastra família Bona

Karetní hra podle rodinných pravidel brazilské kanasty (canastra). Hraje se v prohlížeči, 1 na 1 nebo 2 na 2, proti robotům (tři obtížnosti) nebo online s přáteli: účty, pozvánky, chat a emoty, trofeje a žebříček. Čeština, angličtina a portugalština.

Web: https://canastra-familia-bona.faldik2033.workers.dev

První zaregistrovaný účet je správce (může resetovat zapomenutá hesla).

## Trofeje

- Počítají se jen hry, kde u všech míst sedí lidé (Elo, K = 32, proti průměru soupeřova týmu).
- Vypadne-li hráči spojení, po minutě za něj hraje robot a výsledek se mu počítá normálně.
- Odejde-li hráč od rozehrané hry sám, počítá se mu prohra hned při odchodu. Zbylí hráči dohrají s robotem a výsledek dostanou na konci.

## Co hra umí

- Hra proti robotům (lehký, střední, těžký) a výuka pro začátečníky s nápovědou.
- Online hra 1 na 1 a 2 na 2: stoly s kódem, pozvánky, chat a emoty.
- Účty: profil s obrázkem, statistiky proti lidem a s roboty, historie her, vzájemné zápasy.
- Přátelé (žádosti s potvrzením), hledání hráčů, žebříček, ztlumení hráče.
- Upozornění na pozvánky a žádosti o přátelství i se zavřenou aplikací (Web Push).
- Limit 2 minuty na tah, když u stolu sedí aspoň dva lidé; pak táhne střední robot. Další kolo se nespouští samo.
- Hudba v pozadí, zvuky, vibrace; instalace jako aplikace (Android, Windows, iPhone).

## Struktura

| Cesta | Co tam je |
| --- | --- |
| `public/index.html` | Hotová hra v jednom souboru – tohle Cloudflare zveřejňuje |
| `public/manifest.webmanifest`, `public/sw.js`, `public/icons/` | Instalovatelná aplikace (Android, Windows, iPhone) a offline hra proti robotům |
| `src/client/engine.js` | Pravidla hry (balíček, vykládky, hromádka, body) |
| `src/client/bot.js` | Robot (lehký, střední, těžký) |
| `src/client/i18n.js` | Překlady (cs, en, pt) |
| `src/client/sound.js` | Hudba a zvuky |
| `src/client/app.js`, `style.css`, `shell.html` | Rozhraní |
| `src/server/index.js` | Server: účty, přátelé, profily, lobby (online stav, pozvánky), stoly (hra, roboti, chat) – Cloudflare Worker + Durable Objects |
| `src/server/webpush.js` | Šifrování a podpis upozornění (Web Push) |
| `public/music/` | Hudba (monume, AtlasAudio, Aurec – Pixabay) |
| `wrangler.jsonc` | Nastavení pro Cloudflare |
| `tools/build.py` | Sestaví `public/index.html` ze zdrojů |
| `tools/sim.js` | Simulace robot proti robotovi s kontrolou pravidel |
| `tools/ladder.js` | Porovnání obtížností robotů |
| `tools/servertest*.mjs` | Testy serveru (spustit proti `npx wrangler dev`) |
| `tools/e2e.py` | Test ve dvou prohlížečích (Playwright) |
| `tools/pwatest.py` | Test instalovatelné aplikace a offline režimu |
| `tools/handtest.py` | Test přeskládání karet v ruce |
| `tools/uitest.py` | Test menu, přátel, profilu, výuky a odpočtu ve třech prohlížečích |
| `tools/icons.py` | Vyrobí ikony aplikace |

## Úpravy

```
python3 tools/build.py     # po změně ve src/client
node tools/sim.js          # kontrola pravidel na stovkách her
```

Každý push do větve `main` Cloudflare automaticky nasadí.
