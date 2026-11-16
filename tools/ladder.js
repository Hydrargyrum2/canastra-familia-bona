const E = require('../src/client/engine.js'); const B = require('../src/client/bot.js');
function mulberry32(a){return function(){a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function duel(la, lb, n, N) {
  let wa = 0;
  for (let g = 0; g < N; g++) {
    const rng = mulberry32(7000 + g);
    const st = E.newGame(Array.from({ length: n }, (_, i) => ({ name: 'P' + i, isBot: true })));
    const aTeam = g % 2;
    while (st.phase !== 'gameOver') {
      E.startRound(st, rng);
      let k = 0;
      while (st.phase === 'draw' || st.phase === 'play') {
        const lv = st.players[st.current].team === aTeam ? la : lb;
        const r = B.step(st, st.current, lv);
        if (!r.ok) throw new Error('fail');
        if (E.totalCards(st) !== 108) throw new Error('cards');
        if (++k > 6000) throw new Error('loop');
      }
    }
    if (st.winner === aTeam) wa++;
  }
  return (100 * wa / N).toFixed(1) + ' %';
}
for (const [a, b] of [['hard', 'easy'], ['hard', 'medium'], ['medium', 'easy']]) {
  console.log(`${a} proti ${b}: 1 na 1 ${duel(a, b, 2, 300)}, 2 na 2 ${duel(a, b, 4, 120)}`);
}
