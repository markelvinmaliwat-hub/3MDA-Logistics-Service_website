/* AorProbe.gs — READ-ONLY scout for the "NOT AOR" question the owner asked on 2026-11-11:
   "SA AFD EMAIL MAARI MO BA ISAMA ANG NOT AOR PERO VAVALIDATE MO ANG CLUSTER NILA GAMIT ANG
    CLUSTER TAB SA SHEET?"

   What the owner actually asked for, restated by him on 2026-11-11 after a first misread:
     a NEW email of its own for the NOT AOR rows - not a change to the cluster-11/cluster-12 AFD mails.
     Each row's BARANGAY + CITY is first validated against the CLUSTER tab, the cluster that tab names
     is what the mail reports, and the recipients stay exactly the same addresses as the AFD mail.

   What it answers, in one Logger run, using only reads:
     1. Every tab in "DATABASE AUG TO OCT" with its size, and which of them COULD be the cluster table.
     2. If such a tab exists: its header, 15 real rows, which column holds cluster values, and an index
        of CITY + BRGY (together, both orders, raw and normalized) to those cluster values - that is
        the join his rule needs, because one barangay name can exist in two towns.
     3. The sales side: the CLUSTER spread, every AFD-tagged row, and for each NOT AOR row whether the
        CLUSTER tab can name its cluster (unique / ambiguous / not found), grouped per cluster so the
        shape of the new mail - how many clusters, how many rows each - is visible before it is built.

   It sends no mail, writes no cell, touches no Script Property, and needs NO deployment: the dropdown
   runs Head code. Run  aorProbe()  and paste the whole log back. */

const AOR = {
  /* The sales file, read from NOTICE when AgentNotices.gs is present so the two never drift apart. */
  SS_ID: (typeof NOTICE !== 'undefined' && NOTICE.SHEET_ID) ? NOTICE.SHEET_ID
                                                          : '1i7g_Hv6_tmQxqGhjSVzQFaJriC3wp9zK3wosnw0',
  SALES: 'PLDT',
  CLUSTER_COL: 'CLUSTER',
  NOT_AOR: 'NOT AOR',
  /* Tab names that could carry the cluster assignment. Deliberately wide - this run is read-only, so a
     false positive costs a few log lines and a missed one costs the whole answer. */
  LOOK: /CLUSTER|AOR|AREA|ZONE|TERRIT|ASSIGN|MAP|GROUP|TEAM/i,
  /* A cluster value as it is typed in a Sheet: 11, "CLUSTER 11", "C11", "11 - SILANG". */
  CLUSTERISH: /^(?:C(?:LUSTER)?\.?\s*)?\d{1,2}(?:\b|$)/i,
  /* AFD rows are the ones the mail is built from, so they get listed in full (this many at most). */
  AFD_MAX: 40,
  SAMPLE: 15, TAB_ROWS: 500, TAB_COLS: 40, LOG_CAP: 46000
};

let aorUsed_ = 0;
function aorLog_(line) {
  const s = String(line).replace(/\s+/g, ' ').slice(0, 900);
  aorUsed_ += s.length + 1;
  if (aorUsed_ <= AOR.LOG_CAP) Logger.log(s);
  else if (!aorLog_.capped) { aorLog_.capped = true; Logger.log('... NAKULIT ANG LOG - tanggalin ang ilan sa AOR.TABS o itaas ang AOR.LOG_CAP'); }
}

