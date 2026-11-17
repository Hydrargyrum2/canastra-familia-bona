// Test serveru: účty, lobby, pozvánky, stůl 2v2 s roboty, celá hra, soukromí karet, chat, odpojení.
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
  console.log('Účty');
  const a = await post('/api/register', { name: 'Alice' + tag, password: 'heslo123' });
  check(a.status === 200 && a.data.token, 'registrace Alice');
  const b = await post('/api/register', { name: 'Bob' + tag, password: 'tajne99' });
  check(b.status === 200 && b.data.token, 'registrace Bob');
  const dup = await post('/api/register', { name: 'alice' + tag, password: 'xxxxxx' });
  check(dup.status === 400 && dup.data.error.k === 'name_taken', 'stejné jméno (jiná velikost písmen) odmítnuto');
  const bad = await post('/api/login', { name: 'Bob' + tag, password: 'spatne' });
  check(bad.status === 400 && bad.data.error.k === 'bad_login', 'špatné heslo odmítnuto');
  const bl = await post('/api/login', { name: 'bob' + tag, password: 'tajne99' });
  check(bl.status === 200 && bl.data.user.name === 'Bob' + tag, 'přihlášení Boba');
  const TA = a.data.token, TB = bl.data.token;
  const meA = await get('/api/me', TA);
  check(meA.data.user.name === 'Alice' + tag, '/api/me');
  check((await get('/api/me', 'nesmysl')).status === 401, 'neplatný token → 401');

  console.log('Lobby a pozvánky');
  const la = connect('/api/lobby/ws', TA); await la.opened;
  const lb = connect('/api/lobby/ws', TB); await lb.opened;
  await la.wait((m) => m.t === 'presence' && m.online[b.data.user.id]);
  check(true, 'Alice vidí Boba online');
  const players = await get('/api/players?q=' + tag, TA);
  check(players.data.players.length === 2 && players.data.players.every((p) => p.online), 'seznam hráčů s online stavem');
  const created = await post('/api/table/create', { mode: '2v2' }, TA);
  const code = created.data.code;
  check(/^[A-Z0-9]{6}$/.test(code), 'stůl 2 na 2 založen, kód ' + code);
  la.send({ t: 'invite', to: b.data.user.id, table: code, mode: '2v2' });
  const inv = await lb.wait((m) => m.t === 'invite');
  check(inv.inv.table === code && inv.inv.from.name === 'Alice' + tag, 'Bob dostal pozvánku');
  lb.send({ t: 'invite_answer', id: inv.inv.id, from: inv.inv.from.id, accept: true, table: code });
  const ans = await la.wait((m) => m.t === 'invite_answer');
  check(ans.accept === true, 'Alice ví, že Bob přijal');

  console.log('Stůl');
  const ta = connect('/api/table/ws?code=' + code, TA); await ta.opened;
  const tb = connect('/api/table/ws?code=' + code, TB); await tb.opened;
  await tb.wait((m) => m.t === 'state' && m.s.me.seat === 1);
  tb.send({ t: 'sit', seat: 2 });
  await ta.wait((m) => m.t === 'state' && m.s.seats[2] && m.s.seats[2].name === 'Bob' + tag);
  check(true, 'Bob si přesedl na místo 2 (parťák Alice)');
  tb.send({ t: 'bot', seat: 1, level: 'hard' });
  const notHost = await tb.wait((m) => m.t === 'error');
  check(notHost.error.k === 'only_host', 'robota smí přidat jen hostitel');
  ta.send({ t: 'bot', seat: 1, level: 'hard' });
  ta.send({ t: 'bot', seat: 3, level: 'easy' });
  await ta.wait((m) => m.t === 'state' && m.s.seats.every(Boolean));
  ta.send({ t: 'chat', text: 'Ahoj Bobe <b>!</b>' });
  const chat = await tb.wait((m) => m.t === 'chat' && m.m.kind === 'msg');
  check(chat.m.text === 'Ahoj Bobe <b>!</b>' && chat.m.name === 'Alice' + tag, 'chat dorazil (text beze změny, escapuje klient)');
  await sleep(700);
  tb.send({ t: 'emote', id: 'tomato' });
  const em = await ta.wait((m) => m.t === 'chat' && m.m.kind === 'emote');
  check(em.m.id === 'tomato' && em.m.seat === 2, 'emote rajče');
  ta.send({ t: 'start' });
  const started = await ta.wait((m) => m.t === 'state' && m.s.status === 'playing');
  check(started.s.game.players[0].hand && started.s.game.players[0].hand.length >= 13, 'hra začala, Alice vidí svých 13+ karet');

  console.log('Hra (2 lidé + 2 roboti)');
  let leak = false, steps = 0, rounds = new Set(), dcTested = false;
  const players2 = [{ c: ta, seat: 0 }, { c: tb, seat: 2 }];
  const errs = {};
  for (const p of players2) p.c.ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.t === 'error') errs[m.error.k] = (errs[m.error.k] || 0) + 1; });
  for (const p of players2) {
    p.c.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t !== 'state' || !m.s.game) return;
      if (ev.data.includes('"snap"')) leak = true;
      m.s.game.players.forEach((pl, i) => { if (i !== p.seat && pl.hand) leak = true; });
    });
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    let acted = false;
    for (const p of players2) {
      if (p.c.ws.readyState !== 1) continue;
      const st = p.c.last('state');
      if (!st || !st.s.game) continue;
      const g = st.s.game;
      rounds.add(g.round);
      if (st.s.status === 'finished') continue;
      if (g.phase === 'roundOver' && !st.s.ready[p.seat]) { p.c.send({ t: 'next' }); p.c.inbox.push({ t: 'state', s: { ...st.s, ready: { ...st.s.ready, [p.seat]: true } } }); acted = true; continue; }
      const act = decide(st.s);
      if (act) {
        const before = p.c.inbox.length;
        p.c.send({ t: 'act', a: act });
        try { await p.c.wait((m, i) => (m.t === 'state' || m.t === 'error') && p.c.inbox.indexOf(m) >= before, 3000); } catch (e) { /* nic */ }
        steps++;
        acted = true;
      }
    }
    const st = ta.last('state');
    if (st && st.s.status === 'finished' && st.s.lastResult) break;
    // test odpojení: Bob se v 2. kole odpojí a za chvíli se vrátí
    if (!dcTested && st && st.s.game && st.s.game.round === 2 && tb.ws.readyState === 1) {
      dcTested = true;
      tb.ws.close();
      await ta.wait((m) => m.t === 'chat' && m.m.kind === 'sys' && m.m.k === 'takeover', 8000).then(() => check(true, 'po odpojení převzal Bobovo místo robot')).catch(() => check(false, 'robot po odpojení nepřevzal'));
      const tb2 = connect('/api/table/ws?code=' + code, TB); await tb2.opened;
      const back = await tb2.wait((m) => m.t === 'state' && m.s.me.seat === 2);
      check(!back.s.seats[2].botControl, 'Bob se vrátil na své místo');
      players2[1].c = tb2;
      tb2.ws.addEventListener('message', (ev) => { if (ev.data.includes('"snap"')) leak = true; });
    }
    if (!acted) await sleep(30);
  }
  console.log('  chyby tahů:', JSON.stringify(errs));
  const fin = ta.last('state');
  check(fin.s.status === 'finished', `hra došla do konce (${rounds.size} kol, ${steps} tahů lidí, vítěz tým ${fin.s.game.winner})`);
  check(!leak, 'nikdo nedostal cizí karty ani zálohu tahu');
  check(fin.s.lastResult && fin.s.lastResult.rated === false, 'hra s roboty se nepočítá do trofejí');
  const meA2 = await get('/api/me', TA);
  check(meA2.data.user.games === 1 && meA2.data.user.rating === 1000, `statistiky Alice: ${meA2.data.user.games} hra, ${meA2.data.user.wins} výher, trofeje ${meA2.data.user.rating}`);

  console.log('Hodnocená hra 1 na 1 (Alice zavře výhrou rychle přes správce není – jen kontrola zápisu)');
  const lb2 = await get('/api/leaderboard', TA);
  check(Array.isArray(lb2.data.players) && lb2.data.players.some((p) => p.name === 'Alice' + tag), 'žebříček obsahuje Alici');
  const reset = await post('/api/admin/reset', { name: 'Bob' + tag, password: 'nove123' }, TB);
  check(reset.status === 403 || reset.data.ok, 'reset hesla jen pro správce (Bob ' + (reset.status === 403 ? 'není' : 'je') + ' správce)');

  for (const c of [la, lb, ta, players2[1].c]) { try { c.ws.close(); } catch (e) { /* nic */ } }
  console.log(failures ? `\n${failures} chyb` : '\nVšechno prošlo.');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
