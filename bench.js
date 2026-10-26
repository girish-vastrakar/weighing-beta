/* ====== Bench flow: icons, colours and big numbers first, almost nothing to read ======
   The workers on the bench cannot read, so every screen says what to do with a picture, a colour and a big number,
   and right / wrong is a sound, a vibration and a green or red screen. Words stay small, for the supervisor.

   Moisture: scan the sample bag → tap Moisture → scan any empty petri dish → W1, W2.
             Load: scan the oven → scan each dish (or "all") → DOOR CLOSED. W3: after DOOR OPEN, scan each dish.
   Ash / VM: scan the sample bag → tap Ash or VM → the app gives the next free spot on this balance's board → W1, W2.
             Load: scan the furnace → this balance's board, tap any spot that stayed out → DOOR CLOSED.
             W3: DOOR OPEN once the time is up → weigh spot 1, 2, 3 … in board order (the walk).
   Boards: two per balance per test, numbered spots, no QR (ids "ASH 2A-5" = balance 2, board A, spot 5).
   Old paper templates ("ASH A-5", no balance) still work for samples already on them.

   data.json: samples[code].h[test] = dish / spot, .ha[test] = when, .hb[test] = balance at pairing.
              samples[code].ev = the trail: every weight, fix, undo, reset, pairing and red-screen warning.
              runs[rid] = { rid, place, test, tray, items: [{ h, code, w2 }], start, mins, bal, by, outAt, outBy, early, cancelled }.
              settings = { mins: { MC, VM, ASH }, workers: [{ name, sym }] }   (set by the supervisor)
   Loaded before the main script: only declarations here, nothing that runs at load time. */

const CAP = { MC: 12, VM: 18, ASH: 10 };          // dishes per oven load, spots per board (= one furnace load)
const COLS = { VM: 3, ASH: 2 };                   // board layout, numbered down each column like the paper job card
const DEF_MINS = { MC: 60, VM: 7, ASH: 60 };      // heating time until the supervisor sets another one
// allowed sample weight (W2 − W1) in g until the supervisor sets another range; TM is not checked unless set
const DEF_RANGE = { MC: [0.990, 1.009], VM: [0.990, 1.009], ASH: [0.990, 1.009] };
const HELD = ['MC', 'VM', 'ASH'];                 // tests that sit on a dish / spot (Total Moisture does not)
const UNHEATED = { MC: 0.2, VM: 1, ASH: 1 };      // % of the sample lost below which W3 looks like it never went in
const BOARDS = ['A', 'B'];
const PLACES = {
  O1: { tests: ['MC'], kind: 'oven' }, O2: { tests: ['MC'], kind: 'oven' },
  F1: { tests: ['VM', 'ASH'], kind: 'furnace' }, F2: { tests: ['VM', 'ASH'], kind: 'furnace' }
};
const SYMS = ['🐘', '🦁', '🐯', '🐄', '🐓', '🐟', '🦜', '🐢', '🌻', '🌙', '⭐', '🍎', '🥭', '🚲', '🔔', '🏏'];

const BL = {
  en: {
    scan: 'Scan', bal: 'Balance', who: 'Who are you?', whoType: 'No list yet. Type your name.',
    pickBal: 'Which balance is this phone at?', free: 'Free', left: 'min',
    doorClosed: 'Door closed', doorOpen: 'Door open', warm: 'Heating up: scan the furnace when it shows',  startWalk: 'Weigh W3',
    allIn: 'All', w: n => 'W' + n, next: 'Next', undo: 'Undo', again: 'Weigh again',
    override: 'Supervisor: save anyway', ok: 'OK', close: 'Close',
    dish: 'Dish', spot: 'Spot', board: 'Board', oven: 'Oven', furnace: 'Furnace',
    boardName: (k, b, l) => `${k === 'ASH' ? 'Ash' : 'VM'} ${b || ''}${l}`,
    bad: {
      taken: 'This one already has another sample on it.', notEmpty: 'This dish is not empty.',
      wrongThing: 'Not this. Scan what the picture shows.', done: 'This test is already finished.',
      noBoard: 'No free board for this balance.', noBal: 'Choose the balance first.',
      notIn: 'It has not been in the oven / furnace yet.', heating: 'Still heating. Wait.',
      otherBal: 'Weigh it on the balance shown.', swap: 'Wrong crucible / dish? This weight does not fit.',
      unheated: 'It hardly lost weight. Did it go in?', w2le: 'W2 must be more than W1.', w1ge: 'W1 must be less than W2.',
      tooMuch: 'Too much sample. Take some out and weigh again.', tooLittle: 'Too little sample. Add some and weigh again.', inOven: 'Already in the oven. It cannot change now.',
      wrongPlace: 'This oven / furnace is not for this test.', full: 'Full.', notWaiting: 'Not waiting to go in.',
      nothing: 'Nothing is waiting to go in.', empty: 'Nothing is on this.', notSample: 'Not in the sample list.',
      locked: 'Only the supervisor can change this now.', otherLoad: 'This load belongs to another balance.', wrongPlace: 'Wrong oven / furnace. Scan this one:'
    },
    small: {
      scanSub: 'bag · dish · oven · furnace', scanDish: 'scan an empty dish', start: 'start',
      onIt: 'on', wait: 'waiting to go in', inHeat: 'in', w3: 'W3 now', result: 'result',
      loadDish: 'Scan each dish as it goes in', loadTap: 'Tap a spot that stayed out', boardsWaiting: 'Waiting to go in',
      changeDish: 'Change dish', supervisor: 'Supervisor', addCode: 'Add as new sample', done: 'Done'
    },
    labels: 'Print labels and boards'
  },
  gu: {
    scan: 'સ્કેન', bal: 'કાંટો', who: 'તમે કોણ છો?', whoType: 'હજી યાદી નથી. તમારું નામ લખો.',
    pickBal: 'આ ફોન કયા કાંટા પર છે?', free: 'ખાલી', left: 'મિનિટ',
    doorClosed: 'દરવાજો બંધ', doorOpen: 'દરવાજો ખોલો', warm: 'ગરમ થાય છે: આ તાપમાન દેખાય ત્યારે ફર્નેસ સ્કેન કરો',  startWalk: 'W3 વજન',
    allIn: 'બધી', w: n => 'W' + n, next: 'આગળ', undo: 'પાછું', again: 'ફરી વજન',
    override: 'સુપરવાઇઝર: તો પણ સેવ કરો', ok: 'બરાબર', close: 'બંધ',
    dish: 'ડિશ', spot: 'ખાનું', board: 'બોર્ડ', oven: 'ઓવન', furnace: 'ફર્નેસ',
    boardName: (k, b, l) => `${k === 'ASH' ? 'એશ' : 'VM'} ${b || ''}${l}`,
    bad: {
      taken: 'આના પર બીજું સેમ્પલ છે.', notEmpty: 'આ ડિશ ખાલી નથી.',
      wrongThing: 'આ નહીં. ચિત્રમાં દેખાય તે સ્કેન કરો.', done: 'આ ટેસ્ટ પૂરો થઈ ગયો છે.',
      noBoard: 'આ કાંટા માટે ખાલી બોર્ડ નથી.', noBal: 'પહેલા કાંટો પસંદ કરો.',
      notIn: 'હજી ઓવન / ફર્નેસમાં ગયું નથી.', heating: 'હજી ગરમ થાય છે. રાહ જુઓ.',
      otherBal: 'દેખાડેલા કાંટા પર વજન કરો.', swap: 'ખોટી ક્રુસિબલ / ડિશ? આ વજન બંધબેસતું નથી.',
      unheated: 'વજન લગભગ ઘટ્યું નથી. શું અંદર ગયું હતું?', w2le: 'W2 એ W1 કરતાં વધારે હોવું જોઈએ.', w1ge: 'W1 એ W2 કરતાં ઓછું હોવું જોઈએ.',
      tooMuch: 'સેમ્પલ વધારે છે. થોડું કાઢીને ફરી વજન કરો.', tooLittle: 'સેમ્પલ ઓછું છે. થોડું ઉમેરીને ફરી વજન કરો.', inOven: 'ઓવનમાં છે. હવે બદલાય નહીં.',
      wrongPlace: 'આ ઓવન / ફર્નેસ આ ટેસ્ટ માટે નથી.', full: 'ભરાઈ ગયું.', notWaiting: 'અંદર જવાની રાહમાં નથી.',
      nothing: 'અંદર જવા માટે કંઈ નથી.', empty: 'આના પર કંઈ નથી.', notSample: 'સેમ્પલ યાદીમાં નથી.',
      locked: 'હવે ફક્ત સુપરવાઇઝર બદલી શકે.', otherLoad: 'આ લોડ બીજા કાંટાનો છે.', wrongPlace: 'ખોટું ઓવન / ફર્નેસ. આ સ્કેન કરો:'
    },
    small: {
      scanSub: 'બેગ · ડિશ · ઓવન · ફર્નેસ', scanDish: 'ખાલી ડિશ સ્કેન કરો', start: 'શરૂ',
      onIt: 'પર', wait: 'અંદર જવાની રાહ', inHeat: 'માં', w3: 'હવે W3', result: 'પરિણામ',
      loadDish: 'દરેક ડિશ અંદર મૂકતી વખતે સ્કેન કરો', loadTap: 'બહાર રહેલું ખાનું ટેપ કરો', boardsWaiting: 'અંદર જવાની રાહ',
      changeDish: 'ડિશ બદલો', supervisor: 'સુપરવાઇઝર', addCode: 'નવા સેમ્પલ તરીકે ઉમેરો', done: 'પૂરું'
    },
    labels: 'લેબલ અને બોર્ડ છાપો'
  }
};
const B = () => BL[S.lang] || BL.en;
const PLACE_NAME = { en: { O1: 'Oven 1', O2: 'Oven 2', F1: 'Furnace 1', F2: 'Furnace 2' },
                     gu: { O1: 'ઓવન 1', O2: 'ઓવન 2', F1: 'ફર્નેસ 1', F2: 'ફર્નેસ 2' } };
