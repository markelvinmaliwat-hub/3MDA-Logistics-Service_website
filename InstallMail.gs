/* ============================================================================
   INSTALL - the eighth queue, asked for on 2026-11-11 and settled on 2026-11-12.
   His first ask: "kaya mo ba gumawa ng automated email tungkol sa for installation
   per cluster kasama ang not AOR at pag babasehan ng not AOR ay yung may TAB na
   CLUSTER kagaya ng sa AFD RESCHEDULE".

   HIS RULE, IN HIS OWN WORDS - this is the SECOND version, and it corrects the
   first one I shipped. He wrote: "mali ka ng unawa Sa CSP STATUS kapag ang
   remarks ay RESERVED FACILITY, ORDER CREATED, PAID ito ang mga pwede ma email ng
   FOR INSTALLATION pero kapagh ito ay naka PAID sa CSP STATUS dapat ang FINAL
   STATUS na naka linya sakanya ay PAID - FOR INSTALLATION".
   So the deciding column is CSP STATUS - not FINAL STATUS alone - and it admits
   THREE values, each read EXACTLY as the whole cell:
     1. RESERVED FACILITY  -> nasa queue, walang ibang kundisyon
     2. ORDER CREATED      -> nasa queue, walang ibang kundisyon
     3. PAID               -> nasa queue SA KUNG ang FINAL STATUS sa hilera niya
                              ay eksaktong PAID - FOR INSTALLATION
   My first version read only #3, and read it from FINAL STATUS, so it reported the
   PAID rows and missed every RESERVED FACILITY and ORDER CREATED row. That rule is
   gone; CSP_OPEN + CSP_PAID + PAID_FINAL are what the config now carries, and
   imBranch_() is the ONE predicate the probe and the mail share, so the count he
   approves in the log is the count that leaves the account.
   A cancelled row cannot enter: CANCELLED is not one of the three CSP values, and
   a strict-equals rule refuses anything longer - the same strictness the
   cancellation mail runs on.

   WHAT HIS LIVE PROBE LOG MEASURED ON 2026-11-12 (instProbe, 1517 PLDT row):
     RESERVED FACILITY 3 row | ORDER CREATED 1 row | PAID + the exact FINAL STATUS
     line 3 row = 7 row sa queue, na nahahati sa 3 mail (CLUSTER 12 = 5, CLUSTER 10
     = 1, CLUSTER 11 = 1). Ang 2a (PAID na mali ang FINAL STATUS) ay 0 row. Ang 2b
     (tama ang FINAL STATUS pero iba ang CSP STATUS) ay 6 row: 4 blank ang CSP, 2
     RPR - iyon ang ihahatid ng MAKANDANG rule, kaya 7 ang tama.

   THE FOUR ANSWERS THAT BUILT THE SEND, all from him on 2026-11-12:
     1. "HINDI - PLDT LANG"        -> TABS is ['PLDT']. The probe printed the real
        headers and the RED tab has NO CSP STATUS column at all (its status column
        is plainly named STATUS), so a CSP-STATUS rule can only ever read PLDT.
     2. "A"                       -> the table's STATUS column is the CSP STATUS
        cell. It is spelled "STATUS" in his screenshot, so COL_SOURCE says so.
     3. "labas" (RPR)             -> nothing to write: RPR is not one of his three
        CSP values, so the exact rule already refuses it.
     4. "wag SR ang ilagay kundi PID" -> the third column of his table is labelled
        PID and its value comes from the PR header. COL_SOURCE again, nothing else.
   And the dedupe question ("maulit ba sa bukang 10AM o isang beses lang kada
   SR?"): he answered B - ARAW-ARAW. So this mail has NO dedupe list, no
   INSTALL_SENT_ property, and a row that is still in the queue tomorrow is mailed
   again tomorrow. That is a reminder to PLDT, not a one-time report.

   ONE MAIL PER CLUSTER: "iba ibang email ito kada cluster ang pag sesendan kaya
   hiwa hiwalay sya ipapadala". The cluster a mail is NAMED for comes from the row's
   own CLUSTER cell when it carries a number, and from his CLUSTER tab (BRGY + CITY)
   when it says NOT AOR or is blank - kagaya ng sa AFD RESCHEDULE. A row neither can
   name is dropped and listed by name, never guessed.
   "ang format ng template ay dapat yung kagaya ng nasa litrato" - his table is
   DATE | SUBSCRIBER NAME | PID | BRGY | CITY | CLUSTER | STATUS | PAYMENT
   REFERENCE/ REMARKS | PAYMENT STATUS.
   "ipadala sa parehas na email kagaya sa SFS/CV" and "isang beses lang kada araw
   ... dapat tuwing 10am".

   WHY THE TABLE IS BUILT HERE AND NOT BY THE SHARED ENGINE: three of his nine
   labels - PID, STATUS, PAYMENT REFERENCE/ REMARKS - are not keys in AgentNotices'
   CELL_, and cellOf_ renders anything missing from it as an empty cell. Rather than
   edit the file that runs the five live mails, imTable_ / imMail_ / sendInstallGroup_
   are copied step for step from reportTable_ / buildReportMail_ / sendReport_ (the
   same decision NotAorMail.gs documents at its own send path). If that file's send
   path ever changes, those three functions are what to compare.

   DRY_RUN IS STILL ON. Nothing reaches PLDT until the owner flips it on his own
   word. instPreview() and instTestReport() mail only his own address.
   NAMING: every entry is INSTALL / im* / inst*. Apps Script loads all .gs files
   into ONE shared scope, so a second `const NOT AOR`-style config or a second
   copy of a normaliser would not just break this feature - it would break the
   five live mails. NotAorMail.gs owns nao*, CancelMail.gs owns cm*, this owns im*.
   ========================================================================= */
