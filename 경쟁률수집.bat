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

echo   [1/4] 대학 페이지를 읽습니다. 1~2분 걸립니다.
echo.
%PY% scripts\ratio_fetch.py
if errorlevel 1 goto fail

echo.
echo   [2/4] 화면을 만듭니다.
echo.
%PY% scripts\ratio_build.py
if errorlevel 1 goto fail

echo.
echo   [3/4] 내년 예측용 시점별 자료로 접어 둡니다.
echo.
%PY% scripts\ratio_archive.py

echo.
echo   [4/4] 저장소에 올립니다. 배포 주소가 1~2분 뒤 갱신됩니다.
git rev-parse --is-inside-work-tree > nul 2>&1
if errorlevel 1 goto upload
git add data\ratio ratio.html > nul 2>&1
git commit -q -m "경쟁률 스냅샷 %date% %time:~0,5%" > nul 2>&1
git push -q
if errorlevel 1 echo   (올리지 못했습니다. 화면 파일은 정상이니 그대로 쓰셔도 됩니다.)
goto done

:upload
%PY% scripts\ratio_upload.py

:done
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
echo   중간에 멈췄습니다. 위의 메시지를 그대로 보내 주세요.
pause
exit /b 1
