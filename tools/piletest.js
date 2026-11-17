// Test pravidla hromádky: k vykládce jen samotná vrchní karta, žolík ve vykládce se smí posunout. Spuštění: node tools/piletest.js
const E = require('../src/client/engine.js');
// postaví stav: moje vykládka z karet `meld` (pořadí jak se vykládá), vrchní karta hromádky `top`, v ruce `hand`
function setup(meld, top, hand) {
  const st = E.newGame([{ name: 'A' }, { name: 'B', isBot: true }]); E.startRound(st);
  const pool = [...st.stock, ...st.players[0].hand, ...st.players[1].hand, ...st.pile]; const used = new Set();
  const take = (code) => { const r = code === 'JK' ? 'JK' : code.slice(0, -1); const s = code === 'JK' ? null : code.slice(-1); const c = pool.find((c) => c.r === r && (s == null || c.s === s) && !used.has(c.id)); used.add(c.id); return c; };
  const mc = meld.map(take); const tc = take(top); const hc = hand.map(take);
  const filler = pool.filter((c) => !used.has(c.id) && c.r !== '3' && c.r !== '2' && c.r !== 'JK').slice(0, 6); filler.forEach((c) => used.add(c.id));
  st.players[0].hand = mc.concat(hc, filler); st.current = 0; st.phase = 'play'; st.teams[0].opened = true; st.turn.laid = 0;
  const r = E.meldNew(st, 0, mc.map((c) => c.id), meld.includes('JK') || meld.some((x) => x.startsWith('2')) ? undefined : undefined);
  if (!r.ok) return { err: 'nejde vyložit ' + meld.join(' ') + ' ' + JSON.stringify(r.error) };
  st.pile = [tc]; st.phase = 'draw'; st.turn = { laid: 0 };
  return { st, meldId: st.teams[0].melds[0].id, hc };
}
const cases = [
  ['9H 10H JH + 8H z hromádky', ['9H', '10H', 'JH'], '8H', []],
  ['9H 10H JH + 7H samotná', ['9H', '10H', 'JH'], '7H', []],
  ['9H 10H JH + 7H s 2H z ruky (tvůj tah)', ['9H', '10H', 'JH'], '7H', ['2H']],
  ['9H 10H JH + 7H s 8H z ruky', ['9H', '10H', 'JH'], '7H', ['8H']],
  ['9H 10H JH JK(Q) + 7H: joker dolů jako 8', ['9H', '10H', 'JH', 'JK'], '7H', []],
  ['5H JK 7H + 6H: joker na kraj', ['5H', 'JK', '7H'], '6H', []],
  ['2C 9H 10H JH (2 jako 8) + 8H', ['2C', '9H', '10H', 'JH'], '8H', []],
  ['9H JK JH (JK jako 10) + 7H: nejde', ['9H', 'JK', 'JH'], '7H', []],
  ['9H 10H JH JK(Q) + KH: joker zůstane', ['9H', '10H', 'JH', 'JK'], 'KH', []],
  ['KS KD + KH (skupina)', ['KS', 'KD', 'KC'], 'KH', []],
];
for (const [label, meld, top, hand] of cases) {
  const s = setup(meld, top, hand);
  if (s.err) { console.log(label, '→', s.err); continue; }
  const r = E.checkTakePile(s.st, 0, s.hc.map((c) => c.id), s.meldId);
  const ch = r.a && r.a.choice ? ' (volba: ' + JSON.stringify(r.a.choice) + ')' : '';
  console.log((r.error ? '✗ ' : '✓ ') + label + (r.error ? '  [' + r.error.k + ']' : ch));
}
