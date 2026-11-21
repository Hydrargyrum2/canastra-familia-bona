# Bobři a krysy

Karetní hra na paměť pro 2–6 hráčů proti robotům. Samostatný web (Cloudflare Worker jen se statickými soubory):
https://bobri-a-krysy.faldik2033.workers.dev

- `public/engine.js` – pravidla, `public/bot.js` – roboti, `public/app.js` – rozhraní.
- Simulace robotů: `node tools/bobri-sim.js 400 easy,medium,hard`
- Nasazení: Cloudflare Workers Builds, Worker `bobri-a-krysy`, kořenová složka `bobri`.
