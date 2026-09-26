"""Persian text normalization and visual-to-logical reordering.

Everything here is deterministic string/geometry processing. No models.
"""
from __future__ import annotations

import unicodedata

# Arabic-presentation-form ligatures for lam-alef that NFKC expands correctly,
# plus explicit fixes for characters NFKC maps to Arabic instead of Persian.
_CHAR_FIXES = {
    "ي": "ی",  # Arabic yeh -> Persian yeh
    "ى": "ی",  # alef maksura -> Persian yeh
    "ك": "ک",  # Arabic kaf -> Persian kaf
    "ـ": "",        # tatweel (kashida)
    "‏": "",        # RLM
    "‎": "",        # LRM
    "‪": "", "‫": "", "‬": "", "‭": "", "‮": "",
    "﻿": "",
    " ": " ",
}

PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"


def normalize(text: str, *, persian_digits: bool | None = None) -> str:
    """Normalize presentation forms and Arabic variants to standard Persian.

    ``persian_digits``: None keeps digits as they are, True converts every
    ASCII/Arabic-Indic digit to Persian, False converts every digit to ASCII.
    """
    out = unicodedata.normalize("NFKC", text)
    out = "".join(_CHAR_FIXES.get(ch, ch) for ch in out)
    if persian_digits is True:
        table = {ord(a): p for a, p in zip("0123456789", PERSIAN_DIGITS)}
        table.update({ord(a): p for a, p in zip(ARABIC_DIGITS, PERSIAN_DIGITS)})
        out = out.translate(table)
    elif persian_digits is False:
        table = {ord(p): a for a, p in zip("0123456789", PERSIAN_DIGITS)}
        table.update({ord(p): a for a, p in zip("0123456789", ARABIC_DIGITS)})
        out = out.translate(table)
    return out


def is_rtl_char(ch: str) -> bool:
    o = ord(ch)
    return (0x0600 <= o <= 0x06FF) or (0x0750 <= o <= 0x077F) or (0xFB50 <= o <= 0xFDFF) or (0xFE70 <= o <= 0xFEFF)


def is_ltr_char(ch: str) -> bool:
    return ch.isascii() and ch.isalnum() or ch in PERSIAN_DIGITS or ch in ARABIC_DIGITS


def is_persian_letter(ch: str) -> bool:
    return is_rtl_char(ch) and not (ch in PERSIAN_DIGITS or ch in ARABIC_DIGITS)


# Characters that join the neighbouring LTR run when they sit between two LTR chars.
_WEAK = set(" ./:,-_@()%+")


def visual_to_logical(visual_rtl: str) -> str:
    """Convert a line collected in visual right-to-left order into logical order.

    ``visual_rtl`` is the sequence of characters read from the right edge of
    the line to the left edge. Persian letters are already in logical order.
    Runs of LTR characters (digits, Latin) were collected backwards, so each
    maximal run (including weak punctuation *between* LTR chars) is reversed.
    """
    n = len(visual_rtl)
    ltr = [is_ltr_char(c) for c in visual_rtl]
    # extend LTR-ness to weak chars that lie strictly between two LTR chars
    strong = ltr[:]
    i = 0
    while i < n:
        if not ltr[i] and visual_rtl[i] in _WEAK:
            j = i
            while j < n and not ltr[j] and visual_rtl[j] in _WEAK:
                j += 1
            if i > 0 and ltr[i - 1] and j < n and ltr[j]:
                for k in range(i, j):
                    strong[k] = True
            i = j
        else:
            i += 1
    out = []
    i = 0
    while i < n:
        if strong[i]:
            j = i
            while j < n and strong[j]:
                j += 1
            out.append(visual_rtl[i:j][::-1])
            i = j
        else:
            out.append(visual_rtl[i])
            i += 1
    return "".join(out)


def collapse_spaces(text: str) -> str:
    lines = []
    for line in text.split("\n"):
        line = " ".join(line.split())
        lines.append(line)
    return "\n".join(lines)
