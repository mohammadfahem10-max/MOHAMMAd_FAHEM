/* خروجی‌گیری: متن (txt/md)، برگهٔ رسمی (HTML→PDF در سرویس)، فایل اصل دست‌نخورده، بستهٔ کار (zip) برای سرویس محلی.
   همچنین صف هوشمند بازپخش (گرفتن «گزارشات»/«پیوست‌ها» هر رکورد) با توقف نرم هنگام پایان نشست و ادامه از همان‌جا. */
(function (S) {
  'use strict';
  const U = S.util;
  const store = () => S.store;

  const FOLDERS = { docs: '۱ اسناد', attachments: '۲ پیوست‌ها', timeline: '۳ روند و رخدادها', reports: '۴ گزارش‌ها' };
  const JOB_PREFIX = 'sabtman__';

  /* ---------- متن ---------- */

  function recordText(section, rec) {
    const st = store();
    const label = st.labelFor(section.path);
    const caseName = st.caseNameOf(section, rec);
    const lines = [`${label}`, `پرونده: ${caseName}`, `تاریخ استخراج: ${U.formatSystemDate()}`, ''];
    for (const [k, v] of Object.entries(rec.flat)) {
      if (k.endsWith('[]')) { lines.push(`${k.slice(0, -2)}:`); for (const row of v) lines.push('  - ' + Object.entries(U.flatten(row)).map(([a, b]) => `${a}: ${U.formatValue(b)}`).join(' | ')); }
      else lines.push(`${k}: ${U.formatValue(v)}`);
    }
    const tl = section.timelines.get(rec.key);
    if (tl && tl.rows.length) {
      lines.push('', 'روند / رخدادها:');
      const a = S.reports.analyzeTimeline(tl.rows);
      for (const s of a.steps) lines.push(`  ${s.dateText} | ${s.prev && s.prev !== '—' ? s.prev + ' ← ' : ''}${s.status}${s.user ? ' | ' + s.user : ''}${s.note ? ' | ' + s.note : ''}${s.durationMs !== null ? ' | ' + (s.open ? 'از این مرحله: ' : 'ماندگاری: ') + U.formatDuration(s.durationMs) : ''}`);
    }
    const att = section.attachments.get(rec.key);
    if (att && att.rows.length) {
      lines.push('', 'پیوست‌ها:');
      for (const row of att.rows) lines.push('  - ' + Object.entries(U.flatten(row)).map(([a, b]) => `${a}: ${U.formatValue(b)}`).join(' | '));
    }
    return lines.join('\n') + '\n';
  }

  function recordMarkdown(section, rec) {
    const st = store();
    const label = st.labelFor(section.path);
    const caseName = st.caseNameOf(section, rec);
    const out = [`# ${caseName}`, '', `**بخش:** ${label}  `, `**تاریخ استخراج:** ${U.formatSystemDate()}`, '', '## مشخصات', '', '| فیلد | مقدار |', '|---|---|'];
    const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    for (const [k, v] of Object.entries(rec.flat)) if (!k.endsWith('[]')) out.push(`| ${cell(k)} | ${cell(U.formatValue(v))} |`);
    for (const [k, v] of Object.entries(rec.flat)) if (k.endsWith('[]') && v.length) { out.push('', `## ${k.slice(0, -2)}`, ''); out.push(...mdTable(v.map((r) => U.flatten(r)))); }
    const tl = section.timelines.get(rec.key);
    if (tl && tl.rows.length) {
      const a = S.reports.analyzeTimeline(tl.rows);
      out.push('', '## روند / رخدادها', '', '| تاریخ و ساعت | وضعیت پیشین | وضعیت جاری | اقدام‌کننده | شرح | ماندگاری |', '|---|---|---|---|---|---|');
      for (const s of a.steps) out.push(`| ${cell(s.dateText)} | ${cell(s.prev || '—')} | ${cell(s.status)} | ${cell(s.user || '—')} | ${cell(s.note || '—')} | ${s.durationMs !== null ? U.formatDuration(s.durationMs) : '—'} |`);
      out.push('', `مدت کل روند: ${U.formatDuration(a.totalMs)}`);
      out.push('', '### جدول خام مراحل', '', ...mdTable(a.steps.map((s) => s.flat)));
    }
    const att = section.attachments.get(rec.key);
    if (att && att.rows.length) { out.push('', '## پیوست‌ها', '', ...mdTable(att.rows.map((r) => U.flatten(r)))); }
    return out.join('\n') + '\n';
  }

  function mdTable(flats) {
    const cols = [];
    const seen = new Set();
    for (const f of flats) for (const k of Object.keys(f)) if (!k.endsWith('[]') && !seen.has(k)) { seen.add(k); cols.push(k); }
    const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    return ['| ' + cols.map(cell).join(' | ') + ' |', '|' + cols.map(() => '---').join('|') + '|', ...flats.map((f) => '| ' + cols.map((c) => cell(U.formatValue(f[c]))).join(' | ') + ' |')];
  }

  /* ---------- فایل‌های اصل ---------- */

  /** گرفتن فایل‌های اصلِ یک رکورد (دست‌نخورده) از نشست کاربر. خروجی: [{name, bytes, folder}] */
  async function collectOriginalFiles(section, rec, onProgress) {
    const st = store();
    const out = [];
    const seenNames = new Set();
    const uniqueName = (name) => {
      let n = U.safeFileName(name, 'فایل');
      let i = 2;
      const dot = n.lastIndexOf('.');
      const base = dot > 0 ? n.slice(0, dot) : n, ext = dot > 0 ? n.slice(dot) : '';
      while (seenNames.has(n)) n = `${base} (${U.faDigits(i++)})${ext}`;
      seenNames.add(n);
      return n;
    };
    const isAttachType = /پیوست/.test(JSON.stringify(rec.flat).slice(0, 2000));
    const folderFor = (field, fromAttachments) => (fromAttachments || /attach|پیوست/i.test(field) || isAttachType ? FOLDERS.attachments : FOLDERS.docs);

    const pull = async (flat, fromAttachments) => {
      for (const ff of st.fileFieldsOf(flat)) {
        try {
          if (ff.kind === 'base64') {
            const bytes = U.base64ToBytes(ff.value);
            const mime = (/^data:([^;]+);/.exec(ff.value) || [])[1] || '';
            const nameField = Object.keys(flat).find((k) => /name|title|نام|عنوان/i.test(k) && typeof flat[k] === 'string' && /\.[a-z0-9]{2,4}$/i.test(flat[k]));
            const name = nameField ? flat[nameField] : `${ff.field}.${U.extFromMime(mime) || 'bin'}`;
            out.push({ name: uniqueName(name), bytes, folder: folderFor(ff.field, fromAttachments), original: true });
          } else {
            const url = new URL(ff.value, location.href).href;
            const cached = st.state.files.get(url);
            if (cached) { out.push({ name: uniqueName(cached.fileName || U.fileNameFromUrl(url)), bytes: cached.bytes, folder: folderFor(ff.field, fromAttachments), original: true }); continue; }
            const res = await S.hook.replay({ method: 'GET', url, headers: {} });
            if (res.bytes) out.push({ name: uniqueName(res.fileName || U.fileNameFromUrl(url)), bytes: res.bytes, folder: folderFor(ff.field, fromAttachments), original: true });
          }
          if (onProgress) onProgress(out.length);
        } catch (e) {
          if (e && e.code === 'SESSION_EXPIRED') throw e;
          st.addLog('warn', `فایل «${ff.field}» گرفته نشد: ${e.message}`);
        }
      }
    };
    await pull(rec.flat, false);
    // پیوست‌های یادگرفته‌شده (ردیف‌های «پیوست‌ها») و پیوند دانلود فایل
    const att = section.attachments.get(rec.key);
    if (att) {
      const fileLinks = st.linksFor(section.path, 'فایل');
      for (const row of att.rows) {
        const flat = U.flatten(row);
        await pull(flat, true);
        for (const link of fileLinks) {
          const id = flat[link.idField];
          if (id === null || id === undefined || id === '') continue;
          try {
            const req = st.buildRequest(link, { flat });
            const res = await S.hook.replay(req);
            if (res.bytes) {
              const nameField = Object.keys(flat).find((k) => /name|title|نام|عنوان/i.test(k) && typeof flat[k] === 'string');
              out.push({ name: uniqueName(res.fileName || (nameField && flat[nameField]) || `${id}.${U.extFromMime(res.contentType) || 'bin'}`), bytes: res.bytes, folder: FOLDERS.attachments, original: true });
              if (onProgress) onProgress(out.length);
            }
          } catch (e) {
            if (e && e.code === 'SESSION_EXPIRED') throw e;
            st.addLog('warn', `پیوست گرفته نشد: ${e.message}`);
          }
          await U.sleep(st.state.settings.delayMs);
        }
      }
    }
    // فایل‌های دانلودشده در خود سایت که به این رکورد پیوند دارند
    for (const link of st.linksFor(section.path, 'فایل').filter((l) => l.owner === 'رکورد')) {
      const req = st.buildRequest(link, rec);
      if (!req) continue;
      try {
        const cached = st.state.files.get(req.url);
        const res = cached ? { bytes: cached.bytes, fileName: cached.fileName, contentType: cached.contentType } : await S.hook.replay(req);
        if (res.bytes) out.push({ name: uniqueName(res.fileName || `${rec.flat[link.idField]}.${U.extFromMime(res.contentType) || 'bin'}`), bytes: res.bytes, folder: FOLDERS.docs, original: true });
      } catch (e) {
        if (e && e.code === 'SESSION_EXPIRED') throw e;
        st.addLog('warn', `فایل اصل گرفته نشد: ${e.message}`);
      }
    }
    return out;
  }

  /* ---------- بستهٔ کار ---------- */

  /**
   * ساخت بستهٔ کار برای چند رکورد. mode: pdf+text | pdf | text
   * خروجی: {entries, manifest}
   */
  async function buildJob(section, records, mode, opts) {
    opts = opts || {};
    const st = store();
    const label = st.labelFor(section.path);
    const wantPdf = mode !== 'text', wantText = mode !== 'pdf';
    const entries = [];
    const folders = [];
    let i = 0;
    for (const rec of records) {
      i++;
      if (opts.onProgress) opts.onProgress({ index: i, total: records.length, rec });
      const caseName = st.caseNameOf(section, rec);
      const base = `files/${U.faDigits(i)}`;
      const folder = { name: caseName, base, files: [], index: [] };
      const push = (sub, name, data, kind) => {
        const path = `${base}/${sub}/${name}`;
        entries.push({ name: path, data });
        folder.files.push({ path, sub, name, kind });
        folder.index.push({ پوشه: sub, نام: name, نوع: kind, تاریخ: U.formatSystemDate() });
      };
      if (wantText) {
        push(FOLDERS.reports, `${caseName}.txt`, recordText(section, rec), 'متن');
        push(FOLDERS.reports, `${caseName}.md`, recordMarkdown(section, rec), 'متن');
      }
      if (wantPdf) {
        push(FOLDERS.reports, `${caseName}.pdf.html`, S.reports.recordDetailHtml(section, rec), 'pdf');
        if (section.timelines.has(rec.key)) push(FOLDERS.timeline, `کارنامهٔ روند ${caseName}.pdf.html`, S.reports.recordSheetHtml(section, rec), 'pdf');
      }
      if (section.timelines.has(rec.key)) {
        const tl = section.timelines.get(rec.key);
        const a = S.reports.analyzeTimeline(tl.rows);
        push(FOLDERS.timeline, `روند ${caseName}.json`, JSON.stringify(tl.rows, null, 2), 'json');
        folder.timelineRows = [['#', 'تاریخ و ساعت', 'وضعیت پیشین', 'وضعیت جاری', 'اقدام‌کننده', 'شرح', 'ماندگاری'], ...a.steps.map((s, k) => [U.faDigits(k + 1), s.dateText, s.prev || '—', s.status, s.user || '—', s.note || '—', s.durationMs !== null ? U.formatDuration(s.durationMs) : '—'])];
      }
      push(FOLDERS.reports, `${caseName}.json`, JSON.stringify(rec.raw, null, 2), 'json');
      if (opts.withFiles !== false) {
        const files = await collectOriginalFiles(section, rec);
        for (const f of files) push(f.folder, f.name, f.bytes, 'اصل');
      }
      folders.push(folder);
    }
    const manifest = {
      نسخه: 1, شناسه: U.uid(), ساخته‌شده: U.formatSystemDate(), بخش: label, مسیر: section.path, حالت: mode,
      پوشه‌ها: folders.map((f) => ({ نام: f.name, پایه: f.base, فایل‌ها: f.files, فهرست: f.index, روند: f.timelineRows || null })),
      زیرپوشه‌ها: Object.values(FOLDERS),
    };
    entries.unshift({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
    return { entries, manifest };
  }

  /** بستهٔ گزارش کلی بخش */
  function buildReportJob(section) {
    const st = store();
    const label = st.labelFor(section.path);
    const report = S.reports.build(section, { pendingDays: st.state.settings.pendingDays, recentDays: st.state.settings.recentDays });
    const folderName = U.safeFileName(`گزارش ${label} ${U.formatSystemDate().replace(/[:\/]/g, '-')}`);
    const base = 'files/۱';
    const files = [];
    const entries = [];
    const push = (name, data, kind) => { entries.push({ name: `${base}/${FOLDERS.reports}/${name}`, data }); files.push({ path: `${base}/${FOLDERS.reports}/${name}`, sub: FOLDERS.reports, name, kind }); };
    push('گزارش رخداد و روند.pdf.html', S.reports.sectionReportHtml(report), 'pdf');
    push('گزارش رخداد و روند.md', reportMarkdown(report), 'متن');
    push('داده‌های بخش.json', JSON.stringify(section.records.map((r) => r.raw), null, 2), 'json');
    push('روندها.json', JSON.stringify([...section.timelines.entries()].map(([k, v]) => ({ رکورد: k, ردیف‌ها: v.rows })), null, 2), 'json');
    const manifest = {
      نسخه: 1, شناسه: U.uid(), ساخته‌شده: U.formatSystemDate(), بخش: label, مسیر: section.path, حالت: 'pdf+text',
      پوشه‌ها: [{ نام: folderName, پایه: base, فایل‌ها: files, فهرست: files.map((f) => ({ پوشه: f.sub, نام: f.name, نوع: f.kind, تاریخ: U.formatSystemDate() })), برگه‌ها: S.reports.excelSheets(report) }],
      زیرپوشه‌ها: Object.values(FOLDERS),
    };
    entries.unshift({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
    return { entries, manifest, report };
  }

  function reportMarkdown(report) {
    const st = store();
    const label = st.labelFor(report.section.path);
    const out = [`# گزارش رخداد و روند — ${label}`, '', `تاریخ تهیه: ${U.formatSystemDate()}`, '', `- شمار رکوردها: ${U.faDigits(report.total)}`, `- دارای روند: ${U.faDigits(report.withTimeline)}`, `- شمار رخدادها: ${U.faDigits(report.allEvents.length)}`, `- معطل: ${U.faDigits(report.pending.length)} · رویت‌نشده: ${U.faDigits(report.unseen.length)} · تازه: ${U.faDigits(report.recent.length)}`, ''];
    const cnt = (title, items) => { out.push(`## ${title}`, '', '| مورد | تعداد |', '|---|---|', ...items.map((i) => `| ${i.label} | ${U.faDigits(i.count)} |`), ''); };
    cnt('شمارش بر نوع', report.byType); cnt('شمارش بر وضعیت', report.byStatus); cnt('جریان وضعیت‌ها', report.flow);
    cnt('رخداد روزانه', report.daily); cnt('رخداد ماهانه', report.monthly); cnt('توزیع ساعتی', report.hourly);
    out.push('## مدت ماندن در هر مرحله', '', '| وضعیت | تعداد | میانگین | کمینه | بیشینه |', '|---|---|---|---|---|', ...report.stepAvg.map((r) => `| ${r.status} | ${U.faDigits(r.count)} | ${U.formatDuration(r.avgMs)} | ${U.formatDuration(r.minMs)} | ${U.formatDuration(r.maxMs)} |`), '');
    out.push('## جدول کامل رکوردها', '', ...mdTable(report.section.records.map((r) => r.flat)), '');
    if (report.allEvents.length) out.push('## جدول کامل رخدادها', '', ...mdTable(report.allEvents.map((e) => Object.assign({ پرونده: e.caseName }, e.flat))), '');
    for (const p of report.perRecord.filter((x) => x.analysis)) {
      out.push(`## خط زمانی — ${p.caseName}`, '');
      for (const s of p.analysis.steps) out.push(`- ${s.dateText} — ${s.prev && s.prev !== '—' ? s.prev + ' ← ' : ''}${s.status}${s.durationMs !== null ? ` (${s.open ? 'از این مرحله' : 'ماندگاری'}: ${U.formatDuration(s.durationMs)})` : ''}`);
      out.push('');
    }
    return out.join('\n');
  }

  /* ---------- ارسال به کانال دانلود ---------- */

  function downloadBytes(name, bytes, mime) {
    const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
    // ۱) پوستهٔ ویندوزی: مستقیم روی دیسک (بدون گذر از Downloads)
    if (S.bridge && S.bridge.available()) {
      const isJob = name.startsWith(JOB_PREFIX);
      if (isJob ? S.bridge.sendJob(name, bytes) : S.bridge.sendFile(name, bytes, mime)) return;
    }
    // ۲) پشتیبان (بدون پوسته، مثلاً در آزمون): دانلود معمولی صفحه
    anchorDownload(URL.createObjectURL(blob), name);
  }

  function anchorDownload(url, name) {
    const a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60000);
  }

  function sendJob(entries, manifest) {
    const zip = U.buildZip(entries);
    const name = `${JOB_PREFIX}${manifest.شناسه}.zip`;
    downloadBytes(name, zip, 'application/zip');
    store().addLog('ok', `بستهٔ «${manifest.بخش}» با ${U.faDigits(manifest.پوشه‌ها.length)} پوشه به پوسته/کانال دانلود فرستاده شد (${U.faDigits(Math.round(zip.length / 1024))} کیلوبایت)`);
    return name;
  }

  function downloadText(name, text, mime) { downloadBytes(name, U.utf8(text), mime || 'text/plain;charset=utf-8'); }

  /* ---------- صف هوشمند بازپخش ---------- */

  const queue = { items: [], running: false, paused: false, done: 0, failed: 0, current: null, listeners: [] };

  function qNotify() { for (const cb of queue.listeners) { try { cb(queue); } catch (e) { /* ادامه */ } } }

  /** افزودن رکوردها به صف برای گرفتن «گزارشات»/«پیوست‌ها» */
  function enqueueChildren(section, records, kind, opts) {
    opts = opts || {};
    const st = store();
    const links = st.linksFor(section.path, kind);
    if (!links.length) return 0;
    let added = 0;
    for (const rec of records) {
      const bucket = kind === 'روند' ? section.timelines : kind === 'پیوست‌ها' ? section.attachments : section.details;
      if (!opts.force && bucket.has(rec.key)) continue;
      for (const link of links) {
        const req = st.buildRequest(link, rec);
        if (!req) continue;
        if (queue.items.some((q) => q.rec === rec && q.link === link)) continue;
        queue.items.push({ section, rec, link, req, kind, tries: 0 });
        added++;
      }
    }
    if (added) runQueue();
    qNotify();
    return added;
  }

  async function runQueue() {
    if (queue.running) return;
    queue.running = true;
    qNotify();
    const st = store();
    while (queue.items.length) {
      if (queue.paused || S.hook.sessionExpired) { await U.sleep(1500); continue; }
      const item = queue.items[0];
      queue.current = item;
      qNotify();
      try {
        const res = await S.hook.replay(item.req);
        if (res.json !== undefined) st.ingestChild(item.link, item.rec, res.json);
        queue.items.shift();
        queue.done++;
      } catch (e) {
        if (e && e.code === 'SESSION_EXPIRED') {
          st.addLog('warn', 'نشست پایان یافته است؛ دوباره وارد شوید — صف از همین‌جا ادامه می‌یابد.');
          queue.paused = true;
          qNotify();
          continue;
        }
        item.tries++;
        if (item.tries >= 3) { queue.items.shift(); queue.failed++; st.addLog('err', `گرفتن ${item.kind} برای «${st.caseNameOf(item.section, item.rec)}» ناموفق: ${e.message}`); }
        else await U.sleep(2000);
      }
      await U.sleep(st.state.settings.delayMs);
    }
    queue.current = null;
    queue.running = false;
    qNotify();
  }

  function resumeQueue() { queue.paused = false; qNotify(); if (queue.items.length) runQueue(); }
  function pauseQueue() { queue.paused = true; qNotify(); }
  function clearQueue() { queue.items.length = 0; qNotify(); }

  S.exporter = {
    FOLDERS, JOB_PREFIX, recordText, recordMarkdown, reportMarkdown, collectOriginalFiles, buildJob, buildReportJob, sendJob, downloadBytes, downloadText,
    queue, enqueueChildren, resumeQueue, pauseQueue, clearQueue, onQueue: (cb) => queue.listeners.push(cb),
  };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
