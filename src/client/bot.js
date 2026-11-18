/* Kanasta – robot. Vidí jen svou ruku a veřejné informace na stole
   (vykládky, počty karet v rukou, odhazovací hromádku a co kdo odhodil).

   Verze 2 (plán tahu): každý tah si robot určí fázi – stavím (drží karty, bez canasty
   nejde pod hranici ruky, kromě lákavé vykládky), otevírám (nad 2 000 jen do splnění limitu),
   zavírám (má canastu a může jít na nulu) nebo zachraňuju body (soupeř může hned zavřít).
   Profil obtížnosti a herní styl jsou v PROFILES a STYLES, vyladěné turnaji v tools/arena.js.

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

  // ---------- plán tahu (verze 2) ----------
  // Profil = jak robot hraje. floor: kolik karet si bez canasty drží v ruce; tempt: kolik bodů musí vykládka
  // stát, aby kvůli ní hranici porušil (malé číslo = snadno podlehne a pak uvízne na dvou kartách);
  // starters: kolik vykládek chce mít brzy na stole (háčky na hromádku); wildSave: jak moc šetří žolíky na canastu;
  // pileBias: chuť na hromádku; rebuild: o kolik víc chce hromádku, když mu dochází ruka; dumpAt: od jakého
  // nebezpečí sype všechno; discard: chytré nebo jednoduché odhazování; noise: chyby při odhazování.
  // Vyladěno turnaji robot proti robotovi (tools/arena.js): těžký vyhrává se starým těžkým ~70 % (1 na 1)
  // a uvízne na dvou kartách bez canasty jen asi v 5 % kol; střední asi ve 12 %, lehký asi ve třetině kol.
  const PROFILES = {
    easy: { floor: 4, tempt: 80, starters: 0, wildSave: 0.8, pileBias: 0, pileAny: false, rebuild: 20, dumpAt: 2, dumpKeep: 2, openCare: 0.5, trapCost: 0, discard: 'simple', noise: 0 },
    medium: { floor: 4, tempt: 60, starters: 0, wildSave: 1, pileBias: 0, pileAny: false, rebuild: 60, dumpAt: 3, dumpKeep: 2, openCare: 1, trapCost: 0, discard: 'smart', noise: 90 },
    hard: { floor: 4, tempt: 160, starters: 0, wildSave: 1, pileBias: -40, pileAny: false, rebuild: 60, dumpAt: 3, dumpKeep: 3, openCare: 1, trapCost: 200, discard: 'smart', noise: 0, four: { pileBias: 0 } },
  };
  // Herní styly: každý robot dostane na hru jeden, ať nehrají všichni stejně. Rozdíly jsou malé,
  // aby žádný styl nebyl výrazně slabší (ověřeno turnaji).
  const STYLES = {
    steady: {},
    careful: { floor: 1, pileBias: -10 }, // drží víc karet, hromádku bere opatrněji
    collector: { pileBias: 10, rebuild: 20 }, // rád sbírá odhazovací hromádku
    builder: { starters: 1 }, // vykládá dřív, staví víc vykládek
  };
  const STYLE_NAMES = Object.keys(STYLES);
  function withStyle(base, name) {
    const out = Object.assign({}, base);
    const d = STYLES[name] || {};
    for (const k of Object.keys(d)) out[k] = (out[k] || 0) + d[k];
    return out;
  }
  let P = PROFILES.hard;

  // Hodnota akce pro pokušení: body karet + postup ke canastě.
  function actionValue(st, pi, a) {
    const hand = st.players[pi].hand;
    let v = 0;
    for (const id of a.ids) { const c = hand.find((x) => x.id === id); if (c) v += E.cardValue(c); }
    if (a.len >= 5 && a.before < 5) v += 25 * (a.len - 4);
    return v;
  }
  // Další vykládací akce podle plánu: zavírám / zachraňuju body / stavím s pojistkou.
  function planAction(st, pi, phase) {
    const p = st.players[pi];
    const team = st.teams[p.team];
    const n = p.hand.length;
    const hasCan = E.hasCanasta(team);
    const floor = hasCan ? 2 : (P.floor2 != null && dangerLevel(st, pi) >= 2 ? Math.min(P.floor, P.floor2) : P.floor);
    if (phase === 'close') return pickAction(st, pi, 'all'); // stejná cesta, jakou simulace našla zavření
    if (phase === 'open') phase = E.needsOpen(team) && st.turn.laid < E.openReq(team) ? 'dump' : 'build';
    const dump = phase === 'dump';
    for (const a of actions(st, pi)) {
      const after = n - a.ids.length;
      const makesCan = a.before < 7 && a.len >= 7;
      const growsClean = a.before >= 7 && a.clean;
      if (a.kind === 'must') return a;
      if (makesCan) return a; // canasta = možnost zavřít
      if (dump) {
        if (a.kind === 'wildAdd' && !(hasCan && n <= 3)) continue;
        // i při sypání si bez canasty nechá pár karet, ať nezůstane bezmocný (když soupeř nezavře)
        if (!hasCan && after < (P.dumpKeep || 2) && !(E.needsOpen(team) && st.turn.laid < E.openReq(team))) continue;
        return a;
      }
      const isWildMove = a.kind === 'newWild' || a.kind === 'wildAdd' || a.kind === 'wildCanasta';
      if (isWildMove && Math.random() < P.wildSave) continue; // žolík na dokončení canasty
      if (a.kind === 'wildAdd') continue;
      if (growsClean && after >= 2) return a; // +100 za každou kartu navíc
      const tempting = after >= 2 && actionValue(st, pi, a) >= P.tempt;
      if (a.kind === 'extend') {
        if (after >= floor || tempting || n >= 15) return a;
      } else if (a.kind === 'new' || a.kind === 'newWild') {
        const starter = team.melds.length < P.starters || a.len >= 4 || hasCan;
        if ((after >= floor && starter) || tempting || n >= 16) return a;
      }
    }
    return null;
  }
  function planPhase(st, pi) {
    const team = st.teams[st.players[pi].team];
    // farm: hráč, který schválně nezavírá a dál staví (na zkoušku, jak se robot brání)
    const farming = P.farm && st.stock.length > P.farm && team.melds.filter((m) => E.isCanasta(m)).length < 3;
    if (!farming && simulate(st, pi, 'all').canClose) return 'close';
    if (dangerLevel(st, pi) >= P.dumpAt) return 'dump';
    return 'build';
  }
  function simulatePlan(st, pi, phase) {
    const c = clone(st);
    for (let i = 0; i < 40 && c.phase === 'play'; i++) {
      const a = planAction(c, pi, phase);
      if (!a || !apply(c, pi, a).ok) break;
    }
    const cp = c.players[pi];
    return { laid: c.turn ? c.turn.laid : 0, wentOut: c.phase !== 'play', hand: cp.hand.length, can: E.hasCanasta(c.teams[cp.team]) };
  }
  function chooseMeldAction2(st, pi) {
    const team = st.teams[st.players[pi].team];
    let phase = st.turn.bot && st.turn.bot.phase || planPhase(st, pi);
    if (st.turn.bot) st.turn.bot.phase = phase;
    if (E.needsOpen(team)) {
      let sim = simulatePlan(st, pi, phase);
      const committed = st.turn && st.turn.laid > 0;
      if (!sim.wentOut && sim.laid < E.openReq(team) && phase === 'build' && (committed || dangerLevel(st, pi) >= (P.openForce || 1))) {
        phase = 'open';
        if (st.turn.bot) st.turn.bot.phase = phase;
        sim = simulatePlan(st, pi, phase);
      }
      if (!sim.wentOut && sim.laid < E.openReq(team)) return null;
      // otevřít za cenu, že zbydou dvě karty bez canasty, jen když hrozí konec nebo už leží hromádka
      if (!sim.wentOut && !sim.can && sim.hand <= 2 && !committed && dangerLevel(st, pi) < (P.openForce || 2) && Math.random() < P.openCare) return null;
    }
    return planAction(st, pi, phase);
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
    // když by po vzetí musel (kvůli prvnímu vyložení) vyložit skoro všechno a zůstal bez canasty, je to past
    if (V2 && P.trapCost && E.needsOpen(st.teams[p.team]) && !E.hasCanasta(team) && sim.st.players[pi].hand.length <= 2 && d < 2) return -P.trapCost;
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
    if (V2 && P) {
      if (sc === -Infinity) return null;
      if (P.pileAny) return choice;
      const p = st.players[pi];
      const short = E.hasCanasta(st.teams[p.team]) ? 0 : Math.max(0, P.floor + 2 - p.hand.length);
      return sc + P.pileBias + P.rebuild * short > 0 ? choice : null;
    }
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
      if (V2 ? P.noise : LV === 'medium') s += noise(V2 ? P.noise : 90);
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
  let V2 = true;
  function step(st, pi, level, profile) {
    if (level === 'expert' && st.current === pi && st.phase !== 'cut') return expertStep(st, pi, profile || {});
    LV = level === 'easy' || level === 'medium' ? level : 'hard';
    const pl = st.players[pi];
    const style = (profile && profile.style) || pl.botStyle || (pl.botStyle = STYLE_NAMES[Math.floor(Math.random() * STYLE_NAMES.length)]);
    P = Object.assign(withStyle(Object.assign({}, PROFILES[LV], st.players.length > 2 ? PROFILES[LV].four : null), style), profile || {});
    V2 = !(profile && profile.v1);
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
      const a = V2 ? chooseMeldAction2(st, pi) : chooseMeldAction(st, pi);
      if (a) {
        const r = apply(st, pi, a);
        if (r.ok) return r;
        bt.noMeld = true;
      }
    }
    const smart = V2 ? P.discard === 'smart' : TUNE.discardOn && LV !== 'easy';
    for (const id of (smart ? discardOrder(st, pi) : simpleDiscardOrder(st, pi))) {
      if (!E.discardError(st, pi, id)) return E.discard(st, pi, id);
    }
    // nepovedené první vyložení: karty zpět do ruky (limit stoupne), pak jen odhodit; jinak nouzově vrátit tah
    const u = E.canRetract(st, pi) ? E.retractOpening(st, pi) : E.undoTurn(st, pi);
    if (st.phase === 'play' || st.phase === 'draw') st.turn.bot = { noMeld: true, steps: 0 };
    return u;
  }

  // ---------- expert: zkouší tahy nanečisto ----------
  // U důležitých rozhodnutí (hromádka nebo balíček, co vyložit, co odhodit) si robot několikrát
  // náhodně rozdá karty, které nezná (ruce soupeřů a balíček), podle toho, co ví: svoje karty, stůl,
  // hromádku a karty, které soupeř prokazatelně vzal z hromádky. Každou možnost pak dohraje do konce
  // kola těžkým robotem a vybere tu, která v průměru vyjde nejlépe. Do cizích karet nikdy nekouká.
  // trap: přirážka za plán, po kterém zůstanou dvě karty bez canasty (člověk by toho využil)
  const EXPERT = { budgetMs: 650, minSamples: 4, maxSamples: 48, horizon: 600, tie: 6, trap: 120 };
  const ROLL = { style: 'steady' };
  function seeded(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function withRng(rng, fn) { const orig = Math.random; Math.random = rng; try { return fn(); } finally { Math.random = orig; } }
  function determinize(st, pi, rng) {
    const c = clone(st);
    const known = c.players.map((p, j) => new Set(j === pi ? [] : (p.known || [])));
    const pool = [];
    c.players.forEach((p, j) => { if (j !== pi) for (const card of p.hand) if (!known[j].has(card.id)) pool.push(card); });
    pool.push(...c.stock);
    for (let i = pool.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [pool[i], pool[k]] = [pool[k], pool[i]]; }
    const plain = pool.filter((x) => !E.isRed3(x)); // červená trojka v ruce nikdy nezůstává
    const red = pool.filter((x) => E.isRed3(x));
    let k = 0;
    c.players.forEach((p, j) => { if (j !== pi) p.hand = p.hand.map((card) => (known[j].has(card.id) ? card : plain[k++])); });
    const rest = plain.slice(k).concat(red);
    for (let i = rest.length - 1; i > 0; i--) { const q = Math.floor(rng() * (i + 1)); [rest[i], rest[q]] = [rest[q], rest[i]]; }
    c.stock = rest;
    return c;
  }
  // Odhad, když kolo nedoběhne: body na stole a canasty minus karty v ruce.
  function teamEstimate(c, t) {
    let v = 0;
    for (const m of c.teams[t].melds) { v += E.sumValue(m.cards); if (m.cards.length >= 7) v += 100; }
    v += 100 * (c.teams[t].red3 ? c.teams[t].red3.length : 0);
    for (const p of c.players) if (p.team === t) v -= 0.6 * E.sumValue(p.hand);
    return v;
  }
  function rollout(c, team) {
    let n = 0;
    while (c.phase !== 'roundOver' && c.phase !== 'gameOver' && n++ < EXPERT.horizon) {
      if (c.phase === 'cut') break;
      const r = step(c, c.current, 'hard', ROLL);
      if (!r.ok) break;
    }
    if ((c.phase === 'roundOver' || c.phase === 'gameOver') && c.lastRound) {
      const T = c.lastRound.teams;
      return T[team].total - T[1 - team].total;
    }
    return teamEstimate(c, team) - teamEstimate(c, 1 - team);
  }
  // options: [{ key, run(c) -> bool }]; vrátí klíč nejlepší možnosti
  function search(st, pi, options, cfg) {
    if (options.length < 2) return options.length ? options[0].key : null;
    const team = st.players[pi].team;
    const sum = options.map(() => 0), cnt = options.map(() => 0), bad = options.map(() => false);
    const t0 = Date.now();
    const base = Math.floor(Math.random() * 1e9);
    const maxS = cfg.samples || EXPERT.maxSamples;
    const budget = cfg.budgetMs || EXPERT.budgetMs;
    // pomalý telefon: po 2 vzorcích a 1,6× rozpočtu konec, ať se nečeká dlouho
    const over = (s) => !cfg.samples && ((s >= EXPERT.minSamples && Date.now() - t0 > budget) || (s >= 2 && Date.now() - t0 > budget * 1.6));
    for (let s = 0; s < maxS && !over(s); s++) {
      const seed = base + s * 7919;
      const vals = [];
      let cut = false;
      for (let o = 0; o < options.length; o++) {
        if (bad[o]) continue;
        if (s >= 2 && over(s)) { cut = true; break; } // nedokončený vzorek se nepočítá (férové srovnání)
        // stejné rozdání i stejné náhody pro všechny možnosti, ať se porovnávají férově
        const v = withRng(seeded(seed), () => {
          const c = determinize(st, pi, seeded(seed ^ 0x9e3779b9));
          if (!options[o].run(c)) return null;
          return rollout(c, team);
        });
        if (v == null) { bad[o] = true; continue; }
        vals.push([o, v - (options[o].penalty || 0)]);
      }
      if (cut) break;
      for (const [o, v] of vals) { sum[o] += v; cnt[o]++; }
    }
    const avg = options.map((_, o) => (bad[o] || !cnt[o] ? -Infinity : sum[o] / cnt[o]));
    const best = Math.max(...avg);
    // téměř stejně dobré možnosti: náhodně, ať není čitelný
    const near = options.filter((_, o) => avg[o] > -Infinity && best - avg[o] <= EXPERT.tie);
    return (near.length ? near[Math.floor(Math.random() * near.length)] : options[avg.indexOf(best)]).key;
  }
  // Plán vykládky = posloupnost akcí, jak by ji zahrál daný profil (počítá se na kopii skutečného stavu).
  function planFor(st, pi, prof) {
    const c = clone(st);
    const acts = [];
    const saveP = P, saveLV = LV;
    P = Object.assign({}, PROFILES.hard, prof);
    LV = 'hard';
    try {
      const bt = c.turn.bot || (c.turn.bot = { noMeld: false, steps: 0 });
      bt.phase = null;
      for (let i = 0; i < 40 && c.phase === 'play'; i++) {
        const a = prof.all ? pickAction(c, pi, 'all') : prof.none ? null : chooseMeldAction2(c, pi);
        if (!a || !apply(c, pi, a).ok) break;
        acts.push({ type: a.type, ids: a.ids.slice(), meldId: a.meldId, kind: a.kind });
      }
    } finally { P = saveP; LV = saveLV; }
    const cp = c.players[pi];
    acts.trap = cp.hand.length <= 2 && !E.hasCanasta(c.teams[cp.team]) && c.stock.length > 10 && c.phase === 'play';
    return acts;
  }
  const applyPlan = (c, pi, acts) => acts.every((a) => apply(c, pi, a).ok);
  function finishTurn(c, pi) {
    for (let i = 0; i < 50 && c.current === pi && c.phase === 'play'; i++) if (!step(c, pi, 'hard', ROLL).ok) return false;
    return true;
  }
  function expertStep(st, pi, cfg) {
    const pl = st.players[pi];
    const saveP = P, saveLV = LV;
    try {
      if (st.phase === 'draw') {
        P = Object.assign({}, PROFILES.hard); LV = 'hard';
        const choice = pileChoice(st, pi);
        if (choice && pileScore(st, pi, choice) > -Infinity) {
          const opts = [
            { key: 'pile', run: (c) => E.takePile(c, pi, choice.ids, choice.meldId).ok && finishTurn(c, pi) },
            { key: 'stock', run: (c) => (c.stock.length ? E.drawStock(c, pi).ok : E.passEnd(c, pi).ok) && finishTurn(c, pi) },
          ];
          const k = search(st, pi, opts, cfg);
          if (k === 'pile') { const r = E.takePile(st, pi, choice.ids, choice.meldId); if (r.ok) return r; }
        }
        return st.stock.length ? E.drawStock(st, pi) : E.passEnd(st, pi);
      }
      if (st.phase === 'play') {
        if (E.canRedraw && E.canRedraw(st, pi)) return step(st, pi, 'hard', ROLL);
        const bt = st.turn.bot || (st.turn.bot = { noMeld: false, steps: 0 });
        if (!bt.plan) {
          // sypat všechno nebo jít pod hranici má smysl jen, když hrozí konec nebo už je canasta
          const loose = dangerLevel(st, pi) >= 2 || E.hasCanasta(st.teams[pl.team]);
          const variants = [{}, { none: true }, { floor: 6, tempt: 999 }].concat(loose ? [{ all: true }, { floor: 2, tempt: 60 }] : []);
          const plans = [];
          const seen = new Set();
          for (const v of variants) {
            const acts = planFor(st, pi, v);
            const key = JSON.stringify(acts.map((a) => [a.type, a.meldId, a.ids.slice().sort()]));
            if (seen.has(key)) continue;
            seen.add(key);
            plans.push({ key: plans.length, acts, penalty: acts.trap ? EXPERT.trap : 0 });
          }
          const k = search(st, pi, plans.map((p) => ({ key: p.key, penalty: p.penalty, run: (c) => applyPlan(c, pi, p.acts) && finishTurn(c, pi) })), cfg);
          bt.plan = (plans.find((p) => p.key === k) || plans[0]).acts.slice();
        }
        while (bt.plan.length) {
          const a = bt.plan.shift();
          const r = apply(st, pi, a);
          if (r.ok) return r;
          bt.plan = [];
        }
        // odhození: nejlepší z několika kandidátů těžkého robota
        P = Object.assign({}, PROFILES.hard); LV = 'hard';
        const legal = discardOrder(st, pi).filter((id) => !E.discardError(st, pi, id)).slice(0, 3);
        if (legal.length) {
          const k = search(st, pi, legal.map((id) => ({ key: id, run: (c) => E.discard(c, pi, id).ok })), cfg);
          const r = E.discard(st, pi, k != null ? k : legal[0]);
          if (r.ok) return r;
        }
      }
      return step(st, pi, 'hard', ROLL);
    } finally { P = saveP; LV = saveLV; }
  }

  // Zpětná kompatibilita: „hladová“ akce (používají ji testy).
  const greedyAction = (st, pi) => pickAction(st, pi, 'all');

  const api = { step, candidateMelds, greedyAction, discardOrder, wantsPile, pileChoice, dangerLevel, chooseMode, cardFits, TUNE, PROFILES, STYLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Bot = api;
})(typeof window !== 'undefined' ? window : globalThis);
