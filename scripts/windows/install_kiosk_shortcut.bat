@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title GOLFOS 무인키오스크 바탕화면 바로가기 설치기

REM ============================================================================
REM  GOLFOS KIOSK — Desktop & Startup Shortcut Installer (Windows)
REM  - Copies GOLFOS KIOSK dedicated icon (golfos-kiosk-icon.ico) to C:\GolfOS\bin
REM  - Creates "골포스 무인키오스크.lnk" on Desktop with GOLFOS KIOSK icon & hidden console
REM ============================================================================

set "SCRIPT_DIR=%~dp0"
set "RUNNER_BAT=%SCRIPT_DIR%run_kiosk_app.bat"
set "INSTALL_DIR=C:\GolfOS\bin"
set "TARGET_BAT=%INSTALL_DIR%\run_kiosk_app.bat"
set "TARGET_ICO=%INSTALL_DIR%\golfos-kiosk-icon.ico"

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%" >nul 2>&1
if exist "%RUNNER_BAT%" (
    copy /Y "%RUNNER_BAT%" "%TARGET_BAT%" >nul 2>&1
) else (
    echo [오류] 동봉된 run_kiosk_app.bat 파일을 찾을 수 없습니다: %RUNNER_BAT%
    pause
    exit /b 1
)

REM GOLFOS KIOSK 전용 아이콘(.ico) 탐색 및 복사
if exist "%SCRIPT_DIR%..\..\public\golfos-kiosk-icon.ico" (
    copy /Y "%SCRIPT_DIR%..\..\public\golfos-kiosk-icon.ico" "%TARGET_ICO%" >nul 2>&1
) else if exist "%SCRIPT_DIR%..\..\dist\golfos-kiosk-icon.ico" (
    copy /Y "%SCRIPT_DIR%..\..\dist\golfos-kiosk-icon.ico" "%TARGET_ICO%" >nul 2>&1
) else if exist "C:\GolfOS\current\web\kiosk\golfos-kiosk-icon.ico" (
    copy /Y "C:\GolfOS\current\web\kiosk\golfos-kiosk-icon.ico" "%TARGET_ICO%" >nul 2>&1
)

set "ICON_PATH=%SystemRoot%\System32\shell32.dll,15"
if exist "%TARGET_ICO%" (
    set "ICON_PATH=%TARGET_ICO%,0"
)

echo [1/2] 바탕화면에 [골포스 무인키오스크] 전용 아이콘 바로가기 생성 중...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
  "$lnk = $ws.CreateShortcut((Join-Path $desktop '골포스 무인키오스크.lnk')); " ^
  "$lnk.TargetPath = 'cmd.exe'; " ^
  "$lnk.Arguments = '/c \"\"%TARGET_BAT%\"\"'; " ^
  "$lnk.WorkingDirectory = '%INSTALL_DIR%'; " ^
  "$lnk.WindowStyle = 7; " ^
  "$lnk.IconLocation = '%ICON_PATH%'; " ^
  "$lnk.Description = 'GOLFOS 무인 타석배정·결제 키오스크 전용 실행기'; " ^
  "$lnk.Save()"

if /I "%~1"=="--autostart" (
    echo [2/2] 윈도우 시작프로그램 자동 실행 등록 중...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "$ws = New-Object -ComObject WScript.Shell; " ^
      "$startup = [Environment]::GetFolderPath('Startup'); " ^
      "$lnk = $ws.CreateShortcut((Join-Path $startup '골포스 무인키오스크.lnk')); " ^
      "$lnk.TargetPath = 'cmd.exe'; " ^
      "$lnk.Arguments = '/c \"\"%TARGET_BAT%\"\"'; " ^
      "$lnk.WorkingDirectory = '%INSTALL_DIR%'; " ^
      "$lnk.WindowStyle = 7; " ^
      "$lnk.IconLocation = '%ICON_PATH%'; " ^
      "$lnk.Description = 'GOLFOS 무인 타석배정·결제 키오스크 자동 실행'; " ^
      "$lnk.Save()"
) else (
    echo [2/2] 시작프로그램 등록 생략 (자동 실행을 원하시면 --autostart 옵션을 붙여 실행하세요).
)

echo.
echo [완료] 바탕화면에 GOLFOS KIOSK 전용 아이콘이 적용된 [골포스 무인키오스크] 바로가기가 생성되었습니다!
exit /b 0
