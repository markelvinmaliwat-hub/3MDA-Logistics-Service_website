/**
 * DAILY SALES STATUS NOTICE - FOR PAYMENT and RETURNED SALES (formal English)
 * One formal email per agent, every day at 8:00 AM, listing all of that agent's
 * pending FOR PAYMENT sales and RETURNED sales.
 *
 * SETUP (once)
 * 1. Paste this file into the SAME Apps Script project as your dashboard web app.
 * 2. In File > Project Settings, set the time zone to (GMT+08:00) Asia/Manila -
 *    the 8:00 AM trigger and the dates in the email follow that time zone.
 * 3. Put your address in NOTICE.ADMIN_EMAILS, keep DRY_RUN = true and run
 *    sendAgentNotices() once (authorize Gmail/Sheets). Every email lands in your
 *    inbox, each labelled [TEST for <agent>], so you can check the wording before
 *    the team receives anything.
 * 4. Set DRY_RUN = false, then run installNoticeTrigger() once. That is the daily
 *    8:00 AM schedule. (Triggers fire within the hour you select, not on the exact minute.)
 * 5. This file also provides doGet(), so you can deploy THIS project as its own
 *    web app (Deploy > New deployment > Web app, Execute as Me, Access "Anyone").
 *    Paste the resulting /exec URL into index.html as NOTICE_APP_URL.
 *    If instead you'd rather reuse your existing dashboard web app, delete the
 *    doGet() at the bottom of this file and add this as the FIRST line of that
 *    project's existing doGet(e):
 *      if (e && e.parameter && /^notice(Preview|Send|Status|Install)$/.test(e.parameter.action || '')) return noticeWebApp_(e);
 *    Then Deploy > Manage deployments > edit > New version.
 */
const NOTICE = {
  SHEET_ID: '1i7g_Hv6_tmQxqGhjSVzQFa8rFaJriC3wp9zK3wosnw0',  /* "DATABASE AUG TO OCT" (confirmed by the owner) - holds PLDT, RED, VALIDATORS and Agent_Emails */
  SALES_TABS: ['PLDT', 'RED'],     // FINAL STATUS = FOR PAYMENT is read from these tabs
  VALIDATORS_TAB: 'VALIDATORS',    // RETURNED sales are read from this tab
  EMAIL_TAB: 'Agent_Emails',       // AGENT CODE | AGENT NAME | EMAIL
  SENDER_NAME: '3MDA Logistics',
  SEND_HOUR: 8,                    // daily send hour, in the project time zone
  DRY_RUN: true,                   // true = every email goes to ADMIN_EMAILS only, labelled [TEST ...]
  ADMIN_EMAILS: ['markelvinmaliwat@gmail.com'],   /* receives the test copies and the missing-email list; while DRY_RUN is true, every notice is sent here instead of to the agents */
  CC: [],                          // e.g. ['teamleader@email.com'] added to every agent email
  MAX_ROWS: 100,                   // rows listed per section; the rest are summarised (keeps one notice small enough to send)
  TIMEZONE: 'Asia/Manila'
};

const NT_ = {
  GREET: 'Dear',
  FP_INTRO: 'This is to formally inform you that the following sale(s) endorsed under your account are currently tagged as FOR PAYMENT. Kindly coordinate with the concerned subscriber(s) and ensure that the required payment is settled at the earliest possible time to avoid delays or cancellation of the application.',
  RT_INTRO: 'Please be advised that the following sale(s) endorsed by you have been RETURNED by the validators. Kindly review the remarks indicated below, complete the necessary corrections or requirements, and re-endorse the sale at your earliest convenience.',
  FP_HEAD: 'FOR PAYMENT',
  RT_HEAD: 'RETURNED SALES',
  CLOSE: 'Should you have any concerns, please coordinate with your Team Leader. Thank you for your continued diligence and cooperation.',
  REGARDS: 'Respectfully,',
  FOOTER: 'Automated notice sent daily at 8:00 AM from the 3MDA Logistics dashboard. Please do not reply to this email.'
};
const COL_ = ['Date', 'Subscriber', 'Plan', 'Status', 'Remarks'];

