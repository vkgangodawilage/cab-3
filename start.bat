@echo off
setlocal
title Procedural Kitchen Designer
cd /d "%~dp0"

echo ============================================
echo   Procedural Kitchen and Room Designer
echo ============================================
echo.

REM -- Make sure Node.js is available ----------------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo ERROR: Node.js was not found on this computer.
    echo Download and install it from https://nodejs.org, then run this file again.
    echo.
    pause
    exit /b 1
)

REM -- Install dependencies if missing OR incomplete ----------------------
REM Checking key packages instead of just the folder catches partial or
REM corrupted installs and re-fixes them automatically.
set "NEED_INSTALL="
if not exist "node_modules\next\package.json" set "NEED_INSTALL=1"
if not exist "node_modules\three\package.json" set "NEED_INSTALL=1"
if not exist "node_modules\@react-three\fiber\package.json" set "NEED_INSTALL=1"
if not exist "node_modules\@react-three\drei\package.json" set "NEED_INSTALL=1"
if not exist "node_modules\zustand\package.json" set "NEED_INSTALL=1"

if defined NEED_INSTALL (
    echo [1/3] Installing dependencies - first run or incomplete install
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed. Check your internet connection and Node.js.
        echo.
        pause
        exit /b 1
    )
    echo.
) else (
    echo [1/3] Dependencies are ready.
)

REM -- Find a free port (3000 to 3009), avoiding other projects ----------
set "PORT="
for /L %%A in (0,1,9) do (
    if not defined PORT call :pickport 300%%A
)
if not defined PORT set "PORT=3000"
goto :afterport

:pickport
set /a "CAND=%~1"
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %CAND% -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }" >nul 2>nul
if not errorlevel 1 set "PORT=%CAND%"
goto :eof

:afterport
echo.
echo [2/3] Starting the development server on http://localhost:%PORT% ...
echo [3/3] Opening your browser in a few seconds...
echo.
echo Press Ctrl+C in this window to stop the server.
echo.

REM -- Open the browser after the server has time to boot ---------------
start "" cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:%PORT%"

REM -- Run the dev server in the foreground -----------------------------
call npm run dev -- -p %PORT%

echo.
echo Server stopped.
pause
