#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
data/ipgyeol.json(입결 정본)을 index.html 안의 <script id="raw-data">에 넣는다.

왜 넣어 두나
-----------
`index.html`은 파일 하나로 동작해야 한다. 선생님이 파일을 내려받아 `file://`로 열거나
USB로 옮겨도 그대로 열려야 하는데, 그렇게 열면 브라우저가 `fetch`를 막아서
바깥 JSON을 읽을 수 없다. 그래서 데이터를 파일 안에 넣어 둔다.

대신 **정본은 data/ipgyeol.json 하나**이고 index.html의 내장분은 그것을 옮겨 담은
결과물이다. 자료가 바뀌면 이 스크립트를 다시 돌린다.
`src/planner.tpl.html` → `planner.html` 과 같은 방식이다.

사용법
------
    python3 scripts/sync_index_data.py --check   # 쓰지 않고 차이만 보고
    python3 scripts/sync_index_data.py
"""
import sys
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
DATA = ROOT / "data" / "ipgyeol.json"

OPEN_TAG = '<script type="application/json" id="raw-data">'
CLOSE_TAG = "</script>"


def main():
    check_only = "--check" in sys.argv

    doc = json.loads(DATA.read_text(encoding="utf-8"))
    html = INDEX.read_text(encoding="utf-8")

    start = html.find(OPEN_TAG)
    if start < 0:
        raise SystemExit(f"index.html에서 {OPEN_TAG} 를 찾지 못했습니다.")
    body_at = start + len(OPEN_TAG)
    end = html.find(CLOSE_TAG, body_at)
    if end < 0:
        raise SystemExit("raw-data 블록이 닫히지 않았습니다.")

    old = json.loads(html[body_at:end])
    # 화면 코드가 기대하는 모양만 넣는다 (schema/columns/rows)
    payload = json.dumps({
        "schema": doc.get("schema", "v10"),
        "columns": doc["columns"],
        "rows": doc["rows"],
    }, ensure_ascii=False, separators=(",", ":"))

    print(f"index.html 내장분 {len(old['rows'])}행 → data/ipgyeol.json {len(doc['rows'])}행 "
          f"({len(doc['rows']) - len(old['rows']):+d})")
    if old["columns"] != doc["columns"]:
        print(f"  컬럼 변경: {old['columns']} → {doc['columns']}")

    if check_only:
        print("--check 모드: 파일을 쓰지 않았습니다.")
        return

    INDEX.write_text(html[:body_at] + payload + html[end:], encoding="utf-8")
    print(f"index.html 갱신 ({INDEX.stat().st_size / 1024 / 1024:.1f}MB)")


if __name__ == "__main__":
    main()
