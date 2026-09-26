"""Build a template library from a font file (.ttf/.otf) and a word list.

If the office's font is known (B Nazanin, B Lotus, Tahoma, ...), every PAW
shape can be rendered directly from the font at the sizes used in the
documents. Each word is rendered alone; its PAWs are found by the same
segmentation as scans and labelled by splitting the word with the Persian
joining rules. When the number of rendered PAWs and expected PAWs differ,
the word is skipped rather than guessed.
"""
from __future__ import annotations

import os

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .library import Library
from .preprocess import binarize
from .segment import segment_page
from .textnorm import PERSIAN_DIGITS, is_ltr_char, normalize

# letters that never join to the following letter
NON_JOINERS = set("اآأإدذرزژوؤء")
ZWNJ = "‌"

DEFAULT_WORDS = (
    "بسمه تعالی شماره تاریخ نامه پرونده صفحه از اداره کل ثبت اسناد و املاک استان تهران اهواز خوزستان "
    "به با در که این آن را برای است می شود باشد گردد نماید نمایند مورخ موضوع خصوص پیرو عطف بازگشت احتراما "
    "خواهشمند دستور فرمایید اقدام لازم مقتضی اعلام ارسال دریافت پرداخت مبلغ ریال تومان وجه حساب سپرده بانک شعبه "
    "قرارداد طرفین ماده تبصره بند متعهد متعهدین جاعل ضامن وثیقه رهن ملک پلاک ثبتی فرعی اصلی بخش ناحیه حوزه قطعه "
    "مساحت متر مربع مالکیت مالک سند دفترخانه دفتر رسمی شهر شهرستان خیابان کوچه کدپستی تلفن همراه پست الکترونیک "
    "نام نام‌خانوادگی فرزند کد ملی شناسنامه صادره متولد نشانی آقای خانم شرکت سهامی خاص عام مدیرعامل هیئت مدیره "
    "دادگستری دادگاه دادسرا شعبه بازپرسی قاضی ابلاغیه ابلاغ اخطاریه احضاریه خواهان خوانده متهم شاکی وکیل دادخواست "
    "شکایت رای حکم قرار اجرا اجرای احکام بازداشت توقیف مزایده کارشناس کارشناسی هزینه دادرسی مهلت روز هفته ماه سال "
    "جلسه رسیدگی حضور محل ساعت علت کیفیت امر تنظیم بایگانی سامانه الکترونیکی ثنا مراجعه نوبت "
    "واریز برداشت مانده کارمزد چک برگشتی گواهینامه عدم صدور چاپ توضیحات یادداشت قبض جمع کل"
).split()


def split_paws(word: str) -> list[str]:
    """Split a Persian word into PAWs (right-to-left order) by joining rules."""
    word = word.replace(ZWNJ, " ")
    paws: list[str] = []
    for part in word.split():
        cur = ""
        for ch in part:
            cur += ch
            if ch in NON_JOINERS:
                paws.append(cur)
                cur = ""
        if cur:
            paws.append(cur)
    return paws


def render_word(font: ImageFont.FreeTypeFont, word: str, pad: int = 20) -> np.ndarray:
    """Render one word with proper shaping (Pillow + libraqm) -> gray image."""
    try:
        bbox = font.getbbox(word, direction="rtl", language="fa")
    except (OSError, ValueError, KeyError):
        bbox = font.getbbox(word)
    w = bbox[2] - bbox[0] + 2 * pad
    h = bbox[3] - bbox[1] + 2 * pad
    img = Image.new("L", (max(4, w), max(4, h)), 255)
    draw = ImageDraw.Draw(img)
    try:
        draw.text((pad - bbox[0], pad - bbox[1]), word, font=font, fill=0, direction="rtl", language="fa")
    except (OSError, ValueError, KeyError):
        draw.text((pad - bbox[0], pad - bbox[1]), word, font=font, fill=0)
    return np.array(img)


def bootstrap_from_font(font_path: str, library: Library, sizes_px: list[int], words: list[str] | None = None,
                        digits: bool = True, upscale: int = 1) -> dict:
    """Render ``words`` at each pixel size and add their PAWs to the library.

    ``sizes_px``: font pixel sizes. Templates are stored relative to the line
    x-height, so two or three sizes are enough for one document family.
    ``upscale``: render small and enlarge (e.g. size 12, upscale 4) to mimic
    documents that were produced at low resolution and then scanned or
    enlarged; the blobby pixel look of such scans is reproduced that way.
    """
    words = list(words or DEFAULT_WORDS)
    if digits:
        words += list("0123456789") + list(PERSIAN_DIGITS) + ["1403/11/29", "1404/01/01", "12,345,678", "09123456789", "10:30"]
    added = skipped = 0
    for size in sizes_px:
        font = ImageFont.truetype(font_path, size)
        for word in words:
            word = normalize(word)
            gray = render_word(font, word)
            if upscale > 1:
                gray = cv2.resize(gray, None, fx=upscale, fy=upscale, interpolation=cv2.INTER_LINEAR)
            binary = binarize(gray, 300)
            lines = segment_page(binary, 300, word_gap_ratio=100.0)
            if len(lines) != 1:
                skipped += 1
                continue
            ln = lines[0]
            if all(is_ltr_char(c) or c in ",./:-" for c in word):
                expected = list(word)                       # LTR: one glyph per char, left to right
                paws = sorted(ln.paws, key=lambda p: p.x0)
            else:
                expected = split_paws(word)
                paws = ln.paws                              # already right-to-left
            if len(paws) != len(expected):
                skipped += 1
                continue
            for paw, label in zip(paws, expected):
                if library.add(label, paw.image, ln.x_height, ln.baseline, paw.y0, paw.y1,
                               source=f"font:{os.path.basename(font_path)}@{size}") is not None:
                    added += 1
    library.save()
    return {"added": added, "skipped_words": skipped, "total": len(library.templates)}
