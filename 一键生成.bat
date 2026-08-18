@echo off
rem ============================================
rem  Git Commit Graph - one-click generator
rem  Usage: double-click to type a repo path,
rem         or drag&drop a repo folder onto this file
rem ============================================
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo [Error] Node.js not found in PATH.
  echo Please install Node.js from https://nodejs.org/ and retry.
  pause
  exit /b 1
)
cd /d "%~dp0"
if not "%~1"=="" (
  node run.js "%~1"
) else (
  node run.js
)
echo.
pause
