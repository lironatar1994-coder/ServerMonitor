@echo off
rem Double-click to install or update the Claude Remote agent on this PC.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
pause
