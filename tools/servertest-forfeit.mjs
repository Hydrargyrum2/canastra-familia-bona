// Test serveru: odchod od rozehrané hry se počítá jako prohra.
// Spuštění: npx wrangler dev --var BOT_DELAY_MS:5 --var DC_MS:1500, pak node tools/servertest-forfeit.mjs
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
const tag = Math.random().toString(36).slice(2, 6);
async function user(n) {
  const r = await post('/api/register', { name: n + tag, password: 'heslo123' });
  return r.data.token;
}
const me = async (tok) => (await get('/api/me', tok)).data.user;

async function table(mode, tokens) {
  const code = (await post('/api/table/create', { mode }, tokens[0])).data.code;
  const cs = [];
  for (const tok of tokens) { const c = connect('/api/table/ws?code=' + code, tok); await c.opened; cs.push(c); await sleep(60); }
  return { code, cs };
}

async function main() {
  // --- odchod v čekárně se nepočítá ---
  {
    const [A, B] = [await user('Wa'), await user('Wb')];
    const { cs } = await table('1v1', [A, B]);
    await cs[0].wait((m) => m.t === 'state' && m.s.seats.every(Boolean));
    cs[1].send({ t: 'leave' });
    const l = await cs[1].wait((m) => m.t === 'left');
    const ub = await me(B);
    check(!l.forfeit && ub.games === 0 && ub.losses === 0, 'odchod z čekárny se nepočítá');
    cs.forEach((c) => c.ws.close());
  }

  // --- 1 na 1 mezi lidmi: odchod = prohra hned, pak dohraje robot ---
  {
    const [A, B] = [await user('Fa'), await user('Fb')];
    const { cs } = await table('1v1', [A, B]);
    const [ca, cb] = cs;
    await ca.wait((m) => m.t === 'state' && m.s.seats.every(Boolean));
    ca.send({ t: 'start' });
    await ca.wait((m) => m.t === 'state' && m.s.status === 'playing');
    cb.send({ t: 'leave' });
    const l = await cb.wait((m) => m.t === 'left');
    check(l.forfeit && l.forfeit.rated === true && l.forfeit.delta === -16, 'odcházející dostane zprávu o prohře: ' + JSON.stringify(l.forfeit));
    const ub = await me(B);
    check(ub.rating === 984 && ub.games === 1 && ub.losses === 1 && ub.table === null, 'Fb: 984 trofejí, 1 hra, 1 prohra, nesedí u stolu');
    const ua0 = await me(A);
    check(ua0.rating === 1000 && ua0.games === 0, 'Fa zatím beze změny (výsledek až na konci)');
    const st = await ca.wait((m) => m.t === 'state' && m.s.seats[1] && m.s.seats[1].kind === 'bot');
    check(st.s.status === 'playing' && /robot/.test(st.s.seats[1].name), 'místo Fb hraje robot, hra běží dál');
    const chat = await ca.wait((m) => m.t === 'chat' && m.m.kind === 'sys' && m.m.k === 'left');
    check(!!chat, 'v chatu je systémová zpráva o odchodu');
    // Fa taky odejde: zůstanou jen roboti, hra se ukončí
    ca.send({ t: 'leave' });
    const la = await ca.wait((m) => m.t === 'left');
    const ua = await me(A);
    console.log('    Fa odchod:', JSON.stringify(la.forfeit), 'rating', ua.rating);
    check(la.forfeit && la.forfeit.rated && ua.losses === 1 && ua.games === 1 && ua.rating < 1000, 'i druhý odchod je prohra');
    const info = (await get('/api/table/info?code=' + st.s.code, A)).data;
    check(info.status === 'finished', 'když u stolu nezůstane nikdo, hra skončí (stav ' + info.status + ')');
    await sleep(300);
    const ua2 = await me(A), ub2 = await me(B);
    check(ua2.games === 1 && ub2.games === 1, 'nikomu se hra nezapsala dvakrát');
    cs.forEach((c) => c.ws.close());
  }

  // --- 2 na 2 mezi lidmi: odchod jednoho, parťák hraje dál, na konci se nikomu nic nezdvojí ---
  {
    const toks = [await user('Qa'), await user('Qb'), await user('Qc'), await user('Qd')];
    const { cs } = await table('2v2', toks);
    await cs[0].wait((m) => m.t === 'state' && m.s.seats.every(Boolean));
    const seats = cs[0].last('state').s.seats;
    cs[0].send({ t: 'start' });
    await cs[0].wait((m) => m.t === 'state' && m.s.status === 'playing');
    cs[1].send({ t: 'leave' });
    const l = await cs[1].wait((m) => m.t === 'left');
    check(l.forfeit && l.forfeit.delta === -16, '2 na 2: odcházející −16');
    const partnerSeat = 3; // tým odcházejícího (sedadlo 1) je 1 a 3
    const partnerName = seats[partnerSeat].name;
    const ids = await Promise.all(toks.map(me));
    const partner = ids.find((u) => u.name === partnerName);
    check(partner.games === 0 && partner.rating === 1000, 'parťák zatím nic neztrácí');
    const left = ids.find((u) => u.name === seats[1].name);
    check(left.losses === 1 && left.rating === 984, 'odcházející má prohru a 984');
    cs.forEach((c) => c.ws.close());
  }

  // --- hra s robotem: prohra do statistik, trofeje se nemění ---
  {
    const A = await user('Ra');
    const code = (await post('/api/table/create', { mode: '1v1' }, A)).data.code;
    const c = connect('/api/table/ws?code=' + code, A); await c.opened;
    await c.wait((m) => m.t === 'state');
    c.send({ t: 'bot', seat: 1, level: 'easy' });
    await c.wait((m) => m.t === 'state' && m.s.seats.every(Boolean));
    c.send({ t: 'start' });
    await c.wait((m) => m.t === 'state' && m.s.status === 'playing');
    c.send({ t: 'leave' });
    const l = await c.wait((m) => m.t === 'left');
    const u = await me(A);
    check(l.forfeit && l.forfeit.rated === false && l.forfeit.delta === 0 && u.rating === 1000 && u.blosses === 1 && u.games === 0, 'hra s robotem: prohra se zapíše mezi hry s roboty, trofeje zůstanou ' + u.rating);
    c.ws.close();
  }
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