const nk_ = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const code_ = s => nk_(s).replace(/^P/, '');
const esc_ = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtD_ = v => v instanceof Date
  ? Utilities.formatDate(v, NOTICE.TIMEZONE, 'dd MMM yyyy')
  : String(v == null ? '' : v).trim();

/* ------------------------------------------------------------------ sheet reads */
const ALIAS_ = {
  STATUS: ['FINAL STATUS', 'STATUS', 'CSP STATUS'],
  AGENT: ['AGENT NAME', 'AGENT', 'NAME OF AGENT'],
  CODE: ['AGENT CODE', 'CODE'],
  SUB: ['SUBSCRIBER NAME', 'SUBSCRIBERS NAME', 'CUSTOMER NAME', 'SUBSCRIBER'],
  DATE: ['DATE', 'SALE DATE', 'DATE ENCODED'],
  PLAN: ['AVAILED PLAN', 'PLAN AVAILED', 'PLAN'],
  PAYREM: ['PAYMENT REMARKS', 'CSP REMARKS', 'REMARKS'],
  ADMREM: ['ADMIN REMARKS', 'CSP REMARKS', 'REMARKS']
};
function pick_(r, key) {
  for (const n of ALIAS_[key]) { const v = r[n]; if (v !== undefined && v !== '' && v !== null) return v; }
  return '';
}
/* header row = first row (within the top 10) carrying both STATUS and AGENT */
function tab_(ss, name, plain) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getDataRange().getValues();
  let hi = plain ? 0 : -1;
  for (let i = 0; !plain && i < Math.min(10, v.length); i++) {
    const line = v[i].map(x => String(x).toUpperCase()).join('|');
    if (/STATUS/.test(line) && /AGENT/.test(line)) { hi = i; break; }
  }
  if (hi < 0) return [];
  const h = v[hi].map(x => String(x).trim().toUpperCase());
  return v.slice(hi + 1).map(r => {
    const o = {};
    h.forEach((k, j) => { if (k && o[k] === undefined) o[k] = r[j]; });
    return o;
  });
}

/* ------------------------------------------------------- agent -> email lookup */
function emailList_(ss) {
  const list = [];
  tab_(ss, NOTICE.EMAIL_TAB, true).forEach(r => {
    const m = String(r['AGENT EMAIL'] || r['EMAIL'] || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/);
    if (!m) return;
    list.push({ name: nk_(r['AGENT NAME']), code: code_(r['AGENT CODE']), email: m[0].toLowerCase() });
  });
  return list;
}
/* same agent? matching code, identical name, or every word of the shorter name present in the longer
   (so "MALIWAT, MARK" matches "F_MALIWAT, MARK" and "FRANCISCO, ROSELYN" matches "FRANCISCO, ROSELYN ROMERO") */
function sameAgent_(aName, aCode, bName, bCode) {
  if (aCode && bCode && aCode === bCode) return true;
  if (!aName || !bName) return false;
  if (aName === bName) return true;
  const ta = aName.split(' '), tb = bName.split(' ');
  const small = ta.length <= tb.length ? ta : tb, big = ta.length <= tb.length ? tb : ta;
  if (small.length < 2) return false;
  return small.every(t => big.indexOf(t) >= 0);
}
function findEmail_(list, name, code) {
  const n = nk_(name), c = code_(code);
  const hit = list.find(x => sameAgent_(n, c, x.name, x.code));
  return hit ? hit.email : '';
}

