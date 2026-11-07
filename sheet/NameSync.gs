/**
 * Name Tags → GitHub (names.json) for the Proximate Weighing app.
 *
 * Paste this into the Google Sheet that has the "Name Tags" tab:
 *   Extensions → Apps Script → replace everything → Save.
 * Then reload the sheet and use the new menu "Weighing app":
 *   1. Set GitHub key      (paste the same github_pat_… key the phones use)
 *   2. Sync names now      (first run asks for permission — allow it)
 *   3. Turn on auto-sync   (every 15 minutes, even when the sheet is closed)
 *   4. Update results now  (checks the key can start the results job)
 *
 * Auto-sync also starts the results job (results.json, retest.json, retest.csv)
 * every 15 minutes from 07:30 to 21:30 IST, because GitHub's own timer is unreliable.
 * Names and results go to every repository in CFG.repos: weighing_data_QR (the QR app,
 * girish-vastrakar/weighing-beta) and weighing-data (the old app, while it is still used).
 * So the key needs, on both repositories: "Contents: Read and write" and "Actions: Read and write".
 *
 * The tab needs a header row with these titles (any order, any row in the top 10):
 *   Local Code | Sample Name | Date | Supplier | Machine
 * Machine is W1, W2, W3, W4 or ALL (several allowed, e.g. "W1, W3"); the app shows each
 * phone only the samples for the machine chosen in its Setup. Blank = every machine.
 * Other columns (e.g. Product Of) are ignored.
 * Optional: "Tests" (blank = all three, or e.g. "VM") and "Job batch" (filled by "Assign today's jobs",
 * see JobAssigner.gs) also go to the app, so the labels page puts the same samples on the three cards.
 * "Retest of" (the first code) also goes to the app: when the two results agree, a flagged result is approved by itself.
 */

const CFG = {
  tab: 'Name Tags',
  owner: 'girish-vastrakar',
  repos: ['weighing_data_QR', 'weighing-data'],   // drop 'weighing-data' once the old app is no longer used
  path: 'names.json',
  branch: 'main',
  tz: 'Asia/Kolkata',
  workflow: 'results.yml',
  // Start the results job only in lab hours (IST, minutes from midnight) to stay inside
  // the free Actions minutes of a private repo
  resultsFrom: 7 * 60 + 30,
  resultsTo: 21 * 60 + 30,
  // Header titles to look for (lower-case; first match wins)
  cols: {
    code:     ['local code', 'code', 'sample code'],
    name:     ['sample name', 'name'],
    date:     ['date', 'sample date', 'date received'],
    supplier: ['supplier', 'supplier name'],
    machine:  ['machine', 'weighing machine', 'machine no', 'machine no.'],
    batch:    ['job batch'],          // written by "Assign today's jobs" (JobAssigner.gs)
    tests:    ['tests'],              // blank = all three; e.g. "VM" or "Ash, VM" for a retest
    retestOf: ['retest of', 'original code'],  // the first code, so the app can check the retest agrees with it
  },
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Weighing app')
    .addItem('1. Set GitHub key', 'setKey')
    .addItem('2. Sync names now', 'syncNow')
    .addItem('3. Turn on auto-sync (every 15 min)', 'turnOnAutoSync')
    .addItem('4. Update results now', 'resultsNow')
    .addSeparator()
    .addItem('Assign today\'s jobs', 'assignToday')
    .addItem('Send assignment to phones', 'sendAssignment')
    .addItem('Set up the Today tab', 'setupToday')
    .addSeparator()
    .addItem('Turn off auto-sync', 'turnOffAutoSync')
    .addToUi();
}

function setKey() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('GitHub key', 'Paste the github_pat_… key (same one the phones use):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const key = r.getResponseText().trim();
  if (!/^(github_pat_|ghp_)/.test(key)) { ui.alert('That does not look like a GitHub key. Nothing saved.'); return; }
  PropertiesService.getScriptProperties().setProperty('GH_KEY', key);
  CFG.repos.forEach(repo => PropertiesService.getScriptProperties().deleteProperty('LAST_HASH_' + repo));
  ui.alert('Key saved. Now click "2. Sync names now".');
}

