"""Launcher for the desktop application. Double-click or: python ParsiScan.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parsiscan.gui import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
