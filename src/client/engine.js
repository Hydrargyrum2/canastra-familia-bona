/* Kanasta – herní logika (pravidla podle dokumentu „Brazilská kanasta – naše pravidla“).
   Čistý JS bez závislostí; běží v prohlížeči i v Node. */
(function (root) {
  'use strict';

  const SUITS = ['S', 'H', 'C', 'D'];
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const ORDER = ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']; // 4 nejnižší, eso nejvyšší
  const SET_RANKS = ['K', 'A', '4'];
  const M = (k, p) => ({ k, p: p || {} }); // zpráva pro překlad: klíč + parametry
  const RULES = { target: 4000, openThreshold: 2000, openMin: 150, handSize: 13, canasta: 7, cutBonus: 100, cutJitter: 2 };

  // ---------- karty ----------
  function makeDeck() {
    const cards = [];
    let id = 0;
    for (let d = 0; d < 2; d++) {
      for (const s of SUITS) for (const r of RANKS) cards.push({ id: id++, r, s });
      cards.push({ id: id++, r: 'JK', s: null });
      cards.push({ id: id++, r: 'JK', s: null });
    }
    return cards; // 108 karet
  }
  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  const isWild = (c) => c.r === '2' || c.r === 'JK';
  const isThree = (c) => c.r === '3';
  const isRed3 = (c) => c.r === '3' && (c.s === 'H' || c.s === 'D');
  const isBlack3 = (c) => c.r === '3' && (c.s === 'S' || c.s === 'C');
  const blocksPile = (c) => isBlack3(c) || isWild(c);
  const pos = (c) => ORDER.indexOf(c.r);
  function cardValue(c) {
    if (isWild(c)) return 50;
    if (c.r === 'A') return 20;
    if (isThree(c)) return 0;
    return 10;
  }
  // body, které dostane ten, kdo zavřel, za kartu v ruce soupeře
  function captureValue(c) {
    if (isThree(c)) return 100;
    return cardValue(c);
  }
  const sumValue = (cards) => cards.reduce((s, c) => s + cardValue(c), 0);

  // ---------- vykládky ----------
  function layoutSeq(naturals, hasWild, fixedWildPos, prefer) {
    if (!naturals.length) return { error: M('seq_need_natural') };
    const suit = naturals[0].s;
    const ps = [];
    for (const c of naturals) {
      if (isWild(c) || isThree(c)) return { error: M('seq_bad_card') };
      if (c.s !== suit) return { error: M('seq_one_suit') };
      ps.push(pos(c));
    }
    ps.sort((a, b) => a - b);
    for (let i = 1; i < ps.length; i++) {
      if (ps[i] === ps[i - 1]) return { error: M('seq_dup') };
    }
    const min = ps[0];
    const max = ps[ps.length - 1];
    if (!hasWild) {
      if (max - min + 1 !== ps.length) return { error: M('seq_consecutive') };
      return { wildPos: null };
    }
    if (fixedWildPos != null) {
      if (ps.includes(fixedWildPos)) return { error: M('seq_wild_spot') };
      const all = ps.concat([fixedWildPos]);
      const mn = Math.min.apply(null, all);
      const mx = Math.max.apply(null, all);
      if (mx - mn + 1 !== all.length) return { error: M('seq_consecutive') };
      return { wildPos: fixedWildPos };
    }
    const gaps = max - min + 1 - ps.length;
    if (gaps === 1) {
      for (let p = min; p <= max; p++) if (!ps.includes(p)) return { wildPos: p };
    }
    if (gaps === 0) {
      // Žolík jde na konec postupky; pod čtyřku ani nad eso nejde. Když jdou oba konce, hráč si vybere.
      const canLow = min > 0;
      const canHigh = max < ORDER.length - 1;
      if (!canLow && !canHigh) return { error: M('seq_full') };
      let wp;
      if (prefer === 'low' && canLow) wp = min - 1;
      else if (prefer === 'high' && canHigh) wp = max + 1;
      else wp = canHigh ? max + 1 : min - 1;
      const res = { wildPos: wp };
      if (canLow && canHigh) res.choice = { low: min - 1, high: max + 1 };
      return res;
    }
    return { error: M('seq_one_gap') };
  }

  function analyzeNewMeld(cards, prefer) {
    if (cards.length < 3) return { error: M('meld_min3') };
    if (cards.some(isThree)) return { error: M('no_threes') };
    const wilds = cards.filter(isWild);
    const nat = cards.filter((c) => !isWild(c));
    if (wilds.length > 1) return { error: M('one_wild') };
    if (nat.length < 2) return { error: M('min2_natural') };
    if (nat.every((c) => c.r === nat[0].r)) {
      if (!SET_RANKS.includes(nat[0].r)) {
        return { error: M('set_ranks') };
      }
      return { type: 'set', key: nat[0].r, wildPos: null };
    }
    const lay = layoutSeq(nat, wilds.length === 1, null, prefer);
    if (lay.error) return lay;
    return { type: 'seq', key: nat[0].s, wildPos: lay.wildPos, choice: lay.choice };
  }

  function analyzeAdd(meld, cards, prefer) {
    if (!cards.length) return { error: M('select_first') };
    if (cards.some(isThree)) return { error: M('no_threes') };
    const newW = cards.filter(isWild);
    const newN = cards.filter((c) => !isWild(c));
    const hasW = meld.cards.some(isWild);
    if (newW.length + (hasW ? 1 : 0) > 1) return { error: M('one_wild') };
    if (meld.type === 'set') {
      if (newN.some((c) => c.r !== meld.key)) return { error: M('set_same_rank') };
      return { wildPos: null };
    }
    if (newN.some((c) => c.s !== meld.key)) return { error: M('seq_same_suit') };
    const nat = meld.cards.filter((c) => !isWild(c)).concat(newN);
    // Obyčejná karta smí zabrat místo žolíka; žolík se pak posune jinam ve stejné postupce.
    if (hasW && newN.some((c) => pos(c) === meld.wildPos)) {
      const lay = layoutSeq(nat, true, null, prefer);
      if (!lay.error) lay.moved = true;
      return lay;
    }
    const stay = layoutSeq(nat, hasW || newW.length === 1, hasW ? meld.wildPos : null, prefer);
    // Žolík, který už v postupce leží, se smí posunout (z kraje do mezery), aby přiložené karty zapadly.
    // Stejně jako u hromádky: když karty pasují i bez posunu, žolík zůstane, kde je.
    if (stay.error && hasW && !newW.length) {
      const lay = layoutSeq(nat, true, null, prefer);
      if (!lay.error) { lay.moved = true; return lay; }
    }
    return stay;
  }

  // Hromádka přiložením k vlastní vykládce: přikládá se jen samotná vrchní karta (z ruky nic).
  // Žolík, který už ve vykládce leží, se smí posunout, aby vrchní karta pasovala
  // (na její místo, nebo z kraje postupky na druhý kraj). Když pasuje i bez posunu, žolík zůstane.
  function analyzePileAdd(meld, top, prefer) {
    if (isThree(top) || isWild(top)) return { error: M('pile_no_use') };
    if (meld.type === 'set') return analyzeAdd(meld, [top], prefer);
    if (top.s !== meld.key) return { error: M('seq_same_suit') };
    const hasW = meld.cards.some(isWild);
    const nat = meld.cards.filter((c) => !isWild(c)).concat([top]);
    if (!hasW) return layoutSeq(nat, false, null, prefer);
    if (pos(top) !== meld.wildPos) {
      const stay = layoutSeq(nat, true, meld.wildPos, prefer);
      if (!stay.error) return stay;
    }
    const lay = layoutSeq(nat, true, null, prefer);
    if (!lay.error) lay.moved = true;
    return lay;
  }

  const isCanasta = (m) => m.cards.length >= RULES.canasta;
  const isClean = (m) => !m.cards.some(isWild);
  const hasCanasta = (team) => team.melds.some(isCanasta);

  // pořadí karet ve vykládce pro zobrazení
  function meldOrder(m) {
    if (m.type === 'set') {
      return m.cards.filter((c) => !isWild(c)).concat(m.cards.filter(isWild));
    }
    const slots = [];
    for (const c of m.cards) slots.push({ c, p: isWild(c) ? m.wildPos : pos(c) });
    slots.sort((a, b) => a.p - b.p);
    return slots.map((s) => s.c);
  }

  // ---------- stav hry ----------
  // opts.family: rodinná pravidla – los, kdo začne první kolo; sejmutí balíčku před každým
  // kolem (+100 za přesný počet); začínající hráč smí jednou vyměnit první líznutou kartu.
  function newGame(players, opts) {
    const family = !!(opts && opts.family);
    const n = players.length;
    const rng = (opts && opts.rng) || Math.random;
    return {
      family,
      players: players.map((p, i) => ({ name: p.name, isBot: !!p.isBot, hand: [], team: i % 2 })),
      teams: [0, 1].map(() => ({ score: 0, melds: [], red3: [], opened: false, needOpen: false })),
      stock: [],
      pile: [],
      current: 0,
      // startRound posune rozdávajícího o jedno; začíná hráč po něm
      dealer: family ? Math.floor(rng() * n) : players.length - 1,
      phase: 'new',
      round: 0,
      turn: null,
      nextMeldId: 1,
      log: [],
      lastRound: null,
      winner: null,
    };
  }

  function log(st, msg) {
    st.log.push(msg);
    if (st.log.length > 60) st.log.shift();
  }

  const needsOpen = (team) => team.needOpen && !team.opened;

  function startRound(st, rng) {
    rng = rng || Math.random;
    const n = st.players.length;
    st.round++;
    st.dealer = (st.dealer + 1) % n;
    st.stock = shuffle(makeDeck(), rng);
    st.pile = [];
    st.lastRound = null;
    for (const t of st.teams) {
      t.melds = [];
      t.red3 = [];
      t.opened = false;
      t.needOpen = t.score >= RULES.openThreshold;
    }
    for (const p of st.players) p.hand = [];
    st.cutInfo = null;
    st.current = (st.dealer + 1) % n;
    if (st.family) {
      // před rozdáním snímá balíček ten, kdo kolo začíná
      st.phase = 'cut';
      st.turn = null;
      log(st, M('log_cut_wait', { pi: st.current }));
      return;
    }
    dealRound(st);
  }

  function dealRound(st) {
    const n = st.players.length;
    for (let k = 0; k < RULES.handSize; k++) {
      for (let i = 1; i <= n; i++) st.players[(st.dealer + i) % n].hand.push(st.stock.pop());
    }
    for (let i = 0; i < n; i++) {
      const found = layRed3s(st, i);
      if (found) log(st, M('log_red3', { pi: i, n: found }));
    }
    st.current = (st.dealer + 1) % n;
    log(st, M('log_round_start', { round: st.round, pi: st.current }));
    beginTurn(st);
    if (st.family) st.turn.canRedraw = true;
  }

  // Sejmutí balíčku: hráč ukáže, kolik karet má zůstat dole (aim); ruka se trochu „zachvěje“.
  // Když dole zbude přesně tolik, kolik se rozdává (13 × počet hráčů), dostane jeho tým +100.
  function cutDeck(st, pi, aim, rng) {
    if (st.phase !== 'cut' || st.current !== pi) return fail(M('not_your_turn'));
    rng = rng || Math.random;
    const total = st.stock.length;
    const target = RULES.handSize * st.players.length;
    let a = Math.round(Number(aim));
    if (!Number.isFinite(a)) a = target;
    a = Math.max(1, Math.min(total - 1, a));
    const j = RULES.cutJitter;
    const left = Math.max(1, Math.min(total - 1, a + Math.floor(rng() * (2 * j + 1)) - j));
    const hit = left === target;
    const team = st.players[pi].team;
    if (hit) st.teams[team].score += RULES.cutBonus;
    st.cutInfo = { pi, team, left, target, hit, total, round: st.round };
    log(st, M(hit ? 'log_cut_hit' : 'log_cut', { pi, left, target, bonus: RULES.cutBonus }));
    dealRound(st);
    return ok({ left, hit });
  }

  // Začínající hráč smí jednou za kolo, hned po prvním líznutí, líznutou kartu odložit na hromádku
  // a líznout si jinou (dokud nic nevyložil).
  function canRedraw(st, pi) {
    const t = st.turn;
    if (!t || !t.canRedraw || st.phase !== 'play' || st.current !== pi || t.from !== 'stock' || t.laid) return false;
    return !!st.stock.length && st.players[pi].hand.some((c) => c.id === t.drawnId);
  }
  function redraw(st, pi) {
    if (!canRedraw(st, pi)) return fail(M('cant_redraw'));
    const p = st.players[pi];
    const idx = p.hand.findIndex((c) => c.id === st.turn.drawnId);
    const old = p.hand.splice(idx, 1)[0];
    st.pile.push(old);
    st.turn.canRedraw = false;
    const before = new Set(p.hand.map((x) => x.id));
    p.hand.push(st.stock.pop());
    const red = layRed3s(st, pi);
    st.turn.newIds = p.hand.filter((x) => !before.has(x.id)).map((x) => x.id);
    st.turn.drawnId = p.hand.length ? p.hand[p.hand.length - 1].id : null;
    st.turn.snap = snapshot(st);
    log(st, M('log_redraw', { pi, card: { r: old.r, s: old.s }, red }));
    return ok({ red3: red });
  }

  function layRed3s(st, pi) {
    const p = st.players[pi];
    const team = st.teams[p.team];
    let found = 0;
    let idx;
    while ((idx = p.hand.findIndex(isRed3)) !== -1) {
      team.red3.push(p.hand.splice(idx, 1)[0]);
      found++;
      if (st.stock.length) p.hand.push(st.stock.pop());
    }
    return found;
  }

  function beginTurn(st) {
    st.phase = 'draw';
    st.turn = {
      from: null,
      mustMeld: null,
      laid: 0,
      pileForbidden: false,
      lastTurn: st.stock.length === 0,
      snap: null,
      newIds: [],
    };
    if (st.turn.lastTurn && pileError(st, st.current)) {
      log(st, M('log_stock_out_nopile'));
      endRound(st, null);
    }
  }

  function snapshot(st) {
    const turn = Object.assign({}, st.turn, { snap: null });
    return JSON.stringify({
      hands: st.players.map((p) => p.hand),
      teams: st.teams,
      stock: st.stock,
      pile: st.pile,
      phase: st.phase,
      nextMeldId: st.nextMeldId,
      turn,
    });
  }
  function restore(st, s) {
    const o = JSON.parse(s);
    st.players.forEach((p, i) => { p.hand = o.hands[i]; });
    st.teams = o.teams;
    st.stock = o.stock;
    st.pile = o.pile;
    st.phase = o.phase;
    st.nextMeldId = o.nextMeldId;
    st.turn = o.turn;
    st.turn.snap = s;
  }

  const ok = (extra) => Object.assign({ ok: true }, extra || {});
  const fail = (error) => ({ ok: false, error });

  function pickCards(hand, ids) {
    const out = [];
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) return null;
      seen.add(id);
      const c = hand.find((x) => x.id === id);
      if (!c) return null;
      out.push(c);
    }
    return out;
  }
  function removeFromHand(p, ids) {
    p.hand = p.hand.filter((c) => !ids.includes(c.id));
  }

  // ---------- odhazovací hromádka ----------
  function pileError(st, pi) {
    if (st.phase !== 'draw' || st.current !== pi) return M('not_your_turn');
    if (st.turn.pileForbidden) return M('pile_returned');
    if (!st.pile.length) return M('pile_empty');
    const top = st.pile[st.pile.length - 1];
    if (blocksPile(top)) return M('pile_blocked');
    const p = st.players[pi];
    const team = st.teams[p.team];
    if (team.melds.some((m) => !analyzePileAdd(m, top).error)) return null;
    if (canFormWith(top, p.hand)) return null;
    return M('pile_no_use');
  }
  function canFormWith(top, hand) {
    const cand = hand.filter((c) => !isThree(c));
    for (let i = 0; i < cand.length; i++) {
      for (let j = i + 1; j < cand.length; j++) {
        if (!analyzeNewMeld([top, cand[i], cand[j]]).error) return true;
      }
    }
    return false;
  }

  // ---------- akce ----------
  function drawStock(st, pi) {
    if (st.phase !== 'draw' || st.current !== pi) return fail(M('cant_draw'));
    if (!st.stock.length) return fail(M('stock_empty'));
    const p = st.players[pi];
    const before = new Set(p.hand.map((c) => c.id));
    const c = st.stock.pop();
    p.hand.push(c);
    const red = layRed3s(st, pi);
    st.turn.newIds = p.hand.filter((x) => !before.has(x.id)).map((x) => x.id);
    st.turn.drawnId = p.hand.length ? p.hand[p.hand.length - 1].id : null;
    st.turn.from = 'stock';
    st.phase = 'play';
    st.turn.snap = snapshot(st);
    log(st, red ? M('log_draw_red', { pi, n: red }) : M('log_draw', { pi }));
    // Poslední karta byla červená trojka a hráč bez canasty drží jedinou kartu: nemá žádný platný tah.
    if (!st.stock.length && p.hand.length === 1 && !hasCanasta(st.teams[p.team])) {
      log(st, M('log_stock_out'));
      endRound(st, null);
    }
    return ok({ red3: red });
  }

  // Ověří konkrétní způsob, jak vrchní kartu hned vyložit: s kartami z ruky (ids)
  // jako novou vykládku, nebo přiložit (s ids) k vlastní vykládce meldId.
  function checkTakePile(st, pi, ids, meldId, prefer) {
    if (st.current !== pi) return { error: M('not_your_turn') };
    const e = pileError(st, pi);
    if (e) return { error: e };
    const p = st.players[pi];
    const team = st.teams[p.team];
    const top = st.pile[st.pile.length - 1];
    const handCards = pickCards(p.hand, ids || []);
    if (!handCards) return { error: M('invalid_selection') };
    const cards = [top].concat(handCards);
    const rest = st.pile.length - 1;
    const remaining = p.hand.length - handCards.length + rest;
    let meld = null;
    let a;
    if (meldId != null) {
      meld = team.melds.find((m) => m.id === meldId);
      if (!meld) return { error: M('own_melds_only') };
      if (handCards.length) return { error: M('pile_add_alone') };
      a = analyzePileAdd(meld, top, prefer);
    } else {
      if (handCards.length < 2) {
        return { error: M('pile_pick_cards') };
      }
      a = analyzeNewMeld(cards, prefer);
    }
    if (a.error) return { error: a.error };
    const canastaAfter = hasCanasta(team) || (meld ? meld.cards.length : 0) + cards.length >= RULES.canasta;
    if (remaining <= 1 && !canastaAfter) return { error: M('keep_two') };
    if (remaining === 0 && needsOpen(team) && sumValue(cards) < RULES.openMin) {
      return { error: M('open_min_short', { min: RULES.openMin }) };
    }
    return { top, handCards, cards, meld, a };
  }

  // Vezme hromádku: vrchní karta jde rovnou na stůl, zbytek do ruky.
  function takePile(st, pi, ids, meldId, prefer) {
    const chk = checkTakePile(st, pi, ids, meldId, prefer);
    if (chk.error) return fail(chk.error);
    st.turn.snap = snapshot(st);
    const p = st.players[pi];
    const team = st.teams[p.team];
    const count = st.pile.length;
    st.pile.pop();
    removeFromHand(p, chk.handCards.map((c) => c.id));
    let targetId;
    if (chk.meld) {
      chk.meld.cards = chk.meld.cards.concat(chk.cards);
      if (chk.meld.type === 'seq') chk.meld.wildPos = chk.a.wildPos;
      targetId = chk.meld.id;
    } else {
      const meld = { id: st.nextMeldId++, type: chk.a.type, key: chk.a.key, wildPos: chk.a.wildPos, cards: chk.cards };
      team.melds.push(meld);
      targetId = meld.id;
    }
    st.turn.laid += sumValue(chk.cards);
    st.turn.newIds = st.pile.map((c) => c.id);
    p.hand = p.hand.concat(st.pile);
    st.pile = [];
    st.turn.mustMeld = null;
    st.turn.from = 'pile';
    st.phase = 'play';
    log(st, M('log_take_pile', {
      pi, card: { r: chk.top.r, s: chk.top.s }, n: count,
      add: !!chk.meld, with: chk.handCards.map((c) => ({ r: c.r, s: c.s })),
    }));
    if (chk.a.moved) log(st, M('log_wild_moved', { pi }));
    return afterLay(st, pi, { meldId: targetId });
  }

  function passEnd(st, pi) {
    if (st.phase !== 'draw' || st.current !== pi) return fail(M('not_your_turn'));
    if (st.stock.length) return fail(M('stock_not_empty'));
    log(st, M('log_pass', { pi }));
    endRound(st, null);
    return ok();
  }

  function layError(st, pi, cards, canastaAfter) {
    const p = st.players[pi];
    const team = st.teams[p.team];
    const remaining = p.hand.length - cards.length;
    if (remaining <= 1 && !canastaAfter) return M('keep_two');
    if (remaining === 0 && needsOpen(team)) {
      const v = st.turn.laid + sumValue(cards);
      if (v < RULES.openMin) return M('open_min', { min: RULES.openMin, v });
    }
    return null;
  }

  function checkMeldNew(st, pi, ids, prefer) {
    if (st.phase !== 'play' || st.current !== pi) return { error: M('cant_meld') };
    const p = st.players[pi];
    const cards = pickCards(p.hand, ids);
    if (!cards) return { error: M('invalid_selection') };
    const a = analyzeNewMeld(cards, prefer);
    if (a.error) return a;
    const team = st.teams[p.team];
    const le = layError(st, pi, cards, hasCanasta(team) || cards.length >= RULES.canasta);
    if (le) return { error: le };
    return { cards, a };
  }

  function meldNew(st, pi, ids, prefer) {
    const chk = checkMeldNew(st, pi, ids, prefer);
    if (chk.error) return fail(chk.error);
    const p = st.players[pi];
    const team = st.teams[p.team];
    removeFromHand(p, ids);
    const meld = { id: st.nextMeldId++, type: chk.a.type, key: chk.a.key, wildPos: chk.a.wildPos, cards: chk.cards };
    team.melds.push(meld);
    st.turn.laid += sumValue(chk.cards);
    log(st, M(meld.type === 'set' ? 'log_meld_set' : 'log_meld_seq', { pi, n: chk.cards.length }));
    return afterLay(st, pi, { meldId: meld.id });
  }

  function checkAdd(st, pi, meldId, ids, prefer) {
    if (st.phase === 'draw' && st.current === pi) return { error: M('draw_first_add') };
    if (st.phase !== 'play' || st.current !== pi) return { error: M('cant_meld') };
    const p = st.players[pi];
    const team = st.teams[p.team];
    const meld = team.melds.find((m) => m.id === meldId);
    if (!meld) return { error: M('own_melds_only') };
    const cards = pickCards(p.hand, ids);
    if (!cards) return { error: M('invalid_selection') };
    const a = analyzeAdd(meld, cards, prefer);
    if (a.error) return a;
    const canastaAfter = hasCanasta(team) || meld.cards.length + cards.length >= RULES.canasta;
    const le = layError(st, pi, cards, canastaAfter);
    if (le) return { error: le };
    return { cards, a, meld };
  }

  function addToMeld(st, pi, meldId, ids, prefer) {
    const chk = checkAdd(st, pi, meldId, ids, prefer);
    if (chk.error) return fail(chk.error);
    const p = st.players[pi];
    removeFromHand(p, ids);
    const wasCanasta = isCanasta(chk.meld);
    chk.meld.cards = chk.meld.cards.concat(chk.cards);
    if (chk.meld.type === 'seq') chk.meld.wildPos = chk.a.wildPos;
    st.turn.laid += sumValue(chk.cards);
    if (chk.a.moved) log(st, M('log_wild_moved', { pi }));
    log(st, M(!wasCanasta && isCanasta(chk.meld) ? 'log_add_canasta' : 'log_add', { pi, n: chk.cards.length }));
    return afterLay(st, pi, { meldId });
  }

  function afterLay(st, pi, extra) {
    const p = st.players[pi];
    if (!p.hand.length) {
      const team = st.teams[p.team];
      if (needsOpen(team)) team.opened = true;
      log(st, M('log_out', { pi }));
      endRound(st, p.team);
    }
    return ok(extra);
  }

  function discardError(st, pi, id) {
    if (st.phase !== 'play' || st.current !== pi) return M('cant_discard');
    const p = st.players[pi];
    const team = st.teams[p.team];
    if (!p.hand.some((c) => c.id === id)) return M('not_your_card');
    if (st.turn.mustMeld != null && p.hand.some((c) => c.id === st.turn.mustMeld)) {
      return M('must_meld_top');
    }
    if (needsOpen(team) && st.turn.laid > 0 && st.turn.laid < RULES.openMin) {
      return M('open_min_undo', { min: RULES.openMin, v: st.turn.laid });
    }
    if (p.hand.length === 1 && !hasCanasta(team)) return M('last_card_no_canasta');
    return null;
  }

  function discard(st, pi, id) {
    const e = discardError(st, pi, id);
    if (e) return fail(e);
    const p = st.players[pi];
    const team = st.teams[p.team];
    if (needsOpen(team) && st.turn.laid >= RULES.openMin) team.opened = true;
    const idx = p.hand.findIndex((c) => c.id === id);
    const c = p.hand.splice(idx, 1)[0];
    st.pile.push(c);
    log(st, M('log_discard', { pi, card: { r: c.r, s: c.s } }));
    if (!p.hand.length) {
      log(st, M('log_out', { pi }));
      endRound(st, p.team);
      return ok();
    }
    if (st.turn.lastTurn) {
      log(st, M('log_stock_out'));
      endRound(st, null);
      return ok();
    }
    st.current = (st.current + 1) % st.players.length;
    beginTurn(st);
    return ok();
  }

  function undoTurn(st, pi) {
    if (st.phase !== 'play' || st.current !== pi) return fail(M('nothing_to_undo'));
    if (!st.turn.snap) return fail(M('nothing_to_undo'));
    const wasPile = st.turn.from === 'pile';
    restore(st, st.turn.snap);
    if (wasPile) {
      st.turn.pileForbidden = true;
      st.turn.snap = null;
      log(st, M('log_undo_pile', { pi }));
      if (st.turn.lastTurn) {
        log(st, M('log_stock_out'));
        endRound(st, null);
      }
    }
    return ok();
  }

  // ---------- konec kola ----------
  function endRound(st, closer) {
    const res = st.teams.map((t, ti) => {
      let cardsPts = 0;
      let canastaPts = 0;
      let canastas = 0;
      for (const m of t.melds) {
        cardsPts += sumValue(m.cards);
        if (isCanasta(m)) {
          canastas++;
          canastaPts += 100;
          if (isClean(m)) canastaPts += (m.cards.length - RULES.canasta) * 100;
        }
      }
      const red3Pts = canastas > 0 ? t.red3.length * 100 : 0;
      let capturePts = 0;
      if (closer === ti) {
        for (const p of st.players) if (p.team !== ti) for (const c of p.hand) capturePts += captureValue(c);
      }
      const cutPts = st.cutInfo && st.cutInfo.hit && st.cutInfo.team === ti && st.cutInfo.round === st.round ? RULES.cutBonus : 0;
      const total = cardsPts + canastaPts + red3Pts + capturePts + cutPts;
      return { cardsPts, canastaPts, canastas, red3: t.red3.length, red3Pts, capturePts, cutPts, total };
    });
    // body za sejmutí se připsaly hned na začátku kola
    res.forEach((r, i) => { st.teams[i].score += r.total - r.cutPts; });
    st.lastRound = { closer, teams: res };
    st.phase = 'roundOver';
    const scores = st.teams.map((t) => t.score);
    if (Math.max(scores[0], scores[1]) >= RULES.target) {
      st.phase = 'gameOver';
      st.winner = scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1;
    }
  }

  // ---------- popisky ----------
  const SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
  function cardName(c) {
    if (c.r === 'JK') return 'jokera';
    return c.r + SUIT_SYM[c.s];
  }

  function totalCards(st) {
    let n = st.stock.length + st.pile.length;
    for (const p of st.players) n += p.hand.length;
    for (const t of st.teams) {
      n += t.red3.length;
      for (const m of t.melds) n += m.cards.length;
    }
    return n;
  }

  const api = {
    M, SUITS, RANKS, ORDER, SET_RANKS, RULES, SUIT_SYM,
    makeDeck, shuffle, isWild, isThree, isRed3, isBlack3, blocksPile, pos, cardValue, captureValue, sumValue,
    layoutSeq, analyzeNewMeld, analyzeAdd, isCanasta, isClean, hasCanasta, meldOrder, needsOpen,
    newGame, startRound, pileError, checkTakePile, drawStock, takePile, passEnd, checkMeldNew, meldNew, checkAdd, addToMeld,
    discardError, discard, undoTurn, cardName, totalCards, cutDeck, canRedraw, redraw, analyzePileAdd,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
