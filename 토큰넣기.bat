@echo off
cd /d "%~dp0"
set PYTHONIOENCODING=cp949:replace

rem GitHub 토큰 한 번 넣어 두기 (윈도우)
rem 한 번만 하시면 됩니다. 넣어 둔 토큰은 사용자 폴더의 .univ_token 에 있고,
rem 저장소 폴더 밖이라 함께 올라가지 않습니다.

set PY=py
py --version > nul 2>&1
if errorlevel 1 set PY=python
%PY% --version > nul 2>&1
if errorlevel 1 goto nopy

%PY% scripts\ratio_upload.py --token
echo.
pause
exit /b 0

:nopy
echo   파이썬을 찾지 못했습니다.
echo   www.python.org/downloads 에서 내려받아 설치하시고,
echo   설치 첫 화면의 Add python.exe to PATH 를 꼭 체크해 주세요.
echo.
pause
exit /b 1
