/* ====== BETA: QR scanning, automatic batches and the job card ======
   Flow: scan the sample's QR → choose the test → W1, W2 as before.
   Saving W2 puts the sample in the next free slot of this machine's open batch for that test.
   A full batch (or one started early) is loaded by scanning the oven / furnace QR, ticking C for each slot in order.
   When the time is up, scanning the same oven / furnace QR walks through the slots in order for W3 (A ticks).

   Batches live in data.json as batches[bid] and change only through queued jobs (batchAdd, batchLoad, ...),
   so they sync and merge the same way as weights.
   Loaded before the main script: only declarations here, nothing that runs at load time. */

const CAP = { MC: 12, VM: 18, ASH: 10 };          // slots per batch (Total Moisture is not batched)
const COLS = { MC: 3, VM: 3, ASH: 2 };            // job card layout, numbered down each column like the paper card
const MINS = { MC: 60, VM: 7, ASH: 60 };          // default heating time
const PLACES = {
  O1: { tests: ['MC'], kind: 'oven' }, O2: { tests: ['MC'], kind: 'oven' },
  F1: { tests: ['VM', 'ASH'], kind: 'furnace' }, F2: { tests: ['VM', 'ASH'], kind: 'furnace' }
};

const BL = {
  en: {
    scan: 'Scan QR', scanSub: 'sample, oven or furnace',
    typePh: 'No camera? Type the full code', open: 'Open',
    batches: 'Batches', noBatches: 'No batches yet. A batch starts by itself when W2 is saved.',
    finished: 'Finished in the last 12 hours', mine: 'this phone',
    filling: (n, c) => `Filling: ${n} of ${c}`, ready: 'Ready. Scan the oven or furnace to load',
    loading: p => `Loading into ${p}`, heating: (p, m) => `In ${p} · ${m} min left`,
    cool: p => `Time is up. Scan ${p} for W3`, weighing: p => `W3 going on · ${p}`, done: 'Done',
    card: 'Proximate analysis · job card', date: 'Date', batchNo: 'Batch No.', oven: 'Oven No.', furnace: 'Furnace No.',
    machine: 'Weighing Machine No.', name: 'Name', legend: 'C = charged in this order · A = afterweighed in this order',
    fewer: n => `Start with ${n} (don't wait for a full batch)`, fewerSub: 'Only if no more samples are coming soon.',
    scanLoad: 'Scan oven / furnace QR to load', putIn: 'Put the crucibles in the slot order shown above, close the door, then start the timer.',
    tapC: n => `Place slot ${n}, then tap it`, cOrder: n => `Place slot ${n} first`,
    start: m => `Door closed: start ${m} min timer`, minutes: 'minutes',
    unload: 'Take the batch out (loaded by mistake)',
    scanW3: p => `Scan ${p} QR for W3`, early: 'Time is not up. Weigh now anyway',
    left: m => `${m} min left`,
    wrongPlace: (got, want) => `This is ${got}. This batch is in ${want}.`,
    notFor: (p, t) => `${p} is not used for ${t}.`, busy: p => `${p} already has a batch in it.`,
    loaded: p => `Loaded into ${p}. Put the crucibles in the slot order shown.`,
    slotOf: (i, n, p) => `Slot ${i} of ${n} · ${p}`, batchDone: 'Batch finished. All W3 saved.',
    inBatch: (no, i) => `Waiting in batch ${no}, slot ${i}`,
    inPlace: (p, no, i) => `In ${p} (batch ${no}, slot ${i}). Scan ${p} for W3`,
    w3Locked: p => `W3 is entered from the batch: scan ${p} when the time is up.`,
    w3NotLoaded: no => `Batch ${no} is not in the oven / furnace yet.`,
    putSlot: (t, no, i) => `Put it in ${t} batch ${no}, slot ${i}.`,
    scanTitle: 'Point the camera at the QR code', close: 'Close',
    camFail: 'The camera did not open. Type the code below.', camWait: 'Starting camera…',
    unknown: c => `“${c}” is not a sample code in the list.`, addCode: c => `Add ${c} as a new sample`,
    otherMachine: (m, me) => `This sample is for ${m}. This phone is ${me}.`,
    placeFree: p => `${p} is empty. Load which batch?`, noneReady: p => `No batch is ready for ${p}.`,
    loadHere: 'Load here', gone: 'reset', wantPlace: 'Scan the oven or furnace QR, not a sample.',
    labels: 'Print QR labels',
    moved: (c, a, no, b) => `${c} moved from slot ${a} to batch ${no}, slot ${b}. Another phone saved first: move the dish.`
  },
  gu: {
    scan: 'QR સ્કેન કરો', scanSub: 'સેમ્પલ, ઓવન કે ફર્નેસ',
    typePh: 'કેમેરા નથી? પૂરો કોડ લખો', open: 'ખોલો',
    batches: 'બેચ', noBatches: 'હજુ કોઈ બેચ નથી. W2 સેવ થાય ત્યારે બેચ આપોઆપ બને છે.',
    finished: 'છેલ્લા 12 કલાકમાં પૂરી થયેલ', mine: 'આ ફોન',
    filling: (n, c) => `ભરાય છે: ${n} / ${c}`, ready: 'તૈયાર. લોડ કરવા ઓવન / ફર્નેસ સ્કેન કરો',
    loading: p => `${p} માં મૂકાય છે`, heating: (p, m) => `${p} માં · ${m} મિનિટ બાકી`,
    cool: p => `સમય પૂરો. W3 માટે ${p} સ્કેન કરો`, weighing: p => `W3 ચાલુ છે · ${p}`, done: 'પૂરું',
    card: 'પ્રોક્સિમેટ એનાલિસિસ · જોબ કાર્ડ', date: 'તારીખ', batchNo: 'બેચ નં.', oven: 'ઓવન નં.', furnace: 'ફર્નેસ નં.',
    machine: 'વજન કાંટા નં.', name: 'નામ', legend: 'C = આ ક્રમમાં મૂક્યું · A = આ ક્રમમાં વજન કર્યું',
    fewer: n => `${n} સાથે શરૂ કરો (પૂરી બેચની રાહ ન જુઓ)`, fewerSub: 'ફક્ત જો હમણાં વધુ સેમ્પલ આવવાના ન હોય.',
    scanLoad: 'લોડ કરવા ઓવન / ફર્નેસ નો QR સ્કેન કરો', putIn: 'ઉપર બતાવેલ ખાના ના ક્રમમાં ક્રુસિબલ મૂકો, દરવાજો બંધ કરો, પછી ટાઈમર શરૂ કરો.',
    tapC: n => `ખાનું ${n} મૂકો, પછી તેને ટેપ કરો`, cOrder: n => `પહેલા ખાનું ${n} મૂકો`,
    start: m => `દરવાજો બંધ: ${m} મિનિટ ટાઈમર શરૂ કરો`, minutes: 'મિનિટ',
    unload: 'બેચ પાછી કાઢો (ભૂલથી મૂકી)',
    scanW3: p => `W3 માટે ${p} નો QR સ્કેન કરો`, early: 'સમય પૂરો નથી. તો પણ હમણાં વજન કરો',
    left: m => `${m} મિનિટ બાકી`,
    wrongPlace: (got, want) => `આ ${got} છે. આ બેચ ${want} માં છે.`,
    notFor: (p, t) => `${p} ${t} માટે નથી.`, busy: p => `${p} માં પહેલેથી બેચ છે.`,
    loaded: p => `${p} માં લોડ થઈ. બતાવેલ ખાના ના ક્રમમાં ક્રુસિબલ મૂકો.`,
    slotOf: (i, n, p) => `ખાનું ${i} / ${n} · ${p}`, batchDone: 'બેચ પૂરી. બધા W3 સેવ થયા.',
    inBatch: (no, i) => `બેચ ${no}, ખાનું ${i} માં રાહ જુએ છે`,
    inPlace: (p, no, i) => `${p} માં (બેચ ${no}, ખાનું ${i}). W3 માટે ${p} સ્કેન કરો`,
    w3Locked: p => `W3 બેચ માંથી નાખો: સમય પૂરો થાય ત્યારે ${p} સ્કેન કરો.`,
    w3NotLoaded: no => `બેચ ${no} હજુ ઓવન / ફર્નેસ માં નથી.`,
    putSlot: (t, no, i) => `તેને ${t} બેચ ${no}, ખાનું ${i} માં મૂકો.`,
    scanTitle: 'કેમેરા QR કોડ તરફ રાખો', close: 'બંધ કરો',
    camFail: 'કેમેરા ખૂલ્યો નહીં. નીચે કોડ લખો.', camWait: 'કેમેરા શરૂ થાય છે…',
    unknown: c => `“${c}” યાદીમાં સેમ્પલ કોડ નથી.`, addCode: c => `${c} નવા સેમ્પલ તરીકે ઉમેરો`,
    otherMachine: (m, me) => `આ સેમ્પલ ${m} માટે છે. આ ફોન ${me} છે.`,
    placeFree: p => `${p} ખાલી છે. કઈ બેચ લોડ કરવી?`, noneReady: p => `${p} માટે કોઈ બેચ તૈયાર નથી.`,
    loadHere: 'અહીં લોડ કરો', gone: 'રીસેટ', wantPlace: 'સેમ્પલ નહીં, ઓવન કે ફર્નેસ નો QR સ્કેન કરો.',
    labels: 'QR લેબલ છાપો',
    moved: (c, a, no, b) => `${c} ખાનું ${a} થી બેચ ${no}, ખાનું ${b} માં ગયું. બીજા ફોને પહેલા સેવ કર્યું: ડિશ ખસેડો.`
  }
};
const B = () => BL[S.lang] || BL.en;
const PLACE_NAME = { en: { O1: 'Oven 1', O2: 'Oven 2', F1: 'Furnace 1', F2: 'Furnace 2' },
                     gu: { O1: 'ઓવન 1', O2: 'ઓવન 2', F1: 'ફર્નેસ 1', F2: 'ફર્નેસ 2' } };
