@echo off
cd /d "%~dp0"
if not exist node_modules\next\dist\bin\next (
  echo Instale as dependencias primeiro com npm install.
  pause
  exit /b 1
)
echo.
echo Acesse http://localhost:3000 depois que o aplicativo iniciar.
echo Mantenha esta janela aberta enquanto usar o aplicativo.
echo.
call npm run dev
pause
