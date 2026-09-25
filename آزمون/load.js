/* بارگذاری هسته‌های رابط در Node برای آزمون واحد (بدون مرورگر): یک window ساختگی مشترک. */
'use strict';
const path = require('path');
const { CORE_ORDER } = require('../ابزار/build.js');

function load() {
  global.window = global.window || {};
  global.window.SabtMan = {};
  for (const f of CORE_ORDER) { delete require.cache[require.resolve(f)]; require(f); }
  const S = global.window.SabtMan;
  S.official = S.official || require(path.join(__dirname, '..', 'گزارش‌ها', 'official.js'));
  return S;
}

module.exports = { load };
