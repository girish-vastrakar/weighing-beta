/**
 * Daily job assigner for the Proximate Weighing app. Goes in the SAME Apps Script project as NameSync.gs
 * (Extensions → Apps Script → + → Script, name it JobAssigner, paste this, Save). It uses NameSync's CFG,
 * GitHub key and menu.
 *
 * Every morning the supervisor:
 *   1. fills the "Today" tab: which balances work today, the worker at each, how many batches each does
 *   2. menu Weighing app → Assign today's jobs  (fills Machine, Job batch, Assigned on, Job status in Name Tags
 *      and writes the "Plan" tab)
 *   3. checks the Plan tab (to move a sample: change its Machine and Job batch cells)
 *   4. menu Weighing app → Send assignment to phones
 *   5. labels page → Fill → Save and print, for each balance: the same 10 samples are on its Moisture, Ash and VM cards.
 *
 * Rules (agreed with Girish 2026-11-01):
 *   - Order: retests first, then Jumbo bag samples, then oldest Date, then code number.
 *   - One sample = one balance for all its tests. A batch = 10 samples (the Ash card).
 *   - Batches go round the working balances (W1 batch 1, W2 batch 1, W1 batch 2 …).
 *   - A retest goes to a different balance from the one that weighed the first test ("Retest of" column).
 *   - Samples already on a card, being weighed or done are never moved.
 *   - Samples the script assigned on an earlier day but never put on a card go back to the pool.
 *   - A Machine typed by hand (no "Assigned on") is kept and gets a batch on that balance.
 *
 * Name Tags columns the script adds at the end of the header row when missing:
 *   Bag (type Jumbo for jumbo bag samples) · Tests (blank = all three, or e.g. "VM") · Retest of (the first code)
 *   · Job batch · Assigned on · Job status
 * Jumbo is also recognised from "Jumbo" or "-JB<number>" in the sample name or supplier,
 * and a retest from "Retest" or " R<number>" in the name or supplier.
 */

const JA = {
  today: 'Today',
  plan: 'Plan',
  batchSize: 10,
  tests: ['MC', 'ASH', 'VM'],
  balances: [1, 2, 3, 4],
  // extra Name Tags columns (lower-case titles; first match wins). The first title is the one created.
  cols: {
    bag:      ['bag', 'bag type'],
    tests:    ['tests'],
    retestOf: ['retest of', 'original code'],
    batch:    ['job batch'],
    assigned: ['assigned on'],
    status:   ['job status'],
  },
  titles: { bag: 'Bag', tests: 'Tests', retestOf: 'Retest of', batch: 'Job batch', assigned: 'Assigned on', status: 'Job status' },
};

/* ------------------------------ menu actions ------------------------------ */

function setupToday() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(JA.today);
  if (!sh) sh = ss.insertSheet(JA.today);
  if (String(sh.getRange('A1').getValue()).trim().toLowerCase() !== 'balance') {
    sh.clear();
    sh.getRange(1, 1, 5, 4).setValues([
      ['Balance', 'Working today', 'Worker', 'Batches today'],
      ['W1', 'Yes', '', 2], ['W2', 'Yes', '', 2], ['W3', 'No', '', 2], ['W4', 'No', '', 2]]);
    sh.getRange(1, 1, 1, 4).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  sh.getRange('B2:B5').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Yes', 'No'], true).build());
  sh.getRange('D2:D5').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(0, 20).build());
  try {
    const workers = ((readData_().settings || {}).workers || []).map(w => w.name).filter(Boolean);
    if (workers.length) sh.getRange('C2:C5').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(workers, true).setAllowInvalid(true).build());
  } catch (e) { /* worker list is only a help */ }
  ss.setActiveSheet(sh);
  SpreadsheetApp.getUi().alert('The Today tab is ready. Set who works today and how many batches, then use "Assign today\'s jobs".');
}

function assignToday() {
  const ui = SpreadsheetApp.getUi();
  let msg;
  try { msg = assign_(); } catch (e) { msg = 'Could not assign: ' + e.message; }
  ui.alert(msg);
}

