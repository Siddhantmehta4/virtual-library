// Virtual Library: Google Sheet <-> Supabase sync
// Script Properties needed: SUPABASE_URL, SYNC_TOKEN

const LIBRARY_TAB = 'Library';
const RECS_TAB = 'Recommendations';
const GENRES = ['Philosophy', 'Fiction', 'History', 'Self-Help', 'Non-Fiction', 'Biography',
  'Art & Creativity', 'Sci-Fi', 'Religion', 'Comedy', 'Finance'];
const STATUSES = ['read', 'reading', 'abandoned'];
const BOOK_FIELDS = ['title', 'author', 'genre', 'status', 'date_finished', 'rating', 'thoughts',
  'themes', 'emotion', 'favorite', 'isbn', 'cover_override', 'recommended_by'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Library')
    .addItem('Sync now', 'syncLibrary')
    .addItem('Turn on automatic sync (every 5 min)', 'setupAutoSync')
    .addItem('Update dropdowns', 'setupDropdowns')
    .addToUi();
}

function setupAutoSync() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncLibrary')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncLibrary').timeBased().everyMinutes(5).create();
  toast_('Automatic sync is on: every 5 minutes.');
}

// Genre and status dropdowns on the Library tab, matching the bookcase's bays.
function setupDropdowns() {
  const lib = SpreadsheetApp.getActive().getSheetByName(LIBRARY_TAB);
  if (!lib) return;
  const cols = headerMap_(lib.getRange(1, 1, 1, lib.getLastColumn()).getValues()[0]);
  const rows = Math.max(lib.getMaxRows() - 1, 1);
  const set = (field, list) => {
    if (cols[field] === undefined) return;
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
    lib.getRange(2, cols[field] + 1, rows, 1).setDataValidation(rule);
  };
  set('genre', GENRES);
  set('status', STATUSES);
  PropertiesService.getScriptProperties().setProperty('DROPDOWNS_V', '2');
  toast_('Dropdowns updated.');
}

function syncLibrary() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // a sync is already running
  try {
    const props = PropertiesService.getScriptProperties();
    const url = (props.getProperty('SUPABASE_URL') || '').replace(/\/+$/, '');
    const token = props.getProperty('SYNC_TOKEN');
    if (!url || !token) throw new Error('Missing SUPABASE_URL or SYNC_TOKEN in Script Properties.');

    if (props.getProperty('DROPDOWNS_V') !== '2') setupDropdowns();
    const ss = SpreadsheetApp.getActive();
    const tz = ss.getSpreadsheetTimeZone();
    const lib = ss.getSheetByName(LIBRARY_TAB);
    const recs = ss.getSheetByName(RECS_TAB);
    if (!lib) throw new Error('No tab named "' + LIBRARY_TAB + '".');

    // ---- read the Library tab ----
    const libData = lib.getDataRange().getValues();
    const libCols = headerMap_(libData[0]);
    if (libCols.title === undefined || libCols.author === undefined || libCols.sync_status === undefined) {
      throw new Error('Library tab needs title, author and sync_status headers.');
    }
    const books = [];
    for (let i = 1; i < libData.length; i++) {
      const row = libData[i];
      if (!String(row[libCols.title]).trim() || !String(row[libCols.author]).trim()) continue;
      const book = { row: i + 1 };
      BOOK_FIELDS.forEach(f => {
        if (libCols[f] === undefined) return;
        let v = row[libCols[f]];
        if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
        book[f] = v === null ? '' : v;
      });
      books.push(book);
    }

    // ---- read approvals from the Recommendations tab ----
    let recData = [[]], recCols = {}, approvals = [];
    if (recs) {
      recData = recs.getDataRange().getValues();
      recCols = headerMap_(recData[0]);
      for (let i = 1; i < recData.length; i++) {
        const id = String(recData[i][recCols.rec_id] || '').trim();
        const ap = String(recData[i][recCols.approved] || '').trim();
        if (id && ap) approvals.push({ rec_id: id, approved: ap });
      }
    }

    // ---- call the sync function ----
    const res = UrlFetchApp.fetch(url + '/functions/v1/sync-sheet', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-sync-token': token },
      payload: JSON.stringify({ books: books, approvals: approvals }),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    const body = JSON.parse(res.getContentText() || '{}');
    if (code !== 200) throw new Error('Sync failed (' + code + '): ' + (body.error || res.getContentText()));

    // ---- write statuses and suggestions back (only into blank cells) ----
    (body.rows || []).forEach(r => {
      if (r.sync_status) lib.getRange(r.row, libCols.sync_status + 1).setValue(r.sync_status);
      const s = r.suggested || {};
      Object.keys(s).forEach(f => {
        if (libCols[f] === undefined) return;
        const cell = lib.getRange(r.row, libCols[f] + 1);
        if (String(cell.getValue()).trim() === '') cell.setValue(s[f]);
      });
      const fix = r.replace || {};
      Object.keys(fix).forEach(f => {
        if (libCols[f] !== undefined) lib.getRange(r.row, libCols[f] + 1).setValue(fix[f]);
      });
    });

    // ---- add new recommendations to the sheet and email you ----
    if (recs && recCols.rec_id !== undefined) {
      const known = new Set(recData.slice(1).map(r => String(r[recCols.rec_id] || '').trim()));
      const fresh = (body.recommendations || []).filter(r => !known.has(r.id));
      fresh.forEach(r => {
        const out = new Array(recData[0].length).fill('');
        const set = (k, v) => { if (recCols[k] !== undefined) out[recCols[k]] = v; };
        set('submitted_at', new Date(r.created_at));
        set('recommender', r.recommender);
        set('title', r.title);
        set('author', r.author);
        set('note', r.note || '');
        set('rec_id', r.id);
        recs.appendRow(out);
      });
      const pending = fresh.filter(r => r.status === 'pending');
      if (pending.length) notify_(pending, ss.getUrl());
    }

    toast_('Library synced.');
  } catch (err) {
    console.error(err);
    toast_('Sync error: ' + err.message);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function notify_(recs, sheetUrl) {
  const me = Session.getEffectiveUser().getEmail();
  if (!me) return;
  const subject = recs.length === 1
    ? 'New book recommendation: ' + recs[0].title
    : recs.length + ' new book recommendations';
  const lines = recs.map(r =>
    '• ' + r.title + (r.author ? ' by ' + r.author : '') + ', from ' + r.recommender +
    (r.note ? '\n  "' + r.note + '"' : ''));
  MailApp.sendEmail(me, subject,
    lines.join('\n\n') + '\n\nApprove or reject on the Recommendations tab:\n' + sheetUrl);
}

function headerMap_(headers) {
  const map = {};
  (headers || []).forEach((h, i) => { map[String(h).trim().toLowerCase()] = i; });
  return map;
}

function toast_(msg) {
  try { SpreadsheetApp.getActive().toast(msg, 'Library', 5); } catch (e) { /* no UI on timed runs */ }
}
