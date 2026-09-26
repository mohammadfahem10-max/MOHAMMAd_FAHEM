# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec: python -m PyInstaller ParsiScan.spec
import os

block_cipher = None
here = os.path.abspath(".")

a = Analysis(
    ["ParsiScan.py"],
    pathex=[here],
    binaries=[],
    datas=[("libraries", "libraries")],
    hiddenimports=["docx", "pymupdf", "cv2", "PIL.ImageFont", "PIL.ImageDraw"],
    hookspath=[],
    runtime_hooks=[],
    excludes=["flask", "tkinter", "matplotlib"],
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ParsiScan",
    debug=False,
    strip=False,
    upx=False,
    console=False,
)
coll = COLLECT(exe, a.binaries, a.zipfiles, a.datas, strip=False, upx=False, name="ParsiScan")
