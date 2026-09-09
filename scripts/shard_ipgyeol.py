#!/usr/bin/env python3
"""
data/ipgyeol.json 을 대학별 조각으로 나눈다 — 학생 화면이 제 대학 것만 받게.
=====================================================================
입결 정본은 9MB(gzip 1.2MB)인데 학생 한 명에게 필요한 대학은 열 곳 안팎이다.
대학마다 파일 하나(197곳)로 나누고, 이름 → 파일 이름 표(index.json, gzip 1KB)를
따로 둔다. 학생 화면은 표로 제 대학의 파일만 받는다 — 큰 대학도 gzip 100KB 안이라
여덟 대학이어도 정본(1.2MB)의 몇 분의 일이다. 파일 이름은 대학명의 sha1 앞 여덟 자 —
한글 파일명이 어디서 어떻게 인코딩될지 믿지 않는다.

    data/ipgyeol/index.json      { schema, columns, univs: { 대학명: 파일키 } }
    data/ipgyeol/u/<키>.json     { univ, rows: [...] }   (정본과 같은 열 순서)

교사 보드·검색기는 그대로 정본을 쓴다. 정본을 다시 만들면(build_ipgyeol.py)
이 스크립트도 다시 돌린다 — build_ipgyeol.py 가 끝에서 부른다.

    python3 scripts/shard_ipgyeol.py
"""
import hashlib
import json
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "ipgyeol.json")
OUT = os.path.join(ROOT, "data", "ipgyeol")


def key_of(univ):
    return hashlib.sha1(str(univ).encode("utf-8")).hexdigest()[:8]


def main():
    doc = json.load(open(SRC, encoding="utf-8"))
    cols = doc["columns"]
    ci = cols.index("대학")
    buckets = {}
    for r in doc["rows"]:
        buckets.setdefault(r[ci], []).append(r)
    univs = {u: key_of(u) for u in buckets}
    if len(set(univs.values())) != len(univs):
        raise SystemExit("파일 키가 겹칩니다 — 해시 길이를 늘리세요")

    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "u"))
    sizes = []
    for u, rows in buckets.items():
        path = os.path.join(OUT, "u", f"{univs[u]}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"univ": u, "rows": rows}, f, ensure_ascii=False, separators=(",", ":"))
        sizes.append(os.path.getsize(path))
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"schema": doc.get("schema", ""), "columns": cols,
                   "univs": dict(sorted(univs.items()))},
                  f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(doc['rows'])}행 · 대학 {len(univs)}곳 → 파일 {len(univs)}개 "
          f"(하나가 {min(sizes) // 1024}~{max(sizes) // 1024}KB) · index.json "
          f"{os.path.getsize(os.path.join(OUT, 'index.json')) // 1024}KB")


if __name__ == "__main__":
    main()
