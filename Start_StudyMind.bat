@echo off
title StudyMind AI Launcher
cls
echo ========================================================
echo           Starting StudyMind AI Platform
echo ========================================================
echo.
echo [1/3] Starting Backend Server (FastAPI + AI Engine)...
start "StudyMind-Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

ping 127.0.0.1 -n 4 > nul

echo [2/3] Starting Frontend (Next.js Web UI)...
start "StudyMind-Frontend" cmd /k "cd /d %~dp0frontend && set NODE_OPTIONS=--max-old-space-size=4096 && npm run start"

ping 127.0.0.1 -n 5 > nul

echo [3/3] Opening browser at http://localhost:3000 ...
start http://localhost:3000

echo.
echo ========================================================
echo   StudyMind AI is now running successfully!
echo   - Web UI:  http://localhost:3000
echo   - API Docs: http://localhost:8000/docs
echo.
echo   Keep the opened command windows running while using the app.
echo ========================================================
echo.
pause
