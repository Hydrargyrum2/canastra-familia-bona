// Past s černými trojkami: soupeř má canastu a 2 karty, na hromádce jsou 3 černé trojky a navrchu 7♥.
const E = require('../src/client/engine.js'); const B = require('../src/client/bot.js');
function setup(oppHand, extraPile) {
  const st = E.newGame([{ name: 'Ty' }, { name: 'Caio', isBot: true }]);
  E.startRound(st, () => 0.42);
  const all = [].concat(st.stock, st.pile, ...st.players.map(p => p.hand), ...st.teams.map(t => t.red3));
  const take = (r, s) => { const i = all.findIndex(c => c.r === r && c.s === s); return all.splice(i, 1)[0]; };
  // soupeř (hráč 0) má canastu na stole
  st.teams[0].melds = [{ id: 1, type: 'seq', key: 'S', wildPos: null, cards: ['4','5','6','7','8','9','10'].map(r => take(r, 'S')) }];
  st.teams[1].melds = []; st.teams[0].red3 = []; st.teams[1].red3 = [];
  const pile = [take('3','S'), take('3','C'), take('3','S')].concat(extraPile.map(([r,s]) => take(r,s))).concat([take('7','H')]);
  st.players[1].hand = [take('5','H'), take('6','H'), take('K','D'), take('9','C'), take('J','C'), take('Q','D'), take('A','C'), take('8','D')];
  st.players[0].hand = all.filter(c => !E.isRed3(c) && !E.isThree(c)).slice(0, oppHand);
  const used = new Set([].concat(pile, st.players[0].hand, st.players[1].hand, st.teams[0].melds[0].cards).map(c => c.id));
  st.stock = all.filter(c => !used.has(c.id) && !E.isRed3(c)).concat(all.filter(c => E.isRed3(c) && !used.has(c.id)).slice(0,0));
  st.teams[1].red3 = all.filter(c => E.isRed3(c) && !used.has(c.id));
  st.pile = pile; st.current = 1; st.phase = 'draw';
  st.turn = { from: null, mustMeld: null, laid: 0, pileForbidden: false, lastTurn: false, snap: null, newIds: [] };
  return st;
}
for (const [oppHand, extra, label] of [
  [2, [], 'soupeř má canastu a 2 karty, hromádka = 3 černé trojky + 7♥'],
  [12, [], 'soupeř má canastu a 12 karet, stejná hromádka'],
  [2, [['8','H'],['9','H'],['10','H'],['J','H']], 'soupeř má 2 karty, ale v hromádce je i 8♥ 9♥ 10♥ J♥'],
]) {
  const st = setup(oppHand, extra);
  console.log(label, '| nebezpečí', B.dangerLevel(st, 1), '| bere hromádku:', !!B.wantsPile(st, 1), '| karet celkem', E.totalCards(st));
}
