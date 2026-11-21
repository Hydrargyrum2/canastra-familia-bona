// Bobři a krysy – pravidla hry (čistá logika bez UI, běží v prohlížeči i v Node).
// Každý má před sebou 4 karty lícem dolů, na začátku kola smí vidět jen dvě krajní.
// Cíl: na konci kola co nejnižší součet. Akční karty: výměna, kouknutí, druhá šance.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BobriEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SLOTS = 4;
  const ACTIONS = { swap: 9, spy: 7, again: 5 };

  // 45 číselných karet (0–8 po čtyřech, devítek devět) + 21 akčních = 66
  function makeDeck() {
    const cards = [];
    let id = 0;
    for (let v = 0; v <= 8; v++) for (let k = 0; k < 4; k++) cards.push({ id: id++, v });
    for (let k = 0; k < 9; k++) cards.push({ id: id++, v: 9 });
    for (const a of Object.keys(ACTIONS)) for (let k = 0; k < ACTIONS[a]; k++) cards.push({ id: id++, a });
    return cards;
  }
  const DECK = makeDeck();
  const isAction = (c) => !!c && !!c.a;
  const isNumber = (c) => !!c && !c.a;

  // náhoda uložená ve stavu (stav jde uložit jako JSON a hra pokračuje stejně)
  function rand(st) {
    st.seed = (st.seed + 0x6D2B79F5) >>> 0;
    let t = st.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(st, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(st) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  const ok = (ev) => ({ ok: true, ev: ev || [] });
  const fail = (k) => ({ ok: false, error: k });

  function newGame(opts) {
    const players = opts.players.map((p) => ({ name: p.name, bot: p.bot || null, cards: [], total: 0, scores: [] }));
    const n = players.length;
    if (n < 2 || n > 6) throw new Error('2–6 hráčů');
    const st = {
      v: 1,
      seed: (opts.seed != null ? opts.seed : Math.floor(Math.random() * 4294967296)) >>> 0,
      players,
      rounds: n === 2 ? 4 : n,
      round: 0,
      dealer: 0,
      current: 0,
      phase: 'idle',
      draw: [],
      discard: [],
      aside: [],
      drawn: null,
      again: 0,
      turnNo: 0,
      clock: 0,
      knocker: null,
      finalLeft: 0,
      armed: false,
      know: [],
      log: [],
      lastRound: null,
    };
    st.dealer = Math.floor(rand(st) * n);
    startRound(st);
    return st;
  }

  // Nové kolo: zamíchat, rozdat po 4, otočit jednu kartu na odkládací hromádku.
  function startRound(st) {
    const n = st.players.length;
    st.round += 1;
    if (st.round > 1) st.dealer = (st.dealer + 1) % n;
    const deck = shuffle(st, DECK.map((c) => ({ ...c })));
    for (const p of st.players) p.cards = deck.splice(0, SLOTS);
    st.discard = [deck.pop()];
    st.draw = deck;
    st.aside = [];
    st.drawn = null;
    st.again = 0;
    st.turnNo = 0;
    st.knocker = null;
    st.finalLeft = 0;
    st.armed = false;
    st.current = (st.dealer + 1) % n;
    st.lastRound = null;
    // každý zná jen své dvě krajní karty
    st.know = st.players.map((_, o) => st.players.map((p, pi) => p.cards.map((c, s) => (o === pi && (s === 0 || s === SLOTS - 1) ? { id: c.id, at: st.clock } : null))));
    st.phase = 'peek';
    st.log = [{ k: 'round', round: st.round, pi: st.current }];
  }

  // po prohlédnutí krajních karet se začne hrát
  function beginTurns(st) {
    if (st.phase !== 'peek') return fail('bad_phase');
    st.phase = 'turn';
    return ok();
  }

  const topDiscard = (st) => st.discard[st.discard.length - 1] || null;
  const canTakeDiscard = (st) => isNumber(topDiscard(st));

  function drawOne(st) {
    if (!st.draw.length) {
      if (!st.discard.length) return null;
      st.draw = shuffle(st, st.discard);
      st.discard = [];
      st.log.push({ k: 'reshuffle' });
    }
    return st.draw.pop();
  }

  function guard(st, pi, phase) {
    if (st.current !== pi) return 'not_your_turn';
    if (Array.isArray(phase) ? !phase.includes(st.phase) : st.phase !== phase) return 'bad_phase';
    return null;
  }
  const validSlot = (s) => Number.isInteger(s) && s >= 0 && s < SLOTS;

  function learn(st, o, p, s, card) { st.know[o][p][s] = card ? { id: card.id, at: st.clock } : null; }
  function learnAll(st, p, s, card) { for (let o = 0; o < st.players.length; o++) learn(st, o, p, s, card); }

  // Možnost A: vrchní karta z odkládací hromádky (musí to být číslo) za jednu vlastní kartu.
  function takeDiscard(st, pi, slot) {
    const g = guard(st, pi, 'turn');
    if (g) return fail(g);
    if (!canTakeDiscard(st)) return fail('discard_action');
    if (!validSlot(slot)) return fail('bad_slot');
    const card = st.discard.pop();
    const old = st.players[pi].cards[slot];
    st.players[pi].cards[slot] = card;
    st.discard.push(old);
    learnAll(st, pi, slot, card); // všichni viděli, kam karta šla
    st.log.push({ k: 'take', pi, slot, card, old });
    const ev = [{ t: 'take', pi, slot, card }, { t: 'out', pi, slot, card: old }];
    return ok(ev.concat(finishTurn(st, pi)));
  }

  // Možnost B: líznout z balíčku (kartu vidí jen hráč).
  function drawCard(st, pi) {
    const g = guard(st, pi, 'turn');
    if (g) return fail(g);
    const card = drawOne(st);
    if (!card) return fail('empty');
    st.drawn = card;
    st.again = 0;
    st.phase = 'drawn';
    st.log.push({ k: 'draw', pi });
    return ok([{ t: 'draw', pi, card }]);
  }

  // Líznutou kartu odhodit. U první karty z druhé šance to znamená líznout ještě jednu.
  function discardDrawn(st, pi) {
    const g = guard(st, pi, 'drawn');
    if (g) return fail(g);
    const card = st.drawn;
    st.discard.push(card);
    st.drawn = null;
    if (st.again === 1) {
      const next = drawOne(st);
      st.log.push({ k: 'reject', pi, card });
      if (!next) return ok([{ t: 'discard', pi, card }].concat(finishTurn(st, pi)));
      st.drawn = next;
      st.again = 2;
      return ok([{ t: 'discard', pi, card }, { t: 'draw', pi, card: next }]);
    }
    st.log.push({ k: 'discard', pi, card });
    return ok([{ t: 'discard', pi, card }].concat(finishTurn(st, pi)));
  }

  // Líznuté číslo vyměnit za vlastní kartu (stará jde lícem nahoru na hromádku).
  function swapDrawn(st, pi, slot) {
    const g = guard(st, pi, 'drawn');
    if (g) return fail(g);
    if (!isNumber(st.drawn)) return fail('action_not_number');
    if (!validSlot(slot)) return fail('bad_slot');
    const card = st.drawn;
    const old = st.players[pi].cards[slot];
    st.players[pi].cards[slot] = card;
    st.discard.push(old);
    st.drawn = null;
    for (let o = 0; o < st.players.length; o++) learn(st, o, pi, slot, o === pi ? card : null);
    st.log.push({ k: 'swapin', pi, slot, old });
    const ev = [{ t: 'swapin', pi, slot, card }, { t: 'out', pi, slot, card: old }];
    return ok(ev.concat(finishTurn(st, pi)));
  }

  // Líznutou akční kartu zahrát (jde lícem nahoru na hromádku).
  function playDrawn(st, pi) {
    const g = guard(st, pi, 'drawn');
    if (g) return fail(g);
    if (!isAction(st.drawn)) return fail('not_action');
    const card = st.drawn;
    st.discard.push(card);
    st.drawn = null;
    st.log.push({ k: 'play', pi, card });
    const ev = [{ t: 'play', pi, card }];
    if (card.a === 'spy') { st.phase = 'spy'; return ok(ev); }
    if (card.a === 'swap') { st.phase = 'swap'; return ok(ev); }
    // druhá šance: líznout; když se karta nelíbí, odhodit a líznout ještě jednu
    const next = drawOne(st);
    if (!next) return ok(ev.concat(finishTurn(st, pi)));
    st.drawn = next;
    st.again = 1;
    st.phase = 'drawn';
    return ok(ev.concat([{ t: 'draw', pi, card: next }]));
  }

  // Kouknutí: podívat se na jednu vlastní kartu.
  function spy(st, pi, slot) {
    const g = guard(st, pi, 'spy');
    if (g) return fail(g);
    if (!validSlot(slot)) return fail('bad_slot');
    const card = st.players[pi].cards[slot];
    learn(st, pi, pi, slot, card);
    st.log.push({ k: 'spy', pi, slot });
    return ok([{ t: 'spy', pi, slot, card }].concat(finishTurn(st, pi)));
  }

  // Výměna: vlastní kartu za kartu jiného hráče, naslepo. Kdo kartu znal, ví, kam odešla.
  function exchange(st, pi, mySlot, oPi, oSlot) {
    const g = guard(st, pi, 'swap');
    if (g) return fail(g);
    if (!validSlot(mySlot) || !validSlot(oSlot) || oPi === pi || !st.players[oPi]) return fail('bad_slot');
    const a = st.players[pi].cards[mySlot];
    st.players[pi].cards[mySlot] = st.players[oPi].cards[oSlot];
    st.players[oPi].cards[oSlot] = a;
    for (let o = 0; o < st.players.length; o++) {
      const k = st.know[o];
      [k[pi][mySlot], k[oPi][oSlot]] = [k[oPi][oSlot], k[pi][mySlot]];
    }
    st.log.push({ k: 'exchange', pi, mySlot, oPi, oSlot });
    return ok([{ t: 'exchange', pi, mySlot, oPi, oSlot }].concat(finishTurn(st, pi)));
  }

  // Zaklepat se smí po svém tahu, až když každý odehrál aspoň jeden tah.
  const knockAllowedAfterTurn = (st) => st.knocker === null && st.turnNo + 1 >= st.players.length;
  function canKnock(st, pi) {
    return st.current === pi && ['turn', 'drawn', 'spy', 'swap'].includes(st.phase) && knockAllowedAfterTurn(st);
  }
  function setKnock(st, pi, on) {
    if (on && !canKnock(st, pi)) return fail('cant_knock');
    if (st.current !== pi) return fail('not_your_turn');
    st.armed = !!on;
    return ok();
  }

  function finishTurn(st, pi) {
    const ev = [];
    const n = st.players.length;
    st.drawn = null;
    st.again = 0;
    if (st.armed && knockAllowedAfterTurn(st)) {
      st.knocker = pi;
      st.finalLeft = n - 1;
      st.log.push({ k: 'knock', pi });
      ev.push({ t: 'knock', pi });
    } else if (st.knocker !== null && pi !== st.knocker) {
      st.finalLeft -= 1;
    }
    st.armed = false;
    st.turnNo += 1;
    st.clock += 1;
    if (st.knocker !== null && st.finalLeft <= 0) {
      ev.push(...endRound(st));
      return ev;
    }
    st.current = (pi + 1) % n;
    st.phase = 'turn';
    ev.push({ t: 'next', pi: st.current });
    return ev;
  }

  // Konec kola: akční karty v řadě se nahradí kartami z balíčku (dokud nepadne číslo),
  // počínaje tím, kdo zaklepal. Body = součet čtyř karet.
  function endRound(st) {
    const n = st.players.length;
    const start = st.knocker !== null ? st.knocker : st.current;
    const replaced = st.players.map(() => []);
    for (let k = 0; k < n; k++) {
      const pi = (start + k) % n;
      const p = st.players[pi];
      for (let s = 0; s < SLOTS; s++) {
        if (!isAction(p.cards[s])) continue;
        const from = p.cards[s];
        st.aside.push(from);
        const tried = [];
        let c = drawOne(st);
        while (c && isAction(c)) { st.aside.push(c); tried.push(c); c = drawOne(st); }
        p.cards[s] = c || { id: -1 - s - pi * 10, v: 0 };
        replaced[pi].push({ slot: s, from, tried, to: p.cards[s] });
      }
    }
    const scores = st.players.map((p) => p.cards.reduce((a, c) => a + (c.v || 0), 0));
    st.players.forEach((p, i) => { p.scores.push(scores[i]); p.total += scores[i]; });
    st.lastRound = { round: st.round, knocker: st.knocker, cards: st.players.map((p) => p.cards.map((c) => ({ ...c }))), replaced, scores };
    st.phase = st.round >= st.rounds ? 'gameOver' : 'roundOver';
    st.log.push({ k: 'roundEnd', scores });
    return [{ t: 'roundEnd' }];
  }

  function nextRound(st) {
    if (st.phase !== 'roundOver') return fail('bad_phase');
    startRound(st);
    return ok();
  }

  // pořadí na konci hry: nejméně bodů vyhrává
  function standings(st) {
    return st.players.map((p, i) => ({ i, total: p.total })).sort((a, b) => a.total - b.total || a.i - b.i);
  }

  return {
    SLOTS, ACTIONS, DECK, isAction, isNumber, newGame, startRound, beginTurns, topDiscard, canTakeDiscard,
    takeDiscard, drawCard, discardDrawn, swapDrawn, playDrawn, spy, exchange, canKnock, setKnock, nextRound, standings, rand,
  };
});
