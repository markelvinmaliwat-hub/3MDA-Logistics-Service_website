/* ============================================================================
   CANCEL - the seventh queue the owner asked for, 2026-11-11.
   His words: "gumawa ng automated email regarding sa FOR CANCELLATION - NON
   COMPLIANCE - NO PAYMENT ito yung mga for payment na hindi na nag bayad",
   then, when I offered to derive the queue from how old a FOR PAYMENT row is:
   "ang sabi ko sa FINAL STATUS na naka FOR CANCELLATION - NON COMPLIANCE - NO
   PAYMENT and sulat ito ay eemail sa mga sinabi ko na email upang ipa cancel".
   So the rule is the CELL, not the calendar: a row joins this mail when its
   FINAL STATUS says that phrase. Nothing is estimated from age.

   THE FOUR DECISIONS HE MADE, same day:
   1. Eksaktong kopya - EXACT is true. The whole cell has to be that phrase, not
      a note that happens to mention it. Only the typing is forgiven, never the
      meaning: nk_() compares case-folded and with dashes and repeated spaces
      collapsed, so "for cancellation -  non compliance - no payment " is the
      same tagging. A cell with extra words is NOT a match, and cancelProbe()
      prints those near-miss spellings instead of dropping them quietly.
   2. One mail for every row, not one per cluster - he picked it over the AFD
      shape, so INTRO names no cluster and there is no {CLUSTER} to fill.
   3. Friday, 1:00 PM - and only Friday. installCancelTrigger() creates ONE
      weekday trigger; runCancelNotices() also refuses to send on any other day,
      LOUDLY (the log quotes the day name it read), because a trigger that is
      set wrong should say so rather than mail on a Wednesday.
   4. Recipients exactly as he typed them - one To, three CCs. No address is
      borrowed from the AFD/SFS lists and none is invented.

   ONCE PER SR, NOT EVERY WEEK. markSent_() remembers only what a report mailed
   THAT DAY, so on its own this mail would re-request the same unpaid SR to
   PLDT every single Friday. cancelSend_() therefore seeds today's dedupe list
   from its own week-proof list (CANCEL_MAIL_, under a different prefix so
   markSent_'s daily cleanup cannot touch it) and records what went out. A row
   is requested once and then stays out until the tag is cleared or he presses
   clearCancelSent(). CANCEL.REMAIL_WEEKLY = true switches the memory off if he
   ever wants the standing backlog re-sent every week instead.

   DRY_RUN is true: nothing reaches PLDT until he has read cancelTestReport and
   flips this file's one DRY_RUN line.  cancelProbe / cancelPreview send
   nothing and write nothing. This file adds no column, no sheet and no
   permission, and reuses the report engine already in AgentNotices.gs
   (collectReport_ / buildReportMail_ / sendReport_) so the wording, the red
   header table, the logo and the signature are the same machinery the five
   live mails already use. Prefixes CANCEL / cm* keep it out of that file's
   global scope.
   ========================================================================= */