const INSTALL = {
  NAME: 'INSTALL',
  /* "ipadala sa parehas na email kagaya sa SFS/CV na mga pinapadalhan" - copied from
     AgentNotices' SFS/CV config on 2026-11-12, including the fact that Jerome Navarro is one
     person (his Gmail replaced the supplier alias, the pldt365 alias stayed). Nothing invented. */
  TO: ['lsabat@pldt.com.ph'],
  CC: ['jrsnavarro25@gmail.com', 't-jesnavarro@pldt365.onmicrosoft.com', 'abmadlangbayan0510@icloud.com'],
  /* the greeting of the two mails that already go to lsabat@pldt.com.ph (SFS and CV), copied
     word for word - the AFD/NOT AOR greeting says "Hi Sir Jack" because those go somewhere else */
  GREET: 'Hi Sir ABAT, Leonard S.,',
  /* {CLUSTER} is filled per mail from the cluster that mail was named for, the way AFD does it.
     It names his three taggings instead of claiming a payment, because a RESERVED FACILITY row
     is not paid yet. */
  INTRO: 'For endorsement to CLUSTER {CLUSTER} for installation. The accounts below are tagged ' +
    'RESERVED FACILITY, ORDER CREATED, or PAID with a final status of PAID - FOR INSTALLATION, and ' +
    'we would appreciate your assistance in having them scheduled for installation.',
  CLOSE: 'Should you have any concerns regarding the scheduled installation, please kindly reply ' +
    'to this email so that we may address them immediately.',
  THANKS: 'Thank you !',
  SIGN: ['Mark Maliwat', 'Sales Validator - MMMDA Logistics', 'Service Cavite Upland'],
  LOGO_URL: 'https://markelvinmaliwat-hub.github.io/3MDA-Logistics-Service_website/assets/mmmda-logo.jpg',
  LOGO_KEY: 'mmmda-logo',
  LOGO_ALT: 'MMMDA Logistics Service',
  LOGO_W: 150, LOGO_H: 147,
  LOGO_ABOVE: true,
  FOOTER: '',
  /* ---- his three branches, named apart so the log can say which one a row came in on ---- */
  CSP_OPEN: ['RESERVED FACILITY', 'ORDER CREATED'],   // these two qualify on their own
  CSP_PAID: 'PAID',                                   // this one needs the FINAL STATUS line below
  PAID_FINAL: 'PAID - FOR INSTALLATION',
  FROM: ['CSP STATUS'],                    // the deciding column - his correction
  STATUS: ['RESERVED FACILITY', 'ORDER CREATED', 'PAID'],
  ANY: true,                               // ANY of the three, not all three at once
  EXACT: true,                             // the whole cell, the CANCEL mail's strictness
  SHEET_ID: '',                            // '' = DATABASE AUG TO OCT, the live-synced sales file
  /* his answer to "RED ba o PLDT?": "HINDI - PLDT LANG". instProbe proved why - the RED tab's
     real headers are DATE | SUBSCRIBER NAME | RITM # | CS&WO# | ACCT | EMAIL ADDRESS | STATUS |
     ... and there is no CSP STATUS there at all, which is exactly why RED counted 0. */
  TABS: ['PLDT'],
  /* the cluster the mail is NAMED for. The row's own CLUSTER cell is used when it has a number;
     a row whose cell says NOT AOR gets its cluster from his CLUSTER tab by BRGY + CITY, which is
     exactly what he asked for: "kasama ang not AOR at pag babasehan ng not AOR ay yung may TAB
     na CLUSTER kagaya ng sa AFD RESCHEDULE". */
  CLUSTER_TAB: 'CLUSTER',
  SOURCE_CLUSTER: 'NOT AOR',
  /* his template, in his order, spelled the way he typed it in the screenshot. COL_SOURCE is the
     answer to the two labels the sheet does not carry under that name: "PID" is his word for the
     PR column, and "STATUS" is his word for CSP STATUS - the column his rule itself lives in. */
  COLS: ['DATE', 'SUBSCRIBER NAME', 'PID', 'BRGY', 'CITY', 'CLUSTER', 'STATUS',
    'PAYMENT REFERENCE/ REMARKS', 'PAYMENT STATUS'],
  COL_SOURCE: { PID: 'PR', STATUS: 'CSP STATUS' },
  DATE_FORMAT: 'M/d/yyyy',                 // the same date rendering the SFS/AFD mails use
  SR_LINK: '',
  SEND_HOURS: [10],                        // "isang beses lang kada araw ... tuwing 10am"
  DRY_RUN: true,                           // his word flips it; until then only his own inbox
  MAX_ROWS: 300,
  MAX_GROUPS: 20,                          // one Gmail send per cluster; the quota is ~100/day for everything
  TIMEZONE: '',
  SUBJECT: '3MDA_INSTALL_',                // + CLUSTER<n>_ + MMMyyyy, built per mail the way NOT AOR does
  /* WALANG SENT_PREFIX sa purpose: option B ("maulit sa bukang 10AM") means a row still in the
     queue is reported again the next day. A dedupe list would silently undo his answer. */
  TEST: { MAX_ROWS: 12, MAX_GROUPS: 3 }
};

const imUp_ = v => String(v === undefined ? '' : v).trim().toUpperCase();

/* ---- the rule, in ONE place ----
   The probe and the mail both call this, so the count he approves is the count that mails.
   Returns the branch a row came in on, or '' when the row is not in the queue. */
function imBranch_(r) {
  if (!statusRowHit_(r, INSTALL)) return '';
  const csp = nk_(reportStatusOf_(r, INSTALL));
  if (csp !== nk_(INSTALL.CSP_PAID)) return csp;
  return nk_(r['FINAL STATUS']) === nk_(INSTALL.PAID_FINAL)
    ? INSTALL.CSP_PAID + ' + ' + INSTALL.PAID_FINAL : '';
}
function imRuleText_() {
  return 'CSP STATUS = ' + INSTALL.CSP_OPEN.join(' / ') + ' / ' + INSTALL.CSP_PAID +
    ', at kapag ' + INSTALL.CSP_PAID + ': FINAL STATUS eksaktong ' + INSTALL.PAID_FINAL;
}
/* which real header a table label reads - and the label PLDT sees is always his own spelling */
const imSrc_ = (cfg, label) => String((cfg.COL_SOURCE || {})[label] || label);

/* ---- the CLUSTER-tab join, copied from the rules aorProbe proved and NotAorMail shipped (nao*).
   His tab keeps the address in ONE text field ("BGY ALIMA BACOOR CITY") while the sales tab keeps
   it in TWO columns (BRGY + CITY), so both sides are reduced to the same key: uppercase, punctuation
   gone, location words dropped. It is copied under im* rather than called, because NotAorMail.gs is
   a file he may or may not have pasted yet, and this file must run on its own. */
