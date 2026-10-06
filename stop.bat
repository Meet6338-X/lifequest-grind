@echo off
setlocal enabledelayedexpansion
rem  ============================================
rem   LifeQuest stopper
rem   Kills the servers started by start.bat
rem   (only touches ports 4173 / 4174)
rem   Usage: stop.bat          (pauses at the end)
rem          stop.bat skip     (no pause)
rem  ============================================

cd /d "%~dp0"
echo  Stopping LifeQuest servers on ports 4173 / 4174 ...

set /a killed=0
for /f "tokens=5" %%P in ('netstat -ano ^| findstr "LISTENING" ^| findstr /C:":4173 " /C:":4174 "') do (
  taskkill /F /PID %%P >nul 2>nul
  if not errorlevel 1 (
    echo    stopped PID %%P
    set /a killed+=1
  )
)

if !killed! equ 0 (
  echo    nothing to stop - no LifeQuest server is running
) else (
  echo    stopped !killed! process^(es^)
)
echo  Done.
if "%~1"=="" pause
