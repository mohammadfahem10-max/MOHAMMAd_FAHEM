"""Command line interface.

  python -m parsiscan extract FILE... --profile NAME --out DIR
  python -m parsiscan bootstrap-pdf PDF --profile NAME
  python -m parsiscan bootstrap-font FONT.ttf --profile NAME --sizes 40,56
  python -m parsiscan calibrate PDF --profile NAME
  python -m parsiscan profiles
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from .export import write_outputs
from .library import Library, list_profiles
from .pipeline import Processor

DEFAULT_LIBS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "libraries")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="parsiscan", description="استخراج متن فارسی از اسکن با تطبیق الگو (بدون هوش مصنوعی)")
    ap.add_argument("--libraries", default=DEFAULT_LIBS, help="پوشه‌ی کتابخانه‌های الگو")
    sub = ap.add_subparsers(dest="cmd", required=True)

    e = sub.add_parser("extract", help="استخراج متن از PDF یا تصویر")
    e.add_argument("files", nargs="+")
    e.add_argument("--profile", default=None, help="نام پروفایل فونت/اداره")
    e.add_argument("--out", default="out")
    e.add_argument("--dpi", type=int, default=300)
    e.add_argument("--no-text-layer", action="store_true", help="متن دیجیتال PDF را نادیده بگیر و همیشه تصویر را بخوان")

    b = sub.add_parser("bootstrap-pdf", help="الگوبرداری خودکار از PDF دارای متن دیجیتال")
    b.add_argument("pdf")
    b.add_argument("--profile", required=True)
    b.add_argument("--pages", default=None, help="مثلاً 0,1")

    f = sub.add_parser("bootstrap-font", help="الگوبرداری از فایل فونت")
    f.add_argument("font")
    f.add_argument("--profile", required=True)
    f.add_argument("--sizes", default="36,48,60", help="اندازه‌های پیکسلی فونت")
    f.add_argument("--words", default=None, help="فایل متنی فهرست کلمات (اختیاری)")
    f.add_argument("--upscale", type=int, default=1, help="رندر کوچک و بزرگ‌نمایی (مثلاً 4) برای شبیه‌سازی اسکن کم‌کیفیت")

    t = sub.add_parser("bootstrap-transcript", help="الگوبرداری از یک صفحه‌ی اسکن به همراه متن تایپ‌شده‌ی همان صفحه")
    t.add_argument("file", help="PDF یا تصویر")
    t.add_argument("--page", type=int, default=1, help="شماره‌ی صفحه (از 1)")
    t.add_argument("--text", required=True, help="فایل متنی: هر خط چاپی یک خط")
    t.add_argument("--profile", required=True)

    c = sub.add_parser("calibrate", help="کالیبره کردن فاصله‌ی کلمات از PDF دیجیتال")
    c.add_argument("pdf")
    c.add_argument("--profile", required=True)

    sub.add_parser("profiles", help="فهرست پروفایل‌ها")

    args = ap.parse_args(argv)

    if args.cmd == "profiles":
        for p in list_profiles(args.libraries):
            lib = Library(p, args.libraries).load()
            print(f"{p}\t{len(lib.templates)} الگو\t{len(lib.labels())} برچسب")
        return 0

    if args.cmd == "bootstrap-pdf":
        from .bootstrap import bootstrap_from_pdf
        from .calibrate import calibrate_word_gap
        lib = Library(args.profile, args.libraries).load()
        pages = [int(x) for x in args.pages.split(",")] if args.pages else None
        print(json.dumps(bootstrap_from_pdf(args.pdf, lib, pages=pages), ensure_ascii=False))
        print(json.dumps(calibrate_word_gap(args.pdf, lib, pages=pages), ensure_ascii=False))
        return 0

    if args.cmd == "bootstrap-font":
        from .fontboot import bootstrap_from_font
        lib = Library(args.profile, args.libraries).load()
        words = None
        if args.words:
            with open(args.words, encoding="utf-8") as fh:
                words = fh.read().split()
        sizes = [int(x) for x in args.sizes.split(",")]
        print(json.dumps(bootstrap_from_font(args.font, lib, sizes, words, upscale=args.upscale), ensure_ascii=False))
        return 0

    if args.cmd == "bootstrap-transcript":
        from .preprocess import load_page_images
        from .transcript import best_word_gap, bootstrap_from_transcript_iterative
        lib = Library(args.profile, args.libraries).load()
        bgr = load_page_images(args.file)[args.page - 1]
        with open(args.text, encoding="utf-8") as fh:
            lines = fh.read().split("\n")
        if not lib.meta.get("word_gap_ratio"):
            lib.meta["word_gap_ratio"] = best_word_gap(bgr, lines)
            lib.save()
        r = bootstrap_from_transcript_iterative(bgr, lines, lib, word_gap_ratio=lib.meta["word_gap_ratio"],
                                                source=f"transcript:{os.path.basename(args.file)}#{args.page}")
        print(json.dumps(r, ensure_ascii=False))
        return 0

    if args.cmd == "calibrate":
        from .calibrate import calibrate_word_gap
        lib = Library(args.profile, args.libraries).load()
        print(json.dumps(calibrate_word_gap(args.pdf, lib), ensure_ascii=False))
        return 0

    if args.cmd == "extract":
        os.makedirs(args.out, exist_ok=True)
        for path in args.files:
            name = os.path.splitext(os.path.basename(path))[0]
            work = os.path.join(args.out, name)
            proc = Processor(args.libraries, args.profile, work, dpi=args.dpi)
            doc = proc.process(path, prefer_text_layer=not args.no_text_layer)
            outs = write_outputs(doc, work)
            for p in doc.pages:
                print(f"{name} صفحه {p.index + 1}: {p.source} {p.stats}", file=sys.stderr)
            print(outs["txt"])
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