function imNorm_(s) {
  return imUp_(s).replace(/[^A-Z0-9]+/g, ' ').trim().replace(/^(?:BRG?Y?|BARANGAY)\s+/, '');
}
function imPlaceNorm_(s) {
  return imNorm_(s)
    .replace(/\b(?:BRG?Y?Y?|BARANGAY|BGO)\b/g, ' ')
    .replace(/\b(?:CITY|MUNICI?PALITY|TOWN|POB(?:LACION)?|OF)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function imTabKeys_(v) {
  const raw = imUp_(v), out = [];
  [raw, imNorm_(raw), imPlaceNorm_(raw)].forEach(k => { if (k && out.indexOf(k) < 0) out.push(k); });
  return out;
}
function imRowKeys_(brgy, city) {
  const b = imUp_(brgy), c = imUp_(city), out = [];
  if (b && c) out.push(b + ' ' + c, c + ' ' + b);
  const nb = imPlaceNorm_(b), nc = imPlaceNorm_(c);
  if (nb && nc) out.push(nb + ' ' + nc, nc + ' ' + nb);
  return out.filter((k, i, a) => k && a.indexOf(k) === i);
}
/* the CLUSTER tab has no STATUS and no AGENT header, so the shared tab_ reader refuses it.
   The header row is found the same way NotAorMail finds it, because a title line above the
   headers is normal in his file. */
function imTab_(ss, cfg) {
  const sh = ss.getSheetByName(cfg.CLUSTER_TAB);
  if (!sh) return [];
  const v = sh.getDataRange().getValues();
  let hi = -1;
  for (let i = 0; i < Math.min(10, v.length); i++) {
    const cells = v[i].map(x => String(x).trim());
    if (cells.filter(x => x !== '').length >= 2 && cells.filter(x => /[A-Z]{3}/i.test(x)).length >= 2) { hi = i; break; }
  }
  if (hi < 0) return [];
  const h = v[hi].map(x => String(x).trim().toUpperCase());
  return v.slice(hi + 1).map(r => {
    const o = {};
    h.forEach((k, j) => { if (k && o[k] === undefined) o[k] = r[j]; });
    return o;
  }).filter(o => Object.keys(o).some(k => String(o[k]).trim() !== ''));
}
function imIndex_(ss, cfg, why) {
  const rows = imTab_(ss, cfg);
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
    placeCols.forEach(pc => imTabKeys_(r[pc]).forEach(k => keys.push(k)));
    if (placeCols.length === 2) {
      const a = imUp_(r[placeCols[0]]), b = imUp_(r[placeCols[1]]);
      if (a && b) { const na = imPlaceNorm_(a), nb = imPlaceNorm_(b);
        [a + ' ' + b, b + ' ' + a, na + ' ' + nb, nb + ' ' + na].forEach(k => { if (k) keys.push(k); }); }
    }
    keys.forEach(k => { (map[k] = map[k] || {})[cv] = (map[k][cv] || 0) + 1; });
    values[cv] = (values[cv] || 0) + 1;
  });
  if (!Object.keys(map).length) { why.push('ang tab "' + cfg.CLUSTER_TAB + '" ay may ' + rows.length +
    ' row pero walang masyalong place key (columns: ' + head.slice(0, 6).join(' | ') + ')'); return null; }
  return { map: map, values: values, rows: rows.length, clusterCol: clusterCol, placeCols: placeCols };
}
function imClusterOf_(idx, brgy, city) {
  if (!idx) return null;
  const keys = imRowKeys_(brgy, city);
  for (let i = 0; i < keys.length; i++) {
    const by = idx.map[keys[i]];
    if (by) { const v = Object.keys(by); if (v.length) return { vals: v, key: keys[i] }; }
  }
  return null;
}
/* Which cluster would THIS row's mail be named for, and where did that name come from.
   'row' = the sales row already carries a number; 'tab' = the CLUSTER tab named it (the NOT AOR
   case). A row neither can name is returned with the reason, never with a guessed cluster. */
function imClusterFor_(row, idx) {
  const cell = imUp_(row['CLUSTER']);
  const digits = String(cell).replace(/[^0-9]/g, '');
  if (digits) return { digits: digits, value: cell, from: 'row' };
  const isNotAor = nk_(cell) === nk_(INSTALL.SOURCE_CLUSTER);
  if (!idx) return { why: (isNotAor ? 'NOT AOR' : 'CLUSTER cell = "' + cell + '"') + ' at walang nabasang "' +
    INSTALL.CLUSTER_TAB + '" tab' };
  const b = imUp_(row['BRGY']), c = imUp_(row['CITY']);
  if (!b && !c) return { why: 'walang BRGY at walang CITY sa row' };
  const hit = imClusterOf_(idx, row['BRGY'], row['CITY']);
  if (!hit) return { why: 'wala sa "' + INSTALL.CLUSTER_TAB + '" tab ang ' + (b + ' ' + c).trim() };
  if (hit.vals.length > 1) return { why: 'maraming cluster sa iisang address: ' + hit.vals.join(' / ') };
  const d = String(hit.vals[0]).replace(/[^0-9]/g, '');
  if (!d) return { why: 'ang value ng tab ay "' + hit.vals[0] + '" - walang numero' };
  return { digits: d, value: hit.vals[0], from: isNotAor ? 'tab (NOT AOR)' : 'tab' };
}

/* ---------------------------------------------- the rows that go into the mail
   collectReport_ cannot be used here: it builds its items from AgentNotices' CELL_ vocabulary,
   and three of his nine labels are not in that vocabulary. So this reads the sales row directly,
   through imSrc_, and keys every cell by the label PLDT will see. imBranch_ is the same predicate
   instProbe counts with, so a row the probe showed him is a row this returns - or the suite fails. */
