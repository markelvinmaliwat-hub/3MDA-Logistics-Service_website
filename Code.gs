// Activity log + FOR PAYMENT database for the PLDT Subscriber Lookup dashboard
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_() {
  return ss_().getSheetByName('ACTIVITY LOG') || ss_().insertSheet('ACTIVITY LOG');
}
function payDb_() {
  var sh = ss_().getSheetByName('FOR PAYMENT DB');
  if (!sh) {
    sh = ss_().insertSheet('FOR PAYMENT DB');
    sh.appendRow(['Key','Subscriber','Account','Agent','Action','Action code','Date of payment','Remarks','Saved by','Agent code','Saved at']);
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
    sh.getRange('C:C').setNumberFormat('@');
    sh.getRange('G:G').setNumberFormat('@');
    sh.getRange('K:K').setNumberFormat('@');
  }
  return sh;
}
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var r = JSON.parse(e.postData.contents);
    if (r.type === 'pay') {
      // FOR PAYMENT database: one row per subscriber, updated each time an agent saves
      var db = payDb_();
      var vals = [r.key, r.name, r.account, r.agent, r.label, r.action, r.date, r.remarks, r.by, r.code, r.at];
      var last = db.getLastRow(), row = 0;
      if (last > 1) {
        var keys = db.getRange(2, 1, last - 1, 1).getValues();
        for (var i = 0; i < keys.length; i++) { if (String(keys[i][0]) === String(r.key)) { row = i + 2; break; } }
      }
      if (row) db.getRange(row, 1, 1, vals.length).setValues([vals]); else db.appendRow(vals);
    } else {
      var sh = sheet_();
      if (sh.getLastRow() === 0) {
        sh.appendRow(['Time','Email','Agent code','Agent name','Action','Where','Search / details','Device','Visitor ID']);
        sh.setFrozenRows(1);
        sh.getRange('A:A').setNumberFormat('@');
      }
      sh.appendRow([r.time, r.email, r.code, r.name, r.action, r.where, r.search, r.device, r.visitor]);
    }
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput('ok');
}
function fmt_(v, tz, pattern) {
  return (v instanceof Date) ? Utilities.formatDate(v, tz, pattern) : String(v);
}
function doGet(e) {
  var p = (e && e.parameter) || {};
  var tz = Session.getScriptTimeZone();
  if (p.read === '1') {
    var sh = sheet_(), rows = [], last = sh.getLastRow();
    if (last > 1) {
      var n = Math.min(last - 1, 3000);
      rows = sh.getRange(last - n + 1, 1, n, 9).getValues().map(function (r) {
        return {time: fmt_(r[0], tz, 'yyyy-MM-dd HH:mm:ss'), email: String(r[1]), code: String(r[2]), name: String(r[3]), action: String(r[4]),
                where: String(r[5]), search: String(r[6]), device: String(r[7]), visitor: String(r[8])};
      });
    }
    return ContentService.createTextOutput(JSON.stringify({rows: rows})).setMimeType(ContentService.MimeType.JSON);
  }
  if (p.read === 'pay') {
    var db = payDb_(), out = [], l = db.getLastRow();
    if (l > 1) {
      out = db.getRange(2, 1, l - 1, 11).getValues().map(function (r) {
        return {key: String(r[0]), name: String(r[1]), account: String(r[2]), agent: String(r[3]), label: String(r[4]), action: String(r[5]),
                date: fmt_(r[6], tz, 'yyyy-MM-dd'), remarks: String(r[7]), by: String(r[8]), code: String(r[9]), at: fmt_(r[10], tz, 'yyyy-MM-dd HH:mm:ss')};
      });
    }
    return ContentService.createTextOutput(JSON.stringify({rows: out})).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput('Activity log endpoint is running');
}
