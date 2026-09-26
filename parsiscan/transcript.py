"""Build templates from a scanned page plus its typed transcript.

When no digital source exists, a person types (or pastes) the text of one
scanned page, one line per printed line. Every line is split into PAWs by
the Persian joining rules and aligned with the shapes found on that line.
A line (or word) is used only when the shape count matches exactly, so a
typo or an unusual ligature skips that piece instead of mislabelling it.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .fontboot import split_paws
from .library import Library
from .preprocess import preprocess
from .segment import Line, segment_page
from .textnorm import is_ltr_char, normalize

_PUNCT = set("،,.:;!?()[]{}«»/-_\"'%")


@dataclass
class AlignStats:
    lines_total: int = 0
    lines_used: int = 0
    words_used: int = 0
    words_skipped: int = 0
    templates_added: int = 0


_COMBINING = set("\u064b\u064c\u064d\u064e\u064f\u0650\u0651\u0652\u0670")


def expected_paws(word: str) -> list[str]:
    """Expected shapes for one typed word in *logical* order.

    Digits and Latin letters are one shape each; punctuation is split off
    as its own shape; Persian letters follow the joining rules; combining
    marks (tanween, tashdid) stay with the shape before them.
    """
    word = normalize(word)
    out: list[str] = []
    buf = ""

    def flush():
        nonlocal buf
        if buf:
            out.extend(split_paws(buf))
            buf = ""

    for ch in word:
        if ch in _COMBINING:
            if buf:
                buf += ch
            elif out:
                out[-1] += ch
            continue
        if is_ltr_char(ch) or ch in _PUNCT:
            flush()
            out.append(ch)
        else:
            buf += ch
    flush()
    return out


def _is_ltr_item(item: str) -> bool:
    return all(is_ltr_char(c) for c in item)


def expected_paws_visual(word: str) -> list[str]:
    """Expected shapes in the order they appear from right to left on paper:
    Persian shapes keep logical order, every run of digits/Latin (with the
    punctuation inside it) is reversed."""
    items = expected_paws(word)
    out: list[str] = []
    i = 0
    while i < len(items):
        if _is_ltr_item(items[i]):
            j = i
            while j < len(items) and (_is_ltr_item(items[j]) or
                                      (items[j] in _PUNCT and j + 1 < len(items) and _is_ltr_item(items[j + 1]))):
                j += 1
            out.extend(items[i:j][::-1])
            i = j
        else:
            out.append(items[i])
            i += 1
    return out


def _line_words(line: Line) -> list[list]:
    words: list[list] = []
    cur_idx = None
    for p in line.paws:
        if p.word_index != cur_idx:
            words.append([])
            cur_idx = p.word_index
        words[-1].append(p)
    return words


def expected_structure(text: str) -> list[tuple[str, int]]:
    """[(label, word_id)] in visual right-to-left order."""
    out: list[tuple[str, int]] = []
    for wi, w in enumerate(normalize(text).split()):
        for e in expected_paws_visual(w):
            out.append((e, wi))
    return out


def _signature(items: list[int]) -> list[int]:
    """Run lengths of consecutive equal word ids -> PAWs per word."""
    sig: list[int] = []
    prev = None
    for w in items:
        if w != prev:
            sig.append(0)
            prev = w
        sig[-1] += 1
    return sig


def _letters(label: str) -> int:
    return sum(1 for c in label if c not in _COMBINING and c not in _PUNCT)


def plausible(label: str, paw, line: Line) -> bool:
    """A label must fit the shape: k letters need roughly k * 0.3 to
    k * 1.6 x-heights of width; a dot-sized shape never spells a word."""
    k = max(1, _letters(label))
    rel_w = paw.w / max(1, line.x_height)
    rel_h = paw.h / max(1, line.x_height)
    if rel_w < 0.12 * k or rel_w > 1.6 * k + 0.6:
        return False
    if rel_h < 0.3 and rel_w < 0.5:
        return False
    return True


def safe_add(library: Library, label: str, paw, line: Line, source: str) -> bool:
    """Add a template unless the label is implausible for the shape or the
    shape already matches a *different* label strongly; either means the
    transcript or the segmentation is wrong here, so nothing is stored."""
    if not plausible(label, paw, line):
        return False
    m = library.match(paw.image, line.x_height, line.baseline, paw.y0, paw.y1, min_accept=0.9)
    if m.label is not None and m.label != label:
        return False
    return library.add(label, paw.image, line.x_height, line.baseline, paw.y0, paw.y1, source=source) is not None


def align_line(line: Line, text: str) -> list[tuple]:
    """Exact pass: the per-word shape counts of the whole line must match
    the transcript exactly (a strong signature), then shapes pair 1:1."""
    exp = expected_structure(text)
    if not exp or len(exp) != len(line.paws):
        return []
    if _signature([w for _, w in exp]) != _signature([p.word_index for p in line.paws]):
        return []
    return [(p, lab) for p, (lab, _) in zip(line.paws, exp)]


def match_lines(lines: list[Line], typed: list[str]) -> list[tuple[int, int]]:
    """Align segmented lines with typed lines (typed lines may be blank for
    graphics; segmented lines may have no transcript). Needleman-Wunsch on
    shape counts."""
    typed = list(typed)
    while typed and not typed[-1].strip():
        typed.pop()
    n, m = len(lines), len(typed)
    exp_counts = [len(expected_structure(t)) for t in typed]
    obs_counts = [len(ln.paws) for ln in lines]
    gap = 0.8
    INF = float("inf")
    dp = [[INF] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0
    for i in range(n + 1):
        for j in range(m + 1):
            if dp[i][j] == INF:
                continue
            if i < n and j < m:
                a, b = obs_counts[i], exp_counts[j]
                cost = abs(a - b) / max(a, b, 1)
                if b == 0:
                    cost = 1.5
                if dp[i][j] + cost < dp[i + 1][j + 1]:
                    dp[i + 1][j + 1] = dp[i][j] + cost
                    back[i + 1][j + 1] = (i, j)
            if i < n and dp[i][j] + gap < dp[i + 1][j]:
                dp[i + 1][j] = dp[i][j] + gap
                back[i + 1][j] = (i, j)
            if j < m and dp[i][j] + gap < dp[i][j + 1]:
                dp[i][j + 1] = dp[i][j] + gap
                back[i][j + 1] = (i, j)
    pairs = []
    i, j = n, m
    while (i, j) != (0, 0):
        pi, pj = back[i][j]
        if pi == i - 1 and pj == j - 1:
            pairs.append((pi, pj))
        i, j = pi, pj
    pairs.reverse()
    return [(a, b) for a, b in pairs if typed[b].strip()]


def bootstrap_from_transcript(bgr: np.ndarray, transcript_lines: list[str], library: Library, dpi: int = 300,
                              word_gap_ratio: float | None = None, source: str = "transcript",
                              fix_orientation: bool = True) -> AlignStats:
    pre = preprocess(bgr, dpi, fix_orientation=fix_orientation)
    wg = word_gap_ratio or library.meta.get("word_gap_ratio")
    lines = segment_page(pre.binary, dpi, wg)
    stats = AlignStats(lines_total=len(lines))
    for li, ti in match_lines(lines, transcript_lines):
        ln, text = lines[li], transcript_lines[ti]
        pairs = align_line(ln, text)
        if not pairs:
            stats.words_skipped += len(text.split())
            continue
        stats.lines_used += 1
        stats.words_used += len(text.split())
        for paw, label in pairs:
            if safe_add(library, label, paw, ln, source):
                stats.templates_added += 1
    library.save()
    return stats


def best_word_gap(bgr: np.ndarray, transcript_lines: list[str], dpi: int = 300) -> float:
    """Word-gap ratio under which the most lines match the transcript's
    per-word shape-count signature exactly."""
    pre = preprocess(bgr, dpi)
    best, best_hits = 0.45, -1
    for ratio in np.arange(0.25, 0.9, 0.05):
        lines = segment_page(pre.binary, dpi, float(ratio))
        hits = 0
        for li, ti in match_lines(lines, transcript_lines):
            if align_line(lines[li], transcript_lines[ti]):
                hits += 1
        if hits > best_hits:
            best, best_hits = float(round(ratio, 2)), hits
    return best


# ------------------------------------------------------------ anchored pass
def _lcs_anchors(obs_labels: list[str | None], exp: list[str]) -> list[tuple[int, int]]:
    """Longest common subsequence between recognised labels and expected
    labels -> monotone list of (obs_index, exp_index) anchors."""
    n, m = len(obs_labels), len(exp)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            if obs_labels[i] is not None and obs_labels[i] == exp[j]:
                dp[i][j] = dp[i + 1][j + 1] + 1
            else:
                dp[i][j] = max(dp[i + 1][j], dp[i][j + 1])
    out = []
    i = j = 0
    while i < n and j < m:
        if obs_labels[i] is not None and obs_labels[i] == exp[j]:
            out.append((i, j))
            i += 1
            j += 1
        elif dp[i + 1][j] >= dp[i][j + 1]:
            i += 1
        else:
            j += 1
    return out


def _merged_label(items: list[str]) -> str | None:
    """Label for one shape that covers several expected shapes."""
    if all(_is_ltr_item(x) or x in _PUNCT for x in items):
        if not any(_is_ltr_item(x) for x in items):
            return None
        return "".join(items[::-1])          # visual RTL -> logical LTR
    if any(_is_ltr_item(x) for x in items):
        return None
    return "".join(items)


def align_line_anchored(line: Line, text: str, library: Library, max_merge: int = 3,
                        require_full: bool = False, min_anchor_frac: float = 0.2) -> list[tuple]:
    """Label the shapes between shapes the library already recognises.

    Anchors are exact, unambiguous matches. Between two consecutive anchors
    the observed and expected runs must have the same length *and* the same
    word-boundary pattern (pair 1:1), or a single observed shape may cover
    up to ``max_merge`` expected shapes of one word (letters touching in
    the font). Anything else is skipped.
    """
    exp = expected_structure(text)
    obs = line.paws
    if not exp or not obs:
        return []
    labels: list[str | None] = []
    for p in obs:
        m = library.match(p.image, line.x_height, line.baseline, p.y0, p.y1, min_accept=0.9)
        labels.append(m.label if (m.label and not m.ambiguous) else None)
    anchors = _lcs_anchors(labels, [e for e, _ in exp])
    if len(anchors) < 3 or len(anchors) < min_anchor_frac * len(exp):
        return []
    pairs: list[tuple] = []
    bounds = [(-1, -1)] + anchors + [(len(obs), len(exp))]
    for (i1, j1), (i2, j2) in zip(bounds, bounds[1:]):
        o = obs[i1 + 1:i2]
        e = exp[j1 + 1:j2]
        if not o and not e:
            continue
        resolved = False
        if len(o) == len(e):
            if _signature([w for _, w in e]) == _signature([p.word_index for p in o]):
                pairs.extend((p, lab) for p, (lab, _) in zip(o, e))
                resolved = True
        elif len(o) == 1 and 1 < len(e) <= max_merge and len({w for _, w in e}) == 1:
            lab = _merged_label([x for x, _ in e])
            if lab:
                pairs.append((o[0], lab))
                resolved = True
        if not resolved and require_full:
            return []
    return pairs


def bootstrap_from_transcript_iterative(bgr: np.ndarray, transcript_lines: list[str], library: Library, dpi: int = 300,
                                        word_gap_ratio: float | None = None, source: str = "transcript",
                                        passes: int = 4, min_confirm: int = 2) -> dict:
    """Exact-signature lines first; then anchored passes whose candidate
    labels are stored only when the same shape carries the same label on at
    least ``min_confirm`` different lines (a one-off alignment error never
    becomes a template)."""
    import cv2
    from .library import NORM_H, _soft_dice, normalize_bitmap

    first = bootstrap_from_transcript(bgr, transcript_lines, library, dpi, word_gap_ratio, source)
    pre = preprocess(bgr, dpi)
    wg = word_gap_ratio or library.meta.get("word_gap_ratio")
    lines = segment_page(pre.binary, dpi, wg)
    matched = match_lines(lines, transcript_lines)
    history = [first.templates_added]
    for _ in range(passes):
        # gather candidates: label -> list of (paw, line, line_index, norm)
        cands: dict[str, list] = {}
        for li, ti in matched:
            ln, text = lines[li], transcript_lines[ti]
            for paw, label in align_line_anchored(ln, text, library):
                if plausible(label, paw, ln):
                    cands.setdefault(label, []).append((paw, ln, li, normalize_bitmap(paw.image)))
        added = 0
        for label, items in cands.items():
            # cluster by shape; accept clusters seen on >= min_confirm distinct lines
            used = [False] * len(items)
            for i, (paw, ln, li, norm) in enumerate(items):
                if used[i]:
                    continue
                members = [i]
                for j in range(i + 1, len(items)):
                    if used[j]:
                        continue
                    other = items[j][3]
                    if abs(other.shape[1] - norm.shape[1]) > max(2, int(0.15 * norm.shape[1])):
                        continue
                    a = other if other.shape[1] == norm.shape[1] else cv2.resize(other, (norm.shape[1], NORM_H))
                    if float(_soft_dice(a, norm[None])[0]) >= 0.9:
                        members.append(j)
                for j in members:
                    used[j] = True
                lines_seen = {items[j][2] for j in members}
                if len(lines_seen) >= min_confirm:
                    for j in members[:3]:
                        p_, ln_, _, _ = items[j]
                        if safe_add(library, label, p_, ln_, source + ":confirmed"):
                            added += 1
        history.append(added)
        if added == 0:
            break
    library.save()
    return {"exact": first.templates_added, "exact_lines": first.lines_used, "anchored_passes": history[1:],
            "total": len(library.templates)}


# ------------------------------------------------------- consistency prune
def prune_by_transcript(bgr: np.ndarray, transcript_lines: list[str], library: Library, dpi: int = 300,
                        word_gap_ratio: float | None = None) -> dict:
    """Re-read the page with the library and drop every template that
    disagrees with the transcript more often than it agrees.

    For each recognised shape, the template that produced it scores a hit
    when its label occurs among the expected shapes of that line, else a
    miss. Templates with more misses than hits are removed.
    """
    pre = preprocess(bgr, dpi)
    wg = word_gap_ratio or library.meta.get("word_gap_ratio")
    lines = segment_page(pre.binary, dpi, wg)
    hits: dict[str, int] = {}
    misses: dict[str, int] = {}
    for li, ti in match_lines(lines, transcript_lines):
        ln, text = lines[li], transcript_lines[ti]
        expected = [e for e, _ in expected_structure(text)]
        for p in ln.paws:
            m = library.match(p.image, ln.x_height, ln.baseline, p.y0, p.y1)
            if m.label is None or m.template_id is None:
                continue
            if m.label in expected:
                hits[m.template_id] = hits.get(m.template_id, 0) + 1
            else:
                misses[m.template_id] = misses.get(m.template_id, 0) + 1
    removed = []
    for t in list(library.templates):
        h, mi = hits.get(t.id, 0), misses.get(t.id, 0)
        if mi > h:
            removed.append((t.label, h, mi))
            library.remove(t.id)
    library.save()
    return {"removed": len(removed), "examples": removed[:12], "total": len(library.templates)}