function imCell_(r, cfg, label) {
  const h = imSrc_(cfg, label);
  const v = r[h];
  if (label === 'DATE') return fmtReportDate_(v, cfg);
  return String(v === undefined || v === null ? '' : v).trim();
}
function imItem_(r, cfg, cluster) {
  const it = {};
  cfg.COLS.forEach(l => { it[l] = imCell_(r, cfg, l); });
  /* his ruling on the NOT AOR mail applies to this column too: the CLUSTER cell PLDT reads is the
     cluster the row was VALIDATED into, never the words "NOT AOR" or a blank. When the row already
     carries a number this is that cell, spelled as his sheet spells it; when the CLUSTER tab named
     it, the tab's own wording is what the table shows. */
  it.CLUSTER = cluster.value;
  /* fill_ reads items[0].cluster for the {CLUSTER} in the intro, so the mail says the cluster it
     was NAMED for - which may be the CLUSTER tab's answer, not the cell's own word. */
  it.cluster = cluster.digits;
  it.clusterShown = cluster.value;
  it.clusterFrom = cluster.from;
  it.branch = imBranch_(r);
  it.sr = String(r['SR'] === undefined ? '' : r['SR']).replace(/\.0$/, '').trim();
  it.sub = it['SUBSCRIBER NAME'];
  it.key = it.sr || (it.DATE + '|' + it.sub);
  const dv = r['DATE'], raw = dv instanceof Date ? dv.getTime() : new Date(dv).getTime();
  it._t = isNaN(raw) ? 0 : raw;
  return it;
}
/* every queued row in his tabs, or the reason it could not be given a cluster */
function imCollect_(ss, cfg, idx, drop) {
  const out = [];
  reportTabs_(cfg).forEach(name => tab_(ss, name).forEach(r => {
    const b = imBranch_(r);
    if (!b) return;
    const c = imClusterFor_(r, idx);
    if (c.why) { if (drop) drop.push({ m: { tab: name, r: r, branch: b }, why: c.why }); return; }
    out.push(imItem_(r, cfg, c));
  }));
  /* oldest first - a queue PLDT works by hand reads best from the top, same as every report */
  return out.sort((x, y) => x._t - y._t || nk_(x.sub).localeCompare(nk_(y.sub)));
}
/* one mail per cluster, biggest first so a capped run drops the smallest tail, not the head */
function imGroups_(cfg, items, max) {
  const g = {};
  items.forEach(i => {
    const k = i.cluster;
    const o = (g[k] = g[k] || { digits: k, value: i.clusterShown, n: 0, row: 0, tab: 0, items: [] });
    o.n++; o.items.push(i);
    o[i.clusterFrom.indexOf('tab') === 0 ? 'tab' : 'row']++;
  });
  const all = Object.keys(g).map(k => g[k]).sort((a, b) => b.n - a.n || Number(a.digits) - Number(b.digits));
  return { groups: all.slice(0, max), skippedGroups: all.slice(max) };
}

/* ---- the table, his nine columns, his own header words (copied from reportTable_'s style) ---- */
function imTable_(items, cfg) {
  const th = 'style="border:1px solid #4d4d4d;padding:8px 10px;font-size:12px;font-weight:700;text-align:center"';
  const td = 'style="border:1px solid #4d4d4d;padding:8px 10px;font-size:13px;text-align:center;vertical-align:top"';
  return '<table cellpadding="6" cellspacing="0" style="border-collapse:collapse">' +
    '<tr>' + cfg.COLS.map(c => `<th ${th}>${esc_(c)}</th>`).join('') + '</tr>' +
    items.map(x => '<tr>' + cfg.COLS.map(c => { const v = String(x[c] === undefined ? '' : x[c]);
      return `<td ${td}>${esc_(v) || '&mdash;'}</td>`; }).join('') + '</tr>').join('') + '</table>';
}
function imRowsText_(items, cfg) {
  return items.map(x => '- ' + cfg.COLS.map(c => String(x[c] === undefined ? '' : x[c])).filter(Boolean).join(' | ')).join('\n');
}
/* copied from buildReportMail_ - same greeting, same {CLUSTER} fill, same logo signature, same
   subject stamp - but the table is imTable_, because CELL_ does not know his three labels. */
function imMail_(items, logo, cfg) {
  const max = cfg.MAX_ROWS || 300, shown = items.slice(0, max);
  const stamp = Utilities.formatDate(new Date(), cfg.TIMEZONE || NOTICE.TIMEZONE, 'MMMyyyy').toUpperCase();
  const subject = cfg.SUBJECT + stamp;
  const extra = items.length - shown.length;
  const intro = fill_(cfg.INTRO, cfg, items);
  const h = `<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#000;max-width:900px">` +
    `<p>${esc_(cfg.GREET)}</p><p>${esc_(intro)}</p>` + imTable_(shown, cfg) +
    (extra > 0 ? `<p style="color:#667085;font-size:12px">&hellip;and ${extra} more not listed here.</p>` : '') +
    (cfg.CLOSE ? `<p style="margin-top:18px">${esc_(fill_(cfg.CLOSE, cfg, items))}</p>` : '') +
    `<p style="margin-top:18px"><b>${esc_(cfg.THANKS)}</b></p>` + reportSig_(logo, cfg) +
    (cfg.FOOTER ? `<p style="color:#667085;font-size:12px">${esc_(cfg.FOOTER)}</p>` : '') + '</div>';
  const t = `${cfg.GREET}\n\n${intro}\n\n${imRowsText_(shown, cfg)}` +
    (extra > 0 ? `\n...and ${extra} more.` : '') +
    (cfg.CLOSE ? `\n\n${fill_(cfg.CLOSE, cfg, items)}` : '') + `\n\n${cfg.THANKS}\n\n${cfg.SIGN.join('\n')}`;
  return { subject: subject, html: h, text: t };
}
/* One mail per cluster: the subject and the NAME carry the number, so Sir Abat sees which cluster
   is being endorsed before he opens it - exactly what naoMailCfg_ does for NOT AOR. */
function imMailCfg_(cfg, g) {
  const m = {};
  Object.keys(cfg).forEach(k => { m[k] = cfg[k]; });
  m.NAME = cfg.NAME + ' C' + g.digits;
  m.SUBJECT = cfg.SUBJECT + 'CLUSTER' + g.digits + '_';
  return m;
}

/* The send path below is copied step for step from AgentNotices' sendReport_ so that this mail
   behaves like the four live PLDT reports - same [TEST] label, same DRY_RUN redirect, same inline
   logo, same outcome log - with TWO deliberate differences, both his instructions:
   1. WALANG dedupe. sentToday_ / markSent_ are not called and no INSTALL_SENT_ property exists,
      because he answered B: a row still in the queue is mailed again the next day.
   2. The table is imMail_, for the three labels CELL_ cannot render.
   Nothing here writes to the sheet. */
