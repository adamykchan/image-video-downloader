@echo off
rem Double-click to install or update Image Downloader (with videos). See update-image-downloader.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-image-downloader.ps1" %*
pause