const placeName = p => (PLACE_NAME[S.lang] || PLACE_NAME.en)[p] || p;

/* ---------- the data file side (runs on the merged copy while syncing, so no S here) ---------- */
function dayOf(ms) { const d = new Date(ms), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
// A slot is finished once its W3 is saved, or once it was taken out (the test was reset after loading)
function fileSlotOver(f, b, i) {
  const s = f.samples[b.slots[i]];
  return !!(b.out && b.out[i]) || !s || !s.w[b.test] || s.w[b.test][2] != null;
}
function fileBatchOver(f, b) { return !!b.place && b.slots.every((c, i) => fileSlotOver(f, b, i)); }
// Apply one batch job. Returns false for any other job.
function batchApply(f, j) {
  if (!/^batch/.test(j.action)) return false;
  const all = f.batches = f.batches || {}, b = j.bid ? all[j.bid] : null;
  if (j.action === 'batchAdd') {
    // already waiting in a batch: one not loaded yet, or a loaded one whose slot is not finished
    const busy = Object.values(all).some(x => x.test === j.key &&
      x.slots.some((c, i) => c === j.code && (!x.place || !fileSlotOver(f, x, i))));
    if (busy) return true;
    let open = Object.values(all).filter(x => x.test === j.key && x.machine === j.machine && !x.place && !x.ready && x.slots.length < CAP[j.key])
      .sort((a, c) => a.made - c.made)[0];
    if (!open) {
      const day = dayOf(j.at);
      const no = Object.values(all).filter(x => x.day === day && x.machine === j.machine && x.test === j.key).length + 1;
      const bid = `${day}-${j.machine}-${j.key}-${no}`;
      open = all[bid] = { bid, test: j.key, machine: j.machine, day, no: `${j.machine}-${no}`, made: j.at, madeBy: j.worker || '',
                          slots: [], out: [], c: [], ready: false, place: null, loadedAt: null, loadedBy: '', start: null, mins: null };
    }
    open.slots.push(j.code);
  } else if (j.action === 'batchRemove') {           // the test was reset
    Object.values(all).forEach(x => {
      if (x.test !== j.key) return;
      const i = x.slots.indexOf(j.code);
      if (i < 0) return;
      if (!x.place) { x.slots.splice(i, 1); if (!x.slots.length) delete all[x.bid]; }
      else if (!fileBatchOver(f, x)) { x.out = x.out || []; x.out[i] = true; }
    });
  } else if (!b) {
    return true;                                      // the batch is gone (e.g. emptied on another phone)
  } else if (j.action === 'batchReady') {
    b.ready = true;
  } else if (j.action === 'batchLoad') {
    if (!b.place) { b.place = j.place; b.ready = true; b.loadedAt = j.at; b.loadedBy = j.worker || ''; b.c = []; }
  } else if (j.action === 'batchC') {
    b.c = b.c || []; b.c[j.slot] = true;
  } else if (j.action === 'batchStart') {
    if (!b.start) { b.start = j.at; b.mins = j.mins; }
  } else if (j.action === 'batchUnload') {
    b.place = null; b.c = []; b.start = null; b.mins = null; b.loadedAt = null; b.loadedBy = '';
  }
  return true;
}

/* ---------- what the app shows ---------- */
const batches = () => (S.data && S.data.batches) || [];
const batchBy = bid => batches().find(b => b.bid === bid);
function slotSt(b, i) { const s = sample(b.slots[i]); return s ? s.tests[b.test] : null; }
function slotOut(b, i) { const st = slotSt(b, i); return !!(b.out && b.out[i]) || !st || (b.place ? st.done < 2 : false); }
function slotA(b, i) { const st = slotSt(b, i); return !!st && st.done === 3; }
function phase(b) {
  if (!b.place) return b.ready || b.slots.length >= CAP[b.test] ? 'ready' : 'filling';
  const live = b.slots.map((c, i) => i).filter(i => !slotOut(b, i));
  if (live.every(i => slotA(b, i))) return 'done';
  if (!b.start) return 'loading';
  if (live.some(i => slotA(b, i))) return 'weighing';
  return Date.now() < b.start + b.mins * 60000 ? 'heating' : 'cool';
}
const minsLeft = b => Math.max(0, Math.ceil((b.start + b.mins * 60000 - Date.now()) / 60000));
const placeBusy = p => batches().find(b => b.place === p && phase(b) !== 'done');
// The batch a sample's test is waiting in (not finished), with its slot
function slotOf(code, k) {
  for (const b of batches().slice().reverse()) {
    if (b.test !== k || phase(b) === 'done') continue;
    const i = b.slots.indexOf(code);
    if (i >= 0 && !(b.out && b.out[i]) && !slotA(b, i)) return { b, i };
  }
  return null;
}
function phaseText(b) {
  const t = B(), p = placeName(b.place), ph = phase(b);
  return ph === 'filling' ? t.filling(b.slots.length, CAP[b.test]) : ph === 'ready' ? t.ready : ph === 'loading' ? t.loading(p)
    : ph === 'heating' ? t.heating(p, minsLeft(b)) : ph === 'cool' ? t.cool(p) : ph === 'weighing' ? t.weighing(p) : t.done;
}

// After a W2 is saved: give the sample its slot. Returns the slot to show in the "saved" message.
function batchAfterW2(code, k) {
  if (!CAP[k]) return null;
  const st = sample(code).tests[k];
  if (st.done !== 2) return null;
  if (!slotOf(code, k)) enqueue({ action: 'batchAdd', code, key: k, machine: S.machine || 'ALL', worker: S.worker });
  return slotOf(code, k);
}

/* ---------- screens ---------- */
function batchRow(b) {
  const t = B(), ph = phase(b);
  return `<button class="testbtn batchrow ph-${ph}" style="${cvar(b.test)}" data-act="b-open" data-bid="${esc(b.bid)}">
    <div class="name">${esc(lbl(b.test))} · ${esc(t.batchNo)} ${esc(b.no)}${b.machine === (S.machine || 'ALL') ? ` <span class="mtag">${esc(t.mine)}</span>` : ''}</div>
    <div class="state">${esc(phaseText(b))}</div></button>`;
}
function renderHomeBeta() {
  const t = B(), live = [], old = [];
  batches().forEach(b => (phase(b) === 'done' ? old : live).push(b));
  const order = { cool: 0, weighing: 1, loading: 2, ready: 3, heating: 4, filling: 5 };
  live.sort((a, b) => order[phase(a)] - order[phase(b)] || a.made - b.made);
  const recent = old.filter(b => Date.now() - (b.start || b.made) < 12 * 3600000).sort((a, b) => b.made - a.made);
  return header() + `
    <button class="primary scanbig" data-act="scan"><span class="qr" aria-hidden="true">▣</span>${esc(t.scan)}<small>${esc(t.scanSub)}</small></button>
    <div class="typerow"><input class="field" id="typecode" type="text" autocomplete="off" autocapitalize="characters" placeholder="${esc(t.typePh)}">
      <button class="secondary" data-act="type-open">${esc(t.open)}</button></div>
    <button class="machline" data-act="setup">⚖ <b>${esc(S.machine || 'ALL')}</b></button>
    <h3 class="bhead">${esc(t.batches)}</h3>
    <div class="list">${live.length ? live.map(batchRow).join('') : `<div class="empty">${esc(t.noBatches)}</div>`}</div>
    ${recent.length ? `<h3 class="bhead">${esc(t.finished)}</h3><div class="list">${recent.map(batchRow).join('')}</div>` : ''}`;
}

function renderBatch() {
  const t = B(), b = batchBy(S.bid);
  if (!b) { S.view = 'home'; return renderHomeBeta(); }
  const ph = phase(b), n = b.slots.length, cap = CAP[b.test], cols = COLS[b.test], rows = Math.ceil(cap / cols);
  const slot = i => {
    const code = b.slots[i];
    if (!code) return `<div class="slot empty"><span class="sn">${i + 1}</span></div>`;
    const out = slotOut(b, i), a = slotA(b, i);
    return `<div class="slot${out ? ' out' : ''}${a ? ' w3' : ''}${S.walk && S.walk.bid === b.bid && S.code === code ? ' next' : ''}">
      <span class="sn">${i + 1}</span>${a ? '<span class="tk" aria-hidden="true">✓</span>' : ''}<span class="sc">${esc(code)}</span>${out ? `<span class="sg">${esc(t.gone)}</span>` : ''}</div>`;
  };
  let act = '';
  if (ph === 'filling') act = `<p class="sub">${esc(t.fewerSub)}</p><button class="secondary wide" data-act="b-ready">${esc(t.fewer(n))}</button>`;
  else if (ph === 'ready') act = `<button class="primary wide" data-act="b-scanload">▣ ${esc(t.scanLoad)}</button>`;
  else if (ph === 'loading') act = `<p class="instr">${esc(t.putIn)}</p><label class="mins">${esc(t.minutes)} <input id="bmins" type="number" inputmode="numeric" min="1" value="${MINS[b.test]}"></label>
         <button class="primary wide" data-act="b-start">${esc(t.start(MINS[b.test]))}</button>`;
  else if (ph === 'heating') act = `<div class="bigtime">${esc(t.left(minsLeft(b)))}</div>
      <button class="secondary wide" data-act="b-early">${esc(t.early)}</button>`;
  else if (ph === 'cool' || ph === 'weighing') act = `<button class="primary wide" data-act="b-scanw3">▣ ${esc(t.scanW3(placeName(b.place)))}</button>`;
  if (ph === 'loading' || ph === 'heating') act += `<button class="link center" data-act="b-unload">${esc(t.unload)}</button>`;
  const pk = PLACES[b.place] || PLACES[b.test === 'MC' ? 'O1' : 'F1'];
  return `<div style="${cvar(b.test)}">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <button class="back" data-act="home">${esc(T().allSamples)}</button>${langBtn()}</div>
    <div class="jobcard">
      <p class="jk">${esc(t.card)}</p>
      <h2 class="title">${esc(lbl(b.test))}</h2>
      <div class="jf">
        <span>${esc(t.date)}<b>${esc(fmtDate(b.day))}</b></span><span>${esc(t.batchNo)}<b>${esc(b.no)}</b></span>
        <span>${esc(pk.kind === 'oven' ? t.oven : t.furnace)}<b>${esc(b.place ? placeName(b.place) : '—')}</b></span>
<span>${esc(t.machine)}<b>${esc(b.machine)}</b></span><span>${esc(t.name)}<b>${esc(b.loadedBy || b.madeBy || '—')}</b></span>
      </div>
      <p class="state ph-${ph}">${esc(phaseText(b))}</p>
      <div class="slots" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},auto)">
        ${Array.from({ length: cap }, (x, i) => slot(i)).join('')}</div>
    </div>
    <div class="bact">${act}</div></div>`;
}

// An empty oven / furnace was scanned on the home screen: which ready batch goes in?
function renderPlace() {
  const t = B(), p = S.place;
  const fit = batches().filter(b => phase(b) === 'ready' && PLACES[p].tests.includes(b.test))
    .sort((a, b) => (b.machine === (S.machine || 'ALL')) - (a.machine === (S.machine || 'ALL')) || a.made - b.made);
  return `<div style="display:flex;justify-content:space-between;align-items:center">
      <button class="back" data-act="home">${esc(T().allSamples)}</button>${langBtn()}</div>
    <h2 class="title">${esc(placeName(p))}</h2>
    <p class="sub">${esc(fit.length ? t.placeFree(placeName(p)) : t.noneReady(placeName(p)))}</p>
    <div class="list">${fit.map(b => `<div class="testrow">${batchRow(b)}
      <button class="resetbtn loadbtn" data-act="b-loadhere" data-bid="${esc(b.bid)}">${esc(t.loadHere)}</button></div>`).join('')}</div>`;
}

// Line under a test on the sample screen, for a test waiting in a batch
function batchStateText(code, k) {
  const at = slotOf(code, k); if (!at) return '';
  const ph = phase(at.b);
  return at.b.place && ph !== 'loading' ? B().inPlace(placeName(at.b.place), at.b.no, at.i + 1) : B().inBatch(at.b.no, at.i + 1);
}
// W3 of a batched test is only entered by scanning the oven / furnace. Returns a message when blocked.
function w3Blocked(code, k) {
  if (!CAP[k] || (S.walk && S.walk.code === code)) return '';
  const at = slotOf(code, k);
  if (!at) return '';
  return at.b.place ? B().w3Locked(placeName(at.b.place)) : B().w3NotLoaded(at.b.no);
}

/* ---------- two phones saving W2 at the same moment ----------
   The slot shown after W2 comes from this phone's copy. If another phone's W2 reached the batch first,
   the slot moves when the data syncs: say so loudly, so the dish is moved before loading. */
const SHOWN = {};
function checkSlots() {
  Object.keys(SHOWN).forEach(key => {
    const [code, k] = key.split('|'), at = slotOf(code, k);
    if (!at) { delete SHOWN[key]; return; }
    if (at.i !== SHOWN[key]) {
      const msg = B().moved(code, SHOWN[key] + 1, at.b.no, at.i + 1);
      if (S.modal) toast(msg); else { S.modal = { type: 'moved', msg, test: k }; render(); }
    }
    if (!Q.some(j => j.action === 'batchAdd' && j.code === code && j.key === k)) delete SHOWN[key];   // settled
    else SHOWN[key] = at.i;
  });
}

/* ---------- W3, slot by slot ---------- */
function walkNext(bid) {
  const b = batchBy(bid);
  const i = b ? b.slots.findIndex((c, x) => !slotOut(b, x) && !slotA(b, x)) : -1;
  if (i < 0) { S.walk = null; S.view = 'batch'; S.bid = bid; toast(B().batchDone, true); return false; }
  S.walk = { bid, i, code: b.slots[i] };
  S.code = b.slots[i]; S.test = b.test; S.step = 3; S.editing = false; S.draft = ''; S.modal = null; S.view = 'step';
  return true;
}
function walkBanner() {
  if (!S.walk || S.view !== 'step') return '';
  const b = batchBy(S.walk.bid); if (!b) return '';
  return `<div class="walk">${esc(B().slotOf(S.walk.i + 1, b.slots.length, placeName(b.place)))}<b>${esc(S.code)}</b></div>`;
}

/* ---------- reading QR codes ---------- */
function placeFromText(txt) {
  const m = String(txt).trim().toUpperCase().match(/^(?:PLACE:)?\s*(OVEN|FURNACE|O|F)\s*[-_ ]?\s*([12])$/);
  return m ? (m[1][0] + m[2]) : null;
}
function codeFromText(txt) {
  const raw = String(txt).trim(), up = raw.toUpperCase();
  const codes = S.data ? S.data.samples.map(s => s.code) : [];
  const hit = codes.find(c => c.toUpperCase() === up);
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
async function openScanner(purpose, bid) {
  closeScanner();
  const t = B(), el = scanEl();
  SCAN = { purpose, bid, stream: null, timer: null, det: null };
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
    if (!run.det && !window.jsQR) await new Promise((ok, bad) => { const s = document.createElement('script'); s.src = 'lib/jsQR.js'; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
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
      if (txt) { if (navigator.vibrate) navigator.vibrate(80); closeScanner(); onScan(txt, run.purpose, run.bid); return; }
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
  const { purpose, bid } = SCAN; closeScanner(); onScan(v, purpose, bid);
}

// What a scan (or a typed code) does, depending on where it was started
function onScan(txt, purpose, bid) {
  const t = B(), p = placeFromText(txt);
  if (purpose === 'load' || purpose === 'w3' || purpose === 'w3early') {
    if (!p) { toast(t.wantPlace); return; }
    const b = batchBy(bid); if (!b) return;
    if (purpose === 'load') return loadInto(b, p);
    if (b.place !== p) { toast(t.wrongPlace(placeName(p), placeName(b.place))); return; }
    return startW3(b, purpose === 'w3early');
  }
  if (p) {                                            // home: an oven / furnace
    const b = placeBusy(p);
    if (b && ['heating', 'cool', 'weighing'].includes(phase(b))) return startW3(b, false);
    if (b) { S.bid = b.bid; S.view = 'batch'; render(); return; }
    S.place = p; S.view = 'place'; render(); return;
  }
  const code = codeFromText(txt);
  if (!code) { S.modal = { type: 'addcode', code: String(txt).trim().toUpperCase().slice(0, 20) }; render(); return; }
  S.code = code; S.view = 'sample'; S.walk = null; render();
}
function loadInto(b, p) {
  const t = B();
  if (!PLACES[p].tests.includes(b.test)) { toast(t.notFor(placeName(p), lbl(b.test))); return; }
  const other = placeBusy(p);
  if (other && other.bid !== b.bid) { toast(t.busy(placeName(p))); return; }
  if (phase(b) !== 'ready') { S.bid = b.bid; S.view = 'batch'; render(); return; }
  enqueue({ action: 'batchLoad', bid: b.bid, place: p, worker: S.worker });
  S.bid = b.bid; S.view = 'batch'; render();
  toast(t.loaded(placeName(p)), true);
}
function startW3(b, early) {
  if (phase(b) === 'heating' && !early) { S.bid = b.bid; S.view = 'batch'; render(); toast(B().heating(placeName(b.place), minsLeft(b))); return; }
  walkNext(b.bid); render();
}

/* ---------- taps ---------- */
function batchAct(el) {
  const t = B(), b = S.bid && batchBy(S.bid);
  switch (el.dataset.act) {
    case 'scan': openScanner('any'); return true;
    case 'scan-close': closeScanner(); return true;
    case 'scan-typed': scanTyped(); return true;
    case 'type-open': { const v = (document.getElementById('typecode') || {}).value; if (v && v.trim()) onScan(v.trim(), 'any'); return true; }
    case 'b-open': S.bid = el.dataset.bid; S.view = 'batch'; render(); return true;
    case 'b-ready': if (b && confirmTap(el)) { enqueue({ action: 'batchReady', bid: b.bid, worker: S.worker }); render(); } return true;
    case 'b-scanload': if (b) openScanner('load', b.bid); return true;
    case 'b-loadhere': { const x = batchBy(el.dataset.bid); if (x) loadInto(x, S.place); return true; }
    case 'b-start': {
      if (!b) return true;
      const m = Math.max(1, Math.round(Number((document.getElementById('bmins') || {}).value) || MINS[b.test]));
      enqueue({ action: 'batchStart', bid: b.bid, mins: m, worker: S.worker }); render(); return true;
    }
    case 'b-unload': if (b && confirmTap(el)) { enqueue({ action: 'batchUnload', bid: b.bid, worker: S.worker }); render(); } return true;
    case 'b-scanw3': if (b) openScanner('w3', b.bid); return true;
    case 'b-early': if (b && confirmTap(el)) openScanner('w3early', b.bid); return true;
    case 'add-scanned': {
      const c = S.modal && S.modal.code; S.modal = null;
      if (c) { enqueue({ action: 'addCodes', codes: [c], worker: S.worker }); S.code = c; S.view = 'sample'; }
      render(); return true;
    }
  }
  return false;
}
function renderMoved(m) {
  return `<div class="modal" style="${cvar(m.test)}"><div class="sheet" role="dialog" aria-modal="true">
    <p class="instr" style="color:var(--err)">⚠ ${esc(m.msg)}</p>
    <div class="btnrow"><button class="primary" data-act="cancel">OK</button></div></div></div>`;
}
function renderAddCode(m) {
  const t = B();
  return `<div class="modal"><div class="sheet" role="dialog" aria-modal="true">
    <p class="instr">${esc(t.unknown(m.code))}</p>
    <div class="btnrow"><button class="secondary" data-act="cancel">${esc(t.close)}</button>
      <button class="primary" data-act="add-scanned">${esc(t.addCode(m.code))}</button></div></div></div>`;
}