function sendAssignment() {
  SpreadsheetApp.getUi().alert(syncNames_(true) + '\n\nNow open the labels page: for each balance, Fill, then Save and print.');
}

/* ------------------------------ the assigner ------------------------------ */

function assign_() {
  const today = Utilities.formatDate(new Date(), CFG.tz, 'yyyy-MM-dd');
  const work = readToday_();
  if (!work.length) return 'No balance is working in the "' + JA.today + '" tab (Working today = Yes, Batches today 1 or more). Use "Set up the Today tab" first.';

  const f = readData_();
  const t = readTags_();
  const st = sampleState_(f);

  // Batch slots, round the working balances: W1 #n, W2 #m, W1 #n+1 …
  const slots = [], most = Math.max.apply(null, work.map(w => w.batches));
  for (let i = 0; i < most; i++) work.forEach(w => { if (i < w.batches) slots.push({ bal: w.bal, batch: st.nextBatch(w.bal) + i, worker: w.worker, codes: [] }); });

  const rows = t.rows.map(r => Object.assign(r, { state: st.status(r.code, r.tests) }));
  const free = r => r.state === 'Waiting';
  const hand = rows.filter(r => free(r) && r.machine && !r.assigned);                 // typed by hand: keep the balance
  const pool = rows.filter(r => free(r) && (!r.machine || r.assigned));               // blank, or assigned by the script before
  const notes = [];

  // 1. hand-typed machines: into that balance's batches
  sortPriority_(hand).forEach(r => {
    const b = balOf_(r.machine);
    const s = slots.find(x => x.bal === b && x.codes.length < JA.batchSize);
    if (s) { s.codes.push(r.code); r.out = { bal: b, batch: s.batch }; }
    else { r.out = { keep: true }; notes.push(r.code + ' stays on ' + r.machine + ' (typed by hand) but ' + (work.some(w => w.bal === b) ? 'its batches are full' : r.machine + ' is not working today') + '.'); }
  });

  // 2. the pool, by priority; a retest avoids the balance of its first test
  let left = [];
  sortPriority_(pool).forEach(r => {
    const avoid = r.retest ? st.balanceOf(r.retestOf) : null;
    let s = slots.find(x => x.codes.length < JA.batchSize && x.bal !== avoid);
    if (!s && avoid) {
      s = slots.find(x => x.codes.length < JA.batchSize);
      if (s) notes.push(r.code + ' is a retest of ' + r.retestOf + ' but goes to the same balance W' + avoid + ': no other balance has room.');
    }
    if (s) { s.codes.push(r.code); r.out = { bal: s.bal, batch: s.batch }; }
    else { r.out = { clear: true }; left.push(r.code); }
  });

  // 3. write the columns
  t.write(rows, today);

  // 4. the Plan tab
  writePlan_(today, slots, left, notes, rows);
  const n = slots.reduce((a, s) => a + s.codes.length, 0);
  return n + ' samples assigned in ' + slots.filter(s => s.codes.length).length + ' batches. ' +
    (left.length ? left.length + ' wait for another day (no room). ' : '') +
    'Check the "' + JA.plan + '" tab, then use "Send assignment to phones".';
}

/** Retests first, then Jumbo, then oldest date, then code number. */
function sortPriority_(list) {
  return list.slice().sort((a, b) => (b.retest - a.retest) || (b.jumbo - a.jumbo) ||
    String(a.date || '9999').localeCompare(String(b.date || '9999')) || codeNum_(a.code) - codeNum_(b.code));
}
const codeNum_ = c => +((String(c).match(/\d+/) || [0])[0]);
const balOf_ = m => { const x = /W([1-4])/.exec(String(m || '').toUpperCase()); return x ? +x[1] : null; };

