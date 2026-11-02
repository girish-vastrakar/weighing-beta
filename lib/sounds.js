/* Alarm sounds, shared by the weighing app (bench.js) and the lab timer (timer.html).
   Made on the phone with Web Audio: no sound files to download, works offline.
   The supervisor picks one sound per test (data.json settings.sounds = { MC, VM, ASH }), so the bench can hear
   which load is ready without looking. Each sound is one short pattern (under 2.4 s); the apps repeat it. */
(function () {
  // one note: frequency f (sliding to f2 if given), from `at` seconds, d seconds long
  function tone(AC, at, f, d, o) {
    o = o || {};
    const os = AC.createOscillator(), g = AC.createGain(), vol = o.vol || 0.45;
    os.type = o.type || 'square';
    os.frequency.setValueAtTime(f, at);
    if (o.f2) os.frequency.linearRampToValueAtTime(o.f2, at + d);
    os.connect(g); g.connect(AC.destination);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + (o.attack || 0.01));
    if (o.hold) g.gain.setValueAtTime(vol, at + d - 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    os.start(at); os.stop(at + d + 0.03);
  }
  // a struck bell: a few sine partials dying away together
  const bell = (AC, at, f, d, vol) => [[1, 1], [2.01, 0.5], [3.02, 0.25]].forEach(([m, v]) =>
    tone(AC, at, f * m, d, { type: 'sine', vol: vol * v, attack: 0.005 }));

  const LIST = {
    // the weighing phone's sound until now
    beep:   { name: 'Beep beep', play: (AC, t) => [0, .3, .6, 1.2, 1.5, 1.8].forEach((o, i) => tone(AC, t + o, i % 2 ? 1318 : 988, .25, { vol: .5 })) },
    // the lab timer's sound until now
    kitchen:{ name: 'Kitchen timer', play: (AC, t) => { [0, .25, .5].forEach(o => tone(AC, t + o, 1046, .18, { vol: .4 })); tone(AC, t + .8, 1318, .35, { vol: .4 }); } },
    bell:   { name: 'Bell', play: (AC, t) => [0, .8, 1.6].forEach(o => bell(AC, t + o, 880, .75, .5)) },
    door:   { name: 'Door bell', play: (AC, t) => { bell(AC, t, 659, .7, .5); bell(AC, t + .6, 523, 1.2, .5); } },
    siren:  { name: 'Siren', play: (AC, t) => [0, 1].forEach(o => { tone(AC, t + o, 600, .5, { type: 'sawtooth', f2: 1400, vol: .4, hold: 1 }); tone(AC, t + o + .5, 1400, .5, { type: 'sawtooth', f2: 600, vol: .4, hold: 1 }); }) },
    tune:   { name: 'Tune', play: (AC, t) => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(AC, t + i * .22 + (i > 3 ? .3 : 0), f, i === 5 ? .5 : .2, { type: 'triangle', vol: .6, hold: 1 })) },
    buzzer: { name: 'Low buzzer', play: (AC, t) => [0, .5, 1].forEach(o => tone(AC, t + o, 220, .35, { type: 'sawtooth', vol: .45, hold: 1 })) },
    bird:   { name: 'Bird chirp', play: (AC, t) => [0, .15, .3, .9, 1.05, 1.2].forEach(o => tone(AC, t + o, 2200, .1, { type: 'sine', f2: 3600, vol: .5 })) },
    pulse:  { name: 'Fast pips', play: (AC, t) => { for (let i = 0; i < 12; i++) tone(AC, t + i * .16, 2000, .07, { vol: .4 }); } }
  };

  /* Girish's own sound files (music, recordings), kept in the app's sounds/ folder. Add a line per file:
     { key: 'f-short-name', name: 'Name in the list', file: 'file-name.mp3' }. A long clip is played to its end,
     then again while the alarm keeps ringing. Loaded once in the background; the phone keeps a copy for offline. */
  const FILES = [
  ];
  const BUF = {}, LOADING = {};
  let NOW = null;   // the file sound playing now: { src, end }
  function load(f) {
    if (BUF[f.key] || LOADING[f.key]) return;
    LOADING[f.key] = 1;
    const dec = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
    fetch('sounds/' + encodeURIComponent(f.file)).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(b => new Promise((ok, no) => dec.decodeAudioData(b, ok, no)))
      .then(buf => { BUF[f.key] = buf; }).catch(() => {}).then(() => { delete LOADING[f.key]; });
  }
  FILES.forEach(f => {
    LIST[f.key] = { name: '♪ ' + f.name, play: (AC, t) => {
      const buf = BUF[f.key];
      if (!buf) { load(f); LIST.beep.play(AC, t); return; }       // not loaded yet: beep this round
      if (NOW && NOW.ctx === AC && NOW.end > AC.currentTime) return;   // still playing: let it finish
      const src = AC.createBufferSource(), g = AC.createGain();
      src.buffer = buf; g.gain.value = 1; src.connect(g); g.connect(AC.destination); src.start(t);
      NOW = { src, ctx: AC, end: t + buf.duration };
    } };
  });
  setTimeout(() => { try { FILES.forEach(load); } catch (e) {} }, 1500);

  let AC = null;
  const ctx = shared => { AC = shared || AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; };
  window.LabSounds = {
    LIST,
    keys: Object.keys(LIST),
    has: k => !!LIST[k],
    // play one round of sound k (unknown key: the fallback) on the page's AudioContext; false if there is no sound
    play(k, fallback, shared) {
      try {
        const a = ctx(shared), s = LIST[k] || LIST[fallback] || LIST.beep;
        if (a.state !== 'running' && a.state !== 'suspended') return false;
        s.play(a, a.currentTime + 0.02); return true;
      } catch (e) { return false; }
    },
    // the alarm is off: cut a music file short
    stop() { try { if (NOW) NOW.src.stop(); } catch (e) {} NOW = null; },
    // <option>s for a picker; the empty one = each app's own sound as before (phone: Beep beep, timer: Kitchen timer)
    options: sel => `<option value=""${sel ? '' : ' selected'}>Standard</option>` +
      Object.keys(LIST).map(k => `<option value="${k}"${k === sel ? ' selected' : ''}>${LIST[k].name}</option>`).join('')
  };
})();
