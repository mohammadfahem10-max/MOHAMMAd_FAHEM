"""Desktop application (PySide6 / Qt).

    python ParsiScan.py

Everything runs locally and offline. The window is right-to-left; Qt shapes
Persian text correctly on Windows, Linux and macOS.
"""
from __future__ import annotations

import os
import shutil
import sys
import uuid
from dataclasses import asdict

from PySide6.QtCore import QObject, QRectF, Qt, QThread, Signal
from PySide6.QtGui import QAction, QBrush, QColor, QFont, QPen, QPixmap, QTextOption
from PySide6.QtWidgets import (QApplication, QCheckBox, QComboBox, QDialog, QDialogButtonBox, QFileDialog, QFormLayout,
                               QFrame, QGraphicsPixmapItem, QGraphicsScene, QGraphicsView, QGridLayout, QGroupBox,
                               QHBoxLayout, QHeaderView, QInputDialog, QLabel, QLineEdit, QListWidget, QListWidgetItem,
                               QMainWindow, QMessageBox, QProgressBar, QPushButton, QScrollArea, QSpinBox, QSplitter,
                               QStatusBar, QTableWidget, QTableWidgetItem, QTextEdit, QToolBar, QVBoxLayout, QWidget)

from .export import write_docx, write_txt
from .labelling import Cluster, apply_labels, cluster_items, collect_items
from .library import Library, list_profiles
from .pipeline import DocumentOut, Processor, UNKNOWN_MARK

APP_TITLE = "پارسی‌اسکن"
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIBS = os.environ.get("PARSISCAN_LIBRARIES", os.path.join(BASE, "libraries"))
DATA = os.environ.get("PARSISCAN_DATA", os.path.join(BASE, "data"))
WORK = os.path.join(DATA, "work")
KIND_FA = {"date": "تاریخ", "amount": "مبلغ", "national_id": "کد ملی", "phone": "تلفن", "time": "ساعت", "number": "عدد"}
SOURCE_FA = {"text_layer": "متن دیجیتال (دقت کامل)", "template": "تطبیق الگو", "handwritten": "دست‌نویس", "empty": "خالی"}
STATUS_FA = {"unknown": "ناشناخته", "ambiguous": "دوپهلو", "low": "اطمینان کم"}


# ------------------------------------------------------------------ worker
class ExtractWorker(QObject):
    progress = Signal(int, int, str)
    finished = Signal(list)      # list of (path, DocumentOut | None, error)

    def __init__(self, paths: list[str], profile: str | None, dpi: int, image_only: bool):
        super().__init__()
        self.paths, self.profile, self.dpi, self.image_only = paths, profile, dpi, image_only

    def run(self):
        results = []
        for i, path in enumerate(self.paths):
            self.progress.emit(i, len(self.paths), os.path.basename(path))
            work = os.path.join(WORK, uuid.uuid4().hex[:10])
            try:
                proc = Processor(LIBS, self.profile, work, dpi=self.dpi)
                doc = proc.process(path, prefer_text_layer=not self.image_only)
                results.append((path, doc, None, work))
            except Exception as exc:  # noqa: BLE001 - surfaced to the user
                results.append((path, None, str(exc), work))
        self.progress.emit(len(self.paths), len(self.paths), "")
        self.finished.emit(results)


# ------------------------------------------------------------- page viewer
class PageView(QGraphicsView):
    def __init__(self):
        super().__init__()
        self.setScene(QGraphicsScene(self))
        self.setRenderHints(self.renderHints())
        self.setDragMode(QGraphicsView.ScrollHandDrag)
        self._pix: QGraphicsPixmapItem | None = None

    def show_page(self, page: dict):
        sc = self.scene()
        sc.clear()
        self._pix = None
        if not page.get("image") or not os.path.exists(page["image"]):
            return
        pm = QPixmap(page["image"])
        self._pix = sc.addPixmap(pm)
        sx = pm.width() / max(1, page["width"])
        sy = pm.height() / max(1, page["height"])
        pens = {"unknown": QPen(QColor(185, 28, 28), 2), "ambiguous": QPen(QColor(180, 83, 9), 2), "low": QPen(QColor(234, 88, 12), 2)}
        fills = {"unknown": QBrush(QColor(185, 28, 28, 50)), "ambiguous": QBrush(QColor(180, 83, 9, 50)), "low": QBrush(QColor(234, 88, 12, 40))}
        for ln in page.get("lines", []):
            for q in ln.get("paws", []):
                st = q["status"]
                if st in pens:
                    x0, y0, x1, y1 = q["box"]
                    r = sc.addRect(QRectF(x0 * sx, y0 * sy, (x1 - x0) * sx, (y1 - y0) * sy), pens[st], fills[st])
                    r.setToolTip(f"{STATUS_FA.get(st, st)} — امتیاز {q['score']} — نزدیک‌ترین: {q.get('alt') or '—'}")
        sc.setSceneRect(sc.itemsBoundingRect())
        self.fit()

    def fit(self):
        if self._pix is not None:
            self.fitInView(self.scene().sceneRect(), Qt.KeepAspectRatio)

    def wheelEvent(self, ev):
        if ev.modifiers() & Qt.ControlModifier:
            f = 1.15 if ev.angleDelta().y() > 0 else 1 / 1.15
            self.scale(f, f)
        else:
            super().wheelEvent(ev)