function readToday_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(JA.today);
  if (!sh) return [];
  return sh.getDataRange().getDisplayValues().slice(1)
    .map(r => ({ bal: balOf_(r[0]), on: /^y/i.test(String(r[1]).trim()), worker: String(r[2] || '').trim(), batches: Math.max(0, Math.floor(+r[3] || 0)) }))
    .filter(w => w.bal && w.on && w.batches > 0);
}

/** data.json from the app's repository (needs the GitHub key set in NameSync). */
function readData_() {
  const key = PropertiesService.getScriptProperties().getProperty('GH_KEY');
  if (!key) throw new Error('No GitHub key yet. Use "1. Set GitHub key" first.');
  const url = 'https://api.github.com/repos/' + CFG.owner + '/' + CFG.repos[0] + '/contents/data.json?ref=' + CFG.branch;
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (r.getResponseCode() !== 200) throw new Error('GitHub error ' + r.getResponseCode() + ' reading data.json.');
  return JSON.parse(r.getContentText());
}

/** What the app knows about each code: status, balance of its first weighing, next batch number per balance. */
function sampleState_(f) {
  const samples = f.samples || {}, cards = f.cards || {};
  const on = {};
  Object.keys(cards).forEach(tr => (cards[tr].codes || []).forEach(c => { if (c) on[c + '|' + cards[tr].test] = true; }));
  const w = (c, k) => { const s = samples[c]; return (s && s.w && s.w[k]) || []; };
  const started = (c, k) => w(c, k)[0] != null, done = (c, k) => w(c, k)[2] != null;
  // Codes older than the newest started one that never came into this app were weighed in the old app
  const here = {}; (f.codes || []).forEach(c => { here[c] = true; });
  const floor = Math.max.apply(null, [0].concat((f.codes || []).filter(c => JA.tests.some(k => started(c, k))).map(codeNum_)));
  return {
    status(c, tests) {
      if (!here[c] && codeNum_(c) <= floor) return '';
      const ks = JA.tests.filter(k => !tests || tests.indexOf(k) >= 0);
      if (ks.every(k => done(c, k))) return 'Done';
      if (ks.some(k => started(c, k))) return 'Weighing';
      if (ks.some(k => on[c + '|' + k])) return 'On card';
      return 'Waiting';
    },
    balanceOf(c) {
      const ev = ((samples[c] || {}).ev || []).filter(e => e.a === 'w' && e.b);
      return ev.length ? +ev[0].b : null;
    },
    nextBatch(bal) {
      return 1 + Math.max.apply(null, [0].concat(Object.keys(cards).map(k => cards[k]).filter(j => +j.bal === bal).map(j => +j.batch || 0)));
    },
  };
}

