/* Core pure logic — no DOM. Tested by test.js in Node. */
(function (root) {
  'use strict';
  const L = {};

  // ---------- Jalali calendar (jalaali algorithm) ----------
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const div = (a, b) => ~~(a / b);
  const mod = (a, b) => a - ~~(a / b) * b;
  function jalCal(jy) {
    const bl = breaks.length, gy = jy + 621;
    let leapJ = -14, jp = breaks[0], jm, jump = 0, leap, n, i;
    if (jy < jp || jy >= breaks[bl - 1]) throw new Error('Invalid Jalali year ' + jy);
    for (i = 1; i < bl; i += 1) {
      jm = breaks[i]; jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }
  function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }
  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
  }
  function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }
  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    const jdn1f = g2d(gy, 3, r.march);
    let k = jdn - jdn1f, jm, jd;
    if (k >= 0) {
      if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy, jm, jd }; }
      k -= 186;
    } else {
      jy -= 1; k += 179;
      if (r.leap === 1) k += 1;
    }
    jm = 7 + div(k, 30); jd = mod(k, 30) + 1;
    return { jy, jm, jd };
  }
  L.toJalali = (gy, gm, gd) => d2j(g2d(gy, gm, gd));
  L.toGregorian = (jy, jm, jd) => d2g(j2d(jy, jm, jd));
  L.isValidJalali = (jy, jm, jd) => {
    if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd)) return false;
    if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1) return false;
    const len = jm <= 6 ? 31 : jm <= 11 ? 30 : (jalCal(jy).leap === 0 ? 30 : 29);
    return jd <= len;
  };
  L.monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

  // Local date key 'YYYY-MM-DD' (device time zone)
  const pad = (n) => String(n).padStart(2, '0');
  L.dateKey = (d) => { d = d instanceof Date ? d : new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  L.keyToJalali = (key) => { const [y, m, d] = key.split('-').map(Number); return L.toJalali(y, m, d); };
  L.jalaliToKey = (jy, jm, jd) => { const g = L.toGregorian(jy, jm, jd); return g.gy + '-' + pad(g.gm) + '-' + pad(g.gd); };
  // Whole days from key a to key b (calendar days, DST-safe)
  L.daysBetween = (a, b) => {
    const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  };

  // ---------- Test scoring ----------
  // Returns null when there is nothing to compute ("داده ندارم").
  L.pctRaw = (correct, total) => {
    if (!total || total <= 0) return null;
    return (correct / total) * 100;
  };
  // Negative marking: each wrong answer cancels 1/ratio of a correct one.
  L.pctNeg = (correct, wrong, total, ratio) => {
    if (!total || total <= 0) return null;
    if (!ratio || ratio <= 0) return L.pctRaw(correct, total);
    return ((correct - wrong / ratio) / total) * 100;
  };
  L.validateTest = (t) => {
    const errs = [];
    const f = ['count', 'correct', 'wrong', 'blank'];
    for (const k of f) if (!Number.isInteger(t[k]) || t[k] < 0) errs.push(k);
    if (errs.length) return { ok: false, msg: 'همه‌ی اعداد باید صحیح و نامنفی باشند.' };
    if (t.count === 0) return { ok: false, msg: 'تعداد تست باید بیشتر از صفر باشد.' };
    if (t.correct + t.wrong + t.blank !== t.count) return { ok: false, msg: 'مجموع صحیح، غلط و نزده باید برابر تعداد تست باشد.' };
    return { ok: true };
  };
  // Normalise a test entry. Accepts count + (correct | pct) + optional wrong.
  L.normTest = (raw) => {
    const count = raw.count, wrong = raw.wrong == null ? null : raw.wrong;
    let correct = raw.correct == null ? null : raw.correct;
    if (!Number.isInteger(count) || count <= 0) return { ok: false, msg: 'تعداد تست باید عدد صحیح بیشتر از صفر باشد.' };
    if (correct == null && raw.pct != null) {
      if (!Number.isFinite(raw.pct) || raw.pct < 0 || raw.pct > 100) return { ok: false, msg: 'درصد باید بین ۰ تا ۱۰۰ باشد.' };
      correct = Math.round((raw.pct * count) / 100);
    }
    if (!Number.isInteger(correct) || correct < 0) return { ok: false, msg: 'تعداد صحیح یا درصد را وارد کنید.' };
    if (correct > count) return { ok: false, msg: 'تعداد صحیح از کل تست‌ها بیشتر است.' };
    if (wrong != null && (!Number.isInteger(wrong) || wrong < 0 || correct + wrong > count)) return { ok: false, msg: 'مجموع صحیح و غلط از کل تست‌ها بیشتر است.' };
    return { ok: true, test: { count, correct, wrong, blank: wrong == null ? null : count - correct - wrong } };
  };
  // Compare two rounds: percent and study time. Rule: less time only counts as progress if accuracy held.
  L.compareRounds = (prev, cur) => {
    if (!prev || !cur || prev.pct == null || cur.pct == null) return null;
    const dp = cur.pct - prev.pct, dt = (cur.studySec || 0) - (prev.studySec || 0);
    let verdict;
    if (dp >= 0 && dt < 0) verdict = 'faster';           // less time, accuracy held or better
    else if (dp > 0) verdict = 'better';                 // more accurate
    else if (dp < 0 && dt < 0) verdict = 'rushed';       // less time but lost accuracy
    else if (dp < 0) verdict = 'worse';
    else verdict = 'same';
    return { dp, dt, verdict };
  };

  // Method A mastery status from percent and thresholds (percent of total)
  L.masteryStatus = (pct, masteryPct, reviewPct) => {
    if (pct == null) return null;
    if (pct >= masteryPct - 1e-9) return 'mastered';
    if (pct >= reviewPct - 1e-9) return 'targeted';
    return 'repeat';
  };
  L.sumTests = (tests) => {
    const s = { count: 0, correct: 0, wrong: 0, blank: 0, seconds: 0 };
    for (const t of tests || []) { s.count += t.count; s.correct += t.correct; s.wrong += t.wrong; s.blank += t.blank; s.seconds += t.seconds || 0; }
    return s;
  };

  // ---------- Batch chapter input ----------
  // Each line = one chapter; any indentation (spaces/tabs) = sub-chapter of the previous top-level line.
  L.parseBatch = (text) => {
    const out = [];
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    let haveParent = false;
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const m = raw.match(/^[\t  ]*/)[0];
      const indent = m.replace(/\t/g, '    ').length;
      const title = raw.trim().replace(/^[-*•–]\s*/, '').trim();
      if (!title) continue;
      let level = indent > 0 ? 1 : 0;
      if (level === 1 && !haveParent) level = 0;
      if (level === 0) haveParent = true;
      out.push({ title, level });
    }
    return out;
  };

  // ---------- Digits ----------
  L.toEnDigits = (s) => String(s == null ? '' : s)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  L.parseIntSafe = (s) => {
    const t = L.toEnDigits(s).trim();
    if (t === '') return null;
    if (!/^-?\d+$/.test(t)) return NaN;
    return parseInt(t, 10);
  };
  L.parseNum = (s) => {
    const t = L.toEnDigits(s).trim().replace('٫', '.').replace('/', '.');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  };

  // ---------- Self-test (shown inside the app) ----------
  L.selfTest = () => {
    const r = [];
    const eq = (name, a, b) => r.push({ name, ok: JSON.stringify(a) === JSON.stringify(b), got: a, want: b });
    const near = (name, a, b) => r.push({ name, ok: a != null && Math.abs(a - b) < 1e-9, got: a, want: b });
    eq('۲۰۲۶/۱۱/۰۵ ← ۱۴ آبان ۱۴۰۵', L.toJalali(2026, 11, 5), { jy: 1405, jm: 8, jd: 14 });
    eq('۱۱ بهمن ۱۴۰۵ ← ۲۰۲۷/۰۱/۳۱', L.toGregorian(1405, 11, 11), { gy: 2027, gm: 1, gd: 31 });
    eq('نوروز ۱۴۰۵ ← ۲۰۲۶/۰۳/۲۱', L.toGregorian(1405, 1, 1), { gy: 2026, gm: 3, gd: 21 });
    eq('فاصله‌ی ۱۴ آبان تا ۱۱ بهمن', L.daysBetween('2026-11-05', '2027-01-31'), 87);
    near('درصد خام ۱۸ از ۲۰', L.pctRaw(18, 20), 90);
    near('درصد خام ۰ از ۲۰', L.pctRaw(0, 20), 0);
    eq('درصد بدون تست = داده ندارم', L.pctRaw(0, 0), null);
    near('نمره منفی ۱۵ صحیح، ۳ غلط، از ۲۰، ضریب ۳', L.pctNeg(15, 3, 20, 3), 70);
    near('نمره منفی ۱۰ صحیح، ۱۰ غلط، ضریب ۴', L.pctNeg(10, 10, 20, 4), 37.5);
    eq('۱۸ از ۲۰ = تسلط مطلوب', L.masteryStatus(90, 90, 75), 'mastered');
    eq('۱۷ از ۲۰ = مرور هدفمند', L.masteryStatus(85, 90, 75), 'targeted');
    eq('۱۵ از ۲۰ = مرور هدفمند', L.masteryStatus(75, 90, 75), 'targeted');
    eq('۱۴ از ۲۰ = تکرار چرخه', L.masteryStatus(70, 90, 75), 'repeat');
    eq('اعتبارسنجی مجموع', L.validateTest({ count: 20, correct: 15, wrong: 3, blank: 1 }).ok, false);
    eq('اعتبارسنجی صحیح', L.validateTest({ count: 20, correct: 15, wrong: 3, blank: 2 }).ok, true);
    eq('ورود با درصد: ۲۰ تست، ۸۵٪ ← ۱۷ صحیح', L.normTest({ count: 20, pct: 85 }).test.correct, 17);
    eq('صحیح بیشتر از کل رد می‌شود', L.normTest({ count: 20, correct: 21 }).ok, false);
    eq('نزده خودکار: ۲۰ − ۱۵ − ۳', L.normTest({ count: 20, correct: 15, wrong: 3 }).test.blank, 2);
    eq('زمان کمتر با درصد حفظ‌شده = پیشرفت', L.compareRounds({ pct: 80, studySec: 3600 }, { pct: 80, studySec: 2400 }).verdict, 'faster');
    eq('زمان کمتر با افت درصد ≠ پیشرفت', L.compareRounds({ pct: 80, studySec: 3600 }, { pct: 70, studySec: 2400 }).verdict, 'rushed');
    eq('ورود دسته‌ای با تورفتگی', L.parseBatch('فصل ۱\n  بخش الف\n\tبخش ب\nفصل ۲'), [
      { title: 'فصل ۱', level: 0 }, { title: 'بخش الف', level: 1 }, { title: 'بخش ب', level: 1 }, { title: 'فصل ۲', level: 0 }]);
    eq('ارقام فارسی به انگلیسی', L.toEnDigits('۱۲۳٤'), '1234');
    return r;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  else root.L = L;
})(typeof window !== 'undefined' ? window : globalThis);
