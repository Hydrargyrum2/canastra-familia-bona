// Test serveru: hráč odejde z hodnocené hry 1 na 1, druhý ji dohraje s robotem.
// Spuštění: npx wrangler dev --var BOT_DELAY_MS:5 --var DC_MS:1500, pak node tools/servertest.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../src/client/engine.js');
const B = require('../src/client/bot.js');

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const WSBASE = BASE.replace(/^http/, 'ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (cond, label) => { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) failures++; };

async function post(path, body, token) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) });
  return { status: r.status, data: await r.json() };
}
async function get(path, token) {
  const r = await fetch(BASE + path, { headers: token ? { authorization: 'Bearer ' + token } : {} });
  return { status: r.status, data: await r.json() };
}
function connect(path, token) {
  const ws = new WebSocket(WSBASE + path + (path.includes('?') ? '&' : '?') + 'token=' + token);
  const inbox = [];
  const waiters = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    inbox.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); }
  };
  const opened = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  return {
    ws, inbox, opened,
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (pred, ms = 5000) => new Promise((res, rej) => {
      const hit = inbox.find(pred);
      if (hit) return res(hit);
      const w = { pred, res };
      waiters.push(w);
      setTimeout(() => { const i = waiters.indexOf(w); if (i !== -1) { waiters.splice(i, 1); rej(new Error('timeout')); } }, ms);
    }),
    last: (t) => [...inbox].reverse().find((m) => m.t === t),
  };
}

// Jednoduchý hráč nad pohledem ze serveru: líznout, vyložit, co jde, odhodit.
const noMeldTurn = {};
function decide(view) {
  const g = view.game;
  const me = view.me.seat;
  if (!g || g.current !== me) return null;
  if (g.phase === 'cut') return { type: 'cut', aim: 26 };
  if (g.phase === 'draw') { noMeldTurn[me] = false; return g.stockCount > 0 ? { type: 'draw' } : { type: 'pass' }; }
  if (g.phase !== 'play') return null;
  const st = { ...g, stock: { length: g.stockCount } }; // pro funkce robota
  const a = noMeldTurn[me] ? null : B.greedyAction(st, me);
  if (a) return a.type === 'new' ? { type: 'meld', ids: a.ids } : { type: 'add', meldId: a.meldId, ids: a.ids };
  for (const c of g.players[me].hand) if (!E.discardError(st, me, c.id)) return { type: 'discard', id: c.id };
  noMeldTurn[me] = true; // nesplněné minimum: vrátit a jen odhodit
  return { type: 'undo' };
}

async function main() {
  const tag = Math.random().toString(36).slice(2, 6);
  const a = await post('/api/register', { name: 'Ana' + tag, password: 'heslo123' });
  const b = await post('/api/register', { name: 'Ben' + tag, password: 'heslo123' });
  const TA = a.data.token, TB = b.data.token;
  const code = (await post('/api/table/create', { mode: '1v1' }, TA)).data.code;
  const ta = connect('/api/table/ws?code=' + code, TA); await ta.opened;
  const tb = connect('/api/table/ws?code=' + code, TB); await tb.opened;
  await ta.wait((m) => m.t === 'state' && m.s.seats.every(Boolean));
  ta.send({ t: 'start' });
  await ta.wait((m) => m.t === 'state' && m.s.status === 'playing');
  tb.send({ t: 'leave' });
  await tb.wait((m) => m.t === 'left');
  const ps = [{ c: ta, seat: 0 }];
  const t0 = Date.now();
  while (Date.now() - t0 < 280000) {
    let acted = false;
    for (const p of ps) {
      const st = p.c.last('state');
      if (!st || !st.s.game || st.s.status === 'finished') continue;
      const g = st.s.game;
      if (g.phase === 'roundOver' && !st.s.ready[p.seat]) { p.c.send({ t: 'next' }); p.c.inbox.push({ t: 'state', s: { ...st.s, ready: { ...st.s.ready, [p.seat]: true } } }); acted = true; continue; }
      const act = decide(st.s);
      if (act) { const before = p.c.inbox.length; p.c.send({ t: 'act', a: act }); try { await p.c.wait((m) => (m.t === 'state' || m.t === 'error') && p.c.inbox.indexOf(m) >= before, 3000); } catch (e) {} acted = true; }
    }
    const st = ta.last('state');
    if (st && st.s.status === 'finished' && st.s.lastResult) break;
    if (!acted) await sleep(20);
  }
  const fin = ta.last('state');
  check(fin.s.status === 'finished', 'hra dohrána s robotem místo Bena, vítěz ' + fin.s.game.winner);
  check(fin.s.lastResult && fin.s.lastResult.rated === true, 'hra zůstala hodnocená pro Anu');
  const ua = (await get('/api/me', TA)).data.user, ub = (await get('/api/me', TB)).data.user;
  console.log('  Ana', ua.rating, ua.wins + '/' + ua.games, '| Ben', ub.rating, ub.wins + '/' + ub.games, '| změny', JSON.stringify(fin.s.lastResult.changes));
  check(ub.rating === 984 && ub.games === 1 && ub.losses === 1, 'Ben: jen jedna prohra z odchodu, nic navíc');
  check(ua.games === 1 && ua.rating !== 1000 && !(String(ub.id) in fin.s.lastResult.changes), 'Ana dostala výsledek na konci, Ben ve výsledku není');
  check(ua.table === null && ub.table === null, 'po konci hry nikdo nesedí u stolu');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
