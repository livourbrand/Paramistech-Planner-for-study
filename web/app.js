/* Study planner — time, tests and round-by-round comparison per chapter. Vanilla JS, local-first + private cloud sync. */
(function () {
  'use strict';
  const SCHEMA = 2;
  const KEY = 'konkur-dr-study-v1';
  const BIN_DAYS = 30;

  // ---------- helpers ----------
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const faD = (s) => String(s == null ? '' : s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const fa = (n, dec) => (n == null || Number.isNaN(n)) ? '—' : Number(n).toLocaleString('fa-IR', { maximumFractionDigits: dec == null ? 0 : dec });
  const pctTxt = (p) => p == null ? 'داده ندارم' : fa(p, 1) + '٪';
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const nowIso = () => new Date().toISOString();
  const todayKey = () => L.dateKey(new Date());
  const live = (arr) => arr.filter((x) => !x.deletedAt);
  const byId = (arr, id) => arr.find((x) => x.id === id);
  const WD = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  const WD_ORDER = [6, 0, 1, 2, 3, 4, 5]; // Saturday first
  function fmtJ(key, withWd) { if (!key) return '—'; const j = L.keyToJalali(key); const [y, m, d] = key.split('-').map(Number); return (withWd ? WD[new Date(y, m - 1, d).getDay()] + ' ' : '') + faD(j.jd) + ' ' + L.monthNames[j.jm - 1] + (withWd ? '' : ' ' + faD(j.jy)); }
  function fmtJIso(iso) { return iso ? fmtJ(L.dateKey(new Date(iso))) : '—'; }
  function addDays(key, n) { const [y, m, d] = key.split('-').map(Number); return L.dateKey(new Date(y, m - 1, d + n)); }
  function wdOf(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getDay(); }
  function weekStart(key) { const wd = wdOf(key); return addDays(key, -((wd + 1) % 7)); } // Saturday
  function fmtClock(ms) { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; const p = (n) => String(n).padStart(2, '0'); return faD((h ? h + ':' : '') + p(m) + ':' + p(x)); }
  function fmtDur(sec) { sec = Math.round(sec || 0); if (sec < 60) return sec ? fa(sec) + ' ثانیه' : '۰'; const m = Math.round(sec / 60); if (m < 60) return fa(m) + ' دقیقه'; const h = Math.floor(m / 60), r = m % 60; return fa(h) + ' ساعت' + (r ? ' و ' + fa(r) + ' دقیقه' : ''); }
  function fmtMin(sec) { return fa(Math.round((sec || 0) / 60)) + '′'; }
  function hmTime(iso) { const d = new Date(iso); return faD(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')); }
  const SVG = (p) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  const ICON = {
    today: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    plan: SVG('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    book: SVG('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M20 17v4H6.5A2.5 2.5 0 0 1 4 19.5"/>'),
    stats: SVG('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
    more: SVG('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
    back: SVG('<path d="M9 18l6-6-6-6"/>'),
    edit: SVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    up: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 15l-6-6-6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
    prev: SVG('<path d="M9 18l6-6-6-6"/>'), next: SVG('<path d="M15 18l-6-6 6-6"/>'),
  };
  const PRI = { high: 'بالا', mid: 'متوسط', low: 'پایین', excluded: 'حذف از برنامه' };
  const STATUS = { mastered: ['تسلط مطلوب', 'ok'], targeted: ['مرور هدفمند', 'warn'], repeat: ['تکرار چرخه', 'bad'] };
  const VERDICT = { faster: ['پیشرفت: زمان کمتر، دقت حفظ شد', 'ok'], better: ['درصد بهتر', 'ok'], rushed: ['زمان کمتر ولی افت درصد', 'bad'], worse: ['افت درصد', 'bad'], same: ['بدون تغییر', ''] };
  const STEP_LABEL = { study: 'مطالعه', test: 'تست', result: 'نتیجه', lang: 'آزمون', scan: 'مطالعه', restudy: 'مطالعه', deep: 'مطالعه', worked: 'مطالعه', resolve: 'مطالعه', similar: 'تست', quick: 'ثبت سریع' };
  const STUDY_STEPS = ['study', 'scan', 'restudy', 'deep', 'worked', 'resolve'];
  const COLORS = ['#2F4EBF', '#3B5BA9', '#8A4FB0', '#B0533B', '#B08A1E', '#2E7D32', '#6B6B66', '#C2185B'];

  // ---------- state ----------
  const MGMT_COMMON = [['زبان انگلیسی', 'test'], ['آمار و کاربرد در مدیریت', 'chapter'], ['مبانی سازمان و مدیریت', 'chapter'], ['مدیریت از دیدگاه اسلام', 'chapter']];
  const TEMPLATES = [
    { id: 'mgmt1', exam: 'کنکور دکتری مدیریت', track: 'ترکیب ۱ · بازرگانی و راهبردی', color: '#2F4EBF', extra: [['بازاریابی پیشرفته و مدیریت بازار', 'chapter']] },
    { id: 'mgmt5', exam: 'کنکور دکتری مدیریت', track: 'ترکیب ۵ · فناوری اطلاعات', color: '#14B88A', extra: [['سیستم‌های اطلاعات مدیریت پیشرفته', 'chapter']] },
    { id: 'mgmt6', exam: 'کنکور دکتری مدیریت', track: 'ترکیب ۶ · کارآفرینی', color: '#FF7A45', extra: [['نظریه‌های کارآفرینی و تئوری‌های نوآوری', 'chapter']] },
  ];
  function defaultState() {
    return {
      app: 'konkur-dr-study', schema: SCHEMA, updatedAt: 0,
      settings: { onboarded: false, examDate: '2027-01-31', testCount: 20, masteryPct: 90, reviewPct: 75, negOn: false, negRatio: 3, theme: 'auto', lastBackupAt: null, examName: '', track: '', groupLabel: 'گرایش', preset: '', introDone: false, seenTips: {}, checklistHidden: false, capacity: [360, 360, 360, 360, 360, 240, 360] },
      combos: [], courses: [], books: [], chapters: [], rounds: [], sessions: [], langLogs: [], plans: [], audit: [], timer: null,
    };
  }
  function applyTemplate(st, tpl) {
    const t = nowIso(); const list = MGMT_COMMON.concat(tpl.extra);
    st.settings.preset = tpl.id; st.settings.examName = tpl.exam; st.settings.track = tpl.track; st.combos = [];
    st.courses = list.map(([name, type], i) => ({ id: uid(), name, type, color: COLORS[i % COLORS.length], combos: [], coef: {}, archived: false, order: i, createdAt: t, updatedAt: t, deletedAt: null }));
  }
  function migrate(o) {
    if (!o || o.app !== 'konkur-dr-study') throw new Error('فایل متعلق به این اپ نیست.');
    if (typeof o.schema !== 'number' || o.schema > SCHEMA) throw new Error('نسخه‌ی فایل با این نسخه‌ی اپ سازگار نیست.');
    const d = defaultState();
    o.settings = Object.assign({}, d.settings, o.settings || {});
    for (const k of ['combos', 'courses', 'books', 'chapters', 'rounds', 'sessions', 'langLogs', 'plans', 'audit']) if (!Array.isArray(o[k])) o[k] = [];
    if (o.schema < 2) {
      o.courses.forEach((c) => { if (c.type !== 'test') { c.prevType = c.type; c.type = 'chapter'; } });
      o.rounds.forEach((r) => { if (r.status === 'active' && !['study', 'test', 'result'].includes(r.step)) r.step = (r.tests && r.tests.length) ? 'result' : 'study'; });
      if (o.timer && o.timer.step && STUDY_STEPS.includes(o.timer.step)) o.timer.step = 'study';
      if (o.timer && o.timer.step === 'similar') o.timer.step = 'test';
    }
    if (o.settings.onboarded && o.settings.introDone === false && !o.settings.seenTips) o.settings.introDone = true;
    if (!o.settings.seenTips) o.settings.seenTips = {};
    o.schema = SCHEMA;
    return o;
  }
  const ROOT_KEY = 'masir-v1';
  let S; let ROOT; let localOk = true;
  function newRoot() { return { app: 'masir', rschema: 1, updatedAt: 0, active: null, freeProgram: null, programs: [], data: {}, pro: null }; }
  function programTitleFrom(st) { return (st.settings.examName || 'برنامه‌ی جدید') + (st.settings.track ? ' · ' + st.settings.track : ''); }
  function migrateRoot(o) {
    if (o && o.app === 'konkur-dr-study') { const st = migrate(o); const r = newRoot(); const id = uid(); r.programs.push({ id, title: programTitleFrom(st), createdAt: nowIso() }); r.data[id] = st; r.active = id; r.freeProgram = id; r.updatedAt = st.updatedAt || 0; return r; }
    if (!o || o.app !== 'masir') throw new Error('فایل متعلق به این اپ نیست.');
    if (!Array.isArray(o.programs)) o.programs = []; o.data = o.data || {};
    o.programs = o.programs.filter((p) => o.data[p.id]); o.programs.forEach((p) => { o.data[p.id] = migrate(o.data[p.id]); });
    if (!o.programs.length) { const id = uid(); o.programs.push({ id, title: 'برنامه‌ی جدید', createdAt: nowIso() }); o.data[id] = defaultState(); }
    if (!o.data[o.active]) o.active = o.programs[0].id;
    if (!o.freeProgram || !o.data[o.freeProgram]) o.freeProgram = o.programs[0].id;
    return o;
  }
  function loadLocal() {
    try {
      const raw = localStorage.getItem(ROOT_KEY); if (raw) { ROOT = migrateRoot(JSON.parse(raw)); S = ROOT.data[ROOT.active]; return; }
      const old = localStorage.getItem(KEY); if (old) { ROOT = migrateRoot(JSON.parse(old)); S = ROOT.data[ROOT.active]; writeLocal(); return; }
    } catch (e) { localOk = false; }
    ROOT = migrateRoot(newRoot()); S = ROOT.data[ROOT.active];
  }
  function writeLocal() { try { localStorage.setItem(ROOT_KEY, JSON.stringify(ROOT)); localOk = true; } catch (e) { localOk = false; } }
  const curProgram = () => ROOT.programs.find((p) => p.id === ROOT.active);
  function save() { S.updatedAt = Date.now(); ROOT.data[ROOT.active] = S; const pr = curProgram(); if (pr && S.settings.onboarded) pr.title = programTitleFrom(S); ROOT.updatedAt = S.updatedAt; writeLocal(); Cloud.schedule(); }
  const isPro = () => !!(ROOT.pro && ROOT.pro.until > Date.now());
  const programLocked = () => !isPro() && ROOT.active !== ROOT.freeProgram && ROOT.programs.length > 1;
  function audit(kind, detail) { S.audit.push({ id: uid(), at: nowIso(), kind, detail }); if (S.audit.length > 500) S.audit.splice(0, S.audit.length - 500); }
  function purgeBin() {
    const lim = Date.now() - BIN_DAYS * 86400000; let n = 0;
    for (const k of ['courses', 'books', 'chapters']) { const before = S[k].length; S[k] = S[k].filter((x) => !x.deletedAt || new Date(x.deletedAt).getTime() > lim); n += before - S[k].length; }
    if (n) { audit('purge', fa(n) + ' مورد پس از ۳۰ روز از سطل بازیافت پاک شد'); save(); }
  }

  // ---------- cloud sync (owner's private subtree) ----------
  const CHUNK = 60000;
  const Cloud = {
    db: null, uid: null, status: 'connecting', lastAt: null, last: {}, t: null, busy: false, dirty: false, err: '',
    async init() {
      try {
        if (!window.claude || typeof window.claude.use !== 'function') { this.status = 'off'; return refreshSync(); }
        const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
        if (!db || !user) { this.status = 'off'; return refreshSync(); }
        const id = await user.id(); if (!id) { this.status = 'off'; return refreshSync(); }
        this.db = db; this.uid = id; await this.pull();
      } catch (e) { this.status = 'error'; this.err = (e && (e.code || e.message)) || ''; }
      refreshSync();
    },
    col() { return this.db.collection('data/users/' + this.uid); },
    async pull() {
      const meta = await timeout(this.col().doc('state-meta').get(), 12000);
      if (meta.exists) {
        const m = meta.data();
        if ((m.updatedAt || 0) > (ROOT.updatedAt || 0)) {
          const parts = [];
          for (let i = 0; i < m.n; i++) { const d = await this.col().doc('state-' + i).get(); if (!d.exists) throw new Error('chunk'); parts.push(d.data().s); this.last[i] = d.data().s; }
          ROOT = migrateRoot(JSON.parse(parts.join(''))); S = ROOT.data[ROOT.active]; ob = null; writeLocal(); render(); toast('داده‌ها از حساب شما بارگذاری شد');
        } else if ((ROOT.updatedAt || 0) > (m.updatedAt || 0)) this.schedule(0);
      } else if (S.settings.onboarded) this.schedule(0);
      this.status = 'on'; this.lastAt = Date.now();
    },
    schedule(delay) { if (!this.db) return; this.dirty = true; clearTimeout(this.t); this.t = setTimeout(() => this.push(), delay == null ? 2500 : delay); },
    async push() {
      if (this.busy) { this.t = setTimeout(() => this.push(), 1500); return; }
      this.busy = true; this.dirty = false;
      try {
        const str = JSON.stringify(ROOT); const n = Math.max(1, Math.ceil(str.length / CHUNK));
        for (let i = 0; i < n; i++) { const part = str.slice(i * CHUNK, (i + 1) * CHUNK); if (this.last[i] !== part) { await this.col().doc('state-' + i).set({ s: part }); this.last[i] = part; } }
        await this.col().doc('state-meta').set({ n, updatedAt: ROOT.updatedAt, schema: SCHEMA });
        this.status = 'on'; this.lastAt = Date.now(); this.err = '';
      } catch (e) { this.status = 'error'; this.err = (e && e.code) || ''; this.dirty = true; }
      this.busy = false; refreshSync();
      if (this.dirty && this.err !== 'quota_exceeded') this.schedule(this.status === 'error' ? 8000 : 2500);
    },
  };
  function timeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }
  function syncHtml() {
    let t, c, sub = '';
    if (Cloud.status === 'on') { t = 'ذخیره در حساب: فعال'; c = 'ok'; if (Cloud.lastAt) sub = 'آخرین همگام‌سازی ' + hmTime(new Date(Cloud.lastAt).toISOString()); }
    else if (Cloud.status === 'connecting') { t = 'در حال اتصال به حساب…'; c = ''; }
    else if (Cloud.status === 'error') { t = 'همگام‌سازی ناموفق'; c = 'bad'; sub = Cloud.err === 'quota_exceeded' ? 'فضای ذخیره پر است؛ یک پشتیبان JSON بگیرید.' : 'داده‌ها روی همین دستگاه ذخیره شده‌اند و دوباره تلاش می‌شود.'; }
    else { t = window.NativeBridge ? 'ذخیره روی همین گوشی' : 'فقط روی همین مرورگر'; c = window.NativeBridge ? 'ok' : 'warn'; sub = 'برای امنیت داده، هفتگی پشتیبان JSON بگیرید.'; }
    return '<span class="chip ' + c + '">' + esc(t) + '</span>' + (sub ? '<p class="small muted" style="margin:6px 0 0">' + esc(sub) + '</p>' : '') + (!localOk ? '<p class="small err">ذخیره‌ی محلی در این مرورگر در دسترس نیست.</p>' : '');
  }
  function refreshSync() { const el = $('#syncbox'); if (el) el.innerHTML = syncHtml(); }

  // ---------- domain ----------
  const activeComboIds = () => S.combos.filter((c) => c.active).map((c) => c.id);
  function courseVisible(c) { if (c.deletedAt || c.archived) return false; if (!c.combos || !c.combos.length) return true; const a = activeComboIds(); return c.combos.some((id) => a.includes(id)); }
  const visibleCourses = () => S.courses.filter(courseVisible).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const courseBooks = (cid) => live(S.books).filter((b) => b.courseId === cid);
  const bookChapters = (bid) => live(S.chapters).filter((c) => c.bookId === bid);
  const hasKids = (id) => live(S.chapters).some((x) => x.parentId === id);
  function orderedChapters(bid) {
    const all = bookChapters(bid); const tops = all.filter((c) => !c.parentId).sort((a, b) => a.order - b.order); const out = [];
    for (const t of tops) { out.push(t); all.filter((c) => c.parentId === t.id).sort((a, b) => a.order - b.order).forEach((c) => out.push(c)); }
    return out;
  }
  function courseChapters(cid, includeExcluded) { const out = []; courseBooks(cid).forEach((b) => orderedChapters(b.id).forEach((c) => { if (!hasKids(c.id) && (includeExcluded || c.priority !== 'excluded')) out.push(c); })); return out; }
  const chapterCourse = (ch) => { const b = byId(S.books, ch.bookId); return b ? byId(S.courses, b.courseId) : null; };
  const chapterRounds = (chId) => S.rounds.filter((r) => r.chapterId === chId).sort((a, b) => a.roundNumber - b.roundNumber);
  const roundSessions = (rid) => S.sessions.filter((s) => s.roundId === rid);
  const isStudy = (s) => STUDY_STEPS.includes(s.step) || s.step === 'quick-study';
  const studySec = (rid) => roundSessions(rid).filter(isStudy).reduce((a, s) => a + s.durationSec, 0);
  const pctOf = (t) => !t ? null : (S.settings.negOn && t.wrong != null ? L.pctNeg(t.correct, t.wrong, t.count, S.settings.negRatio) : L.pctRaw(t.correct, t.count));
  function roundSummary(r) {
    const tsum = L.sumTests(r.tests); const last = r.tests[r.tests.length - 1]; const first = r.tests[0];
    return { studySec: studySec(r.id), testSec: tsum.seconds, count: tsum.count, correct: tsum.correct, pct: pctOf(last), firstPct: pctOf(first), cycles: r.tests.length };
  }
  function roundStatus(r) { const t = r.tests[r.tests.length - 1]; if (!t) return null; return L.masteryStatus(L.pctRaw(t.correct, t.count), S.settings.masteryPct, S.settings.reviewPct); }
  function chapterState(ch) {
    const rs = chapterRounds(ch.id);
    const ar = rs.find((r) => r.status === 'active');
    if (ar) { if (ar.step === 'study') { const sec = roundSessions(ar.id).filter((x) => isStudy(x) && (x.cycle || 1) === (ar.cycle || 1)).reduce((a, x) => a + x.durationSec, 0); return { key: 'active', label: sec ? 'نیمه‌کاره · ' + fmtDur(sec) : 'دور باز', cls: 'acc' }; } return { key: 'active', label: ar.step === 'test' ? 'نوبت تست' : 'دور باز', cls: 'acc' }; }
    const done = rs.filter((r) => r.status === 'done'); if (!done.length) return { key: 'new', label: 'شروع‌نشده', cls: '' };
    const st = roundStatus(done[done.length - 1]);
    if (st === 'mastered') return { key: 'mastered', label: 'تسلط · دور ' + fa(done.length), cls: 'ok' };
    if (st == null) return { key: 'weak', label: 'بدون تست · دور ' + fa(done.length), cls: 'warn' };
    return { key: 'weak', label: 'نیاز به دور بعد', cls: 'warn' };
  }
  function activeChapters() { return visibleCourses().filter((c) => c.type !== 'test').flatMap((c) => courseChapters(c.id)); }

  // daily actuals
  function dayActual(key, filter) {
    let sec = 0; const tests = [];
    S.sessions.forEach((s) => { if (L.dateKey(new Date(s.startedAt)) === key && (!filter || filter(s))) sec += s.durationSec; });
    S.rounds.forEach((r) => r.tests.forEach((t) => { if (L.dateKey(new Date(t.at)) === key && (!filter || filter({ chapterId: r.chapterId, courseId: r.courseId }))) tests.push(t); }));
    S.langLogs.forEach((l) => { if (l.date === key && (!filter || filter({ courseId: l.courseId, chapterId: null }))) tests.push(l); });
    return { sec, tests: L.sumTests(tests), list: tests };
  }
  function planActual(p) { return dayActual(p.date, (s) => p.chapterId ? s.chapterId === p.chapterId : (s.courseId === p.courseId && !s.chapterId)); }
  function planDone(p) { const a = planActual(p); return (!p.minutes || a.sec >= p.minutes * 60) && (!p.tests || a.tests.count >= p.tests) && (p.minutes || p.tests); }
  const dayPlans = (key) => S.plans.filter((p) => p.date === key && planTargetAlive(p)).sort((a, b) => a.order - b.order);
  function planTargetAlive(p) { const c = byId(S.courses, p.courseId); if (!c || c.deletedAt) return false; if (p.chapterId) { const ch = byId(S.chapters, p.chapterId); return ch && !ch.deletedAt; } return true; }
  const capacityOf = (key) => S.settings.capacity[wdOf(key)] || 0;
  function planLabel(p) { const c = byId(S.courses, p.courseId); const ch = p.chapterId && byId(S.chapters, p.chapterId); return { title: ch ? ch.title : c.name, sub: ch ? c.name : 'تست‌زنی', color: c.color }; }

  // ---------- timer ----------
  function tElapsed() { const t = S.timer; if (!t) return 0; return t.accMs + (t.running ? Date.now() - t.startedAt : 0); }
  function startTimer(ctx) { S.timer = Object.assign({ startedAt: Date.now(), accMs: 0, running: true, firstStart: nowIso(), manual: false }, ctx); save(); }
  function pauseTimer() { const t = S.timer; if (!t || !t.running) return; t.accMs += Date.now() - t.startedAt; t.running = false; save(); }
  function resumeTimer() { const t = S.timer; if (!t || t.running) return; t.startedAt = Date.now(); t.running = true; save(); }
  function stopTimer() { const t = S.timer; if (!t) return null; const res = { sec: Math.round(tElapsed() / 1000), firstStart: t.firstStart, manual: t.manual, t }; S.timer = null; return res; }
  function timerFor(roundId, step) { const t = S.timer; return t && t.roundId === roundId && t.step === step ? t : null; }
  function logSession(o) { const s = Object.assign({ id: uid(), startedAt: nowIso(), endedAt: nowIso(), durationSec: 0, manualEdit: false, createdAt: nowIso() }, o); S.sessions.push(s); return s; }

  // ---------- navigation ----------
  let nav = { tab: 'today', stack: [] }; let ob = null; let planWeek = null;
  const cur = () => nav.stack[nav.stack.length - 1] || { s: nav.tab };
  function go(s, p) { nav.stack.push(Object.assign({ s }, p || {})); render(); window.scrollTo(0, 0); }
  function back() { nav.stack.pop(); render(); window.scrollTo(0, 0); }
  function setTab(t) { nav.tab = t; nav.stack = []; render(); window.scrollTo(0, 0); }

  // ---------- UI primitives ----------
  const G = () => S.settings.groupLabel || 'ترکیب';
  const comboLabel = (cb) => cb.code ? G() + ' ' + faD(cb.code) : cb.title;
  const GEAR = SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>');
  const DOTS = SVG('<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>');
  const gearBtn = () => '<button class="iconbtn" data-a="tab" data-v="more" aria-label="بیشتر و تنظیمات">' + GEAR + '</button>';
  function top(title, sub, right) {
    const root = !nav.stack.length;
    return '<div class="top">' + (!root ? '<button class="iconbtn" data-a="back" aria-label="بازگشت">' + ICON.back + '</button>' : '') +
      '<div class="grow"><h1 class="ttl">' + esc(title) + '</h1>' + (sub ? '<div class="small muted">' + sub + '</div>' : '') + '</div>' + (right || '') + (root && nav.tab !== 'more' ? gearBtn() : '') + '</div>';
  }
  let undoFn = null;
  function toast(msg, undo) {
    document.querySelectorAll('.toast').forEach((x) => x.remove()); const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button data-a="undo">بازگرداندن</button>' : ''); undoFn = undo || null;
    document.body.appendChild(t); setTimeout(() => { t.remove(); if (undoFn === undo) undoFn = null; }, undo ? 6000 : 2600);
  }
  function menuSheet(title, sub, items) {
    sheet('<div style="margin-bottom:8px"><h2 style="margin:0">' + esc(title) + '</h2>' + (sub ? '<div class="small muted">' + sub + '</div>' : '') + '</div><div class="menu">' +
      items.filter(Boolean).map(([a, label, attrs, danger]) => '<button class="mi' + (danger ? ' danger' : '') + '" data-a="' + a + '" ' + (attrs || '') + '>' + label + '</button>').join('') + '</div><button class="btn block" style="margin-top:12px" data-a="closeSheet">بستن</button>');
  }
  function hero(act, cap) {
    const p = cap ? Math.min(1, act.sec / (cap * 60)) : 0; const C = 2 * Math.PI * 34;
    return '<div class="hero"><svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true"><circle cx="46" cy="46" r="34" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="10"/><circle cx="46" cy="46" r="34" fill="none" stroke="#FFD166" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + (C * p).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 46 46)"/><text x="46" y="52" text-anchor="middle" font-size="17" font-weight="700" fill="#fff">' + (cap ? faD(Math.round(p * 100)) + '٪' : '—') + '</text></svg>' +
      '<div class="grow"><div class="hk">مطالعه‌ی امروز</div><div class="hv">' + fmtDur(act.sec) + '</div><div class="hs">' + (cap ? 'از ' + fmtDur(cap * 60) + ' ظرفیت' : 'ظرفیت امروز تعیین نشده') + '</div>' +
      '<div class="hrow"><span><b>' + fa(act.tests.count) + '</b> تست</span><span><b>' + (act.tests.count ? fa(L.pctRaw(act.tests.correct, act.tests.count), 0) + '٪' : '—') + '</b> صحیح</span></div></div></div>';
  }
  let sheetReturn = null, pendingConfirm = null;
  function sheet(html) {
    closeSheet(true); sheetReturn = document.activeElement;
    const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'sheetbg';
    bg.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" tabindex="-1"><div class="grab"></div>' + html + '</div>';
    bg.addEventListener('click', (e) => { if (e.target === bg) closeSheet(); });
    document.body.appendChild(bg); const s = $('.sheet', bg); s.focus();
  }
  function closeSheet(silent) { const b = $('#sheetbg'); if (b) { b.remove(); if (!silent && sheetReturn && sheetReturn.focus && document.contains(sheetReturn)) try { sheetReturn.focus(); } catch (e) {} } }
  function confirmSheet(title, body, okLabel, onOk, danger) {
    sheet('<h2 style="margin-top:0">' + esc(title) + '</h2><p class="muted">' + body + '</p><div class="row" style="margin-top:16px"><button class="btn ' + (danger ? 'danger' : 'pri') + ' grow" data-a="confirmOk">' + esc(okLabel) + '</button><button class="btn grow" data-a="closeSheet">انصراف</button></div>');
    pendingConfirm = onOk;
  }
  const num = (name, label, val, attrs) => '<label class="f"><span>' + label + '</span><input name="' + name + '" inputmode="numeric" value="' + esc(val == null ? '' : faD(val)) + '" ' + (attrs || '') + '></label>';
  const txt = (name, label, val, attrs) => '<label class="f"><span>' + label + '</span><input name="' + name + '" type="text" value="' + esc(val || '') + '" ' + (attrs || '') + '></label>';
  const area = (name, label, val, ph) => '<label class="f"><span>' + label + '</span><textarea name="' + name + '" placeholder="' + esc(ph || '') + '">' + esc(val || '') + '</textarea></label>';
  const chip = (t, c) => '<span class="chip ' + (c || '') + '">' + t + '</span>';
  const statusChip = (st) => st ? chip(STATUS[st][0], STATUS[st][1]) : chip('بدون تست');
  const formVals = (form) => { const o = {}; new FormData(form).forEach((v, k) => { o[k] = v; }); return o; };
  const bar = (v, max, color, over) => '<div class="bar"><i style="width:' + Math.min(100, max > 0 ? v / max * 100 : 0) + '%;' + (over ? 'background:var(--bad)' : color ? 'background:' + esc(color) : '') + '"></i></div>';

  // ---------- render root ----------
  const app = () => $('#app');
  function render() {
    applyTheme();
    if (!S.settings.onboarded) { app().innerHTML = '<div class="wrap">' + vOnboard() + '</div>'; return; }
    if (programLocked() && cur().s !== 'pro') { app().innerHTML = '<div class="wrap">' + vLocked() + '</div>'; return; }
    const c = cur(); let html = '';
    try {
      const V = { pro: vPro, programs: vPrograms, today: vToday, plan: vPlan, courses: vCourses, course: vCourse, book: vBook, chapter: vChapter, session: vSession, stats: vStats, more: vMore, settings: vSettings, combos: vCombos, bin: vBin, backup: vBackup, audit: vAudit, selftest: vSelfTest, sessions: vSessions, help: vHelp, intro: () => vIntro(true) };
      html = (V[c.s] || vToday)(c);
    } catch (e) { console.error(e); html = '<div class="banner bad">خطا در نمایش این صفحه. <button class="btn sm" data-a="home">بازگشت به امروز</button></div>'; }
    const tb = ([k, l, i]) => '<button data-a="tab" data-v="' + k + '" ' + (nav.tab === k ? 'aria-current="page"' : '') + '>' + i + '<span>' + l + '</span></button>';
    const fab = '<button class="fab' + (S.timer ? ' live' : '') + '" data-a="fab" aria-label="' + (S.timer ? 'ادامه‌ی جلسه' : 'شروع مطالعه') + '">' + (S.timer ? '<span class="fabt" data-timer>' + fmtClock(tElapsed()) + '</span>' : SVG('<path d="M8 5v14l11-7z" fill="currentColor"/>')) + '</button>';
    app().innerHTML = '<main class="wrap">' + html + '</main><nav class="tabs" aria-label="ناوبری اصلی"><div class="in">' +
      [['today', 'امروز', ICON.today], ['plan', 'برنامه', ICON.plan]].map(tb).join('') + '<div class="fabwrap">' + fab + '</div>' + [['courses', 'درس‌ها', ICON.book], ['stats', 'آمار', ICON.stats]].map(tb).join('') + '</div></nav>';
    tick();
  }
  let applyTheme = function () { const t = S && S.settings.theme; if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); };

  // ---------- onboarding ----------
  function comboNames(c) { if (!S.combos.length) return ''; if (!c.combos || !c.combos.length) return 'همه'; return c.combos.map((id) => byId(S.combos, id)).filter(Boolean).map(comboLabel).join('، '); }
  function capacityInputs(cap) { return '<div class="grid4" style="grid-template-columns:repeat(4,1fr)">' + WD_ORDER.map((wd) => num('cap' + wd, WD[wd], Math.round(cap[wd] / 60 * 10) / 10)).join('') + '</div>'; }
  function readCapacity(f) { const out = []; for (let wd = 0; wd < 7; wd++) { const n = L.parseNum(f['cap' + wd].value); if (n == null || Number.isNaN(n) || n < 0 || n > 18) return null; out[wd] = Math.round(n * 60); } return out; }
  function vOnboard() {
    if (!S.settings.introDone) return vIntro(false);
    if (!ob) ob = { step: 0, err: '' };
    const st = ob.step, N = 4; const custom = S.settings.preset === 'custom';
    const extra = ROOT.prevActive ? '<button class="btn ghost block" style="margin-top:6px" data-a="cancelNewProgram">انصراف از ساخت برنامه‌ی جدید</button>' : '';
    const head = '<div class="small muted" style="margin-top:8px">مرحله ' + faD(st + 1) + ' از ' + faD(N) + '</div><div class="bar" style="margin:6px 0 16px"><i style="width:' + ((st + 1) / N * 100) + '%"></i></div>';
    const nav2 = (nextLabel) => '<div class="row" style="margin-top:16px">' + (st > 0 ? '<button class="btn grow" data-a="obPrev">قبلی</button>' : '') + '<button class="btn pri grow big" data-a="obNext">' + (nextLabel || 'ادامه') + '</button></div>';
    const prev = '<div class="row" style="margin-top:12px"><button class="btn grow" data-a="obPrev">قبلی</button></div>';
    const err = ob.err ? '<div class="err" role="alert">' + esc(ob.err) + '</div>' : '';
    if (st === 0) {
      const opt = (v, t, d, color) => '<button class="card tap choice' + (S.settings.preset === v ? ' on' : '') + '" data-a="obPreset" data-v="' + v + '" aria-pressed="' + (S.settings.preset === v) + '"><div class="row"><span class="cdot" style="width:14px;height:14px;background:' + color + '"></span><b class="grow">' + t + '</b>' + (S.settings.preset === v ? chip('انتخاب شد', 'acc') : '') + '</div><div class="small muted" style="margin-top:4px">' + d + '</div></button>';
      return '<div style="margin-top:6px">' + BRAND + '</div>' + head + '<h1>' + (ROOT.prevActive ? 'برنامه‌ی جدید' : 'برای چه آزمونی می‌خوانید؟') + '</h1><p class="muted">هر آزمون و هر گرایش یک «برنامه»‌ی جداست. یکی را انتخاب کنید؛ دروسش آماده می‌شود و بعداً قابل ویرایش است.</p>' +
        '<div class="small muted" style="margin:12px 0 6px;font-weight:700">کنکور دکتری مدیریت</div><div class="list">' +
        TEMPLATES.map((t) => opt(t.id, t.track, MGMT_COMMON.map((x) => x[0]).slice(1).join('، ') + '، زبان و ' + t.extra[0][0], t.color)).join('') + '</div>' +
        '<div class="small muted" style="margin:16px 0 6px;font-weight:700">آزمون دیگر</div>' + opt('custom', 'رشته یا آزمون دیگر', 'ارشد، دکتری، سراسری، استخدامی…؛ دروس را خودتان وارد می‌کنید.', '#7B4DFF') +
        (custom ? '<form data-form="obExam" class="card" style="margin-top:12px">' + txt('examName', 'نام آزمون یا رشته', S.settings.examName, 'placeholder="مثلاً کنکور ارشد روانشناسی"') + txt('track', 'گرایش (اختیاری)', S.settings.track, 'placeholder="مثلاً بالینی"') + err + '<button class="btn pri block big" style="margin-top:14px">ادامه</button></form>' : err + nav2()) + extra;
    }
    if (st === 1) {
      const cs = S.courses.filter((c) => !c.deletedAt);
      return head + '<h1>دروس</h1><p class="muted">' + (cs.length ? 'درسی را که نمی‌خواهید بردارید یا نوعش را عوض کنید.' : 'دروس آزمون را وارد کنید: هر خط یک درس.') + '</p>' +
        (cs.length ? '<div class="card">' + cs.map((c) => '<div class="row" style="border-bottom:1px solid var(--line)"><label class="check grow"><input type="checkbox" data-a="obCourse" data-id="' + c.id + '" ' + (!c.archived ? 'checked' : '') + '><span><b>' + esc(c.name) + '</b></span></label><button class="chip ' + (c.type === 'test' ? 'acc' : '') + '" style="border:0;min-height:36px;cursor:pointer" data-a="obType" data-id="' + c.id + '">' + (c.type === 'test' ? 'فقط تست' : 'فصل‌به‌فصل') + '</button></div>').join('') + '</div><p class="small muted" style="margin-top:6px">«فصل‌به‌فصل»: مطالعه و تست هر فصل. «فقط تست»: درس بدون فصل مثل زبان. با لمس برچسب عوض می‌شود.</p>' : '') +
        '<form data-form="obAddCourses" class="card" style="margin-top:10px">' + area('names', cs.length ? 'افزودن درس (هر خط یک درس)' : 'نام دروس (هر خط یک درس)', '', 'ادبیات\nزبان انگلیسی\nآمار') + '<label class="check"><input type="checkbox" name="test"><span>این دروس «فقط تست» هستند</span></label><button class="btn block" style="margin-top:8px">افزودن</button></form>' + err + nav2();
    }
    if (st === 2) { const j = L.keyToJalali(S.settings.examDate);
      return head + '<h1>تاریخ آزمون و ساعت مفید</h1><form data-form="obDate"><div class="card"><h3>تاریخ آزمون</h3><div class="grid4" style="grid-template-columns:1fr 1fr 1.4fr">' + num('jd', 'روز', j.jd) + num('jm', 'ماه', j.jm) + num('jy', 'سال', j.jy) + '</div></div>' +
        '<div class="card" style="margin-top:12px"><h3>چند ساعت در روز می‌توانید درس بخوانید؟</h3><p class="small muted">برنامه‌ی هر روز با این عدد سنجیده می‌شود.</p>' + capacityInputs(S.settings.capacity) + '</div>' +
        err + '<button class="btn pri block big" style="margin-top:16px">ادامه</button></form>' + prev; }
    const cs = S.courses.filter((c) => !c.deletedAt && !c.archived && c.type !== 'test');
    if (!cs.length) return head + '<h1>آماده‌اید</h1><p class="muted">درس فصل‌به‌فصلی ندارید؛ هر وقت خواستید از بخش «درس‌ها» اضافه کنید.</p><button class="btn pri block big" data-a="obFinish">شروع</button>' + prev;
    return head + '<h1>اولین کتاب</h1><p class="muted">فهرست فصل‌ها را بچسبانید: هر خط یک فصل؛ خطی که با فاصله شروع شود زیرفصل است.</p><form data-form="obBook" class="card">' +
      '<label class="f"><span>درس</span><select name="courseId">' + cs.map((c) => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') + '</select></label>' +
      txt('title', 'عنوان کتاب یا جزوه', '') + area('batch', 'فصل‌ها', '', 'فصل ۱: مفاهیم پایه\nفصل ۲\nفصل ۳') +
      err + '<button class="btn pri block big" style="margin-top:16px">ثبت و شروع</button></form><button class="btn ghost block" style="margin-top:8px" data-a="obFinish">فعلاً بدون کتاب شروع کن</button>' + prev;
  }
  const LOGO = '<svg viewBox="0 0 120 120" width="42" height="42" aria-hidden="true"><rect width="120" height="120" rx="30" fill="#14B88A"/><path d="M28 98 C 28 66, 86 78, 76 52 S 38 36, 66 18" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-dasharray="1 15"/><circle cx="28" cy="98" r="7" fill="#FFD166"/><path d="M86 10 a13 13 0 0 1 13 13 c0 10 -13 22 -13 22 s-13 -12 -13 -22 a13 13 0 0 1 13 -13 z" fill="#FF5A7A"/><circle cx="86" cy="23" r="5" fill="#fff"/></svg>';
  const BRAND = '<div class="row" style="gap:10px">' + LOGO + '<div><b style="font-size:17px">مسیر</b><div class="small muted">برنامه‌ریز مطالعه و کنکور</div></div></div>';

  // ---------- guidance: intro, tips, checklist, help ----------
  const ART = {
    welcome: '<svg viewBox="0 0 260 170" role="img" aria-hidden="true"><circle cx="60" cy="50" r="34" fill="#FFE7A3"/><circle cx="210" cy="120" r="40" fill="#D7F5EA"/><circle cx="215" cy="35" r="18" fill="#FFD5DD"/><g transform="translate(85 25)"><rect width="90" height="90" rx="24" fill="#14B88A"/><path d="M20 74 C 20 50, 66 58, 58 38 S 30 26, 50 12" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-dasharray="1 12"/><circle cx="20" cy="74" r="6" fill="#FFD166"/><path d="M66 6 a10 10 0 0 1 10 10 c0 8 -10 17 -10 17 s-10 -9 -10 -17 a10 10 0 0 1 10 -10 z" fill="#FF5A7A"/><circle cx="66" cy="16" r="4" fill="#fff"/></g><rect x="50" y="138" width="44" height="12" rx="6" fill="#FF8A3D"/><rect x="108" y="138" width="44" height="12" rx="6" fill="#2F4EBF"/><rect x="166" y="138" width="44" height="12" rx="6" fill="#7B4DFF"/></svg>',
    programs: '<svg viewBox="0 0 260 170" role="img" aria-hidden="true"><circle cx="130" cy="85" r="78" fill="#EEF2FB"/>' + [[30, '#2F4EBF', 'ترکیب ۱'], [100, '#14B88A', 'ترکیب ۵'], [170, '#FF8A3D', 'ترکیب ۶']].map(([x, c, t], i) => '<g transform="translate(' + x + ' ' + (40 + (i === 1 ? -10 : 0)) + ')"><rect width="62" height="84" rx="14" fill="' + c + '"/><rect x="10" y="14" width="42" height="7" rx="3.5" fill="#fff" opacity=".9"/><rect x="10" y="28" width="30" height="7" rx="3.5" fill="#fff" opacity=".6"/><rect x="10" y="42" width="36" height="7" rx="3.5" fill="#fff" opacity=".6"/><text x="31" y="72" font-size="11" font-weight="700" text-anchor="middle" fill="#fff">' + t + '</text></g>').join('') + '</svg>',
    plan: '<svg viewBox="0 0 260 170" role="img" aria-hidden="true"><rect x="10" y="10" width="240" height="150" rx="22" fill="#FFF4DA"/>' + [0, 1, 2, 3, 4, 5, 6].map((i) => { const h = [60, 80, 45, 104, 70, 34, 75][i]; const c = ['#2F4EBF', '#14B88A', '#7B4DFF', '#FF5A7A', '#FF8A3D', '#2F4EBF', '#14B88A'][i]; return '<rect x="' + (28 + i * 31) + '" y="' + (140 - h) + '" width="22" height="' + h + '" rx="7" fill="' + c + '"/>'; }).join('') + '<line x1="20" x2="240" y1="46" y2="46" stroke="#141B2D" stroke-width="2.5" stroke-dasharray="6 5"/><circle cx="133" cy="30" r="11" fill="#FF5A7A"/><text x="133" y="35" font-size="13" font-weight="700" text-anchor="middle" fill="#fff">!</text></svg>',
    round: '<svg viewBox="0 0 260 170" role="img" aria-hidden="true"><circle cx="48" cy="72" r="36" fill="#E3E9FB"/><circle cx="48" cy="72" r="26" fill="#2F4EBF"/><path d="M42 60 v24 l20 -12 z" fill="#fff"/><text x="48" y="132" font-size="13" font-weight="700" text-anchor="middle" fill="#2F4EBF">بخوان</text><path d="M92 72 h22" stroke="#B7C1DB" stroke-width="3" stroke-linecap="round"/><rect x="120" y="38" width="46" height="66" rx="10" fill="#FFF0D0" stroke="#FF8A3D" stroke-width="3"/><circle cx="133" cy="56" r="4" fill="#FF8A3D"/><rect x="141" y="53" width="17" height="6" rx="3" fill="#FF8A3D"/><circle cx="133" cy="72" r="4" fill="#14B88A"/><rect x="141" y="69" width="17" height="6" rx="3" fill="#14B88A"/><circle cx="133" cy="88" r="4" fill="#FF5A7A"/><rect x="141" y="85" width="12" height="6" rx="3" fill="#FF5A7A"/><text x="143" y="132" font-size="13" font-weight="700" text-anchor="middle" fill="#FF8A3D">تست بزن</text><path d="M172 72 h22" stroke="#B7C1DB" stroke-width="3" stroke-linecap="round"/><circle cx="222" cy="72" r="32" fill="#D7F5EA"/><text x="222" y="79" font-size="19" font-weight="700" text-anchor="middle" fill="#0F8F6B">۸۵٪</text><text x="222" y="132" font-size="13" font-weight="700" text-anchor="middle" fill="#0F8F6B">نتیجه</text></svg>',
    compare: '<svg viewBox="0 0 260 170" role="img" aria-hidden="true"><rect x="10" y="10" width="240" height="150" rx="22" fill="#F1ECFF"/>' + [[60, 70, '#FFB199'], [130, 54, '#FFD166'], [200, 40, '#5CE1B0']].map(([x, h, c]) => '<rect x="' + (x - 20) + '" y="' + (138 - h) + '" width="40" height="' + h + '" rx="9" fill="' + c + '"/>').join('') + '<path d="M60 78 L130 52 L200 30" fill="none" stroke="#7B4DFF" stroke-width="4" stroke-linecap="round"/>' + [[60, 78, '۶۰٪'], [130, 52, '۷۸٪'], [200, 30, '۹۰٪']].map(([x, y, t]) => '<circle cx="' + x + '" cy="' + y + '" r="7" fill="#7B4DFF"/><text x="' + x + '" y="' + (y - 13) + '" font-size="13" font-weight="700" text-anchor="middle" fill="#7B4DFF">' + t + '</text>').join('') + '<text x="60" y="155" font-size="11" text-anchor="middle" fill="#5A6785">دور ۱</text><text x="130" y="155" font-size="11" text-anchor="middle" fill="#5A6785">دور ۲</text><text x="200" y="155" font-size="11" text-anchor="middle" fill="#5A6785">دور ۳</text></svg>',
    safe: '<svg viewBox="0 0 260 170" role="img" aria-hidden="true"><circle cx="130" cy="88" r="74" fill="#D7F5EA"/><rect x="96" y="22" width="68" height="124" rx="16" fill="#fff" stroke="#141B2D" stroke-width="3"/><rect x="108" y="44" width="44" height="10" rx="5" fill="#2F4EBF"/><rect x="108" y="62" width="32" height="10" rx="5" fill="#FFD166"/><rect x="108" y="80" width="38" height="10" rx="5" fill="#FF5A7A"/><g transform="translate(170 78)"><rect width="44" height="38" rx="9" fill="#14B88A"/><path d="M10 0 v-10 a12 12 0 0 1 24 0 v10" fill="none" stroke="#14B88A" stroke-width="5"/><circle cx="22" cy="18" r="5" fill="#fff"/></g></svg>',
  };
  const INTRO = [
    ['welcome', 'به «مسیر» خوش آمدید', 'مسیر کمکتان می‌کند درس خواندن را برنامه‌ریزی کنید، زمانش را بسنجید و ببینید هر فصل چقدر بهتر شده است.'],
    ['programs', 'هر آزمون، یک برنامه', 'برای آزمون و گرایش خودتان یک برنامه بسازید؛ مثلاً «دکتری مدیریت، ترکیب ۱». دروسش آماده می‌شود.'],
    ['plan', 'برنامه‌ی هفته را بچینید', 'برای هر روز بنویسید کدام فصل را چند دقیقه می‌خوانید. اگر از وقت آزادتان بیشتر شد، رنگش قرمز می‌شود.'],
    ['round', 'بخوانید، تست بزنید، نتیجه ببینید', 'دکمه‌ی ▶ را بزنید و بخوانید. اگر فصل تمام نشد، بعداً ادامه دهید. آخر کار تست بزنید و تعداد درست‌ها را بنویسید.'],
    ['compare', 'پیشرفتتان را ببینید', 'هر بار که فصلی را دوباره می‌خوانید، نتیجه کنار دفعه‌های قبل می‌آید. درصد بالاتر یا زمان کمتر با همان درصد یعنی پیشرفت.'],
    ['safe', 'اطلاعات روی گوشی خودتان', 'همه‌چیز روی همین گوشی ذخیره می‌شود. هفته‌ای یک بار از «بیشتر ← پشتیبان» یک فایل پشتیبان بگیرید.'],
  ];
  let introIdx = 0;
  function vIntro(fromHelp) {
    const [art, t, b] = INTRO[introIdx]; const last = introIdx === INTRO.length - 1;
    return (fromHelp ? top('معرفی اپ') : '<div class="row between" style="margin-top:4px"><span class="small muted">' + faD(introIdx + 1) + ' از ' + faD(INTRO.length) + '</span><button class="btn ghost sm" data-a="introSkip">رد کردن</button></div>') +
      '<div style="text-align:center;padding:12px 0 4px"><div class="introart">' + ART[art] + '</div><h1 style="margin-top:18px">' + t + '</h1><p class="muted" style="max-width:420px;margin:8px auto 0">' + b + '</p></div>' +
      '<div class="row" style="justify-content:center;gap:6px;margin:20px 0" aria-hidden="true">' + INTRO.map((_, i) => '<span style="width:' + (i === introIdx ? 22 : 8) + 'px;height:8px;border-radius:8px;background:' + (i === introIdx ? 'var(--acc)' : 'var(--line)') + '"></span>').join('') + '</div>' +
      '<div class="row">' + (introIdx > 0 ? '<button class="btn grow" data-a="introPrev">قبلی</button>' : '') + '<button class="btn pri big grow" data-a="introNext">' + (last ? (fromHelp ? 'پایان' : 'شروع تنظیمات') : 'بعدی') + '</button></div>';
  }
  const BULB = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>';
  const TIPS = {
    today: ['صفحه‌ی امروز', 'برنامه‌ی امروز و پیشرفت واقعی هر مورد اینجاست. «شروع دور» زمان‌سنج را باز می‌کند؛ «ثبت سریع» برای وقتی است که بدون زمان‌سنج خوانده‌اید.'],
    plan: ['برنامه‌ی هفتگی', 'برای هر روز «افزودن» را بزنید و فصل، زمان هدف و تعداد تست هدف را تعیین کنید. نوار هر روز ظرفیت آن روز را نشان می‌دهد. «کپی به فردا» برنامه را تکرار می‌کند. با فلش‌ها بین هفته‌ها جابه‌جا شوید.'],
    courses: ['درس‌ها', 'روی هر درس بزنید تا کتاب اضافه کنید. با دکمه‌ی ⋮ کنار هر درس، آن را ویرایش، جابه‌جا، بایگانی یا حذف کنید.'],
    course: ['کتاب‌ها و جدول فصل‌ها', 'برای هر درس یک یا چند کتاب اضافه کنید. جدول پایین صفحه درصد و زمان همه‌ی فصل‌ها را در هر دور کنار هم نشان می‌دهد.'],
    book: ['فصل‌های کتاب', 'با «ورود دسته‌ای» فهرست را یکجا بچسبانید: هر خط یک فصل، خطی که با فاصله شروع شود زیرفصل. با فلش‌ها ترتیب را عوض کنید. دکمه‌ی ⋮ هر فصل برای ویرایش، حذف از برنامه یا حذف است.'],
    chapter: ['صفحه‌ی فصل', '«شروع مطالعه» زمان‌سنج را روشن می‌کند؛ می‌توانید چند جلسه بخوانید و در آخر «اتمام فصل» را بزنید. «ثبت دستی زمان» برای وقتی است که بدون زمان‌سنج خوانده‌اید. هر بار مرور کامل یک فصل یک «دور» است؛ «شروع دور» یعنی یک بار کامل خواندن این فصل با زمان‌سنج و تست. هر بار که دوباره سراغ این فصل آمدید یک دور جدید بزنید تا نتیجه‌ها کنار هم مقایسه شوند. با دکمه‌ی ویرایش، اهمیت و زمان تخمینی را تعیین کنید.'],
    study: ['مرحله‌ی مطالعه', 'لازم نیست فصل را یک‌جا تمام کنید. «پایان این جلسه» زمان را ثبت می‌کند و فصل باز می‌ماند؛ هر وقت برگشتید «ادامه‌ی مطالعه» را بزنید. وقتی فصل تمام شد «اتمام فصل» را بزنید تا به تست بروید. بدون زمان‌سنج خواندید؟ «ثبت دستی زمان».'],
    test: ['مرحله‌ی تست', 'زمان‌سنج تست را بزنید و تست بزنید. بعد تعداد تست و تعداد صحیح را وارد کنید؛ اگر فقط درصد را دارید، «درصد» را انتخاب کنید.'],
    result: ['نتیجه‌ی دور', 'وضعیت با آستانه‌های بخش تنظیمات تعیین می‌شود. اگر راضی نیستید «مطالعه‌ی مجدد و تست جدید» را بزنید؛ وگرنه دور را ببندید.'],
    stats: ['آمار', 'پوشش فصل‌ها، زمان برنامه‌ریزی‌شده در برابر انجام‌شده، و ضعیف‌ترین فصل‌ها. روی هر ردیف بزنید تا به جزئیاتش بروید.'],
    testcourse: ['درس فقط تست', 'این درس فصل ندارد. زمان‌سنج را بزنید، آزمون بدهید و نتیجه را ثبت کنید تا نمودار روند درصد ساخته شود.'],
  };
  function tip(key) {
    if (!TIPS[key] || (S.settings.seenTips || {})[key]) return '';
    const [t, b] = TIPS[key];
    return '<div class="card" role="note" style="background:var(--acc-soft);border-color:var(--acc);margin:4px 0 14px"><div class="row" style="align-items:flex-start;color:var(--acc)">' + BULB + '<div class="grow"><b>' + t + '</b><p class="small" style="margin:4px 0 0;color:var(--ink)">' + b + '</p></div></div><div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn sm ghost" data-a="tipDone" data-v="' + key + '">متوجه شدم</button></div></div>';
  }
  function checklist() {
    if (S.settings.checklistHidden) return '';
    const anyTests = S.rounds.some((r) => r.tests.length);
    const twoRounds = live(S.chapters).some((ch) => chapterRounds(ch.id).filter((r) => r.tests.length).length >= 2);
    const items = [
      ['کتاب و فصل‌ها را وارد کنید', live(S.chapters).length > 0, 'tab', 'courses', 'درس‌ها'],
      ['برای امروز یا این هفته برنامه بریزید', S.plans.length > 0, 'planForm', todayKey(), 'افزودن'],
      ['اولین دور را کامل کنید: مطالعه و تست', anyTests, 'tab', 'courses', 'شروع'],
      ['یک فصل را برای بار دوم بخوانید و مقایسه کنید', twoRounds, null, null, null],
      ['اولین فایل پشتیبان را بگیرید', !!S.settings.lastBackupAt, 'goMore', 'backup', 'پشتیبان'],
    ];
    const done = items.filter((x) => x[1]).length; if (done === items.length) return '';
    return '<div class="card" style="margin-top:14px"><div class="row between"><b>شروع کار با مسیر</b><button class="btn ghost sm" data-a="hideChecklist">بستن</button></div><div class="small muted">' + fa(done) + ' از ' + fa(items.length) + ' انجام شد</div><div style="margin:8px 0 4px">' + bar(done, items.length) + '</div>' +
      items.map(([t, ok, a, v, l]) => '<div class="row" style="min-height:44px;border-top:1px solid var(--line)"><span class="chip ' + (ok ? 'ok' : '') + '" style="width:26px;height:26px;padding:0;justify-content:center" aria-label="' + (ok ? 'انجام شده' : 'انجام نشده') + '">' + (ok ? '✓' : faD(items.findIndex((x) => x[0] === t) + 1)) + '</span><span class="grow small" style="' + (ok ? 'text-decoration:line-through;color:var(--muted)' : '') + '">' + t + '</span>' + (!ok && a ? '<button class="btn sm" data-a="' + a + '" data-v="' + v + '">' + l + '</button>' : '') + '</div>').join('') + '</div>';
  }
  function vHelp() {
    const s = S.settings; const n = s.testCount; const m = Math.ceil(n * s.masteryPct / 100), r = Math.ceil(n * s.reviewPct / 100);
    const Q = [
      ['شروع سریع', '۱) در «درس‌ها» برای هر درس کتاب بسازید و فهرست فصل‌ها را بچسبانید. ۲) در «برنامه» برای روزها فصل و زمان هدف بگذارید. ۳) در «امروز» روی «شروع دور» بزنید. ۴) بعد از چند دور، در صفحه‌ی هر فصل پیشرفت را ببینید.'],
      ['برنامه چیست؟', 'هر آزمون و هر گرایش یک «برنامه»‌ی جداست؛ مثلاً «دکتری مدیریت · ترکیب ۵». دروس، فصل‌ها، برنامه‌ی هفتگی و نتیجه‌های هر برنامه جدا نگه داشته می‌شود. از بالای صفحه‌ی «امروز» بین برنامه‌ها جابه‌جا شوید.'],
      ['پلن رایگان و پیشرفته', 'پلن رایگان: یک برنامه با همه‌ی امکانات. پلن پیشرفته: برنامه‌های نامحدود؛ ماهانه ' + fa(PRICE.monthly) + ' تومان یا سالانه ' + fa(PRICE.yearly) + ' تومان (۵۰٪ تخفیف). پرداخت و لغو اشتراک از طریق کافه بازار است.'],
      ['دور چیست؟', 'هر بار که یک فصل را از اول تا آخر می‌خوانید و تست می‌زنید یک «دور» است. دور ۱ اولین مطالعه است و دورهای بعدی مرور. داده‌ی هر دور جدا ذخیره می‌شود و دورهای قبلی هرگز تغییر نمی‌کنند.'],
      ['چرخه‌ی داخل دور', 'اگر نتیجه‌ی تست راضی‌کننده نبود، «مطالعه‌ی مجدد و تست جدید» در همان دور یک چرخه‌ی دیگر می‌سازد. در مقایسه‌ی دورها، درصد آخرین تست هر دور ملاک است.'],
      ['زمان‌سنج', 'زمان‌سنج بر اساس ساعت شروع کار می‌کند، پس با بستن اپ یا قفل شدن صفحه دقیق می‌ماند. هم‌زمان فقط یک زمان‌سنج فعال است. «مکث» و «ویرایش دستی» برای وقفه‌ها و اصلاح زمان است.'],
      ['ثبت سریع', 'اگر بدون زمان‌سنج مطالعه یا تست زده‌اید، در صفحه‌ی فصل یا کارت برنامه «ثبت سریع» را بزنید: زمان مطالعه، زمان تست، تعداد تست و تعداد صحیح یا درصد.'],
      ['برنامه و ظرفیت', 'ساعت مفید هر روز هفته را در تنظیمات وارد کنید. مجموع زمان هدف برنامه‌ی هر روز با آن مقایسه می‌شود. پیشرفت هر مورد برنامه از زمان و تست‌های واقعی همان روز همان فصل حساب می‌شود.'],
      ['وضعیت‌ها', 'با تنظیمات فعلی برای ' + fa(n) + ' تست: ' + fa(m) + ' صحیح و بیشتر «تسلط مطلوب»، ' + fa(r) + ' تا ' + fa(m - 1) + ' «مرور هدفمند»، کمتر از ' + fa(r) + ' «تکرار چرخه». آستانه‌ها از تنظیمات قابل تغییرند.'],
      ['قاعده‌ی پیشرفت', 'کم شدن زمان مطالعه فقط وقتی «پیشرفت» علامت می‌خورد که درصد صحیح حفظ یا بیشتر شده باشد. زمان کمتر با افت درصد با برچسب «زمان کمتر ولی افت درصد» نمایش داده می‌شود.'],
      ['نمره منفی', 'اگر در تنظیمات روشن شود، هنگام ثبت تست فیلد «غلط» هم اضافه می‌شود و درصد با کسر نمره‌ی منفی (مثلاً هر ۳ غلط یک صحیح) محاسبه می‌شود.'],
      ['اولویت و حذف از برنامه', 'در ویرایش فصل، اولویت را بالا، متوسط، پایین یا «حذف از برنامه» بگذارید. فصل حذف‌شده از برنامه پاک نمی‌شود و با تغییر اولویت برمی‌گردد. حذف واقعی به سطل بازیافت می‌رود و تا ۳۰ روز قابل بازگرداندن است.'],
      ['پشتیبان و انتقال', 'در «بیشتر ← پشتیبان» فایل JSON بگیرید و در جای امنی نگه دارید. روی گوشی یا مرورگر دیگر، همان فایل را از «بازیابی» وارد کنید.'],
    ];
    return top('راهنما') + '<div class="list">' + Q.map(([q, a], i) => '<details class="card"' + (i === 0 ? ' open' : '') + '><summary>' + q + '</summary><p class="small" style="margin:8px 0 0">' + a + '</p></details>').join('') + '</div>' +
      '<div class="list" style="margin-top:16px"><button class="btn block" data-a="replayIntro">دیدن دوباره‌ی معرفی</button><button class="btn block" style="margin-top:8px" data-a="resetTips">نمایش دوباره‌ی نکته‌های صفحه‌ها</button><button class="btn block" style="margin-top:8px" data-a="showChecklist">نمایش دوباره‌ی چک‌لیست شروع</button></div>';
  }

  // ---------- TODAY ----------
  function vToday() {
    const tk = todayKey(); const days = L.daysBetween(tk, S.settings.examDate);
    const act = dayActual(tk); const cap = capacityOf(tk); const plans = dayPlans(tk);
    const planned = plans.reduce((a, p) => a + (p.minutes || 0), 0);
    let h = '<div class="row" style="margin-top:2px;align-items:flex-start"><div class="grow"><div class="small muted">' + fmtJ(tk, true) + ' ' + faD(L.keyToJalali(tk).jy) + '</div><h1 style="margin:0">امروز</h1><button class="progchip" data-a="programsSheet">' + esc(curProgram().title) + ' ▾</button></div>' +
      '<div style="text-align:center"><div class="count">' + (days >= 0 ? fa(days) : '—') + '</div><div class="small muted">' + (days > 0 ? 'روز تا آزمون' : days === 0 ? 'روز آزمون' : 'تاریخ آزمون گذشته') + '</div></div>' + gearBtn() + '</div>';
    h += checklist();
    if (S.timer) h += '<div style="margin-top:14px">' + runningCard() + '</div>';
    h += '<div style="margin-top:12px">' + tip('today') + '</div>';
    h += hero(act, cap);
    h += '<div class="row between"><h2>برنامه‌ی امروز</h2><button class="btn sm" data-a="planForm" data-v="' + tk + '">افزودن</button></div>';
    if (plans.length) {
      h += '<div class="small muted" style="margin:-4px 0 8px">' + fmtDur(planned * 60) + ' برنامه‌ریزی‌شده' + (cap ? ' از ' + fmtDur(cap * 60) + ' ظرفیت' : '') + (cap && planned > cap ? ' · <span style="color:var(--bad)">بیشتر از ظرفیت</span>' : '') + '</div><div class="list">' + plans.map(planCard).join('') + '</div>';
    } else h += '<div class="card empty">برای امروز برنامه‌ای ثبت نشده.<div class="row" style="justify-content:center;margin-top:10px;gap:8px"><button class="btn pri sm" data-a="planForm" data-v="' + tk + '">افزودن فصل</button>' + (dayPlans(addDays(tk, -1)).length ? '<button class="btn sm" data-a="copyPlan" data-v="' + addDays(tk, -1) + '" data-to="' + tk + '">کپی برنامه‌ی دیروز</button>' : '') + '</div></div>';
    const open = S.rounds.filter((r) => r.status === 'active' && byId(S.chapters, r.chapterId) && !byId(S.chapters, r.chapterId).deletedAt && !plans.some((p) => p.chapterId === r.chapterId));
    if (open.length) h += '<h2>دورهای باز</h2><div class="list">' + open.map((r) => { const ch = byId(S.chapters, r.chapterId); const c = chapterCourse(ch); return '<button class="card tap" data-a="openSession" data-id="' + r.id + '"><div class="row"><span class="dot" style="background:' + esc(c.color) + '"></span><b class="grow">' + esc(ch.title) + '</b>' + chip('دور ' + fa(r.roundNumber), 'acc') + '</div><div class="small muted">' + esc(c.name) + ' · ادامه: ' + STEP_LABEL[r.step] + '</div></button>'; }).join('') + '</div>';
    if (backupDue()) h += '<div class="banner warn" style="margin-top:14px">بیش از یک هفته از آخرین پشتیبان گذشته. <button class="btn sm" data-a="goMore" data-v="backup" style="margin-right:6px">پشتیبان‌گیری</button></div>';
    if (!live(S.chapters).length) h += '<div class="card empty" style="margin-top:16px"><p>هنوز فصلی وارد نکرده‌اید.</p><button class="btn pri" data-a="tab" data-v="courses">افزودن کتاب و فصل</button></div>';
    return h;
  }
  function runningCard() {
    const t = S.timer; let label = 'آزمون';
    if (t.roundId) { const r = byId(S.rounds, t.roundId); const ch = r && byId(S.chapters, r.chapterId); label = (ch ? ch.title + ' · ' : '') + STEP_LABEL[t.step]; }
    else if (t.courseId) { const c = byId(S.courses, t.courseId); label = (c ? c.name + ' · ' : '') + 'آزمون'; }
    return '<button class="card tap hl" data-a="resumeTimer"><div class="row between"><div class="grow"><div class="small muted">' + (t.running ? 'زمان‌سنج در حال اجرا' : 'زمان‌سنج متوقف') + '</div><b>' + esc(label) + '</b></div><div class="timer" style="font-size:28px;margin:0" data-timer>' + fmtClock(tElapsed()) + '</div></div></button>';
  }
  function planCard(p) {
    const lb = planLabel(p); const a = planActual(p); const done = planDone(p);
    const parts = [];
    if (p.minutes) parts.push('<span class="num">' + fmtMin(a.sec) + ' از ' + fa(p.minutes) + '′</span>');
    if (p.tests) parts.push('<span class="num">' + fa(a.tests.count) + ' از ' + fa(p.tests) + ' تست</span>');
    if (a.tests.count) parts.push('<span class="num">' + pctTxt(L.pctRaw(a.tests.correct, a.tests.count)) + '</span>');
    const prog = p.minutes ? a.sec / (p.minutes * 60) : p.tests ? a.tests.count / p.tests : 0;
    return '<div class="card' + (done ? '' : '') + '"><div class="row"><span class="dot" style="background:' + esc(lb.color) + '"></span><div class="grow" style="min-width:0"><b>' + esc(lb.title) + '</b><div class="small muted">' + esc(lb.sub) + '</div></div>' + (done ? chip('انجام شد', 'ok') : '') + '</div>' +
      '<div class="row between small" style="margin-top:8px;gap:12px;flex-wrap:wrap">' + parts.join('<span class="muted">·</span>') + '</div><div style="margin-top:6px">' + bar(prog, 1, done ? 'var(--ok)' : null) + '</div>' +
      '<div class="row" style="margin-top:10px"><button class="btn pri sm grow" data-a="planGo" data-id="' + p.id + '">' + (p.chapterId ? (timerForChapter(p.chapterId) ? 'رفتن به جلسه' : studyLabel(p.chapterId)) : 'شروع آزمون') + '</button>' + (p.chapterId ? '<button class="btn sm grow" data-a="quickForm" data-id="' + p.chapterId + '">ثبت سریع</button>' : '') + '<button class="iconbtn" data-a="planForm" data-id="' + p.id + '" aria-label="ویرایش برنامه">' + ICON.edit + '</button></div></div>';
  }
  const activeRound = (chId) => S.rounds.find((r) => r.chapterId === chId && r.status === 'active');
  function backupDue() { const lb = S.settings.lastBackupAt; if (!S.sessions.length) return false; const ref = lb ? new Date(lb).getTime() : new Date(S.sessions[0].startedAt).getTime(); return Date.now() - ref > 7 * 86400000; }

  // ---------- PLAN (week) ----------
  function vPlan() {
    const tk = todayKey(); if (!planWeek) planWeek = weekStart(tk);
    const days = [...Array(7)].map((_, i) => addDays(planWeek, i));
    const exam = S.settings.examDate;
    let tp = 0, ta = 0;
    days.forEach((d) => { tp += dayPlans(d).reduce((a, p) => a + (p.minutes || 0) * 60, 0); ta += dayActual(d).sec; });
    let h = top('برنامه', 'هفته‌ی ' + fmtJ(days[0]) + ' تا ' + fmtJ(days[6]));
    h += tip('plan');
    h += '<div class="row" style="margin-bottom:12px"><button class="iconbtn" data-a="week" data-v="-7" aria-label="هفته‌ی قبل">' + ICON.prev + '</button><button class="btn grow sm" data-a="week" data-v="0">این هفته</button><button class="iconbtn" data-a="week" data-v="7" aria-label="هفته‌ی بعد">' + ICON.next + '</button></div>';
    h += '<div class="grid2"><div class="stat"><b>' + fmtDur(tp) + '</b><span>برنامه‌ریزی‌شده</span></div><div class="stat"><b>' + fmtDur(ta) + '</b><span>انجام‌شده</span></div></div>';
    h += '<div class="list" style="margin-top:12px">' + days.map((d) => {
      const ps = dayPlans(d); const cap = capacityOf(d); const pm = ps.reduce((a, p) => a + (p.minutes || 0), 0); const act = dayActual(d);
      const isToday = d === tk, past = d < tk, after = d > exam;
      return '<div class="card' + (isToday ? ' hl' : '') + '"' + (after ? ' style="opacity:.55"' : '') + '><div class="row between"><div><b>' + fmtJ(d, true) + '</b>' + (isToday ? ' ' + chip('امروز', 'acc') : '') + (d === exam ? ' ' + chip('آزمون', 'bad') : '') + '</div><span class="small muted num">' + (past || isToday ? fmtMin(act.sec) + ' / ' : '') + fa(pm) + '′' + (cap ? ' از ' + fa(cap) + '′' : '') + '</span></div>' +
        (cap ? '<div style="margin-top:6px">' + bar(pm, cap, null, pm > cap) + '</div>' : '') + (pm > cap && cap ? '<div class="small" style="color:var(--bad);margin-top:4px">' + fa(pm - cap) + ' دقیقه بیشتر از ظرفیت</div>' : '') +
        (ps.length ? '<div style="margin-top:8px">' + ps.map((p) => { const lb = planLabel(p); const done = planDone(p); return '<div class="kv" data-a="planForm" data-id="' + p.id + '" role="button" tabindex="0" style="cursor:pointer;min-height:44px;align-items:center"><span class="grow" style="min-width:0"><span class="dot" style="background:' + esc(lb.color) + ';margin-left:6px"></span>' + esc(lb.title) + (done ? ' ' + chip('✓', 'ok') : '') + '</span><span class="small muted num">' + (p.minutes ? fa(p.minutes) + '′' : '') + (p.tests ? ' · ' + fa(p.tests) + ' تست' : '') + '</span></div>'; }).join('') + '</div>' : '') +
        '<div class="row" style="margin-top:8px;gap:6px"><button class="btn sm grow" data-a="planForm" data-v="' + d + '">افزودن</button>' + (ps.length ? '<button class="btn sm ghost" data-a="copyPlan" data-v="' + d + '" data-to="' + addDays(d, 1) + '">کپی به فردا</button>' : '') + '</div></div>';
    }).join('') + '</div>';
    return h;
  }
  function planForm(id, date) {
    const p = id ? byId(S.plans, id) : { date, courseId: '', chapterId: '', minutes: null, tests: null };
    const cs = visibleCourses();
    const selCourse = p.courseId || (cs.find((c) => c.type !== 'test') || cs[0] || {}).id;
    sheet('<h2 style="margin-top:0">' + (id ? 'ویرایش برنامه' : 'افزودن به برنامه') + '</h2><div class="small muted">' + fmtJ(p.date, true) + '</div><form data-form="plan" data-id="' + (id || '') + '" data-date="' + p.date + '">' +
      '<label class="f"><span>درس</span><select name="courseId" data-a="planCourse">' + cs.map((c) => '<option value="' + c.id + '" ' + (c.id === selCourse ? 'selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></label>' +
      '<div id="chapsel">' + chapterSelect(selCourse, p.chapterId) + '</div>' +
      '<div class="grid2">' + num('minutes', 'زمان هدف (دقیقه)', p.minutes) + num('tests', 'تعداد تست هدف', p.tests) + '</div>' +
      '<div id="formerr" class="err" role="alert"></div><button class="btn pri block" style="margin-top:14px">ذخیره</button>' + (id ? '<button type="button" class="btn danger block" style="margin-top:8px" data-a="delPlan" data-id="' + id + '">حذف از برنامه‌ی این روز</button>' : '') + '</form>');
  }
  function chapterSelect(courseId, sel) {
    const c = byId(S.courses, courseId); if (!c) return '';
    if (c.type === 'test') return '<p class="small muted" style="margin-top:10px">این درس فصل ندارد؛ برنامه برای آزمون‌های آن ثبت می‌شود.</p><input type="hidden" name="chapterId" value="">';
    const chs = courseChapters(c.id);
    if (!chs.length) return '<p class="small err" style="margin-top:10px">این درس هنوز فصلی ندارد. از بخش «درس‌ها» کتاب و فصل اضافه کنید.</p><input type="hidden" name="chapterId" value="">';
    return '<label class="f"><span>فصل</span><select name="chapterId">' + chs.map((ch) => { const st = chapterState(ch); return '<option value="' + ch.id + '" ' + (ch.id === sel ? 'selected' : '') + '>' + esc(ch.title) + ' — ' + st.label + '</option>'; }).join('') + '</select></label>';
  }

  // ---------- COURSES ----------
  function vCourses() {
    const vis = visibleCourses(); const hidden = S.courses.filter((c) => !c.deletedAt && !courseVisible(c)); const act = S.combos.filter((c) => c.active);
    let h = top('درس‌ها', esc(S.settings.examName) + (S.combos.length ? ' · ' + G() + ': ' + (act.length ? act.map((c) => esc(c.code ? faD(c.code) : c.title)).join('، ') : 'هیچ') : ''));
    h += '<div class="row" style="margin-bottom:12px"><button class="btn pri grow" data-a="courseForm">درس جدید</button><button class="btn grow" data-a="coursesBatch">افزودن چند درس</button></div>';
    h += tip('courses');
    h += '<div class="list">' + vis.map((c) => {
      let sub, prog = '';
      if (c.type === 'test') { const ls = S.langLogs.filter((l) => l.courseId === c.id); const s = L.sumTests(ls); sub = 'فقط تست‌زنی · ' + fa(ls.length) + ' آزمون · ' + pctTxt(s.count ? L.pctRaw(s.correct, s.count) : null); }
      else { const chs = courseChapters(c.id); const done = chs.filter((x) => chapterRounds(x.id).some((r) => r.status === 'done')).length; const sec = S.sessions.filter((s) => s.courseId === c.id).reduce((a, s) => a + s.durationSec, 0); sub = fa(chs.length) + ' فصل · ' + fa(done) + ' با دور کامل · ' + fmtDur(sec); if (chs.length) prog = '<div style="margin-top:8px">' + bar(done, chs.length, c.color) + '</div>'; }
      return '<div class="card crs"><div class="row"><button class="grow tapzone" data-a="openCourse" data-id="' + c.id + '"><div class="row"><span class="cdot" style="background:' + esc(c.color) + '"></span><b class="grow">' + esc(c.name) + '</b></div><div class="small muted" style="margin-top:2px">' + sub + '</div>' + prog + '</button><button class="iconbtn ghosti" data-a="courseMenu" data-id="' + c.id + '" aria-label="گزینه‌های ' + esc(c.name) + '">' + DOTS + '</button></div></div>';
    }).join('') + '</div>';
    if (!vis.length) h += '<div class="card empty">' + (S.courses.some((c) => !c.deletedAt) ? 'هیچ درسی برای ' + G() + '‌های فعال نیست.' : 'هنوز درسی ندارید. «درس جدید» یا «افزودن چند درس» را بزنید.') + '</div>';
    if (hidden.length) h += '<details class="card" style="margin-top:16px"><summary>بایگانی یا خارج از ' + G() + '‌های فعال (' + fa(hidden.length) + ')</summary>' + hidden.map((c) => '<div class="row between" style="padding:8px 0;border-top:1px solid var(--line)"><span>' + esc(c.name) + (c.archived ? ' <span class="small muted">· بایگانی</span>' : '') + '</span><button class="iconbtn ghosti" data-a="courseMenu" data-id="' + c.id + '" aria-label="گزینه‌ها">' + DOTS + '</button></div>').join('') + '</details>';
    return h;
  }
  function vCourse(p) {
    const c = byId(S.courses, p.id); if (!c || c.deletedAt) return top('درس پیدا نشد');
    let h = top(c.name, comboNames(c), '<button class="iconbtn" data-a="courseMenu" data-id="' + c.id + '" aria-label="گزینه‌های درس">' + DOTS + '</button>');
    if (c.archived) h += '<div class="banner warn">این درس بایگانی است.</div>';
    if (c.type === 'test') return h + tip('testcourse') + testCourseBody(c);
    h += tip('course');
    // chapter comparison for whole course
    const chs = courseChapters(c.id, true);
    h += '<div class="row between"><h2>کتاب‌ها</h2><button class="btn sm" data-a="bookForm" data-course="' + c.id + '">کتاب جدید</button></div>';
    const books = courseBooks(c.id);
    h += books.length ? '<div class="list">' + books.map((b) => '<div class="card crs"><div class="row"><button class="grow tapzone" data-a="openBook" data-id="' + b.id + '"><b>' + esc(b.title) + '</b><div class="small muted">' + (b.author ? esc(b.author) + ' · ' : '') + fa(bookChapters(b.id).length) + ' فصل و زیرفصل</div></button><button class="iconbtn ghosti" data-a="bookMenu" data-id="' + b.id + '" aria-label="گزینه‌های کتاب">' + DOTS + '</button></div></div>').join('') + '</div>' : '<div class="card empty">هنوز کتابی برای این درس ثبت نشده.</div>';
    if (chs.length) h += '<h2>مقایسه‌ی فصل‌ها در دورها</h2>' + chapterMatrix(chs);
    return h;
  }
  function chapterMatrix(chs) {
    const maxR = Math.max(1, ...chs.map((ch) => chapterRounds(ch.id).filter((r) => r.tests.length || r.status === 'done').length));
    const cols = Math.min(maxR, 6);
    return '<div class="card tscroll" style="padding:4px 10px"><table><thead><tr><th>فصل</th>' + [...Array(cols)].map((_, i) => '<th>دور ' + fa(i + 1) + '</th>').join('') + '</tr></thead><tbody>' +
      chs.map((ch) => { const rs = chapterRounds(ch.id).filter((r) => r.tests.length || r.status === 'done');
        return '<tr data-a="openChapter" data-id="' + ch.id + '" style="cursor:pointer' + (ch.priority === 'excluded' ? ';opacity:.5' : '') + '"><td style="white-space:normal;min-width:110px">' + esc(ch.title) + '</td>' + [...Array(cols)].map((_, i) => { const r = rs[i]; if (!r) return '<td class="muted">—</td>'; const s = roundSummary(r); const st = roundStatus(r); return '<td><span class="chip ' + (st ? STATUS[st][1] : '') + '">' + (s.pct == null ? '—' : fa(s.pct, 0) + '٪') + '</span><div class="small muted">' + fmtMin(s.studySec) + '</div></td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div><p class="small muted" style="margin-top:6px">هر خانه: درصد آخرین آزمون دور و زمان مطالعه‌ی آن دور.</p>';
  }
  function vBook(p) {
    const b = byId(S.books, p.id); if (!b || b.deletedAt) return top('کتاب پیدا نشد');
    const c = byId(S.courses, b.courseId); const chs = orderedChapters(b.id);
    let h = top(b.title, esc(c.name) + (b.author ? ' · ' + esc(b.author) : ''), '<button class="iconbtn" data-a="bookMenu" data-id="' + b.id + '" aria-label="گزینه‌های کتاب">' + DOTS + '</button>');
    h += tip('book');
    h += '<div class="row" style="margin:8px 0 12px"><button class="btn pri grow" data-a="batchForm" data-id="' + b.id + '">ورود دسته‌ای فصل‌ها</button><button class="btn grow" data-a="chapterForm" data-book="' + b.id + '">فصل تکی</button></div>';
    if (!chs.length) return h + '<div class="card empty">فهرست فصل‌ها را با «ورود دسته‌ای» بچسبانید.</div>';
    h += '<div class="card" style="padding:4px 12px">' + chs.map((ch) => {
      const sibs = live(S.chapters).filter((x) => x.bookId === b.id && (x.parentId || null) === (ch.parentId || null)).sort((a, z) => a.order - z.order);
      const i = sibs.findIndex((x) => x.id === ch.id); const st = chapterState(ch); const rs = chapterRounds(ch.id).filter((r) => r.tests.length); const last = rs[rs.length - 1];
      return '<div class="chap ' + (ch.parentId ? 'sub ' : '') + (ch.priority === 'excluded' ? 'excluded' : '') + '"><div class="t" data-a="openChapter" data-id="' + ch.id + '" role="button" tabindex="0"><span>' + esc(ch.title) + '</span><span class="small muted">' + (hasKids(ch.id) ? 'دارای زیرفصل' : ch.priority === 'excluded' ? 'حذف از برنامه' : st.label + (last ? ' · ' + pctTxt(roundSummary(last).pct) : '')) + '</span></div>' +
        '<div class="mv">' + (!hasKids(ch.id) && ch.priority !== 'excluded' ? '<button class="playb' + (timerForChapter(ch.id) ? ' on' : '') + '" data-a="studyFromList" data-id="' + ch.id + '" aria-label="' + studyLabel(ch.id) + ' ' + esc(ch.title) + '">' + (timerForChapter(ch.id) ? SVG('<rect x="7" y="6" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="13.5" y="6" width="3.5" height="12" rx="1" fill="currentColor"/>') : SVG('<path d="M8 5v14l11-7z" fill="currentColor"/>')) + '</button>' : '') + '<button data-a="moveCh" data-id="' + ch.id + '" data-v="-1" aria-label="بالا" ' + (i === 0 ? 'disabled' : '') + '>' + ICON.up + '</button><button data-a="moveCh" data-id="' + ch.id + '" data-v="1" aria-label="پایین" ' + (i === sibs.length - 1 ? 'disabled' : '') + '>' + ICON.down + '</button><button data-a="chapterMenu" data-id="' + ch.id + '" aria-label="گزینه‌های ' + esc(ch.title) + '">' + DOTS + '</button></div></div>';
    }).join('') + '</div>';
    return h;
  }

  // ---------- CHAPTER (comparison) ----------
  function vChapter(p) {
    const ch = byId(S.chapters, p.id); if (!ch || ch.deletedAt) return top('فصل پیدا نشد');
    const b = byId(S.books, ch.bookId); const c = byId(S.courses, b.courseId); const parent = ch.parentId ? byId(S.chapters, ch.parentId) : null;
    let h = top(ch.title, esc(c.name) + ' · ' + esc(b.title) + (parent ? ' · ' + esc(parent.title) : ''), '<button class="iconbtn" data-a="chapterMenu" data-id="' + ch.id + '" aria-label="گزینه‌های فصل">' + DOTS + '</button>');
    const meta = [chip('اولویت ' + PRI[ch.priority], ch.priority === 'excluded' ? 'bad' : '')];
    if (ch.importance) meta.push(chip('اهمیت ' + fa(ch.importance) + '/۵'));
    if (ch.pastTestCount != null) meta.push(chip(fa(ch.pastTestCount) + ' تست سال‌های قبل'));
    if (ch.estMinutes) meta.push(chip('تخمین ' + fa(ch.estMinutes) + ' دقیقه'));
    h += '<div class="row wrapx" style="gap:6px">' + meta.join('') + '</div>' + '<div style="margin-top:12px">' + tip('chapter') + '</div>';
    if (hasKids(ch.id)) return h + '<div class="banner info" style="margin-top:12px">این فصل زیرفصل دارد؛ دورها و تست‌ها روی زیرفصل‌ها ثبت می‌شوند.</div>' + chapterMatrix(live(S.chapters).filter((x) => x.parentId === ch.id).sort((a, z) => a.order - z.order));
    if (ch.priority === 'excluded') h += '<div class="banner warn" style="margin-top:10px">این فصل از برنامه حذف شده. برای بازگرداندن، اولویت را تغییر دهید.</div>';
    const rs = chapterRounds(ch.id); const active = rs.find((r) => r.status === 'active');
    h += chapterActions(ch, active, rs);
    h += '<button class="btn ghost block" data-a="planForm" data-v="' + todayKey() + '" data-ch="' + ch.id + '">افزودن به برنامه‌ی امروز</button>';
    const done = rs.filter((r) => r.tests.length || r.status === 'done');
    if (!done.length) return h + '<div class="card empty" style="margin-top:12px">هنوز دوری ثبت نشده. با «شروع دور» زمان مطالعه و تست را بسنجید، یا با «ثبت سریع» نتیجه را وارد کنید.</div>';
    const sums = done.map((r) => Object.assign({ r }, roundSummary(r)));
    h += '<h2>مقایسه‌ی دورها</h2><div class="card">' + roundsChart(sums) + '</div>';
    h += '<div class="card tscroll" style="padding:4px 10px;margin-top:10px"><table><thead><tr><th>دور</th><th>مطالعه</th><th>تست</th><th>صحیح</th><th>درصد</th><th>زمان تست</th><th>وضعیت</th></tr></thead><tbody>' +
      sums.map((s) => '<tr data-a="roundDetail" data-id="' + s.r.id + '" style="cursor:pointer"><td>' + fa(s.r.roundNumber) + (s.r.status === 'active' ? ' ' + chip('باز', 'acc') : '') + '</td><td>' + fmtDur(s.studySec) + '</td><td>' + fa(s.count) + '</td><td>' + fa(s.correct) + '</td><td><b>' + pctTxt(s.pct) + '</b></td><td>' + fmtDur(s.testSec) + '</td><td>' + statusChip(roundStatus(s.r)) + '</td></tr>').join('') + '</tbody></table></div>';
    if (sums.length > 1) {
      h += '<h2>تغییر نسبت به دور قبل</h2><div class="list">' + sums.slice(1).map((s, i) => { const pv = sums[i]; const cmp = L.compareRounds(pv, s); if (!cmp) return '<div class="card small muted">دور ' + fa(s.r.roundNumber) + ': تست ندارد؛ مقایسه ممکن نیست.</div>';
        const v = VERDICT[cmp.verdict]; return '<div class="card"><div class="row between"><b>دور ' + fa(pv.r.roundNumber) + ' ← ' + fa(s.r.roundNumber) + '</b>' + chip(v[0], v[1]) + '</div><div class="row small" style="margin-top:6px;gap:16px;flex-wrap:wrap"><span>درصد: <b class="num" dir="ltr">' + (cmp.dp >= 0 ? '+' : '') + fa(cmp.dp, 1) + '</b></span><span>زمان مطالعه: <b class="num" dir="ltr">' + (cmp.dt > 0 ? '+' : cmp.dt < 0 ? '−' : '') + fa(Math.abs(Math.round(cmp.dt / 60))) + '′</b></span></div></div>'; }).join('') + '</div><p class="small muted" style="margin-top:6px">کاهش زمان فقط وقتی پیشرفت حساب می‌شود که درصد حفظ یا بیشتر شده باشد.</p>';
    }
    return h;
  }
  function roundsChart(sums) {
    const W = 320, H = 150, P = 26; const n = sums.length; const bw = Math.min(34, (W - 2 * P) / n * 0.5);
    const maxT = Math.max(1, ...sums.map((s) => s.studySec)); const x = (i) => P + (n === 1 ? (W - 2 * P) / 2 : i * (W - 2 * P) / (n - 1));
    const yT = (v) => H - 22 - v / maxT * (H - 44); const yP = (p) => H - 22 - Math.max(0, p) / 100 * (H - 44);
    let g = '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + (H - 22) + '" y2="' + (H - 22) + '" stroke="var(--line)"/>';
    sums.forEach((s, i) => { g += '<rect x="' + (x(i) - bw / 2) + '" y="' + yT(s.studySec) + '" width="' + bw + '" height="' + (H - 22 - yT(s.studySec)) + '" rx="4" fill="var(--soft)" stroke="var(--line)"/><text x="' + x(i) + '" y="' + (H - 6) + '" font-size="11" text-anchor="middle" fill="var(--muted)">دور ' + faD(s.r.roundNumber) + '</text><text x="' + x(i) + '" y="' + (yT(s.studySec) - 4) + '" font-size="10" text-anchor="middle" fill="var(--muted)">' + faD(Math.round(s.studySec / 60)) + '′</text>'; });
    const pts = sums.map((s, i) => s.pct == null ? null : [x(i), yP(s.pct), s.pct]).filter(Boolean);
    if (pts.length) { if (pts.length > 1) g += '<path d="' + pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') + '" fill="none" stroke="var(--acc)" stroke-width="2.5"/>'; pts.forEach((p) => { g += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" fill="var(--acc)"/><text x="' + p[0] + '" y="' + (p[1] - 8) + '" font-size="11" font-weight="700" text-anchor="middle" fill="var(--acc)">' + faD(Math.round(p[2])) + '٪</text>'; }); }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block" role="img" aria-label="زمان مطالعه و درصد صحیح در هر دور">' + g + '</svg><div class="row small muted" style="gap:14px;justify-content:center"><span><span class="dot" style="background:var(--soft);border:1px solid var(--line)"></span> زمان مطالعه</span><span><span class="dot" style="background:var(--acc)"></span> درصد صحیح</span></div>';
  }

  function chapterActions(ch, active, rs) {
    const dis = ch.priority === 'excluded' ? 'disabled' : '';
    const studied = active ? roundSessions(active.id).filter((x) => isStudy(x) && (x.cycle || 1) === (active.cycle || 1)).reduce((a, x) => a + x.durationSec, 0) : 0;
    let h = '<div class="card" style="margin-top:14px">';
    if (active) h += '<div class="row between"><b>دور ' + fa(active.roundNumber) + (active.cycle > 1 ? ' · چرخه‌ی ' + fa(active.cycle) : '') + '</b>' + chip(active.step === 'study' ? (studied ? 'مطالعه نیمه‌کاره · ' + fmtDur(studied) : 'آماده‌ی مطالعه') : active.step === 'test' ? 'مطالعه تمام شد · نوبت تست' : 'نتیجه ثبت شد', 'acc') + '</div>';
    else h += '<div class="small muted">دور ' + fa(rs.length + 1) + ' هنوز شروع نشده</div>';
    const running = timerForChapter(ch.id);
    h += '<div class="row" style="margin-top:10px"><button class="btn pri big grow" data-a="studyFromList" data-id="' + ch.id + '" ' + dis + '>' + (running ? 'رفتن به جلسه' : studyLabel(ch.id)) + '</button>' +
      (active && active.step === 'study' ? '<button class="btn big grow finish" data-a="finishFromList" data-id="' + ch.id + '">اتمام فصل</button>' : '') + '</div>';
    h += '<div class="row" style="margin-top:8px"><button class="btn sm grow" data-a="manualStudyCh" data-id="' + ch.id + '" ' + dis + '>ثبت دستی زمان</button><button class="btn sm grow" data-a="quickForm" data-id="' + ch.id + '" ' + dis + '>ثبت سریع نتیجه</button>' + (active ? '<button class="btn sm grow" data-a="openSession" data-id="' + active.id + '">جزئیات دور</button>' : '') + '</div></div>';
    return h;
  }

  // ---------- SESSION (round: study → test → result) ----------
  function vSession(p) {
    const r = byId(S.rounds, p.id); if (!r) return top('دور پیدا نشد');
    const ch = byId(S.chapters, r.chapterId); const c = chapterCourse(ch);
    const steps = [['study', 'مطالعه'], ['test', 'تست'], ['result', 'نتیجه']]; const idx = steps.findIndex(([k]) => k === r.step);
    let h = top(ch.title, esc(c.name) + ' · دور ' + fa(r.roundNumber) + (r.tests.length ? ' · چرخه‌ی ' + fa(r.cycle) : ''));
    h += '<div class="steps">' + steps.map(([, l], i) => '<span class="' + (i === idx ? 'on' : i < idx ? 'done' : '') + '">' + faD(i + 1) + '. ' + l + '</span>').join('') + '</div><div style="margin-top:14px">' + tip(r.step);
    if (r.step === 'study') {
      h += studyStep(r, ch);
    } else if (r.step === 'test') h += testStep(r);
    else h += resultStep(r, ch);
    h += '</div>';
    if (r.step !== 'result') h += '<button class="btn ghost block" style="margin-top:20px" data-a="closeRound" data-id="' + r.id + '">بستن دور</button>';
    return h;
  }
  function studyStep(r, ch) {
    const t = timerFor(r.id, 'study'); const other = S.timer && !t;
    const ss = roundSessions(r.id).filter((x) => isStudy(x) && (x.cycle || 1) === (r.cycle || 1)).sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
    const done = ss.reduce((a, x) => a + x.durationSec, 0); const live = t ? Math.round(tElapsed() / 1000) : 0; const cap = ch.estMinutes;
    let h = '<div class="card" style="text-align:center"><div class="small muted">' + (t ? (t.running ? 'در حال مطالعه' : 'مکث') : (ss.length ? 'مطالعه‌ی این فصل نیمه‌کاره است' : 'مطالعه‌ی این فصل هنوز شروع نشده')) + '</div>' +
      '<div class="timer" ' + (t ? 'data-timer' : '') + '>' + fmtClock(t ? tElapsed() : 0) + '</div><div id="capwarn"></div>' +
      '<div class="small muted">مجموع مطالعه‌ی این دور: <b class="num" style="color:var(--ink)" data-total="' + done + '">' + fmtDur(done + live) + '</b>' + (cap ? ' از ' + fa(cap) + ' دقیقه‌ی تخمینی' : '') + ' · ' + fa(ss.length) + ' جلسه</div>' + (cap ? '<div style="margin-top:8px">' + bar(done + live, cap * 60) + '</div>' : '') + '</div>';
    if (other) h += '<div class="banner warn" style="margin-top:10px">یک زمان‌سنج دیگر در جریان است. <button class="btn sm" data-a="resumeTimer">رفتن به آن</button></div>';
    else if (!t) h += '<div class="row" style="margin-top:12px"><button class="btn pri big grow" data-a="studyStart" data-id="' + r.id + '">' + (ss.length ? 'ادامه‌ی مطالعه' : 'شروع مطالعه') + '</button><button class="btn big grow" data-a="manualStudy" data-id="' + r.id + '">ثبت دستی زمان</button></div>';
    else h += '<div class="row" style="margin-top:12px">' + (t.running ? '<button class="btn grow" data-a="tPause">مکث</button>' : '<button class="btn grow" data-a="tResume">ادامه</button>') + '<button class="btn grow" data-a="tEdit">اصلاح زمان</button></div>' +
      '<button class="btn pri block big" style="margin-top:10px" data-a="studyStop" data-id="' + r.id + '">پایان این جلسه (فصل تمام نشده)</button>';
    h += '<button class="btn block big finish" style="margin-top:10px" data-a="finishChapter" data-id="' + r.id + '" ' + (other ? 'disabled' : '') + '>اتمام فصل و رفتن به تست</button>';
    if (ss.length) h += '<h3 style="margin-top:18px">جلسه‌های مطالعه‌ی این دور</h3><div class="card" style="margin-top:8px;padding:4px 14px">' + ss.map((x) => '<div class="kv"><span>' + fmtJIso(x.startedAt) + (x.manualEdit ? ' <span class="small muted">· دستی</span>' : '') + '</span><span class="row" style="gap:4px"><span class="num">' + fmtDur(x.durationSec) + '</span><button class="iconbtn ghosti" style="width:40px;height:40px" data-a="delSession" data-id="' + x.id + '" aria-label="حذف این جلسه">×</button></span></div>').join('') + '</div>';
    return h;
  }
  function timerBlock(r, step, hint) {
    const t = timerFor(r.id, step); const other = S.timer && !t;
    let h = '<div class="card" style="text-align:center">' + (hint ? '<p class="muted small">' + hint + '</p>' : '') + '<div class="timer" ' + (t ? 'data-timer' : '') + '>' + fmtClock(t ? tElapsed() : 0) + '</div><div id="capwarn"></div>';
    if (other) h += '<div class="banner warn">یک زمان‌سنج دیگر در جریان است. <button class="btn sm" data-a="resumeTimer">رفتن به آن</button></div>';
    else if (!t) h += '<button class="btn pri block big" data-a="tStart" data-id="' + r.id + '" data-v="' + step + '">شروع زمان‌سنج</button>';
    else h += '<div class="row">' + (t.running ? '<button class="btn grow" data-a="tPause">مکث</button>' : '<button class="btn grow" data-a="tResume">ادامه</button>') + '<button class="btn grow" data-a="tEdit">ویرایش دستی</button></div>' + (t.manual ? '<p class="small muted" style="margin-top:6px">زمان دستی ویرایش شده.</p>' : '');
    return h + '</div>';
  }
  function testFields(prefCount) {
    return '<div class="seg" role="group" aria-label="روش ورود" style="margin-top:4px"><button type="button" data-a="tmode" data-v="n" aria-pressed="true">تعداد صحیح</button><button type="button" data-a="tmode" data-v="p" aria-pressed="false">درصد</button></div><input type="hidden" name="mode" value="n">' +
      '<div class="grid2">' + num('count', 'تعداد تست', prefCount, 'data-a="testLive"') + '<div data-mode="n">' + num('correct', 'صحیح', '', 'data-a="testLive"') + '</div><div data-mode="p" hidden>' + num('pct', 'درصد صحیح', '', 'data-a="testLive" inputmode="decimal"') + '</div></div>' +
      (S.settings.negOn ? num('wrong', 'غلط (برای نمره‌ی منفی)', '', 'data-a="testLive"') : '') +
      '<div id="testlive" class="small muted" style="margin-top:8px" aria-live="polite"></div><div id="testerr" class="err" role="alert"></div>';
  }
  function readTest(f) {
    const mode = f.mode.value; const raw = { count: L.parseIntSafe(f.count.value), wrong: f.wrong ? L.parseIntSafe(f.wrong.value) : null };
    if (mode === 'p') { raw.pct = L.parseNum(f.pct.value); if (Number.isNaN(raw.pct)) raw.pct = -1; } else raw.correct = L.parseIntSafe(f.correct.value);
    if (Number.isNaN(raw.count)) raw.count = -1; if (Number.isNaN(raw.correct)) raw.correct = -1; if (Number.isNaN(raw.wrong)) raw.wrong = -1;
    return L.normTest(raw);
  }
  function testStep(r) {
    const t = timerFor(r.id, 'test');
    let h = timerBlock(r, 'test', 'زمان تست‌زنی را بسنجید' + (r.cycle > 1 ? '؛ تست‌های جدید' : '') + '.');
    h += '<form data-form="testSave" data-id="' + r.id + '" class="card" style="margin-top:12px"><h3>نتیجه‌ی تست</h3>' + testFields(S.settings.testCount);
    if (!t) h += num('minutes', 'مدت تست‌زنی (دقیقه، اگر بدون زمان‌سنج)', '');
    return h + '<button class="btn pri block big" style="margin-top:12px">ثبت نتیجه</button></form>';
  }
  function resultStep(r, ch) {
    const t = r.tests[r.tests.length - 1]; const p = pctOf(t); const st = roundStatus(r);
    const prevRounds = chapterRounds(ch.id).filter((x) => x.id !== r.id && x.roundNumber < r.roundNumber && x.tests.length);
    const prev = prevRounds[prevRounds.length - 1];
    let h = '<div class="card" style="text-align:center"><div class="count">' + pctTxt(p) + '</div><div class="small muted">' + fa(t.correct) + ' صحیح از ' + fa(t.count) + ' تست</div><div class="row" style="justify-content:center;margin:8px 0">' + statusChip(st) + '</div>' +
      '<div class="kv"><span class="muted">مطالعه در این دور</span><span>' + fmtDur(studySec(r.id)) + '</span></div><div class="kv"><span class="muted">زمان این تست</span><span>' + fmtDur(t.seconds) + '</span></div>';
    if (prev) { const ps = roundSummary(prev); const cs = roundSummary(r); const cmp = L.compareRounds(ps, cs); h += '<div class="kv"><span class="muted">دور ' + fa(prev.roundNumber) + '</span><span>' + pctTxt(ps.pct) + ' · ' + fmtDur(ps.studySec) + '</span></div>' + (cmp ? '<div class="row" style="justify-content:center;margin-top:8px">' + chip(VERDICT[cmp.verdict][0], VERDICT[cmp.verdict][1]) + '</div>' : ''); }
    h += '</div>';
    if (r.tests.length > 1) h += '<div class="card" style="margin-top:10px"><div class="small muted">چرخه‌های این دور</div>' + r.tests.map((x, i) => '<div class="kv"><span>چرخه‌ی ' + fa(i + 1) + '</span><span class="num">' + fa(x.correct) + '/' + fa(x.count) + ' · ' + pctTxt(pctOf(x)) + '</span></div>').join('') + '</div>';
    h += '<button class="btn pri block big" style="margin-top:12px" data-a="closeRound" data-id="' + r.id + '">بستن دور</button><button class="btn block" style="margin-top:8px" data-a="again" data-id="' + r.id + '">مطالعه‌ی مجدد و تست جدید</button>';
    return h;
  }

  // ---------- test-only course (e.g. English) ----------
  function testCourseBody(c) {
    const logs = S.langLogs.filter((l) => l.courseId === c.id).sort((a, b) => (a.at < b.at ? 1 : -1));
    const t = S.timer && S.timer.courseId === c.id && !S.timer.roundId ? S.timer : null;
    let h = '<div class="banner info" style="margin-bottom:12px">این درس فصل ندارد؛ فقط زمان و نتیجه‌ی هر آزمون ثبت می‌شود.</div>';
    h += '<div class="card" style="text-align:center"><div class="timer" ' + (t ? 'data-timer' : '') + '>' + fmtClock(t ? tElapsed() : 0) + '</div>' +
      (S.timer && !t ? '<div class="banner warn">زمان‌سنج دیگری در جریان است.</div>' : !t ? '<button class="btn pri block big" data-a="langStart" data-id="' + c.id + '">شروع آزمون</button>' : '<div class="row">' + (t.running ? '<button class="btn grow" data-a="tPause">مکث</button>' : '<button class="btn grow" data-a="tResume">ادامه</button>') + '<button class="btn grow" data-a="tEdit">ویرایش دستی</button></div>') + '</div>';
    h += '<form data-form="langSave" data-id="' + c.id + '" class="card" style="margin-top:12px"><h3>ثبت نتیجه</h3>' + testFields(S.settings.testCount) + (!t ? num('minutes', 'مدت (دقیقه، اگر بدون زمان‌سنج)', '') : '') + '<button class="btn pri block big" style="margin-top:12px">ثبت آزمون</button></form>';
    if (!logs.length) return h + '<div class="empty">هنوز آزمونی ثبت نشده.</div>';
    const pts = logs.slice(0, 20).reverse().map((l) => pctOf(l));
    h += '<h2>روند درصد صحیح</h2><div class="card">' + spark(pts) + '<p class="small muted">' + fa(pts.length) + ' آزمون اخیر</p></div>';
    h += '<h2>آزمون‌ها</h2><div class="card tscroll" style="padding:4px 10px"><table><thead><tr><th>تاریخ</th><th>تست</th><th>صحیح</th><th>درصد</th><th>زمان</th><th></th></tr></thead><tbody>' +
      logs.slice(0, 60).map((l) => '<tr><td>' + fmtJ(l.date) + '</td><td>' + fa(l.count) + '</td><td>' + fa(l.correct) + '</td><td><b>' + pctTxt(pctOf(l)) + '</b></td><td>' + fmtDur(l.seconds) + '</td><td><button class="btn sm ghost" data-a="delLang" data-id="' + l.id + '">حذف</button></td></tr>').join('') + '</tbody></table></div>';
    return h;
  }
  function spark(pts) {
    const v = pts.filter((x) => x != null); if (v.length < 2) return '<p class="muted small">برای نمودار حداقل دو آزمون لازم است.</p>';
    const W = 300, H = 80, lo = Math.min(0, ...v); const x = (i) => 8 + i * (W - 16) / (pts.length - 1); const y = (p) => H - 8 - (p - lo) / (100 - lo) * (H - 16);
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:80px;display:block" preserveAspectRatio="none" role="img" aria-label="روند درصد صحیح"><line x1="0" x2="' + W + '" y1="' + y(50) + '" y2="' + y(50) + '" stroke="var(--line)" stroke-dasharray="3 3"/><path d="' + pts.map((p, i) => p == null ? '' : (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p).toFixed(1)).join(' ') + '" fill="none" stroke="var(--acc)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>';
  }

  // ---------- STATS ----------
  function vStats() {
    const tk = todayKey(); const all = activeChapters(); const covered = all.filter((ch) => chapterRounds(ch.id).some((r) => r.status === 'done'));
    const second = all.filter((ch) => chapterRounds(ch.id).filter((r) => r.status === 'done').length >= 2);
    const totSec = S.sessions.reduce((a, s) => a + s.durationSec, 0); const allTests = []; S.rounds.forEach((r) => r.tests.forEach((t) => allTests.push(t))); S.langLogs.forEach((l) => allTests.push(l)); const ts = L.sumTests(allTests);
    let h = top('آمار', fa(Math.max(0, L.daysBetween(tk, S.settings.examDate))) + ' روز تا آزمون') + tip('stats');
    h += '<div class="grid2"><div class="stat"><b>' + fa(covered.length) + ' / ' + fa(all.length) + '</b><span>فصل با حداقل یک دور</span>' + (all.length ? '<div style="margin-top:6px">' + bar(covered.length, all.length) + '</div>' : '') + '</div><div class="stat"><b>' + fa(second.length) + '</b><span>فصل با دور دوم</span></div>' +
      '<div class="stat"><b>' + fmtDur(totSec) + '</b><span>کل زمان</span></div><div class="stat"><b>' + fa(ts.count) + '</b><span>کل تست · ' + pctTxt(ts.count ? L.pctRaw(ts.correct, ts.count) : null) + '</span></div></div>';
    // last 14 days: plan vs actual
    const days = [...Array(14)].map((_, i) => addDays(tk, i - 13));
    const rows = days.map((d) => ({ d, a: dayActual(d).sec / 60, p: dayPlans(d).reduce((x, p) => x + (p.minutes || 0), 0) }));
    h += '<h2>۱۴ روز اخیر: برنامه و انجام‌شده</h2><div class="card">' + daysChart(rows) + '</div>';
    // per course
    const cs = visibleCourses();
    h += '<h2>هر درس</h2><div class="card tscroll" style="padding:4px 10px"><table><thead><tr><th>درس</th><th>زمان</th><th>تست</th><th>درصد</th><th>پوشش</th></tr></thead><tbody>' + cs.map((c) => {
      const sec = S.sessions.filter((s) => s.courseId === c.id).reduce((a, s) => a + s.durationSec, 0); const tl = []; S.rounds.filter((r) => r.courseId === c.id).forEach((r) => r.tests.forEach((t) => tl.push(t))); S.langLogs.filter((l) => l.courseId === c.id).forEach((l) => tl.push(l)); const s = L.sumTests(tl);
      const chs = c.type === 'test' ? null : courseChapters(c.id); const cov = chs ? chs.filter((ch) => chapterRounds(ch.id).some((r) => r.status === 'done')).length : null;
      return '<tr data-a="openCourse" data-id="' + c.id + '" style="cursor:pointer"><td style="white-space:normal;min-width:120px"><span class="dot" style="background:' + esc(c.color) + ';margin-left:6px"></span>' + esc(c.name) + '</td><td>' + fmtDur(sec) + '</td><td>' + fa(s.count) + '</td><td>' + pctTxt(s.count ? L.pctRaw(s.correct, s.count) : null) + '</td><td>' + (chs ? fa(cov) + '/' + fa(chs.length) : '—') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    // weakest chapters
    const scored = all.map((ch) => { const rs = chapterRounds(ch.id).filter((r) => r.tests.length); const l = rs[rs.length - 1]; return l ? { ch, pct: roundSummary(l).pct, n: rs.length } : null; }).filter((x) => x && x.pct != null).sort((a, b) => a.pct - b.pct);
    if (scored.length) {
      const row = (x) => '<div class="kv" data-a="openChapter" data-id="' + x.ch.id + '" role="button" tabindex="0" style="cursor:pointer;min-height:44px;align-items:center"><span class="grow" style="min-width:0">' + esc(x.ch.title) + ' <span class="small muted">· ' + esc(chapterCourse(x.ch).name) + ' · دور ' + fa(x.n) + '</span></span><b class="num">' + pctTxt(x.pct) + '</b></div>';
      h += '<h2>ضعیف‌ترین فصل‌ها</h2><div class="card" style="padding:4px 14px">' + scored.slice(0, 6).map(row).join('') + '</div>';
      if (scored.length > 6) h += '<h2>قوی‌ترین فصل‌ها</h2><div class="card" style="padding:4px 14px">' + scored.slice(-5).reverse().map(row).join('') + '</div>';
    }
    h += '<button class="btn block" style="margin-top:16px" data-a="goStats" data-v="sessions">همه‌ی جلسه‌ها</button>';
    return h;
  }
  function daysChart(rows) {
    const W = 320, H = 140, P = 8; const n = rows.length; const max = Math.max(30, ...rows.map((r) => Math.max(r.a, r.p))); const bw = (W - 2 * P) / n;
    const y = (v) => H - 20 - v / max * (H - 36); let g = '';
    rows.forEach((r, i) => { const x = P + i * bw; g += '<rect x="' + (x + bw * 0.2) + '" y="' + y(r.a) + '" width="' + bw * 0.6 + '" height="' + (H - 20 - y(r.a)) + '" rx="3" fill="var(--acc)"/>'; if (r.p) g += '<line x1="' + (x + bw * 0.1) + '" x2="' + (x + bw * 0.9) + '" y1="' + y(r.p) + '" y2="' + y(r.p) + '" stroke="var(--ink)" stroke-width="2"/>'; if (i % 2 === 1 || n < 8) g += '<text x="' + (x + bw / 2) + '" y="' + (H - 5) + '" font-size="9.5" text-anchor="middle" fill="var(--muted)">' + faD(L.keyToJalali(r.d).jd) + '</text>'; });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block" role="img" aria-label="زمان مطالعه‌ی روزانه در برابر برنامه">' + g + '</svg><div class="row small muted" style="gap:14px;justify-content:center"><span><span class="dot" style="background:var(--acc)"></span> انجام‌شده (دقیقه)</span><span><span style="display:inline-block;width:14px;height:2px;background:var(--ink);vertical-align:middle"></span> برنامه</span></div>';
  }
  function vSessions() {
    const ss = S.sessions.slice().sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, 150);
    let h = top('جلسه‌ها'); if (!ss.length) return h + '<div class="empty">هنوز جلسه‌ای ثبت نشده.</div>';
    let lastDay = '';
    return h + '<div class="card" style="padding:4px 14px">' + ss.map((s) => {
      const dk = L.dateKey(new Date(s.startedAt)); const ch = s.chapterId ? byId(S.chapters, s.chapterId) : null; const c = byId(S.courses, s.courseId);
      let out = ''; if (dk !== lastDay) { out = '<div class="small muted" style="padding-top:10px;font-weight:700">' + fmtJ(dk, true) + '</div>'; lastDay = dk; }
      return out + '<div class="kv"><span class="grow" style="min-width:0"><span class="dot" style="background:' + esc(c ? c.color : '#999') + ';margin-left:6px"></span>' + esc(ch ? ch.title : (c ? c.name : '')) + ' <span class="muted small">· ' + (STEP_LABEL[s.step] || s.step) + (s.manualEdit ? ' · دستی' : '') + '</span></span><span class="num small">' + hmTime(s.startedAt) + ' · ' + fmtDur(s.durationSec) + '</span></div>';
    }).join('') + '</div>';
  }

  // ---------- MORE ----------
  function vMore() {
    const items = [['programs', 'برنامه‌های من', fa(ROOT.programs.length) + ' برنامه · هر آزمون و گرایش یک برنامه'], ['pro', isPro() ? 'پلن پیشرفته · فعال' : 'پلن پیشرفته', isPro() ? 'برنامه‌های نامحدود فعال است' : 'برنامه‌های نامحدود؛ ماهانه یا سالانه با ۵۰٪ تخفیف'], ['help', 'راهنما', 'آموزش ساده‌ی بخش‌ها، معرفی اپ و چک‌لیست شروع'], ['settings', 'تنظیمات', 'تاریخ آزمون، ساعت مفید روزها، تعداد تست، آستانه‌ها، نمره منفی'], S.combos.length ? ['combos', 'گروه‌های دروس', 'فعال‌کردن گروه‌های دروس این برنامه'] : null, ['backup', 'پشتیبان و بازیابی', 'خروجی و ورود فایل JSON'], ['bin', 'سطل بازیافت', 'بازگرداندن موارد حذف‌شده (۳۰ روز)'], ['audit', 'تاریخچه‌ی تغییرات', 'حذف‌ها و بازگردانی‌ها'], ['selftest', 'آزمون محاسبات', 'بررسی درستی محاسبه‌ها']];
    return top('بیشتر', esc(S.settings.examName)) + '<div class="card" id="syncbox">' + syncHtml() + '</div><div class="list" style="margin-top:12px">' + items.filter(Boolean).map(([k, t, s]) => '<button class="card tap" data-a="goMore" data-v="' + k + '"><b>' + t + '</b><div class="small muted">' + s + '</div></button>').join('') + '</div>';
  }
  function vSettings() {
    const s = S.settings; const j = L.keyToJalali(s.examDate);
    return top('تنظیمات') + '<form data-form="settings">' +
      '<div class="card"><h3>آزمون</h3>' + txt('examName', 'نام آزمون یا رشته', s.examName) + txt('track', 'گرایش یا ترکیب (اختیاری)', s.track) + (S.combos.length ? txt('groupLabel', 'نام گروه‌بندی دروس', s.groupLabel) : '') + '</div>' +
      '<div class="card" style="margin-top:12px"><h3>تاریخ آزمون</h3><div class="grid4" style="grid-template-columns:1fr 1fr 1.4fr">' + num('jd', 'روز', j.jd) + num('jm', 'ماه', j.jm) + num('jy', 'سال', j.jy) + '</div></div>' +
      '<div class="card" style="margin-top:12px"><h3>ساعت مفید هر روز هفته</h3>' + capacityInputs(s.capacity) + '</div>' +
      '<div class="card" style="margin-top:12px"><h3>تست</h3>' + num('testCount', 'تعداد پیش‌فرض تست هر آزمون', s.testCount) + '<div class="grid2">' + num('masteryPct', 'تسلط مطلوب از (٪)', s.masteryPct) + num('reviewPct', 'مرور هدفمند از (٪)', s.reviewPct) + '</div><p class="small muted">زیر آستانه‌ی مرور هدفمند = تکرار چرخه. پیش‌فرض برای ۲۰ تست: ۱۸ به بالا تسلط، ۱۵ تا ۱۷ مرور.</p></div>' +
      '<div class="card" style="margin-top:12px"><h3>نمره منفی</h3><label class="check"><input type="checkbox" name="negOn" ' + (s.negOn ? 'checked' : '') + '><span>محاسبه‌ی درصد با نمره منفی (فیلد «غلط» اضافه می‌شود)</span></label>' + num('negRatio', 'هر چند غلط یک صحیح را حذف می‌کند', s.negRatio) + '</div>' +
      '<div class="card" style="margin-top:12px"><h3>ظاهر</h3><label class="f"><span>حالت نمایش</span><select name="theme"><option value="auto" ' + (s.theme === 'auto' ? 'selected' : '') + '>مطابق دستگاه</option><option value="light" ' + (s.theme === 'light' ? 'selected' : '') + '>روشن</option><option value="dark" ' + (s.theme === 'dark' ? 'selected' : '') + '>تیره</option></select></label></div>' +
      '<div id="seterr" class="err" role="alert"></div><button class="btn pri block big" style="margin-top:16px">ذخیره</button></form>' +
      '<div class="card" style="margin-top:20px"><h3>پاک کردن این برنامه و شروع دوباره</h3><p class="small muted">دروس، فصل‌ها، برنامه‌ی هفتگی و نتیجه‌های همین برنامه پاک می‌شوند و راه‌اندازی آن از اول انجام می‌شود. برنامه‌های دیگر دست نمی‌خورند. اول پشتیبان بگیرید.</p><button class="btn danger block" data-a="resetAll">پاک کردن این برنامه</button></div>';
  }
  function vCombos() {
    return top(G() + '‌ها', 'فقط دروس ' + G() + '‌های فعال در برنامه می‌آیند. درسی که به هیچ ' + G() + 'ی وصل نباشد همیشه نمایش داده می‌شود.') + (S.combos.length ? '<div class="card">' + S.combos.map((c) => '<div class="row between" style="min-height:52px;border-bottom:1px solid var(--line)"><label class="check grow"><input type="checkbox" data-a="comboToggle" data-id="' + c.id + '" ' + (c.active ? 'checked' : '') + '><span>' + esc(comboLabel(c)) + (c.code && c.title ? ' — ' + esc(c.title) : '') + '</span></label><button class="iconbtn ghosti" data-a="comboForm" data-id="' + c.id + '" aria-label="ویرایش">' + ICON.edit + '</button></div>').join('') + '</div>' : '<div class="card empty">' + G() + 'ی تعریف نشده.</div>') + '<button class="btn block" style="margin-top:12px" data-a="comboForm">افزودن ' + G() + '</button>';
  }
  function vBin() {
    const items = [];
    S.courses.filter((x) => x.deletedAt).forEach((x) => items.push({ k: 'courses', x, t: 'درس', name: x.name }));
    S.books.filter((x) => x.deletedAt && !(byId(S.courses, x.courseId) || {}).deletedAt).forEach((x) => items.push({ k: 'books', x, t: 'کتاب', name: x.title }));
    S.chapters.filter((x) => x.deletedAt && !(x.parentId && (byId(S.chapters, x.parentId) || {}).deletedAt === x.deletedAt) && !(byId(S.books, x.bookId) || {}).deletedAt).forEach((x) => items.push({ k: 'chapters', x, t: 'فصل', name: x.title }));
    items.sort((a, b) => (a.x.deletedAt < b.x.deletedAt ? 1 : -1));
    const h = top('سطل بازیافت', 'موارد حذف‌شده ۳۰ روز نگه داشته می‌شوند.');
    if (!items.length) return h + '<div class="empty">سطل بازیافت خالی است.</div>';
    return h + '<div class="list">' + items.map(({ k, x, t, name }) => { const left = BIN_DAYS - Math.floor((Date.now() - new Date(x.deletedAt).getTime()) / 86400000); return '<div class="card"><div class="row between"><div class="grow"><b>' + esc(name) + '</b><div class="small muted">' + t + ' · ' + fa(left) + ' روز تا پاک شدن</div></div><button class="btn sm" data-a="restore" data-v="' + k + '" data-id="' + x.id + '">بازگرداندن</button></div></div>'; }).join('') + '</div>';
  }
  function vBackup() {
    const lb = S.settings.lastBackupAt;
    return top('پشتیبان و بازیابی') + '<div class="card"><p>پشتیبان کامل: دروس، کتاب‌ها، فصل‌ها، برنامه‌ها، دورها، جلسه‌ها و تست‌ها.</p><p class="small muted">آخرین پشتیبان: ' + (lb ? fmtJIso(lb) : 'هرگز') + '</p><div class="row wrapx" style="margin-top:8px"><button class="btn pri grow" data-a="exportJson">دانلود فایل JSON</button><button class="btn grow" data-a="copyJson">کپی متن پشتیبان</button></div><div id="dlnote" class="small muted" style="margin-top:6px"></div></div>' +
      '<div class="card" style="margin-top:12px"><h3>بازیابی</h3><p class="small muted">فایل پشتیبان را انتخاب کنید یا متن آن را بچسبانید. پیش از جایگزینی خلاصه نمایش داده می‌شود.</p><input type="file" accept="application/json,.json" data-a="importFile" style="min-height:46px;width:100%"><label class="f"><span>یا متن پشتیبان</span><textarea id="pastebox" placeholder="{ &quot;app&quot;: &quot;konkur-dr-study&quot;, ... }"></textarea></label><button class="btn block" style="margin-top:8px" data-a="importPaste">بررسی متن</button><div id="imperr" class="err" role="alert"></div></div>';
  }
  function vAudit() { const a = S.audit.slice().reverse().slice(0, 200); return top('تاریخچه‌ی تغییرات') + (a.length ? '<div class="card" style="padding:4px 14px">' + a.map((x) => '<div class="kv"><span>' + esc(x.detail) + '</span><span class="small muted num">' + fmtJIso(x.at) + '</span></div>').join('') + '</div>' : '<div class="empty">تغییری ثبت نشده.</div>'); }
  function vSelfTest() { const r = L.selfTest(); const ok = r.filter((x) => x.ok).length; return top('آزمون محاسبات', fa(ok) + ' از ' + fa(r.length) + ' مورد درست') + '<div class="card" style="padding:4px 14px">' + r.map((x) => '<div class="kv"><span>' + esc(x.name) + '</span>' + (x.ok ? chip('درست', 'ok') : chip('نادرست', 'bad')) + '</div>').join('') + '</div>'; }

  // ---------- sheets: forms ----------
  function courseForm(id) {
    const c = id ? byId(S.courses, id) : { name: '', type: 'chapter', color: COLORS[S.courses.length % COLORS.length], combos: S.combos.filter((x) => x.active).map((x) => x.id), coef: {}, archived: false };
    sheet('<h2 style="margin-top:0">' + (id ? 'ویرایش درس' : 'درس جدید') + '</h2><form data-form="course" data-id="' + (id || '') + '">' + txt('name', 'نام درس', c.name) +
      '<label class="f"><span>نوع</span><select name="type"><option value="chapter" ' + (c.type !== 'test' ? 'selected' : '') + '>فصل‌به‌فصل (مطالعه + تست هر فصل)</option><option value="test" ' + (c.type === 'test' ? 'selected' : '') + '>فقط تست‌زنی (مثل زبان)</option></select></label>' +
      '<label class="f"><span>رنگ</span></label><div class="swatches">' + COLORS.map((col) => '<button type="button" data-a="swatch" data-v="' + col + '" aria-label="رنگ" aria-pressed="' + (c.color === col) + '" style="background:' + col + '"></button>').join('') + '</div><input type="hidden" name="color" value="' + esc(c.color) + '">' +
      (S.combos.length ? '<label class="f"><span>' + G() + '‌ها و ضریب (اختیاری)</span></label>' : '') + S.combos.map((cb) => '<div class="row"><label class="check grow"><input type="checkbox" name="combo_' + cb.id + '" ' + (c.combos.includes(cb.id) ? 'checked' : '') + '><span>' + esc(comboLabel(cb)) + '</span></label><input name="coef_' + cb.id + '" inputmode="decimal" placeholder="ضریب" style="width:90px" value="' + esc(c.coef[cb.id] == null ? '' : faD(c.coef[cb.id])) + '"></div>').join('') +
      (id ? '<label class="check" style="margin-top:8px"><input type="checkbox" name="archived" ' + (c.archived ? 'checked' : '') + '><span>بایگانی درس</span></label>' : '') +
      '<div id="formerr" class="err" role="alert"></div><button class="btn pri block" style="margin-top:14px">ذخیره</button>' + (id ? '<button type="button" class="btn danger block" style="margin-top:8px" data-a="delCourse" data-id="' + id + '">حذف درس</button>' : '') + '</form>');
  }
  function bookForm(id, courseId) {
    const b = id ? byId(S.books, id) : { title: '', author: '', courseId }; const cs = S.courses.filter((c) => !c.deletedAt && c.type !== 'test');
    sheet('<h2 style="margin-top:0">' + (id ? 'ویرایش کتاب' : 'کتاب جدید') + '</h2><form data-form="book" data-id="' + (id || '') + '">' + txt('title', 'عنوان', b.title) + txt('author', 'نویسنده', b.author) +
      '<label class="f"><span>درس</span><select name="courseId">' + cs.map((c) => '<option value="' + c.id + '" ' + (c.id === b.courseId ? 'selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></label>' +
      (!id ? area('batch', 'فصل‌ها (اختیاری؛ هر خط یک فصل، تورفتگی = زیرفصل)', '', 'فصل ۱\n  بخش ۱-۱\nفصل ۲') : '') +
      '<div id="formerr" class="err" role="alert"></div><button class="btn pri block" style="margin-top:14px">ذخیره</button>' + (id ? '<button type="button" class="btn danger block" style="margin-top:8px" data-a="delBook" data-id="' + id + '">حذف کتاب</button>' : '') + '</form>');
  }
  function batchForm(bookId) {
    sheet('<h2 style="margin-top:0">ورود دسته‌ای فصل‌ها</h2><p class="small muted">هر خط یک فصل؛ خطی که با فاصله یا Tab شروع شود زیرفصلِ فصل قبلی است.</p><form data-form="batch" data-id="' + bookId + '"><textarea name="batch" data-a="batchLive" style="min-height:200px" placeholder="فصل ۱: مفاهیم پایه\n  تعریف سازمان\nفصل ۲: برنامه‌ریزی"></textarea><div id="batchprev" class="small muted" style="margin-top:6px"></div><div id="formerr" class="err" role="alert"></div><button class="btn pri block" style="margin-top:12px">افزودن</button></form>');
  }
  function chapterForm(id, bookId) {
    const ch = id ? byId(S.chapters, id) : { title: '', bookId, parentId: null, importance: null, pastTestCount: null, estMinutes: null, priority: 'mid' };
    const tops = live(S.chapters).filter((x) => x.bookId === ch.bookId && !x.parentId && x.id !== id).sort((a, b) => a.order - b.order);
    const kids = id && hasKids(id);
    sheet('<h2 style="margin-top:0">' + (id ? 'ویرایش فصل' : 'فصل جدید') + '</h2><form data-form="chapter" data-id="' + (id || '') + '" data-book="' + ch.bookId + '">' + txt('title', 'عنوان', ch.title) +
      (!kids ? '<label class="f"><span>زیرفصلِ</span><select name="parentId"><option value="">— فصل اصلی —</option>' + tops.map((t) => '<option value="' + t.id + '" ' + (t.id === ch.parentId ? 'selected' : '') + '>' + esc(t.title) + '</option>').join('') + '</select></label>' : '') +
      '<label class="f"><span>اهمیت</span></label><div class="seg" data-scale="importance">' + [1, 2, 3, 4, 5].map((n) => '<button type="button" data-a="scale" data-v="' + n + '" aria-pressed="' + (ch.importance === n) + '">' + faD(n) + '</button>').join('') + '<button type="button" data-a="scale" data-v="" aria-pressed="' + (ch.importance == null) + '">—</button></div><input type="hidden" name="importance" value="' + (ch.importance == null ? '' : ch.importance) + '">' +
      '<div class="grid2">' + num('pastTestCount', 'تست سال‌های قبل', ch.pastTestCount) + num('estMinutes', 'زمان تخمینی (دقیقه)', ch.estMinutes) + '</div>' +
      '<label class="f"><span>وضعیت اولویت</span><select name="priority">' + Object.entries(PRI).map(([k, v]) => '<option value="' + k + '" ' + (ch.priority === k ? 'selected' : '') + '>' + v + '</option>').join('') + '</select></label>' +
      '<div id="formerr" class="err" role="alert"></div><button class="btn pri block" style="margin-top:14px">ذخیره</button>' + (id ? '<button type="button" class="btn danger block" style="margin-top:8px" data-a="delChapter" data-id="' + id + '">حذف فصل</button>' : '') + '</form>');
  }
  function comboForm(id) { const c = id ? byId(S.combos, id) : { code: '', title: '' }; sheet('<h2 style="margin-top:0">' + (id ? 'ویرایش ' : '') + G() + (id ? '' : ' جدید') + '</h2><form data-form="combo" data-id="' + (id || '') + '">' + txt('title', 'نام', c.title) + num('code', 'شماره (اختیاری)', c.code) + '<div id="formerr" class="err" role="alert"></div><button class="btn pri block" style="margin-top:14px">ذخیره</button>' + (id ? '<button type="button" class="btn danger block" style="margin-top:8px" data-a="delCombo" data-id="' + id + '">حذف ' + G() + '</button>' : '') + '</form>'); }
  function quickForm(chId) {
    const ch = byId(S.chapters, chId); const act = activeRound(chId); const n = chapterRounds(chId).length + 1;
    sheet('<h2 style="margin-top:0">ثبت سریع</h2><div class="small muted">' + esc(ch.title) + ' · ' + (act ? 'افزودن به دور باز ' + fa(act.roundNumber) : 'دور ' + fa(n)) + '</div><form data-form="quick" data-id="' + chId + '">' +
      '<div class="grid2">' + num('study', 'زمان مطالعه (دقیقه)', '') + num('testmin', 'زمان تست (دقیقه)', '') + '</div>' + testFields(S.settings.testCount) +
      '<label class="check" style="margin-top:6px"><input type="checkbox" name="close" checked><span>بستن دور پس از ثبت</span></label><button class="btn pri block big" style="margin-top:12px">ثبت</button></form>');
  }
  function roundDetail(id) {
    const r = byId(S.rounds, id); const ss = roundSessions(id); const s = roundSummary(r);
    let h = '<h2 style="margin-top:0">دور ' + fa(r.roundNumber) + '</h2><div class="small muted">' + fmtJ(r.startDate) + (r.endDate ? ' تا ' + fmtJ(r.endDate) : ' · باز') + '</div>';
    h += '<div class="card" style="margin-top:10px"><div class="kv"><span class="muted">مطالعه</span><span>' + fmtDur(s.studySec) + '</span></div><div class="kv"><span class="muted">تست‌زنی</span><span>' + fmtDur(s.testSec) + '</span></div><div class="kv"><span class="muted">وضعیت</span><span>' + statusChip(roundStatus(r)) + '</span></div></div>';
    if (r.tests.length) h += '<h3 style="margin-top:14px">تست‌ها</h3><div class="card tscroll" style="padding:4px 10px"><table><thead><tr><th>چرخه</th><th>تست</th><th>صحیح</th><th>درصد</th><th>زمان</th><th></th></tr></thead><tbody>' + r.tests.map((t, i) => '<tr><td>' + fa(i + 1) + '</td><td>' + fa(t.count) + '</td><td>' + fa(t.correct) + '</td><td>' + pctTxt(pctOf(t)) + '</td><td>' + fmtDur(t.seconds) + '</td><td><button class="btn sm ghost" data-a="delTest" data-id="' + r.id + '" data-v="' + t.id + '">حذف</button></td></tr>').join('') + '</tbody></table></div>';
    if (ss.length) h += '<h3 style="margin-top:14px">جلسه‌ها</h3><div class="card">' + ss.map((x) => '<div class="kv"><span>' + (STEP_LABEL[x.step] || x.step) + (x.manualEdit ? ' <span class="small muted">(دستی)</span>' : '') + '</span><span class="num small">' + fmtJIso(x.startedAt) + ' · ' + fmtDur(x.durationSec) + '</span></div>').join('') + '</div>';
    h += r.status === 'active' ? '<button class="btn pri block" style="margin-top:14px" data-a="openSession" data-id="' + id + '">ادامه‌ی دور</button>' : '<button class="btn block" style="margin-top:14px" data-a="reopenRound" data-id="' + id + '">باز کردن دوباره‌ی دور</button>';
    h += '<button class="btn danger block" style="margin-top:8px" data-a="delRound" data-id="' + id + '">حذف این دور</button>';
    sheet(h);
  }

  // ---------- actions ----------
  const A = {
    back, home: () => setTab('today'), tab: (el) => setTab(el.dataset.v), closeSheet: () => closeSheet(),
    confirmOk: () => { const f = pendingConfirm; pendingConfirm = null; closeSheet(true); if (f) f(); },
    goMore: (el) => { if (nav.tab !== 'more') { nav.tab = 'more'; nav.stack = []; } go(el.dataset.v); },
    goStats: (el) => go(el.dataset.v),
    openCourse: (el) => go('course', { id: el.dataset.id }), openBook: (el) => go('book', { id: el.dataset.id }),
    openChapter: (el) => { closeSheet(true); go('chapter', { id: el.dataset.id }); },
    openSession: (el) => { closeSheet(true); go('session', { id: el.dataset.id }); },
    roundDetail: (el) => roundDetail(el.dataset.id),
    resumeTimer: () => { const t = S.timer; if (!t) return; if (t.roundId) go('session', { id: t.roundId }); else go('course', { id: t.courseId }); },
    obCombo: (el) => { byId(S.combos, el.dataset.id).active = el.checked; },
    obCourse: (el) => { byId(S.courses, el.dataset.id).archived = !el.checked; },
    introNext: () => { if (introIdx < INTRO.length - 1) { introIdx++; render(); window.scrollTo(0, 0); return; } introIdx = 0; if (S.settings.onboarded) { back(); } else { S.settings.introDone = true; save(); render(); } },
    introPrev: () => { if (introIdx > 0) { introIdx--; render(); } },
    introSkip: () => { introIdx = 0; S.settings.introDone = true; save(); render(); },
    replayIntro: () => { introIdx = 0; go('intro'); },
    tipDone: (el) => { S.settings.seenTips = Object.assign({}, S.settings.seenTips, { [el.dataset.v]: true }); save(); const card = el.closest('[role=note]'); if (card) card.remove(); },
    resetTips: () => { S.settings.seenTips = {}; save(); toast('نکته‌ها دوباره در صفحه‌ها نمایش داده می‌شوند'); },
    hideChecklist: () => { S.settings.checklistHidden = true; save(); render(); toast('از «بیشتر ← راهنما» می‌توانید دوباره نمایشش دهید'); },
    showChecklist: () => { S.settings.checklistHidden = false; save(); setTab('today'); },
    obPresetOld: (el) => { const v = el.dataset.v; if (v === S.settings.preset) return; if (v === 'custom') { S.courses = []; S.combos = []; S.settings.groupLabel = 'گرایش'; S.settings.examName = ''; } else { const d = defaultState(); S.courses = d.courses; S.combos = d.combos; S.settings.groupLabel = 'ترکیب'; S.settings.examName = 'کنکور دکتری مدیریت'; } S.settings.preset = v; ob.err = ''; render(); },
    obDelCombo: (el) => { S.combos = S.combos.filter((c) => c.id !== el.dataset.id); S.courses.forEach((c) => (c.combos = c.combos.filter((x) => x !== el.dataset.id))); render(); },
    obType: (el) => { const c = byId(S.courses, el.dataset.id); c.type = c.type === 'test' ? 'chapter' : 'test'; render(); },
    obPreset: (el) => { const v = el.dataset.v; if (v === S.settings.preset) return; if (v === 'custom') { S.courses = []; S.combos = []; S.settings.preset = 'custom'; S.settings.examName = ''; S.settings.track = ''; } else applyTemplate(S, TEMPLATES.find((t) => t.id === v)); ob.err = ''; render(); },
    programsSheet: () => programsSheet(),
    switchProgram: (el) => switchProgram(el.dataset.id),
    newProgram: () => createProgram(),
    cancelNewProgram: () => { const id = ROOT.active, back = ROOT.prevActive; ROOT.programs = ROOT.programs.filter((p) => p.id !== id); delete ROOT.data[id]; ROOT.prevActive = null; ROOT.active = back; S = ROOT.data[back]; ob = null; nav = { tab: 'today', stack: [] }; writeLocal(); render(); },
    delProgram: (el) => { const pr = ROOT.programs.find((p) => p.id === el.dataset.id); if (ROOT.programs.length < 2) return toast('تنها برنامه را نمی‌توان حذف کرد؛ از تنظیمات می‌توانید آن را پاک و از نو شروع کنید.'); if (S.timer && pr.id === ROOT.active) return toast('اول زمان‌سنج در جریان را تمام کنید');
      confirmSheet('حذف برنامه‌ی «' + pr.title + '»؟', 'همه‌ی دروس، فصل‌ها و نتیجه‌های این برنامه برای همیشه پاک می‌شوند. برنامه‌های دیگر دست نمی‌خورند.', 'حذف برنامه', () => { ROOT.programs = ROOT.programs.filter((p) => p !== pr); delete ROOT.data[pr.id]; if (ROOT.freeProgram === pr.id) ROOT.freeProgram = ROOT.programs[0].id; if (ROOT.active === pr.id) { ROOT.active = ROOT.freeProgram; S = ROOT.data[ROOT.active]; } nav = { tab: 'today', stack: [] }; save(); render(); toast('برنامه حذف شد'); }, true); },
    setFree: (el) => { if (isPro()) return; ROOT.freeProgram = el.dataset.id; writeLocal(); render(); },
    goPro: () => { closeSheet(true); go('pro'); },
    goProgramsPage: () => { closeSheet(true); if (nav.tab !== 'more') { nav.tab = 'more'; nav.stack = []; } go('programs'); },
    buy: async (el) => { const btn = el; btn.disabled = true; try { await Billing.buy(el.dataset.v); render(); if (isPro()) toast('پلن پیشرفته فعال شد. ممنون از همراهی‌تان!'); } catch (e) { btn.disabled = false; const m = String((e && e.message) || e); toast(/cancel/i.test(m) ? 'پرداخت لغو شد' : 'پرداخت انجام نشد: ' + Billing.humanError(m)); } },
    restorePro: async () => { try { await Billing.init(true); render(); toast(isPro() ? 'اشتراک شما بازیابی شد' : 'اشتراک فعالی در حساب بازار شما پیدا نشد'); } catch (e) { toast('بازیابی انجام نشد: ' + Billing.humanError(String(e))); } },
    fab: () => { if (S.timer) return A.resumeTimer(); startSheet(); },
    undo: () => { const f = undoFn; undoFn = null; document.querySelectorAll('.toast').forEach((x) => x.remove()); if (f) { f(); save(); render(); } },
    courseMenu: (el) => { const c = byId(S.courses, el.dataset.id); const list = visibleCourses(); const i = list.indexOf(c);
      menuSheet(c.name, (c.type === 'test' ? 'فقط تست' : 'فصل‌به‌فصل') + (comboNames(c) ? ' · ' + comboNames(c) : ''), [
        cur().s !== 'course' ? ['openCourseM', 'باز کردن', 'data-id="' + c.id + '"'] : null, ['courseFormM', 'ویرایش نام، نوع، رنگ' + (S.combos.length ? ' و ' + G() : ''), 'data-id="' + c.id + '"'],
        i > 0 ? ['moveCourse', 'انتقال به بالا', 'data-id="' + c.id + '" data-v="-1"'] : null, i >= 0 && i < list.length - 1 ? ['moveCourse', 'انتقال به پایین', 'data-id="' + c.id + '" data-v="1"'] : null,
        ['archiveCourse', c.archived ? 'خارج کردن از بایگانی' : 'بایگانی (پنهان شود، حذف نشود)', 'data-id="' + c.id + '"'], ['delCourse', 'حذف درس', 'data-id="' + c.id + '"', true]]); },
    openCourseM: (el) => { closeSheet(true); go('course', { id: el.dataset.id }); }, courseFormM: (el) => courseForm(el.dataset.id),
    moveCourse: (el) => { const list = visibleCourses(); list.forEach((c, k) => (c.order = k)); const c = byId(S.courses, el.dataset.id); const i = list.indexOf(c), j = i + Number(el.dataset.v); if (j < 0 || j >= list.length) return; list[i].order = j; list[j].order = i; save(); closeSheet(true); render(); },
    archiveCourse: (el) => { const c = byId(S.courses, el.dataset.id); c.archived = !c.archived; save(); closeSheet(true); render(); toast(c.archived ? 'بایگانی شد' : 'از بایگانی خارج شد', () => { c.archived = !c.archived; }); },
    bookMenu: (el) => { const b = byId(S.books, el.dataset.id); menuSheet(b.title, fa(bookChapters(b.id).length) + ' فصل و زیرفصل', [cur().s !== 'book' ? ['openBookM', 'باز کردن', 'data-id="' + b.id + '"'] : null, ['bookFormM', 'ویرایش عنوان، نویسنده و درس', 'data-id="' + b.id + '"'], ['batchFormM', 'افزودن فصل‌ها (دسته‌ای)', 'data-id="' + b.id + '"'], ['delBook', 'حذف کتاب', 'data-id="' + b.id + '"', true]]); },
    openBookM: (el) => { closeSheet(true); go('book', { id: el.dataset.id }); }, bookFormM: (el) => bookForm(el.dataset.id), batchFormM: (el) => batchForm(el.dataset.id),
    chapterMenu: (el) => { const ch = byId(S.chapters, el.dataset.id); const ex = ch.priority === 'excluded';
      menuSheet(ch.title, chapterState(ch).label, [cur().s !== 'chapter' ? ['openChapter', 'باز کردن', 'data-id="' + ch.id + '"'] : null, ['chapterFormM', 'ویرایش عنوان، اهمیت، زمان و اولویت', 'data-id="' + ch.id + '"'], hasKids(ch.id) ? null : ['quickFormM', 'ثبت سریع نتیجه', 'data-id="' + ch.id + '"'], ['toggleExclude', ex ? 'بازگرداندن به برنامه' : 'حذف از برنامه (بدون پاک شدن)', 'data-id="' + ch.id + '"'], ['delChapter', 'حذف فصل', 'data-id="' + ch.id + '"', true]]); },
    chapterFormM: (el) => chapterForm(el.dataset.id), quickFormM: (el) => quickForm(el.dataset.id),
    toggleExclude: (el) => { const ch = byId(S.chapters, el.dataset.id); const was = ch.priority; ch.priority = was === 'excluded' ? 'mid' : 'excluded'; audit('exclude', (ch.priority === 'excluded' ? 'حذف از برنامه: ' : 'بازگشت به برنامه: ') + ch.title); save(); closeSheet(true); render(); toast(ch.priority === 'excluded' ? 'از برنامه حذف شد' : 'به برنامه برگشت', () => { ch.priority = was; }); },
    coursesBatch: () => sheet('<h2 style="margin-top:0">افزودن چند درس</h2><form data-form="coursesBatch">' + area('names', 'هر خط یک درس', '', 'ادبیات فارسی\nزبان انگلیسی\nریاضی') + '<label class="check"><input type="checkbox" name="test"><span>این دروس «فقط تست» هستند (بدون فصل)</span></label><div id="formerr" class="err" role="alert"></div><button class="btn pri block" style="margin-top:12px">افزودن</button></form>'),
    delCombo: (el) => { const cb = byId(S.combos, el.dataset.id); confirmSheet('حذف ' + comboLabel(cb) + '؟', 'دروس حذف نمی‌شوند؛ فقط ارتباطشان با این ' + G() + ' برداشته می‌شود.', 'حذف', () => { S.combos = S.combos.filter((c) => c !== cb); S.courses.forEach((c) => { c.combos = c.combos.filter((x) => x !== cb.id); delete c.coef[cb.id]; }); save(); render(); }, true); },
    resetAll: () => confirmSheet('داده‌های این برنامه پاک شود؟', 'دروس، فصل‌ها، برنامه‌ی هفتگی، دورها و نتیجه‌های «' + esc(curProgram().title) + '» برای همیشه پاک می‌شوند. اگر پشتیبان نگرفته‌اید، انصراف بزنید.', 'پاک کن', () => { S = newProgramState(); ROOT.data[ROOT.active] = S; ob = null; nav = { tab: 'today', stack: [] }; save(); render(); }, true),
    obNext: () => { ob.err = ''; if (ob.step === 0 && !S.settings.preset) { ob.err = 'یکی از گزینه‌ها را انتخاب کنید.'; return render(); } if (ob.step === 1 && !S.courses.some((c) => !c.deletedAt && !c.archived)) { ob.err = 'حداقل یک درس اضافه یا انتخاب کنید.'; return render(); } ob.step++; render(); window.scrollTo(0, 0); },
 obPrev: () => { ob.err = ''; ob.step--; render(); }, obFinish: () => finishOnboarding(),
    // plan
    week: (el) => { const d = Number(el.dataset.v); planWeek = d === 0 ? weekStart(todayKey()) : addDays(planWeek, d); render(); },
    planForm: (el) => { planForm(el.dataset.id, el.dataset.v); if (el.dataset.ch) { const f = $('.sheet form'); const ch = byId(S.chapters, el.dataset.ch); const c = chapterCourse(ch); f.courseId.value = c.id; $('#chapsel').innerHTML = chapterSelect(c.id, ch.id); } },
    planGoS: (el) => { closeSheet(true); A.planGo(el); },
    tabS: (el) => { closeSheet(true); setTab(el.dataset.v); },
    planGo: (el) => { const p = byId(S.plans, el.dataset.id); if (!p.chapterId) return go('course', { id: p.courseId }); startStudy(p.chapterId); },
    delPlan: (el) => { S.plans = S.plans.filter((p) => p.id !== el.dataset.id); save(); closeSheet(); render(); toast('از برنامه حذف شد'); },
    copyPlan: (el) => { const from = el.dataset.v, to = el.dataset.to; const src = dayPlans(from); const have = S.plans.filter((p) => p.date === to); let n = 0; src.forEach((p) => { if (have.some((h) => h.courseId === p.courseId && h.chapterId === p.chapterId)) return; S.plans.push({ id: uid(), date: to, courseId: p.courseId, chapterId: p.chapterId, minutes: p.minutes, tests: p.tests, order: have.length + n, createdAt: nowIso() }); n++; }); save(); render(); toast(n ? fa(n) + ' مورد به ' + fmtJ(to, true) + ' کپی شد' : 'همه‌ی موارد از قبل در آن روز هست'); },
    // structure
    courseForm: (el) => courseForm(el.dataset.id), bookForm: (el) => bookForm(el.dataset.id, el.dataset.course), batchForm: (el) => batchForm(el.dataset.id),
    chapterForm: (el) => chapterForm(el.dataset.id, el.dataset.book), comboForm: (el) => comboForm(el.dataset.id), quickForm: (el) => quickForm(el.dataset.id),
    swatch: (el) => { const f = el.closest('form'); f.color.value = el.dataset.v; f.querySelectorAll('.swatches button').forEach((b) => b.setAttribute('aria-pressed', b === el)); },
    scale: (el) => { const seg = el.closest('[data-scale]'); seg.nextElementSibling.value = el.dataset.v; seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === el)); },
    tmode: (el) => { const f = el.closest('form'); f.mode.value = el.dataset.v; el.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === el)); f.querySelectorAll('[data-mode]').forEach((d) => (d.hidden = d.dataset.mode !== el.dataset.v)); liveTest(f); },
    moveCh: (el) => { const ch = byId(S.chapters, el.dataset.id); const sibs = live(S.chapters).filter((x) => x.bookId === ch.bookId && (x.parentId || null) === (ch.parentId || null)).sort((a, b) => a.order - b.order); const i = sibs.indexOf(ch), j = i + Number(el.dataset.v); if (j < 0 || j >= sibs.length) return; [sibs[i], sibs[j]] = [sibs[j], sibs[i]]; sibs.forEach((x, k) => (x.order = k)); save(); render(); },
    comboToggle: (el) => { byId(S.combos, el.dataset.id).active = el.checked; save(); },
    delCourse: (el) => { const c = byId(S.courses, el.dataset.id); confirmSheet('حذف درس «' + c.name + '»؟', 'درس با کتاب‌ها و فصل‌هایش به سطل بازیافت می‌رود و تا ۳۰ روز قابل بازگرداندن است. سوابق زمان و تست حفظ می‌شود.', 'حذف', () => { const at = softDelete('courses', c.id); nav.stack = []; nav.tab = 'courses'; render(); toast('«' + c.name + '» حذف شد', () => restoreAt('courses', c.id, at)); }, true); },
    delBook: (el) => { const b = byId(S.books, el.dataset.id); confirmSheet('حذف کتاب «' + b.title + '»؟', 'کتاب و فصل‌هایش به سطل بازیافت می‌روند و تا ۳۰ روز قابل بازگرداندن‌اند.', 'حذف', () => { const at = softDelete('books', b.id); if (cur().s === 'book') nav.stack.pop(); render(); toast('«' + b.title + '» حذف شد', () => restoreAt('books', b.id, at)); }, true); },
    delChapter: (el) => { const ch = byId(S.chapters, el.dataset.id); confirmSheet('حذف فصل «' + ch.title + '»؟', 'فصل' + (hasKids(ch.id) ? ' و زیرفصل‌هایش' : '') + ' به سطل بازیافت می‌رود و تا ۳۰ روز قابل بازگرداندن است. داده‌ی دورها حفظ می‌شود.', 'حذف', () => { const at = softDelete('chapters', ch.id); if (cur().s === 'chapter') nav.stack.pop(); render(); toast('«' + ch.title + '» حذف شد', () => restoreAt('chapters', ch.id, at)); }, true); },
    restore: (el) => { const x = byId(S[el.dataset.v], el.dataset.id); const at = x.deletedAt; x.deletedAt = null;
      if (el.dataset.v === 'courses') S.books.filter((b) => b.courseId === x.id && b.deletedAt === at).forEach((b) => { b.deletedAt = null; S.chapters.filter((c) => c.bookId === b.id && c.deletedAt === at).forEach((c) => (c.deletedAt = null)); });
      if (el.dataset.v === 'books') S.chapters.filter((c) => c.bookId === x.id && c.deletedAt === at).forEach((c) => (c.deletedAt = null));
      if (el.dataset.v === 'chapters') { S.chapters.filter((c) => c.parentId === x.id && c.deletedAt === at).forEach((c) => (c.deletedAt = null)); const p = x.parentId && byId(S.chapters, x.parentId); if (p && p.deletedAt) x.parentId = null; }
      audit('restore', 'بازگرداندن: ' + (x.name || x.title)); save(); render(); toast('بازگردانده شد'); },
    // rounds
    startRound: (el) => startRound(el.dataset.id),
    tStart: (el) => { if (S.timer) return toast('یک زمان‌سنج دیگر در جریان است'); startTimer({ roundId: el.dataset.id, step: el.dataset.v }); render(); },
    tPause: () => { pauseTimer(); render(); }, tResume: () => { resumeTimer(); render(); },
    tEdit: () => { sheet('<h2 style="margin-top:0">ویرایش دستی زمان</h2><form data-form="tEdit">' + num('min', 'مدت (دقیقه)', Math.round(tElapsed() / 60000)) + '<div id="formerr" class="err" role="alert"></div><button class="btn pri block" style="margin-top:14px">ثبت</button></form>'); },
    studyDone: (el) => { const r = byId(S.rounds, el.dataset.id); const res = stopTimer(); if (res) logSession({ roundId: r.id, chapterId: r.chapterId, courseId: r.courseId, step: 'study', cycle: r.cycle, startedAt: res.firstStart, endedAt: nowIso(), durationSec: res.sec, manualEdit: res.manual }); r.step = 'test'; save(); render(); window.scrollTo(0, 0); },
    skipStudy: (el) => { const r = byId(S.rounds, el.dataset.id); r.step = 'test'; save(); render(); },
    studyStart: (el) => { if (S.timer) return toast('یک زمان‌سنج دیگر در جریان است'); startTimer({ roundId: el.dataset.id, step: 'study' }); render(); },
    studyStop: (el) => { const r = byId(S.rounds, el.dataset.id); const res = stopTimer(); if (res && res.sec > 0) logSession({ roundId: r.id, chapterId: r.chapterId, courseId: r.courseId, step: 'study', cycle: r.cycle, startedAt: res.firstStart, endedAt: nowIso(), durationSec: res.sec, manualEdit: res.manual }); save(); render(); toast('جلسه ثبت شد: ' + fmtDur(res ? res.sec : 0) + '. هر وقت خواستید ادامه دهید.'); },
    finishChapter: (el) => { const r = byId(S.rounds, el.dataset.id); if (timerFor(r.id, 'study')) { const res = stopTimer(); if (res.sec > 0) logSession({ roundId: r.id, chapterId: r.chapterId, courseId: r.courseId, step: 'study', cycle: r.cycle, startedAt: res.firstStart, endedAt: nowIso(), durationSec: res.sec, manualEdit: res.manual }); } r.step = 'test'; r.readDoneAt = nowIso(); save(); render(); window.scrollTo(0, 0); toast('مطالعه‌ی فصل تمام شد؛ حالا تست'); },
    manualStudy: (el) => manualStudyForm(el.dataset.id),
    manualStudyCh: (el) => { const r = ensureStudyRound(el.dataset.id); if (r) manualStudyForm(r.id, true); },
    studyFromList: (el) => startStudy(el.dataset.id),
    finishFromList: (el) => { const r = activeRound(el.dataset.id); if (!r) return; A.finishChapter({ dataset: { id: r.id } }); go('session', { id: r.id }); },
    delSession: (el) => { const x = byId(S.sessions, el.dataset.id); confirmSheet('حذف این جلسه؟', fmtDur(x.durationSec) + ' مطالعه در ' + fmtJIso(x.startedAt) + ' حذف می‌شود.', 'حذف', () => { S.sessions = S.sessions.filter((y) => y !== x); save(); render(); toast('جلسه حذف شد', () => { S.sessions.push(x); }); }, true); },
    mDay: (el) => { const f = el.closest('form'); f.day.value = el.dataset.v; el.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === el)); },
    again: (el) => { const r = byId(S.rounds, el.dataset.id); r.cycle++; r.step = 'study'; save(); render(); window.scrollTo(0, 0); },
    closeRound: (el) => closeRound(byId(S.rounds, el.dataset.id)),
    reopenRound: (el) => { const r = byId(S.rounds, el.dataset.id); if (activeRound(r.chapterId)) return toast('این فصل یک دور باز دیگر دارد'); closeSheet(true); r.status = 'active'; r.step = r.tests.length ? 'result' : 'study'; save(); go('session', { id: r.id }); },
    delRound: (el) => { const r = byId(S.rounds, el.dataset.id); confirmSheet('حذف دور ' + fa(r.roundNumber) + '؟', 'زمان‌ها و تست‌های این دور برای همیشه حذف می‌شوند و شماره‌ی دورهای بعدی یکی کم می‌شود.', 'حذف دور', () => { if (S.timer && S.timer.roundId === r.id) S.timer = null; S.rounds = S.rounds.filter((x) => x !== r); S.sessions = S.sessions.filter((s) => s.roundId !== r.id); chapterRounds(r.chapterId).forEach((x, i) => (x.roundNumber = i + 1)); audit('delete', 'حذف دور ' + fa(r.roundNumber) + ' از «' + (byId(S.chapters, r.chapterId) || {}).title + '»'); save(); if (cur().s === 'session') nav.stack.pop(); render(); }, true); },
    delTest: (el) => { const r = byId(S.rounds, el.dataset.id); r.tests = r.tests.filter((t) => t.id !== el.dataset.v); S.sessions = S.sessions.filter((s) => s.testId !== el.dataset.v); if (r.status === 'active' && r.step === 'result' && !r.tests.length) r.step = 'test'; save(); roundDetail(r.id); render(); },
    langStart: (el) => { if (S.timer) return toast('یک زمان‌سنج دیگر در جریان است'); startTimer({ courseId: el.dataset.id, step: 'lang' }); render(); },
    delLang: (el) => { confirmSheet('حذف این آزمون؟', 'این رکورد برای همیشه حذف می‌شود.', 'حذف', () => { const l = byId(S.langLogs, el.dataset.id); S.langLogs = S.langLogs.filter((x) => x !== l); S.sessions = S.sessions.filter((s) => s.langLogId !== l.id); save(); render(); }, true); },
    exportJson: async () => {
      const data = JSON.stringify(Object.assign({}, ROOT, { pro: null }), null, 1); const name = 'masir-backup-' + todayKey() + '.json'; const note = $('#dlnote');
      const NB = window.NativeBridge;
      if (NB) {
        try {
          const res = await NB.Filesystem.writeFile({ path: name, data, directory: 'CACHE', encoding: 'utf8' });
          await NB.Share.share({ title: 'پشتیبان مسیر', files: [res.uri], dialogTitle: 'ذخیره یا ارسال فایل پشتیبان' });
          S.settings.lastBackupAt = nowIso(); save(); render(); toast('فایل پشتیبان آماده شد');
        } catch (e) { if (note) note.textContent = 'ارسال فایل انجام نشد. از «کپی متن پشتیبان» استفاده کنید.'; }
        return;
      }
      try { const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; if (dl) { await dl.save({ filename: name, data }); S.settings.lastBackupAt = nowIso(); save(); render(); toast('فایل پشتیبان ذخیره شد'); return; } }
      catch (e) { if (note) note.textContent = 'دانلود انجام نشد. از «کپی متن پشتیبان» استفاده کنید.'; return; }
      try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); S.settings.lastBackupAt = nowIso(); save(); if (note) note.textContent = 'اگر فایلی دانلود نشد، از «کپی متن پشتیبان» استفاده کنید.'; } catch (e) { if (note) note.textContent = 'دانلود در این نما ممکن نیست. از «کپی متن پشتیبان» استفاده کنید.'; }
    },
    copyJson: async () => { try { await navigator.clipboard.writeText(JSON.stringify(Object.assign({}, ROOT, { pro: null }))); S.settings.lastBackupAt = nowIso(); save(); toast('متن پشتیبان کپی شد'); render(); } catch (e) { sheet('<h2 style="margin-top:0">متن پشتیبان</h2><p class="small muted">کپی خودکار ممکن نشد. متن زیر را انتخاب و کپی کنید.</p><textarea readonly style="min-height:240px;direction:ltr;font-size:11px">' + esc(JSON.stringify(Object.assign({}, ROOT, { pro: null }))) + '</textarea>'); } },
    importPaste: () => tryImport($('#pastebox').value),
  };
  function ensureStudyRound(chId) {
    const ch = byId(S.chapters, chId); const c = chapterCourse(ch); let r = activeRound(chId);
    if (!r) { r = { id: uid(), chapterId: ch.id, courseId: c.id, roundNumber: chapterRounds(ch.id).length + 1, startDate: todayKey(), endDate: null, status: 'active', step: 'study', cycle: 1, tests: [], createdAt: nowIso() }; S.rounds.push(r); }
    else if (r.step === 'result') { r.cycle++; r.step = 'study'; }
    else if (r.step === 'test') r.step = 'study';
    return r;
  }
  function timerForChapter(chId) { const t = S.timer; if (!t || !t.roundId) return null; const r = byId(S.rounds, t.roundId); return r && r.chapterId === chId ? t : null; }
  function studyLabel(chId) { const r = activeRound(chId); if (!r) return 'شروع مطالعه'; if (r.step === 'study') return roundSessions(r.id).some(isStudy) ? 'ادامه‌ی مطالعه' : 'شروع مطالعه'; return r.step === 'test' ? 'رفتن به تست' : 'دیدن نتیجه'; }
  function startStudy(chId) {
    if (timerForChapter(chId)) return go('session', { id: S.timer.roundId });
    const cur0 = activeRound(chId);
    if (cur0 && cur0.step !== 'study') return go('session', { id: cur0.id });
    if (S.timer) { toast('یک زمان‌سنج دیگر در جریان است؛ اول آن را تمام کنید'); return A.resumeTimer(); }
    const r = ensureStudyRound(chId); startTimer({ roundId: r.id, step: 'study' }); closeSheet(true); go('session', { id: r.id });
  }
  function manualStudyForm(rid, fromChapter) {
    const r = byId(S.rounds, rid); const ch = byId(S.chapters, r.chapterId);
    sheet('<h2 style="margin-top:0">ثبت دستی زمان مطالعه</h2><div class="small muted">' + esc(ch.title) + ' · دور ' + fa(r.roundNumber) + '</div><form data-form="manualStudy" data-id="' + rid + '">' +
      '<div class="grid2">' + num('h', 'ساعت', '') + num('m', 'دقیقه', '') + '</div>' +
      '<label class="f"><span>روز مطالعه</span></label><div class="seg">' + [[0, 'امروز'], [1, 'دیروز'], [2, 'پریروز']].map(([v, l]) => '<button type="button" data-a="mDay" data-v="' + v + '" aria-pressed="' + (v === 0) + '">' + l + '</button>').join('') + '</div><input type="hidden" name="day" value="0">' +
      '<label class="check" style="margin-top:10px"><input type="checkbox" name="finish"><span>مطالعه‌ی این فصل تمام شد (رفتن به تست)</span></label>' +
      '<div id="formerr" class="err" role="alert"></div><button class="btn pri block big" style="margin-top:12px">ثبت</button></form>');
  }
  function startRound(chId) {
    const ch = byId(S.chapters, chId); const c = chapterCourse(ch); const ex = activeRound(chId); if (ex) return go('session', { id: ex.id });
    const r = { id: uid(), chapterId: ch.id, courseId: c.id, roundNumber: chapterRounds(ch.id).length + 1, startDate: todayKey(), endDate: null, status: 'active', step: 'study', cycle: 1, tests: [], createdAt: nowIso() };
    S.rounds.push(r); save(); go('session', { id: r.id });
  }
  function closeRound(r) {
    if (S.timer && S.timer.roundId === r.id) { const res = stopTimer(); if (res.sec > 0 && res.t.step === 'study') logSession({ roundId: r.id, chapterId: r.chapterId, courseId: r.courseId, step: 'study', startedAt: res.firstStart, endedAt: nowIso(), durationSec: res.sec, manualEdit: res.manual }); }
    r.status = 'done'; r.endDate = todayKey(); save();
    if (cur().s === 'session') { nav.stack.pop(); if (cur().s !== 'chapter') nav.stack.push({ s: 'chapter', id: r.chapterId }); }
    render(); window.scrollTo(0, 0); toast('دور ' + fa(r.roundNumber) + ' بسته شد');
  }
  function softDelete(kind, id) {
    const at = nowIso(); const x = byId(S[kind], id); x.deletedAt = at;
    if (kind === 'courses') S.books.filter((b) => b.courseId === id && !b.deletedAt).forEach((b) => { b.deletedAt = at; S.chapters.filter((c) => c.bookId === b.id && !c.deletedAt).forEach((c) => (c.deletedAt = at)); });
    if (kind === 'books') S.chapters.filter((c) => c.bookId === id && !c.deletedAt).forEach((c) => (c.deletedAt = at));
    if (kind === 'chapters') S.chapters.filter((c) => c.parentId === id && !c.deletedAt).forEach((c) => (c.deletedAt = at));
    if (S.timer && S.timer.roundId) { const r = byId(S.rounds, S.timer.roundId); const ch = r && byId(S.chapters, r.chapterId); if (ch && ch.deletedAt) S.timer = null; }
    audit('delete', 'حذف ' + ({ courses: 'درس', books: 'کتاب', chapters: 'فصل' })[kind] + ': ' + (x.name || x.title)); save();
    return at;
  }
  function restoreAt(kind, id, at) {
    const x = byId(S[kind], id); if (!x) return; x.deletedAt = null;
    if (kind === 'courses') S.books.filter((b) => b.courseId === id && b.deletedAt === at).forEach((b) => { b.deletedAt = null; S.chapters.filter((c) => c.bookId === b.id && c.deletedAt === at).forEach((c) => (c.deletedAt = null)); });
    if (kind === 'books') S.chapters.filter((c) => c.bookId === id && c.deletedAt === at).forEach((c) => (c.deletedAt = null));
    if (kind === 'chapters') S.chapters.filter((c) => c.parentId === id && c.deletedAt === at).forEach((c) => (c.deletedAt = null));
    audit('restore', 'بازگرداندن: ' + (x.name || x.title));
  }
  function startSheet() {
    const tk = todayKey(); const plans = dayPlans(tk).filter((p) => !planDone(p));
    const open = S.rounds.filter((r) => r.status === 'active' && byId(S.chapters, r.chapterId) && !byId(S.chapters, r.chapterId).deletedAt);
    const row = (a, id, t, sub, color) => '<button class="mi" data-a="' + a + '" data-id="' + id + '"><span class="cdot" style="background:' + esc(color) + '"></span><span class="grow" style="min-width:0"><b>' + esc(t) + '</b><br><span class="small muted">' + sub + '</span></span></button>';
    let h = '<h2 style="margin-top:0">شروع مطالعه</h2>';
    if (open.length) h += '<div class="small muted" style="margin:8px 0 4px">دورهای باز</div><div class="menu">' + open.map((r) => { const ch = byId(S.chapters, r.chapterId); const c = chapterCourse(ch); return row('openSession', r.id, ch.title, esc(c.name) + ' · دور ' + fa(r.roundNumber) + ' · ' + STEP_LABEL[r.step], c.color); }).join('') + '</div>';
    if (plans.length) h += '<div class="small muted" style="margin:12px 0 4px">برنامه‌ی امروز</div><div class="menu">' + plans.map((p) => { const lb = planLabel(p); return row('planGoS', p.id, lb.title, esc(lb.sub) + (p.minutes ? ' · ' + fa(p.minutes) + ' دقیقه' : ''), lb.color); }).join('') + '</div>';
    const sug = activeChapters().filter((ch) => chapterState(ch).key === 'new').slice(0, 4);
    if (!open.length && !plans.length && sug.length) h += '<div class="small muted" style="margin:12px 0 4px">فصل‌های شروع‌نشده</div><div class="menu">' + sug.map((ch) => { const c = chapterCourse(ch); return row('openChapter', ch.id, ch.title, esc(c.name), c.color); }).join('') + '</div>';
    if (!open.length && !plans.length && !sug.length) h += '<p class="muted">هنوز فصلی برای شروع ندارید. از «درس‌ها» کتاب و فصل اضافه کنید.</p><button class="btn pri block" data-a="tabS" data-v="courses">رفتن به درس‌ها</button>';
    h += '<button class="btn block" style="margin-top:12px" data-a="closeSheet">بستن</button>';
    sheet(h);
  }

  function addChapters(bookId, items) {
    let order = live(S.chapters).filter((c) => c.bookId === bookId && !c.parentId).length; let parent = null, subOrder = 0; const t = nowIso();
    for (const it of items) {
      const ch = { id: uid(), bookId, parentId: null, order: 0, title: it.title, importance: null, pastTestCount: null, estMinutes: null, priority: 'mid', createdAt: t, updatedAt: t, deletedAt: null };
      if (it.level === 1 && parent) { ch.parentId = parent.id; ch.order = subOrder++; } else { ch.order = order++; parent = ch; subOrder = 0; }
      S.chapters.push(ch);
    }
  }
  function addCoursesFromText(text, isTest) {
    const names = String(text || '').split('\n').map((x) => x.trim().replace(/^[-*•–]\s*/, '')).filter(Boolean); const t = nowIso(); let n = 0;
    const maxO = Math.max(-1, ...S.courses.map((c) => (c.order == null ? -1 : c.order)));
    names.forEach((name) => { if (S.courses.some((c) => !c.deletedAt && c.name === name)) return; S.courses.push({ id: uid(), name, type: isTest ? 'test' : 'chapter', color: COLORS[S.courses.length % COLORS.length], combos: S.combos.filter((x) => x.active).map((x) => x.id), coef: {}, archived: false, order: maxO + 1 + n, createdAt: t, updatedAt: t, deletedAt: null }); n++; });
    return n;
  }
  function finishOnboarding() { S.settings.onboarded = true; ob = null; ROOT.prevActive = null; nav = { tab: 'today', stack: [] }; save(); render(); }
  // ---------- programs ----------
  function newProgramState() {
    const st = defaultState();
    st.settings.introDone = true; st.settings.seenTips = Object.assign({}, S ? S.settings.seenTips : {});
    if (S) { st.settings.theme = S.settings.theme; st.settings.capacity = S.settings.capacity.slice(); st.settings.lastBackupAt = S.settings.lastBackupAt; st.settings.checklistHidden = true; }
    return st;
  }
  function switchProgram(id) {
    if (id === ROOT.active) return closeSheet(true);
    if (S.timer) { toast('اول زمان‌سنج در جریان را تمام کنید'); return; }
    ROOT.active = id; S = ROOT.data[id]; ob = null; nav = { tab: 'today', stack: [] }; writeLocal(); closeSheet(true); render(); window.scrollTo(0, 0);
  }
  function createProgram() {
    closeSheet(true);
    if (!isPro() && ROOT.programs.length >= 1) { go('pro', { reason: 'programs' }); return; }
    if (S.timer) { toast('اول زمان‌سنج در جریان را تمام کنید'); return; }
    const id = uid(); ROOT.prevActive = ROOT.active;
    ROOT.programs.push({ id, title: 'برنامه‌ی جدید', createdAt: nowIso() }); ROOT.data[id] = newProgramState();
    ROOT.active = id; S = ROOT.data[id]; ob = null; nav = { tab: 'today', stack: [] }; writeLocal(); render(); window.scrollTo(0, 0);
  }
  function programRow(pr) {
    const d = ROOT.data[pr.id]; const active = pr.id === ROOT.active; const locked = !isPro() && pr.id !== ROOT.freeProgram && ROOT.programs.length > 1;
    const days = L.daysBetween(todayKey(), d.settings.examDate); const nch = live(d.chapters).length;
    return '<button class="mi" data-a="switchProgram" data-id="' + pr.id + '"><span class="cdot" style="width:14px;height:14px;background:' + (active ? 'var(--acc)' : 'var(--line)') + '"></span><span class="grow" style="min-width:0"><b>' + esc(pr.title) + '</b><br><span class="small muted">' + (d.settings.onboarded ? fa(nch) + ' فصل · ' + (days >= 0 ? fa(days) + ' روز تا آزمون' : 'آزمون گذشته') : 'راه‌اندازی نیمه‌کاره') + '</span></span>' + (active ? chip('فعال', 'acc') : locked ? chip('پیشرفته', 'warn') : '') + '</button>';
  }
  function programsSheet() {
    const canNew = isPro() || ROOT.programs.length < 1;
    sheet('<h2 style="margin-top:0">برنامه‌های من</h2><p class="small muted">هر آزمون و هر گرایش یک برنامه‌ی جداست' + (isPro() ? '.' : '؛ در پلن رایگان یک برنامه فعال است.') + '</p><div class="menu">' + ROOT.programs.map(programRow).join('') + '</div>' +
      '<button class="btn ' + (canNew ? 'pri' : '') + ' block big" style="margin-top:12px" data-a="newProgram">برنامه‌ی جدید' + (canNew ? '' : ' · پلن پیشرفته') + '</button><button class="btn ghost block" style="margin-top:6px" data-a="goProgramsPage">مدیریت برنامه‌ها</button>');
  }
  function vPrograms() {
    let h = top('برنامه‌های من', 'هر آزمون و هر گرایش یک برنامه‌ی جداست.');
    h += '<div class="list">' + ROOT.programs.map((pr) => { const free = pr.id === ROOT.freeProgram;
      return '<div class="card crs"><div class="row"><div class="grow"><div class="menu" style="box-shadow:none">' + programRow(pr) + '</div></div><button class="iconbtn ghosti" data-a="delProgram" data-id="' + pr.id + '" aria-label="حذف برنامه">×</button></div>' +
        (!isPro() && ROOT.programs.length > 1 ? '<div class="small" style="padding:0 12px 6px">' + (free ? chip('برنامه‌ی رایگان شما', 'ok') : '<button class="btn sm ghost" data-a="setFree" data-id="' + pr.id + '">این را برنامه‌ی رایگان کن</button>') + '</div>' : '') + '</div>'; }).join('') + '</div>';
    h += '<button class="btn pri block big" style="margin-top:14px" data-a="newProgram">برنامه‌ی جدید' + (isPro() || ROOT.programs.length < 1 ? '' : ' · پلن پیشرفته') + '</button>';
    if (!isPro()) h += '<p class="small muted" style="margin-top:10px">در پلن رایگان یک برنامه با همه‌ی امکانات دارید. برای برنامه‌های بیشتر، پلن پیشرفته را فعال کنید.</p>';
    return h;
  }
  function vLocked() {
    const free = ROOT.programs.find((p) => p.id === ROOT.freeProgram);
    return '<div style="margin-top:10px">' + BRAND + '</div><div class="card" style="margin-top:20px;text-align:center"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><rect x="12" y="28" width="40" height="30" rx="9" fill="#FFD166"/><path d="M20 28 v-8 a12 12 0 0 1 24 0 v8" fill="none" stroke="#2F4EBF" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="42" r="5" fill="#2F4EBF"/></svg><h1 style="font-size:20px">این برنامه به پلن پیشرفته نیاز دارد</h1><p class="muted">«' + esc(curProgram().title) + '» دومین برنامه‌ی شماست. داده‌هایش محفوظ است و با فعال‌کردن پلن پیشرفته دوباره در دسترس قرار می‌گیرد.</p>' +
      '<button class="btn pri block big" style="margin-top:12px" data-a="goPro">دیدن پلن پیشرفته</button><button class="btn block" style="margin-top:8px" data-a="switchProgram" data-id="' + free.id + '">رفتن به برنامه‌ی رایگان: ' + esc(free.title) + '</button></div>';
  }

  // ---------- Pro plan & Bazaar billing ----------
  const PRODUCTS = { monthly: 'masir_pro_monthly', yearly: 'masir_pro_yearly' };
  const PRICE = { monthly: 20000, yearly: 120000 };
  const Billing = {
    state: 'web', msg: '', ready: false,
    plugin() { return window.NativeBridge && window.NativeBridge.Billing; },
    async init(force) {
      const B = this.plugin(); if (!B) { this.state = 'web'; return; }
      try {
        const i = await B.info(); if (!i.configured) { this.state = 'unconfigured'; return; }
        if (!this.ready || force) { await B.connect(); this.ready = true; }
        this.state = 'ready'; await this.refresh();
      } catch (e) { this.state = 'error'; this.msg = String((e && e.message) || e); if (force) throw e; }
    },
    async refresh() {
      const B = this.plugin(); const r = await B.subscriptions(); const ids = Object.values(PRODUCTS);
      const list = (r.list || []).filter((x) => x.state === 'PURCHASED' && ids.includes(x.productId)).sort((a, b) => b.purchaseTime - a.purchaseTime);
      if (list.length) ROOT.pro = { until: Date.now() + 7 * 86400000, sku: list[0].productId, since: list[0].purchaseTime, checkedAt: Date.now(), source: 'bazaar' };
      else if (ROOT.pro && ROOT.pro.source === 'bazaar') ROOT.pro = null;
      writeLocal();
    },
    async buy(sku) {
      if (this.state !== 'ready') { await this.init(true); if (this.state !== 'ready') throw new Error(this.state); }
      const res = await this.plugin().subscribe({ sku, payload: 'masir-' + ROOT.active });
      if (res && res.state === 'PURCHASED') { ROOT.pro = { until: Date.now() + 7 * 86400000, sku, since: res.purchaseTime, checkedAt: Date.now(), source: 'bazaar' }; writeLocal(); }
      try { await this.refresh(); } catch (e) {}
    },
    humanError(m) {
      if (/not_configured|unconfigured/.test(m)) return 'پرداخت هنوز در این نسخه فعال نشده است.';
      if (/web/.test(m)) return 'پرداخت فقط در اپ اندروید نصب‌شده از کافه بازار ممکن است.';
      if (/Bazaar is not installed|not installed|NotFound/i.test(m)) return 'اپ بازار روی گوشی نصب نیست.';
      if (/login|Login/.test(m)) return 'در اپ بازار وارد حساب کاربری شوید.';
      return 'اتصال به بازار برقرار نشد. اینترنت و ورود به حساب بازار را بررسی کنید.';
    },
  };
  function vPro() {
    const pro = isPro(); const yearlyPerMonth = PRICE.yearly / 12;
    const card = (key, title, price, sub, badge) => '<div class="card plan' + (key === 'yearly' ? ' best' : '') + '">' + (badge ? '<span class="badge">' + badge + '</span>' : '') + '<div class="row between"><b style="font-size:17px">' + title + '</b><div style="text-align:left"><b class="num" style="font-size:20px">' + fa(price) + '</b> <span class="small muted">تومان</span></div></div><div class="small muted">' + sub + '</div>' +
      (!pro ? '<button class="btn ' + (key === 'yearly' ? 'pri' : '') + ' block big" style="margin-top:10px" data-a="buy" data-v="' + PRODUCTS[key] + '" ' + (Billing.state === 'ready' ? '' : 'disabled') + '>' + (key === 'yearly' ? 'خرید اشتراک سالانه' : 'خرید اشتراک ماهانه') + '</button>' : '') + '</div>';
    let h = top('پلن پیشرفته');
    h += '<div class="prohero"><div class="row" style="gap:12px">' + LOGO + '<div><b style="font-size:19px">مسیر پیشرفته</b><div style="opacity:.9;font-size:13px">برای هر آزمون و هر گرایش، یک برنامه</div></div></div>' +
      '<div class="pfeat">' + [['#FFD166', 'برنامه‌های نامحدود: هر آزمون و هر گرایش جدا'], ['#5CE1B0', 'جابه‌جایی سریع بین برنامه‌ها'], ['#FF9EB0', 'همه‌ی امکانات: برنامه‌ی هفتگی، زمان‌سنج، تست، مقایسه‌ی دورها، آمار'], ['#B9C6FF', 'داده‌های همه‌ی برنامه‌ها در یک فایل پشتیبان']].map(([c, t]) => '<div class="row" style="gap:10px;margin-top:8px"><span style="width:22px;height:22px;border-radius:7px;background:' + c + ';display:inline-flex;align-items:center;justify-content:center;color:#141B2D;font-size:14px;font-weight:700;flex:none">✓</span><span>' + t + '</span></div>').join('') + '</div></div>';
    if (pro) h += '<div class="banner ok" style="margin-top:14px">پلن پیشرفته‌ی شما فعال است (' + (ROOT.pro.sku === PRODUCTS.yearly ? 'سالانه' : 'ماهانه') + '). تمدید و لغو اشتراک از بخش «اشتراک‌ها» در اپ بازار انجام می‌شود.</div>';
    else {
      if (Billing.state === 'web') h += '<div class="banner info" style="margin-top:14px">خرید اشتراک فقط در اپ اندروید «مسیر» که از کافه بازار نصب شده امکان‌پذیر است.</div>';
      else if (Billing.state === 'unconfigured') h += '<div class="banner warn" style="margin-top:14px">پرداخت در این نسخه هنوز فعال نشده است.</div>';
      else if (Billing.state === 'error') h += '<div class="banner warn" style="margin-top:14px">' + esc(Billing.humanError(Billing.msg)) + ' <button class="btn sm" data-a="restorePro" style="margin-right:6px">تلاش دوباره</button></div>';
    }
    h += '<div class="list" style="margin-top:14px">' + card('yearly', 'سالانه', PRICE.yearly, 'معادل ماهی ' + fa(yearlyPerMonth) + ' تومان · پرداخت یک‌جا برای ۱۲ ماه', '۵۰٪ تخفیف') + card('monthly', 'ماهانه', PRICE.monthly, 'تمدید خودکار هر ماه؛ هر وقت خواستید لغو کنید') + '</div>';
    h += '<div class="card" style="margin-top:12px"><b>پلن رایگان</b><div class="small muted">یک برنامه با همه‌ی امکانات، برای همیشه رایگان.</div></div>';
    if (Billing.state === 'ready' || Billing.state === 'error') h += '<button class="btn ghost block" style="margin-top:10px" data-a="restorePro">قبلاً خرید کرده‌ام؛ بازیابی اشتراک</button>';
    h += '<p class="small muted" style="margin-top:10px">پرداخت از طریق کافه بازار انجام می‌شود. اشتراک به حساب بازار شما متصل است و روی گوشی جدید هم با «بازیابی اشتراک» برمی‌گردد.</p>';
    return h;
  }

  function tryImport(text) {
    const err = $('#imperr'); if (err) err.textContent = '';
    let obj; try { obj = migrateRoot(JSON.parse(text)); } catch (e) { if (err) err.textContent = 'فایل معتبر نیست: ' + (e.message && /[؀-ۿ]/.test(e.message) ? e.message : 'ساختار JSON خوانده نشد.'); return; }
    let nc = 0, nr = 0, ns = 0; obj.programs.forEach((pp) => { const d = obj.data[pp.id]; nc += live(d.chapters).length; nr += d.rounds.length; ns += d.sessions.length; });
    confirmSheet('جایگزینی داده‌ها با پشتیبان؟', 'پشتیبان شامل ' + fa(obj.programs.length) + ' برنامه، ' + fa(nc) + ' فصل، ' + fa(nr) + ' دور و ' + fa(ns) + ' جلسه است. داده‌های فعلی جایگزین می‌شوند. وضعیت اشتراک از پشتیبان خوانده نمی‌شود.', 'جایگزین کن', () => { const pro = ROOT.pro; ROOT = obj; ROOT.pro = pro; S = ROOT.data[ROOT.active]; audit('import', 'بازیابی از پشتیبان'); save(); nav = { tab: 'today', stack: [] }; render(); toast('بازیابی انجام شد'); }, true);
  }
  function minutesField(f) { const m = L.parseNum(f.minutes ? f.minutes.value : ''); if (Number.isNaN(m) || (m != null && (m < 0 || m > 1440))) return NaN; return Math.round((m || 0) * 60); }

  // ---------- form submit ----------
  const F = {
    manualStudy: (f) => {
      const r = byId(S.rounds, f.dataset.id); const hh = L.parseIntSafe(f.h.value), mm = L.parseIntSafe(f.m.value); const err = $('#formerr', f);
      if (Number.isNaN(hh) || Number.isNaN(mm) || (hh != null && (hh < 0 || hh > 16)) || (mm != null && (mm < 0 || mm > 600))) return (err.textContent = 'ساعت و دقیقه را درست وارد کنید.');
      const sec = ((hh || 0) * 60 + (mm || 0)) * 60; if (sec <= 0) return (err.textContent = 'مدت مطالعه را وارد کنید.');
      const day = Number(f.day.value) || 0; const d = new Date(); d.setDate(d.getDate() - day); if (day) d.setHours(20, 0, 0, 0);
      const end = d.getTime(); const startIso = new Date(end - sec * 1000).toISOString();
      logSession({ roundId: r.id, chapterId: r.chapterId, courseId: r.courseId, step: 'study', cycle: r.cycle, startedAt: startIso, endedAt: new Date(end).toISOString(), durationSec: sec, manualEdit: true });
      if (r.step !== 'study') { if (r.step === 'result') r.cycle++; r.step = 'study'; }
      if (f.finish.checked) { r.step = 'test'; r.readDoneAt = nowIso(); }
      save(); closeSheet(true); if (cur().s !== 'session' || cur().id !== r.id) go('session', { id: r.id }); else render(); toast(fmtDur(sec) + ' مطالعه ثبت شد' + (f.finish.checked ? '؛ حالا تست' : ''));
    },
    obExam: (f) => { const v = f.examName.value.trim(); if (!v) { ob.err = 'نام آزمون را وارد کنید.'; return render(); } S.settings.examName = v; S.settings.track = f.track.value.trim(); ob.err = ''; ob.step++; render(); window.scrollTo(0, 0); },
    obAddCombo: (f) => { const t = f.t.value.trim(); if (!t) return; const code = /^[0-9۰-۹]+$/.test(t) ? L.toEnDigits(t) : ''; S.combos.push({ id: uid(), code, title: code ? '' : t, active: true }); render(); },
    obAddCourses: (f) => { addCoursesFromText(f.names.value, f.test.checked); ob.err = ''; render(); },
    coursesBatch: (f) => { const n = addCoursesFromText(f.names.value, f.test.checked); if (!n) return ($('#formerr', f).textContent = 'حداقل یک نام درس بنویسید.'); save(); closeSheet(); render(); toast(fa(n) + ' درس اضافه شد'); },
    obDate: (f) => { const d = L.parseIntSafe(f.jd.value), m = L.parseIntSafe(f.jm.value), y = L.parseIntSafe(f.jy.value); if (!L.isValidJalali(y, m, d)) { ob.err = 'تاریخ شمسی معتبر نیست.'; return render(); } const cap = readCapacity(f); if (!cap) { ob.err = 'ساعت مفید هر روز باید عددی بین ۰ تا ۱۸ باشد.'; return render(); } S.settings.examDate = L.jalaliToKey(y, m, d); S.settings.capacity = cap; ob.err = ''; ob.step++; render(); },
    obBook: (f) => { const v = formVals(f); if (!v.title.trim()) { ob.err = 'عنوان کتاب را وارد کنید.'; return render(); } const b = { id: uid(), courseId: v.courseId, title: v.title.trim(), author: '', createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null }; S.books.push(b); addChapters(b.id, L.parseBatch(v.batch)); finishOnboarding(); },
    plan: (f) => {
      const v = formVals(f); const err = $('#formerr', f); const mins = L.parseIntSafe(v.minutes), tests = L.parseIntSafe(v.tests);
      if (Number.isNaN(mins) || Number.isNaN(tests) || (mins != null && (mins < 0 || mins > 1440)) || (tests != null && tests < 0)) return (err.textContent = 'زمان و تعداد تست باید عدد صحیح نامنفی باشند.');
      if (!mins && !tests) return (err.textContent = 'حداقل زمان هدف یا تعداد تست هدف را وارد کنید.');
      const c = byId(S.courses, v.courseId); if (!c) return (err.textContent = 'درس را انتخاب کنید.');
      if (c.type !== 'test' && !v.chapterId) return (err.textContent = 'فصل را انتخاب کنید.');
      const data = { courseId: c.id, chapterId: c.type === 'test' ? null : v.chapterId, minutes: mins || null, tests: tests || null };
      if (f.dataset.id) Object.assign(byId(S.plans, f.dataset.id), data);
      else { const dup = S.plans.find((p) => p.date === f.dataset.date && p.courseId === data.courseId && p.chapterId === data.chapterId); if (dup) Object.assign(dup, data); else S.plans.push(Object.assign({ id: uid(), date: f.dataset.date, order: dayPlans(f.dataset.date).length, createdAt: nowIso() }, data)); }
      save(); closeSheet(); render(); toast('برنامه ذخیره شد');
    },
    course: (f) => {
      const v = formVals(f); const id = f.dataset.id; const err = $('#formerr', f);
      if (!v.name.trim()) return (err.textContent = 'نام درس را وارد کنید.');
      const combos = S.combos.filter((cb) => f['combo_' + cb.id].checked).map((cb) => cb.id); const coef = {};
      for (const cb of S.combos) { const n = L.parseNum(f['coef_' + cb.id].value); if (Number.isNaN(n) || (n != null && n < 0)) return (err.textContent = 'ضریب باید عدد نامنفی باشد.'); if (n != null && combos.includes(cb.id)) coef[cb.id] = n; }
      if (id) { const c = byId(S.courses, id); if (c.type !== v.type) audit('type', 'تغییر نوع «' + c.name + '»'); Object.assign(c, { name: v.name.trim(), type: v.type, color: v.color, combos, coef, archived: !!f.archived && f.archived.checked, updatedAt: nowIso() }); }
      else S.courses.push({ id: uid(), name: v.name.trim(), type: v.type, color: v.color, combos, coef, archived: false, createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null });
      save(); closeSheet(); render(); toast('ذخیره شد');
    },
    book: (f) => {
      const v = formVals(f); const id = f.dataset.id; const err = $('#formerr', f);
      if (!v.title.trim()) return (err.textContent = 'عنوان کتاب را وارد کنید.'); if (!v.courseId) return (err.textContent = 'درس را انتخاب کنید.');
      if (id) { Object.assign(byId(S.books, id), { title: v.title.trim(), author: v.author.trim(), courseId: v.courseId, updatedAt: nowIso() }); save(); closeSheet(); render(); return toast('ذخیره شد'); }
      const b = { id: uid(), courseId: v.courseId, title: v.title.trim(), author: v.author.trim(), createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null }; S.books.push(b); const items = L.parseBatch(v.batch); addChapters(b.id, items); save(); closeSheet(); go('book', { id: b.id }); toast('کتاب' + (items.length ? ' با ' + fa(items.length) + ' فصل' : '') + ' ثبت شد');
    },
    batch: (f) => { const items = L.parseBatch(f.batch.value); if (!items.length) return ($('#formerr', f).textContent = 'هیچ خطی وارد نشده.'); addChapters(f.dataset.id, items); save(); closeSheet(); render(); toast(fa(items.length) + ' مورد اضافه شد'); },
    chapter: (f) => {
      const v = formVals(f); const id = f.dataset.id; const err = $('#formerr', f);
      if (!v.title.trim()) return (err.textContent = 'عنوان را وارد کنید.');
      const ints = {}; for (const k of ['pastTestCount', 'estMinutes', 'importance']) { const n = L.parseIntSafe(v[k]); if (Number.isNaN(n) || (n != null && n < 0)) return (err.textContent = 'اعداد باید صحیح و نامنفی باشند.'); ints[k] = n; }
      const apply = () => {
        const parentId = v.parentId === undefined ? undefined : (v.parentId || null);
        if (id) { const ch = byId(S.chapters, id); if (parentId !== undefined && parentId !== (ch.parentId || null)) { ch.parentId = parentId; ch.order = live(S.chapters).filter((x) => x.bookId === ch.bookId && (x.parentId || null) === parentId && x.id !== id).length; } Object.assign(ch, ints, { title: v.title.trim(), priority: v.priority, updatedAt: nowIso() }); }
        else { const bookId = f.dataset.book; const pid = parentId || null; S.chapters.push(Object.assign({ id: uid(), bookId, parentId: pid, order: live(S.chapters).filter((x) => x.bookId === bookId && (x.parentId || null) === pid).length, title: v.title.trim(), priority: v.priority, createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null }, ints)); }
        save(); closeSheet(true); render(); toast('ذخیره شد');
      };
      const was = id ? byId(S.chapters, id).priority : null;
      if (v.priority === 'excluded' && was !== 'excluded') { confirmSheet('حذف این فصل از برنامه؟', 'فصل حذف نمی‌شود؛ فقط در برنامه و آمار پوشش نمی‌آید. با تغییر اولویت برمی‌گردد.', 'حذف از برنامه', () => { apply(); audit('exclude', 'حذف از برنامه: ' + v.title.trim()); save(); }); return; }
      apply();
    },
    combo: (f) => { const v = formVals(f); const code = L.toEnDigits(v.code).trim(); const err = $('#formerr', f); if (!code && !v.title.trim()) return (err.textContent = 'نام را وارد کنید.'); if (code && S.combos.find((c) => c.code === code && c.id !== f.dataset.id)) return (err.textContent = 'این شماره قبلاً ثبت شده.'); if (f.dataset.id) Object.assign(byId(S.combos, f.dataset.id), { code, title: v.title.trim() }); else S.combos.push({ id: uid(), code, title: v.title.trim(), active: true }); save(); closeSheet(); render(); },
    tEdit: (f) => { const m = L.parseNum(f.min.value); if (m == null || Number.isNaN(m) || m < 0 || m > 1440) return ($('#formerr', f).textContent = 'عدد بین ۰ تا ۱۴۴۰ وارد کنید.'); const t = S.timer; if (!t) return closeSheet(); t.accMs = Math.round(m * 60000); t.startedAt = Date.now(); t.manual = true; save(); closeSheet(); render(); toast('زمان ویرایش شد'); },
    testSave: (f) => {
      const r = byId(S.rounds, f.dataset.id); const n = readTest(f); const err = $('#testerr', f); if (!n.ok) return (err.textContent = n.msg);
      let sec, started, manual;
      if (timerFor(r.id, 'test')) { const res = stopTimer(); sec = res.sec; started = res.firstStart; manual = res.manual; }
      else { sec = minutesField(f); if (Number.isNaN(sec)) return (err.textContent = 'مدت را درست وارد کنید.'); manual = true; started = new Date(Date.now() - sec * 1000).toISOString(); }
      const test = Object.assign({ id: uid(), at: nowIso(), seconds: sec, cycle: r.cycle }, n.test); r.tests.push(test);
      if (sec > 0) logSession({ roundId: r.id, chapterId: r.chapterId, courseId: r.courseId, testId: test.id, step: 'test', startedAt: started, endedAt: nowIso(), durationSec: sec, manualEdit: manual });
      r.step = 'result'; save(); render(); window.scrollTo(0, 0);
    },
    quick: (f) => {
      const ch = byId(S.chapters, f.dataset.id); const c = chapterCourse(ch); const err = $('#testerr', f);
      const study = L.parseNum(f.study.value), tmin = L.parseNum(f.testmin.value);
      if (Number.isNaN(study) || Number.isNaN(tmin) || (study != null && (study < 0 || study > 1440)) || (tmin != null && (tmin < 0 || tmin > 1440))) return (err.textContent = 'زمان‌ها باید عدد بین ۰ تا ۱۴۴۰ باشند.');
      const n = readTest(f); if (!n.ok) return (err.textContent = n.msg);
      let r = activeRound(ch.id);
      if (!r) { r = { id: uid(), chapterId: ch.id, courseId: c.id, roundNumber: chapterRounds(ch.id).length + 1, startDate: todayKey(), endDate: null, status: 'active', step: 'result', cycle: 1, tests: [], createdAt: nowIso() }; S.rounds.push(r); }
      else if (r.tests.length) r.cycle++;
      const now = Date.now(); const ss = Math.round((study || 0) * 60), ts = Math.round((tmin || 0) * 60);
      if (ss) logSession({ roundId: r.id, chapterId: ch.id, courseId: c.id, step: 'study', cycle: r.cycle, startedAt: new Date(now - (ss + ts) * 1000).toISOString(), endedAt: new Date(now - ts * 1000).toISOString(), durationSec: ss, manualEdit: true });
      const test = Object.assign({ id: uid(), at: nowIso(), seconds: ts, cycle: r.cycle }, n.test); r.tests.push(test);
      if (ts) logSession({ roundId: r.id, chapterId: ch.id, courseId: c.id, testId: test.id, step: 'test', startedAt: new Date(now - ts * 1000).toISOString(), endedAt: nowIso(), durationSec: ts, manualEdit: true });
      r.step = 'result'; if (f.close.checked) { if (S.timer && S.timer.roundId === r.id) S.timer = null; r.status = 'done'; r.endDate = todayKey(); }
      save(); closeSheet(); render(); toast('دور ' + fa(r.roundNumber) + ': ' + pctTxt(pctOf(test)));
    },
    langSave: (f) => {
      const n = readTest(f); const err = $('#testerr', f); if (!n.ok) return (err.textContent = n.msg);
      let sec, started, manual = false; const t = S.timer && S.timer.courseId === f.dataset.id && !S.timer.roundId ? S.timer : null;
      if (t) { const res = stopTimer(); sec = res.sec; started = res.firstStart; manual = res.manual; }
      else { sec = minutesField(f); if (Number.isNaN(sec)) return (err.textContent = 'مدت را درست وارد کنید.'); manual = true; started = new Date(Date.now() - sec * 1000).toISOString(); }
      const l = Object.assign({ id: uid(), courseId: f.dataset.id, at: nowIso(), date: todayKey(), seconds: sec }, n.test); S.langLogs.push(l);
      if (sec > 0) logSession({ langLogId: l.id, courseId: f.dataset.id, chapterId: null, step: 'lang', startedAt: started, endedAt: nowIso(), durationSec: sec, manualEdit: manual });
      save(); render(); toast('آزمون ثبت شد: ' + pctTxt(pctOf(l)));
    },
    settings: (f) => {
      const err = $('#seterr'); const d = L.parseIntSafe(f.jd.value), m = L.parseIntSafe(f.jm.value), y = L.parseIntSafe(f.jy.value);
      if (!L.isValidJalali(y, m, d)) return (err.textContent = 'تاریخ آزمون معتبر نیست.');
      const cap = readCapacity(f); if (!cap) return (err.textContent = 'ساعت مفید هر روز باید بین ۰ تا ۱۸ باشد.');
      const g = (k, lo, hi) => { const n = L.parseNum(f[k].value); return n == null || Number.isNaN(n) || n < lo || n > hi ? NaN : n; };
      const v = { testCount: g('testCount', 1, 200), masteryPct: g('masteryPct', 0, 100), reviewPct: g('reviewPct', 0, 100), negRatio: g('negRatio', 1, 10) };
      if (Object.values(v).some(Number.isNaN)) return (err.textContent = 'یکی از مقادیر خارج از محدوده است.');
      if (v.reviewPct > v.masteryPct) return (err.textContent = 'آستانه‌ی مرور هدفمند نباید از تسلط بیشتر باشد.');
      v.testCount = Math.round(v.testCount);
      const en = f.examName.value.trim(); if (!en) return (err.textContent = 'نام آزمون را وارد کنید.');
      Object.assign(S.settings, v, { examName: en, track: f.track.value.trim(), groupLabel: f.groupLabel ? (f.groupLabel.value.trim() || 'گروه') : S.settings.groupLabel, capacity: cap, examDate: L.jalaliToKey(y, m, d), negOn: f.negOn.checked, theme: f.theme.value }); save(); render(); toast('تنظیمات ذخیره شد');
    },
  };

  // ---------- live inputs ----------
  function liveTest(f) {
    const box = $('#testlive', f); if (!box) return; const er = $('#testerr', f); if (er) er.textContent = '';
    const filled = f.mode.value === 'p' ? f.pct.value.trim() : f.correct.value.trim();
    if (!filled || !f.count.value.trim()) { box.textContent = ''; return; }
    const n = readTest(f); if (!n.ok) { box.textContent = ''; return; }
    const t = n.test; let s = fa(t.correct) + ' صحیح از ' + fa(t.count) + ' · درصد: ' + pctTxt(pctOf(t));
    const st = L.masteryStatus(L.pctRaw(t.correct, t.count), S.settings.masteryPct, S.settings.reviewPct); if (st && !f.dataset.form.startsWith('lang')) s += ' · ' + STATUS[st][0];
    box.textContent = s;
  }
  document.addEventListener('input', (e) => {
    const el = e.target; const a = el.dataset && el.dataset.a;
    if (a === 'testLive') liveTest(el.form);
    else if (a === 'batchLive') { const items = L.parseBatch(el.value); const subs = items.filter((x) => x.level === 1).length; $('#batchprev').textContent = items.length ? fa(items.length - subs) + ' فصل و ' + fa(subs) + ' زیرفصل' : ''; }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.a === 'planCourse') $('#chapsel').innerHTML = chapterSelect(el.value, null);
    if (el.dataset && el.dataset.a === 'importFile' && el.files && el.files[0]) { const rd = new FileReader(); rd.onload = () => tryImport(String(rd.result)); rd.readAsText(el.files[0]); }
  });

  // ---------- timer tick ----------
  function tick() {
    if (!S || !S.timer) return; const ms = tElapsed();
    document.querySelectorAll('[data-timer]').forEach((e) => (e.textContent = fmtClock(ms)));
    document.querySelectorAll('[data-total]').forEach((e) => (e.textContent = fmtDur(Number(e.dataset.total) + Math.round(ms / 1000))));
    const cw = $('#capwarn'); const t = S.timer;
    if (cw && t.step === 'study' && t.roundId) { const r = byId(S.rounds, t.roundId); const ch = r && byId(S.chapters, r.chapterId); const cap = ch && ch.estMinutes; const over = cap > 0 && ms > cap * 60000; const want = over ? 'over' : ''; if (cw.dataset.s !== want) { cw.dataset.s = want; cw.innerHTML = over ? '<div class="banner warn" role="status" style="margin-bottom:10px">از زمان تخمینی ' + fa(cap) + ' دقیقه گذشت.</div>' : ''; } }
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]'); if (!el) return; const a = el.dataset.a;
    if (['testLive', 'batchLive', 'planCourse', 'importFile'].includes(a)) return;
    if (el.tagName === 'INPUT' && el.type === 'checkbox') { if (A[a]) A[a](el, e); return; }
    if (A[a]) { e.preventDefault(); A[a](el, e); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#sheetbg')) closeSheet();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && e.target.getAttribute('role') === 'button' && e.target.dataset.a && A[e.target.dataset.a]) { e.preventDefault(); A[e.target.dataset.a](e.target, e); }
  });
  document.addEventListener('submit', (e) => { const f = e.target; e.preventDefault(); const k = f.dataset.form; if (F[k]) F[k](f); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('storage', (e) => { if (e.key === ROOT_KEY && e.newValue) { try { ROOT = migrateRoot(JSON.parse(e.newValue)); S = ROOT.data[ROOT.active]; render(); } catch (x) {} } });

  // ---------- boot ----------
  function nativeInit() {
    const NB = window.NativeBridge; if (!NB) return;
    try {
      NB.App.addListener('backButton', () => {
        if ($('#sheetbg')) return closeSheet();
        if (!S.settings.onboarded && !S.settings.introDone) { if (introIdx > 0) { introIdx--; render(); } else NB.App.minimizeApp(); return; }
        if (!S.settings.onboarded) { if (ob && ob.step > 0) { ob.step--; render(); } else NB.App.minimizeApp(); return; }
        if (nav.stack.length) return back();
        if (nav.tab !== 'today') return setTab('today');
        NB.App.minimizeApp();
      });
      NB.App.addListener('resume', () => { tick(); render(); });
      const paint = () => { const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (document.documentElement.getAttribute('data-theme') !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
        NB.StatusBar.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {}); NB.StatusBar.setBackgroundColor({ color: dark ? '#0B1020' : '#EEF2FB' }).catch(() => {}); };
      paint(); const ap = applyTheme; applyTheme = function () { ap(); paint(); };
    } catch (e) { console.error(e); }
  }
  loadLocal(); purgeBin(); nativeInit(); render(); Billing.init().then(() => { if (cur().s === 'pro' || programLocked()) render(); }); setInterval(tick, 1000); if (!window.NativeBridge) Cloud.init(); else { Cloud.status = 'off'; }
})();