const placeName = p => (PLACE_NAME[S.lang] || PLACE_NAME.en)[p] || p;
const placeNo = p => p.slice(1);
const settings = () => (S.data && S.data.settings) || {};
const rangeFor = k => { const set = settings().range || {}, r = k in set ? set[k] : DEF_RANGE[k]; return r && +r[1] > 0 ? [+r[0] || 0, +r[1]] : null; };
const minsFor = k => { const m = settings().mins; return (m && +m[k] > 0) ? +m[k] : DEF_MINS[k]; };
const balNo = () => { const m = /^W([1-4])$/.exec(S.machine || ''); return m ? +m[1] : 0; };
// Supervisor mode: needs the PIN (its hash is in data.json settings.pin) and switches itself off after 30 minutes
const SUPER_MS = 30 * 60000;
const superOn = () => store.get('super') === '1' && Date.now() - (+store.get('superAt') || 0) < SUPER_MS;
async function pinHash(pin) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('lab-pin:' + pin));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function newPin() {
  const p = (prompt('Choose a supervisor PIN (4 to 6 digits):') || '').trim();
  if (!/^\d{4,6}$/.test(p)) { if (p) toast('The PIN must be 4 to 6 digits.'); return false; }
  if ((prompt('Type the same PIN again:') || '').trim() !== p) { bad(); toast('The PINs were not the same.'); return false; }
  enqueue({ action: 'setPin', pin: await pinHash(p), worker: S.worker }); toast('PIN saved.', true);
  return true;
}
async function askPin() {
  const set = settings().pin;
  if (!set) return newPin();                         // first time: the supervisor chooses the PIN
  const p = prompt('Supervisor PIN'); if (p == null) return false;
  if (await pinHash(p.trim()) === set) return true;
  bad(); toast('Wrong PIN.'); return false;
}

