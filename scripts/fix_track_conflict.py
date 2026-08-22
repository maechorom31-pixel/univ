#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
전형명 통일이 뭉개 버린 줄을 되돌린다.
=====================================================================
`build_ipgyeol.py` 는 전형명을 대학어디가 엑셀 표기로 통일한다. 별칭표의 키가

    대학 | 카테고리 | 원래전형   →   개명후전형

라 **학과가 없다.** 그래서 한 대학 안에서 일괄 적용되는데, 두 이름이 *같은 학과
같은 해*에 다 있는 곳에서는 둘이 한 키가 되어 버린다. 그때 한 줄만 남고 나머지는
사라진다. 남은 줄도 제 이름이 아니라 **개명후 이름**을 달고 남는다.

    경성대 소프트웨어학과 2024
        종합(지역Ⅱ)    모집 4  70컷 2.67   ← 이 값이
        종합(학교생활)   모집 8  70컷 5.79   ← 이 이름을 달고 남았다. 8명짜리 줄은 사라졌다

100개 묶음이 이 꼴이고, 사라진 줄이 100개다. 70%컷이 1등급 넘게 벌어지는 것이
16건, 2등급 넘는 것이 5건이다. **27건은 어려운 쪽이 사라져 카드가 실제보다 쉬워
보인다.**

`review_track_conflict.csv` 에 충돌한 줄이 원래 이름과 값까지 그대로 적혀 있어서
되돌릴 수 있다. 하는 일은 둘.

  1. 남은 줄의 이름을 **원래 이름으로** 되돌린다 (값으로 짝을 찾는다)
  2. 사라진 줄을 **원래 이름으로** 되살린다
     지역·계열은 같은 묶음의 남은 줄에서 빌리고, 지원자 수는 모집 × 경쟁률로 셈한다

원래는 `build_ipgyeol.py` 의 별칭표 키에 학과를 넣는 것이 옳다. 그러려면 원본
엑셀(`data/source.xlsx`)이 있어야 하는데 저장소에 없어서, 결과물을 고치는 쪽으로 했다.
**엑셀을 다시 돌리면 이 스크립트도 다시 돌려야 한다.**

    python3 scripts/fix_track_conflict.py
"""
import csv, json, os, io, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
IP = os.path.join(ROOT, "data", "ipgyeol.json")
CSVP = os.path.join(ROOT, "data", "review_track_conflict.csv")


def num(v):
    """빈 칸은 None. CSV 는 전부 글자로 오므로 숫자로 되돌린다."""
    if v in ("", "None", None):
        return None
    f = float(v)
    return int(f) if f == int(f) else f


def main():
    doc = json.load(io.open(IP, encoding="utf-8"))
    C = {c: i for i, c in enumerate(doc["columns"])}
    rows = doc["rows"]

    conflicts = list(csv.DictReader(io.open(CSVP, encoding="utf-8-sig")))
    groups = collections.defaultdict(list)
    for r in conflicts:
        groups[(r["대학"], int(r["연도"]), r["카테고리"], r["학과"], r["개명후전형"])].append(r)
    groups = {k: v for k, v in groups.items() if len({x["원래전형"] for x in v}) > 1}

    # 개명후 이름으로 자료에 남아 있는 줄을 찾는다
    live = collections.defaultdict(list)
    for i, r in enumerate(rows):
        live[(r[C["대학"]], r[C["연도"]], r[C["카테고리"]], r[C["전형"]], r[C["학과"]])].append(i)

    # 이름을 바꾸면 키도 바뀐다. 처음에 한 번 만든 색인만 보고 「이미 있다」를
    # 판단하면, 방금 비운 자리를 아직 차 있다고 읽어 되살릴 줄을 건너뛴다.
    keys = set(live.keys())
    renamed = restored = 0
    added = []
    skipped = []
    for (univ, year, cat, dept, after), items in groups.items():
        idx = live.get((univ, year, cat, after, dept), [])
        if not idx:
            continue
        base = rows[idx[0]]
        # 값으로 짝을 찾아 남은 줄의 이름을 되돌린다.
        # 빈 칸이 `0` 과 `None` 으로 갈려 있는 줄이 있어 둘을 같게 본다.
        same = lambda a, b: (a or 0) == (b or 0)
        taken = set()
        for i in idx:
            for it in items:
                if it["원래전형"] in taken:
                    continue
                if (same(rows[i][C["모집"]], num(it["모집"]))
                        and same(rows[i][C["등급70"]], num(it["등급70"]))):
                    keys.discard((univ, year, cat, rows[i][C["전형"]], dept))
                    rows[i][C["전형"]] = it["원래전형"]
                    keys.add((univ, year, cat, it["원래전형"], dept))
                    taken.add(it["원래전형"])
                    renamed += 1
                    break
        # 남은 것을 되살린다. **이미 그 이름이 있으면 넣지 않는다** —
        # 되살리려는 것이 실은 이름만 다른 같은 줄인 경우가 있다.
        for it in items:
            if it["원래전형"] in taken:
                continue
            if (univ, year, cat, it["원래전형"], dept) in keys:
                skipped.append((univ, dept, year, it["원래전형"]))
                continue
            quota, rate = num(it["모집"]), num(it["경쟁률"])
            row = list(base)
            row[C["전형"]] = it["원래전형"]
            row[C["모집"]] = quota
            row[C["경쟁률"]] = rate
            row[C["등급50"]] = num(it["등급50"])
            row[C["등급70"]] = num(it["등급70"])
            # 지원자 수는 CSV 에 없다. 경쟁률 × 모집으로 셈한다 — 원본도 그 관계다.
            row[C["지원"]] = (round(quota * rate, 2)
                              if quota is not None and rate is not None else None)
            added.append(row)
            keys.add((univ, year, cat, it["원래전형"], dept))
            taken.add(it["원래전형"])
            restored += 1

    rows.extend(added)
    doc["rows"] = rows
    with io.open(IP, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))

    print(f"충돌 묶음 {len(groups)}")
    print(f"  이름을 되돌린 줄 {renamed}")
    print(f"  되살린 줄       {restored}")
    if skipped:
        print(f"  이미 있어 건너뛴 줄 {len(skipped)}")
        for x in skipped[:5]:
            print(f"     {x[0]} {x[1]} {x[2]} 「{x[3]}」")
    print(f"  전체 행         {len(rows)}")


if __name__ == "__main__":
    main()
