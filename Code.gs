
const SPREADSHEET_ID = '11-VVgEX5ugFP4suckiaV_LitXz2VhuYe3HhDv4rLcdA';
const ACTIVITY_HEADERS = ['Time','Email','Agent Code','Name','Action','Where','Search','Device','Visitor'];
const PAYMENT_HEADERS = ['Saved at','Key','Subscriber','Account','Agent','Action','Label','Date of payment','Remarks','Saved by (email)','Agent code','Saved by (name)'];

function setup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  // Activity is first sheet (gid=0) - keep existing data if any, just ensure header
  let activitySheet = ss.getSheets()[0];
  if (activitySheet.getLastRow() === 0) {
    activitySheet.clear();
    activitySheet.appendRow(ACTIVITY_HEADERS);
    activitySheet.getRange(1,1,1,ACTIVITY_HEADERS.length).setFontWeight('bold');
    activitySheet.setFrozenRows(1);
  }
  // Payment_Log
  let paySheet = ss.getSheetByName('Payment_Log');
  if (!paySheet) {
    paySheet = ss.insertSheet('Payment_Log');
    paySheet.appendRow(PAYMENT_HEADERS);
    paySheet.getRange(1,1,1,PAYMENT_HEADERS.length).setFontWeight('bold');
    paySheet.setFrozenRows(1);
  }
  return 'Setup done';
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let activitySheet = ss.getSheets()[0];
    let paySheet = ss.getSheetByName('Payment_Log');
    if (!paySheet) {
      paySheet = ss.insertSheet('Payment_Log');
      paySheet.appendRow(PAYMENT_HEADERS);
    }
    
    const p = e.parameter || {};
    const action = (p.action || 'check').toLowerCase();
    const kind = (p.kind || '').toLowerCase();
    
    // health check - opening /exec directly
    if (action === 'check') {
      return jsonOut({ok:true, status:'Dashboard backend is running', activity_rows: activitySheet.getLastRow(), payment_rows: paySheet.getLastRow()});
    }
    
    if (action === 'read') {
      if (kind === 'activity' || kind === 'act') {
        const rows = activitySheet.getDataRange().getValues().slice(1).filter(r => r.join('').trim() !== '');
        const data = rows.map(r => ({
          time: r[0]||'', email: r[1]||'', code: r[2]||'', name: r[3]||'', action: r[4]||'', where: r[5]||'', search: r[6]||'', device: r[7]||'', visitor: r[8]||''
        }));
        return jsonOut({success:true, data:data});
      } else {
        // payment
        const rows = paySheet.getDataRange().getValues().slice(1).filter(r => r.join('').trim() !== '');
        const data = rows.map(r => ({
          at: r[0]||'', key: r[1]||'', name: r[2]||'', account: r[3]||'', agent: r[4]||'', action: r[5]||'', label: r[6]||'', date: r[7]||'', remarks: r[8]||'', by: r[9]||'', code: r[10]||'', byName: r[11]||''
        }));
        return jsonOut({success:true, data:data, ok:true});
      }
    }
    
    if (action === 'write') {
      let obj;
      try { obj = JSON.parse(p.data); } catch(err) { obj = p; }
      
      // payment if has key/at/o/m
      const isPayment = obj.key || obj.o || obj.m || kind === 'pay' || kind === 'payhist' || p.kind === 'pay';
      
      if (isPayment) {
        paySheet.appendRow([
          obj.at || obj.time || new Date().toISOString().slice(0,19).replace('T',' '),
          obj.key || '',
          obj.n || obj.name || '',
          obj.a || obj.account || '',
          obj.g || obj.agent || '',
          obj.o || obj.action || '',
          obj.label || '',
          obj.d || obj.date || '',
          obj.m || obj.remarks || '',
          obj.by || obj.email || '',
          obj.code || '',
          obj.bn || obj.byName || obj.name || ''
        ]);
      } else {
        // activity
        activitySheet.appendRow([
          obj.time || new Date().toISOString().slice(0,19).replace('T',' '),
          obj.email || '',
          obj.code || '',
          obj.name || '',
          obj.action || '',
          obj.where || '',
          obj.search || '',
          obj.device || '',
          obj.visitor || ''
        ]);
      }
      return jsonOut({success:true, ok:true});
    }
    
    return jsonOut({success:false, error:'unknown action'});
    
  } catch(err) {
    return jsonOut({success:false, ok:false, error: err.toString()});
  }
}

function doPost(e) {
  let param = {};
  try {
    param = JSON.parse(e.postData.contents);
    return doGet({parameter:{action:'write', data: JSON.stringify(param), kind: param.kind || ''}});
  } catch(err) {
    return doGet({parameter:{action:'write', data: e.postData.contents}});
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
