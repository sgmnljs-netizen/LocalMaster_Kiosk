@echo off
echo ========================================================
echo   LocalMaster Kiosk - Standalone App Window Launcher
echo   Port: 5179
echo ========================================================

:: MS Edge 또는 Chrome 설치 여부에 따라 --app 모드로 띄움
where msedge >nul 2>nul
if %ERRORLEVEL% == 0 (
    echo Launching with Microsoft Edge App Mode...
    start msedge --app="http://localhost:5179"
    exit /b
)

where chrome >nul 2>nul
if %ERRORLEVEL% == 0 (
    echo Launching with Google Chrome App Mode...
    start chrome --app="http://localhost:5179"
    exit /b
)

echo [WARNING] Edge or Chrome not found in PATH. Opening default browser...
start http://localhost:5179
