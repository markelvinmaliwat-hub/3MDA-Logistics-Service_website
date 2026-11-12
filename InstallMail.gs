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
   imBranch_() is the ONE predicate the probe and the future mail share, so neither
   can drift from the other.
   A cancelled row cannot enter: CANCELLED is not one of the three CSP values, and
   a strict-equals rule refuses anything longer - the same strictness the
   cancellation mail runs on.

   "iba ibang email ito kada cluster ang pag sesendan kaya hiwa hiwalay sya
   ipapadala" - one mail PER CLUSTER, the AFD/NOT AOR shape, not one big table.
   "ang format ng template ay dapat yung kagaya ng nasa litrato" - his table is
   DATE | SUBSCRIBER NAME | PR | BRGY | CITY | CLUSTER | STATUS | PAYMENT
   REFERENCE/ REMARKS | PAYMENT STATUS.
   "ipadala sa parehas na email kagaya sa SFS/CV" and "isang beses lang kada araw
   ... dapat tuwing 10am".

   THIS FILE STILL HAS NO SEND IN IT. Deliberately, the way AFD29 was shipped: three
   of his nine columns have no proven source yet, and a mail whose column is empty
   goes to PLDT looking like a mistake. So this file is the INSTALL config plus
   instProbe() - a read-only scout that counts the rows each of his THREE branches
   admits, shows what CSP STATUS = PAID was refused because its FINAL STATUS line
   said something else, splits the queue into the clusters each mail would be named
   for, and prints the REAL header names and REAL values of every candidate column.
   He picks, then the send gets written. Nothing here can mail anything, writes
   nothing to the sheet, and needs no deployment.

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
  /* ---- his three branches, named apart so the log can say which one a row came in on ---- */
  CSP_OPEN: ['RESERVED FACILITY', 'ORDER CREATED'],   // these two qualify on their own
  CSP_PAID: 'PAID',                                   // this one needs the FINAL STATUS line below
  PAID_FINAL: 'PAID - FOR INSTALLATION',
  FROM: ['CSP STATUS'],                    // the deciding column - his correction
  STATUS: ['RESERVED FACILITY', 'ORDER CREATED', 'PAID'],
  ANY: true,                               // ANY of the three, not all three at once
  EXACT: true,                             // the whole cell, the CANCEL mail's strictness
  SHEET_ID: '',                            // '' = DATABASE AUG TO OCT, the live-synced sales file
  TABS: [],                                // '' = NOTICE.SALES_TABS (PLDT + RED)
  /* the cluster the mail is NAMED for. The row's own CLUSTER cell is used when it has a number;
     a row whose cell says NOT AOR gets its cluster from his CLUSTER tab by BRGY + CITY, which is
     exactly what he asked for: "kasama ang not AOR at pag babasehan ng not AOR ay yung may TAB
     na CLUSTER kagaya ng sa AFD RESCHEDULE". */
  CLUSTER_TAB: 'CLUSTER',
  SOURCE_CLUSTER: 'NOT AOR',
  /* his template, in his order, spelled the way he typed it in the screenshot. Three of these
     are NOT yet wired to a sheet column - that is what instProbe section 5 prints. */
  COLS: ['DATE', 'SUBSCRIBER NAME', 'PR', 'BRGY', 'CITY', 'CLUSTER', 'STATUS',
    'PAYMENT REFERENCE/ REMARKS', 'PAYMENT STATUS'],
  SEND_HOURS: [10],                        // "isang beses lang kada araw ... tuwing 10am"
  DRY_RUN: true,
  MAX_ROWS: 300,
  MAX_GROUPS: 20,                          // one Gmail send per cluster; the quota is ~100/day for everything
  TIMEZONE: '',
  SUBJECT: '3MDA_INSTALL_',                // + CLUSTER<n>_ + MMMyyyy, built per mail the way NOT AOR does
  SENT_PREFIX: 'INSTALL_SENT_',
  /* the columns whose value PLDT reads as "STATUS" - CSP STATUS leads because that is where his
     rule lives now. The probe prints each one's real contents on the queued rows so he names the
     right one instead of me guessing from one screenshot */
  CANDIDATES: ['CSP STATUS', 'FINAL STATUS', 'PAYMENT STATUS', 'FUSE STATUS', 'OFSC STATUS'],
  PAY_COLS: ['PAYMENT REFERENCE/ REMARKS', 'PAYMENT STATUS', 'CSP REMARKS', 'PAYMENT REMARKS'],
  TEST: { STATUS: ['RESERVED FACILITY', 'ORDER CREATED', 'PAID'], MAX_ROWS: 12, MAX_GROUPS: 3 }
};

