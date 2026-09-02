@echo off
setlocal enabledelayedexpansion
title AI Studio Export -> Dikalastory (Auto Sync)

echo ================================================================
echo   AI STUDIO EXPORT -^> DIKALASTORY (AUTO SYNC)
echo ================================================================
echo.
echo  Script ini akan:
echo   1. Deteksi file yang BERUBAH/BARU dari folder export (via hash)
echo   2. Copy HANYA file source yang aman (src/, server/, dll)
echo   3. LINDUNGI config penting (.env, vercel.json, api/index.ts,
echo      package.json build script, data/, firebase-applet-config.json)
echo   4. Merge dependency package.json baru (build script tetap aman)
echo   5. Opsional: npm install + git commit + push (Vercel auto-deploy)
echo.

REM ------------------------------------------------------------
REM 1) Tentukan folder export
REM ------------------------------------------------------------
set "EXPORT_DIR="
if not "%~1"=="" set "EXPORT_DIR=%~1"

if "%EXPORT_DIR%"=="" (
    echo  Masukkan path folder hasil ekstrak ZIP AI Studio
    echo  contoh: D:\Web\ai-studio-export
    echo.
    set /p EXPORT_DIR="  Path folder export: "
)

if "%EXPORT_DIR%"=="" (
    echo  [X] Path kosong. Dibatalkan.
    pause
    exit /b 1
)

if not exist "%EXPORT_DIR%" (
    echo  [X] Folder tidak ditemukan: %EXPORT_DIR%
    pause
    exit /b 1
)

echo.
echo  Folder export: %EXPORT_DIR%
echo.

REM ------------------------------------------------------------
REM 2) Pilih mode
REM ------------------------------------------------------------
echo  Pilih mode:
echo    [1] PREVIEW  - deteksi saja, tidak menulis apa pun
echo    [2] COPY     - copy file yang berubah (tanpa install/commit)
echo    [3] FULL     - copy + npm install + git commit + push
echo.
set /p MODE="  Pilih (1/2/3): "

if "%MODE%"=="1" (
    node "%~dp0apply-ai-studio-export.mjs" "%EXPORT_DIR%" --preview
    goto :end
)

if "%MODE%"=="2" (
    node "%~dp0apply-ai-studio-export.mjs" "%EXPORT_DIR%"
    goto :after_copy
)

if "%MODE%"=="3" (
    set /p COMMIT_MSG="  Pesan commit (Enter = default): "
    if "!COMMIT_MSG!"=="" set "COMMIT_MSG=Update from AI Studio export"
    node "%~dp0apply-ai-studio-export.mjs" "%EXPORT_DIR%" --install --commit --message "!COMMIT_MSG!"
    goto :end
)

echo  [X] Pilihan tidak valid.
goto :end

:after_copy
echo.
set /p LANJUT="  Lanjut npm install + commit + push? (y/n): "
if /i "%LANJUT%"=="y" (
    set /p COMMIT_MSG="  Pesan commit (Enter = default): "
    if "!COMMIT_MSG!"=="" set "COMMIT_MSG=Update from AI Studio export"
    npm.cmd install
    git add -A
    git commit -m "!COMMIT_MSG!"
    git push origin main
    echo.
    echo  >>> Push sukses. Vercel akan auto-deploy.
)

:end
echo.
echo ================================================================
echo   Selesai. Tekan tombol apa saja untuk keluar.
echo ================================================================
pause >nul