const CANCEL = {
  NAME: 'CANCEL',
  TO: ['lsabat@pldt.com.ph'],
  CC: ['jrsnavarro25@gmail.com', 'ilanoandong@gmail.com', 'markelvinmaliwat@gmail.com'],
  GREET: 'Hi Sir Jack,',
  /* His own sentence, given to me on 2026-11-11 to have its grammar fixed - he picked the
     two-sentence version, so "1 AMSF", SR / ACCOUNT / PR and the "open in the system" reason
     all stay his words. Nothing here was invented by me. */
  INTRO: 'For cancellation. The applications listed below were released for payment, but the subscribers did not comply within 1 AMSF. We would therefore like to request the cancellation of their SR / ACCOUNT / PR so that these records no longer remain open in the system.',
  CLOSE: 'Should you have any concerns regarding these applications, please kindly reply to this email so that we may address them immediately.',
  THANKS: 'Thank you !',
  SIGN: ['Mark Maliwat', 'Sales Validator - MMMDA Logistics', 'Service Cavite Upland'],
  LOGO_URL: 'https://markelvinmaliwat-hub.github.io/3MDA-Logistics-Service_website/assets/mmmda-logo.jpg',
  LOGO_KEY: 'mmmda-logo',
  LOGO_ALT: 'MMMDA Logistics Service',
  LOGO_W: 150, LOGO_H: 147,
  LOGO_ABOVE: true,
  FOOTER: '',
  STATUS: 'FOR CANCELLATION - NON COMPLIANCE - NO PAYMENT',
  SHEET_ID: '',                        // '' = DATABASE AUG TO OCT, the same file the other reports read
  TABS: [],                            // '' = NOTICE.SALES_TABS (PLDT + RED)
  FROM: ['FINAL STATUS'],              // the one column he named
  EXACT: true,                         // his "eksaktong kopya" - see the header
  COLS: ['DATE', 'SUBSCRIBER NAME', 'SR', 'ACCT', 'PR', 'CSP STATUS', 'BRGY', 'CITY', 'CLUSTER', 'FINAL STATUS'],
  DATE_FORMAT: 'M/d/yyyy',
  SR_LINK: '',
  SEND_WEEKDAY: 'FRIDAY',              // ScriptApp.WeekDay name, and the day name the gate looks for
  SEND_HOUR: 13,                       // the 1 PM hour - Apps Script lands somewhere inside it
  DRY_RUN: true,                       // ONE line, safe for Ctrl+H: false = Friday goes to PLDT
  MAX_ROWS: 300,
  TIMEZONE: '',                        // '' = NOTICE.TIMEZONE (Asia/Manila)
  SUBJECT: '3MDA_CANCELLATION_',       // + NOV2026, his own convention
  SENT_PREFIX: 'CANCEL_SENT_',         // the daily list the shared engine uses
  MAIL_KEY: 'CANCEL_MAIL_',            // this mail's own week-proof list of SRs already requested
  MAIL_MAX: 500,                       // cap on that list; past it the oldest rows may be asked again
  REMAIL_WEEKLY: false,                // true = ignore the memory and re-send the whole backlog every Friday
  TEST: { STATUS: 'FOR PAYMENT', MAX_ROWS: 12 }   // what cancelTestReport borrows so there is a sample to read
};

const cmUp_ = v => String(v == null ? '' : v).trim().toUpperCase();

/* The day the trigger was promised to run on, read the same way every other report reads a
   date: through Utilities in the sheet's timezone, never through the host clock. The name is
   logged as Apps Script spells it (Thursday), but compared upper-cased and first-three-letters
   only, so a locale that says 'Hulyo'-style or shortens differently cannot flip the gate. */
function cmDayName_(tz) { return String(Utilities.formatDate(new Date(), tz, 'EEEE') || '').trim(); }

function cmIsSendDay_(tz) {
  return cmUp_(cmDayName_(tz)).slice(0, 3) === cmUp_(CANCEL.SEND_WEEKDAY).slice(0, 3);
}

function cmList_(key) {
  return String(PropertiesService.getScriptProperties().getProperty(key) || '').split(',').filter(Boolean);
}

/* Rows this mail already asked PLDT to cancel. Seeded into TODAY's daily list right before the
   shared engine reads it, so sendReport_ drops them on its own and this file never has to copy
   its collecting, sorting or table-building code. */
function cmSeedToday_() {
  const mailed = cmList_(CANCEL.MAIL_KEY);
  if (!mailed.length) return 0;
  const key = sentKey_(CANCEL, new Date());
  const p = PropertiesService.getScriptProperties();
  const today = cmList_(key);
  const add = mailed.filter(k => today.indexOf(k) < 0);
  if (!add.length) return 0;
  p.setProperty(key, today.concat(add).slice(-700).join(','));
  return add.length;
}

function cmRemember_(items) {
  const p = PropertiesService.getScriptProperties();
  const list = cmList_(CANCEL.MAIL_KEY);
  let added = 0;
  items.forEach(i => { if (i.key && list.indexOf(i.key) < 0) { list.push(i.key); added++; } });
  if (list.length > CANCEL.MAIL_MAX) {
    Logger.log('CANCEL | the already-requested list is past ' + CANCEL.MAIL_MAX +
      ' rows - the oldest of them may be requested again. Press clearCancelSent() to start it fresh.');
  }
  p.setProperty(CANCEL.MAIL_KEY, list.slice(-CANCEL.MAIL_MAX).join(','));
  return added;
}

/* collectReport_ again after a real send, so the rows that went out are the rows that are
   remembered. Read-only: the mail itself was already built by sendReport_. */
function cmItemsNow_() {
  try { return collectReport_(reportSs_(CANCEL), CANCEL); } catch (err) { return null; }
}

