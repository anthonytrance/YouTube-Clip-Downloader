@echo off
title Claude - %~dp0
cd /d "%~dp0"
echo Starting Claude in: %~dp0
"C:\Users\djpit\.local\bin\claude.exe" --channels "plugin:telegram@claude-plugins-official" --dangerously-skip-permissions --permission-mode bypassPermissions
echo.
echo Claude has exited (code %ERRORLEVEL%). Type EXIT to close this window.
cmd /k
