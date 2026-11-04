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

/* The SFS VALIDATION report: one email a day to PLDT listing the applications waiting to
   be validated, in the same shape as the owner's manual "3MDA_SFS_VALIDATION_OCT2026"
   mail - greeting, one line, a bordered table, Thank you, his signature block.
   DRY_RUN must stay true until the owner has seen a real copy: while it is true the
   report goes to ADMIN_EMAILS and the CC list below is NOT used, so PLDT never receives
   anything from a test. SFS.FROM / SFS.STATUS decide which rows count - sfsProbe() exists
   to measure that against his live sheet before the switch is flipped. */
const SFS = {
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
  FROM: ['FINAL STATUS'],            // the owner's rule: the row is endorsed once FINAL STATUS carries the SFS tag
  EXACT: false,                      // false also catches "SFS VALIDATION - WITH UPLOADED DOCS" typed into FINAL STATUS
  HD_TEXT: 'SFS VALIDATION - WITH UPLOADED DOCS',
                                     // the PLDT sheet has no HD REMARKS column - the owner writes this line himself
                                     // when he endorses, so the report repeats it. '' = read HD REMARKS / HD RECOMMENDATION instead.
  COLS: ['DATE', 'SUBSCRIBER NAME', 'SR', 'CSP REMARKS', 'HD REMARKS'],
  DATE_FORMAT: 'M/d/yyyy',           // the owner writes 10/23/2026, not 23 Oct 2026
  SR_LINK: '',                       // 'https://…' prefix if the SR number should be a hyperlink, '' = plain
  SEND_HOUR: 8,                      // Apps Script fires a day trigger somewhere inside this hour, not at an exact minute
  DRY_RUN: true,
  MAX_ROWS: 300,                     // rows listed; the rest are summarised
  TIMEZONE: ''                       // '' = NOTICE.TIMEZONE
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

/* ---------------------------------------------------------------- SFS VALIDATION
   One report a day to PLDT listing every application whose FINAL STATUS carries the
   "SFS VALIDATION" tag - in this data those are duplicate submissions waiting to be
   validated. The tab reader and the wording are shared with the agent notices, but the
   table is the owner's own black-bordered one, and the HD REMARKS column repeats a phrase
   he types by hand (SFS.HD_TEXT) because the sheet has no such column.
   Nothing is emailed when no row matches. */
/* Which column decides that a row belongs in the report? SFS.FROM is tried in order and
   the first non-empty value wins, so the rule can be moved to another column without
   touching anything else. SFS.EXACT=false (the default) also catches the longer wording
   "SFS VALIDATION - WITH UPLOADED DOCS" if it is ever typed into FINAL STATUS itself. */
function sfsStatusOf_(r) {
  for (const c of SFS.FROM) {
    const v = r[c];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}
function fmtSfs_(v) {
  const tz = SFS.TIMEZONE || NOTICE.TIMEZONE;
  if (v instanceof Date) return Utilities.formatDate(v, tz, SFS.DATE_FORMAT);
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : Utilities.formatDate(d, tz, SFS.DATE_FORMAT);
}
function collectSfs_(ss) {
  const want = nk_(SFS.STATUS), out = [], seen = {};
  NOTICE.SALES_TABS.forEach(name => tab_(ss, name).forEach(r => {
    const st = sfsStatusOf_(r), match = nk_(st);
    if (SFS.EXACT ? match !== want : match.indexOf(want) < 0) return;
    const dv = pick_(r, 'DATE'), raw = dv instanceof Date ? dv.getTime() : new Date(dv).getTime();
    const it = {
      date: fmtSfs_(dv), sub: String(pick_(r, 'SUB')).trim(), plan: String(pick_(r, 'PLAN')).trim(),
      status: st, remarks: String(pick_(r, 'PAYREM')).trim(),
      sr: String(pick_(r, 'SR')).replace(/\.0$/, '').trim(), agent: String(pick_(r, 'AGENT')).trim(),
      tl: String(pick_(r, 'TL')).trim(), csp: String(pick_(r, 'CSP')).trim(),
      cspRem: String(pick_(r, 'CSPREM')).trim(), hd: sfsHdOf_(r), _t: isNaN(raw) ? 0 : raw
    };
    const k = it.sr || (it.date + '|' + it.sub + '|' + it.plan);
    if (seen[k]) return;
    seen[k] = 1;
    out.push(it);
  }));
  /* oldest first - a validation queue is worked from the top */
  return out.sort((x, y) => x._t - y._t || nk_(x.sub).localeCompare(nk_(y.sub)));
}
/* The HD REMARKS column of his email is not in the sheet - he writes it himself when he
   endorses - so SFS.HD_TEXT repeats that line for every row. Set it to '' to read the real
   HD REMARKS / HD RECOMMENDATION cells instead. */
function sfsHdOf_(r) {
  if (SFS.HD_TEXT) return String(SFS.HD_TEXT).trim();
  for (const c of ['HD REMARKS', 'HD RECOMMENDATION']) {
    if (r[c] !== undefined && r[c] !== null && String(r[c]).trim() !== '') return String(r[c]).trim();
  }
  return '';
}
/* The owner's own table style: thin black borders, centred bold caps headers, no banner. */
function sfsTable_(items) {
  const th = 'style="border:1px solid #4d4d4d;padding:8px 10px;font-size:12px;font-weight:700;text-align:center"';
  const td = 'style="border:1px solid #4d4d4d;padding:8px 10px;font-size:13px;text-align:center;vertical-align:top"';
  return '<table cellpadding="6" cellspacing="0" style="border-collapse:collapse">' +
    '<tr>' + SFS.COLS.map(c => `<th ${th}>${esc_(c)}</th>`).join('') + '</tr>' +
    items.map(x => '<tr>' + SFS.COLS.map(c => {
      const v = cellOf_(x, c);
      if (c === 'SR' && SFS.SR_LINK && v) return `<td ${td}><a href="${esc_(SFS.SR_LINK + v)}">${esc_(v)}</a></td>`;
      return `<td ${td}>${esc_(v) || '&mdash;'}</td>`;
    }).join('') + '</tr>').join('') + '</table>';
}
/* The MMMDA logo is fetched from the dashboard site and attached as an inline image, so it
   shows even when PLDT's mail client blocks pictures from the internet. If the fetch ever
   fails the email still goes out - it just links to the picture instead - and an empty
   SFS.LOGO_URL leaves the signature as plain text. */
function sfsLogo_() {
  if (!SFS.LOGO_URL) return { src: '', blob: null };
  try {
    const blob = UrlFetchApp.fetch(SFS.LOGO_URL, { muteHttpExceptions: true });
    const code = blob.getResponseCode ? blob.getResponseCode() : 200;
    if (code !== 200) throw new Error('HTTP ' + code);
    return { src: 'cid:' + SFS.LOGO_KEY, blob: blob };
  } catch (err) {
    Logger.log('SFS logo could not be attached (' + err + ') - the email will link to it instead');
    return { src: SFS.LOGO_URL, blob: null };
  }
}
function sfsSig_(logo) {
  const img = logo && logo.src
    ? `<img src="${esc_(logo.src)}" width="${Number(SFS.LOGO_W) || 150}" height="${Number(SFS.LOGO_H) || 147}" ` +
      `alt="${esc_(SFS.LOGO_ALT)}" style="border:0;display:block;margin:0 0 10px 0">`
    : '';
  const lines = `<p><b>${SFS.SIGN.map(x => esc_(x)).join('<br>')}</b></p>`;
  if (!img) return lines;
  return SFS.LOGO_ABOVE === false ? lines + `<p>${img}</p>` : `<p>${img}</p>` + lines;
}
function sfsBuild_(items, logo) {
  const max = SFS.MAX_ROWS || 300, shown = items.slice(0, max);
  const stamp = Utilities.formatDate(new Date(), SFS.TIMEZONE || NOTICE.TIMEZONE, 'MMMyyyy').toUpperCase();
  const subject = `3MDA_SFS_VALIDATION_${stamp}`;
  const extra = items.length - shown.length;
  const h = `<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#000;max-width:900px">` +
    `<p>${esc_(SFS.GREET)}</p><p>${esc_(SFS.INTRO)}</p>` + sfsTable_(shown) +
    (extra > 0 ? `<p style="color:#667085;font-size:12px">&hellip;and ${extra} more not listed here.</p>` : '') +
    `<p style="margin-top:18px"><b>${esc_(SFS.THANKS)}</b></p>` + sfsSig_(logo) +
    (SFS.FOOTER ? `<p style="color:#667085;font-size:12px">${esc_(SFS.FOOTER)}</p>` : '') + '</div>';
  const t = `${SFS.GREET}\n\n${SFS.INTRO}\n\n${rowsText_(items, max, SFS.COLS)}` +
    (extra > 0 ? `\n...and ${extra} more.` : '') + `\n\n${SFS.THANKS}\n\n${SFS.SIGN.join('\n')}`;
  return { subject: subject, html: h, text: t };
}
/** send=false -> preview only, nothing leaves the account. While SFS.DRY_RUN is true the
 *  report goes to ADMIN_EMAILS and the CC list is ignored, so a test can never reach PLDT. */
function sendSfs_(send) {
  const ss = NOTICE.SHEET_ID ? SpreadsheetApp.openById(NOTICE.SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const items = collectSfs_(ss);
  const admins = NOTICE.ADMIN_EMAILS.map(x => String(x).trim().toLowerCase()).filter(Boolean);
  const testTo = admins[0] || Session.getEffectiveUser().getEmail();
  const res = {
    items: items.length, date: fmtD_(new Date()), dryRun: SFS.DRY_RUN,
    mode: send ? (SFS.DRY_RUN ? 'test' : 'live') : 'preview', quota: MailApp.getRemainingDailyQuota(),
    to: SFS.DRY_RUN ? [testTo] : SFS.TO, cc: SFS.DRY_RUN ? [] : SFS.CC
  };
  if (!items.length) { res.skipped = 'no rows tagged ' + SFS.STATUS + ' - nothing sent'; return res; }
  const logo = sfsLogo_();
  const m = sfsBuild_(items, logo);
  res.subject = m.subject; res.htmlChars = m.html.length;
  res.logo = logo.blob ? 'attached inline' : logo.src ? 'linked only' : 'none';
  if (!send) { res.text = m.text; return res; }
  if (MailApp.getRemainingDailyQuota() < 1) { res.skipped = 'daily Gmail quota reached'; return res; }
  const opt = {
    to: res.to.join(','), name: NOTICE.SENDER_NAME,
    subject: (SFS.DRY_RUN ? '[TEST] ' : '') + m.subject, body: m.text, htmlBody: m.html
  };
  if (res.cc.length) opt.cc = res.cc.join(',');
  if (logo.blob) opt.inlineImages = (function () { const o = {}; o[SFS.LOGO_KEY] = logo.blob; return o; })();
  try { MailApp.sendEmail(opt); res.sent = true; } catch (err) { res.error = String(err); }
  return res;
}
function runSfsNotices() { return sendSfs_(true); }
/* Dropdown-runnable: sends today's report once, right now, honouring SFS.DRY_RUN. */
function sendSfsReport() { return sendSfs_(true); }
/* Dropdown-runnable: logs exactly what PLDT would receive, without sending anything. */
function sfsPreview() {
  const r = sendSfs_(false);
  Logger.log('rows tagged ' + SFS.STATUS + ': ' + r.items + ' | logo: ' + r.logo + ' | would go to: ' + r.to.join(',') + (r.cc.length ? ' | cc: ' + r.cc.join(',') : ' | cc: none while DRY_RUN is on'));
  if (!r.items) { Logger.log('Nothing to report today - the daily run would send no email.'); return r; }
  Logger.log('subject: ' + r.subject + ' | html chars: ' + r.htmlChars);
  Logger.log(r.text);
  return r;
}
function sfsStatus_() {
  return {
    installed: ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'runSfsNotices'),
    hour: SFS.SEND_HOUR, tz: SFS.TIMEZONE || NOTICE.TIMEZONE, dryRun: SFS.DRY_RUN,
    to: SFS.TO, cc: SFS.CC, status: SFS.STATUS, quota: MailApp.getRemainingDailyQuota(),
    rule: SFS.FROM.join(' or ') + (SFS.EXACT ? ' = ' : ' contains ') + SFS.STATUS,
    note: 'Apps Script fires a day trigger somewhere inside the hour, not at an exact minute'
  };
}
function installSfsTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'runSfsNotices').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('runSfsNotices').timeBased().everyDays(1).atHour(SFS.SEND_HOUR).create();
  return sfsStatus_();
}
/* Run sfsProbe from the dropdown to check the rule against the LIVE sheet before turning
   SFS.DRY_RUN off. It emails nothing and writes nothing. It logs, per tab: the column names,
   the most common FINAL STATUS / HD REMARKS / HD RECOMMENDATION / CSP STATUS values, every
   value that mentions SFS with its row count, EVERY column that ever contains the word SFS
   with its exact wording (the "##" lines - that is what settles SFS.FROM), the full contents
   of any row whose subscriber is in SFS_PROBE_ (the two names from the owner's own sample
   email), and how many rows the current rule would report. Paste that log back and the right
   SFS.FROM / SFS.EXACT setting is decided by data instead of by guessing. */
