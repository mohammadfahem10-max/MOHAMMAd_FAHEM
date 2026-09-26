"""Build a template library automatically from a PDF that has a text layer.

The rendered page is segmented exactly like a scan would be, and every PAW
is labelled from the characters whose positions fall inside it. The result
is a library for that document's font with no manual labelling at all.
"""
from __future__ import annotations

import cv2
import numpy as np
import pymupdf

from .library import Library
from .pdf_text import TextChar, _page_chars
from .preprocess import preprocess
from .segment import segment_page
from .textnorm import is_ltr_char, normalize

_WEAK = set(" ./:,-_@()%+")


def _label_from_chars(members: list[tuple[int, TextChar]]) -> str | None:
    """Logical label for one PAW. Digits/Latin read left-to-right, Persian
    right-to-left; a PAW mixing both is ambiguous and skipped."""
    chars = [c for _, c in members]
    ltr = [is_ltr_char(c.ch) for c in chars]
    weak = [c.ch in _WEAK for c in chars]
    rtl = [not a and not b for a, b in zip(ltr, weak)]
    if any(ltr) and any(rtl):
        return None
    if any(ltr):
        chars.sort(key=lambda c: (c.x0 + c.x1))
    else:
        chars.sort(key=lambda c: -(c.x0 + c.x1))
    return normalize("".join(c.ch for c in chars))


def _render(page: pymupdf.Page, dpi: int) -> np.ndarray:
    pix = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csRGB, alpha=False)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def bootstrap_from_pdf(pdf_path: str, library: Library, dpi: int = 300, pages: list[int] | None = None,
                       source: str = "") -> dict:
    doc = pymupdf.open(pdf_path)
    scale = dpi / 72.0
    added = dup = skipped = 0
    for pi, page in enumerate(doc):
        if pages is not None and pi not in pages:
            continue
        chars = [c for c in _page_chars(page) if c.ch.strip()]
        if not chars:
            continue
        bgr = _render(page, dpi)
        binary = preprocess(bgr, dpi, fix_orientation=False).binary
        lines = segment_page(binary, dpi)
        # assign each char to exactly one PAW: the one whose x-range holds the
        # char centre, nearest centre wins on overlaps
        owner: dict[int, tuple[int, int]] = {}
        for ci, c in enumerate(chars):
            cx = (c.x0 + c.x1) / 2 * scale
            cy = (c.y0 + c.y1) / 2 * scale
            best, best_d = None, 1e9
            for li, ln in enumerate(lines):
                if not (ln.y0 - 2 <= cy <= ln.y1 + 2):
                    continue
                ly = (ln.y0 + ln.y1) / 2
                for qi, paw in enumerate(ln.paws):
                    if paw.x0 - 1 <= cx <= paw.x1 + 1:
                        # x-distance to the PAW centre plus y-distance to the line centre
                        d = abs((paw.x0 + paw.x1) / 2 - cx) + 2.0 * abs(ly - cy)
                        if d < best_d:
                            best, best_d = (li, qi), d
            if best is not None:
                owner[ci] = best
        groups: dict[tuple[int, int], list[tuple[int, TextChar]]] = {}
        for ci, key in owner.items():
            groups.setdefault(key, []).append((ci, chars[ci]))
        for (li, qi), members in groups.items():
            ln = lines[li]
            paw = ln.paws[qi]
            label = _label_from_chars(members)
            if not label or " " in label:
                skipped += 1
                continue
            src_name = source or f"{pdf_path}#p{pi}"
            t = library.add(label, paw.image, ln.x_height, ln.baseline, paw.y0, paw.y1, source=src_name)
            if t is None:
                dup += 1
            else:
                added += 1
            # touching digits / Latin: also store each character on its own so
            # unseen combinations can be decomposed later
            if len(members) > 1 and all(is_ltr_char(c.ch) or c.ch in _WEAK for _, c in members):
                cs = sorted((c for _, c in members), key=lambda c: c.x0)
                bounds = []
                for a, b in zip(cs, cs[1:]):
                    bounds.append(int(round(((a.x1 + b.x0) / 2) * scale)) - paw.x0)
                edges = [0] + bounds + [paw.w]
                for k, c in enumerate(cs):
                    xa, xb = max(0, edges[k]), min(paw.w, edges[k + 1])
                    if xb - xa < 2:
                        continue
                    piece = paw.image[:, xa:xb]
                    cols = np.where(piece.any(axis=0))[0]
                    rows = np.where(piece.any(axis=1))[0]
                    if len(cols) == 0 or len(rows) == 0:
                        continue
                    piece = piece[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
                    py0 = paw.y0 + rows[0]
                    py1 = paw.y0 + rows[-1] + 1
                    if library.add(normalize(c.ch), piece, ln.x_height, ln.baseline, py0, py1, source=src_name + ":split") is not None:
                        added += 1
    library.save()
    return {"added": added, "duplicates": dup, "skipped": skipped, "total": len(library.templates)}
