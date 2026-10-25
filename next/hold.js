/* ====== Dish and spot QR codes ======
   Moisture: every petri dish has its own QR ("DISH 12").
   Ash / VM: every spot of the paper tray template has its own QR ("ASH A-5", "VM B-12"),
   and the template has one for itself ("ASH A").

   Flow: scan the sample bag → scan an empty dish / spot (the app pairs them) → W1, W2.
   Loading: scan the oven / furnace → scan each dish going in (oven), or pick the template and say how many
   crucibles went in (furnace) → start the timer.
   W3: scan any dish / spot. The app knows which sample is on it.

   data.json: samples[code].h[test] = the dish / spot the test is on.
              runs[rid] = one load of an oven / furnace: { rid, place, test, tray, items: [{ h, code, w2 }], start, mins, by, outAt }.
   Both change only through queued jobs (hold, runStart, runOut, runCancel), so they sync and merge like weights.
   Loaded before the main script: only declarations here, nothing that runs at load time. */

const CAP = { MC: 12, VM: 18, ASH: 10 };          // dishes per oven, spots per template (= one furnace load)
const COLS = { VM: 3, ASH: 2 };                   // template layout, numbered down each column like the paper job card
const MINS = { MC: 60, VM: 7, ASH: 60 };          // default heating time
const HELD = ['MC', 'VM', 'ASH'];                 // tests that sit on a dish / spot (Total Moisture does not)
const UNHEATED = { MC: 0.2, VM: 1, ASH: 1 };      // % weight lost below which W3 looks like it never went in
const PLACES = {
  O1: { tests: ['MC'], kind: 'oven' }, O2: { tests: ['MC'], kind: 'oven' },
  F1: { tests: ['VM', 'ASH'], kind: 'furnace' }, F2: { tests: ['VM', 'ASH'], kind: 'furnace' }
};

