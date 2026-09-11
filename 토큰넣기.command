#!/bin/sh
#
# GitHub 토큰 한 번 넣어 두기 (맥)
# ---------------------------------------------------------------
# 파인더에서 두 번 누르거나, 터미널에서 `sh 토큰넣기.command`.
#
# 한 번만 하시면 됩니다. 넣어 둔 토큰은 홈 폴더의 .univ_token 에 있고,
# 저장소 폴더 밖이라 함께 올라가지 않습니다.
#
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "  파이썬을 찾지 못했습니다. 터미널에서 xcode-select --install 을 한 번 쳐 주세요."
  exit 1
fi
python3 scripts/ratio_upload.py --토큰
