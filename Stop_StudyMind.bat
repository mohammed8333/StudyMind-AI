@echo off
title StudyMind AI Stopper
cls
echo ========================================================
echo           Stopping StudyMind AI Servers
echo ========================================================
echo.
echo Stopping server on port 8000 (Backend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do taskkill /F /PID %%a 2>nul

echo Stopping server on port 3000 (Frontend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /F /PID %%a 2>nul

echo.
echo ========================================================
echo   All StudyMind AI servers have been stopped.
echo ========================================================
echo.
pause
