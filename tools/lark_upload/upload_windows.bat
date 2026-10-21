@echo off
chcp 65001 > nul
cd /d "%~dp0"
set PYTHONUTF8=1
where py > nul 2>&1
if %errorlevel%==0 (
  py -3 lark_upload.py
) else (
  where python > nul 2>&1
  if errorlevel 1 (
    echo Python is not installed. Please install it from https://www.python.org/downloads/
    pause
  ) else (
    python lark_upload.py
  )
)
