@echo off
rem 스케줄러용. 멈추지 않고, 브라우저를 열지 않고, 결과를 log\ 에 남긴다.
cd /d "%~dp0"
set PYTHONIOENCODING=cp949:replace
if not exist log mkdir log
set LOG=log\auto-%date:~0,4%%date:~5,2%%date:~8,2%.txt

set PY=py
py --version > nul 2>&1
if errorlevel 1 set PY=python

echo ==== %date% %time% >> "%LOG%"
%PY% scripts\ratio_fetch.py >> "%LOG%" 2>&1
if errorlevel 1 (echo 수집 실패 >> "%LOG%" & exit /b 1)
%PY% scripts\ratio_build.py >> "%LOG%" 2>&1
%PY% scripts\ratio_archive.py >> "%LOG%" 2>&1
git rev-parse --is-inside-work-tree > nul 2>&1
if errorlevel 1 (
  %PY% scripts\ratio_upload.py >> "%LOG%" 2>&1
) else (
  git add data\ratio ratio.html > nul 2>&1
  git commit -q -m "경쟁률 스냅샷 %date% %time:~0,5% (자동)" > nul 2>&1
  git push -q >> "%LOG%" 2>&1
)
echo ==== 끝 %time% >> "%LOG%"
exit /b 0
