@echo off
cd /d "%~dp0"
set PYTHONIOENCODING=cp949:replace

echo.
echo   최종 경쟁률 받기
echo   =========================================
echo.
echo   접수 중의 실시간 경쟁률은 더 받지 않습니다.
echo   대학이 최종을 올린 주소만 받아 상담 보드에 붙입니다.
echo.

set PY=py
py --version > nul 2>&1
if errorlevel 1 set PY=python
%PY% --version > nul 2>&1
if errorlevel 1 goto nopy

echo   [1/2] 최종 경쟁률을 받습니다.
echo.
%PY% scripts\ratio_final.py
if errorlevel 1 goto fail

echo.
echo   [2/2] 저장소에 올립니다. 보드는 1~2분 뒤 갱신됩니다.
git rev-parse --is-inside-work-tree > nul 2>&1
if errorlevel 1 goto upload
git add data\ratio\board.json scripts\ratio_final_urls.txt > nul 2>&1
git commit -q -m "최종 경쟁률 %date% %time:~0,5%" > nul 2>&1
git push -q
if errorlevel 1 echo   (올리지 못했습니다. 인터넷을 확인하고 다시 돌려 주세요.)
goto done

:upload
%PY% scripts\ratio_upload.py

:done
echo.
echo   끝났습니다. 보드에서 새로고침을 누르면 경쟁률이 붙습니다.
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
echo   중간에 멈췄습니다. 위의 메시지를 그대로 보내 주세요.
pause
exit /b 1
