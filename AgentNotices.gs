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
 * 6. Recommended: run  setNoticeSendToken()  once and copy the token from the log.
 *    From then on the dashboard asks for that token before "Send emails now", so a
 *    stranger who reads the page source cannot blast every agent with one GET
 *    request.  clearNoticeSendToken()  removes the requirement again. The token
 *    lives in Script Properties - never in this file, never in the public repo.
 * 7. This file also serves the dashboard's shared logs (the "Online" avatars and
 *    the payment history) through  action=logRead / logWrite / logStatus, on the
 *    same /exec URL. It writes only to LOG.SHEET_ID, in the tabs  activity_log
 *    and  Payment_Updates , creating them with the right headers if they are
 *    missing, and stamps every row with server time in NOTICE.TIMEZONE. The old
 *    tab named Payment_Log is never written to - run  repairLogTabs()  once to
 *    put its original header back and prepare the two tabs above. Nothing else
 *    to run; it is live as soon as you deploy a new version.
 * 8. It also serves the agent accounts through  action=acct  (op = exists, create,
 *    login, profile, forgot, check, reset) in an  Accounts  tab, which is what makes the
 *    dashboard's "Forgot password?" able to email a 6-digit code. The tab holds the
 *    browser's pwh() digest, never the password, and the web app never returns the
 *    digest or a live code - so keep that spreadsheet shared only with people you
 *    trust. Reset emails respect the 8:00 AM notices: they stop when fewer than
 *    ACCT.QUOTA_FLOOR emails are left for the day.
 * 9. SFS.VALIDATION@PLDT: every day,  runSfsNotices  emails the applications tagged in
 *    SFS.FROM with SFS.STATUS to SFS.TO plus SFS.CC, shaped like the owner's own
 *    "3MDA_SFS_VALIDATION_OCT2026" mail. It sends nothing on a day with no matching row.
 *    While  SFS.DRY_RUN  is true the report goes to the admin only and the CC list is
 *    ignored, so PLDT receives nothing until the owner flips that switch.  sfsPreview
 *    logs the report without sending,  sfsProbe  measures the rule against the live
 *    sheet, and  installSfsTrigger  creates the daily trigger. The MMMDA logo is pulled
 *    from the published site and attached as an inline image (SFS.LOGO_URL), so it is
 *    visible even when the reader blocks pictures from the internet.
 */
const NOTICE = {
  SHEET_ID: '1i7g_Hv6_tmQxqGhjSVzQFa8rFaJriC3wp9zK3wosnw0',  /* "DATABASE AUG TO OCT" (confirmed by the owner) - holds PLDT, RED, VALIDATORS and Agent_Emails */
  SALES_TABS: ['PLDT', 'RED'],     // FINAL STATUS = FOR PAYMENT is read from these tabs
  VALIDATORS_TAB: 'VALIDATORS',    // RETURNED sales are read from this tab
  EMAIL_TAB: 'Agent_Emails',       // AGENT CODE | AGENT NAME | EMAIL
  SENDER_NAME: '3MDA Logistics',
  SEND_HOUR: 8,                    // daily send hour, in the project time zone
  DRY_RUN: false,                  // true = every email goes to ADMIN_EMAILS only, labelled [TEST ...]
  ADMIN_EMAILS: ['markelvinmaliwat@gmail.com'],   /* receives the test copies and the missing-email list; while DRY_RUN is true, every notice is sent here instead of to the agents */
  CC: [],                          // e.g. ['teamleader@email.com'] added to every agent email
  MAX_ROWS: 100,                   // rows listed per section; the rest are summarised (keeps one notice small enough to send)
  TIMEZONE: 'Asia/Manila'
};

/* The dashboard's shared logs live in their own spreadsheet, never in the sales file.
   activity_log was the correctly named but empty tab - that is the one we now fill.
   The tab called Payment_Log turned out to hold 349 rows of ACTIVITY history, so the
   payment log goes to its own fresh tab instead of appending under that legacy data. */
const LOG = {
  SHEET_ID: '11-VVgEX5ugFP4suckiaV_LitXz2VhuYe3HhDv4rLcdA',  /* the logs sheet the dashboard already reads */
  ACT_TAB: 'activity_log',
  PAY_TAB: 'Payment_Updates',
  LEGACY_TAB: 'Payment_Log',        /* left alone: 349 rows of old activity, header restored by repairLogTabs() */
  LEGACY_HEAD: ['Timestamp', 'User', 'Amount', 'Method', 'Status', 'Ref', 'Data', '', '', '', '', ''],
  ACT_HEAD: ['Time', 'Email', 'Code', 'Name', 'Action', 'Where', 'Search', 'Device', 'Visitor', 'Ts'],
  PAY_HEAD: ['Saved At', 'Key', 'Name', 'Account', 'Agent', 'Action', 'Label', 'Date', 'Remarks', 'By', 'Code', 'By Name'],
  READ_LIMIT: 600,                 // rows per logRead call (keeps the reply a few KB instead of 13 MB)
  MAX_ROWS: 30000,                 // hard stop so a stranger cannot grow the log forever
  FIELD: 200                       // per-field cap
};

/* Agent accounts, so a password set on one phone works on a laptop and a forgotten
   password can be reset with a code emailed to the agent. The browser never sends the
   password itself - only pwh(email + ':' + password), the same value it checks locally. */
const ACCT = {
  SHEET_ID: '',                      // '' = the same file as the logs; put a private spreadsheet id here to keep Accounts away from anyone the logs sheet is shared with
  TAB: 'Accounts',
  HEAD: ['Email', 'Hash', 'Code', 'Name', 'Last Login', 'Reset Code', 'Expires', 'Tries', 'Resets', 'Reset Day'],
  CODE_TTL_MIN: 30,
  MAX_TRIES: 5,
  MAX_RESETS_PER_EMAIL: 3,
  MAX_RESETS_TOTAL: 20,
  MAX_ROWS: 4000,
  QUOTA_FLOOR: 25                  // never spend the last 25 emails of the day - the 8:00 AM notices need them
};

/* The two endorsement reports the owner mails to PLDT by hand - SFS VALIDATION and CREDIT
   VALIDATION. Each is one config object below and every report function takes that object,
   so wording, rule, recipients, schedule and test settings are data, not code. Both run
   twice a day (SFS.SEND_HOURS / CV.SEND_HOURS) and each keeps its own list of what it already
   mailed that day, so the 2PM copy carries only what arrived after 8AM.
   DRY_RUN is the gate per report: while it is true the report goes to ADMIN_EMAILS and the CC
   list is NOT used, so PLDT never receives anything from a test. The owner approved the SFS
   live switch on 2026-11-04 after reviewing the sfsTestReport copy. FROM / STATUS decide
   which rows count and SHEET_ID / TABS decide which file they are read from; sfsProbe() and
   cvProbe() measure both against the live sheet. */
