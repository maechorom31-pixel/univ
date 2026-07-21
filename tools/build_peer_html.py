#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""peer.html(뼈대) + peer_data.js(데이터) → peer-local.html(데이터 내장 완성본).

완성본은 학생 파생 데이터를 담으므로 커밋 금지(.gitignore 차단), 채팅 전송 전용.

사용법:
    python3 tools/build_peer_html.py peer.html <peer_data.js> <out peer-local.html>
"""
import sys

shell_path, data_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
shell = open(shell_path, encoding="utf-8").read()
data = open(data_path, encoding="utf-8").read()
marker = "<!--PEER_DATA_PLACEHOLDER-->"
assert marker in shell, "placeholder not found in shell HTML"
inlined = "<script>\n" + data + "\n</script>"
out = shell.replace(marker, inlined)
with open(out_path, "w", encoding="utf-8") as f:
    f.write(out)
print(f"완성본 작성: {out_path}  ({len(out.encode())/1e6:.1f} MB)")
