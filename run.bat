@echo off
cd /d "%~dp0"
set PYTHONIOENCODING=cp949:replace

echo.
echo   2027 수시 경쟁률 수집
echo   =========================================
echo.

set PY=py
py --version > nul 2>&1
if errorlevel 1 set PY=python
%PY% --version > nul 2>&1
if errorlevel 1 goto nopy

echo   [1/2] 대학 페이지를 읽습니다. 1~2분 걸립니다.
echo.
%PY% scripts\ratio_fetch.py
if errorlevel 1 goto fail

echo.
echo   [2/2] 화면을 만듭니다.
echo.
%PY% scripts\ratio_build.py
if errorlevel 1 goto fail

echo.
echo   끝났습니다. ratio.html 을 엽니다.
start "" "ratio.html"
pause
exit /b 0

:nopy
echo   파이썬을 찾지 못했습니다.
echo.
echo   www.python.org/downloads 에서 내려받아 설치하시고,
echo   설치 첫 화면의 Add python.exe to PATH 를 꼭 체크해 주세요.
echo.
pause
exit /b 1

:fail
echo.
echo   중간에 멈췄습니다. 위 메시지를 알려 주시면 봐 드리겠습니다.
echo.
pause
exit /b 1
