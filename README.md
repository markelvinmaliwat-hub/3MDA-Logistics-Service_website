# 3MDA Logistics — agent dashboard

Single-file dashboard (`index.html`) published with GitHub Pages. Agents log in, see
their own PLDT / RED sales, and the owner can trigger the daily sales-status emails.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app: markup, styles and logic. Published as-is by GitHub Pages. |
| `AgentNotices.gs` | **Mirror only** of the Google Apps Script file that actually sends the emails. |
| `assets/mmmda-logo.jpg` | The logo attached to the signature of the PLDT SFS report. |

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
and `SFS.DRY_RUN`, `SFS.FROM`, `SFS.EXACT` for the PLDT report described below.

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

## SFS VALIDATION report to PLDT

`runSfsNotices` emails **`lsabat@pldt.com.ph`** (CC: the three addresses in `SFS.CC`) once a
day with every application tagged **`SFS VALIDATION`**, shaped like the owner's own manual
`3MDA_SFS_VALIDATION_OCT2026` mail: greeting, one-line intro, a black-bordered
`DATE | SUBSCRIBER NAME | SR | CSP REMARKS | HD REMARKS` table, `Thank you !`, his
three-line signature. The `PLDT` and `RED` tabs are read, never the `VALIDATORS` tab.

* **The rule is the owner's own words: the row belongs in the report once `FINAL STATUS`
  carries the SFS tag.** `SFS.FROM = ['FINAL STATUS']` and `SFS.EXACT = false`, so
  `SFS VALIDATION` matches whatever the spacing or case, and it also catches a longer wording
  typed straight into `FINAL STATUS`. `CSP STATUS` is not a source — it holds reasons
  (`DUPLICATE SUBS INFO`), not states.
* **There is no `HD REMARKS` column in the sheet** (measured by `sfsProbe` on the live file:
  PLDT has `CSP STATUS | CSP REMARKS | PAYMENT REFERENCE/ REMARKS | PAYMENT STATUS | FUSE
  STATUS | OFSC STATUS | HD RECOMMENDATION | FINAL STATUS`, 1,372 rows). The line
  `SFS VALIDATION - WITH UPLOADED DOCS` in his manual email is something **he types himself**,
  so `SFS.HD_TEXT` repeats it on every row. Set `SFS.HD_TEXT = ''` to read the real
  `HD REMARKS` / `HD RECOMMENDATION` cells instead.
* `sfsProbe` is how both of the above were decided, and it is still the tool to run if the
  wording ever changes. It sends and writes nothing. Per tab it logs the column names, the ten
  most common values of the four status columns, every value mentioning SFS with its row count
  (`>>`), **every column that ever contains the word SFS with its exact wording (`##`)**, the
  full contents of the two names from the owner's sample email, and how many rows the current
  rule would report. As measured on 2026-11-04 the live Aug-Oct sheet had **0** rows tagged
  `SFS VALIDATION`, so an automated run that day correctly sends nothing.
* **Which spreadsheet is read is its own switch.** `SFS.SHEET_ID` (`''` = the same file the
  agent notices use, `DATABASE AUG TO OCT`) and `SFS.TABS` (`[]` = `NOTICE.SALES_TABS`) let
  the report follow the owner's *current* file once Aug–Oct is closed, without touching the
  notices. `sfsProbe` prints which file and tabs it used, and `sfsStatus()` reports them too.
* Measured on the live Aug-Oct file (2026-11-04, `sfsProbe`): PLDT 1,374 rows, RED 303,
  `VALIDATORS` empty, and **no row anywhere in RED contains the word SFS**. The two names
  from the owner's manual email are `FINAL STATUS = REENCODED` (MAGILYN) and
  `CANCELLED - WITH EXISTING SR` (LORAINE) — the SFS tag is not applied in this file, so the
  report currently has 0 rows and sends nothing. Point `SFS.SHEET_ID` at the file where he
  actually types `SFS VALIDATION` and the same rule starts producing rows.
* Matched after normalising case and spacing; deduped by SR number across the two tabs,
  oldest first, capped at `SFS.MAX_ROWS`; `DATE` renders as `M/D/YYYY` like his email.
* **A day with no matching row sends nothing.**
* `SFS.DRY_RUN` must stay `true` until the owner has seen a real copy: while it is true the
  report goes to `ADMIN_EMAILS` only and the CC list is ignored, so PLDT receives nothing
  from a test. `sfsPreview` logs the exact body without sending anything.
* **`sfsTestReport` produces a real copy today.** The live rule has 0 rows until a new encode
  passes SFS, so there would be nothing to look at — this temporarily matches
  `SFS_TEST.STATUS` (`REENCODED` today, `SFS_TEST.MAX_ROWS` = 12 rows) instead, sends that to
  `ADMIN_EMAILS` only with `[TEST]` in the subject, and puts `SFS.STATUS` / `SFS.MAX_ROWS`
  back before it returns. Change `SFS_TEST` to try another status.
* Apps Script cannot schedule an exact minute — a day trigger fires somewhere inside
  `SFS.SEND_HOUR`, so this is "in the 8AM hour", not 8:30:00. Same limitation as the
  8:00 AM agent notices. `installSfsTrigger` creates (and never duplicates) that trigger
  and prints what it did — schedule, rule, file, tabs, and whether `DRY_RUN` is still on —
  to the Execution log, because the function's return value is not shown there.
* `SFS.SR_LINK`, if set, turns each SR into a link to that number's page. Leave it
  empty unless the link is safe to hand to PLDT.
* **The MMMDA logo is part of the signature** (`assets/mmmda-logo.jpg`, 1280x1255). Apps
  Script fetches it from the published site and attaches it as an inline image
  (`<img src="cid:mmmda-logo">` + `inlineImages`), so it still shows in mail clients that
  block pictures loaded from the internet. If the fetch fails the email is still sent with
  the picture linked by URL instead, and `sfsPreview` logs which of the two happened
  (`attached inline` / `linked only`). Set `SFS.LOGO_URL` to `''` for no picture at all,
  `SFS.LOGO_ABOVE = false` to put it under the three lines, `SFS.LOGO_W` / `LOGO_H` for size.
  This logo is only in the PLDT report — the agent notices are unchanged.
  Replace the picture by overwriting `assets/mmmda-logo.jpg` and pushing.
* To change the columns, edit `SFS.COLS`; the header name is mapped to the row field in
  `CELL_` (`Date, Subscriber, SR No., Plan, Status, Remarks, Agent, Team Leader, CSP Status`).
* A new daily email needs no web-app redeploy — triggers run **Head**. Only a new `/exec`
  action would need Deploy > New version.

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
