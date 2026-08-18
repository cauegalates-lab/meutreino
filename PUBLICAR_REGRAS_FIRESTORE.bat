@echo off
setlocal
cd /d "%~dp0"
echo.
echo ===============================================
echo   MEU TREINO - PUBLICAR REGRAS DO FIRESTORE
echo ===============================================
echo.
echo Este comando publica SOMENTE firestore.rules no projeto treino-346bb.
echo Nenhuma senha ou chave privada fica salva neste arquivo.
echo.
call npx firebase-tools login
if errorlevel 1 goto :erro
call npx firebase-tools deploy --only firestore:rules --project treino-346bb
if errorlevel 1 goto :erro
echo.
echo Regras publicadas. Agora atualize o site e entre novamente com Google.
pause
exit /b 0
:erro
echo.
echo Nao foi possivel publicar as regras. Leia a mensagem acima.
pause
exit /b 1