function sendInstallGroup_(send, cfg, items, force) {
  const admins = NOTICE.ADMIN_EMAILS.map(x => String(x).trim().toLowerCase()).filter(Boolean);
  const testTo = admins[0] || Session.getEffectiveUser().getEmail();
  const max = cfg.MAX_ROWS || 300;
  const res = {
    report: cfg.NAME, items: items.length, fresh: items.length,
    date: fmtD_(new Date()), dryRun: cfg.DRY_RUN, shown: Math.min(items.length, max),
    mode: send ? (cfg.DRY_RUN ? 'test' : 'live') : 'preview', quota: MailApp.getRemainingDailyQuota(),
    to: cfg.DRY_RUN ? [testTo] : cfg.TO, cc: cfg.DRY_RUN ? [] : cfg.CC
  };
  if (!items.length) {
    res.skipped = 'walang row sa queue (' + imRuleText_() + ') - walang na-send';
    if (send) logSendOutcome_(cfg, res);
    return res;
  }
  const logo = reportLogo_(cfg);
  const m = imMail_(items, logo, cfg);
  res.subject = m.subject; res.htmlChars = m.html.length;
  res.logo = logo.blob ? 'attached inline' : logo.src ? 'linked only' : 'none';
  /* a column that is empty in EVERY row is a mapping mistake, not a blank cell - and PLDT would
     read it as our error, so it is said out loud before a live send rather than after */
  res.blankCols = cfg.COLS.filter(c => items.slice(0, max).every(x => String(x[c] === undefined ? '' : x[c]).trim() === ''));
  if (res.blankCols.length) Logger.log(cfg.NAME + ' | BABALA: BLANK sa LAHAT ng row ang column na ' +
    res.blankCols.join(', ') + ' - ' + res.blankCols.map(c => '"' + c + '" reads "' + imSrc_(cfg, c) + '"').join(', ') +
    ". Huwag i-LIVE hanggang't hindi naipaliwanag.");
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
  } catch (err) { res.error = String(err); }
  logSendOutcome_(cfg, res);
  return res;
}

/* The run itself: read PLDT, apply imBranch_, name every cluster, then one mail each.
   test=true is the copy that goes to his own inbox: it keeps DRY_RUN on, caps the run at
   TEST.MAX_GROUPS clusters / TEST.MAX_ROWS rows, and never mutates INSTALL - the patch is a
   copy, so the live rule is never left widened. */
function installMail_(send, force, test) {
  const cfg = test ? (function () {
    const c = {}; Object.keys(INSTALL).forEach(k => { c[k] = INSTALL[k]; });
    c.DRY_RUN = true; c.MAX_ROWS = Math.min(INSTALL.TEST.MAX_ROWS, INSTALL.MAX_ROWS);
    c._maxGroups = INSTALL.TEST.MAX_GROUPS;
    return c;
  })() : INSTALL;
  const ss = reportSs_(cfg);
  const why = [];
  const idx = imIndex_(ss, cfg, why);
  const drop = [];
  const items = imCollect_(ss, cfg, idx, drop);
  const pk = imGroups_(cfg, items, cfg._maxGroups || cfg.MAX_GROUPS);
  Logger.log(cfg.NAME + ' | file: ' + ss.getName() + ' | tab: ' + reportTabs_(cfg).join('+') +
    ' | rule: ' + imRuleText_() + ' | ' + items.length + ' row sa queue, ' + pk.groups.length + ' mail');
  Logger.log(cfg.NAME + ' | index: ' + (idx ? idx.rows + ' row sa tab "' + cfg.CLUSTER_TAB + '" (' +
    idx.placeCols.join('+') + ' -> ' + idx.clusterCol + ')' : 'WALANG INDEX: ' + why.join(' / ')));
  if (pk.groups.length) Logger.log(cfg.NAME + ' | mga mail: ' +
    pk.groups.map(g => 'CLUSTER ' + g.digits + ' = ' + g.items.length + ' row').join(', ') +
    (pk.skippedGroups.length ? ' | HINDI na-isama (lampas ' + (cfg._maxGroups || cfg.MAX_GROUPS) + ' cluster): ' +
      pk.skippedGroups.map(g => 'C' + g.digits + '=' + g.items.length).join(', ') : ''));
  drop.slice(0, 15).forEach(d => Logger.log(cfg.NAME + ' | HINDI NA-VALIDATE | ' +
    imUp_(d.m.r['SUBSCRIBER NAME']).slice(0, 26) + ' | ' + imUp_(d.m.r['BRGY']) + ' ' + imUp_(d.m.r['CITY']) +
    ' | ' + d.why));
  if (drop.length > 15) Logger.log(cfg.NAME + ' | ...at ' + (drop.length - 15) + ' pang row na hindi na-validate');
  if (drop.length) Logger.log(cfg.NAME + ' | HINDI SASAMA SA MAIL: ' + drop.length +
    ' row kasi hindi kayang pangalanan ng "' + cfg.CLUSTER_TAB + '" tab ang cluster nila.');
  const out = [];
  if (!pk.groups.length) return [sendInstallGroup_(send, cfg, [], force)];
  for (let i = 0; i < pk.groups.length; i++) {
    const g = pk.groups[i];
    out.push(sendInstallGroup_(send, imMailCfg_(cfg, g), g.items, force));
  }
  return out;
}

/* The scheduled run. One run produces MANY mails - one per cluster - and every one of them is
   mailed again the next day while its row is still in the queue (his option B). Like NOT AOR and
   AFD29 this is deliberately NOT in ensureReportTriggers_: only installInstallTrigger() puts it
   on the clock, and no trigger exists until he presses it. */
function runInstallNotices() { return installMail_(true, false); }
function sendInstallReport() { return installMail_(true, true); }

/* Preview: nothing is sent, nothing is written. The log lists every mail the run WOULD produce and
   then prints the first body in full, so the wording can be read before an address is trusted. */
