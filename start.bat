@echo off
echo ========================================
echo   Soccer Match Prediction AI
echo   Starting Backend and Frontend...
echo ========================================
echo.

:: Store the project root
set PROJECT_ROOT=%~dp0

:: Start Backend in a new window
echo Starting Backend (FastAPI) on http://localhost:8000 ...
start "Soccer Prediction Backend" cmd /k "cd /d %PROJECT_ROOT%backend && C:\Users\USER\AppData\Local\Programs\Python\Python312\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"

:: Wait a moment for backend to start
timeout /t 3 /nobreak > nul

:: Start Frontend in a new window
echo Starting Frontend (React/Vite) on http://localhost:5173 ...
start "Soccer Prediction Frontend" cmd /k "cd /d %PROJECT_ROOT%frontend && "C:\Program Files\nodejs\npm.cmd" run dev"

:: Wait a moment then open browser
timeout /t 5 /nobreak > nul
echo.
echo Opening browser...
start http://localhost:5173

echo.
echo ========================================
echo   Both servers are running!
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo   API Docs: http://localhost:8000/docs
echo ========================================
echo.
echo Press any key to exit this window...
echo (The servers will continue running)
pause > nul