const SFS = {
  NAME: 'SFS',
  TO: ['lsabat@pldt.com.ph'],
  CC: ['t-jesnavarro@supplier.pldt.com.ph', 't-jesnavarro@pldt365.onmicrosoft.com', 'abmadlangbayan0510@icloud.com'],
  GREET: 'Hi Sir ABAT, Leonard S.,',
  INTRO: 'For endorsement to SFS for proper validation.',
  THANKS: 'Thank you !',
  SIGN: ['Mark Maliwat', 'Sales Validator - MMMDA Logistics', 'Service Cavite Upland'],
  LOGO_URL: 'https://markelvinmaliwat-hub.github.io/3MDA-Logistics-Service_website/assets/mmmda-logo.jpg',
  LOGO_KEY: 'mmmda-logo',            // the cid: name used inside the email
  LOGO_ALT: 'MMMDA Logistics Service',
  LOGO_W: 150, LOGO_H: 147,          // the file is 1280x1255, so these keep its shape
  LOGO_ABOVE: true,                  // false puts the picture under the three signature lines
  FOOTER: '',                        // e.g. 'Automated daily report from the 3MDA Logistics dashboard.'
  STATUS: 'SFS VALIDATION',          // the value looked for in SFS.FROM
  SHEET_ID: '',                      // '' = the same file the agent notices read (DATABASE AUG TO OCT); otherwise the id of the sheet he tags today
  TABS: [],                          // '' = NOTICE.SALES_TABS (PLDT, RED); set for a file whose tabs have other names
  FROM: ['FINAL STATUS'],            // the owner's rule: the row is endorsed once FINAL STATUS carries the SFS tag
  EXACT: false,                      // false also catches "SFS VALIDATION - WITH UPLOADED DOCS" typed into FINAL STATUS
  HD_TEXT: 'SFS VALIDATION - WITH UPLOADED DOCS',
                                     // the PLDT sheet has no HD REMARKS column - the owner writes this line himself
                                     // when he endorses, so the report repeats it. '' = read HD REMARKS / HD RECOMMENDATION instead.
  COLS: ['DATE', 'SUBSCRIBER NAME', 'SR', 'CSP REMARKS', 'HD REMARKS'],
  DATE_FORMAT: 'M/d/yyyy',           // the owner writes 10/23/2026, not 23 Oct 2026
  SR_LINK: '',                       // 'https://…' prefix if the SR number should be a hyperlink, '' = plain
  SEND_HOURS: [8, 14],               // two runs a day; Apps Script fires somewhere inside each hour, not at an exact minute
  DRY_RUN: false,                    // true = the report goes to ADMIN_EMAILS only, labelled [TEST]; PLDT receives nothing
  MAX_ROWS: 300,                     // rows listed; the rest are summarised
  TIMEZONE: '',                      // '' = NOTICE.TIMEZONE
  SUBJECT: '3MDA_SFS_VALIDATION_',   // + MMMYYYY, the owner's own convention
  SENT_PREFIX: 'SFS_SENT_',          // Script Properties key holding the SR numbers already mailed today
  PROBE: ['SFS'],                    // what sfsProbe hunts for when it suggests a rule
  TEST: { STATUS: 'REENCODED', MAX_ROWS: 12 }   // what sfsTestReport borrows so there is a sample to look at
};

/* The CREDIT VALIDATION report - same shape, same recipients, different queue. The owner's
   manual mail reads "For credit validation and approval." over rows whose CSP REMARKS says
   ESCALATED TO CVAA. He confirmed on 2026-11-04 that BOTH daily reports go to Leonard alone on
   the To line with the same three CCs, so CV.TO / CV.CC mirror SFS exactly. DRY_RUN is true:
   cvTestReport shows him a real copy first, and only his "go" turns it live. */
