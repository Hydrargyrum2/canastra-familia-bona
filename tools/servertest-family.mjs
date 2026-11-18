// Test serveru: rodinná pravidla – sejmutí balíčku, výměna první karty, střídání začínajícího.
// Spuštění: npx wrangler dev --var BOT_DELAY_MS:5 --var DC_MS:1500, pak node tools/servertest-family.mjs
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
  return g.turn && g.turn.canRetract ? { type: 'retract' } : null;
}

const lastState = (c) => { const m = c.last('state'); return m && m.s; };
async function act(c, a) {
  const before = c.inbox.length;
  c.send({ t: 'act', a });
  return c.wait((m) => (m.t === 'state' || m.t === 'error') && c.inbox.indexOf(m) >= before, 3000).catch(() => null);
}

async function main() {
  const tag = Math.random().toString(36).slice(2, 6);
  const a = await post('/api/register', { name: 'Fx' + tag, password: 'heslo123' });
  const b = await post('/api/register', { name: 'Fy' + tag, password: 'heslo123' });
  const TA = a.data.token, TB = b.data.token;
  const code = (await post('/api/table/create', { mode: '1v1' }, TA)).data.code;
  const ta = connect('/api/table/ws?code=' + code, TA); await ta.opened;
  const tb = connect('/api/table/ws?code=' + code, TB); await tb.opened;
  await ta.wait((m) => m.t === 'state' && m.s.seats.every(Boolean));
  ta.send({ t: 'start' });
  const started = (await ta.wait((m) => m.t === 'state' && m.s.status === 'playing')).s.game;
  console.log('Sejmutí balíčku');
  check(started.phase === 'cut' && started.stockCount === 108 && started.players.every((p) => p.handCount === 0), 'kolo začíná sejmutím, karty ještě nejsou rozdané');
  const cutter = started.current;
  const C = cutter === 0 ? ta : tb;
  const O = cutter === 0 ? tb : ta;
  const nb = O.inbox.length;
  O.send({ t: 'act', a: { type: 'cut', aim: 26 } });
  const bad = await O.wait((m) => m.t === 'error' && O.inbox.indexOf(m) >= nb, 3000).catch(() => null);
  await sleep(200);
  check(!!bad && lastState(O).game.phase === 'cut', 'soupeř sejmout nesmí');
  await act(C, { type: 'cut', aim: 26 });
  const g = lastState(C).game;
  const ci = g.cutInfo;
  check(g.phase === 'draw' && ci && ci.pi === cutter && Math.abs(ci.left - 26) <= 2, `sejmuto: dole ${ci && ci.left} (míření 26, karty se svezou nejvýš o 2)`);
  check(g.players[cutter].hand.length === 13 && g.players[1 - cutter].handCount >= 13, 'rozdáno po 13 kartách');
  check(g.current === cutter, 'začíná ten, kdo snímal');
  const pts = g.teams[g.players[cutter].team].score;
  check(ci.hit ? pts === 100 : pts === 0, `body za sejmutí: ${pts} (${ci.hit ? 'přesně' : 'vedle'})`);

  console.log('Výměna první karty');
  const early = await act(C, { type: 'redraw' });
  check(early && early.t === 'error', 'před líznutím vyměnit nejde');
  await act(C, { type: 'draw' });
  const d = lastState(C).game;
  check(d.phase === 'play' && d.turn.canRedraw === true, 'po prvním líznutí jde kartu vyměnit');
  check(lastState(O).game.turn.canRedraw === false, 'soupeř tlačítko nevidí');
  const handBefore = d.players[cutter].hand.map((c) => c.id);
  await act(C, { type: 'redraw' });
  const r = lastState(C).game;
  check(r.pile.length === 1 && handBefore.includes(r.pile[0].id) && !r.players[cutter].hand.some((c) => c.id === r.pile[0].id), 'odmítnutá karta leží na hromádce');
  check(r.players[cutter].hand.length >= handBefore.length && r.turn.canRedraw === false && r.phase === 'play', 'má novou kartu, podruhé už vyměnit nejde');
  const again = await act(C, { type: 'redraw' });
  check(again && again.t === 'error', 'druhá výměna je odmítnutá');
  const disc = r.players[cutter].hand.find((c) => !E.isWild(c));
  await act(C, { type: 'discard', id: disc.id });
  check(lastState(C).game.pile.length === 2 && lastState(C).game.current !== cutter, 'tah skončil odhozením, odmítnutá karta je pod ní');
  const pvMsg = await O.wait((m) => m.t === 'state' && m.s.game && m.s.game.pile.length === 2, 3000).catch(() => null);
  const pv = pvMsg ? pvMsg.s.game.pile : lastState(O).game.pile;
  check(pv[0].hidden && !pv[0].r && pv[1].r === disc.r, 'z hromádky je vidět jen vrchní karta, spodní je skrytá: ' + JSON.stringify(pv));
  check(lastState(O).game.log.length <= 8, 'historie tahů se online neposílá celá');
  const og = lastState(O).game;
  if (og.phase === 'draw') {
    await act(O, { type: 'draw' });
    check(lastState(O).game.turn.canRedraw === false, 'soupeř po líznutí kartu vyměnit nemůže');
  }

  console.log('Další kolo začíná soupeř');
  const ps = [{ c: ta }, { c: tb }];
  const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    const s = lastState(ta);
    if (s && s.game && (s.game.phase === 'roundOver' || s.game.phase === 'gameOver')) break;
    let acted = false;
    for (const p of ps) {
      const s2 = lastState(p.c);
      const x = s2 && decide(s2);
      if (x) { await act(p.c, x); acted = true; }
    }
    if (!acted) await sleep(20);
  }
  const end = lastState(ta).game;
  check(end.phase === 'roundOver', 'první kolo dohráno');
  if (end.phase === 'roundOver') {
    ta.send({ t: 'next' }); tb.send({ t: 'next' });
    const nx = await ta.wait((m) => m.t === 'state' && m.s.game && m.s.game.round === end.round + 1, 4000).catch(() => null);
    check(nx && nx.s.game.phase === 'cut' && nx.s.game.current === 1 - cutter, 'v dalším kole snímá a začíná druhý hráč');
  }
  [ta, tb].forEach((c) => c.ws.close());
  console.log(failures ? `\n${failures} chyb` : '\nvše v pořádku');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
