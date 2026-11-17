// Canastra família Bona – server (Cloudflare Worker + Durable Objects).
// Accounts: účty, přihlášení, statistiky, trofeje (SQLite).
// Lobby:    kdo je online, pozvánky.
// Table:    jeden stůl – místa, hra (stejný engine jako v prohlížeči), roboti, chat, emoty.
import { DurableObject } from 'cloudflare:workers';
import * as EngNS from '../client/engine.js';
import * as BotNS from '../client/bot.js';

const E = EngNS.default && EngNS.default.M ? EngNS.default : EngNS.M ? EngNS : globalThis.Engine;
const B = BotNS.default && BotNS.default.step ? BotNS.default : BotNS.step ? BotNS : globalThis.Bot;

const BOT_NAMES = ['Caio', 'Bia', 'Duda', 'Tito', 'Lia', 'Nando'];
const LEVELS = ['easy', 'medium', 'hard'];
const EMOTES = ['laugh', 'slow', 'sleep', 'luck', 'clown', 'fire', 'joker', 'black3', 'cry', 'cool', 'gg', 'hi', 'tomato'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DISCONNECT_MS = 60_000;
const BOT_DELAY_MS = 900;
const PBKDF2_ITER = 20_000;

const M = (k, p) => ({ k, p: p || {} });
function safeSend(ws, obj) {
  try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) { /* spojení se zavírá */ }
}
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fail = (k, status = 400, p) => json({ error: M(k, p) }, status);

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function genCode() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return [...a].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const accounts = (env) => env.ACCOUNTS.get(env.ACCOUNTS.idFromName('main'));
const lobby = (env) => env.LOBBY.get(env.LOBBY.idFromName('main'));
const table = (env, code) => env.TABLE.get(env.TABLE.idFromName(code));

// ===================================================================== Worker
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await api(req, env, url);
    } catch (e) {
      console.error('api error', e && e.stack ? e.stack : e);
      return fail('server_error', 500);
    }
  },
};

function tokenOf(req, url) {
  const h = req.headers.get('authorization') || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return url.searchParams.get('token') || '';
}

async function api(req, env, url) {
  const p = url.pathname;
  const isPost = req.method === 'POST';
  const body = isPost ? await req.json().catch(() => ({})) : {};

  if (p === '/api/ping') return json({ ok: true });
  if (p === '/api/register' && isPost) {
    const r = await accounts(env).register(body.name, body.password);
    return r.error ? json(r, 400) : json(r);
  }
  if (p === '/api/login' && isPost) {
    const r = await accounts(env).login(body.name, body.password);
    return r.error ? json(r, 400) : json(r);
  }

  const token = tokenOf(req, url);
  const me = token ? await accounts(env).userByToken(token) : null;
  if (!me) return fail('not_logged_in', 401);

  if (p === '/api/me') return json({ user: me });
  if (p === '/api/logout' && isPost) {
    await accounts(env).logout(token);
    return json({ ok: true });
  }
  if (p === '/api/players') {
    const list = await accounts(env).search(url.searchParams.get('q') || '', 60);
    const online = await lobby(env).onlineMap();
    return json({
      players: list.map((u) => ({ ...u, online: !!online[u.id], status: online[u.id] ? online[u.id].status : 'offline', table: online[u.id] ? online[u.id].table : null })),
    });
  }
  if (p === '/api/leaderboard') return json({ players: await accounts(env).leaderboard(50) });
  if (p === '/api/table/create' && isPost) {
    const mode = body.mode === '2v2' ? '2v2' : '1v1';
    for (let i = 0; i < 6; i++) {
      const code = genCode();
      const r = await table(env, code).init(code, mode, { id: me.id, name: me.name });
      if (r.ok) return json({ code });
    }
    return fail('server_error', 500);
  }
  if (p === '/api/table/info') {
    const code = (url.searchParams.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) return fail('table_not_found', 404);
    const info = await table(env, code).info();
    return info ? json(info) : fail('table_not_found', 404);
  }
  if (p === '/api/table/ws') {
    if (req.headers.get('upgrade') !== 'websocket') return fail('bad_request', 426);
    const code = (url.searchParams.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) return fail('table_not_found', 404);
    const h = new Headers(req.headers);
    h.set('x-user-id', String(me.id));
    h.set('x-user-name', encodeURIComponent(me.name));
    return table(env, code).fetch(new Request(req.url, { headers: h }));
  }
  if (p === '/api/lobby/ws') {
    if (req.headers.get('upgrade') !== 'websocket') return fail('bad_request', 426);
    const h = new Headers(req.headers);
    h.set('x-user-id', String(me.id));
    h.set('x-user-name', encodeURIComponent(me.name));
    return lobby(env).fetch(new Request(req.url, { headers: h }));
  }
  if (p === '/api/admin/reset' && isPost) {
    if (!me.admin) return fail('not_admin', 403);
    const r = await accounts(env).resetPassword(body.name, body.password);
    return r.error ? json(r, 400) : json(r);
  }
  return fail('not_found', 404);
}

