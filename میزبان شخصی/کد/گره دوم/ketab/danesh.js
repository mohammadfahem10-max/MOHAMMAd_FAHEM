/* جانشین danesh.js روی گره دوم (۱۴۰۵/۰۷/۰۵): پایگاه دانش به دستور کارفرما با کتابخانه یکی شده و مدل معنایی
   محلی جدا نیست — بردارها با llama همین گره از راه کارگر 8800 ساخته می‌شود (g2Bordarha در ketabkhane.js). */
module.exports = {
  startEmb: async () => false,
  bordarha: async () => { throw new Error('مدل معنایی محلی در گره دوم نیست؛ بردار از کارگر 8800'); },
  bebarSatl(){},
  azKetabkhane: null,
  bordarAzKetabkhane: null
};
