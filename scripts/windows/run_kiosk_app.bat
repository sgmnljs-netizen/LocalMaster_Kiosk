@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title GOLFOS 무인키오스크 실행기

REM ============================================================================
REM  GOLFOS KIOSK — Standalone App Shell Launcher (Windows)
REM  - Focuses existing GOLFOS KIOSK window if already running (prevents duplicate blank windows)
REM  - Launches Electron Native Shell if present, otherwise Edge/Chrome --kiosk --app mode
REM ============================================================================

set "KIOSK_URL=http://127.0.0.1:8000/kiosk"
set "DEV_URL=http://localhost:5179"
set "PROFILE_DIR=C:\GolfOS\kiosk_profile"
set "WINDOW_FLAG=--kiosk"

if /I "%~1"=="--window" set "WINDOW_FLAG=--start-maximized"
if /I "%~1"=="--dev" set "KIOSK_URL=%DEV_URL%"

REM 0. 이미 실행 중인 GOLFOS KIOSK 창이 있으면 새 창을 띄우지 않고 기존 창만 포커스
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; if ($ws.AppActivate('GOLFOS KIOSK')) { exit 0 } else { exit 1 }" >nul 2>&1
if "!errorlevel!"=="0" (
    exit /b 0
)

if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%" >nul 2>&1

REM 1. Probe Backend (:8000/kiosk); fallback to Dev Server (:5179) if running
powershell -NoProfile -Command ^
  "try { $r = Invoke-WebRequest -Uri '%KIOSK_URL%' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if not "!errorlevel!"=="0" (
    powershell -NoProfile -Command ^
      "try { $r = Invoke-WebRequest -Uri '%DEV_URL%' -UseBasicParsing -TimeoutSec 1; exit 0 } catch { exit 1 }" >nul 2>&1
    if "!errorlevel!"=="0" (
        set "KIOSK_URL=%DEV_URL%"
    )
)

REM 2. Electron 전용 쉘이 있으면 최우선 실행
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%..\..\node_modules\electron\dist\electron.exe" (
    if exist "%SCRIPT_DIR%..\..\electron\main.cjs" (
        start "" "%SCRIPT_DIR%..\..\node_modules\electron\dist\electron.exe" "%SCRIPT_DIR%..\..\electron\main.cjs" !KIOSK_URL! !WINDOW_FLAG! %*
        exit /b 0
    )
)
if exist "%SCRIPT_DIR%..\..\..\LocalMaster_POS\node_modules\electron\dist\electron.exe" (
    if exist "%SCRIPT_DIR%..\..\electron\main.cjs" (
        start "" "%SCRIPT_DIR%..\..\..\LocalMaster_POS\node_modules\electron\dist\electron.exe" "%SCRIPT_DIR%..\..\electron\main.cjs" !KIOSK_URL! !WINDOW_FLAG! %*
        exit /b 0
    )
)

REM 3. Fallback: Detect Browser (Edge -> Chrome)
set "BROWSER_EXE="
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
) else if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_EXE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
) else if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_EXE=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"
)

if "!BROWSER_EXE!"=="" (
    msg * "GOLFOS KIOSK 런타임을 찾을 수 없습니다."
    exit /b 1
)

start "" "!BROWSER_EXE!" ^
  --app=!KIOSK_URL! ^
  --user-data-dir="%PROFILE_DIR%" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-features=Translate,TranslateUI,OverscrollHistoryNavigation ^
  --overscroll-history-navigation=0 ^
  --disable-pinch ^
  --disable-session-crashed-bubble ^
  --disable-infobars ^
  --autoplay-policy=no-user-gesture-required ^
  --use-fake-ui-for-media-stream ^
  !WINDOW_FLAG!

exit /b 0