const CV = {
  NAME: 'CV',
  TO: ['lsabat@pldt.com.ph'],
  CC: ['t-jesnavarro@supplier.pldt.com.ph', 't-jesnavarro@pldt365.onmicrosoft.com', 'abmadlangbayan0510@icloud.com'],
  GREET: 'Hi Sir ABAT, Leonard S.,',
  INTRO: 'For credit validation and approval.',
  THANKS: 'Thank you !',
  SIGN: ['Mark Maliwat', 'Sales Validator - MMMDA Logistics', 'Service Cavite Upland'],
  LOGO_URL: 'https://markelvinmaliwat-hub.github.io/3MDA-Logistics-Service_website/assets/mmmda-logo.jpg',
  LOGO_KEY: 'mmmda-logo',
  LOGO_ALT: 'MMMDA Logistics Service',
  LOGO_W: 150, LOGO_H: 147,
  LOGO_ABOVE: true,
  FOOTER: '',
  STATUS: 'ESCALATED TO CVAA',
  SHEET_ID: '',
  TABS: [],
  FROM: ['CSP REMARKS'],             // the owner's rule: the row is a credit-validation item once CSP REMARKS says so
  EXACT: false,
  HD_TEXT: 'FOR CREDIT VALIDATION AND APPROVAL',
  COLS: ['DATE', 'SUBSCRIBER NAME', 'SR', 'CSP REMARKS', 'HD REMARKS'],
  DATE_FORMAT: 'M/d/yyyy',
  SR_LINK: '',
  SEND_HOURS: [8, 14],
  DRY_RUN: true,
  MAX_ROWS: 300,
  TIMEZONE: '',
  SUBJECT: '3MDA_CREDIT_VALIDATION_',
  SENT_PREFIX: 'CV_SENT_',
  PROBE: ['CVAA', 'CREDIT', 'COMPLIANCE'],
  TEST: { STATUS: 'ESCALATED', MAX_ROWS: 12 }
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
  ADMREM: ['ADMIN REMARKS', 'CSP REMARKS', 'REMARKS'],
  SR: ['SR', 'SR NO', 'SR NO.', 'SR NUMBER', 'SERVICE REQUEST'],
  CSP: ['CSP STATUS', 'CSP'],
  CSPREM: ['CSP REMARKS', 'REMARKS'],
  TL: ['TEAM LEADER', 'TL', 'TEAM LEAD']
};
function pick_(r, key) {
  for (const n of ALIAS_[key] || []) { const v = r[n]; if (v !== undefined && v !== '' && v !== null) return v; }
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
/* One table style for every email: red header, alternating rows. A column name is looked
   up in CELL_, which is what lets the SFS report add SR / agent columns without a second
   builder. Anything not listed there renders as an empty cell. */
const CELL_ = {
  'Date': 'date', 'DATE': 'date', 'Subscriber': 'sub', 'SUBSCRIBER NAME': 'sub', 'Plan': 'plan',
  'Status': 'status', 'FINAL STATUS': 'status', 'Remarks': 'remarks', 'SR No.': 'sr', 'SR': 'sr',
  'CSP REMARKS': 'cspRem', 'HD REMARKS': 'hd', 'HD RECOMMENDATION': 'hd',
  'Agent': 'agent', 'Team Leader': 'tl', 'CSP STATUS': 'csp'
};
const TH_ = 'style="background:#d9001b;color:#fff;text-align:left;padding:8px 10px;font-size:12px"';
const TD_ = 'style="padding:7px 10px;border-bottom:1px solid #e3e8f0;font-size:13px;vertical-align:top"';
const cellOf_ = (x, c) => String(x[CELL_[c] || ''] == null ? '' : x[CELL_[c] || '']);
function table_(items, cols) {
  const C = cols || COL_;
  return '<table cellpadding="6" style="border-collapse:collapse;border:1px solid #e3e8f0;width:100%">' +
    '<tr>' + C.map(c => `<th ${TH_}>${c}</th>`).join('') + '</tr>' +
    items.map((x, i) => `<tr style="background:${i % 2 ? '#f4f7fc' : '#fff'}">` +
      C.map((c, j) => { const v = cellOf_(x, c);
        return `<td ${TD_}>${j === 1 ? '<b>' + esc_(v) + '</b>' : esc_(v) || '&mdash;'}</td>`; }).join('') + '</tr>').join('') +
    '</table>';
}
function moreNote_(items, shown) {
  const extra = items.length - shown.length;
  return extra > 0 ? `<p style="color:#667085;font-size:12px">&hellip;and ${extra} more ${extra === 1 ? 'sale' : 'sales'} not listed here. Check the dashboard or ask your Team Leader for the full list.</p>` : '';
}
function section_(label, items, max, cols) {
  const shown = items.slice(0, max);
  return `<p style="margin:18px 0 4px"><b>${label} (${items.length})</b></p>` + table_(shown, cols) + moreNote_(items, shown);
}
function rowsText_(items, max, cols) {
  const C = cols || COL_, shown = items.slice(0, max);
  return shown.map(x => `- ${C.map(c => cellOf_(x, c)).filter(Boolean).join(' | ')}`).join('\n') +
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

/* --------------------------------------------------- PLDT ENDORSEMENT REPORT ENGINE
   Everything here takes a report config (SFS or CV). The tab reader and the field names are
   shared with the agent notices, but the table is the owner's own black-bordered one, and the
   HD REMARKS column repeats a phrase he types by hand (cfg.HD_TEXT) because the sheet has no
   such column. Nothing is emailed when no row matches. */
/* Which column decides that a row belongs in the report? cfg.FROM is tried in order and the
   first non-empty value wins, so the rule can be moved to another column without touching
   anything else. cfg.EXACT=false (the default) also catches a longer wording typed straight
   into the same column - "SFS VALIDATION - WITH UPLOADED DOCS" in FINAL STATUS, for instance. */
function reportStatusOf_(r, cfg) {
  for (const c of cfg.FROM) {
    const v = r[c];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}
function fmtReportDate_(v, cfg) {
  const tz = cfg.TIMEZONE || NOTICE.TIMEZONE;
  if (v instanceof Date) return Utilities.formatDate(v, tz, cfg.DATE_FORMAT);
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : Utilities.formatDate(d, tz, cfg.DATE_FORMAT);
}
/* A report can read a different spreadsheet from the agent notices, because the Aug-Oct file
   is closed: cfg.SHEET_ID wins when it is set, otherwise NOTICE.SHEET_ID. */
function reportSs_(cfg) {
  const id = String(cfg.SHEET_ID || NOTICE.SHEET_ID || '');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function reportTabs_(cfg) { return cfg.TABS && cfg.TABS.length ? cfg.TABS : NOTICE.SALES_TABS; }
function collectReport_(ss, cfg) {
  const want = nk_(cfg.STATUS), out = [], seen = {};
  reportTabs_(cfg).forEach(name => tab_(ss, name).forEach(r => {
    const st = reportStatusOf_(r, cfg), match = nk_(st);
    if (cfg.EXACT ? match !== want : match.indexOf(want) < 0) return;
    const dv = pick_(r, 'DATE'), raw = dv instanceof Date ? dv.getTime() : new Date(dv).getTime();
    const it = {
      date: fmtReportDate_(dv, cfg), sub: String(pick_(r, 'SUB')).trim(), plan: String(pick_(r, 'PLAN')).trim(),
      status: st, remarks: String(pick_(r, 'PAYREM')).trim(),
      sr: String(pick_(r, 'SR')).replace(/\.0$/, '').trim(), agent: String(pick_(r, 'AGENT')).trim(),
      tl: String(pick_(r, 'TL')).trim(), csp: String(pick_(r, 'CSP')).trim(),
      cspRem: String(pick_(r, 'CSPREM')).trim(), hd: hdOf_(r, cfg), _t: isNaN(raw) ? 0 : raw
    };
    it.key = it.sr || (it.date + '|' + it.sub + '|' + it.plan);
    if (seen[it.key]) return;
    seen[it.key] = 1;
    out.push(it);
  }));
  /* oldest first - a validation queue is worked from the top */
  return out.sort((x, y) => x._t - y._t || nk_(x.sub).localeCompare(nk_(y.sub)));
}
/* The HD REMARKS column of his email is not in the sheet - he writes it himself when he
   endorses - so cfg.HD_TEXT repeats that line for every row. Set it to '' to read the real
   HD REMARKS / HD RECOMMENDATION cells instead. */
function hdOf_(r, cfg) {
  if (cfg.HD_TEXT) return String(cfg.HD_TEXT).trim();
  for (const c of ['HD REMARKS', 'HD RECOMMENDATION']) {
    if (r[c] !== undefined && r[c] !== null && String(r[c]).trim() !== '') return String(r[c]).trim();
  }
  return '';
}
/* The owner's own table style: thin black borders, centred bold caps headers, no banner. */
function reportTable_(items, cfg) {
  const th = 'style="border:1px solid #4d4d4d;padding:8px 10px;font-size:12px;font-weight:700;text-align:center"';
  const td = 'style="border:1px solid #4d4d4d;padding:8px 10px;font-size:13px;text-align:center;vertical-align:top"';
  return '<table cellpadding="6" cellspacing="0" style="border-collapse:collapse">' +
    '<tr>' + cfg.COLS.map(c => `<th ${th}>${esc_(c)}</th>`).join('') + '</tr>' +
    items.map(x => '<tr>' + cfg.COLS.map(c => {
      const v = cellOf_(x, c);
      if (c === 'SR' && cfg.SR_LINK && v) return `<td ${td}><a href="${esc_(cfg.SR_LINK + v)}">${esc_(v)}</a></td>`;
      return `<td ${td}>${esc_(v) || '&mdash;'}</td>`;
    }).join('') + '</tr>').join('') + '</table>';
}
/* The MMMDA logo is fetched from the dashboard site and attached as an inline image, so it
   shows even when PLDT's mail client blocks pictures from the internet. If the fetch ever
   fails the email still goes out - it just links to the picture instead - and an empty
   LOGO_URL leaves the signature as plain text. */
function reportLogo_(cfg) {
  if (!cfg.LOGO_URL) return { src: '', blob: null };
  try {
    const blob = UrlFetchApp.fetch(cfg.LOGO_URL, { muteHttpExceptions: true });
    const code = blob.getResponseCode ? blob.getResponseCode() : 200;
    if (code !== 200) throw new Error('HTTP ' + code);
    return { src: 'cid:' + cfg.LOGO_KEY, blob: blob };
  } catch (err) {
    Logger.log(cfg.NAME + ' logo could not be attached (' + err + ') - the email will link to it instead');
    return { src: cfg.LOGO_URL, blob: null };
  }
}
function reportSig_(logo, cfg) {
  const img = logo && logo.src
    ? `<img src="${esc_(logo.src)}" width="${Number(cfg.LOGO_W) || 150}" height="${Number(cfg.LOGO_H) || 147}" ` +
      `alt="${esc_(cfg.LOGO_ALT)}" style="border:0;display:block;margin:0 0 10px 0">`
    : '';
  const lines = `<p><b>${cfg.SIGN.map(x => esc_(x)).join('<br>')}</b></p>`;
  if (!img) return lines;
  return cfg.LOGO_ABOVE === false ? lines + `<p>${img}</p>` : `<p>${img}</p>` + lines;
}
function buildReportMail_(items, logo, cfg) {
  const max = cfg.MAX_ROWS || 300, shown = items.slice(0, max);
  const stamp = Utilities.formatDate(new Date(), cfg.TIMEZONE || NOTICE.TIMEZONE, 'MMMyyyy').toUpperCase();
  const subject = cfg.SUBJECT + stamp;
  const extra = items.length - shown.length;
  const h = `<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#000;max-width:900px">` +
    `<p>${esc_(cfg.GREET)}</p><p>${esc_(cfg.INTRO)}</p>` + reportTable_(shown, cfg) +
    (extra > 0 ? `<p style="color:#667085;font-size:12px">&hellip;and ${extra} more not listed here.</p>` : '') +
    `<p style="margin-top:18px"><b>${esc_(cfg.THANKS)}</b></p>` + reportSig_(logo, cfg) +
    (cfg.FOOTER ? `<p style="color:#667085;font-size:12px">${esc_(cfg.FOOTER)}</p>` : '') + '</div>';
  const t = `${cfg.GREET}\n\n${cfg.INTRO}\n\n${rowsText_(items, max, cfg.COLS)}` +
    (extra > 0 ? `\n...and ${extra} more.` : '') + `\n\n${cfg.THANKS}\n\n${cfg.SIGN.join('\n')}`;
  return { subject: subject, html: h, text: t };
}
/* Two runs a day would mail the same pending row twice, so each report remembers the SR numbers
   it already sent that day in Script Properties (cfg.SENT_PREFIX + yyyyMMdd) and the next run
   drops them: the 2PM copy carries only what arrived after 8AM. The key is rebuilt daily and
   the older key is deleted, so a row still pending tomorrow is reported again. Only a real
   live send writes to it - a preview, a test copy or a DRY_RUN send never touches it. */
function sentKey_(cfg, d) { return cfg.SENT_PREFIX + Utilities.formatDate(d, cfg.TIMEZONE || NOTICE.TIMEZONE, 'yyyyMMdd'); }
function sentToday_(cfg) {
  const raw = String(PropertiesService.getScriptProperties().getProperty(sentKey_(cfg, new Date())) || '');
  const o = {};
  raw.split(',').forEach(k => { if (k) o[k] = 1; });
  return o;
}
function markSent_(cfg, items) {
  if (!items.length) return;
  const p = PropertiesService.getScriptProperties(), key = sentKey_(cfg, new Date());
  const list = String(p.getProperty(key) || '').split(',').filter(Boolean);
  items.forEach(i => { if (i.key && list.indexOf(i.key) < 0) list.push(i.key); });
  if (list.length > 700) Logger.log(cfg.NAME + ' dedupe list is at its 700 SR limit - the oldest rows may be listed again next run');
  p.setProperty(key, list.slice(-700).join(','));
  Object.keys(p.getProperties()).forEach(k => { if (k.indexOf(cfg.SENT_PREFIX) === 0 && k !== key) p.deleteProperty(k); });
}
/** send=false -> preview only, nothing leaves the account. While cfg.DRY_RUN is true the
 *  report goes to ADMIN_EMAILS and the CC list is ignored, so a test can never reach PLDT. */
function sendReport_(send, cfg) {
  const ss = reportSs_(cfg);
  const items = collectReport_(ss, cfg);
  const sent = sentToday_(cfg);
  const fresh = items.filter(i => !sent[i.key]);
  const admins = NOTICE.ADMIN_EMAILS.map(x => String(x).trim().toLowerCase()).filter(Boolean);
  const testTo = admins[0] || Session.getEffectiveUser().getEmail();
  const max = cfg.MAX_ROWS || 300;
  const res = {
    report: cfg.NAME, items: items.length, already: items.length - fresh.length, fresh: fresh.length,
    date: fmtD_(new Date()), dryRun: cfg.DRY_RUN, shown: Math.min(fresh.length, max),
    mode: send ? (cfg.DRY_RUN ? 'test' : 'live') : 'preview', quota: MailApp.getRemainingDailyQuota(),
    to: cfg.DRY_RUN ? [testTo] : cfg.TO, cc: cfg.DRY_RUN ? [] : cfg.CC
  };
  if (!items.length) { res.skipped = 'no rows tagged ' + cfg.STATUS + ' - nothing sent'; return res; }
  if (!fresh.length) { res.skipped = items.length + ' row(s) already reported today - nothing new, nothing sent'; return res; }
  const logo = reportLogo_(cfg);
  const m = buildReportMail_(fresh, logo, cfg);
  res.subject = m.subject; res.htmlChars = m.html.length;
  res.logo = logo.blob ? 'attached inline' : logo.src ? 'linked only' : 'none';
  if (!send) { res.text = m.text; return res; }
  if (MailApp.getRemainingDailyQuota() < 1) { res.skipped = 'daily Gmail quota reached'; return res; }
  const opt = {
    to: res.to.join(','), name: NOTICE.SENDER_NAME,
    subject: (cfg.DRY_RUN ? '[TEST] ' : '') + m.subject, body: m.text, htmlBody: m.html
  };
  if (res.cc.length) opt.cc = res.cc.join(',');
  if (logo.blob) opt.inlineImages = (function () { const o = {}; o[cfg.LOGO_KEY] = logo.blob; return o; })();
  try {
    MailApp.sendEmail(opt);
    res.sent = true;
    if (!cfg.DRY_RUN) { markSent_(cfg, fresh.slice(0, max)); res.marked = Math.min(fresh.length, max); }
  } catch (err) { res.error = String(err); }
  return res;
}
function runSfsNotices() { ensureReportTriggers_(); return sendReport_(true, SFS); }
function runCvNotices() { ensureReportTriggers_(); return sendReport_(true, CV); }
/* Dropdown-runnable: sends today's report once, right now, honouring that report's DRY_RUN. */
function sendSfsReport() { return sendReport_(true, SFS); }
function sendCvReport() { return sendReport_(true, CV); }
/* Dropdown-runnable: logs exactly what PLDT would receive, without sending anything and
   without touching the dedupe list. */
function previewReport_(cfg) {
  const r = sendReport_(false, cfg);
  Logger.log(cfg.NAME + ' | rows tagged ' + cfg.STATUS + ': ' + r.items + ' | new since the last run: ' + r.fresh +
    (r.fresh ? ' | shown in the table: ' + r.shown : '') +
    ' | logo: ' + (r.logo || 'not fetched - no rows, so there was no email to build') +
    ' | would go to: ' + r.to.join(',') + ' | cc: ' + (r.cc.length ? r.cc.join(',')
      : cfg.DRY_RUN ? 'none (DRY_RUN is on)' : 'none - every address is in the To line'));
  if (!r.fresh) { Logger.log(r.skipped); return r; }
  Logger.log('subject: ' + r.subject + ' | html chars: ' + r.htmlChars);
  Logger.log(r.text);
  return r;
}
function sfsPreview() { return previewReport_(SFS); }
function cvPreview() { return previewReport_(CV); }
/* Dropdown-runnable TEST COPY, one per report. It forces that report's DRY_RUN on while it
   runs, so it can never reach PLDT even while the real report is live - without that, the
   borrowed rows below would go out as endorsements. On most days the live rule has 0 rows and
   there is nothing to look at, so it temporarily matches cfg.TEST.STATUS instead (a value that
   exists today) and lists at most cfg.TEST.MAX_ROWS rows so the sample stays short. STATUS,
   MAX_ROWS and DRY_RUN are restored before it returns, whatever happens inside, and the last
   log line prints what they went back to. */
function testReport_(cfg) {
  const keepStatus = cfg.STATUS, keepMax = cfg.MAX_ROWS, keepDry = cfg.DRY_RUN;
  cfg.STATUS = cfg.TEST.STATUS;
  cfg.MAX_ROWS = Math.min(cfg.TEST.MAX_ROWS, keepMax);
  cfg.DRY_RUN = true;
  let r;
  try {
    r = sendReport_(true, cfg);
  } finally {
    cfg.STATUS = keepStatus;
    cfg.MAX_ROWS = keepMax;
    cfg.DRY_RUN = keepDry;
  }
  Logger.log(cfg.NAME + ' test copy ' + (r.sent ? 'sent to ' + r.to.join(',') : 'NOT sent') +
    ' | rows matched: ' + r.items + ' | shown in the table: ' + r.shown +
    ' | subject: ' + (r.subject || '-') + ' | logo: ' + (r.logo || '-'));
  Logger.log('settings restored: ' + cfg.STATUS + ' / max ' + cfg.MAX_ROWS + ' / DRY_RUN ' + cfg.DRY_RUN +
    (cfg.DRY_RUN ? '' : ' (LIVE - goes to ' + cfg.TO.join(',') + ')') +
    ' - the test matched "' + cfg.TEST.STATUS + '" instead' + (r.skipped ? ' | ' + r.skipped : ''));
  return r;
}
function sfsTestReport() { return testReport_(SFS); }
function cvTestReport() { return testReport_(CV); }
function hoursText_(cfg) { return cfg.SEND_HOURS.map(h => (h % 12 || 12) + (h < 12 ? 'AM' : 'PM')).join(' and '); }
function reportStatus_(cfg, handler) {
  return {
    report: cfg.NAME,
    installed: ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === handler),
    hours: cfg.SEND_HOURS, hour: cfg.SEND_HOURS[0], tz: cfg.TIMEZONE || NOTICE.TIMEZONE, dryRun: cfg.DRY_RUN,
    to: cfg.TO, cc: cfg.CC, status: cfg.STATUS, quota: MailApp.getRemainingDailyQuota(),
    file: cfg.SHEET_ID || NOTICE.SHEET_ID, tabs: reportTabs_(cfg).join(','),
    rule: cfg.FROM.join(' or ') + (cfg.EXACT ? ' = ' : ' contains ') + cfg.STATUS,
    dedupe: 'rows already mailed today are skipped; the list resets each day',
    note: 'Apps Script fires a day trigger somewhere inside each hour, not at an exact minute'
  };
}
/* One day trigger per hour in cfg.SEND_HOURS, and never a duplicate: every trigger already
   pointing at this handler is deleted first, so running this twice is safe. */
function installReportTrigger_(cfg, handler) {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === handler).forEach(t => ScriptApp.deleteTrigger(t));
  cfg.SEND_HOURS.forEach(h => ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(h).create());
  const st = reportStatus_(cfg, handler);
  Logger.log(cfg.NAME + ' trigger: ' + (st.installed ? 'installed' : 'NOT installed') +
    ' | runs in the ' + hoursText_(cfg) + ' hour (' + st.tz + ') | rule: ' + st.rule +
    ' | file: ' + st.file + ' | tabs: ' + st.tabs +
    ' | ' + (st.dryRun ? 'DRY_RUN is ON, copies go to ' + NOTICE.ADMIN_EMAILS.join(',') + ' only' : 'LIVE, goes to ' + st.to.join(',')) +
    ' | ' + st.dedupe + ' | ' + st.note);
  return st;
}
function installSfsTrigger() { return installReportTrigger_(SFS, 'runSfsNotices'); }
function installCvTrigger() { return installReportTrigger_(CV, 'runCvNotices'); }
/* Self-repairing schedule. The owner should not have to press Run for the plan to exist:
   every scheduled run (the agent notices and both reports) checks its own report triggers
   first and rebuilds only the ones whose count does not match cfg.SEND_HOURS. Apps Script
   cannot read a trigger's hour back, so the count is the check - a pair that is already right
   is never touched. Rebuilding at 8AM can put a fresh trigger inside the same hour window and
   fire it again, which is exactly why the daily dedupe exists: the second run reports
   "nothing new, nothing sent". If the console is refusing manual runs, or the CV trigger was
   never installed, tomorrow 8:00 AM fixes it on its own. */
function ensureReportTriggers_() {
  const repaired = [];
  try {
    const triggers = ScriptApp.getProjectTriggers();
    [[SFS, 'runSfsNotices'], [CV, 'runCvNotices']].forEach(pair => {
      const cfg = pair[0], handler = pair[1];
      const have = triggers.filter(t => t.getHandlerFunction() === handler);
      if (have.length === cfg.SEND_HOURS.length) return;
      have.forEach(t => ScriptApp.deleteTrigger(t));
      cfg.SEND_HOURS.forEach(h => ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(h).create());
      repaired.push(cfg.NAME);
      Logger.log(cfg.NAME + ' schedule repaired - now runs in the ' + hoursText_(cfg) + ' hour');
    });
    if (repaired.indexOf('CV') >= 0 && CV.DRY_RUN) cvReviewCopy_();
  } catch (err) {
    Logger.log('schedule check could not run (' + err + ') - the report itself still goes out');
  }
  return repaired;
}
/* The CV trigger is new, so he has probably never seen the mail it will send. One review copy
   straight to his inbox, at most once a day, so a repair cannot spam him twice in one morning. */
function cvReviewCopy_() {
  const p = PropertiesService.getScriptProperties(), key = 'CV_REVIEW_' + Utilities.formatDate(new Date(), CV.TIMEZONE || NOTICE.TIMEZONE, 'yyyyMMdd');
  if (p.getProperty(key)) return;
  Object.keys(p.getProperties()).forEach(k => { if (k.indexOf('CV_REVIEW_') === 0) p.deleteProperty(k); });
  p.setProperty(key, '1');
  Logger.log('CV was just put on the schedule - sending you one copy to read before it goes live');
  testReport_(CV);
}
/* Run sfsProbe or cvProbe from the dropdown to check a rule against the LIVE sheet before
   trusting it. It emails nothing and writes nothing. Per tab it logs the column names, the ten
   most common values of the status and remarks columns, every value mentioning cfg.PROBE with
   its row count (">>"), EVERY column that ever carries those words with its exact wording
   ("##" - that is what settles cfg.FROM), the full contents of any row whose subscriber is in
   PROBE_NAMES_, and how many rows the current rule would report. Paste that log back and the
   right cfg.FROM / cfg.EXACT / cfg.STATUS setting is decided by data instead of by guessing. */
const PROBE_NAMES_ = ['MAGILYN MACATANGAY', 'LORAINE MALBAS'];
function probeReport_(cfg) {
  const ss = reportSs_(cfg), re = new RegExp(cfg.PROBE.join('|'), 'i');
  Logger.log(cfg.NAME + ' | file: ' + ss.getName() + ' | tabs read for the report: ' + reportTabs_(cfg).join(', ') +
    (cfg.SHEET_ID ? ' (' + cfg.NAME + '.SHEET_ID)' : ' (same file as the agent notices)'));
  Logger.log('all tabs in that file: ' + ss.getSheets().map(s => s.getName() + '=' + Math.max(0, s.getLastRow() - 1)).join(', '));
  reportTabs_(cfg).concat([NOTICE.VALIDATORS_TAB]).forEach(name => {
    const rows = tab_(ss, name);
    if (!rows.length) { Logger.log(name + ': no readable rows (a header line with STATUS and AGENT is needed)'); return; }
    Logger.log(name + ' columns: ' + Object.keys(rows[0]).join(' | '));
    ['FINAL STATUS', 'CSP REMARKS', 'HD REMARKS', 'HD RECOMMENDATION', 'CSP STATUS'].forEach(col => {
      const c = {};
      rows.forEach(r => { const k = String(r[col] == null ? '' : r[col]).trim() || '(blank)'; c[k] = (c[k] || 0) + 1; });
      const keys = Object.keys(c);
      Logger.log(name + ' ' + col + ': ' + keys.sort((a, b) => c[b] - c[a]).slice(0, 10).map(k => k + '=' + c[k]).join(', ') + (keys.length > 10 ? ' ...(' + keys.length + ' distinct)' : ''));
      keys.filter(k => re.test(k)).forEach(k => Logger.log('  >> ' + name + ' ' + col + ' "' + k + '" rows=' + c[k]));
    });
    /* the decisive part: EVERY column, not just the five above, that ever carries those words */
    const hits = {};
    Object.keys(rows[0]).forEach(col => {
      const vals = {};
      rows.forEach(r => {
        const v = String(r[col] == null ? '' : r[col]).trim();
        if (re.test(v)) vals[v] = (vals[v] || 0) + 1;
      });
      if (Object.keys(vals).length) hits[col] = vals;
    });
    const hc = Object.keys(hits);
    Logger.log(name + ' columns that ever contain "' + cfg.PROBE.join('/') + '": ' + (hc.length ? hc.join(', ') : 'NONE'));
    hc.forEach(col => Object.keys(hits[col]).sort((a, b) => hits[col][b] - hits[col][a]).slice(0, 8)
      .forEach(v => Logger.log('  ## ' + name + ' ' + col + ' = "' + v.slice(0, 70) + '" rows=' + hits[col][v])));
  });
  PROBE_NAMES_.forEach(needle => {
    let found = 0;
    reportTabs_(cfg).forEach(name => tab_(ss, name).forEach(r => {
      if (nk_(r['SUBSCRIBER NAME']).indexOf(nk_(needle)) < 0) return;
      found++;
      Logger.log('MATCH ' + needle + ' [' + name + ']: ' + Object.keys(r)
        .filter(k => String(r[k] == null ? '' : r[k]).trim()).map(k => k + '=' + String(r[k]).slice(0, 70)).join(' ; '));
    }));
    Logger.log('rows matched for ' + needle + ': ' + found);
  });
  Logger.log('current rule would report ' + collectReport_(ss, cfg).length + ' row(s): ' +
    cfg.FROM.join(' or ') + (cfg.EXACT ? ' = ' : ' contains ') + cfg.STATUS);
}
function sfsProbe() { return probeReport_(SFS); }
function cvProbe() { return probeReport_(CV); }

/* --------------------------------------------------------------------- log API
   The dashboard reads and writes its shared activity + payment log through this
   web app instead of the old one, which answered every request with the whole
   13 MB database. Same JSONP style as getAllData, so no CORS surprises. */
const cell_ = v => v instanceof Date ? Utilities.formatDate(v, NOTICE.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(v == null ? '' : v);
const flat_ = v => cell_(v).replace(/[\r\n\t]+/g, ' ').slice(0, LOG.FIELD);

function logSs_() { return SpreadsheetApp.openById(LOG.SHEET_ID); }
function headRow_(sh, head) {
  const cur = sh.getRange(1, 1, 1, head.length).getValues()[0].map(x => String(x).trim()).join('|');
  if (cur === head.join('|')) return;
  sh.getRange(1, 1, 1, head.length).setValues([head]);
  sh.setFrozenRows(1);
}
function logTab_(p) {
  const ss = logSs_(), pay = /pay/i.test(String(p.kind || ''));
  const sh = ss.getSheetByName(pay ? LOG.PAY_TAB : LOG.ACT_TAB) || ss.insertSheet(pay ? LOG.PAY_TAB : LOG.ACT_TAB);
  headRow_(sh, pay ? LOG.PAY_HEAD : LOG.ACT_HEAD);
  return { sh: sh, pay: pay };
}
/* One-run tidy up: puts the original header back on the legacy tab (an earlier version of
   this file adopted it by mistake) and prepares the two tabs the dashboard really uses.
   Pick repairLogTabs() in the dropdown, Run, read the log. It deletes nothing. */
function repairLogTabs() {
  const ss = logSs_(), out = [];
  const legacy = ss.getSheetByName(LOG.LEGACY_TAB);
  if (legacy) {
    legacy.getRange(1, 1, 1, LOG.LEGACY_HEAD.length).setValues([LOG.LEGACY_HEAD]);
    out.push(LOG.LEGACY_TAB + ' header restored, ' + (legacy.getLastRow() - 1) + ' legacy rows kept untouched');
  } else out.push(LOG.LEGACY_TAB + ' not found - skipped');
  [LOG.ACT_TAB, LOG.PAY_TAB].forEach(n => {
    const sh = ss.getSheetByName(n) || ss.insertSheet(n);
    headRow_(sh, n === LOG.PAY_TAB ? LOG.PAY_HEAD : LOG.ACT_HEAD);
    out.push(n + ' ready, rows=' + Math.max(0, sh.getLastRow() - 1));
  });
  Logger.log(out.join('  |  '));
  return out;
}
function logRead_(p) {
  const t = logTab_(p), head = t.pay ? LOG.PAY_HEAD : LOG.ACT_HEAD;
  const limit = Math.max(1, Math.min(5000, parseInt(p.limit, 10) || LOG.READ_LIMIT));
  const last = t.sh.getLastRow(), n = Math.max(0, Math.min(limit, last - 1));
  if (!n) return [];
  return t.sh.getRange(last - n + 1, 1, n, head.length).getValues().map(v => t.pay
    ? { at: cell_(v[0]), key: cell_(v[1]), name: cell_(v[2]), account: cell_(v[3]), agent: cell_(v[4]), action: cell_(v[5]), label: cell_(v[6]), date: cell_(v[7]), remarks: cell_(v[8]), by: cell_(v[9]), code: cell_(v[10]), byName: cell_(v[11]) }
    : { time: cell_(v[0]), email: cell_(v[1]), code: cell_(v[2]), name: cell_(v[3]), action: cell_(v[4]), where: cell_(v[5]), search: cell_(v[6]), device: cell_(v[7]), visitor: cell_(v[8]), ts: Number(v[9]) || 0 });
}
function logWrite_(p) {
  const t = logTab_(p), head = t.pay ? LOG.PAY_HEAD : LOG.ACT_HEAD;
  let o;
  try { o = JSON.parse(String(p.data || '')); } catch (e) { return { success: false, error: 'data is not JSON' }; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { success: false, error: 'data must be an object' };
  if (!t.pay && !String(o.email || o.code || '').trim()) return { success: false, error: 'row needs an email or a code' };
  const last = t.sh.getLastRow();
  if (last >= LOG.MAX_ROWS) return { success: false, error: 'the ' + t.sh.getName() + ' tab is full - archive it' };
  const now = new Date();
  const time = Utilities.formatDate(now, NOTICE.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  const row = t.pay
    ? [time, flat_(o.key), flat_(o.name), flat_(o.account), flat_(o.agent), flat_(o.action), flat_(o.label), flat_(o.date), flat_(o.remarks), flat_(o.by), flat_(o.code), flat_(o.byName)]
    : [time, String(o.email || '').trim().toLowerCase().slice(0, LOG.FIELD), flat_(o.code), flat_(o.name), flat_(o.action), flat_(o.where), flat_(o.search), flat_(o.device), flat_(o.visitor), now.getTime()];
  const lock = LockService.getScriptLock();
  let locked = false;
  try { lock.waitLock(10000); locked = true; } catch (e) { /* an occasional lost race only costs one row */ }
  try { t.sh.getRange(last + 1, 1, 1, head.length).setValues([row]); }
  finally { if (locked) { try { lock.releaseLock(); } catch (e) {} } }
  return { success: true, row: last + 1, time: time };
}
function logStatus_() {
  const a = Math.max(0, logTab_({ kind: 'activity' }).sh.getLastRow() - 1);
  const p = Math.max(0, logTab_({ kind: 'pay' }).sh.getLastRow() - 1);
  return { sheet: LOG.SHEET_ID, activity: a, payments: p, tabs: logSs_().getSheets().map(s => s.getName()) };
}
/* JSONP when a callback is asked for (same as getAllData), plain JSON otherwise.
   The mime matters: Google sends X-Content-Type-Options: nosniff, so a text/plain
   script reply is refused by the browser even though curl happily reads it. */
function jsonOut_(obj, cb) {
  const fn = typeof cb === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]{0,40}$/.test(cb);
  return ContentService.createTextOutput(fn ? cb + '(' + JSON.stringify(obj) + ');' : JSON.stringify(obj))
    .setMimeType(fn ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------------- accounts API
   Sign-up, login and forgot-password for the dashboard. The browser never sends the
   password: it sends pwh(email + ':' + password), which is the exact string the page
   compares against its own mm_acc map. Keeping that value on the server instead of
   only in one browser is what lets an agent log in from a borrowed phone and what
   makes an emailed reset code possible at all.
   The tab stores the hash, not the password - but pwh is a 32-bit convenience hash, so
   treat it as a doorbell, not a vault. Whoever can read this tab can replay the hash,
   so keep the spreadsheet sharing tight (ACCT.SHEET_ID can point at a private file).
   The /exec replies never include the hash or the reset code. */
const acctSs_ = () => SpreadsheetApp.openById(ACCT.SHEET_ID || LOG.SHEET_ID);
const acctEmail_ = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || ''));
const acctHash_ = h => /^[0-9a-z]{4,20}$/.test(String(h || ''));
const one_ = v => String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, LOG.FIELD);
const now_ = () => Utilities.formatDate(new Date(), NOTICE.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
const today_ = () => Utilities.formatDate(new Date(), NOTICE.TIMEZONE, 'yyyy-MM-dd');

function acctTab_() {
  const ss = acctSs_();
  const sh = ss.getSheetByName(ACCT.TAB) || ss.insertSheet(ACCT.TAB);
  headRow_(sh, ACCT.HEAD);
  return sh;
}
/* 1-based row of this email, or 0 when it is not registered. */
function acctFind_(sh, email) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const col = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < col.length; i++) if (String(col[i][0]).trim().toLowerCase() === email) return i + 2;
  return 0;
}
function acctGet_(sh, r) {
  const v = sh.getRange(r, 1, 1, ACCT.HEAD.length).getValues()[0];
  return { email: String(v[0]).trim().toLowerCase(), hash: String(v[1]).trim(), code: String(v[2]).trim(),
    name: String(v[3]).trim(), last: cell_(v[4]), reset: String(v[5]).trim(), exp: Number(v[6]) || 0,
    tries: Number(v[7]) || 0, resets: Number(v[8]) || 0, day: String(v[9]).trim() };
}
function acctPut_(sh, r, o) {
  sh.getRange(r, 1, 1, ACCT.HEAD.length).setValues([[o.email, o.hash, o.code, o.name, o.last, o.reset, o.exp, o.tries, o.resets, o.day]]);
}
function acctResetsToday_(sh, day) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  let n = 0;
  sh.getRange(2, 9, last - 1, 2).getValues().forEach(r => { if (String(r[1]).trim() === day) n += Number(r[0]) || 0; });
  return n;
}
function acctCode_() {
  try { return String(Utilities.getUniformInteger(100000, 999999)); }
  catch (e) {
    const d = String(Utilities.getUuid()).replace(/[^0-9]/g, '');
    return String(100000 + (parseInt(d.slice(0, 6), 10) || 123456) % 900000);
  }
}
function acctMail_(email, name, code) {
  const to = NOTICE.DRY_RUN ? NOTICE.ADMIN_EMAILS.join(',') : email;
  if (!to) return false;
  MailApp.sendEmail({
    to: to,
    name: NOTICE.SENDER_NAME,
    subject: (NOTICE.DRY_RUN ? '[TEST for ' + email + '] ' : '') + 'Your password reset code - 3MDA Logistics',
    body: [
      (name ? 'Dear ' + name + ',' : 'Dear Agent,'),
      '',
      'A request to reset the password of the 3MDA Logistics agent dashboard account ' + email + ' has been received.',
      '',
      'Your reset code is:  ' + code,
      '',
      'This code is valid for ' + ACCT.CODE_TTL_MIN + ' minutes. To set a new password:',
      '1. Return to the dashboard sign-in page.',
      '2. Enter the code above.',
      '3. Choose a new password of at least 6 characters, then confirm it.',
      '',
      'If you did not make this request, no action is needed - your current password remains active. Please keep this code private, as anyone who has it can set a new password.',
      '',
      NT_.REGARDS,
      NOTICE.SENDER_NAME,
      '',
      'Automated message from the 3MDA Logistics dashboard. Please do not reply to this email.'
    ].join('\n')
  });
  return true;
}
function acctHandle_(p) {
  const op = String(p.op || '').toLowerCase();
  const email = String(p.email || '').trim().toLowerCase();
  if (!acctEmail_(email)) return { ok: false, reason: 'bademail' };
  const sh = acctTab_();
  const lock = LockService.getScriptLock();
  let locked = false;
  try { lock.waitLock(8000); locked = true; } catch (e) { /* a lost race costs one attempt, not a corrupted row */ }
  try { return acctOp_(sh, op, email, p); }
  finally { if (locked) { try { lock.releaseLock(); } catch (e) {} } }
}
function acctOp_(sh, op, email, p) {
  const r = acctFind_(sh, email);
  const o = r ? acctGet_(sh, r) : null;
  const day = today_();
  if (op === 'exists') return { ok: true, exists: !!o };
  if (op === 'create') {
    if (o) return { ok: false, reason: 'exists' };
    if (!acctHash_(p.h)) return { ok: false, reason: 'badhash' };
    if (sh.getLastRow() >= ACCT.MAX_ROWS) return { ok: false, reason: 'full' };
    sh.appendRow([email, String(p.h), one_(p.code).slice(0, 12), one_(p.name), '', '', 0, 0, 0, '']);
    return { ok: true };
  }
  if (!o || !o.hash) return { ok: false, reason: 'nouser' };
  if (op === 'login') {
    if (o.tries >= ACCT.MAX_TRIES) return { ok: false, reason: 'locked' };
    if (o.hash !== String(p.h || '')) {
      o.tries += 1; acctPut_(sh, r, o);
      return { ok: false, reason: 'bad', left: Math.max(0, ACCT.MAX_TRIES - o.tries) };
    }
    o.tries = 0; o.last = now_(); acctPut_(sh, r, o);
    return { ok: true, code: o.code, name: o.name };
  }
  if (op === 'profile') {
    if (o.hash !== String(p.h || '')) return { ok: false, reason: 'bad' };
    o.code = one_(p.code).slice(0, 12); o.name = one_(p.name).slice(0, 60);
    acctPut_(sh, r, o);
    return { ok: true };
  }
  if (op === 'forgot') {
    if (MailApp.getRemainingDailyQuota() < ACCT.QUOTA_FLOOR) return { ok: false, reason: 'quota' };
    if (acctResetsToday_(sh, day) >= ACCT.MAX_RESETS_TOTAL) return { ok: false, reason: 'quota' };
    if (o.day === day && o.resets >= ACCT.MAX_RESETS_PER_EMAIL) return { ok: false, reason: 'wait' };
    const code = acctCode_();
    o.reset = code; o.exp = Date.now() + ACCT.CODE_TTL_MIN * 60000; o.tries = 0;
    o.resets = (o.day === day ? o.resets : 0) + 1; o.day = day;
    acctPut_(sh, r, o);
    if (!acctMail_(email, o.name, code)) return { ok: false, reason: 'nomail' };
    return { ok: true, name: o.name };
  }
  if (op === 'check' || op === 'reset') {
    const why = acctCodeOk_(sh, r, o, p);
    if (why) return { ok: false, reason: why, left: Math.max(0, ACCT.MAX_TRIES - o.tries) };
    if (op === 'check') return { ok: true, name: o.name };
    if (!acctHash_(p.h)) return { ok: false, reason: 'badhash' };
    o.hash = String(p.h); o.reset = ''; o.exp = 0; o.tries = 0; o.last = now_();
    acctPut_(sh, r, o);
    return { ok: true, code: o.code, name: o.name };
  }
  return { ok: false, reason: 'unknown op' };
}
/* '' when the emailed code is still current and was typed correctly. Every wrong try is
   counted, so a 6-digit code cannot be guessed. check only verifies it (the dashboard uses
   that to move on to the new-password step); reset swaps the password and burns the code. */
function acctCodeOk_(sh, r, o, p) {
  if (!o.reset) return 'nocode';
  if (o.tries >= ACCT.MAX_TRIES) return 'locked';
  if (o.exp && o.exp < Date.now()) return 'expired';
  const c = String(p.c || '').replace(/\D/g, '');
  if (c.length !== 6) return 'badcode';
  if (c === o.reset) return '';
  o.tries += 1; acctPut_(sh, r, o);
  return 'badcode';
}

/* ------------------------------------------------------- trigger + web app glue */
function sendAgentNotices() { sendNotices_(true); }
function runAgentNotices() { ensureReportTriggers_(); return sendNotices_(true); }
function installNoticeTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'runAgentNotices').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('runAgentNotices').timeBased().everyDays(1).atHour(NOTICE.SEND_HOUR).create();
}
function noticeStatus_() {
  const installed = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'runAgentNotices');
  return { installed: installed, hour: NOTICE.SEND_HOUR, tz: NOTICE.TIMEZONE, dryRun: NOTICE.DRY_RUN, sender: NOTICE.SENDER_NAME, needsToken: !!sendToken_() };
}
/* The manual-send token lives in Script Properties, never in this file or the repo.
   Run setNoticeSendToken() from the dropdown and copy the token it logs. */
