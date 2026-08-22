#!/usr/bin/env python3
"""
counsel.html 이 쓰는 `학과입결` 탭 CSV 를 만든다.

    python3 scripts/make_counsel_csv.py            # → 학과입결.csv

`data/ipgyeol.json` 이 정본이다. CSV 는 거기서 뽑아 쓰는 사본이라 저장소에 두지 않는다.
입결이 갱신되면(merge_ipgyeol.py 를 다시 돌리면) 이것도 다시 뽑아야 한다.

counsel.html 이 이름으로 읽는 열 —
    지역 · 대학 · 연도 · 카테고리 · 전형 · 학과 · 모집 · 경쟁률 · 등급50 · 등급70 · 지원
`계열` 은 안 쓰지만 버릴 까닭이 없어 그대로 둔다. 열 차례가 아니라 **이름**으로 읽으니
머리글만 맞으면 된다.
"""
import csv, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = ROOT / 'data' / 'ipgyeol.json'
out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '학과입결.csv'

doc = json.loads(src.read_text(encoding='utf-8'))
cols, rows = doc['columns'], doc['rows']

# 엑셀·구글시트가 UTF-8 을 알아보게 BOM 을 붙인다. 없으면 한글이 깨진다.
with out.open('w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerow(cols)
    for r in rows:
        w.writerow(['' if v is None else v for v in r])

print(f'{out.name}  {len(rows):,}행 × {len(cols)}열  ({out.stat().st_size/1024/1024:.1f}MB)')
print('열:', ' · '.join(cols))