function instPreview() {
  const list = installMail_(false, true);
  list.forEach(r => Logger.log(r.report + ' | rows: ' + r.items + ' | laman ng table: ' + r.shown +
    (r.subject ? ' | subject: ' + r.subject : '') +
    ' | kung LIVE: ' + INSTALL.TO.join(',') + ' cc ' + INSTALL.CC.join(',') +
    (INSTALL.DRY_RUN ? ' (DRY_RUN pa, kaya test copy lang sa ' + r.to.join(',') + ')' : '') +
    (r.blankCols && r.blankCols.length ? ' | BLANK na column: ' + r.blankCols.join(', ') : '') +
    (r.skipped ? ' | ' + r.skipped : '')));
  const first = list.filter(r => r.text)[0];
  if (first) Logger.log(first.text);
  return list;
}

/* The test copy - the one press that shows him the real mail in his own inbox while DRY_RUN is on.
   Capped at TEST.MAX_GROUPS clusters and TEST.MAX_ROWS rows, so one press cannot spend a morning
   of quota, and INSTALL itself is never touched. */
function instTestReport() {
  const list = installMail_(true, true, true);
  list.forEach(r => Logger.log(r.report + ' test copy: ' + (r.sent ? 'NA-SEND' : 'HINDI NA-SEND') +
    ' | rows: ' + r.items + ' | nasa table: ' + r.shown + ' | subject: ' + (r.subject || '-') +
    ' | kay: ' + r.to.join(',') + (r.cc.length ? ' | cc: ' + r.cc.join(',') : ' | walang cc (DRY_RUN)') +
    (r.logo ? ' | logo: ' + r.logo : '') + (r.skipped ? ' | ' + r.skipped : '') + (r.error ? ' | ERROR ' + r.error : '')));
  Logger.log('INSTALL | hindi binago ang tunay na rule: DRY_RUN ' + INSTALL.DRY_RUN +
    (INSTALL.DRY_RUN ? ' (test copy lang ang nagawa, ' + NOTICE.ADMIN_EMAILS.join(',') + ')'
      : ' (LIVE - PLDT ang tumatanggap)') +
    ' | walang dedupe: ang row na nasa queue pa rin ay maulit bukas (option B)' +
    ' | ang test copy ay may limit na ' + INSTALL.TEST.MAX_GROUPS + ' cluster / ' + INSTALL.TEST.MAX_ROWS + ' row.');
  return list;
}

/* The 10AM daily trigger - "isang beses lang kada araw ang pag email nito at dapat tuwing 10am".
   reportStatus_ hard-codes a dedupe sentence that is TRUE for the other reports and FALSE here, so
   the line is corrected before it is logged; ruleText_ would also print only the CSP half of his
   rule, so imRuleText_ replaces it. */
function installInstallTrigger() {
  const st = installReportTrigger_(INSTALL, 'runInstallNotices');
  st.dedupe = 'WALANG dedupe - ang row na nasa queue pa rin ay maulit kada araw (option B ng owner)';
  st.rule = imRuleText_();
  Logger.log('INSTALL trigger: ' + (st.installed ? 'installed' : 'NOT installed') +
    ' | oras: ' + hoursText_(INSTALL) + ' (' + (INSTALL.TIMEZONE || NOTICE.TIMEZONE) + ')' +
    ' | rule: ' + st.rule +
    ' | tab: ' + INSTALL.TABS.join(',') + ' (PLDT lang - walang CSP STATUS ang RED)' +
    ' | table: ' + INSTALL.COLS.join(' | ') +
    ' | PID = header "' + imSrc_(INSTALL, 'PID') + '", STATUS = header "' + imSrc_(INSTALL, 'STATUS') + '"' +
    ' | isang mail kada cluster, pinakamarami: ' + INSTALL.MAX_GROUPS +
    ' | ' + (st.dryRun ? 'DRY_RUN is ON, copies go to ' + NOTICE.ADMIN_EMAILS.join(',') + ' only'
      : 'LIVE, goes to ' + st.to.join(',') + ' | cc ' + st.cc.join(',')) +
    ' | ' + st.dedupe + ' | ' + st.note);
  return st;
}

