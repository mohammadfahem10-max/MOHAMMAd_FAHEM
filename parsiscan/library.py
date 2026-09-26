"""Template library: labelled PAW shapes for one font profile, and the matcher.

Matching is plain bitmap comparison. Every PAW is scaled to a fixed height
and compared (soft Dice overlap) with templates of similar width and similar
size relative to the line. No learning, no probabilities beyond the overlap
score itself, so every result is reproducible and every doubt is visible.
"""
from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass, field

import cv2
import numpy as np

NORM_H = 40
MIN_ACCEPT = 0.86      # overlap needed to accept a match
MIN_ACCEPT_SHORT = 0.92  # stricter for single letters
MIN_ACCEPT_DIGIT = 0.95  # strictest for digits: a wrong digit is worse than a ▯
AMBIGUOUS_MARGIN = 0.025
DIGITS = set("0123456789۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩")


def _is_short_label(label: str) -> bool:
    return len(label) <= 1 or all(c in DIGITS for c in label)


@dataclass
class Template:
    id: str
    label: str            # "" means "this shape is noise, emit nothing"
    w: int                # width after scaling height to NORM_H
    rel_h: float          # PAW height / line x-height
    rel_w: float
    rel_top: float        # (baseline - y0) / x-height
    rel_bottom: float     # (y1 - baseline) / x-height
    count: int = 1
    source: str = ""
    image: np.ndarray | None = None  # float32 blurred, NORM_H x w


@dataclass
class Match:
    label: str | None     # None -> unknown
    score: float
    template_id: str | None
    ambiguous: bool = False
    second_label: str | None = None
    second_score: float = 0.0


def normalize_bitmap(img: np.ndarray, norm_h: int = NORM_H) -> np.ndarray:
    """Scale a binary crop to norm_h rows, keep aspect, return float32 blurred [0,1]."""
    h, w = img.shape[:2]
    if h == 0 or w == 0:
        return np.zeros((norm_h, 1), np.float32)
    nw = max(1, int(round(w * norm_h / h)))
    resized = cv2.resize((img > 0).astype(np.uint8) * 255, (nw, norm_h), interpolation=cv2.INTER_AREA)
    f = (resized > 100).astype(np.float32)
    f = cv2.blur(f, (3, 3))
    return f


