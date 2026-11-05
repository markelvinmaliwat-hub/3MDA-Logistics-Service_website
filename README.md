# 3MDA Logistics — agent dashboard

Single-file dashboard (`index.html`) published with GitHub Pages. Agents log in, see
their own PLDT / RED sales, and the owner can trigger the daily sales-status emails.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app: markup, styles and logic. Published as-is by GitHub Pages. |
| `AgentNotices.gs` | **Mirror only** of the Google Apps Script file that actually sends the emails. |
| `assets/mmmda-logo.jpg` | The logo attached to the signature of the two PLDT reports. |

## The email code does not live here

Pages is static — it cannot schedule or send anything. The daily 8:00 AM notices run in
the Apps Script project bound to the **DATABASE AUG TO OCT** spreadsheet:

* `sendNotices_` builds one formal English email per agent (FOR PAYMENT + RETURNED SALES).
* RETURNED = rows in the `VALIDATORS` tab **plus** `PLDT` / `RED` rows whose `FINAL STATUS`
  starts with `RTS` / `RETURN`, deduped so a sale is never listed twice.
* The daily trigger runs `runAgentNotices` against **Head** — the latest saved code.
* The web app serves the **published version** only. After editing, run
  **Deploy > Manage deployments > New version**, or the dashboard keeps calling old code.

Editing `AgentNotices.gs` in this repo changes nothing until it is pasted into Apps
Script and saved. Keep the two copies in step by pasting from this file.

## Settings that matter

In `AgentNotices.gs`: `DRY_RUN` (true = every notice goes to `ADMIN_EMAILS` labelled
`[TEST for <agent>]`), `SEND_HOUR`, `MAX_ROWS` per section, `SHEET_ID`, `ADMIN_EMAILS` —
and one config object per PLDT report (`SFS`, `CV`, `AFD`, `AFD12`, `RTS`, plus the scaffold
`AFD29`): `DRY_RUN`, `TO`, `CC`, `FROM`, `STATUS`
(one phrase, or a list that must all be in the same cell — or, with `ANY: true`, a list of
**alternatives** where one hit is enough, which is how `RTS` reads its two taggings), `EXACT`,
`WHERE` (extra column = value
filters), `NOT` (column + wording that must be **absent**, e.g. the RPR rows in AFD), `ON_DAY` (the
column whose date must be today), `GREET`, `INTRO` and `CLOSE` (may contain
`{CLUSTER}`), `HD_TEXT` (may contain `{DATE}`), `COLS`, `SEND_HOURS`, `SEND_FROM` (the earliest
clock time a scheduled run may mail), `SHEET_ID`, `TABS`, `TEST`.

In `index.html`: `WEB_APP_URL` (sales data only, via the `getAllData` JSONP call),
`NOTICE_APP_URL` (notices **and** the shared log API), `LOG_URL` (defaults to
`NOTICE_APP_URL`), `MAIL_ADMINS` (who may see the **Email agents** button).

## Shared logs — the "Online" avatars and payment history

`AgentNotices.gs` also serves `action=logRead | logWrite | logStatus` on the same `/exec`
URL. It writes only to `LOG.SHEET_ID` (the logs spreadsheet, never the sales file), in two
tabs it owns: **`activity_log`** and **`Payment_Updates`**, created with the right headers
on first use.

The tab named `Payment_Log` in that spreadsheet turned out to hold 349 rows of *activity*
history, not payments, so nothing is appended to it and the log API never opens it for
writing. Run `repairLogTabs()` once in Apps Script to put its original header back (an
earlier revision of this file adopted it by mistake) and to prepare the two tabs above.
It deletes nothing and is safe to run twice.

* Every row is stamped with **server** time in `NOTICE.TIMEZONE` plus an epoch `Ts` column,
  so the Online avatars do not depend on any one agent's clock.
* Reads are JSONP (same route as the live sales sync) so no CORS surprises.
* Caps: `LOG.FIELD` characters per value, `LOG.READ_LIMIT` rows per read, and
  `LOG.MAX_ROWS` rows in a tab — past that the log refuses new rows instead of growing
  forever, because the endpoint is reachable by anyone holding the `/exec` URL.
* Traffic: each open dashboard writes a heartbeat every 3 minutes and reads presence every
  60 seconds, and stops doing both while the tab is hidden. Roughly 40 calls per online
  agent per hour — keep that in mind before adding more agents.

