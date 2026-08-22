#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
지난해까지의 지원 결과 보고서(HWPX) -> data/report_history.json

지원 결과 보고서의 1부는 올해와 지난 3개년을 나란히 놓는다. 보드는 올해 지원만
들고 있으므로 지난 연도 칸은 채울 수가 없다. 그래서 작년에 낸 보고서에서
그 숫자를 그대로 떠 와 정적 자료로 둔다. 해마다 새 보고서가 나오면 그것을
입력으로 다시 돌리면 된다.

입력 : data/report_source.hwpx  (지난해 보고서. 저장소에 포함하지 않는다)
출력 : data/report_history.json
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _hwpx as H

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "data", "report_source.hwpx")
OUT = os.path.join(ROOT, "data", "report_history.json")

TRACKS = ["교과", "학종", "실기", "논술", "계"]
LINES = ["인문", "자연·공학", "예체능", "합계"]


def num(s):
    s = str(s or "").strip()
    if not s:
        return None
    m = re.match(r"^-?[\d,]+", s)
    return int(m.group(0).replace(",", "")) if m else None


def years_of(head):
    """머리행에서 연도 나오는 순서를 뽑는다. 병합셀이라 같은 값이 반복된다."""
    out = []
    for c in head:
        y = num(c)
        if y and 2000 < y < 2100 and (not out or out[-1] != y):
            out.append(y)
    return out


def cross(g):
    """가·나·다 — 전형유형 × 계열 교차표."""
    ys = years_of(g[0])
    # 부분집합 행(수도권·거점국립)은 두 머리 칸이 하나로 병합돼 r[0]==r[1] 이다.
    # 계열 본문의 「수시 지원 수」는 r[1] 이 계열명이라 이걸로 갈린다.
    label = next((r[0] for r in g[1:]
                  if r[0] and r[0] == r[1] and "지원 수" in r[0]
                  and not r[0].startswith("수시 전체")), None)
    tot = next((r for r in g if r[0].startswith("수시 전체")), None)
    stu = next((r for r in g if r[0].startswith("3학년")), None)
    sub = next((r for r in g if r[2] == "교과" and r[3] == "학종"), None)
    body = {y: {} for y in ys}
    for r in g:
        if not r[1] or r[1] not in LINES:
            continue
        for i, y in enumerate(ys):
            base = 2 + i * len(TRACKS)
            body[y][r[1]] = {t: num(r[base + j]) for j, t in enumerate(TRACKS)}
    out = {}
    for i, y in enumerate(ys):
        base = 2 + i * len(TRACKS)
        rec = {"apps": num(tot[base]) if tot else None, "byLine": body[y]}
        if stu:
            rec["students"] = num(stu[base])
        if label:
            row = next((r for r in g if r[0] == label), None)
            if row:
                rec["subsetText"] = row[base]
                rec["subset"] = num(row[base])
        out[str(y)] = rec
    return {"label": label, "years": ys, "by": out}


def ranking(g):
    """라·마·바·사·아·자 — 대학별 연도 비교표."""
    ys = [num(c) for c in g[0][2:] if num(c)]
    rows, total = [], None
    for r in g[1:]:
        name = r[1].strip()
        if not name:
            continue
        vals = {str(y): num(r[2 + i]) for i, y in enumerate(ys)}
        if name == "합계":
            total = vals
        else:
            rows.append({"name": name, "by": vals})
    return {"years": ys, "rows": rows, "total": total}


def main():
    root = H.load(SRC)
    items = list(H.walk(root))
    title = items[0][1] if items and items[0][0] == "p" else ""
    date = items[1][1] if len(items) > 1 and items[1][0] == "p" else ""

    sections, heading = [], None
    for kind, v in items:
        if kind == "p":
            if re.match(r"^[가-힣]\.\s", v):
                heading = v
            elif re.match(r"^\d\.\s", v):
                heading = None
                if v.startswith("2."):
                    break          # 2부(학생 명단)는 개인정보라 싣지 않는다
        elif heading:
            sections.append((heading, v))

    data = {"source": f"{title} ({date})", "cross": {}, "ranking": {}}
    for heading, g in sections:
        key = heading.split(".", 1)[0]
        name = heading.split(".", 1)[1].strip()
        if key in ("가", "나", "다"):
            data["cross"][key] = {"title": name, **cross(g)}
        else:
            data["ranking"][key] = {"title": name, **ranking(g)}

    years = sorted({y for s in data["cross"].values() for y in s["years"]}, reverse=True)
    data["years"] = years
    json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"교차표 {len(data['cross'])}개 · 대학표 {len(data['ranking'])}개 · 연도 {years}")
    for k, v in data["ranking"].items():
        print(f"  {k}. {v['title']} — {len(v['rows'])}개교")


if __name__ == "__main__":
    main()
