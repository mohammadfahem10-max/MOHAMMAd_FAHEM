"""Extraction from PDFs that carry a real text layer.

When a PDF was generated digitally (bank statements, court notices, ...) the
text is already inside the file. Reading it needs no image recognition at
all, so this path is exact. The work here is only about putting the
characters back into correct Persian logical order and undoing font quirks
(zero-width alef in lam-alef ligatures, Arabic presentation forms).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import pymupdf

from .textnorm import collapse_spaces, is_ltr_char, is_persian_letter, normalize, visual_to_logical


@dataclass
class TextChar:
    ch: str
    x0: float
    y0: float
    x1: float
    y1: float
    baseline: float


@dataclass
class TextLine:
    text: str
    bbox: tuple[float, float, float, float]
    chars: list[TextChar] = field(default_factory=list)


@dataclass
class TextPageResult:
    lines: list[TextLine]
    quality: float  # fraction of characters that are meaningful Persian/Latin/digits

    @property
    def text(self) -> str:
        return collapse_spaces("\n".join(l.text for l in self.lines))


def _page_chars(page: pymupdf.Page) -> list[TextChar]:
    raw = page.get_text("rawdict", flags=pymupdf.TEXT_PRESERVE_WHITESPACE)
    chars: list[TextChar] = []
    for block in raw["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                span_chars = span["chars"]
                i = 0
                while i < len(span_chars):
                    c = span_chars[i]
                    x0, y0, x1, y1 = c["bbox"]
                    ch = c["c"]
                    # Font quirk (B Nazanin & friends): lam-alef ligature is
                    # emitted as a zero-width alef followed by the lam glyph.
                    if ch == "ا" and (x1 - x0) < 0.05 and i + 1 < len(span_chars) and span_chars[i + 1]["c"] == "ل":
                        nxt = span_chars[i + 1]
                        nx0, ny0, nx1, ny1 = nxt["bbox"]
                        chars.append(TextChar("لا", nx0, ny0, nx1, ny1, nxt["origin"][1]))
                        i += 2
                        continue
                    if ch in ("ﻻ", "ﻼ", "ﻷ", "ﻸ", "ﻵ", "ﻶ"):
                        ch = "لا"
                    chars.append(TextChar(ch, x0, y0, x1, y1, c["origin"][1]))
                    i += 1
    return chars


def _group_lines(chars: list[TextChar]) -> list[list[TextChar]]:
    """Group characters into lines by baseline, tolerant to small jitter."""
    if not chars:
        return []
    chars = sorted(chars, key=lambda c: (round(c.baseline, 1), -c.x0))
    lines: list[list[TextChar]] = []
    cur: list[TextChar] = [chars[0]]
    for c in chars[1:]:
        h = max(1.0, (c.y1 - c.y0))
        if abs(c.baseline - cur[-1].baseline) <= 0.35 * h:
            cur.append(c)
        else:
            lines.append(cur)
            cur = [c]
    lines.append(cur)
    return lines


def _line_to_text(line: list[TextChar]) -> str:
    line = sorted(line, key=lambda c: -(c.x0 + c.x1) / 2)
    widths = [c.x1 - c.x0 for c in line if c.ch.strip()]
    avg_w = (sum(widths) / len(widths)) if widths else 3.0
    visual: list[str] = []
    prev: TextChar | None = None
    for c in line:
        if prev is not None:
            gap = prev.x0 - c.x1
            if gap > 0.55 * avg_w and (not visual or visual[-1] != " "):
                visual.append(" ")
        visual.append(c.ch)
        prev = c
    text = visual_to_logical("".join(visual))
    return normalize(text)


def _quality(text: str) -> float:
    meaningful = sum(1 for ch in text if is_persian_letter(ch) or is_ltr_char(ch))
    total = sum(1 for ch in text if not ch.isspace())
    return meaningful / total if total else 0.0


def extract_text_page(page: pymupdf.Page) -> TextPageResult:
    chars = _page_chars(page)
    lines: list[TextLine] = []
    for grp in _group_lines(chars):
        text = _line_to_text(grp)
        if not text.strip():
            continue
        bbox = (min(c.x0 for c in grp), min(c.y0 for c in grp), max(c.x1 for c in grp), max(c.y1 for c in grp))
        lines.append(TextLine(text=text, bbox=bbox, chars=grp))
    full = "\n".join(l.text for l in lines)
    return TextPageResult(lines=lines, quality=_quality(full))


def page_has_usable_text(page: pymupdf.Page, min_chars: int = 20, min_quality: float = 0.85) -> bool:
    txt = page.get_text().strip()
    if len(txt) < min_chars:
        return False
    return _quality(normalize(txt)) >= min_quality
