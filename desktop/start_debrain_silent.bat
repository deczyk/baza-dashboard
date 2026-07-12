@echo off
cd /d "%~dp0"
set DEBRAIN_NO_AUTOOPEN=1
start "" /min pythonw.exe gui_app.py
