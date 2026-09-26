"""Image clean-up before segmentation.

All steps are classical image processing (OpenCV / NumPy):
  * colored ink (stamps, signatures, fingerprints) suppression
  * adaptive binarization that copes with uneven lighting
  * despeckling
  * skew estimation and correction
  * orientation (0/90/180/270) estimation
  * removal of long ruling lines (tables, underlines)
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
import pymupdf


@dataclass
class PreprocessResult:
    binary: np.ndarray      # uint8, text = 255, background = 0
    gray: np.ndarray        # deskewed grayscale for display
    angle: float            # skew angle applied (degrees)
    orientation: int        # 0 / 90 / 180 / 270 applied before skew
    dpi: int


def load_page_images(path: str, dpi: int = 300) -> list[np.ndarray]:
    """Load a PDF or image file into a list of BGR page images."""
    lower = path.lower()
    if lower.endswith(".pdf"):
        doc = pymupdf.open(path)
        out = []
        for page in doc:
            pix = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csRGB, alpha=False)
            arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
            out.append(cv2.cvtColor(arr, cv2.COLOR_RGB2BGR))
        return out
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"cannot read image: {path}")
    return [img]


def suppress_colored_ink(bgr: np.ndarray, sat_thresh: int = 70, val_min: int = 40) -> np.ndarray:
    """Whiten saturated pixels (blue/red stamps, signatures, fingerprints).

    Printed text is black/grey (saturation near 0), so it survives. Where a
    stamp overlaps text, the black strokes remain and the colored halo goes.
    """
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    s = hsv[:, :, 1]
    v = hsv[:, :, 2]
    mask = (s > sat_thresh) & (v > val_min)
    # grow the mask slightly to remove color fringes around strokes
    mask = cv2.dilate(mask.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1).astype(bool)
    out = bgr.copy()
    out[mask] = (255, 255, 255)
    return out


def to_gray(bgr: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)


def binarize(gray: np.ndarray, dpi: int = 300) -> np.ndarray:
    """Adaptive threshold -> text=255 on 0 background, then despeckle."""
    block = int(dpi / 300 * 41) | 1
    block = max(11, block)
    # light denoise that keeps edges
    g = cv2.bilateralFilter(gray, 5, 40, 40)
    binary = cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block, 15)
    # pages with very faint print: also union with Otsu on a normalized image
    norm = cv2.normalize(g, None, 0, 255, cv2.NORM_MINMAX)
    _, otsu = cv2.threshold(norm, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    binary = cv2.bitwise_and(binary, otsu)
    # ink gate: drop light-grey material (watermarks, bleed-through, shading)
    ink = float(np.percentile(g, 1))
    paper = float(np.median(g))
    dark_t = ink + 0.6 * (paper - ink)
    binary[g >= dark_t] = 0
    return despeckle(binary, dpi)


def remove_large_components(binary: np.ndarray, max_h_frac: float = 0.06, max_w_frac: float = 0.35) -> np.ndarray:
    """Drop components far larger than any glyph (logos, stamps, watermark blobs)."""
    H, W = binary.shape
    n, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    keep = np.ones(n, dtype=bool)
    keep[0] = False
    for i in range(1, n):
        h = stats[i, cv2.CC_STAT_HEIGHT]
        w = stats[i, cv2.CC_STAT_WIDTH]
        if h > max_h_frac * H or w > max_w_frac * W:
            keep[i] = False
    return np.where(keep[labels], 255, 0).astype(np.uint8)


def despeckle(binary: np.ndarray, dpi: int = 300) -> np.ndarray:
    min_area = max(2, int((dpi / 300) ** 2 * 6))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    keep = np.zeros(n, dtype=bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= min_area
    return np.where(keep[labels], 255, 0).astype(np.uint8)


def remove_rules(binary: np.ndarray, dpi: int = 300) -> np.ndarray:
    """Remove long horizontal and vertical lines (table borders, underlines)."""
    h_len = max(20, int(dpi / 300 * 120))
    v_len = max(20, int(dpi / 300 * 120))
    horiz = cv2.morphologyEx(binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (h_len, 1)))
    vert = cv2.morphologyEx(binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, v_len)))
    rules = cv2.bitwise_or(horiz, vert)
    rules = cv2.dilate(rules, np.ones((3, 3), np.uint8))
    return cv2.bitwise_and(binary, cv2.bitwise_not(rules))


def _projection_score(binary: np.ndarray) -> float:
    prof = binary.sum(axis=1).astype(np.float64)
    return float(np.var(prof))


def estimate_skew(binary: np.ndarray, max_angle: float = 15.0) -> float:
    """Skew angle (deg) that maximizes row-projection variance. Coarse-to-fine."""
    small = cv2.resize(binary, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
    small = (small > 64).astype(np.uint8) * 255
    h, w = small.shape
    center = (w / 2, h / 2)

    def score(a: float) -> float:
        m = cv2.getRotationMatrix2D(center, a, 1.0)
        r = cv2.warpAffine(small, m, (w, h), flags=cv2.INTER_NEAREST, borderValue=0)
        return _projection_score(r)

    best = 0.0
    best_s = score(0.0)
    for a in np.arange(-max_angle, max_angle + 0.01, 1.0):
        s = score(float(a))
        if s > best_s:
            best, best_s = float(a), s
    for a in np.arange(best - 1.0, best + 1.01, 0.1):
        s = score(float(a))
        if s > best_s:
            best, best_s = float(a), s
    return best


def rotate(img: np.ndarray, angle: float, border: int) -> np.ndarray:
    if abs(angle) < 0.05:
        return img
    h, w = img.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    cos, sin = abs(m[0, 0]), abs(m[0, 1])
    nw, nh = int(h * sin + w * cos), int(h * cos + w * sin)
    m[0, 2] += nw / 2 - w / 2
    m[1, 2] += nh / 2 - h / 2
    return cv2.warpAffine(img, m, (nw, nh), flags=cv2.INTER_LINEAR, borderValue=border)


def _line_structure(binary: np.ndarray) -> float:
    """How strongly the page is organised in horizontal text lines.

    Counts the number of empty gaps between ink bands along the row profile,
    restricted to the ink bounding box. Text lines give many gaps; the
    perpendicular direction gives very few because lines overlap in x.
    """
    prof = (binary > 0).sum(axis=1)
    ys = np.where(prof > 0)[0]
    if len(ys) == 0:
        return 0.0
    on = prof[ys[0]:ys[-1] + 1] > 0
    runs = np.count_nonzero(on[1:] != on[:-1]) / 2.0
    return float(runs)


def _upright_score(binary: np.ndarray, dpi: int) -> float:
    """Positive when Persian text is upright, negative when upside down.

    In upright Persian print the dense baseline stroke sits in the lower part
    of each line and most extra mass (ascenders like alef/lam/kaf, dots of
    ن ت ی) lies above it. Rotated by 180 the mass sits below the baseline.
    """
    from .segment import find_line_bands  # local import to avoid cycle

    bands = find_line_bands(binary, dpi)
    score = 0.0
    for y0, y1 in bands:
        band = binary[y0:y1]
        prof = band.sum(axis=1).astype(np.float64)
        if prof.sum() == 0:
            continue
        base = int(np.argmax(prof))
        above = prof[:base].sum()
        below = prof[base + 1:].sum()
        score += (above - below) / (above + below + 1e-9)
    return score


def estimate_orientation(binary: np.ndarray, dpi: int) -> int:
    """Return 0, 90, 180 or 270: the clockwise rotation to apply to make text upright."""
    cands = {0: binary, 90: cv2.rotate(binary, cv2.ROTATE_90_CLOCKWISE),
             180: cv2.rotate(binary, cv2.ROTATE_180), 270: cv2.rotate(binary, cv2.ROTATE_90_COUNTERCLOCKWISE)}
    ls = {k: _line_structure(v) for k, v in cands.items()}
    portrait = ls[0] + ls[180]
    landscape = ls[90] + ls[270]
    pair = (0, 180) if portrait >= landscape else (90, 270)
    a, b = pair
    ua, ub = _upright_score(cands[a], dpi), _upright_score(cands[b], dpi)
    return a if ua >= ub else b


def apply_orientation(img: np.ndarray, orientation: int) -> np.ndarray:
    if orientation == 90:
        return cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    if orientation == 180:
        return cv2.rotate(img, cv2.ROTATE_180)
    if orientation == 270:
        return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return img


def preprocess(bgr: np.ndarray, dpi: int = 300, *, fix_orientation: bool = True, strip_rules: bool = True) -> PreprocessResult:
    clean = suppress_colored_ink(bgr)
    gray = to_gray(clean)
    binary = binarize(gray, dpi)

    angle = estimate_skew(binary)
    if abs(angle) >= 0.1:
        binary = rotate(binary, angle, 0)
        gray = rotate(gray, angle, 255)
        binary = (binary > 127).astype(np.uint8) * 255

    orientation = 0
    if fix_orientation:
        orientation = estimate_orientation(binary, dpi)
        if orientation:
            binary = apply_orientation(binary, orientation)
            gray = apply_orientation(gray, orientation)

    if strip_rules:
        binary = remove_rules(binary, dpi)
    binary = remove_large_components(binary)
    return PreprocessResult(binary=binary, gray=gray, angle=angle, orientation=orientation, dpi=dpi)