const BL = {
  en: {
    scan: 'Scan QR', scanSub: 'sample bag, dish, spot, oven or furnace',
    typePh: 'No camera? Type the full code', open: 'Open',
    inHeat: 'In the oven / furnace', waitIn: 'Waiting to go in', nothingIn: 'Nothing in the ovens or furnaces.',
    nothingWait: 'Nothing waiting. A dish or crucible waits here once its W2 is saved.',
    finished: 'Finished in the last 12 hours',
    dishes: n => `${n} dish${n === 1 ? '' : 'es'}`, crucibles: n => `${n} crucible${n === 1 ? '' : 's'}`,
    heating: (p, m) => `In ${p} · ${m} min left`, cool: p => `Time is up · ${p}. Scan each one for W3`,
    outCool: p => `Out of ${p}, cooling. Scan each one for W3`, done: 'Done. All W3 saved.',
    dish: 'Dish', spot: 'spot', tmpl: 'template',
    hName: h => h.test === 'MC' ? `Dish ${h.n}` : `${h.test === 'ASH' ? 'Ash' : 'VM'} ${h.letter} · spot ${h.pos}`,
    trayName: tr => `${tr.test === 'ASH' ? 'Ash' : 'VM'} template ${tr.letter}`,
    scanFirst: k => k === 'MC' ? 'To start: scan an empty petri dish.' : `To start: scan an empty spot on ${k === 'ASH' ? 'an Ash' : 'a VM'} template.`,
    startHint: 'Next: scan an empty dish (Moisture) or an empty spot on the Ash / VM template.',
    onHold: (h) => `On ${h} · next W2`, onWait: (h, p) => `On ${h} · waiting for the ${p}`,
    inPlace: (p, m, h) => `${h} in ${p} · ${m} min left`, w3Now: h => `Time is up. Scan ${h} for W3`,
    w3Scan: h => `W3 is entered by scanning ${h}.`,
    empty: h => `${h} is empty. Scan the sample bag first, then ${h}.`,
    taken: (h, c) => `${h} already has ${c} on it. Use an empty one.`,
    onOther: (k, h) => `This sample's ${k} is already on ${h}.`,
    alreadyDone: k => `${k} is already finished for this sample.`,
    notHeated: (h, c, p) => `${h} (${c}) has not been in the ${p} yet.`,
    early: (h, c, p, m) => `${h} (${c}) is in ${p}: ${m} min left. Weigh W3 now anyway?`, earlyYes: 'Weigh now',
    keepDish: 'Keep the sample in dish', putSpot: tr => `Put the crucible on ${tr}, spot`,
    load: p => `Load ${p}`, loadDish: 'Scan each dish as you put it in.', allIn: n => `All ${n} waiting dishes went in`,
    inCount: (n, c) => `${n} of ${c} in`, notWaiting: h => `${h} is not waiting to go in.`, full: c => `Full: ${c} is the most.`,
    whichTray: 'Which template is going in? Tap it, or scan its QR.', noTray: 'No template has crucibles waiting.',
    howMany: 'How many crucibles did you put in?',
    tapOut: (said, map) => `You said ${said}, the template shows ${map}. Tap the spots that stayed out.`,
    tooMany: (said, map) => `You said ${said}, but only ${map} have W2 saved on this template.`,
    countOk: 'Count matches.',
    stayedOut: 'stayed out', start: m => `Door closed: start ${m} min timer`, minutes: 'minutes',
    started: p => `Timer started · ${p}`, wrongTest: (p, k) => `${p} is not used for ${k}.`,
    takeOut: p => `Taken out of ${p} to cool (frees it)`, cancelRun: 'Loaded by mistake: cancel',
    freeAsk: (p, n) => `${p} still has ${n} in it and the time is up. Did you take them out?`, freeYes: 'Yes, taken out. Load now',
    scanW3: 'Scan a dish / spot for W3',
    unheated: (h) => `This hardly lost any weight. Did ${h} really go in? Check before saving.`,
    clash: (h, a, b) => `${h} has two samples on it: ${a} and ${b}. Check which one is really there and reset the other.`,
    scanTitle: 'Point the camera at the QR code', close: 'Close',
    camFail: 'The camera did not open. Type the code below.', camWait: 'Starting camera…',
    unknown: c => `“${c}” is not a sample code in the list.`, addCode: c => `Add ${c} as a new sample`,
    otherMachine: (m, me) => `This sample is for ${m}. This phone is ${me}.`,
    wantPlace: 'Scan the oven or furnace QR.', labels: 'Print QR labels and templates'
  },
  gu: {
    scan: 'QR સ્કેન કરો', scanSub: 'સેમ્પલ બેગ, ડિશ, ખાનું, ઓવન કે ફર્નેસ',
    typePh: 'કેમેરા નથી? પૂરો કોડ લખો', open: 'ખોલો',
    inHeat: 'ઓવન / ફર્નેસ માં', waitIn: 'અંદર જવાની રાહ', nothingIn: 'ઓવન કે ફર્નેસ માં કંઈ નથી.',
    nothingWait: 'કંઈ રાહ જોતું નથી. W2 સેવ થાય પછી ડિશ કે ક્રુસિબલ અહીં દેખાય છે.',
    finished: 'છેલ્લા 12 કલાકમાં પૂરું',
    dishes: n => `${n} ડિશ`, crucibles: n => `${n} ક્રુસિબલ`,
    heating: (p, m) => `${p} માં · ${m} મિનિટ બાકી`, cool: p => `સમય પૂરો · ${p}. W3 માટે દરેક સ્કેન કરો`,
    outCool: p => `${p} માંથી બહાર, ઠંડું થાય છે. W3 માટે દરેક સ્કેન કરો`, done: 'પૂરું. બધા W3 સેવ થયા.',
    dish: 'ડિશ', spot: 'ખાનું', tmpl: 'ટેમ્પ્લેટ',
    hName: h => h.test === 'MC' ? `ડિશ ${h.n}` : `${h.test === 'ASH' ? 'એશ' : 'VM'} ${h.letter} · ખાનું ${h.pos}`,
    trayName: tr => `${tr.test === 'ASH' ? 'એશ' : 'VM'} ટેમ્પ્લેટ ${tr.letter}`,
    scanFirst: k => k === 'MC' ? 'શરૂ કરવા: ખાલી પેટ્રી ડિશ સ્કેન કરો.' : `શરૂ કરવા: ${k === 'ASH' ? 'એશ' : 'VM'} ટેમ્પ્લેટ નું ખાલી ખાનું સ્કેન કરો.`,
    startHint: 'હવે: ખાલી ડિશ (મોઇશ્ચર) કે એશ / VM ટેમ્પ્લેટ નું ખાલી ખાનું સ્કેન કરો.',
    onHold: (h) => `${h} પર · હવે W2`, onWait: (h, p) => `${h} પર · ${p} ની રાહ`,
    inPlace: (p, m, h) => `${h} ${p} માં · ${m} મિનિટ બાકી`, w3Now: h => `સમય પૂરો. W3 માટે ${h} સ્કેન કરો`,
    w3Scan: h => `W3 માટે ${h} સ્કેન કરો.`,
    empty: h => `${h} ખાલી છે. પહેલા સેમ્પલ બેગ સ્કેન કરો, પછી ${h}.`,
    taken: (h, c) => `${h} પર પહેલેથી ${c} છે. ખાલી વાપરો.`,
    onOther: (k, h) => `આ સેમ્પલ નું ${k} પહેલેથી ${h} પર છે.`,
    alreadyDone: k => `આ સેમ્પલ નું ${k} પૂરું થઈ ગયું છે.`,
    notHeated: (h, c, p) => `${h} (${c}) હજુ ${p} માં ગયું નથી.`,
    early: (h, c, p, m) => `${h} (${c}) ${p} માં છે: ${m} મિનિટ બાકી. તો પણ હમણાં W3 કરવું?`, earlyYes: 'હમણાં વજન કરો',
    keepDish: 'સેમ્પલ આ ડિશ માં રાખો', putSpot: tr => `ક્રુસિબલ ${tr} પર મૂકો, ખાનું`,
    load: p => `${p} લોડ કરો`, loadDish: 'દરેક ડિશ અંદર મૂકતી વખતે સ્કેન કરો.', allIn: n => `રાહ જોતી બધી ${n} ડિશ અંદર ગઈ`,
    inCount: (n, c) => `${n} / ${c} અંદર`, notWaiting: h => `${h} અંદર જવાની રાહમાં નથી.`, full: c => `ભરાઈ ગયું: વધુમાં વધુ ${c}.`,
    whichTray: 'કયું ટેમ્પ્લેટ અંદર જાય છે? ટેપ કરો કે તેનો QR સ્કેન કરો.', noTray: 'કોઈ ટેમ્પ્લેટ પર ક્રુસિબલ રાહ જોતા નથી.',
    howMany: 'તમે કેટલા ક્રુસિબલ અંદર મૂક્યા?',
    tapOut: (said, map) => `તમે ${said} કહ્યા, ટેમ્પ્લેટ ${map} બતાવે છે. બહાર રહેલા ખાના ટેપ કરો.`,
    tooMany: (said, map) => `તમે ${said} કહ્યા, પણ આ ટેમ્પ્લેટ પર ફક્ત ${map} નું W2 સેવ છે.`,
    countOk: 'ગણતરી બરાબર છે.',
    stayedOut: 'બહાર રહ્યું', start: m => `દરવાજો બંધ: ${m} મિનિટ ટાઈમર શરૂ કરો`, minutes: 'મિનિટ',
    started: p => `ટાઈમર શરૂ · ${p}`, wrongTest: (p, k) => `${p} ${k} માટે નથી.`,
    takeOut: p => `${p} માંથી ઠંડું કરવા કાઢ્યું (ખાલી કરે)`, cancelRun: 'ભૂલથી મૂક્યું: રદ કરો',
    freeAsk: (p, n) => `${p} માં હજુ ${n} છે અને સમય પૂરો થયો છે. શું તમે બહાર કાઢ્યા?`, freeYes: 'હા, કાઢ્યા. હવે લોડ કરો',
    scanW3: 'W3 માટે ડિશ / ખાનું સ્કેન કરો',
    unheated: (h) => `આનું વજન લગભગ ઘટ્યું નથી. શું ${h} ખરેખર અંદર ગયું હતું? સેવ કરતા પહેલા તપાસો.`,
    clash: (h, a, b) => `${h} પર બે સેમ્પલ છે: ${a} અને ${b}. ખરેખર કયું છે તે તપાસો અને બીજું રીસેટ કરો.`,
    scanTitle: 'કેમેરા QR કોડ તરફ રાખો', close: 'બંધ કરો',
    camFail: 'કેમેરા ખૂલ્યો નહીં. નીચે કોડ લખો.', camWait: 'કેમેરા શરૂ થાય છે…',
    unknown: c => `“${c}” યાદીમાં સેમ્પલ કોડ નથી.`, addCode: c => `${c} નવા સેમ્પલ તરીકે ઉમેરો`,
    otherMachine: (m, me) => `આ સેમ્પલ ${m} માટે છે. આ ફોન ${me} છે.`,
    wantPlace: 'ઓવન કે ફર્નેસ નો QR સ્કેન કરો.', labels: 'QR લેબલ અને ટેમ્પ્લેટ છાપો'
  }
};
const B = () => BL[S.lang] || BL.en;
const PLACE_NAME = { en: { O1: 'Oven 1', O2: 'Oven 2', F1: 'Furnace 1', F2: 'Furnace 2' },
                     gu: { O1: 'ઓવન 1', O2: 'ઓવન 2', F1: 'ફર્નેસ 1', F2: 'ફર્નેસ 2' } };
