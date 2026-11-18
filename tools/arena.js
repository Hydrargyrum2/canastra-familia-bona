// Turnaj robotů: node tools/arena.js A B [hry] [hráčů]
//   A, B = "v1:hard" (starý robot) nebo "v2:hard" / "v2:hard:{\"floor\":5}" (nový s úpravou profilu)
// Vypíše výhry A, průměrný rozdíl bodů, % kol v pasti (≤2 karty bez canasty) a kdy padne první canasta.
const E = require('../src/client/engine.js');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

function load(spec) {
  const [ver, level, json] = spec.split(/:(.*)/s)[0] === spec ? [spec, 'hard', ''] : (() => { const i = spec.indexOf(':'); const j = spec.indexOf(':', i + 1); return [spec.slice(0, i), j < 0 ? spec.slice(i + 1) : spec.slice(i + 1, j), j < 0 ? '' : spec.slice(j + 1)]; })();
  const mod = ver === 'v1' ? require('./bots/bot_v1.js') : require('../src/client/bot.js');
  const prof = json ? JSON.parse(json) : null;
  return { step: (st, pi) => mod.step(st, pi, level, prof), name: spec };
}
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function play(A, B, games, n, seed0) {
  const res = { games: 0, winsA: 0, diff: 0, rounds: [0, 0], stuck: [0, 0], firstCan: [[], []], closes: [0, 0], cut: 0 };
  for (let g = 0; g < games; g++) {
    const rng = mulberry32(seed0 + g);
    const orig = Math.random; Math.random = rng; // stejné rozdání pro obě strany výměny
    try {
      const st = E.newGame(Array.from({ length: n }, (_, i) => ({ name: 'P' + i, isBot: true })), { family: true, rng });
      const aTeam = g % 2;
      E.startRound(st);
      let k = 0, turn = 0, stuckR = [false, false], firstC = [null, null];
      while (st.phase !== 'gameOver') {
        if (st.phase === 'roundOver') {
          for (const side of [0, 1]) { res.rounds[side]++; if (stuckR[side]) res.stuck[side]++; if (firstC[side] != null) res.firstCan[side].push(firstC[side]); }
          const cl = st.lastRound.closer; if (cl != null) res.closes[cl === aTeam ? 0 : 1]++;
          stuckR = [false, false]; firstC = [null, null]; turn = 0;
          E.startRound(st); continue;
        }
        const pi = st.current; const team = st.players[pi].team; const side = team === aTeam ? 0 : 1;
        if (st.phase === 'draw') {
          turn++;
          const p = st.players[pi];
          if (p.hand.length <= 2 && !E.hasCanasta(st.teams[team]) && st.stock.length > 10) stuckR[side] = true;
        }
        const r = (side === 0 ? A : B).step(st, pi);
        if (!r.ok) throw new Error('krok selhal: ' + JSON.stringify(r.error));
        for (const s of [0, 1]) { const tm = s === 0 ? aTeam : 1 - aTeam; if (firstC[s] == null && st.teams[tm] && E.hasCanasta(st.teams[tm])) firstC[s] = Math.ceil(turn / n); }
        if (++k > 200000) throw new Error('smyčka');
      }
      res.games++;
      if (st.winner === aTeam) res.winsA++;
      res.diff += st.teams[aTeam].score - st.teams[1 - aTeam].score;
    } finally { Math.random = orig; }
  }
  return res;
}

if (isMainThread) {
  const [a, b, gamesArg, nArg, seedArg] = process.argv.slice(2);
  const games = Number(gamesArg || 200), n = Number(nArg || 2), seed = Number(seedArg || 1000);
  const W = 2, per = Math.ceil(games / W);
  const t0 = Date.now();
  Promise.all(Array.from({ length: W }, (_, w) => new Promise((ok, bad) => {
    const wk = new Worker(__filename, { workerData: { a, b, games: Math.min(per, games - w * per), n, seed: seed + w * per } });
    wk.on('message', ok); wk.on('error', bad);
  }))).then((parts) => {
    const R = parts.reduce((s, r) => { s.games += r.games; s.winsA += r.winsA; s.diff += r.diff; for (const i of [0, 1]) { s.rounds[i] += r.rounds[i]; s.stuck[i] += r.stuck[i]; s.firstCan[i].push(...r.firstCan[i]); s.closes[i] += r.closes[i]; } return s; }, { games: 0, winsA: 0, diff: 0, rounds: [0, 0], stuck: [0, 0], firstCan: [[], []], closes: [0, 0] });
    const avg = (x) => x.length ? (x.reduce((p, q) => p + q, 0) / x.length).toFixed(1) : '-';
    const pct = (x, y) => y ? Math.round(100 * x / y) + '%' : '-';
    const out = { a, b, n, games: R.games, winA: +(100 * R.winsA / R.games).toFixed(1), diff: Math.round(R.diff / R.games),
      stuckA: pct(R.stuck[0], R.rounds[0]), stuckB: pct(R.stuck[1], R.rounds[1]), canA: avg(R.firstCan[0]), canB: avg(R.firstCan[1]),
      closesA: R.closes[0], closesB: R.closes[1], sec: Math.round((Date.now() - t0) / 1000) };
    console.log(JSON.stringify(out));
  });
} else {
  const { a, b, games, n, seed } = workerData;
  parentPort.postMessage(play(load(a), load(b), games, n, seed));
}
