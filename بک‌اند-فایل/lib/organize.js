/* مرتب‌سازی بستهٔ کار (zip از کانال دانلود) در پوشهٔ مقصد کاربر:
   <مقصد>/<بخش>/<نام پرونده>/{۱ اسناد، ۲ پیوست‌ها، ۳ روند و رخدادها، ۴ گزارش‌ها} + فهرست.xlsx
   فایل اصل دست‌نخورده نوشته می‌شود؛ برگه‌های .pdf.html با موتور مرورگر به PDF چاپ می‌شوند. */
'use strict';
const fs = require('fs');
const path = require('path');
const zip = require('./zip');
const xlsx = require('./xlsx');
const pdf = require('./pdf');
const tiff = require('./tiff');

const SUBFOLDERS = ['۱ اسناد', '۲ پیوست‌ها', '۳ روند و رخدادها', '۴ گزارش‌ها'];
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (s) => String(s).replace(/[0-9]/g, (d) => FA[+d]);

function safeName(name, fallback) {
  let s = String(name ?? '').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').replace(/\.+$/g, '').trim();
  if (!s) s = fallback || 'بدون-نام';
  return s.length > 150 ? s.slice(0, 150) : s;
}

/** مسیر یکتا: اگر فایل با همان محتوا هست، همان؛ وگرنه «نام (۲).ext» */
function uniquePath(dir, name, data) {
  let p = path.join(dir, name);
  if (!fs.existsSync(p)) return p;
  if (data && fs.statSync(p).size === data.length && fs.readFileSync(p).equals(data)) return null; // یکسان؛ نیازی به نوشتن نیست
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; i < 1000; i++) {
    p = path.join(dir, `${base} (${fa(i)})${ext}`);
    if (!fs.existsSync(p)) return p;
  }
  throw new Error('نام یکتا پیدا نشد: ' + name);
}

function writeFile(dir, name, data) {
  fs.mkdirSync(dir, { recursive: true });
  const p = uniquePath(dir, name, data);
  if (p === null) return path.join(dir, name);
  fs.writeFileSync(p, data);
  return p;
}

/**
 * پردازش یک بستهٔ zip. opts: {dest, fontDir, browser, log(level,text), tmpDir}
 * خروجی: {folders:[{path, files, pdfOk, pdfFail}], manifest}
 */
async function processJob(zipPath, opts) {
  const log = opts.log || (() => {});
  const buf = fs.readFileSync(zipPath);
  const entries = zip.read(buf);
  const byName = new Map(entries.map((e) => [e.name, e.data]));
  const mf = byName.get('manifest.json');
  if (!mf) throw new Error('manifest.json در بسته نیست');
  const manifest = JSON.parse(mf.toString('utf8'));
  const sectionDir = path.join(opts.dest, safeName(manifest['بخش'] || 'بخش'));
  const result = { folders: [], manifest };

  for (const folder of manifest['پوشه‌ها'] || []) {
    const caseDir = path.join(sectionDir, safeName(folder['نام'], 'پرونده'));
    for (const sub of SUBFOLDERS) fs.mkdirSync(path.join(caseDir, sub), { recursive: true });
    const info = { path: caseDir, files: [], pdfOk: 0, pdfFail: 0 };
    const indexRows = [['پوشه', 'نام فایل', 'نوع', 'تاریخ استخراج', 'وضعیت']];
    for (const f of folder['فایل‌ها'] || []) {
      const data = byName.get(f.path);
      if (!data) { log('warn', `در بسته نبود: ${f.path}`); continue; }
      const sub = SUBFOLDERS.includes(f.sub) ? f.sub : SUBFOLDERS[3];
      const dir = path.join(caseDir, sub);
      let status = 'نوشته شد';
      let finalName = f.name;
      if (f.kind === 'pdf' && /\.pdf\.html$/i.test(f.name)) {
        finalName = f.name.replace(/\.pdf\.html$/i, '.pdf');
        const out = uniquePath(dir, finalName, null);
        try {
          fs.mkdirSync(dir, { recursive: true });
          await pdf.htmlToPdf(data.toString('utf8'), out, { fontDir: opts.fontDir, browser: opts.browser, tmpDir: opts.tmpDir });
          info.pdfOk++;
          info.files.push(out);
        } catch (e) {
          info.pdfFail++;
          status = 'PDF ساخته نشد؛ HTML نگه داشته شد';
          finalName = f.name.replace(/\.pdf\.html$/i, '.html');
          const fallback = writeFile(dir, finalName, Buffer.from(data.toString('utf8').replace(pdf.FONT_MARK, pdf.fontCss(opts.fontDir || '')), 'utf8'));
          info.files.push(fallback);
          log('err', `چاپ PDF «${finalName}»: ${e.message}`);
        }
      } else {
        const p = writeFile(dir, f.name, data);
        info.files.push(p);
        // تصویر TIFF رسمی (اجرائیه/ابلاغیه) → نسخهٔ PDF خوانا کنار اصل (اصل دست‌نخورده می‌ماند)
        if (/\.tiff?$/i.test(f.name) && manifest['حالت'] !== 'text') {
          const pdfName = f.name.replace(/\.tiff?$/i, '.pdf');
          const out = uniquePath(dir, pdfName, null);
          try {
            await tiff.toPdf(p, out, { fontDir: opts.fontDir, browser: opts.browser, tmpDir: opts.tmpDir });
            info.pdfOk++; info.files.push(out);
            indexRows.push([sub, path.basename(out), 'pdf', manifest['ساخته‌شده'] || '', 'از تصویر TIFF ساخته شد']);
          } catch (e) { info.pdfFail++; log('warn', `PDF از TIFF «${f.name}» ساخته نشد: ${e.message}`); }
        }
      }
      indexRows.push([sub, finalName, f.kind || '', (folder['فهرست'] || []).find((x) => x['نام'] === f.name)?.['تاریخ'] || manifest['ساخته‌شده'] || '', status]);
    }
    const sheets = [{ name: 'فهرست', rows: indexRows }];
    if (folder['روند']) sheets.push({ name: 'روند', rows: folder['روند'] });
    for (const s of folder['برگه‌ها'] || []) sheets.push(s);
    fs.writeFileSync(path.join(caseDir, 'فهرست.xlsx'), xlsx.build(sheets));
    result.folders.push(info);
    log('ok', `پوشهٔ «${path.basename(caseDir)}» آماده شد: ${fa(info.files.length)} فایل${info.pdfFail ? `، ${fa(info.pdfFail)} PDF ناموفق` : ''}`);
  }
  return result;
}

module.exports = { processJob, SUBFOLDERS, safeName, uniquePath };
