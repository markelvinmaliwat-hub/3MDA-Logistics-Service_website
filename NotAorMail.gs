/* NotAorMail.gs - the NOT AOR mail (the sixth thing that actually sends, since AFD29 is still only a scaffold).
   The owner's ask, 2026-11-11: "sa AFD email gumawa ka din ng bagong email para sa NOT AOR pero yung
   barangay at city nito i-validate mo muna gamit ang tab na CLUSTER tapos saka mo ito gawan ng email
   at ipadala sa kung anong cluster sya dapat ipadala, pero ang mga email na padadalhan ay same padin".
   His design ruling the same day: "KUNG ANO YUNG NASA AFD/AFD12 GANUN DIN ANG GAGAWIN" - so this file
   adds NO new wording, NO new address and NO new condition. It reuses AgentNotices' AFD machine
   (collectReport_, sendReport_, buildReportMail_) and changes only one thing: the cluster named in
   the mail is read from his CLUSTER tab by BRGY + CITY instead of from the row's own CLUSTER cell.
   AFD and AFD12 are untouched - they keep selecting cluster 11 and 12 exactly as they have since 2026-11-05.

   TO INSTALL: paste this whole file as a NEW Apps Script file named NotAorMail, in the same project
   as AgentNotices. That is the only step - AgentNotices.gs itself is NOT edited, so the four live
   mails cannot be disturbed by this one, and deleting this file removes the whole feature.
   No deployment is needed either: every entry below runs from the function dropdown (Head code).
   Everything here is named nao* / notAor* / NOTAOR on purpose: AorProbe.gs already owns AOR and aor*,
   and Apps Script loads all files into ONE shared scope, so a repeated name would break the live mails.

   DROPDOWN ENTRIES
     notAorTestReport()    - [TEST] copy to his own address, up to NOTAOR.TEST.MAX_GROUPS mails
     notAorPreview()       - what the mail would look like, nothing sent, no dedupe written
     sendNotAorReport()    - mail right now, bypassing the 10:30 gate (respects DRY_RUN)
     runNotAorNotices()    - the scheduled handler (waits for 10:30 like AFD does)
     installNotAorTrigger()- puts the 10AM + 11AM pair on the clock
*/

/* The NOT AOR mail, as the owner asked on 2026-11-11: "sa AFD email gumawa ka din ng
   bagong email para sa NOT AOR pero yung barangay at city nito i-validate mo muna gamit ang tab na
   CLUSTER tapos saka mo ito gawan ng email at ipadala sa kung anong cluster sya dapat ipadala, pero
   ang mga email na padadalhan ay same padin". When asked how much of AFD to copy he answered
   "KUNG ANO YUNG NASA AFD/AFD12 GANUN DIN ANG GAGAWIN", so EVERY condition is AFD's own - the
   AFD + RESCHEDULE tag in FINAL STATUS, the RPR exclusion, the hand-written revisit day in
   HD RECOMMENDATION that must be the day the report runs, the 10:30 AM gate, the same four
   addresses, his exact wording and the per-day SR dedupe.
   AFD and AFD12 are NOT touched by this section - they keep reading the CLUSTER column of the
   sales row. What differs here is only WHERE the cluster comes from: the sales row says
   "NOT AOR", so the real cluster is looked up in the CLUSTER tab ("BGY & CITY" -> CLUSTER, 1,742
   rows as measured by aorProbe on his live file 2026-11-11) using the row's BARANGAY + CITY. Each
   validated cluster becomes its own mail, the way AFD and AFD12 are already one mail per cluster -
   Sir Jack can tell from the subject alone which cluster is being endorsed.
   The probe's measured answer is why the lookup can miss: of 262 NOT AOR rows it named 200 and
   could not name 62. Those 62 are left OUT of the mail and printed in the log, because an
   endorsement addressed to no cluster is worse than no endorsement. DRY_RUN starts true. */