/* ------------------------------------------------------------- collect the data */
function collect_(ss) {
  const agents = {};
  const add = (rawName, rawCode, type, it) => {
    const name = String(rawName || '').trim(); if (!name) return;
    const k = nk_(name);
    const a = agents[k] = agents[k] || { name: name, code: code_(rawCode), fp: [], rt: [] };
    if (!a.code) a.code = code_(rawCode);
    a[type].push(it);
  };
  const seen = {};
  const rtKey = it => [it.date, it.sub, it.plan].join('|');
  NOTICE.SALES_TABS.forEach(tab => tab_(ss, tab).forEach(r => {
    const st = String(pick_(r, 'STATUS'));
    const isFp = /^\s*FOR PAYMENT/i.test(st);
    const isRts = /^\s*(RTS|RETURN)/i.test(st);
    if (!isFp && !isRts) return;
    const it = {
      date: fmtD_(pick_(r, 'DATE')), sub: String(pick_(r, 'SUB')), plan: String(pick_(r, 'PLAN')),
      status: st, remarks: String(pick_(r, 'PAYREM'))
    };
    if (isFp) { add(pick_(r, 'AGENT'), pick_(r, 'CODE'), 'fp', it); return; }
    seen[rtKey(it)] = 1;
    add(pick_(r, 'AGENT'), pick_(r, 'CODE'), 'rt', it);
  }));
  tab_(ss, NOTICE.VALIDATORS_TAB).forEach(r => {
    const adm = String(pick_(r, 'ADMREM')), st = String(pick_(r, 'STATUS'));
    if (!/RETURN/i.test(adm) && !/RETURN/i.test(st)) return;
    const it = {
      date: fmtD_(pick_(r, 'DATE')), sub: String(pick_(r, 'SUB')), plan: String(pick_(r, 'PLAN')),
      status: /RETURN/i.test(st) ? st : 'RETURNED', remarks: adm
    };
    if (seen[rtKey(it)]) return;
    seen[rtKey(it)] = 1;
    add(pick_(r, 'AGENT'), pick_(r, 'CODE'), 'rt', it);
  });
  return Object.keys(agents).map(k => agents[k]).filter(a => a.fp.length || a.rt.length)
    .sort((x, y) => nk_(x.name).localeCompare(nk_(y.name)));
}

/* ------------------------------------------------------------- build the email */
function table_(items) {
  const th = 'style="background:#d9001b;color:#fff;text-align:left;padding:8px 10px;font-size:12px"';
  const td = 'style="padding:7px 10px;border-bottom:1px solid #e3e8f0;font-size:13px;vertical-align:top"';
  return '<table cellpadding="6" style="border-collapse:collapse;border:1px solid #e3e8f0;width:100%">' +
    '<tr>' + COL_.map(c => `<th ${th}>${c}</th>`).join('') + '</tr>' +
    items.map((x, i) => `<tr style="background:${i % 2 ? '#f4f7fc' : '#fff'}">` +
      [x.date, x.sub, x.plan, x.status, x.remarks].map((v, j) =>
        `<td ${td}>${j === 1 ? '<b>' + esc_(v) + '</b>' : esc_(v) || '&mdash;'}</td>`).join('') + '</tr>').join('') +
    '</table>';
}
function moreNote_(items, shown) {
  const extra = items.length - shown.length;
  return extra > 0 ? `<p style="color:#667085;font-size:12px">&hellip;and ${extra} more ${extra === 1 ? 'sale' : 'sales'} not listed here. Check the dashboard or ask your Team Leader for the full list.</p>` : '';
}
function section_(label, items, max) {
  const shown = items.slice(0, max);
  return `<p style="margin:18px 0 4px"><b>${label} (${items.length})</b></p>` + table_(shown) + moreNote_(items, shown);
}
function rowsText_(items, max) {
  const shown = items.slice(0, max);
  return shown.map(x => `- ${[x.date, x.sub, x.plan, x.status, x.remarks].filter(Boolean).join(' | ')}`).join('\n') +
    (items.length > shown.length ? `\n...and ${items.length - shown.length} more.` : '');
}
function build_(agent, fp, rt) {
  const max = NOTICE.MAX_ROWS || 100;
  const today = fmtD_(new Date());
  const subj = fp.length && rt.length
    ? `Notice: ${fp.length} For Payment and ${rt.length} Returned Sale(s) - ${today}`
    : fp.length ? `Notice: ${fp.length} Sale(s) Tagged as For Payment - ${today}`
      : `Notice: ${rt.length} Returned Sale(s) - ${today}`;
  let h = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1a2233;max-width:760px">` +
    `<div style="border-top:5px solid #d9001b;background:#111;color:#fff;padding:12px 16px;font-weight:700">` +
    `${esc_(NOTICE.SENDER_NAME)} &middot; Sales Status Notice</div>` +
    `<div style="padding:16px;border:1px solid #e3e8f0;border-top:0">` +
    `<p>${NT_.GREET} <b>${esc_(agent)}</b>,</p>`;
  let t = `${NT_.GREET} ${agent},\n\n`;
  if (fp.length) { h += `<p>${NT_.FP_INTRO}</p>` + section_(NT_.FP_HEAD, fp, max); t += NT_.FP_INTRO + `\n\n${NT_.FP_HEAD} (${fp.length})\n` + rowsText_(fp, max) + '\n\n'; }
  if (rt.length) { h += `<p>${NT_.RT_INTRO}</p>` + section_(NT_.RT_HEAD, rt, max); t += NT_.RT_INTRO + `\n\n${NT_.RT_HEAD} (${rt.length})\n` + rowsText_(rt, max) + '\n\n'; }
  h += `<p style="margin-top:18px">${NT_.CLOSE}</p><p>${NT_.REGARDS}<br><b>${esc_(NOTICE.SENDER_NAME)}</b></p>` +
    `<p style="color:#667085;font-size:12px">${NT_.FOOTER}</p></div></div>`;
  t += NT_.CLOSE + `\n\n${NT_.REGARDS}\n${NOTICE.SENDER_NAME}\n${NT_.FOOTER}`;
  return { subject: subj, html: h, text: t };
}

