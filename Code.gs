// Google Sheet > Extensions > Apps Script: paste this, then Deploy > New deployment > Web app
// (Execute as: Me, Who has access: Anyone). Paste the Web app URL into LOG_URL in index.html.
const SHEET = 'Activity Log';
const COLS = ['time','email','code','name','action','where','search','device','visitor'];
function sh_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(SHEET);
  if (!s) { s = ss.insertSheet(SHEET); s.getRange('A:I').setNumberFormat('@'); s.appendRow(COLS); }
  return s;
}
function doPost(e) {
  try { const r = JSON.parse(e.postData.contents); sh_().appendRow(COLS.map(c => String(r[c] || ''))); } catch (err) {}
  return ContentService.createTextOutput('ok');
}
function doGet(e) {
  const v = sh_().getDataRange().getValues(); v.shift();
  const rows = v.map(a => { const o = {}; COLS.forEach((c, i) => o[c] = String(a[i])); return o; });
  return ContentService.createTextOutput(JSON.stringify({ rows: rows })).setMimeType(ContentService.MimeType.JSON);
}
