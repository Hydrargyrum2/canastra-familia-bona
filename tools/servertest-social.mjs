// Test: přátelé, profily, historie, vzájemné zápasy, ztlumení, obrázky, přezdívka, heslo, smazání účtu,
// upozornění (uložení předplatného), bez limitu na tah. Server: npx wrangler dev --var BOT_DELAY_MS:5 --var DC_MS:1500
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
  return { status: r.status, data: await r.json().catch(() => null), r };
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
    wait: (pred, ms = 6000) => new Promise((res, rej) => {
      const hit = inbox.find(pred);
      if (hit) return res(hit);
      const w = { pred, res };
      waiters.push(w);
      setTimeout(() => { const i = waiters.indexOf(w); if (i !== -1) { waiters.splice(i, 1); rej(new Error('timeout')); } }, ms);
    }),
    last: (t) => [...inbox].reverse().find((m) => m.t === t),
  };
}
const tag = Math.random().toString(36).slice(2, 6);
async function user(n) {
  const r = await post('/api/register', { name: n + tag, password: 'heslo123' });
  return { token: r.data.token, id: r.data.user.id, name: r.data.user.name };
}
const me = async (tok) => (await get('/api/me', tok)).data;

const noMeld = {};
function decide(view) {
  const g = view.game;
  const s = view.me.seat;
  if (!g || g.current !== s) return null;
  if (g.phase === 'draw') { noMeld[s] = false; return g.stockCount > 0 ? { type: 'draw' } : { type: 'pass' }; }
  if (g.phase !== 'play') return null;
  const st = { ...g, stock: { length: g.stockCount } };
  const a = noMeld[s] ? null : B.greedyAction(st, s);
  if (a) return a.type === 'new' ? { type: 'meld', ids: a.ids } : { type: 'add', meldId: a.meldId, ids: a.ids };
  for (const c of g.players[s].hand) if (!E.discardError(st, s, c.id)) return { type: 'discard', id: c.id };
  noMeld[s] = true;
  return { type: 'undo' };
}