const placeName = p => (PLACE_NAME[S.lang] || PLACE_NAME.en)[p] || p;
const heatName = k => placeName(k === 'MC' ? 'O1' : 'F1').replace(/\s*1$/, '').toLowerCase();

/* ---------- dish / spot ids ----------
   id "DISH 12" (Moisture), "ASH A-5" / "VM B-12" (a spot), tray "ASH A" (a template) */
function holderFromText(txt) {
  const up = String(txt).trim().toUpperCase();
  let m = up.match(/^DISH\s*[-_ ]?\s*0*(\d{1,4})$/);
  if (m) return { id: `DISH ${+m[1]}`, test: 'MC', n: +m[1] };
  m = up.match(/^(ASH|VM)\s*[-_ ]?\s*([A-Z])\s*[-_ ]\s*0*(\d{1,2})$/) || up.match(/^(ASH|VM)\s*[-_ ]?\s*([A-Z])0*(\d{1,2})$/);
  if (m && +m[3] >= 1 && +m[3] <= CAP[m[1]]) return { id: `${m[1]} ${m[2]}-${+m[3]}`, test: m[1], letter: m[2], pos: +m[3], tray: `${m[1]} ${m[2]}` };
  m = up.match(/^(ASH|VM)\s*[-_ ]?\s*([A-Z])$/);
  if (m) return { id: null, test: m[1], letter: m[2], tray: `${m[1]} ${m[2]}` };
  return null;
}
const hInfo = id => holderFromText(id) || { id, test: 'MC', n: id };
const hName = id => B().hName(hInfo(id));
const trayName = tr => B().trayName(hInfo(tr));