function syncNow() {
  const res = syncNames_(true);
  SpreadsheetApp.getUi().alert(res);
}

function turnOnAutoSync() {
  turnOffAutoSync_();
  ScriptApp.newTrigger('autoSync').timeBased().everyMinutes(15).create();
  SpreadsheetApp.getUi().alert('Auto-sync is ON. Names go to the app and results are updated every 15 minutes.');
}
function turnOffAutoSync() {
  turnOffAutoSync_();
  SpreadsheetApp.getUi().alert('Auto-sync is OFF.');
}
function turnOffAutoSync_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'autoSync').forEach(t => ScriptApp.deleteTrigger(t));
}

function resultsNow() {
  SpreadsheetApp.getUi().alert(runResults_(true));
}

/** Runs from the 15-minute trigger. Only writes names when they changed, then starts the results job. */
function autoSync() {
  try { syncNames_(false); } finally { runResults_(false); }
  try { refreshStatus_(); } catch (e) { /* the status column is only a help; try again next time */ }
}

/** Starts the results workflow on GitHub. It commits results.json, retest.json and retest.csv only when they change. */
function runResults_(force) {
  const key = PropertiesService.getScriptProperties().getProperty('GH_KEY');
  if (!key) return 'No GitHub key yet. Use "1. Set GitHub key" first.';
  const hm = Utilities.formatDate(new Date(), CFG.tz, 'H:m').split(':');
  const mins = +hm[0] * 60 + +hm[1];
  if (!force && (mins < CFG.resultsFrom || mins > CFG.resultsTo)) return 'Outside lab hours.';
  return CFG.repos.map(repo => repo + ': ' + runResultsIn_(repo, key)).join('\n');
}
function runResultsIn_(repo, key) {
  const url = 'https://api.github.com/repos/' + CFG.owner + '/' + repo + '/actions/workflows/' + CFG.workflow + '/dispatches';
  const r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: JSON.stringify({ ref: CFG.branch }) });
  const code = r.getResponseCode();
  if (code === 204) return 'Results job started. results.json, retest.json and retest.csv update in about a minute (only if something changed).';
  if (code === 403 || code === 404) return 'GitHub refused (' + code + '). The key needs "Actions: Read and write" on ' + repo + '.';
  return 'GitHub error ' + code + ': ' + r.getContentText().slice(0, 200);
}

/* ------------------------------------------------------------------ */

function syncNames_(force) {
  const key = PropertiesService.getScriptProperties().getProperty('GH_KEY');
  if (!key) return 'No GitHub key yet. Use "1. Set GitHub key" first.';

  const names = readNames_();
  const count = Object.keys(names).length;
  if (!count) return 'No rows found in "' + CFG.tab + '". Check the tab name and the header row (Local Code, Sample Name, Date, Supplier).';
  return CFG.repos.map(repo => repo + ': ' + syncNamesTo_(repo, key, names, count, force)).join('\n');
}

