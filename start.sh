#!/bin/sh
PORT="${PORT:-8000}"
echo "Starting StudyMind AI backend on port $PORT..."
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
