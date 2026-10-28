/**
 * Shared database for the Subscriber Lookup dashboard (works for ANY agent, no claude.ai account needed).
 * SETUP
 * 1. Create a new Google Sheet. Extensions > Apps Script. Paste this whole file. Save.
 * 2. Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone. Deploy.
 * 3. Copy the Web app URL and paste it into the dashboard HTML between the quotes of:  const LOG_URL='';
 * Sheets "ActivityLog", "PaymentLatest" and "PaymentHistory" are created automatically.
 */
var ACT_H=['time','email','code','name','action','where','search','device','visitor'];
var PAY_H=['key','name','account','agent','label','action','date','remarks','by','code','byName','at'];
function sh_(n,h){var ss=SpreadsheetApp.getActiveSpreadsheet(),s=ss.getSheetByName(n);if(!s){s=ss.insertSheet(n);s.appendRow(h);s.setFrozenRows(1)}return s}
function rows_(s,h){var v=s.getDataRange().getValues();v.shift();return v.map(function(r){var o={};h.forEach(function(k,i){o[k]=r[i]==null?'':String(r[i])});return o})}
function out_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)}
function doPost(e){
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    var b=JSON.parse(e.postData.contents);
    if(b.type==='pay'){
      var row=PAY_H.map(function(k){return b[k]==null?'':b[k]});
      sh_('PaymentHistory',PAY_H).appendRow(row);
      var s=sh_('PaymentLatest',PAY_H),v=s.getDataRange().getValues(),idx=-1;
      for(var i=1;i<v.length;i++){if(String(v[i][0])===String(b.key)){idx=i+1;break}}
      if(idx<0)s.appendRow(row);
      else if(String(b.at)>=String(v[idx-1][PAY_H.indexOf('at')]))s.getRange(idx,1,1,PAY_H.length).setValues([row]);
    }else{
      sh_('ActivityLog',ACT_H).appendRow(ACT_H.map(function(k){return b[k]==null?'':b[k]}));
    }
    return out_({ok:true});
  }catch(err){return out_({ok:false,error:String(err)})}
  finally{lock.releaseLock()}
}
function doGet(e){
  var r=(e&&e.parameter&&e.parameter.read)||'';
  if(r==='pay')return out_({rows:rows_(sh_('PaymentLatest',PAY_H),PAY_H)});
  if(r==='payhist')return out_({rows:rows_(sh_('PaymentHistory',PAY_H),PAY_H)});
  if(r)return out_({rows:rows_(sh_('ActivityLog',ACT_H),ACT_H).reverse()});
  return out_({ok:true});
}