/* ---------- the data file side (runs on the merged copy while syncing, so no S here) ---------- */
// Apply one job. Returns false for any other job.
function batchApply(f, j) {
  if (/^batch/.test(j.action)) return true;          // jobs of the batch version: nothing to do any more
  if (j.action === 'hold') {
    const s = fileSample(f, j.code); s.h = s.h || {}; s.h[j.key] = j.holder;
    s.ha = s.ha || {}; s.ha[j.key] = j.at;            // when it was put on: only loads after this count for it
    return true;
  }
  if (!/^run/.test(j.action)) return false;
  const all = f.runs = f.runs || {};
  if (j.action === 'runStart') {
    // keep data.json small: loads older than 3 days are dropped
    Object.keys(all).forEach(r => { if (j.at - all[r].start > 3 * 86400000) delete all[r]; });
    if (!all[j.rid]) all[j.rid] = { rid: j.rid, place: j.place, test: j.test, tray: j.tray || null, items: j.items,
                                    start: j.at, mins: j.mins, by: j.worker || '', outAt: null };
  } else if (j.action === 'runOut') {
    if (all[j.rid] && !all[j.rid].outAt) all[j.rid].outAt = j.at;
  } else if (j.action === 'runCancel') {
    delete all[j.rid];
  }
  return true;
}

/* ---------- what the app shows ---------- */
const runs = () => (S.data && S.data.runs) || [];
const runBy = rid => runs().find(r => r.rid === rid);
const runEnd = r => r.start + r.mins * 60000;
const minsLeft = r => Math.max(0, Math.ceil((runEnd(r) - Date.now()) / 60000));
const holdOf = (s, k) => (s && s.hold && s.hold[k]) || null;
// 'wait' (W3 to do), 'w3' (W3 saved) or 'gone' (reset, or put on another dish / spot since it went in)
function itemState(r, it) {
  const s = sample(it.code), st = s && s.tests[r.test];
  if (!st || holdOf(s, r.test) !== it.h || (s.holdAt[r.test] || 0) > r.start) return 'gone';
  return st.done === 3 ? 'w3' : st.done === 2 ? 'wait' : 'gone';
}
function runPhase(r) {
  if (!r.items.some(it => itemState(r, it) === 'wait')) return 'done';
  return !r.outAt && Date.now() < runEnd(r) ? 'heating' : 'cool';
}
const waitCount = r => r.items.filter(it => itemState(r, it) === 'wait').length;
// The newest load this sample's test went into
function runOf(code, k) {
  return runs().filter(r => r.test === k && r.items.some(it => it.code === code && itemState(r, it) !== 'gone'))
    .sort((a, b) => b.start - a.start)[0] || null;
}
// The oven / furnace still holding a load (not taken out, W3 not finished)
const placeRun = p => runs().filter(r => r.place === p && !r.outAt && runPhase(r) !== 'done').sort((a, b) => b.start - a.start)[0] || null;
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
function traysWaiting() {
  const m = {};
  ['VM', 'ASH'].forEach(k => waitingFor(k).forEach(x => { const tr = hInfo(x.h).tray; (m[tr] = m[tr] || { tray: tr, test: k, n: 0 }).n++; }));
  return Object.values(m).sort((a, b) => a.tray.localeCompare(b.tray));
}

// Line under a test on the sample screen ('' = the usual text)
function holdStateText(code, k, done) {
  if (!HELD.includes(k)) return '';
  const t = B(), s = sample(code), h = holdOf(s, k);
  if (done === 0) return t.scanFirst(k);
  if (!h) return '';
  if (done === 1) return t.onHold(hName(h));
  if (done !== 2) return '';
  const r = runOf(code, k);
  if (!r) return t.onWait(hName(h), heatName(k));
  return runPhase(r) === 'heating' ? t.inPlace(placeName(r.place), minsLeft(r), hName(h)) : t.w3Now(hName(h));
}
// A dish / spot test is started and its W3 entered only by scanning the dish / spot. Returns a message when blocked.
function startBlocked(code, k, done) {
  if (!HELD.includes(k) || S.via === code + '|' + k) return '';
  const t = B(), h = holdOf(sample(code), k);
  if (done === 0) return t.scanFirst(k);
  if (done === 2 && h) return t.w3Scan(hName(h));
  return '';
}
// After W2: where the dish / crucible goes (shown big in the "saved" message)
function batchAfterW2(code, k) {
  const h = holdOf(sample(code), k); if (!h) return null;
  const i = hInfo(h), t = B();
  return k === 'MC' ? { text: t.keepDish, big: String(i.n) } : { text: t.putSpot(trayName(i.tray)), big: String(i.pos) };
}
// Big banner on the weight screen: which dish / spot is on the balance
function walkBanner() {
  if (S.view !== 'step' || !HELD.includes(S.test)) return '';
  const h = holdOf(sample(S.code), S.test); if (!h) return '';
  const i = hInfo(h);
  return `<div class="walk">${esc(S.test === 'MC' ? B().dish : trayName(i.tray) + ' · ' + B().spot)}<b>${esc(String(i.pos || i.n))}</b></div>`;
}
// W3 that hardly lost weight: probably never heated
function unheatedNote() {
  if (S.step !== 3 || !HELD.includes(S.test) || !S.modal || S.modal.type !== 'confirm') return '';
  const w = sample(S.code).tests[S.test].w, w3 = S.modal.value;
  if (!isNum(w[0]) || !isNum(w[1]) || w[1] <= w[0]) return '';
  const loss = (w[1] - w3) / (w[1] - w[0]) * 100;
  return loss < UNHEATED[S.test] ? `<p class="flagnote">⚠ ${esc(B().unheated(hName(holdOf(sample(S.code), S.test) || '')))}</p>` : '';
}
// When the W2 / W3 that came from a scan is saved: where to go next. True when handled.
function holdAfter(next) {
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
      const msg = B().clash(hName(h), seen[h], s.code);
      if (S.modal) toast(msg); else { S.modal = { type: 'moved', msg, test: k }; render(); }
    }
    seen[h] = s.code;
  }));
}

