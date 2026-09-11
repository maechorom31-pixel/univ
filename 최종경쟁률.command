#!/bin/sh
#
# 맥에서 최종 경쟁률 받기
# ---------------------------------------------------------------
# 파인더에서 이 파일을 두 번 눌러 주세요. 안 열리면 터미널에서
#
#     cd <이 폴더>
#     sh 최종경쟁률.command
#
# 윈도우는 같은 폴더의 「최종경쟁률.bat」 을 두 번 누르시면 됩니다.
# 하는 일은 둘이 똑같습니다 — 받고, 올립니다.
#
cd "$(dirname "$0")" || exit 1

echo
echo "  최종 경쟁률 받기"
echo "  ========================================="
echo
echo "  접수 중의 실시간 경쟁률은 더 받지 않습니다."
echo "  대학이 최종을 올린 주소만 받아 상담 보드에 붙입니다."
echo

if ! command -v python3 >/dev/null 2>&1; then
  echo "  파이썬을 찾지 못했습니다."
  echo
  echo "  터미널에서 아래를 한 번 치시면 설치 안내가 뜹니다."
  echo "      xcode-select --install"
  echo "  또는 www.python.org/downloads 에서 내려받아 설치해 주세요."
  echo
  exit 1
fi

echo "  [1/2] 최종 경쟁률을 받습니다."
echo
python3 scripts/ratio_final.py || {
  echo
  echo "  중간에 멈췄습니다. 위의 메시지를 그대로 보내 주세요."
  exit 1
}

echo
echo "  [2/2] 저장소에 올립니다. 보드는 1~2분 뒤 갱신됩니다."
#
# git 으로 먼저 해 보고, 안 되면 토큰으로 올린다.
#
# git push 는 사람에게 아이디와 토큰을 물어야 하는데, 그 물음이 안 뜨는 자리가
# 있다(자격 증명 도우미가 비어 있거나 창을 띄우지 못할 때). 그때 -q 로 조용히
# 실패하면 받아 놓고도 안 올라간 채 끝난다. 그래서 실패하면 곧바로
# `ratio_upload.py` 로 넘긴다 — 토큰 하나만 있으면 되고, 처음 한 번 물어본 뒤
# 홈 폴더의 .univ_token 에 둔다.
#
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git add data/ratio/board.json scripts/ratio_final_urls.txt scripts/ratio_sources.json >/dev/null 2>&1
  git commit -q -m "최종 경쟁률 $(date '+%m/%d %H:%M')" >/dev/null 2>&1
  if ! git push; then
    echo
    echo "  git 으로 올리지 못했습니다. 토큰으로 올려 봅니다."
    echo
    python3 scripts/ratio_upload.py
  fi
else
  python3 scripts/ratio_upload.py
fi

echo
echo "  끝났습니다. 보드에서 새로고침을 누르면 경쟁률이 붙습니다."
