// Activity log receiver + reader for the PLDT Subscriber Lookup dashboard
function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName('ACTIVITY LOG') || ss.insertSheet('ACTIVITY LOG');
}
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = sheet_();
    if (sh.getLastRow() === 0) {
      sh.appendRow(['Time','Email','Agent code','Agent name','Action','Where','Search / details','Device','Visitor ID']);
      sh.setFrozenRows(1);
      sh.getRange('A:A').setNumberFormat('@');
    }
    var r = JSON.parse(e.postData.contents);
    sh.appendRow([r.time, r.email, r.code, r.name, r.action, r.where, r.search, r.device, r.visitor]);
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput('ok');
}
function doGet(e) {
  if (e && e.parameter && e.parameter.read === '1') {
    var sh = sheet_(), rows = [];
    var last = sh.getLastRow();
    if (last > 1) {
      var n = Math.min(last - 1, 3000);
      var tz = Session.getScriptTimeZone();
      rows = sh.getRange(last - n + 1, 1, n, 9).getValues().map(function (r) {
        var t = (r[0] instanceof Date) ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd HH:mm:ss') : String(r[0]);
        return {time: t, email: String(r[1]), code: String(r[2]), name: String(r[3]), action: String(r[4]),
                where: String(r[5]), search: String(r[6]), device: String(r[7]), visitor: String(r[8])};
      });
    }
    return ContentService.createTextOutput(JSON.stringify({rows: rows})).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput('Activity log endpoint is running');
}
