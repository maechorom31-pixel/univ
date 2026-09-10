@echo off
chcp 65001 > nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"

echo.
echo   2027 수시 경쟁률 수집
echo   ---------------------------------------------
echo.

set PY=
where py > nul 2>&1
if %errorlevel%==0 set PY=py
if defined PY goto run

where python > nul 2>&1
if %errorlevel%==0 set PY=python
if defined PY goto run

echo   파이썬을 찾지 못했습니다.
echo.
echo   https://www.python.org/downloads/ 에서 내려받아 설치하시고,
echo   설치 첫 화면의 "Add python.exe to PATH" 를 꼭 체크해 주세요.
echo   설치한 뒤에 이 파일을 다시 실행하시면 됩니다.
echo.
pause
exit /b 1

:run
echo   [1/2] 대학 페이지를 읽는 중입니다. 1~2분 걸립니다.
echo.
%PY% scripts\ratio_fetch.py
if errorlevel 1 goto fail

echo.
echo   [2/2] 화면을 만드는 중입니다.
echo.
%PY% scripts\ratio_build.py
if errorlevel 1 goto fail

echo.
echo   끝났습니다. ratio.html 을 엽니다.
start "" "ratio.html"
timeout /t 3 > nul
exit /b 0

:fail
echo.
echo   중간에 멈췄습니다. 위 메시지를 그대로 알려 주시면 봐 드리겠습니다.
echo.
pause
exit /b 1
