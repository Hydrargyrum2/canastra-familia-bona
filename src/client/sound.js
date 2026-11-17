// Hudba v pozadí (skladby dokola) a krátké zvuky hry (WebAudio, bez souborů). Vibrace.
(function (root) {
  'use strict';
  const TRACKS = [
    { src: '/music/monume-house.mp3', name: 'monume – House' },
    { src: '/music/atlasaudio-house.mp3', name: 'AtlasAudio – House' },
    { src: '/music/aurec-house.mp3', name: 'Aurec – House' },
  ];
  const cfg = { music: true, musicVol: 35, sfx: true, sfxVol: 70, vibrate: true, track: 0 };
  let audio = null;
  let unlocked = false; // prohlížeč pustí zvuk až po prvním dotyku
  let ctx = null;
  let failed = false;

  function ensureAudio() {
    if (audio || failed) return audio;
    try {
      audio = new Audio();
      audio.preload = 'none';
      audio.addEventListener('ended', () => next(true));
      audio.addEventListener('error', () => { if (audio && audio.src) setTimeout(() => next(true), 1500); });
    } catch (e) { failed = true; audio = null; }
    return audio;
  }
  function load(i) {
    const a = ensureAudio();
    if (!a) return;
    cfg.track = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    a.src = TRACKS[cfg.track].src;
    a.volume = cfg.musicVol / 100;
  }
  function play() {
    if (!cfg.music || !unlocked || document.hidden) return;
    const a = ensureAudio();
    if (!a) return;
    if (!a.src) load(cfg.track);
    a.volume = cfg.musicVol / 100;
    const p = a.play();
    if (p && p.catch) p.catch(() => { /* zatím nepovoleno nebo soubor chybí */ });
  }
  function pause() { if (audio) audio.pause(); }
  function next(auto) {
    load(cfg.track + 1);
    if (cfg.music && unlocked) play();
    if (!auto && api.onChange) api.onChange();
  }
  function configure(p) {
    Object.assign(cfg, p || {});
    if (audio) audio.volume = cfg.musicVol / 100;
    if (cfg.music) play(); else pause();
  }
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    try {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (AC && !ctx) ctx = new AC();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
    play();
  }

  // ---------- krátké zvuky ----------
  function tone(freq, start, dur, type, gain) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const v = (gain || 0.2) * (cfg.sfxVol / 100);
    const t0 = ctx.currentTime + start;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  function click(start, gain) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const s = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.value = (gain || 0.5) * (cfg.sfxVol / 100);
    s.buffer = buf;
    s.connect(f).connect(g).connect(ctx.destination);
    s.start(ctx.currentTime + (start || 0));
  }
  const SFX = {
    card: () => click(0, 0.45),
    draw: () => { click(0, 0.3); click(0.05, 0.25); },
    turn: () => { tone(784, 0, 0.18, 'sine', 0.16); tone(1047, 0.12, 0.28, 'sine', 0.16); },
    meld: () => { tone(523, 0, 0.12, 'triangle', 0.14); tone(659, 0.07, 0.16, 'triangle', 0.14); },
    canasta: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.3, 'triangle', 0.15)); },
    round: () => { [392, 523, 659].forEach((f, i) => tone(f, i * 0.12, 0.35, 'sine', 0.15)); },
    win: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.1, 0.4, 'triangle', 0.16)); },
    lose: () => { [392, 349, 311].forEach((f, i) => tone(f, i * 0.16, 0.4, 'sine', 0.14)); },
    tick: () => tone(1200, 0, 0.05, 'square', 0.05),
    pop: () => tone(880, 0, 0.09, 'sine', 0.12),
  };
  function sfx(name) {
    if (!cfg.sfx || !unlocked || !ctx || !SFX[name]) return;
    try { if (ctx.state === 'suspended') ctx.resume(); SFX[name](); } catch (e) { /* bez zvuku */ }
  }
  function vibrate(pattern) {
    if (!cfg.vibrate) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* nepodporováno */ }
  }

  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => root.addEventListener && root.addEventListener(ev, unlock, { passive: true }));
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else play(); });
  }

  const api = {
    TRACKS, configure, next, sfx, vibrate, unlock,
    get track() { return cfg.track; },
    get playing() { return !!(audio && !audio.paused); },
    canVibrate: typeof navigator !== 'undefined' && !!navigator.vibrate,
    onChange: null,
  };
  root.Sound = api;
})(typeof window !== 'undefined' ? window : globalThis);