/* Its own tab reader: the probe must still work if AgentNotices.gs changes under it. */
function aorTab_(sh, maxRows) {
  const last = Math.min(sh.getLastRow(), maxRows || AOR.TAB_ROWS);
  const cols = Math.min(sh.getLastColumn(), AOR.TAB_COLS);
  if (last < 2 || cols < 2) return { head: [], rows: [] };
  const v = sh.getRange(1, 1, last, cols).getValues();
  let hi = -1;
  for (let i = 0; i < Math.min(10, v.length); i++) {
    const filled = v[i].filter(x => String(x).trim() !== '').length;
    const texty = v[i].filter(x => /[A-Z]{3}/i.test(String(x))).length;
    if (filled >= 2 && texty >= 2) { hi = i; break; }
  }
  if (hi < 0) return { head: [], rows: [] };
  const head = v[hi].map(x => String(x).trim().toUpperCase());
  const rows = v.slice(hi + 1).map(r => {
    const o = {};
    head.forEach((k, j) => { if (k && o[k] === undefined) o[k] = r[j]; });
    return o;
  }).filter(o => Object.keys(o).some(k => String(o[k]).trim() !== ''));
  return { head: head.filter(Boolean), rows: rows };
}

/* Ang dalawang anyo ng isang value na isasalin sa index key: kung ano ang nakasulat, at ang
   normalisadong anyo (walang "BGY ", walang punctuation, iisang espasyo). Kailangan ito dahil ang
   sales tab ay "BGY PALIPARAN 2" samantalang ang karamihan ng cluster table ay "PALIPARAN 2". */
function aorNorm_(s) {
  return String(s === undefined ? '' : s).toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ').trim()
    .replace(/^(?:BRG?Y?|BARANGAY)\s+/, '');
}

/* Isang hiling sa index: eksakto muna ang nakasulat, pagkatapos ang normalisadong anyo. */
function aorHit_(idx, col, val) {
  const by = idx[col]; if (!by) return null;
  const raw = String(val === undefined ? '' : val).trim().toUpperCase();
  if (raw && by[raw]) return by[raw];
  const n = aorNorm_(val); return n && by[n] ? by[n] : null;
}

function aorUp_(s) { return String(s === undefined ? '' : s).trim().toUpperCase(); }

/* Ang eksaktang susi ng rule niya: ang CITY at BRGY ng isang row, magkasama. Parehong anyo
   (CITY|BRGY at BRGY|CITY, hilaw at normalisado) ang idinemanda dahil hindi natin alam pa kung
   anong pagkakasunod ang tab niya. Ang #BRGY lamang ay fallback - mapanganib siyang mag-isa dahil
   iisang pangalan ng barangay ang maaaring nasa dalawang bayan. */
function aorPairKeys_(city, brgy) {
  const c = aorUp_(city), b = aorUp_(brgy);
  if (!c || !b) return [];
  const nc = aorNorm_(c), nb = aorNorm_(b);
  return [c + '|' + b, b + '|' + c, nc + '|' + nb, nb + '|' + nc].filter((k, i, a) => a.indexOf(k) === i);
}
function aorPairHit_(idx, r) {
  const by = idx['#CITY+BRGY']; if (!by) return null;
  const keys = aorPairKeys_(r.CITY, r.BRGY);
  for (let i = 0; i < keys.length; i++) if (by[keys[i]]) return { key: keys[i], vals: Object.keys(by[keys[i]]) };
  return null;
}

