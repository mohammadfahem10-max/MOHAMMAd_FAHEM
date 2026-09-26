"""End-to-end document processing.

Per page:
  1. If the PDF page has a usable text layer -> exact extraction (no imaging).
  2. Otherwise render, clean, deskew, segment into PAWs, match against the
     chosen template library, assemble text, and record every doubt.
  3. Pages that look handwritten are reported as such instead of guessed.
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field

import cv2
import numpy as np
import pymupdf

from .library import Library, Match
from .numbers import decompose_sequence, find_numbers
from .pdf_text import extract_text_page, page_has_usable_text
from .preprocess import PreprocessResult, load_page_images, preprocess
from .segment import Line, Paw, segment_page
from .textnorm import collapse_spaces, is_ltr_char, normalize, visual_to_logical

UNKNOWN_MARK = "▯"   # ▯ shows exactly where a shape was not recognised


@dataclass
class PawOut:
    box: tuple[int, int, int, int]
    label: str | None
    score: float
    status: str            # ok | low | ambiguous | unknown | noise
    word_index: int
    template_id: str | None = None
    alt: str | None = None
    crop: str | None = None   # path to crop image when unknown / low


@dataclass
class LineOut:
    box: tuple[int, int, int, int]
    text: str
    paws: list[PawOut] = field(default_factory=list)
    x_height: int = 0
    baseline: int = 0


@dataclass
class PageOut:
    index: int
    source: str            # text_layer | template | handwritten | empty
    text: str
    lines: list[LineOut]
    image: str | None      # display image path (deskewed grayscale)
    width: int
    height: int
    stats: dict
    numbers: list[dict] = field(default_factory=list)


@dataclass
class DocumentOut:
    path: str
    profile: str | None
    pages: list[PageOut]

    @property
    def text(self) -> str:
        return "\n\n".join(p.text for p in self.pages)

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, indent=1)


# -------------------------------------------------------------- handwriting
def handwriting_score(lines: list[Line], binary: np.ndarray | None = None) -> float:
    """0 = machine print, 1 = certainly handwriting. Purely geometric.

    Signals: the baseline wanders along the line (print baselines are dead
    straight), many strokes are far taller than the x-height, and body
    heights vary a lot within a line.
    """
    if not lines:
        return 0.0
    wobble, tall, cvh = [], [], []
    for ln in lines:
        if len(ln.paws) < 4:
            continue
        hs = np.array([p.body_y1 - p.body_y0 for p in ln.paws], dtype=np.float64)
        cvh.append(hs.std() / (hs.mean() + 1e-6))
        tall.append(float(np.mean([(p.y1 - p.y0) > 2.2 * ln.x_height for p in ln.paws])))
        if binary is not None:
            xs = sorted(ln.paws, key=lambda p: p.x0)
            x0, x1 = xs[0].x0, xs[-1].x1
            m = int(0.7 * (ln.y1 - ln.y0))
            ya, yb = max(0, ln.y0 - m), min(binary.shape[0], ln.y1 + m)
            segs = []
            for k in range(4):
                a = x0 + (x1 - x0) * k // 4
                b = x0 + (x1 - x0) * (k + 1) // 4
                prof = (binary[ya:yb, a:b] > 0).sum(axis=1)
                if prof.sum() > 0:
                    segs.append(int(np.argmax(prof)))
            if len(segs) >= 3:
                wobble.append(float(np.std(segs)) / max(1, ln.x_height))
    if not cvh:
        return 0.0
    s = 0.0
    if wobble:
        s += float(np.clip((np.mean(wobble) - 0.6) / 0.9, 0, 1)) * 0.5
    s += float(np.clip((np.mean(tall) - 0.05) / 0.12, 0, 1)) * 0.3
    s += float(np.clip((np.mean(cvh) - 0.35) / 0.25, 0, 1)) * 0.2
    return float(np.clip(s, 0, 1))


# ------------------------------------------------------------------ assembly
_WEAK = set(" ./:,-_@()%+")


def _is_ltr_label(label: str | None) -> bool:
    return bool(label) and any(is_ltr_char(c) for c in label) and all(is_ltr_char(c) or c in _WEAK for c in label)


def _is_weak_label(label: str | None) -> bool:
    return bool(label) and all(c in _WEAK for c in label)


def assemble_line(paws: list[PawOut]) -> str:
    """Join PAW labels right-to-left; runs of digits/Latin are re-ordered by
    their real x position so numbers and URLs come out left-to-right."""
    items = [p for p in paws if p.status != "noise"]
    out: list[str] = []
    i = 0
    prev_word = None
    while i < len(items):
        p = items[i]
        if prev_word is not None and p.word_index != prev_word:
            out.append(" ")
        if _is_ltr_label(p.label):
            j = i
            run = []
            while j < len(items):
                q = items[j]
                if _is_ltr_label(q.label):
                    run.append(q)
                    j += 1
                elif _is_weak_label(q.label) and j + 1 < len(items) and _is_ltr_label(items[j + 1].label) \
                        and items[j + 1].word_index == q.word_index:
                    run.append(q)
                    j += 1
                else:
                    break
            run_sorted = sorted(run, key=lambda q: (q.box[0] + q.box[2]))
            # inside a number, kerning gaps can exceed the Persian word gap;
            # only a gap wider than ~0.7 of the digit height is a real space
            med_h = float(np.median([q.box[3] - q.box[1] for q in run_sorted]))
            piece = []
            for k, q in enumerate(run_sorted):
                if k > 0:
                    gap = q.box[0] - run_sorted[k - 1].box[2]
                    if gap > 0.7 * med_h:
                        piece.append(" ")
                piece.append(q.label or "")
            out.append("".join(piece))
            prev_word = run[-1].word_index
            i = j
            continue
        out.append(UNKNOWN_MARK if p.label is None else p.label)
        prev_word = p.word_index
        i += 1
    return normalize("".join(out))


def _is_latin_label(label: str | None) -> bool:
    return bool(label) and all(c.isascii() and c.isalpha() for c in label)


def _is_persian_label(label: str | None) -> bool:
    return bool(label) and any("\u0600" <= c <= "\u06ff" for c in label)


def _enforce_script_consistency(paws: list[PawOut], counts: dict) -> None:
    """A Latin-letter label glued to Persian letters inside one word is a
    look-alike error (l vs ا, o vs ه): demote it to unknown."""
    for k, p in enumerate(paws):
        if p.status not in ("ok", "ambiguous") or not _is_latin_label(p.label):
            continue
        prev_p = paws[k - 1] if k > 0 else None
        next_p = paws[k + 1] if k + 1 < len(paws) else None
        touching = [q for q in (prev_p, next_p) if q is not None and q.word_index == p.word_index]
        if touching and all(_is_persian_label(q.label) or q.status == "unknown" for q in touching) \
                and any(_is_persian_label(q.label) for q in touching):
            counts[p.status] -= 1
            counts["unknown"] += 1
            p.alt = p.label
            p.label = None
            p.status = "unknown"


# ----------------------------------------------------------------- pipeline
class Processor:
    def __init__(self, libraries_root: str, profile: str | None, workdir: str, dpi: int = 300,
                 min_accept: float | None = None, handwriting_threshold: float = 0.6,
                 fix_orientation: bool = True):
        self.libraries_root = libraries_root
        self.profile = profile
        self.workdir = workdir
        self.dpi = dpi
        self.min_accept = min_accept
        self.hw_threshold = handwriting_threshold
        self.fix_orientation = fix_orientation
        self.library = Library(profile, libraries_root).load() if profile else None
        os.makedirs(workdir, exist_ok=True)

    # -- public
    def process(self, path: str, prefer_text_layer: bool = True) -> DocumentOut:
        pages: list[PageOut] = []
        is_pdf = path.lower().endswith(".pdf")
        doc = pymupdf.open(path) if is_pdf else None
        images = load_page_images(path, self.dpi)
        for i, bgr in enumerate(images):
            if is_pdf and prefer_text_layer and page_has_usable_text(doc[i]):
                pages.append(self._text_layer_page(i, doc[i], bgr))
            else:
                pages.append(self._image_page(i, bgr))
        return DocumentOut(path=path, profile=self.profile, pages=pages)

    def process_image_array(self, bgr: np.ndarray, index: int = 0) -> PageOut:
        return self._image_page(index, bgr)

    # -- text layer
    def _text_layer_page(self, i: int, page: pymupdf.Page, bgr: np.ndarray) -> PageOut:
        res = extract_text_page(page)
        scale = self.dpi / 72.0
        img_path = self._save_display(i, cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY))
        lines = []
        for ln in res.lines:
            x0, y0, x1, y1 = ln.bbox
            lines.append(LineOut(box=(int(x0 * scale), int(y0 * scale), int(x1 * scale), int(y1 * scale)), text=ln.text))
        h, w = bgr.shape[:2]
        return PageOut(index=i, source="text_layer", text=res.text, lines=lines, image=img_path, width=w, height=h,
                       stats={"quality": round(res.quality, 4), "chars": len(res.text)},
                       numbers=[asdict(n) for n in find_numbers(res.text)])

    # -- image page
    TARGET_XHEIGHT = 34     # px; what 300-dpi renders of 11-12 pt text give

    def _image_page(self, i: int, bgr: np.ndarray) -> PageOut:
        pre = preprocess(bgr, self.dpi, fix_orientation=self.fix_orientation)
        wg = self.library.meta.get("word_gap_ratio") if self.library else None
        lines = segment_page(pre.binary, self.dpi, wg)
        upscale = 1.0
        if lines:
            xh = float(np.median([l.x_height for l in lines]))
            if 0 < xh < 0.7 * self.TARGET_XHEIGHT:
                # low-resolution photo / screenshot: enlarge so glyphs have the
                # size the templates were made at, then redo everything
                upscale = min(4.0, self.TARGET_XHEIGHT / xh)
                big = cv2.resize(bgr, None, fx=upscale, fy=upscale, interpolation=cv2.INTER_CUBIC)
                pre = preprocess(big, self.dpi, fix_orientation=self.fix_orientation)
                lines = segment_page(pre.binary, self.dpi, wg)
        h, w = pre.binary.shape
        img_path = self._save_display(i, pre.gray)
        hw = handwriting_score(lines, pre.binary)
        stats = {"skew_deg": round(pre.angle, 2), "orientation": pre.orientation, "lines": len(lines),
                 "paws": sum(len(l.paws) for l in lines), "handwriting_score": round(hw, 3),
                 "upscale": round(upscale, 2)}
        if not lines:
            return PageOut(i, "empty", "", [], img_path, w, h, stats)
        has_lib = self.library is not None and bool(self.library.templates)
        if not has_lib:
            stats["note"] = "no_library"
        outs, counts = self._recognise(i, lines)
        stats.update(counts)
        total = sum(counts.values()) or 1
        match_rate = counts["ok"] / total
        stats["match_rate"] = round(match_rate, 3)
        if hw >= self.hw_threshold and (not has_lib or match_rate < 0.4):
            stats["note"] = "handwritten"
            return PageOut(i, "handwritten", "", outs, img_path, w, h, stats)
        text = collapse_spaces("\n".join(l.text for l in outs))
        return PageOut(i, "template", text, outs, img_path, w, h, stats, numbers=[asdict(n) for n in find_numbers(text)])

    def _recognise(self, page_index: int, lines: list[Line]) -> tuple[list[LineOut], dict]:
        counts = {"ok": 0, "low": 0, "ambiguous": 0, "unknown": 0, "noise": 0}
        outs: list[LineOut] = []
        crop_dir = os.path.join(self.workdir, "crops", f"p{page_index}")
        for li, ln in enumerate(lines):
            paw_outs: list[PawOut] = []
            for pi, paw in enumerate(ln.paws):
                m = self._match(paw, ln)
                if m.label is None and self.library is not None:
                    seq = decompose_sequence(self.library, paw.image, ln.x_height, ln.baseline, paw.y0, paw.y1)
                    if seq is not None:
                        m = Match(seq[0], seq[1], None)
                status = self._status(m)
                counts[status] += 1
                crop = None
                if status in ("unknown", "low", "ambiguous"):
                    os.makedirs(crop_dir, exist_ok=True)
                    crop = os.path.join(crop_dir, f"l{li}_{pi}.png")
                    cv2.imwrite(crop, 255 - paw.image)
                label = m.label if status in ("ok", "ambiguous", "noise") else None
                paw_outs.append(PawOut(box=(paw.x0, paw.y0, paw.x1, paw.y1), label=label, score=round(m.score, 4),
                                       status=status, word_index=paw.word_index, template_id=m.template_id,
                                       alt=m.second_label, crop=crop))
            _enforce_script_consistency(paw_outs, counts)
            text = assemble_line(paw_outs)
            box = (min(p.x0 for p in ln.paws), ln.y0, max(p.x1 for p in ln.paws), ln.y1)
            outs.append(LineOut(box=box, text=text, paws=paw_outs, x_height=ln.x_height, baseline=ln.baseline))
        return outs, counts

    def _match(self, paw: Paw, ln: Line) -> Match:
        if self.library is None or not self.library.templates:
            return Match(None, 0.0, None)
        kw = {}
        if self.min_accept is not None:
            kw["min_accept"] = self.min_accept
        return self.library.match(paw.image, ln.x_height, ln.baseline, paw.y0, paw.y1, **kw)

    @staticmethod
    def _status(m: Match) -> str:
        if m.label is None:
            return "unknown"
        if m.label == "":
            return "noise"
        if m.ambiguous:
            return "ambiguous"
        return "ok"

    def _save_display(self, i: int, gray: np.ndarray) -> str:
        p = os.path.join(self.workdir, f"page{i}.png")
        small = gray
        if gray.shape[1] > 1800:
            f = 1800 / gray.shape[1]
            small = cv2.resize(gray, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        cv2.imwrite(p, small)
        return p


def segment_for_labelling(bgr: np.ndarray, dpi: int = 300, fix_orientation: bool = True) -> tuple[PreprocessResult, list[Line]]:
    pre = preprocess(bgr, dpi, fix_orientation=fix_orientation)
    return pre, segment_page(pre.binary, dpi)
