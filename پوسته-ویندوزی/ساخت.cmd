@echo off
chcp 65001 >nul
setlocal EnableExtensions
rem ===== ساخت «ثبت من.exe» با csc چارچوب ۴.۰ ویندوز (بدون Visual Studio) =====
rem خروجی بیرون از مخزن: <SABTMAN_OUT> یا «اپلیکیشن ثبت من\برنامه» (هم‌سطح مخزن)
rem DLLهای WebView2 در مخزن نیستند (قانون ۵۱)؛ از SABTMAN_WEBVIEW2 یا ..\..\اپلیکیشن میزبان کپی می‌شوند.

set "HERE=%~dp0"
set "REPO=%HERE%.."
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" ( echo csc.exe پیدا نشد. & exit /b 1 )
set "FW=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319"
if not exist "%FW%\WPF\PresentationFramework.dll" set "FW=%WINDIR%\Microsoft.NET\Framework\v4.0.30319"

if defined SABTMAN_OUT ( set "OUT=%SABTMAN_OUT%" ) else ( set "OUT=%REPO%\..\برنامه" )
if not exist "%OUT%" mkdir "%OUT%"

rem ---- DLLهای WebView2 ----
set "WV="
if defined SABTMAN_WEBVIEW2 if exist "%SABTMAN_WEBVIEW2%\Microsoft.Web.WebView2.Core.dll" set "WV=%SABTMAN_WEBVIEW2%"
if not defined WV if exist "%OUT%\Microsoft.Web.WebView2.Core.dll" set "WV=%OUT%"
if not defined WV for %%D in ("%REPO%\..\اپلیکیشن میزبان" "%REPO%\..\..\اپلیکیشن میزبان" "%REPO%\..\..\..\اپلیکیشن میزبان") do (
  if not defined WV if exist "%%~D\Microsoft.Web.WebView2.Core.dll" set "WV=%%~D"
  if not defined WV if exist "%%~D\برنامه\Microsoft.Web.WebView2.Core.dll" set "WV=%%~D\برنامه"
)
if not defined WV (
  echo DLLهای WebView2 پیدا نشد. متغیر SABTMAN_WEBVIEW2 را به پوشه‌ای با Microsoft.Web.WebView2.Core.dll، Microsoft.Web.WebView2.Wpf.dll و WebView2Loader.dll تنظیم کنید.
  exit /b 1
)
for %%F in (Microsoft.Web.WebView2.Core.dll Microsoft.Web.WebView2.Wpf.dll WebView2Loader.dll) do (
  if exist "%WV%\%%F" copy /y "%WV%\%%F" "%OUT%\" >nul
)
if exist "%WV%\runtimes" xcopy /e /i /y /q "%WV%\runtimes" "%OUT%\runtimes" >nul

rem ---- کامپایل ----
"%CSC%" /nologo /target:winexe /platform:anycpu /optimize+ /codepage:65001 /nowarn:1998,4014,0168,0219,0618 ^
  /out:"%OUT%\ثبت من.exe" /win32manifest:"%HERE%مانیفست.xml" ^
  /reference:System.dll /reference:System.Core.dll /reference:System.Xml.dll /reference:System.Xaml.dll ^
  /reference:System.Web.Extensions.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll ^
  /reference:"%FW%\WPF\PresentationFramework.dll" /reference:"%FW%\WPF\PresentationCore.dll" /reference:"%FW%\WPF\WindowsBase.dll" ^
  /reference:"%OUT%\Microsoft.Web.WebView2.Core.dll" /reference:"%OUT%\Microsoft.Web.WebView2.Wpf.dll" ^
  "%HERE%src\*.cs"
if errorlevel 1 ( echo کامپایل ناموفق. & exit /b 1 )
copy /y "%HERE%exe.config" "%OUT%\ثبت من.exe.config" >nul

rem ---- رابط + سرویس + فونت (از dist ساخته‌شده با node ابزار\build.js) ----
set "NODE="
if defined SABTMAN_NODE if exist "%SABTMAN_NODE%" set "NODE=%SABTMAN_NODE%"
if not defined NODE if exist "%OUT%\node.exe" set "NODE=%OUT%\node.exe"
if not defined NODE for %%N in ("%REPO%\..\سرور\node.exe" "%REPO%\..\..\سرور\node.exe" "%REPO%\..\..\خانه کلود\سرور\node.exe" "%REPO%\..\..\..\خانه کلود\سرور\node.exe") do (
  if not defined NODE if exist "%%~N" set "NODE=%%~N"
)
if not defined NODE ( where node >nul 2>nul && set "NODE=node" )
if defined NODE (
  "%NODE%" "%REPO%\ابزار\build.js" || ( echo ساخت رابط ناموفق. & exit /b 1 )
  copy /y "%REPO%\dist\پوسته-ویندوزی\رابط.js" "%OUT%\" >nul
  xcopy /e /i /y /q "%REPO%\dist\پوسته-ویندوزی\بک‌اند-فایل" "%OUT%\بک‌اند-فایل" >nul
  if not exist "%OUT%\node.exe" if not "%NODE%"=="node" copy /y "%NODE%" "%OUT%\node.exe" >nul
) else (
  echo node.exe پیدا نشد؛ رابط.js و بک‌اند-فایل کپی نشد. متغیر SABTMAN_NODE را تنظیم کنید.
)

echo.
echo ساخته شد: "%OUT%\ثبت من.exe"
endlocal