/* One candidate tab: dump it, find its cluster column, and index every other column to its clusters. */
function aorReadTab_(sh, idx) {
  const t = aorTab_(sh);
  aorLog_('--- TAB "' + sh.getName() + '" | header row ' + ' | columns (' + t.head.length + '): ' + t.head.join(' | '));
  if (!t.rows.length) { aorLog_('    (walang mabasang row)'); return; }
  t.rows.slice(0, AOR.SAMPLE).forEach((r, i) => {
    aorLog_('    row ' + (i + 1) + ': ' + t.head.map(k => k + '=' + String(r[k] === undefined ? '' : r[k]).trim()).join('  ·  '));
  });
  /* Which column actually carries cluster values? Counted over the whole tab, not the sample.
     Bago ang pagbabagong ito, ang table na mas maliit sa 3 cluster value ay tahimik na tinatanggapan
     ng probe - hindi iyon ang trabaho nito. Kaya ngayon: mababa ang floor (2), at LAGI nang nai-log
     ang 6 pinakamalapit na column, kahit hindi dumapa ang threshold. */
  const scored = [];
  t.head.forEach(k => {
    const c = {};
    t.rows.forEach(r => {
      const v = String(r[k] === undefined ? '' : r[k]).trim();
      if (v && AOR.CLUSTERISH.test(v)) c[v.toUpperCase()] = (c[v.toUpperCase()] || 0) + 1;
    });
    const hits = Object.keys(c).reduce((a, k2) => a + c[k2], 0);
    scored.push({ col: k, hits: hits, list: c });
  });
  scored.sort((a, b) => b.hits - a.hits);
  scored.slice(0, 6).forEach(s => aorLog_('    col "' + s.col + '": cluster-like ' + s.hits + '/' + t.rows.length +
    ' value' + (s.hits ? ' : ' + Object.keys(s.list).sort((a, b) => s.list[b] - s.list[a]).slice(0, 14)
      .map(v => v + '=' + s.list[v]).join(', ') : '')));
  const clusterCols = scored.filter(s => s.hits >= Math.max(2, t.rows.length * 0.02)).map(s => s.col);
  if (!clusterCols.length) aorLog_('    WALANG column dito na may sapat na cluster value - hindi natin gagamitin ang tab na ito (tingnan ang 6 col sa itaas).');
  /* Index every remaining column to the clusters of the same row: that is what a join would use. */
  clusterCols.forEach(ck => {
    t.head.filter(k => k !== ck).forEach(k => {
      const by = idx[k] || (idx[k] = {});
      t.rows.forEach(r => {
        const key = String(r[k] === undefined ? '' : r[k]).trim().toUpperCase();
        const val = String(r[ck] === undefined ? '' : r[ck]).trim().toUpperCase();
        if (!key || !val || key === 'NOT AOR') return;
        [key, aorNorm_(key)].forEach(alt => {
          if (!alt) return;
          (by[alt] || (by[alt] = {}))[val] = (by[alt][val] || 0) + 1;
        });
      });
    });
  });
  /* The join his rule names: CITY + BRGY together -> cluster. */
  const bcol = t.head.filter(k => /BRG|BARANG/.test(k))[0];
  const ccol = t.head.filter(k => /CITY|MUNICIP|TOWN|POB/i.test(k))[0];
  if (bcol && ccol) {
    const by = idx['#CITY+BRGY'] || (idx['#CITY+BRGY'] = {});
    clusterCols.forEach(ck => {
      t.rows.forEach(r => {
        const val = aorUp_(r[ck]);
        if (!val || val === 'NOT AOR') return;
        aorPairKeys_(r[ccol], r[bcol]).forEach(z => {
          (by[z] || (by[z] = {}))[val] = (by[z][val] || 0) + 1;
        });
      });
    });
    aorLog_('    PAIR index: "' + ccol + '" + "' + bcol + '" -> cluster (' +
      Object.keys(by).length + ' na key, ' + clusterCols.join('/') + ' ang cluster column)');
  } else {
    aorLog_('    WALANG parehong BRGY at CITY column sa tab na ito (BRGY=' + (bcol || 'wala') +
      ', CITY=' + (ccol || 'wala') + ') - kaya hindi nito magagawa ang CITY+BRGY validation niya.');
  }
  const distinct = {};
  clusterCols.forEach(ck => t.rows.forEach(r => { const v = aorUp_(r[ck]); if (v) distinct[v] = (distinct[v] || 0) + 1; }));
  aorLog_('    LAHAT ng cluster value dito (' + Object.keys(distinct).length + '): ' +
    Object.keys(distinct).sort((a, b) => distinct[b] - distinct[a]).slice(0, 40).map(v => v + '=' + distinct[v]).join(', '));
}

