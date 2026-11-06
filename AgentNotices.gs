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

/* The CREDIT VALIDATION report - same shape, same recipients, different queue. He confirmed on
   2026-11-04 that BOTH daily reports go to Leonard alone on the To line with the same three CCs, so
   CV.TO / CV.CC mirror SFS exactly. DRY_RUN is false since 2026-11-05: he read the cvTestReport copy
   and gave the go, so CV now endorses to PLDT on the same 8AM + 2PM schedule as SFS.
   THE RULE HE CORRECTED ON 2026-11-06, twice, in his own words: "SA CV ANG DAPAT NA BASEHAN NA
   PAG SEND NG EMAIL AY ANG HD RECOMMENDATION AT FINAL STATUS BASTA NAKA UNDER CREDIT VALIDATION
   DAPAT ITONG MASEND SA EMAIL NG CV". So the two columns he named are the whole rule and the one
   wording he named is the whole match. The first version read CSP REMARKS for "ESCALATED TO CVAA"
   and reported 0 rows on his live file all day - that is how he knew it was the wrong column, and
   that wording is now deliberately NOT a reason to mail anything. The two columns are read as
   ALTERNATIVES (FROM_ANY): a row qualifies when EITHER one says it, even if the other cell holds
   an unrelated note. cvProbe() counts per column so he can see which one his team actually types
   in and tell me to drop the other.
   THE WORDING, SETTLED BY HIS OWN CELLS ON 2026-11-06: the rule shipped as UNDER CREDIT VALIDATION
   and his live cvProbe answered 0 row(s) qualify. He then screenshotted four real rows (JOHNNY
   DULIN 2313565019, ROWENA ORTE 2313567355, ROBERTO MAR 2313569202, GLORIA PEREZ 2313581337) -
   "ITO ANG MGA NASA DATABASE KO NA UNDER CREADIT VALIDATION" - and both cells read just CREDIT
   VALIDATION, no UNDER. So STATUS is the shorter phrase and EXACT stays false: matching is
   "contains", so this catches CREDIT VALIDATION alone, UNDER CREDIT VALIDATION, PENDING CREDIT
   VALIDATION - every ordering of the same queue - and it is what makes his four rows mail. */
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
  STATUS: 'CREDIT VALIDATION',       // what his cells actually say - see the comment above
  SHEET_ID: '',
  TABS: [],
  FROM: ['HD RECOMMENDATION', 'FINAL STATUS'],
  FROM_ANY: true,                    // either of the two columns he named qualifies the row on its own
  EXACT: false,
  HD_TEXT: 'FOR CREDIT VALIDATION AND APPROVAL',
  COLS: ['DATE', 'SUBSCRIBER NAME', 'SR', 'CSP REMARKS', 'HD REMARKS'],
  DATE_FORMAT: 'M/d/yyyy',
  SR_LINK: '',
  SEND_HOURS: [8, 14],
  DRY_RUN: false,                    // LIVE since 2026-11-05 - the owner read the cvTestReport copy and said "OO, GO CV LIVE"
  MAX_ROWS: 300,
  TIMEZONE: '',
  SUBJECT: '3MDA_CREDIT_VALIDATION_',
  SENT_PREFIX: 'CV_SENT_',
  PROBE: ['CVAA', 'CREDIT', 'COMPLIANCE'],
  TEST: { STATUS: 'CREDIT VALIDATION', MAX_ROWS: 2 }
};

/* The AFD RESCHEDULE report - the third queue, and the only one with four conditions instead
   of one, exactly as the owner described it on 2026-11-05: FINAL STATUS says "AFD - RESCHEDULE",
   the CLUSTER column says 11, HD RECOMMENDATION does NOT say RPR, and the revisit day is written
   by hand in HD RECOMMENDATION as "AFD - NOV 5". STATUS is a list because of that dash - the row
   counts only when BOTH words are in the same cell, so it is caught whatever he types around
   them. The RPR exclusion came from the same day's probe: a cluster 11 row tagged AFD +
   RESCHEDULE had "RPR - RESCHEDULE" written in HD RECOMMENDATION, and he said RPR is rescheduled
   another way, so it is not this mail's queue. The mail goes to the same
   four addresses as SFS and CV, and ON_DAY is the filter he chose: only rows whose revisit date
   IS the day the report runs. DRY_RUN is false: the owner read the afdTestReport copy on
   2026-11-05 and ran installAfdTrigger at 11:49 AM, so the mail is LIVE to the four PLDT
   addresses.
   GREET / INTRO / HD_TEXT / COLS follow his own AFD email, so the only thing the machine
   decides is WHICH rows go in - the words around them are his, put into formal English at his
   request because operations bosses receive it. INTRO carries {CLUSTER} (filled from the rows)
   and HD_TEXT carries {DATE} (the revisit day read out of HD RECOMMENDATION, always written the
   same way: 11/5/2026, whether he typed "AFD - NOV 5", "AFD - 11/5" or "AFD - NOVEMBER 5").
   TIMING, also his: the mail goes out at 10:30 AM, after the call-out, and a day with no AFD
   scheduled for that date produces no mail at all. Apps Script cannot pick a minute - a daily
   trigger lands somewhere inside the hour it is given - so SEND_HOURS is [10, 11] and SEND_FROM
   is '10:30': the 10 o'clock run sends nothing and logs if it wakes before half past, and the
   11 o'clock run is the backstop. A "no rows today" run was always silent (sendReport_ returns
   before building the mail), so an empty day never reaches PLDT. */
const AFD = {
  NAME: 'AFD',
  TO: ['lsabat@pldt.com.ph'],
  CC: ['t-jesnavarro@supplier.pldt.com.ph', 't-jesnavarro@pldt365.onmicrosoft.com', 'abmadlangbayan0510@icloud.com'],
  GREET: 'Hi Sir Jack,',
  /* His wording, put into formal English because operations bosses are copied on it. {CLUSTER}
     is filled from the rows, so changing AFD.WHERE alone moves the number in the sentence. */
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
  STATUS: ['AFD', 'RESCHEDULE'],        // both words, in the same cell of FROM
  SHEET_ID: '',
  TABS: [],
  FROM: ['FINAL STATUS'],
  EXACT: false,
  WHERE: [{ COL: 'CLUSTER', IS: '11' }],  // extra equality filters, tolerant of 11 / '11' / '11.0' / 'CLUSTER 11'
  /* cfg.NOT: wording that must be ABSENT. Measured on the live sheet 2026-11-05: one cluster 11
     row tagged AFD + RESCHEDULE in FINAL STATUS has "RPR - RESCHEDULE" in HD RECOMMENDATION, and
     the owner said RPR is rescheduled another way - it does not belong in this mail. Checked
     before the cluster and the date, so an RPR row never lands in the "no readable date" list. */
  NOT: [{ COL: 'HD RECOMMENDATION', HAS: 'RPR' }],
  ON_DAY: 'HD RECOMMENDATION',            // the revisit day is read from this cell and must be today
  HD_TEXT: 'PART OF AFD {DATE} - SUBS WANT TO REQUEST FOR REVISIT',
  COLS: ['DATE', 'SUBSCRIBER NAME', 'SR', 'ACCT', 'PR', 'CSP STATUS', 'BRGY', 'CITY', 'CLUSTER', 'HD REMARKS'],
  DATE_FORMAT: 'M/d/yyyy',
  SR_LINK: '',
  SEND_HOURS: [10, 11],              // two chances in the morning; the first one that lands at or after SEND_FROM mails
  SEND_FROM: '10:30',               // never before this (HH:mm, sheet timezone) - the call-out is still going on
  DRY_RUN: false,                   // LIVE since 2026-11-05 - the owner read the afdTestReport copy and installed the trigger
  MAX_ROWS: 300,
  TIMEZONE: '',
  SUBJECT: '3MDA_AFD_RESCHEDULE_',
  SENT_PREFIX: 'AFD_SENT_',
  PROBE: ['AFD', 'RESCHEDULE', 'CLUSTER'],
  TEST: { STATUS: 'AFD', MAX_ROWS: 12 }
};

/* The same AFD RESCHEDULE rule for CLUSTER 12, as the owner asked on 2026-11-05: "same rules
   lang, gagawan lang din ng pang sariling email para sa cluster 12". So every condition is
   copied from AFD - the AFD + RESCHEDULE tag, the RPR exclusion, the hand-written revisit day in
   HD RECOMMENDATION that must be the day the report runs, the four PLDT addresses, the 10:30 AM
   gate - and the only thing that differs is WHICH cluster's rows go in, plus its own subject,
   its own dedupe list and its own pair of triggers, so a cluster 12 day never disturbs the live
   cluster 11 mail and the other way round. Two separate mails on purpose: Sir Jack can see from
   the subject alone which cluster is being endorsed, and one cluster being late says nothing
   about the other.
   DRY_RUN is FALSE since 2026-11-05: the owner read the afd12TestReport copy, checked the 2 rows
   and the 4 PLDT addresses, and gave the go. It is still NOT in ensureReportTriggers_, so it will
   not appear on the schedule until he runs installAfd12Trigger(). */
const AFD12 = {
  NAME: 'AFD12',
  TO: ['lsabat@pldt.com.ph'],
  CC: ['t-jesnavarro@supplier.pldt.com.ph', 't-jesnavarro@pldt365.onmicrosoft.com', 'abmadlangbayan0510@icloud.com'],
  GREET: 'Hi Sir Jack,',
  /* {CLUSTER} is filled from the rows, so this sentence reads "CLUSTER 12" on its own. */
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
  STATUS: ['AFD', 'RESCHEDULE'],
  SHEET_ID: '',
  TABS: [],
  FROM: ['FINAL STATUS'],
  EXACT: false,
  WHERE: [{ COL: 'CLUSTER', IS: '12' }],   // the one line that separates this mail from AFD
  NOT: [{ COL: 'HD RECOMMENDATION', HAS: 'RPR' }],
  ON_DAY: 'HD RECOMMENDATION',
  HD_TEXT: 'PART OF AFD {DATE} - SUBS WANT TO REQUEST FOR REVISIT',
  COLS: ['DATE', 'SUBSCRIBER NAME', 'SR', 'ACCT', 'PR', 'CSP STATUS', 'BRGY', 'CITY', 'CLUSTER', 'HD REMARKS'],
  DATE_FORMAT: 'M/d/yyyy',
  SR_LINK: '',
  SEND_HOURS: [10, 11],
  SEND_FROM: '10:30',
  DRY_RUN: false,                   // LIVE since 2026-11-05 - the owner read the afd12TestReport copy and said "OO, GO AFD12 LIVE"
  MAX_ROWS: 300,
  TIMEZONE: '',
  SUBJECT: '3MDA_AFD12_RESCHEDULE_',
  SENT_PREFIX: 'AFD12_SENT_',
  PROBE: ['AFD', 'RESCHEDULE', 'CLUSTER'],
  TEST: { STATUS: 'AFD', MAX_ROWS: 12 }
};

