@echo off
REM ساخت فایل اجرایی ویندوز (ParsiScan.exe) با PyInstaller
REM پیش‌نیاز: Python 3.10+ نصب باشد. این اسکریپت را در پوشه‌ی پروژه اجرا کنید.
python -m pip install --upgrade pip
python -m pip install -r requirements.txt pyinstaller
python -m PyInstaller --noconfirm --clean ParsiScan.spec
echo.
echo خروجی در پوشه‌ی dist\ParsiScan قرار گرفت. پوشه‌ی libraries کنار exe کپی شده است.
pause