function cmStatus_() {
  return {
    report: CANCEL.NAME,
    installed: ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'runCancelNotices'),
    weekday: CANCEL.SEND_WEEKDAY, hour: CANCEL.SEND_HOUR,
    tz: CANCEL.TIMEZONE || NOTICE.TIMEZONE, dryRun: CANCEL.DRY_RUN,
    to: CANCEL.TO, cc: CANCEL.CC, status: CANCEL.STATUS, exact: CANCEL.EXACT,
    rule: ruleText_(CANCEL), file: CANCEL.SHEET_ID || NOTICE.SHEET_ID, tabs: reportTabs_(CANCEL).join(','),
    remailWeekly: CANCEL.REMAIL_WEEKLY, alreadyRequested: cmList_(CANCEL.MAIL_KEY).length,
    quota: MailApp.getRemainingDailyQuota(),
    note: 'Apps Script fires a day trigger somewhere inside the 1 PM hour, and the Friday check in ' +
      'runCancelNotices is what keeps a wrong trigger from mailing on another day'
  };
}

/* The one path both the trigger and the dropdown use. forced = he pressed it, so the weekday
   gate steps aside; the rows are still requested only once. */
function cancelSend_(forced) {
  const tz = CANCEL.TIMEZONE || NOTICE.TIMEZONE;
  const day = cmDayName_(tz);
  if (!forced && !cmIsSendDay_(tz)) {
    const why = 'today is ' + day + ' in ' + tz + ', this mail runs on ' + CANCEL.SEND_WEEKDAY +
      '. Nothing was sent. Press sendCancelReport() to send it now anyway.';
    Logger.log('CANCEL | ' + why);
    return { report: CANCEL.NAME, mode: CANCEL.DRY_RUN ? 'test' : 'live', date: fmtD_(new Date()),
      dryRun: CANCEL.DRY_RUN, items: 0, fresh: 0, skipped: why };
  }
  const seeded = CANCEL.REMAIL_WEEKLY ? 0 : cmSeedToday_();
  if (seeded) {
    Logger.log('CANCEL | ' + seeded + ' row(s) already requested in an earlier run are left out - ' +
      'this mail asks PLDT once per SR. CANCEL.REMAIL_WEEKLY or clearCancelSent() changes that.');
  }
  const res = sendReport_(true, CANCEL, !!forced);
  if (res.skipped && res.items) Logger.log('CANCEL | rows tagged: ' + res.items + ' | ' + res.skipped);
  if (res.sent && !CANCEL.DRY_RUN) {
    const items = cmItemsNow_();
    if (items) res.remembered = cmRemember_(items);
  }
  return res;
}

/* ---- the five things he can press ---- */
function runCancelNotices() { return cancelSend_(false); }        // the Friday 1 PM handler
function sendCancelReport() { return cancelSend_(true); }         // send now, any day
function cancelPreview() { return previewReport_(CANCEL); }       // logs the mail, sends nothing

/* A sample he can read even when today's file has no row tagged yet: testReport_ borrows
   cfg.TEST.STATUS, and with EXACT still true "FOR PAYMENT" alone would match nothing real.
   So the strictness is switched off for the sample only - and put back in the finally, the
   same way testReport_ puts STATUS and DRY_RUN back. */
function cancelTestReport() {
  const keep = CANCEL.EXACT;
  CANCEL.EXACT = false;
  try { return testReport_(CANCEL); } finally { CANCEL.EXACT = keep; }
}

/* He asked for the weekday in the schedule, so it lives in the trigger, not in a cron guess.
   Every old trigger for this handler is deleted first, so pressing this twice is safe.
   THE API RULE THAT BIT US ON 2026-11-11: Apps Script refuses
   `.everyDays(1).onWeekDay(FRIDAY)` - ".onWeekday(day) can only be used with triggers that use
   .everyWeeks(n)". So this is a WEEKLY trigger: everyWeeks(1) + the weekday + the hour, which is
   exactly "every Friday in the 1 PM hour" and nothing else. */
function installCancelTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'runCancelNotices')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('runCancelNotices').timeBased()
    .everyWeeks(1).onWeekDay(ScriptApp.WeekDay[CANCEL.SEND_WEEKDAY])
    .atHour(CANCEL.SEND_HOUR).create();
  const st = cmStatus_();
  Logger.log('CANCEL trigger: ' + (st.installed ? 'installed' : 'NOT installed') +
    ' | runs ' + CANCEL.SEND_WEEKDAY + ' in the ' + (CANCEL.SEND_HOUR % 12 || 12) +
    (CANCEL.SEND_HOUR < 12 ? 'AM' : 'PM') + ' hour (' + st.tz + ')' +
    ' | rule: ' + st.rule + ' | file: ' + st.file + ' | tabs: ' + st.tabs +
    ' | ' + (st.dryRun ? 'DRY_RUN is ON, copies go to ' + NOTICE.ADMIN_EMAILS.join(',') + ' only'
      : 'LIVE, goes to ' + st.to.join(',') + ' | cc ' + st.cc.join(',')) +
    ' | ' + (st.remailWeekly ? 'the whole backlog is re-sent every Friday'
      : 'each SR is requested once until the tag is cleared or clearCancelSent() is pressed'));
  return st;
}