/* The fifth queue, RTS, as the owner asked on 2026-11-05: "nais ko din sana magkaroon ng automated
   email patungkol sa RTS - CUSTOMER COMPLIANCE RTS - UNCONTACTABLE na makikita sa final status at
   ito ay ipapadala sa email na ito - to bernardsalioa@gmail.com at naka cc sila jrsnavarro25@gmail.com
   juliean.rjab@gmail.com at ito ay ipapadala sa email araw araw tuwing 11:00 AM lamang".
   Two things make it different from the other four, and both are his words, not a guess:
   (1) the two taggings are ALTERNATIVES, not conditions on the same row, so RTS.STATUS is a list with
   RTS.ANY = true - one hit in FINAL STATUS is enough. (2) It goes to people outside the PLDT group, so
   the To/CC here are the three addresses he typed, and it runs ONCE a day at 11AM, not twice.
   Everything else is the shared engine: same file, same PLDT/RED tabs, same per-day SR dedupe, same
   shape of email. He read the rtsTestReport copy and said "GO RTS LIVE" on 2026-11-05, so DRY_RUN is
   false - the next run mails bernardsalioa@gmail.com for real - and installRtsTrigger() is what puts
   the single 11AM run on the schedule.
   On 2026-11-05 he answered the three open wording questions by pasting his own template - the ten
   columns (DATE | SR Number | FINAL STATUS | CSP REMARKS | AGENT CODE | AGENT NAME | AGENCY NAME |
   CDME | SALES MANAGER | TEAM) and the greeting sentence, "@bernardsalioa@gmail.com" included, and
   said "ngunit gawin mo ito na english para sa formality". So GREET / INTRO / CLOSE below are his
   two sentences put into formal English, nothing invented; the earlier guesses (Hi Sir Bernard, the
   FOR RTS ACTION line, the five SFS columns) are gone. */
const RTS = {
  NAME: 'RTS',
  TO: ['bernardsalioa@gmail.com'],
  CC: ['jrsnavarro25@gmail.com', 'juliean.rjab@gmail.com'],
  /* He tags the man by his address the way people do in chat, and asked for exactly this greeting,
     so the @ stays - it is his line, not a typo to clean up. */
  GREET: 'Hi @bernardsalioa@gmail.com,',
  INTRO: 'We would appreciate your assistance in checking our open RTS accounts, to confirm whether ' +
    'each application has already been cancelled or is still pending compliance from the agent, so ' +
    'that we may coordinate with the respective team leaders on whether the sale remains recoverable.',
  CLOSE: 'Should you have any concerns, please reply to this email so that we may follow up and ' +
    'determine the appropriate action on the remarks indicated.',
  THANKS: 'Thank you !',
  SIGN: ['Mark Maliwat', 'Sales Validator - MMMDA Logistics', 'Service Cavite Upland'],
  LOGO_URL: 'https://markelvinmaliwat-hub.github.io/3MDA-Logistics-Service_website/assets/mmmda-logo.jpg',
  LOGO_KEY: 'mmmda-logo',
  LOGO_ALT: 'MMMDA Logistics Service',
  LOGO_W: 150, LOGO_H: 147,
  LOGO_ABOVE: true,
  FOOTER: '',
  STATUS: ['RTS - CUSTOMER COMPLIANCE', 'RTS - UNCONTACTABLE'],
  ANY: true,                       // the two taggings are alternatives; AFD's list means AND
  SHEET_ID: '',
  TABS: [],
  FROM: ['FINAL STATUS'],
  EXACT: false,                    // also catches a longer wording typed into FINAL STATUS
  HD_TEXT: '',                     // his template has no HD REMARKS column, so nothing is written here
  /* His template, in his order. Four of these (AGENCY NAME, CDME, SALES MANAGER, TEAM) are columns
     no report has ever read, so rtsPreview names any that come out empty on the live file instead of
     letting a blank column reach him. */
  COLS: ['DATE', 'SR Number', 'FINAL STATUS', 'CSP REMARKS', 'AGENT CODE', 'AGENT NAME', 'AGENCY NAME', 'CDME', 'SALES MANAGER', 'TEAM'],
  DATE_FORMAT: 'M/d/yyyy',
  SR_LINK: '',
  SEND_HOURS: [11],                // once a day, his "tuwing 11:00 AM lamang"
  DRY_RUN: false,                  // owner's "GO RTS LIVE", 2026-11-05 - PLDT-side address receives it
  MAX_ROWS: 300,
  TIMEZONE: '',
  SUBJECT: '3MDA_RTS_',
  SENT_PREFIX: 'RTS_SENT_',
  PROBE: ['RTS'],
  TEST: { STATUS: 'RTS', MAX_ROWS: 12 }
};

/* The sixth queue the owner asked for on 2026-11-05: "ganyan din sana ng AFD 29 DAYS... maging
   AFD29 man o AFD12, ang gagamiten kasi ko na email na ayon sa date ng pag i-email ko - ito na
   lang 11/5/2026 - ganyan din dun sa AFD". His sample mail (3MDA_AFD29_NOV2026, sent 10:17 AM)
   shows FINAL STATUS "AFD - RESCHEDULE", the date 11/5/2026 in a date column, HD REMARKS
   "AFD 11/5/2026 - 147 DAYS DUE AND UP", the line "For endorsement to AFD, Please help validate
   for the account that has 147 days and above DUE" - and clusters 5, 9 and 11 in the SAME mail,
   so this one is NOT split by cluster the way AFD and AFD12 are.
   THIS BLOCK IS PROVISIONAL and is not wired to anything: no send / preview / install function
   reads it, DRY_RUN is on, and it has no trigger. What decides it is afd29Probe() - which column
   really carries "147 DAYS DUE AND UP", which column really holds the 11/5/2026 he says the mail
   is keyed on, and whether any row says it at all. Until that log comes back, ON_DAY and
   COLS are the two headers visible in his screenshot, nothing more. */
const AFD29 = {
  NAME: 'AFD29',
  TO: ['lsabat@pldt.com.ph'],
  CC: ['t-jesnavarro@supplier.pldt.com.ph', 't-jesnavarro@pldt365.onmicrosoft.com', 'abmadlangbayan0510@icloud.com'],
  GREET: 'Hi Sir Jack,',
  INTRO: 'For endorsement to AFD. Please help validate the account(s) that have 147 days and above due.',
  CLOSE: 'Should you have any concerns regarding the scheduled revisit, please kindly reply to this email so that we may address them immediately.',
  THANKS: 'Thank you !',
  SIGN: ['Mark Maliwat', 'Sales Validator - MMMDA Logistics', 'Service Cavite Upland'],
  LOGO_URL: 'https://markelvinmaliwat-hub.github.io/3MDA-Logistics-Service_website/assets/mmmda-logo.jpg',
  LOGO_KEY: 'mmmda-logo',
  LOGO_ALT: 'MMMDA Logistics Service',
  LOGO_W: 150, LOGO_H: 147,
  LOGO_ABOVE: true,
  FOOTER: '',
  STATUS: ['AFD', 'RESCHEDULE'],
  SHEET_ID: '',
  TABS: [],
  FROM: ['FINAL STATUS'],
  EXACT: false,
  WHERE: [],                      // no cluster filter: his own mail mixes clusters
  NOT: [{ COL: 'HD RECOMMENDATION', HAS: 'RPR' }],
  ON_DAY: 'AFD SCHEDULED DATE',   // provisional until afd29Probe says which column carries 11/5/2026
  HD_TEXT: 'AFD {DATE} - 147 DAYS DUE AND UP',
  COLS: ['DATE', 'SUBSCRIBER NAME', 'CONTACT NUMBER', 'SR', 'ACCT', 'PR', 'CLUSTER', 'CITY / BRGY', 'HD REMARKS'],
  DATE_FORMAT: 'M/d/yyyy',
  SR_LINK: '',
  SEND_HOURS: [10, 11],
  SEND_FROM: '10:30',
  DRY_RUN: true,
  MAX_ROWS: 300,
  TIMEZONE: '',
  SUBJECT: '3MDA_AFD29_',
  SENT_PREFIX: 'AFD29_SENT_',
  PROBE: ['147', 'DAYS DUE', 'DUE AND UP'],
  TEST: { STATUS: 'AFD', MAX_ROWS: 12 }
};

/* --------------------------------------------------------------------- remark alert
   The owner asked for this on 2026-11-06: "kada may mag lalagay ng remarks sa [the FOR PAYMENT
   modal] ay ipadala ito sa email ng mga nakakasakot ng trabaho na iyon para aware sila na may
   binigay na remarks ang ahente" - and he named the recipients himself, admins only, NOT the
   agents: To ilanoandong@gmail.com, CC juliean.rjab@gmail.com + markelvinmaliwat@gmail.com.
   This is not a scheduled report. It fires from logWrite_ the moment a dashboard save lands in
   the Payment_Updates tab, so it has to survive three things the reports never face:
   (1) most saves carry no remark at all - choosing an action alone must not mail anyone;
   (2) the modal saves automatically, so one person typing a remark and fixing the date writes
   several rows in a few seconds - GAP_MIN and the signature check collapse that into one alert;
   (3) it runs inside the browser's save request, so any mail error is caught and logged and the
   row is still reported as saved. DRY_RUN is ON: copies go to NOTICE.ADMIN_EMAILS with [TEST]
   in the subject until the owner reads one and says go. */
