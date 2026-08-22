#!/bin/sh
# 화면 코드 구문 검사.
#
# `node --check board/board.js` 로는 안 된다 — 이 파일들은 ESM 인데 확장자가 `.js` 라
# node 가 CommonJS 로 읽어 조용히 넘어가는 일이 있다. 실제로 중괄호가 하나 빠진 채
# 검사를 통과하고, 브라우저에서야 「Unexpected end of input」 으로 드러났다.
# `.mjs` 로 복사해 재면 확실하다.
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
bad=0
for f in board/*.js board/*.mjs; do
  cp "$f" "$tmp/x.mjs"
  if ! node --check "$tmp/x.mjs" 2>"$tmp/err"; then
    echo "✗ $f"
    sed -n '1,6p' "$tmp/err" | sed 's/^/    /'
    bad=1
  fi
done
[ "$bad" = 0 ] && echo "구문 이상 없음 ($(ls board/*.js board/*.mjs | wc -l | tr -d ' ')개)"
exit "$bad"
