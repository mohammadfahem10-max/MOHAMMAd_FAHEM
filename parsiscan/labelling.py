"""Group unrecognised shapes so a person labels each distinct shape once."""
from __future__ import annotations

import os
from dataclasses import dataclass, field

import cv2
import numpy as np

from .library import NORM_H, Library, _soft_dice, normalize_bitmap
from .pipeline import DocumentOut


@dataclass
class Item:
    page: int
    line: int
    paw: int
    crop: str
    x_height: int
    baseline: int
    box: tuple[int, int, int, int]
    status: str
    guess: str | None
    image: np.ndarray | None = None
    norm: np.ndarray | None = None


@dataclass
class Cluster:
    rep: Item
    members: list[Item] = field(default_factory=list)

    @property
    def size(self) -> int:
        return len(self.members)


def collect_items(doc: DocumentOut, statuses=("unknown", "ambiguous", "low")) -> list[Item]:
    items: list[Item] = []
    for pg in doc.pages:
        if pg.source != "template":
            continue
        for li, ln in enumerate(pg.lines):
            for qi, p in enumerate(ln.paws):
                if p.status in statuses and p.crop and os.path.exists(p.crop):
                    raw = cv2.imread(p.crop, cv2.IMREAD_GRAYSCALE)
                    if raw is None:
                        continue
                    img = ((255 - raw) > 127).astype(np.uint8) * 255
                    items.append(Item(pg.index, li, qi, p.crop, ln.x_height, ln.baseline, tuple(p.box), p.status,
                                      p.alt if p.status != "unknown" else p.label, img, normalize_bitmap(img)))
    return items


def cluster_items(items: list[Item], thresh: float = 0.9) -> list[Cluster]:
    clusters: list[Cluster] = []
    for it in items:
        rel_h = (it.box[3] - it.box[1]) / max(1, it.x_height)
        placed = False
        for c in clusters:
            r = c.rep
            r_rel_h = (r.box[3] - r.box[1]) / max(1, r.x_height)
            if abs(r_rel_h - rel_h) > 0.25 * max(rel_h, r_rel_h, 0.5):
                continue
            if abs(r.norm.shape[1] - it.norm.shape[1]) > max(2, int(0.15 * it.norm.shape[1])):
                continue
            a = it.norm if it.norm.shape[1] == r.norm.shape[1] else cv2.resize(it.norm, (r.norm.shape[1], NORM_H))
            if float(_soft_dice(a, r.norm[None])[0]) >= thresh:
                c.members.append(it)
                placed = True
                break
        if not placed:
            clusters.append(Cluster(rep=it, members=[it]))
    clusters.sort(key=lambda c: -c.size)
    return clusters


def apply_labels(library: Library, clusters: list[Cluster], labels: dict[int, str], max_per_cluster: int = 3,
                 source: str = "") -> int:
    """labels: cluster index -> text ('' = noise, None/missing = skip)."""
    added = 0
    for idx, text in labels.items():
        if idx < 0 or idx >= len(clusters):
            continue
        c = clusters[idx]
        for it in c.members[:max_per_cluster]:
            t = library.add(text, it.image, it.x_height, it.baseline, it.box[1], it.box[3], source=source)
            if t is not None:
                added += 1
    library.save()
    return added
