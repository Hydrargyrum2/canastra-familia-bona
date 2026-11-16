# Canastra família Bona

Karetní hra podle rodinných pravidel brazilské kanasty (canastra). Hraje se v prohlížeči, 1 na 1 nebo 2 na 2, zatím proti robotům se třemi obtížnostmi. Čeština, angličtina a portugalština.

## Struktura

| Cesta | Co tam je |
| --- | --- |
| `public/index.html` | Hotová hra v jednom souboru – tohle Cloudflare zveřejňuje |
| `src/client/engine.js` | Pravidla hry (balíček, vykládky, hromádka, body) |
| `src/client/bot.js` | Robot (lehký, střední, těžký) |
| `src/client/i18n.js` | Překlady (cs, en, pt) |
| `src/client/app.js`, `style.css`, `shell.html` | Rozhraní |
| `tools/build.py` | Sestaví `public/index.html` ze zdrojů |
| `tools/sim.js` | Simulace robot proti robotovi s kontrolou pravidel |
| `tools/ladder.js` | Porovnání obtížností robotů |

## Úpravy

```
python3 tools/build.py     # po změně ve src/client
node tools/sim.js          # kontrola pravidel na stovkách her
```

Každý push do větve `main` Cloudflare automaticky nasadí.
