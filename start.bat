@echo off
setlocal enabledelayedexpansion
rem  ============================================
rem   LifeQuest launcher
rem   Starts both local servers and opens the app.
rem   Usage: start.bat          (opens browser)
rem          start.bat noopen   (skip opening browser)
rem  ============================================

cd /d "%~dp0"
echo  ================================
echo   LifeQuest launcher
echo  ================================

call :ensure 4173 "lifequest-app" "LifeQuest app"
call :ensure 4174 "results" "LifeQuest results"

echo  Waiting for servers to come up...
set /a tries=0

:waitloop
netstat -ano | findstr "LISTENING" | findstr /C:":4173 " >nul
if errorlevel 1 goto notYet
netstat -ano | findstr "LISTENING" | findstr /C:":4174 " >nul
if errorlevel 1 goto notYet
goto bothUp

:notYet
set /a tries+=1
if !tries! geq 15 goto timeout
ping -n 3 127.0.0.1 >nul 2>nul
goto waitloop

:bothUp
echo  [ok] both servers are up
echo    app:     http://localhost:4173
echo    results: http://localhost:4174
if /i not "%~1"=="noopen" start "" http://localhost:4173
echo  Stop everything with stop.bat
goto end

:timeout
echo  [!!] servers still starting. First run downloads packages,
echo       give it a moment and run start.bat again.
echo    app: http://localhost:4173
goto end

:ensure
netstat -ano | findstr "LISTENING" | findstr /C:":%~1 " >nul
if not errorlevel 1 (
  echo  [ok] port %~1 already serving
  exit /b
)
echo  [..] starting %~3 on port %~1
start "%~3" /min cmd /c npx.cmd --yes serve -l %~1 %~2
exit /b

:end
if "%~1"=="" pause
