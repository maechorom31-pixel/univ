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
XREF = ROOT / "data" / "xref.json"
OUT = ROOT / "planner.html"


def embed(path):
    """JSON 파일을 읽어 <script> 블록에 넣을 수 있게 만든다."""
    raw = path.read_text(encoding="utf-8")
    payload = json.loads(raw)                 # 유효성 확인
    # </script> 로 조기 종료되지 않도록 </ 시퀀스만 이스케이프 (JSON 문자열에서 \/ 는 /)
    return raw.replace("</", "<\\/"), payload


def main():
    tpl = TPL.read_text(encoding="utf-8")
    for ph in ("__DATA__", "__XREF__"):
        if ph not in tpl:
            raise SystemExit(f"템플릿에 {ph} 자리표시자가 없습니다: {TPL}")

    data_safe, data = embed(DATA)
    xref_safe, xref = embed(XREF)

    html = tpl.replace("__DATA__", data_safe).replace("__XREF__", xref_safe)
    OUT.write_text(html, encoding="utf-8")
    s = xref["stats"]
    print(f"built {OUT.name}: {len(html)/1024/1024:.2f}MB "
          f"({data['meta']['rows_clean']:,} rows, {len(data['strings']):,} strings)")
    print(f"  과거 입결 연결: {s['mojip_rows_linked']:,}/{s['mojip_rows_total']:,}행 "
          f"({s['mojip_rows_linked']/s['mojip_rows_total']*100:.1f}%)")


if __name__ == "__main__":
    main()
