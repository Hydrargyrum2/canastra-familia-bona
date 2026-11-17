/* Kanasta – robot. Vidí jen svou ruku a veřejné informace na stole
   (vykládky, počty karet v rukou, odhazovací hromádku a co kdo odhodil).

   Taktika, zhruba jako u člověka:
   - Dokud soupeř nehrozí zavřením, drží kombinace v ruce: soupeř neví, co sbírá,
     a sám má z čeho brát hromádku. Vykládá hlavně to, co hned dělá canastu
     nebo prodlužuje čistou canastu (+100 za každou kartu).
   - Čím blíž je soupeř k zavření (má canastu a málo karet) nebo konec balíčku,
     tím víc vykládá, aby mu body nepropadly.
   - Hromádku bere, jen když se vyplatí. Černé trojky v ní jsou riziko 100 bodů
     za kus, když soupeř zavře dřív, než je stihne odhodit.
   - Neodhazuje karty, které soupeř může přiložit, rád odhazuje to, co soupeř
     sám odhodil, a černou trojku si šetří na chvíli, kdy je co blokovat. */
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.Engine;

  function clone(st) {
    return JSON.parse(JSON.stringify(Object.assign({}, st, { log: [] })));
  }
  function range(a, b) {
    const r = [];
    for (let i = a; i <= b; i++) r.push(i);
    return r;
  }
  const isNat = (c) => !E.isWild(c) && !E.isThree(c);

  // ---------- situace u stolu ----------
  function oppInfo(st, pi) {
    const me = st.players[pi];
    const ot = st.teams[1 - me.team];
    const opps = st.players.filter((p) => p.team !== me.team);
    return {
      minHand: Math.min.apply(null, opps.map((p) => p.hand.length)),
      can: E.hasCanasta(ot),
      nearCan: ot.melds.some((m) => m.cards.length >= 5),
      turnsLeft: st.stock.length / st.players.length,
    };
  }
  // 0 klid, 1 pozor, 2 soupeř může brzy zavřít, 3 hned.
  function dangerLevel(st, pi) {
    const o = oppInfo(st, pi);
    if ((o.can && o.minHand <= 3) || o.turnsLeft <= 2) return 3;
    if ((o.can && o.minHand <= 6) || (o.nearCan && o.minHand <= 4) || o.turnsLeft <= 5) return 2;
    if (o.can || (o.nearCan && o.minHand <= 8) || o.turnsLeft <= 10) return 1;
    return 0;
  }

  // ---------- možné vykládky ----------
  function candidateMelds(hand, allowWild) {
    const out = [];
    const nat = hand.filter(isNat);
    const wild = allowWild ? hand.find(E.isWild) : null;
    for (const r of E.SET_RANKS) {
      const g = nat.filter((c) => c.r === r);
      if (g.length >= 3) out.push(g.map((c) => c.id));
      else if (wild && g.length === 2) out.push(g.map((c) => c.id).concat(wild.id));
    }
    for (const s of E.SUITS) {
      const byPos = new Map();
      for (const c of nat) {
        if (c.s !== s) continue;
        const p = E.pos(c);
        if (!byPos.has(p)) byPos.set(p, []);
        byPos.get(p).push(c);
      }
      for (let pass = 0; pass < 2; pass++) {
        const avail = [];
        for (let p = 0; p < E.ORDER.length; p++) {
          const arr = byPos.get(p);
          avail[p] = arr && arr[pass] ? arr[pass] : null;
        }
        const runs = [];
        let p = 0;
        while (p < E.ORDER.length) {
          if (!avail[p]) { p++; continue; }
          let q = p;
          while (q + 1 < E.ORDER.length && avail[q + 1]) q++;
          runs.push([p, q]);
          p = q + 1;
        }
        for (const [a, b] of runs) if (b - a + 1 >= 3) out.push(range(a, b).map((i) => avail[i].id));
        if (wild) {
          for (let i = 0; i < runs.length; i++) {
            const [a, b] = runs[i];
            if (i + 1 < runs.length && runs[i + 1][0] === b + 2) {
              const [c, d] = runs[i + 1];
              out.push(range(a, b).concat(range(c, d)).map((k) => avail[k].id).concat(wild.id));
            }
            if (b - a + 1 === 2) out.push(range(a, b).map((k) => avail[k].id).concat(wild.id));
          }
        }
      }
    }
    return out;
  }

  // Všechny proveditelné vykládací akce v pořadí, v jakém by je bral „hladový“ hráč.
  function actions(st, pi) {
    const p = st.players[pi];
    const team = st.teams[p.team];
    const hand = p.hand;
    const wilds = hand.filter(E.isWild);
    const out = [];
    const isW = (id) => wilds.some((w) => w.id === id);
    const addA = (m, ids, kind) => {
      if (E.checkAdd(st, pi, m.id, ids).error) return;
      out.push({ type: 'add', kind, meldId: m.id, ids, before: m.cards.length, len: m.cards.length + ids.length,
        clean: !m.cards.some(E.isWild) && !ids.some(isW) });
    };
    const newA = (ids, kind) => {
      if (E.checkMeldNew(st, pi, ids).error) return;
      out.push({ type: 'new', kind, ids, before: 0, len: ids.length, clean: !ids.some(isW) });
    };
    const mm = st.turn.mustMeld;
    if (mm != null && hand.some((c) => c.id === mm)) {
      for (const m of team.melds) addA(m, [mm], 'must');
      for (const ids of candidateMelds(hand, true).filter((x) => x.includes(mm))) newA(ids, 'must');
      return out;
    }
    for (const c of hand) if (isNat(c)) for (const m of team.melds) addA(m, [c.id], 'extend');
    for (const ids of candidateMelds(hand, false).sort((a, b) => b.length - a.length)) newA(ids, 'new');
    if (wilds.length) {
      const w = wilds[0].id;
      for (const m of team.melds) if (m.cards.length === 6 && !m.cards.some(E.isWild)) addA(m, [w], 'wildCanasta');
      for (const ids of candidateMelds(hand, true).filter((x) => x.includes(w)).sort((a, b) => b.length - a.length)) newA(ids, 'newWild');
      for (const m of team.melds) addA(m, [w], 'wildAdd');
    }
    return out;
  }

  // Projde akce podle režimu: 'all' vykládá vše, 'build' rozumně, 'hold' drží karty.
  function pickAction(st, pi, mode) {
    const p = st.players[pi];
    const team = st.teams[p.team];
    const n = p.hand.length;
    const wilds = p.hand.filter(E.isWild).length;
    for (const a of actions(st, pi)) {
      const makesCanasta = a.before < 7 && a.len >= 7;
      const growsClean = a.before >= 7 && a.clean; // +100 za každou kartu
      if (a.kind === 'must') return a;
      if (a.kind === 'extend') {
        if (mode === 'all' || makesCanasta || growsClean) return a;
        if (mode === 'build' && (a.before >= 4 || n >= 11)) return a;
        if (mode === 'hold' && n >= 14) return a;
      } else if (a.kind === 'new') {
        if (mode === 'all' || a.len >= 7) return a;
        if (mode === 'build' && (a.len >= 5 || n - a.len >= 7)) return a;
        if (mode === 'hold' && n >= 15) return a;
      } else if (a.kind === 'wildCanasta') {
        if (mode === 'all' || (mode === 'build' && n <= 8)) return a;
      } else if (a.kind === 'newWild') {
        if ((mode === 'all' && (n <= 6 || wilds >= 2)) || (mode === 'build' && n <= 5)) return a;
      } else if (a.kind === 'wildAdd') {
        if (mode === 'all' && E.hasCanasta(team) && n <= 3) return a;
      }
    }
    return null;
  }

  function apply(st, pi, a) {
    return a.type === 'new' ? E.meldNew(st, pi, a.ids) : E.addToMeld(st, pi, a.meldId, a.ids);
  }

  // Co by robot v tahu vyložil v daném režimu (simulace na kopii).
  function simulate(st, pi, mode) {
    const c = clone(st);
    for (let i = 0; i < 40 && c.phase === 'play'; i++) {
      const a = pickAction(c, pi, mode);
      if (!a || !apply(c, pi, a).ok) break;
    }
    const p = c.players[pi];
    const team = c.teams[p.team];
    const wentOut = c.phase !== 'play';
    return {
      st: c,
      laid: c.turn ? c.turn.laid : 0,
      wentOut,
      canClose: wentOut || (p.hand.length === 1 && E.hasCanasta(team)),
      mustOk: wentOut || c.turn.mustMeld == null || !p.hand.some((x) => x.id === c.turn.mustMeld),
    };
  }

  // Váhy vyladěné simulacemi proti původnímu robotovi.
  // pD = jak pravděpodobně soupeř zavře, než se robot zbaví karet, podle úrovně nebezpečí 0–3.
  const TUNE = { floor4: 'hold', pileOn: true, discardOn: true, pD: [0, 0.05, 0.3, 0.8], wMeld: 30, wPair: 20, wRaw: 10, b3a: 0.3, b3b: 0.2, junk: 0.3 };
  // Obtížnost: 'easy' vykládá a bere všechno, 'medium' hraje rozumně s chybami, 'hard' takticky.
  let LV = 'hard';
  const noise = (amp) => (Math.random() - 0.5) * amp;

  function chooseMode(st, pi) {
    if (LV === 'easy') return 'all';
    if (simulate(st, pi, 'all').canClose) return 'all'; // může zavřít – zavře
    const d = dangerLevel(st, pi);
    if (d >= 2) return 'all';
    if (LV === 'medium') return d >= 1 ? 'all' : 'build';
    const four = st.players.length > 2;
    if (four && TUNE.floor4 === 'all') return 'all';
    if (d === 1) return 'build';
    if (four && TUNE.floor4 === 'build') return 'build';
    return st.players[pi].hand.length >= 16 ? 'build' : 'hold';
  }

  function chooseMeldAction(st, pi) {
    const team = st.teams[st.players[pi].team];
    let mode = chooseMode(st, pi);
    if (E.needsOpen(team)) {
      // první vyložení nad 2 000: buď aspoň 150, nebo nic
      let sim = simulate(st, pi, mode);
      // když už něco leží (třeba vzatá hromádka), musí vyložení dotáhnout, jinak by ho musel vzít zpět
      const committed = st.turn && st.turn.laid > 0;
      if (!sim.wentOut && sim.laid < E.openReq(team) && mode !== 'all' && (committed || dangerLevel(st, pi) >= 1)) {
        mode = 'all';
        sim = simulate(st, pi, mode);
      }
      if (!sim.wentOut && sim.laid < E.openReq(team)) return null;
    }
    return pickAction(st, pi, mode);
  }

  // ---------- hromádka ----------
  function pileChoice(st, pi) {
    if (E.pileError(st, pi)) return null;
    const p = st.players[pi];
    const team = st.teams[p.team];
    const top = st.pile[st.pile.length - 1];
    const okChoice = (ids, meldId) => !E.checkTakePile(st, pi, ids, meldId).error;
    for (const m of team.melds) if (okChoice([], m.id)) return { ids: [], meldId: m.id };
    const withTop = p.hand.concat([top]);
    const cands = candidateMelds(withTop, true)
      .filter((ids) => ids.includes(top.id))
      .map((ids) => ids.filter((id) => id !== top.id))
      .sort((a, b) => {
        // raději bez žolíka a s co nejmenším odkrytím ruky
        const wa = a.some((id) => withTop.find((c) => c.id === id && E.isWild(c))) ? 1 : 0;
        const wb = b.some((id) => withTop.find((c) => c.id === id && E.isWild(c))) ? 1 : 0;
        return wa - wb || b.length - a.length;
      });
    for (const ids of cands) if (okChoice(ids, null)) return { ids, meldId: null };
    const others = p.hand.filter((c) => !E.isThree(c));
    for (let i = 0; i < others.length; i++) {
      for (let j = i + 1; j < others.length; j++) {
        const ids = [others[i].id, others[j].id];
        if (okChoice(ids, null)) return { ids, meldId: null };
      }
    }
    return null;
  }

  // Kolik hromádka robotovi přinese po odečtení rizika.
  function pileScore(st, pi, choice) {
    const d = dangerLevel(st, pi);
    const pD = TUNE.pD[d] * (LV === 'medium' ? 0.3 : 1);
    const p = st.players[pi];
    const top = st.pile[st.pile.length - 1];
    const rest = st.pile.slice(0, -1);
    const c = clone(st);
    if (!E.takePile(c, pi, choice.ids, choice.meldId).ok) return -Infinity;
    if (c.phase !== 'play') return 1000; // zavřel
    const sim = simulate(c, pi, 'all');
    if (!sim.mustOk) return -Infinity;
    if (sim.canClose) return 1000;
    const team = c.teams[c.players[pi].team];
    if (E.needsOpen(team) && sim.laid < E.openReq(team)) return -Infinity;
    const handAfter = new Set(sim.st.players[pi].hand.map((x) => x.id));
    let gain = 20 + E.cardValue(top);
    let risk = 0;
    let black3 = 0;
    for (const card of rest) {
      if (E.isBlack3(card)) { black3++; continue; }
      if (E.isWild(card)) { gain += 45; risk += 50 * pD * 0.4; continue; }
      if (!handAfter.has(card.id)) { gain += E.cardValue(card) + TUNE.wMeld; continue; }
      const pairs = p.hand.some((x) => isNat(x) && (
        (E.SET_RANKS.includes(card.r) && x.r === card.r) ||
        (x.s === card.s && Math.abs(E.pos(x) - E.pos(card)) <= 2)));
      gain += pairs ? TUNE.wPair : TUNE.wRaw;
      risk += E.cardValue(card) * pD * TUNE.junk;
    }
    // Černé trojky jde odhodit jen po jedné za tah – každá další visí v ruce déle.
    for (let i = 1; i <= black3; i++) risk += 100 * Math.min(1, pD * (TUNE.b3a + TUNE.b3b * i));
    // Odkrytí karet z ruky kvůli vrchní kartě, když je klid a hromádka malá.
    if (d === 0 && rest.length <= 1 && choice.meldId == null) gain -= 6 * choice.ids.length;
    return gain - risk;
  }

  function wantsPile(st, pi) {
    const choice = pileChoice(st, pi);
    if (!choice) return null;
    const sc = pileScore(st, pi, choice);
    // lehký i střední robot bere hromádku, kdykoli může (na past s černými trojkami skočí)
    if (!TUNE.pileOn || LV !== 'hard') return sc > -Infinity ? choice : null;
    return sc > 0 ? choice : null;
  }

  // ---------- odhazování ----------
  function oppDiscards(st, pi) {
    const myTeam = st.players[pi].team;
    const seen = [];
    for (const l of st.log) {
      if (l && l.k === 'log_discard' && l.p && l.p.card && st.players[l.p.pi] && st.players[l.p.pi].team !== myTeam) seen.push(l.p.card);
    }
    return seen;
  }

  function discardOrder(st, pi) {
    const p = st.players[pi];
    const team = st.teams[p.team];
    const opp = st.teams[1 - p.team];
    const d = dangerLevel(st, pi);
    const hand = p.hand.filter((c) => c.id !== st.turn.mustMeld);
    const theirs = oppDiscards(st, pi);
    const black3InHand = hand.filter(E.isBlack3).length;
    const scored = hand.map((c) => {
      let s = 0;
      if (E.isBlack3(c)) {
        // blokovat má smysl, když je co chránit nebo hrozí konec; jinak trojku chvíli podržet
        s += d >= 1 || st.pile.length >= 3 || black3InHand >= 2 ? 95 : 8;
        return { id: c.id, s };
      }
      if (E.isWild(c)) return { id: c.id, s: -300 };
      if (opp.melds.some((m) => !E.analyzeAdd(m, [c]).error)) s -= 45 + st.pile.length * 6;
      if (team.melds.some((m) => !E.analyzeAdd(m, [c]).error)) s -= 30;
      let partners = 0;
      if (E.SET_RANKS.includes(c.r)) partners += hand.filter((x) => x.r === c.r && x.id !== c.id).length * 1.5;
      const pc = E.pos(c);
      for (const x of hand) {
        if (x.id === c.id || x.s !== c.s || !isNat(x)) continue;
        const dd = Math.abs(E.pos(x) - pc);
        if (dd === 1) partners += 1.2;
        else if (dd === 2) partners += 0.6;
        else if (dd === 0) partners += 0.3;
      }
      s -= partners * 12;
      if (partners === 0) s += 10;
      // co soupeř sám odhodil, to asi nesbírá
      for (const t of theirs) {
        if (t.r === c.r && t.s === c.s) s += 12;
        else if (t.s === c.s && t.r !== '3' && t.r !== '2' && t.r !== 'JK' && Math.abs(E.ORDER.indexOf(t.r) - pc) === 1) s += 4;
      }
      // když soupeř brzy zavře, zbavit se drahých karet
      if (d >= 2) s += E.cardValue(c) / 2;
      if (LV === 'medium') s += noise(90);
      return { id: c.id, s };
    });
    scored.sort((a, b) => b.s - a.s || a.id - b.id);
    return scored.map((x) => x.id);
  }

  function simpleDiscardOrder(st, pi) {
    const p = st.players[pi];
    const team = st.teams[p.team];
    const opp = st.teams[1 - p.team];
    const hand = p.hand.filter((c) => c.id !== st.turn.mustMeld);
    const scored = hand.map((c) => {
      let s = 0;
      if (E.isBlack3(c)) s += 80;
      if (E.isWild(c)) s -= 300;
      if (opp.melds.some((m) => !E.analyzeAdd(m, [c]).error)) s -= 40 + st.pile.length * 4;
      if (team.melds.some((m) => !E.analyzeAdd(m, [c]).error)) s -= 30;
      if (isNat(c)) {
        if (E.SET_RANKS.includes(c.r)) s -= 12 * hand.filter((x) => x.r === c.r && x.id !== c.id).length;
        const pc = E.pos(c);
        for (const x of hand) {
          if (x.id === c.id || x.s !== c.s || !isNat(x)) continue;
          const d = Math.abs(E.pos(x) - pc);
          if (d === 1) s -= 14; else if (d === 2) s -= 7; else if (d === 0) s -= 4;
        }
        s += noise(50); // lehký robot se občas splete
      }
      return { id: c.id, s };
    });
    scored.sort((a, b) => b.s - a.s || a.id - b.id);
    return scored.map((x) => x.id);
  }

  // ---------- jeden krok robota ----------
  // Hodí se líznutá karta k ruce? (žolík, stejná hodnota, nebo stejná barva do dvou míst)
  function cardFits(hand, c) {
    if (E.isWild(c)) return true;
    if (E.isThree(c)) return E.isBlack3(c); // černá trojka se hodí na blokování
    return hand.some((x) => x.id !== c.id && !E.isWild(x) && !E.isThree(x) &&
      (x.r === c.r || (x.s === c.s && Math.abs(E.pos(x) - E.pos(c)) <= 2)));
  }
  function step(st, pi, level) {
    LV = level === 'easy' || level === 'medium' ? level : 'hard';
    if (st.current !== pi) return { ok: false, error: E.M('not_your_turn') };
    if (st.phase === 'cut') {
      // zkušený robot míří přesně, slabší se trochu splete; karty se pak ještě svezou (engine)
      const target = E.RULES.handSize * st.players.length;
      const miss = LV === 'hard' ? 0 : LV === 'medium' ? 3 : 5;
      return E.cutDeck(st, pi, target + Math.floor(Math.random() * (2 * miss + 1)) - miss);
    }
    if (st.phase === 'play' && E.canRedraw && E.canRedraw(st, pi)) {
      const hand = st.players[pi].hand;
      const c = hand.find((x) => x.id === st.turn.drawnId);
      if (c && !cardFits(hand, c)) return E.redraw(st, pi);
      st.turn.canRedraw = false; // nechává si ji
    }
    if (st.phase === 'draw') {
      const choice = wantsPile(st, pi);
      if (choice) {
        const r = E.takePile(st, pi, choice.ids, choice.meldId);
        if (r.ok) return r;
      }
      return st.stock.length ? E.drawStock(st, pi) : E.passEnd(st, pi);
    }
    if (st.phase !== 'play') return { ok: false, error: E.M('round_over_short') };
    const bt = st.turn.bot || (st.turn.bot = { noMeld: false, steps: 0 });
    bt.steps++;
    if (!bt.noMeld && bt.steps < 40) {
      const a = chooseMeldAction(st, pi);
      if (a) {
        const r = apply(st, pi, a);
        if (r.ok) return r;
        bt.noMeld = true;
      }
    }
    for (const id of (TUNE.discardOn && LV !== 'easy' ? discardOrder(st, pi) : simpleDiscardOrder(st, pi))) {
      if (!E.discardError(st, pi, id)) return E.discard(st, pi, id);
    }
    // nepovedené první vyložení: karty zpět do ruky (limit stoupne), pak jen odhodit; jinak nouzově vrátit tah
    const u = E.canRetract(st, pi) ? E.retractOpening(st, pi) : E.undoTurn(st, pi);
    if (st.phase === 'play' || st.phase === 'draw') st.turn.bot = { noMeld: true, steps: 0 };
    return u;
  }

  // Zpětná kompatibilita: „hladová“ akce (používají ji testy).
  const greedyAction = (st, pi) => pickAction(st, pi, 'all');

  const api = { step, candidateMelds, greedyAction, discardOrder, wantsPile, pileChoice, dangerLevel, chooseMode, cardFits, TUNE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Bot = api;
})(typeof window !== 'undefined' ? window : globalThis);