Before this existed, `LOG_URL` pointed at the sales web app, which answered every log
request with the entire 13 MB database and no `success` field. Nothing was ever written,
so the header could only ever show `Online · 1`.

## Endorsement reports to PLDT — SFS VALIDATION, CREDIT VALIDATION and AFD RESCHEDULE

Two reports leave this script on their own schedule, and everything about each one — wording,
rule, recipients, schedule, test settings — is a config object (`SFS` and `CV`) rather than
code. Both mail the owner's own shape: greeting, one-line intro, a black-bordered
`DATE | SUBSCRIBER NAME | SR | CSP REMARKS | HD REMARKS` table, `Thank you !`, his three-line
signature with the MMMDA logo inline. Both read the `PLDT` and `RED` tabs, never `VALIDATORS`,
and both run **twice a day** (`SEND_HOURS = [8, 14]`). The third config, `AFD`, is a third
mail on the same engine: four conditions instead of one, and it sends **at or after
10:30 AM**, not at 8AM — both of those are explained in its own bullet below.

* **SFS** (`runSfsNotices`): To `lsabat@pldt.com.ph`, CC the three addresses in `SFS.CC`,
  subject `3MDA_SFS_VALIDATION_` + `MMMYYYY`. **LIVE since 2026-11-04.**
* **CV / CREDIT VALIDATION** (`runCvNotices`): the recipient set is **identical to SFS** — the
  owner confirmed on 2026-11-04 that both daily reports go to `lsabat@pldt.com.ph` on the To line
  with the same three CCs. Intro `For credit validation and approval.`, HD REMARKS line
  `FOR CREDIT VALIDATION AND APPROVAL`, subject `3MDA_CREDIT_VALIDATION_` + `MMMYYYY`.
  **`DRY_RUN = false` since 2026-11-05** — he read a `cvTestReport` copy and said *"OO, GO CV LIVE"*.
* **Its rule is the owner's own words too: `CSP REMARKS` contains `ESCALATED TO CVAA`.** Note
  what that excludes: the `FOR COMPLIANCE VERIFICATION RCM` row visible in his screenshot is
  *not* reported by this rule. If he wants it, `CV.STATUS` becomes that wording (or `CV.FROM`
  gains a second column) — the point is that the rule is his, not a guess.
* **SFS rule: the row belongs in the report once `FINAL STATUS` carries the SFS tag.**
  `SFS.FROM = ['FINAL STATUS']` and `SFS.EXACT = false`, so `SFS VALIDATION` matches whatever
  the spacing or case, and it also catches a longer wording typed straight into `FINAL STATUS`.
  `CSP STATUS` is not a source — it holds reasons (`DUPLICATE SUBS INFO`), not states.
* **There is no `HD REMARKS` column in the sheet** (measured by `sfsProbe` on the live file:
  PLDT has `CSP STATUS | CSP REMARKS | PAYMENT REFERENCE/ REMARKS | PAYMENT STATUS | FUSE
  STATUS | OFSC STATUS | HD RECOMMENDATION | FINAL STATUS`, 1,372 rows). The line
  `SFS VALIDATION - WITH UPLOADED DOCS` in his manual email is something **he types himself**,
  so `SFS.HD_TEXT` repeats it on every row — and `CV.HD_TEXT` repeats
  `FOR CREDIT VALIDATION AND APPROVAL` for the same reason. Set either to `''` to read the real
  `HD REMARKS` / `HD RECOMMENDATION` cells instead.
* **Twice a day, no row mailed twice.** Each report keeps the SR numbers it actually mailed in
  Script Properties under `cfg.SENT_PREFIX + yyyyMMdd` (`SFS_SENT_` / `CV_SENT_`), so the 2PM
  run lists only rows that were not in the 8AM mail and stays silent if nothing new arrived
  (`4 row(s) already reported today - nothing new, nothing sent`). The key is rebuilt daily and
  the previous day's key is deleted, so a row still pending tomorrow is reported again. Only a
  live send writes the list — a preview, a test copy and any `DRY_RUN` send never touch it, and
  the list is capped at 700 SRs (it logs a warning before it would forget rows).
