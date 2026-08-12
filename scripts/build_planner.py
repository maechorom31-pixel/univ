#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
src/planner.tpl.html + data/mojip2027.json → planner.html

템플릿의 __DATA__ 자리에 정제 JSON을 인라인 임베드해 단일 HTML을 만든다.
(index.html과 같은 방식 — 파일 하나로 열리고 링크로 공유 가능)

사용법:
    python3 scripts/build_planner.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
TPL = ROOT / "src" / "planner.tpl.html"
DATA = ROOT / "data" / "mojip2027.json"
OUT = ROOT / "planner.html"

PLACEHOLDER = "__DATA__"


def main():
    tpl = TPL.read_text(encoding="utf-8")
    if PLACEHOLDER not in tpl:
        raise SystemExit(f"템플릿에 {PLACEHOLDER} 자리표시자가 없습니다: {TPL}")

    raw = DATA.read_text(encoding="utf-8")
    payload = json.loads(raw)  # 유효성 확인

    # <script> 블록 안에 안전하게 넣기 위해 </script> 시퀀스만 이스케이프
    safe = raw.replace("</", "<\\/")

    html = tpl.replace(PLACEHOLDER, safe)
    OUT.write_text(html, encoding="utf-8")
    print(f"built {OUT.name}: {len(html)/1024/1024:.2f}MB "
          f"({payload['meta']['rows_clean']:,} rows, {len(payload['strings']):,} strings)")


if __name__ == "__main__":
    main()
