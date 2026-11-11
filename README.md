# 3MDA Logistics — agent dashboard

Single-file dashboard (`index.html`) published with GitHub Pages. Agents log in, see
their own PLDT / RED sales, and the owner can trigger the daily sales-status emails.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app: markup, styles and logic. Published as-is by GitHub Pages. |
| `AgentNotices.gs` | **Mirror only** of the Google Apps Script file that actually sends the emails. |
| `DaanMail.gs` | **Mirror only** of the new Apps Script file that receives the dashboard's `📤 SEND` and mails the map picture. Needs pasting + one line added to `doGet` + a New version deploy. |
| `AorProbe.gs` | **Read-only scout**, runs only when he chooses `aorProbe()` in the dropdown. Answers the 2026-11-11 ask for a NEW `NOT AOR` email: does a CLUSTER tab exist, can it name each row's cluster from **CITY + BRGY together**, and how many clusters/rows the new mail would carry. Sends nothing, writes nothing, needs no deploy. |
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
`AFD29`): `DRY_RUN`, `TO`, `CC`, `FROM`, `FROM_ANY` (true = the columns in `FROM` are
**alternatives** and a hit in any one of them qualifies the row; without it the first non-empty
column wins and the rest are only fallbacks — that is how CV reads his two columns, see below),
`STATUS`
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

## Remark alert — an email the moment a remark is saved

Requested by the owner on 2026-11-06: *"kada may mag lalagay ng remarks sa [the FOR PAYMENT
modal] ay ipadala ito sa email ng mga nakakasakot ng trabaho na iyon para aware sila na may
binigay na remarks ang ahente"*. He named the recipients himself — **admins only, never the
agents**: To `ilanoandong@gmail.com`, CC `juliean.rjab@gmail.com` + `markelvinmaliwat@gmail.com`.

It is not a report and it has **no trigger and no schedule**. `logWrite_` calls `remarkAlert_`
right after it appends a row to `Payment_Updates`, so the mail is a side effect of the save the
dashboard already makes. **`REMARK.DRY_RUN` is `false` since 2026-11-06** — he asked *"ano na ang
dapat ko gawin upang maging live na ito"*, which is the go. Until that flip every copy was a
`[TEST]` to `NOTICE.ADMIN_EMAILS`; run `clearRemarkAlerts()` once so the signatures built while
testing cannot swallow the first live alert.

* **A save with no remark mails nobody.** Choosing an action alone is not news.
* **The same sale does not mail twice.** The modal saves automatically, so one person picking an
  action, typing a remark and fixing a typo writes several rows in seconds. The alert remembers
  the `action + date + remarks` signature of what it last mailed per sale in Script Properties
  (`REMARK_ALERT_LAST`, pruned after 3 days, capped at 400 sales) and stays quiet on an
  identical re-save. A genuinely different remark is still held for `REMARK.GAP_MIN` = 15
  minutes, then it mails.
* **`REMARK.MAX_PER_DAY` = 40** and it refuses to send when the Gmail daily quota is under 5 —
  the 8AM agent notices and the PLDT reports outrank it.
* **A mail error never breaks the save.** The row is already written when the alert runs, so the
  dashboard is still told `success: true`; the failure is only a `REMARK | the save succeeded,
  the alert did not: …` line in the Execution log. A failed alert is *not* remembered, so the
  next save on that sale tries again.
* **No logo.** `reportLogo_` costs a `UrlFetchApp` call, and this runs inside the request the
  agent is waiting on.
* **`remarkDate_` prints the payment day as `11/8/2026`.** The modal hands over an
  `<input type="date">` value, so a fresh save says `2026-11-08` while the same day read back
  from the tab is a Date that `cell_` says `2026-11-08 00:00:00` — the owner saw both in one day
  (the live mail and his `remarkPreview`). Both become `m/d/yyyy`, the reports' format.
* Dropdown entries: `remarkProbe()` (read-only census of `Payment_Updates` — how many rows carry
  remarks, how many a fresh save would alert on, and each reason for staying quiet),
  `remarkPreview()` (logs the exact body, sends nothing, writes nothing), `remarkTestReport()`
  (a real `[TEST]` copy in his inbox; it forces `DRY_RUN` on for the run, restores it, and does
  **not** write the throttle state), and `clearRemarkAlerts()` (deletes only the
  `REMARK_ALERT_*` keys — run it once after flipping `DRY_RUN` to `false`, because the state
  built while testing would otherwise swallow the first live alert).

## Sales start month — `FROM`

**Currently OFF (`const FROM=''`) — the dashboard counts the whole database.** The owner turned it on
and then reversed it on 2026-11-06, in that order: first *"mag umpisa ng benta simula november, wag na
isama ang ibang months na lumipas"*, later the same day, after seeing the board drop to 66 rows,
*"mali ang pagkaka intindi mo ibalik mo sa dating data ang dashboard buong database padin"*. The
mechanism stays in the file because it is one constant; only the value changed.

It lives at the top of the data layer and is applied inside `prep()`, so it is already in force before
any view, KPI, ranking, month dropdown or the FOR PAYMENT queue reads the rows — there is no second
place to remember, and nothing about the five PLDT reports depends on it.

* **The VALIDATORS tab is deliberately not filtered.** His sentence was about *benta*; the validator
  list is a different ranking and zeroing it would be collateral damage.
* **Rows with no parseable DATE are kept** (`!r._m ||`), because an undated row is not a *past* month
  and silently dropping it would lose a sale rather than an old one.
* **If a tab has nothing at or after `FROM`, the tab is shown whole** and the header says so. That
  fallback is what kept the board readable for the half-day the rule existed with no November rows in
  the file: measured 3:52 PM the same day, `PLDT` had **66 rows dated 2026-11** (1,351 older) and
  `RED` had **none of 303**, so `FROM='2026-11'` would have shown 66 rows on one tab and the whole RED
  tab anyway — which is exactly the confusing half-filtered board he sent back.
* **`FROM='2026-11'` is the value that counts November forward again** — set it and every earlier
  month leaves the views. Mixing `2026-10` + three `2026-11` + one `2026-07` leaves 2 rows shown, 2
  dropped; that is the tested behaviour, not a guess.

## Client reminder — one tap, sent from the phone holding it

Requested 2026-11-06 after the four queues went live: the *customers* owed a nudge, not only the
staff. He asked first about texting agents, then about texting the clients directly, then set the
filter that decided everything: *"para walang cost"*. Apps Script cannot send SMS — there is no SMS
API in it — and mass-mailing clients from his own Gmail would spend the ~100/day consumer quota that
the 8AM notices, five PLDT reports and the remark alert already share. So nothing is automated here,
and that is the point.

* **The client's number is `CBR 1`** (with `CBR 2` as the spare), confirmed by the owner on
  2026-11-06: *"oo, i-CBR 1 ang client number"*. Measured on the synced snapshot: **40 FOR PAYMENT
  rows, all 40 carrying a usable `CBR 1`, 39 distinct numbers, 0 in the RED tab**. `CONTACT NUMBER`
  is a header the SFS report still expects but the sales file does not have.
* **`REMNUM` accepts what the sheet actually contains** — `639346368975`, `0934…`, `934…`,
  `+63 934 636 8975`, `0063…` and the `639244027011.0` a numeric cell can stringify to — and returns
  the number in the form the owner asked for: **local, `0`-prefixed, no `63`** (`09346368975`, shown
  as `0934 636 8975` by `remFmt`). It returns `''` when the value is an account number, a landline
  or a status like `NOT WIRED YET`; a row with no number shows *no number*, not a dead button.
* **The wording is his, translated to English on request.** He dictated the Taglish (`Hi po, si
  (first name lang ilalagay) po galing PLDT Home 3MDA Cavite. May pending for payment pa po sa
  approved account 0408222877 ninyo. Makakapag-settle na kaya tayo? Salamat po.`), said
  *"gawin itong english at correct grammar ito ang gamitin na mensahe"*, corrected it twice more with
  *"paki correct ng grammar"*, and on the same day pasted **PLDT's own welcome SMS** as the style to
  follow — *"ganito ang sample na message na ilagay, wag nalang lagyan ng amount pero indicate padin
  na please pay the initial fee"*. So `REMTXT` renders:
  `Hi Arnel, this is Kenneth from PLDT Home 3MDA Cavite. Your approved account 0408222877 has an
  unpaid initial fee. Please pay it to secure your service. Thank you.`
  The payment channels were in that sentence until 2026-11-06, when he cut them with
  *"through Maya or Bayad Center to remove this to the message"* — so the text no longer tells the
  client *where* to pay, only that the fee secures the service.
  Three things are load-bearing and came from his own sentence, not from me: **Cavite** is in the
  identity line, the account is called **approved**, and only the **first name** is used — `remFirst`
  takes the first word of `SUBSCRIBER NAME`, or everything after the comma when a cell is stored
  `SURNAME, FIRST`, and Title-Cases every word of it because the sheet is ALL CAPS (`X, LOVELY JOICE`
  reads *Lovely Joice*, not *Lovely joice*). `po` is gone with the
  translation; if he wants it back, that is a one-word edit.
