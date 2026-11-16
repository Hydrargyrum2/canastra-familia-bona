(function () {
  'use strict';
  const E = window.Engine;
  const B = window.Bot;
  const { DICT, LOCALE, LANGS } = window.I18N;
  const ME = 0;
  const SAVE_KEY = 'brazilska-kanasta-v1';
  const PREF_KEY = 'brazilska-kanasta-nastaveni';
  const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 };
  const LEVELS = ['easy', 'medium', 'hard'];
  const $ = (s) => document.querySelector(s);

  let st = null;
  let mode = '1v1';
  let overlay = null; // 'start' | 'menu' | 'rules' | 'settings' | 'pile' | 'log' | 'round' | null
  let prevOverlay = null;
  const sel = new Set();
  let botTimer = null;
  let toastTimer = null;
  let botFails = 0;
  let prefs = { lang: detectLang(), level: 'hard' };
  let pending = null; // vykládka čekající na volbu, kam dát žolíka

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
  // Zpráva z enginu ({k, p}) nebo starý text.
  function tr(m) {
    if (!m) return '';
    if (typeof m === 'string') return m;
    const p = Object.assign({}, m.p);
    let k = m.k;
    if (p.pi != null) {
      if (p.pi === ME && D()[k + '_you'] != null) k += '_you';
      p.name = nameOf(p.pi);
    }
    if (p.card) p.card = cardLabel(p.card);
    return t(k, p);
  }
  const fmt = (n) => n.toLocaleString(LOCALE[prefs.lang] || 'cs-CZ');
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

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

  function teamName(ti) {
    if (mode === '2v2') return ti === 0 ? D().team_us : D().team_them;
    return ti === 0 ? D().you_name : st.players[1].name;
  }
  const myTurn = () => st && st.current === ME && (st.phase === 'draw' || st.phase === 'play');

  // ---------- nová hra ----------
  function newMatch(m) {
    mode = m;
    const players = m === '2v2'
      ? [{ name: 'Ty' }, { name: 'Caio', isBot: true }, { name: 'Bia', isBot: true }, { name: 'Duda', isBot: true }]
      : [{ name: 'Ty' }, { name: 'Caio', isBot: true }];
    st = E.newGame(players);
    E.startRound(st);
    sel.clear();
    botFails = 0;
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ st, mode })); } catch (e) { /* bez úložiště */ }
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
  }

  // ---------- vykreslení ----------
  function scoreHTML() {
    const s0 = st.teams[0].score;
    const s1 = st.teams[1].score;
    const w = (s) => Math.min(100, (s / E.RULES.target) * 100).toFixed(1);
    return `
      <div class="side us"><span class="tn">${esc(teamName(0))}</span><span class="pts">${fmt(s0)}</span><span class="bar"><i style="width:${w(s0)}%"></i><b></b></span></div>
      <div class="mid"><span class="goal">${esc(t('goal', { n: String(E.RULES.target) }))}</span><span class="rd">${esc(t('round', { n: st.round }))}</span></div>
      <div class="side them"><span class="tn">${esc(teamName(1))}</span><span class="pts">${fmt(s1)}</span><span class="bar"><i style="width:${w(s1)}%"></i><b></b></span></div>
      <button class="iconbtn" data-act="menu" aria-label="${esc(t('menu'))}">☰</button>`;
  }

  // Vějíř rubů karet, které hráč drží v ruce.
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

  // Soupeři sedí nahoře naproti.
  function oppSeatHTML() {
    const myTeam = st.players[ME].team;
    const opps = st.players.map((p, i) => i).filter((i) => st.players[i].team !== myTeam);
    const small = opps.length > 1;
    return opps.map((i) => {
      const p = st.players[i];
      return `<div class="seat ${small ? 'small' : ''} ${playing(i) ? 'turn' : ''}">
        ${arcHTML(p.hand.length, small ? 9 : 13)}
        <div class="who"><span class="nm">${esc(p.name)}</span><span class="tag">${esc(t('bot_tag_opp'))}</span><span class="cnt">${p.hand.length}</span></div>
      </div>`;
    }).join('');
  }
  function partnerHTML() {
    const myTeam = st.players[ME].team;
    return st.players.map((p, i) => ({ p, i })).filter((x) => x.i !== ME && x.p.team === myTeam)
      .map(({ p, i }) => `<span class="partner ${playing(i) ? 'turn' : ''}">${arcHTML(p.hand.length, 7)}<span title="${esc(t('bot_tag_partner'))}">${esc(p.name)} · ${p.hand.length}</span></span>`).join('');
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
    const title = ti === 0 ? (mode === '2v2' ? t('melds_ours') : t('melds_mine')) : t('melds_of', { name: teamName(1) });
    const head = `<div class="mhead"><span>${esc(title)}</span>${red3}<span class="grow"></span>${open}${ti === 0 ? partnerHTML() : ''}</div>`;
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
    if (st.phase === 'roundOver' || st.phase === 'gameOver') hint = esc(t('round_over_short'));
    else if (!myTurn()) hint = `<span class="dots">${esc(t('playing', { name: nameOf(st.current) }))}</span>`;
    else if (st.phase === 'draw') {
      const canPile = !E.pileError(st, ME);
      const parts = st.stock.length ? [t('hint_draw')] : [t('hint_stock_out')];
      if (canPile) parts.push(t('hint_pile_how'));
      if (!st.stock.length && canPile) parts.push(t('hint_else_end'));
      hint = esc(parts.join(' '));
    } else {
      hint = esc(sel.size ? t('hint_sel') : t('hint_play'));
      if (E.needsOpen(st.teams[st.players[ME].team])) {
        hint += ` <span class="badge">${esc(t('open_badge', { v: st.turn.laid, min: E.RULES.openMin }))}</span>`;
      }
    }
    return `<span class="hint">${hint}</span>`;
  }

  function handHTML() {
    const me = st.players[ME];
    const mineNow = st.current === ME;
    const newIds = mineNow && st.turn ? st.turn.newIds || [] : [];
    return sortHand(me.hand).map((c) => {
      const cls = [sel.has(c.id) ? 'sel' : '', newIds.includes(c.id) ? 'new' : ''].join(' ');
      return `<button class="hc ${cls}" data-card="${c.id}" aria-pressed="${sel.has(c.id)}">${cardFace(c)}</button>`;
    }).join('');
  }

  function handHeadHTML() {
    const me = st.players[ME];
    const val = sel.size ? me.hand.filter((c) => sel.has(c.id)).reduce((s, c) => s + E.cardValue(c), 0) : 0;
    return `<span>${esc(t('your_cards', { n: me.hand.length }))}</span><span class="grow"></span>${sel.size ? `<span>${esc(t('selected', { n: sel.size, v: val }))}</span> <button class="linkbtn" data-act="clearsel">${esc(t('clear'))}</button>` : ''}`;
  }

  function actionsHTML() {
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
    const canUndo = st.turn.snap && (st.turn.from === 'pile' || st.turn.laid > 0);
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
    const t0 = lr.teams[0];
    const t1 = lr.teams[1];
    let title;
    if (lr.closer == null) title = t('res_stock_out');
    else if (lr.closer === 0) title = t(mode === '2v2' ? 'out_us' : 'out_me');
    else title = mode === '2v2' ? t('out_opps') : t('out_opp', { name: teamName(1) });
    const row = (label, a, b, cls) => `<tr class="${cls || ''}"><td>${esc(label)}</td><td>${a}</td><td>${b}</td></tr>`;
    let head;
    if (st.phase === 'gameOver') {
      let win;
      if (st.winner === -1) win = t('draw_game');
      else if (st.winner === 0) win = t(mode === '2v2' ? 'win_us' : 'win_me');
      else win = mode === '2v2' ? t('win_opps') : t('win_opp', { name: teamName(1) });
      head = `<h2 class="title-xl">${esc(win)}</h2><p>${esc(title)}. ${esc(t('final_score', { a: fmt(st.teams[0].score), b: fmt(st.teams[1].score) }))}</p>`;
    } else {
      head = `<h2>${esc(title)}</h2><p>${esc(t(lr.closer == null ? 'res_stock_out_lead' : 'res_out_lead'))}</p>`;
    }
    return `${head}
      <table class="res">
        <thead><tr><th></th><th>${esc(teamName(0))}</th><th>${esc(teamName(1))}</th></tr></thead>
        <tbody>
          ${row(t('row_cards'), fmt(t0.cardsPts), fmt(t1.cardsPts))}
          ${row(t('row_canastas', { a: t0.canastas, b: t1.canastas }), fmt(t0.canastaPts), fmt(t1.canastaPts))}
          ${row(t('row_red3', { a: t0.red3, b: t1.red3 }), fmt(t0.red3Pts), fmt(t1.red3Pts))}
          ${row(t('row_capture'), fmt(t0.capturePts), fmt(t1.capturePts))}
          ${row(t('row_round'), fmt(t0.total), fmt(t1.total), 'sum')}
          ${row(t('row_total'), fmt(st.teams[0].score), fmt(st.teams[1].score), 'tot')}
        </tbody>
      </table>
      <div class="stackbtns">
        ${st.phase === 'gameOver'
          ? `<button class="btn primary" data-act="new1">${esc(t('new1'))}</button><button class="btn" data-act="new2">${esc(t('new2'))}</button>`
          : `<button class="btn primary" data-act="nextround">${esc(t('next_round'))}</button><button class="btn" data-act="close">${esc(t('look_table'))}</button>`}
      </div>`;
  }

  function startHTML() {
    const fanCards = [{ r: 'K', s: 'S' }, { r: 'A', s: 'H' }, { r: '4', s: 'D' }, { r: '2', s: 'C' }, { r: 'JK', s: null }];
    const rots = [-14, -7, 0, 7, 14];
    return `
      ${langButtons()}
      <div class="hero-cards" aria-hidden="true">${fanCards.map((c, i) => cardFace(c, `--rot:${rots[i]}deg`)).join('')}</div>
      <h2 class="title-xl">${esc(t('title'))}</h2>
      <p>${esc(t('start_lead'))}</p>
      <h3>${esc(t('settings_level'))}</h3>
      ${levelButtons()}
      <div class="stackbtns">
        <button class="btn primary" data-act="new1">${esc(t('start_1v1'))}</button>
        <button class="btn" data-act="new2">${esc(t('start_2v2'))}</button>
        <button class="linkbtn" data-act="rules">${esc(t('read_rules'))}</button>
      </div>`;
  }

  function menuHTML() {
    return `
      <h2>${esc(t('menu'))}</h2>
      <div class="stackbtns">
        <button class="btn primary" data-act="close">${esc(t('keep_playing'))}</button>
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

  function renderOverlay() {
    const el = $('#overlay');
    let html = '';
    if (overlay === 'start') html = startHTML();
    else if (overlay === 'menu') html = menuHTML();
    else if (overlay === 'settings') html = settingsHTML();
    else if (overlay === 'rules') html = D().rules_html + `<div class="stackbtns"><button class="btn" data-act="back">${esc(t('back'))}</button></div>`;
    else if (overlay === 'pile') html = pileHTML();
    else if (overlay === 'log') html = logHTML();
    else if (overlay === 'round') html = roundHTML();
    else if (overlay === 'wild') html = wildHTML();
    el.classList.toggle('show', !!html);
    el.innerHTML = html ? `<div class="sheet" role="dialog" aria-modal="true">${html}</div>` : '';
  }

  function render() {
    if (!st) return;
    applyLang();
    const me = st.players[ME];
    for (const id of Array.from(sel)) if (!me.hand.some((c) => c.id === id)) sel.delete(id);
    const pileOk = myTurn() && st.phase === 'draw' && !E.pileError(st, ME);
    $('#score').innerHTML = scoreHTML();
    $('#oppSeat').innerHTML = oppSeatHTML();
    $('#oppMelds').innerHTML = meldsHTML(1, false);
    $('#center').innerHTML = centerHTML();
    $('#myMelds').innerHTML = meldsHTML(0, myTurn() && ((st.phase === 'play' && sel.size > 0) || pileOk));
    $('#status').innerHTML = statusHTML();
    $('#handwrap').classList.toggle('myturn', myTurn());
    $('#hhead').innerHTML = handHeadHTML();
    $('#hand').innerHTML = handHTML();
    $('#actions').innerHTML = actionsHTML();
    renderOverlay();
  }

  function toast(msg, kind) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 3400);
  }

  // ---------- roboti ----------
  function schedule() {
    clearTimeout(botTimer);
    if (!st || overlay) return;
    if ((st.phase === 'draw' || st.phase === 'play') && st.players[st.current].isBot) {
      const base = st.phase === 'draw' ? 650 : 800;
      botTimer = setTimeout(botTick, base);
    }
  }
  function botTick() {
    if (!st || overlay) return;
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
  // Pojistka, kdyby robot uvízl: odhodit cokoli, co jde, nebo ukončit kolo.
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
    if (st.phase === 'roundOver' || st.phase === 'gameOver') {
      sel.clear();
      if (!overlay) overlay = 'round';
    }
    save();
    render();
    schedule();
  }

  // ---------- ovládání ----------
  // Který způsob vyložení vrchní karty z hromádky zvolit podle výběru.
  function pileVariant(meldId) {
    const ids = Array.from(sel);
    const melds = st.teams[st.players[ME].team].melds;
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
    if (kind === 'new') return E.meldNew(st, ME, v.ids, prefer);
    if (kind === 'add') return E.addToMeld(st, ME, v.meldId, v.ids, prefer);
    return E.takePile(st, ME, v.ids, v.meldId, prefer);
  }
  // Provede vykládku; když může žolík stát dole i nahoře, nejdřív se zeptá.
  function attempt(kind, v) {
    const chk = checkOf(kind, v);
    if (!chk.error && chk.a && chk.a.choice) {
      pending = { kind, v, choice: chk.a.choice, suit: chk.meld ? chk.meld.key : chk.a.key };
      overlay = 'wild';
      return null;
    }
    return runOf(kind, v);
  }

  function act(name, el) {
    let r = null;
    switch (name) {
      case 'menu': prevOverlay = null; overlay = 'menu'; break;
      case 'rules': prevOverlay = overlay; overlay = 'rules'; break;
      case 'settings': prevOverlay = overlay; overlay = 'settings'; break;
      case 'back': overlay = prevOverlay; prevOverlay = null; break;
      case 'showpile': overlay = 'pile'; break;
      case 'log': overlay = 'log'; break;
      case 'close': overlay = null; break;
      case 'openround': overlay = 'round'; break;
      case 'clearsel': sel.clear(); break;
      case 'lang':
        if (LANGS.includes(el.dataset.v)) { prefs.lang = el.dataset.v; savePrefs(); }
        break;
      case 'level':
        if (LEVELS.includes(el.dataset.v)) { prefs.level = el.dataset.v; savePrefs(); }
        break;
      case 'new1': newMatch('1v1'); overlay = null; break;
      case 'new2': newMatch('2v2'); overlay = null; break;
      case 'nextround':
        if (st.phase === 'roundOver') { E.startRound(st); sel.clear(); }
        overlay = null;
        break;
      case 'draw':
        if (!myTurn()) return;
        r = E.drawStock(st, ME);
        if (r.ok && r.red3) toast(t('toast_red3'), 'info');
        break;
      case 'pile':
        if (!myTurn()) return;
        r = attempt('pile', pileVariant(null));
        if (r && r.ok) sel.clear();
        break;
      case 'pass':
        if (!myTurn()) return;
        r = E.passEnd(st, ME);
        break;
      case 'meld':
        if (!myTurn()) return;
        r = attempt('new', { ids: Array.from(sel) });
        if (r && r.ok) sel.clear();
        break;
      case 'wildpick':
        if (!pending || !myTurn()) { pending = null; overlay = null; break; }
        r = runOf(pending.kind, pending.v, el.dataset.v === 'low' ? 'low' : 'high');
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
        r = E.discard(st, ME, Array.from(sel)[0]);
        if (r.ok) sel.clear();
        break;
      case 'undo':
        if (!myTurn()) return;
        r = E.undoTurn(st, ME);
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
    if (ev.target.id === 'overlay' && overlay && overlay !== 'start' && overlay !== 'round') {
      overlay = null;
      pending = null;
      render();
      schedule();
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
      window.claude.hot.snapshot(() => ({ st, mode, prefs }));
    }
    render();
    schedule();
  }

  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start);
  else start((window.claude && window.claude.hot && window.claude.hot.data) || {});
})();
