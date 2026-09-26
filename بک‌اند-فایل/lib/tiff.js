/* تبدیل تصویر TIFF (مثلاً اجرائیه/ابلاغیهٔ سامانهٔ ثبت که به‌صورت ImageTiff می‌آید) به PDF خوانا.
   فایل اصل TIFF دست‌نخورده می‌ماند (قانون ۷۱)؛ PDF نسخهٔ کمکی است.
   روش: صفحه‌های TIFF با GDI+ خودِ ویندوز (System.Drawing از راه PowerShell) به PNG می‌شوند و با موتور مرورگر به PDF چاپ می‌شوند. */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const pdf = require('./pdf');

const PS = `
param([string]$In, [string]$OutDir)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($In)
try {
  $fd = [System.Drawing.Imaging.FrameDimension]::Page
  $n = 1
  try { $n = $img.GetFrameCount($fd) } catch { $n = 1 }
  for ($i = 0; $i -lt $n; $i++) {
    if ($n -gt 1) { [void]$img.SelectActiveFrame($fd, $i) }
    $out = Join-Path $OutDir ("page-" + ($i + 1).ToString("000") + ".png")
    $bmp = New-Object System.Drawing.Bitmap $img
    try { $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png) } finally { $bmp.Dispose() }
    Write-Output $out
  }
} finally { $img.Dispose() }
`;

function run(exe, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(exe, args, { timeout: timeoutMs || 120000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr || '').slice(0, 800) })); else resolve(String(stdout || ''));
    });
  });
}

/** TIFF → PNG صفحه‌ها (فقط ویندوز). خروجی: مسیر PNGها */
async function toPngPages(tifPath, outDir) {
  if (process.platform !== 'win32') throw new Error('تبدیل TIFF فقط روی ویندوز (GDI+) انجام می‌شود.');
  fs.mkdirSync(outDir, { recursive: true });
  const ps1 = path.join(outDir, 'tiff2png.ps1');
  fs.writeFileSync(ps1, '﻿' + PS, 'utf8');
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-In', tifPath, '-OutDir', outDir]);
  const pages = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => /\.png$/i.test(l) && fs.existsSync(l));
  if (!pages.length) throw new Error('هیچ صفحه‌ای از TIFF خوانده نشد.');
  return pages;
}

/** TIFF → PDF (A4، هر صفحهٔ تصویر یک برگ). opts: {tmpDir, fontDir, browser} */
async function toPdf(tifPath, outPdf, opts) {
  opts = opts || {};
  const work = fs.mkdtempSync(path.join(opts.tmpDir || os.tmpdir(), 'tif-'));
  try {
    const pages = await toPngPages(tifPath, work);
    const imgs = pages.map((p) => `<div class="pg"><img src="data:image/png;base64,${fs.readFileSync(p).toString('base64')}"></div>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:8mm}html,body{margin:0;padding:0}.pg{page-break-after:always;break-after:page;display:flex;align-items:flex-start;justify-content:center}.pg:last-child{page-break-after:auto;break-after:auto}img{max-width:100%;max-height:277mm;object-fit:contain}</style></head><body>${imgs}</body></html>`;
    await pdf.htmlToPdf(html, outPdf, { fontDir: opts.fontDir, browser: opts.browser, tmpDir: opts.tmpDir });
    return { pdf: outPdf, pages: pages.length };
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* موقت */ }
  }
}

module.exports = { toPngPages, toPdf };