def _soft_dice(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """a: (H,W) ; b: (N,H,W) -> (N,) soft dice."""
    inter = np.minimum(a[None], b).sum(axis=(1, 2))
    return 2 * inter / (a.sum() + b.sum(axis=(1, 2)) + 1e-6)


class Library:
    def __init__(self, profile: str, root: str):
        self.profile = profile
        self.root = root
        self.dir = os.path.join(root, profile)
        self.templates: list[Template] = []
        self.meta: dict = {}
        self._by_w: dict[int, tuple[np.ndarray, list[int]]] = {}
        self._dirty_index = True

    # ------------------------------------------------------------------ I/O
    @property
    def path(self) -> str:
        return os.path.join(self.dir, "templates.json")

    def exists(self) -> bool:
        return os.path.exists(self.path)

    def load(self) -> "Library":
        self.templates = []
        if not self.exists():
            return self
        with open(self.path, encoding="utf-8") as fh:
            data = json.load(fh)
        self.meta = data.get("meta", {})
        for t in data.get("templates", []):
            png = os.path.join(self.dir, "glyphs", f"{t['id']}.png")
            raw = cv2.imread(png, cv2.IMREAD_GRAYSCALE)
            if raw is None:
                continue
            tpl = Template(id=t["id"], label=t["label"], w=int(raw.shape[1]), rel_h=t["rel_h"], rel_w=t["rel_w"],
                           rel_top=t["rel_top"], rel_bottom=t["rel_bottom"], count=t.get("count", 1),
                           source=t.get("source", ""))
            tpl.image = cv2.blur((raw > 100).astype(np.float32), (3, 3))
            self.templates.append(tpl)
        self._dirty_index = True
        return self

    def save(self) -> None:
        os.makedirs(os.path.join(self.dir, "glyphs"), exist_ok=True)
        data = {"profile": self.profile, "norm_h": NORM_H, "meta": self.meta, "templates": []}
        for t in self.templates:
            data["templates"].append({"id": t.id, "label": t.label, "rel_h": round(t.rel_h, 4), "rel_w": round(t.rel_w, 4),
                                      "rel_top": round(t.rel_top, 4), "rel_bottom": round(t.rel_bottom, 4),
                                      "count": t.count, "source": t.source})
        with open(self.path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1)

    def _glyph_path(self, tid: str) -> str:
        return os.path.join(self.dir, "glyphs", f"{tid}.png")

    # ------------------------------------------------------------- building
    def add(self, label: str, img: np.ndarray, x_height: int, baseline: int, y0: int, y1: int, source: str = "",
            dedupe: float = 0.97) -> Template | None:
        """Add a template from a binary crop. Near-duplicates of an existing
        template with the same label only bump its count."""
        norm = normalize_bitmap(img)
        h, w = img.shape[:2]
        feats = dict(rel_h=h / x_height, rel_w=w / x_height, rel_top=(baseline - y0) / x_height,
                     rel_bottom=(y1 - baseline) / x_height)
        m = self.match(img, x_height, baseline, y0, y1)
        if m.label is not None and m.label == label and m.score >= dedupe:
            for t in self.templates:
                if t.id == m.template_id:
                    t.count += 1
            return None
        tid = uuid.uuid4().hex[:12]
        tpl = Template(id=tid, label=label, w=norm.shape[1], count=1, source=source, image=norm, **feats)
        self.templates.append(tpl)
        os.makedirs(os.path.join(self.dir, "glyphs"), exist_ok=True)
        binary = ((cv2.resize((img > 0).astype(np.uint8) * 255, (norm.shape[1], NORM_H), interpolation=cv2.INTER_AREA)) > 100).astype(np.uint8) * 255
        cv2.imwrite(self._glyph_path(tid), binary)
        self._dirty_index = True
        return tpl

    def relabel(self, template_id: str, label: str) -> bool:
        for t in self.templates:
            if t.id == template_id:
                t.label = label
                return True
        return False

    def remove(self, template_id: str) -> bool:
        before = len(self.templates)
        self.templates = [t for t in self.templates if t.id != template_id]
        p = self._glyph_path(template_id)
        if os.path.exists(p):
            os.remove(p)
        self._dirty_index = True
        return len(self.templates) != before

    # ------------------------------------------------------------- matching
    def _index(self) -> None:
        if not self._dirty_index:
            return
        self._by_w = {}
        groups: dict[int, list[int]] = {}
        for i, t in enumerate(self.templates):
            groups.setdefault(t.w, []).append(i)
        for w, idxs in groups.items():
            stack = np.stack([self.templates[i].image for i in idxs]).astype(np.float32)
            self._by_w[w] = (stack, idxs)
        self._dirty_index = False

    def match(self, img: np.ndarray, x_height: int, baseline: int, y0: int, y1: int,
              min_accept: float = MIN_ACCEPT) -> Match:
        self._index()
        if not self.templates:
            return Match(None, 0.0, None)
        h, w = img.shape[:2]
        rel_h, rel_w = h / x_height, w / x_height
        rel_top = (baseline - y0) / x_height
        norm = normalize_bitmap(img)
        cw = norm.shape[1]
        tol = max(2, int(round(0.15 * cw)))
        cands: list[tuple[float, int]] = []
        for tw, (stack, idxs) in self._by_w.items():
            if abs(tw - cw) > tol:
                continue
            a = norm if tw == cw else cv2.resize(norm, (tw, NORM_H), interpolation=cv2.INTER_LINEAR)
            scores = _soft_dice(a, stack)
            for s, i in zip(scores, idxs):
                t = self.templates[i]
                # size / position gate relative to the line's x-height
                if abs(t.rel_h - rel_h) > 0.28 * max(t.rel_h, rel_h, 0.5):
                    continue
                if abs(t.rel_w - rel_w) > 0.28 * max(t.rel_w, rel_w, 0.5):
                    continue
                if abs(t.rel_top - rel_top) > 0.45:
                    continue
                cands.append((float(s), i))
        if not cands:
            return Match(None, 0.0, None)
        cands.sort(reverse=True)
        best_s, best_i = cands[0]
        best = self.templates[best_i]
        second_label, second_s = None, 0.0
        for s, i in cands[1:]:
            if self.templates[i].label != best.label:
                second_label, second_s = self.templates[i].label, s
                break
        need = min_accept
        if _is_short_label(best.label):
            need = max(min_accept, MIN_ACCEPT_DIGIT if any(c in DIGITS for c in best.label) else MIN_ACCEPT_SHORT)
        if best_s < need:
            return Match(None, best_s, best.id, second_label=best.label, second_score=best_s)
        ambiguous = second_label is not None and (best_s - second_s) < AMBIGUOUS_MARGIN
        if ambiguous and _is_short_label(best.label) and second_label and _is_short_label(second_label) \
                and (best.label in DIGITS or second_label in DIGITS):
            # two different digits both fit: refuse rather than guess
            return Match(None, best_s, best.id, second_label=best.label, second_score=best_s)
        return Match(best.label, best_s, best.id, ambiguous, second_label, second_s)

    def labels(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for t in self.templates:
            out[t.label] = out.get(t.label, 0) + t.count
        return out


def list_profiles(root: str) -> list[str]:
    if not os.path.isdir(root):
        return []
    return sorted(d for d in os.listdir(root) if os.path.exists(os.path.join(root, d, "templates.json")))
