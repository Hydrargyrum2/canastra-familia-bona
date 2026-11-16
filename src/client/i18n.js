/* Překlady: čeština, angličtina, brazilská portugalština. */
(function (root) {
  'use strict';
  const csPl = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
  const enS = (n) => (n === 1 ? '' : 's');

  const cs = {
    lang_name: 'Čeština',
    title: 'Canastra família Bona',
    you_name: 'Ty', team_us: 'Vy', team_them: 'Soupeři',
    goal: '{n}', round: 'kolo {n}',
    bot_tag_opp: 'robot · soupeř', bot_tag_partner: 'robot · parťák',
    red3_zero: ' (zatím 0 b.)', needs_open: 'potřebuje {min}',
    melds_mine: 'Tvoje vykládky', melds_ours: 'Naše vykládky', melds_of: 'Vykládky – {name}',
    none_yet: 'Zatím nic vyloženo.',
    meld_set: 'skupina', meld_seq: 'postupka', clean_can: 'čistá canasta', dirty_can: 'špinavá canasta',
    add_to: 'Přiložit k: {label}, karet {n}',
    stock: 'Balíček', pile: 'Hromádka', blocked: 'zablokováno',
    whole_pile: 'Celá hromádka', what_happened: 'Co se stalo', rules: 'Pravidla',
    round_over_short: 'Kolo skončilo.', playing: 'Hraje {name}',
    hint_draw: 'Lízni si z balíčku.',
    hint_pile_how: 'Na hromádku vyber z ruky karty, se kterými vrchní kartu hned vyložíš, nebo ťukni na svou vykládku.',
    hint_stock_out: 'Balíček došel.', hint_else_end: 'Jinak kolo končí.',
    hint_sel: 'Vylož vybrané karty, přilož je ťuknutím na svou vykládku, nebo jednu odhoď.',
    hint_play: 'Vyber karty k vyložení, nebo jednu kartu k odhození.',
    open_badge: 'první vyložení {v}/{min}',
    your_cards: 'Tvoje karty · {n}', selected: 'vybráno {n} · {v} b.', clear: 'zrušit',
    btn_result_game: 'Výsledek hry', btn_result_round: 'Výsledek kola',
    btn_take_pile: 'Vzít hromádku', btn_end_round: 'Ukončit kolo', btn_draw: 'Líznout',
    btn_meld: 'Vyložit', btn_discard: 'Odhodit', btn_undo: 'Vrátit',
    toast_red3: 'Červená trojka se vyložila sama a dolízl sis za ni.',
    toast_pick_one: 'Vyber jednu kartu, kterou chceš odhodit.',
    menu: 'Menu', keep_playing: 'Hrát dál', new1: 'Nová hra 1 na 1', new2: 'Nová hra 2 na 2', settings: 'Nastavení',
    start_lead: 'Postupky v barvě, skupiny jen z králů, es a čtyřek, dvojky a jokery jako žolíci. Hraje se do 4 000.',
    start_1v1: '1 na 1 proti robotovi', start_2v2: '2 na 2: ty a robot proti dvěma robotům', read_rules: 'Přečíst pravidla',
    back: 'Zpět', close: 'Zavřít', done: 'Hotovo',
    pile_title: 'Odhazovací hromádka',
    pile_count: (p) => `${p.n} ${csPl(p.n, 'karta', 'karty', 'karet')}, vrchní je první.`,
    pile_empty_txt: 'Hromádka je prázdná.',
    log_title: 'Co se stalo',
    res_stock_out: 'Balíček došel',
    res_stock_out_lead: 'Karty v ruce propadají, počítá se jen to, co je na stole.',
    res_out_lead: 'Kdo zavřel, dostává body za karty v ruce soupeře.',
    out_me: 'Zavřel jsi kolo', out_us: 'Váš tým zavřel kolo', out_opp: '{name} zavřel kolo', out_opps: 'Soupeři zavřeli kolo',
    win_me: 'Vyhrál jsi!', win_us: 'Vyhráli jste!', win_opp: '{name} vyhrál', win_opps: 'Soupeři vyhráli', draw_game: 'Remíza!',
    final_score: 'Konečné skóre {a} : {b}.',
    row_cards: 'Karty na stole', row_canastas: 'Canasty ({a} : {b})', row_red3: 'Červené trojky ({a} : {b})',
    row_capture: 'Karty soupeře v ruce', row_round: 'Za kolo', row_total: 'Celkem',
    next_round: 'Další kolo', look_table: 'Podívat se na stůl',
    settings_lang: 'Jazyk',
    joker: 'jokera',
    settings_level: 'Obtížnost robotů', level_easy: 'Lehká', level_medium: 'Střední', level_hard: 'Těžká',
    level_easy_hint: 'Robot vykládá hned všechno a bere každou hromádku, kterou může.',
    level_medium_hint: 'Robot hraje rozumně, ale občas odhodí, co by neměl, a skočí na past s černými trojkami.',
    level_hard_hint: 'Robot drží karty v ruce, hlídá, kdy můžeš zavřít, a hromádku bere, jen když se mu vyplatí.',
    my_seat: 'Tvoje místo', partner_seat: 'Tvůj parťák',
    wild_title: 'Kam dát žolíka?', wild_lead: 'Žolík může v postupce stát dole, nebo nahoře. Pod čtyřku ani nad eso jít nemůže.',
    wild_low: 'Dolů, jako {card}', wild_high: 'Nahoru, jako {card}', cancel: 'Zrušit',
    // chyby z pravidel
    seq_need_natural: 'Postupka potřebuje obyčejné karty.',
    seq_bad_card: 'Tahle karta do postupky nepatří.',
    seq_one_suit: 'Postupka musí být celá v jedné barvě.',
    seq_dup: 'V postupce nesmí být dvě stejné karty.',
    seq_consecutive: 'Karty v postupce musí jít po sobě.',
    seq_wild_spot: 'Místo, které drží žolík, už nejde obsadit.',
    seq_full: 'Postupka je už plná.',
    seq_one_gap: 'Karty v postupce musí jít po sobě. Žolík zaplní jen jednu mezeru.',
    meld_min3: 'Vykládka potřebuje aspoň 3 karty.',
    no_threes: 'Trojky se do vykládek nedávají.',
    one_wild: 'V jedné vykládce smí být jen jeden žolík.',
    min2_natural: 'Vykládka potřebuje aspoň 2 obyčejné karty.',
    set_ranks: 'Skupiny stejné hodnoty jdou jen z králů, es a čtyřek. Ostatní karty skládej do postupek.',
    select_first: 'Nejdřív vyber karty.',
    set_same_rank: 'Do skupiny patří jen karty stejné hodnoty.',
    seq_same_suit: 'Do postupky patří jen karty stejné barvy.',
    not_your_turn: 'Teď nejsi na tahu.',
    pile_returned: 'Hromádku sis v tomhle tahu už vrátil.',
    pile_empty: 'Odhazovací hromádka je prázdná.',
    pile_blocked: 'Hromádka je zablokovaná (navrchu je černá trojka nebo žolík).',
    pile_no_use: 'Vrchní kartu z hromádky nemáš s čím vyložit.',
    cant_draw: 'Teď nemůžeš lízat.',
    stock_empty: 'Lízací balíček je prázdný.',
    invalid_selection: 'Neplatný výběr karet.',
    own_melds_only: 'Přikládat můžeš jen ke svým vykládkám.',
    pile_pick_cards: 'Vyber z ruky karty, se kterými vrchní kartu hned vyložíš, nebo ťukni na svou vykládku, kam ji přiložíš.',
    keep_two: 'Bez canasty si musíš nechat v ruce aspoň 2 karty.',
    open_min: 'První vyložení musí mít aspoň {min} bodů (teď {v}).',
    open_min_short: 'První vyložení musí mít aspoň {min} bodů.',
    open_min_undo: 'První vyložení musí mít aspoň {min} bodů (teď {v}). Přidej karty, nebo dej Vrátit.',
    stock_not_empty: 'V balíčku ještě jsou karty.',
    cant_meld: 'Teď nemůžeš vykládat.',
    cant_discard: 'Teď nemůžeš odhazovat.',
    not_your_card: 'Tuhle kartu nemáš.',
    must_meld_top: 'Kartu z vršku hromádky musíš nejdřív vyložit.',
    last_card_no_canasta: 'Bez canasty nemůžeš odhodit poslední kartu.',
    nothing_to_undo: 'Teď není co vracet.',
    // záznam hry
    log_red3: '{name} vykládá červenou trojku ({n}×).', log_red3_you: 'Vykládáš červenou trojku ({n}×).',
    log_round_start: 'Kolo {round} začíná. Na tahu je {name}.', log_round_start_you: 'Kolo {round} začíná. Začínáš ty.',
    log_stock_out_nopile: 'Lízací balíček došel a hromádku si nikdo nemůže vzít.',
    log_draw: '{name} si líže z balíčku.', log_draw_you: 'Lížeš z balíčku.',
    log_draw_red: '{name} si líže z balíčku a vykládá červenou trojku ({n}×).',
    log_draw_red_you: 'Lížeš z balíčku a vykládáš červenou trojku ({n}×).',
    log_stock_out: 'Lízací balíček došel, kolo končí.',
    log_take_pile: (p) => `${p.name} vykládá ${p.card} z hromádky a bere ji (${p.n} ${csPl(p.n, 'karta', 'karty', 'karet')}).`,
    log_take_pile_you: (p) => `Vykládáš ${p.card} z hromádky a bereš ji (${p.n} ${csPl(p.n, 'karta', 'karty', 'karet')}).`,
    log_pass: '{name} si hromádku nebere. Kolo končí.', log_pass_you: 'Hromádku si nebereš. Kolo končí.',
    log_meld_set: (p) => `${p.name} vykládá skupinu (${p.n} ${csPl(p.n, 'karta', 'karty', 'karet')}).`,
    log_meld_set_you: (p) => `Vykládáš skupinu (${p.n} ${csPl(p.n, 'karta', 'karty', 'karet')}).`,
    log_meld_seq: (p) => `${p.name} vykládá postupku (${p.n} ${csPl(p.n, 'karta', 'karty', 'karet')}).`,
    log_meld_seq_you: (p) => `Vykládáš postupku (${p.n} ${csPl(p.n, 'karta', 'karty', 'karet')}).`,
    log_add: (p) => `${p.name} přikládá ${p.n === 1 ? 'kartu' : p.n + ' ' + csPl(p.n, 'kartu', 'karty', 'karet')}.`,
    log_add_you: (p) => `Přikládáš ${p.n === 1 ? 'kartu' : p.n + ' ' + csPl(p.n, 'kartu', 'karty', 'karet')}.`,
    log_add_canasta: (p) => `${p.name} přikládá ${p.n === 1 ? 'kartu' : p.n + ' ' + csPl(p.n, 'kartu', 'karty', 'karet')}. Má canastu!`,
    log_add_canasta_you: (p) => `Přikládáš ${p.n === 1 ? 'kartu' : p.n + ' ' + csPl(p.n, 'kartu', 'karty', 'karet')}. Máš canastu!`,
    log_out: '{name} zavírá kolo!', log_out_you: 'Zavíráš kolo!',
    log_discard: '{name} odhazuje {card}.', log_discard_you: 'Odhazuješ {card}.',
    log_undo_pile: '{name} vrací hromádku.', log_undo_pile_you: 'Vracíš hromádku.',
    log_wild_moved: '{name} nahrazuje žolíka a posouvá ho v postupce.', log_wild_moved_you: 'Nahrazuješ žolíka a posouváš ho v postupce.',
    rules_html: `
      <h2>Pravidla</h2>
      <p>Hraje se 1 na 1, nebo ve čtyřech ve dvou týmech. Dva balíčky se 4 jokery, každý dostane 13 karet. Pořadí karet je 4 až eso.</p>
      <h3>Vykládání</h3>
      <ul>
        <li>Postupky aspoň 3 karet stejné barvy, třeba 5♥ 6♥ 7♥.</li>
        <li>Skupiny stejné hodnoty jen z králů, es a čtyřek.</li>
        <li>Žolíci jsou dvojky a jokery, v jedné vykládce nejvýš jeden.</li>
        <li>Žolíka v postupce můžeš nahradit kartou, kterou zastupuje (z ruky i z hromádky). Žolík se pak posune jinam ve stejné postupce a ty si vybereš, jestli dolů, nebo nahoru. Pod čtyřku ani nad eso nejde a do jiné vykládky ho přesunout nejde.</li>
        <li>Canasta má 7 a víc karet. Čistá je bez žolíka.</li>
        <li>Nad 2 000 bodů musí první vyložení v kole dát aspoň 150 bodů.</li>
      </ul>
      <h3>Tah</h3>
      <ul>
        <li>Lízneš z balíčku, nebo vezmeš celou hromádku. Hromádku jen tak, že její vrchní kartu hned vyložíš s kartami z ruky nebo ji přiložíš ke své vykládce.</li>
        <li>Odhozená černá trojka, dvojka nebo joker hromádku zablokuje.</li>
        <li>Červené trojky se samy vyloží a dolízne se za ně karta.</li>
        <li>Zavřeš, když ti nezůstane žádná karta a máš aspoň jednu canastu.</li>
        <li>Když dojde balíček, další hráč si zahraje už jen s hromádkou. Karty v ruce pak propadají.</li>
      </ul>
      <h3>Body</h3>
      <ul>
        <li>Karta 10, eso 20, dvojka a joker 50.</li>
        <li>Canasta 100. Čistá navíc +100 za každou kartu nad 7.</li>
        <li>Červená trojka 100, ale jen když máš canastu.</li>
        <li>Kdo zavře, dostane body za karty v ruce soupeře. Černá trojka v jeho ruce je za 100.</li>
        <li>Hraje se do 4 000.</li>
      </ul>`,
  };

  const en = {
    lang_name: 'English',
    title: 'Canastra família Bona',
    you_name: 'You', team_us: 'Us', team_them: 'Opponents',
    goal: '{n}', round: 'round {n}',
    bot_tag_opp: 'bot · opponent', bot_tag_partner: 'bot · partner',
    red3_zero: ' (0 pts for now)', needs_open: 'needs {min}',
    melds_mine: 'Your melds', melds_ours: 'Our melds', melds_of: "{name}'s melds",
    none_yet: 'Nothing melded yet.',
    meld_set: 'set', meld_seq: 'run', clean_can: 'clean canasta', dirty_can: 'dirty canasta',
    add_to: 'Add to: {label}, {n} cards',
    stock: 'Stock', pile: 'Discard pile', blocked: 'blocked',
    whole_pile: 'Whole pile', what_happened: 'What happened', rules: 'Rules',
    round_over_short: 'Round over.', playing: '{name} is playing',
    hint_draw: 'Draw from the stock.',
    hint_pile_how: 'To take the pile, select cards from your hand that meld with its top card, or tap one of your melds.',
    hint_stock_out: 'The stock is empty.', hint_else_end: 'Otherwise the round ends.',
    hint_sel: 'Meld the selected cards, tap one of your melds to add them, or discard one.',
    hint_play: 'Select cards to meld, or one card to discard.',
    open_badge: 'first meld {v}/{min}',
    your_cards: 'Your cards · {n}', selected: '{n} selected · {v} pts', clear: 'clear',
    btn_result_game: 'Game result', btn_result_round: 'Round result',
    btn_take_pile: 'Take pile', btn_end_round: 'End round', btn_draw: 'Draw',
    btn_meld: 'Meld', btn_discard: 'Discard', btn_undo: 'Undo',
    toast_red3: 'A red three was laid down automatically and you drew a replacement.',
    toast_pick_one: 'Select one card to discard.',
    menu: 'Menu', keep_playing: 'Keep playing', new1: 'New game 1 vs 1', new2: 'New game 2 vs 2', settings: 'Settings',
    start_lead: 'Runs in one suit, sets only of kings, aces and fours, twos and jokers are wild. First to 4,000 wins.',
    start_1v1: '1 vs 1 against a bot', start_2v2: '2 vs 2: you and a bot against two bots', read_rules: 'Read the rules',
    back: 'Back', close: 'Close', done: 'Done',
    pile_title: 'Discard pile',
    pile_count: (p) => `${p.n} card${enS(p.n)}, top card first.`,
    pile_empty_txt: 'The pile is empty.',
    log_title: 'What happened',
    res_stock_out: 'The stock ran out',
    res_stock_out_lead: 'Cards in hand are lost. Only cards on the table count.',
    res_out_lead: 'Whoever went out scores the cards left in the opponents’ hands.',
    out_me: 'You went out', out_us: 'Your team went out', out_opp: '{name} went out', out_opps: 'The opponents went out',
    win_me: 'You won!', win_us: 'Your team won!', win_opp: '{name} won', win_opps: 'The opponents won', draw_game: "It's a draw!",
    final_score: 'Final score {a} : {b}.',
    row_cards: 'Cards on the table', row_canastas: 'Canastas ({a} : {b})', row_red3: 'Red threes ({a} : {b})',
    row_capture: 'Opponents’ cards in hand', row_round: 'This round', row_total: 'Total',
    next_round: 'Next round', look_table: 'Look at the table',
    settings_lang: 'Language',
    joker: 'a joker',
    settings_level: 'Bot difficulty', level_easy: 'Easy', level_medium: 'Medium', level_hard: 'Hard',
    level_easy_hint: 'The bot melds everything right away and takes every pile it can.',
    level_medium_hint: 'The bot plays sensibly but sometimes discards the wrong card and falls for the black-three trap.',
    level_hard_hint: 'The bot holds cards back, watches when you can go out, and takes the pile only when it pays off.',
    my_seat: 'Your seat', partner_seat: 'Your partner',
    wild_title: 'Where should the wild card go?', wild_lead: 'The wild card can go at the bottom or the top of the run. It can never go below 4 or above ace.',
    wild_low: 'Bottom, as {card}', wild_high: 'Top, as {card}', cancel: 'Cancel',
    seq_need_natural: 'A run needs natural cards.',
    seq_bad_card: "That card can't go in a run.",
    seq_one_suit: 'A run must be all one suit.',
    seq_dup: "A run can't contain the same card twice.",
    seq_consecutive: 'Cards in a run must be consecutive.',
    seq_wild_spot: "The spot held by the wild card can't be taken.",
    seq_full: 'That run is already complete.',
    seq_one_gap: 'Cards in a run must be consecutive. A wild card fills only one gap.',
    meld_min3: 'A meld needs at least 3 cards.',
    no_threes: "Threes can't be melded.",
    one_wild: 'Only one wild card per meld.',
    min2_natural: 'A meld needs at least 2 natural cards.',
    set_ranks: 'Sets of the same rank are only for kings, aces and fours. Put other cards in runs.',
    select_first: 'Select cards first.',
    set_same_rank: 'A set takes only cards of the same rank.',
    seq_same_suit: 'A run takes only cards of the same suit.',
    not_your_turn: "It's not your turn.",
    pile_returned: 'You already put the pile back this turn.',
    pile_empty: 'The discard pile is empty.',
    pile_blocked: 'The pile is blocked (a black three or wild card is on top).',
    pile_no_use: 'You have nothing to meld the top card of the pile with.',
    cant_draw: "You can't draw now.",
    stock_empty: 'The stock is empty.',
    invalid_selection: 'Invalid card selection.',
    own_melds_only: 'You can only add to your own melds.',
    pile_pick_cards: 'Select cards from your hand to meld with the top card right away, or tap the meld you want to add it to.',
    keep_two: 'Without a canasta you must keep at least 2 cards in hand.',
    open_min: 'Your first meld must be worth at least {min} points (now {v}).',
    open_min_short: 'Your first meld must be worth at least {min} points.',
    open_min_undo: 'Your first meld must be worth at least {min} points (now {v}). Meld more cards or tap Undo.',
    stock_not_empty: 'There are still cards in the stock.',
    cant_meld: "You can't meld now.",
    cant_discard: "You can't discard now.",
    not_your_card: "You don't have that card.",
    must_meld_top: 'Meld the top card of the pile first.',
    last_card_no_canasta: "Without a canasta you can't discard your last card.",
    nothing_to_undo: 'Nothing to undo.',
    log_red3: '{name} lays down a red three ({n}×).', log_red3_you: 'You lay down a red three ({n}×).',
    log_round_start: 'Round {round} begins. {name} plays first.', log_round_start_you: 'Round {round} begins. You play first.',
    log_stock_out_nopile: 'The stock ran out and nobody can take the pile.',
    log_draw: '{name} draws from the stock.', log_draw_you: 'You draw from the stock.',
    log_draw_red: '{name} draws from the stock and lays down a red three ({n}×).',
    log_draw_red_you: 'You draw from the stock and lay down a red three ({n}×).',
    log_stock_out: 'The stock ran out. The round ends.',
    log_take_pile: (p) => `${p.name} melds ${p.card} from the pile and takes it (${p.n} card${enS(p.n)}).`,
    log_take_pile_you: (p) => `You meld ${p.card} from the pile and take it (${p.n} card${enS(p.n)}).`,
    log_pass: '{name} passes on the pile. The round ends.', log_pass_you: 'You pass on the pile. The round ends.',
    log_meld_set: '{name} melds a set of {n}.', log_meld_set_you: 'You meld a set of {n}.',
    log_meld_seq: '{name} melds a run of {n}.', log_meld_seq_you: 'You meld a run of {n}.',
    log_add: (p) => `${p.name} adds ${p.n} card${enS(p.n)}.`,
    log_add_you: (p) => `You add ${p.n} card${enS(p.n)}.`,
    log_add_canasta: (p) => `${p.name} adds ${p.n} card${enS(p.n)}. Canasta!`,
    log_add_canasta_you: (p) => `You add ${p.n} card${enS(p.n)}. Canasta!`,
    log_out: '{name} goes out!', log_out_you: 'You go out!',
    log_discard: '{name} discards {card}.', log_discard_you: 'You discard {card}.',
    log_undo_pile: '{name} puts the pile back.', log_undo_pile_you: 'You put the pile back.',
    log_wild_moved: '{name} replaces the wild card and moves it within the run.', log_wild_moved_you: 'You replace the wild card and move it within the run.',
    rules_html: `
      <h2>Rules</h2>
      <p>Play 1 vs 1, or four players in two teams. Two decks with 4 jokers, 13 cards each. Cards rank from 4 up to ace.</p>
      <h3>Melding</h3>
      <ul>
        <li>Runs of at least 3 cards in one suit, like 5♥ 6♥ 7♥.</li>
        <li>Sets of the same rank only for kings, aces and fours.</li>
        <li>Twos and jokers are wild, at most one per meld.</li>
        <li>You can replace a wild card in a run with the card it stands for (from your hand or the pile). The wild card then moves to another spot in the same run, and you choose whether it goes to the bottom or the top. It can never go below 4 or above ace, and never to a different meld.</li>
        <li>A canasta has 7 or more cards. A clean canasta has no wild card.</li>
        <li>Above 2,000 points your first meld of a round must be worth at least 150.</li>
      </ul>
      <h3>Your turn</h3>
      <ul>
        <li>Draw from the stock, or take the whole discard pile. You may take the pile only by melding its top card right away with cards from your hand, or by adding it to one of your melds.</li>
        <li>A discarded black three, two or joker blocks the pile.</li>
        <li>Red threes are laid down automatically and replaced with a new card.</li>
        <li>You go out when you have no cards left and at least one canasta.</li>
        <li>When the stock runs out, the next player may still play by taking the pile. Cards left in hand are then lost.</li>
      </ul>
      <h3>Scoring</h3>
      <ul>
        <li>Cards 10, ace 20, two and joker 50.</li>
        <li>Canasta 100. A clean canasta adds +100 for every card above 7.</li>
        <li>Red three 100, but only if you have a canasta.</li>
        <li>Whoever goes out scores the cards in the opponents’ hands. A black three there is worth 100.</li>
        <li>First to 4,000 wins.</li>
      </ul>`,
  };

  const pt = {
    lang_name: 'Português',
    title: 'Canastra família Bona',
    you_name: 'Você', team_us: 'Nós', team_them: 'Adversários',
    goal: '{n}', round: 'rodada {n}',
    bot_tag_opp: 'robô · adversário', bot_tag_partner: 'robô · parceiro',
    red3_zero: ' (0 pts por enquanto)', needs_open: 'precisa de {min}',
    melds_mine: 'Seus jogos', melds_ours: 'Nossos jogos', melds_of: 'Jogos de {name}',
    none_yet: 'Nada baixado ainda.',
    meld_set: 'trinca', meld_seq: 'sequência', clean_can: 'canastra limpa', dirty_can: 'canastra suja',
    add_to: 'Adicionar a: {label}, {n} cartas',
    stock: 'Monte', pile: 'Lixo', blocked: 'travado',
    whole_pile: 'Lixo inteiro', what_happened: 'O que aconteceu', rules: 'Regras',
    round_over_short: 'Rodada encerrada.', playing: '{name} está jogando',
    hint_draw: 'Compre do monte.',
    hint_pile_how: 'Para pegar o lixo, selecione cartas da mão que formem jogo com a carta de cima, ou toque em um dos seus jogos.',
    hint_stock_out: 'O monte acabou.', hint_else_end: 'Senão, a rodada termina.',
    hint_sel: 'Baixe as cartas selecionadas, toque em um dos seus jogos para adicioná-las, ou descarte uma.',
    hint_play: 'Selecione cartas para baixar, ou uma carta para descartar.',
    open_badge: 'primeira baixada {v}/{min}',
    your_cards: 'Suas cartas · {n}', selected: '{n} selecionadas · {v} pts', clear: 'limpar',
    btn_result_game: 'Resultado do jogo', btn_result_round: 'Resultado da rodada',
    btn_take_pile: 'Pegar o lixo', btn_end_round: 'Encerrar rodada', btn_draw: 'Comprar',
    btn_meld: 'Baixar', btn_discard: 'Descartar', btn_undo: 'Desfazer',
    toast_red3: 'Um três vermelho foi baixado automaticamente e você comprou outra carta.',
    toast_pick_one: 'Selecione uma carta para descartar.',
    menu: 'Menu', keep_playing: 'Continuar jogando', new1: 'Novo jogo 1 contra 1', new2: 'Novo jogo 2 contra 2', settings: 'Configurações',
    start_lead: 'Sequências do mesmo naipe, trincas só de reis, ases e quatros, dois e jokers são curingas. Vence quem chegar a 4.000.',
    start_1v1: '1 contra 1 com um robô', start_2v2: '2 contra 2: você e um robô contra dois robôs', read_rules: 'Ler as regras',
    back: 'Voltar', close: 'Fechar', done: 'Pronto',
    pile_title: 'Lixo',
    pile_count: (p) => `${p.n} carta${p.n === 1 ? '' : 's'}, a de cima primeiro.`,
    pile_empty_txt: 'O lixo está vazio.',
    log_title: 'O que aconteceu',
    res_stock_out: 'O monte acabou',
    res_stock_out_lead: 'As cartas na mão não contam. Só vale o que está na mesa.',
    res_out_lead: 'Quem bateu ganha os pontos das cartas na mão dos adversários.',
    out_me: 'Você bateu', out_us: 'Sua dupla bateu', out_opp: '{name} bateu', out_opps: 'Os adversários bateram',
    win_me: 'Você venceu!', win_us: 'Vocês venceram!', win_opp: '{name} venceu', win_opps: 'Os adversários venceram', draw_game: 'Empate!',
    final_score: 'Placar final {a} : {b}.',
    row_cards: 'Cartas na mesa', row_canastas: 'Canastras ({a} : {b})', row_red3: 'Três vermelhos ({a} : {b})',
    row_capture: 'Cartas na mão do adversário', row_round: 'Nesta rodada', row_total: 'Total',
    next_round: 'Próxima rodada', look_table: 'Ver a mesa',
    settings_lang: 'Idioma',
    joker: 'um joker',
    settings_level: 'Dificuldade dos robôs', level_easy: 'Fácil', level_medium: 'Médio', level_hard: 'Difícil',
    level_easy_hint: 'O robô baixa tudo na hora e pega todo lixo que puder.',
    level_medium_hint: 'O robô joga bem, mas às vezes descarta a carta errada e cai na armadilha dos três pretos.',
    level_hard_hint: 'O robô segura as cartas, fica de olho em quando você pode bater e só pega o lixo quando vale a pena.',
    my_seat: 'Seu lugar', partner_seat: 'Seu parceiro',
    wild_title: 'Onde fica o curinga?', wild_lead: 'O curinga pode ficar embaixo ou em cima da sequência. Nunca abaixo do 4 nem acima do ás.',
    wild_low: 'Embaixo, como {card}', wild_high: 'Em cima, como {card}', cancel: 'Cancelar',
    seq_need_natural: 'A sequência precisa de cartas naturais.',
    seq_bad_card: 'Essa carta não entra na sequência.',
    seq_one_suit: 'A sequência deve ser toda do mesmo naipe.',
    seq_dup: 'A sequência não pode ter duas cartas iguais.',
    seq_consecutive: 'As cartas da sequência devem ser consecutivas.',
    seq_wild_spot: 'A posição ocupada pelo curinga não pode ser substituída.',
    seq_full: 'Essa sequência já está completa.',
    seq_one_gap: 'As cartas da sequência devem ser consecutivas. O curinga preenche só um espaço.',
    meld_min3: 'Um jogo precisa de pelo menos 3 cartas.',
    no_threes: 'Os três não entram em jogos.',
    one_wild: 'Só um curinga por jogo.',
    min2_natural: 'Um jogo precisa de pelo menos 2 cartas naturais.',
    set_ranks: 'Trincas só de reis, ases e quatros. As outras cartas vão em sequências.',
    select_first: 'Selecione as cartas primeiro.',
    set_same_rank: 'A trinca aceita só cartas do mesmo valor.',
    seq_same_suit: 'A sequência aceita só cartas do mesmo naipe.',
    not_your_turn: 'Não é a sua vez.',
    pile_returned: 'Você já devolveu o lixo nesta jogada.',
    pile_empty: 'O lixo está vazio.',
    pile_blocked: 'O lixo está travado (há um três preto ou curinga em cima).',
    pile_no_use: 'Você não tem com o que baixar a carta de cima do lixo.',
    cant_draw: 'Você não pode comprar agora.',
    stock_empty: 'O monte está vazio.',
    invalid_selection: 'Seleção de cartas inválida.',
    own_melds_only: 'Você só pode adicionar aos seus jogos.',
    pile_pick_cards: 'Selecione cartas da mão para baixar com a carta de cima, ou toque no jogo onde quer adicioná-la.',
    keep_two: 'Sem canastra, você precisa ficar com pelo menos 2 cartas na mão.',
    open_min: 'A primeira baixada precisa valer pelo menos {min} pontos (agora {v}).',
    open_min_short: 'A primeira baixada precisa valer pelo menos {min} pontos.',
    open_min_undo: 'A primeira baixada precisa valer pelo menos {min} pontos (agora {v}). Baixe mais cartas ou toque em Desfazer.',
    stock_not_empty: 'Ainda há cartas no monte.',
    cant_meld: 'Você não pode baixar agora.',
    cant_discard: 'Você não pode descartar agora.',
    not_your_card: 'Você não tem essa carta.',
    must_meld_top: 'Baixe primeiro a carta de cima do lixo.',
    last_card_no_canasta: 'Sem canastra você não pode descartar a última carta.',
    nothing_to_undo: 'Não há nada para desfazer.',
    log_red3: '{name} baixa um três vermelho ({n}×).', log_red3_you: 'Você baixa um três vermelho ({n}×).',
    log_round_start: 'Começa a rodada {round}. {name} joga primeiro.', log_round_start_you: 'Começa a rodada {round}. Você joga primeiro.',
    log_stock_out_nopile: 'O monte acabou e ninguém pode pegar o lixo.',
    log_draw: '{name} compra do monte.', log_draw_you: 'Você compra do monte.',
    log_draw_red: '{name} compra do monte e baixa um três vermelho ({n}×).',
    log_draw_red_you: 'Você compra do monte e baixa um três vermelho ({n}×).',
    log_stock_out: 'O monte acabou. A rodada termina.',
    log_take_pile: (p) => `${p.name} baixa ${p.card} do lixo e pega o lixo (${p.n} carta${p.n === 1 ? '' : 's'}).`,
    log_take_pile_you: (p) => `Você baixa ${p.card} do lixo e pega o lixo (${p.n} carta${p.n === 1 ? '' : 's'}).`,
    log_pass: '{name} não pega o lixo. A rodada termina.', log_pass_you: 'Você não pega o lixo. A rodada termina.',
    log_meld_set: '{name} baixa uma trinca de {n}.', log_meld_set_you: 'Você baixa uma trinca de {n}.',
    log_meld_seq: '{name} baixa uma sequência de {n}.', log_meld_seq_you: 'Você baixa uma sequência de {n}.',
    log_add: (p) => `${p.name} adiciona ${p.n} carta${p.n === 1 ? '' : 's'}.`,
    log_add_you: (p) => `Você adiciona ${p.n} carta${p.n === 1 ? '' : 's'}.`,
    log_add_canasta: (p) => `${p.name} adiciona ${p.n} carta${p.n === 1 ? '' : 's'}. Canastra!`,
    log_add_canasta_you: (p) => `Você adiciona ${p.n} carta${p.n === 1 ? '' : 's'}. Canastra!`,
    log_out: '{name} bateu!', log_out_you: 'Você bateu!',
    log_discard: '{name} descarta {card}.', log_discard_you: 'Você descarta {card}.',
    log_undo_pile: '{name} devolve o lixo.', log_undo_pile_you: 'Você devolve o lixo.',
    log_wild_moved: '{name} substitui o curinga e o move dentro da sequência.', log_wild_moved_you: 'Você substitui o curinga e o move dentro da sequência.',
    rules_html: `
      <h2>Regras</h2>
      <p>Joga-se 1 contra 1, ou em quatro, em duas duplas. Dois baralhos com 4 jokers, 13 cartas para cada um. As cartas vão do 4 ao ás.</p>
      <h3>Baixar jogos</h3>
      <ul>
        <li>Sequências de pelo menos 3 cartas do mesmo naipe, como 5♥ 6♥ 7♥.</li>
        <li>Trincas do mesmo valor só de reis, ases e quatros.</li>
        <li>Dois e jokers são curingas, no máximo um por jogo.</li>
        <li>Você pode trocar o curinga de uma sequência pela carta que ele representa (da mão ou do lixo). O curinga então muda de lugar na mesma sequência, e você escolhe se vai para baixo ou para cima. Nunca abaixo do 4 nem acima do ás, e nunca para outro jogo.</li>
        <li>A canastra tem 7 cartas ou mais. A limpa não tem curinga.</li>
        <li>Acima de 2.000 pontos, a primeira baixada da rodada precisa valer pelo menos 150.</li>
      </ul>
      <h3>Sua jogada</h3>
      <ul>
        <li>Compre do monte ou pegue o lixo inteiro. Só dá para pegar o lixo baixando na hora a carta de cima com cartas da mão, ou adicionando-a a um dos seus jogos.</li>
        <li>Um três preto, dois ou joker descartado trava o lixo.</li>
        <li>Os três vermelhos são baixados automaticamente e você compra outra carta no lugar.</li>
        <li>Você bate quando fica sem cartas e tem pelo menos uma canastra.</li>
        <li>Quando o monte acaba, o próximo jogador só pode jogar pegando o lixo. As cartas na mão não contam.</li>
      </ul>
      <h3>Pontos</h3>
      <ul>
        <li>Carta 10, ás 20, dois e joker 50.</li>
        <li>Canastra 100. A limpa ganha +100 por carta acima de 7.</li>
        <li>Três vermelho 100, mas só se você tiver canastra.</li>
        <li>Quem bate ganha os pontos das cartas na mão dos adversários. Um três preto ali vale 100.</li>
        <li>Vence quem chegar a 4.000.</li>
      </ul>`,
  };

  const LOCALE = { cs: 'cs-CZ', en: 'en-US', pt: 'pt-BR' };
  const DICT = { cs, en, pt };
  root.I18N = { DICT, LOCALE, LANGS: ['cs', 'en', 'pt'] };
})(typeof window !== 'undefined' ? window : globalThis);
