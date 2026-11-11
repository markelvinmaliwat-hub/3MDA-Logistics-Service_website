/* CancelProbe.gs - READ-ONLY scout for the seventh mail the owner asked on 2026-11-11.

   His words: "gumawa ng automated email regarding sa FOR CANCELLATION - NON COMPLIANCE - NO PAYMENT,
   ito yung mga for payment na hindi na nag comply para sa 1AMSF, kaya email ito kay lsabat@pldt.com.ph
   cc sila jrsnavarro25@gmail.com ilanoandong@gmail.com markelvinmaliwat@gmail.com".

   That sentence carries TWO possible rules, and guessing wrong would mail PLDT a list of subscribers
   who were never overdue. So this file decides nothing - it only measures, in his live file:

     1. Does the wording already exist? Which tab, which column, how many rows, 3 SR examples.
        A row counts as the REAL tag only when all three parts - CANCELLATION, NON COMPLIANCE and
        NO PAYMENT - sit in the same cell, because "CANCELLATION" alone also appears on rows
        cancelled for other reasons (duplicate name, already re-encoded, subscriber changed address).
     2. If nobody types that tag yet, can it be DERIVED? How many rows are still FOR PAYMENT and how
        old is each one from its own DATE cell, counted at 30 / 60 / 90 days - "1 AMSF" is a month,
        and which month he means is the one number I cannot read off a sheet.
     3. Is there already a column storing the AMSF deadline (a header naming AMSF / DUE / PAYMENT /
        CUTOFF / VALID), and what do three of its real values look like?
     4. If this becomes a mail: how many rows, how many clusters, and would it be ONE mail or one
        mail per cluster the way the NOT AOR mail fans out?

   THIS FILE SENDS NOTHING AND WRITES NOTHING. No MailApp.sendEmail, no setValue, no trigger, and it
   needs no deployment - press cxProbe() in the function dropdown and read the Execution log.

   Names are CX / cx* on purpose: Apps Script loads every file into ONE shared global scope, and
   AorProbe.gs already owns AOR/aor* while NotAorMail.gs owns NOTAOR/nao*. A repeated name would
   break the four live mails, not just this scout.
*/

const CX = {
  NAME: 'CANCEL',
  /* the three parts of his tag. A cell must carry ALL of them to count as the tagging itself. */
  PARTS: ['CANCELLATION', 'NON COMPLIANCE', 'NO PAYMENT'],
  /* the looser words, reported per column so "the word exists" is never mistaken for "the tag exists" */
  PIECES: ['CANCELLATION', 'NON COMPLIANCE', 'NO PAYMENT', 'FOR PAYMENT'],
  /* the age line, if the rule has to be derived instead of read */
  AGES: [30, 60, 90],
  /* the tabs the FOR PAYMENT rows live in (NOTICE.SALES_TABS, spelled out so the log is readable) */
  TABS: ['PLDT', 'RED'],
  /* a header naming one of these is a candidate for the AMSF clock - this probe only reports them */
  AMSF_WORDS: ['AMSF', 'DUE', 'PAYMENT', 'CUTOFF', 'CUT OFF', 'EXPIR', 'VALID', 'UNTO', 'SCHEDULE']
};

/* nk_ lives in AgentNotices.gs and does exactly what a comparison needs: upper case, punctuation
   turned into spaces, spacing collapsed. He types the tag with dashes today; a slash tomorrow would
   still land the same way, because everything here compares keys, never raw strings. */
const cxKey_ = s => nk_(s);

/* rows of a tab that have at least one non-empty cell - tab_(plain) already finds the header row */
function cxRows_(ss, name) {
  return tab_(ss, name, true).filter(r => Object.keys(r).some(k =>
    String(r[k] === undefined || r[k] === null ? '' : r[k]).trim() !== ''));
}

/* does this cell carry every part of the tag? */
const cxIsTag_ = (v, parts) => {
  const k = cxKey_(v);
  return !!k && parts.every(p => k.indexOf(cxKey_(p)) >= 0);
};

/* something to name a row by in the log - SR, subscriber, cluster */
function cxExample_(r) {
  const sr = r.SR !== undefined ? r.SR : r['SR NO'];
  return 'SR ' + String(sr === undefined ? '-' : sr).slice(0, 14) + ' | ' +
    String(r['SUBSCRIBER NAME'] || r.SUBSCRIBER || r.NAME || '').slice(0, 26) +
    ' | CLUSTER ' + String(r.CLUSTER === undefined ? '-' : r.CLUSTER).slice(0, 12);
}

/* Age in days from a DATE-like cell. null when the cell is not a date: a blank age must never be
   counted as "old enough", or the mail would list rows that were encoded yesterday. */