# ---------------------------------------------------------- label dialog
class LabelDialog(QDialog):
    def __init__(self, parent, doc: DocumentOut, profile: str):
        super().__init__(parent)
        self.setWindowTitle("برچسب‌زنی شکل‌های ناشناخته")
        self.setLayoutDirection(Qt.RightToLeft)
        self.resize(1000, 720)
        self.profile = profile
        self.clusters: list[Cluster] = cluster_items(collect_items(doc))
        self.edits: list[tuple[QLineEdit, QCheckBox]] = []

        lay = QVBoxLayout(self)
        hint = QLabel("شکل‌های مشابه در یک ردیف آمده‌اند؛ هر ردیف را یک بار برچسب بزنید (متن دقیق همان تکه، بدون فاصله). "
                      "اگر شکل جزئی از متن نیست (آرم، مهر، لکه) «نویز» را بزنید. پرتکرارها اول آمده‌اند.")
        hint.setWordWrap(True)
        lay.addWidget(hint)
        area = QScrollArea()
        area.setWidgetResizable(True)
        inner = QWidget()
        grid = QGridLayout(inner)
        grid.setColumnStretch(0, 3)
        grid.setColumnStretch(2, 2)
        for row, c in enumerate(self.clusters[:300]):
            crops = QWidget()
            hb = QHBoxLayout(crops)
            crops.setLayoutDirection(Qt.LeftToRight)
            hb.setContentsMargins(0, 0, 0, 0)
            for m in c.members[:5]:
                lab = QLabel()
                pm = QPixmap(m.crop)
                if not pm.isNull():
                    lab.setPixmap(pm.scaledToHeight(min(64, max(24, pm.height() * 2)), Qt.FastTransformation))
                lab.setFrameShape(QFrame.Box)
                hb.addWidget(lab)
            hb.addStretch(1)
            grid.addWidget(crops, row, 0)
            info = QLabel(f"{c.size} بار · {STATUS_FA.get(c.rep.status, c.rep.status)} · صفحه {c.rep.page + 1}")
            grid.addWidget(info, row, 1)
            edit = QLineEdit(c.rep.guess or "")
            edit.setPlaceholderText("متن این شکل")
            f = edit.font()
            f.setPointSize(f.pointSize() + 3)
            edit.setFont(f)
            noise = QCheckBox("نویز")
            box = QWidget()
            hb2 = QHBoxLayout(box)
            hb2.setContentsMargins(0, 0, 0, 0)
            hb2.addWidget(edit, 1)
            hb2.addWidget(noise)
            grid.addWidget(box, row, 2)
            self.edits.append((edit, noise))
        area.setWidget(inner)
        lay.addWidget(area, 1)
        btns = QDialogButtonBox()
        ok = btns.addButton("ذخیره و خواندن دوباره", QDialogButtonBox.AcceptRole)
        btns.addButton("انصراف", QDialogButtonBox.RejectRole)
        ok.setDefault(True)
        btns.accepted.connect(self.accept)
        btns.rejected.connect(self.reject)
        lay.addWidget(btns)

    def labels(self) -> dict[int, str]:
        out: dict[int, str] = {}
        for i, (edit, noise) in enumerate(self.edits):
            if noise.isChecked():
                out[i] = ""
            elif edit.text().strip() and edit.text().strip() != (self.clusters[i].rep.guess or "") or \
                    (edit.text().strip() and self.clusters[i].rep.status == "unknown"):
                out[i] = edit.text().strip()
            elif edit.text().strip() and self.clusters[i].rep.status in ("ambiguous", "low"):
                # user confirmed the guess: store it as a template too
                out[i] = edit.text().strip()
        return out