/* ---------- screens ---------- */
function runRow(r) {
  const t = B(), ph = runPhase(r), n = r.items.length;
  const state = ph === 'heating' ? t.heating(placeName(r.place), minsLeft(r)) : ph === 'cool' ? (r.outAt ? t.outCool(placeName(r.place)) : t.cool(placeName(r.place))) : t.done;
  return `<button class="testbtn batchrow ph-${ph}" style="${cvar(r.test)}" data-act="r-open" data-rid="${esc(r.rid)}">
    <div class="name">${esc(placeName(r.place))} · ${esc(lbl(r.test))}${r.tray ? ' · ' + esc(trayName(r.tray)) : ''} · ${esc(r.test === 'MC' ? t.dishes(n) : t.crucibles(n))}</div>
    <div class="state">${esc(state)}</div></button>`;
}
function renderHomeBeta() {
  const t = B(), live = [], old = [];
  runs().forEach(r => (runPhase(r) === 'done' ? old : live).push(r));
  live.sort((a, b) => (runPhase(a) === 'cool' ? 0 : 1) - (runPhase(b) === 'cool' ? 0 : 1) || runEnd(a) - runEnd(b));
  const recent = old.filter(r => Date.now() - r.start < 12 * 3600000).sort((a, b) => b.start - a.start);
  const mc = waitingFor('MC'), trays = traysWaiting();
  const waits = (mc.length ? [`<div class="testbtn" style="${cvar('MC')}"><div class="name">${esc(lbl('MC'))} · ${esc(t.dishes(mc.length))}</div>
      <div class="state">${esc(mc.map(x => hName(x.h)).join(', '))}</div></div>`] : [])
    .concat(trays.map(x => `<div class="testbtn" style="${cvar(x.test)}"><div class="name">${esc(trayName(x.tray))} · ${esc(t.crucibles(x.n))}</div></div>`));
  return header() + `
    <button class="primary scanbig" data-act="scan"><span class="qr" aria-hidden="true">▣</span>${esc(t.scan)}<small>${esc(t.scanSub)}</small></button>
    <div class="typerow"><input class="field" id="typecode" type="text" autocomplete="off" autocapitalize="characters" placeholder="${esc(t.typePh)}">
      <button class="secondary" data-act="type-open">${esc(t.open)}</button></div>
    <button class="machline" data-act="setup">⚖ <b>${esc(S.machine || 'ALL')}</b></button>
    <h3 class="bhead">${esc(t.inHeat)}</h3>
    <div class="list">${live.length ? live.map(runRow).join('') : `<div class="empty">${esc(t.nothingIn)}</div>`}</div>
    <h3 class="bhead">${esc(t.waitIn)}</h3>
    <div class="list">${waits.length ? waits.join('') : `<div class="empty">${esc(t.nothingWait)}</div>`}</div>
    ${recent.length ? `<h3 class="bhead">${esc(t.finished)}</h3><div class="list">${recent.map(runRow).join('')}</div>` : ''}`;
}