const REMARK = {
  NAME: 'REMARK',
  TO: ['ilanoandong@gmail.com'],
  CC: ['juliean.rjab@gmail.com', 'markelvinmaliwat@gmail.com'],
  /* His own words, typed on 2026-11-06: "sa greetings ang ilagay Good Day Ian Ilano, Merong bagong
     remarks na inaupdate ang agent galing sa dashboard patungkol sa kanyang FOR PAYMENT na client
     maari mo na itong magamit at ilagay sa iyong database upang magkaroon ka ng record at mapag
     desisionan kung ito ay kailangan na bang ma kansela upang makapag bawas ng FOR PAYMENT record.
     gawin ito in english for formality". The Tagalog line below is what this must keep saying. */
  GREET: 'Good Day Ian Ilano,',
  INTRO: 'A new remark has been entered by the agent on the dashboard regarding his FOR PAYMENT ' +
    'client. You may use this information and record it in your database so that you have a ' +
    'record on hand and can determine whether the application now needs to be cancelled, and so ' +
    'that the FOR PAYMENT list may be reduced.',
  CLOSE: 'Should you have any concerns, please reply to this email so that we may follow up with ' +
    'the agent accordingly.',
  THANKS: 'Thank you !',
  SIGN: ['Mark Maliwat', 'Sales Validator - MMMDA Logistics', 'Service Cavite Upland'],
  /* No logo on purpose: reportLogo_ spends a UrlFetchApp call, and this runs inside the save the
     agent is waiting on. The signature stays plain text. */
  LOGO_URL: '',
  LOGO_KEY: 'mmmda-logo',
  LOGO_ALT: 'MMMDA Logistics Service',
  LOGO_W: 150, LOGO_H: 147,
  LOGO_ABOVE: true,
  FOOTER: '',
  COLS: ['SUBSCRIBER NAME', 'ACCOUNT', 'AGENT', 'ACTION', 'DATE OF PAYMENT', 'REMARKS', 'RECORDED BY', 'RECORDED AT'],
  DRY_RUN: false,                  // LIVE since 2026-11-06 - the owner asked "ano na ang dapat ko gawin upang maging live na ito"
  GAP_MIN: 15,                     // one alert per sale per 15 minutes, however many times the row is saved
  MAX_PER_DAY: 40,                 // the consumer send quota is shared with the 8AM notices and the reports
  TIMEZONE: '',
  SUBJECT: '3MDA_REMARK_ADDED - ', // + subscriber name + (account), so the list is triageable unread
  SENT_PREFIX: 'REMARK_ALERT_'
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
  TL: ['TEAM LEADER', 'TL', 'TEAM LEAD'],
  /* the AFD mail carries the PLDT line identifiers and the address, none of which the
     SFS/CV tables used - the names below are guesses until afdProbe prints the real headers */
  ACCT: ['ACCT NO', 'ACCT NO.', 'ACCOUNT NO', 'ACCOUNT NO.', 'ACCOUNT NUMBER', 'ACCT', 'ACCOUNT'],
  PR: ['PR NO', 'PR NO.', 'PR NUMBER', 'PR'],
  BRGY: ['BRGY', 'BRGY.', 'BARANGAY'],
  CITY: ['CITY', 'CITY / MUNICIPALITY', 'MUNICIPALITY'],
  CLUSTER: ['CLUSTER'],
  HD: ['HD REMARKS', 'HD RECOMMENDATION'],
  /* the four columns his RTS template shows and no report has ever read - the names are exactly
     what he pasted, and rtsPreview is what proves whether the live file really has them */
  AGENCY: ['AGENCY NAME', 'AGENCY'],
  CDME: ['CDME'],
  SMANAGER: ['SALES MANAGER'],
  TEAM: ['TEAM', 'TEAM NAME']
};
function pick_(r, key) {
  for (const n of ALIAS_[key] || []) { const v = r[n]; if (v !== undefined && v !== '' && v !== null) return v; }
  return '';
}
/* a filter column may be a real header (HD RECOMMENDATION) or one of the ALIAS_ keys above */
const colOf_ = (r, col) => String((ALIAS_[col] ? pick_(r, col) : r[col]) == null ? '' : (ALIAS_[col] ? pick_(r, col) : r[col]));
/* cfg.NOT: a row carrying this wording in this column is NOT part of the queue, whatever
   FINAL STATUS says. The owner's RPR exclusion (2026-11-05): "ang RPR - RESCHEDULE ay hindi
   kasama, dahil may ibang paraan ng reschedule dito". Compared the same loose way as the rest
   of the rule, so RPR / rpr / "RPR - RESCHEDULE" all land the same. */
const notOut_ = (r, cfg) => !!cfg.NOT && cfg.NOT.some(n => nk_(colOf_(r, n.COL)).indexOf(nk_(n.HAS)) >= 0);
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
  'Agent': 'agent', 'Team Leader': 'tl', 'CSP STATUS': 'csp',
  'ACCT': 'acct', 'PR': 'pr', 'BRGY': 'brgy', 'CITY': 'city', 'CLUSTER': 'cluster',
  /* his RTS template's own headers, so the mail can print them the way he types them */
  'SR Number': 'sr', 'AGENT CODE': 'code', 'AGENT NAME': 'agent', 'AGENCY NAME': 'agency',
  'CDME': 'cdme', 'SALES MANAGER': 'smanager', 'TEAM': 'team',
  /* the remark alert's columns - these come from the Payment_Updates row, not from the database */
  'ACCOUNT': 'account', 'ACTION': 'action', 'DATE OF PAYMENT': 'paydate', 'REMARKS': 'remarks',
  'RECORDED BY': 'byName', 'RECORDED AT': 'savedAt', 'AGENT': 'agent'
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
/* cfg.STATUS is one phrase, or a list of phrases that must ALL be in the same cell. The AFD
   queue is written "AFD - RESCHEDULE", and nk_ turns the dash into a space, so two words in one
   phrase would break on the spacing he happens to use - two words checked separately do not.
   cfg.ANY = true turns that around: the list becomes a set of ALTERNATIVES and one hit is enough,
   which is what the RTS queue needs ("RTS - CUSTOMER COMPLIANCE" or "RTS - UNCONTACTABLE" are two
   different endings for the same report, not two conditions on the same row). */
function statusHit_(match, cfg) {
  const want = [].concat(cfg.STATUS).map(nk_);
  const has = cfg.EXACT ? (w) => match === w : (w) => match.indexOf(w) >= 0;
  return cfg.ANY ? want.some(has) : want.every(has);
}
/* cfg.FROM_ANY = true: every column in cfg.FROM is tested on its own and a hit in ANY one of them
   qualifies the row. Without it the first non-empty column wins, which is what SFS and AFD want (one
   deciding column, others only as fallback) but not what the CV queue wants: the owner's rule is
   "HD RECOMMENDATION at FINAL STATUS, basta naka CREDIT VALIDATION", and a row can carry an
   unrelated note in one of those two cells while the wording sits in the other. The value shown in
   the mail stays reportStatusOf_ (first non-empty), so only the membership test changes. */
function statusRowHit_(r, cfg) {
  if (!cfg.FROM_ANY) return statusHit_(nk_(reportStatusOf_(r, cfg)), cfg);
  return cfg.FROM.some(c => {
    const v = colOf_(r, c);
    return v !== '' && statusHit_(nk_(v), cfg);
  });
}
const statusWords_ = cfg => [].concat(cfg.STATUS).join(cfg.ANY ? ' or ' : ' + ');
/* cfg.WHERE: the extra columns a row must also match, e.g. CLUSTER = 11. Apps Script hands back
   a number cell as 11 and a text cell as '11', '11.0' or 'CLUSTER 11', so when the two sides are
   not the same word the comparison falls back to the digits. A blank cell never matches. */
function cellEq_(v, want) {
  const a = nk_(String(v == null ? '' : v).replace(/\.0+$/, '')), b = nk_(want);
  if (!a) return false;
  return a === b || a.replace(/[^0-9]/g, '') === b.replace(/[^0-9]/g, '');
}
const MON_ = { JAN: 1, JANUARY: 1, FEB: 2, FEBRUARY: 2, MAR: 3, MARCH: 3, APR: 4, APRIL: 4, MAY: 5, JUN: 6, JUNE: 6, JUL: 7, JULY: 7, AUG: 8, AUGUST: 8, SEP: 9, SEPTEMBER: 9, OCT: 10, OCTOBER: 10, NOV: 11, NOVEMBER: 11, DEC: 12, DECEMBER: 12 };
/* cfg.ON_DAY: the revisit day the owner types by hand - 'AFD - NOV 5', 'AFD - NOVEMBER 5',
   '11/5', or a real date cell. The text carries no year and does not need one: the mail only
   asks whether that month and day is today. Returns {md:'11-5', text:'NOV 5'} or null when the
   cell says AFD but no date can be read from it - a null is never silently dropped. */
function revisitDay_(v, tz) {
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : { md: Utilities.formatDate(v, tz, 'M-d'), text: Utilities.formatDate(v, tz, 'MMM d') };
  }
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  const m = s.toUpperCase().match(/(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\.?[-/ ]?\s*(\d{1,2})\b/);
  if (m && MON_[m[1]] && Number(m[2]) >= 1 && Number(m[2]) <= 31) return { md: MON_[m[1]] + '-' + Number(m[2]), text: m[1] + ' ' + Number(m[2]) };
  const d = s.match(/\b(\d{1,2})[/-](\d{1,2})\b/);
  if (d && Number(d[1]) >= 1 && Number(d[1]) <= 12 && Number(d[2]) >= 1 && Number(d[2]) <= 31) {
    return { md: Number(d[1]) + '-' + Number(d[2]), text: Number(d[1]) + '/' + Number(d[2]) };
  }
  const p = new Date(s);
  return isNaN(p.getTime()) ? null : { md: Utilities.formatDate(p, tz, 'M-d'), text: Utilities.formatDate(p, tz, 'M/d/yyyy') };
}
/* One line that says what a report actually selects, so the log, the status object and the
   probe all describe the same rule instead of three half-truths. */
