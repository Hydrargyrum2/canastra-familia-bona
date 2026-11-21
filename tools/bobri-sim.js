// Simulace robotů pro Bobry a krysy: node tools/bobri-sim.js [hry] [úrovně oddělené čárkou] [tune JSON]
const E = require('../bobri/public/engine.js');
const B = require('../bobri/public/bot.js');
const games = +process.argv[2] || 400;
const levels = (process.argv[3] || 'easy,medium,hard').split(',');
if (process.argv[4]) B.setTune(JSON.parse(process.argv[4]));
const n = levels.length;
const stat = {};
for (const l of new Set(levels)) stat[l] = { wins: 0, games: 0, pts: 0, rounds: 0, knocks: 0, knockWins: 0 };
let turns = 0, roundsTotal = 0, errors = 0, stuck = 0;
for (let g = 0; g < games; g++) {
  // posouvat místa, ať nikdo nemá výhodu pořadí
  const seats = levels.map((_, i) => levels[(i + g) % n]);
  const st = E.newGame({ players: seats.map((l, i) => ({ name: l + i, bot: l })), seed: 1000 + g });
  let guard = 0;
  while (st.phase !== 'gameOver' && guard++ < 50000) {
    if (st.phase === 'peek') { E.beginTurns(st); continue; }
    if (st.phase === 'roundOver') {
      const lr = st.lastRound; roundsTotal++;
      if (lr.knocker != null) { const k = seats[lr.knocker]; stat[k].knocks++; if (lr.scores[lr.knocker] === Math.min(...lr.scores)) stat[k].knockWins++; }
      E.nextRound(st); continue;
    }
    const before = st.turnNo;
    const r = B.step(st, st.current);
    if (!r.ok) { errors++; console.log('ERR', st.phase, r.error); break; }
    if (st.turnNo !== before) turns++;
    if (st.turnNo > 60 * n) { stuck++; break; }
  }
  if (st.phase !== 'gameOver') continue;
  roundsTotal++;
  const best = Math.min(...st.players.map((p) => p.total));
  st.players.forEach((p, i) => {
    const s = stat[seats[i]];
    s.games++; s.pts += p.total; s.rounds += p.scores.length;
    if (p.total === best) s.wins++;
  });
}
const out = {};
for (const [l, s] of Object.entries(stat)) out[l] = { win: (100 * s.wins / s.games).toFixed(1) + '%', perRound: (s.pts / s.rounds).toFixed(2), knocks: s.knocks, knockBest: s.knocks ? (100 * s.knockWins / s.knocks).toFixed(0) + '%' : '-' };
console.log(JSON.stringify(out), 'turns/round', (turns / roundsTotal).toFixed(1), 'errors', errors, 'stuck', stuck);