/** Name Tags rows + a writer for Machine, Job batch, Assigned on, Job status. Adds missing columns. */
function readTags_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.tab);
  if (!sh) throw new Error('No "' + CFG.tab + '" tab.');
  const all = Object.assign({}, CFG.cols, JA.cols);
  let shown = sh.getDataRange().getDisplayValues();
  let hr = -1, idx = {};
  for (let r = 0; r < Math.min(10, shown.length) && hr < 0; r++) {
    const row = shown[r].map(v => String(v).trim().toLowerCase());
    if (CFG.cols.code.some(t => row.indexOf(t) >= 0)) {
      hr = r;
      Object.keys(all).forEach(k => { for (const t of all[k]) { const i = row.indexOf(t); if (i >= 0) { idx[k] = i; break; } } });
    }
  }
  if (hr < 0) throw new Error('No header row with "Local Code" in "' + CFG.tab + '".');
  // add missing columns at the end of the header row
  let last = sh.getLastColumn();
  const add = (k, title) => { if (idx[k] === undefined) { last++; sh.getRange(hr + 1, last).setValue(title).setFontWeight('bold'); idx[k] = last - 1; } };
  add('machine', 'Machine');
  Object.keys(JA.titles).forEach(k => add(k, JA.titles[k]));
  shown = sh.getDataRange().getDisplayValues();
  const raw = sh.getDataRange().getValues();

  const testsOf = s => { const t = String(s || '').toUpperCase().split(/[^A-Z]+/).map(x => (x === 'MOISTURE' || x === 'MT') ? 'MC' : x).filter(x => JA.tests.indexOf(x) >= 0); return t.length ? t : null; };
  const rows = [];
  for (let r = hr + 1; r < shown.length; r++) {
    const g = k => idx[k] === undefined ? '' : String(shown[r][idx[k]] || '').trim();
    const code = g('code').toUpperCase().replace(/\s+/g, '');
    if (!code) continue;
    const text = g('name') + ' ' + g('supplier');
    const retestOf = g('retestOf').toUpperCase().replace(/\s+/g, '');
    rows.push({ r, code, machine: g('machine').toUpperCase(), assigned: toISO_(g('assigned'), g('assigned')), date: idx.date === undefined ? '' : toISO_(raw[r][idx.date], g('date')),
      tests: testsOf(g('tests')), retestOf,
      retest: retestOf || /retest|\sR\d+\b/i.test(text) ? 1 : 0,
      jumbo: /jumbo/i.test(g('bag')) || /jumbo|-JB\d/i.test(text) ? 1 : 0 });
  }

  return {
    rows,
    write(list, today) {
      const n = shown.length - hr - 1;
      if (n <= 0) return;
      const col = k => sh.getRange(hr + 2, idx[k] + 1, n, 1);
      const m = col('machine').getValues(), b = col('batch').getValues(), a = col('assigned').getValues(), s = col('status').getValues();
      list.forEach(x => {
        const i = x.r - hr - 1;
        s[i][0] = x.state;
        if (!x.out || x.out.keep) return;
        if (x.out.clear) { if (x.assigned) { m[i][0] = ''; a[i][0] = ''; } b[i][0] = ''; return; }
        m[i][0] = 'W' + x.out.bal; b[i][0] = x.out.batch; a[i][0] = x.machine && !x.assigned ? '' : today;
      });
      col('assigned').setNumberFormat('@');
      col('machine').setValues(m); col('batch').setValues(b); col('assigned').setValues(a); col('status').setValues(s);
    },
    writeStatus(list) {
      const n = shown.length - hr - 1;
      if (n <= 0) return;
      const rng = sh.getRange(hr + 2, idx.status + 1, n, 1), s = rng.getValues();
      list.forEach(x => { s[x.r - hr - 1][0] = x.state; });
      rng.setValues(s);
    },
  };
}

/** Job status column only. Runs with auto-sync every 15 minutes. */
function refreshStatus_() {
  if (!PropertiesService.getScriptProperties().getProperty('GH_KEY')) return;
  const t = readTags_(), st = sampleState_(readData_());
  t.writeStatus(t.rows.map(r => Object.assign(r, { state: st.status(r.code, r.tests) })));
}

function writePlan_(today, slots, left, notes, rows) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(JA.plan) || ss.insertSheet(JA.plan);
  sh.clear();
  const byCode = {}; rows.forEach(r => { byCode[r.code] = r; });
  const tag = c => { const r = byCode[c]; return c + (r.retest ? ' (retest)' : r.jumbo ? ' (jumbo)' : ''); };
  const out = [['Plan for ' + today, '', '', '', ''], ['Balance', 'Batch', 'Worker', 'Samples', 'Codes']];
  slots.filter(s => s.codes.length).forEach(s => out.push(['W' + s.bal, s.batch, s.worker, s.codes.length, s.codes.map(tag).join(', ')]));
  out.push(['', '', '', '', '']);
  out.push(['Waiting for another day', '', '', left.length, left.join(', ')]);
  notes.forEach(n => out.push(['Note', '', '', '', n]));
  sh.getRange(1, 1, out.length, 5).setValues(out);
  sh.getRange('A1').setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1, 1, 5).setFontWeight('bold');
  sh.setColumnWidth(5, 600);
  sh.getRange(1, 5, out.length, 1).setWrap(true);
  ss.setActiveSheet(sh);
}
