/* DaanMail.gs — the /exec receiver for the dashboard's 📤 SEND button.
   ---------------------------------------------------------------------------
   WHAT IT DOES
     The LONG/LAT - CAFAC tab draws the traced road CAFAC → bahay and takes a
     picture of the map. SEND posts that picture here and this file mails it,
     as a real attachment, to the owner's own address. Nothing new is bought:
     MailApp is the script owner's own Gmail quota (100 free emails a day,
     shared with the 8AM notices and the PLDT reports), there is no API key,
     no billing account and no third-party service.

   HOW TO INSTALL (three steps, in this order)
     1. In this Apps Script project: File → New → Script, name it DaanMail,
        paste this whole file, Save.
     2. Open AgentNotices.gs, find  function doGet(e) {  and add this ONE line
        directly under it, so the dashboard can ask "did that mail go out?":
            if (String(e && e.parameter && e.parameter.action) === 'daanAck') return jsonOut_(daanAck_(e.parameter.id), e.parameter.callback);
     3. Deploy → Manage deployments → the pencil on the web app → New version →
        Deploy. Without this step the /exec still runs the OLD code.

   Then, in the dashboard: open LONG/LAT - CAFAC, pick a CAFAC, type the
   subscriber name, drop ① and ②, and press SEND. The button says exactly what
   happened, including "hindi pa tinatanggap" if step 1 or 3 is missing.

   WHY THE CONFIRMATION IS A SEPARATE CALL
     A browser POST to /exec must be mode:'no-cors', so its answer is opaque —
     the page can send but cannot read. The reply of the mail is therefore kept
     in Script Properties under DAAN_ACK_MAP and read back with the JSONP GET
     action=daanAck (same trick as getAllData: nosniff refuses text/plain, so
     jsonOut_ replies as text/javascript).

   ONE doPost PER PROJECT
     AgentNotices.gs has no doPost, so this file owns it. If a doPost is ever
     added elsewhere, move daanHandle_() into that one instead of pasting this
     doPost.
*/

const DAAN = {
  NAME: 'DAAN',
  TO: ['markelvinmaliwat@gmail.com'],   // the owner named this address himself on 2026-11-08
  CC: [],                               // e.g. ['someone@email.com'] added to every route mail
  SENDER_NAME: NOTICE.SENDER_NAME,      // '3MDA Logistics', the same name the notices use
  SUBJECT: '3MDA_DAAN_',                // + CAFAC + ' - ' + subscriber name
  GREET: 'Good Day Sir Mark,',
  INTRO: 'A traced route has been submitted from the agent dashboard. The subscriber, the CAFAC ' +
    'node used and the measured distance are listed below, and the map of the road is attached ' +
    'to this email.',
  CLOSE: 'This message was generated from the dashboard route tool.',
  THANKS: 'Thank you !',
  SIGN: ['Mark Maliwat', 'Sales Validator - MMMDA Logistics', 'Service Cavite Upland'],
  /* The labels the owner reads, in order. DATA is what the dashboard sent. */
  COLS: ['SUBSCRIBER NAME', 'CAFAC NODE', 'BARANGAY / CITY', 'ROUTE DISTANCE', 'MAP POINTS',
    'STRAIGHT-LINE DISTANCE', 'CAFAC LONG / LAT', 'BAHAY LONG / LAT', 'ENCODED BY', 'ENCODED AT', 'DEVICE'],
  DRY_RUN: false,          // true = the mail goes to NOTICE.ADMIN_EMAILS only, labelled [TEST]
  MAX_KB: 900,             // ceiling on the base64 screenshot; a normal 640x420 JPEG is 40-140 KB
  MAX_PER_DAY: 80,         // shared with nothing else, but MailApp itself caps at 100 a day
  GAP_SEC: 20,             // one route mail per this many seconds, however fast the button is pressed
  MIN_CHARS: 3,            // a name shorter than this is a mis-tap, not a subscriber
  SAMPLE_LOGO: 'https://markelvinmaliwat-hub.github.io/3MDA-Logistics-Service_website/assets/mmmda-logo.jpg',
  ACK_PREFIX: 'DAAN_ACK_', // Script Properties key holding the receipts the page polls
  DAY_PREFIX: 'DAAN_DAY_',
  LAST_KEY: 'DAAN_LAST'
};

const daanFail_ = why => ({ ok: false, sent: false, error: String(why).slice(0, 200) });