* **AFD RESCHEDULE is the third report, and the first with four conditions.** The owner's rule,
  given on 2026-11-05: `FINAL STATUS` says `AFD - RESCHEDULE`, the `CLUSTER` column says 11, the
  revisit day is typed by hand in `HD RECOMMENDATION` as `AFD - NOV 5`, and a row whose
  `HD RECOMMENDATION` says `RPR - RESCHEDULE` is **not** in this mail. So `AFD.STATUS` is a
  **list** (`['AFD','RESCHEDULE']` - both words must be in the same cell, because the dash and the
  spacing around it are not stable, and one long phrase would break on them), `AFD.WHERE` is
  `[{ COL: 'CLUSTER', IS: '11' }]`, `AFD.NOT` is `[{ COL: 'HD RECOMMENDATION', HAS: 'RPR' }]` and
  `AFD.ON_DAY` is `'HD RECOMMENDATION'`, meaning only rows whose revisit **is the day the report
  runs** go in the mail. `collectReport_` applies all four, in the order tag → NOT → cluster → day,
  so an RPR row never reaches the "this cell has no readable date" list either.
  **Why RPR is out:** `afdProbe` on the live sheet 2026-11-05 found exactly one cluster 11 row
  tagged `AFD - RESCHEDULE` whose `HD RECOMMENDATION` reads `RPR - RESCHEDULE`, and the owner's
  answer was *"ang RPR - RESCHEDULE ay hindi kasama, dahil may ibang paraan ng reschedule dito"* —
  RPR is rescheduled through another queue, so its rows must never appear in the AFD endorsement.
  `NOT` is a generic config key (any report can declare one), matched on the same normalised cell
  text as `STATUS`, so `RPR - RESCHEDULE`, `rpr reschedule` and `RPR` alone are all excluded. The
  probe and the empty-day diagnosis both print `RPR excluded: N`, so a row dropped here is counted,
  never silently lost.
  `cellEq_` compares on the digits when the two sides are not the same word, so `11`, `'11'`,
  `'11.0'` and `'CLUSTER 11'` all count as cluster 11, and a blank never does. `revisitDay_` reads
  `AFD - NOV 5`, `AFD - NOVEMBER 5`, `11/5` or a real date cell and returns month + day - the text
  carries no year and does not need one. When a row is tagged and in the right cluster but its date
  cell cannot be read, it is **named in the log** (`?? PLDT | SR 2314100005 | HD RECOMMENDATION =
  "AFD - TBD"`) instead of vanishing. `AFD.ON_DAY` both **filters** on that date and feeds the
  `{DATE}` in `HD_TEXT` — there is no revisit-date column in his table, the day is written into the
  remarks line instead.
  **The mail follows his own AFD email (2026-11-05), in formal English because operations bosses
  receive it:** `Hi Sir Jack,`, then
  `For endorsement to CLUSTER {CLUSTER} for revisit. The call-out has already been completed and the
  subscribers are available today; we would appreciate your assistance in having them revisited.` —
  `{CLUSTER}` is filled from the rows, so changing `AFD.WHERE` alone moves the number in the
  sentence — then his ten columns in his order (`DATE, SUBSCRIBER NAME, SR, ACCT, PR, CSP STATUS,
  BRGY, CITY, CLUSTER, HD REMARKS`), `AFD.CLOSE` (`Should you have any concerns regarding the
  scheduled revisit, please kindly reply to this email so that we may address them immediately.`,
  placed after the table and before `Thank you !`; empty for SFS and CV, whose wording he approved
  verbatim), the logo and his signature. `AFD.HD_TEXT` is
  `PART OF AFD {DATE} - SUBS WANT TO REQUEST FOR REVISIT`, where `{DATE}` is **that row's own
  revisit day** read out of `HD RECOMMENDATION` and always written the same way (`11/5/2026`) — he
  types `AFD - NOV 5`, `AFD - 11/5` and `AFD - NOVEMBER 5` on different rows, and a table that mixes
  them reads like a mistake. ACCT / PR / BRGY / CITY / CLUSTER are read through new `ALIAS_`
  entries; `afdProbe` on the live sheet 2026-11-05 confirmed every one of them resolves to a real
  header (`ACCT=ACCT | PR=PR | BRGY=BRGY | CITY=CITY | CLUSTER=CLUSTER`), which is why the probe now
  maps **every** column of the table to the header it found, or `MISSING`, and `afdPreview` names
  any column that came out empty in every row instead of letting an empty column reach PLDT.
  Recipients mirror SFS exactly because that is what he confirmed on 2026-11-05 — if the mail that
  greets Sir Jack goes to a different address, only `AFD.TO` / `AFD.CC` change. **LIVE since
  2026-11-05** (`AFD.DRY_RUN = false`, set by the owner after he read an `afdTestReport` copy), and
  `afdProbe` / `afdPreview` / `afdTestReport` / `installAfdTrigger` are the dropdown entries.
  `AFD` is **not** in `ensureReportTriggers_`: unlike SFS and CV its 10AM + 11AM pair is only what
  `installAfdTrigger()` put there at 11:49 AM on 2026-11-05, so a deleted trigger is not repaired
  automatically. `afdPreview` also runs `diagnoseReport_` when the table is empty, which
  counts how many rows each condition removed - tagged but excluded (RPR), tagged but wrong
  cluster, right cluster but another day, and the rows whose date cannot be read.