# ------------------------------------------------------- profiles dialog
class ProfilesDialog(QDialog):
    def __init__(self, parent):
        super().__init__(parent)
        self.setWindowTitle("پروفایل‌ها و الگوبرداری")
        self.setLayoutDirection(Qt.RightToLeft)
        self.resize(760, 520)
        lay = QVBoxLayout(self)
        hint = QLabel("هر اداره / فونت یک پروفایل دارد. الگوها سه راه دارند: "
                      "۱) خودکار از PDF دیجیتال همان اداره (دقیق‌ترین، بدون برچسب‌زنی)؛ "
                      "۲) از فایل فونت (ttf/otf) که اداره با آن تایپ می‌کند؛ "
                      "۳) برچسب‌زنی شکل‌های ناشناخته پس از خواندن هر اسکن.")
        hint.setWordWrap(True)
        lay.addWidget(hint)
        self.list = QListWidget()
        lay.addWidget(self.list, 1)
        row = QHBoxLayout()
        for text, slot in (("پروفایل جدید", self.new_profile), ("الگوبرداری از PDF دیجیتال", self.boot_pdf),
                           ("الگوبرداری از فایل فونت", self.boot_font), ("حذف پروفایل", self.delete_profile)):
            b = QPushButton(text)
            b.clicked.connect(slot)
            row.addWidget(b)
        lay.addLayout(row)
        self.log = QTextEdit()
        self.log.setReadOnly(True)
        self.log.setMaximumHeight(140)
        lay.addWidget(self.log)
        close = QDialogButtonBox()
        close.addButton("بستن", QDialogButtonBox.RejectRole)
        close.rejected.connect(self.reject)
        lay.addWidget(close)
        self.refresh()

    def refresh(self):
        self.list.clear()
        for name in list_profiles(LIBS):
            lib = Library(name, LIBS).load()
            wg = lib.meta.get("word_gap_ratio")
            item = QListWidgetItem(f"{name} — {len(lib.templates)} الگو، {len(lib.labels())} برچسب" + (f"، فاصله‌ی کلمه {wg}" if wg else ""))
            item.setData(Qt.UserRole, name)
            self.list.addItem(item)

    def current(self) -> str | None:
        it = self.list.currentItem()
        return it.data(Qt.UserRole) if it else None

    def new_profile(self):
        name, ok = QInputDialog.getText(self, "پروفایل جدید", "نام پروفایل (مثلاً sabt_tahoma):")
        name = name.strip()
        if ok and name and "/" not in name and "\\" not in name:
            Library(name, LIBS).load().save()
            self.refresh()

    def boot_pdf(self):
        name = self.current()
        if not name:
            QMessageBox.information(self, APP_TITLE, "اول یک پروفایل را انتخاب کنید.")
            return
        path, _ = QFileDialog.getOpenFileName(self, "PDF دیجیتال", "", "PDF (*.pdf)")
        if not path:
            return
        from .bootstrap import bootstrap_from_pdf
        from .calibrate import calibrate_word_gap
        lib = Library(name, LIBS).load()
        r = bootstrap_from_pdf(path, lib, source=f"pdf:{os.path.basename(path)}")
        c = calibrate_word_gap(path, lib)
        self.log.append(f"{os.path.basename(path)} → {r['added']} الگوی جدید، {r['duplicates']} تکراری، مجموع {r['total']}؛ "
                        f"فاصله‌ی کلمات {c.get('word_gap_ratio')} (دقت {c.get('accuracy')})")
        self.refresh()

    def boot_font(self):
        name = self.current()
        if not name:
            QMessageBox.information(self, APP_TITLE, "اول یک پروفایل را انتخاب کنید.")
            return
        path, _ = QFileDialog.getOpenFileName(self, "فایل فونت", "", "Fonts (*.ttf *.otf)")
        if not path:
            return
        sizes, ok = QInputDialog.getText(self, "اندازه‌ها", "اندازه‌های پیکسلی فونت (با کاما):", text="36,48,60")
        if not ok:
            return
        from .fontboot import bootstrap_from_font
        lib = Library(name, LIBS).load()
        r = bootstrap_from_font(path, lib, [int(x) for x in sizes.split(",") if x.strip().isdigit()])
        self.log.append(f"{os.path.basename(path)} → {r['added']} الگو، {r['skipped_words']} کلمه رد شد، مجموع {r['total']}")
        self.refresh()

    def delete_profile(self):
        name = self.current()
        if not name:
            return
        if QMessageBox.question(self, APP_TITLE, f"پروفایل «{name}» و همه‌ی الگوهایش حذف شود؟") == QMessageBox.Yes:
            shutil.rmtree(os.path.join(LIBS, name), ignore_errors=True)
            self.refresh()


