"""Calibrate the word-gap threshold of a profile from a PDF with a text layer.

For every pair of neighbouring PAWs on a line we know from the text layer
whether a space character lies between them. The gap width divided by the
line x-height is therefore a labelled measurement, and the threshold that
separates the two classes best is stored in the library metadata.
"""
from __future__ import annotations

import numpy as np
import pymupdf

from .bootstrap import _render
from .library import Library
from .pdf_text import _page_chars
from .preprocess import preprocess
from .segment import segment_page


def calibrate_word_gap(pdf_path: str, library: Library, dpi: int = 300, pages: list[int] | None = None) -> dict:
    doc = pymupdf.open(pdf_path)
    scale = dpi / 72.0
    ratios: list[float] = []
    is_space: list[bool] = []
    for pi, page in enumerate(doc):
        if pages is not None and pi not in pages:
            continue
        spaces = [(((c.x0 + c.x1) / 2) * scale, ((c.y0 + c.y1) / 2) * scale) for c in _page_chars(page) if c.ch == " "]
        if not spaces:
            continue
        sx = np.array([s[0] for s in spaces])
        sy = np.array([s[1] for s in spaces])
        bgr = _render(page, dpi)
        binary = preprocess(bgr, dpi, fix_orientation=False).binary
        for ln in segment_page(binary, dpi, word_gap_ratio=100.0):
            in_band = (sy >= ln.y0 - 2) & (sy <= ln.y1 + 2)
            xs = sx[in_band]
            for a, b in zip(ln.paws, ln.paws[1:]):
                gap = a.x0 - b.x1
                if gap < 0:
                    continue
                ratios.append(gap / ln.x_height)
                is_space.append(bool(np.any((xs > b.x1 - 1) & (xs < a.x0 + 1))))
    r = np.array(ratios)
    s = np.array(is_space)
    if len(r) < 20 or s.sum() < 5 or (~s).sum() < 5:
        return {"samples": int(len(r)), "word_gap_ratio": None}
    best_t, best_acc = None, -1.0
    for t in np.linspace(0.05, 2.0, 196):
        acc = float(np.mean((r > t) == s))
        if acc > best_acc:
            best_t, best_acc = float(t), acc
    library.meta["word_gap_ratio"] = round(best_t, 3)
    library.meta["word_gap_accuracy"] = round(best_acc, 4)
    library.save()
    return {"samples": int(len(r)), "spaces": int(s.sum()), "word_gap_ratio": round(best_t, 3), "accuracy": round(best_acc, 4)}