* **`AFD12` is that same rule for CLUSTER 12, in its own mail.** He asked for it on 2026-11-05
  (*"same rules lang, gagawan lang din ng pang sariling email para sa cluster 12"*), so nothing about
  the rule changed: same `AFD` + `RESCHEDULE` tag, same RPR exclusion, same hand-written revisit day
  in `HD RECOMMENDATION` that must equal the run day, same four PLDT addresses, same Sir Jack
  greeting, same 10:30 gate. The only line that differs is `AFD12.WHERE = [{ COL: 'CLUSTER', IS: '12' }]`,
  plus its own `AFD12.SUBJECT = '3MDA_AFD12_RESCHEDULE_'` and its own `AFD12.SENT_PREFIX =
  'AFD12_SENT_'` — separate lists are the point, because a cluster 11 mail must not mark cluster 12
  rows as already reported, and the subject tells Sir Jack which cluster is being endorsed. The
  dropdown entries are `afd12Probe` / `afd12Preview` / `afd12TestReport` / `sendAfd12Report` /
  `installAfd12Trigger`, and `runAfd12Notices` is its handler. **`DRY_RUN` is `false` since
  2026-11-05** — he read the `afd12TestReport` copy and gave the go — and, like `AFD`, it is not in
  `ensureReportTriggers_`, so it stays off the schedule until he runs `installAfd12Trigger()`.
  `afdProbe`'s rule-measuring half became `afdScout_(cfg)` so both clusters are measured by the same
  code: `afd12Probe()` logs `AFD12 tagged rows by CLUSTER: …` (the whole AFD queue in one line, so
  11 versus 12 versus a mis-keyed cluster is visible) and then the same count / other-days /
  unreadable-dates / table-columns / `the mail would carry N row(s) today` block under `AFD12 …`
  labels. It skips the tab walk `afdProbe` already does, so it is the fast one to re-run.
* **AFD mails at 10:30 AM, not before, and an empty AFD day mails nothing.** His reason is the
  call-out: the report is only true once the morning call-out is finished. Apps Script cannot be
  given a minute — `atHour(10)` means "somewhere inside the 10 o'clock hour", which can be 10:02 —
  so `AFD.SEND_HOURS = [10, 11]` and `AFD.SEND_FROM = '10:30'`. `sendReport_` compares the sheet's
  own clock (`HH:mm` in `Asia/Manila`) with `SEND_FROM` before it reads anything: a run that wakes
  early logs `too early - AFD sends from 10:30 Asia/Manila, this run started at 10:05` and returns
  without a mail **and without touching the dedupe list**, so the 11 o'clock run mails the same rows
  once. Whichever run gets there first is the one that sends; the daily dedupe makes the other one
  say `already reported today`. `sendAfdReport` (the dropdown) passes `force` and ignores the gate,
  because if he pressed it he means it; `afdPreview` and `afdTestReport` are never held by it either
  — the gate holds mail, not reading. `SFS` and `CV` have no `SEND_FROM`, so their 8AM/2PM pair is
  untouched.
  The other half of the request is what `AFD.ON_DAY` already does: an `AFD - NOV 6` row is reported
  on November 6 and on no other day, and on a day with nothing scheduled for it `collectReport_`
  returns nothing, `sendReport_` returns `no rows tagged AFD + RESCHEDULE whose HD RECOMMENDATION is
  today - nothing sent` and never builds an email — in `DRY_RUN` or live.
* `sfsProbe` / `cvProbe` are how the rules were decided, and they are still the tool to run if
  the wording ever changes. They send and write nothing. Per tab they log the column names, the
  ten most common values of the five status and remarks columns, every value mentioning the
  report's words (`>>` — `SFS.PROBE` / `CV.PROBE`), **every column that ever contains those
  words with its exact wording (`##`)**, the full contents of the sample rows, and how many rows
  the current rule would report. As measured on 2026-11-04 the live Aug-Oct sheet had **0** rows
  tagged `SFS VALIDATION`, so an automated run that day correctly sends nothing.
