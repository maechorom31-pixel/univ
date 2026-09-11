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
rem git 으로 올리지 않는다. git push 는 아이디와 토큰을 따로 물어야 하는데
rem 그 물음이 안 뜨거나 감춰진 채 흘러가 자꾸 실패했다. 토큰 하나로 바로
rem 올리는 길만 쓴다. 「토큰넣기」로 미리 넣어 두셨으면 아무것도 안 묻는다.
%PY% scripts\ratio_upload.py
if errorlevel 1 goto nopush

git rev-parse --is-inside-work-tree > nul 2>&1
if errorlevel 1 goto done
rem 이 폴더가 git 이면 방금 올린 것을 도로 내려받아 맞춰 둔다
git checkout -q -- data\ratio\board.json scripts\ratio_final_urls.txt scripts\ratio_sources.json > nul 2>&1
git pull -q --ff-only > nul 2>&1
if errorlevel 1 echo   (이 폴더를 최신으로 맞추려면 나중에 git pull 을 한 번 쳐 주세요.)
goto done

:nopush
echo.
echo   올리지 못했습니다. 받아 둔 것은 그대로 있으니,
echo   「토큰넣기」를 한 번 돌려 토큰을 넣으신 뒤 다시 돌려 주세요.
echo.
pause
exit /b 1

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