// The spots of one template, numbered down each column like the paper job card
function trayMap(k, cell) {
  const cols = COLS[k], rows = Math.ceil(CAP[k] / cols);
  return `<div class="slots" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},auto)">
    ${Array.from({ length: CAP[k] }, (x, i) => cell(i + 1)).join('')}</div>`;
}
function itemCell(r, it, extra = '') {
  const st = itemState(r, it), i = hInfo(it.h);
  return `<div class="slot${st === 'gone' ? ' out' : ''}${st === 'w3' ? ' w3' : ''}" ${extra}>
    <span class="sn">${esc(r.test === 'MC' ? B().dish + ' ' + i.n : String(i.pos))}</span>${st === 'w3' ? '<span class="tk" aria-hidden="true">✓</span>' : ''}<span class="sc">${esc(it.code)}</span></div>`;
}
function renderRun() {
  const t = B(), r = runBy(S.rid);
  if (!r) { S.view = 'home'; return renderHomeBeta(); }
  const ph = runPhase(r), p = placeName(r.place);
  const items = r.tray
    ? trayMap(r.test, pos => { const it = r.items.find(x => hInfo(x.h).pos === pos); return it ? itemCell(r, it) : `<div class="slot empty"><span class="sn">${pos}</span></div>`; })
    : `<div class="slots" style="grid-template-columns:repeat(3,1fr)">${r.items.map(it => itemCell(r, it)).join('')}</div>`;
  let act = '';
  if (ph === 'heating') act = `<div class="bigtime">${esc(t.heating(p, minsLeft(r)))}</div>
      <button class="link center" data-act="r-cancel">${esc(t.cancelRun)}</button>`;
  else if (ph === 'cool') act = `<button class="primary wide" data-act="scan">▣ ${esc(t.scanW3)}</button>`
    + (r.outAt ? `<p class="sub center">${esc(t.outCool(p))}</p>` : `<button class="secondary wide" data-act="r-out">${esc(t.takeOut(p))}</button>`);
  else act = `<p class="sub center">${esc(t.done)}</p>`;
  return `<div style="${cvar(r.test)}">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <button class="back" data-act="home">${esc(T().allSamples)}</button>${langBtn()}</div>
    <div class="jobcard">
      <h2 class="title">${esc(p)} · ${esc(lbl(r.test))}</h2>
      <p class="sub">${esc(r.tray ? trayName(r.tray) + ' · ' : '')}${esc(r.by)} · ${esc(fmtTime(r.start))}${r.outAt ? '' : ' → ' + esc(fmtTime(runEnd(r)))}</p>
      <p class="state ph-${ph}">${esc(ph === 'heating' ? t.heating(p, minsLeft(r)) : ph === 'cool' ? t.cool(p) : t.done)}</p>
      ${items}
    </div>
    <div class="bact">${act}</div></div>`;
}
const fmtTime = ms => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// Loading an oven / furnace: S.load = { place, tray, items: [ids] (oven), out: {pos: true} (furnace), said: '' }
function loadItems() {
  const L = S.load;
  if (PLACES[L.place].kind === 'oven') { const w = waitingFor('MC'); return L.items.map(id => w.find(x => x.h === id)).filter(Boolean); }
  if (!L.tray) return [];
  return waitingFor(hInfo(L.tray).test, L.tray).filter(x => !L.out[hInfo(x.h).pos]);
}
function loadReady() {
  const L = S.load, n = loadItems().length;
  if (!n) return false;
  if (PLACES[L.place].kind === 'oven') return true;
  return L.said !== '' && +L.said === n;
}
function renderLoad() {
  const t = B(), L = S.load, p = placeName(L.place), oven = PLACES[L.place].kind === 'oven';
  const top = `<div style="display:flex;justify-content:space-between;align-items:center">
      <button class="back" data-act="home">${esc(T().allSamples)}</button>${langBtn()}</div>
    <h2 class="title">${esc(t.load(p))}</h2>`;
  const k = oven ? 'MC' : L.tray ? hInfo(L.tray).test : null;
  const startBtn = k ? `<label class="mins">${esc(t.minutes)} <input id="bmins" type="number" inputmode="numeric" min="1" value="${MINS[k]}"></label>
      <button class="primary wide" data-act="r-start" ${loadReady() ? '' : 'disabled'}>${esc(t.start(MINS[k]))}</button>` : '';
  if (oven) {
    const w = waitingFor('MC'), its = loadItems();
    return `<div style="${cvar('MC')}">${top}
      <p class="instr">${esc(t.loadDish)}</p>
      <button class="primary wide" data-act="l-scan">▣ ${esc(t.scan)}</button>
      ${w.length && w.length <= CAP.MC && its.length < w.length ? `<button class="secondary wide" data-act="l-all">${esc(t.allIn(w.length))}</button>` : ''}
      <p class="state" style="font-weight:700">${esc(t.inCount(its.length, CAP.MC))}</p>
      <div class="slots" style="grid-template-columns:repeat(3,1fr)">${its.map(x => `<button class="slot" data-act="l-drop" data-h="${esc(x.h)}">
        <span class="sn">${esc(B().dish)} ${esc(String(hInfo(x.h).n))}</span><span class="tk" aria-hidden="true">✕</span><span class="sc">${esc(x.code)}</span></button>`).join('')}</div>
      <div class="bact">${startBtn}</div></div>`;
  }
  if (!L.tray) {
    const trs = traysWaiting();
    return `${top}<p class="instr">${esc(t.whichTray)}</p>
      <div class="list">${trs.length ? trs.map(x => `<button class="testbtn" style="${cvar(x.test)}" data-act="l-tray" data-tray="${esc(x.tray)}">
        <div class="name">${esc(trayName(x.tray))}</div><div class="state">${esc(t.crucibles(x.n))}</div></button>`).join('') : `<div class="empty">${esc(t.noTray)}</div>`}</div>
      <button class="secondary wide" data-act="l-scan">▣ ${esc(t.scan)}</button>`;
  }
  const all = waitingFor(k, L.tray);
  return `<div style="${cvar(k)}">${top}
    <p class="sub">${esc(trayName(L.tray))}</p>
    ${trayMap(k, pos => {
      const x = all.find(y => hInfo(y.h).pos === pos);
      if (!x) return `<div class="slot empty"><span class="sn">${pos}</span></div>`;
      const out = !!L.out[pos];
      return `<button class="slot${out ? ' out' : ''}" data-act="l-out" data-pos="${pos}"><span class="sn">${pos}</span><span class="sc">${esc(x.code)}</span>${out ? `<span class="sg">${esc(t.stayedOut)}</span>` : ''}</button>`;
    })}
    <label class="mins" style="margin-top:12px">${esc(t.howMany)} <input id="lsaid" type="number" inputmode="numeric" min="0" max="${CAP[k]}" value="${esc(L.said)}"></label>
    <div id="lnote">${loadNote()}</div>
    <div class="bact">${startBtn}</div></div>`;
}
function loadNote() {
  const t = B(), L = S.load; if (!L.tray || L.said === '') return '';
  const all = waitingFor(hInfo(L.tray).test, L.tray).length, n = loadItems().length, said = +L.said;
  return said > all ? `<p class="flagnote">${esc(t.tooMany(said, all))}</p>`
    : said !== n ? `<p class="flagnote">${esc(t.tapOut(said, n))}</p>` : `<p class="sub" style="color:var(--ok);font-weight:700">✓ ${esc(t.countOk)}</p>`;
}
function openLoad(p) { S.load = { place: p, tray: null, items: [], out: {}, said: '' }; S.view = 'load'; render(); }

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
async function openScanner(purpose) {
  closeScanner();
  const t = B(), el = scanEl();
  SCAN = { purpose, stream: null, timer: null, det: null };
  el.innerHTML = `<div class="scanbox"><p class="instr">${esc(t.scanTitle)}</p>
    <div class="vid"><video playsinline muted></video><div class="aim"></div></div>
    <p class="sub" id="scanmsg">${esc(t.camWait)}</p>
    <div class="typerow"><input class="field" id="scantype" type="text" autocomplete="off" autocapitalize="characters" placeholder="${esc(t.typePh)}">
      <button class="secondary" data-act="scan-typed">${esc(t.open)}</button></div>
    <button class="secondary wide" data-act="scan-close">${esc(t.close)}</button></div>`;
  el.hidden = false;
  const run = SCAN, video = el.querySelector('video');
  try {
    run.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (SCAN !== run) { run.stream.getTracks().forEach(x => x.stop()); return; }
    video.srcObject = run.stream; await video.play();
    if ('BarcodeDetector' in window) { try { run.det = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { run.det = null; } }
    if (!run.det && !window.jsQR) await new Promise((ok, bad) => { const s = document.createElement('script'); s.src = '../lib/jsQR.js'; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
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
      if (txt) { if (navigator.vibrate) navigator.vibrate(80); closeScanner(); onScan(txt, run.purpose); return; }
      run.timer = setTimeout(tick, 180);
    };
    tick();
  } catch (e) {
    const msg = document.getElementById('scanmsg'); if (msg) { msg.textContent = t.camFail; msg.className = 'flagnote'; }
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

// What a scan (or a typed code) does, depending on where it was started
function onScan(txt, purpose) {
  const t = B(), p = placeFromText(txt), h = holderFromText(txt);
  if (purpose === 'load' && S.view === 'load') {
    if (h) return loadScan(h);
    if (!p) toast(t.wantPlace);
    return;
  }
  if (p) return onPlace(p);
  if (h && h.id) return onHolder(h);
  if (h && h.tray) { toast(t.whichTray); return; }
  const code = codeFromText(txt);
  if (!code) { S.modal = { type: 'addcode', code: String(txt).trim().toUpperCase().slice(0, 20) }; render(); return; }
  // a code from the Name Tags sheet that has no weights yet joins the list by itself
  if (!sample(code)) enqueue({ action: 'addCodes', codes: [code], worker: S.worker });
  S.code = code; S.view = 'sample'; S.via = null; render();
}
function onPlace(p) {
  const r = placeRun(p);
  if (r && runPhase(r) === 'cool') { S.rid = r.rid; S.view = 'run'; S.modal = { type: 'freeplace', rid: r.rid, place: p }; render(); return; }
  if (r) { S.rid = r.rid; S.view = 'run'; render(); return; }
  openLoad(p);
}
function goTest(code, k) { S.code = code; S.via = code + '|' + k; openTest(k); }
function onHolder(h) {
  const t = B(), occ = occupants(h.id), name = hName(h.id);
  // a sample is open: this dish / spot is for it
  if (S.view === 'sample' && S.code) {
    const mine = occ.find(o => o.s.code === S.code);
    if (!mine && occ.length) { toast(t.taken(name, occ[0].s.code)); return; }
    if (!mine) {
      const s = sample(S.code), st = s.tests[h.test], cur = holdOf(s, h.test);
      if (st.done === 3) { toast(t.alreadyDone(lbl(h.test))); return; }
      if (st.done > 0 && cur && cur !== h.id) { toast(t.onOther(lbl(h.test), hName(cur))); return; }
      enqueue({ action: 'hold', code: S.code, key: h.test, holder: h.id, worker: S.worker });
      return goTest(S.code, h.test);
    }
  }
  if (!occ.length) { toast(t.empty(name)); return; }
  const { s, k } = occ[occ.length - 1], st = s.tests[k];
  if (st.done === 1) return goTest(s.code, k);
  const r = runOf(s.code, k);
  if (!r) { toast(t.notHeated(name, s.code, heatName(k))); S.code = s.code; S.view = 'sample'; S.via = null; render(); return; }
  S.rid = r.rid;
  if (runPhase(r) === 'heating') { S.modal = { type: 'early', code: s.code, k, h: h.id, rid: r.rid }; render(); return; }
  goTest(s.code, k);
}
function loadScan(h) {
  const t = B(), L = S.load, oven = PLACES[L.place].kind === 'oven';
  if (!PLACES[L.place].tests.includes(h.test)) { toast(t.wrongTest(placeName(L.place), lbl(h.test))); return; }
  if (oven) {
    if (!waitingFor('MC').some(x => x.h === h.id)) { toast(t.notWaiting(hName(h.id))); return; }
    if (L.items.includes(h.id)) return;
    if (L.items.length >= CAP.MC) { toast(t.full(CAP.MC)); return; }
    L.items.push(h.id); render(); toast(hName(h.id) + ' ✓', true); return;
  }
  if (!waitingFor(h.test, h.tray).length) { toast(t.noTray); return; }
  L.tray = h.tray; L.out = {}; L.said = ''; render();
}
function startRun() {
  const L = S.load, its = loadItems(); if (!loadReady()) return;
  const k = PLACES[L.place].kind === 'oven' ? 'MC' : hInfo(L.tray).test;
  const mins = Math.max(1, Math.round(Number((document.getElementById('bmins') || {}).value) || MINS[k]));
  const rid = `${Date.now()}-${L.place}`;
  enqueue({ action: 'runStart', rid, place: L.place, test: k, tray: L.tray, items: its, mins, worker: S.worker });
  S.rid = rid; S.load = null; S.view = 'run'; render(); toast(B().started(placeName(L.place)), true);
}

/* ---------- taps ---------- */
function batchAct(el) {
  const r = S.rid && runBy(S.rid);
  switch (el.dataset.act) {
    case 'scan': openScanner('any'); return true;
    case 'scan-close': closeScanner(); return true;
    case 'scan-typed': scanTyped(); return true;
    case 'type-open': { const v = (document.getElementById('typecode') || {}).value; if (v && v.trim()) onScan(v.trim(), 'any'); return true; }
    case 'r-open': S.rid = el.dataset.rid; S.view = 'run'; render(); return true;
    case 'r-out': if (r && confirmTap(el)) { enqueue({ action: 'runOut', rid: r.rid, worker: S.worker }); render(); } return true;
    case 'r-cancel': if (r && confirmTap(el)) { enqueue({ action: 'runCancel', rid: r.rid, worker: S.worker }); S.view = 'home'; render(); } return true;
    case 'r-start': startRun(); return true;
    case 'l-scan': openScanner('load'); return true;
    case 'l-all': S.load.items = waitingFor('MC').map(x => x.h).slice(0, CAP.MC); render(); return true;
    case 'l-drop': S.load.items = S.load.items.filter(x => x !== el.dataset.h); render(); return true;
    case 'l-tray': S.load.tray = el.dataset.tray; S.load.out = {}; S.load.said = ''; render(); return true;
    case 'l-out': { const p = el.dataset.pos; S.load.out[p] = !S.load.out[p]; render(); return true; }
    case 'free-yes': {
      const m = S.modal; S.modal = null;
      if (m) { enqueue({ action: 'runOut', rid: m.rid, worker: S.worker }); openLoad(m.place); } else render();
      return true;
    }
    case 'early-yes': { const m = S.modal; S.modal = null; if (m) { S.rid = m.rid; goTest(m.code, m.k); } else render(); return true; }
    case 'add-scanned': {
      const c = S.modal && S.modal.code; S.modal = null;
      if (c) { enqueue({ action: 'addCodes', codes: [c], worker: S.worker }); S.code = c; S.view = 'sample'; }
      render(); return true;
    }
  }
  return false;
}
// typing the count on the load screen: update the note and the start button only, so the keyboard stays open
function loadInput(el) {
  if (el.id !== 'lsaid' || !S.load) return false;
  S.load.said = el.value.trim();
  const note = document.getElementById('lnote'); if (note) note.innerHTML = loadNote();
  const go = document.querySelector('[data-act="r-start"]'); if (go) go.disabled = !loadReady();
  return true;
}
function renderMoved(m) {
  return `<div class="modal" style="${cvar(m.test)}"><div class="sheet" role="dialog" aria-modal="true">
    <p class="instr" style="color:var(--err)">⚠ ${esc(m.msg)}</p>
    <div class="btnrow"><button class="primary" data-act="cancel">OK</button></div></div></div>`;
}
function renderFreePlace(m) {
  const t = B(), r = runBy(m.rid);
  return `<div class="modal"><div class="sheet" role="dialog" aria-modal="true">
    <p class="instr">${esc(t.freeAsk(placeName(m.place), r ? (r.test === 'MC' ? t.dishes(waitCount(r)) : t.crucibles(waitCount(r))) : ''))}</p>
    <div class="btnrow"><button class="secondary" data-act="cancel">${esc(t.close)}</button>
      <button class="primary" data-act="free-yes">${esc(t.freeYes)}</button></div></div></div>`;
}
function renderEarly(m) {
  const t = B(), r = runBy(m.rid);
  return `<div class="modal" style="${cvar(m.k)}"><div class="sheet" role="dialog" aria-modal="true">
    <p class="instr">${esc(t.early(hName(m.h), m.code, r ? placeName(r.place) : '', r ? minsLeft(r) : 0))}</p>
    <div class="btnrow"><button class="secondary" data-act="cancel">${esc(t.close)}</button>
      <button class="primary" data-act="early-yes">${esc(t.earlyYes)}</button></div></div></div>`;
}
function renderAddCode(m) {
  const t = B();
  return `<div class="modal"><div class="sheet" role="dialog" aria-modal="true">
    <p class="instr">${esc(t.unknown(m.code))}</p>
    <div class="btnrow"><button class="secondary" data-act="cancel">${esc(t.close)}</button>
      <button class="primary" data-act="add-scanned">${esc(t.addCode(m.code))}</button></div></div></div>`;
}