/* --------------------------------------------------------------------- sending */
/** send=false -> preview only, nothing leaves the account. DRY_RUN redirects every email to ADMIN_EMAILS. */
function sendNotices_(send) {
  const ss = NOTICE.SHEET_ID ? SpreadsheetApp.openById(NOTICE.SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const list = emailList_(ss), agents = collect_(ss);
  const admins = NOTICE.ADMIN_EMAILS.map(x => String(x).trim().toLowerCase()).filter(Boolean);
  const testTo = admins[0] || Session.getEffectiveUser().getEmail();
  const res = { sent: [], noEmail: [], mode: send ? (NOTICE.DRY_RUN ? 'test' : 'live') : 'preview', dryRun: NOTICE.DRY_RUN, date: fmtD_(new Date()), quota: MailApp.getRemainingDailyQuota() };
  let n = 0;
  agents.forEach(a => {
    const row = { agent: a.name, email: findEmail_(list, a.name, a.code), forPayment: a.fp.length, returned: a.rt.length };
    if (!row.email) { res.noEmail.push(row); return; }
    res.sent.push(row);
    if (!send) return;
    if (n >= MailApp.getRemainingDailyQuota()) { row.skipped = 'daily quota reached'; return; }
    const m = build_(a.name, a.fp, a.rt);
    const opt = {
      to: NOTICE.DRY_RUN ? testTo : row.email,
      subject: (NOTICE.DRY_RUN ? `[TEST for ${a.name} <${row.email}>] ` : '') + m.subject,
      body: m.text, htmlBody: m.html, name: NOTICE.SENDER_NAME
    };
    if (!NOTICE.DRY_RUN && NOTICE.CC.length) opt.cc = NOTICE.CC.join(',');
    try { MailApp.sendEmail(opt); n++; } catch (err) { row.error = String(err); }
  });
  if (send && res.noEmail.length && testTo) {
    try {
      MailApp.sendEmail({
        to: testTo, name: NOTICE.SENDER_NAME,
        subject: `Sales Status Notice: ${res.noEmail.length} agent(s) have no email - ${res.date}`,
        body: `Add these agents to the "${NOTICE.EMAIL_TAB}" tab (AGENT CODE | AGENT NAME | EMAIL) so they receive their daily notice.\n\n` +
          res.noEmail.map(x => `- ${x.agent} (${x.forPayment} for payment, ${x.returned} returned)`).join('\n')
      });
    } catch (err) { res.noEmailNoticeError = String(err); }
  }
  res.failed = res.sent.filter(x => x.error).length;
  return res;
}

/* ------------------------------------------------------- trigger + web app glue */
function sendAgentNotices() { sendNotices_(true); }
function runAgentNotices() { return sendNotices_(true); }
function installNoticeTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'runAgentNotices').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('runAgentNotices').timeBased().everyDays(1).atHour(NOTICE.SEND_HOUR).create();
}
function noticeStatus_() {
  const installed = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'runAgentNotices');
  return { installed: installed, hour: NOTICE.SEND_HOUR, tz: NOTICE.TIMEZONE, dryRun: NOTICE.DRY_RUN, sender: NOTICE.SENDER_NAME };
}
function noticeWebApp_(e) {
  const a = (e && e.parameter && e.parameter.action) || '';
  let out;
  try {
    out = a === 'noticeStatus' ? noticeStatus_()
      : a === 'noticeInstall' ? (installNoticeTrigger(), noticeStatus_())
        : sendNotices_(a === 'noticeSend');
  } catch (err) { out = { error: String(err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* One-run diagnostic: pick noticeDiag in the dropdown, Run, then read the log.
   It answers "why did MailApp refuse the notice?" without emailing any agent. */
function noticeDiag() {
  const to = NOTICE.ADMIN_EMAILS[0] || Session.getEffectiveUser().getEmail();
  Logger.log('remaining daily quota: ' + MailApp.getRemainingDailyQuota());
  const ss = NOTICE.SHEET_ID ? SpreadsheetApp.openById(NOTICE.SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const agents = collect_(ss);
  Logger.log('agents with pending items: ' + agents.length);
  agents.map(a => { const m = build_(a.name, a.fp, a.rt); return { agent: a.name, rows: a.fp.length + a.rt.length, htmlChars: m.html.length }; })
    .sort((x, y) => y.htmlChars - x.htmlChars).slice(0, 5)
    .forEach(s => Logger.log('biggest notice: ' + JSON.stringify(s)));
  const real = agents.length ? build_(agents[0].name, agents[0].fp, agents[0].rt) : { text: 'none', html: '<p>none</p>' };
  const cases = [
    ['A: sender name only', { to: to, name: NOTICE.SENDER_NAME, subject: 'diag A', body: 'plain' }],
    ['B: long subject with <email>', { to: to, subject: '[TEST for SOME, ONE <a@b.com>] Notice: 1 For Payment and 1 Returned Sale(s) - 01 Nov 2026', body: 'plain' }],
    ['C: real notice html (capped)', { to: to, name: NOTICE.SENDER_NAME, subject: 'diag C', body: real.text, htmlBody: real.html }],
    ['D: 400-row html table', { to: to, subject: 'diag D', body: 'plain', htmlBody: '<table>' + Array(400).join('<tr><td>Subscriber</td><td>FIBER UNLI PLAN 1399</td><td>FOR PAYMENT</td></tr>') + '</table>' }]
  ];
  cases.forEach(c => {
    try { MailApp.sendEmail(c[1]); Logger.log('OK  ' + c[0]); }
    catch (e) { Logger.log('ERR ' + c[0] + ' -> ' + e); }
  });
}

/* Only use this when this project is deployed as its OWN web app (its /exec URL then
   goes into index.html as NOTICE_APP_URL). If you hook into an existing doGet instead,
   delete this function and add the notice dispatch line from the header comment. */
function doGet(e) {
  const a = (e && e.parameter && e.parameter.action) || '';
  if (/^notice(Preview|Send|Status|Install)$/.test(a)) return noticeWebApp_(e);
  return ContentService.createTextOutput(JSON.stringify({
    error: 'unknown action', use: 'noticeStatus | noticePreview | noticeSend | noticeInstall'
  })).setMimeType(ContentService.MimeType.JSON);
}