* `afdProbe` is the read-only scout behind that rule. It lists every tab that mentions
  `AFD` / `RESCHEDULE` / `CLUSTER`, the columns named for them, the exact wording with row counts,
  how many rows each cluster value has, whether a date column holds real dates or text (the same
  day arrives in the sheet both ways), and up to five whole sample rows - then it measures the
  shipped `AFD` rule on the same file and logs what each condition removed. It emails nothing,
  writes nothing and changes no setting. Run it before trusting `AFD.WHERE` / `AFD.NOT` /
  `AFD.ON_DAY`: if the counts are 0, the column name in the sheet is different and the log shows
  the real header.
* **Which spreadsheet is read is per report.** `cfg.SHEET_ID` (`''` = the same file the
  agent notices use, `DATABASE AUG TO OCT`) and `cfg.TABS` (`[]` = `NOTICE.SALES_TABS`) let a
  report follow the owner's *current* file once Aug–Oct is closed, without touching the notices.
  The probes and `installSfsTrigger` / `installCvTrigger` log the file name and tabs they used
  (the status object behind the second line also carries `hours`, `dryRun`, `to`, `cc`, `rule`
  and the remaining mail quota).
* Measured on the live Aug-Oct file (2026-11-04, `sfsProbe`): PLDT 1,374 rows, RED 303,
  `VALIDATORS` empty, and **no row anywhere in RED contains the word SFS**. The two names
  from the owner's manual email are `FINAL STATUS = REENCODED` (MAGILYN) and
  `CANCELLED - WITH EXISTING SR` (LORAINE) — the SFS tag is not applied in this file, so the
  report currently has 0 rows and sends nothing. Point `SFS.SHEET_ID` at the file where he
  actually types `SFS VALIDATION` and the same rule starts producing rows.
* Matched after normalising case and spacing; deduped by SR number across the two tabs,
  oldest first, capped at `cfg.MAX_ROWS` (300 for both reports); `DATE` renders as `M/D/YYYY`
  like his email.
* **A day with no matching row sends nothing.**
* **SFS is LIVE since 2026-11-04** — the owner approved it after reviewing a real copy, so
  `SFS.DRY_RUN` is `false` and the report goes to `SFS.TO` + `SFS.CC`. **AFD is LIVE since
  2026-11-05** (same approval path: he read an `afdTestReport` copy, then set `AFD.DRY_RUN = false`
  and ran `installAfdTrigger`). **CV is LIVE since 2026-11-05** (`CV.DRY_RUN = false`, on the same
  approval path). **All four reports now mail PLDT on their own.** Set any of them
  back to `true` any time to stop PLDT receiving it: while it is true every copy goes to
  `NOTICE.ADMIN_EMAILS` only, the CC list is ignored, and the subject gains `[TEST] `.
  `sfsPreview` / `cvPreview` log the exact body without sending anything and without touching
  the dedupe list.
* **`sfsTestReport` / `cvTestReport` / `afdTestReport` produce a real copy on any day.** The live
  rules have 0 rows until a new encode is tagged, so there would be nothing to look at — each one
  temporarily matches its own `cfg.TEST.STATUS` (`SFS.TEST` borrows `REENCODED`, `CV.TEST`
  borrows `ESCALATED`, `AFD.TEST` borrows the single word `AFD`, at most `cfg.TEST.MAX_ROWS` = 12
  rows in the table) and **forces that
  report's `DRY_RUN` on for the duration**, so a test can never reach PLDT even while the
  daily report is live. `STATUS`, `MAX_ROWS` and `DRY_RUN` are restored before it returns and
  `afdTestReport` also puts `AFD.IGNORE_DAY` back, so the must-be-today filter is only off while he
  is looking at a copy — the cluster 11 filter and the RPR exclusion stay on, and the `{DATE}` in
  HD REMARKS is still read from `HD RECOMMENDATION`. The last log line prints what the settings
  went back to; change `TEST` to try another status.
  Measured on the live sheet: 89 rows carry `FINAL STATUS = REENCODED`, and `afdTestReport` on
  2026-11-05 matched **1** row — the one cluster 11 row that has a day written in
  `HD RECOMMENDATION` (`AFD - NOV 6`).