const SFS_PROBE_ = ['MAGILYN MACATANGAY', 'LORAINE MALBAS'];
function sfsProbe() {
  const ss = SpreadsheetApp.openById(NOTICE.SHEET_ID);
  Logger.log('file: ' + ss.getName() + ' | tabs: ' + ss.getSheets().map(s => s.getName() + '=' + Math.max(0, s.getLastRow() - 1)).join(', '));
  NOTICE.SALES_TABS.concat([NOTICE.VALIDATORS_TAB]).forEach(name => {
    const rows = tab_(ss, name);
    if (!rows.length) { Logger.log(name + ': no readable rows (a header line with STATUS and AGENT is needed)'); return; }
    Logger.log(name + ' columns: ' + Object.keys(rows[0]).join(' | '));
    ['FINAL STATUS', 'HD REMARKS', 'HD RECOMMENDATION', 'CSP STATUS'].forEach(col => {
      const c = {};
      rows.forEach(r => { const k = String(r[col] == null ? '' : r[col]).trim() || '(blank)'; c[k] = (c[k] || 0) + 1; });
      const keys = Object.keys(c);
      Logger.log(name + ' ' + col + ': ' + keys.sort((a, b) => c[b] - c[a]).slice(0, 10).map(k => k + '=' + c[k]).join(', ') + (keys.length > 10 ? ' ...(' + keys.length + ' distinct)' : ''));
      keys.filter(k => /SFS/i.test(k)).forEach(k => Logger.log('  >> ' + name + ' ' + col + ' "' + k + '" rows=' + c[k]));
    });
    /* the decisive part: EVERY column, not just the four above, that ever carries the word SFS */
    const hits = {};
    Object.keys(rows[0]).forEach(col => {
      const vals = {};
      rows.forEach(r => {
        const v = String(r[col] == null ? '' : r[col]).trim();
        if (/SFS/i.test(v)) vals[v] = (vals[v] || 0) + 1;
      });
      if (Object.keys(vals).length) hits[col] = vals;
    });
    const hc = Object.keys(hits);
    Logger.log(name + ' columns that ever contain "SFS": ' + (hc.length ? hc.join(', ') : 'NONE'));
    hc.forEach(col => Object.keys(hits[col]).sort((a, b) => hits[col][b] - hits[col][a]).slice(0, 8)
      .forEach(v => Logger.log('  ## ' + name + ' ' + col + ' = "' + v.slice(0, 70) + '" rows=' + hits[col][v])));
  });
  SFS_PROBE_.forEach(needle => {
    let found = 0;
    NOTICE.SALES_TABS.forEach(name => tab_(ss, name).forEach(r => {
      if (nk_(r['SUBSCRIBER NAME']).indexOf(nk_(needle)) < 0) return;
      found++;
      Logger.log('MATCH ' + needle + ' [' + name + ']: ' + Object.keys(r)
        .filter(k => String(r[k] == null ? '' : r[k]).trim()).map(k => k + '=' + String(r[k]).slice(0, 70)).join(' ; '));
    }));
    Logger.log('rows matched for ' + needle + ': ' + found);
  });
  Logger.log('current rule would report ' + collectSfs_(ss).length + ' row(s): ' + SFS.FROM.join(' or ') + (SFS.EXACT ? ' = ' : ' contains ') + SFS.STATUS);
}

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
function runAgentNotices() { return sendNotices_(true); }
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
