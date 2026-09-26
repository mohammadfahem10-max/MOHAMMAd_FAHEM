"""Numbers, dates and amounts: decomposition of touching digits and validation.

Dates and amounts are where a single wrong digit matters most, so they get
their own treatment:
  * a shape that did not match as a whole is tried as a left-to-right
    sequence of single digit / punctuation templates
  * every number in the output is classified (Jalali date, amount, national
    id, phone, plain number) and checked for plausibility
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import cv2
import numpy as np

from .library import Library, Match, NORM_H, _soft_dice, normalize_bitmap
from .textnorm import PERSIAN_DIGITS, ARABIC_DIGITS

DIGIT_LABELS = set("0123456789") | set(PERSIAN_DIGITS) | set(ARABIC_DIGITS)
SEQ_LABELS = DIGIT_LABELS | set(",./:-")


MIN_DIGIT_COVERAGE = 8   # do not decompose numbers with an alphabet missing more than two digits


def decompose_sequence(library: Library, img: np.ndarray, x_height: int, baseline: int, y0: int, y1: int,
                       min_piece: float = 0.95) -> tuple[str, float] | None:
    """Try to read ``img`` as touching digits/punctuation, left to right.

    Greedy: at the current left edge, try every single-character template
    whose expected width (from rel_w * x_height) fits; take the best overlap
    and advance. Succeeds only when every piece scores >= min_piece.
    """
    singles = [t for t in library.templates if t.label in SEQ_LABELS and len(t.label) == 1]
    digit_cov = len({t.label for t in singles if t.label in DIGIT_LABELS})
    if not singles or digit_cov < MIN_DIGIT_COVERAGE:
        return None
    h, w = img.shape[:2]
    cols = img.any(axis=0)
    x = int(np.argmax(cols)) if cols.any() else 0
    x_end = w - int(np.argmax(cols[::-1]))
    out, scores, steps = [], [], 0
    while x < x_end - 1 and steps < 40:
        steps += 1
        best = None
        for t in singles:
            tw = int(round(t.rel_w * x_height))
            if tw < 2 or x + tw > w + 2:
                continue
            seg = img[:, x:min(w, x + tw)]
            rows = np.where(seg.any(axis=1))[0]
            if len(rows) == 0:
                continue
            crop = seg[rows[0]:rows[-1] + 1]
            rel_h = crop.shape[0] / x_height
            if abs(rel_h - t.rel_h) > 0.3 * max(rel_h, t.rel_h):
                continue
            norm = normalize_bitmap(crop)
            a = cv2.resize(norm, (t.w, NORM_H), interpolation=cv2.INTER_LINEAR) if norm.shape[1] != t.w else norm
            s = float(_soft_dice(a, t.image[None])[0])
            if best is None or s > best[0]:
                best = (s, t, tw)
        if best is None or best[0] < min_piece:
            return None
        s, t, tw = best
        out.append(t.label)
        scores.append(s)
        x += tw
        # skip blank columns
        while x < x_end and not img[:, x].any():
            x += 1
    if not out or len(out) < 2:
        return None
    # everything must be consumed: leftover ink means the split was wrong
    if x < x_end - 1 and img[:, x:x_end].any():
        return None
    return "".join(out), float(min(scores))


# ------------------------------------------------------------------ validation
_ALL_DIGITS = "0-9" + PERSIAN_DIGITS + ARABIC_DIGITS
NUM_RE = re.compile(rf"[{_ALL_DIGITS}][{_ALL_DIGITS},./:\-]*[{_ALL_DIGITS}]|[{_ALL_DIGITS}]")


@dataclass
class NumberInfo:
    text: str
    kind: str        # date | amount | national_id | phone | time | number
    valid: bool
    note: str = ""


def _ascii_digits(s: str) -> str:
    table = {ord(p): a for a, p in zip("0123456789", PERSIAN_DIGITS)}
    table.update({ord(p): a for a, p in zip("0123456789", ARABIC_DIGITS)})
    return s.translate(table)


def classify_number(tok: str) -> NumberInfo:
    a = _ascii_digits(tok)
    m = re.fullmatch(r"(\d{4})/(\d{1,2})/(\d{1,2})", a)
    if m:
        y, mo, d = (int(x) for x in m.groups())
        ok = 1300 <= y <= 1499 and 1 <= mo <= 12 and 1 <= d <= (31 if mo <= 6 else 30)
        return NumberInfo(tok, "date", ok, "" if ok else "تاریخ شمسی نامعتبر")
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", a)
    if m:
        d, mo, y = (int(x) for x in m.groups())
        ok = 1300 <= y <= 1499 and 1 <= mo <= 12 and 1 <= d <= 31
        return NumberInfo(tok, "date", ok, "" if ok else "تاریخ نامعتبر")
    if re.fullmatch(r"\d{1,2}:\d{2}(:\d{2})?", a):
        hh = int(a.split(":")[0])
        return NumberInfo(tok, "time", hh < 24)
    if re.fullmatch(r"\d{1,3}(,\d{3})+", a):
        return NumberInfo(tok, "amount", True)
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", a):
        return NumberInfo(tok, "amount", True)
    if re.fullmatch(r"09\d{9}", a):
        return NumberInfo(tok, "phone", True)
    if re.fullmatch(r"\d{10}", a):
        return NumberInfo(tok, "national_id", _valid_national_id(a), "" if _valid_national_id(a) else "رقم کنترل کد ملی نادرست")
    if "," in a and not re.fullmatch(r"\d{1,3}(,\d{3})+", a):
        return NumberInfo(tok, "amount", False, "گروه‌بندی سه‌رقمی مبلغ نادرست")
    return NumberInfo(tok, "number", True)


def _valid_national_id(s: str) -> bool:
    if len(s) != 10 or len(set(s)) == 1:
        return False
    total = sum(int(s[i]) * (10 - i) for i in range(9))
    r = total % 11
    c = int(s[9])
    return (r < 2 and c == r) or (r >= 2 and c == 11 - r)


def find_numbers(text: str) -> list[NumberInfo]:
    return [classify_number(m.group(0)) for m in NUM_RE.finditer(text)]
