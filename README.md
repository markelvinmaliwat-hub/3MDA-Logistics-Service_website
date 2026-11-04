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

* **Which column carries the tag is configurable, because it is not settled yet.**
  `SFS.FROM` is the list of columns to test (default `['FINAL STATUS', 'HD RECOMMENDATION']`)
  and `SFS.EXACT` picks exact match (`true`) or "contains" (`false`). The rows in the
  owner's sample email are `HD REMARKS = SFS VALIDATION - WITH UPLOADED DOCS`, so a contains
  match that includes `HD REMARKS` is what reproduces his list. Run **`sfsProbe`** in Apps
  Script and read the Execution log: it lists every column, the ten most common values of
  `FINAL STATUS / HD REMARKS / HD RECOMMENDATION / CSP STATUS`, every value mentioning SFS
  with its row count, the full contents of the two sample names, and how many rows the
  current rule would report. Set `SFS.FROM` / `SFS.EXACT` from that output, not from a guess.
  `CSP STATUS` is deliberately not a default source — it holds reasons (`DUPLICATE SUBS INFO`),
  not states.
* Matched after normalising case and spacing; deduped by SR number across the two tabs,
  oldest first, capped at `SFS.MAX_ROWS`; `DATE` renders as `M/D/YYYY` like his email.
* **A day with no matching row sends nothing.**
* `SFS.DRY_RUN` must stay `true` until the owner has seen a real copy: while it is true the
  report goes to `ADMIN_EMAILS` only and the CC list is ignored, so PLDT receives nothing
  from a test. `sfsPreview` logs the exact body without sending anything.
* Apps Script cannot schedule an exact minute — a day trigger fires somewhere inside
  `SFS.SEND_HOUR`, so this is "in the 8AM hour", not 8:30:00. Same limitation as the
  8:00 AM agent notices. `installSfsTrigger` creates (and never duplicates) that trigger.
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