/* ------------------------------------------------------------------ entry points */

function doPost(e) {
  const cb = (e && e.parameter && e.parameter.callback) || '';
  let body = (e && e.postData && e.postData.contents) || '';
  let j = null;
  try { j = JSON.parse(body); } catch (err) { return jsonOut_(daanFail_('the request body is not JSON'), cb); }
  if (!j || String(j.mode) !== 'daan') return jsonOut_(daanFail_('unknown mode - this endpoint takes mode=daan'), cb);
  let out;
  try { out = daanHandle_(j); } catch (err) { out = daanFail_('script error: ' + String(err)); }
  daanNote_(j.id, out);
  return jsonOut_(out, cb);
}

/* action=daanAck&id=... — what the dashboard polls after the POST. found=false means
   the mail is still in flight (or the id never reached us), not that it failed. */
function daanAck_(id) {
  const map = daanAcks_();
  const r = map[String(id || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24)];
  if (!r) return { ok: true, found: false };
  return { ok: true, found: true, sent: !!r.sent, to: r.to || '', subject: r.subject || '',
    kb: r.kb || 0, at: r.at || '', error: r.error || '', age: Math.round((Date.now() - r.t) / 1000) };
}

/* ------------------------------------------------------------------ the mail */

function daanHandle_(j) {
  const info = j.info || {};
  const cafac = String(info.cafac || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  const name = String(info.name || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80);
  if (!/^[A-Z0-9]{6,16}$/.test(cafac)) return daanFail_('CAFAC node maling-maling o wala ("' + cafac + '")');
  if (name.length < DAAN.MIN_CHARS) return daanFail_('subscriber name masyadong maiksi (' + name.length + ' letters)');
  const img = String(j.img || '');
  if (String(j.mime) !== 'image/jpeg' || img.length < 2000) return daanFail_('walang sapat na larawan sa request');
  const kb = Math.round(img.length * 0.75 / 1024);
  if (kb > DAAN.MAX_KB) return daanFail_('screenshot ' + kb + ' KB, higit sa ' + DAAN.MAX_KB + ' KB na pinapayagan');

  const props = PropertiesService.getScriptProperties();
  const day = today_();
  const used = Number(props.getProperty(DAAN.DAY_PREFIX + day) || 0);
  if (used >= DAAN.MAX_PER_DAY) return daanFail_('umabot na sa ' + DAAN.MAX_PER_DAY + ' mail na itong araw');
  const last = Number(props.getProperty(DAAN.LAST_KEY) || 0);
  if (Date.now() - last < DAAN.GAP_SEC * 1000) {
    return daanFail_('isa lang ang padadalhan bawat ' + DAAN.GAP_SEC + ' segundo — hintayin ng kaunti');
  }

  const m = daanMail_(info, cafac, name);
  const to = DAAN.DRY_RUN
    ? (NOTICE.ADMIN_EMAILS.length ? NOTICE.ADMIN_EMAILS : [Session.getEffectiveUser().getEmail()])
    : DAAN.TO;
  const blob = Utilities.newBlob(Utilities.base64Decode(img), 'image/jpeg', 'daan-' + cafac + '.jpg');
  props.setProperty(DAAN.LAST_KEY, String(Date.now()));
  const opt = daanSend_(m, blob, to, DAAN.DRY_RUN ? '[TEST] ' : '');
  props.setProperty(DAAN.DAY_PREFIX + day, String(used + 1));
  cleanDaanDays_(props, day);

  const res = { ok: true, sent: true, to: opt.to, cc: DAAN.CC.join(','), subject: opt.subject,
    kb: kb, at: now_(), quota: MailApp.getRemainingDailyQuota(), today: used + 1 };
  Logger.log('DAAN | ' + (DAAN.DRY_RUN ? 'TEST' : 'SENT') + ' ' + cafac + ' | ' + name + ' | ' +
    m.vals('  ') + ' | ' + kb + ' KB | to ' + res.to + (res.cc ? ' cc ' + res.cc : '') +
    ' | today ' + res.today + '/' + DAAN.MAX_PER_DAY + ' | quota left ' + res.quota);
  return res;
}

/* His own mail shape: greeting, one sentence, a black-bordered table, a closing
   line, "Thank you !", then the plain-text signature. No logo — this runs inside
   the press of a button and reportLogo_ would spend a UrlFetchApp call. */
function daanMail_(info, cafac, name) {
  const rows = [
    ['SUBSCRIBER NAME', name],
    ['CAFAC NODE', cafac],
    ['BARANGAY / CITY', String(info.place || '') || '\u2014'],
    ['ROUTE DISTANCE', String(info.km || '\u2014')],
    ['MAP POINTS', String(info.points == null ? '\u2014' : info.points)],
    ['STRAIGHT-LINE DISTANCE', String(info.straight || '\u2014')],
    ['CAFAC LONG / LAT', String(info.cafll || '\u2014')],
    ['BAHAY LONG / LAT', String(info.bahll || '\u2014')],
    ['ENCODED BY', String(info.by || '\u2014')],
    ['ENCODED AT', String(info.at || '') + ' (agent device) / ' + now_() + ' (script clock)'],
    ['DEVICE', String(info.dev || '\u2014')]
  ];
  const vals = (sep) => rows.map(r => r[0] + sep + r[1]).join('\n');
  const text = [DAAN.GREET, DAAN.INTRO, vals(': '), DAAN.CLOSE, DAAN.THANKS, DAAN.SIGN.join('\n')].join('\n\n');
  const html = '<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#000;max-width:900px">' +
    '<p>' + esc_(DAAN.GREET) + '</p>' +
    '<p>' + esc_(DAAN.INTRO) + '</p>' +
    '<p style="margin-top:16px"><b>The traced road measures ' + esc_(String(info.km || '-')) +
    ' from CAFAC ' + esc_(cafac) + ' to the subscriber address.</b></p>' +
    daanTable_(rows) +
    '<p style="margin-top:18px"><img src="cid:daan-map" width="620" alt="Map of the traced road" style="border:1px solid #4d4d4d;display:block">' +
    '<span style="color:#667085;font-size:12px">Ang parehong larawan ay naka-attach din bilang ' +
    'daan-' + esc_(cafac) + '.jpg.</span></p>' +
    '<p style="margin-top:18px">' + esc_(DAAN.CLOSE) + '</p>' +
    '<p style="margin-top:18px"><b>' + esc_(DAAN.THANKS) + '</b></p>' +
    reportSig_({ src: '', blob: null }, DAAN) + '</div>';
  return { subject: DAAN.SUBJECT + cafac + ' - ' + name, html: html, text: text, vals: vals };
}

/* The same black border the PLDT reports use, but label/value: one route per mail. */
function daanTable_(rows) {
  const th = 'style="border:1px solid #4d4d4d;padding:8px 10px;font-size:12px;font-weight:700;text-align:left';
  const td = 'style="border:1px solid #4d4d4d;padding:8px 10px;font-size:13px;text-align:left;vertical-align:top"';
  return '<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin-top:14px">' +
    rows.map(r => '<tr><th ' + th + '">' + esc_(r[0]) + '</th><td ' + td + '>' + esc_(r[1]) + '</td></tr>').join('') +
    '</table>';
}

/* ------------------------------------------------------------------ receipts */

function daanAcks_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(DAAN.ACK_PREFIX + 'MAP') || '{}'); }
  catch (err) { return {}; }
}