* **The agent signs it, not the owner.** On 2026-11-06 he settled the last open question about this
  feature with five words — *"ang agent mismo ang mag tetext"* — so the `This is …` name is **the
  person holding the phone**, never Mark's: `remFirst` reads the signed-in agent (`ME.name`, which is
  the `AGENT NAME` looked up from their own agent code at login) and falls back to the row's
  `AGENT NAME` when nobody is signed in. If both are blank the line degrades to `this is your agent
  from PLDT Home 3MDA Cavite` rather than shipping `this is  from`. The subscriber moves from the
  identity slot to the greeting, which is where a first name belongs when someone else is speaking.
  Measured on the 40 FOR PAYMENT rows: **all 40 have an `AGENT NAME`**, 18 distinct agents across
  them, so the fallback path is insurance and not today's behaviour.
* **No amount, and no due date either — the second one is not a choice.** He removed the `Php 999.00`
  himself. PLDT's sample also carries `on or before 10/27/2025`, but measured across the 40 FOR
  PAYMENT rows there is **no due-date column to read**: `POSTED DATE` is empty on **40 of 40** and
  the only filled date is `DATE`, the day of the sale, which would tell a client to pay by the wrong
  day. So the sentence says *to secure your service* and stops there. If he ever adds a due-date
  column, that is the place to put it back.
* **Segment cost, re-measured after every wording change.** Dropping the channels took the message
  from 187–201 characters to **158–172**, which is **7 of 40 rows back inside a single segment and
  33 still concatenated** — the sender's and the client's names decide which side of 160 a row lands
  on. Measured as the signed-in agent instead of the row's agent, the spread is 160–170 (1 of 40 in
  one segment). All of it is free on an unlimited-text load; the number is here so nobody has to
  wonder whether the wording silently grew. The sheet stores the account without the leading zero and
  the client reads it with one on the bill, so `remAcct` prefixes `0` **only when it is missing**
  (never doubles; an empty cell still renders `-`).
* **A tap does not send, it hands over.** On a touch device (`pointer: coarse`) the button navigates
  `sms:09346368975?body=…` and the phone's own Messages app opens with everything filled in; the
  human presses Send, so the carrier sees a person messaging a person and the unlimited-text load is
  what pays. On a laptop the same tap copies `0934 636 8975 — <message>` to the clipboard
  (`execCommand` fallback when the Clipboard API is blocked). The Remind cell also prints the number
  under the button, in the same `0934 636 8975` shape, so he can see which `CBR` he is about to text.
* **Every tap answers on screen.** A laptop tap used to only write to the clipboard, and the owner read
  that as a broken button (*"walange nanbgyare pagka pindot ko ng remind"*, 2026-11-06) — the only sign
  had been a small grey *Reminded 11/06 15:39* under the button. So the handler now also raises a card
  at the bottom of the screen (`toast` + `remCard`) saying which path it took, the number, the exact
  text, its character count and segment count, with **Kopyahin ulit** and **Isara**. On a phone the card
  appears alongside the SMS app, which means a `sms:` scheme the browser refused to open is no longer
  silent either — the text is visible and copyable. `closeM()` hides the card.
* **`mm_rem` in localStorage** records every reminder (key, time, agent email, client, number, and
  whether the SMS app opened or the copy was blocked), the button becomes **Remind again** and the row
  shows *Reminded 11/06 09:41* — so nobody gets chased twice on the same phone. `logEv('CLIENT
  REMINDER', …)` puts the same fact in the shared activity log whenever the dashboard is open as a
  signed-in agent.
* **Deliberately absent:** no queue, no Android bridge app, no trigger, no `MailApp`, no sender ID
  registration. Those are the options that would make it automated, and each one either costs money,
  risks his number, or needs a phone parked on a shelf.

## Phone-first FOR PAYMENT cards

Asked 2026-11-06: *"maari mo bang gawin ang number 4 na phone-first layout para sa agents (karamihan
sa kanila phone lang ang gamit)"*. The modal was a six-column table, which on a phone meant
side-scrolling to reach the **Remind** button — the one thing the agents actually press.

* **Keyed to `html.vm`, not to screen size.** The page already has a view switcher (`#vsw`, auto when
  `Math.min(screen.width,innerWidth)<=900`, stored in `localStorage.mm_view`), so every new rule is
  `html.vm .pay …`. That respects his own switch: an agent on a laptop who taps *Switch to Mobile view*
  sees the cards, and a phone in *Web view* still sees the table.
* **CSS over the same DOM.** The rows are still `<tr>/<td>` with `display:block`, so every existing
  handler selector (`.po`, `.pd`, `.pm`, `.pt`, `.brem`, `.rms`, `tr[data-i]`) keeps working — the JS
  contracts were not touched. Labels come from `td[data-l]::before{content:attr(data-l)}`, and the
  account number became its own `<td class="bl acc">` so the column count still matches `<thead>`.
* **Touch targets** 44–48 px (`select`/`input` 44, Remind 48, full width), the modal list scrolls to
  `72vh` on mobile, and the long English note is `.onlyvw` while the short Taglish one is `.onlyvm`.
* **A search box** (`#pf`, `.pfwrap`, mobile-only) filters the up-to-200 visible rows by subscriber
  name, account **with or without the leading 0**, and the number both raw (`09625170696`) and as
  printed (`0962 517 0696`); nothing matched shows *Walang match sa inilagay mo.* Measured on the 13
  live November FOR PAYMENT rows: name → 1, raw number → 1, spaced number → 1, `409565506` → 1,
  `0409565506` → 1, junk → 0.
* **Verified in a real browser, not by eye.** Computed styles on the rendered modal: `tr` is
  `display:block`, radius 14 px, Remind 48 px, inputs 46 px, `thead` `none`, the `::before` label
  reads `Action`, `#pf` is `block`. I could not screenshot it (no visible surface in this browser),
  so the *look* is still his to confirm on a real phone.

## LONG/LAT - CAFAC tab sa login header

Asked 2026-11-07: *"sa bandang LOG IN AT FACILITY CHECKING lagyan ng bagong portion at pangalanan mo ito na
LONG/LAT - CAFAC"*, then on seeing the first build: *"baguhin ang mga naka paloob dito gawin na SUBSCRIBER NAME
at CAFAC tapos sa pag type ng cafac gawin ito na searchable lang ang CAFAC habang nag type kapag na click ang
cafac na hinahanap saka ilagay ang detalye kung available at ilan ang ports at kung saan ang location nito wag
na mag lagay ng kagaya ng nasa litrato"*, then on two screenshots of the intended layout: **"GANYAN LANG ANG
ITSURA"** and **"Status, Available slots, Site / subdivision LANG ANG ILALAGAY SA DETAILS"**, then on 2026-11-08:
**"NGAYON MAG LAGAY NG SW MAPS + GOOGLE MY MAPS"**, and on that first maps build **"mali ang map"** - he wants the
*road* pinned, point by point, so the measurement is exact. So it is the third pill in `.hp` (`#t1` LOG IN, `#t2`
FACILITY CHECKING, `#t3` LONG/LAT - CAFAC): a lookup first, then a map the agent traces the route on.

* **Layout (his drawing):** a two-column grid (`#llp .llgrid`). Left column, stacked: `SUBSCRIBER NAME`
  (free text - he said the name is not in the database *"kasi ito lang ay bago lang collected application"*),
  then `CAFAC`, then the type-ahead list, then the count/no-match message. Right column: one bordered
  `.fbox` headed **CAFAC DETAILS**. At 735 px the columns stack (`@media(max-width:900px)`); the side-by-side
  geometry was measured with the media query temporarily overridden (left 300 px, box starts at x=346, no
  right overflow) because the in-app browser surface could not be screenshotted.
* **The type-ahead** scans the NAP codes inside the facility blob (`FR[].n` - 56,685 entries) for a
  case-insensitive substring, shows the first 60 as tappable rows with `barangay · city` and
  `<available>/<equipped> available` (red `FULL` when none), and says how many more matches exist. Measured
  8 ms per keystroke on the live build, so no debounce is needed. `Enter` picks the first row.
* **What the details box is:** clicking a CAFAC writes exactly three values through the same `kv()` grid Facility
  Checking uses - **Status** (`AVAILABLE` green / `FULL` red), **Available slots**, **Site / subdivision** - and
  nothing else (no summary line, no LCP/Exchange/Utilization/Equipped slots/Site address/Barangay/City/Type/FA
  date). The coordinates are deliberately **outside** it, in their own third box below the grid, so that rule
  still holds.