* Apps Script cannot schedule an exact minute — a day trigger fires somewhere inside
  each hour of `cfg.SEND_HOURS`, so this is "in the 8AM hour and in the 2PM hour", not
  8:00:00. Same limitation as the 8:00 AM agent notices. Where a report must not start before
  a certain clock time (`AFD.SEND_FROM`, see above) the answer is two hours plus a gate, not a
  finer trigger. `installSfsTrigger` and
  `installCvTrigger` create one trigger per hour for their own report (two each), delete any
  older trigger for the same handler first so running them twice never duplicates a mail, and
  print what they did — schedule, rule, file, tabs, and whether that report is live or still
  in test mode — to the Execution log, because the function's return value is not shown there.
* **The schedule repairs itself.** `ensureReportTriggers_()` runs at the top of every scheduled
  run (`runAgentNotices`, `runSfsNotices`, `runCvNotices`) and rebuilds a report's triggers only
  when their count does not match `cfg.SEND_HOURS` — Apps Script cannot read a trigger's hour
  back, so the count is the check, and a correct pair is never touched. This exists because the
  editor was refusing manual runs ("An unknown error has occurred") and the owner should not
  have to press Run for the plan to exist: one firing trigger is enough to install the rest. A
  rebuild can put a fresh trigger back inside the current hour window, which is exactly what the
  daily dedupe absorbs (`nothing new, nothing sent`). The whole check is wrapped in `try/catch`
  so a trigger-quota failure logs a line and the report still goes out. When it is the **CV**
  pair that was new and CV is still on `DRY_RUN`, `cvReviewCopy_()` posts him one `[TEST]` copy
  — at most once per day, keyed by `CV_REVIEW_yyyyMMdd` in Script Properties. Since CV went live on
  2026-11-05 that copy no longer fires: it only exists to show him the wording before the switch.
* `cfg.SR_LINK`, if set, turns each SR into a link to that number's page. Both are shipped
  empty because the owner asked for plain numbers ("Hindi na kailangan, plain number lang"),
  and a link should only be handed to PLDT if it is safe to show.
* **The MMMDA logo is part of the signature** (`assets/mmmda-logo.jpg`, 1280x1255). Apps
  Script fetches it from the published site and attaches it as an inline image
  (`<img src="cid:mmmda-logo">` + `inlineImages`), so it still shows in mail clients that
  block pictures loaded from the internet. If the fetch fails the email is still sent with
  the picture linked by URL instead, and `sfsPreview` / `cvPreview` log which of the two
  happened (`attached inline` / `linked only`). Set `cfg.LOGO_URL` to `''` for no picture at
  all, `cfg.LOGO_ABOVE = false` to put it under the three lines, `cfg.LOGO_W` / `LOGO_H` for
  size. The logo is only in the two PLDT reports — the agent notices are unchanged.
  Replace the picture by overwriting `assets/mmmda-logo.jpg` and pushing.
* To change the columns, edit `cfg.COLS` (both reports ship
  `['DATE', 'SUBSCRIBER NAME', 'SR', 'CSP REMARKS', 'HD REMARKS']` like his own mail); the
  header name is mapped to the row field in `CELL_` (`Date, Subscriber, SR No., Plan, Status,
  Remarks, Agent, Team Leader, CSP Status`).
* A new daily email needs no web-app redeploy — triggers run **Head**. Only a new `/exec`
  action would need Deploy > New version.
* Putting this revision in is one paste and one `Ctrl+S`: then `installSfsTrigger()`,
  `installCvTrigger()`, `installAfdTrigger()`, `installAfd12Trigger()` and `installRtsTrigger()` —
  each deletes every trigger of its own handler before creating its pair, so a short or duplicated
  pair is fixed by re-running it, never by hand. On 2026-11-05 the owner's Triggers page went from
  **SFS 1 + CV 3** to exactly **2 + 2 + 2 + 2 + 1 agent notice = 9**; `installRtsTrigger()` is one
  11AM trigger on top of those, and it does nothing until he presses it. The four PLDT reports are
  past the `DRY_RUN` gate; RTS is not, so a paste is the only thing standing between a rule change
  and PLDT receiving it.
