#!/bin/sh
# 맥에서 쓰실 때: 터미널에서 sh 경쟁률수집.command
cd "$(dirname "$0")"
python3 scripts/ratio_fetch.py && python3 scripts/ratio_build.py || exit 1
python3 scripts/ratio_archive.py
if command -v git >/dev/null 2>&1; then
  git add data/ratio ratio.html
  git commit -q -m "경쟁률 스냅샷 $(date '+%m/%d %H:%M')" >/dev/null 2>&1
  git push -q || echo "(올리지 못했습니다. 화면 파일은 정상이니 그대로 쓰셔도 됩니다.)"
fi
open ratio.html