* **MAPA NG DAAN · CAFAC &rarr; BAHAY (2026-11-08, replacing the first SW Maps box):** the third bordered box
  `.llmap` is now an in-dashboard Leaflet map he can trace on. He rejected the pin-only version - *"mali ang map
  nais ko gawin ay mag lagay ng mapa kung saan puwede mag PIN si agent simula sa cafac papunta sa bahay ni client
  pero hindi lang basta pin kundi ipipin nila yung pinaka daan papunta doon para eksakto ang sukat"* - and chose
  **"A puro manual, B dalawang hakbang"**, then came back for more: *"MAARI MO BANG GAWIN NA MAS MADALI PARA SA
  AHENTE NA MAG LAGAY NG PIN NG CAFAC AT PIN NG BAHAY AT PADALIIN DIN ANG PAG ZOOM IN AT ZOOM OUT NG MAP BIGYAN MO
  DIN NG MABILIS AT MADALING PAG TRACE NG DAAN PAPUNTA SA BAWAT PIN YUNG ACURATE NA MISMO"* - and chose
  **"A: Auto-sunod sa kalye"**, so the line and the measurement now follow the **actual street geometry** from the
  free OpenStreetMap routing server (step 2, sharing with the agents, is still waiting on his approval of the look).
  Tool row above the map: `① CAFAC`, `② Bahay ng client`, `③ Punto ng daan`, `↺ Bawi`, `⤢ I-fit`,
  `✖ Burahin lahat`, `💾 I-save ang daan`, `🗑 Tanggalin ang naka-save`; a second row below it `➕ Zoom in`,
  `➖ Zoom out`, `🎯 Sa gitna ng mapa`, `✛ Ipakita ang gitna`, `📌 ① mula sa naka-save`; then `🗺️ Mapa` / `🛰️ Satellite`
  and the KML/GPX/Google buttons.
  * **Auto-sunod: ① &rarr; ② &rarr; ③④⑤ without touching a tool button.** `nextTool()` returns `start` while
    there is no CAFAC pin, `end` while there is no house pin, then `road` forever, and `putPin()` re-arms it after
    every tap - so the agent's whole job is **tap the CAFAC, tap the house, tap each likuan**. The same helper serves
    the tap, the `🎯` center button and the `📌` saved-pin button, so all three advance in the same order. The ①
    tap also **auto-saves** the CAFAC pin to `mm_cafac_ll` on the spot (no `💾` press), which is what makes
    `📌 ① mula sa naka-save` able to drop it back later.
  * **Ang daan = totoong kalye, OSRM public demo** `router.project-osrm.org/route/v1/driving/<lng,lat;…>?overview=full&geometries=geojson` -
    **no key, no billing, CORS `*`**, measured HTTP 200 from his `github.io` origin (752 ms / 142 points / 1,429 m;
    a 3-coordinate request answered in 265 ms and `routes[0].legs[i].distance` summed exactly to `routes[0].distance`).
    Traps measured the hard way: `/match/v1/driving` &rarr; **400 NoMatch**, and asking for `annotations=geometry`
    or `legs=true` &rarr; **400 InvalidQuery** (the legs arrive free with `geometries=geojson` anyway). **OSRM takes
    `lng,lat`** while internal points are `[lat,lng]`, so `sigOf()` is the single place that flips the order for both
    the URL and the dedupe key. One request per **changed** set of taps (`oSig`), throttled to 1 req/s (`oLast`),
    60 s cool-down on a 403/429, and a `oSeq` guard so a slow answer to an old tap-set cannot paint over a new one.
  * **Honest fallback: "hop".** If the routing server cannot be reached the readout falls back to the straight
    hops between his taps and *says so* - the label after every distance is `kalye` or `hop`, and the total line
    reads either *"(sunod sa totoong kalye, N punto sa pagitan)"* or *"(hop mula sa mga tap mo, N punto)"*. The
    failure message tells him to keep tapping and press `⤢ I-fit` to retry, because `fit()` calls `osrm()` and the
    failure path clears `oSig` (without that reset, re-tapping looked dead). Verified with a rejecting `fetch` stub:
    hop message &rarr; `⤢ I-fit` &rarr; 1.43 km kalye.
  * **The `🔍 Hanapin` search box is GONE (2026-11-08, `bf29952`), on his word: *"alisin na ang hanapin"*.** It had
    been what he asked for first (*"lagyan ng search bar sa maps upang mas madali makita ang location na hinahanap
    dito"*, then **"B: Nominatim lang"** over a local-first index), but with the barangay auto-zoom on pick plus the
    `➕ ➖ 🎯 ✛` buttons there was nothing left for a free-text geocoder to make faster, and it was one more thing to
    explain to an agent. Removed: `#rtq`, `#rtgo`, `#rtqx`, `#rtres`, `listRes()`, `goRes()`, `search()`, `HIT`,
    `lastQ`, the `.llsrch`/`.llres`/`.llr` CSS and the `LL.search/hits/names/go/clr` test API. **Kept: `NQ`, `nom()`,
    `place()`, `zoomOf()`, `chain()`** - the barangay auto-zoom is a Nominatim user and still needs them. The three
    messages that used to send the agent to `🔍 Hanapin` now send him to *drag the map* or the manual `LONG/LAT` box.
    Measured after the cut (file:// build, same 2 taps as before): pick &rarr; **z15**, `2.95 km ang daan (kalye)` vs
    `411 m tuwiran`, and **exactly 2 requests** - 1 Nominatim + 1 OSRM - i.e. the auto-zoom did not lose anything.
    Panel is now **21 buttons** (was 24), min height 44 px, `scrollWidth == clientWidth == 735 px`, no console
    errors. The traps below still belong to `nom()` and are why it is shaped the way it is:
    * **`limit=3`, not `limit=5`.** On his `github.io` origin, at the same second and the same query,
      `q=ANABU%202-A%20IMUS&limit=3` answered **HTTP 200 / boundary `Anabu II-A, Imus, Cavite, 4103`** while
      `...&limit=5` died with **`TypeError: Failed to fetch` in 10 ms** - the refusal is the *bigger* answer, and a
      browser cannot read a refused answer at all. **The parameter, not the search, is what gets refused.**
    * **`bounded` is a trap:** `&viewbox=<w,n,e,s>&bounded=0` fails the fetch outright (the WAF answer carries no
      CORS header), `viewbox` alone returns 200/1 hit, `bounded=1` returns 200 but 0 hits because it clips to the
      visible box - so `vb()` stays bias-only.
    * Because `msg`/`m2` wrote `textContent`, `<b>` in a message used to render as literal markup. Both go
      through `h()` = `esc()` then re-allow only `<b>`/`</b>`, so agent-typed names stay inert.
  * **Picking a CAFAC now zooms to the barangay written in the facility data** (he asked: *"gamit ang cafac zoom in
    agad ito sa barangay na naka lagay tapos hayaan na ang agent mag Pin... lagyan ng measurement kung gaano kalayo
    at lagay ang longlat ng PIN ng cafac at longlat ng pin na bahay"*). `pick()` calls `toBgy()` only when that CAFAC
    has **no** saved pin; `toBgy` builds at most 4 queries from `b`/`c`/`s` (`"ANABU 2-A IMUS"` &rarr; `"ANABU 2-A"`
    &rarr; subdivision+city &rarr; `"IMUS Cavite"` - `BGY `/trailing ` CITY` stripped by `cleanB`/`cleanC`, and a
    bare-number barangay like `3` is not queried at all) and walks them at OSM's 1 req/s. It stops at the **first**
    answer that is either a `category:'boundary'` polygon or a `category:'place'` whose **leading** name is the
    barangay; a place that is merely *inside* the barangay (`ANABU 2-A` answers with `Plaza Homes, Anabu II-A, Imus` -
    a subdivision, not the polygon) is remembered but the remaining queries still run, so the polygon wins if it
    exists. Only when every query is spent does it fall back to the place, then to a POI, and the wording changes
    with each tier (`(BND)` / `(PLACE)` / `(POI)` / `(LAAS)` in the `MAP BARANGAY` log event). `place()`
    fits the polygon with `M.fitBounds(L.latLngBounds(...),{animate:false,maxZoom:16})` when the box is under 0.2 deg,
    otherwise `setView` at `zoomOf()` (city 12 / municipality 13 / boundary 15 / way 17).
    * Measured with a counting wrapper around `fetch`: **1 OSM request per pick** in the good case, live on his
      `github.io` origin - `IMULP012NP1` &rarr; *"Izoom sa barangay na Anabu II-A, Imus, Cavite (zoom 15)"*,
      center `14.38449, 120.93688`, 8/8 tiles painted and **0 stuck at opacity 0**, no console errors,
      `LIVE V9 OK: 2459 records`.
    * **No commas in the query - measured, not guessed.** From his `github.io` origin,
      `q=ANABU%202-A%2C%20IMUS` died with `TypeError: Failed to fetch` in **18 ms** while
      `q=ANABU%202-A%20IMUS` on the same page returned **HTTP 200 / 1 hit in 755 ms** (`IMUS Cavite` &rarr; 200/1 too;
      both measured at `limit=5`, before the row-count finding above made 3 the setting).
      `curl` gets 200 for *both*, so the search is not the problem - only the **CORS answer** to the comma form is
      usable by a browser. `nom()` therefore rewrites `%2C` &rarr; `%20` before the request, which also protects an
      agent who types `Anabu 2-A, Imus` into `🔍 Hanapin`.
    * **A refusal must cost ONE request, not four.** Testing this feature is itself a burst: after ~10 geocode
      requests inside a minute the endpoint answered `403 Forbidden` (`Server: Varnish`, `Retry-After: 0`) even to
      curl, and it lifted again under a minute later. In a browser that same refusal arrives as
      `TypeError: Failed to fetch` - **not** as a 403 - so status-code-only back-off never engaged. Three defences
      now: `fetch(...,{cache:'no-store'})`, because a cached headerless 403 used to be replayed to every later
      attempt and looked like a permanent break; a cool-down armed by **any** failed request (`blockT` - 30 s for a
      refused/fetch error, 65 s for a real 403, and it is skipped when `navigator.onLine === false` so an offline
      phone is told the truth); and `chain()` continues to the next query after a refusal but only while the
      cool-down is cold, so the worst case is 1 request. Verified by replacing `window.fetch` with a rejecting stub:
      first pick &rarr; `tries=1` &rarr; *"Hindi naabot ang OSM search (Failed to fetch) - hintayin ng isang minuto,
      pagkatapos pindot ulit ang CAFAC."*; second pick inside the window &rarr; `tries=0` &rarr; the same line with
      *"(paulit-ulit na hiling)"*, i.e. it never touches the network while blocked.
    * **The message only claims a barangay when the match really is it.** `tama` = not a POI fallback **and** every
      alphabetic token of the stored barangay appears in the **leading** component of OSM's `display_name` (before the
      first comma). Both halves are earned: `ANABU 2-A` is written `Anabu II-A` in OSM (a literal compare would cry
      wolf on the best case), and the space query once answered
      `Plaza Homes, Anabu II-A, Imus` - a subdivision *inside* the barangay, zoom 16, correct ground but a wrong claim,
      so it now reads *"Hindi eksakto ang pangalan ng barangay na **ANABU 2-A** sa nakita..."*. Measured:
      `IMULP012NP1` &rarr; *"Izoom sa barangay na **Anabu II-A, Imus, Cavite** (zoom 15)"* green, center
      `14.38449, 120.93688`, 8/8 tiles at opacity 1. `ALFLP213NP1` &rarr; `Kaytitinga III, Alfonso` z13.
      `ALFLP03NP1` (`BGY 3` - no name to search) &rarr; red, so the agent is never told a town-wide view is his CAFAC.
      `logEv('MAP BARANGAY',...)` records the query that landed plus the tier marker above.
    * **Why this matters for his data (measured over all 15,999 CAFAC rows):** 15,164 (94.8%) name a barangay that can
      be searched, 835 (5.2%) hold only a bare number (`BGY 2`, `BGY 3`) and 0 are blank; the distinct
      `BRGY|CITY` pairs total **917**. The numbered ones get the honest warning above, not a wrong zoom.
  * **What is under the map is now a stack of cards, not a list of sentences** (2026-11-08, `0089d61`..`4c4d5e1`).
    He pointed at a GCash screen - icon in a circle, label, bold value on the right, and a button that is not
    `Book` - and said *"gawin na ganyan itsura ng ibaba kaso ang nakapaloob ay itong mga ito na detalye dagdagan ng
    NODE na gamit na cafac tapos imbis na book gawin na send dahil balak ko gawin na isesend ang screenshot ng mapa
    na dadaanan papunta sa email ng admin"*, then, on where to put a second map, chose **V1 - the mini-map inside
    the summary card** (*"piliin ang V1"*). So `#rtrow` is `.rtcard` rows (`card(ic,t,s,v,v2)` builds them):
    **`CAFAC → BAHAY`** (`.rtcard.sum`, red left border, 104x78 mini-map at its left, sub-line
    `sunod sa totoong kalye · N likuan · tuwiran X m · lumibot ng Y m`, value = the road distance),
    **`🏪 NODE — CAFAC na gamit`** (value = the picked code, sub = `ANABU 2-A · IMUS` from
    `all().find(o=>o.c===picked)` - `cleanB(o.r.b)` + `cleanC(o.r.c)`; **not** `FR[].n`, which is an array of
    `[code,…]` pairs), then `🔵 PIN NG CAFAC`, `🏠 PIN NG BAHAY` (value = `LONG` to 6 decimals, `LAT …` as the small
    second line - still his SW Maps order), and under the caption `ANG DAAN PIN BY PIN — SUKAT NG BAWAT LIKUAN` one
    card per leg (`📍 CAFAC → 1 / kalye · LONG … · LAT … / 3.24 km`). The three states that used to be sentences are
    now cards too: `Kulang ang bahay ng client` / `Kulang ang CAFAC`, and `Wala pang punto` when nothing is tapped.
    If the CAFAC end is not tapped but that CAFAC has a saved pin, the card reads
    `PIN NG CAFAC (naka-save)` with the saved `LONG`/`LAT` in it.
    Measured live on his `github.io` origin (`IMULP012NP1`, 2 taps, 1 likuan): **6 cards**, `3.50 km ang daan`,
    `tuwiran 412 m · lumibot ng 3.09 km`, `NODE … ANABU 2-A · IMUS`, legs `CAFAC → 1 = 3.24 km` and
    `1 → BAHAY = 263 m`.
  * **`📤 SEND` (`#rtsend`) makes a real PNG of the map, free, with no library** - this is the answer to his
    *"balak ko gawin na isesend ang screenshot ng mapa na dadaanan"*. `shot(w,h)` draws onto an offscreen canvas:
    the tiles **already loaded in the visible map** (so 0 extra requests), the OSRM line `RG` when there is one,
    numbered dots (1 = CAFAC blue, waypoints green, 2 = bahay red) and a caption `IMULP012NP1 · z16 · 2.97 km`.
    `sendShot()` renders 640x420 CSS px (800x525 device px at dpr 1.25) and then: `navigator.share({files:[File]})`
    when the phone can share a file - which is the path that reaches Gmail - else `<a download>` of
    `daan-<CAFAC>.png`. **The page sends no mail itself**: the admin address and the wording are his, so the message
    after a download is *"Na-download ang daan-IMULP012NP1.png — i-attach ito sa email ng admin."*
    Measured: `LL.shot()` &rarr; **619,874-char PNG**, and the downloaded file 464,889 bytes that really shows
    Imus streets, the red routed line and both pins.
  * **Two traps, both invisible to every check I had, both found by looking at the PNG itself:**
    (1) **`crossOrigin:true` is required on BOTH tile layers** (`517dce1`/`533eefa`). Without it the tile `<img>`
    taints the canvas and `toDataURL`/`toBlob` throw `SecurityError: Tainted canvases may not be exported`.
    Measured before the fix: the download was 28,571 bytes and the map was a flat grey field. After it, the same
    shot is 464,889 bytes of real streets - and Esri answers the CORS request too (4/4 tiles loaded, 0 errors,
    `crossOrigin="anonymous"` on both layers), so `🛰️ Satellite` did not regress.
    (2) **A tile's screen offset is not a world pixel.** `nw` is the route bounds in world pixels at the current
    zoom - about a million - so `(t.left-mr.left-nw.x)*k` put every tile a million pixels off the canvas and the
    picture came out with the line and the pins on empty grey **without throwing anything**. The fix is to anchor on
    the container itself: `o0=M.project(M.containerPointToLatLng([0,0]),z)` then
    `dx=o0.x+(t.left-mr.left)-nw.x`. Nothing in the console said so; only the image did.
    * So `shot()` is now guarded by `taintOf(cv)` - one cached `getImageData(0,0,1,1)` per page (`taintCache`),
      because repeated readbacks earn a `Canvas2D: Multiple readback operations … willReadFrequently` warn. On a
      tainted canvas the mini box shows `walang screenshot` and SEND tells him to reload the page.
  * **Test trap for the next round:** `LL.tool()` takes `start` / `end` / `road`. Passing `cafac` or `bahay` does not
    error - `putPin()` falls through to the waypoint branch, so the trace silently fills `pts.ways` and the readout
    shows `Wala pang punto` / `PIN NG CAFAC (naka-save)`. Also `LL.tap()` inherits the tool from the last
    auto-advance, so a test that reuses one page load inherits the previous test's state: reload per case.
  * **The distances themselves (kept from the first card-free measurements, because they are what the cards print):**
    the road is *longer* than the straight line by design - measured `DASLPE73NP1`, two real taps and 0 waypoints:
    **660 m kalye vs 382 m tuwiran, lumibot ng 278 m**; a pair 411 m apart answered **2.95 km kalye / lumibot ng
    2.54 km**, and `curl` on the identical URL confirmed the server really said that (HTTP 200 in 0.82 s, 87 points,
    `legs=[2950.1]`, start snapped 75 m to the nearest mapped road). A big *lumibot* number is **OSM's drivable
    network**, not my arithmetic, and it is the signal that tells the agent to tap the likuan himself with `③`.
  * **Zoom is now a button, not a gesture** (`➕ Zoom in` / `➖ Zoom out`, +1 step each, and the Leaflet `+`/`-`
    controls were enlarged to 38 px for thumbs). `🎯 Sa gitna ng mapa` drops the next pin at the exact center, which
    is how an agent aims a pin he cannot see under his thumb, and `✛ Ipakita ang gitna` turns on `#xh` - a red
    crosshair with a white halo, `pointer-events:none`, dead-center over `#rtmap` inside `.rtwrap` - so the center is
    visible before he presses `🎯`.
  * **Every programmatic view change passes `{animate:false}`** - `zoomIn`, `zoomOut`, `setView`, `fitBounds` and
    the saved-pin jump. Measured: `M.setZoom(14)` in this browser surface **never completes** (the zoom stayed 11
    forever, because Leaflet waits for a `transitionend` that does not fire here), while `setZoom(14,{animate:false})`
    landed instantly. It looked like dead buttons until the flag was added.
  * **Test trap: measure the zoom with the panel open.** Calling `LL.pick()` while `#llp` is still `hidden` leaves
    the map container `0x0`, and `fitBounds` on a zero-size map resolves to `minZoom` - the readout then says
    *"Anabu II-A, Imus, Cavite **(zoom 0)**"*, which is not a code regression (an agent can only pick a CAFAC from
    the suggestion rows *inside* the open panel). Clicking the `LONG/LAT - CAFAC` pill first re-measures the same
    pick as **zoom 15**, center `14.38451, 120.93687`, 8/8 tiles loaded and **0 stuck at opacity 0**, 1 OSM request.
  * Leaflet 1.9.4 is **inlined** in the page (no CDN, no SRI, no key) with keyless OSM tiles + Esri World Imagery,
    and markers are `L.divIcon` text icons so no image assets ship. `scrollWheelZoom:false`; `invalidateSize()`
    on open/resize; **no auto-fit on tap** (his old complaint *"bigla bigla syang nag zoom out"*) - fit only via
    `⤢ I-fit` or when a saved route loads.
  * **Why his first look was a black box** (he screenshotted it: *"ganito lumalabas"*), two causes, fixed the same
    day: (1) the default view was written `setView([14.1,-120.85],11)` - a **negative longitude**, the Pacific
    Ocean, not Cavite - so the tiles that loaded were open water. `home()` now opens at `[14.25,120.80]` z11
    (tile `11/1710/941`) and jumps to z15 on the picked CAFAC's saved pin. (2) Leaflet's zoom-fade left every
    loaded tile with inline `style.opacity:"0"` after `invalidateSize()`, so nothing painted even over land;
    `wake()` forces `leaflet-tile-loaded` images back to `opacity:1` on `tileload`/`load`/`zoomend`/`moveend` and
    150/600 ms after open, and `⤢ I-fit` doubles as the manual repair when there is no trace yet. Measured after
    the fix: **8/8 tiles loaded, 0 at opacity 0**, on the OSM and the Esri layer alike.
  * Routes live in `localStorage.mm_routes` keyed `"<CAFAC>|<SUBSCRIBER NAME UPPERCASE>"` as
    `{c,nm,s:[lng,lat],e:[lng,lat],w:[[lng,lat]...],km,ts,rd,L:[km per leg],g:[[lng,lat]... thinned to &le;400]}` -
    `rd`/`L`/`g` are new with routing: the OSRM total, the per-leg distances and the fitted street line itself, so
    **a reload costs 0 requests** (measured: `loadR()` restores `RG/RD/RL`, sets `oSig=sigOf()` and the next
    `sync()` sees an unchanged signature and never asks OSRM again). `thin()` keeps the saved blob under ~400 points
    so one route is a few KB, not 142 raw vertices. `💾 I-save` requires a picked CAFAC + a name + both
    ends, and auto-writes the CAFAC pin into `mm_cafac_ll` if it has none. Re-picking that CAFAC reloads and fits
    the trace (measured: zoom 16, center 14.082/120.9835) and the per-leg rows still say `kalye`, not `hop` -
    they said `hop` until `L` was persisted.
  * The **export follows the same source as the readout**: the KML `<LineString>` and the GPX `<rte>` use `r.g`
    when the record has real street geometry (its `<description>` says `totoong kalye (OSRM)`) and fall back to his
    taps with the `mga tap` wording when it does not, so a file he hands to PLDT is the road he traced, not a
    polyline between his fingers.
  * A waypoint marker tap deletes that point (*"Tinanggal ang punto 1."*); `↺ Bawi` refuses when empty
    (*"Wala pang punto ng daan ang babawiin."*); `✖ Burahin lahat` clears the map but not the saved route.
  * Measured on a 3-waypoint trace **before the kalye routing landed**: **892 m road vs 876 m straight**, save &rarr;
    1 key in `mm_routes`, export
    &rarr; KML 1,000 B with 2 `<Placemark>` (pin + one `<LineString><tessellate>1</tessellate>`) and GPX 805 B with
    1 `<wpt>` + 1 `<rte>` of 5 `<rtept>` (`CAFAC &rarr; 1..3 &rarr; BAHAY`); both re-parse clean with `DOMParser`.
    The same file shapes now carry `r.g` when the trace has street geometry; the numbers above are the tap-hop case.
  * Empty-state guards all answer on screen: no CAFAC + `🗑` &rarr; *"Pumili muna ng CAFAC sa listahan bago
    mag-bura."*, no points + export &rarr; *"Wala pang naka-save na pin o daan — mag-tap muna sa mapa at pindot
    ang I-save."*
  * Coordinate orders are still two different things: KML/GPX want `lng,lat`, the free Maps URL `api=1&query=`
    wants **`lat,lng`** (measured: `query=14.08,120.98`). The first maps build had them swapped.
  * The manual `LONG (East)` / `LAT (North)` inputs are kept inside a collapsed `&lt;details&gt;` for the case
    where the tiles do not load offline. Validation: empty/non-numeric and anything outside `lat 3-22 / lng
    113-127` is refused in red - measured `999 / 14` &rarr; *"Nasa labas ng Pilipinas ang numero (999, 14) —
    balikan mo."*, and `14,080000` (comma) is accepted and stored as `14.08`; values round to 6 decimals.
  * Still device-only: no server, no cost, and **agents do not see each other's pins or roads** until he exports
    the KML. Step 2 (only after he approves the look) is a `ROUTES` tab in his Sheet + an Apps Script endpoint.
* **`📤 SEND` mails the picture (2026-11-08, asked: *"kapag pinindot ang send ipadala ito sa email na
  Markelvinmaliwat@gmail.com"*).** The page renders the map into a 640 x 420 canvas (`shot()`), converts it to a
  JPEG at quality 0.82 (measured 40-140 KB for a normal trace), and POSTs `{mode:'daan',id,to,info,mime,img}` to
  the V9 `/exec` as `text/plain` with `mode:'no-cors'` - the only shape a browser may send to Apps Script without a
  preflight. The POST reply is opaque by design, so the confirmation is a separate JSONP GET
  `action=daanAck&id=<id>` that reads the receipt `DaanMail.gs` leaves in Script Properties (`DAAN_ACK_MAP`,
  pruned to 40 keys / 3 h). Before the first POST the page probes once with `id=probe`: if the endpoint does not
  answer `found`, **SEND refuses to claim anything was mailed** and falls back to share/download with the exact
  missing step - measured live, with the endpoint still uninstalled, the message is *"Hindi pa tinatanggap ng
  Apps Script ang mail na ito - idagdag ang isang linya ng daanAck sa doGet pagkatapos i-redeploy ang /exec -
  Na-download ang daan-IMULP012NP1-QA-MAIL-TEST.png - i-attach ito sa email sa Markelvinmaliwat@gmail.com."* The
  server half is `DaanMail.gs`: one mail per route to the one address he named (`DAAN.TO`), his own mail shape
  (GREET / INTRO / black-#4d4d4d-bordered label-value table / CLOSE / `Thank you !` / SIGN), the picture both
  inline (`cid:daan-map`) and attached (`daan-<CAFAC>.jpg`), guardrails `MAX_KB 900 / MAX_PER_DAY 80 / GAP_SEC 20 /
  MIN_CHARS 3`, and `doPost` - which AgentNotices.gs did not have, so this file owns it (a project may define only
  one). It costs nothing: `MailApp` is his own 100-free-emails-a-day quota, shared with the 8AM notices and the
  PLDT reports. **Installing it is three manual steps for him** (paste `DaanMail.gs` as a new file, add the one
  `daanAck` line under `function doGet(e) {` in `AgentNotices.gs`, Deploy -> New version); the page cannot do any
  of them and will not pretend otherwise.
* **What it is NOT:** no table, no saved-list UI of its own, no offline tile cache, **no API key and no bill** -
  the geocode is OSM Nominatim and the road fit is the public OSRM demo server, both free and both used only
  inside his rate limit. Step 2 of the earlier plan still holds: **agents do not see each other's roads** until he
  approves the look and the `ROUTES` tab exists. The earlier registry shape (`mm_ll` + its table) was removed on
  his word `wag na mag lagay ng kagaya ng nasa litrato` and stays removed. The two *facility-tab* routing builds
  are still gone - see
  [[project-3mda-facility-route]]; this routing lives only in `LONG/LAT - CAFAC` and is what he asked for on
  2026-11-08.
* **Mobile (`html.vm`):** the three pills stay on one line (shrunk to 11.5 px / 8 px padding - measured 79 + 163
  + 157 px inside a 417 px row at a 735 px viewport), the inputs and suggestion rows are 44 px, `.llsug` scrolls
  inside a 182 px box (32 vh), and under 900 px all three boxes stack. In the maps box the tool buttons wrap
  2-per-row at 44 px+ (measured 133x56 px for `① CAFAC` at 735 px). With `📤 SEND` and `🎥 Street View` the panel
  holds **24 buttons** (was 21 before SEND), every visible one at the measured **minimum height of 44 px** -
  `SEND` itself is 634 x 46 px and `🗑 Tanggalin ang naka-save` is the one that stays hidden until a route exists
  for the current CAFAC + name; the new `ZOOM` slider is 44 x 529 px under the tool row. The summary card is
  634 x 100 px with its 104 x 78 mini-map canvas inside, the map is 619 x 296 px (measured at the 720 px width of
  this browser surface; 634 px at the 735 px viewport) and the panel keeps `scrollWidth == clientWidth` - no
  horizontal overflow (673 / 673 here, 735 / 735 before).
* **Zoom motion (asked: *"gawin smooth lang ang zoom in at out wag na pindot pindot pa ng sobra"*):** `+` and `-`
  now animate one level with `zoomAnimationThreshold:5`, hold-to-repeat after 400 ms at 240 ms per step, and a
  `ZOOM` range slider (10-19, `oninput` = instant target) sits under the tool row with the number beside it; the
  slider and the map stay in sync through `zoomend moveend` (`zsync()`), and pinch/double-tap are untouched.
  `zTo()` keeps a token so a newer press always wins, and a **650 ms rescue** applies the zoom with
  `{animate:false}` when the transition never reports. The rescue is not decoration: measured here, Leaflet's
  `_zoom` only advances when the CSS transition ends, and transitions/rAF are frozen while this page is hidden, so
  `zoomend` arrived at ~564 ms and an animated `setView` without the rescue never applied at all. **Honest gap: the
  smooth feel could not be seen in this surface** - only the end zoom level was measurable (11 -> 19 by holding,
  back down with the slider). Street View is keyless too: `🎥 Street View` opens
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=lat,lng` (measured
  `viewpoint=14.392100,120.940200`) at the house pin, else the CAFAC pin, else the centre of the map - the
  *Street View Image API* was rejected because it needs a key and a billing account.
* **GPS LIVE (asked: *"kaya mo ba gawin na ipin ng live ang cafac at bahay… nasa tapat ako ng cafac on site at nag
  lakad ako papunta ng bahay ni subs kaya mo ba estimahin ng live ito"*, and he answered **"A at B"** to the mockup):**
  two new buttons in the second tool row — `📍 Dito ako (GPS)` (`gpsNow()` → one-shot `getCurrentPosition` with
  `enableHighAccuracy:true, timeout:14000, maximumAge:3000`) and `🚶 I-track ang lakad` (`gpsTrack()` →
  `watchPosition`, label flips to `🛑 Itigil ang track` while running). **A:** each GPS fix feeds the same
  `putPin(p,'gps',acc)` the taps use, so the auto-advance ①→② is unchanged and the **road line and the per-leg
  measurement still come from OSRM**; `gSrc.start/gSrc.end` remember the accuracy and the cards read
  `mula sa GPS mo ±6 m`. A fix worse than **±25 m is refused** (that is wider than a lane) with an instruction to
  stand under open sky and press again — the accuracy code is also logged (`GPS MALABO`). **B:** while tracking,
  `onWatch()` adds a likuan only when it moved `max(8 m, 2×accuracy)` from the last stored point and skips any read
  worse than **±45 m**, both counted out loud in the readout (`7 pagbasa ng GPS · 1 malabo na punto hindi binilang`);
  the walked line is drawn as its own **green dashed** polyline under the red road line with a blue you-are-here
  dot and an accuracy ring, and the new `🚶 LAKAD MO (GPS)` card prints it beside the `CAFAC → BAHAY` card so the
  two numbers can be compared. **The 4-second heartbeat promised in the mockup was dropped on purpose** — a timed
  point inflates the walked distance with jitter while the agent is simply standing still; the distance rule is
  the honest replacement.
  * A dark live strip (`#rtgps`, only 12 px text) updates every read without touching `#rtmsg`, and `pushG()`
    redraws the cards at most every 2 s with a trailing timeout so the last step is never left unmeasured.
  * `✖ Burahin lahat` also stops and clears the track. **Switching to a different CAFAC mid-walk** (`guardKey()`)
    drops it and leaves a `⚠️ BINURA ANG NAUNANG LAKAD` card — a card, not a message, because `sug()` and the
    barangay zoom both overwrite `#llmsg`/`#rtmsg` in the same tick. The subscriber *name* does not trigger it:
    only the CAFAC code is compared, so typing the name after the walk keeps the walk.
  * The whole session (track + both pins + `gSrc` + the OSRM geometry) autosaves to `localStorage.mm_walk` every
    5 points, **on every GPS pin** (`onFix` calls `ww()` the moment the ①/② fix lands — before that, a phone that
    died right after the ② press lost only that one pin, `e:null` in the backup), and on
    `pagehide`/`visibilitychange`, because Android kills the tab while the agent walks with a
    locked screen; `askWalk()` restores it (0 network requests, the geometry came from the backup) when the same
    CAFAC + name is reopened within 6 h, and `💾 I-save` carries it into `mm_routes` as `T/tk/tn/a/gs`.
  * Costs nothing and leaks nothing: `navigator.geolocation` only — no key, no service, no request — and the
    position never leaves the device except inside the numbers/picture the agent presses `📤 SEND` on. Measured on
    the `file://` build: pick + 2 GPS fixes + 6 tracked reads → `133 m` road (OSRM) vs `101 m` walked, `±8 m`,
    cards `LAKAD MO (GPS) = 101 m`, `PIN NG CAFAC = 120.936500 · mula sa GPS mo ±6 m`; a refused `±60 m` and a
    refused `±120 m` fix placed nothing; the `denied` permission path printed the ALLOW instruction and auto-
    stopped the watch; `mm_walk` after `🛑` held all 13 keys incl. `g` (5 geometry points) and `rd:0.133`.
    **Honest gap: no real satellite was ever read here** — the automation surface refuses `geolocation`, so every
    position was fed through the production `onFix`/`onWatch` entry points, not through a phone's GPS.
* **AUTO-DETECT (asked: *"maari mo bang gawin na auto detect mo agad kung nasaan located ang device sa mapa para
  mag start ng paglalakad"* — mockup shown, he answered **"A"**, 2026-11-09):** `🛰️ Auto: ON` (`#rtauto`, teal,
  `mm_auto`, default ON) beside the two GPS buttons. On picking a CAFAC (and on opening the map), `sense()` starts a
  short watch — **3 reads / 12 000 ms window**, best accuracy wins, early exit the moment a read already satisfies the
  gate — and the readout prints `🛰️ Hanapin ko muna kung nasaan ka …`. What it may then do is where option A differs
  from B:
  * **The gate.** `aRefOf()` picks ONE reference: the saved CAFAC pin in `mm_cafac_ll` (`kind:'pin'`) or, only if that
    CAFAC has never been pinned, the barangay point the auto-zoom cached in `BGY` (`kind:'bgy'`). Auto-tag + auto-`gpsStart()`
    happen **only** when `kind:'pin' && acc<=25 m && distance<=G_NEAR 150 m`. A barangay is never a node: inside it the
    line says *"pindot mo lang ang 📍 … isang beses lang iyan"* and waits, because once he tags ① by hand the pin exists
    and the next visit to that CAFAC is fully automatic.
  * **The three refusals, each its own line + its own card:** `⛔ ±N m` (higit sa 25 m), `📍 N m pa` (malayo pa —
    *"baka nasa bahay ka pa o nasa sakyanan"*), `—` (walang nabasa sa 12 segundo, with `gErr` beside it). Card because
    `#rtmsg` is overwritten in the same tick by `sug()`/`toBgy()`/OSRM — the same lesson as `gNotice`.
  * **Pin drift (`G_KEEP 40 m`):** the auto tag goes through the production `onFix(...,'start')`, which normally
    rewrites `P[c]` — so a 150 m gate would let the saved node position crawl 150 m per visit. `aTake()` snapshots the
    old pin and restores it (`P[picked]=was;wp();saved()`) whenever the new fix is more than 40 m from it, so **the
    reference stays stable and only ① + `gSrc.start` move**. Measured: fed at 100 m → `✅ AUTO … na-tag ang ①`,
    `gps().on=true`, and `mm_cafac_ll` byte-identical before/after; fed at 15 m → tagged and the pin refreshed.
  * **Lifecycle.** `sense()` returns false (no side effects) when AUTO is off, nothing is picked, a start pin or a walk
    already exists, or a sense is already in the water; `pick()` on a *changed* CAFAC calls `aStop()` and clears the
    card, so a sense started under the old node can never tag the new one; `dropTrack()` (✖, CAFAC switch, `LL.gclear`)
    stops the sense too; a denied/absent `geolocation` lands in the `walang` branch with the ALLOW instruction.
  * **Log events:** `AUTO SENSE` (reads, best accuracy, distance, NA-TAG / hindi na-tag), `AUTO TAG`, `AUTO WALANG`,
    `AUTO SWITCH`; `MAP BARANGAY` now ends in ` + auto` when the barangay cache kicked off a sense.
  * Measured (`?v=auto4`, block 77,239 chars): gates `[150, 40, 1200, 25, 3, 12]`; far 400 m → no tag + card `📍 400 m`;
    `±40 m` → no tag + card `⛔ ±40 m`; barangay + `±10 m` → no tag, `info.kind:'bgy'`; 15 m + `±7 m` → `✅ NA-TAG`,
    track LIVE, `daanInfo()` after the walk → `walk:"150 m"`, `walkpts:4`, `gps:"GPS ±7m ① / ±8m ②"`; real denied
    permission → *"Walang nabasa ang GPS sa loob ng 12 segundo (Hindi pinayagan ang Location …)"*. 27 visible buttons,
    min height 44 px, `scrollWidth == clientWidth == 688`, `mm_routes` / `mm_walk` untouched in shape, no console
    errors, `LIVE V9 OK: 2495 records`. Test API: `LL.auto(v)`, `LL.asense()`, `LL.afix(lat,lng,acc)`, `LL.adone()`,
    `LL.abgy(code,lat,lng,name)` — `aWatch` ignores any read with no live `aRef`, which is what a late
    `watchPosition` error looks like in this surface.
* **SPAN — `📏 SUKAT NG DROP (span)` card (`5957032`, block 79,392 chars, live 4,832,483 bytes):** the owner stated
  the installation rule in his own words — **"1 span = 50 m … PWEDE LANG AY 600 METERS, KAPAG LUMAGPAS DITO
  OVERSPAN NA SYA"** — so the card prints whole spans (`Math.ceil(m/50)`, because a part-span is still a span of
  wire) against `SPM=50` / `SPMAX=600`, and the ceiling is **inclusive**: 600 m = 12 span is `OK sa 600 m`.
  Three verdicts, and the middle one is the honest part: `dms = straight CAFAC→bahay` and `dmr = measured run`
  (OSRM `kalye` when the server answered, otherwise the agent's own `hop` taps).
  * `⛔ OVERSPAN — dagdag na poste` when the **straight line alone** passes 600 m (`hard`), or when there is no
    street geometry and the traced hops do. `SUKAT` never rests on the rounded span, only on metres.
  * `⚠️ SURIIN — iba ang tuwiran` when the straight line is inside 600 m but the **road** is not. OSRM returns a
    *drivable* route, which is not the pole line: measured on his own street, **387 m straight answered 2,959 m
    by road (60 span)** — declaring that OVERSPAN would be a fabrication, so the card shows both and asks for a
    look. The sub-line always carries `daan/sukat N span (M m) · tuwiran X m (Y span) · 1 span = 50 m`.
  * Measured on the production path: 300 m → `6 span` OK; **600 m exactly → `12 span` OK**; 606 m → `13 span`
    OVERSPAN (`lumagpas … ng 6 m`); 650 m → `13 span` OVERSPAN; 387/2,959 m pair → `chk:true`, `60 span`,
    `SURIIN`. `ROUTE SAVE` logs now end in `drop 650 m = 13 span OVERSPAN|SURIIN|OK`; `LL.span()` exposes
    `{road,stra,nr,ns,over,hard,chk,base,rule}` and the rendered card text. 25 visible buttons, min 44 px,
    `scrollWidth == clientWidth == 688`, no console errors, `LIVE V9 OK: 2499 records`.
  * **Why the rule was not derived from data:** of the 2,495 sales rows, only 21 remarks carry a span number and
    **none** of them is a `POSTED`/`PAID` row — there is no positive sample, so the ceiling had to come from him.
    His own wording validates the 50 m: `…DUE TO OVERSPAN NEAREST CAFAC ALFLP213NP2 19SPAN` = 950 m. Parsing note
    for anyone re-deriving this: crews glue the code to the span (`AMALP76NP313SPAN` = `AMALP76NP3` + `13SPAN`).
    OSM/Overpass was probed and rejected as a pole source: across his six busiest barangays `power=pole` counts
    were 51/27/12/9/0/0 — **three of six effectively empty, including Capipisa·Tanza, his #1 barangay** — and the
    endpoint answered 502 in 932 ms in-page, 35–41 s per query with 3 of 6 failing server-side.
* **HABOL — 🚫 May habol sa daan (`13b11a5`, owner's rule 2026-11-09):** *"KAPAG ANG DADAANAN AY MAPUNO O
  MAGUBAT OR HNDI TUNAY NA DAAN ILAGAY AS UNMAINTAINABLE FOR APPROVAL"*, and **"AB"** approved the mock, so the
  shape is **one button + three chips** and **both** spellings are used — the card prints his own phrase
  `UNMAINTAINABLE FOR APPROVAL`, the log line carries the wording his Sheet already stores, `RPR - UNMAINTAINABLE`
  (24 rows of it, incl. his typos `UNMAINTANABLE`/`UNAMAINTAINABLE`/`SUBS UNMAIMTAINABLE`).
  * **Manual by design.** Nothing in the free data can see flooding or overgrowth (measured in the span probe:
    `power=pole` 51/27/12/9/0/0 across his six busiest barangays, no flood/veg layer at all), so the Satellite
    basemap informs his **eyes**, never the code. The stamp can only be pressed by the agent, it never auto-fires,
    and it does not touch SEND: no mail leaves the page without his press.
  * `HABOL={mapuno:'MAPUNO',magubat:'MAGUBAT',hindi:'HINDI TUNAY NA DAAN'}`, `HWORD`, `HLOG`, state
    `habol`/`habolKey`/`habolOpen`. Pressing 🚫 while stamped **clears** it; the reason chips (`#llhabol`,
    `.llhchip`, `display:none` until opened) sit directly above the card stack; the red `🚫` card renders **below**
    `📏 SUKAT NG DROP` so an OVERSPAN verdict is never hidden — they are two separate judgements (wire length vs.
    quality of the way).
  * **The stamp is bound to one daan, not to the screen:** it lives as `hb` inside the existing `mm_routes` record
    keyed `CAFAC|NAME` (no new localStorage key, no server change, no Apps Script redeploy), and `habolOn()` only
    returns it while `habolKey === rk()`. Measured: pick another CAFAC → `on:""` and the button reverts to
    `🚫 May habol sa daan`; pick the first again → restored from the record; change the SUBSCRIBER NAME → hidden
    and the old record keeps `hb` (so a stamp can never travel to another application); name back → restored;
    press the same chip again → `hb` removed from the record (17 → 16 keys) with `Tinanggal ang tatak …`;
    `✖ Burahin lahat` → cleared. This also needed `pick()`/`typed()` and the name input to `draw()` immediately —
    before that the card stack kept showing the previous daan.
  * Logs: `DAAN HABOL | AMALP112NP1|QA HABOL TEST = MAPUNO · UNMAINTAINABLE FOR APPROVAL · buong daan 778 m ·
    kalye · <agent>` on every set/change/clear, and `ROUTE SAVE … drop 778 m = 16 span SURIIN, RPR - UNMAINTAINABLE
    (MAPUNO → UNMAINTAINABLE FOR APPROVAL)`. `daanInfo()` gained `habol` — the current `DaanMail.gs` ignores unknown
    fields, so the mail is unchanged until he pastes the (offered, not installed) 4-line addition.
  * Measured on the production path: 26 visible `.llbtn` (was 25), chips 44 px tall × 207 px, min button height
    44 px, `scrollWidth == clientWidth == 688`, console clean, `LIVE V9 OK: 2515 records`. Test API:
    `LL.habol()` reads state/button/chips/saved/card, `LL.habol('open')` presses the button, `LL.habol('mapuno'|
    'magubat'|'hindi')` picks a reason, `LL.habol('')` clears.
  * **Pre-existing crash found while testing this (`3d1e6ec`):** `saveR` wrote the street geometry with
    `thin(RG.map(ll2),400)` although `RG` is `null` until OSRM answers (and `drop()` returns it to `null`), so
    pressing **💾 I-save ang daan** on a fresh trace before the road server replied — or with no internet — threw
    `Cannot read properties of null (reading 'map')` and **stored nothing**, silently. Reproduced on the live origin,
    fixed with the same guarded form the autosave path already used (`g:null`, which `loadR` already handled), and
    re-measured: `err:null`, record `…gs,hb` with `g:null rd:0 km:0.504`, `hb:"mapuno"`.
* **Existing behavior untouched:** `mode()` keeps `in` and `fc` exactly as before and only gained the null-
  guarded `ll` branch; the panel is injected by the block's own `init()` (`window.LL`) after `#fcp`, not in
  the HTML, so it survives the minified markup. 7 inline scripts parse (`new Function` clean), no console
  errors, and the page still auto-syncs (`LIVE V9 OK: 2457 records`).

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
* **Its rule is his correction, in his own words (2026-11-06, said twice): `HD RECOMMENDATION` or
  `FINAL STATUS` contains `CREDIT VALIDATION`.** The first version read `CSP REMARKS` for
  `ESCALATED TO CVAA` and reported **0 rows all day** on the live file — that is how he knew the
  column was wrong, and `ESCALATED TO CVAA` is deliberately no longer a reason to mail anything.
  The wording then had to be fixed a second time the same day: it shipped as
  `UNDER CREDIT VALIDATION`, his `cvProbe` still answered `0 row(s) qualify`, and the four rows he
  screenshotted (`JOHNNY DULIN 2313565019`, `ROWENA ORTE 2313567355`, `ROBERTO MAR 2313569202`,
  `GLORIA PEREZ 2313581337`) both read **`CREDIT VALIDATION`** with no `UNDER`. Because matching is
  `contains` (`EXACT = false`), the shorter phrase is strictly broader — it still catches
  `UNDER CREDIT VALIDATION`, `PENDING CREDIT VALIDATION`, lower case and extra spaces — so nothing
  he was already mailing is lost, and his four rows finally are.
  The two columns are alternatives (`CV.FROM_ANY = true`): a row qualifies when **either** one
  carries the wording, even when the other cell holds an unrelated note. Without that, the shared
  "first non-empty column wins" reading — which is right for SFS and AFD — would let a note in
  `HD RECOMMENDATION` hide the tag in `FINAL STATUS`. `cvProbe` now prints the count per column
  (`CV 4 row(s) qualify | by column: FINAL STATUS=3, HD RECOMMENDATION=1 | …`) so he can see which
  one his team actually types in, and a zero-row run says which columns it looked in.
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
  returns nothing, `sendReport_` returns `no rows tagged AFD + RESCHEDULE in FINAL STATUS whose
  HD RECOMMENDATION is today - nothing sent` and never builds an email — in `DRY_RUN` or live.
* `sfsProbe` / `cvProbe` are how the rules were decided, and they are still the tool to run if
  the wording ever changes. They send and write nothing. Per tab they log the column names, the
  ten most common values of the five status and remarks columns, every value mentioning the
  report's words (`>>` — `SFS.PROBE` / `CV.PROBE`), **every column that ever contains those
  words with its exact wording (`##`)**, the full contents of the sample rows, and how many rows
  the current rule would report. A `FROM_ANY` rule (CV) also logs its qualifying rows **split per
  column and per wording**, so a column that contributes nothing is visible as one number. As
  measured on 2026-11-04 the live Aug-Oct sheet had **0** rows tagged `SFS VALIDATION`, so an
  automated run that day correctly sends nothing.
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
  approval path). **All five reports — SFS, CV, AFD, AFD12 and RTS — now mail on their own.**
  Set any of them
  back to `true` any time to stop PLDT receiving it: while it is true every copy goes to
  `NOTICE.ADMIN_EMAILS` only, the CC list is ignored, and the subject gains `[TEST] `.
  `sfsPreview` / `cvPreview` log the exact body without sending anything and without touching
  the dedupe list.
* **`sfsTestReport` / `cvTestReport` / `afdTestReport` produce a real copy on any day.** The live
  rules have 0 rows until a new encode is tagged, so there would be nothing to look at — each one
  temporarily matches its own `cfg.TEST.STATUS` (`SFS.TEST` borrows `REENCODED`, `CV.TEST`
  borrows `CREDIT VALIDATION` — a substring of the live wording, so the copy is built from rows the
  corrected rule really finds — `AFD.TEST` borrows the single word `AFD`; `cfg.TEST.MAX_ROWS` caps
  the table at 12 rows, or 2 for CV so his inbox stays short) and **forces that
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
  size. The logo is only in the five endorsement reports — the agent notices are unchanged.
  Replace the picture by overwriting `assets/mmmda-logo.jpg` and pushing.
* To change the columns, edit that report's `cfg.COLS`: SFS and CV ship
  `['DATE', 'SUBSCRIBER NAME', 'SR', 'CSP REMARKS', 'HD REMARKS']` like his own mail, AFD/AFD12 ship
  his ACCT / PR / BRGY / CITY table, and RTS ships his ten template columns. The header name is
  mapped to the row field in `CELL_` (`Date, Subscriber, SR No., Plan, Status, Remarks, Agent, Team
  Leader, CSP Status, Agent Code, Agency Name, CDME, Sales Manager, Team`), and a header that no
  `CELL_` entry covers is what `rtsPreview` would call an empty column.
* A new daily email needs no web-app redeploy — triggers run **Head**. Only a new `/exec`
  action would need Deploy > New version.
* Putting this revision in is one paste and one `Ctrl+S`: then `installSfsTrigger()`,
  `installCvTrigger()`, `installAfdTrigger()`, `installAfd12Trigger()` and `installRtsTrigger()` —
  each deletes every trigger of its own handler before creating its pair, so a short or duplicated
  pair is fixed by re-running it, never by hand. On 2026-11-05 the owner's Triggers page went from
  **SFS 1 + CV 3** to exactly **2 + 2 + 2 + 2 + 1 agent notice = 9**; `installRtsTrigger()` adds one
  one-shot trigger on top of those, for **10** — since 2026-11-06 it is armed for 9:00 sharp and each
  run re-arms the next day. All five reports — SFS, CV, AFD, AFD12 and RTS — are now
  past the `DRY_RUN` gate, so a paste is the only thing standing between a rule change and its
  recipients receiving it.
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
* **RTS is the fifth mail and it is LIVE (`RTS.DRY_RUN = false` on the owner's "GO RTS LIVE",
  2026-11-05; `installRtsTrigger()` is the one press that puts it on the clock).** He
  asked for it in one sentence: *"nais ko din sana magkaroon ng automated email patungkol sa
  RTS - CUSTOMER COMPLIANCE / RTS - UNCONTACTABLE na makikita sa final status at ito ay ipapadala sa
  email na ito - to bernardsalioa@gmail.com at naka cc sila jrsnavarro25@gmail.com
  juliean.rjab@gmail.com at ito ay ipapadala sa email araw araw tuwing 11:00 AM lamang"*. Three
  things make it different from the four PLDT queues: the To/CC are **only the addresses he names**
  (since 2026-11-06 that includes **himself** — he asked *"paki CC din ako dito"* after a send that
  had already gone out looked to him like a run that never happened), the two taggings are
  **alternatives** (`RTS.ANY = true`, so `statusHit_` uses `some`, not `every` — a row carrying only
  one of the two wordings still belongs), and it runs in **one** hour instead of a pair. That hour
  was 11 AM, and on 2026-11-06 he moved it and asked for it **exact**: `SEND_HOURS: [9]`,
  `SEND_MINUTE: 0`. A daily trigger cannot honour that — `ClockTriggerBuilder` has **no
  `atMinute()`**, and calling it threw `TypeError: day.atMinute is not a function` *after* the old
  trigger had already been deleted, which left RTS with no schedule at all. The only way to land on
  a minute is the one-shot `.at(date)`, so `armRtsTrigger_()` keeps exactly one pending
  `runRtsNotices` trigger pointed at the next 9:00 in the sheet timezone, and `runRtsNotices()`
  re-arms **before** it sends — a failed mail must not cost tomorrow. `installRtsTrigger()` logs the
  exact armed datetime. SFS, CV, AFD and AFD12 still use plain `everyDays(1).atHour(h)`. What is
  shared: the file, the tabs, the black-bordered table, the per-day `RTS_SENT_yyyyMMdd` SR list,
  the `[TEST]` copy path. The **words and columns are his own** (2026-11-05): he pasted the
  greeting (*"Hi @bernardsalioa@gmail.com for checking ng ating mga open RTS kung ito ba ay cancelled
  na o macocomply pa ng agent…"*) and a screenshot of the table, then asked for it in English —
  *"ngunit gawin mo ito na english para sa formality"* — so `RTS.INTRO` / `RTS.CLOSE` are that
  sentence translated, the `@` in the greeting stays because it is how he tags a person, and `COLS`
  is his ten-column order (`DATE | SR Number | FINAL STATUS | CSP REMARKS | AGENT CODE | AGENT NAME
  | AGENCY NAME | CDME | SALES MANAGER | TEAM`). Four of those headers (`AGENCY NAME`, `CDME`,
  `SALES MANAGER`, `TEAM`) had never been read by any report, so `ALIAS_`, `CELL_`, `COL_ALIAS_` and
  `collectReport_` each gained them; `RTS.HD_TEXT` is `''` because his template has no HD REMARKS
  column. `rtsPreview` prints any column that comes out empty in every row instead of shipping
  blanks. Presses: `rtsProbe`, `rtsPreview`, `rtsTestReport`, `sendRtsReport`,
  `installRtsTrigger`, handler `runRtsNotices`. It is not in `ensureReportTriggers_`. The live flip
  was his own word — *"GO RTS LIVE"* — so `runRtsNotices` now mails `bernardsalioa@gmail.com`
  (Cc the three he named, himself included) on the first 9AM run after he pastes this file and
  installs the trigger;
  a day with no RTS row mails nothing and logs `NOT SENT: 0 row(s) … already reported today`.
  `rtsTestReport()` still forces its own copy to `DRY_RUN` and restores the live flag after.
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