* **AFD is live and on its own schedule.** The path the owner took on 2026-11-05: `afdProbe()` to
  measure the columns on the live file, `afdTestReport()` for a copy in his own inbox, then
  `AFD.DRY_RUN = false` in the editor and `installAfdTrigger()` (the 10AM + 11AM pair, so the mail
  goes out at or after 10:30 and never before). `runAfdNotices` is the handler, separate from
  `runSfsNotices` and `runCvNotices`, and it does not call `ensureReportTriggers_` — if those two
  triggers are ever deleted, only `installAfdTrigger()` puts them back.
  Measured by `afdProbe` on the live file at 11:42 AM that day: 1,685 rows read, **13** tagged
  `AFD` + `RESCHEDULE`, **1** of them excluded as RPR, **7** left in cluster 11, **0** due on the
  day it ran, 1 due `NOV 6`, and 6 with no readable date in `HD RECOMMENDATION`. Those six stay out
  of every mail until a day is written into their `HD RECOMMENDATION`, and each run names their SR
  numbers in the log (`?? PLDT | SR 2312403150 | HD RECOMMENDATION = "AFD - RESCHEDULE"`).
  The first mail this rule can produce is therefore **November 6**, one row.
* **Cluster 12 is live on the same rule (`AFD12.DRY_RUN = false`, 2026-11-05).** He read the
  `afd12TestReport` copy and said *"OO, GO AFD12 LIVE"*, so the cluster 12 mail goes to the same four
  PLDT addresses as cluster 11. Measured by `afd12Probe` on the live file at 1:16 PM that day: 1,689
  rows read, **13** tagged `AFD` + `RESCHEDULE`, **1** excluded as RPR, **4** of them in cluster 12,
  **2 due on the day it ran**, and 2 cluster-12 rows with no readable date (`HD RECOMMENDATION` just
  repeats `AFD - RESCHEDULE`); every table column resolved, so `the mail would carry 2 row(s) today`.
  Because the rule is due-today-only and the 10AM/11AM hours had already passed at 1:16 PM, those two
  rows reach PLDT only through `sendAfd12Report()` (forced, ignores the gate) on the same day — after
  that day they are gone from the rule. Two steps are still his to press in Apps Script after the
  paste: `sendAfd12Report()` for today, and `installAfd12Trigger()` for the 10AM + 11AM pair that
  makes every later day automatic. Until the second one runs, cluster 12 mails nobody on its own.
  He pressed `sendAfd12Report` at 2:53 PM and the log named the two dateless rows
  (`?? PLDT | SR 2313229824`, `?? PLDT | SR 2313368081`) — but said nothing about the two that were
  due, which is the gap below.
* **Every send now prints its own verdict.** Until then a pressed `sendAfd12Report` logged only the
  unreadable-date lines, so the screenshot looked identical whether PLDT received the rows or the day
  was empty. `logSendOutcome_` adds one line per send: `AFD12 | SENT: 2 row(s) in the mail | subject
  3MDA_AFD12_RESCHEDULE_NOV2026 | went to lsabat@pldt.com.ph | cc … | marked as reported today: 2`,
  or `NOT SENT: 0 row(s) … | <the reason>` — including `already reported today`, `daily Gmail quota
  reached` and a thrown `MailApp` error. It is guarded by `send`, so `afd12Preview` keeps its own
  `would go to:` lines and never claims to have sent anything, and a `DRY_RUN` copy says
  `DRY_RUN test copy, went to …` instead of naming PLDT.
* **RTS is the fifth mail and it is NOT live (`RTS.DRY_RUN = true`, no trigger, 2026-11-05).** He
  asked for it in one sentence: *"nais ko din sana magkaroon ng automated email patungkol sa
  RTS - CUSTOMER COMPLIANCE / RTS - UNCONTACTABLE na makikita sa final status at ito ay ipapadala sa
  email na ito - to bernardsalioa@gmail.com at naka cc sila jrsnavarro25@gmail.com
  juliean.rjab@gmail.com at ito ay ipapadala sa email araw araw tuwing 11:00 AM lamang"*. Three
  things make it different from the four PLDT queues: the To/CC are **those three addresses and
  nobody else**, the two taggings are **alternatives** (`RTS.ANY = true`, so `statusHit_` uses
  `some`, not `every` — a row carrying only one of the two wordings still belongs), and it runs in
  **one** hour (`SEND_HOURS: [11]`) instead of a pair, because he said *11:00 AM lamang*. What is
  shared: the file, the tabs, the black-bordered table, the per-day `RTS_SENT_yyyyMMdd` SR list,
  the `[TEST]` copy path. The greeting `Hi Sir Bernard,`, the intro *"For endorsement to RTS for
  proper validation and customer compliance."* and the `FOR RTS ACTION` line are my wording of his
  intent — he has to confirm or replace them, the same way `AFD.INTRO` was rewritten from his
  screenshot. Presses: `rtsProbe`, `rtsPreview`, `rtsTestReport`, `sendRtsReport`,
  `installRtsTrigger`, handler `runRtsNotices`. It is not in `ensureReportTriggers_`.
