@echo off
cd /d "%~dp0"
title Debrain

if not exist ".env" (
    echo Brak pliku .env — skopiuj .env.example jako .env i wpisz tam swoj klucz DEEPSEEK_API_KEY.
    echo.
    pause
    exit /b 1
)

python gui_app.py
pause
