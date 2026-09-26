"""Segmentation of a binary page into lines, words and PAWs.

A PAW ("piece of Arabic word") is one connected group of letters, plus the
dots and marks that belong to it. In a fixed font every PAW of a given
letter sequence has exactly the same shape, which is what the template
matcher relies on.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np


@dataclass
class Paw:
    x0: int
    y0: int
    x1: int
    y1: int
    body_y0: int          # vertical extent of the main body (without dots)
    body_y1: int
    baseline: int         # absolute y of the line baseline
    image: np.ndarray     # binary crop (text=255)
    word_index: int = 0   # index of the word within the line (0 = rightmost)

    @property
    def w(self) -> int:
        return self.x1 - self.x0

    @property
    def h(self) -> int:
        return self.y1 - self.y0


@dataclass
class Line:
    y0: int
    y1: int
    baseline: int
    x_height: int
    paws: list[Paw] = field(default_factory=list)   # ordered right-to-left


def find_line_bands(binary: np.ndarray, dpi: int = 300) -> list[tuple[int, int]]:
    """Split the page into horizontal text bands using the row projection."""
    h = binary.shape[0]
    prof = (binary > 0).sum(axis=1).astype(np.float64)
    if prof.max() == 0:
        return []
    k = max(3, int(dpi / 300 * 5)) | 1
    smooth = np.convolve(prof, np.ones(k) / k, mode="same")
    thresh = max(1.0, 0.02 * smooth.max())
    on = smooth > thresh
    bands: list[tuple[int, int]] = []
    y = 0
    while y < h:
        if on[y]:
            s = y
            while y < h and on[y]:
                y += 1
            bands.append((s, y))
        else:
            y += 1
    min_h = max(4, int(dpi / 300 * 10))
    bands = [(a, b) for a, b in bands if b - a >= min_h]
    return _split_merged_bands(bands, smooth, dpi)


def _split_merged_bands(bands, smooth, dpi):
    """Split a band that clearly holds two lines (valley between two peaks)."""
    out = []
    min_line = max(6, int(dpi / 300 * 14))
    for a, b in bands:
        seg = smooth[a:b]
        if len(seg) < 2 * min_line:
            out.append((a, b))
            continue
        peaks = []
        for i in range(1, len(seg) - 1):
            if seg[i] >= seg[i - 1] and seg[i] > seg[i + 1] and seg[i] > 0.3 * seg.max():
                peaks.append(i)
        cuts = []
        for p, q in zip(peaks, peaks[1:]):
            if q - p < min_line:
                continue
            valley = p + int(np.argmin(seg[p:q]))
            if seg[valley] < 0.35 * min(seg[p], seg[q]):
                cuts.append(valley)
        prev = a
        for c in cuts:
            out.append((prev, a + c))
            prev = a + c
        out.append((prev, b))
    return out


def _components(binary: np.ndarray):
    n, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    comps = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        comps.append((int(x), int(y), int(x + w), int(y + h), int(area), i))
    return comps, labels


def segment_line(binary: np.ndarray, y0: int, y1: int, dpi: int = 300, word_gap_ratio: float | None = None) -> Line | None:
    core_h = y1 - y0
    margin = int(0.7 * core_h)
    ey0, ey1 = max(0, y0 - margin), min(binary.shape[0], y1 + margin)
    band = binary[ey0:ey1]
    if band.sum() == 0:
        return None
    core0, core1 = y0 - ey0, y1 - ey0          # core band inside the crop
    prof = (band[core0:core1] > 0).sum(axis=1).astype(np.float64)
    baseline_rel = core0 + int(np.argmax(prof))

    comps, labels = _components(band)
    # keep only components that belong to this line: most of their height
    # inside the core band, or centre inside it
    kept = []
    for c in comps:
        cy0, cy1 = c[1], c[3]
        ov = min(cy1, core1) - max(cy0, core0)
        cy = (cy0 + cy1) / 2
        if ov >= 0.5 * (cy1 - cy0) or (core0 <= cy <= core1):
            kept.append(c)
    comps = kept
    if not comps:
        return None
    core_y0, core_y1 = y0, y1
    y0 = ey0            # from here on y0 is the crop offset

    heights = np.array([c[3] - c[1] for c in comps])
    areas = np.array([c[4] for c in comps])
    # main-body height: width-weighted median height of components crossing the baseline
    cross = [c for c in comps if c[1] <= baseline_rel <= c[3]]
    if cross:
        med = float(np.median([c[3] - c[1] for c in cross]))
        cross = [c for c in cross if (c[3] - c[1]) <= 2.5 * med]   # ignore logos / graphics
        hs = np.concatenate([[c[3] - c[1]] * max(1, c[2] - c[0]) for c in cross])
        x_height = int(np.median(hs))
    else:
        big = heights[areas >= np.percentile(areas, 50)]
        x_height = int(np.median(big)) if len(big) else int(np.median(heights))
    x_height = max(x_height, 3)

    # classify components: body vs mark (dots, hamza, tashdid, small pieces)
    bodies, marks = [], []
    for c in comps:
        cx0, cy0, cx1, cy1, area, idx = c
        ch, cw = cy1 - cy0, cx1 - cx0
        crosses_baseline = cy0 <= baseline_rel + 0.25 * x_height and cy1 >= baseline_rel - 0.25 * x_height
        small = ch <= 0.45 * x_height and cw <= 0.9 * x_height
        if small and not crosses_baseline:
            marks.append(c)
        elif small and area <= 0.12 * x_height * x_height:
            marks.append(c)
        else:
            bodies.append(c)
    if not bodies:
        bodies, marks = comps, []

    # attach every mark to the body with the largest horizontal overlap;
    # fall back to nearest body in x
    groups = {b[5]: [b] for b in bodies}
    for m in marks:
        mx0, _, mx1, _, _, _ = m
        best, best_ov, best_dist = None, 0, 1e9
        for b in bodies:
            ov = min(mx1, b[2]) - max(mx0, b[0])
            if ov > best_ov:
                best, best_ov = b, ov
            elif best_ov <= 0:
                d = min(abs(mx0 - b[2]), abs(b[0] - mx1))
                if d < best_dist:
                    best, best_dist = b, d
        if best is not None:
            groups[best[5]].append(m)

    paws: list[Paw] = []
    for b in bodies:
        members = groups[b[5]]
        gx0 = min(c[0] for c in members)
        gy0 = min(c[1] for c in members)
        gx1 = max(c[2] for c in members)
        gy1 = max(c[3] for c in members)
        mask = np.isin(labels[gy0:gy1, gx0:gx1], [c[5] for c in members])
        img = (mask.astype(np.uint8)) * 255
        paws.append(Paw(gx0, y0 + gy0, gx1, y0 + gy1, y0 + b[1], y0 + b[3], y0 + baseline_rel, img))

    # merge vertically stacked fragments of one broken glyph
    paws.sort(key=lambda p: -(p.x0 + p.x1))
    paws = _merge_overlapping(paws, binary)
    paws.sort(key=lambda p: -(p.x0 + p.x1))

    # word segmentation from horizontal gaps (RTL order: previous is to the right)
    gaps = []
    for a, b in zip(paws, paws[1:]):
        gaps.append(a.x0 - b.x1)
    word_gap = word_gap_ratio * x_height if word_gap_ratio else _word_gap_threshold(gaps, x_height)
    wi = 0
    for i, p in enumerate(paws):
        if i > 0 and gaps[i - 1] > word_gap:
            wi += 1
        p.word_index = wi
    return Line(y0=core_y0, y1=core_y1, baseline=y0 + baseline_rel, x_height=x_height, paws=paws)


def _merge_overlapping(paws: list[Paw], binary: np.ndarray) -> list[Paw]:
    if not paws:
        return paws
    merged: list[Paw] = [paws[0]]
    for p in paws[1:]:
        q = merged[-1]
        ov = min(p.x1, q.x1) - max(p.x0, q.x0)
        v_ov = min(p.body_y1, q.body_y1) - max(p.body_y0, q.body_y0)
        if ov > 0.75 * min(p.w, q.w) and ov > 2 and v_ov <= 0:
            x0, y0, x1, y1 = min(p.x0, q.x0), min(p.y0, q.y0), max(p.x1, q.x1), max(p.y1, q.y1)
            img = binary[y0:y1, x0:x1].copy()
            merged[-1] = Paw(x0, y0, x1, y1, min(p.body_y0, q.body_y0), max(p.body_y1, q.body_y1), q.baseline, img)
        else:
            merged.append(p)
    return merged


def _word_gap_threshold(gaps: list[int], x_height: int) -> float:
    """Pick the gap size that separates words from sub-word gaps."""
    if not gaps:
        return 1e9
    g = np.array([x for x in gaps if x >= 0], dtype=np.float64)
    if len(g) < 4:
        return 0.45 * x_height
    # Otsu on the gap histogram, bounded by sensible font-relative limits
    lo, hi = 0.25 * x_height, 1.2 * x_height
    best_t, best_v = 0.45 * x_height, -1
    for t in np.linspace(lo, hi, 20):
        a, b = g[g <= t], g[g > t]
        if len(a) == 0 or len(b) == 0:
            continue
        v = len(a) * len(b) * (a.mean() - b.mean()) ** 2
        if v > best_v:
            best_t, best_v = t, v
    return float(best_t)


def segment_page(binary: np.ndarray, dpi: int = 300, word_gap_ratio: float | None = None) -> list[Line]:
    lines: list[Line] = []
    for y0, y1 in find_line_bands(binary, dpi):
        ln = segment_line(binary, y0, y1, dpi, word_gap_ratio)
        if ln and ln.paws:
            lines.append(ln)
    return lines
