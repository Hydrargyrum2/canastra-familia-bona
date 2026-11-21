// Bobři a krysy – roboti. Hrají jen s tím, co by věděl hráč u stolu:
// své karty, které viděli, a co kdo veřejně bral z odkládací hromádky.
// Lehčí roboti zapomínají (paměť je omezená počtem vlastních tahů).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.BobriBot = factory(root.BobriEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  const LEVELS = {
    // mem: jak dlouho si pamatuje kartu (ve vlastních tazích), track: sleduje karty soupeřů
    easy: { mem: [1, 3], track: false, take: 2.5, swapIn: 1.5, unknownMax: 2, swapGain: 3, playAgain: 0.7, knockT: 12, knockU: 2, mistake: 0.2 },
    medium: { mem: [3, 7], track: true, take: 1.5, swapIn: 0.5, unknownMax: 3, swapGain: 2, playAgain: 1, knockT: 9, knockU: 1, mistake: 0.05 },
    hard: { mem: [999, 999], track: true, take: 1, swapIn: 0.5, unknownMax: 3, swapGain: 1, playAgain: 1, knockT: 7, knockU: 1, mistake: 0 },
  };
  let TUNE = {};

  function P(st, pi) {
    const lv = st.players[pi].bot || 'medium';
    return Object.assign({}, LEVELS[lv] || LEVELS.medium, TUNE[lv] || {});
  }

  // pevná „náhoda“ podle karty a času: stejné zapomenutí při každém výpočtu
  function hash(a, b, c) {
    let h = (a + 1) * 2654435761 ^ (b + 7) * 40503 ^ (c + 3) * 9973;
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }
  function remembers(st, b, k, prm) {
    if (!k) return false;
    const [lo, hi] = prm.mem;
    if (lo >= 999) return true;
    const span = (lo + hash(k.id, k.at, b) * (hi - lo)) * st.players.length;
    return st.clock - k.at <= span;
  }

  // Co robot b ví o kartě hráče p na místě s (null = neví).
  function seen(st, b, p, s, prm) {
    if (p !== b && !prm.track) return null;
    const k = st.know[b][p][s];
    if (!remembers(st, b, k, prm)) return null;
    return st.players[p].cards[s];
  }

  // Průměr čísel, která robot ještě neviděl (neznámá karta má v průměru tuto hodnotu).
  function unknownMean(st, b, prm) {
    if (!prm.track) return 5;
    const left = new Map();
    for (const c of E.DECK) if (E.isNumber(c)) left.set(c.id, c.v);
    for (const c of st.discard) left.delete(c.id);
    for (const c of st.aside) left.delete(c.id);
    if (st.current === b && st.drawn) left.delete(st.drawn.id);
    for (let p = 0; p < st.players.length; p++) for (let s = 0; s < E.SLOTS; s++) {
      const c = seen(st, b, p, s, prm);
      if (c) left.delete(c.id);
    }
    if (!left.size) return 4.5;
    let sum = 0;
    for (const v of left.values()) sum += v;
    return sum / left.size;
  }

  // hodnoty vlastních karet z pohledu robota
  function myView(st, b, prm, mean) {
    return st.players[b].cards.map((_, s) => {
      const c = seen(st, b, b, s, prm);
      if (!c) return { s, val: mean, known: false };
      return { s, val: E.isAction(c) ? mean : c.v, known: true };
    });
  }

  // nejlepší místo pro číslo v: kde se nejvíc ušetří (neznámá karta má malý bonus za informaci)
  function bestSlot(view, v) {
    let best = null;
    for (const x of view) {
      const gain = x.val - v + (x.known ? 0 : 0.3);
      if (!best || gain > best.gain) best = { s: x.s, gain, known: x.known };
    }
    return best;
  }

  function estTotal(view) {
    return { t: view.reduce((a, x) => a + x.val, 0), u: view.filter((x) => !x.known).length };
  }

  // nejvýhodnější výměna se soupeřem: můj nejhorší za jeho nejlepší (co o něm víme)
  function bestExchange(st, b, prm, view, mean) {
    let best = null;
    const leader = Math.min(...st.players.map((p, i) => (i === b ? Infinity : p.total)));
    for (let o = 0; o < st.players.length; o++) {
      if (o === b) continue;
      for (let s2 = 0; s2 < E.SLOTS; s2++) {
        const c = seen(st, b, o, s2, prm);
        const theirs = c ? (E.isAction(c) ? mean : c.v) : mean;
        for (const x of view) {
          let gain = x.val - theirs;
          // když se ví, co soupeř dostane, a je to vedoucí hráč nebo ten, kdo zaklepal, je to bonus navíc
          if (st.players[o].total === leader) gain += 0.3;
          if (st.knocker === o) gain += 0.5;
          if (!x.known && !c) gain -= 0.5; // naslepo za naslepo moc nedává
          if (!best || gain > best.gain) best = { mySlot: x.s, oPi: o, oSlot: s2, gain };
        }
      }
    }
    return best;
  }

  function knockDecision(st, b, prm, viewAfter) {
    if (!E.canKnock(st, b)) return false;
    const { t, u } = estTotal(viewAfter);
    const n = st.players.length;
    let limit = prm.knockT;
    if (st.turnNo >= 8 * n) limit += 3;
    if (st.turnNo >= 12 * n) limit += 6;
    return u <= prm.knockU && t <= limit;
  }

  const rnd = () => Math.random();

  // Jeden krok robota (jedna akce v engine). Vrací výsledek z engine.
  function step(st, b) {
    const prm = P(st, b);
    const mean = unknownMean(st, b, prm);
    const view = myView(st, b, prm, mean);
    const finalTurn = st.knocker !== null;
    const tk = (thr) => (finalTurn ? Math.min(thr, 0.5) : thr);
    const mistake = rnd() < prm.mistake;
    const after = (slot, v) => view.map((x) => (x.s === slot ? { s: slot, val: v, known: true } : x));
    const maybeKnock = (va) => { if (knockDecision(st, b, prm, va)) E.setKnock(st, b, true); };

    if (st.phase === 'turn') {
      const top = E.topDiscard(st);
      if (E.canTakeDiscard(st) && !mistake) {
        const bs = bestSlot(view, top.v);
        const okKnown = bs.known && bs.gain >= tk(prm.take);
        const okUnknown = !bs.known && top.v <= prm.unknownMax && bs.gain >= tk(prm.take);
        if (okKnown || okUnknown) {
          maybeKnock(after(bs.s, top.v));
          return E.takeDiscard(st, b, bs.s);
        }
      }
      return E.drawCard(st, b);
    }

    if (st.phase === 'drawn') {
      const c = st.drawn;
      if (E.isNumber(c)) {
        const bs = bestSlot(view, c.v);
        const want = mistake ? rnd() < 0.5 : bs.gain >= tk(prm.swapIn);
        const slot = mistake ? Math.floor(rnd() * E.SLOTS) : bs.s;
        if (want) { maybeKnock(after(slot, c.v)); return E.swapDrawn(st, b, slot); }
        if (st.again !== 1) maybeKnock(view);
        return E.discardDrawn(st, b);
      }
      // akční karta
      let play = false;
      if (c.a === 'spy') play = view.some((x) => !x.known);
      else if (c.a === 'swap') { const ex = bestExchange(st, b, prm, view, mean); play = !!ex && ex.gain >= prm.swapGain; }
      else if (c.a === 'again') play = rnd() < prm.playAgain;
      if (mistake) play = rnd() < 0.5;
      if (play) return E.playDrawn(st, b);
      if (st.again !== 1) maybeKnock(view);
      return E.discardDrawn(st, b);
    }

    if (st.phase === 'spy') {
      const unk = view.filter((x) => !x.known);
      const pick = unk.length ? (unk.find((x) => x.s === 1 || x.s === 2) || unk[0]).s : view.reduce((a, x) => (x.val > a.val ? x : a)).s;
      const card = st.players[b].cards[pick];
      maybeKnock(view.map((x) => (x.s === pick ? { s: pick, val: E.isAction(card) ? mean : card.v, known: true } : x)));
      return E.spy(st, b, pick);
    }

    if (st.phase === 'swap') {
      let ex = bestExchange(st, b, prm, view, mean);
      if (mistake || !ex) {
        const others = st.players.map((_, i) => i).filter((i) => i !== b);
        ex = { mySlot: Math.floor(rnd() * E.SLOTS), oPi: others[Math.floor(rnd() * others.length)], oSlot: Math.floor(rnd() * E.SLOTS) };
      }
      const got = seen(st, b, ex.oPi, ex.oSlot, prm);
      maybeKnock(view.map((x) => (x.s === ex.mySlot ? (got ? { s: x.s, val: E.isAction(got) ? mean : got.v, known: true } : { s: x.s, val: mean, known: false }) : x)));
      return E.exchange(st, b, ex.mySlot, ex.oPi, ex.oSlot);
    }
    return { ok: false, error: 'bad_phase' };
  }

  return { step, LEVELS, setTune: (t) => { TUNE = t || {}; }, seen, unknownMean };
});
