# 3MDA Logistics — agent dashboard

Single-file dashboard (`index.html`) published with GitHub Pages. Agents log in, see
their own PLDT / RED sales, and the owner can trigger the daily sales-status emails.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app: markup, styles and logic. Published as-is by GitHub Pages. |
| `AgentNotices.gs` | **Mirror only** of the Google Apps Script file that actually sends the emails. |

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
`[TEST for <agent>]`), `SEND_HOUR`, `MAX_ROWS` per section, `SHEET_ID`, `ADMIN_EMAILS`.

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