# ------------------------------------------------------------ main window
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_TITLE + " — استخراج متن فارسی از اسکن با تطبیق الگو")
        self.setLayoutDirection(Qt.RightToLeft)
        self.resize(1400, 860)
        self.docs: list[dict] = []      # {path, doc, work, pages(dict)}
        self.pending: list[str] = []
        self._thread: QThread | None = None

        tb = QToolBar("ابزار")
        tb.setMovable(False)
        self.addToolBar(tb)
        act_open = QAction("افزودن فایل‌ها", self)
        act_open.triggered.connect(self.add_files)
        tb.addAction(act_open)
        tb.addSeparator()
        tb.addWidget(QLabel(" پروفایل: "))
        self.profile_box = QComboBox()
        self.profile_box.setMinimumWidth(180)
        tb.addWidget(self.profile_box)
        self.image_only = QCheckBox("همیشه تصویر را بخوان")
        tb.addWidget(self.image_only)
        tb.addWidget(QLabel(" DPI: "))
        self.dpi = QSpinBox()
        self.dpi.setRange(150, 600)
        self.dpi.setValue(300)
        tb.addWidget(self.dpi)
        tb.addSeparator()
        self.act_run = QAction("استخراج", self)
        self.act_run.triggered.connect(self.run_pending)
        tb.addAction(self.act_run)
        act_label = QAction("برچسب‌زنی ناشناخته‌ها", self)
        act_label.triggered.connect(self.open_labels)
        tb.addAction(act_label)
        tb.addSeparator()
        act_txt = QAction("ذخیره TXT", self)
        act_txt.triggered.connect(lambda: self.save("txt"))
        tb.addAction(act_txt)
        act_docx = QAction("ذخیره Word", self)
        act_docx.triggered.connect(lambda: self.save("docx"))
        tb.addAction(act_docx)
        tb.addSeparator()
        act_prof = QAction("پروفایل‌ها", self)
        act_prof.triggered.connect(self.open_profiles)
        tb.addAction(act_prof)

        split = QSplitter(Qt.Horizontal)
        self.setCentralWidget(split)
        self.pages_list = QListWidget()
        self.pages_list.currentRowChanged.connect(self.show_current)
        split.addWidget(self.pages_list)
        self.view = PageView()
        split.addWidget(self.view)
        right = QWidget()
        rl = QVBoxLayout(right)
        rl.setContentsMargins(0, 0, 0, 0)
        self.head = QLabel("")
        self.head.setWordWrap(True)
        rl.addWidget(self.head)
        self.text = QTextEdit()
        self.text.setReadOnly(True)
        f = QFont()
        f.setPointSize(12)
        self.text.setFont(f)
        self.text.setLayoutDirection(Qt.RightToLeft)
        rl.addWidget(self.text, 3)
        self.numbers = QTableWidget(0, 3)
        self.numbers.setHorizontalHeaderLabels(["مقدار", "نوع", "وضعیت"])
        self.numbers.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.numbers.setEditTriggers(QTableWidget.NoEditTriggers)
        rl.addWidget(QLabel("اعداد، تاریخ‌ها و مبلغ‌ها (فقط موارد مهم یا مشکوک)"))
        rl.addWidget(self.numbers, 1)
        split.addWidget(right)
        split.setSizes([260, 620, 520])

        self.status = QStatusBar()
        self.setStatusBar(self.status)
        self.progress = QProgressBar()
        self.progress.setMaximumWidth(260)
        self.progress.hide()
        self.status.addPermanentWidget(self.progress)
        self.status.showMessage("فایل‌ها را اضافه کنید؛ برای اسکن‌ها پروفایل همان اداره را انتخاب کنید.")
        self.refresh_profiles()

    # -- profiles
    def refresh_profiles(self):
        cur = self.profile_box.currentData()
        self.profile_box.clear()
        self.profile_box.addItem("— بدون پروفایل (فقط متن دیجیتال) —", "")
        for name in list_profiles(LIBS):
            lib = Library(name, LIBS).load()
            self.profile_box.addItem(f"{name} ({len(lib.templates)} الگو)", name)
        if cur:
            idx = self.profile_box.findData(cur)
            if idx >= 0:
                self.profile_box.setCurrentIndex(idx)

    def open_profiles(self):
        ProfilesDialog(self).exec()
        self.refresh_profiles()

    # -- files
    def add_files(self):
        paths, _ = QFileDialog.getOpenFileNames(self, "انتخاب مدارک", "", "مدارک (*.pdf *.png *.jpg *.jpeg *.tif *.tiff *.bmp)")
        if paths:
            self.pending.extend(paths)
            self.status.showMessage(f"{len(self.pending)} فایل در صف. روی «استخراج» بزنید.")
            self.run_pending()

    def run_pending(self):
        if not self.pending or self._thread is not None:
            return
        paths, self.pending = self.pending, []
        self.start_worker(paths)

    def start_worker(self, paths: list[str], replace_index: int | None = None):
        self.progress.setRange(0, len(paths))
        self.progress.show()
        self.act_run.setEnabled(False)
        self._thread = QThread()
        self._worker = ExtractWorker(paths, self.profile_box.currentData() or None, self.dpi.value(), self.image_only.isChecked())
        self._worker.moveToThread(self._thread)
        self._thread.started.connect(self._worker.run)
        self._worker.progress.connect(self.on_progress)
        self._worker.finished.connect(lambda res: self.on_finished(res, replace_index))
        self._worker.finished.connect(self._thread.quit)
        self._thread.finished.connect(self._cleanup_thread)
        self._thread.start()

    def _cleanup_thread(self):
        self._thread = None
        self.act_run.setEnabled(True)
        self.progress.hide()

    def on_progress(self, i, n, name):
        self.progress.setValue(i)
        if name:
            self.status.showMessage(f"در حال خواندن {name} ({i + 1} از {n})…")

    def on_finished(self, results, replace_index):
        for path, doc, err, work in results:
            if err or doc is None:
                QMessageBox.warning(self, APP_TITLE, f"خطا در {os.path.basename(path)}:\n{err}")
                continue
            entry = {"path": path, "doc": doc, "work": work, "pages": [asdict(p) for p in doc.pages]}
            if replace_index is not None and 0 <= replace_index < len(self.docs):
                shutil.rmtree(self.docs[replace_index]["work"], ignore_errors=True)
                self.docs[replace_index] = entry
            else:
                self.docs.append(entry)
        self.rebuild_list()
        self.status.showMessage("آماده.")

    def rebuild_list(self):
        self.pages_list.blockSignals(True)
        self.pages_list.clear()
        for di, d in enumerate(self.docs):
            for p in d["pages"]:
                s = p["stats"]
                tot = sum(s.get(k, 0) for k in ("ok", "unknown", "ambiguous", "low"))
                rate = f"{100 * s.get('ok', 0) / tot:.0f}٪" if tot else ""
                bad = s.get("unknown", 0) + s.get("ambiguous", 0) + s.get("low", 0)
                txt = f"{os.path.basename(d['path'])} — صفحه {p['index'] + 1} — {SOURCE_FA.get(p['source'], p['source'])}"
                if p["source"] == "template":
                    txt += f" — تطبیق {rate}" + (f" — {bad} نیازمند بازبینی" if bad else "")
                it = QListWidgetItem(txt)
                it.setData(Qt.UserRole, (di, p["index"]))
                if p["source"] == "handwritten":
                    it.setForeground(QColor(146, 64, 14))
                elif bad:
                    it.setForeground(QColor(153, 27, 27))
                self.pages_list.addItem(it)
        self.pages_list.blockSignals(False)
        if self.pages_list.count():
            self.pages_list.setCurrentRow(self.pages_list.count() - 1)
            self.show_current(self.pages_list.currentRow())

    def current_page(self):
        it = self.pages_list.currentItem()
        if not it:
            return None, None
        di, pi = it.data(Qt.UserRole)
        return self.docs[di], self.docs[di]["pages"][pi]

    def show_current(self, _row):
        d, p = self.current_page()
        if p is None:
            return
        self.view.show_page(p)
        s = p["stats"]
        head = f"<b>{os.path.basename(d['path'])}</b> — صفحه {p['index'] + 1} — {SOURCE_FA.get(p['source'], p['source'])}"
        if p["source"] == "template":
            head += (f"<br>شکل‌ها: {s.get('ok', 0)} مطمئن، <span style='color:#b91c1c'>{s.get('unknown', 0)} ناشناخته</span>، "
                     f"<span style='color:#b45309'>{s.get('ambiguous', 0)} دوپهلو</span> — چرخش اصلاح‌شده {s.get('skew_deg', 0)}° / {s.get('orientation', 0)}°")
            if s.get("note") == "no_library":
                head += "<br><span style='color:#b91c1c'>پروفایل انتخاب نشده یا خالی است؛ هیچ شکلی قابل تطبیق نیست.</span>"
        self.head.setText(head)
        if p["source"] == "handwritten":
            self.text.setHtml("<p style='color:#92400e'>این صفحه دست‌نویس تشخیص داده شد. تطبیق الگو برای دست‌خط کار نمی‌کند و به جای حدس زدن، "
                              "صفحه برای بازبینی انسانی علامت خورد.</p>")
        else:
            esc = (p["text"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
            esc = esc.replace(UNKNOWN_MARK, f"<span style='background:#fecaca;color:#7f1d1d;font-weight:bold'>{UNKNOWN_MARK}</span>")
            self.text.setHtml("<div dir='rtl' style='white-space:pre-wrap'>" + esc.replace("\n", "<br>") + "</div>")
        opt = self.text.document().defaultTextOption()
        opt.setTextDirection(Qt.RightToLeft)
        opt.setAlignment(Qt.AlignRight)
        self.text.document().setDefaultTextOption(opt)
        rows = [n for n in p.get("numbers", []) if n["kind"] != "number" or not n["valid"]]
        self.numbers.setRowCount(len(rows))
        for r, n in enumerate(rows):
            v = QTableWidgetItem(n["text"])
            v.setTextAlignment(Qt.AlignLeft | Qt.AlignVCenter)
            self.numbers.setItem(r, 0, v)
            self.numbers.setItem(r, 1, QTableWidgetItem(KIND_FA.get(n["kind"], n["kind"])))
            st = QTableWidgetItem("معتبر" if n["valid"] else "مشکوک: " + n.get("note", ""))
            if not n["valid"]:
                st.setForeground(QColor(185, 28, 28))
            self.numbers.setItem(r, 2, st)

    # -- labelling
    def open_labels(self):
        d, p = self.current_page()
        if d is None:
            QMessageBox.information(self, APP_TITLE, "اول یک سند را باز کنید.")
            return
        profile = self.profile_box.currentData()
        if not profile:
            QMessageBox.information(self, APP_TITLE, "برای برچسب‌زنی باید یک پروفایل انتخاب شده باشد.")
            return
        dlg = LabelDialog(self, d["doc"], profile)
        if not dlg.clusters:
            QMessageBox.information(self, APP_TITLE, "شکل ناشناخته‌ای در این سند نیست.")
            return
        if dlg.exec() == QDialog.Accepted:
            labels = dlg.labels()
            lib = Library(profile, LIBS).load()
            added = apply_labels(lib, dlg.clusters, labels, source=f"label:{os.path.basename(d['path'])}")
            self.status.showMessage(f"{added} الگوی جدید ذخیره شد؛ سند دوباره خوانده می‌شود…")
            self.refresh_profiles()
            idx = self.docs.index(d)
            self.start_worker([d["path"]], replace_index=idx)

    # -- export
    def save(self, kind: str):
        d, _ = self.current_page()
        if d is None:
            QMessageBox.information(self, APP_TITLE, "سندی باز نیست.")
            return
        base = os.path.splitext(os.path.basename(d["path"]))[0]
        filt = "Word (*.docx)" if kind == "docx" else "متن (*.txt)"
        out, _ = QFileDialog.getSaveFileName(self, "ذخیره", base + "." + kind, filt)
        if not out:
            return
        if kind == "docx":
            if not write_docx(d["doc"], out):
                QMessageBox.warning(self, APP_TITLE, "کتابخانه‌ی python-docx نصب نیست.")
                return
        else:
            write_txt(d["doc"], out)
        self.status.showMessage(f"ذخیره شد: {out}")


def main() -> int:
    os.makedirs(WORK, exist_ok=True)
    app = QApplication(sys.argv)
    app.setApplicationName(APP_TITLE)
    app.setLayoutDirection(Qt.RightToLeft)
    win = MainWindow()
    win.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
