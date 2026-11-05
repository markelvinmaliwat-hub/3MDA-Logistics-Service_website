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
and one config object per PLDT report (`SFS`, `CV`, `AFD`): `DRY_RUN`, `TO`, `CC`, `FROM`, `STATUS`
(one phrase, or a list that must all be in the same cell), `EXACT`, `WHERE` (extra column = value
filters), `ON_DAY` (the column whose date must be today), `HD_TEXT`, `COLS`, `SEND_HOURS`,
`SHEET_ID`, `TABS`, `TEST`.

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
and both run **twice a day** (`SEND_HOURS = [8, 14]`).

* **SFS** (`runSfsNotices`): To `lsabat@pldt.com.ph`, CC the three addresses in `SFS.CC`,
  subject `3MDA_SFS_VALIDATION_` + `MMMYYYY`. **LIVE since 2026-11-04.**
* **CV / CREDIT VALIDATION** (`runCvNotices`): the recipient set is **identical to SFS** — the
  owner confirmed on 2026-11-04 that both daily reports go to `lsabat@pldt.com.ph` on the To line
  with the same three CCs. Intro `For credit validation and approval.`, HD REMARKS line
  `FOR CREDIT VALIDATION AND APPROVAL`, subject `3MDA_CREDIT_VALIDATION_` + `MMMYYYY`.
  **Still `DRY_RUN = true`** — it goes live only after he reviews a `cvTestReport` copy.
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
* **AFD RESCHEDULE is the third report, and the first with three conditions.** The owner's rule,
  given on 2026-11-05: `FINAL STATUS` says `AFD - RESCHEDULE`, the `CLUSTER` column says 11, and
  the revisit day is typed by hand in `HD RECOMMENDATION` as `AFD - NOV 5`. So `AFD.STATUS` is a
  **list** (`['AFD','RESCHEDULE']` - both words must be in the same cell, because the dash and the
  spacing around it are not stable, and one long phrase would break on them), `AFD.WHERE` is
  `[{ COL: 'CLUSTER', IS: '11' }]` and `AFD.ON_DAY` is `'HD RECOMMENDATION'`, meaning only rows
  whose revisit **is the day the report runs** go in the mail. `collectReport_` applies all three.
  `cellEq_` compares on the digits when the two sides are not the same word, so `11`, `'11'`,
  `'11.0'` and `'CLUSTER 11'` all count as cluster 11, and a blank never does. `revisitDay_` reads
  `AFD - NOV 5`, `AFD - NOVEMBER 5`, `11/5` or a real date cell and returns month + day - the text
  carries no year and does not need one. When a row is tagged and in the right cluster but its date
  cell cannot be read, it is **named in the log** (`?? PLDT | SR 2314100005 | HD RECOMMENDATION =
  "AFD - TBD"`) instead of vanishing. `AFD.HD_TEXT` is empty, so the table shows his own
  `AFD - NOV 5` wording instead of a repeated line. Recipients mirror SFS exactly, `DRY_RUN` is on,
  and `afdProbe` / `afdPreview` / `afdTestReport` / `installAfdTrigger` are the dropdown entries.
  `AFD` is **not** in `ensureReportTriggers_`: unlike SFS and CV it will not appear on the schedule
  until he installs it. `afdPreview` also runs `diagnoseReport_` when the table is empty, which
  counts how many rows each condition removed - tagged but wrong cluster, right cluster but another
  day, and the rows whose date cannot be read.
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
  writes nothing and changes no setting. Run it before trusting `AFD.WHERE` / `AFD.ON_DAY`: if the
  counts are 0, the column name in the sheet is different and the log shows the real header.
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
  `SFS.DRY_RUN` is `false` and the report goes to `SFS.TO` + `SFS.CC`. **CV still has
  `DRY_RUN = true`** — it goes live only after he reviews a `cvTestReport` copy. Set either
  back to `true` any time to stop PLDT receiving it: while it is true every copy goes to
  `NOTICE.ADMIN_EMAILS` only, the CC list is ignored, and the subject gains `[TEST] `.
  `sfsPreview` / `cvPreview` log the exact body without sending anything and without touching
  the dedupe list.
* **`sfsTestReport` / `cvTestReport` produce a real copy on any day.** The live rules have
  0 rows until a new encode is tagged, so there would be nothing to look at — each one
  temporarily matches its own `cfg.TEST.STATUS` (`SFS.TEST` borrows `REENCODED`, `CV.TEST`
  borrows `ESCALATED`, at most `cfg.TEST.MAX_ROWS` = 12 rows in the table) and **forces that
  report's `DRY_RUN` on for the duration**, so a test can never reach PLDT even while the
  daily report is live. `STATUS`, `MAX_ROWS` and `DRY_RUN` are restored before it returns and
  the last log line prints what they went back to. Change `TEST` to try another status.
  Measured on the live sheet: 89 rows carry `FINAL STATUS = REENCODED`.
* Apps Script cannot schedule an exact minute — a day trigger fires somewhere inside
  each hour of `cfg.SEND_HOURS`, so this is "in the 8AM hour and in the 2PM hour", not
  8:00:00. Same limitation as the 8:00 AM agent notices. `installSfsTrigger` and
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
  — at most once per day, keyed by `CV_REVIEW_yyyyMMdd` in Script Properties.
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
* Putting this revision in is one paste and one `Ctrl+S`: then `installSfsTrigger()` and
  `installCvTrigger()` once each (four day triggers in total), `cvProbe()` to see the CVAA
  wording and row counts on the live file, `cvPreview()` for the body, and `cvTestReport()`
  for a real copy in his own inbox. `CV.DRY_RUN = false` — after he reads that copy — is the
  only line that makes PLDT receive it.
* The AFD mail is deliberately left off the schedule until he puts it there: `afdProbe()` to
  measure the cluster/date columns on the live file, `afdPreview()` for the body, `afdTestReport()`
  for a copy in his own inbox, then `installAfdTrigger()` (two more day triggers) and
  `AFD.DRY_RUN = false`. `runAfdNotices` is the handler, separate from `runSfsNotices` and
  `runCvNotices`, and it does not call `ensureReportTriggers_`.

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
