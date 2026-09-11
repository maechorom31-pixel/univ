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
# **git 으로 올리지 않는다.** git push 는 아이디와 토큰을 따로 물어야 하는데,
# 그 물음이 안 뜨거나 감춰진 채로 흘러가 자꾸 실패했다. 토큰 하나로 GitHub 에
# 바로 올리는 길(`ratio_upload.py`)만 쓴다 — 처음 한 번 물어본 뒤 홈 폴더의
# .univ_token 에 두고 다시 묻지 않는다. 「토큰넣기」로 미리 넣어 두셨으면
# 여기서는 아무것도 안 묻는다.
#
python3 scripts/ratio_upload.py || {
  echo
  echo "  올리지 못했습니다. 받아 둔 것은 그대로 있으니,"
  echo "  「토큰넣기」를 한 번 돌려 토큰을 넣으신 뒤 다시 돌려 주세요."
  exit 1
}

# 이 폴더가 git 이면 방금 올린 것을 도로 내려받아 맞춰 둔다. 안 맞춰 두면
# 다음에 돌릴 때 이 폴더의 낡은 board.json 을 바탕으로 삼게 된다.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git checkout -q -- data/ratio/board.json scripts/ratio_final_urls.txt \
    scripts/ratio_sources.json 2>/dev/null
  git pull -q --ff-only 2>/dev/null \
    || echo "  (이 폴더를 최신으로 맞추려면 나중에 git pull 을 한 번 쳐 주세요.)"
fi

echo
echo "  끝났습니다. 보드에서 새로고침을 누르면 경쟁률이 붙습니다."
