// Simulace robot proti robotovi s kontrolou pravidel po každé akci.
const E = require('../src/client/engine.js');
const B = require('../src/client/bot.js');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkMeld(m) {
  if (m.cards.length < 3) return 'krátká vykládka';
  if (m.cards.filter(E.isWild).length > 1) return 'víc žolíků';
  if (m.cards.some(E.isThree)) return 'trojka ve vykládce';
  const nat = m.cards.filter((c) => !E.isWild(c));
  if (nat.length < 2) return 'málo přírodních';
  if (m.type === 'set') {
    if (!E.SET_RANKS.includes(m.key)) return 'skupina mimo K/A/4';
    if (nat.some((c) => c.r !== m.key)) return 'cizí karta ve skupině';
  } else {
    const hasW = m.cards.some(E.isWild);
    const lay = E.layoutSeq(nat, hasW, hasW ? m.wildPos : null);
    if (lay.error) return 'postupka: ' + lay.error;
    if (nat.some((c) => c.s !== m.key)) return 'cizí barva';
  }
  return null;
}

function invariants(st) {
  const n = E.totalCards(st);
  if (n !== 108) throw new Error('počet karet ' + n);
  const ids = new Set();
  const all = [].concat(st.stock, st.pile, ...st.players.map((p) => p.hand),
    ...st.teams.map((t) => t.red3), ...st.teams.map((t) => [].concat(...t.melds.map((m) => m.cards))));
  for (const c of all) { if (ids.has(c.id)) throw new Error('duplicitní karta'); ids.add(c.id); }
  for (const t of st.teams) for (const m of t.melds) { const e = checkMeld(m); if (e) throw new Error(e); }
  for (const p of st.players) if (p.hand.some(E.isRed3)) throw new Error('červená trojka v ruce');
  if (st.pile.some(E.isRed3)) throw new Error('červená trojka v hromádce');
}

function playGame(nPlayers, seed) {
  const rng = mulberry32(seed);
  const st = E.newGame(Array.from({ length: nPlayers }, (_, i) => ({ name: 'R' + i, isBot: true })));
  const stats = { rounds: 0, outs: 0, stockOuts: 0, pileTakes: 0, actions: 0, canastas: 0 };
  while (st.phase !== 'gameOver') {
    E.startRound(st, rng);
    stats.rounds++;
    let guard = 0;
    while (st.phase === 'draw' || st.phase === 'play') {
      const before = st.phase;
      const r = B.step(st, st.current);
      if (!r.ok) throw new Error('robot selhal: ' + r.error + ' (fáze ' + before + ')');
      if (before === 'draw' && st.turn && st.turn.from === 'pile') stats.pileTakes++;
      invariants(st);
      stats.actions++;
      if (++guard > 5000) throw new Error('kolo nekončí');
    }
    if (st.lastRound.closer == null) stats.stockOuts++; else stats.outs++;
    stats.canastas += st.lastRound.teams.reduce((s, t) => s + t.canastas, 0);
    if (stats.rounds > 300) throw new Error('hra nekončí');
  }
  return { st, stats };
}

for (const n of [2, 4]) {
  const games = n === 2 ? 300 : 120;
  const agg = { rounds: 0, outs: 0, stockOuts: 0, pileTakes: 0, actions: 0, canastas: 0, wins: [0, 0] };
  const t0 = Date.now();
  for (let g = 0; g < games; g++) {
    try {
      const { st, stats } = playGame(n, 1000 + g);
      for (const k of Object.keys(stats)) agg[k] += stats[k];
      if (st.winner >= 0) agg.wins[st.winner]++;
    } catch (e) {
      console.error(`hráči=${n} seed=${1000 + g}:`, e.stack);
      process.exit(1);
    }
  }
  console.log(`${n} hráči, ${games} her, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`  kol na hru ${(agg.rounds / games).toFixed(1)}, zavřeno ${agg.outs}, došel balíček ${agg.stockOuts}`);
  console.log(`  vzatých hromádek na kolo ${(agg.pileTakes / agg.rounds).toFixed(1)}, canast na kolo ${(agg.canastas / agg.rounds).toFixed(2)}, výhry ${agg.wins}`);
}