async function main() {
  const [P1, P2, P3, P4] = [await user('Fx'), await user('Fy'), await user('Fz'), await user('Fw')];

  console.log('Přátelé');
  const l2 = connect('/api/lobby/ws', P2.token); await l2.opened;
  const l1 = connect('/api/lobby/ws', P1.token); await l1.opened;
  await sleep(200);
  let r = await post('/api/friends/request', { id: P2.id }, P1.token);
  check(r.data.status === 'out', 'žádost odeslána');
  const fr = await l2.wait((m) => m.t === 'friend_req');
  check(fr.from.id === P1.id, 'druhý hráč dostal žádost hned do aplikace');
  check((await me(P2.token)).requests === 1, 'počet čekajících žádostí 1');
  let f2 = (await get('/api/friends', P2.token)).data;
  check(f2.incoming.some((u) => u.id === P1.id) && !f2.friends.length, 'žádost je mezi příchozími, zatím bez přítele');
  r = await post('/api/friends/answer', { id: P1.id, accept: true }, P2.token);
  check(r.data.status === 'friends', 'přijato');
  const ok = await l1.wait((m) => m.t === 'friend_ok');
  check(ok.by.id === P2.id, 'odesílatel dostal zprávu o přijetí');
  const f1 = (await get('/api/friends', P1.token)).data;
  check(f1.friends.some((u) => u.id === P2.id && u.status === 'lobby'), 'přítel je v seznamu i s online stavem');
  // vzájemná žádost = rovnou přátelé
  await post('/api/friends/request', { id: P4.id }, P3.token);
  r = await post('/api/friends/request', { id: P3.id }, P4.token);
  check(r.data.status === 'friends' && r.data.accepted, 'žádost proti žádosti = rovnou přátelé');
  r = await post('/api/friends/remove', { id: P3.id }, P4.token);
  check(!(await get('/api/friends', P3.token)).data.friends.length, 'odebrání z přátel');
  r = await post('/api/friends/request', { id: P3.id }, P1.token);
  r = await post('/api/friends/answer', { id: P1.id, accept: false }, P3.token);
  check(r.data.status === 'none' && !(await get('/api/friends', P1.token)).data.outgoing.length, 'odmítnutí žádosti');

  console.log('Ztlumení');
  await post('/api/mute', { id: P1.id, on: true }, P2.token);
  check((await me(P2.token)).mutes.includes(P1.id), 'ztlumený hráč je v seznamu');
  l1.send({ t: 'invite', to: P2.id, table: 'ABCDEF', mode: '1v1' });
  await l1.wait((m) => m.t === 'invite_sent');
  await sleep(300);
  check(!l2.inbox.some((m) => m.t === 'invite'), 'od ztlumeného hráče nepřijde pozvánka');
  await post('/api/mute', { id: P1.id, on: false }, P2.token);
  l1.send({ t: 'invite', to: P2.id, table: 'ABCDEF', mode: '1v1' });
  check(!!(await l2.wait((m) => m.t === 'invite')), 'po zrušení ztlumení pozvánka dorazí');

  console.log('Obrázky');
  r = await post('/api/profile/avatar', { preset: 'p:parrot' }, P1.token);
  check(r.data.user.avatar === 'p:parrot', 'připravený obrázek');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  r = await post('/api/profile/avatar', { image: png }, P1.token);
  check(r.data.user.avatar === 'img' && r.data.user.av >= 2, 'vlastní fotka uložena');
  const img = await fetch(BASE + '/api/avatar?id=' + P1.id + '&v=' + r.data.user.av);
  const bytes = new Uint8Array(await img.arrayBuffer());
  check(img.status === 200 && img.headers.get('content-type') === 'image/png' && bytes[1] === 0x50, 'fotka jde stáhnout (bez přihlášení)');
  r = await post('/api/profile/avatar', { image: 'data:text/html;base64,PHNjcmlwdD4=' }, P1.token);
  check(r.status === 400, 'jiný než obrázkový soubor se odmítne');
  r = await post('/api/profile/avatar', { image: 'data:image/png;base64,' + 'A'.repeat(80000) }, P1.token);
  check(r.status === 400, 'příliš velký obrázek se odmítne');
  const players = (await get('/api/players?q=', P1.token)).data.players;
  const admin = players.find((u) => u.admin);
  if (admin) {
    const al = await post('/api/login', { name: admin.name, password: 'heslo123' });
    if (al.data.token) {
      r = await post('/api/admin/avatar', { id: P1.id }, al.data.token);
      check(r.data.ok && (await me(P1.token)).user.avatar === null, 'správce může obrázek smazat');
    }
  }
  r = await post('/api/admin/avatar', { id: P1.id }, P2.token);
  check(r.status === 403, 'ostatní mazat obrázky nesmí');

  console.log('Přezdívka, heslo, smazání účtu');
  r = await post('/api/profile/name', { name: 'Nový ' + tag }, P3.token);
  check(r.data.user && r.data.user.name === 'Nový ' + tag, 'změna přezdívky');
  r = await post('/api/profile/name', { name: P1.name }, P3.token);
  check(r.data.error && r.data.error.k === 'name_taken', 'obsazená přezdívka se odmítne');
  r = await post('/api/profile/password', { old: 'spatne', password: 'noveheslo' }, P3.token);
  check(r.data.error && r.data.error.k === 'bad_old_password', 'změna hesla se špatným starým heslem neprojde');
  r = await post('/api/profile/password', { old: 'heslo123', password: 'noveheslo' }, P3.token);
  const relog = await post('/api/login', { name: 'Nový ' + tag, password: 'noveheslo' });
  check(r.data.ok && !!relog.data.token, 'nové heslo funguje');
  await post('/api/friends/request', { id: P4.id }, P1.token);
  r = await post('/api/profile/delete', { password: 'spatne' }, P4.token);
  check(r.status === 400, 'smazání účtu chce správné heslo');
  r = await post('/api/profile/delete', { password: 'heslo123' }, P4.token);
  const gone = await post('/api/login', { name: P4.name, password: 'heslo123' });
  check(r.data.ok && gone.data.error && (await get('/api/me', P4.token)).status === 401, 'účet je smazaný, přihlášení nejde');
  check(!(await get('/api/friends', P1.token)).data.outgoing.length, 'smazaný účet zmizel i ze žádostí');

  console.log('Upozornění');
  const key = (await get('/api/push/key')).data.key;
  check(typeof key === 'string' && key.length > 80, 'veřejný klíč VAPID');
  r = await post('/api/push/subscribe', { sub: { endpoint: 'https://push.example.invalid/abc', keys: { p256dh: 'BFErZJCECU2N_a-ZvnYeg-C8U2-JEm6aoa0joF4X6RbWY8r4lZ7zNtD4ZQAqdbsX_f3GHnhA7OlF-19FoUxhuxg', auth: 'AAAAAAAAAAAAAAAAAAAAAA' } }, lang: 'cs' }, P3.token);
  check(r.data.ok, 'předplatné uloženo');
  r = await post('/api/friends/request', { id: P3.id }, P2.token);
  check(r.status === 200 && r.data.status === 'out', 'žádost offline hráči projde, i když se upozornění nepodaří doručit');

  console.log('Hra, historie, vzájemné zápasy, bez limitu na tah');
  const code = (await post('/api/table/create', { mode: '1v1' }, P1.token)).data.code;
  const t1 = connect('/api/table/ws?code=' + code, P1.token); await t1.opened; await sleep(80);
  const t2 = connect('/api/table/ws?code=' + code, P2.token); await t2.opened;
  await t1.wait((m) => m.t === 'state' && m.s.seats.every(Boolean));
  t1.send({ t: 'start' });
  const st0 = await t1.wait((m) => m.t === 'state' && m.s.status === 'playing');
  check(st0.s.turnDeadline == null, 'žádný limit na tah');
  const idleSeat = st0.s.game.current;
  const idle = idleSeat === 0 ? t1 : t2;
  await sleep(2500);
  const st1 = idle.last('state').s;
  check(st1.game.current === idleSeat && !idle.inbox.some((m) => m.t === 'chat' && m.m.kind === 'sys' && (m.m.k === 'timeout' || m.m.k === 'away')), 'nečinný hráč je pořád na tahu, robot za něj nehraje');
  // P2 odejde → prohra, historie a vzájemné zápasy
  t2.send({ t: 'leave' });
  await t2.wait((m) => m.t === 'left');
  const prof = (await get('/api/profile?id=' + P1.id, P2.token)).data;
  check(prof.h2h.games === 1 && prof.h2h.losses === 1, 'vzájemné zápasy: 1 hra, 1 prohra (odchod)');
  check(prof.friend === 'friends' && prof.user.id === P1.id && typeof prof.status === 'string', 'profil přítele: stav přátelství a online');
  const my = (await get('/api/profile?id=' + P2.id, P2.token)).data;
  check(my.friend === 'self' && my.history[0].result === 'left' && my.history[0].opps[0].name === P1.name && my.history[0].rated, 'vlastní historie: odchod proti Fx, hodnocená');
  check(my.user.games === 1 && my.user.losses === 1 && my.user.bgames === 0, 'statistiky proti lidem: 1 hra, 1 prohra');
  const chatMsg = (t1.ws.send(JSON.stringify({ t: 'chat', text: 'ahoj' })), await t1.wait((m) => m.t === 'chat' && m.m.kind === 'msg'));
  check(chatMsg.m.uid === P1.id, 'zpráva v chatu nese id odesílatele (kvůli ztlumení)');
  console.log('Limit jen mezi lidmi, stůl rovnou s roboty');
  const c3 = (await post('/api/table/create', { mode: '1v1', bots: [1], level: 'easy' }, P2.token)).data.code;
  const t3 = connect('/api/table/ws?code=' + c3, P2.token); await t3.opened;
  const w3 = await t3.wait((m) => m.t === 'state' && m.s.seats.every(Boolean));
  check(w3.s.seats[1].kind === 'bot' && w3.s.seats[1].level === 'easy', 'stůl 1 na 1 rovnou s robotem');
  t3.send({ t: 'start' });
  const p3 = await t3.wait((m) => m.t === 'state' && m.s.status === 'playing');
  await sleep(300);
  check(!t3.last('state').s.turnDeadline, 'člověk s robotem nemá limit na tah');
  const c4 = (await post('/api/table/create', { mode: '2v2', bots: [1, 3] }, P1.token)).data.code;
  const t4 = connect('/api/table/ws?code=' + c4, P1.token); await t4.opened;
  const w4 = await t4.wait((m) => m.t === 'state');
  check(w4.s.seats[1].kind === 'bot' && w4.s.seats[3].kind === 'bot' && w4.s.seats[2] === null, '2 na 2: roboti na místech soupeřů, místo pro přítele volné');
  [l1, l2, t1, t2, t3, t4].forEach((c) => c.ws.close());
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
