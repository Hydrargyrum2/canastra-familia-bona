// Bobři a krysy – rozhraní (hra proti robotům, vše běží v prohlížeči).
(function () {
  'use strict';
  const E = window.BobriEngine;
  const B = window.BobriBot;
  const ME = 0;
  const SAVE = 'bobri-v1';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const BOT_NAMES = ['Bára', 'Kuba', 'Ema', 'Ota', 'Lída'];
  const AV = ['#f2c14e', '#7fd1b9', '#f4a3a8', '#b7a6f0', '#9ccdf2'];
  const LEVEL_TXT = { easy: 'lehký', medium: 'střední', hard: 'těžký' };
  const ACT = {
    swap: { name: 'Výměna', desc: 'vyměň jednu svou kartu za kartu soupeře – naslepo, nikdo se nedívá' },
    spy: { name: 'Kouknutí', desc: 'podívej se na jednu svou kartu' },
    again: { name: 'Druhá šance', desc: 'lízni si; když se ti karta nelíbí, odhoď ji a lízni ještě jednu' },
  };

  let st = null;
  let settings = { opps: 2, level: 'medium', helper: false };
  const ui = { mode: null, selMine: null, reveal: null, busy: false, timer: null, overlay: null, peekDone: false };

  // ---------- uložení ----------
  function save() { try { localStorage.setItem(SAVE, JSON.stringify({ st, settings })); } catch (e) { /* plno nebo zakázáno */ } }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE) || 'null');
      if (d && d.settings) settings = Object.assign(settings, d.settings);
      if (d && d.st && d.st.v === 1 && d.st.phase !== 'idle') st = d.st;
    } catch (e) { st = null; }
  }

  // ---------- kresby karet (vlastní) ----------
  const BEAVER = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="17" cy="15" r="7" fill="#7a4a2a"/><circle cx="47" cy="15" r="7" fill="#7a4a2a"/><circle cx="17" cy="15" r="3.5" fill="#c78d5f"/><circle cx="47" cy="15" r="3.5" fill="#c78d5f"/><ellipse cx="32" cy="33" rx="22" ry="20" fill="#9a6034"/><ellipse cx="32" cy="42" rx="13" ry="10" fill="#dcb88d"/><circle cx="24" cy="28" r="3.4" fill="#2b1a0e"/><circle cx="40" cy="28" r="3.4" fill="#2b1a0e"/><circle cx="25.2" cy="26.8" r="1.1" fill="#fff"/><circle cx="41.2" cy="26.8" r="1.1" fill="#fff"/><ellipse cx="32" cy="36.5" rx="4.4" ry="3.2" fill="#3a2414"/><rect x="27.6" y="43" width="8.8" height="9" rx="1.6" fill="#fff" stroke="#d9cdb6" stroke-width="0.8"/><line x1="32" y1="43" x2="32" y2="52" stroke="#d9cdb6" stroke-width="0.8"/><path d="M22 40 l-9 -2 M22 43 l-9 1 M42 40 l9 -2 M42 43 l9 1" stroke="#5c3a1f" stroke-width="0.9" stroke-linecap="round"/></svg>`;
  const RAT = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M48 50 C 60 52, 62 60, 52 62" stroke="#c98f9a" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="16" cy="17" r="9" fill="#87838f"/><circle cx="48" cy="17" r="9" fill="#87838f"/><circle cx="16" cy="17" r="5.2" fill="#f0b6c0"/><circle cx="48" cy="17" r="5.2" fill="#f0b6c0"/><path d="M11 30 C 11 17, 53 17, 53 30 C 53 41, 41 50, 32 57 C 23 50, 11 41, 11 30 Z" fill="#a19dab"/><path d="M20 27 l8 3 M44 27 l-8 3" stroke="#3b3742" stroke-width="2" stroke-linecap="round"/><circle cx="25" cy="33" r="2.9" fill="#1d1b22"/><circle cx="39" cy="33" r="2.9" fill="#1d1b22"/><circle cx="25.9" cy="32.2" r="0.9" fill="#fff"/><circle cx="39.9" cy="32.2" r="0.9" fill="#fff"/><circle cx="32" cy="55" r="3.2" fill="#e57b8c"/><path d="M27 50 l-11 -2 M27 52 l-10 3 M37 50 l11 -2 M37 52 l10 3" stroke="#5d5966" stroke-width="0.9" stroke-linecap="round"/><path d="M29 45 q3 3 6 0" stroke="#3b3742" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`;
  const ICON = {
    swap: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 24 h30 l-8 -8 M50 40 h-30 l8 8" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    spy: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6 32 C 16 16, 48 16, 58 32 C 48 48, 16 48, 6 32 Z" fill="#fff"/><circle cx="32" cy="32" r="10" fill="#c9443a"/><circle cx="32" cy="32" r="4.5" fill="#2a1311"/><circle cx="35" cy="29" r="2" fill="#fff"/></svg>`,
    again: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="14" width="26" height="36" rx="4" fill="rgba(255,255,255,0.55)" transform="rotate(-10 23 32)"/><rect x="26" y="12" width="26" height="36" rx="4" fill="#fff"/><path d="M39 22 v16 M31 30 h16" stroke="#c9443a" stroke-width="5" stroke-linecap="round"/></svg>`,
  };

  function cardHTML(c, opts) {
    const o = opts || {};
    const cls = ['card'];
    if (o.mini) cls.push('mini');
    if (o.cls) cls.push(o.cls);
    const attrs = o.attrs || '';
    const tag = o.button ? 'button' : 'div';
    const memo = o.memo != null ? `<span class="memo">${o.memo}</span>` : '';
    if (!c || o.down) {
      cls.push('back');
      return `<${tag} class="${cls.join(' ')}" ${attrs} aria-label="${esc(o.label || 'karta lícem dolů')}">${memo}</${tag}>`;
    }
    cls.push('front');
    if (c.a) {
      cls.push('act', 'a-' + c.a);
      return `<${tag} class="${cls.join(' ')}" ${attrs} aria-label="${esc(o.label || 'akční karta ' + ACT[c.a].name)}"><span class="art">${ICON[c.a]}</span><span class="lbl">${ACT[c.a].name}</span>${memo}</${tag}>`;
    }
    cls.push('num', 'v' + c.v);
    return `<${tag} class="${cls.join(' ')}" ${attrs} aria-label="${esc(o.label || 'karta ' + c.v)}"><span class="n">${c.v}</span><span class="art">${c.v >= 6 ? RAT : BEAVER}</span><span class="n2">${c.v}</span>${memo}</${tag}>`;
  }
  const cardName = (c) => (c.a ? ACT[c.a].name : String(c.v));

  // ---------- pomocné ----------
  const myTurn = () => st && st.current === ME && ['turn', 'drawn', 'spy', 'swap'].includes(st.phase);
  const isBotTurn = () => st && st.players[st.current].bot && ['turn', 'drawn', 'spy', 'swap'].includes(st.phase);
  const ended = () => st && (st.phase === 'roundOver' || st.phase === 'gameOver');
  const nameOf = (i) => (i === ME ? 'Ty' : st.players[i].name);
  function memoOf(p, s) {
    if (!settings.helper) return null;
    const k = st.know[ME][p][s];
    if (!k) return null;
    const c = st.players[p].cards[s];
    return c.a ? '★' : c.v;
  }
  function toast(msg, kind, ms) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = kind || '';
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, ms || 2200);
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- vykreslení ----------
  function render() {
    renderTop();
    if (!st) { $('#game').hidden = true; $('#start').hidden = false; renderStart(); renderOverlay(); return; }
    $('#start').hidden = true;
    $('#game').hidden = false;
    renderOpps();
    renderTable();
    renderMe();
    renderBar();
    renderOverlay();
  }

  function renderTop() {
    $('#roundInfo').innerHTML = st ? `Kolo <b>${st.round}</b> z ${st.rounds}` : '';
  }

  function renderOpps() {
    const opps = st.players.map((p, i) => i).filter((i) => i !== ME);
    const box = $('#opps');
    box.className = opps.length === 1 ? 'one' : opps.length >= 3 ? 'many' : '';
    box.innerHTML = opps.map((i) => {
      const p = st.players[i];
      const swapPick = myTurn() && st.phase === 'swap' && ui.selMine != null;
      const cards = p.cards.map((c, s) => cardHTML(c, {
        mini: true, down: !ended(), button: swapPick, memo: memoOf(i, s),
        cls: swapPick ? 'pick' : '',
        attrs: `data-slot="${i}-${s}" ${swapPick ? `data-act="oppcard" data-p="${i}" data-s="${s}"` : ''}`,
        label: `${p.name}: karta ${s + 1}`,
      })).join('');
      const holding = `<span class="hold ${st.current === i && st.drawn && st.phase === 'drawn' ? 'show' : ''}" data-hold="${i}">${cardHTML(null, { mini: true, down: true })}</span>`;
      return `<div class="opp ${st.current === i && st.phase !== 'peek' ? 'turn' : ''}" data-opp="${i}">
        <div class="ohead"><span class="av" style="background:${AV[(i - 1) % AV.length]}">${esc(p.name[0])}</span>
          <span class="oname">${esc(p.name)}</span><span class="lvl">${LEVEL_TXT[p.bot] || ''}</span>
          ${st.knocker === i ? '<span class="knockb">✊ klepe</span>' : ''}${holding}
          <span class="pts">${p.total}</span></div>
        <div class="row">${cards}</div></div>`;
    }).join('');
  }

  function renderTable() {
    const top = E.topDiscard(st);
    const dp = $('#drawPile');
    const canDraw = myTurn() && st.phase === 'turn';
    dp.className = 'pile' + (canDraw ? ' pick' : '');
    dp.innerHTML = (st.draw.length ? cardHTML(null, { down: true }) : '<span class="empty"></span>') + `<span class="cnt">${st.draw.length}</span><span class="plbl">BALÍČEK</span>`;
    const disc = $('#discardPile');
    const canTake = canDraw && E.canTakeDiscard(st);
    disc.className = 'pile' + (ui.mode === 'take' ? ' on' : canTake ? ' pick' : '');
    disc.innerHTML = (top ? cardHTML(top) : '<span class="empty"></span>') + `<span class="plbl">HROMÁDKA</span>`;
    const spot = $('#drawnSpot');
    if (st.drawn && st.current === ME && st.phase === 'drawn') {
      spot.innerHTML = cardHTML(st.drawn, { cls: 'flipin' }) + `<span class="hint">${st.again === 1 ? 'druhá šance' : 'v ruce'}</span>`;
    } else spot.innerHTML = '';
    $('#status').innerHTML = statusText();
  }

  function statusText() {
    if (st.phase === 'peek') return 'Zapamatuj si své <b>dvě krajní karty</b>. Prostřední neznáš. Pak už je uvidíš jen díky kouknutí.';
    if (st.phase === 'roundOver' || st.phase === 'gameOver') return 'Kolo skončilo.';
    let s = '';
    if (myTurn()) {
      const top = E.topDiscard(st);
      if (st.phase === 'turn') {
        if (ui.mode === 'take') s = `Ťukni na svou kartu, kterou vyměníš za <b>${top.v}</b>.`;
        else s = E.canTakeDiscard(st) ? `Tvůj tah: lízni z <b>balíčku</b>, nebo vezmi <b>${top.v}</b> z hromádky.` : 'Tvůj tah: lízni z <b>balíčku</b>. (Akční kartu z hromádky vzít nejde.)';
      } else if (st.phase === 'drawn') {
        const c = st.drawn;
        if (c.a) s = `<b>${ACT[c.a].name}</b>: ${ACT[c.a].desc}.`;
        else s = `Máš <b>${c.v}</b>. Ťukni na svou kartu, kterou za ni vyměníš, nebo ji odhoď.`;
        if (st.again === 1) s += ' Nelíbí se ti? Odhoď ji a lízni další.';
      } else if (st.phase === 'spy') s = 'Ťukni na svou kartu, na kterou se chceš <b>podívat</b>.';
      else if (st.phase === 'swap') s = ui.selMine == null ? 'Vyber <b>svou</b> kartu, kterou dáš pryč.' : 'Teď ťukni na kartu <b>soupeře</b>, se kterou ji vyměníš.';
    } else {
      s = `Hraje <b>${esc(nameOf(st.current))}</b>…`;
    }
    if (st.knocker !== null) s += `<div class="knockbar">✊ ${esc(nameOf(st.knocker))} ${st.knocker === ME ? 'jsi zaklepal/a' : 'zaklepal/a'} – každý má ještě jeden tah.</div>`;
    return s;
  }

  function renderMe() {
    const mine = st.players[ME];
    $('#me').className = st.current === ME && st.phase !== 'peek' ? 'turn' : '';
    $('#myTotal').textContent = `${mine.total} b.`;
    const pickable = myTurn() && (ui.mode === 'take' || (st.phase === 'drawn' && E.isNumber(st.drawn)) || st.phase === 'spy' || st.phase === 'swap');
    $('#myCards').innerHTML = mine.cards.map((c, s) => {
      const peekOpen = st.phase === 'peek' && !ui.peekDone && (s === 0 || s === E.SLOTS - 1);
      const revealOpen = ui.reveal && ui.reveal.slot === s && Date.now() < ui.reveal.until;
      const open = peekOpen || revealOpen || ended();
      const cls = [pickable ? 'pick' : '', ui.selMine === s ? 'sel' : '', revealOpen ? 'flipin' : ''].join(' ');
      return `<span class="slotwrap">${cardHTML(c, {
        down: !open, button: pickable, memo: open ? null : memoOf(ME, s), cls,
        attrs: `data-slot="${ME}-${s}" ${pickable ? `data-act="mycard" data-s="${s}"` : ''}`,
        label: open ? null : `tvoje karta ${s + 1}`,
      })}</span>`;
    }).join('');
  }

  function renderBar() {
    const bar = $('#bar');
    let h = '';
    if (st.phase === 'peek') h = '<button class="btn primary" data-act="peekdone">Mám zapamatováno</button>';
    else if (ended()) h = `<button class="btn primary" data-act="showres">${st.phase === 'gameOver' ? 'Konečné pořadí' : 'Výsledek kola'}</button>`;
    else if (myTurn()) {
      if (st.phase === 'turn') {
        const top = E.topDiscard(st);
        h = `<div class="two"><button class="btn primary" data-act="drawpile">Líznout z balíčku</button>
          <button class="btn" data-act="discardpile" ${E.canTakeDiscard(st) ? '' : 'disabled'}>${ui.mode === 'take' ? 'Zrušit' : `Vzít ${top && E.isNumber(top) ? top.v : ''} z hromádky`}</button></div>`;
      } else if (st.phase === 'drawn') {
        const c = st.drawn;
        const discardLbl = st.again === 1 ? 'Odhodit a líznout další' : 'Odhodit';
        h = c.a ? `<div class="two"><button class="btn primary" data-act="play">Zahrát: ${ACT[c.a].name}</button><button class="btn" data-act="discard">${discardLbl}</button></div>`
          : `<button class="btn" data-act="discard">${discardLbl}</button>`;
      }
      if (E.canKnock(st, ME)) h += `<button class="btn knock ${st.armed ? 'on' : ''}" data-act="knock" aria-pressed="${st.armed}">${st.armed ? '✊ Po tomhle tahu zaklepu ✓' : '✊ Po tahu zaklepat (konec kola)'}</button>`;
    }
    bar.innerHTML = h;
  }

  // ---------- start ----------
  function renderStart() {
    const seg = (key, vals, labels) => `<div class="seg">${vals.map((v, i) => `<button class="${settings[key] === v ? 'on' : ''}" data-act="set" data-k="${key}" data-v="${v}">${labels[i]}</button>`).join('')}</div>`;
    $('#start').innerHTML = `
      <div class="hero">
        <div class="cards">${cardHTML({ v: 1 })}${cardHTML(null, { down: true })}${cardHTML({ a: 'spy' })}${cardHTML({ v: 9 })}</div>
        <p>Karetní hra na paměť pro 2–6 hráčů. Měj před sebou co nejnižší karty, hlídej, kam se karty stěhují, a zaklepej ve správnou chvíli.</p>
      </div>
      <div class="field"><span>Počet soupeřů</span>${seg('opps', [1, 2, 3, 4, 5], ['1', '2', '3', '4', '5'])}</div>
      <div class="field"><span>Roboti</span>${seg('level', ['easy', 'medium', 'hard'], ['Lehcí', 'Střední', 'Těžcí'])}
        <small>${{ easy: 'Často zapomínají, co kde mají, a dělají chyby.', medium: 'Pamatují si pár tahů a hlídají, co kdo bere.', hard: 'Nic nezapomenou a sledují každou kartu.' }[settings.level]}</small></div>
      <div class="field"><button class="toggle ${settings.helper ? 'on' : ''}" data-act="helper"><span>Pomocník paměti<br><small style="color:var(--muted)">ukazuje hodnoty karet, které znáš</small></span><i></i></button></div>
      <div class="btns" style="display:grid;gap:8px"><button class="btn primary" data-act="newgame">Hrát</button></div>
      <div class="links"><button class="linkbtn" data-act="rules">Pravidla</button></div>`;
  }

  // ---------- okna ----------
  function renderOverlay() {
    const ov = $('#overlay');
    let h = '';
    if (ui.overlay === 'menu') h = menuHTML();
    else if (ui.overlay === 'rules') h = rulesHTML();
    else if (st && (st.phase === 'roundOver' || st.phase === 'gameOver') && ui.overlay !== 'hidden') h = roundHTML();
    ov.hidden = !h;
    const sheet = ov.querySelector('.sheet');
    if (sheet.dataset.h !== h) { sheet.dataset.h = h; sheet.innerHTML = h; }
  }

  function menuHTML() {
    return `<h2>Nabídka</h2>
      <div class="btns">
        <button class="toggle ${settings.helper ? 'on' : ''}" data-act="helper"><span>Pomocník paměti</span><i></i></button>
        <button class="btn" data-act="rules">Pravidla</button>
        <button class="btn" data-act="quit">Nová hra</button>
        <button class="btn primary" data-act="close">Zpět do hry</button>
      </div>`;
  }

  function rulesHTML() {
    return `<div class="rules"><h2>Pravidla</h2>
      <p>Každý má před sebou 4 karty lícem dolů. Na začátku kola se smíš podívat jen na <b>dvě krajní</b>. Cílem je mít na konci kola co <b>nejnižší součet</b> – bobři mají nízká čísla, krysy vysoká.</p>
      <div class="demo">${cardHTML({ v: 0 })}${cardHTML({ v: 4 })}${cardHTML({ v: 7 })}${cardHTML({ v: 9 })}</div>
      <h3>Tvůj tah</h3>
      <ul><li><b>Vzít kartu z hromádky</b> a vyměnit ji za jednu svou kartu (na tu se nedíváš). Všichni vidí, kam karta šla. Akční kartu z hromádky vzít nejde.</li>
      <li><b>Líznout z balíčku</b> – kartu vidíš jen ty. Číslo můžeš vyměnit za svou kartu, nebo ho odhodit. Akční kartu můžeš zahrát, nebo odhodit.</li></ul>
      <p>Co odchází z tvé řady, jde lícem nahoru na hromádku.</p>
      <h3>Akční karty</h3>
      <div class="demo">${cardHTML({ a: 'swap' })}${cardHTML({ a: 'spy' })}${cardHTML({ a: 'again' })}</div>
      <ul><li><b>Výměna</b> – vyměň jednu svou kartu za kartu soupeře. Naslepo, nikdo se nedívá.</li>
      <li><b>Kouknutí</b> – podívej se na jednu svou kartu.</li>
      <li><b>Druhá šance</b> – lízni si. Když se ti karta nelíbí, odhoď ji a lízni ještě jednu – s tou už musíš naložit jako s běžně líznutou kartou.</li></ul>
      <h3>Konec kola</h3>
      <p>Když si myslíš, že máš málo, <b>zaklepej</b> po svém tahu (až když každý odehrál aspoň jeden tah). Ostatní mají ještě jeden tah, ty už ne. Pak se karty otočí. Akční karta v řadě nemá hodnotu – nahradí se kartou z balíčku (dokud nepadne číslo). Body jsou součet čtyř karet.</p>
      <h3>Vítěz</h3>
      <p>Hraje se tolik kol, kolik je hráčů (ve dvou 4 kola). Vyhrává, kdo má po posledním kole <b>nejméně bodů</b>.</p>
      <p style="font-size:13px">Hra vychází z principu rodinné karetní hry na paměť; kresby a texty jsou vlastní.</p>
      <div class="btns"><button class="btn primary" data-act="close">Zavřít</button></div></div>`;
  }

  function roundHTML() {
    const lr = st.lastRound;
    if (!lr) return '';
    const best = Math.min(...lr.scores);
    const rows = st.players.map((p, i) => {
      const rep = lr.replaced[i] || [];
      const cards = lr.cards[i].map((c, s) => {
        const r = rep.find((x) => x.slot === s);
        return r ? `${cardHTML(r.from, { mini: true, cls: 'dim' })}<span class="rep">→</span>${cardHTML(c, { mini: true })}` : cardHTML(c, { mini: true });
      }).join('');
      return `<div class="pl ${lr.scores[i] === best ? 'best' : ''}"><span class="nm">${esc(nameOf(i))}${lr.knocker === i ? ' ✊' : ''}</span>
        <span class="sc"><b>${lr.scores[i]}</b><small>celkem ${p.total}</small></span><div class="row">${cards}</div></div>`;
    }).join('');
    const over = st.phase === 'gameOver';
    let title = `Kolo ${lr.round} – konec`;
    let lead = lr.knocker != null ? `${nameOf(lr.knocker)} ${lr.knocker === ME ? 'jsi zaklepal/a' : 'zaklepal/a'}.` : '';
    if (lr.knocker != null) lead += lr.scores[lr.knocker] === best ? ' Vyplatilo se – nejnižší součet.' : ' Někdo ale měl méně.';
    if (over) {
      const order = E.standings(st);
      const win = order[0];
      const winners = order.filter((x) => x.total === win.total).map((x) => x.i);
      title = winners.includes(ME) ? (winners.length > 1 ? 'Remíza na prvním místě!' : 'Vyhrál/a jsi! 🦫') : `Vyhrává ${st.players[win.i].name}`;
      lead = 'Nejméně bodů po všech kolech vyhrává.';
    }
    const table = `<table class="tot"><tr><th>Hráč</th>${st.players[0].scores.map((_, r) => `<th>${r + 1}.</th>`).join('')}<th>Celkem</th></tr>
      ${E.standings(st).map((x) => `<tr><td>${esc(nameOf(x.i))}</td>${st.players[x.i].scores.map((v) => `<td>${v}</td>`).join('')}<td><b>${x.total}</b></td></tr>`).join('')}</table>`;
    return `<h2>${esc(title)}</h2><p>${esc(lead)}</p><div class="res">${rows}</div>${table}
      <div class="btns">${over ? '<button class="btn primary" data-act="again">Hrát znovu</button><button class="btn" data-act="quit">Změnit nastavení</button>' : '<button class="btn primary" data-act="nextround">Další kolo</button><button class="btn" data-act="hideov">Podívat se na stůl</button>'}</div>`;
  }

  // ---------- animace ----------
  function rectOf(sel) {
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width ? r : null;
  }
  const slotSel = (p, s) => `[data-slot="${p}-${s}"]`;
  const holdSel = (p) => (p === ME ? '#drawnSpot' : `[data-hold="${p}"]`);
  function fromRect(sel) { return rectOf(sel) || rectOf('#drawPile .card') || rectOf('#drawPile'); }

  function fly(card, from, to, down, ms) {
    if (!from || !to) return Promise.resolve();
    const fx = $('#fx');
    const el = document.createElement('div');
    el.className = 'fly';
    el.style.width = from.width + 'px';
    el.innerHTML = cardHTML(card, { down });
    el.firstChild.style.setProperty('--cw', from.width + 'px');
    el.style.transform = `translate(${from.left}px, ${from.top}px)`;
    fx.appendChild(el);
    const sx = to.width / from.width;
    const dur = ms || 420;
    const anim = el.animate([
      { transform: `translate(${from.left}px, ${from.top}px) scale(1)` },
      { transform: `translate(${(from.left + to.left) / 2}px, ${Math.min(from.top, to.top) - 18}px) scale(${(1 + sx) / 2 * 1.06})`, offset: 0.5 },
      { transform: `translate(${to.left}px, ${to.top}px) scale(${sx})` },
    ], { duration: dur, easing: 'cubic-bezier(.3,.7,.3,1)' });
    return anim.finished.then(() => el.remove(), () => el.remove());
  }
  function hide(sel) { const el = document.querySelector(sel); if (el) el.style.visibility = 'hidden'; }
  function ring(sel) {
    const el = document.querySelector(sel);
    if (!el) return;
    const r = document.createElement('span');
    r.className = 'peekring';
    el.parentElement.style.position = 'relative';
    (el.parentElement.classList.contains('slotwrap') ? el.parentElement : el).appendChild(r);
    setTimeout(() => r.remove(), 1200);
  }

  // Přehraje události z engine nad starým vykreslením a pak vykreslí nový stav.
  async function play(ev) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (reduce) { if (e.t === 'knock') knockToast(e.pi); continue; }
      const mine = e.pi === ME;
      if (e.t === 'take') {
        const out = ev[i + 1] && ev[i + 1].t === 'out' ? ev[++i] : null;
        const a = fly(e.card, rectOf('#discardPile .card'), rectOf(slotSel(e.pi, e.slot)), false);
        hide('#discardPile .card');
        const b = out ? fly(out.card, rectOf(slotSel(e.pi, e.slot)), rectOf('#discardPile .card') || rectOf('#discardPile'), false, 520) : null;
        hide(slotSel(e.pi, e.slot));
        await Promise.all([a, b]);
      } else if (e.t === 'swapin') {
        const out = ev[i + 1] && ev[i + 1].t === 'out' ? ev[++i] : null;
        const src = mine ? rectOf('#drawnSpot .card') : fromRect(holdSel(e.pi));
        hide('#drawnSpot .card');
        const a = fly(e.card, src, rectOf(slotSel(e.pi, e.slot)), !mine);
        const b = out ? fly(out.card, rectOf(slotSel(e.pi, e.slot)), rectOf('#discardPile .card') || rectOf('#discardPile'), false, 520) : null;
        hide(slotSel(e.pi, e.slot));
        await Promise.all([a, b]);
      } else if (e.t === 'draw') {
        const sp = rectOf('#drawnSpot');
        const to = mine ? (sp && { left: sp.left + sp.width / 2 - 43, top: sp.height > 60 ? sp.top : sp.top - 60, width: 86, height: 120 }) : rectOf(holdSel(e.pi));
        await fly(e.card, rectOf('#drawPile .card'), to, !mine, 380);
        if (mine) { render(); }
        else { const h = document.querySelector(holdSel(e.pi)); if (h) h.classList.add('show'); }
      } else if (e.t === 'discard' || e.t === 'play') {
        const src = mine ? rectOf('#drawnSpot .card') : fromRect(holdSel(e.pi));
        hide('#drawnSpot .card');
        const h = !mine && document.querySelector(holdSel(e.pi));
        if (h) h.classList.remove('show');
        await fly(e.card, src, rectOf('#discardPile .card') || rectOf('#discardPile'), false, 420);
        if (e.t === 'play') {
          const disc = $('#discardPile');
          disc.innerHTML = cardHTML(e.card) + '<span class="plbl">HROMÁDKA</span>';
          if (!mine) { toast(`${nameOf(e.pi)} hraje ${ACT[e.card.a].name}`, 'info', 1300); await wait(500); }
        }
      } else if (e.t === 'spy') {
        if (mine) {
          ui.reveal = { slot: e.slot, until: Date.now() + 2300 };
          render();
          setTimeout(() => { if (ui.reveal && Date.now() >= ui.reveal.until) { ui.reveal = null; render(); } }, 2400);
          await wait(450);
        } else { ring(slotSel(e.pi, e.slot)); await wait(900); }
      } else if (e.t === 'exchange') {
        const ra = rectOf(slotSel(e.pi, e.mySlot));
        const rb = rectOf(slotSel(e.oPi, e.oSlot));
        hide(slotSel(e.pi, e.mySlot));
        hide(slotSel(e.oPi, e.oSlot));
        await Promise.all([fly(null, ra, rb, true, 650), fly(null, rb, ra, true, 650)]);
        if (e.oPi === ME || e.pi === ME) toast(e.pi === ME ? 'Vyměněno!' : `${nameOf(e.pi)} ti vyměnil/a kartu ${e.oSlot + 1}`, 'info', 1800);
      } else if (e.t === 'knock') {
        knockToast(e.pi);
      }
    }
  }
  function knockToast(pi) { toast(pi === ME ? '✊ Zaklepal/a jsi – ostatní mají ještě jeden tah.' : `✊ ${nameOf(pi)} klepe – konec kola! Každý má ještě jeden tah.`, '', 2600); }

  // ---------- průběh ----------
  async function run(res) {
    if (!res) return;
    if (!res.ok) { toast(errText(res.error)); return; }
    ui.busy = true;
    try { await play(res.ev || []); } catch (e) { /* animace nevadí */ }
    ui.busy = false;
    ui.mode = null;
    if (st.phase !== 'swap') ui.selMine = null;
    if (st.phase === 'roundOver' || st.phase === 'gameOver') ui.overlay = null;
    save();
    render();
    schedule();
  }
  function errText(k) {
    return { not_your_turn: 'Teď nejsi na tahu.', discard_action: 'Akční kartu z hromádky vzít nejde.', cant_knock: 'Zaklepat jde, až když každý odehrál aspoň jeden tah.' }[k] || 'Tohle teď nejde.';
  }

  function schedule() {
    clearTimeout(ui.timer);
    if (!st || ui.busy) return;
    if (st.phase === 'peek' && ui.peekDone) { E.beginTurns(st); save(); render(); }
    if (!isBotTurn()) return;
    const delay = st.phase === 'turn' ? 750 : 650;
    ui.timer = setTimeout(async () => {
      if (!isBotTurn() || ui.busy) return;
      const r = B.step(st, st.current);
      if (!r.ok) { console.warn('bot', r); return; }
      await run(r);
    }, delay);
  }

  function newGame() {
    const players = [{ name: 'Ty' }];
    for (let i = 0; i < settings.opps; i++) players.push({ name: BOT_NAMES[i], bot: settings.level });
    st = E.newGame({ players });
    ui.peekDone = false;
    ui.overlay = null;
    ui.mode = null;
    ui.selMine = null;
    save();
    render();
  }

  // ---------- ovládání ----------
  function act(name, el) {
    const d = el ? el.dataset : {};
    switch (name) {
      case 'set': settings[d.k] = d.k === 'opps' ? Number(d.v) : d.v; save(); render(); return;
      case 'helper': settings.helper = !settings.helper; save(); render(); return;
      case 'newgame': newGame(); return;
      case 'rules': ui.overlay = 'rules'; render(); return;
      case 'menu': ui.overlay = ended() && ui.overlay === 'hidden' ? null : st ? 'menu' : 'rules'; render(); return;
      case 'showres': ui.overlay = null; render(); return;
      case 'close': ui.overlay = null; render(); schedule(); return;
      case 'hideov': ui.overlay = 'hidden'; render(); return;
      case 'quit': clearTimeout(ui.timer); st = null; ui.overlay = null; save(); render(); return;
      case 'again': newGame(); return;
      case 'nextround': E.nextRound(st); ui.peekDone = false; ui.overlay = null; save(); render(); return;
      case 'peekdone': ui.peekDone = true; E.beginTurns(st); save(); render(); schedule(); return;
    }
    if (!st || ui.busy || !myTurn()) return;
    switch (name) {
      case 'drawpile':
        if (st.phase !== 'turn') return;
        ui.mode = null;
        run(E.drawCard(st, ME));
        return;
      case 'discardpile':
        if (st.phase !== 'turn') return;
        if (!E.canTakeDiscard(st)) { toast(errText('discard_action')); return; }
        ui.mode = ui.mode === 'take' ? null : 'take';
        render();
        return;
      case 'mycard': {
        const s = Number(d.s);
        if (ui.mode === 'take') { run(E.takeDiscard(st, ME, s)); return; }
        if (st.phase === 'drawn' && E.isNumber(st.drawn)) { run(E.swapDrawn(st, ME, s)); return; }
        if (st.phase === 'spy') { run(E.spy(st, ME, s)); return; }
        if (st.phase === 'swap') { ui.selMine = ui.selMine === s ? null : s; render(); }
        return;
      }
      case 'oppcard':
        if (st.phase !== 'swap' || ui.selMine == null) return;
        run(E.exchange(st, ME, ui.selMine, Number(d.p), Number(d.s)));
        return;
      case 'discard': run(E.discardDrawn(st, ME)); return;
      case 'play': run(E.playDrawn(st, ME)); return;
      case 'knock': {
        const r = E.setKnock(st, ME, !st.armed);
        if (!r.ok) toast(errText(r.error));
        save(); render();
      }
    }
  }

  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-act]');
    if (!a || a.disabled) return;
    if (a.tagName === 'A') return;
    act(a.dataset.act, a);
  });
  $('#overlay').addEventListener('click', (ev) => {
    if (ev.target.id === 'overlay' && (ui.overlay === 'menu' || ui.overlay === 'rules')) { ui.overlay = null; render(); schedule(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (ui.overlay === 'menu' || ui.overlay === 'rules')) { ui.overlay = null; render(); } });

  load();
  if (st && st.phase === 'peek') ui.peekDone = false;
  render();
  schedule();
})();
