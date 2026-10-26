/**
 * Activity-log backend for the Subscriber Lookup dashboard.
 *
 * SETUP
 * 1. Create a Google Sheet (any name). Open Extensions > Apps Script and paste this file.
 * 2. Deploy > New deployment > type "Web app".
 *      Execute as: Me      Who has access: Anyone
 * 3. Copy the Web app URL and paste it into index.html / pldt_dashboard.html here:
 *      const LOG_URL='PASTE-URL-HERE';
 * Every login, search and view is then saved to the "Activity Log" tab and the
 * dashboard's "Activity log" button shows activity from all devices.
 */
var SHEET_NAME = 'Activity Log';
var HEADERS = ['time','email','code','name','action','where','search','device','visitor'];

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var row = JSON.parse(e.postData.contents);
    getSheet_().appendRow(HEADERS.map(function (k) { return row[k] == null ? '' : String(row[k]); }));
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.read) {
    var sh = getSheet_();
    var n = sh.getLastRow() - 1;
    var rows = [];
    if (n > 0) {
      var start = Math.max(2, sh.getLastRow() - 4999);          // latest 5000 rows
      var vals = sh.getRange(start, 1, sh.getLastRow() - start + 1, HEADERS.length).getValues();
      rows = vals.map(function (r) {
        var o = {};
        HEADERS.forEach(function (k, i) { o[k] = r[i] instanceof Date ? Utilities.formatDate(r[i], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') : String(r[i]); });
        return o;
      });
    }
    return json_({ rows: rows });
  }
  return json_({ ok: true, service: 'Subscriber Lookup activity log' });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