function sendToken_() { return String(PropertiesService.getScriptProperties().getProperty('NOTICE_SEND_TOKEN') || ''); }
function setNoticeSendToken() {
  const tok = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
  PropertiesService.getScriptProperties().setProperty('NOTICE_SEND_TOKEN', tok);
  Logger.log('Send token: ' + tok + '  - type it in the dashboard when it asks before Send emails now.');
}
function clearNoticeSendToken() {
  PropertiesService.getScriptProperties().deleteProperty('NOTICE_SEND_TOKEN');
  Logger.log('Send token cleared - the dashboard will send without asking again.');
}
function noticeWebApp_(e) {
  const a = (e && e.parameter && e.parameter.action) || '';
  const tok = sendToken_();
  if (a === 'noticeSend' && tok && String((e && e.parameter && e.parameter.t) || '') !== tok) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Send token missing or wrong - type the token you set with setNoticeSendToken().' })).setMimeType(ContentService.MimeType.JSON);
  }
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
  const p = (e && e.parameter) || {};
  const a = String(p.action || '');
  if (/^notice(Preview|Send|Status|Install)$/.test(a)) return noticeWebApp_(e);
  if (/^(logRead|logWrite|logStatus)$/.test(a)) {
    let out;
    try {
      out = a === 'logRead' ? { ok: true, rows: logRead_(p) } : a === 'logStatus' ? logStatus_() : logWrite_(p);
    } catch (err) { out = a === 'logWrite' ? { success: false, error: String(err) } : { ok: false, error: String(err) }; }
    return jsonOut_(out, p.callback);
  }
  if (a === 'acct') {
    let out;
    try { out = acctHandle_(p); } catch (err) { out = { ok: false, reason: 'error', error: String(err) }; }
    return jsonOut_(out, p.callback);
  }
  return ContentService.createTextOutput(JSON.stringify({
    error: 'unknown action', use: 'noticeStatus | noticePreview | noticeSend | noticeInstall | logRead | logWrite | logStatus | acct'
  })).setMimeType(ContentService.MimeType.JSON);
}