/* ---------- pictures (inline SVG, drawn in the current colour) ---------- */
const svgI = (body, vb = '0 0 48 48') => `<svg viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
  scan: svgI('<path d="M6 16V8h8M34 8h8v8M42 32v8h-8M14 40H6v-8"/><path d="M16 16h6v6h-6zM26 26h6v6h-6zM26 16h6M16 32h6" stroke-width="3.5"/>'),
  bag: svgI('<path d="M14 14h20l4 28H10z"/><path d="M18 14c0-5 3-8 6-8s6 3 6 8"/>'),
  dish: svgI('<ellipse cx="24" cy="26" rx="18" ry="8"/><path d="M6 26v4c0 4 8 8 18 8s18-4 18-8v-4"/>'),
  crucible: svgI('<path d="M12 14h24l-4 24H16z"/><path d="M10 14h28"/>'),
  balance: svgI('<path d="M8 40h32M24 40V12M10 18h28"/><path d="M10 18l-5 10h10zM38 18l-5 10h10z"/>'),
  oven: svgI('<rect x="6" y="8" width="36" height="32" rx="3"/><rect x="12" y="16" width="24" height="16" rx="2"/><path d="M14 12h4M22 12h4"/>'),
  furnace: svgI('<rect x="6" y="8" width="36" height="32" rx="3"/><path d="M24 34c-5 0-7-4-5-8 1-2 3-3 3-7 4 2 8 6 7 10 0 3-2 5-5 5z"/>'),
  doorClosed: svgI('<rect x="10" y="6" width="28" height="36" rx="2"/><circle cx="32" cy="24" r="2" fill="currentColor"/>'),
  doorOpen: svgI('<rect x="10" y="6" width="28" height="36" rx="2" stroke-dasharray="4 4"/><path d="M10 6l14 4v36l-14-4z" fill="currentColor" fill-opacity=".25"/>'),
  lock: svgI('<rect x="10" y="22" width="28" height="20" rx="3"/><path d="M16 22v-6a8 8 0 0116 0v6"/>'),
  undo: svgI('<path d="M18 12L8 22l10 10"/><path d="M8 22h20a12 12 0 010 24h-6" transform="translate(0 -6)"/>'),
  check: svgI('<path d="M10 25l9 9 19-20" stroke-width="5"/>'),
  cross: svgI('<path d="M13 13l22 22M35 13L13 35" stroke-width="5"/>'),
  edit: svgI('<path d="M30 8l10 10-22 22H8V30z"/>'),
  swap: svgI('<path d="M8 16h30l-6-6M40 32H10l6 6"/>'),
  thermo: svgI('<path d="M20 30V9a4 4 0 0 1 8 0v21a8 8 0 1 1-8 0z"/><circle cx="24" cy="36" r="3" fill="currentColor"/><path d="M24 33V16"/>'),
  hour: svgI('<path d="M14 6h20M14 42h20M16 6c0 10 16 12 16 18S16 32 16 42M32 6c0 10-16 12-16 18s16 8 16 18"/>'),
  arrow: svgI('<path d="M8 24h30M28 14l10 10-10 10" stroke-width="4"/>'),
  MC: svgI('<path d="M24 6c8 10 12 16 12 22a12 12 0 01-24 0c0-6 4-12 12-22z"/>'),
  VM: svgI('<path d="M24 42c-8 0-12-6-9-13 2-4 6-6 5-13 7 3 13 10 12 17 0 5-3 9-8 9z"/>'),
  ASH: svgI('<path d="M12 18h24l-4 22H16z"/><circle cx="20" cy="30" r="1.5" fill="currentColor"/><circle cx="27" cy="27" r="1.5" fill="currentColor"/><circle cx="25" cy="34" r="1.5" fill="currentColor"/>'),
  TM: svgI('<path d="M16 8c5 7 8 11 8 15a8 8 0 01-16 0c0-4 3-8 8-15zM32 18c5 7 8 11 8 15a8 8 0 01-16 0c0-4 3-8 8-15z"/>')
};
const vesselIcon = k => k === 'MC' || k === 'TM' ? ICON.dish : ICON.crucible;
const placeIcon = p => PLACES[p].kind === 'oven' ? ICON.oven : ICON.furnace;

/* ---------- sounds: good = two high beeps, bad = a low buzz ---------- */
let AC = null;
function tone(f, ms, type = 'sine', vol = 0.2) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
    o.type = type; o.frequency.value = f; o.connect(g); g.connect(AC.destination);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    o.start(t); o.stop(t + ms / 1000);
  } catch (e) { /* no sound on this phone */ }
}
function good() { tone(880, 120); setTimeout(() => tone(1320, 180), 130); if (navigator.vibrate) navigator.vibrate(60); }
function bad() { tone(150, 500, 'square', 0.25); if (navigator.vibrate) navigator.vibrate([250, 120, 250]); }

/* ---------- dish / spot ids ----------
   "DISH 12" (Moisture), "ASH 2A-5" / "VM 3B-12" (balance, board, spot), board "ASH 2A".
   The paper templates before the boards had no balance: "ASH A-5", board "ASH A". */
function holderFromText(txt) {
  const up = String(txt).trim().toUpperCase();
  let m = up.match(/^DISH\s*[-_ ]?\s*0*(\d{1,4})$/);
  if (m) return { id: `DISH ${+m[1]}`, test: 'MC', n: +m[1] };
  m = up.match(/^(ASH|VM)\s*[-_ ]?\s*([1-4]?)\s*([A-Z])\s*[-_ ]?\s*0*(\d{1,2})$/);
  if (m && +m[4] >= 1 && +m[4] <= CAP[m[1]]) {
    const bal = m[2] ? +m[2] : 0, tray = `${m[1]} ${bal || ''}${m[3]}`;
    return { id: `${tray}-${+m[4]}`, test: m[1], bal, letter: m[3], pos: +m[4], tray };
  }
  m = up.match(/^(ASH|VM)\s*[-_ ]?\s*([1-4]?)\s*([A-Z])$/);
  if (m) { const bal = m[2] ? +m[2] : 0; return { id: null, test: m[1], bal, letter: m[3], tray: `${m[1]} ${bal || ''}${m[3]}` }; }
  return null;
}
const hInfo = id => holderFromText(id) || { id, test: 'MC', n: id };
const trayName = tr => { const i = hInfo(tr); return B().boardName(i.test, i.bal, i.letter); };
const hName = id => { const i = hInfo(id); return i.test === 'MC' ? `${B().dish} ${i.n}` : `${trayName(i.tray)} · ${i.pos}`; };
const hBig = id => { const i = hInfo(id); return String(i.test === 'MC' ? i.n : i.pos); };

/* ---------- the data file side (runs on the merged copy while syncing, so no S here) ---------- */
// One line of a sample's trail. Every job has its own id, so a job applied twice adds one line.
function trailAdd(f, code, j, e) {
  const s = fileSample(f, code); s.ev = s.ev || [];
  if (s.ev.some(x => x.id === j.id && x.a === e.a)) return;
  s.ev.push(Object.assign({ id: j.id, t: j.at, by: j.worker || '' }, e));
  if (s.ev.length > 120) s.ev.splice(0, s.ev.length - 120);
}
// Called by fileApply before a weight changes, so the old value is still there
function trailWeight(f, j) {
  if (j.action === 'saveWeight') {
    const s = fileSample(f, j.code), old = s.w[j.key][j.step - 1];
    const a = j.undo ? 'undo' : j.restoreOf ? 'restore' : j.override ? 'override' : old != null && old !== j.value ? 'fix' : 'w';
    trailAdd(f, j.code, j, { a, k: j.key, s: j.step, v: j.value, o: old, u: j.undoOf, h: (s.h || {})[j.key] || '', b: j.bal || 0, x: j.why || undefined });
  } else if (j.action === 'resetTest') {
    const s = f.samples[j.code];
    if (s && s.w[j.key] && s.w[j.key].some(v => v != null)) trailAdd(f, j.code, j, { a: 'reset', k: j.key, o: s.w[j.key].slice(), h: (s.h || {})[j.key] || '' });
  }
}
// Apply one job. Returns false for any other job.
function batchApply(f, j) {
  if (/^batch/.test(j.action)) return true;          // jobs of the first QR version: nothing to do any more
  if (j.action === 'hold') {
    const s = fileSample(f, j.code), old = (s.h || {})[j.key] || '';
    trailAdd(f, j.code, j, { a: j.change ? 'redish' : 'hold', k: j.key, h: j.holder, o: old || undefined, b: j.bal || 0 });
    s.h = s.h || {}; s.h[j.key] = j.holder;
    s.ha = s.ha || {}; s.ha[j.key] = j.at;            // when it was put on: only loads after this count for it
    s.hb = s.hb || {}; s.hb[j.key] = j.bal || 0;
    return true;
  }
  if (j.action === 'warn') { trailAdd(f, j.code, j, { a: 'warn', k: j.key, s: j.step, v: j.value, x: j.kind, b: j.bal || 0 }); return true; }
  if (j.action === 'setRange') { f.settings = f.settings || {}; f.settings.range = Object.assign({}, f.settings.range, j.range); return true; }
  if (j.action === 'setPin') { f.settings = f.settings || {}; f.settings.pin = j.pin; return true; }
  if (j.action === 'setTemp') { f.settings = f.settings || {}; f.settings.temp = Object.assign({}, f.settings.temp, j.temp); return true; }
  if (j.action === 'setMins') { f.settings = f.settings || {}; f.settings.mins = Object.assign({}, f.settings.mins, j.mins); return true; }
  if (j.action === 'setWorkers') { f.settings = f.settings || {}; f.settings.workers = j.workers; return true; }
  if (!/^run/.test(j.action)) return false;
  const all = f.runs = f.runs || {};
  if (j.action === 'runStart') {
    // keep data.json small: loads older than 3 days are dropped
    Object.keys(all).forEach(r => { if (j.at - all[r].start > 3 * 86400000) delete all[r]; });
    if (!all[j.rid]) all[j.rid] = { rid: j.rid, place: j.place, test: j.test, tray: j.tray || null, items: j.items, bal: j.bal || 0,
                                    start: j.at, mins: j.mins, by: j.worker || '', outAt: null,
                                    ...(j.reheat ? { reheat: true, go: null } : {}) };   // furnace: the timer waits until it is hot again
  } else if (j.action === 'runGo') {
    const r = all[j.rid];
    if (r && r.reheat && !r.go) { r.go = j.at; r.goBy = j.worker || ''; }
  } else if (j.action === 'runOut') {
    const r = all[j.rid];
    if (r && !r.outAt) { r.outAt = j.at; r.outBy = j.worker || ''; if (j.at < runEnd(r)) r.early = true; }
  } else if (j.action === 'runCancel') {
    if (all[j.rid]) all[j.rid].cancelled = { at: j.at, by: j.worker || '' };   // kept for the trail, ignored everywhere else
  }
  return true;
}

/* ---------- what the app works out from the data ---------- */
const runs = () => ((S.data && S.data.runs) || []).filter(r => !r.cancelled);
const runBy = rid => runs().find(r => r.rid === rid);
// a furnace load counts its minutes from when it was hot again (go), an oven load from door closed
const runEnd = r => r.reheat ? (r.go ? r.go + r.mins * 60000 : Infinity) : r.start + r.mins * 60000;
const tempFor = k => { const t = (settings().temp || {})[k]; return +t > 0 ? +t : 0; };
const minsLeft = r => isFinite(runEnd(r)) ? Math.max(0, Math.ceil((runEnd(r) - Date.now()) / 60000)) : r.mins;
const holdOf = (s, k) => (s && s.hold && s.hold[k]) || null;
// 'wait' (W3 to do), 'w3' (W3 saved) or 'gone' (reset, or put on another dish / spot since it went in)
function itemState(r, it) {
  const s = sample(it.code), st = s && s.tests[r.test];
  if (!st || holdOf(s, r.test) !== it.h || (s.holdAt[r.test] || 0) > r.start) return 'gone';
  return st.done === 3 ? 'w3' : st.done === 2 ? 'wait' : 'gone';
}
// 'heat' (timer running), 'up' (time is up, door not opened yet), 'out' (door opened: W3 now), 'done'
function runPhase(r) {
  if (!r.items.some(it => itemState(r, it) === 'wait')) return 'done';
  if (r.outAt) return 'out';
  if (r.reheat && !r.go) return 'warm';
  return Date.now() < runEnd(r) ? 'heat' : 'up';
}
const waitCount = r => r.items.filter(it => itemState(r, it) === 'wait').length;
// The newest load this sample's test went into
function runOf(code, k) {
  return runs().filter(r => r.test === k && r.items.some(it => it.code === code && itemState(r, it) !== 'gone'))
    .sort((a, b) => b.start - a.start)[0] || null;
}
// The oven / furnace still holding a load (door not opened, W3 not finished)
const placeRun = p => runs().filter(r => r.place === p && !r.outAt && runPhase(r) !== 'done').sort((a, b) => b.start - a.start)[0] || null;
// The newest load of a place that still has W3 to do (door already opened)
const placeOut = p => runs().filter(r => r.place === p && r.outAt && runPhase(r) === 'out').sort((a, b) => b.start - a.start)[0] || null;
// The sample test now on a dish / spot: W1 saved, W3 not yet
function occupants(id) {
  const out = [];
  S.data.samples.forEach(s => HELD.forEach(k => { if (holdOf(s, k) === id && [1, 2].includes(s.tests[k].done)) out.push({ s, k }); }));
  return out;
}
// On a dish / spot with W2 saved, not in an oven / furnace yet
function waitingFor(k, tray) {
  return S.data.samples.filter(s => holdOf(s, k) && s.tests[k].done === 2 && !runOf(s.code, k) && (!tray || hInfo(holdOf(s, k)).tray === tray))
    .map(s => ({ h: holdOf(s, k), code: s.code, w2: s.tests[k].w[1] }))
    .sort((a, b) => (hInfo(a.h).pos || hInfo(a.h).n) - (hInfo(b.h).pos || hInfo(b.h).n));
}
// Boards with crucibles waiting to go in: this balance's, plus the old paper templates (no balance)
function boardsWaiting(tests) {
  const m = {}, b = balNo();
  tests.filter(k => k !== 'MC').forEach(k => waitingFor(k).forEach(x => {
    const i = hInfo(x.h); if (i.bal && i.bal !== b) return;
    (m[i.tray] = m[i.tray] || { tray: i.tray, test: k, n: 0 }).n++;
  }));
  return Object.values(m).sort((a, b2) => a.tray.localeCompare(b2.tray));
}
// Ash / VM: the next free spot on this balance's boards. Keep filling the board that is being filled
// (none of its crucibles in a furnace), else take an empty board. Spots go down each column like the job card.
function pickSpot(k) {
  const b = balNo(); if (!b) return null;
  const use = {};
  S.data.samples.forEach(s => {
    const i = holdOf(s, k) && hInfo(holdOf(s, k));
    if (!i || !i.tray || i.bal !== b || ![1, 2].includes(s.tests[k].done)) return;
    const o = use[i.tray] = use[i.tray] || { used: {}, busy: false };
    o.used[i.pos] = true;
    if (s.tests[k].done === 2 && runOf(s.code, k)) o.busy = true;
  });
  const freePos = t => { for (let p = 1; p <= CAP[k]; p++) if (!use[t] || !use[t].used[p]) return p; return 0; };
  const boards = BOARDS.map(L => `${k} ${b}${L}`);
  const t = boards.find(x => use[x] && !use[x].busy && freePos(x)) || boards.find(x => !use[x]);
  return t ? `${t}-${freePos(t)}` : null;
}

/* ---------- red and green screens ---------- */
// A red screen: buzz, a big picture or number, a small line. opts: { big, icon, test, again, override }
function redScreen(msg, opts = {}) {
  bad();
  S.modal = Object.assign({ type: 'red', msg }, opts);
  render();
}
function logWarn(kind, extra) {
  enqueue(Object.assign({ action: 'warn', code: S.code, key: S.test, step: S.step, kind, worker: S.worker, bal: balNo() }, extra));
}

/* ---------- the sample screen ---------- */
function testTile(s, k) {
  const st = s.tests[k], t = B(), h = holdOf(s, k), sm = t.small;
  let big = '', note = '', icon = '';
  if (HELD.includes(k) && st.done === 0) {
    icon = k === 'MC' ? ICON.scan : ICON.arrow;
    note = k === 'MC' ? sm.scanDish : sm.start;
  } else if (st.done === 1) { big = h ? hBig(h) : ''; icon = ICON.balance; note = 'W2'; }
  else if (st.done === 2) {
    big = h ? hBig(h) : '';
    const r = HELD.includes(k) ? runOf(s.code, k) : null, ph = r && runPhase(r);
    if (!r) { icon = k === 'MC' ? ICON.oven : ICON.furnace; note = sm.wait; }
    else if (ph === 'warm') { icon = ICON.thermo; note = tempFor(k) ? tempFor(k) + ' °C' : '🌡'; }
    else if (ph === 'heat') { icon = ICON.hour; note = `${minsLeft(r)} ${t.left}`; }
    else { icon = ICON.balance; note = sm.w3; }
    if (!HELD.includes(k)) { icon = ICON.balance; note = 'W3'; }
  } else if (st.done === 3) { icon = ICON.check; note = isNum(st.pct) ? st.pct.toFixed(2) + ' %' : sm.done; }
  else { icon = ICON.arrow; note = sm.start; }
  const fix = st.done > 0 && (st.done < 3 || superOn());
  return `<div class="ttile-row"><button class="ttile ${st.done === 3 ? 'done' : ''} ${isFlag(k, st) ? 'flag' : ''}" style="${cvar(k)}" data-act="open-test" data-test="${k}">
      <span class="ti">${ICON[k]}</span><span class="tn">${esc(lbl(k))}</span>
      ${big ? `<span class="tb">${esc(big)}</span>` : ''}<span class="ts"><span class="tsi">${icon}</span><small>${esc(note)}</small></span></button>
    ${fix ? `<button class="tfix" style="${cvar(k)}" data-act="fix" data-test="${k}" aria-label="✎">${ICON.edit}</button>` : ''}</div>`;
}
function renderSampleB() {
  const s = sample(S.code), t = T();
  const main = S.order.filter(k => !S.tests[k].optional).map(k => testTile(s, k)).join('');
  const tmK = S.order.find(k => S.tests[k].optional);
  const tm = tmK ? `<div class="tmbox"><p class="q">${esc(t.tmQ)}</p>
      <div class="toggle"><button aria-pressed="${!s.tmRequired}" data-act="tm" data-val="0">${esc(t.no)}</button>
        <button aria-pressed="${s.tmRequired}" data-act="tm" data-val="1">${esc(t.yes)}</button></div>
      ${s.tmRequired ? testTile(s, tmK) : ''}</div>` : '';
  return `${topBar(true)}
    <div class="bagline"><span class="bi">${ICON.bag}</span><h2 class="title">${esc(s.code)}</h2></div>${infoHTML(s.code)}
    ${flagsOf(s).length ? `<div class="flagnote">⚠ ${esc(flagsOf(s).map(lbl).join(', '))}</div>` : ''}${superOn() ? approvalHTML(s) + photoBoxHTML(s) : ''}
    <div class="tiles">${main}</div>${tm}`;
}

/* ---------- the weight screen: what goes on the balance ---------- */
function boardMap(tray, lit, cell) {
  const k = hInfo(tray).test, cols = COLS[k], rows = Math.ceil(CAP[k] / cols);
  return `<div class="board" style="${cvar(k)};grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},auto)">
    ${Array.from({ length: CAP[k] }, (x, i) => cell ? cell(i + 1) : `<span class="bs${i + 1 === lit ? ' lit' : ''}">${i + 1}</span>`).join('')}</div>`;
}
function holderBanner() {
  if (!HELD.includes(S.test)) return '';
  const h = holdOf(sample(S.code), S.test); if (!h) return '';
  const i = hInfo(h), t = B();
  if (i.test === 'MC') return `<div class="hold mc"><span class="hi">${ICON.dish}</span><b>${esc(String(i.n))}</b><small>${esc(t.dish)}</small>
      ${S.step <= 2 && !S.editing ? `<button class="chg" data-act="redish">${ICON.swap}<small>${esc(t.small.changeDish)}</small></button>` : ''}</div>`;
  return `<div class="hold"><div class="hb"><span class="bnum">${esc(String(i.bal || ''))}<i>${esc(i.letter)}</i></span><b>${esc(String(i.pos))}</b></div>
    ${boardMap(i.tray, i.pos)}</div>`;
}
function renderStepB() {
  const t = T(), s = sample(S.code), k = S.test, st = s.tests[k], step = S.step;
  const prev = st.w.map((w, i) => isNum(w) && i !== step - 1 ? `<span class="pw"><small>W${i + 1}</small>${fmt(w)}</span>` : '').join('');
  const pic = step === 1 ? `<span class="v">${vesselIcon(k)}</span>`
    : step === 2 ? `<span class="v">${vesselIcon(k)}</span><span class="plus">+</span><span class="v">${ICON.bag}</span>`
    : `<span class="v">${HELD.includes(k) || k === 'TM' ? (S.tests[k].heat === 'oven' ? ICON.oven : ICON.furnace) : ICON.oven}</span><span class="plus">→</span><span class="v">${vesselIcon(k)}</span>`;
  return `<div style="${cvar(k)}">
    ${topBar(false)}
    <div class="stephead"><span class="ti">${ICON[k]}</span><b>${esc(s.code)}</b><span class="wn">W${step}</span></div>
    ${holderBanner()}
    <div class="onbal">${pic}<span class="plus">→</span><span class="v">${ICON.balance}</span></div>
    <label class="readout"><input id="w" type="text" inputmode="decimal" autocomplete="off"
        placeholder="0.0000" value="${esc(S.draft)}" aria-label="W${step}"><span class="unit">g</span></label>
    <div class="live" id="live" aria-live="polite">${liveText()}</div>
    ${prev ? `<div class="pws">${prev}</div>` : ''}
    <div class="bar"><div class="inner"><button class="primary bigok" data-act="save">${ICON.check}</button></div></div>
  </div>`;
}

/* ---------- home ---------- */
function topBar(withBack) {
  const t = B(), ws = (settings().workers || []).find(w => w.name === S.worker);
  return `<header class="tbar">
    ${withBack ? `<button class="iconbtn" data-act="home" aria-label="Home">⌂</button>` : `<button class="iconbtn" data-act="back-sample" aria-label="Back">←</button>`}
    <button class="balbadge" data-act="pick-bal"><span>${ICON.balance}</span><b>${balNo() || '?'}</b></button>
    <button class="whobadge" data-act="name"><span>${ws ? ws.sym : '👤'}</span><small>${esc(S.worker || '')}</small></button>
    ${langBtn()}<button class="iconbtn" data-act="setup" aria-label="Settings">⚙</button></header>`;
}
function placeTile(p) {
  const t = B(), r = placeRun(p), out = !r && placeOut(p);
  let cls = 'free', big = '', small = t.free, ic = '';
  if (r) {
    const ph = runPhase(r);
    if (ph === 'warm') { cls = 'heat'; big = tempFor(r.test) ? tempFor(r.test) + '°' : ''; small = '🌡'; ic = ICON.thermo; }
    else if (ph === 'heat') { cls = 'heat'; big = String(minsLeft(r)); small = t.left; ic = ICON.hour; }
    else { cls = 'up'; ic = ICON.doorOpen; small = t.doorOpen; }
  } else if (out) { cls = 'out'; big = String(waitCount(out)); ic = ICON.balance; small = 'W3'; }
  const k = (r || out) ? (r || out).test : null;
  // status only: the worker opens an oven / furnace by scanning its QR there, not by tapping here
  return `<div class="ptile ${cls}" ${k ? `style="${cvar(k)}"` : ''}>
    <span class="pi">${placeIcon(p)}<em>${placeNo(p)}</em></span>
    ${k ? `<span class="pk">${ICON[k]}</span>` : ''}
    <span class="pb">${ic ? `<span class="pic">${ic}</span>` : ''}${big ? `<b>${esc(big)}</b>` : ''}<small>${esc(small)}</small></span></div>`;
}
function renderHomeB() {
  const t = B(), mc = waitingFor('MC'), boards = boardsWaiting(['VM', 'ASH']);
  return `${topBar(true)}
    <button class="primary scanbig" data-act="scan"><span class="qr">${ICON.scan}</span><span class="sbags">${ICON.bag}${ICON.dish}${ICON.oven}${ICON.furnace}</span><small>${esc(t.small.scanSub)}</small></button>
    <div class="typerow"><input class="field" id="typecode" type="text" autocomplete="off" autocapitalize="characters" placeholder="${esc(T().find)}">
      <button class="secondary" data-act="type-open">→</button></div>
    <div class="ptiles">${Object.keys(PLACES).map(placeTile).join('')}</div>
    ${mc.length || boards.length ? `<h3 class="bhead">${esc(t.small.boardsWaiting)}</h3><div class="waits">
      ${mc.length ? `<div class="wtile" style="${cvar('MC')}"><span class="wi">${ICON.dish}</span><b>${mc.length}</b></div>` : ''}
      ${boards.map(x => `<div class="wtile" style="${cvar(x.test)}"><span class="wi">${ICON[x.test]}</span><span class="bnum">${esc(String(hInfo(x.tray).bal || ''))}<i>${esc(hInfo(x.tray).letter)}</i></span><b>${x.n}</b></div>`).join('')}
    </div>` : ''}`;
}

/* ---------- who / balance ---------- */
function renderWho() {
  const t = B(), ws = settings().workers || [];
  if (!ws.length) return renderName();
  return `<div style="display:flex;justify-content:flex-end;gap:8px">${langBtn()}<button class="iconbtn" data-act="setup" aria-label="Settings">⚙</button></div>
    <p class="instr center-t">👤 ?</p><p class="sub center-t">${esc(t.who)}</p>
    <div class="whogrid">${ws.map(w => `<button class="whobtn${w.name === S.worker ? ' on' : ''}" data-act="who" data-name="${esc(w.name)}"><span>${w.sym}</span><small>${esc(w.name)}</small></button>`).join('')}</div>`;
}
function renderBal() {
  const t = B();
  return `<div style="display:flex;justify-content:flex-end;gap:8px">${langBtn()}</div>
    <p class="instr center-t"><span class="bigicon">${ICON.balance}</span></p><p class="sub center-t">${esc(t.pickBal)}</p>
    <div class="balgrid">${[1, 2, 3, 4].map(n => `<button class="balbtn${balNo() === n ? ' on' : ''}" data-act="set-bal" data-bal="${n}">${n}</button>`).join('')}</div>`;
}

/* ---------- loading an oven / furnace ---------- */
// S.load = { place, tray, items: [dish ids] (oven), out: { pos: true } (furnace) }
function loadItems() {
  const L = S.load;
  if (PLACES[L.place].kind === 'oven') { const w = waitingFor('MC'); return L.items.map(id => w.find(x => x.h === id)).filter(Boolean); }
  if (!L.tray) return [];
  return waitingFor(hInfo(L.tray).test, L.tray).filter(x => !L.out[hInfo(x.h).pos]);
}
function openLoad(p) {
  S.load = { place: p, tray: null, items: [], out: {} };
  if (PLACES[p].kind === 'furnace') {
    if (!balNo()) { redScreen(B().bad.noBal, { icon: ICON.balance, toBal: true }); return; }
    const bw = boardsWaiting(PLACES[p].tests);
    if (!bw.length) { redScreen(B().bad.nothing, { icon: placeIcon(p), num: placeNo(p) }); return; }
    if (bw.length === 1) S.load.tray = bw[0].tray;
  } else if (!waitingFor('MC').length) { redScreen(B().bad.nothing, { icon: placeIcon(p), num: placeNo(p) }); return; }
  S.view = 'load'; render();
}
function doorClosedBtn(ready) {
  return `<button class="primary doorbtn" data-act="r-start" ${ready ? '' : 'disabled'}>${ICON.doorClosed}<small>${esc(B().doorClosed)}</small></button>`;
}
function renderLoad() {
  const t = B(), L = S.load, p = L.place, oven = PLACES[p].kind === 'oven';
  const head = `${topBar(true)}<div class="placehead">${placeIcon(p)}<b>${placeNo(p)}</b><small>${esc(placeName(p))}</small></div>`;
  if (oven) {
    const w = waitingFor('MC'), its = loadItems();
    return `<div style="${cvar('MC')}">${head}
      <div class="btnrow"><button class="primary" data-act="l-scan">${ICON.scan}<small>${esc(t.small.loadDish)}</small></button>
        ${w.length && its.length < Math.min(w.length, CAP.MC) ? `<button class="secondary" data-act="l-all">${ICON.dish}<b>${Math.min(w.length, CAP.MC)}</b><small>${esc(t.allIn)}</small></button>` : ''}</div>
      <p class="countbig"><b>${its.length}</b> / ${CAP.MC}</p>
      <div class="dishes">${its.map(x => `<button class="dslot" data-act="l-drop" data-h="${esc(x.h)}"><span>${ICON.dish}</span><b>${esc(String(hInfo(x.h).n))}</b><em>✕</em></button>`).join('')}</div>
      <div class="bact">${doorClosedBtn(its.length > 0)}</div></div>`;
  }
  if (!L.tray) {
    const bw = boardsWaiting(PLACES[p].tests);
    return `${head}<div class="waits">${bw.map(x => `<button class="wtile" style="${cvar(x.test)}" data-act="l-tray" data-tray="${esc(x.tray)}">
        <span class="wi">${ICON[x.test]}</span><span class="bnum">${esc(String(hInfo(x.tray).bal || ''))}<i>${esc(hInfo(x.tray).letter)}</i></span><b>${x.n}</b></button>`).join('')}</div>`;
  }
  const k = hInfo(L.tray).test, all = waitingFor(k, L.tray), n = loadItems().length;
  return `<div style="${cvar(k)}">${head}
    <div class="loadhead"><span class="ti">${ICON[k]}</span><span class="bnum">${esc(String(hInfo(L.tray).bal || ''))}<i>${esc(hInfo(L.tray).letter)}</i></span><b>${n}</b><span class="ti">${ICON.crucible}</span></div>
    <p class="sub center-t">${esc(t.small.loadTap)}</p>
    <div class="loadboard">${boardMap(L.tray, 0, pos => {
      const x = all.find(y => hInfo(y.h).pos === pos);
      if (!x) return `<span class="bs off">${pos}</span>`;
      return `<button class="bs ${L.out[pos] ? 'out' : 'lit'}" data-act="l-out" data-pos="${pos}">${pos}</button>`;
    })}</div>
    <div class="bact">${doorClosedBtn(n > 0)}</div></div>`;
}
function loadScan(h) {
  const t = B(), L = S.load;
  if (!h || !h.id || h.test !== 'MC') { redScreen(t.bad.wrongThing, { icon: ICON.dish }); return; }
  if (!waitingFor('MC').some(x => x.h === h.id)) { redScreen(t.bad.notWaiting, { icon: ICON.dish, num: String(h.n) }); return; }
  if (L.items.includes(h.id)) { good(); return; }
  if (L.items.length >= CAP.MC) { redScreen(t.bad.full, { icon: ICON.oven, num: String(CAP.MC) }); return; }
  L.items.push(h.id); good(); render();
  setTimeout(() => { if (S.view === 'load' && !S.modal) openScanner('load'); }, 500);    // next dish straight away
}
function startRun() {
  const L = S.load, its = loadItems(); if (!its.length) return;
  const k = PLACES[L.place].kind === 'oven' ? 'MC' : hInfo(L.tray).test;
  if (its.length > CAP[k]) { redScreen(B().bad.full, { icon: placeIcon(L.place), num: String(CAP[k]) }); return; }
  const rid = `${new Date().toISOString().slice(0, 10)}-${L.place}-${Date.now().toString(36)}`;
  enqueue({ action: 'runStart', rid, place: L.place, test: k, tray: L.tray, items: its, mins: minsFor(k), bal: balNo(), worker: S.worker,
            reheat: PLACES[L.place].kind === 'furnace' || undefined });
  good();
  S.load = null; S.rid = rid; S.view = 'run'; render();
}

/* ---------- a load in an oven / furnace ---------- */
function renderRun() {
  const t = B(), r = runBy(S.rid);
  if (!r) { S.view = 'home'; return renderHomeB(); }
  const ph = runPhase(r), p = r.place, k = r.test;
  const items = r.tray
    ? '<div class="runboard">' + boardMap(r.tray, 0, pos => { const it = r.items.find(x => hInfo(x.h).pos === pos); if (!it) return `<span class="bs off">${pos}</span>`;
        const st = itemState(r, it); return `<span class="bs ${st === 'w3' ? 'w3' : st === 'gone' ? 'out' : 'lit'}">${pos}${st === 'w3' ? '<em>✓</em>' : ''}</span>`; }) + '</div>'
    : `<div class="dishes">${r.items.map(it => { const st = itemState(r, it);
        return `<span class="dslot ${st}"><span>${ICON.dish}</span><b>${esc(String(hInfo(it.h).n))}</b>${st === 'w3' ? '<em>✓</em>' : ''}</span>`; }).join('')}</div>`;
  let act = '';
  if (ph === 'warm') act = `<div class="bigtime">${ICON.thermo}<b>${tempFor(k) ? tempFor(k) + '°' : '…'}</b><small>°C</small></div>
      <button class="primary doorbtn" data-act="r-go">${ICON.scan}<small>${esc(t.warm)} ${tempFor(k) ? tempFor(k) + ' °C' : ''}</small></button>`;
  else if (ph === 'heat') act = `<div class="bigtime">${ICON.hour}<b>${minsLeft(r)}</b><small>${esc(t.left)}</small></div>
      <button class="primary doorbtn" disabled>${ICON.lock}<small>${esc(t.doorOpen)}</small></button>`;
  else if (ph === 'up') act = `<button class="primary doorbtn blink" data-act="r-out">${ICON.doorOpen}<small>${esc(t.doorOpen)}</small></button>`;
  else if (ph === 'out') act = r.tray
    ? `<button class="primary doorbtn" data-act="walk">${ICON.balance}<small>${esc(t.startWalk)}</small></button>`
    : `<button class="primary doorbtn" data-act="scan">${ICON.scan}<small>W3 · ${esc(t.dish)}</small></button>`;
  else {
    act = `<button class="primary doorbtn okbtn" data-act="home">${ICON.check}</button>`;
    clearTimeout(S.doneTimer);
    S.doneTimer = setTimeout(() => { if (S.view === 'run' && S.rid === r.rid && !S.modal && !SCAN) { S.view = 'home'; render(); } }, 5000);
  }
  return `<div style="${cvar(k)}">${topBar(true)}
    <div class="placehead">${placeIcon(p)}<b>${placeNo(p)}</b><span class="ti">${ICON[k]}</span>
      ${r.tray ? `<span class="bnum">${esc(String(hInfo(r.tray).bal || ''))}<i>${esc(hInfo(r.tray).letter)}</i></span>` : ''}</div>
    ${items}
    <div class="bact">${act}</div></div>`;
}
const fmtTime = ms => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/* ---------- W3 walk: spot 1, 2, 3 … of a furnace load ---------- */
function walkNext() {
  const r = runBy(S.walk && S.walk.rid);
  if (!r) { S.walk = null; S.view = 'home'; render(); return; }
  const it = r.items.filter(x => itemState(r, x) === 'wait').sort((a, b) => hInfo(a.h).pos - hInfo(b.h).pos)[0];
  if (!it) { S.walk = null; S.rid = r.rid; S.view = 'run'; good(); render(); return; }
  S.rid = r.rid; goTest(it.code, r.test);
}
function startWalk(r) {
  if (r.bal && balNo() !== r.bal) { redScreen(B().bad.otherLoad, { icon: ICON.balance, num: String(r.bal) }); return; }
  S.walk = { rid: r.rid }; walkNext();
}

/* ---------- reading QR codes ---------- */
function placeFromText(txt) {
  const m = String(txt).trim().toUpperCase().match(/^(?:PLACE:)?\s*(OVEN|FURNACE|O|F)\s*[-_ ]?\s*([12])$/);
  return m ? (m[1][0] + m[2]) : null;
}
function codeFromText(txt) {
  const raw = String(txt).trim(), up = raw.toUpperCase();
  const codes = S.data ? S.data.samples.map(s => s.code) : [];
  const hit = codes.find(c => c.toUpperCase() === up) || Object.keys(NAMES).find(c => c.toUpperCase() === up);
  if (hit) return hit;
  const byName = Object.keys(NAMES).find(c => String(NAMES[c].name || '').toUpperCase() === up);
  if (byName) return byName;
  const tok = up.split(/[\s|,;:/]+/).map(x => codes.find(c => c.toUpperCase() === x)).find(Boolean);
  return tok || null;
}
let SCAN = null;
function scanEl() {
  let el = document.getElementById('scanner');
  if (!el) { el = document.createElement('div'); el.id = 'scanner'; document.body.appendChild(el); }
  return el;
}
const SCAN_PIC = { dish: () => ICON.dish, redish: () => ICON.dish, load: () => ICON.dish, any: () => ICON.bag,
  door: () => S.door ? `${placeIcon(S.door.place)}<b class="scannum">${placeNo(S.door.place)}</b>` : ICON.furnace };
async function openScanner(purpose) {
  closeScanner();
  const t = B(), el = scanEl();
  SCAN = { purpose, stream: null, timer: null, det: null };
  el.innerHTML = `<div class="scanbox"><div class="scanwhat">${ICON.scan}<span>${(SCAN_PIC[purpose] || SCAN_PIC.any)()}</span></div>
    <div class="vid"><video playsinline muted></video><div class="aim"></div></div>
    <p class="sub" id="scanmsg">…</p>
    <div class="typerow"><input class="field" id="scantype" type="text" autocomplete="off" autocapitalize="characters" placeholder="${esc(T().find)}">
      <button class="secondary" data-act="scan-typed">→</button></div>
    <button class="secondary wide" data-act="scan-close">${ICON.cross}</button></div>`;
  el.hidden = false;
  const run = SCAN, video = el.querySelector('video');
  try {
    run.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (SCAN !== run) { run.stream.getTracks().forEach(x => x.stop()); return; }
    video.srcObject = run.stream; await video.play();
    if ('BarcodeDetector' in window) { try { run.det = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { run.det = null; } }
    if (!run.det && !window.jsQR) await new Promise((ok, bad2) => { const s = document.createElement('script'); s.src = 'lib/jsQR.js'; s.onload = ok; s.onerror = bad2; document.head.appendChild(s); });
    const msg = document.getElementById('scanmsg'); if (msg) msg.textContent = '';
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    const tick = async () => {
      if (SCAN !== run) return;
      let txt = null;
      try {
        if (run.det) { const r = await run.det.detect(video); txt = r[0] && r[0].rawValue; }
        else if (video.videoWidth) {
          const w = cv.width = Math.min(640, video.videoWidth), h = cv.height = Math.round(video.videoHeight * w / video.videoWidth);
          cx.drawImage(video, 0, 0, w, h);
          const r = window.jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
          txt = r && r.data;
        }
      } catch (e) { txt = null; }
      if (SCAN !== run) return;
      if (txt) { closeScanner(); onScan(txt, run.purpose); return; }
      run.timer = setTimeout(tick, 180);
    };
    tick();
  } catch (e) {
    const msg = document.getElementById('scanmsg'); if (msg) { msg.innerHTML = ICON.cross; msg.className = 'flagnote'; }
    const inp = document.getElementById('scantype'); if (inp) inp.focus();
  }
}
function closeScanner() {
  if (SCAN) { clearTimeout(SCAN.timer); if (SCAN.stream) SCAN.stream.getTracks().forEach(x => x.stop()); }
  SCAN = null;
  const el = document.getElementById('scanner'); if (el) { el.hidden = true; el.innerHTML = ''; }
}
function scanTyped() {
  const inp = document.getElementById('scantype'), v = inp && inp.value.trim();
  if (!v || !SCAN) return;
  const { purpose } = SCAN; closeScanner(); onScan(v, purpose);
}

// What a scan (or a typed code) does, depending on what it was started for
function onScan(txt, purpose) {
  const t = B(), p = placeFromText(txt), h = holderFromText(txt);
  if (purpose === 'load' && S.view === 'load') return loadScan(h);
  if (purpose === 'door') return doorScan(p);
  if (purpose === 'dish' || purpose === 'redish') {
    if (!h || !h.id || h.test !== 'MC') { redScreen(t.bad.wrongThing, { icon: ICON.dish }); return; }
    return purpose === 'dish' ? pairDish(h) : changeDish(h);
  }
  if (p) return onPlace(p);
  if (h && h.id) return onHolder(h);
  if (h && h.tray) { redScreen(t.bad.wrongThing, { icon: ICON.bag }); return; }
  const code = codeFromText(txt);
  if (!code) { bad(); S.modal = { type: 'addcode', code: String(txt).trim().toUpperCase().slice(0, 20) }; render(); return; }
  // a code from the Name Tags sheet that has no weights yet joins the list by itself
  if (!sample(code)) enqueue({ action: 'addCodes', codes: [code], worker: S.worker });
  good(); S.code = code; S.view = 'sample'; S.via = null; S.walk = null; render();
}
function onPlace(p) {
  good(); S.placeScan = { place: p, at: Date.now() };
  const r = placeRun(p);
  if (r) { S.rid = r.rid; S.view = 'run'; render(); return; }
  const o = placeOut(p);
  if (o && !waitingFor(PLACES[p].kind === 'oven' ? 'MC' : 'x').length && !boardsWaiting(PLACES[p].tests).length) { S.rid = o.rid; S.view = 'run'; render(); return; }
  if (o && o.tray && (!o.bal || o.bal === balNo())) { S.rid = o.rid; S.view = 'run'; render(); return; }
  openLoad(p);
}
// This oven / furnace was scanned in the last 3 minutes: the worker is standing at it, no second scan needed
const atPlace = p => !!S.placeScan && S.placeScan.place === p && Date.now() - S.placeScan.at < 3 * 60000;
// Door closed / door open: the worker scans the oven or furnace first, so the right door is the one opened
function doorScan(p) {
  const d = S.door; if (!d) return;
  if (p !== d.place) { redScreen(B().bad.wrongPlace, { icon: placeIcon(d.place), num: placeNo(d.place) }); return; }
  S.door = null; S.placeScan = { place: p, at: Date.now() };
  if (d.act === 'start') { startRun(); return; }
  const r = runBy(d.rid);
  if (d.act === 'go') { if (r && runPhase(r) === 'warm') enqueue({ action: 'runGo', rid: r.rid, worker: S.worker }); good(); S.rid = d.rid; S.view = 'run'; render(); return; }
  if (r && runPhase(r) === 'up') enqueue({ action: 'runOut', rid: r.rid, worker: S.worker });
  good(); S.rid = d.rid; S.view = 'run'; render();
}
function goTest(code, k) { S.code = code; S.via = code + '|' + k; openTestB(k); }
// Moisture: the dish scanned from the sample screen
function pairDish(h) {
  const t = B(), s = sample(S.code), k = 'MC', st = s.tests[k], occ = occupants(h.id);
  if (occ.length && occ[0].s.code !== S.code) { redScreen(t.bad.notEmpty, { icon: ICON.dish, num: String(h.n), sub: occ[0].s.code }); return; }
  if (st.done === 3) { redScreen(t.bad.done, { icon: ICON.MC }); return; }
  good();
  if (holdOf(s, k) !== h.id) enqueue({ action: 'hold', code: S.code, key: k, holder: h.id, bal: balNo(), worker: S.worker });
  goTest(S.code, k);
}
// Moisture: the wrong dish was scanned. Before W1: just the other dish. After W1: W1 again on the new dish.
// After W2 the sample is already in the dish on the balance, so only the label is wrong: the weights stay.
function changeDish(h) {
  const t = B(), s = sample(S.code), k = 'MC', st = s.tests[k], cur = holdOf(s, k), occ = occupants(h.id);
  if (h.id === cur) { good(); render(); return; }
  if (occ.length) { redScreen(t.bad.notEmpty, { icon: ICON.dish, num: String(h.n), sub: occ[0].s.code }); return; }
  if (st.done === 2 && runOf(S.code, k)) { redScreen(t.bad.inOven, { icon: ICON.oven }); return; }
  if (st.done === 1) enqueue({ action: 'resetTest', code: S.code, key: k, worker: S.worker, why: 'redish' });
  enqueue({ action: 'hold', code: S.code, key: k, holder: h.id, bal: balNo(), worker: S.worker, change: true });
  good();
  goTest(S.code, k);
}
// A dish (or an old paper spot) scanned with no sample open: W2 or W3 for the sample on it
function onHolder(h) {
  const t = B(), occ = occupants(h.id);
  if (!occ.length) { redScreen(t.bad.empty, { icon: h.test === 'MC' ? ICON.dish : ICON.crucible, num: hBig(h.id) }); return; }
  const { s, k } = occ[occ.length - 1], st = s.tests[k];
  if (st.done === 1) { good(); return goTest(s.code, k); }
  const r = runOf(s.code, k);
  if (!r) { S.code = s.code; redScreen(t.bad.notIn, { icon: placeIcon(k === 'MC' ? 'O1' : 'F1') }); return; }
  const ph = runPhase(r);
  if (ph === 'warm') { redScreen(t.bad.heating, { icon: ICON.thermo, num: tempFor(k) ? tempFor(k) + '°' : '' }); return; }
  if (ph === 'heat') { redScreen(t.bad.heating, { icon: ICON.hour, num: String(minsLeft(r)) }); return; }
  const b = (s.holdBal || {})[k] || r.bal;
  if (b && balNo() && b !== balNo()) { redScreen(t.bad.otherBal, { icon: ICON.balance, num: String(b) }); return; }
  if (ph === 'up') { S.rid = r.rid; S.view = 'run'; S.door = { act: 'out', place: r.place, rid: r.rid }; bad(); render(); openScanner('door'); return; }
  good(); S.rid = r.rid; goTest(s.code, k);
}

/* ---------- opening a test ---------- */
function openTestB(k) {
  const t = B(), s = sample(S.code), st = s.tests[k];
  if (HELD.includes(k) && S.via !== S.code + '|' + k) {
    // not from a scan: what tapping the tile does
    if (st.done === 0 && k === 'MC') { openScanner('dish'); return; }
    if (st.done === 0) {
      if (!balNo()) { redScreen(t.bad.noBal, { icon: ICON.balance, toBal: true }); return; }
      const id = pickSpot(k);
      if (!id) { redScreen(t.bad.noBoard, { icon: ICON[k] }); return; }
      enqueue({ action: 'hold', code: S.code, key: k, holder: id, bal: balNo(), worker: S.worker });
      good();
    } else if (st.done === 2) {
      const r = runOf(S.code, k), h = holdOf(s, k);
      // W1/W2 from before the bench flow (or merged from the old app) have no dish / spot to scan: W3 straight away
      if (h) {
        if (!r) { redScreen(t.bad.notIn, { icon: k === 'MC' ? ICON.oven : ICON.furnace }); return; }
        if (runPhase(r) === 'heat') { redScreen(t.bad.heating, { icon: ICON.hour, num: String(minsLeft(r)) }); return; }
        if (k === 'MC') { redScreen(t.bad.wrongThing, { icon: ICON.dish, num: hBig(h) }); return; }   // W3: scan the dish
        if (r.tray) { startWalk(r); return; }
      }
    }
  }
  S.test = k; S.editing = false; S.draft = ''; S.modal = null;
  if (st.done === 3) S.view = 'review';
  else { S.step = st.done + 1; S.view = 'step'; }
  render();
  if (S.view === 'step') checkCard();
}

/* ---------- after a weight is saved ---------- */
// W2: where the dish / crucible goes next (shown big on the green screen)
function batchAfterW2(code, k) {
  const h = holdOf(sample(code), k); if (!h) return null;
  return { h, icon: k === 'MC' ? ICON.oven : ICON.furnace };
}
// W3 that hardly lost weight: probably never heated
function unheated(k, w, w3) {
  if (!HELD.includes(k) || !isNum(w[0]) || !isNum(w[1]) || w[1] <= w[0]) return false;
  return (w[1] - w3) / (w[1] - w[0]) * 100 < UNHEATED[k];
}
// When the W3 that came from a scan or the walk is saved: where to go next. True when handled.
function holdAfter(next) {
  if (S.walk) { S.via = null; walkNext(); return true; }
  if (S.step === 2 && next === 'sample') { S.via = null; S.view = 'sample'; return true; }   // same bag: on to its next test
  if (!S.via || next !== 'sample') return false;
  S.via = null;
  if (S.step === 3 && S.rid && runBy(S.rid)) { S.view = 'run'; return true; }
  S.view = 'home'; return true;
}

/* ---------- two phones pairing the same dish / spot at the same moment ---------- */
const CLASHED = {};
function checkSlots() {
  if (!S.data) return;
  const seen = {};
  S.data.samples.forEach(s => HELD.forEach(k => {
    const h = holdOf(s, k);
    if (!h || ![1, 2].includes(s.tests[k].done)) return;
    if (seen[h] && seen[h] !== s.code && !CLASHED[h]) {
      CLASHED[h] = true;
      if (S.modal) toast(`${hName(h)}: ${seen[h]} + ${s.code}`); else redScreen(`${seen[h]} + ${s.code}`, { icon: k === 'MC' ? ICON.dish : ICON.crucible, num: hBig(h) });
    }
    seen[h] = s.code;
  }));
}

/* ---------- modals of the bench flow ---------- */
function renderRed(m) {
  const t = B();
  return `<div class="modal redm"><div class="sheet" role="alertdialog" aria-modal="true">
    <div class="redicon">${m.icon || ICON.cross}${m.num ? `<b>${esc(m.num)}</b>` : ''}</div>
    ${m.sub ? `<p class="redsub">${esc(m.sub)}</p>` : ''}
    <p class="redmsg">${esc(m.msg)}</p>
    <div class="btnrow">${m.again ? `<button class="primary" data-act="red-again">${ICON.balance}<small>${esc(t.again)}</small></button>`
      : `<button class="primary" data-act="red-ok">${ICON.check}</button>`}</div>
    ${m.override && superOn() ? `<button class="link center" data-act="red-override">${esc(t.override)}</button>` : ''}</div></div>`;
}
function renderSavedB(m) {
  const t = B(), k = S.test, st = sample(S.code).tests[k];
  let what = '';
  if (m.kind === 's1') what = `<div class="nextpic">${vesselIcon(k)}<span class="plus">+</span>${ICON.bag}<span class="plus">→</span><b>W2</b></div>`;
  else if (m.kind === 's2' && m.slot) {
    const i = hInfo(m.slot.h);
    what = `<div class="nextpic">${i.test === 'MC' ? ICON.dish : ICON.crucible}<b>${esc(hBig(m.slot.h))}</b><span class="plus">→</span>${m.slot.icon}</div>${i.tray ? boardMap(i.tray, i.pos) : ''}`;
  } else if (m.kind === 's2') what = `<div class="nextpic">${vesselIcon(k)}<span class="plus">→</span>${S.tests[k].heat === 'oven' ? ICON.oven : ICON.furnace}</div>`;
  else if (isNum(m.pct)) what = `<div class="result ${isFlag(k, st) ? 'flag' : ''}"><span>${ICON[k]}</span><b>${m.pct.toFixed(2)} %</b></div>${flagMsg(m)}`;
  const undoOk = !m.noUndo && Date.now() - m.at < 10000;
  return `<div class="modal greenm" style="${cvar(k)}"><div class="sheet" role="dialog" aria-modal="true">
    <div class="tick big">${ICON.check}</div>${what}
    ${askPhoto(m) ? `<div class="photoask"><p>📷 ${esc(lbl(k))}</p></div>
      <div class="btnrow"><button class="secondary" data-act="photo-skip" ${S.busy ? 'disabled' : ''}>${ICON.cross}</button>
        <button class="primary" data-act="photo-take" data-test="${k}" ${S.busy ? 'disabled' : ''}>📷</button></div>`
      : `<div class="btnrow">${undoOk ? `<button class="secondary undobtn" data-act="undo">${ICON.undo}<small>${esc(t.undo)}</small></button>` : ''}
        <button class="primary" data-act="after">${ICON.arrow}</button></div>`}
  </div></div>`;
}
// ✎ on a test tile: W1, W2, W3 as three big boxes; tap one to weigh it again
function renderFix(m) {
  const s = sample(S.code), k = m.test, st = s.tests[k];
  const can = i => isNum(st.w[i]) && (st.done < 3 || superOn());
  return `<div class="modal" style="${cvar(k)}"><div class="sheet" role="dialog" aria-modal="true">
    <div class="stephead"><span class="ti">${ICON[k]}</span><b>${esc(s.code)}</b></div>
    <div class="wboxes">${[0, 1, 2].map(i => `<button class="wbox" data-act="fix-step" data-step="${i + 1}" ${can(i) ? '' : 'disabled'}>
      <small>W${i + 1}</small><b>${isNum(st.w[i]) ? fmt(st.w[i]) : '–'}</b>${can(i) ? `<span>${ICON.edit}</span>` : ''}</button>`).join('')}</div>
    ${superOn() && st.done > 0 ? `<button class="link center" style="color:var(--err)" data-act="ask-reset" data-test="${k}">↺ ${esc(T().reset)}</button>` : ''}
    <div class="btnrow"><button class="secondary" data-act="cancel">${ICON.cross}</button></div></div></div>`;
}
function renderAddCode(m) {
  return `<div class="modal redm"><div class="sheet" role="dialog" aria-modal="true">
    <div class="redicon">${ICON.bag}</div><p class="redsub">${esc(m.code)}</p><p class="redmsg">${esc(B().bad.notSample)}</p>
    <div class="btnrow"><button class="primary" data-act="cancel">${ICON.check}</button></div>
    <button class="link center" data-act="add-scanned">${esc(B().small.addCode)}</button></div></div>`;
}
function renderBenchModal(m) {
  if (m.type === 'red') return renderRed(m);
  if (m.type === 'fix') return renderFix(m);
  if (m.type === 'addcode') return renderAddCode(m);
  if (m.type === 'saved') return renderSavedB(m);
  return null;
}

/* ---------- taps of the bench flow ---------- */
function batchAct(el) {
  const r = S.rid && runBy(S.rid);
  switch (el.dataset.act) {
    case 'scan': openScanner('any'); return true;
    case 'scan-close': closeScanner(); return true;
    case 'scan-typed': scanTyped(); return true;
    case 'type-open': { const v = (document.getElementById('typecode') || {}).value; if (v && v.trim()) onScan(v.trim(), 'any'); return true; }
    case 'place': onPlace(el.dataset.place); return true;
    case 'r-out':
      if (r && runPhase(r) === 'up') { S.door = { act: 'out', place: r.place, rid: r.rid }; atPlace(r.place) ? doorScan(r.place) : openScanner('door'); }
      return true;
    case 'walk': if (r) startWalk(r); return true;
    case 'r-go': if (r && runPhase(r) === 'warm') { S.door = { act: 'go', place: r.place, rid: r.rid }; openScanner('door'); } return true;   // always a fresh scan: they read the display there
    case 'r-start': if (S.load && loadItems().length) { S.door = { act: 'start', place: S.load.place }; atPlace(S.load.place) ? doorScan(S.load.place) : openScanner('door'); } return true;
    case 'l-scan': openScanner('load'); return true;
    case 'l-all': S.load.items = waitingFor('MC').map(x => x.h).slice(0, CAP.MC); good(); render(); return true;
    case 'l-drop': S.load.items = S.load.items.filter(x => x !== el.dataset.h); render(); return true;
    case 'l-tray': S.load.tray = el.dataset.tray; S.load.out = {}; render(); return true;
    case 'l-out': { const p = el.dataset.pos; S.load.out[p] = !S.load.out[p]; render(); return true; }
    case 'redish': openScanner('redish'); return true;
    case 'fix': S.modal = { type: 'fix', test: el.dataset.test }; render(); return true;
    case 'fix-step': {
      const k = S.modal.test, step = +el.dataset.step, w = sample(S.code).tests[k].w[step - 1];
      S.modal = null; S.test = k; S.step = step; S.editing = true; S.via = S.code + '|' + k; S.view = 'step';
      S.draft = isNum(w) ? String(w) : ''; render(); return true;
    }
    case 'red-ok': { const m = S.modal; S.modal = null; if (m && m.toBal) S.view = 'bal'; render(); return true; }
    case 'red-again': S.modal = null; S.draft = ''; render(); return true;
    case 'red-override': { const m = S.modal; S.modal = null; if (m && m.value != null) doSave(m.value, m.why); return true; }
    case 'undo': undoSave(); return true;
    case 'pick-bal': S.view = 'bal'; render(); return true;
    case 'set-bal': S.machine = 'W' + el.dataset.bal; store.set('machine', S.machine); good(); S.view = 'home'; render(); return true;
    case 'who': S.worker = el.dataset.name; store.set('worker', S.worker); good(); S.view = balNo() ? 'home' : 'bal'; render(); load(); return true;
    case 'add-scanned': {
      const c = S.modal && S.modal.code; S.modal = null;
      if (c) { enqueue({ action: 'addCodes', codes: [c], worker: S.worker }); S.code = c; S.view = 'sample'; }
      render(); return true;
    }
  }
  return false;
}
// ↶ on the green screen: the weight goes back to what it was, and the same weight screen opens again
function undoSave() {
  const m = S.modal; if (!m || m.type !== 'saved') return;
  enqueue({ action: 'saveWeight', code: S.code, key: S.test, step: m.step, value: m.old == null ? null : m.old, undo: true, undoOf: m.value, bal: balNo(), worker: S.worker });
  S.modal = null; S.step = m.step; S.editing = m.kind === 'corrected'; S.draft = ''; S.view = 'step';
  render();
}
function loadInput() { return false; }

// A finished test: the result big, the three weights; only the supervisor can change them now
function renderReviewB() {
  const s = sample(S.code), k = S.test, st = s.tests[k];
  return `<div style="${cvar(k)}">${topBar(false)}
    <div class="stephead"><span class="ti">${ICON[k]}</span><b>${esc(s.code)}</b></div>
    <div class="result ${isFlag(k, st) ? 'flag' : ''}"><span>${ICON.check}</span><b>${esc(pctLine(k, st) || B().small.done)}</b></div>${isFlag(k, st) ? `<div class="flagnote">${esc(flagText(k, st))}</div>` : ''}
    <div class="pws">${st.w.map((w, i) => `<span class="pw"><small>W${i + 1}</small>${fmt(w)}</span>`).join('')}</div>
    ${superOn() ? `<button class="secondary wide" data-act="fix" data-test="${k}">${ICON.edit} ${esc(B().small.supervisor)}</button>` : `<p class="sub center-t" style="margin-top:16px">${ICON.lock} ${esc(B().bad.locked)}</p>`}
  </div>`;
}