function ruleText_(cfg) {
  return cfg.FROM.join(' or ') + (cfg.EXACT ? ' = ' : ' contains ') + statusWords_(cfg) +
    (cfg.WHERE && cfg.WHERE.length ? ', ' + cfg.WHERE.map(w => w.COL + ' = ' + w.IS).join(' and ') : '') +
    (cfg.NOT && cfg.NOT.length ? ', ' + cfg.NOT.map(n => n.COL + ' is not ' + n.HAS).join(' and ') : '') +
    (cfg.ON_DAY ? ', ' + cfg.ON_DAY + ' is the day the report runs' : '');
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
function collectReport_(ss, cfg, miss) {
  const tz = cfg.TIMEZONE || NOTICE.TIMEZONE;
  const today = cfg.ON_DAY ? Utilities.formatDate(new Date(), tz, 'M-d') : '';
  const out = [], seen = {};
  reportTabs_(cfg).forEach(name => tab_(ss, name).forEach(r => {
    const st = reportStatusOf_(r, cfg);
    let got = null;
    if (!statusRowHit_(r, cfg)) return;
    if (notOut_(r, cfg)) return;
    if (cfg.WHERE && !cfg.WHERE.every(w => cellEq_(colOf_(r, w.COL), w.IS))) return;
    if (cfg.ON_DAY) {
      got = revisitDay_(colOf_(r, cfg.ON_DAY), tz);
      if (!got) {
        if (miss) miss.push(name + ' | SR ' + String(pick_(r, 'SR')).replace(/\.0$/, '') + ' | ' +
          cfg.ON_DAY + ' = "' + colOf_(r, cfg.ON_DAY).slice(0, 50) + '"');
        return;
      }
      if (!cfg.IGNORE_DAY && got.md !== today) return;
    }
    const dv = pick_(r, 'DATE'), raw = dv instanceof Date ? dv.getTime() : new Date(dv).getTime();
    const it = {
      date: fmtReportDate_(dv, cfg), sub: String(pick_(r, 'SUB')).trim(), plan: String(pick_(r, 'PLAN')).trim(),
      status: st, remarks: String(pick_(r, 'PAYREM')).trim(),
      sr: String(pick_(r, 'SR')).replace(/\.0$/, '').trim(), agent: String(pick_(r, 'AGENT')).trim(),
      tl: String(pick_(r, 'TL')).trim(), csp: String(pick_(r, 'CSP')).trim(),
      cspRem: String(pick_(r, 'CSPREM')).trim(), hd: hdOf_(r, cfg, revisitDate_(got, tz)),
      revisit: revisitDate_(got, tz),
      acct: String(pick_(r, 'ACCT')).trim(), pr: String(pick_(r, 'PR')).trim(),
      brgy: String(pick_(r, 'BRGY')).trim(), city: String(pick_(r, 'CITY')).trim(),
      agency: String(pick_(r, 'AGENCY')).trim(), cdme: String(pick_(r, 'CDME')).trim(),
      smanager: String(pick_(r, 'SMANAGER')).trim(), team: String(pick_(r, 'TEAM')).trim(),
      code: String(pick_(r, 'CODE')).trim(),
      cluster: String(pick_(r, 'CLUSTER')).trim(), _t: isNaN(raw) ? 0 : raw
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
   HD REMARKS / HD RECOMMENDATION cells instead. {DATE} inside HD_TEXT is the revisit day read
   out of the ON_DAY column, so each row carries its own date. */
function hdOf_(r, cfg, day) {
  const text = cfg.HD_TEXT ? String(cfg.HD_TEXT).trim() : String(pick_(r, 'HD')).trim();
  if (text.indexOf('{DATE}') < 0) return text;
  return text.split('{DATE}').join(day || '').replace(/[ \t]{2,}/g, ' ').trim();
}
/* One uniform date for the whole mail. He types "AFD - NOV 5" on one row and "AFD - 11/5" on the
   next, and a table that mixes both reads like a mistake to an operations boss; the rule only ever
   admits rows whose revisit is the day the report runs, so the year is that run's year. */
function revisitDate_(got, tz) {
  if (!got) return '';
  const m = String(got.md).split('-');
  return m[0] + '/' + m[1] + '/' + Utilities.formatDate(new Date(), tz, 'yyyy');
}
/* Which ALIAS_ key each table column reads through - the diagnostics use it to say whether the
   sheet actually has that header, before an empty column can ship to PLDT. */
const COL_ALIAS_ = {
  'DATE': 'DATE', 'SUBSCRIBER NAME': 'SUB', 'SR': 'SR', 'ACCT': 'ACCT', 'PR': 'PR',
  'CSP STATUS': 'CSP', 'BRGY': 'BRGY', 'CITY': 'CITY', 'CLUSTER': 'CLUSTER',
  'HD REMARKS': 'HD', 'HD RECOMMENDATION': 'HD', 'FINAL STATUS': 'STATUS', 'CSP REMARKS': 'CSPREM',
  'PAYMENT REMARKS': 'PAYREM', 'AGENT': 'AGENT', 'TEAM LEADER': 'TL', 'AVAILED PLAN': 'PLAN',
  'SR Number': 'SR', 'AGENT CODE': 'CODE', 'AGENT NAME': 'AGENT', 'AGENCY NAME': 'AGENCY',
  'CDME': 'CDME', 'SALES MANAGER': 'SMANAGER', 'TEAM': 'TEAM'
};
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
/* His AFD sentences name the cluster, so {CLUSTER} is filled from the rows themselves - the
   digits come from the first row, or from the WHERE filter when the day has no rows yet. */
const fill_ = (text, cfg, items) => {
  const s = String(text || '');
  if (s.indexOf('{CLUSTER}') < 0) return s;
  const from = (items && items.length ? items[0].cluster : '') || (cfg.WHERE && cfg.WHERE.length ? cfg.WHERE[0].IS : '');
  return s.split('{CLUSTER}').join(String(from).replace(/[^0-9]/g, ''));
};
const introOf_ = (cfg, items) => fill_(cfg.INTRO, cfg, items);
function buildReportMail_(items, logo, cfg) {
  const max = cfg.MAX_ROWS || 300, shown = items.slice(0, max);
  const stamp = Utilities.formatDate(new Date(), cfg.TIMEZONE || NOTICE.TIMEZONE, 'MMMyyyy').toUpperCase();
  const subject = cfg.SUBJECT + stamp;
  const extra = items.length - shown.length;
  const intro = introOf_(cfg, items);
  const h = `<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#000;max-width:900px">` +
    `<p>${esc_(cfg.GREET)}</p><p>${esc_(intro)}</p>` + reportTable_(shown, cfg) +
    (extra > 0 ? `<p style="color:#667085;font-size:12px">&hellip;and ${extra} more not listed here.</p>` : '') +
    (cfg.CLOSE ? `<p style="margin-top:18px">${esc_(fill_(cfg.CLOSE, cfg, items))}</p>` : '') +
    `<p style="margin-top:18px"><b>${esc_(cfg.THANKS)}</b></p>` + reportSig_(logo, cfg) +
    (cfg.FOOTER ? `<p style="color:#667085;font-size:12px">${esc_(cfg.FOOTER)}</p>` : '') + '</div>';
  const t = `${cfg.GREET}\n\n${intro}\n\n${rowsText_(items, max, cfg.COLS)}` +
    (extra > 0 ? `\n...and ${extra} more.` : '') +
    (cfg.CLOSE ? `\n\n${fill_(cfg.CLOSE, cfg, items)}` : '') + `\n\n${cfg.THANKS}\n\n${cfg.SIGN.join('\n')}`;
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
 *  report goes to ADMIN_EMAILS and the CC list is ignored, so a test can never reach PLDT.
 *  force=true bypasses cfg.SEND_FROM, for the click-it-now entries. */
/* The send path used to answer only in its return value, so a screenshot of a pressed
   sendAfd12Report looked IDENTICAL whether PLDT got the rows or the day was simply empty: both
   printed nothing but the unreadable-date lines. Every send now says its own outcome out loud. */
function logSendOutcome_(cfg, res) {
  Logger.log(cfg.NAME + ' | ' + (res.sent ? 'SENT' : 'NOT SENT') + ': ' + res.shown + ' row(s) in the mail' +
    (res.subject ? ' | subject ' + res.subject : '') +
    ' | ' + (res.dryRun ? 'DRY_RUN test copy, went to ' : 'went to ') + res.to.join(',') +
    (res.cc.length ? ' | cc ' + res.cc.join(',') : ' | no cc') +
    (res.logo ? ' | logo ' + res.logo : '') +
    (res.marked ? ' | marked as reported today: ' + res.marked : '') +
    (res.error ? ' | ERROR ' + res.error : '') +
    (res.skipped ? ' | ' + res.skipped : ''));
}
function sendReport_(send, cfg, force) {
  /* Apps Script can only say "somewhere in the 10 o'clock hour", never "at 10:30", so a
     scheduled AFD run can wake up at 10:05 while the call-out is still going on. Such a run
     sends nothing and says so; the 11 o'clock hour is the second chance. The daily dedupe is
     what makes this safe - whichever run gets there first mails the rows and the next one
     reports "already reported today". */
  if (send && !force && cfg.SEND_FROM) {
    const tz = cfg.TIMEZONE || NOTICE.TIMEZONE;
    const now = Utilities.formatDate(new Date(), tz, 'HH:mm');
    if (now < cfg.SEND_FROM) {
      const why = 'too early - ' + cfg.NAME + ' sends from ' + cfg.SEND_FROM + ' ' + tz +
        ', this run started at ' + now + '. Nothing was sent; the next scheduled run will mail.';
      Logger.log(cfg.NAME + ' | ' + why);
      return { report: cfg.NAME, mode: cfg.DRY_RUN ? 'test' : 'live', date: fmtD_(new Date()),
        dryRun: cfg.DRY_RUN, items: 0, fresh: 0, skipped: why };
    }
  }
  const ss = reportSs_(cfg);
  const miss = [];
  const items = collectReport_(ss, cfg, miss);
  /* A row that is tagged and in the right cluster but whose date cell cannot be read would
     otherwise vanish with no trace, so it is named in the log instead. */
  if (miss.length) {
    Logger.log(cfg.NAME + ' | ' + miss.length + ' row(s) match the wording but have no readable date in ' +
      cfg.ON_DAY + ', so they are NOT in the mail - fix the cell or widen ' + cfg.NAME + '.ON_DAY:');
    miss.slice(0, 10).forEach(m => Logger.log('  ?? ' + m));
    if (miss.length > 10) Logger.log('  ?? ...and ' + (miss.length - 10) + ' more');
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
  if (cfg.ON_DAY) res.unreadable = miss.length;
  if (!items.length) {
    /* on an AFD day with rows tagged but none due today, "no rows tagged" alone would be the
       wrong explanation, so the date condition is named too. A zero count is also how the owner
       found the CV rule reading the wrong column on 2026-11-06, so the columns are named here as
       well - the log then says for itself WHERE it looked. */
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
  const tbl = fresh.slice(0, max);
  res.blankCols = cfg.COLS.filter(c => tbl.every(x => cellOf_(x, c) === ''));
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
function runSfsNotices() { ensureReportTriggers_(); return sendReport_(true, SFS); }
function runCvNotices() { ensureReportTriggers_(); return sendReport_(true, CV); }
/* AFD, AFD12 and RTS deliberately do NOT self-heal and are not in ensureReportTriggers_: AFD is his
   newest rule and he installed its 10AM + 11AM pair by hand on 2026-11-05, so if those two
   triggers are ever deleted only installAfdTrigger() puts them back, AFD12 stays off the schedule
   until he runs installAfd12Trigger(), and RTS stays off it until he runs installRtsTrigger().
   The daily SFS and CV runs are never disturbed by either. These are the scheduled handlers, so
   these are the ones that obey SEND_FROM and wait for 10:30. */
function runAfdNotices() { return sendReport_(true, AFD); }
function runAfd12Notices() { return sendReport_(true, AFD12); }
function runRtsNotices() { return sendReport_(true, RTS); }
/* Dropdown-runnable: sends today's report once, right now, honouring that report's DRY_RUN.
   These ignore SEND_FROM - if he presses it, he means it, early or not. The scheduled handlers
   runAfdNotices / runAfd12Notices are the ones that wait for 10:30. */
function sendSfsReport() { return sendReport_(true, SFS); }
function sendCvReport() { return sendReport_(true, CV); }
function sendAfdReport() { return sendReport_(true, AFD, true); }
function sendAfd12Report() { return sendReport_(true, AFD12, true); }
function sendRtsReport() { return sendReport_(true, RTS, true); }
/* Dropdown-runnable: logs exactly what PLDT would receive, without sending anything and
   without touching the dedupe list. */
function previewReport_(cfg) {
  const r = sendReport_(false, cfg);
  Logger.log(cfg.NAME + ' | rows tagged ' + statusWords_(cfg) + ': ' + r.items + ' | new since the last run: ' + r.fresh +
    (r.fresh ? ' | shown in the table: ' + r.shown : '') +
    ' | logo: ' + (r.logo || 'not fetched - no rows, so there was no email to build') +
    ' | would go to: ' + r.to.join(',') + ' | cc: ' + (r.cc.length ? r.cc.join(',')
      : cfg.DRY_RUN ? 'none (DRY_RUN is on)' : 'none - every address is in the To line'));
  if (!r.fresh) {
    Logger.log(r.skipped);
    if (cfg.ON_DAY || (cfg.WHERE && cfg.WHERE.length)) diagnoseReport_(cfg);
    return r;
  }
  Logger.log('subject: ' + r.subject + ' | html chars: ' + r.htmlChars);
  /* A column whose real header differs from ALIAS_ renders as an empty cell in every row, which
     would be silent unless measured - so the preview says which headers found nothing. */
  if (r.blankCols && r.blankCols.length) Logger.log(cfg.NAME + ' ' + r.blankCols.join(', ') +
    ' came out empty in all ' + r.shown + ' row(s) - those column names are not in the sheet, ' +
    'run ' + cfg.NAME.toLowerCase() + 'Probe and read the header list');
  Logger.log(r.text);
  return r;
}
/* Run from the dropdown to see what PLDT would get, with that report's own rule. For AFD the
   rule has three conditions, so when the table comes back empty the log also says which of them
   removed the rows - tagged but wrong cluster, or the right cluster but the revisit date is not
   today. Nothing is sent and the dedupe list is not touched. */
function diagnoseReport_(cfg) {
  const ss = reportSs_(cfg), tz = cfg.TIMEZONE || NOTICE.TIMEZONE;
  const c = { rows: 0, tagged: 0, excluded: 0, cluster: 0, otherDay: {}, unread: 0, sample: '' };
  reportTabs_(cfg).forEach(name => tab_(ss, name).forEach(r => {
    c.rows++;
    const st = reportStatusOf_(r, cfg);
    if (!statusRowHit_(r, cfg)) return;
    c.tagged++;
    if (notOut_(r, cfg)) { c.excluded++; return; }
    if (cfg.WHERE && !cfg.WHERE.every(w => cellEq_(colOf_(r, w.COL), w.IS))) return;
    c.cluster++;
    if (!cfg.ON_DAY) return;
    const got = revisitDay_(colOf_(r, cfg.ON_DAY), tz);
    if (!got) { c.unread++; c.sample = c.sample || name + ' ' + cfg.ON_DAY + '="' + colOf_(r, cfg.ON_DAY).slice(0, 50) + '"'; return; }
    if (got.md !== Utilities.formatDate(new Date(), tz, 'M-d')) c.otherDay[got.text] = (c.otherDay[got.text] || 0) + 1;
  }));
  const days = Object.keys(c.otherDay).sort();
  Logger.log(cfg.NAME + ' rule: ' + ruleText_(cfg) + ' | today is ' +
    Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd') + ' in ' + tz);
  Logger.log(cfg.NAME + ' count | file: ' + ss.getName() + ' | tabs: ' + reportTabs_(cfg).join(',') + ' | rows read: ' + c.rows +
    ' | tagged ' + statusWords_(cfg) + ': ' + c.tagged +
    (cfg.NOT && cfg.NOT.length ? ' | ' + cfg.NOT.map(n => n.HAS).join('+') + ' excluded: ' + c.excluded : '') +
    (cfg.WHERE && cfg.WHERE.length ? ' | ' + cfg.WHERE.map(w => w.COL + ' ' + w.IS).join(' + ') + ': ' + c.cluster : '') +
    (cfg.ON_DAY ? ' | revisit today: ' + (c.cluster - c.unread - days.reduce((s, d) => s + c.otherDay[d], 0)) : ''));
  if (cfg.ON_DAY && days.length) Logger.log(cfg.NAME + ' right cluster but NOT due today (' + days.length +
    ' other day(s) in the sheet): ' + days.slice(0, 12).map(d => d + '=' + c.otherDay[d]).join(', ') + (days.length > 12 ? ' ...' : ''));
  if (cfg.ON_DAY && c.unread) Logger.log(cfg.NAME + ' ' + c.unread + ' row(s) with no readable date in ' + cfg.ON_DAY + ', e.g. ' + c.sample);
  return c;
}
function sfsPreview() { return previewReport_(SFS); }
function cvPreview() { return previewReport_(CV); }
function afdPreview() { return previewReport_(AFD); }
function afd12Preview() { return previewReport_(AFD12); }
function rtsPreview() { return previewReport_(RTS); }
/* Dropdown-runnable TEST COPY, one per report. It forces that report's DRY_RUN on while it
   runs, so it can never reach PLDT even while the real report is live - without that, the
   borrowed rows below would go out as endorsements. On most days the live rule has 0 rows and
   there is nothing to look at, so it temporarily matches cfg.TEST.STATUS instead (a value that
   exists today) and lists at most cfg.TEST.MAX_ROWS rows so the sample stays short. STATUS,
   MAX_ROWS and DRY_RUN are restored before it returns, whatever happens inside, and the last
   log line prints what they went back to. */
function testReport_(cfg) {
  const keepStatus = cfg.STATUS, keepMax = cfg.MAX_ROWS, keepDry = cfg.DRY_RUN, keepDay = cfg.IGNORE_DAY;
  cfg.STATUS = cfg.TEST.STATUS;
  cfg.MAX_ROWS = Math.min(cfg.TEST.MAX_ROWS, keepMax);
  cfg.DRY_RUN = true;
  /* AFD's own rule is due-today only, so on most days there is no sample to look at. The date
     COMPARISON is switched off for the test copy - the column itself is still read, so the
     {DATE} in HD_TEXT still shows - while the cluster filter stays on, meaning what he reads is
     still a cluster 11 row. It is put back before the function returns, whatever happens inside. */
  cfg.IGNORE_DAY = true;
  let r;
  try {
    r = sendReport_(true, cfg, true); /* forced past cfg.SEND_FROM - a test copy he asks for is
                                         read for wording, not held until the afternoon */
  } finally {
    cfg.STATUS = keepStatus;
    cfg.MAX_ROWS = keepMax;
    cfg.DRY_RUN = keepDry;
    cfg.IGNORE_DAY = keepDay;
  }
  Logger.log(cfg.NAME + ' test copy ' + (r.sent ? 'sent to ' + r.to.join(',') : 'NOT sent') +
    ' | rows matched: ' + r.items + ' | shown in the table: ' + r.shown +
    ' | subject: ' + (r.subject || '-') + ' | logo: ' + (r.logo || '-'));
  Logger.log('settings restored: ' + statusWords_(cfg) + ' / max ' + cfg.MAX_ROWS + ' / DRY_RUN ' + cfg.DRY_RUN +
    (cfg.DRY_RUN ? '' : ' (LIVE - goes to ' + cfg.TO.join(',') + ')') +
    (cfg.ON_DAY && !keepDay ? ' / the ' + cfg.ON_DAY + ' must-be-today filter is back on' : '') +
    ' - the test matched "' + cfg.TEST.STATUS + '" instead' + (r.skipped ? ' | ' + r.skipped : ''));
  return r;
}
function sfsTestReport() { return testReport_(SFS); }
function cvTestReport() { return testReport_(CV); }
function afdTestReport() { return testReport_(AFD); }
function afd12TestReport() { return testReport_(AFD12); }
function rtsTestReport() { return testReport_(RTS); }
function hoursText_(cfg) { return cfg.SEND_HOURS.map(h => (h % 12 || 12) + (h < 12 ? 'AM' : 'PM')).join(' and '); }
function reportStatus_(cfg, handler) {
  return {
    report: cfg.NAME,
    installed: ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === handler),
    hours: cfg.SEND_HOURS, hour: cfg.SEND_HOURS[0], tz: cfg.TIMEZONE || NOTICE.TIMEZONE, dryRun: cfg.DRY_RUN,
    from: cfg.SEND_FROM || '',
    to: cfg.TO, cc: cfg.CC, status: cfg.STATUS, quota: MailApp.getRemainingDailyQuota(),
    file: cfg.SHEET_ID || NOTICE.SHEET_ID, tabs: reportTabs_(cfg).join(','),
    rule: ruleText_(cfg),
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
    ' | runs in the ' + hoursText_(cfg) + ' hour (' + st.tz + ')' +
    (cfg.SEND_FROM ? ', mails at or after ' + cfg.SEND_FROM + ' - an earlier run waits and sends nothing' : '') +
    ' | rule: ' + st.rule +
    ' | file: ' + st.file + ' | tabs: ' + st.tabs +
    ' | ' + (st.dryRun ? 'DRY_RUN is ON, copies go to ' + NOTICE.ADMIN_EMAILS.join(',') + ' only' : 'LIVE, goes to ' + st.to.join(',')) +
    ' | ' + st.dedupe + ' | ' + st.note);
  return st;
}
function installSfsTrigger() { return installReportTrigger_(SFS, 'runSfsNotices'); }
function installCvTrigger() { return installReportTrigger_(CV, 'runCvNotices'); }
function installAfdTrigger() { return installReportTrigger_(AFD, 'runAfdNotices'); }
function installAfd12Trigger() { return installReportTrigger_(AFD12, 'runAfd12Notices'); }
function installRtsTrigger() { return installReportTrigger_(RTS, 'runRtsNotices'); }
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
  /* A FROM_ANY rule reads several columns, so "N row(s)" alone would not tell him WHERE the
     wording is. This breaks the same count down per column and per wording - a row that hits two
     columns is counted in both, because the point is which column he has to keep typing in. */
  if (cfg.FROM_ANY) {
    const byCol = {}, byWord = {};
    let n = 0;
    reportTabs_(cfg).forEach(name => tab_(ss, name).forEach(r => {
      if (!statusRowHit_(r, cfg)) return;
      n++;
      cfg.FROM.forEach(c => {
        const v = nk_(colOf_(r, c));
        if (!v) return;
        [].concat(cfg.STATUS).map(nk_).forEach(w => {
          if (cfg.EXACT ? v === w : v.indexOf(w) >= 0) {
            byCol[c] = (byCol[c] || 0) + 1;
            byWord[w] = (byWord[w] || 0) + 1;
          }
        });
      });
    }));
    const t = o => Object.keys(o).sort((a, b) => o[b] - o[a]).map(k => k + '=' + o[k]).join(', ') || 'none';
    Logger.log(cfg.NAME + ' ' + n + ' row(s) qualify | by column: ' + t(byCol) + ' | by wording: ' + t(byWord));
    Logger.log('kung 0 ang isang column, hindi doon siya binabasa ng rule - pero kasama pa rin siya sa ' +
      cfg.FROM.join(', ') + ' habang FROM_ANY is on');
  }
  Logger.log('current rule would report ' + collectReport_(ss, cfg).length + ' row(s): ' + ruleText_(cfg));
}
function sfsProbe() { return probeReport_(SFS); }
function cvProbe() { return probeReport_(CV); }
function rtsProbe() { return probeReport_(RTS); }
/* ------------------------------------------------------- AFD RESCHEDULE scout (read-only)
   The owner asked for a daily mail of the AFD RESCHEDULE rows of CLUSTER 11 only, keyed on the
   AFD scheduled date. Neither AFD nor CLUSTER is a column this script has ever read, so nothing
   gets built on a guess. afdProbe() walks EVERY tab of the file the notices read and logs, for
   the tabs that mention AFD / RESCHEDULE / CLUSTER: the whole header, every column whose NAME or
   any of whose VALUES mentions those words (with the exact wording and how many rows carry it),
   every distinct value of a cluster column, how the date columns are actually stored (real date
   or text, and which dates exist), and up to five complete rows so the wording is visible. It
   emails nothing and writes nothing. If it finds nothing at all, the cluster data is in a
   different spreadsheet - point AFD.SHEET_ID at it and run this again. */
const AFD_WORDS_ = ['AFD', 'RESCHEDULE', 'CLUSTER'];
function afdProbe() {
  const ss = reportSs_(SFS), re = new RegExp(AFD_WORDS_.join('|'), 'i');
  Logger.log('AFD scout | file: ' + ss.getName() + ' | this run emails nothing and writes nothing');
  const tabs = ss.getSheets();
  Logger.log('tabs: ' + tabs.map(s => s.getName() + '=' + Math.max(0, s.getLastRow() - 1)).join(', '));
  let anyHit = false;
  tabs.forEach(sh => {
    const name = sh.getName(), rows = tab_(ss, name, true);
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const named = cols.filter(c => re.test(c));
    const valueHits = {};
    cols.forEach(c => {
      const vals = {};
      let n = 0;
      rows.forEach(r => {
        const v = nk_(r[c]);
        if (!re.test(v)) return;
        n++;
        vals[v] = (vals[v] || 0) + 1;
      });
      if (n) valueHits[c] = { n: n, vals: vals };
    });
    const vc = Object.keys(valueHits);
    if (!named.length && !vc.length) return;
    anyHit = true;
    Logger.log('--- ' + name + ' (' + rows.length + ' rows) talks about AFD/RESCHEDULE/CLUSTER');
    Logger.log(name + ' columns: ' + cols.join(' | '));
    if (named.length) Logger.log(name + ' columns NAMED for it: ' + named.join(', '));
    vc.forEach(c => Logger.log('  ## ' + name + ' ' + c + ': ' + valueHits[c].n + ' row(s) -> ' +
      Object.keys(valueHits[c].vals).sort((a, b) => valueHits[c].vals[b] - valueHits[c].vals[a]).slice(0, 8)
        .map(v => '"' + v.slice(0, 60) + '" x' + valueHits[c].vals[v]).join(', ')));
    cols.filter(c => /CLUSTER/i.test(c)).forEach(c => {
      const tally = {};
      rows.forEach(r => { const k = String(r[c] == null ? '' : r[c]).trim() || '(blank)'; tally[k] = (tally[k] || 0) + 1; });
      Logger.log('  ' + name + ' ' + c + ' values: ' + Object.keys(tally).sort((a, b) => tally[b] - tally[a]).slice(0, 20)
        .map(k => k + '=' + tally[k]).join(', '));
    });
    cols.filter(c => /AFD|SCHEDULE|DATE/i.test(c)).forEach(c => {
      const kinds = {}, byDay = {};
      rows.forEach(r => {
        const v = r[c];
        if (v == null || String(v).trim() === '') return;
        const text = String(v).trim();
        const kind = v instanceof Date ? 'real date' : /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(text) ? 'text mm/dd/yyyy' : 'text other';
        kinds[kind] = (kinds[kind] || 0) + 1;
        const d = v instanceof Date ? v : new Date(text);
        if (isNaN(d.getTime())) return;
        const day = Utilities.formatDate(d, NOTICE.TIMEZONE, 'yyyy-MM-dd');
        byDay[day] = (byDay[day] || 0) + 1;
      });
      const days = Object.keys(byDay).sort();
      Logger.log('  ' + name + ' ' + c + ' stored as: ' + (Object.keys(kinds).map(k => k + '=' + kinds[k]).join(', ') || 'nothing readable') +
        (days.length ? ' | dates ' + days[0] + ' to ' + days[days.length - 1] + ' | ' +
          days.slice(0, 6).map(d => d + '=' + byDay[d]).join(', ') + (days.length > 6 ? ' ...(' + days.length + ' distinct days)' : '') : ''));
    });
  });
  if (!anyHit) Logger.log('NOTHING in this file mentions AFD, RESCHEDULE or CLUSTER - ang cluster/AFD data ay nasa ibang spreadsheet. Kopyahin mo lang ang link ng sheet na may cluster column at ilalagay ko sa AFD.SHEET_ID, tapos i-run ulit ito.');
  let shown = 0;
  for (let i = 0; i < tabs.length && shown < 5; i++) {
    const name = tabs[i].getName(), rows = tab_(ss, name, true);
    for (let j = 0; j < rows.length && shown < 5; j++) {
      const r = rows[j];
      if (!Object.keys(r).some(k => re.test(nk_(r[k])))) continue;
      Logger.log('SAMPLE [' + name + ']: ' + Object.keys(r).filter(k => String(r[k] == null ? '' : r[k]).trim())
        .map(k => k + '=' + String(r[k] instanceof Date ? Utilities.formatDate(r[k], NOTICE.TIMEZONE, 'yyyy-MM-dd') : r[k]).slice(0, 60)).join(' ; '));
      shown++;
    }
  }
  Logger.log('rows that mention AFD shown: ' + shown + (shown >= 5 ? ' (capped at 5)' : ''));
  afdScout_(AFD);
}
/* The rule-measuring half of the scout, separate so afd12Probe() can measure the cluster 12 copy
   of the same rule without walking every tab of the file again. It counts how many rows each
   condition removes, names the other days in the sheet and the rows whose date cannot be read,
   and says what the mail would carry today. Nothing sent, nothing written. */
function afdScout_(cfg) {
  const N = cfg.NAME, tz = cfg.TIMEZONE || NOTICE.TIMEZONE;
  Logger.log('--- the rule as the owner described it, measured on this file (nothing sent):');
  Logger.log(N + ' rule: ' + ruleText_(cfg) + ' | today is ' +
    Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd') + ' in ' + tz);
  const ssA = reportSs_(cfg), today = Utilities.formatDate(new Date(), tz, 'M-d');
  const cnt = { rows: 0, tagged: 0, excluded: 0, cluster: 0, due: 0 }, otherDay = {}, unread = {};
  let peek = 0;
  reportTabs_(cfg).forEach(name => {
    const rows = tab_(ssA, name);
    cnt.rows += rows.length;
    rows.forEach(r => {
      const st = reportStatusOf_(r, cfg);
      if (!statusRowHit_(r, cfg)) return;
      cnt.tagged++;
      const cv = colOf_(r, cfg.WHERE[0].COL);
      if (peek < 5) {
        peek++;
        Logger.log('  tagged [' + name + ']: FINAL STATUS="' + String(st).slice(0, 40) + '" | ' + cfg.WHERE[0].COL + '="' +
          cv + '" | ' + cfg.ON_DAY + '="' + colOf_(r, cfg.ON_DAY).slice(0, 40) + '"' +
          (notOut_(r, cfg) ? ' | EXCLUDED (' + cfg.NOT.map(n => n.HAS).join('+') + ')' : ''));
      }
      if (notOut_(r, cfg)) { cnt.excluded++; return; }
      if (!cellEq_(colOf_(r, cfg.WHERE[0].COL), cfg.WHERE[0].IS)) return;
      cnt.cluster++;
      const got = revisitDay_(colOf_(r, cfg.ON_DAY), tz);
      if (!got) { const k = name + ' "' + colOf_(r, cfg.ON_DAY).slice(0, 30) + '"'; unread[k] = (unread[k] || 0) + 1; return; }
      if (got.md !== today) { otherDay[got.text] = (otherDay[got.text] || 0) + 1; return; }
      cnt.due++;
    });
  });
  const notWords_ = c => (c.NOT || []).map(n => n.HAS).join('+');
  Logger.log(N + ' count | rows read: ' + cnt.rows + ' | FINAL STATUS tagged ' + statusWords_(cfg) + ': ' + cnt.tagged +
    ' | ' + notWords_(cfg) + ' excluded: ' + cnt.excluded +
    ' | ' + cfg.WHERE[0].COL + ' ' + cfg.WHERE[0].IS + ': ' + cnt.cluster + ' | revisit today: ' + cnt.due);
  if (cnt.excluded) Logger.log(N + ' ' + cnt.excluded + ' tagged row(s) left out because ' + cfg.NOT[0].COL +
    ' says ' + cfg.NOT[0].HAS + ' - may ibang paraan ng reschedule, hindi AFD queue');
  const od = Object.keys(otherDay).sort();
  if (od.length) Logger.log(N + ' right cluster but NOT due today: ' + od.map(d => d + '=' + otherDay[d]).join(', '));
  const ur = Object.keys(unread);
  if (ur.length) Logger.log(N + ' no readable date in ' + cfg.ON_DAY + ', so those rows are left out until the cell can be read: ' +
    ur.slice(0, 10).map(k => k + ' x' + unread[k]).join(', ') + (ur.length > 10 ? ' ...(' + ur.length + ' kinds)' : ''));
  if (!cnt.tagged) Logger.log(N + ' nothing in ' + cfg.FROM.join('/') + ' says ' + statusWords_(cfg) + ' in the tabs read (' + reportTabs_(cfg).join(',') + ') - mali ang column name o nasa ibang file ang data');
  else if (!cnt.cluster) Logger.log(N + ' no ' + cfg.WHERE[0].COL + ' = ' + cfg.WHERE[0].IS + ' row among them - check the ' + cfg.WHERE[0].COL + ' values logged above');
  /* ACCT / PR / BRGY / CITY are columns this script never read before, so each header of his
     table is matched against the real headers of the tabs the report reads: anything MISSING
     would arrive at PLDT as an empty column. */
  const hdrs = {};
  reportTabs_(cfg).forEach(n => tab_(ssA, n, true).forEach(r => Object.keys(r).forEach(h => { hdrs[h] = 1; })));
  Logger.log(N + ' table columns -> header found in the sheet: ' + cfg.COLS.map(c => {
    const a = COL_ALIAS_[c];
    if (c === 'HD REMARKS' && cfg.HD_TEXT) return c + '=written in the mail (HD_TEXT, not read from the sheet)';
    const hit = (a ? ALIAS_[a] : [c]).filter(n => hdrs[n]);
    return c + '=' + (hit.length ? hit.join(' / ') : 'MISSING');
  }).join(' | '));
  Logger.log('the mail would carry ' + collectReport_(ssA, cfg).length + ' row(s) today');
  Logger.log('i-paste ang buong log na ito kapag tapos - kung 0 ang "tagged" o ang "' + cfg.WHERE[0].COL + ' ' + cfg.WHERE[0].IS +
    '", mali ang column name sa ' + N + '.FROM / ' + N + '.WHERE at dito mo makikita ang tunay na header; kung may "revisit today" naman, tama na ang rule at ' +
    N.toLowerCase() + 'Preview na lang ang susunod.');
  return cnt;
}
/* Dropdown-runnable, read-only: the cluster 12 copy of the same rule measured on the same file.
   Runs in seconds because it skips the tab walk afdProbe already did and counts only the rule. */
function afd12Probe() {
  const ss = reportSs_(AFD12);
  Logger.log('AFD12 scout | file: ' + ss.getName() + ' | tabs: ' + reportTabs_(AFD12).join(',') +
    ' | this run emails nothing and writes nothing');
  const tally = {};
  reportTabs_(AFD12).forEach(n => tab_(ss, n).forEach(r => {
    if (!statusHit_(nk_(reportStatusOf_(r, AFD12)), AFD12)) return;
    const k = nk_(colOf_(r, AFD12.WHERE[0].COL)) || '(blank)';
    tally[k] = (tally[k] || 0) + 1;
  }));
  Logger.log('AFD12 tagged rows by ' + AFD12.WHERE[0].COL + ': ' +
    Object.keys(tally).sort((a, b) => tally[b] - tally[a]).map(k => k + '=' + tally[k]).join(', '));
  afdScout_(AFD12);
}

/* ---------------------------------------------------- AFD29 / 147 DAYS DUE scout (read-only)
   The owner's sixth ask (2026-11-05): "ganyan din sana ng AFD 29 DAYS... ang gagamiten kasi ko na
   email na ayon sa date ng pag i-email ko - ito na lang 11/5/2026 - ganyan din dun sa AFD", with his
   own 3MDA_AFD29_NOV2026 mail as the picture. Two things in that picture cannot be copied into a rule
   without measuring first: (a) which column actually says "147 DAYS DUE AND UP" - his AFD and AFD12
   mails WRITE that line themselves (HD_TEXT) because the sheet has no HD REMARKS column, so the
   wording may live in a column we have never read, or in a numeric "days due" column, or nowhere;
   (b) which column carries the 11/5/2026 he keys the mail on - AFD SCHEDULED DATE is the visible
   candidate but HD RECOMMENDATION is what AFD/AFD12 use.
   afd29Probe() answers both with counts and never sends or writes anything: per report tab it lists
   the real headers, every column whose VALUES carry the 147 wording (with the exact wording and the
   row count), every column whose NAME looks like a days/due column (with how many of its values are
   plain numbers and how many are 147 or more), the tagged AFD + RESCHEDULE rows with their clusters,
   and how those rows' candidate date columns read against today. It closes by naming every column of
   the planned table that the sheet does not have, with the real headers that look closest to it, so
   one paste settles the rule instead of four guesses. */
const AFD29_WORDS_ = '147|DAYS DUE|DUE AND UP';
const tallyText_ = (o, n) => Object.keys(o).sort((a, b) => o[b] - o[a]).slice(0, n || 8)
  .map(k => '"' + k.slice(0, 55) + '" x' + o[k]).join(', ');
function afd29Probe() {
  const ss = reportSs_(AFD29), re = new RegExp(AFD29_WORDS_, 'i'), tz = NOTICE.TIMEZONE;
  const today = Utilities.formatDate(new Date(), tz, 'M-d');
  Logger.log('AFD29 scout | file: ' + ss.getName() + ' | tabs: ' + reportTabs_(AFD29).join(',') +
    ' | today is ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd') + ' (' + tz + ') | this run emails nothing and writes nothing');
  let wordHits = 0;
  const hdrs = {};
  reportTabs_(AFD29).forEach(name => {
    const rows = tab_(ss, name);
    if (!rows.length) { Logger.log(name + ': no readable rows'); return; }
    const cols = Object.keys(rows[0]);
    cols.forEach(c => { hdrs[c] = 1; });
    Logger.log('--- ' + name + ' (' + rows.length + ' rows) columns: ' + cols.join(' | '));
    /* (a) which column says the 147 wording */
    cols.forEach(c => {
      const vals = {};
      let n = 0;
      rows.forEach(r => { const v = nk_(r[c]); if (!re.test(v)) return; n++; vals[v] = (vals[v] || 0) + 1; });
      if (!n) return;
      wordHits += n;
      Logger.log('  >> ' + name + ' ' + c + ': ' + n + ' row(s) say ' + AFD29_WORDS_ + ' -> ' + tallyText_(vals, 6));
    });
    if (!wordHits) Logger.log('  (nothing in ' + name + ' says 147 / DAYS DUE / DUE AND UP in any column)');
    /* (a2) or it is a number, not a wording */
    cols.filter(c => /\b(DUE|DAYS|DAY)\b|ARREAR|OUTSTAND/i.test(c)).forEach(c => {
      const vals = {};
      let nums = 0, over = 0, max = null;
      rows.forEach(r => {
        const v = String(r[c] == null ? '' : r[c]).trim();
        if (!v) return;
        vals[v] = (vals[v] || 0) + 1;
        if (!/^-?\d+(\.0+)?$/.test(v)) return;
        nums++;
        const x = Number(v);
        if (x >= 147) over++;
        max = max === null ? x : Math.max(max, x);
      });
      Logger.log('  ## ' + name + ' column NAMED ' + c + ': ' + Object.keys(vals).length + ' distinct values, plain numbers ' +
        nums + ', 147 and above ' + over + (max === null ? '' : ', biggest ' + max) + ' -> ' + tallyText_(vals, 6));
    });
    /* (b) the rows the mail would be built from, and the day each one carries */
    const tagged = rows.filter(r => statusHit_(nk_(reportStatusOf_(r, AFD29)), AFD29));
    const cl = {};
    tagged.forEach(r => { const k = nk_(colOf_(r, 'CLUSTER')) || '(blank)'; cl[k] = (cl[k] || 0) + 1; });
    Logger.log(name + ' rows tagged ' + statusWords_(AFD29) + ' in ' + AFD29.FROM.join('/') + ': ' + tagged.length +
      (tagged.length ? ' | their CLUSTER values: ' + Object.keys(cl).sort((a, b) => cl[b] - cl[a]).map(k => k + '=' + cl[k]).join(', ') : ''));
    cols.filter(c => /DATE|SCHEDULE|AFD|RECOMMEND/i.test(c)).forEach(c => {
      const days = {};
      let blank = 0;
      tagged.forEach(r => {
        const v = r[c];
        if (v == null || String(v).trim() === '') { blank++; return; }
        const got = revisitDay_(v, tz);
        if (!got) { const k = 'cannot read "' + nk_(v).slice(0, 28) + '"'; days[k] = (days[k] || 0) + 1; return; }
        const k = got.md + (got.md === today ? '  <<< = TODAY' : '');
        days[k] = (days[k] || 0) + 1;
      });
      Logger.log('  ' + name + ' tagged rows by ' + c + ': blank ' + blank + ' | ' + (Object.keys(days).length ? tallyText_(days, 10) : 'nothing to read'));
    });
  });
  Logger.log('AFD29 rule as it is configured NOW (provisional): ' + ruleText_(AFD29) + ' | that would report ' +
    collectReport_(ss, AFD29).length + ' row(s) today');
  Logger.log('AFD29 table columns -> real header in this file: ' + AFD29.COLS.map(c => {
    if (c === 'HD REMARKS' && AFD29.HD_TEXT) return c + '=written in the mail (HD_TEXT), not read from the sheet';
    const a = COL_ALIAS_[c], via = a ? ALIAS_[a] : null;
    const hit = (via || [c]).filter(n => hdrs[n]);
    if (!CELL_[c]) return c + '=NOT WIRED YET' + (hit.length ? ' (the sheet has ' + hit.join(' / ') + ', but this mail cannot read that column until it is added to CELL_)' : ' and the sheet has no such header');
    if (hit.length) return c + '=' + hit.join(' / ');
    const near = Object.keys(hdrs).filter(n => new RegExp(c.split(/[^A-Z0-9]+/i).filter(Boolean).join('|'), 'i').test(n));
    return c + '=MISSING' + (near.length ? ' (closest headers: ' + near.slice(0, 4).join(', ') + ')' : '');
  }).join(' | '));
  Logger.log(wordHits ? 'the ' + AFD29_WORDS_ + ' wording was found in ' + wordHits + ' cell(s) above - i-paste ang log, doon natin ipupwesto ang AFD29.FROM / ON_DAY at gagawa ako ng send / preview / trigger kapag napagkasunduan na.'
    : 'WALANG column sa ' + reportTabs_(AFD29).join('/') + ' na may nakasulat na 147 DAYS DUE AND UP - ang nasa email niyang HD REMARKS na yun ay hindi galing sa sheet na to, o kailangan ng ibang file (AFD29.SHEET_ID). I-paste lang ang buong log.');
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
  /* The remark alert hangs off the save, never the other way round. The row is already written
     at this point, so a quota error, a bad address or a broken property is logged and the
     dashboard is still told its save succeeded. */
  if (t.pay) {
    try {
      remarkAlert_({ at: time, key: row[1], name: row[2], account: row[3], agent: row[4],
        action: row[5], label: row[6], date: row[7], remarks: row[8], by: row[9], code: row[10], byName: row[11] });
    } catch (e) { Logger.log('REMARK | the save succeeded, the alert did not: ' + e); }
  }
  return { success: true, row: last + 1, time: time };
}
/* --------------------------------------------------------------- the alert itself
   Everything below runs inside that save request, so it is short and it never throws upward. */
const remarkDayKey_ = () => REMARK.SENT_PREFIX + 'DAY_' +
  Utilities.formatDate(new Date(), REMARK.TIMEZONE || NOTICE.TIMEZONE, 'yyyyMMdd');
const remarkKey_ = r => String(r.key || '').trim() || (nk_(r.name) + '|' + String(r.account || '').trim());
/* The state that decides "have I already told them about THIS version of this sale". An agent who
   picks an action, types a remark, then fixes a typo writes three rows in ten seconds; only the
   first may mail. The signature is action + payment date + remarks, so a genuinely new remark on
   the same sale does alert again. */
const remarkSig_ = r => [nk_(r.action), nk_(r.date), nk_(r.remarks)].join('|');
function remarkRecent_() {
  const p = PropertiesService.getScriptProperties();
  let o = {};
  try { o = JSON.parse(String(p.getProperty(REMARK.SENT_PREFIX + 'LAST') || '{}')) || {}; } catch (e) { o = {}; }
  const cut = Date.now() - 3 * 864e5;
  Object.keys(o).forEach(k => { if (!o[k] || Number(o[k].t) < cut) delete o[k]; });
  return { p: p, o: o };
}
const manila_ = ms => Utilities.formatDate(new Date(Number(ms)), NOTICE.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
/* Pure - it reads the state, it never writes it, so remarkProbe() can ask the same question
   about 200 saved rows without sending or remembering anything. */
function remarkReason_(row, recent) {
  const remarks = String(row.remarks || '').trim();
  if (!remarks) return { mail: false, why: 'the save carried no remarks - choosing an action alone is not an alert' };
  const key = remarkKey_(row), last = recent.o[key], sig = remarkSig_(row), now = Date.now();
  if (last && last.s === sig) return { mail: false, why: 'identical to the alert already sent at ' + manila_(last.t) };
  if (last && now - Number(last.t) < REMARK.GAP_MIN * 60000) {
    return { mail: false, why: 'only ' + Math.round((now - Number(last.t)) / 1000) +
      ' second(s) since the alert sent at ' + manila_(last.t) + ', the gap is ' + REMARK.GAP_MIN + ' minute(s)' };
  }
  const used = Number(recent.p.getProperty(remarkDayKey_()) || 0);
  if (used >= REMARK.MAX_PER_DAY) return { mail: false, why: used + ' alert(s) already went out today, the cap is ' + REMARK.MAX_PER_DAY };
  const left = MailApp.getRemainingDailyQuota();
  if (left <= 5) return { mail: false, why: 'the Gmail send quota is down to ' + left + ' - the 8AM notices and the PLDT reports come first' };
  return { mail: true, key: key, sig: sig, used: used };
}
/* The modal sends 'YYYY-MM-DD' and Sheets quietly turns that into a Date on the way in, so the
   same payment day reaches this mail two different ways: a fresh save hands us the text, a row
   read back from the tab hands us a Date that cell_ prints with ' 00:00:00' glued on. Both are
   printed here as m/d/yyyy, the format the PLDT reports use, and nothing else about the row
   changes - logRead_ still gives the dashboard the value it expects. */
const remarkDate_ = v => {
  const s = v instanceof Date
    ? Utilities.formatDate(v, REMARK.TIMEZONE || NOTICE.TIMEZONE, 'yyyy-MM-dd')
    : String(v == null ? '' : v).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? m[2].replace(/^0/, '') + '/' + m[3].replace(/^0/, '') + '/' + m[1] : s;
};
function remarkItem_(row) {
  return {
    sub: String(row.name || ''), account: String(row.account || ''), agent: String(row.agent || ''),
    action: String(row.label || row.action || ''), paydate: remarkDate_(row.date),
    remarks: String(row.remarks || ''), savedAt: String(row.at || ''),
    byName: [String(row.byName || ''), row.by ? '(' + row.by + ')' : '', row.code ? '(' + row.code + ')' : '']
      .filter(Boolean).join(' ')
  };
}
function remarkMail_(row) {
  const i = remarkItem_(row);
  const subject = REMARK.SUBJECT + i.sub + (i.account ? ' (' + i.account + ')' : '');
  const text = [REMARK.GREET, REMARK.INTRO,
    REMARK.COLS.map(c => c + ': ' + cellOf_(i, c)).join('\n'),
    REMARK.CLOSE, REMARK.THANKS, REMARK.SIGN.join('\n')].join('\n\n');
  const html = `<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#000;max-width:900px">` +
    `<p>${esc_(REMARK.GREET)}</p><p>${esc_(REMARK.INTRO)}</p>` + reportTable_([i], REMARK) +
    `<p style="margin-top:18px">${esc_(REMARK.CLOSE)}</p>` +
    `<p style="margin-top:18px"><b>${esc_(REMARK.THANKS)}</b></p>` + reportSig_({ src: '', blob: null }, REMARK) +
    (REMARK.FOOTER ? `<p style="color:#667085;font-size:12px">${esc_(REMARK.FOOTER)}</p>` : '') + '</div>';
  return { item: i, subject: subject, html: html, text: text };
}
/* send=false logs the exact body and mails nothing. mark=false keeps a preview or a test copy
   from swallowing the real alert later - only a send that actually went out is remembered. */
function remarkSend_(row, send, mark) {
  const m = remarkMail_(row);
  const admins = NOTICE.ADMIN_EMAILS.map(x => String(x).trim().toLowerCase()).filter(Boolean);
  const testTo = admins[0] || Session.getEffectiveUser().getEmail();
  const res = {
    mode: send ? (REMARK.DRY_RUN ? 'test' : 'live') : 'preview', dryRun: REMARK.DRY_RUN,
    subject: (REMARK.DRY_RUN && send ? '[TEST] ' : '') + m.subject,
    to: (send && !REMARK.DRY_RUN) ? REMARK.TO : [testTo],
    cc: (send && !REMARK.DRY_RUN) ? REMARK.CC : [], item: m.item,
    quota: MailApp.getRemainingDailyQuota()
  };
  if (!send) { res.text = m.text; res.html = m.html; return res; }
  const opt = { to: res.to.join(','), name: NOTICE.SENDER_NAME, subject: res.subject, body: m.text, htmlBody: m.html };
  if (res.cc.length) opt.cc = res.cc.join(',');
  MailApp.sendEmail(opt);
  res.sent = true;
  if (mark) remarkMark_(row, remarkRecent_());
  Logger.log('REMARK | ' + (REMARK.DRY_RUN ? 'TEST copy' : 'SENT') + ': ' + m.item.sub + ' (' + m.item.account + ')' +
    (m.item.action ? ' | ' + m.item.action : '') + (m.item.paydate ? ' pay on ' + m.item.paydate : '') +
    ' | remarks "' + m.item.remarks.slice(0, 70) + '" | by ' + (m.item.byName || '-') +
    ' | went to ' + res.to.join(',') + (res.cc.length ? ' | cc ' + res.cc.join(',') : ' | no cc') +
    ' | quota left ' + res.quota);
  return res;
}
function remarkMark_(row, recent) {
  const key = remarkKey_(row);
  recent.o[key] = { s: remarkSig_(row), t: Date.now(), d: REMARK.DRY_RUN ? 1 : 0 };
  const all = Object.keys(recent.o);
  if (all.length > 400) {
    all.sort((a, b) => Number(recent.o[a].t) - Number(recent.o[b].t))
      .slice(0, all.length - 400).forEach(k => delete recent.o[k]);
  }
  recent.p.setProperty(REMARK.SENT_PREFIX + 'LAST', JSON.stringify(recent.o));
  const dayKey = remarkDayKey_();
  recent.p.setProperty(dayKey, String(Number(recent.p.getProperty(dayKey) || 0) + 1));
  Object.keys(recent.p.getProperties()).forEach(k => {
    if (k.indexOf(REMARK.SENT_PREFIX + 'DAY_') === 0 && k !== dayKey) recent.p.deleteProperty(k);
  });
}
/* The entry point logWrite_ calls. It says out loud why it stayed quiet, because the silence is
   the thing he will ask about first. */
function remarkAlert_(row) {
  const recent = remarkRecent_();
  const why = remarkReason_(row, recent);
  if (!why.mail) {
    Logger.log('REMARK | no alert - ' + why.why + ' | ' + String(row.name || '') + ' (' + String(row.account || '') + ')');
    return why;
  }
  return remarkSend_(row, true, true);
}
/* Newest saved row that actually carries a remark - what preview and the test copy show. */
function remarkLatest_() {
  const rows = logRead_({ kind: 'pay', limit: 500 });
  for (let i = rows.length - 1; i >= 0; i--) if (String(rows[i].remarks || '').trim()) return rows[i];
  return null;
}
function remarkPreview() {
  const r = remarkLatest_();
  if (!r) { Logger.log('REMARK | nothing to preview - the Payment_Updates tab has no saved row with remarks yet'); return null; }
  const res = remarkSend_(r, false, false);
  Logger.log('REMARK preview | subject ' + res.subject + ' | would go to ' + REMARK.TO.join(',') +
    ' | cc ' + (REMARK.CC.join(',') || 'none') + ' | DRY_RUN ' + REMARK.DRY_RUN +
    (REMARK.DRY_RUN ? ' (so the real send would go to ' + NOTICE.ADMIN_EMAILS.join(',') + ' only, labelled [TEST])' : ''));
  Logger.log(res.text);
  return res;
}
/* A real copy in his inbox, whatever the live flag says: DRY_RUN is forced on for the run and
   put back before it returns, so this can never reach ilanoandong@gmail.com by accident. */
function remarkTestReport() {
  const r = remarkLatest_();
  if (!r) { Logger.log('REMARK | no remark row to test with - save one in the dashboard FOR PAYMENT modal first'); return null; }
  const keep = REMARK.DRY_RUN;
  REMARK.DRY_RUN = true;
  let res;
  try { res = remarkSend_(r, true, false); }
  finally { REMARK.DRY_RUN = keep; }
  Logger.log('REMARK | settings restored: DRY_RUN ' + keep +
    (keep ? ' (test mode, copies go to ' + NOTICE.ADMIN_EMAILS.join(',') + ' only)'
      : ' (LIVE - a saved remark now mails ' + REMARK.TO.join(',') + ' cc ' + REMARK.CC.join(',') + ')') +
    ' | the test copy was NOT remembered, so the next real save still alerts');
  return res;
}
/* Read-only census of the tab the dashboard writes, plus what the rule would have done with each
   row. It sends nothing and writes nothing. */
function remarkProbe() {
  const rows = logRead_({ kind: 'pay', limit: 500 });
  const recent = remarkRecent_();
  const withRem = rows.filter(r => String(r.remarks || '').trim());
  const tally = {};
  let would = 0;
  withRem.forEach(r => {
    const w = remarkReason_(r, recent);
    if (w.mail) would++;
    else { const k = w.why.replace(/[-0-9]+ /, 'N ').slice(0, 60); tally[k] = (tally[k] || 0) + 1; }
  });
  Logger.log('REMARK | file ' + logSs_().getName() + ' | tab ' + LOG.PAY_TAB + ' | rows=' + rows.length +
    ' | with remarks=' + withRem.length + ' | a fresh save now would alert on ' + would + ' of them');
  Logger.log('REMARK | recipients: to ' + REMARK.TO.join(', ') + ' | cc ' + (REMARK.CC.join(', ') || 'none') +
    ' | DRY_RUN ' + REMARK.DRY_RUN + (REMARK.DRY_RUN ? ' - so today every copy goes to ' + NOTICE.ADMIN_EMAILS.join(', ') + ' only' : '') +
    ' | gap ' + REMARK.GAP_MIN + ' min | cap ' + REMARK.MAX_PER_DAY + '/day | quota left ' + MailApp.getRemainingDailyQuota());
  Object.keys(tally).sort((a, b) => tally[b] - tally[a]).forEach(k => Logger.log('  quiet because: ' + k + ' x' + tally[k]));
  Logger.log('the last ' + Math.min(10, withRem.length) + ' saved remark(s), newest first:');
  withRem.slice(-10).reverse().forEach(r => Logger.log('  ' + r.at + ' | ' + r.name + ' | ' + r.account + ' | ' +
    (r.label || r.action || '-') + ' | pay ' + (r.date || '-') + ' | "' + String(r.remarks).slice(0, 60) +
    '" | by ' + (r.byName || '-') + ' (' + (r.by || 'no email') + ')' + ' | agent ' + (r.agent || '-')));
  Logger.log('kung walang remark pa ang nasa tab, normal iyan - nag-iipon lang sila kapag may gumamit ng modal.');
  return { rows: rows.length, withRemarks: withRem.length, wouldAlert: would };
}
/* The throttle state lives in Script Properties. Run this once after flipping REMARK.DRY_RUN to
   false, and any time he wants to re-test the same sale: it deletes the memory, nothing else. */
function clearRemarkAlerts() {
  const p = PropertiesService.getScriptProperties();
  const gone = Object.keys(p.getProperties()).filter(k => k.indexOf(REMARK.SENT_PREFIX) === 0);
  gone.forEach(k => p.deleteProperty(k));
  Logger.log('REMARK | cleared ' + gone.length + ' alert state key(s): ' + (gone.join(', ') || 'there was nothing to clear') +
    ' - the next saved remark alerts even on a sale that already alerted today');
  return gone;
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
