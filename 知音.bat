@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install from https://nodejs.org first.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run - installing dependencies, please wait...
  call npm install
  if errorlevel 1 (
    echo Install failed. Run "npm install" manually.
    pause
    exit /b 1
  )
)
echo Building...
call npm run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)
echo Launching Shengjing...
call npm start