function cxAge_(v, now) {
  if (!(v instanceof Date) || isNaN(v.getTime())) return null;
  return Math.floor((now.getTime() - v.getTime()) / 86400000);
}

const cxTally_ = (obj, k) => { obj[k] = (obj[k] || 0) + 1; return obj; };
const cxTop_ = (tally, n) => Object.keys(tally).sort((a, b) => tally[b] - tally[a]).slice(0, n)
  .map(k => k + '=' + tally[k]).join(', ');

/* THE DROPDOWN ENTRY. Everything below prints; nothing sends and nothing is written. */
function cxProbe() {
  const ss = reportSs_(NOTICE);
  const now = new Date();
  Logger.log('=== CancelProbe.gs | READ-ONLY | ' + ss.getName() +
    ' | walang mail, walang sinusulat, walang deploy ===');
  const tabs = ss.getSheets();
  Logger.log('tabs: ' + tabs.map(s => s.getName() + '=' + Math.max(0, s.getLastRow() - 1)).join(', '));

  /* ---------- 1. SAAN NARORON ang tag (lahat ng tab, lahat ng column) ---------- */
  let tagRows = 0;
  const tagCols = [];
  tabs.forEach(sh => {
    const name = sh.getName();
    if (sh.getLastRow() < 2) return;
    const rows = cxRows_(ss, name);
    if (!rows.length) { Logger.log('  (skip) ' + name + ' | nabasa ng tab_(plain) ay 0 row'); return; }
    const cols = Object.keys(rows[0]);
    const found = [];
    cols.forEach(c => {
      const tag = rows.filter(r => cxIsTag_(r[c], CX.PARTS));
      const loose = {};
      CX.PIECES.forEach(p => {
        loose[p] = rows.filter(r => cxKey_(r[c]).indexOf(cxKey_(p)) >= 0).length;
      });
      if (tag.length) {
        tagRows += tag.length;
        found.push(c);
        Logger.log('  ## TUNAY NA TAG: ' + name + ' > ' + c + ' = ' + tag.length +
          ' row | halimbawa: ' + tag.slice(0, 3).map(cxExample_).join(' / '));
        Logger.log('     eksaktong sinusulat: "' + String(tag[0][c]).slice(0, 120) + '"');
      } else {
        const said = CX.PIECES.filter(p => loose[p]);
        if (said.length) Logger.log('  ? bahagya lang: ' + name + ' > ' + c + ' | ' +
          said.map(p => '"' + p + '"=' + loose[p]).join(', ') + ' | walang cell na may LAHAT ng' +
          ' tatlong parte (' + CX.PARTS.join(' + ') + ')');
      }
    });
    if (found.length) tagCols.push(name + ' ' + found.join('+'));
    else Logger.log('--- ' + name + ' | ' + rows.length + ' row | walang kahit anong column na' +
      ' may CANCELLATION / NON COMPLIANCE / NO PAYMENT');

    /* ---------- 2. AMSF CLOCK CANDIDATES: headers naming a deadline ---------- */
    const re = new RegExp('(' + CX.AMSF_WORDS.join('|') + ')', 'i');
    cols.filter(c => re.test(c)).forEach(c => {
      const vals = [];
      rows.forEach(r => {
        const v = r[c];
        if (v === '' || v === undefined || v === null) return;
        vals.push(v instanceof Date ? Utilities.formatDate(v, 'Asia/Manila', 'M/d/yyyy')
          : String(v).slice(0, 40));
      });
      Logger.log('  + candidate na column: ' + name + ' "' + c + '" | ' + vals.length +
        ' na may laman | halimbawa: ' + vals.slice(0, 3).join(' / ') +
        (vals.length ? ' | pinaka-iba: ' + Array.from(new Set(vals)).slice(0, 5).join(' / ') : ''));
    });
    if (!cols.some(c => re.test(c)))
      Logger.log('  (walang header sa ' + name + ' na banggit ang AMSF / DUE / PAYMENT / CUTOFF)');
  });
  Logger.log('=== 1. ANG BUONG TAG, tatlong parte sa iisang cell: ' + tagRows + ' row' +
    (tagCols.length ? ' | nasaan: ' + tagCols.join(' , ') : ' | WALANG ganito pangyayari - ' +
      'kaya ikutuin sa edad o sa ibang column') + ' ===');

  /* ---------- 3. KUNG HINDI NATYPED: ILANG ARAW NA ang FOR PAYMENT rows ---------- */
  CX.TABS.forEach(name => {
    const rows = cxRows_(ss, name);
    if (!rows.length) { Logger.log('=== 2. ' + name + ': 0 row na nabasa ==='); return; }
    const fp = rows.filter(r => cxKey_(r['FINAL STATUS']).indexOf('FOR PAYMENT') === 0);
    Logger.log('=== 2. ' + name + ' | FINAL STATUS nagsisimula sa FOR PAYMENT: ' + fp.length +
      ' row sa kabuuan ng tab na ' + rows.length + ' row ===');
    if (!fp.length) return;
    const ages = [];
    let noDate = 0;
    fp.forEach(r => {
      const a = cxAge_(r.DATE, now);
      if (a === null) noDate++; else ages.push({ r: r, a: a });
    });
    if (noDate) Logger.log('  ?? ' + noDate + ' FOR PAYMENT row na WALANG mabasang DATE cell ' +
      '(hindi bilangin bilang tumanda): ' +
      fp.filter(r => cxAge_(r.DATE, now) === null).slice(0, 3).map(cxExample_).join(' / '));
    if (!ages.length) { Logger.log('  (walang edad na masusukat - walang DATE na date)'); return; }
    const s = ages.map(x => x.a).sort((x, y) => x - y);
    const future = ages.filter(x => x.a < 0);
    Logger.log('  EDAD mula sa DATE: pinakabata ' + s[0] + ' araw | gitna ' +
      s[Math.floor(s.length / 2)] + ' | pinakatanda ' + s[s.length - 1] +
      ' | nasukat: ' + s.length + ' row');
    /* a DATE in the future is not a typo to laugh at - it quietly leaves the queue, because
       "older than 30 days" is false for a negative age. He needs to see the count before he
       trusts any age-based rule. */
    if (future.length) Logger.log('  ?? ' + future.length + ' FOR PAYMENT row na ANG DATE AY SA HINARAP ' +
      '(hindi kailanman babagsa sa edad): ' + future.slice(0, 3).map(x => cxExample_(x.r)).join(' / '));
    CX.AGES.forEach(line => {
      const over = ages.filter(x => x.a > line);
      Logger.log('  LAMPAS ' + line + ' ARAW: ' + over.length + ' row' +
        (over.length ? ' | halimbawa: ' + over.slice(0, 3).map(x => cxExample_(x.r)).join(' / ') : ''));
    });

    /* ---------- 4. PAANO CUT-IN NG MAIL ---------- */
    const over = ages.filter(x => x.a > CX.AGES[0]);
    if (!over.length) { Logger.log('  (walang lampas ' + CX.AGES[0] + ' araw na FOR PAYMENT sa ' + name + ')'); return; }
    const cl = {}, tl = {}, ag = {};
    over.forEach(x => {
      cxTally_(cl, cxKey_(x.r.CLUSTER) || 'WALANG CLUSTER');
      cxTally_(tl, cxKey_(x.r['TEAM LEADER']) || 'WALANG TL');
      cxTally_(ag, cxKey_(x.r['AGENT NAME']) || 'WALANG AGENT');
    });
    const kc = Object.keys(cl);
    Logger.log('  KUNG ISANG MAIL LANG: ' + over.length + ' row sa iisang table');
    Logger.log('  KUNG ISANG MAIL KADA CLUSTER (' + CX.AGES[0] + '+ araw): ' + kc.length + ' mail (' +
      cxTop_(cl, 12) + ')' + (kc.length > 12 ? ' | ...at ' + (kc.length - 12) + ' pang cluster pa' : ''));
    Logger.log('  TEAM LEADER ng mga iyon: ' + Object.keys(tl).length + ' (' + cxTop_(tl, 6) + ')');
    Logger.log('  AGENT ng mga iyon: ' + Object.keys(ag).length + ' tao');
    Logger.log('  mga header sa ' + name + ' na pwedeng i-print: ' + Object.keys(rows[0]).join(' | '));
  });

  Logger.log('=== GAANO KALAKI NGAYON: ' + MailApp.getRemainingDailyQuota() +
    ' pang-email ang natitira (hindi gumagamit ang probe na ito) ===');
  Logger.log('=== TAPOS. Tatlong bilang na IKAW ang pipili, hindi ako: ===');
  Logger.log('  A. may TAG NA RIYAN na sa sheet (mabasa sa mga hugis "TUNAY NA TAG") o ikutuin sa' +
    ' EDAD (mabasa sa mga hugis "LAMPAS ... ARAW")');
  Logger.log('  B. ilang araw ang 1 AMSF - 30? 60? 90?');
  Logger.log('  C. isang mail na lahat-sama, o isang mail kada cluster');
  return { tagRows: tagRows, tagCols: tagCols, quota: MailApp.getRemainingDailyQuota() };
}
