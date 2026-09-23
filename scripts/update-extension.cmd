@echo off
rem Double-click to install or update Image Downloader (with videos). See update-extension.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-extension.ps1" %*
pause