/* Forget the rows already requested, so the next run asks PLDT about all of them again. */
function clearCancelSent() {
  const p = PropertiesService.getScriptProperties();
  const mailed = cmList_(CANCEL.MAIL_KEY);
  Object.keys(p.getProperties()).forEach(k => {
    if (k.indexOf(CANCEL.MAIL_KEY) === 0 || k.indexOf(CANCEL.SENT_PREFIX) === 0) p.deleteProperty(k);
  });
  Logger.log('CANCEL | forgot ' + mailed.length + ' already-requested row(s) - the next run will ' +
    'ask about everything currently tagged again. It sent nothing and changed no cell.');
  return { forgotten: mailed.length, rows: mailed };
}

/* Read-only scout for the one risk in a strict rule: his team types the tagging, and a row
   with the wrong extra word in FINAL STATUS leaves this mail with no trace. So the probe
   counts the exact matches AND prints every spelling that mentions cancellation but is not
   one, with an SR example each. It also says what the memory list would drop this Friday.
   Sends nothing, writes nothing, needs no redeploy. */
function cancelProbe() {
  const ss = reportSs_(CANCEL), tz = CANCEL.TIMEZONE || NOTICE.TIMEZONE;
  const want = nk_(CANCEL.STATUS);
  const parts = ['CANCELLATION', 'NON COMPLIANCE', 'NO PAYMENT'];
  const st = { rows: 0, tabs: [], noHeader: [], exact: 0, spellings: {}, near: {}, cancelledElsewhere: {},
    blanks: 0, sample: [], mailed: 0, fresh: 0, srCount: {} };
  reportTabs_(CANCEL).forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) { st.tabs.push(name + ' = WALANG TAB'); return; }
    /* the same header-detection the mail itself uses, so the probe can never count a
       different set of rows from the one the send would read */
    const rows = tab_(ss, name);
    if (!rows.length && sh.getLastRow() > 1) { st.noHeader.push(name); st.tabs.push(name + ' = header row NOT found'); return; }
    let hit = 0;
    rows.forEach(r => {
      st.rows++;
      const raw = cmUp_(r['FINAL STATUS']);
      if (!raw) { st.blanks++; return; }
      const k = nk_(raw);
      if (k === want) {
        st.exact++; hit++;
        st.spellings[raw] = (st.spellings[raw] || 0) + 1;
        /* the key the mail itself would file this row under, so the probe can tell a repeated
           SR number apart from a row an earlier run already asked about */
        const srk = String(r['SR'] == null ? '' : r['SR']).replace(/\.0$/, '').trim() ||
          (name + '|' + String(r['SUBSCRIBER NAME'] || '').trim());
        st.srCount[srk] = (st.srCount[srk] || 0) + 1;
        if (st.sample.length < 5) st.sample.push(name + ' | SR ' + String(r['SR'] || '-'));
        return;
      }
      /* anything that even mentions one of the three phrases is a candidate the strict rule
         is refusing to mail, so it is printed rather than assumed away */
      if (parts.some(pt => k.indexOf(pt) >= 0)) st.near[raw] = (st.near[raw] || 0) + 1;
      /* and the opposite trap: "CANCELLED - WITH EXISTING SR" is a cancellation of a
         different kind. It must stay OUT, which is why the rule is a phrase and not a word. */
      else if (k.indexOf('CANCEL') >= 0) st.cancelledElsewhere[raw] = (st.cancelledElsewhere[raw] || 0) + 1;
    });
    st.tabs.push(name + ' = ' + rows.length + ' row, ' + hit + ' exact');
  });
  const mailed = {};
  cmList_(CANCEL.MAIL_KEY).forEach(k => { mailed[k] = 1; });
  /* The mail is one row per SR number (collectReport_ drops a repeat SR), so the row COUNT and
     the item COUNT are two different numbers on the live file. Subtracting one from the other to
     guess "already requested" would call every duplicate a past request - so the memory list is
     read directly, and the duplicate is named for what it is. */
  const items = collectReport_(ss, CANCEL);
  st.fresh = items.filter(i => !mailed[i.key]).length;
  st.mailed = Object.keys(mailed).length;
  st.items = items.length;
  st.dups = Object.keys(st.srCount).filter(k => st.srCount[k] > 1);
  const tally = o => {
    const ks = Object.keys(o).sort((a, b) => o[b] - o[a]);
    ks.slice(0, 12).forEach(k => Logger.log('     "' + k.slice(0, 90) + '" = ' + o[k] + ' row'));
    if (ks.length > 12) Logger.log('     ...at ' + (ks.length - 12) + ' pang spelling');
    return ks.length;
  };
  Logger.log('CANCEL PROBE | file: ' + ss.getName() + ' | tabs: ' + st.tabs.join(' | '));
  Logger.log('CANCEL rule: ' + ruleText_(CANCEL) + ' | today is ' + cmDayName_(tz) +
    ' ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd') + ' in ' + tz);
  Logger.log('=== 1. EXACT match (the whole cell is the phrase): ' + st.exact + ' row(s) ===');
  if (st.exact) { tally(st.spellings); Logger.log('   samples: ' + st.sample.join(' , ')); }
  Logger.log('=== 2. BAHAGI o MAHALABANG spelling - HINDI kasama sa mail ng EXACT rule ===');
  if (!Object.keys(st.near).length) Logger.log('   wala - lahat ng binabanggit ang cancellation ay eksakto.');
  else { Logger.log('   ' + Object.keys(st.near).length + ' pang spelling, ' +
      Object.keys(st.near).reduce((s, k) => s + st.near[k], 0) + ' row - ito ang mawawala kung strict:');
    tally(st.near); }
  if (Object.keys(st.cancelledElsewhere).length) {
    Logger.log('   at tama - ' + Object.keys(st.cancelledElsewhere).reduce((s, k) => s + st.cancelledElsewhere[k], 0) +
      ' row na nagsasabi lang ng CANCEL/CANCELLED, hindi itong queue, kaya hindi papasok:');
    tally(st.cancelledElsewhere);
  }
  Logger.log('=== 3. KUNG ANO ANG MABIBIGAY NG BAWAT FRIDAY ===');
  Logger.log('   tagged ngayon: ' + st.exact + ' row' +
    (st.items === st.exact ? '' : ' | IBA-IBANG SR number: ' + st.items +
      ' - ang mail ay isang row kada SR, kaya ' + st.items + ' lang ang lalabas sa table') +
    ' | BAGO at ibibigay sa susunod na Friday: ' + st.fresh +
    (CANCEL.REMAIL_WEEKLY ? ' (REMAIL_WEEKLY is on, so lahat ng ' + st.exact + ' uulitin)' : ''));
  Logger.log('   already requested ng nakaraang run: ' + st.mailed + ' SR | memory list max ' +
    CANCEL.MAIL_MAX + ' | clear with clearCancelSent()');
  /* 90 rows in one mail is a different conversation from 3 rows, so the size is stated
     out loud instead of leaving him to count the table after the first Friday. */
  if (st.fresh > 30) Logger.log('   LAKI: ' + st.fresh + ' row sa iisang mail sa iisang Friday' +
    (st.fresh > CANCEL.MAX_ROWS ? ' - lampas MAX_ROWS ' + CANCEL.MAX_ROWS +
      ', ang mga huli ay "and N more not listed here" lang sa table' : ' - nasa loob pa ng MAX_ROWS'));
  if (st.dups.length) Logger.log('   ?? parehong SR number sa ' + st.dups.length +
    ' pang row (isang beses lang ito hihingingin): ' + st.dups.slice(0, 8).join(', ') +
    (st.dups.length > 8 ? ' ...at ' + (st.dups.length - 8) + ' pa' : ''));
  Logger.log('=== 4. PADALA ===');
  Logger.log('   subject: ' + CANCEL.SUBJECT +
    Utilities.formatDate(new Date(), tz, 'MMMyyyy').toUpperCase() +
    ' | DRY_RUN: ' + CANCEL.DRY_RUN + (CANCEL.DRY_RUN ? ' -> sa ' + NOTICE.ADMIN_EMAILS.join(',') + ' lang'
      : ' -> sa ' + CANCEL.TO.join(',')));
  if (!CANCEL.DRY_RUN) Logger.log('   cc: ' + CANCEL.CC.join(','));
  Logger.log('   FINAL STATUS column: ' + (st.noHeader.length ? 'WALANG sa ' + st.noHeader.join(',') : 'nasa lahat ng tab') +
    ' | blank na FINAL STATUS cell: ' + st.blanks + ' row | remaining quota: ' +
    MailApp.getRemainingDailyQuota());
  if (!st.exact) Logger.log('   0 row ang eksakto - basahin ang #2 sa itaas bago i-flip ang DRY_RUN.');
  return st;
}