/* Keep the newest 40 receipts for three hours: enough for the page to poll after a
   slow POST, small enough that Script Properties never fills up. */
function daanNote_(id, res) {
  const key = String(id || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
  if (!key) return;
  const props = PropertiesService.getScriptProperties();
  const map = daanAcks_();
  Object.keys(map).forEach(k => { if (Date.now() - Number(map[k].t || 0) > 3 * 3600 * 1000) delete map[k]; });
  const ks = Object.keys(map);
  if (ks.length >= 40) {
    ks.sort((a, b) => Number(map[a].t || 0) - Number(map[b].t || 0))
      .slice(0, ks.length - 39).forEach(k => delete map[k]);
  }
  map[key] = { t: Date.now(), sent: !!(res && res.sent), to: (res && res.to) || '',
    subject: (res && res.subject) || '', kb: (res && res.kb) || 0, at: (res && res.at) || '',
    error: (res && res.error) || '' };
  props.setProperty(DAAN.ACK_PREFIX + 'MAP', JSON.stringify(map));
}

function cleanDaanDays_(props, keep) {
  Object.keys(props.getProperties()).forEach(k => {
    if (k.indexOf(DAAN.DAY_PREFIX) === 0 && k !== DAAN.DAY_PREFIX + keep) props.deleteProperty(k);
  });
}

/* ------------------------------------------------------------------ his dropdown runs */

/* daanProbe — read-only. Pick it in the dropdown, Run, then read the log: it answers
   "is the mail path installed, and what has it already sent today?" without emailing. */
function daanProbe() {
  const props = PropertiesService.getScriptProperties();
  const map = daanAcks_();
  Logger.log('DaanMail config: to=' + DAAN.TO.join(',') + ' cc=' + (DAAN.CC.join(',') || 'walang cc') +
    ' DRY_RUN=' + DAAN.DRY_RUN + ' subject=' + DAAN.SUBJECT);
  Logger.log('guardrails: max ' + DAAN.MAX_KB + ' KB, ' + DAAN.MAX_PER_DAY + ' mail/araw, 1 bawat ' +
    DAAN.GAP_SEC + 's, name >= ' + DAAN.MIN_CHARS + ' letters');
  Logger.log('doPost may-ari ng project na ito? ' + (typeof doPost === 'function' ? 'oo' : 'HINDI — walang DaanMail.gs'));
  Logger.log('doGet may daanAck line na? ' + (String(doGet).indexOf('daanAck') >= 0 ? 'OO' :
    'HINDI — idagdag ang isang linya sa doGet ng AgentNotices.gs, pagkatapos i-redeploy'));
  Logger.log('MailApp quota ngayon: ' + MailApp.getRemainingDailyQuota() + ' | today counter: ' +
    (props.getProperty(DAAN.DAY_PREFIX + today_()) || 0));
  const ks = Object.keys(map).sort((a, b) => map[b].t - map[a].t).slice(0, 8);
  Logger.log('receipts na huli (' + Object.keys(map).length + ' lahat):');
  ks.forEach(k => Logger.log('  ' + k + ' -> ' + JSON.stringify(map[k])));
  if (!ks.length) Logger.log('  wala pa — walang nag-SEND mula pa noong huling deploy');
}

/* Both the real SEND and the sample run leave through here, so the address, the inline
   picture and the attachment can never drift apart between the two. */
function daanSend_(m, pic, to, label) {
  const opt = { to: [].concat(to).join(','), name: DAAN.SENDER_NAME, subject: (label || '') + m.subject,
    body: m.text, htmlBody: m.html, attachments: [pic], inlineImages: { 'daan-map': pic } };
  if (DAAN.CC.length) opt.cc = DAAN.CC.join(',');
  MailApp.sendEmail(opt);
  return opt;
}


/* daanTestMail — mails the shape of the notice with a placeholder picture so he can
   read the wording before a real agent SEND is ever judged. Nothing from the dashboard. */
function daanTestMail() {
  const got = UrlFetchApp.fetch(DAAN.SAMPLE_LOGO, { muteHttpExceptions: true });
  const code = got.getResponseCode ? got.getResponseCode() : 200;
  if (code !== 200) throw new Error('sample picture could not be downloaded (HTTP ' + code + ')');
  const pic = Utilities.newBlob(got.getBytes(), got.getType() || 'image/jpeg', 'daan-SAMPLE.jpg');
  const info = { cafac: 'IMULP012NP1', name: 'JUAN DELA CRUZ (SAMPLE)', place: 'ANABU 2-A · IMUS',
    km: '3.48 km', points: 5, straight: '934 m', cafll: '120.936500 14.384500',
    bahll: '120.940200 14.392100', by: 'SAMPLE RUN', at: now_(), dev: 'daanTestMail()' };
  const m = daanMail_(info, info.cafac, info.name);
  const opt = daanSend_(m, pic, DAAN.TO.length ? DAAN.TO : NOTICE.ADMIN_EMAILS, '[SAMPLE] ');
  Logger.log('DaanTestMail: isang sample mail ang naipadala kay ' + opt.to + ' | quota left '
    + MailApp.getRemainingDailyQuota() + '\n\n' + m.text);
  return { to: opt.to, subject: opt.subject, kb: Math.round(got.getBytes().length * 0.75 / 1024) };
}


/* daanClearReceipts — empties the poll receipts (and the per-day counter) when testing. */
function daanClearReceipts() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(DAAN.ACK_PREFIX + 'MAP');
  props.deleteProperty(DAAN.LAST_KEY);
  cleanDaanDays_(props, '');
  Logger.log('DaanMail: mga receipt at counter, pinalinis.');
}
