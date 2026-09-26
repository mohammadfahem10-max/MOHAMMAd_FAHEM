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
    const L = (k) => st.fieldLabel(section, k);
    const lines = [`${label}`, `پرونده: ${caseName}`, `تاریخ استخراج: ${U.formatSystemDate()}`, ''];
    for (const [k, v] of Object.entries(rec.flat)) {
      if (k.endsWith('[]')) { lines.push(`${L(k)}:`); for (const row of v) lines.push('  - ' + Object.entries(U.flatten(row)).map(([a, b]) => `${L(a)}: ${U.formatValue(b)}`).join(' | ')); }
      else lines.push(`${L(k)}: ${U.formatValue(v)}`);
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
    const L = (k) => st.fieldLabel(section, k);
    for (const [k, v] of Object.entries(rec.flat)) if (!k.endsWith('[]')) out.push(`| ${cell(L(k))} | ${cell(U.formatValue(v))} |`);
    for (const [k, v] of Object.entries(rec.flat)) if (k.endsWith('[]') && v.length) { out.push('', `## ${L(k)}`, ''); out.push(...mdTable(v.map((r) => U.flatten(r)), L)); }
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

  function mdTable(flats, L) {
    const cols = [];
    const seen = new Set();
    for (const f of flats) for (const k of Object.keys(f)) if (!k.endsWith('[]') && !seen.has(k)) { seen.add(k); cols.push(k); }
    const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    return ['| ' + cols.map((c) => cell(L ? L(c) : c)).join(' | ') + ' |', '|' + cols.map(() => '---').join('|') + '|', ...flats.map((f) => '| ' + cols.map((c) => cell(U.formatValue(f[c]))).join(' | ') + ' |')];
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
    // فایل‌های رسمی گرفته‌شده از نقشهٔ سایت (مثلاً تصویر اجرائیه/ابلاغیه) — عین اصل
    for (const key of rec.files || []) {
      const f = st.state.files.get(key);
      if (f && f.bytes) { out.push({ name: uniqueName(f.fileName), bytes: f.bytes, folder: FOLDERS.docs, original: true }); if (onProgress) onProgress(out.length); }
    }
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

  /* ---------- بستهٔ پرونده‌های اجرایی: هر پرونده یک پوشه با همهٔ مدارک، فایل‌های رسمی، رخدادها و کارنامه ---------- */

  function caseMarkdown(caseRec, dossier) {
    const st = store();
    const casesSec = st.state.sections.get('/executive/getallcases');
    const L = (k) => st.fieldLabel(casesSec, k), LD = (k) => st.fieldLabel('/executive/documents', k);
    const cell = (x) => String(x).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const out = [`# ${st.caseNameOf(casesSec, caseRec)}`, '', `**واحد اجرا:** ${U.formatValue(caseRec.flat.unitName)}  `, `**وضعیت پرونده:** ${U.formatValue(caseRec.flat.caseState)}  `, `**تاریخ استخراج:** ${U.formatSystemDate()}`, '', '## مشخصات پرونده', '', '| فیلد | مقدار |', '|---|---|'];
    for (const [k, v] of Object.entries(caseRec.flat)) out.push(`| ${cell(L(k))} | ${cell(U.formatValue(v))} |`);
    out.push('', `## مدارک (${U.faDigits(dossier.items.length)})`, '', '| # | نوع مدرک | شمارهٔ مدرک | وضعیت پیشین | وضعیت جاری | آخرین تغییر | رخدادها |', '|---|---|---|---|---|---|---|');
    dossier.items.forEach((it, i) => { const f = it.rec.flat; out.push(`| ${U.faDigits(i + 1)} | ${cell(U.formatValue(f.documentTypeName))} | ${cell(U.formatValue(f.documentNo))} | ${cell(U.formatValue(f.previousState))} | ${cell(U.formatValue(f.currentState))} | ${cell(U.formatValue(f.lastChange))} | ${U.faDigits(f.eventCount || 0)} |`); });
    for (const it of dossier.items) {
      if (!it.analysis || !it.analysis.steps.length) continue;
      out.push('', `### ${U.formatValue(it.rec.flat.documentTypeName)} ${it.rec.flat.documentNo ? U.faDigits(it.rec.flat.documentNo) : ''}`.trim(), '', '| تاریخ و ساعت | وضعیت پیشین | وضعیت جاری | ماندگاری |', '|---|---|---|---|');
      for (const s of it.analysis.steps) out.push(`| ${cell(s.dateText)} | ${cell(s.prev || '—')} | ${cell(s.status)} | ${s.durationMs !== null ? U.formatDuration(s.durationMs) : '—'} |`);
    }
    return out.join('\n') + '\n';
  }

  function caseText(caseRec, dossier) {
    const st = store();
    const lines = [st.caseNameOf(st.state.sections.get('/executive/getallcases'), caseRec), `واحد اجرا: ${U.formatValue(caseRec.flat.unitName)}`, `وضعیت پرونده: ${U.formatValue(caseRec.flat.caseState)}`, `تاریخ استخراج: ${U.formatSystemDate()}`, ''];
    for (const it of dossier.items) {
      const f = it.rec.flat;
      lines.push(`— ${U.formatValue(f.documentTypeName)} ${f.documentNo ? U.faDigits(f.documentNo) : ''} | وضعیت جاری: ${U.formatValue(f.currentState)} | آخرین تغییر: ${U.formatValue(f.lastChange)}`);
      if (it.analysis) for (const s of it.analysis.steps) lines.push(`    ${s.dateText} | ${s.prev && s.prev !== '—' ? s.prev + ' ← ' : ''}${s.status}${s.durationMs !== null ? ' | ' + (s.open ? 'از این مرحله: ' : 'ماندگاری: ') + U.formatDuration(s.durationMs) : ''}`);
    }
    return lines.join('\n') + '\n';
  }

  /** cases: رکوردهای بخش پرونده‌های اجرایی؛ mode: pdf+text | pdf | text */
  async function buildExecutiveJob(cases, mode, opts) {
    opts = opts || {};
    const st = store();
    const casesSec = st.state.sections.get('/executive/getallcases');
    const wantPdf = mode !== 'text', wantText = mode !== 'pdf';
    const entries = [];
    const folders = [];
    let i = 0;
    for (const caseRec of cases) {
      i++;
      if (opts.onProgress) opts.onProgress({ index: i, total: cases.length, rec: caseRec });
      const d = S.reports.caseDossier(caseRec);
      const name = st.caseNameOf(casesSec, caseRec);
      const base = `files/${U.faDigits(i)}`;
      const folder = { name, base, files: [], index: [] };
      const used = new Set();
      const uniq = (nm) => { let x = U.safeFileName(nm, 'فایل'); const dot = x.lastIndexOf('.'); const b = dot > 0 ? x.slice(0, dot) : x, e = dot > 0 ? x.slice(dot) : ''; let k = 2; while (used.has(x)) x = `${b} (${U.faDigits(k++)})${e}`; used.add(x); return x; };
      const push = (sub, nm, data, kind) => { const fname = uniq(nm); const path = `${base}/${sub}/${fname}`; entries.push({ name: path, data }); folder.files.push({ path, sub, name: fname, kind }); folder.index.push({ پوشه: sub, نام: fname, نوع: kind, تاریخ: U.formatSystemDate() }); };
      if (wantText) { push(FOLDERS.reports, `${name}.md`, caseMarkdown(caseRec, d), 'متن'); push(FOLDERS.reports, `${name}.txt`, caseText(caseRec, d), 'متن'); }
      if (wantPdf) push(FOLDERS.reports, `کارنامهٔ روند ${name}.pdf.html`, S.reports.caseSheetHtml(caseRec), 'pdf');
      push(FOLDERS.reports, `${name}.json`, JSON.stringify({ پرونده: caseRec.raw, مدارک: d.items.map((it) => ({ مدرک: it.rec.raw, رخدادها: (d.docsSection.timelines.get(it.rec.key) || { rows: [] }).rows, گزارش‌ها: it.reports, پیوست‌ها: it.attachments })) }, null, 2), 'json');
      const tlRows = [['مدرک', 'شمارهٔ مدرک', 'تاریخ و ساعت', 'وضعیت پیشین', 'وضعیت جاری', 'ماندگاری']];
      for (const it of d.items) {
        const f = it.rec.flat;
        if (it.analysis) for (const s of it.analysis.steps) tlRows.push([U.formatValue(f.documentTypeName), U.formatValue(f.documentNo), s.dateText, s.prev || '—', s.status, s.durationMs !== null ? U.formatDuration(s.durationMs) : '—']);
        for (const file of it.files) if (file.bytes) push(FOLDERS.docs, file.fileName, file.bytes, 'اصل');
        if (opts.withFiles !== false) { const extra = await collectOriginalFiles(d.docsSection, it.rec); for (const x of extra) if (!(it.files || []).some((ff) => ff.fileName === x.name)) push(x.folder, x.name, x.bytes, 'اصل'); }
      }
      folder.timelineRows = tlRows;
      folder.sheets = [{ name: 'مدارک', rows: [['#', 'نوع مدرک', 'شمارهٔ مدرک', 'وضعیت پیشین', 'وضعیت جاری', 'آخرین تغییر', 'رخدادها'], ...d.items.map((it, k) => [U.faDigits(k + 1), U.formatValue(it.rec.flat.documentTypeName), U.formatValue(it.rec.flat.documentNo), U.formatValue(it.rec.flat.previousState), U.formatValue(it.rec.flat.currentState), U.formatValue(it.rec.flat.lastChange), U.faDigits(it.rec.flat.eventCount || 0)])] }];
      folders.push(folder);
    }
    const manifest = {
      نسخه: 1, شناسه: U.uid(), ساخته‌شده: U.formatSystemDate(), بخش: 'پرونده‌های اجرایی', مسیر: '/executive/getallcases', حالت: mode,
      پوشه‌ها: folders.map((f) => ({ نام: f.name, پایه: f.base, فایل‌ها: f.files, فهرست: f.index, روند: f.timelineRows || null, برگه‌ها: f.sheets || [] })),
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

  /* ---------- صف هوشمند بازپخش با سرعت تطبیقی (بخش ۱۰ دستور کار) ----------
     بیشینهٔ ایمن، بی دکمهٔ دستی: با پاسخ‌های سالم پیاپی فاصله کم و هم‌زمانی زیاد می‌شود؛ با نخستین نشانهٔ فشار
     (۴۲۹/۴۰۳/صفحهٔ محافظ/کندی) فوراً عقب می‌کشد (backoff) و دوباره آرام بالا می‌آید. هیچ محافظی دور زده نمی‌شود. */

  const queue = { items: [], running: false, paused: false, done: 0, failed: 0, current: null, listeners: [], workers: 0,
    rate: { delayMs: 800, concurrency: 1, streak: 0, backoffUntil: 0, minDelay: 150, maxDelay: 15000, maxConcurrency: 3, lastSignal: '' } };

  function qNotify() { for (const cb of queue.listeners) { try { cb(queue); } catch (e) { /* ادامه */ } } }

  function rateOk(elapsedMs) {
    const r = queue.rate;
    r.streak++;
    if (elapsedMs > 6000) { r.delayMs = Math.min(r.maxDelay, Math.round(r.delayMs * 1.5)); r.streak = 0; r.lastSignal = 'کندی'; return; }
    if (r.streak >= 5) { r.streak = 0; r.delayMs = Math.max(r.minDelay, Math.round(r.delayMs * 0.75)); if (r.delayMs <= 400 && r.concurrency < r.maxConcurrency) r.concurrency++; r.lastSignal = ''; }
  }
  function rateBackoff(signal) {
    const r = queue.rate;
    r.streak = 0;
    r.concurrency = 1;
    r.delayMs = Math.min(r.maxDelay, Math.max(r.delayMs * 2.5, 2000));
    r.backoffUntil = Date.now() + (signal === 'محافظ' ? 60000 : 20000);
    r.lastSignal = signal;
    store().addLog('warn', `نشانهٔ فشار سایت (${signal}) — سرعت کم شد و ${U.faDigits(Math.round((r.backoffUntil - Date.now()) / 1000))} ثانیه صبر می‌کنیم.`);
  }
  function isPressure(e) {
    if (!e) return null;
    if (e.status === 429) return '۴۲۹';
    if (e.status === 403) return '۴۰۳';
    if (e.status === 503) return '۵۰۳';
    if (/محافظ|captcha|blocked|too many|rate/i.test(String(e.message))) return 'محافظ';
    return null;
  }

  /** افزودن رکوردها به صف برای گرفتن «گزارشات»/«پیوست‌ها» — ادامه از نقطهٔ توقف: آنچه گرفته شده دوباره در صف نمی‌رود */
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
        queue.items.push({ section, rec, link, req, kind, tries: 0, busy: false });
        added++;
      }
    }
    if (added) runQueue();
    qNotify();
    return added;
  }

  /** صف بخش‌های شناخته‌شده (نقشهٔ سایت): گزارش‌ها/پیوست‌های هر مدرک و سپس فایل هر گزارش — ادامه از نقطهٔ توقف */
  function enqueueTyped(section, records, stage, opts) {
    opts = opts || {};
    const sec = S.siteMap && S.siteMap.sectionFor(section.path);
    if (!sec) return 0;
    let added = 0;
    const push = (rec, req, kind, tag) => {
      if (queue.items.some((q) => q.rec === rec && q.tag === tag)) return;
      queue.items.push({ section, rec, link: null, req, kind, tag, typed: true, tries: 0, busy: false });
      added++;
    };
    if (stage === 'فایل') {
      const fo = sec.fileOf;
      if (!fo) return 0;
      for (const rec of records) {
        const det = section.details.get(rec.key);
        const rows = det && det.kind === 'گزارش‌ها' ? det.rows : [];
        rows.forEach((row, i) => {
          const code = row.reportTypeCode || String(i + 1);
          if (!opts.force && rec.files && rec.files.includes(`file:${rec.key}:${code}`)) return;
          const body = S.siteMap.fill(fo.body, rec.flat, { reportTypeCode: code, reportCommand: row.reportCommand === null || row.reportCommand === undefined ? 'null' : row.reportCommand });
          push(rec, { method: fo.method, url: new URL(fo.path, siteOrigin()).href, headers: {}, body }, 'فایل', 'file:' + code);
        });
      }
    } else {
      for (const ch of sec.children || []) {
        if (stage && ch.kind !== stage) continue;
        for (const rec of records) {
          const bucket = ch.kind === 'پیوست‌ها' ? section.attachments : section.details;
          if (!opts.force && bucket.has(rec.key)) continue;
          push(rec, { method: ch.method, url: new URL(ch.path, siteOrigin()).href, headers: {}, body: S.siteMap.fill(ch.body, rec.flat) }, ch.kind, 'child:' + ch.kind);
        }
      }
    }
    if (added) runQueue();
    qNotify();
    return added;
  }

  function siteOrigin() {
    const s = store().state.siteOrigin;
    if (s) return s;
    for (const sec of store().state.sections.values()) if (sec.request && sec.request.url) { try { return new URL(sec.request.url).origin; } catch (e) { /* ادامه */ } }
    return 'https://my.ssaa.ir';
  }

  function nextItem() { return queue.items.find((q) => !q.busy) || null; }

  async function worker() {
    const st = store();
    queue.workers++;
    try {
      while (true) {
        if (queue.paused || S.hook.sessionExpired) { await U.sleep(1500); if (!queue.items.length) break; continue; }
        if (Date.now() < queue.rate.backoffUntil) { await U.sleep(1000); continue; }
        if (queue.workers > queue.rate.concurrency) break;   // هم‌زمانی کم شده؛ این کارگر می‌رود
        const item = nextItem();
        if (!item) break;
        item.busy = true;
        queue.current = item;
        qNotify();
        const t0 = Date.now();
        try {
          const res = await S.hook.replay(item.req);
          if (res.json !== undefined) {
            const cap = { method: item.req.method, url: item.req.url, path: S.hook.pathKey(item.req.url), status: res.status, json: res.json, ts: Date.now(), requestHeaders: item.req.headers || {}, requestBody: item.req.body ?? null, contentType: res.contentType };
            if (item.typed || (S.siteMap && S.siteMap.CHILD_PATHS.test(cap.path))) st.ingest(cap);
            else st.ingestChild(item.link, item.rec, res.json);
          } else if (res.bytes) {
            st.ingestFile({ method: item.req.method, url: item.req.url, path: S.hook.pathKey(item.req.url), status: res.status, bytes: res.bytes, contentType: res.contentType, fileName: res.fileName, requestHeaders: item.req.headers || {}, requestBody: item.req.body ?? null, ts: Date.now() });
          }
          queue.items.splice(queue.items.indexOf(item), 1);
          queue.done++;
          rateOk(Date.now() - t0);
        } catch (e) {
          item.busy = false;
          if (e && e.code === 'SESSION_EXPIRED') {
            st.addLog('warn', 'نشست پایان یافته است؛ دوباره وارد شوید — صف از همین رکورد ادامه می‌یابد.');
            queue.paused = true; qNotify(); continue;
          }
          const sig = isPressure(e);
          if (sig) { rateBackoff(sig); continue; }
          item.tries++;
          if (item.tries >= 3) { queue.items.splice(queue.items.indexOf(item), 1); queue.failed++; st.addLog('err', `گرفتن ${item.kind} برای «${st.caseNameOf(item.section, item.rec)}» ناموفق: ${e.message}`); }
          else await U.sleep(2000);
        }
        await U.sleep(queue.rate.delayMs);
        // با بالا رفتن هم‌زمانی، کارگر تازه اضافه کن
        if (queue.workers < queue.rate.concurrency && nextItem()) worker();
      }
    } finally {
      queue.workers--;
      if (queue.workers === 0) { queue.current = null; queue.running = false; qNotify(); }
    }
  }

  function runQueue() {
    if (queue.running) return;
    queue.running = true;
    const base = store().state.settings.delayMs;
    if (base && queue.done === 0) queue.rate.delayMs = base;
    qNotify();
    worker();
  }

  function resumeQueue() { queue.paused = false; queue.rate.backoffUntil = 0; qNotify(); if (queue.items.length) runQueue(); }
  function pauseQueue() { queue.paused = true; qNotify(); }
  function clearQueue() { queue.items.length = 0; qNotify(); }

  S.exporter = {
    FOLDERS, JOB_PREFIX, recordText, recordMarkdown, reportMarkdown, collectOriginalFiles, buildJob, buildExecutiveJob, caseMarkdown, buildReportJob, sendJob, downloadBytes, downloadText,
    queue, enqueueChildren, enqueueTyped, siteOrigin, resumeQueue, pauseQueue, clearQueue, onQueue: (cb) => queue.listeners.push(cb),
  };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
