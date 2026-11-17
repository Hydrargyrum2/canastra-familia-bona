(function () {
  'use strict';
  const E = window.Engine;
  const B = window.Bot;
  const { DICT, LOCALE, LANGS } = window.I18N;
  const SAVE_KEY = 'brazilska-kanasta-v1';
  const PREF_KEY = 'brazilska-kanasta-nastaveni';
  const TOKEN_KEY = 'canastra-bona-token';
  const SITE_URL = 'https://canastra-familia-bona.faldik2033.workers.dev';
  const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 };
  const LEVELS = ['easy', 'medium', 'hard'];
  const EMOTES = [
    { id: 'hi', e: '👋' }, { id: 'laugh', e: '😂' }, { id: 'slow', e: '🐌' }, { id: 'sleep', e: '😴' },
    { id: 'luck', e: '🍀' }, { id: 'clown', e: '🤡' }, { id: 'fire', e: '🔥' }, { id: 'joker', e: '🃏' },
    { id: 'black3', e: '🚫' }, { id: 'cry', e: '😭' }, { id: 'cool', e: '😎' }, { id: 'gg', e: '🤝' },
    { id: 'tomato', e: '🍅', throw: true },
  ];
  const $ = (s) => document.querySelector(s);

  let ME = 0;
  let st = null;
  let mode = '1v1';
  let overlay = null; // start | menu | rules | settings | pile | log | round | wild | auth | online | room
  let prevOverlay = null;
  const sel = new Set();
  let botTimer = null;
  let toastTimer = null;
  let botFails = 0;
  let prefs = { lang: detectLang(), level: 'hard' };
  let pending = null; // vykládka čekající na volbu, kam dát žolíka
  let stash = null; // rozehraná hra proti robotům, když jsem u online stolu

  // Online stav
  const net = {
    available: false, token: null, user: null,
    lobby: null, lobbyRetry: 0, onlineMap: {},
    code: null, tws: null, view: null, wantTable: false, tableRetry: 0,
    chat: [], chatOpen: false, unread: 0, emoteOpen: false,
    invites: [], players: [], leaders: [], tab: 'players', search: '',
    authTab: 'login', authErr: '', joinErr: '', adminMsg: '', invited: {}, joinAfterLogin: null,
  };

  // ---------- jazyk ----------
  function detectLang() {
    const l = ((navigator.languages && navigator.languages[0]) || navigator.language || 'cs').toLowerCase();
    if (l.startsWith('pt')) return 'pt';
    if (l.startsWith('cs') || l.startsWith('sk')) return 'cs';
    return 'en';
  }
  const D = () => DICT[prefs.lang] || DICT.cs;
  function fill(s, p) {
    if (typeof s === 'function') return s(p || {});
    return String(s).replace(/\{(\w+)\}/g, (_, x) => (p && p[x] != null ? p[x] : ''));
  }
  function t(k, p) {
    const s = D()[k] != null ? D()[k] : DICT.cs[k] != null ? DICT.cs[k] : k;
    return fill(s, p);
  }
  function nameOf(pi) { return pi === ME ? D().you_name : st.players[pi].name; }
  function cardLabel(c) { return c.r === 'JK' ? D().joker : c.r + E.SUIT_SYM[c.s]; }
  // Zpráva z enginu nebo serveru ({k, p}) nebo starý text.
  function tr(m) {
    if (!m) return '';
    if (typeof m === 'string') return m;
    const p = Object.assign({}, m.p);
    let k = m.k;
    if (p.pi != null && st) {
      if (p.pi === ME && D()[k + '_you'] != null) k += '_you';
      p.name = nameOf(p.pi);
    }
    if (p.card) p.card = cardLabel(p.card);
    return t(k, p);
  }
  const fmt = (n) => Number(n || 0).toLocaleString(LOCALE[prefs.lang] || 'cs-CZ');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
      if (p && LANGS.includes(p.lang)) prefs.lang = p.lang;
      if (p && LEVELS.includes(p.level)) prefs.level = p.level;
    } catch (e) { /* bez úložiště */ }
  }
  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* bez úložiště */ }
  }
  function applyLang() {
    document.documentElement.lang = prefs.lang === 'pt' ? 'pt-BR' : prefs.lang;
    document.title = D().title;
  }

  // ---------- pomocné ----------
  function sortKey(c) {
    if (E.isThree(c)) return -100 + SUIT_ORDER[c.s];
    if (E.isWild(c)) return 1000 + (c.r === 'JK' ? 10 : SUIT_ORDER[c.s]);
    return SUIT_ORDER[c.s] * 20 + E.pos(c);
  }
  const sortHand = (h) => h.slice().sort((a, b) => sortKey(a) - sortKey(b) || a.id - b.id);

  function cardFace(c, style) {
    const st2 = style ? ` style="${style}"` : '';
    if (c.r === 'JK') {
      return `<span class="card joker"${st2} aria-label="Joker"><span class="cr">★</span><span class="jk">JOKER</span></span>`;
    }
    const red = c.s === 'H' || c.s === 'D';
    const s = E.SUIT_SYM[c.s];
    const wild = c.r === '2' ? ' wild' : '';
    return `<span class="card ${red ? 'red' : ''}${wild}"${st2} aria-label="${c.r}${s}"><span class="cr">${c.r}<i>${s}</i></span><span class="cs">${s}</span></span>`;
  }
  const backFace = () => '<span class="card back"></span>';

  const online = () => !!net.code;
  const US = () => (st && st.players[ME] ? st.players[ME].team : 0);
  const THEM = () => 1 - US();
  const handLen = (p) => (p.hand ? p.hand.length : p.handCount || 0);

  function teamName(ti) {
    if (mode === '2v2') return ti === US() ? D().team_us : D().team_them;
    if (ti === US()) return D().you_name;
    const p = st.players.find((x) => x.team === ti);
    return p ? p.name : '';
  }
  const myTurn = () => st && st.current === ME && (st.phase === 'draw' || st.phase === 'play') && (!online() || (net.view && net.view.me.seat === ME));

  // ---------- hra proti robotům ----------
  function newMatch(m) {
    leaveTable(true);
    mode = m;
    ME = 0;
    const players = m === '2v2'
      ? [{ name: 'Ty' }, { name: 'Caio', isBot: true }, { name: 'Bia', isBot: true }, { name: 'Duda', isBot: true }]
      : [{ name: 'Ty' }, { name: 'Caio', isBot: true }];
    st = E.newGame(players);
    E.startRound(st);
    sel.clear();
    botFails = 0;
  }
  function save() {
    if (online()) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ st, mode })); } catch (e) { /* bez úložiště */ }
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
  }

  // ---------- online: stav ze serveru ----------
  function waitingState(view) {
    const g = E.newGame(view.seats.map((x, i) => ({ name: x ? x.name : '—', isBot: x && x.kind === 'bot' })));
    g.phase = 'waiting';
    g.stock = { length: 108 };
    g.players.forEach((p) => { p.hand = []; });
    return g;
  }
  function syncFromNet() {
    const v = net.view;
    if (!v) return;
    mode = v.mode;
    ME = Math.max(0, v.me.seat);
    if (!v.game) { st = waitingState(v); return; }
    const g = v.game;
    st = Object.assign({}, g, {
      stock: { length: g.stockCount },
      players: g.players.map((p) => Object.assign({}, p, { hand: p.hand || { length: p.handCount } })),
    });
  }

  // ---------- vykreslení stolu ----------
  function scoreHTML() {
    const s0 = st.teams[US()].score;
    const s1 = st.teams[THEM()].score;
    const w = (s) => Math.min(100, (s / E.RULES.target) * 100).toFixed(1);
    return `
      <div class="side us"><span class="tn">${esc(teamName(US()))}</span><span class="pts">${fmt(s0)}</span><span class="bar"><i style="width:${w(s0)}%"></i><b></b></span></div>
      <div class="mid"><span class="goal">${esc(t('goal', { n: String(E.RULES.target) }))}</span><span class="rd">${online() ? esc(t('table_code', { code: net.code })) : esc(t('round', { n: st.round }))}</span></div>
      <div class="side them"><span class="tn">${esc(teamName(THEM()))}</span><span class="pts">${fmt(s1)}</span><span class="bar"><i style="width:${w(s1)}%"></i><b></b></span></div>
      <button class="iconbtn" data-act="menu" aria-label="${esc(t('menu'))}">☰</button>`;
  }

  function arcHTML(n, max) {
    const k = Math.min(n, max);
    let out = '';
    for (let i = 0; i < k; i++) {
      const x = k === 1 ? 0 : (i / (k - 1)) * 2 - 1;
      out += `<span class="bk" style="--r:${(x * 16).toFixed(1)}deg;--y:${(x * x * 7).toFixed(1)}px"></span>`;
    }
    return `<span class="arc" aria-hidden="true">${out}</span>`;
  }
  const playing = (i) => st.current === i && (st.phase === 'draw' || st.phase === 'play');
  function seatTag(i, partner) {
    const p = st.players[i];
    if (online() && net.view) {
      const s = net.view.seats[i];
      if (s && s.kind === 'human') {
        if (s.botControl) return t('bot_playing');
        if (!s.connected) return t('disconnected');
        return partner ? t('partner_tag') : t('opp_tag');
      }
    }
    return p.isBot ? t(partner ? 'bot_tag_partner' : 'bot_tag_opp') : t(partner ? 'partner_tag' : 'opp_tag');
  }

  function oppSeatHTML() {
    const opps = st.players.map((p, i) => i).filter((i) => st.players[i].team !== US());
    const small = opps.length > 1;
    return opps.map((i) => {
      const p = st.players[i];
      return `<div class="seat ${small ? 'small' : ''} ${playing(i) ? 'turn' : ''}" data-seat="${i}">
        ${arcHTML(handLen(p), small ? 9 : 13)}
        <div class="who"><span class="nm">${esc(p.name)}</span><span class="tag">${esc(seatTag(i, false))}</span><span class="cnt">${handLen(p)}</span></div>
      </div>`;
    }).join('');
  }
  function partnerHTML() {
    return st.players.map((p, i) => ({ p, i })).filter((x) => x.i !== ME && x.p.team === US())
      .map(({ p, i }) => `<span class="partner ${playing(i) ? 'turn' : ''}" data-seat="${i}">${arcHTML(handLen(p), 7)}<span title="${esc(seatTag(i, true))}">${esc(p.name)} · ${handLen(p)}</span></span>`).join('');
  }

  function meldsHTML(ti, targetable) {
    const team = st.teams[ti];
    const red3 = team.red3.length
      ? `<span class="r3">♥3 × ${team.red3.length}${E.hasCanasta(team) ? '' : esc(t('red3_zero'))}</span>` : '';
    const open = E.needsOpen(team) ? `<span class="badge">${esc(t('needs_open', { min: E.RULES.openMin }))}</span>` : '';
    const melds = team.melds.slice().sort((a, b) => (a.type === b.type ? a.id - b.id : a.type === 'set' ? -1 : 1));
    const body = melds.length ? melds.map((m) => {
      const can = E.isCanasta(m);
      const cls = can ? (E.isClean(m) ? 'clean' : 'dirty') : '';
      const label = can ? (E.isClean(m) ? t('clean_can') : t('dirty_can')) : (m.type === 'set' ? t('meld_set') : t('meld_seq'));
      const inner = E.meldOrder(m).map((c) => cardFace(c)).join('') + `<span class="mc">${m.cards.length}</span>`;
      return targetable
        ? `<button class="meld ${cls} target" data-meld="${m.id}" aria-label="${esc(t('add_to', { label, n: m.cards.length }))}">${inner}</button>`
        : `<div class="meld ${cls}" aria-label="${esc(label)}">${inner}</div>`;
    }).join('') : `<p class="empty">${esc(t('none_yet'))}</p>`;
    const mine = ti === US();
    const title = mine ? (mode === '2v2' ? t('melds_ours') : t('melds_mine')) : t('melds_of', { name: teamName(ti) });
    const head = `<div class="mhead"><span>${esc(title)}</span>${red3}<span class="grow"></span>${open}${mine ? partnerHTML() : ''}</div>`;
    return `${head}<div class="mrow">${body}</div>`;
  }

  function centerHTML() {
    const mine = myTurn() && st.phase === 'draw';
    const canDraw = mine && st.stock.length > 0;
    const pileErr = mine ? E.pileError(st, ME) : true;
    const top = st.pile[st.pile.length - 1];
    const blocked = top && E.blocksPile(top);
    return `
      <button class="stack ${canDraw ? 'ready' : ''}" data-act="draw" ${canDraw ? '' : 'disabled'} aria-label="${esc(t('stock'))} ${st.stock.length}">
        <span class="slot">${st.stock.length ? backFace() : '<span class="emptyslot"></span>'}<span class="n">${st.stock.length}</span></span>
        <span class="lbl">${esc(t('stock'))}</span>
      </button>
      <button class="stack ${!pileErr ? 'ready' : ''} ${blocked ? 'blocked' : ''}" data-act="pile" ${mine ? '' : 'disabled'} aria-label="${esc(t('pile'))} ${st.pile.length}">
        <span class="slot" data-blocked="${esc(t('blocked'))}">${top ? cardFace(top) : '<span class="emptyslot"></span>'}<span class="n">${st.pile.length}</span></span>
        <span class="lbl">${esc(t('pile'))}</span>
      </button>
      <div class="side-links">
        <button class="linkbtn" data-act="showpile">${esc(t('whole_pile'))}</button>
        <button class="linkbtn" data-act="log">${esc(t('what_happened'))}</button>
        <button class="linkbtn" data-act="rules">${esc(t('rules'))}</button>
      </div>
      <div class="announce">${st.log.length ? esc(tr(st.log[st.log.length - 1])) : ''}</div>`;
  }

  function statusHTML() {
    let hint = '';
    if (st.phase === 'waiting') hint = esc(t('room_waiting'));
    else if (st.phase === 'roundOver' || st.phase === 'gameOver') hint = esc(t('round_over_short'));
    else if (!myTurn()) hint = `<span class="dots">${esc(t('playing', { name: nameOf(st.current) }))}</span>`;
    else if (st.phase === 'draw') {
      const canPile = !E.pileError(st, ME);
      const parts = st.stock.length ? [t('hint_draw')] : [t('hint_stock_out')];
      if (canPile) parts.push(t('hint_pile_how'));
      if (!st.stock.length && canPile) parts.push(t('hint_else_end'));
      hint = esc(parts.join(' '));
    } else {
      hint = esc(sel.size ? t('hint_sel') : t('hint_play'));
      if (E.needsOpen(st.teams[US()])) {
        hint += ` <span class="badge">${esc(t('open_badge', { v: st.turn.laid, min: E.RULES.openMin }))}</span>`;
      }
    }
    return `<span class="hint">${hint}</span>`;
  }

  function myHand() {
    const h = st.players[ME] && st.players[ME].hand;
    return Array.isArray(h) ? h : [];
  }
  function handHTML() {
    const mineNow = st.current === ME;
    const newIds = mineNow && st.turn ? st.turn.newIds || [] : [];
    return sortHand(myHand()).map((c) => {
      const cls = [sel.has(c.id) ? 'sel' : '', newIds.includes(c.id) ? 'new' : ''].join(' ');
      return `<button class="hc ${cls}" data-card="${c.id}" aria-pressed="${sel.has(c.id)}">${cardFace(c)}</button>`;
    }).join('');
  }
  function handHeadHTML() {
    const h = myHand();
    const val = sel.size ? h.filter((c) => sel.has(c.id)).reduce((s, c) => s + E.cardValue(c), 0) : 0;
    return `<span>${esc(t('your_cards', { n: h.length }))}</span><span class="grow"></span>${sel.size ? `<span>${esc(t('selected', { n: sel.size, v: val }))}</span> <button class="linkbtn" data-act="clearsel">${esc(t('clear'))}</button>` : ''}`;
  }

  function actionsHTML() {
    if (st.phase === 'waiting') return `<button class="btn primary" data-act="openroom">${esc(t('room_open'))}</button>`;
    if (st.phase === 'roundOver' || st.phase === 'gameOver') {
      return `<button class="btn primary" data-act="openround">${esc(t(st.phase === 'gameOver' ? 'btn_result_game' : 'btn_result_round'))}</button>`;
    }
    if (!myTurn()) return `<div class="wait"><span class="dots">${esc(t('playing', { name: nameOf(st.current) }))}</span></div>`;
    if (st.phase === 'draw') {
      const pileErr = E.pileError(st, ME);
      if (!st.stock.length) {
        return `<button class="btn primary" data-act="pile" ${pileErr ? 'disabled' : ''}>${esc(t('btn_take_pile'))}</button>
          <button class="btn" data-act="pass">${esc(t('btn_end_round'))}</button>`;
      }
      return `<button class="btn primary" data-act="draw">${esc(t('btn_draw'))}</button>
        <button class="btn" data-act="pile">${esc(t('btn_take_pile'))}</button>`;
    }
    const canUndo = (st.turn.snap || st.turn.canUndo) && (st.turn.from === 'pile' || st.turn.laid > 0);
    return `<button class="btn ${sel.size >= 3 ? 'primary' : ''}" data-act="meld" ${sel.size >= 3 ? '' : 'disabled'}>${esc(t('btn_meld'))}</button>
      <button class="btn ${sel.size === 1 ? 'primary' : ''}" data-act="discard" ${sel.size === 1 ? '' : 'disabled'}>${esc(t('btn_discard'))}</button>
      <button class="btn" data-act="undo" ${canUndo ? '' : 'disabled'}>${esc(t('btn_undo'))}</button>`;
  }

  // ---------- překryvná okna ----------
  function langButtons() {
    return `<div class="seg" role="group" aria-label="${esc(t('settings_lang'))}">${LANGS.map((l) =>
      `<button class="segbtn ${prefs.lang === l ? 'on' : ''}" data-act="lang" data-v="${l}" aria-pressed="${prefs.lang === l}" lang="${l === 'pt' ? 'pt-BR' : l}">${esc(DICT[l].lang_name)}</button>`).join('')}</div>`;
  }
  function levelButtons() {
    return `<div class="seg" role="group" aria-label="${esc(t('settings_level'))}">${LEVELS.map((l) =>
      `<button class="segbtn ${prefs.level === l ? 'on' : ''}" data-act="level" data-v="${l}" aria-pressed="${prefs.level === l}">${esc(t('level_' + l))}</button>`).join('')}</div>
      <p class="seghint">${esc(t('level_' + prefs.level + '_hint'))}</p>`;
  }
  function settingsHTML() {
    return `<h2>${esc(t('settings'))}</h2>
      <h3>${esc(t('settings_lang'))}</h3>
      ${langButtons()}
      <h3>${esc(t('settings_level'))}</h3>
      ${levelButtons()}
      <div class="stackbtns"><button class="btn primary" data-act="back">${esc(t('done'))}</button></div>`;
  }

  function roundHTML() {
    const lr = st.lastRound;
    if (!lr) return '';
    const u = US();
    const th = THEM();
    const t0 = lr.teams[u];
    const t1 = lr.teams[th];
    let title;
    if (lr.closer == null) title = t('res_stock_out');
    else if (lr.closer === u) title = t(mode === '2v2' ? 'out_us' : 'out_me');
    else title = mode === '2v2' ? t('out_opps') : t('out_opp', { name: teamName(th) });
    const row = (label, a, b, cls) => `<tr class="${cls || ''}"><td>${esc(label)}</td><td>${a}</td><td>${b}</td></tr>`;
    let head;
    if (st.phase === 'gameOver') {
      let win;
      if (st.winner === -1) win = t('draw_game');
      else if (st.winner === u) win = t(mode === '2v2' ? 'win_us' : 'win_me');
      else win = mode === '2v2' ? t('win_opps') : t('win_opp', { name: teamName(th) });
      head = `<h2 class="title-xl">${esc(win)}</h2><p>${esc(title)}. ${esc(t('final_score', { a: fmt(st.teams[u].score), b: fmt(st.teams[th].score) }))}</p>`;
      if (online() && net.view) {
        const lres = net.view.lastResult;
        const myId = net.user && net.user.id;
        if (lres && lres.rated && lres.changes && myId != null && lres.changes[myId] != null) {
          const d = lres.changes[myId];
          head += `<p class="badge big">${esc(t('trophy_change', { d: (d > 0 ? '+' : '') + d }))}</p>`;
        } else if (net.view.rated === false) {
          head += `<p class="seghint">${esc(t('not_rated'))}</p>`;
        }
      }
    } else {
      head = `<h2>${esc(title)}</h2><p>${esc(t(lr.closer == null ? 'res_stock_out_lead' : 'res_out_lead'))}</p>`;
    }
    let buttons;
    if (online()) {
      const v = net.view;
      const isHost = net.user && v.host === net.user.id;
      if (st.phase === 'gameOver') {
        buttons = (isHost ? `<button class="btn primary" data-act="rematch">${esc(t('rematch'))}</button>` : `<p class="seghint">${esc(t('rematch_wait'))}</p>`) +
          `<button class="btn" data-act="leavetable">${esc(t('back_lobby'))}</button>`;
      } else {
        const humans = v.seats.map((x, i) => ({ x, i })).filter(({ x }) => x && x.kind === 'human' && x.connected && !x.botControl);
        const ready = humans.filter(({ i }) => v.ready[i]).length;
        buttons = v.ready[ME]
          ? `<p class="seghint">${esc(t('wait_others', { n: ready, m: humans.length }))}</p><button class="btn" data-act="close">${esc(t('look_table'))}</button>`
          : `<button class="btn primary" data-act="nextround">${esc(t('next_round'))}</button><button class="btn" data-act="close">${esc(t('look_table'))}</button>`;
      }
    } else {
      buttons = st.phase === 'gameOver'
        ? `<button class="btn primary" data-act="new1">${esc(t('new1'))}</button><button class="btn" data-act="new2">${esc(t('new2'))}</button>`
        : `<button class="btn primary" data-act="nextround">${esc(t('next_round'))}</button><button class="btn" data-act="close">${esc(t('look_table'))}</button>`;
    }
    return `${head}
      <table class="res">
        <thead><tr><th></th><th>${esc(teamName(u))}</th><th>${esc(teamName(th))}</th></tr></thead>
        <tbody>
          ${row(t('row_cards'), fmt(t0.cardsPts), fmt(t1.cardsPts))}
          ${row(t('row_canastas', { a: t0.canastas, b: t1.canastas }), fmt(t0.canastaPts), fmt(t1.canastaPts))}
          ${row(t('row_red3', { a: t0.red3, b: t1.red3 }), fmt(t0.red3Pts), fmt(t1.red3Pts))}
          ${row(t('row_capture'), fmt(t0.capturePts), fmt(t1.capturePts))}
          ${row(t('row_round'), fmt(t0.total), fmt(t1.total), 'sum')}
          ${row(t('row_total'), fmt(st.teams[u].score), fmt(st.teams[th].score), 'tot')}
        </tbody>
      </table>
      <div class="stackbtns">${buttons}</div>`;
  }

  function startHTML() {
    const fanCards = [{ r: 'K', s: 'S' }, { r: 'A', s: 'H' }, { r: '4', s: 'D' }, { r: '2', s: 'C' }, { r: 'JK', s: null }];
    const rots = [-14, -7, 0, 7, 14];
    const onlineBtn = net.available
      ? `<button class="btn online" data-act="goonline">${esc(net.user ? t('online_btn_user', { name: net.user.name }) : t('online_btn'))}</button>`
      : `<p class="seghint">${esc(t('online_unavailable'))} <a href="${SITE_URL}" target="_blank" rel="noopener">${SITE_URL.replace('https://', '')}</a></p>`;
    return `
      ${langButtons()}
      <div class="hero-cards" aria-hidden="true">${fanCards.map((c, i) => cardFace(c, `--rot:${rots[i]}deg`)).join('')}</div>
      <h2 class="title-xl">${esc(t('title'))}</h2>
      <p>${esc(t('start_lead'))}</p>
      ${onlineBtn}
      <h3>${esc(t('vs_bots'))}</h3>
      ${levelButtons()}
      <div class="stackbtns">
        <button class="btn primary" data-act="new1">${esc(t('start_1v1'))}</button>
        <button class="btn" data-act="new2">${esc(t('start_2v2'))}</button>
        <button class="linkbtn" data-act="rules">${esc(t('read_rules'))}</button>
      </div>`;
  }

  function leaveAskHTML() {
    const rated = net.view && net.view.rated;
    return `<h2>${esc(t('leave_ask_title'))}</h2>
      <p>${esc(t('leave_ask_lead'))}</p>
      <p class="seghint">${esc(t(rated ? 'leave_ask_rated' : 'leave_ask_unrated'))}</p>
      <div class="stackbtns">
        <button class="btn primary" data-act="close">${esc(t('keep_playing'))}</button>
        <button class="btn danger" data-act="leavetable">${esc(t('leave_ask_yes'))}</button>
      </div>`;
  }

  function menuHTML() {
    if (online()) {
      return `
        <h2>${esc(t('menu'))}</h2>
        <div class="stackbtns">
          <button class="btn primary" data-act="close">${esc(t('keep_playing'))}</button>
          <button class="btn" data-act="${net.view && net.view.status === 'playing' && net.view.me.seat !== -1 ? 'leaveask' : 'leavetable'}">${esc(t('leave_table'))}</button>
          <button class="btn" data-act="settings">${esc(t('settings'))}</button>
          <button class="btn" data-act="rules">${esc(t('rules'))}</button>
        </div>`;
    }
    return `
      <h2>${esc(t('menu'))}</h2>
      <div class="stackbtns">
        <button class="btn primary" data-act="close">${esc(t('keep_playing'))}</button>
        ${net.available ? `<button class="btn online" data-act="goonline">${esc(t('online_btn'))}</button>` : ''}
        <button class="btn" data-act="new1">${esc(t('new1'))}</button>
        <button class="btn" data-act="new2">${esc(t('new2'))}</button>
        <button class="btn" data-act="settings">${esc(t('settings'))}</button>
        <button class="btn" data-act="rules">${esc(t('rules'))}</button>
      </div>`;
  }

  function pileHTML() {
    const cards = st.pile.slice().reverse();
    return `<h2>${esc(t('pile_title'))}</h2>
      <p>${esc(cards.length ? t('pile_count', { n: cards.length }) : t('pile_empty_txt'))}</p>
      <div class="pilegrid">${cards.map((c) => cardFace(c)).join('')}</div>
      <div class="stackbtns"><button class="btn" data-act="close">${esc(t('close'))}</button></div>`;
  }
  function logHTML() {
    const lines = st.log.slice(-30).reverse();
    return `<h2>${esc(t('log_title'))}</h2><ul class="logl">${lines.map((l) => `<li>${esc(tr(l))}</li>`).join('')}</ul>
      <div class="stackbtns"><button class="btn" data-act="close">${esc(t('close'))}</button></div>`;
  }
  function wildHTML() {
    if (!pending) return '';
    const as = (p) => ({ r: E.ORDER[p], s: pending.suit });
    const opt = (side, p) => `<button class="pick" data-act="wildpick" data-v="${side}">
        ${cardFace(as(p)).replace('class="card', 'class="card wild')}<span>${esc(t(side === 'low' ? 'wild_low' : 'wild_high', { card: cardLabel(as(p)) }))}</span></button>`;
    return `<h2>${esc(t('wild_title'))}</h2><p>${esc(t('wild_lead'))}</p>
      <div class="picks">${opt('low', pending.choice.low)}${opt('high', pending.choice.high)}</div>
      <div class="stackbtns"><button class="btn" data-act="wildcancel">${esc(t('cancel'))}</button></div>`;
  }

  // ---------- online okna ----------
  function authHTML() {
    const reg = net.authTab === 'register';
    const lead = net.joinAfterLogin ? t('auth_join_lead', { code: net.joinAfterLogin }) : t('auth_lead');
    return `<h2>${esc(reg ? t('register') : t('login'))}</h2>
      <p>${esc(lead)}</p>
      <div class="seg">
        <button class="segbtn ${!reg ? 'on' : ''}" data-act="authtab" data-v="login">${esc(t('login'))}</button>
        <button class="segbtn ${reg ? 'on' : ''}" data-act="authtab" data-v="register">${esc(t('register'))}</button>
      </div>
      <form class="form" id="authForm" autocomplete="on">
        <label for="authName">${esc(t('name_label'))}</label>
        <input id="authName" name="username" autocomplete="username" maxlength="20" required>
        <label for="authPass">${esc(t('pass_label'))}</label>
        <input id="authPass" name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" maxlength="100" required>
        ${reg ? `<p class="seghint">${esc(t('register_hint'))}</p>` : `<p class="seghint">${esc(t('forgot'))}</p>`}
        ${net.authErr ? `<p class="formerr" role="alert">${esc(net.authErr)}</p>` : ''}
        <button class="btn primary" type="submit">${esc(reg ? t('register') : t('login'))}</button>
      </form>
      <div class="stackbtns"><button class="btn" data-act="tostart">${esc(t('back'))}</button></div>`;
  }

  function dot(status) {
    return `<span class="dot ${status}" aria-hidden="true"></span>`;
  }
  function playerRow(p, withInvite) {
    const status = p.id === net.user.id ? 'online' : statusOf(p.id);
    const label = t('status_' + status);
    const inv = net.invited[p.id];
    const btn = withInvite && p.id !== net.user.id
      ? `<button class="mini" data-act="invite" data-v="${p.id}" ${inv ? 'disabled' : ''}>${esc(inv ? t('invited') : t('invite'))}</button>` : '';
    return `<li class="prow">${dot(status)}<span class="pname">${esc(p.name)}${p.id === net.user.id ? ` <em>(${esc(t('you_short'))})</em>` : ''}</span>
      <span class="pmeta">${esc(label)} · 🏆 ${fmt(p.rating)}</span>${btn}</li>`;
  }
  function statusOf(id) {
    const o = net.onlineMap[id];
    return o ? (o.status === 'table' ? 'table' : 'online') : 'offline';
  }
  function playersListHTML(withInvite) {
    const list = net.players.slice().sort((a, b) => {
      const r = { online: 0, table: 1, offline: 2 };
      return r[statusOf(a.id)] - r[statusOf(b.id)] || a.name.localeCompare(b.name);
    });
    return `<input id="playerSearch" class="search" placeholder="${esc(t('search_ph'))}" value="${esc(net.search)}" autocomplete="off">
      <ul class="plist">${list.length ? list.map((p) => playerRow(p, withInvite)).join('') : `<li class="empty">${esc(t('no_players'))}</li>`}</ul>`;
  }
  function leadersHTML() {
    if (!net.leaders.length) return `<p class="empty">${esc(t('leaders_empty'))}</p>`;
    return `<ol class="lead">${net.leaders.map((p, i) => `<li class="${p.id === net.user.id ? 'me' : ''}"><span class="rk">${i + 1}.</span><span class="pname">${esc(p.name)}</span><span class="pmeta">${fmt(p.wins)}/${fmt(p.games)}</span><b>🏆 ${fmt(p.rating)}</b></li>`).join('')}</ol>`;
  }
  function onlineHTML() {
    const u = net.user;
    const tab = net.tab;
    const admin = u.admin ? `<details class="admin"><summary>${esc(t('admin_title'))}</summary>
        <form class="form" id="adminForm"><label for="admName">${esc(t('name_label'))}</label><input id="admName" required>
        <label for="admPass">${esc(t('admin_newpass'))}</label><input id="admPass" required minlength="6">
        ${net.adminMsg ? `<p class="seghint">${esc(net.adminMsg)}</p>` : ''}
        <button class="btn" type="submit">${esc(t('admin_reset'))}</button></form></details>` : '';
    return `<div class="ohead"><h2>${esc(t('hello', { name: u.name }))}</h2>
        <p class="stats">🏆 ${fmt(u.rating)} · ${esc(t('my_stats', { games: fmt(u.games), wins: fmt(u.wins) }))}</p></div>
      ${u.table ? `<button class="btn primary" data-act="jointable" data-v="${esc(u.table)}">${esc(t('continue_table', { code: u.table }))}</button>` : ''}
      <div class="grid2">
        <button class="btn ${u.table ? '' : 'primary'}" data-act="create" data-v="1v1">${esc(t('create_1v1'))}</button>
        <button class="btn" data-act="create" data-v="2v2">${esc(t('create_2v2'))}</button>
      </div>
      <form class="joinrow" id="joinForm"><input id="joinCode" maxlength="6" placeholder="${esc(t('join_code'))}" autocomplete="off" aria-label="${esc(t('join_code'))}"><button class="btn" type="submit">${esc(t('join'))}</button></form>
      ${net.joinErr ? `<p class="formerr">${esc(net.joinErr)}</p>` : ''}
      <div class="seg tabs">
        <button class="segbtn ${tab === 'players' ? 'on' : ''}" data-act="otab" data-v="players">${esc(t('tab_players'))}</button>
        <button class="segbtn ${tab === 'leaders' ? 'on' : ''}" data-act="otab" data-v="leaders">${esc(t('tab_leaders'))}</button>
      </div>
      ${tab === 'players' ? `<p class="seghint">${esc(t('invite_hint'))}</p>${playersListHTML(true)}` : leadersHTML()}
      ${admin}
      <div class="stackbtns">
        <button class="btn" data-act="tostart">${esc(t('back_to_bots'))}</button>
        <button class="linkbtn" data-act="logout">${esc(t('logout'))}</button>
      </div>`;
  }

  function roomHTML() {
    const v = net.view;
    if (!v) return `<h2>${esc(t('connecting'))}</h2><p class="dots"></p><div class="stackbtns"><button class="btn" data-act="leavetable">${esc(t('back_lobby'))}</button></div>`;
    const isHost = net.user && v.host === net.user.id;
    const link = location.origin + '/?t=' + v.code;
    const seats = v.seats.map((s, i) => {
      const mine = i % 2 === Math.max(0, v.me.seat) % 2;
      const team = v.mode === '2v2' ? `<span class="teamtag ${mine ? 'mine' : ''}">${esc(t(mine ? 'team_mine' : 'team_other'))}</span>` : '';
      let body;
      if (!s) {
        body = `<span class="pname empty">${esc(t('empty_seat'))}</span>
          <span class="seatbtns">${v.me.seat !== i ? `<button class="mini" data-act="sit" data-v="${i}">${esc(t('sit_here'))}</button>` : ''}
          ${isHost ? LEVELS.map((l) => `<button class="mini ghost" data-act="addbot" data-v="${i}" data-l="${l}">🤖 ${esc(t('level_' + l))}</button>`).join('') : ''}</span>`;
      } else {
        const tags = [];
        if (s.kind === 'bot') tags.push('🤖 ' + t('level_' + s.level));
        if (s.kind === 'human' && s.id === v.host) tags.push(t('host_tag'));
        if (s.kind === 'human' && !s.connected) tags.push(t('disconnected'));
        body = `<span class="pname">${s.kind === 'human' ? dot(s.connected ? 'online' : 'offline') : ''}${esc(s.name)}${i === v.me.seat ? ` <em>(${esc(t('you_short'))})</em>` : ''}</span>
          <span class="pmeta">${esc(tags.join(' · '))}</span>
          ${isHost && !(s.kind === 'human' && s.id === v.host) ? `<button class="mini ghost" data-act="kick" data-v="${i}">${esc(t('remove'))}</button>` : ''}`;
      }
      return `<li class="seatrow">${team}${body}</li>`;
    }).join('');
    const full = v.seats.every(Boolean);
    return `<h2>${esc(t('room_title', { code: v.code }))}</h2>
      <p>${esc(t(v.mode === '2v2' ? 'room_lead_2v2' : 'room_lead_1v1'))}</p>
      <div class="codebox"><span class="code">${esc(v.code)}</span><button class="btn" data-act="copylink" data-v="${esc(link)}">${esc(t('copy_link'))}</button></div>
      <p class="linkline">${esc(link)}</p>
      <ul class="seats">${seats}</ul>
      ${isHost ? `<button class="btn primary" data-act="start" ${full ? '' : 'disabled'}>${esc(t('start_game'))}</button>${full ? '' : `<p class="seghint">${esc(t('need_full'))}</p>`}`
        : `<p class="seghint">${esc(t('wait_host'))}</p>`}
      <h3>${esc(t('invite_players'))}</h3>
      ${playersListHTML(true)}
      <div class="stackbtns"><button class="btn" data-act="leavetable">${esc(t('leave_table'))}</button></div>`;
  }

  // Překreslí okno, ale zachová rozepsaný text a kurzor v polích.
  function renderOverlay() {
    const el = $('#overlay');
    let html = '';
    if (overlay === 'start') html = startHTML();
    else if (overlay === 'menu') html = menuHTML();
    else if (overlay === 'leaveask') html = net.view ? leaveAskHTML() : menuHTML();
    else if (overlay === 'settings') html = settingsHTML();
    else if (overlay === 'rules') html = D().rules_html + `<div class="stackbtns"><button class="btn" data-act="back">${esc(t('back'))}</button></div>`;
    else if (overlay === 'pile') html = pileHTML();
    else if (overlay === 'log') html = logHTML();
    else if (overlay === 'round') html = roundHTML();
    else if (overlay === 'wild') html = wildHTML();
    else if (overlay === 'auth') html = authHTML();
    else if (overlay === 'online' && net.user) html = onlineHTML();
    else if (overlay === 'room') html = roomHTML();
    const full = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    if (el.dataset.html === full) return;
    const keep = {};
    el.querySelectorAll('input').forEach((i) => { if (i.id) keep[i.id] = i.value; });
    const active = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : null;
    const caret = active && document.activeElement.selectionStart;
    const sheet = el.querySelector('.sheet');
    const scroll = sheet ? sheet.scrollTop : 0;
    const sameKind = el.dataset.kind === overlay;
    el.dataset.html = full;
    el.dataset.kind = overlay || '';
    el.classList.toggle('show', !!html);
    el.innerHTML = html ? full : '';
    if (!sameKind) return;
    el.querySelectorAll('input').forEach((i) => { if (i.id && keep[i.id] != null && i.type !== 'hidden') i.value = keep[i.id]; });
    const ns = el.querySelector('.sheet');
    if (ns) ns.scrollTop = scroll;
    if (active) {
      const a = document.getElementById(active);
      if (a) { a.focus(); try { if (caret != null) a.setSelectionRange(caret, caret); } catch (e) { /* jen pro text */ } }
    }
  }

  function render() {
    if (!st) return;
    applyLang();
    for (const id of Array.from(sel)) if (!myHand().some((c) => c.id === id)) sel.delete(id);
    const pileOk = myTurn() && st.phase === 'draw' && !E.pileError(st, ME);
    $('#score').innerHTML = scoreHTML();
    $('#oppSeat').innerHTML = oppSeatHTML();
    $('#oppMelds').innerHTML = meldsHTML(THEM(), false);
    $('#center').innerHTML = centerHTML();
    $('#myMelds').innerHTML = meldsHTML(US(), myTurn() && ((st.phase === 'play' && sel.size > 0) || pileOk));
    $('#status').innerHTML = statusHTML();
    $('#handwrap').classList.toggle('myturn', !!myTurn());
    $('#hhead').innerHTML = handHeadHTML();
    $('#hand').innerHTML = handHTML();
    $('#actions').innerHTML = actionsHTML();
    renderOverlay();
    renderChrome();
  }

  function toast(msg, kind) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 3400);
  }

  // ---------- chat, emoty, pozvánky ----------
  function renderChrome() {
    const inT = online();
    const btn = $('#chatBtn');
    btn.hidden = !inT;
    btn.innerHTML = `💬${net.unread ? `<span class="nb">${net.unread > 9 ? '9+' : net.unread}</span>` : ''}`;
    btn.setAttribute('aria-label', t('chat_title'));
    const panel = $('#chat');
    panel.hidden = !(inT && net.chatOpen);
    if (!panel.hidden && !panel.dataset.built) buildChat();
    if (!panel.hidden) {
      panel.querySelector('h3').textContent = t('chat_title');
      panel.querySelector('#chatInput').placeholder = t('chat_ph');
      panel.querySelector('#chatSend').textContent = t('send');
      renderEmoteBar();
    }
    renderInvites();
  }
  function buildChat() {
    const panel = $('#chat');
    panel.dataset.built = '1';
    panel.innerHTML = `<div class="chead"><h3></h3><button class="iconbtn sm" data-act="chatclose" aria-label="${esc(t('close'))}">✕</button></div>
      <ul class="clist" id="chatList"></ul>
      <div class="emotes" id="emoteBar"></div>
      <form class="cform" id="chatForm"><input id="chatInput" maxlength="300" autocomplete="off"><button class="btn primary" id="chatSend" type="submit"></button></form>`;
    renderChatList();
  }
  function renderEmoteBar() {
    const bar = $('#emoteBar');
    if (!bar) return;
    const html = EMOTES.map((x) => `<button class="emo ${x.throw ? 'throw' : ''}" data-act="emote" data-v="${x.id}" title="${esc(t('emo_' + x.id))}" aria-label="${esc(t('emo_' + x.id))}">${x.e}</button>`).join('');
    if (bar.dataset.html !== html) { bar.dataset.html = html; bar.innerHTML = html; }
  }
  function chatLine(m) {
    if (m.kind === 'sys') return `<li class="sys">${esc(t('sys_' + m.k, m.p))}</li>`;
    const mine = net.user && net.view && m.seat === net.view.me.seat && m.seat >= 0;
    if (m.kind === 'emote') {
      const x = EMOTES.find((e) => e.id === m.id);
      return `<li class="${mine ? 'mine' : ''}"><b>${esc(m.name)}</b> <span class="big">${x ? x.e : ''}</span> ${esc(t('emo_' + m.id))}</li>`;
    }
    return `<li class="${mine ? 'mine' : ''}"><b>${esc(m.name)}</b> ${esc(m.text)}</li>`;
  }
  function renderChatList() {
    const list = $('#chatList');
    if (!list) return;
    list.innerHTML = net.chat.map(chatLine).join('') || `<li class="sys">${esc(t('chat_empty'))}</li>`;
    list.scrollTop = list.scrollHeight;
  }
  function onChat(m, fresh) {
    net.chat.push(m);
    if (net.chat.length > 150) net.chat.shift();
    if (net.chatOpen) renderChatList();
    else if (fresh && m.kind !== 'sys') net.unread++;
    if (fresh && m.kind === 'emote') playEmote(m);
    if (fresh && m.kind === 'msg' && !net.chatOpen && !(net.view && m.seat === net.view.me.seat)) toast(m.name + ': ' + m.text, 'info');
    if (fresh && m.kind === 'sys') toast(t('sys_' + m.k, m.p), 'info');
    renderChrome();
  }

  // Kde na obrazovce sedí hráč (pro animace emotů).
  function seatPoint(seat) {
    let el = null;
    if (seat === ME || seat < 0) el = $('#handwrap');
    else el = document.querySelector(`[data-seat="${seat}"]`) || (st.players[seat] && st.players[seat].team === US() ? $('#myMelds') : $('#oppSeat'));
    const r = (el || document.body).getBoundingClientRect();
    const app = $('#app').getBoundingClientRect();
    return { x: r.left + r.width / 2 - app.left, y: r.top + Math.min(r.height / 2, 60) - app.top };
  }
  function playEmote(m) {
    const fx = $('#fx');
    const x = EMOTES.find((e) => e.id === m.id);
    if (!x || !st) return;
    const from = seatPoint(m.seat);
    if (x.throw) {
      const myTeam = US();
      const senderTeam = m.seat >= 0 && st.players[m.seat] ? st.players[m.seat].team : myTeam;
      const targetSeat = senderTeam === myTeam ? st.players.findIndex((p) => p.team !== myTeam) : ME;
      const to = seatPoint(targetSeat);
      const el = document.createElement('div');
      el.className = 'fx-throw';
      el.textContent = x.e;
      el.style.setProperty('--x0', from.x + 'px');
      el.style.setProperty('--y0', from.y + 'px');
      el.style.setProperty('--x1', to.x + 'px');
      el.style.setProperty('--y1', to.y + 'px');
      fx.appendChild(el);
      setTimeout(() => {
        el.remove();
        const sp = document.createElement('div');
        sp.className = 'fx-splat';
        sp.style.left = to.x + 'px';
        sp.style.top = to.y + 'px';
        sp.innerHTML = '<span>💥</span><i></i><i></i><i></i><i></i><i></i>';
        fx.appendChild(sp);
        setTimeout(() => sp.remove(), 1400);
      }, 800);
      return;
    }
    const el = document.createElement('div');
    el.className = 'fx-emote';
    el.style.left = from.x + 'px';
    el.style.top = from.y + 'px';
    el.innerHTML = `<span class="e">${x.e}</span><span class="tx">${esc(m.name)}: ${esc(t('emo_' + m.id))}</span>`;
    fx.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  function renderInvites() {
    const box = $('#invite');
    const inv = net.invites[0];
    if (!inv) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    const html = `<p><b>${esc(t('invite_title', { name: inv.from.name }))}</b><br>${esc(t('invite_mode_' + inv.mode))} · ${esc(inv.table)}</p>
      <div class="grid2"><button class="btn primary" data-act="invaccept">${esc(t('accept'))}</button><button class="btn" data-act="invdecline">${esc(t('decline'))}</button></div>`;
    if (box.dataset.html !== html) { box.dataset.html = html; box.innerHTML = html; }
  }

  // ---------- síť ----------
  async function apiCall(path, body) {
    const opts = { headers: {} };
    if (net.token) opts.headers.authorization = 'Bearer ' + net.token;
    if (body !== undefined) {
      opts.method = 'POST';
      opts.headers['content-type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    try {
      const r = await fetch(path, opts);
      const data = await r.json().catch(() => ({}));
      if (r.status === 401 && path !== '/api/login') { setToken(null); net.user = null; }
      return data;
    } catch (e) {
      return { error: { k: 'network_error', p: {} } };
    }
  }
  function setToken(tok) {
    net.token = tok;
    try { if (tok) localStorage.setItem(TOKEN_KEY, tok); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* bez úložiště */ }
  }
  async function checkOnline() {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch('/api/ping', { signal: ctl.signal });
      clearTimeout(timer);
      net.available = r.ok && (await r.json()).ok === true;
    } catch (e) { net.available = false; }
    if (!net.available) return;
    try { net.token = localStorage.getItem(TOKEN_KEY); } catch (e) { net.token = null; }
    if (net.token) {
      const me = await apiCall('/api/me');
      if (me.user) { net.user = me.user; connectLobby(); }
    }
  }
  async function refreshMe() {
    const me = await apiCall('/api/me');
    if (me.user) net.user = me.user;
  }
  async function refreshPlayers() {
    const r = await apiCall('/api/players?q=' + encodeURIComponent(net.search));
    if (r.players) {
      net.players = r.players;
      for (const p of r.players) if (p.online) net.onlineMap[p.id] = net.onlineMap[p.id] || { status: p.status };
    }
    render();
  }
  async function refreshLeaders() {
    const r = await apiCall('/api/leaderboard');
    if (r.players) net.leaders = r.players;
    render();
  }
  function wsUrl(path) {
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(net.token);
  }
  function connectLobby() {
    if (!net.token || net.lobby) return;
    const ws = new WebSocket(wsUrl('/api/lobby/ws'));
    net.lobby = ws;
    ws.onopen = () => { net.lobbyRetry = 0; sendLobbyStatus(); };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'presence') { net.onlineMap = m.online || {}; render(); }
      else if (m.t === 'invite') {
        if (!net.invites.some((i) => i.id === m.inv.id) && !(net.code === m.inv.table)) net.invites.push(m.inv);
        render();
      } else if (m.t === 'invite_sent') toast(m.online ? t('invite_sent') : t('invite_queued'), 'info');
      else if (m.t === 'invite_answer') toast(t(m.accept ? 'invite_accepted' : 'invite_declined', { name: m.by.name }), 'info');
    };
    ws.onclose = () => {
      net.lobby = null;
      if (!net.token) return;
      net.lobbyRetry = Math.min(net.lobbyRetry + 1, 6);
      setTimeout(connectLobby, 1000 * net.lobbyRetry);
    };
  }
  function sendLobbyStatus() {
    if (net.lobby && net.lobby.readyState === 1) {
      net.lobby.send(JSON.stringify(net.code ? { t: 'status', status: 'table', table: net.code } : { t: 'status', status: 'lobby' }));
    }
  }
  function sendTable(m) {
    if (net.tws && net.tws.readyState === 1) net.tws.send(JSON.stringify(m));
    else toast(t('connecting'));
  }

  function joinTable(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) { net.joinErr = t('table_not_found'); render(); return; }
    if (!net.user) { net.joinAfterLogin = code; overlay = 'auth'; render(); return; }
    if (net.code === code && net.tws) { overlay = net.view && net.view.status === 'waiting' ? 'room' : null; render(); return; }
    leaveTable(true);
    if (!stash && st && !online()) stash = { st, mode };
    clearTimeout(botTimer);
    net.code = code;
    net.view = null;
    net.chat = [];
    net.unread = 0;
    net.wantTable = true;
    net.joinErr = '';
    net.invites = net.invites.filter((i) => i.table !== code);
    sel.clear();
    overlay = 'room';
    try { history.replaceState(null, '', '/?t=' + code); } catch (e) { /* sandbox */ }
    openTableSocket();
    sendLobbyStatus();
    render();
    refreshPlayers();
  }
  function openTableSocket() {
    if (!net.code || !net.wantTable) return;
    const code = net.code;
    const ws = new WebSocket(wsUrl('/api/table/ws?code=' + code));
    net.tws = ws;
    ws.onopen = () => { net.tableRetry = 0; };
    ws.onmessage = (ev) => {
      if (net.tws !== ws) return;
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'state') onTableState(m.s);
      else if (m.t === 'chatlog') { net.chat = []; for (const x of m.list || []) onChat(x, false); }
      else if (m.t === 'chat') onChat(m.m, true);
      else if (m.t === 'error') { toast(tr(m.error)); }
      else if (m.t === 'kicked') { toast(t('kicked')); leaveTable(false); }
      else if (m.t === 'left') {
        const f = m.forfeit;
        if (f) toast(f.rated && f.delta ? t('left_forfeit_d', { d: (f.delta > 0 ? '+' : '') + f.delta }) : t('left_forfeit'));
        leaveTable(false);
      }
    };
    ws.onclose = (ev) => {
      if (net.tws !== ws) return;
      net.tws = null;
      if (!net.wantTable) return;
      if (!net.view && net.tableRetry >= 1) {
        toast(t('table_not_found'));
        leaveTable(false);
        return;
      }
      net.tableRetry = Math.min(net.tableRetry + 1, 6);
      setTimeout(openTableSocket, 800 * net.tableRetry);
      render();
    };
  }
  function onTableState(s) {
    const prevPhase = net.view && net.view.game ? net.view.game.phase : null;
    const prevStatus = net.view ? net.view.status : null;
    net.view = s;
    if (s.me.seat < 0) {
      toast(t('table_full'));
      leaveTable(false);
      return;
    }
    syncFromNet();
    if (s.status === 'waiting') {
      if (overlay !== 'rules' && overlay !== 'settings') overlay = 'room';
    } else if (prevStatus === 'waiting' || overlay === 'room') {
      overlay = null;
    }
    const ph = s.game ? s.game.phase : null;
    if ((ph === 'roundOver' || ph === 'gameOver') && prevPhase !== ph) { sel.clear(); overlay = 'round'; }
    if (ph === 'draw' && prevPhase && prevPhase !== 'draw' && prevPhase !== 'play' && overlay === 'round') overlay = null;
    render();
  }
  function leaveTable(silent) {
    if (!net.code) return;
    net.wantTable = false;
    if (net.tws) { try { net.tws.close(); } catch (e) { /* nic */ } }
    net.tws = null;
    net.code = null;
    net.view = null;
    net.chat = [];
    net.chatOpen = false;
    net.unread = 0;
    pending = null;
    sel.clear();
    try { history.replaceState(null, '', '/'); } catch (e) { /* sandbox */ }
    sendLobbyStatus();
    if (stash) { st = stash.st; mode = stash.mode; stash = null; ME = 0; }
    if (!silent) {
      overlay = net.user ? 'online' : 'start';
      refreshMe().then(() => { refreshPlayers(); });
      render();
    }
  }

  // ---------- roboti (jen hra proti robotům) ----------
  function schedule() {
    clearTimeout(botTimer);
    if (!st || overlay || online()) return;
    if ((st.phase === 'draw' || st.phase === 'play') && st.players[st.current].isBot) {
      const base = st.phase === 'draw' ? 650 : 800;
      botTimer = setTimeout(botTick, base);
    }
  }
  function botTick() {
    if (!st || overlay || online()) return;
    const pi = st.current;
    if (!st.players[pi].isBot) return;
    const r = B.step(st, pi, prefs.level);
    if (!r.ok) {
      botFails++;
      if (botFails > 3) emergencyMove(pi);
    } else {
      botFails = 0;
    }
    afterChange();
  }
  function emergencyMove(pi) {
    botFails = 0;
    if (st.phase === 'draw') {
      if (st.stock.length) E.drawStock(st, pi); else E.passEnd(st, pi);
      return;
    }
    if (st.phase === 'play') {
      for (const c of st.players[pi].hand) if (!E.discardError(st, pi, c.id)) { E.discard(st, pi, c.id); return; }
      E.undoTurn(st, pi);
    }
  }
  function afterChange() {
    if (online()) { render(); return; }
    if (st.phase === 'roundOver' || st.phase === 'gameOver') {
      sel.clear();
      if (!overlay) overlay = 'round';
    }
    save();
    render();
    schedule();
  }

  // ---------- tahy (místně, nebo přes server) ----------
  function remote(a) {
    sendTable({ t: 'act', a });
    return { ok: true, remote: true };
  }
  function pileVariant(meldId) {
    const ids = Array.from(sel);
    const melds = st.teams[US()].melds;
    if (meldId != null) return { ids, meldId };
    if (ids.length >= 2 && !E.checkTakePile(st, ME, ids, null).error) return { ids, meldId: null };
    for (const m of melds) if (!E.checkTakePile(st, ME, ids, m.id).error) return { ids, meldId: m.id };
    return { ids, meldId: null };
  }
  function checkOf(kind, v) {
    if (kind === 'new') return E.checkMeldNew(st, ME, v.ids);
    if (kind === 'add') return E.checkAdd(st, ME, v.meldId, v.ids);
    return E.checkTakePile(st, ME, v.ids, v.meldId);
  }
  function runOf(kind, v, prefer) {
    if (online()) {
      return remote({ type: kind === 'new' ? 'meld' : kind === 'add' ? 'add' : 'pile', ids: v.ids, meldId: v.meldId, prefer });
    }
    if (kind === 'new') return E.meldNew(st, ME, v.ids, prefer);
    if (kind === 'add') return E.addToMeld(st, ME, v.meldId, v.ids, prefer);
    return E.takePile(st, ME, v.ids, v.meldId, prefer);
  }
  function attempt(kind, v) {
    const chk = checkOf(kind, v);
    if (chk.error) return { ok: false, error: chk.error };
    if (chk.a && chk.a.choice) {
      pending = { kind, v, choice: chk.a.choice, suit: chk.meld ? chk.meld.key : chk.a.key };
      overlay = 'wild';
      return null;
    }
    return runOf(kind, v);
  }

  async function doAuth(form) {
    const name = form.querySelector('#authName').value;
    const password = form.querySelector('#authPass').value;
    const r = await apiCall(net.authTab === 'register' ? '/api/register' : '/api/login', { name, password });
    if (r.error) { net.authErr = tr(r.error); render(); return; }
    setToken(r.token);
    net.user = r.user;
    net.authErr = '';
    connectLobby();
    if (net.joinAfterLogin) {
      const c = net.joinAfterLogin;
      net.joinAfterLogin = null;
      joinTable(c);
    } else {
      goOnline();
    }
  }
  function goOnline() {
    if (!net.user) { overlay = 'auth'; render(); return; }
    overlay = 'online';
    render();
    refreshMe().then(() => { refreshPlayers(); refreshLeaders(); });
  }
  async function createTable(m) {
    const r = await apiCall('/api/table/create', { mode: m });
    if (r.error) { toast(tr(r.error)); return null; }
    joinTable(r.code);
    return r.code;
  }
  async function invite(userId) {
    let code = net.code;
    if (!code) code = await createTable('1v1');
    if (!code) return;
    const mode2 = net.view ? net.view.mode : '1v1';
    if (net.lobby && net.lobby.readyState === 1) {
      net.lobby.send(JSON.stringify({ t: 'invite', to: userId, table: code, mode: mode2 }));
      net.invited[userId] = true;
      setTimeout(() => { delete net.invited[userId]; render(); }, 15000);
    }
    render();
  }
  function copyLink(link) {
    const done = () => toast(t('copied'), 'info');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done, () => toast(link, 'info'));
        return;
      }
    } catch (e) { /* bez schránky */ }
    toast(link, 'info');
  }

  function act(name, el) {
    let r = null;
    const v = el && el.dataset ? el.dataset.v : null;
    switch (name) {
      case 'menu': prevOverlay = null; overlay = 'menu'; break;
      case 'leaveask': overlay = 'leaveask'; break;
      case 'rules': prevOverlay = overlay; overlay = 'rules'; break;
      case 'settings': prevOverlay = overlay; overlay = 'settings'; break;
      case 'back': overlay = prevOverlay; prevOverlay = null; break;
      case 'showpile': overlay = 'pile'; break;
      case 'log': overlay = 'log'; break;
      case 'close':
        overlay = online() && net.view && net.view.status === 'waiting' ? 'room' : null;
        break;
      case 'openround': overlay = 'round'; break;
      case 'openroom': overlay = 'room'; break;
      case 'clearsel': sel.clear(); break;
      case 'tostart': overlay = 'start'; break;
      case 'lang':
        if (LANGS.includes(v)) { prefs.lang = v; savePrefs(); }
        break;
      case 'level':
        if (LEVELS.includes(v)) { prefs.level = v; savePrefs(); }
        break;
      case 'new1': newMatch('1v1'); overlay = null; break;
      case 'new2': newMatch('2v2'); overlay = null; break;
      case 'goonline': goOnline(); return;
      case 'authtab': net.authTab = v === 'register' ? 'register' : 'login'; net.authErr = ''; break;
      case 'logout':
        apiCall('/api/logout', {});
        setToken(null);
        net.user = null;
        if (net.lobby) { try { net.lobby.close(); } catch (e) { /* nic */ } }
        overlay = 'start';
        break;
      case 'otab':
        net.tab = v === 'leaders' ? 'leaders' : 'players';
        if (net.tab === 'leaders') refreshLeaders(); else refreshPlayers();
        break;
      case 'create': createTable(v === '2v2' ? '2v2' : '1v1'); return;
      case 'jointable': joinTable(v); return;
      case 'invite': invite(Number(v)); return;
      case 'invaccept': {
        const inv = net.invites.shift();
        if (inv && net.lobby) net.lobby.send(JSON.stringify({ t: 'invite_answer', id: inv.id, from: inv.from.id, accept: true, table: inv.table }));
        if (inv) joinTable(inv.table);
        break;
      }
      case 'invdecline': {
        const inv = net.invites.shift();
        if (inv && net.lobby) net.lobby.send(JSON.stringify({ t: 'invite_answer', id: inv.id, from: inv.from.id, accept: false, table: inv.table }));
        break;
      }
      case 'copylink': copyLink(v); return;
      case 'sit': sendTable({ t: 'sit', seat: Number(v) }); return;
      case 'addbot': sendTable({ t: 'bot', seat: Number(v), level: el.dataset.l }); return;
      case 'kick': sendTable({ t: 'kick', seat: Number(v) }); return;
      case 'start': sendTable({ t: 'start' }); return;
      case 'rematch': sendTable({ t: 'rematch' }); overlay = null; break;
      case 'leavetable':
        if (net.tws && net.tws.readyState === 1) {
          // počkat, až server odchod potvrdí (zpráva „left“), jinak to po chvíli uzavřít samo
          sendTable({ t: 'leave' });
          const code = net.code;
          setTimeout(() => { if (net.code === code) leaveTable(false); }, 1500);
        } else leaveTable(false);
        return;
      case 'chatopen': net.chatOpen = !net.chatOpen; net.unread = 0; renderChrome(); if (net.chatOpen) setTimeout(() => { const i = $('#chatInput'); if (i) i.focus(); }, 30); return;
      case 'chatclose': net.chatOpen = false; renderChrome(); return;
      case 'emote': sendTable({ t: 'emote', id: v }); return;
      case 'nextround':
        if (online()) { sendTable({ t: 'next' }); break; }
        if (st.phase === 'roundOver') { E.startRound(st); sel.clear(); }
        overlay = null;
        break;
      case 'draw':
        if (!myTurn()) return;
        r = online() ? remote({ type: 'draw' }) : E.drawStock(st, ME);
        if (r.ok && r.red3) toast(t('toast_red3'), 'info');
        break;
      case 'pile':
        if (!myTurn()) return;
        r = attempt('pile', pileVariant(null));
        if (r && r.ok) sel.clear();
        break;
      case 'pass':
        if (!myTurn()) return;
        r = online() ? remote({ type: 'pass' }) : E.passEnd(st, ME);
        break;
      case 'meld':
        if (!myTurn()) return;
        r = attempt('new', { ids: Array.from(sel) });
        if (r && r.ok) sel.clear();
        break;
      case 'wildpick':
        if (!pending || !myTurn()) { pending = null; overlay = null; break; }
        r = runOf(pending.kind, pending.v, v === 'low' ? 'low' : 'high');
        if (r.ok) sel.clear();
        pending = null;
        overlay = null;
        break;
      case 'wildcancel':
        pending = null;
        overlay = null;
        break;
      case 'discard':
        if (!myTurn()) return;
        if (sel.size !== 1) { toast(t('toast_pick_one')); return; }
        if (online()) {
          const err = E.discardError(st, ME, Array.from(sel)[0]);
          r = err ? { ok: false, error: err } : remote({ type: 'discard', id: Array.from(sel)[0] });
        } else r = E.discard(st, ME, Array.from(sel)[0]);
        if (r.ok) sel.clear();
        break;
      case 'undo':
        if (!myTurn()) return;
        r = online() ? remote({ type: 'undo' }) : E.undoTurn(st, ME);
        if (r.ok) sel.clear();
        break;
      default:
        return;
    }
    if (r && !r.ok) toast(tr(r.error));
    afterChange();
  }

  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-act]');
    if (a) {
      if (a.disabled) return;
      act(a.dataset.act, a);
      return;
    }
    const m = ev.target.closest('[data-meld]');
    if (m) {
      if (!myTurn()) return;
      let r;
      if (st.phase === 'draw') r = attempt('pile', pileVariant(Number(m.dataset.meld)));
      else if (st.phase === 'play' && sel.size) r = attempt('add', { ids: Array.from(sel), meldId: Number(m.dataset.meld) });
      else return;
      if (r && !r.ok) toast(tr(r.error)); else if (r) sel.clear();
      afterChange();
      return;
    }
    const c = ev.target.closest('[data-card]');
    if (c) {
      const id = Number(c.dataset.card);
      if (sel.has(id)) sel.delete(id); else sel.add(id);
      render();
      return;
    }
    if (ev.target.id === 'overlay' && overlay && !['start', 'round', 'room', 'auth', 'online'].includes(overlay)) {
      overlay = online() && net.view && net.view.status === 'waiting' ? 'room' : null;
      pending = null;
      render();
      schedule();
    }
  });

  document.addEventListener('submit', (ev) => {
    const f = ev.target;
    ev.preventDefault();
    if (f.id === 'authForm') doAuth(f);
    else if (f.id === 'joinForm') joinTable(f.querySelector('#joinCode').value);
    else if (f.id === 'chatForm') {
      const i = f.querySelector('#chatInput');
      const text = i.value.trim();
      if (text) { sendTable({ t: 'chat', text }); i.value = ''; }
    } else if (f.id === 'adminForm') {
      apiCall('/api/admin/reset', { name: f.querySelector('#admName').value, password: f.querySelector('#admPass').value }).then((r) => {
        net.adminMsg = r.error ? tr(r.error) : t('admin_done', { name: r.name });
        render();
      });
    }
  });

  let searchTimer = null;
  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'playerSearch') {
      net.search = ev.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(refreshPlayers, 250);
    } else if (ev.target.id === 'joinCode') {
      ev.target.value = ev.target.value.toUpperCase();
    }
  });

  // ---------- start ----------
  function start(data) {
    loadPrefs();
    if (data && data.prefs && LANGS.includes(data.prefs.lang)) prefs = Object.assign(prefs, data.prefs);
    const saved = data && data.st ? data : load();
    if (saved && saved.st && saved.st.players && saved.st.phase && saved.st.phase !== 'new') {
      st = saved.st;
      mode = saved.mode || '1v1';
      overlay = st.phase === 'roundOver' || st.phase === 'gameOver' ? 'round' : null;
    } else {
      newMatch('1v1');
      overlay = 'start';
    }
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
      window.claude.hot.snapshot(() => ({ st: online() ? (stash ? stash.st : null) : st, mode, prefs }));
    }
    render();
    schedule();
    const code = new URLSearchParams(location.search).get('t');
    checkOnline().then(() => {
      if (net.available && code) {
        if (net.user) joinTable(code);
        else { net.joinAfterLogin = code.toUpperCase(); overlay = 'auth'; }
      }
      render();
    });
  }

  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start);
  else start((window.claude && window.claude.hot && window.claude.hot.data) || {});
})();