/* Sales side: the CLUSTER spread, every AFD row, and whether the candidate tab can name a cluster. */
function aorSales_(ss, idx) {
  const t = aorTab_(ss.getSheetByName(AOR.SALES), 5000);
  const up = s => String(s === undefined ? '' : s).trim().toUpperCase();
  const spread = {};
  const notAor = [], afd = [];
  t.rows.forEach(r => {
    const c = up(r[AOR.CLUSTER_COL]);
    spread[c || '(blangko)'] = (spread[c || '(blangko)'] || 0) + 1;
    if (c === AOR.NOT_AOR) notAor.push(r);
    const fs = up(r['FINAL STATUS']);
    if (/AFD/.test(fs) && /RESCHEDULE/.test(fs)) afd.push(r);
  });
  aorLog_('=== ' + AOR.SALES + ' | ' + t.rows.length + ' row | CLUSTER spread: ' +
    Object.keys(spread).sort((a, b) => spread[b] - spread[a]).map(k => k + '=' + spread[k]).join(', '));
  aorLog_('=== AFD + RESCHEDULE sa FINAL STATUS: ' + afd.length + ' row (ang mail mismo ang pinagmumulan) ===');
  afd.slice(0, AOR.AFD_MAX).forEach(r => aorLog_('    ' + up(r[AOR.CLUSTER_COL]) + ' | ' + up(r['CITY']) + ' | ' +
    up(r['BRGY']) + ' | ' + up(r['SUBSCRIBER NAME']).slice(0, 28) + ' | HD=' + up(r['HD RECOMMENDATION']).slice(0, 26) +
    ' | FS=' + up(r['FINAL STATUS']).slice(0, 22) + ' | TL=' + up(r['TEAM LEADER']).slice(0, 18)));
  /* Can the CLUSTER tab name the cluster of a NOT AOR row? His rule first: CITY + BRGY together.
     Ang ibang susi ay fallback lang, para makita kung saan pa posible ang validation. */
  const keys = ['SR', 'PR', 'ACCOUNT PID', 'ACCT', 'SUBSCRIBER NAME', 'SUBDIVISION', 'AGENT CODE', 'BRGY', 'CITY', 'TEAM LEADER'];
  const out = { unique: 0, ambiguous: 0, none: 0, pair: 0 }, detail = {};
  const tried = notAor.slice(0, 60);
  tried.forEach(r => {
    let verdict = null;
    const ph = aorPairHit_(idx, r);
    if (ph) { out.pair++; verdict = { col: 'CITY+BRGY', key: ph.key, vals: ph.vals }; }
    if (!verdict) for (const k of keys) {
      const hits = aorHit_(idx, k, r[k]); if (!hits) continue;
      const vals = Object.keys(hits);
      verdict = { col: k, key: String(r[k]).trim().toUpperCase(), vals: vals }; break;
    }
    if (!verdict) { out.none++; return; }
    if (verdict.vals.length === 1) {
      out.unique++;
      const tag = verdict.col + ' -> ' + verdict.vals[0];
      detail[tag] = (detail[tag] || 0) + 1;
    } else out.ambiguous++;
  });
  aorLog_('=== PAGKA-VALIDATE ng ' + notAor.length + ' NOT AOR row (unang ' + tried.length + ' ang sinubukan) ===');
  aorLog_('    unique=' + out.unique + ' | ambiguous (2+ cluster sa iisang lugar)=' + out.ambiguous +
    ' | hindi natagpuan sa tab=' + out.none + ' | sa CITY+BRGY natagpuan=' + out.pair);
  Object.keys(detail).sort((a, b) => detail[b] - detail[a]).slice(0, 12)
    .forEach(k => aorLog_('    ' + k + '  (' + detail[k] + ' row)'));
  const afdAor = afd.filter(r => up(r[AOR.CLUSTER_COL]) === AOR.NOT_AOR);
  aorLog_('=== HUGIS NG BAGONG MAIL: AFD rows na NOT AOR (' + afdAor.length + ') ===');
  aorLog_('    (iblase sa CITY+BRGY sa CLUSTER tab; ang tatanggap ay IYOONG address ng AFD mail, walang bago)');
  const grouped = {}, noCluster = [];
  afdAor.forEach(r => {
    const ph = aorPairHit_(idx, r);
    const vals = ph ? ph.vals : null;
    if (vals && vals.length === 1) grouped[vals[0]] = (grouped[vals[0]] || 0) + 1;
    else if (vals) noCluster.push({ r: r, why: 'AMBiguO: ' + vals.join(' / ') + ' (key ' + ph.key + ')' });
    else {
      let alt = null;
      for (const k of keys) { const h = aorHit_(idx, k, r[k]); if (h) { const v = Object.keys(h); alt = k + '=' + up(r[k]) + ' -> ' + v.join(' / '); break; } }
      noCluster.push({ r: r, why: alt || 'hindi natagpuan sa cluster tab' });
    }
  });
  const gk = Object.keys(grouped).sort((a, b) => grouped[b] - grouped[a]);
  aorLog_('    ' + (gk.length ? gk.length + ' cluster ang mabubuo: ' + gk.map(k => k + '=' + grouped[k] + ' row').join(', ')
    : 'WALANG ma-group - hindi pa kayang i-validate ng CLUSTER tab ang mga row na ito'));
  noCluster.slice(0, AOR.SAMPLE).forEach(x => aorLog_('    HINDI NA-VALIDATE | ' + up(x.r['BRGY']) + ', ' + up(x.r['CITY']) +
    ' | ' + up(x.r['SUBSCRIBER NAME']).slice(0, 26) + ' | ' + x.why));
  if (noCluster.length > AOR.SAMPLE) aorLog_('    … at ' + (noCluster.length - AOR.SAMPLE) + ' pa pang hindi na-validate.');
  aorLog_('=== DETALYE ng bawat AFD+NOT AOR row (' + afdAor.length + ') ===');
  afdAor.forEach(r => {
    let found = 'hindi natagpuan sa cluster tab';
    const ph = aorPairHit_(idx, r);
    if (ph) found = 'CITY+BRGY(' + ph.key + ') -> ' + ph.vals.join(' / ');
    else for (const k of keys) {
      const hits = aorHit_(idx, k, r[k]); if (!hits) continue;
      found = k + '=' + up(r[k]) + ' -> ' + Object.keys(hits).join(' / '); break;
    }
    aorLog_('    ' + up(r['SUBSCRIBER NAME']) + ' | ' + up(r['BRGY']) + ', ' + up(r['CITY']) + ' | SR=' + up(r['SR']) +
      ' PR=' + up(r['PR']) + ' | HD=' + up(r['HD RECOMMENDATION']) + ' | ' + found);
  });
  if (!Object.keys(idx).length) aorLog_('    PAALALA: walang candidate tab na nahanap, kaya waling index. Sabihin sa AOR.LOOK ang exact na pangalan ng tab mo.');
}

