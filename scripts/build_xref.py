#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
index.html(2022~2026 입결) ↔ data/mojip2027.json(2027 모집요강) 학과 상호 연결표 생성

두 자료는 대학명·학과명 표기가 서로 달라서(예: 국립공주대/공주대, 고려대(세)/고려대(세종),
한국외대(글)/한국외대(글로벌)) 그대로는 이어지지 않는다. 양쪽 이름을 같은 규칙으로
정규화하고 별칭표를 적용해 맞춘 뒤, 매칭된 학과의 연도별 70%컷 중앙값을 뽑아 둔다.

출력: data/xref.json
{
  "built": "...",
  "years": [2022..2026],
  "univs": [원본 대학명 사전],
  "map": { "정규화키": [대학사전인덱스, 원본학과명, [연도별 등급70 중앙값]] },
  "stats": {...}
}

정규화 키는 planner 쪽에서도 같은 규칙(JS로 동일 구현)으로 만들어 조회한다.
오연결(엉뚱한 학과의 과거 입결을 보여주는 것)이 링크가 없는 것보다 나쁘므로,
애매한 경우는 버리는 쪽을 택했다.

사용법:
    python3 scripts/build_xref.py
"""
import re
import json
import pathlib
import datetime
import statistics
import collections

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
MOJIP = ROOT / "data" / "mojip2027.json"
OUT = ROOT / "data" / "xref.json"

YEARS = [2022, 2023, 2024, 2025, 2026]

# index.html ↔ 모집요강 사이의 대학명 별칭 (정규화만으로 안 맞는 것들)
UNIV_ALIAS = {
    "한국공대": "한국공학대",
    "서울과학기술대": "서울과기대",
    "추계예술대": "추계예대",
    "한국체육대": "한국체대",
    "가톨릭꽃동네대": "꽃동네대",
    "감리교신학대": "감신대",
    "한국침례신학대": "침신대",
    "대전가톨릭대": "대전가톨릭대",
}


def norm_univ(name):
    """대학명 정규화: 국립 접두어·캠퍼스 괄호·표기 흔들림 제거."""
    n = name.strip()
    n = re.sub(r"^국립", "", n)
    n = re.sub(r"\(.*$", "", n)          # 캠퍼스 구분 괄호 제거
    n = re.sub(r"대학교$", "대", n)
    n = n.replace(" ", "")
    return UNIV_ALIAS.get(n, n)


# 괄호 안 내용 중 '다른 학과'를 뜻하는 구분자. 이걸 지우면 한의예과(인문)과
# 한의예과(자연)이 같은 키가 되어 엉뚱한 과거 입결이 붙는다. 반드시 키에 남긴다.
DISCRIMINATORS = {
    "인문": "인문", "인문계열": "인문", "인문사회": "인문", "인문·예능": "인문",
    "자연": "자연", "자연계열": "자연", "자연·예능": "자연",
    "예체능": "예체능", "예능": "예체능",
    "야": "야", "야간": "야",
    "남": "남", "여": "여",
    "5년제": "5년", "4년제": "4년", "2년제": "2년", "6년제": "6년",
}


def norm_dept(name):
    """학과명 정규화. 괄호 설명은 지우되, 학과를 가르는 구분자는 키에 남긴다."""
    d = name.strip()
    d = re.sub(r"^\[[^\]]*\]", "", d)     # [통합], [유형2] 등
    discs = sorted({
        DISCRIMINATORS[m.strip()]
        for m in re.findall(r"\(([^)]*)\)", d)
        if m.strip() in DISCRIMINATORS
    })
    d = re.sub(r"\([^)]*\)", "", d)       # 괄호 안 설명 제거
    d = re.sub(r"[\s·，,／/‧・]", "", d)
    d = re.sub(r"(전공|학과|학부|과|계열|학|부)$", "", d)
    return d + ("~" + "".join(discs) if discs else "")


def key(u, d):
    nu, nd = norm_univ(u), norm_dept(d)
    return f"{nu}|{nd}" if nu and nd else None


def load_index():
    html = INDEX.read_text(encoding="utf-8")
    m = re.search(r'<script[^>]*id="raw-data"[^>]*>', html)
    start = m.end()
    end = html.index("</script>", start)
    return json.loads(html[start:end])


def main():
    idx = load_index()
    C = {c: i for i, c in enumerate(idx["columns"])}

    # 정규화 키별로 연도별 70%컷을 모은다 (전형이 여럿이면 중앙값)
    buckets = collections.defaultdict(lambda: collections.defaultdict(list))
    names = {}
    for r in idx["rows"]:
        u, d, yr, g = r[C["대학"]], r[C["학과"]], r[C["연도"]], r[C["등급70"]]
        k = key(u, d)
        if not k:
            continue
        names.setdefault(k, (u, d))
        if g is not None:
            buckets[k][yr].append(g)

    xmap = {}
    for k, years in buckets.items():
        y = {yr: round(statistics.median(v), 2) for yr, v in years.items() if v}
        if not y:
            continue
        u, d = names[k]
        xmap[k] = (u, d, [y.get(yr) for yr in YEARS])

    # 모집요강 쪽에서 실제로 조회될 키만 남겨 파일을 줄인다
    moj = json.loads(MOJIP.read_text(encoding="utf-8"))
    PC = {c: i for i, c in enumerate(moj["columns"])}
    S = moj["strings"]
    wanted = set()
    for r in moj["rows"]:
        k = key(S[r[PC["대학명"]]], S[r[PC["모집단위"]]])
        if k:
            wanted.add(k)

    kept = {k: v for k, v in xmap.items() if k in wanted}
    matched_rows = sum(
        1 for r in moj["rows"]
        if key(S[r[PC["대학명"]]], S[r[PC["모집단위"]]]) in kept
    )

    # 대학명은 반복이 심하므로 사전으로 빼고, 항목은 배열로 눕혀 파일을 줄인다
    univs, uidx = [], {}
    compact = {}
    for k, (u, d, gs) in sorted(kept.items()):
        if u not in uidx:
            uidx[u] = len(univs)
            univs.append(u)
        compact[k] = [uidx[u], d, gs]

    payload = {
        "built": datetime.date.today().isoformat(),
        "note": "index.html(2022~2026 입결)의 연도별 등급70 중앙값. 전형이 여럿이면 중앙값.",
        "years": YEARS,
        "univs": univs,
        "map": compact,     # 키 → [대학사전인덱스, 학과원본명, 연도별 등급70]
        "stats": {
            "index_keys": len(xmap),
            "mojip_keys": len(wanted),
            "linked_keys": len(kept),
            "mojip_rows_linked": matched_rows,
            "mojip_rows_total": len(moj["rows"]),
        },
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    s = payload["stats"]
    print(f"wrote {OUT.name}: {OUT.stat().st_size/1024:.0f}KB")
    print(f"  index 학과키 {s['index_keys']:,} · 모집요강 학과키 {s['mojip_keys']:,} "
          f"→ 연결 {s['linked_keys']:,} ({s['linked_keys']/s['mojip_keys']*100:.1f}%)")
    print(f"  모집요강 {s['mojip_rows_total']:,}행 중 {s['mojip_rows_linked']:,}행"
          f" ({s['mojip_rows_linked']/s['mojip_rows_total']*100:.1f}%)에 과거 입결 연결")


if __name__ == "__main__":
    main()
