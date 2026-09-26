"""Web app: upload documents, review extracted text, label unknown shapes.

    python app.py            # http://127.0.0.1:5000
"""
from __future__ import annotations

import json
import os
import shutil
import uuid
from dataclasses import asdict

from flask import Flask, abort, flash, redirect, render_template, request, send_file, url_for

from parsiscan.export import write_outputs
from parsiscan.labelling import apply_labels, cluster_items, collect_items
from parsiscan.library import Library, list_profiles
from parsiscan.pipeline import Processor, UNKNOWN_MARK

BASE = os.path.dirname(os.path.abspath(__file__))
LIBS = os.environ.get("PARSISCAN_LIBRARIES", os.path.join(BASE, "libraries"))
DATA = os.environ.get("PARSISCAN_DATA", os.path.join(BASE, "data"))
JOBS = os.path.join(DATA, "jobs")
os.makedirs(JOBS, exist_ok=True)

app = Flask(__name__, template_folder=os.path.join(BASE, "templates"), static_folder=os.path.join(BASE, "static"))
app.secret_key = os.environ.get("PARSISCAN_SECRET", "parsiscan-dev")
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024

ALLOWED = {".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}


# ------------------------------------------------------------------ helpers
def _job_dir(job_id: str) -> str:
    d = os.path.join(JOBS, job_id)
    if not os.path.isdir(d) or "/" in job_id or ".." in job_id:
        abort(404)
    return d


def _load_job(job_id: str) -> dict:
    with open(os.path.join(_job_dir(job_id), "job.json"), encoding="utf-8") as fh:
        return json.load(fh)


def _save_job(job_id: str, meta: dict) -> None:
    with open(os.path.join(_job_dir(job_id), "job.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=1)


def _run_job(job_id: str) -> None:
    meta = _load_job(job_id)
    d = _job_dir(job_id)
    work = os.path.join(d, "work")
    shutil.rmtree(work, ignore_errors=True)
    proc = Processor(LIBS, meta.get("profile") or None, work, dpi=int(meta.get("dpi", 300)))
    doc = proc.process(os.path.join(d, meta["input"]), prefer_text_layer=not meta.get("no_text_layer"))
    outs = write_outputs(doc, work)
    meta["outputs"] = outs
    meta["pages"] = [asdict(p) for p in doc.pages]
    meta["summary"] = _summary(meta["pages"])
    _save_job(job_id, meta)


def _summary(pages: list[dict]) -> dict:
    s = {"pages": len(pages), "text_layer": 0, "template": 0, "handwritten": 0, "empty": 0,
         "ok": 0, "unknown": 0, "ambiguous": 0, "low": 0, "bad_numbers": 0}
    for p in pages:
        s[p["source"]] += 1
        for k in ("ok", "unknown", "ambiguous", "low"):
            s[k] += p["stats"].get(k, 0)
        s["bad_numbers"] += sum(1 for n in p.get("numbers", []) if not n["valid"])
    total = s["ok"] + s["unknown"] + s["ambiguous"] + s["low"]
    s["match_rate"] = round(100 * s["ok"] / total, 1) if total else None
    return s


def _rel(job_dir: str, path: str | None) -> str | None:
    if not path:
        return None
    return os.path.relpath(path, job_dir)


def _all_jobs() -> list[dict]:
    out = []
    for jid in sorted(os.listdir(JOBS), reverse=True):
        p = os.path.join(JOBS, jid, "job.json")
        if os.path.exists(p):
            with open(p, encoding="utf-8") as fh:
                m = json.load(fh)
            m["id"] = jid
            out.append(m)
    return out


# ------------------------------------------------------------------- routes
@app.route("/")
def index():
    profiles = []
    for name in list_profiles(LIBS):
        lib = Library(name, LIBS).load()
        profiles.append({"name": name, "templates": len(lib.templates), "labels": len(lib.labels()),
                         "word_gap": lib.meta.get("word_gap_ratio")})
    return render_template("index.html", profiles=profiles, jobs=_all_jobs()[:30])


@app.post("/extract")
def extract():
    files = request.files.getlist("files")
    profile = request.form.get("profile") or ""
    if not files or all(not f.filename for f in files):
        flash("فایلی انتخاب نشده است.")
        return redirect(url_for("index"))
    job_ids = []
    for f in files:
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in ALLOWED:
            flash(f"فرمت پشتیبانی نمی‌شود: {f.filename}")
            continue
        jid = uuid.uuid4().hex[:10]
        d = os.path.join(JOBS, jid)
        os.makedirs(d)
        fname = "input" + ext
        f.save(os.path.join(d, fname))
        _save_job(jid, {"input": fname, "original_name": f.filename, "profile": profile,
                        "no_text_layer": bool(request.form.get("no_text_layer")), "dpi": int(request.form.get("dpi") or 300)})
        _run_job(jid)
        job_ids.append(jid)
    if not job_ids:
        return redirect(url_for("index"))
    return redirect(url_for("job", job_id=job_ids[0]))


@app.get("/job/<job_id>")
def job(job_id):
    meta = _load_job(job_id)
    d = _job_dir(job_id)
    pages = []
    for p in meta.get("pages", []):
        q = dict(p)
        q["image_rel"] = _rel(d, p.get("image"))
        q["html_text"] = p["text"].replace(UNKNOWN_MARK, f'<span class="unk">{UNKNOWN_MARK}</span>')
        pages.append(q)
    return render_template("job.html", job=meta, job_id=job_id, pages=pages, unknown_mark=UNKNOWN_MARK,
                           profiles=list_profiles(LIBS))


@app.post("/job/<job_id>/rerun")
def rerun(job_id):
    meta = _load_job(job_id)
    if "profile" in request.form:
        meta["profile"] = request.form.get("profile") or ""
    meta["no_text_layer"] = bool(request.form.get("no_text_layer"))
    _save_job(job_id, meta)
    _run_job(job_id)
    return redirect(url_for("job", job_id=job_id))


@app.get("/job/<job_id>/file/<path:rel>")
def job_file(job_id, rel):
    d = _job_dir(job_id)
    full = os.path.normpath(os.path.join(d, rel))
    if not full.startswith(d) or not os.path.exists(full):
        abort(404)
    return send_file(full)


@app.get("/job/<job_id>/download/<kind>")
def download(job_id, kind):
    meta = _load_job(job_id)
    path = (meta.get("outputs") or {}).get(kind)
    if not path or not os.path.exists(path):
        abort(404)
    base = os.path.splitext(meta.get("original_name") or "result")[0]
    return send_file(path, as_attachment=True, download_name=f"{base}.{kind}")


@app.post("/job/<job_id>/delete")
def delete_job(job_id):
    shutil.rmtree(_job_dir(job_id))
    return redirect(url_for("index"))


# --------------------------------------------------------------- labelling
def _doc_from_meta(meta: dict):
    from parsiscan.pipeline import DocumentOut, LineOut, PageOut, PawOut
    pages = []
    for p in meta.get("pages", []):
        lines = [LineOut(box=tuple(l["box"]), text=l["text"], paws=[PawOut(**{**q, "box": tuple(q["box"])}) for q in l["paws"]],
                         x_height=l.get("x_height", 0), baseline=l.get("baseline", 0)) for l in p["lines"]]
        pages.append(PageOut(index=p["index"], source=p["source"], text=p["text"], lines=lines, image=p.get("image"),
                             width=p["width"], height=p["height"], stats=p["stats"], numbers=p.get("numbers", [])))
    return DocumentOut(path=meta["input"], profile=meta.get("profile"), pages=pages)


@app.get("/job/<job_id>/label")
def label(job_id):
    meta = _load_job(job_id)
    d = _job_dir(job_id)
    if not meta.get("profile"):
        flash("برای برچسب‌زنی اول یک پروفایل انتخاب کنید.")
        return redirect(url_for("job", job_id=job_id))
    items = collect_items(_doc_from_meta(meta))
    clusters = cluster_items(items)
    view = []
    for i, c in enumerate(clusters[:200]):
        view.append({"index": i, "size": c.size, "status": c.rep.status, "guess": c.rep.guess,
                     "crops": [_rel(d, m.crop) for m in c.members[:6]], "page": c.rep.page + 1})
    return render_template("label.html", job=meta, job_id=job_id, clusters=view, total=len(clusters))


@app.post("/job/<job_id>/label")
def label_post(job_id):
    meta = _load_job(job_id)
    items = collect_items(_doc_from_meta(meta))
    clusters = cluster_items(items)
    labels: dict[int, str] = {}
    for key, val in request.form.items():
        if key.startswith("noise_"):
            labels[int(key[6:])] = ""
    for key, val in request.form.items():
        if key.startswith("label_") and val.strip():
            idx = int(key[6:])
            if idx not in labels:
                labels[idx] = val.strip()
    lib = Library(meta["profile"], LIBS).load()
    added = apply_labels(lib, clusters, labels, source=f"label:{meta.get('original_name', job_id)}")
    flash(f"{added} الگوی جدید به پروفایل «{meta['profile']}» اضافه شد. سند دوباره خوانده شد.")
    _run_job(job_id)
    if request.form.get("continue"):
        return redirect(url_for("label", job_id=job_id))
    return redirect(url_for("job", job_id=job_id))


# ---------------------------------------------------------------- profiles
@app.get("/profiles")
def profiles():
    rows = []
    for name in list_profiles(LIBS):
        lib = Library(name, LIBS).load()
        labels = sorted(lib.labels().items(), key=lambda kv: -kv[1])
        rows.append({"name": name, "templates": len(lib.templates), "labels": len(labels), "top": labels[:40],
                     "meta": lib.meta})
    return render_template("profiles.html", profiles=rows)


@app.post("/profiles/new")
def profile_new():
    name = (request.form.get("name") or "").strip()
    if not name or "/" in name or "\\" in name or ".." in name:
        flash("نام پروفایل نامعتبر است.")
        return redirect(url_for("profiles"))
    lib = Library(name, LIBS).load()
    lib.save()
    flash(f"پروفایل «{name}» ساخته شد.")
    return redirect(url_for("profiles"))


@app.post("/profiles/<name>/bootstrap-pdf")
def profile_bootstrap_pdf(name):
    from parsiscan.bootstrap import bootstrap_from_pdf
    from parsiscan.calibrate import calibrate_word_gap
    f = request.files.get("pdf")
    if not f or not f.filename.lower().endswith(".pdf"):
        flash("یک فایل PDF دیجیتال انتخاب کنید.")
        return redirect(url_for("profiles"))
    tmp = os.path.join(DATA, "tmp")
    os.makedirs(tmp, exist_ok=True)
    path = os.path.join(tmp, uuid.uuid4().hex + ".pdf")
    f.save(path)
    lib = Library(name, LIBS).load()
    r = bootstrap_from_pdf(path, lib, source=f"pdf:{f.filename}")
    c = calibrate_word_gap(path, lib)
    os.remove(path)
    flash(f"الگوبرداری از «{f.filename}»: {r['added']} الگوی جدید، {r['duplicates']} تکراری، مجموع {r['total']}. "
          f"فاصله‌ی کلمات: {c.get('word_gap_ratio')} (دقت {c.get('accuracy')})")
    return redirect(url_for("profiles"))


@app.post("/profiles/<name>/bootstrap-font")
def profile_bootstrap_font(name):
    from parsiscan.fontboot import bootstrap_from_font
    f = request.files.get("font")
    if not f or os.path.splitext(f.filename)[1].lower() not in (".ttf", ".otf"):
        flash("یک فایل فونت (ttf/otf) انتخاب کنید.")
        return redirect(url_for("profiles"))
    tmp = os.path.join(DATA, "tmp")
    os.makedirs(tmp, exist_ok=True)
    path = os.path.join(tmp, uuid.uuid4().hex + os.path.splitext(f.filename)[1].lower())
    f.save(path)
    sizes = [int(x) for x in (request.form.get("sizes") or "36,48,60").split(",") if x.strip().isdigit()]
    words = None
    wf = request.files.get("words")
    if wf and wf.filename:
        words = wf.read().decode("utf-8", "ignore").split()
    lib = Library(name, LIBS).load()
    r = bootstrap_from_font(path, lib, sizes, words)
    os.remove(path)
    flash(f"الگوبرداری از فونت «{f.filename}»: {r['added']} الگو اضافه شد، {r['skipped_words']} کلمه رد شد، مجموع {r['total']}.")
    return redirect(url_for("profiles"))


@app.post("/profiles/<name>/delete")
def profile_delete(name):
    d = os.path.join(LIBS, name)
    if os.path.isdir(d) and "/" not in name and ".." not in name:
        shutil.rmtree(d)
        flash(f"پروفایل «{name}» حذف شد.")
    return redirect(url_for("profiles"))


@app.get("/profiles/<name>/glyph/<tid>.png")
def glyph(name, tid):
    p = os.path.join(LIBS, name, "glyphs", f"{tid}.png")
    if not os.path.exists(p):
        abort(404)
    return send_file(p)


if __name__ == "__main__":
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "5000")), debug=False)
