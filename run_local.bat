@echo off
cd /d "%~dp0"
python --version >nul 2>&1
if errorlevel 1 (
  echo Python is not installed or not in PATH. Install it from python.org and tick "Add python.exe to PATH".
  pause
  exit /b
)
if not exist .env (
  echo Missing .env file. Create a file named .env with your keys (see README).
  pause
  exit /b
)
python scripts\write_map_config.py
if errorlevel 1 (
  echo Failed to create the local map configuration.
  pause
  exit /b
)
python -m pip install -r scripts\requirements.txt
python scripts\fetch_fires.py
python scripts\fetch_s5p.py
python scripts\fetch_air.py
python scripts\fetch_grid.py
start "" http://localhost:8000
echo Site running at http://localhost:8000  (close this window to stop)
python -m http.server 8000