* **AFD29 (his "147 days due" mail) exists only as a scaffold plus a read-only scout.** He sent a
  screenshot of his own `3MDA_AFD29_NOV2026` and said *"maging AFD29 man o AFD12, ang gagamiten
  kasi ko na email na ayon sa date ng pag i-email ko - ito na lang 11/5/2026 - ganyan din dun sa
  AFD"*. The picture settles the shape (mixed clusters 5/9/11 in one mail, `FINAL STATUS`
  `AFD - RESCHEDULE`, `AFD SCHEDULED DATE` = 11/5/2026, an HD REMARKS line reading
  `AFD 11/5/2026 - 147 DAYS DUE AND UP`) but not the rule: whether that wording lives in a column
  the script can read, or whether the sheet has a numeric days-due column, or whether the line is
  something he types at send time like the AFD/AFD12 `HD_TEXT`. So `AFD29` is a config object with
  `DRY_RUN: true`, `WHERE: []` and provisional `ON_DAY: 'AFD SCHEDULED DATE'`, and **nothing reads
  it** — there is no `sendAfd29Report`, no `afd29Preview`, no `installAfd29Trigger`, no handler.
  `afd29Probe()` is the only AFD29 press: per report tab it logs the real headers, every column
  whose values say `147` / `DAYS DUE` / `DUE AND UP` (exact wording + row count), every column whose
  *name* looks like a days/due column with how many of its values are plain numbers ≥ 147, the
  `AFD` + `RESCHEDULE` rows with their cluster spread, each candidate date column of those rows read
  against today (`"11-5  <<< = TODAY" x3`), the provisional rule and how many rows it would report,
  and finally which of its own table columns the sheet does not have or the mail cannot fill yet
  (`CONTACT NUMBER=NOT WIRED YET …`, `CITY / BRGY=NOT WIRED YET and the sheet has no such header`)
  instead of letting an empty column ship. That log is what turns it into a sixth queue.

## Agent accounts and Forgot password

Before this, an account existed only as `mm_acc` in the browser that created it. Change
phone, clear site data, or let Chrome autofill a different password and the server-side
`Incorrect password` was unavoidable — there was nothing to check against.

Accounts now live in the **`Accounts`** tab of the logs spreadsheet and are reached through
`action=acct` on the same `/exec` URL. Ops: `exists`, `create`, `login`, `profile`,
`forgot`, `check`, `reset`.

* Columns: `Email | Hash | Code | Name | Last Login | Reset Code | Expires | Tries | Resets | Reset Day`.
* `Hash` is the same short convenience digest the dashboard has always computed in
  JavaScript — **not** a cryptographic password hash. It is enough to stop this kind of
  mistake, not enough to protect a real password. Never store one here.
* No reply ever contains the digest or a live reset code; an answer is a few bytes, not a
  database dump.
* A reset is a 6-digit code emailed to the agent, valid 30 minutes, usable once, 5 wrong
  attempts before it locks. Locking applies to the password too — after 5 failed logins
  even the right password waits until a code is used.
* `MAX_RESETS_PER_EMAIL` (3/day) and `MAX_RESETS_TOTAL` (20/day) bound the email volume,
  and `QUOTA_FLOOR` (25) stops reset mail before it can eat the Gmail quota the 8:00 AM
  notices need. With `DRY_RUN` on, codes go to `ADMIN_EMAILS` labelled `[TEST for <email>]`.
* If the logs spreadsheet is shared more widely than it should be, set `ACCT.SHEET_ID` to a
  private spreadsheet so `Accounts` is not visible to everyone who can read the logs.

The dashboard masks the password field by default and adds **Show** and
**Forgot password?** under it; `autocomplete="off"` plus a mismatched field name keeps
browsers from silently filling in an old password. Signing up on one device and logging in
on another now works, because the server returns the stored agent code and signs the agent
straight in.

## Manual send token

Anyone who reads the page source can see `NOTICE_APP_URL`, so the send action is gated by
a token kept in **Script Properties** (`NOTICE_SEND_TOKEN`) — never in this repo. Run
`setNoticeSendToken()` once in Apps Script, copy the token it logs, and the dashboard will
ask for it before **Send emails now**. `clearNoticeSendToken()` removes the requirement.

## Publishing

Push to `main`; GitHub Pages rebuilds in a couple of minutes. Verify with

```
curl -sL https://markelvinmaliwat-hub.github.io/3MDA-Logistics-Service_website/ | wc -c
```
