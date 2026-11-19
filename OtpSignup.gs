/* =====================================================================
   OtpSignup.gs  -  email OTP sa sign up (walang agent code)
   Gumawa ng BAGONG file sa Apps Script (+ > Script), pangalanan ng OtpSignup,
   i-paste ang BUONG laman nito, at i-save. Walang ibang binabago dito.
   Isang linya lang ang idadagdag sa AgentNotices.gs (nasa mensahe ko).
   ===================================================================== */

const SU = {
  TTL_MIN: 10,                 // tagal ng bisa ng OTP
  MAX_TRIES: 5,                // maling subok bago ma-lock ang code
  MAX_SENDS_PER_EMAIL: 5,      // ilang OTP bawat email kada ~6 oras
  MAX_SENDS_TOTAL: 40          // ilang sign-up OTP kada araw, lahat ng email
};

/* Ang OTP at ang pending hash ay nasa CacheService (hindi sa sheet) at hindi kailanman ibinabalik sa browser. */
const suKey_ = (pre, email) => pre + Utilities.base64EncodeWebSafe(
  Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email)).slice(0, 40);

/* Tinatawag ng acctOp_() para sa op = signupcode at create. */
function acctSignupOp_(sh, op, email, p, o) {
  if (o) return { ok: false, reason: 'exists' };
  if (!acctHash_(p.h)) return { ok: false, reason: 'badhash' };
  if (sh.getLastRow() >= ACCT.MAX_ROWS) return { ok: false, reason: 'full' };
  if (op === 'signupcode') return acctSignupCode_(email, String(p.h));
  const bad = acctSignupOk_(email, p);          /* kailangan ang tamang OTP - walang bypass */
  if (bad) return bad;
  sh.appendRow([email, String(p.h), '', '', '', '', 0, 0, 0, '']);
  return { ok: true };
}

function acctSignupCode_(email, h) {
  if (MailApp.getRemainingDailyQuota() < ACCT.QUOTA_FLOOR) return { ok: false, reason: 'quota' };
  const props = PropertiesService.getScriptProperties();
  const dayKey = 'SU_DAY_' + today_().replace(/-/g, '');
  const total = Number(props.getProperty(dayKey) || 0);
  if (total >= SU.MAX_SENDS_TOTAL) return { ok: false, reason: 'quota' };
  const cache = CacheService.getScriptCache();
  const nKey = suKey_('SUN_', email);
  const sent = Number(cache.get(nKey) || 0);
  if (sent >= SU.MAX_SENDS_PER_EMAIL) return { ok: false, reason: 'wait' };
  const code = acctCode_();
  cache.put(suKey_('SU_', email), JSON.stringify({ c: code, h: h, exp: Date.now() + SU.TTL_MIN * 60000, tries: 0 }), 21600);
  cache.put(nKey, String(sent + 1), 21600);
  if (!acctSignupMail_(email, code)) return { ok: false, reason: 'nomail' };
  props.setProperty(dayKey, String(total + 1));
  Object.keys(props.getProperties()).forEach(k => { if (k.indexOf('SU_DAY_') === 0 && k !== dayKey) props.deleteProperty(k); });
  return { ok: true };
}

/* null kapag tama ang OTP (at nasunog na ito); kung hindi, {ok:false, reason, left}. */
function acctSignupOk_(email, p) {
  const cache = CacheService.getScriptCache(), key = suKey_('SU_', email);
  let s = null;
  try { s = JSON.parse(String(cache.get(key) || 'null')); } catch (e) { s = null; }
  if (!s || !s.c) return { ok: false, reason: 'nocode' };
  if (s.tries >= SU.MAX_TRIES) return { ok: false, reason: 'locked' };
  if (s.exp < Date.now()) return { ok: false, reason: 'expired' };
  if (String(p.h || '') !== s.h) return { ok: false, reason: 'badhash' };
  const c = String(p.otp || '').replace(/\D/g, '');
  if (c.length !== 6 || c !== s.c) {
    s.tries += 1;
    cache.put(key, JSON.stringify(s), 21600);
    return { ok: false, reason: 'badcode', left: Math.max(0, SU.MAX_TRIES - s.tries) };
  }
  cache.remove(key);
  return null;
}

function acctSignupMail_(email, code) {
  const to = NOTICE.DRY_RUN ? NOTICE.ADMIN_EMAILS.join(',') : email;
  if (!to) return false;
  MailApp.sendEmail({
    to: to,
    name: NOTICE.SENDER_NAME,
    subject: (NOTICE.DRY_RUN ? '[TEST for ' + email + '] ' : '') + 'Your sign-up OTP - 3MDA Logistics',
    body: [
      'Dear Agent,',
      '',
      'A request to create a 3MDA Logistics dashboard account for ' + email + ' has been received.',
      '',
      'Your OTP is:  ' + code,
      '',
      'This code is valid for ' + SU.TTL_MIN + ' minutes. Enter it on the sign-up page to finish creating your account.',
      '',
      'If you did not make this request, you can ignore this email - no account will be created. Please keep this code private.',
      '',
      NT_.REGARDS,
      NOTICE.SENDER_NAME,
      '',
      'Automated message from the 3MDA Logistics dashboard. Please do not reply to this email.'
    ].join('\n')
  });
  return true;
}
