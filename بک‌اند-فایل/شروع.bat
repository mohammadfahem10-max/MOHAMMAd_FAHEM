@echo off
chcp 65001 >nul
title سرویس ثبت من
setlocal
cd /d "%~dp0"

rem ---- یافتن node.exe قابل‌حمل (npm لازم نیست) ----
set "NODE_EXE="
if defined SABTMAN_NODE if exist "%SABTMAN_NODE%" set "NODE_EXE=%SABTMAN_NODE%"
if not defined NODE_EXE if exist "%~dp0node.exe" set "NODE_EXE=%~dp0node.exe"
if not defined NODE_EXE if exist "%~dp0node\node.exe" set "NODE_EXE=%~dp0node\node.exe"
if not defined NODE_EXE if exist "%~dp0..\node\node.exe" set "NODE_EXE=%~dp0..\node\node.exe"
if not defined NODE_EXE if exist "%~dp0..\..\node\node.exe" set "NODE_EXE=%~dp0..\..\node\node.exe"
if not defined NODE_EXE if exist "%~dp0..\سرور\node.exe" set "NODE_EXE=%~dp0..\سرور\node.exe"
if not defined NODE_EXE if exist "%~dp0..\..\سرور\node.exe" set "NODE_EXE=%~dp0..\..\سرور\node.exe"
if not defined NODE_EXE (
  where node >nul 2>nul && set "NODE_EXE=node"
)
if not defined NODE_EXE (
  echo node.exe پیدا نشد. فایل node.exe قابل‌حمل را کنار همین فایل بگذارید یا متغیر SABTMAN_NODE را به مسیر آن تنظیم کنید.
  pause
  exit /b 1
)

echo سرویس ثبت من با "%NODE_EXE%" اجرا می‌شود...
start "" "http://127.0.0.1:8975/"
"%NODE_EXE%" "%~dp0server.js"
pause