function aorProbe() {
  aorUsed_ = 0; aorLog_.capped = false;
  let ss;
  try { ss = SpreadsheetApp.openById(AOR.SS_ID); }
  catch (e) { Logger.log('AOR PROBE | hindi mabuksan ang file: ' + e); return 'hindi nabuksan'; }
  aorLog_('AOR PROBE | ' + new Date().toString() + ' | file: ' + ss.getName() + ' | walang na-email, walang nasulat');
  const tabs = ss.getSheets();
  aorLog_('ALL TABS: ' + tabs.map(s => s.getName() + '=' + Math.max(0, s.getLastRow() - 1) + 'r/' + s.getLastColumn() + 'c').join(', '));
  const cand = tabs.filter(s => AOR.LOOK.test(s.getName()));
  aorLog_('CANDIDATE cluster tabs (' + cand.length + '): ' + (cand.map(s => s.getName()).join(', ') || 'WALA - i-edit ang AOR.LOOK o sabihin mo ang exact na pangalan ng tab'));
  const idx = {};
  cand.forEach(sh => aorReadTab_(sh, idx));
  aorSales_(ss, idx);
  aorLog_('TAPOS. I-paste ang BUONG log (View > Logs) para masabayan natin ang cluster filter ng AFD mail.');
  return 'tapos - buksan ang View > Logs';
}