const imUp_ = v => String(v === undefined ? '' : v).trim().toUpperCase();

/* ---- the rule, in ONE place ----
   The probe and the future mail both call this, so the count he approves is the count that mails.
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

/* ---- the CLUSTER-tab join, copied from the rules aorProbe proved and NotAorMail shipped (nao*).
   His tab keeps the address in ONE text field ("BGY ALIMA BACOOR CITY") while the sales tab keeps
   it in TWO columns (BRGY + CITY), so both sides are reduced to the same key: uppercase, punctuation
   gone, location words dropped. It is copied under im* rather than called, because NotAorMail.gs is
   a file he may or may not have pasted yet, and this probe must run on its own. */
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

/* ---- the read-only scout ---- */
function instProbe() {
  const ss = reportSs_(INSTALL), tz = INSTALL.TIMEZONE || NOTICE.TIMEZONE;
  const paid = nk_(INSTALL.CSP_PAID), wantFinal = nk_(INSTALL.PAID_FINAL);
  /* the label imBranch_ gives the PAID rows, asked of imBranch_ itself so the two can never drift */
  const paidBranch = imBranch_({ 'CSP STATUS': INSTALL.CSP_PAID, 'FINAL STATUS': INSTALL.PAID_FINAL });
  const BLANK_CSP = '(blank na CSP STATUS)', BLANK_FIN = '(blank na FINAL STATUS)';
  const st = {
    rows: 0, tabs: [], noHeader: [], matched: [], heads: {}, valTally: {},
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

  /* every candidate column, counted on the QUEUED rows only - that is the set that will be
     in the mail, so its values are the ones he has to recognise. The values are printed EXACTLY
     as the cell holds them, sloppy spacing included, because that is what he can go fix; the
     rule itself reads them normalised, which is why the queue count and this list can differ. */
  const cols = INSTALL.CANDIDATES.concat(INSTALL.PAY_COLS.filter(c => INSTALL.CANDIDATES.indexOf(c) < 0));
  st.matched.forEach(m => {
    cols.forEach(c => {
      const v = String(m.r[c] === undefined ? '<<WALANG GANITONG HEADER>>' : m.r[c]).trim() || '(blank)';
      const t = (st.valTally[c] = st.valTally[c] || {});
      t[v] = (t[v] || 0) + 1;
    });
  });

  const why = [];
  const idx = imIndex_(ss, INSTALL, why);
  st.matched.forEach(m => {
    const c = imClusterFor_(m.r, idx);
    if (c.why) { st.dropped.push({ m: m, why: c.why }); return; }
    const g = (st.gmap[c.digits] = st.gmap[c.digits] || { digits: c.digits, value: c.value, n: 0, row: 0, tab: 0 });
    g.n++; g[c.from.indexOf('tab') === 0 ? 'tab' : 'row']++;
  });
  /* sorted, so the log and the returned object both lead with the biggest mail */
  st.groups = Object.keys(st.gmap).map(k => st.gmap[k]).sort((a, b) => b.n - a.n);

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
  Logger.log('   KABILANG: ' + st.groups.length + ' mail kada araw (limitasyon: ' + INSTALL.MAX_GROUPS +
    ') | quota sa Gmail ngayon: ' + MailApp.getRemainingDailyQuota() + ' padala pa today, lahat ng mail');
  if (st.dropped.length) {
    Logger.log('   HINDI SASAMA - ' + st.dropped.length + ' row na walang mapangalanang cluster:');
    st.dropped.slice(0, 15).forEach(d => Logger.log('     ' + who(d.m).join(' | ') + ' | ' + d.why));
    if (st.dropped.length > 15) Logger.log('     ...at ' + (st.dropped.length - 15) + ' pang row');
  }

  Logger.log('=== 5. ANG TEMPLATE MO: WHAT EACH COLUMN REALLY HOLDS ===');
  Logger.log('   siyam na column na gusto mo: ' + INSTALL.COLS.join(' | '));
  ['PLDT', 'RED'].forEach(n => {
    if (st.heads[n]) Logger.log('   tunay na header sa ' + n + ': ' + st.heads[n].join(' | '));
  });
  /* His header word for each column, matched against her real headers. An exact hit is settled;
     anything else prints the headers whose words CONTAIN it, which is how "STATUS" admits that
     CSP STATUS, FINAL STATUS, PAYMENT STATUS, FUSE STATUS and OFSC STATUS all claim to be it -
     and that is a question for him, not a guess for me. */
  INSTALL.COLS.forEach(c => {
    const cw = nk_(c).split(' ');
    const exact = [], near = [];
    Object.keys(st.heads).forEach(t => st.heads[t].forEach(h => {
      if (nk_(h) === nk_(c)) { if (exact.indexOf(t) < 0) exact.push(t); return; }
      const hw = nk_(h).split(' ');
      if (cw.every(w => hw.indexOf(w) >= 0)) { const k = t + ':' + h; if (near.indexOf(k) < 0) near.push(k); }
    }));
    Logger.log('   "' + c + '" = ' + (exact.length ? 'MAY EXACT na header sa ' + exact.join(' + ') + ' tab'
      : near.length ? 'WALA ang eksakong header - mga kandidato: ' + near.slice(0, 6).join(', ') +
        (near.length > 6 ? ' ...at ' + (near.length - 6) + ' pa' : '')
      : 'WALANG header ng sales tab na tumutugma doon'));
  });
  cols.forEach(c => {
    Logger.log('   --- "' + c + '" sa mga nasa queue (' + (st.valTally[c] ? Object.keys(st.valTally[c]).length : 0) + ' na ibang-iba) ---');
    if (st.valTally[c]) tally(st.valTally[c], 8);
  });
  Logger.log('   sample ng isang row (para makita mo ang buong hilera):');
  st.matched.slice(0, 3).forEach(m => Logger.log('     ' + ['DATE', 'SUBSCRIBER NAME', 'PR', 'BRGY', 'CITY', 'CLUSTER']
    .concat(cols)
    .map(h => h + '="' + String(m.r[h] === undefined ? '<<WALANG HEADER>>' : m.r[h]).slice(0, 40)).join('  ')));

  Logger.log('=== 6. HINDI PA NAGAGAWA ===');
  Logger.log('   walang send-function sa file na ito. Ang #5 sa itaas ang nagsasabi kung alin sa ' +
    'siyam na column ng template mo ang may eksaktong header sa PLDT / RED at alin ang wala. Ang ' +
    'bawat "WALA ang eksakong header" - lalo na sa "' + INSTALL.COLS[6] + '", na kaya ng limang ' +
    'iba-ibang column - ay sagot mo, hindi ko hulaan, dahil doon lilinisin ng mail ang table. ' +
    'Sabihin ang mga sagot, tapos isusulat ang mail - DRY_RUN muna, copy sa sarili mong inbox.');
  Logger.log('   isang tanong bago ang mail: SR na nasa queue pa rin bukas - maulit ba sa bukang 10AM ' +
    'o isang beses lang kada SR? Ang AFD / NOT AOR mail ay isang beses kada SR (dedupe), ang ' +
    'cancellation mail ay kada Biyernes. Piliin mo.');
  Logger.log('   schedule na isusulat pagka-approved: SEND_HOURS ' + INSTALL.SEND_HOURS.join(',') +
    ' (isang beses kada araw, 10AM) | To ' + INSTALL.TO.join(',') + ' | CC ' + INSTALL.CC.join(','));
  Logger.log('   DRY_RUN: ' + INSTALL.DRY_RUN + ' | walang nasulat sa sheet, walang na-email sa probe na ito');
  return st;
}