const NOTAOR = {
  NAME: 'NOT AOR',
  TO: ['lsabat@pldt.com.ph'],
  CC: ['t-jesnavarro@supplier.pldt.com.ph', 't-jesnavarro@pldt365.onmicrosoft.com', 'abmadlangbayan0510@icloud.com'],
  GREET: 'Hi Sir Jack,',
  INTRO: 'For endorsement to CLUSTER {CLUSTER} for revisit. The call-out has already been completed and the subscribers are available today; we would appreciate your assistance in having them revisited.',
  CLOSE: 'Should you have any concerns regarding the scheduled revisit, please kindly reply to this email so that we may address them immediately.',
  THANKS: 'Thank you !',
  SIGN: ['Mark Maliwat', 'Sales Validator - MMMDA Logistics', 'Service Cavite Upland'],
  LOGO_URL: 'https://markelvinmaliwat-hub.github.io/3MDA-Logistics-Service_website/assets/mmmda-logo.jpg',
  LOGO_KEY: 'mmmda-logo',
  LOGO_ALT: 'MMMDA Logistics Service',
  LOGO_W: 150, LOGO_H: 147,
  LOGO_ABOVE: true,
  FOOTER: '',
  STATUS: ['AFD', 'RESCHEDULE'],        // the same two words, in the same cell as AFD
  SHEET_ID: '',
  TABS: [],
  FROM: ['FINAL STATUS'],
  EXACT: false,
  /* NOT a cfg.WHERE filter, on purpose. cellEq_ falls back to comparing digits, so a WHERE of
     'NOT AOR' would also admit every row whose CLUSTER cell is text with no digits in it -
     "NOT IN CAVITE", "N/A", "-". The rows are selected by exact wording in notAorGroups_ instead. */
  SOURCE_CLUSTER: 'NOT AOR',
  CLUSTER_TAB: 'CLUSTER',               // his tab, headers "BGY & CITY" | "CLUSTER"
  NOT: [{ COL: 'HD RECOMMENDATION', HAS: 'RPR' }],
  ON_DAY: 'HD RECOMMENDATION',
  HD_TEXT: 'PART OF AFD {DATE} - SUBS WANT TO REQUEST FOR REVISIT',
  COLS: ['DATE', 'SUBSCRIBER NAME', 'SR', 'ACCT', 'PR', 'CSP STATUS', 'BRGY', 'CITY', 'CLUSTER', 'HD RECOMMENDATION'],
  DATE_FORMAT: 'M/d/yyyy',
  SR_LINK: '',
  SEND_HOURS: [10, 11],
  SEND_FROM: '10:30',
  DRY_RUN: true,                        // test copy only, until the owner reads notAorTestReport
  MAX_ROWS: 300,
  TIMEZONE: '',
  SUBJECT: '3MDA_NOTAOR_',              // the cluster number is appended per mail, see notAorGroups_
  SENT_PREFIX: 'NOTAOR_SENT_',          // ONE dedupe list for all clusters, so a row is never mailed twice
  MAX_GROUPS: 20,                       // ceiling on mails per run - every cluster is one Gmail send
  TEST: { STATUS: 'AFD', MAX_ROWS: 12, MAX_GROUPS: 3 }
};


/* ------------------------------------------- NOT AOR: reading the cluster out of his CLUSTER tab
   The NOT AOR mail cannot trust the sales row's CLUSTER cell - that cell is the thing it is asking
   about - so it looks the address up in his CLUSTER tab. That tab keeps the whole address in ONE
   text field ("BGY ALIMA BACOOR CITY") while the sales tab keeps it in two columns
   (BRGY "BGY ALIMA" + CITY "BACOOR CITY"), so both sides are reduced to the same key: uppercase,
   punctuation gone, and the location WORDS (BRGY / BARANGAY / CITY / MUNICIPALITY / POBLACION)
   dropped, because "ALIMA, BACOOR CITY" and "BGY ALIMA BACOOR" must name one place.
   These are aorProbe's rules, renamed nao*. Apps Script loads every .gs into ONE shared scope, so a
   second `const AOR` or a second aorPlaceNorm_ would not fail this report - it would fail the whole
   project, including the four live mails. */