/* ---- the read-only scout ---- */
function instProbe() {
  const ss = reportSs_(INSTALL), tz = INSTALL.TIMEZONE || NOTICE.TIMEZONE;
  const paid = nk_(INSTALL.CSP_PAID), wantFinal = nk_(INSTALL.PAID_FINAL);
  /* the label imBranch_ gives the PAID rows, asked of imBranch_ itself so the two can never drift */
  const paidBranch = imBranch_({ 'CSP STATUS': INSTALL.CSP_PAID, 'FINAL STATUS': INSTALL.PAID_FINAL });
  const BLANK_CSP = '(blank na CSP STATUS)', BLANK_FIN = '(blank na FINAL STATUS)';
  const st = {
    rows: 0, tabs: [], noHeader: [], matched: [], heads: {},
    branchTally: {}, paidBlocked: [], paidBlockWords: {},
    finalExact: [], finalExactCsp: {}, finalNear: {},
    cspNear: {}, cspWords: {},
    dropped: [], gmap: {}, groups: []
  };
  reportTabs_(INSTALL).forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) { st.tabs.push(name + ' = WALANG TAB'); return; }
    const rows = tab_(ss, name);
    if (!rows.length && sh.getLastRow() > 1) { st.noHeader.push(name); st.tabs.push(name + ' = header row NOT found'); return; }
    st.heads[name] = Object.keys(rows[0] || {});
    let hit = 0;
    rows.forEach(r => {
      st.rows++;
      const b = imBranch_(r);
      if (b) {
        hit++; st.matched.push({ tab: name, r: r, branch: b });
        st.branchTally[b] = (st.branchTally[b] || 0) + 1;
        return;
      }
      const csp = nk_(r['CSP STATUS']), fin = nk_(r['FINAL STATUS']);
      const cspKey = csp || BLANK_CSP;
      st.cspWords[cspKey] = (st.cspWords[cspKey] || 0) + 1;
      /* the two refusals he needs to see by name, because they are the two ways this rule is
         stricter than it looks: PAID in CSP with the WRONG FINAL STATUS line, and a CSP value
         that merely smells like one of his three */
      if (csp === paid) {
        st.paidBlocked.push({ tab: name, r: r });
        const f = fin || BLANK_FIN;
        st.paidBlockWords[f] = (st.paidBlockWords[f] || 0) + 1;
      } else if (/RESERV|ORDER|PAID|INSTALL/.test(csp)) st.cspNear[csp] = (st.cspNear[csp] || 0) + 1;
      /* and what my FIRST (wrong) rule would have mailed: FINAL STATUS eksaktong ang phrase niya,
         pero ang CSP STATUS - ang column na tinukoy niya - ay iba. Doon basahin ang CSP value,
         dahil siya ang pumigil sa row. */
      if (fin === wantFinal) {
        st.finalExact.push({ tab: name, r: r });
        st.finalExactCsp[cspKey] = (st.finalExactCsp[cspKey] || 0) + 1;
      } else if (fin.indexOf('INSTALL') >= 0 || fin.indexOf('PAID') >= 0) {
        const g = fin || BLANK_FIN;
        st.finalNear[g] = (st.finalNear[g] || 0) + 1;
      }
    });
    st.tabs.push(name + ' = ' + rows.length + ' row, ' + hit + ' nasa queue');
  });

  /* section 4 and the mail now share ONE collector, so the clusters printed here are the clusters
     that would be mailed - not a second implementation that could drift from the first */
  const why = [];
  const idx = imIndex_(ss, INSTALL, why);
  const drop = [];
  const items = imCollect_(ss, INSTALL, idx, drop);
  st.items = items;
  st.dropped = drop;
  const pk = imGroups_(INSTALL, items, INSTALL.MAX_GROUPS);
  st.groups = pk.groups;
  st.skippedGroups = pk.skippedGroups;

  const tally = (o, cap) => {
    const ks = Object.keys(o).sort((a, b) => o[b] - o[a]);
    ks.slice(0, cap || 12).forEach(k => Logger.log('     "' + k.slice(0, 90) + '" = ' + o[k] + ' row'));
    if (ks.length > (cap || 12)) Logger.log('     ...at ' + (ks.length - (cap || 12)) + ' pang spelling');
    return ks.length;
  };
  const sum = o => Object.keys(o).reduce((s, k) => s + o[k], 0);
  const who = m => [m.tab, imUp_(m.r['SUBSCRIBER NAME']).slice(0, 26), imUp_(m.r['BRGY']) + ' ' + imUp_(m.r['CITY'])];

  Logger.log('INSTALL PROBE | file: ' + ss.getName() + ' | tabs: ' + st.tabs.join(' | '));
  Logger.log('INSTALL rule: ' + imRuleText_() + ' | one mail per cluster | today is ' +
    Utilities.formatDate(new Date(), tz, 'EEEE yyyy-MM-dd') + ' in ' + tz);

  Logger.log('=== 1. ANG TATLONG PINAGBABASAN (CSP STATUS ang kulungan) ===');
  INSTALL.CSP_OPEN.forEach(w => Logger.log('   CSP STATUS eksaktong "' + w + '" -> ' +
    (st.branchTally[nk_(w)] || 0) + ' row - SASAMA, walang ibang kundisyon'));
  Logger.log('   CSP STATUS eksaktong "' + INSTALL.CSP_PAID + '" -> dalawang posibleng sagot:');
  Logger.log('     a. FINAL STATUS eksaktong "' + INSTALL.PAID_FINAL + '" -> ' +
    (st.branchTally[paidBranch] || 0) + ' row - SASAMA');
  Logger.log('     b. FINAL STATUS iba -> ' + st.paidBlocked.length + ' row - HINDI SASAMA (nasa #2 sa ibaba)');
  Logger.log('   KABUUAN ng nasa queue: ' + st.matched.length + ' row sa ' + reportTabs_(INSTALL).join(' + ') +
    ' tab' + (st.matched.length ? '' : ' - WALANG row ngayon, basahin muna ang #2 at #3'));

  Logger.log('=== 2. ANG MGA HINIHINDI NG RULE - para makita mo kung tama ang hiwa ===');
  Logger.log('   2a. CSP STATUS = PAID, pero iba ang FINAL STATUS: ' + st.paidBlocked.length + ' row HINDI SASAMA');
  if (st.paidBlocked.length) {
    tally(st.paidBlockWords, 8);
    st.paidBlocked.slice(0, 5).forEach(m => Logger.log('     sample: ' + who(m).join(' | ') +
      ' | FINAL STATUS = "' + imUp_(m.r['FINAL STATUS']).slice(0, 50) + '"'));
    if (st.paidBlocked.length > 5) Logger.log('     ...at ' + (st.paidBlocked.length - 5) + ' pang row');
  } else Logger.log('     wala - bawat PAID sa CSP STATUS ay tugma ang FINAL STATUS');
  Logger.log('   2b. FINAL STATUS eksaktong "' + INSTALL.PAID_FINAL + '", pero CSP STATUS iba: ' +
    st.finalExact.length + ' row HINDI SASAMA');
  Logger.log('         (ito ang ihahatid ng MAKANDANG rule - yung pinapaluwas mo nang "mali ka ng unawa". ' +
    'Kung may row dito na dapat nasa queue, sabihin mo - ang CSP STATUS ang basehan natin ngayon:)');
  if (st.finalExact.length) {
    tally(st.finalExactCsp, 8);
    st.finalExact.slice(0, 5).forEach(m => Logger.log('     sample: ' + who(m).join(' | ') +
      ' | CSP STATUS = "' + imUp_(m.r['CSP STATUS']).slice(0, 40) + '"'));
    if (st.finalExact.length > 5) Logger.log('     ...at ' + (st.finalExact.length - 5) + ' pang row');
  }
  Logger.log('   2c. FINAL STATUS na MAY AMOY ng PAID / INSTALL pero hindi eksakto: ' +
    sum(st.finalNear) + ' row HINDI SASAMA');
  if (sum(st.finalNear)) tally(st.finalNear, 8);

  Logger.log('=== 3. IBA PANG CSP STATUS na MAY AMOY ng tatlo - EXACT rule, kaya HINDI sasama ===');
  if (!sum(st.cspNear)) Logger.log('   wala - walang CSP STATUS na may RESERV / ORDER / PAID / INSTALL na hindi eksakong tugma.');
  else {
    Logger.log('   ' + Object.keys(st.cspNear).length + ' pang spelling, ' + sum(st.cspNear) + ' row - ito ang HINDI sasama:');
    tally(st.cspNear);
  }
  Logger.log('   lahat ng value ng CSP STATUS sa mga HINDI nasa queue (top 10):');
  tally(st.cspWords, 10);
  Logger.log('   blank na CSP STATUS: ' + (st.cspWords['(blank na CSP STATUS)'] || 0) +
    ' row (hindi sasama - "KAPAG BLANK WAG ISASAMA")');

  Logger.log('=== 4. IWA-IBANG MAIL KADA CLUSTER (gaya ng AFD / NOT AOR) ===');
  Logger.log('   index: ' + (idx ? idx.rows + ' row sa tab "' + INSTALL.CLUSTER_TAB + '" (' +
    idx.placeCols.join('+') + ' -> ' + idx.clusterCol + '), ' + Object.keys(idx.values).length + ' pangalan ng cluster'
    : 'WALANG INDEX: ' + why.join(' / ')));
  if (!st.groups.length) Logger.log('   wala pang mabigyan ng pangalan na cluster');
  st.groups.forEach(g => Logger.log('   mail: CLUSTER ' + g.digits + ' = ' + g.n + ' row  (' +
    [g.row ? g.row + ' mula sa CLUSTER cell ng row' : '', g.tab ? g.tab + ' mula sa "' + INSTALL.CLUSTER_TAB + '" tab' : '']
      .filter(Boolean).join(', ') + ')'));
  if (st.skippedGroups.length) Logger.log('   LAMPAS SA LIMITASYON: ' +
    st.skippedGroups.map(g => 'CLUSTER ' + g.digits + '=' + g.n).join(', '));
  Logger.log('   KABILANG: ' + st.groups.length + ' mail kada araw (limitasyon: ' + INSTALL.MAX_GROUPS +
    ') | quota sa Gmail ngayon: ' + MailApp.getRemainingDailyQuota() + ' padala pa today, lahat ng mail');
  if (st.dropped.length) {
    Logger.log('   HINDI SASAMA - ' + st.dropped.length + ' row na walang mapangalanang cluster:');
    st.dropped.slice(0, 15).forEach(d => Logger.log('     ' + who(d.m).join(' | ') + ' | ' + d.why));
    if (st.dropped.length > 15) Logger.log('     ...at ' + (st.dropped.length - 15) + ' pang row');
  }
  /* the one line that proves the scout and the mail agree, counted from the SAME collector the
     send uses - if these two numbers ever differ, the log he approved is not the mail PLDT gets */
  Logger.log('   PROBING AT MAIL NA PAREHO: ' + st.matched.length + ' row ang binibilang ng probe, ' +
    items.length + ' row ang kukunin ng mail (' + (st.matched.length - items.length) + ' ang nawala sa ' +
    'CLUSTER-tab na pagpangalan) | ' + st.groups.length + ' mail');

  Logger.log('=== 5. ANG TEMPLATE MO: WHAT EACH COLUMN REALLY HOLDS ===');
  Logger.log('   siyam na column na gusto mo: ' + INSTALL.COLS.join(' | '));
  ['PLDT', 'RED'].forEach(n => {
    if (st.heads[n]) Logger.log('   tunay na header sa ' + n + ': ' + st.heads[n].join(' | '));
  });
  /* His header word for each column, matched against her real headers - through COL_SOURCE, so the
     two labels he renamed (PID and STATUS) are checked against the header they actually read. */
  INSTALL.COLS.forEach(c => {
    const src = imSrc_(INSTALL, c);
    const cw = nk_(src).split(' ');
    const exact = [], near = [];
    Object.keys(st.heads).forEach(t => st.heads[t].forEach(h => {
      if (nk_(h) === nk_(src)) { if (exact.indexOf(t) < 0) exact.push(t); return; }
      const hw = nk_(h).split(' ');
      if (cw.every(w => hw.indexOf(w) >= 0)) { const k = t + ':' + h; if (near.indexOf(k) < 0) near.push(k); }
    }));
    Logger.log('   "' + c + '"' + (src === c ? '' : ' (bumabasa ng "' + src + '")') + ' = ' +
      (exact.length ? 'MAY EXACT na header sa ' + exact.join(' + ') + ' tab'
        : near.length ? 'WALA ang eksakong header - mga kandidato: ' + near.slice(0, 6).join(', ') +
          (near.length > 6 ? ' ...at ' + (near.length - 6) + ' pa' : '')
        : 'WALANG header ng sales tab na tumutugma doon'));
  });
  /* what the mail would ACTUALLY print, straight out of the collector - not the raw column again */
  INSTALL.COLS.forEach(c => {
    const t = {};
    items.slice(0, INSTALL.MAX_ROWS).forEach(i => { const v = String(i[c]).trim() || '(blank)'; t[v] = (t[v] || 0) + 1; });
    Logger.log('   --- "' + c + '" (galing sa "' + imSrc_(INSTALL, c) + '") sa mga sasama (' +
      Object.keys(t).length + ' na ibang-iba) ---');
    tally(t, 8);
  });
  Logger.log('   sample ng isang row (para makita mo ang buong hilera):');
  items.slice(0, 3).forEach(i => Logger.log('     ' + INSTALL.COLS.map(c => c + '="' + String(i[c]).slice(0, 40) + '"').join('  ')));

  Logger.log('=== 6. ANO NA ANG NANDOON (at ano pa ang hinihintay) ===');
  Logger.log('   may send-function na: runInstallNotices (trigger), sendInstallReport (agad), ' +
    'instPreview (walang send), instTestReport (test copy sa iyo lang), installInstallTrigger (10AM).');
  Logger.log('   pero DRY_RUN pa rin = ' + INSTALL.DRY_RUN + ' - kaya ang bawat pindot ay ' +
    'test copy sa ' + NOTICE.ADMIN_EMAILS.join(',') + ' lang | walang naabot na PLDT.');
  Logger.log('   schedule: SEND_HOURS ' + INSTALL.SEND_HOURS.join(',') +
    ' (isang beses kada araw, 10AM) | To ' + INSTALL.TO.join(',') + ' | CC ' + INSTALL.CC.join(','));
  Logger.log('   WALANG dedupe: ang row na nasa queue pa rin bukas ay maulit (ang sagot mo: B).');
  Logger.log('   HINIINTAY PA: basahin ang instTestReport copy, tapos sabihin "go" para i-off ang ' +
    'DRY_RUN at pindutin ang installInstallTrigger.');
  return st;
}