/** Writes names.json to one repository, only when the names changed since the last write there. */
function syncNamesTo_(repo, key, names, count, force) {
  const body = JSON.stringify(names);
  const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, body, Utilities.Charset.UTF_8));
  const props = PropertiesService.getScriptProperties();
  const hashKey = 'LAST_HASH_' + repo;
  if (!force && props.getProperty(hashKey) === hash) return 'No changes.';

  const file = {
    app: 'proximate-weighing-names',
    updated: Utilities.formatDate(new Date(), CFG.tz, "yyyy-MM-dd'T'HH:mm:ss'+05:30'"),
    source: SpreadsheetApp.getActive().getName() + ' / ' + CFG.tab,
    count: count,
    names: names,
  };
  const url = 'https://api.github.com/repos/' + CFG.owner + '/' + repo + '/contents/' + CFG.path;
  const headers = { Authorization: 'Bearer ' + key, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

  for (let attempt = 0; attempt < 3; attempt++) {
    // Current version (sha) of names.json, if it exists
    let sha = null;
    const g = UrlFetchApp.fetch(url + '?ref=' + CFG.branch, { headers: headers, muteHttpExceptions: true });
    if (g.getResponseCode() === 200) {
      const meta = JSON.parse(g.getContentText());
      sha = meta.sha;
      // Same names already on GitHub? Then nothing to write.
      try {
        const old = JSON.parse(Utilities.newBlob(Utilities.base64Decode(meta.content.replace(/\s/g, ''))).getDataAsString('UTF-8'));
        if (JSON.stringify(old.names) === body) { props.setProperty(hashKey, hash); return 'Already up to date (' + count + ' codes).'; }
      } catch (e) { /* write anyway */ }
    } else if (g.getResponseCode() === 401 || g.getResponseCode() === 403) {
      return 'GitHub refused the key (' + g.getResponseCode() + '). Set the key again.';
    } else if (g.getResponseCode() !== 404) {
      return 'GitHub error ' + g.getResponseCode() + ': ' + g.getContentText().slice(0, 200);
    }

    const put = { message: 'Names from sheet (' + count + ' codes)', branch: CFG.branch,
                  content: Utilities.base64Encode(JSON.stringify(file, null, 1), Utilities.Charset.UTF_8) };
    if (sha) put.sha = sha;
    const p = UrlFetchApp.fetch(url, { method: 'put', headers: headers, contentType: 'application/json',
                                       payload: JSON.stringify(put), muteHttpExceptions: true });
    const code = p.getResponseCode();
    if (code === 200 || code === 201) { props.setProperty(hashKey, hash); return 'Done: ' + count + ' codes sent to the app.'; }
    if (code !== 409 && code !== 422) return 'GitHub error ' + code + ': ' + p.getContentText().slice(0, 200);
    Utilities.sleep(1500);   // someone else wrote at the same moment — read again and retry
  }
  return 'GitHub was busy. It will try again in 15 minutes.';
}

function readNames_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.tab);
  if (!sh) return {};
  const values = sh.getDataRange().getValues();
  const shown = sh.getDataRange().getDisplayValues();

  // Find the header row
  let hr = -1, idx = {};
  for (let r = 0; r < Math.min(10, values.length) && hr < 0; r++) {
    const row = shown[r].map(v => String(v).trim().toLowerCase());
    const found = {};
    Object.keys(CFG.cols).forEach(k => {
      for (const title of CFG.cols[k]) { const i = row.indexOf(title); if (i >= 0) { found[k] = i; break; } }
    });
    if (found.code !== undefined && (found.name !== undefined || found.date !== undefined)) { hr = r; idx = found; }
  }
  if (hr < 0) return {};

  const out = {};
  for (let r = hr + 1; r < values.length; r++) {
    const code = String(shown[r][idx.code] || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!code) continue;
    const item = {};
    if (idx.name !== undefined)     item.name = String(shown[r][idx.name] || '').trim();
    if (idx.supplier !== undefined) item.supplier = String(shown[r][idx.supplier] || '').trim();
    if (idx.date !== undefined)     item.date = toISO_(values[r][idx.date], shown[r][idx.date]);
    if (idx.machine !== undefined)  item.machine = String(shown[r][idx.machine] || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (idx.batch !== undefined && +shown[r][idx.batch] > 0) item.batch = +shown[r][idx.batch];
    if (idx.tests !== undefined)    item.tests = String(shown[r][idx.tests] || '').trim();
    if (idx.retestOf !== undefined) item.retestOf = String(shown[r][idx.retestOf] || '').trim().toUpperCase().replace(/\s+/g, '');
    Object.keys(item).forEach(k => { if (!item[k]) delete item[k]; });
    if (Object.keys(item).length) out[code] = item;   // later rows win if a code repeats
  }
  return out;
}

/** Date cell → "yyyy-MM-dd". Text dates are read as day/month/year (Indian format). */
function toISO_(raw, shown) {
  if (raw instanceof Date && !isNaN(raw)) return Utilities.formatDate(raw, CFG.tz, 'yyyy-MM-dd');
  const s = String(shown || raw || '').trim();
  let m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? m[0] : s;
}
