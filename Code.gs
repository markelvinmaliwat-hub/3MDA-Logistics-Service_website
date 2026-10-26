// Activity log receiver for the PLDT Subscriber Lookup dashboard
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('ACTIVITY LOG') || ss.insertSheet('ACTIVITY LOG');
    if (sh.getLastRow() === 0) {
      sh.appendRow(['Time','Email','Agent code','Agent name','Action','Where','Search / details','Device','Visitor ID']);
      sh.setFrozenRows(1);
    }
    var r = JSON.parse(e.postData.contents);
    sh.appendRow([r.time, r.email, r.code, r.name, r.action, r.where, r.search, r.device, r.visitor]);
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput('ok');
}
function doGet() {
  return ContentService.createTextOutput('Activity log endpoint is running');
}