const naoUp_ = s => String(s === undefined ? '' : s).trim().toUpperCase();
function naoNorm_(s) {
  return naoUp_(s).replace(/[^A-Z0-9]+/g, ' ').trim().replace(/^(?:BRG?Y?|BARANGAY)\s+/, '');
}
function naoPlaceNorm_(s) {
  return naoNorm_(s)
    .replace(/\b(?:BRG?Y?Y?|BARANGAY|BGO)\b/g, ' ')
    .replace(/\b(?:CITY|MUNICI?PALITY|TOWN|POB(?:LACION)?|OF)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
/* every way the tab could have written one of its own place cells */
function naoTabKeys_(v) {
  const raw = naoUp_(v), out = [];
  [raw, naoNorm_(raw), naoPlaceNorm_(raw)].forEach(k => { if (k && out.indexOf(k) < 0) out.push(k); });
  return out;
}
/* every way the sales tab's TWO separate columns could join into one of those cells - both orders,
   because nothing in his file says which order he typed the address in */
function naoRowKeys_(brgy, city) {
  const b = naoUp_(brgy), c = naoUp_(city), out = [];
  if (b && c) out.push(b + ' ' + c, c + ' ' + b);
  const nb = naoPlaceNorm_(b), nc = naoPlaceNorm_(c);
  if (nb && nc) out.push(nb + ' ' + nc, nc + ' ' + nb);
  return out.filter((k, i, a) => k && a.indexOf(k) === i);
}
/* The whole tab becomes one lookup table: place key -> {cluster value -> how many times}. Keeping
   the value list is what lets an ambiguous place be reported instead of guessed - one barangay name
   can exist in two towns, and a wrong cluster endorsement is worse than none. */
/* The CLUSTER tab is not a sales tab - it has no STATUS and no AGENT header, so the shared tab_
   reader refuses it. This reads the whole tab and finds the header row the same way aorProbe did
   (a row with two or more text cells near the top), because nothing guarantees his tab starts at
   row 1 - a title line above the headers is normal in his file. */
function naoTab_(ss, cfg) {
  const sh = ss.getSheetByName(cfg.CLUSTER_TAB);
  if (!sh) return [];
  const v = sh.getDataRange().getValues();
  let hi = -1;
  for (let i = 0; i < Math.min(10, v.length); i++) {
    const cells = v[i].map(x => String(x).trim());
    const filled = cells.filter(x => x !== '').length;
    const texty = cells.filter(x => /[A-Z]{3}/i.test(x)).length;
    if (filled >= 2 && texty >= 2) { hi = i; break; }
  }
  if (hi < 0) return [];
  const h = v[hi].map(x => String(x).trim().toUpperCase());
  return v.slice(hi + 1).map(r => {
    const o = {};
    h.forEach((k, j) => { if (k && o[k] === undefined) o[k] = r[j]; });
    return o;
  }).filter(o => Object.keys(o).some(k => String(o[k]).trim() !== ''));
}
function naoIndex_(ss, cfg, why) {
  const rows = naoTab_(ss, cfg);
  if (!rows.length) { why.push('walang nabasang row sa tab na "' + cfg.CLUSTER_TAB + '"'); return null; }
  const head = Object.keys(rows[0]);
  const clusterCol = head.filter(h => /CLUSTER|AREA|ZONE|TERRIT/i.test(h))[0] || head[head.length - 1];
  let placeCols = head.filter(h => h !== clusterCol && /BGY|BRGY|BARANG|CITY|MUNICI|TOWN|PLACE|ADDRESS|LOCATION/i.test(h));
  if (!placeCols.length) placeCols = head.filter(h => h !== clusterCol);
  const map = {}, values = {};
  rows.forEach(r => {
    const cv = String(r[clusterCol] === undefined ? '' : r[clusterCol]).trim();
    if (!cv) return;
    const keys = [];
    placeCols.forEach(pc => naoTabKeys_(r[pc]).forEach(k => keys.push(k)));
    if (placeCols.length === 2) {
      const a = naoUp_(r[placeCols[0]]), b = naoUp_(r[placeCols[1]]);
      if (a && b) { const na = naoPlaceNorm_(a), nb = naoPlaceNorm_(b);
        [a + ' ' + b, b + ' ' + a, na + ' ' + nb, nb + ' ' + na].forEach(k => { if (k) keys.push(k); }); }
    }
    keys.forEach(k => { (map[k] = map[k] || {})[cv] = (map[k][cv] || 0) + 1; });
    values[cv] = (values[cv] || 0) + 1;
  });
  if (!Object.keys(map).length) { why.push('ang tab "' + cfg.CLUSTER_TAB + '" ay may ' + rows.length +
    ' row pero walang masyalong place key (columns: ' + head.slice(0, 6).join(' | ') + ')'); return null; }
  return { map: map, values: values, rows: rows.length, clusterCol: clusterCol, placeCols: placeCols };
}
function naoClusterOf_(idx, brgy, city) {
  if (!idx) return null;
  const keys = naoRowKeys_(brgy, city);
  for (let i = 0; i < keys.length; i++) {
    const by = idx.map[keys[i]];
    if (by) { const v = Object.keys(by); if (v.length) return { vals: v, key: keys[i] }; }
  }
  return null;
}
/* Split the due-today NOT AOR rows into one group per cluster the tab can name. Anything the tab
   cannot name single-valued never enters a mail, and each such row is kept with the reason, the way
   sendReport_ keeps an unreadable revisit date. */
function notAorGroups_(cfg, idx, rows, dropped) {
  const groups = {};
  rows.forEach(r => {
    const b = naoUp_(r.brgy), c = naoUp_(r.city);
    if (!idx) { dropped.push({ r: r, why: 'walang cluster index' }); return; }
    if (!b && !c) { dropped.push({ r: r, why: 'walang BRGY at walang CITY sa row' }); return; }
    const hit = naoClusterOf_(idx, r.brgy, r.city);
    if (!hit) { dropped.push({ r: r, why: 'wala sa "' + cfg.CLUSTER_TAB + '" tab ang ' + (b + ' ' + c).trim() }); return; }
    if (hit.vals.length > 1) { dropped.push({ r: r, why: 'maraming cluster sa iisang address: ' + hit.vals.join(' / ') }); return; }
    const cv = hit.vals[0], digits = String(cv).replace(/[^0-9]/g, '');
    /* {CLUSTER} in his sentence is filled with DIGITS only, so a value like "NOT IN CAVITE" would
       mail "For endorsement to CLUSTER  for revisit" - it is dropped and named instead. */
    if (!digits) { dropped.push({ r: r, why: 'ang value ng tab ay "' + cv + '" - walang numero, kaya walang CLUSTER na maisulat sa mail' }); return; }
    r.cluster = cv;
    (groups[digits] = groups[digits] || { digits: digits, value: cv, items: [] }).items.push(r);
  });
  const all = Object.keys(groups).map(k => groups[k]).sort((x, y) => y.items.length - x.items.length);
  const max = cfg._maxGroups || cfg.MAX_GROUPS || 20;
  return { groups: all.slice(0, max), skippedGroups: all.slice(max), idx: idx };
}
/* One mail per cluster, built from cfg so nothing here can drift away from the AFD wording. The
   subject carries the cluster number the way AFD12's does, so Sir Jack sees which cluster is being
   endorsed before he opens it. SENT_PREFIX stays the shared one - the dedupe list is common. */
function naoMailCfg_(cfg, g) {
  const m = {};
  Object.keys(cfg).forEach(k => { m[k] = cfg[k]; });
  m.NAME = cfg.NAME + ' C' + g.digits;
  m.WHERE = [{ COL: 'CLUSTER', IS: g.digits }];
  m.SUBJECT = cfg.SUBJECT + 'CLUSTER' + g.digits + '_';
  m.PRE_ROWS = g.items;
  return m;
}
function notAorMail_(send, force, test) {
  const cfg = test ? (function () {
    const c = {}; Object.keys(NOTAOR).forEach(k => { c[k] = NOTAOR[k]; });
    c.DRY_RUN = true; c.IGNORE_DAY = true; c.MAX_ROWS = Math.min(NOTAOR.TEST.MAX_ROWS, NOTAOR.MAX_ROWS);
    c._maxGroups = NOTAOR.TEST.MAX_GROUPS;
    return c;
  })() : NOTAOR;
  const ss = reportSs_(cfg), miss = [];
  const due = collectReport_(ss, cfg, miss);
  const rows = due.filter(r => nk_(r.cluster) === nk_(cfg.SOURCE_CLUSTER));
  if (miss.length) {
    Logger.log(cfg.NAME + ' | ' + miss.length + ' row(s) tagged ' + statusWords_(cfg) +
      ' may walang mabasang date sa ' + cfg.ON_DAY + ' - kabilang rito ang ibang cluster, hindi NOT AOR lang:');
    miss.slice(0, 10).forEach(m => Logger.log('  ?? ' + m));
    if (miss.length > 10) Logger.log('  ?? ...at ' + (miss.length - 10) + ' pa');
  }
  const why = [];
  const idx = naoIndex_(ss, cfg, why);
  const dropped = [];
  const pk = notAorGroups_(cfg, idx, rows, dropped);
  Logger.log(cfg.NAME + ' | ' + due.length + ' row tagged ' + statusWords_(cfg) +
    (cfg.IGNORE_DAY ? ' (anumang date, dahil test copy)' : ' na ang revisit ay ngayon') +
    ' | ' + rows.length + ' sa CLUSTER cell = ' + cfg.SOURCE_CLUSTER +
    (idx ? ' | index: ' + idx.rows + ' row sa tab "' + cfg.CLUSTER_TAB + '" (' + idx.placeCols.join('+') + ' -> ' + idx.clusterCol + ')'
      : ' | WALANG INDEX: ' + why.join(' / ')));
  if (pk.groups.length) Logger.log(cfg.NAME + ' | mga mase-send na mail: ' +
    pk.groups.map(g => g.value + ' = ' + g.items.length + ' row').join(', ') +
    (pk.skippedGroups.length ? ' | HINDI na-isama (lampas ' + (cfg._maxGroups || cfg.MAX_GROUPS) + ' cluster): ' +
      pk.skippedGroups.map(g => g.value + '=' + g.items.length).join(', ') : ''));
  dropped.slice(0, 15).forEach(d => Logger.log(cfg.NAME + ' | HINDI NA-VALIDATE | ' + naoUp_(d.r.brgy) + ', ' +
    naoUp_(d.r.city) + ' | ' + d.r.sub.slice(0, 26) + ' | ' + d.why));
  if (dropped.length > 15) Logger.log(cfg.NAME + ' | ...at ' + (dropped.length - 15) + ' pang row na hindi na-validate');
  if (dropped.length) Logger.log(cfg.NAME + ' | HINDI SASAMA SA MAIL: ' + dropped.length +
    ' row kasi hindi kayang pangalanan ng "' + cfg.CLUSTER_TAB + '" tab ang cluster nila.');
  const out = [];
  if (!pk.groups.length) return [sendNotAorGroup_(send, cfg, [], force)];
  let held = '';
  for (let i = 0; i < pk.groups.length; i++) {
    const g = pk.groups[i];
    const r = sendNotAorGroup_(send, naoMailCfg_(cfg, g), g.items, force);
    out.push(r);
    /* the 10 o'clock run may not mail before 10:30. Once one group says so, every other group
       would say the same thing, so the run stops instead of logging it twenty times. */
    if (r.skipped && String(r.skipped).indexOf('too early') === 0) {
      held = (pk.groups.length - i - 1) + ' mail pa sana today, pero ang bawat cluster ay may 10:30 gate.';
      break;
    }
  }
  if (held) Logger.log(cfg.NAME + ' | ' + held);
  return out;
}
/* The send path below is copied step for step from AgentNotices' sendReport_ so that this mail
   behaves EXACTLY like AFD - same 10:30 gate, same per-day SR dedupe, same subject, same inline
   logo, same outcome log, same wording builder. It is copied rather than called because
   sendReport_ always reads the rows out of the sales tabs itself, and a NOT AOR row has to be
   re-clustered by his CLUSTER tab first; routing that through sendReport_ would mean editing the
   file that runs the four live mails. So: if that file's send path ever changes, this is the one
   function to compare against it. Nothing here writes to the sheet. */
function sendNotAorGroup_(send, cfg, items, force) {
  if (send && !force && cfg.SEND_FROM) {
    const tz = cfg.TIMEZONE || NOTICE.TIMEZONE;
    const now = Utilities.formatDate(new Date(), tz, 'HH:mm');
    if (now < cfg.SEND_FROM) {
      const why = 'too early - ' + cfg.NAME + ' sends from ' + cfg.SEND_FROM + ' ' + tz +
        ', this run started at ' + now + '. Nothing was sent; the next scheduled run will mail.';
      Logger.log(cfg.NAME + ' | ' + why);
      return { report: cfg.NAME, mode: cfg.DRY_RUN ? 'test' : 'live', date: fmtD_(new Date()),
        dryRun: cfg.DRY_RUN, items: items.length, fresh: 0, skipped: why };
    }
  }
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
  if (!items.length) {
    res.skipped = 'no rows tagged ' + statusWords_(cfg) + ' in ' + cfg.FROM.join(' or ') +
      (cfg.ON_DAY ? ' whose ' + cfg.ON_DAY + ' is today' : '') + ' - nothing sent';
    if (send) logSendOutcome_(cfg, res);
    return res;
  }
  if (!fresh.length) { res.skipped = items.length + ' row(s) already reported today - nothing new, nothing sent'; if (send) logSendOutcome_(cfg, res); return res; }
  const logo = reportLogo_(cfg);
  const m = buildReportMail_(fresh, logo, cfg);
  res.subject = m.subject; res.htmlChars = m.html.length;
  res.logo = logo.blob ? 'attached inline' : logo.src ? 'linked only' : 'none';
  res.blankCols = cfg.COLS.filter(c => fresh.slice(0, max).every(x => cellOf_(x, c) === ''));
  if (!send) { res.text = m.text; return res; }
  if (MailApp.getRemainingDailyQuota() < 1) { res.skipped = 'daily Gmail quota reached'; logSendOutcome_(cfg, res); return res; }
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
  logSendOutcome_(cfg, res);
  return res;
}


/* The NOT AOR scheduled run. One run can produce MANY mails - one per cluster the CLUSTER tab
   names - and each of them still obeys the same 10:30 gate as AFD. Like AFD and AFD12 it is
   deliberately NOT in ensureReportTriggers_: only installNotAorTrigger() puts it on the clock. */
function runNotAorNotices() { return notAorMail_(true, false); }
function sendNotAorReport() { return notAorMail_(true, true); }

/* Preview of the NOT AOR mail. Nothing is sent and no dedupe is written; the log lists every mail
   the run WOULD produce - one per validated cluster - then prints the first body in full. */
function notAorPreview() {
  const list = notAorMail_(false, true);
  list.forEach(r => Logger.log(r.report + ' | rows: ' + r.items + ' | bago mula huling run: ' + r.fresh +
    (r.fresh ? ' | laman ng table: ' + r.shown + ' | subject: ' + r.subject : '') +
    ' | kung LIVE: ' + NOTAOR.TO.join(',') + ' cc ' + NOTAOR.CC.join(',') +
    (NOTAOR.DRY_RUN ? ' (DRY_RUN pa, kaya test copy lang sa ' + r.to.join(',') + ')' : '') +
    (r.skipped ? ' | ' + r.skipped : '')));
  const first = list.filter(r => r.text)[0];
  if (first) Logger.log(first.text);
  return list;
}

/* The test copy of the NOT AOR mail, and the reason it exists: aorProbe measured 0 NOT AOR rows due
   today, so notAorPreview alone would print an empty table on most days. Like afdTestReport it
   switches the must-be-today comparison OFF (the column is still read, so HD_TEXT still shows its
   {DATE}), keeps DRY_RUN ON so only his own address can receive it, and caps the run at
   TEST.MAX_GROUPS clusters / TEST.MAX_ROWS rows so one press cannot spend a morning of quota.
   Nothing here mutates NOTAOR - the patch is a copy - so the live rule is never left widened. */
function notAorTestReport() {
  const list = notAorMail_(true, true, true);
  list.forEach(r => Logger.log(r.report + ' test copy: ' + (r.sent ? 'NA-SEND' : 'HINDI NA-SEND') +
    ' | rows: ' + r.items + ' | nasa table: ' + r.shown + ' | subject: ' + (r.subject || '-') +
    ' | kay: ' + r.to.join(',') + (r.cc.length ? ' | cc: ' + r.cc.join(',') : ' | walang cc (DRY_RUN)') +
    (r.logo ? ' | logo: ' + r.logo : '') + (r.skipped ? ' | ' + r.skipped : '') + (r.error ? ' | ERROR ' + r.error : '')));
  Logger.log('NOT AOR | hindi binago ang tunay na rule: DRY_RUN ' + NOTAOR.DRY_RUN +
    (NOTAOR.DRY_RUN ? ' (test copy lang ang nagawa, ' + NOTICE.ADMIN_EMAILS.join(',') + ')' : ' (LIVE - PLDT ang tumatanggap)') +
    ' | ang tunay na mail ay nanatiling may 10:30 gate at must-be-today; ang test copy lamang ang may' +
    ' IGNORE_DAY at ' + NOTAOR.TEST.MAX_GROUPS + ' cluster / ' + NOTAOR.TEST.MAX_ROWS + ' row na limit.');
  return list;
}
function installNotAorTrigger() {
  const st = installReportTrigger_(NOTAOR, 'runNotAorNotices');
  Logger.log('NOT AOR | rule: ' + statusWords_(NOTAOR) + ' sa ' + NOTAOR.FROM.join(' / ') +
    ', ang CLUSTER cell ng row = ' + NOTAOR.SOURCE_CLUSTER + ', ' + NOTAOR.NOT[0].HAS + ' excluded, ' +
    NOTAOR.ON_DAY + ' = ang araw ng run | ang cluster NA ISUSULAT sa mail ay hindi mula sa sales row kundi' +
    ' mula sa "' + NOTAOR.CLUSTER_TAB + '" tab, dahil sa BRGY + CITY ng row | isang mail kada cluster' +
    ' | pinakamaraming mail kada run: ' + NOTAOR.MAX_GROUPS);
  return st;
}
