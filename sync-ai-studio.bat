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
REM 1) Tentukan sumber: zip/folder export
REM    - Bisa dikasih argumen (drag&drop zip ke bat / ketik path)
REM    - Atau kosongkan -> AUTO-DETECT zip terbaru (root, D:\Web, Downloads)
REM ------------------------------------------------------------
set "EXPORT_DIR="
if not "%~1"=="" set "EXPORT_DIR=%~1"

if "%EXPORT_DIR%"=="" (
    echo  Biarkan kosong utk AUTO-DETECT zip terbaru, atau isi path:
    echo    - file zip   contoh: D:\Web\my-export.zip
    echo    - folder     contoh: D:\Web\my-export-folder
    echo.
    set /p EXPORT_DIR="  Path (enter = auto-detect): "
)

if "%EXPORT_DIR%"=="" (
    echo.
    echo  [AUTO] Mencari zip terbaru di root project, D:\Web\ , dan Downloads...
    node "%~dp0apply-ai-studio-export.mjs" --preview
    echo.
    echo  --- Daftar file yang akan disinkron (PREVIEW) di atas ---
    echo  Kalau sudah yakin, jalankan lagi dan pilih mode COPY/FULL.
    goto :end
)

if not exist "%EXPORT_DIR%" (
    echo  [X] Path tidak ditemukan: %EXPORT_DIR%
    echo  Catatan: untuk folder, kasih path folder hasil ekstrak; untuk zip, kasih path file .zip.
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