// ================================================================== Accounts
export class Accounts extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, name_lc TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL,
      rating INTEGER NOT NULL DEFAULT 1000, games INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0,
      admin INTEGER NOT NULL DEFAULT 0, table_code TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created INTEGER NOT NULL)`);
  }
  pub(u) {
    return { id: u.id, name: u.name, rating: u.rating, games: u.games, wins: u.wins, losses: u.losses, admin: !!u.admin, table: u.table_code || null };
  }
  row(sql, ...args) {
    const r = this.sql.exec(sql, ...args).toArray();
    return r.length ? r[0] : null;
  }
  newSession(userId) {
    const token = randomHex(32);
    this.sql.exec('INSERT INTO sessions (token, user_id, created) VALUES (?, ?, ?)', token, userId, Date.now());
    return token;
  }
  async register(name, password) {
    name = String(name || '').trim().replace(/\s+/g, ' ');
    password = String(password || '');
    if (!/^[\p{L}\p{N}_.\- ]{3,20}$/u.test(name)) return { error: M('bad_name') };
    if (password.length < 6 || password.length > 100) return { error: M('bad_password') };
    if (this.row('SELECT id FROM users WHERE name_lc = ?', name.toLowerCase())) return { error: M('name_taken') };
    const salt = randomHex(16);
    const hash = await hashPassword(password, salt);
    const first = !this.row('SELECT id FROM users LIMIT 1');
    this.sql.exec('INSERT INTO users (name, name_lc, salt, hash, created, admin) VALUES (?, ?, ?, ?, ?, ?)', name, name.toLowerCase(), salt, hash, Date.now(), first ? 1 : 0);
    const u = this.row('SELECT * FROM users WHERE name_lc = ?', name.toLowerCase());
    return { token: this.newSession(u.id), user: this.pub(u) };
  }
  async login(name, password) {
    const u = this.row('SELECT * FROM users WHERE name_lc = ?', String(name || '').trim().replace(/\s+/g, ' ').toLowerCase());
    if (!u) return { error: M('bad_login') };
    const hash = await hashPassword(String(password || ''), u.salt);
    if (!safeEqual(hash, u.hash)) return { error: M('bad_login') };
    return { token: this.newSession(u.id), user: this.pub(u) };
  }
  userByToken(token) {
    const u = this.row('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', String(token));
    return u ? this.pub(u) : null;
  }
  logout(token) {
    this.sql.exec('DELETE FROM sessions WHERE token = ?', String(token));
    return true;
  }
  search(q, limit) {
    const like = '%' + String(q || '').trim().toLowerCase().replace(/[%_]/g, '') + '%';
    return this.sql.exec('SELECT * FROM users WHERE name_lc LIKE ? ORDER BY name_lc LIMIT ?', like, limit).toArray().map((u) => this.pub(u));
  }
  leaderboard(limit) {
    return this.sql.exec('SELECT * FROM users WHERE games > 0 ORDER BY rating DESC, wins DESC, name_lc LIMIT ?', limit).toArray().map((u) => this.pub(u));
  }
  setTable(ids, code) {
    for (const id of ids) this.sql.exec('UPDATE users SET table_code = ? WHERE id = ?', code, id);
    return true;
  }
  clearTable(ids, code) {
    for (const id of ids) this.sql.exec('UPDATE users SET table_code = NULL WHERE id = ? AND table_code = ?', id, code);
    return true;
  }
  // players: [{id, team}] komu se hra zapíše, winner: 0 | 1 | -1, rated: jen hry samých lidí,
  // pool: všichni lidé, kteří hru začali (z nich se počítá průměr trofejí týmů)
  recordGame(players, winner, rated, pool) {
    const load = (list) => list.map((p) => ({ ...p, u: this.row('SELECT * FROM users WHERE id = ?', p.id) })).filter((p) => p.u);
    const rows = load(players);
    const base = pool && pool.length ? load(pool) : rows;
    const avg = (t) => {
      const r = base.filter((p) => p.team === t);
      return r.length ? r.reduce((s, p) => s + p.u.rating, 0) / r.length : 1000;
    };
    const ra = [avg(0), avg(1)];
    const changes = {};
    for (const p of rows) {
      const won = winner === p.team;
      const lost = winner === 1 - p.team;
      let delta = 0;
      if (rated && winner !== -1) {
        const expected = 1 / (1 + Math.pow(10, (ra[1 - p.team] - ra[p.team]) / 400));
        delta = Math.round(32 * ((won ? 1 : 0) - expected));
      }
      changes[p.id] = delta;
      this.sql.exec('UPDATE users SET games = games + 1, wins = wins + ?, losses = losses + ?, rating = MAX(0, rating + ?) WHERE id = ?',
        won ? 1 : 0, lost ? 1 : 0, delta, p.id);
    }
    return changes;
  }
  async resetPassword(name, password) {
    password = String(password || '');
    if (password.length < 6 || password.length > 100) return { error: M('bad_password') };
    const u = this.row('SELECT * FROM users WHERE name_lc = ?', String(name || '').trim().toLowerCase());
    if (!u) return { error: M('no_such_player') };
    const salt = randomHex(16);
    const hash = await hashPassword(password, salt);
    this.sql.exec('UPDATE users SET salt = ?, hash = ? WHERE id = ?', salt, hash, u.id);
    this.sql.exec('DELETE FROM sessions WHERE user_id = ?', u.id);
    return { ok: true, name: u.name };
  }
}

// ===================================================================== Lobby
export class Lobby extends DurableObject {
  async fetch(req) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const user = { id: Number(req.headers.get('x-user-id')), name: decodeURIComponent(req.headers.get('x-user-name') || '') };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ ...user, status: 'lobby', table: null });
    const pending = ((await this.ctx.storage.get('pending:' + user.id)) || []).filter((i) => Date.now() - i.at < 12 * 3600_000);
    await this.ctx.storage.put('pending:' + user.id, pending);
    for (const inv of pending) safeSend(server, { t: 'invite', inv });
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }
  socketsOf(userId) {
    return this.ctx.getWebSockets().filter((ws) => {
      const a = ws.deserializeAttachment();
      return a && a.id === userId;
    });
  }
  onlineMap() {
    const map = {};
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (!a) continue;
      const prev = map[a.id];
      if (!prev || a.status === 'table') map[a.id] = { status: a.status, table: a.table, name: a.name };
    }
    return map;
  }
  broadcastPresence() {
    const msg = JSON.stringify({ t: 'presence', online: this.onlineMap() });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch (e) { /* zavřený */ }
    }
  }
  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const me = ws.deserializeAttachment();
    if (!me) return;
    if (m.t === 'status') {
      me.status = m.status === 'table' ? 'table' : 'lobby';
      me.table = me.status === 'table' && typeof m.table === 'string' ? m.table.slice(0, 6) : null;
      ws.serializeAttachment(me);
      this.broadcastPresence();
    } else if (m.t === 'invite') {
      const to = Number(m.to);
      if (!to || to === me.id || typeof m.table !== 'string') return;
      const inv = { id: randomHex(8), from: { id: me.id, name: me.name }, table: m.table.slice(0, 6), mode: m.mode === '2v2' ? '2v2' : '1v1', at: Date.now() };
      const targets = this.socketsOf(to);
      if (targets.length) {
        for (const t of targets) safeSend(t, { t: 'invite', inv });
      } else {
        const key = 'pending:' + to;
        const list = ((await this.ctx.storage.get(key)) || []).filter((i) => i.from.id !== me.id || i.table !== inv.table);
        list.push(inv);
        await this.ctx.storage.put(key, list.slice(-10));
      }
      safeSend(ws, { t: 'invite_sent', to, online: targets.length > 0 });
    } else if (m.t === 'invite_answer') {
      const key = 'pending:' + me.id;
      const list = (await this.ctx.storage.get(key)) || [];
      await this.ctx.storage.put(key, list.filter((i) => i.id !== m.id));
      const from = Number(m.from);
      for (const t of this.socketsOf(from)) {
        safeSend(t, { t: 'invite_answer', by: { id: me.id, name: me.name }, accept: !!m.accept, table: String(m.table || '').slice(0, 6) });
      }
    } else if (m.t === 'ping') {
      safeSend(ws, { t: 'pong' });
    }
  }
  async webSocketClose(ws) {
    try { ws.close(); } catch (e) { /* už zavřený */ }
    this.broadcastPresence();
  }
  async webSocketError(ws) {
    this.broadcastPresence();
  }
}

// ===================================================================== Table
export class Table extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.s = null;
    this.lastChat = {};
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get('s')) || null;
    });
  }
  async save() {
    await this.ctx.storage.put('s', this.s);
  }
  async init(code, mode, host) {
    if (this.s) return { ok: false };
    const n = mode === '2v2' ? 4 : 2;
    this.s = {
      code, mode, host: host.id, created: Date.now(), status: 'waiting',
      seats: Array.from({ length: n }, () => null),
      game: null, chat: [], ready: {}, timers: {}, recorded: false, lastResult: null,
    };
    this.s.seats[0] = { kind: 'human', id: host.id, name: host.name, connected: false, botControl: false };
    await this.save();
    return { ok: true };
  }
  info() {
    if (!this.s) return null;
    return { code: this.s.code, mode: this.s.mode, status: this.s.status, seats: this.publicSeats() };
  }
  publicSeats() {
    return this.s.seats.map((x) => (x ? { kind: x.kind, id: x.id || null, name: x.name, level: x.level || null, connected: x.kind === 'bot' ? true : !!x.connected, botControl: !!x.botControl } : null));
  }
  seatOf(userId) {
    return this.s.seats.findIndex((x) => x && x.kind === 'human' && x.id === userId);
  }
  humans() {
    return this.s.seats.filter((x) => x && x.kind === 'human');
  }

  // ---------- spojení ----------
  async fetch(req) {
    if (!this.s) return new Response('table_not_found', { status: 404 });
    const user = { id: Number(req.headers.get('x-user-id')), name: decodeURIComponent(req.headers.get('x-user-name') || '') };
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(user);
    let seat = this.seatOf(user.id);
    if (seat === -1 && this.s.status === 'waiting') {
      seat = this.s.seats.findIndex((x) => x === null);
      if (seat !== -1) {
        this.s.seats[seat] = { kind: 'human', id: user.id, name: user.name, connected: true, botControl: false };
        await this.env_accounts().setTable([user.id], this.s.code);
      }
    }
    if (seat !== -1) {
      const st = this.s.seats[seat];
      st.connected = true;
      st.name = user.name;
      if (st.botControl) {
        st.botControl = false;
        this.sysChat('back', { name: user.name });
      }
      delete this.s.timers['dc' + seat];
    }
    await this.save();
    safeSend(server, { t: 'chatlog', list: this.s.chat });
    this.broadcast();
    await this.reschedule();
    return new Response(null, { status: 101, webSocket: client });
  }
  env_accounts() {
    return this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('main'));
  }
  socketsOf(userId) {
    return this.ctx.getWebSockets().filter((ws) => {
      const a = ws.deserializeAttachment();
      return a && a.id === userId;
    });
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch (e) { /* už zavřený */ }
    await this.onDisconnect(ws);
  }
  async webSocketError(ws) {
    await this.onDisconnect(ws);
  }
  async onDisconnect(ws) {
    const a = ws.deserializeAttachment();
    if (!a || !this.s) return;
    const still = this.socketsOf(a.id).filter((x) => x !== ws && x.readyState === 1);
    if (still.length) return;
    const seat = this.seatOf(a.id);
    if (seat === -1) return;
    this.s.seats[seat].connected = false;
    if (this.s.status === 'playing') this.s.timers['dc' + seat] = Date.now() + (Number(this.env.DC_MS) || DISCONNECT_MS);
    await this.save();
    this.broadcast();
    await this.reschedule();
  }

  // ---------- zprávy ----------
  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const user = ws.deserializeAttachment();
    if (!user || !this.s) return;
    const seat = this.seatOf(user.id);
    const isHost = this.s.host === user.id;
    const err = (k, p) => safeSend(ws, { t: 'error', error: typeof k === 'object' ? k : M(k, p) });
    const s = this.s;

    switch (m.t) {
      case 'sit': {
        const to = Number(m.seat);
        if (s.status !== 'waiting' || !(to >= 0 && to < s.seats.length) || s.seats[to] !== null) return err('seat_taken');
        if (seat !== -1) { s.seats[to] = s.seats[seat]; s.seats[seat] = null; } else {
          s.seats[to] = { kind: 'human', id: user.id, name: user.name, connected: true, botControl: false };
          await this.env_accounts().setTable([user.id], s.code);
        }
        break;
      }
      case 'bot': {
        const to = Number(m.seat);
        if (!isHost || s.status !== 'waiting') return err('only_host');
        if (!(to >= 0 && to < s.seats.length) || s.seats[to] !== null) return err('seat_taken');
        const used = new Set(s.seats.filter(Boolean).map((x) => x.name));
        const name = BOT_NAMES.find((n) => !used.has(n)) || 'Robot';
        s.seats[to] = { kind: 'bot', name, level: LEVELS.includes(m.level) ? m.level : 'medium' };
        break;
      }
      case 'kick': {
        const at = Number(m.seat);
        if (!isHost || s.status !== 'waiting') return err('only_host');
        const x = s.seats[at];
        if (!x || (x.kind === 'human' && x.id === s.host)) return;
        if (x.kind === 'human') {
          await this.env_accounts().clearTable([x.id], s.code);
          for (const k of this.socketsOf(x.id)) safeSend(k, { t: 'kicked' });
        }
        s.seats[at] = null;
        break;
      }
      case 'start': {
        if (!isHost) return err('only_host');
        if (s.status !== 'waiting') return;
        if (s.seats.some((x) => x === null)) return err('seats_empty');
        this.startGame();
        await this.env_accounts().setTable(this.humans().map((x) => x.id), s.code);
        break;
      }
      case 'rematch': {
        if (!isHost) return err('only_host');
        if (s.status !== 'finished') return;
        this.startGame();
        await this.env_accounts().setTable(this.humans().map((x) => x.id), s.code);
        break;
      }
      case 'act': {
        if (s.status !== 'playing' || seat === -1) return;
        const r = this.applyAction(seat, m.a || {});
        if (!r.ok) return err(r.error || M('server_error'));
        this.afterGameChange();
        break;
      }
      case 'next': {
        if (s.status !== 'playing' || seat === -1 || s.game.phase !== 'roundOver') return;
        s.ready[seat] = true;
        this.maybeNextRound();
        break;
      }
      case 'leave': {
        if (seat === -1) return;
        const x = s.seats[seat];
        let forfeit = null;
        await this.env_accounts().clearTable([x.id], s.code);
        if (s.status === 'waiting') {
          if (x.id === s.host) {
            // hostitel odchází: předá stůl dalšímu člověku
            s.seats[seat] = null;
            const next = this.humans()[0];
            if (next) s.host = next.id;
          } else s.seats[seat] = null;
        } else if (s.status === 'playing') {
          // odchod z rozehrané hry = prohra; zapíše se hned, robot dohraje za něj
          const team = seat % 2;
          const changes = await this.env_accounts().recordGame([{ id: x.id, team }], 1 - team, !!s.rated, s.pool);
          forfeit = { rated: !!s.rated, delta: changes[x.id] || 0 };
          s.seats[seat] = { kind: 'bot', name: x.name + ' (robot)', level: 'medium', left: x.id };
          if (s.game) s.game.players[seat].name = s.seats[seat].name;
          this.sysChat('left', { name: x.name });
          if (x.id === s.host) { const next = this.humans()[0]; if (next) s.host = next.id; }
          if (!this.humans().length) {
            // u stolu už nezůstal nikdo: hru ukončit, ať roboti nehrají sami pro sebe
            s.status = 'finished';
            s.recorded = true;
            s.timers = {};
          } else if (s.game && s.game.phase === 'roundOver') {
            s.ready[seat] = true;
            this.maybeNextRound();
          }
        }
        safeSend(ws, { t: 'left', forfeit });
        break;
      }
      case 'chat': {
        const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
        if (!text) return;
        const now = Date.now();
        if (now - (this.lastChat[user.id] || 0) < 600) return err('chat_slow');
        this.lastChat[user.id] = now;
        this.pushChat({ kind: 'msg', seat, name: user.name, text, at: now });
        await this.save();
        return;
      }
      case 'emote': {
        if (!EMOTES.includes(m.id)) return;
        const now = Date.now();
        if (now - (this.lastChat[user.id] || 0) < 600) return err('chat_slow');
        this.lastChat[user.id] = now;
        this.pushChat({ kind: 'emote', seat, name: user.name, id: m.id, at: now });
        await this.save();
        return;
      }
      default:
        return;
    }
    await this.save();
    this.broadcast();
    await this.reschedule();
  }

  pushChat(entry) {
    this.s.chat.push(entry);
    if (this.s.chat.length > 120) this.s.chat.splice(0, this.s.chat.length - 120);
    const msg = JSON.stringify({ t: 'chat', m: entry });
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(msg); } catch (e) { /* zavřený */ } }
  }
  sysChat(k, p) {
    this.pushChat({ kind: 'sys', k, p: p || {}, at: Date.now() });
  }

  // ---------- hra ----------
  startGame() {
    const s = this.s;
    s.game = E.newGame(s.seats.map((x) => ({ name: x.name, isBot: x.kind === 'bot' })));
    E.startRound(s.game);
    s.status = 'playing';
    s.ready = {};
    s.recorded = false;
    s.lastResult = null;
    s.rated = s.seats.every((x) => x.kind === 'human');
    s.pool = s.seats.map((x, i) => ({ x, i })).filter(({ x }) => x.kind === 'human').map(({ x, i }) => ({ id: x.id, team: i % 2 }));
    for (const x of s.seats) if (x.kind === 'human') x.botControl = false;
  }
  isBotSeat(i) {
    const x = this.s.seats[i];
    return x && (x.kind === 'bot' || x.botControl);
  }
  levelOf(i) {
    const x = this.s.seats[i];
    return x.kind === 'bot' ? x.level : 'medium';
  }
  applyAction(seat, a) {
    const g = this.s.game;
    if (g.current !== seat) return { ok: false, error: M('not_your_turn') };
    const ids = Array.isArray(a.ids) ? a.ids.map(Number).slice(0, 40) : [];
    const prefer = a.prefer === 'low' || a.prefer === 'high' ? a.prefer : undefined;
    const meldId = a.meldId == null ? null : Number(a.meldId);
    switch (a.type) {
      case 'draw': return E.drawStock(g, seat);
      case 'pile': return E.takePile(g, seat, ids, meldId, prefer);
      case 'pass': return E.passEnd(g, seat);
      case 'meld': return E.meldNew(g, seat, ids, prefer);
      case 'add': return E.addToMeld(g, seat, meldId, ids, prefer);
      case 'discard': return E.discard(g, seat, Number(a.id));
      case 'undo': return E.undoTurn(g, seat);
      default: return { ok: false, error: M('bad_request') };
    }
  }
  afterGameChange() {
    const s = this.s;
    const g = s.game;
    if (g.phase === 'roundOver' || g.phase === 'gameOver') {
      s.ready = {};
      s.seats.forEach((x, i) => { if (this.isBotSeat(i) || !x.connected) s.ready[i] = true; });
    }
    if (g.phase === 'gameOver' && !s.recorded) {
      s.recorded = true;
      s.status = 'finished';
      const players = s.seats.map((x, i) => ({ x, i })).filter(({ x }) => x.kind === 'human').map(({ x, i }) => ({ id: x.id, team: i % 2 }));
      s.pendingRecord = { players, winner: g.winner, rated: !!s.rated, pool: s.pool };
    }
  }
  maybeNextRound() {
    const s = this.s;
    if (s.game.phase !== 'roundOver') return;
    const all = s.seats.every((x, i) => s.ready[i] || this.isBotSeat(i) || !x.connected);
    if (all) {
      E.startRound(s.game);
      s.ready = {};
    }
  }

  // ---------- časovače (roboti, odpojení) ----------
  async reschedule() {
    const s = this.s;
    if (!s) return;
    if (s.pendingRecord) {
      const pr = s.pendingRecord;
      s.pendingRecord = null;
      const changes = await this.env_accounts().recordGame(pr.players, pr.winner, pr.rated, pr.pool);
      s.lastResult = { winner: pr.winner, rated: pr.rated, changes };
      await this.env_accounts().clearTable(pr.players.map((p) => p.id), s.code);
      await this.save();
      this.broadcast();
    }
    if (s.status === 'playing' && s.game && (s.game.phase === 'draw' || s.game.phase === 'play') && this.isBotSeat(s.game.current)) {
      s.timers.bot = s.timers.bot || Date.now() + (Number(this.env.BOT_DELAY_MS) || BOT_DELAY_MS);
    } else {
      delete s.timers.bot;
    }
    const due = Object.values(s.timers).filter(Boolean);
    if (due.length) await this.ctx.storage.setAlarm(Math.min(...due));
    else await this.ctx.storage.deleteAlarm();
    await this.save();
  }
  async alarm() {
    const s = this.s;
    if (!s) return;
    const now = Date.now();
    let changed = false;
    for (const k of Object.keys(s.timers)) {
      if (!k.startsWith('dc') || s.timers[k] > now) continue;
      delete s.timers[k];
      const i = Number(k.slice(2));
      const x = s.seats[i];
      if (x && x.kind === 'human' && !x.connected && s.status === 'playing') {
        x.botControl = true;
        this.sysChat('takeover', { name: x.name });
        if (s.game.phase === 'roundOver') { s.ready[i] = true; this.maybeNextRound(); }
        changed = true;
      }
    }
    if (s.timers.bot && s.timers.bot <= now) {
      delete s.timers.bot;
      const g = s.game;
      if (s.status === 'playing' && (g.phase === 'draw' || g.phase === 'play') && this.isBotSeat(g.current)) {
        const r = B.step(g, g.current, this.levelOf(g.current));
        if (!r.ok) this.emergency(g, g.current);
        this.afterGameChange();
        changed = true;
      }
    }
    if (changed) {
      await this.save();
      this.broadcast();
    }
    await this.reschedule();
  }
  emergency(g, pi) {
    if (g.phase === 'draw') {
      if (g.stock.length) E.drawStock(g, pi); else E.passEnd(g, pi);
      return;
    }
    if (g.phase === 'play') {
      for (const c of g.players[pi].hand) if (!E.discardError(g, pi, c.id)) { E.discard(g, pi, c.id); return; }
      E.undoTurn(g, pi);
    }
  }

  // ---------- co kdo vidí ----------
  gameView(seat) {
    const g = this.s.game;
    if (!g) return null;
    const t = g.turn || {};
    return {
      players: g.players.map((p, i) => ({ name: p.name, team: p.team, isBot: this.isBotSeat(i), handCount: p.hand.length, hand: i === seat ? p.hand : null })),
      teams: g.teams,
      pile: g.pile,
      stockCount: g.stock.length,
      current: g.current,
      dealer: g.dealer,
      phase: g.phase,
      round: g.round,
      nextMeldId: g.nextMeldId,
      log: g.log.slice(-40),
      lastRound: g.lastRound,
      winner: g.winner,
      turn: {
        from: t.from || null,
        laid: t.laid || 0,
        mustMeld: t.mustMeld == null ? null : t.mustMeld,
        pileForbidden: !!t.pileForbidden,
        lastTurn: !!t.lastTurn,
        canUndo: !!t.snap && g.current === seat,
        newIds: g.current === seat ? t.newIds || [] : [],
      },
    };
  }
  viewFor(userId) {
    const s = this.s;
    const seat = this.seatOf(userId);
    return {
      code: s.code, mode: s.mode, host: s.host, status: s.status,
      me: { id: userId, seat },
      seats: this.publicSeats(),
      ready: s.ready,
      rated: !!s.rated,
      lastResult: s.lastResult,
      game: this.gameView(seat),
    };
  }
  broadcast() {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (!a) continue;
      try { safeSend(ws, { t: 'state', s: this.viewFor(a.id) }); } catch (e) { /* zavřený */ }
    }
  }
}
