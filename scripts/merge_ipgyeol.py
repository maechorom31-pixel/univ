#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
입결 자료 두 벌을 한 벌로 합친다 (일회성 정리 스크립트).

배경
----
브랜치가 갈라져 있는 동안 2026 입결을 두 갈래가 따로 손봤다.

  A = index.html 내장분   68,919행 · 2026은 14,476행 · 5,737개 학과
      2026을 대학자료 기준으로 **새로 만들어** 넣었다.
  B = ipgyeol.json        72,447행 · 2026은 17,991행 · 6,441개 학과
      기존 2026 위에 대학자료에서 7,156행을 **덧붙였다.**

어느 쪽도 다른 쪽을 포함하지 않는다.

왜 A가 기준인가
--------------
같은 2026인데 값 충실도가 뚜렷하게 차이난다.

                    경쟁률    등급70    등급50     지원
      A            97.9%    86.1%    86.9%    99.3%
      B            91.5%    71.5%    67.8%    93.2%

전형명도 A가 정리되어 있다(356종 vs 620종). B에는 덧붙이는 과정에서 생긴 문제가 남아 있다.

  - 같은 전형이 두 번 들어간 경우
    강원대 관광경영학과에 `학생부교과(농어촌)`과 `학생부교과(농어촌학생전형)`이 따로 있다.
  - 전형명 자리에 들어간 파싱 부스러기 9행
    `37.2%(19.0%)` · `학생부종합(50% cut)` · 개행이 섞인 이름 등. A에는 0행이다.
  - 앞글자가 잘린 이름 — `합(활동우수)` (연세대 55행)

그리고 data/xref.json(모집요강 ↔ 입결 연결)과 peer 모델이 A의 표기에 맞춰져 있다.

합치는 규칙 — 학과 단위로만 채운다
--------------------------------
**한 학과 안에 두 자료를 섞지 않는다.** 섞으면 같은 전형이 다른 숫자로 두 줄 남는다.
실제로 강원대 관광경영학과는 A가 `교과(일반교과) 모집 6 · 경쟁 7.0`,
B가 `학생부교과(일반) 모집 12 · 경쟁 9.4`로 서로 어긋난다. 어느 쪽이 맞는지
자료만으로는 가릴 수 없으므로, 학과 단위로 한쪽만 쓴다.

  1. A를 전부 가져간다.
  2. B에서 **A가 그 연도에 아예 다루지 않은 학과**만 통째로 가져온다. (2026 기준 1,236개 학과)
  3. 가져오는 행은 이렇게 거른다.
     - 전형명이 파싱 부스러기인 행은 버린다
     - 값이 하나도 없는 행은 버린다 (A가 정밀검증에서 지운 껍데기)
     - 값키가 같으면 한 줄로 합친다
     - 같은 학과·카테고리 안에서 전형명이 접두 관계면(`농어촌` ⊂ `농어촌학생`)
       값이 더 많이 채워진 쪽만 남긴다
  4. 캠퍼스 별칭을 A 표기로 맞춘다 — `강원대(춘천)`→`강원대`, `중앙대(다빈치)`→`중앙대`.
     두 이름의 학과가 모두 A쪽 본교 이름 아래에도 있음을 확인했다.
  5. 잘린 전형명을 고친다 — `합(활동우수)` → `종합(활동우수)`.

이렇게 하면 학과 수가 두 자료 어느 쪽보다 많아지면서(2026 기준 6,973개)
한 학과 안에서 숫자가 어긋나는 일은 생기지 않는다.

사용법
------
    python3 scripts/merge_ipgyeol.py --check   # 쓰지 않고 결과만 보고
    python3 scripts/merge_ipgyeol.py           # data/ipgyeol.json 생성

합친 뒤에는 scripts/sync_index_data.py 로 index.html에 반영하고,
scripts/build_xref.py → scripts/build_planner.py 를 다시 돌린다.
"""
import re
import sys
import json
import pathlib
import datetime
import collections

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
LEGACY = ROOT / "ipgyeol.json"
OUT = ROOT / "data" / "ipgyeol.json"

COLUMNS = ["지역", "대학", "연도", "카테고리", "전형", "학과", "계열",
           "모집", "경쟁률", "등급50", "등급70", "지원"]
C = {name: i for i, name in enumerate(COLUMNS)}
VALUE_COLS = [C["모집"], C["경쟁률"], C["등급50"], C["등급70"], C["지원"]]

# 같은 대학을 두 이름으로 부르던 것 (오른쪽이 A = 기준 표기)
UNIV_ALIAS = {
    "강원대(춘천)": "강원대",
    "중앙대(다빈치)": "중앙대",
}

# 원본에서 앞글자가 잘려 들어온 전형명
TYPE_FIX = {
    "합(활동우수)": "종합(활동우수)",
}

# 전형명 자리에 들어온 파싱 부스러기
JUNK_TYPE = re.compile(r"[%\n\r]|^\s*\d")

ROMAN = {"Ⅰ": "1", "Ⅱ": "2", "Ⅲ": "3", "Ⅳ": "4"}
_PREFIX = re.compile(r"^(학생부교과|학생부종합|학생부위주|학생부|교과위주|종합위주"
                     r"|교과|종합|논술위주|논술|실기/실적|실기위주|실기)")
_WRAPPER = re.compile(r"(학생부)?(교과|종합)?(위주)?")


def norm_type(name):
    """전형명을 비교용 키로 줄인다. 화면에 쓰는 값이 아니다.

    `학생부종합(학생부종합(면접전형))` · `종합(면접전형)` · `면접형` 이 모두
    `면접` 으로 모이게 하는 것이 목적이다.
    """
    t = str(name or "").strip()
    t = TYPE_FIX.get(t, t)
    while True:                       # 중첩 괄호를 안쪽부터 푼다
        m = re.search(r"\(([^()]*)\)\s*$", t)
        if not m:
            break
        inner, outer = m.group(1).strip(), t[:m.start()].strip()
        if not outer or _WRAPPER.fullmatch(outer) or outer in (
                "학생부교과", "학생부종합", "논술", "실기", "학생부"):
            t = inner
        else:
            t = outer + "|" + inner
            break
    for k, v in ROMAN.items():
        t = t.replace(k, v)
    t = _PREFIX.sub("", t)
    t = re.sub(r"(전형|선발|형)$", "", t)
    t = re.sub(r"[\s·\-_/()]", "", t)
    return t or "일반"


def read_embedded(path):
    """index.html 안의 <script id="raw-data"> JSON을 꺼낸다."""
    s = path.read_text(encoding="utf-8")
    i = s.index('id="raw-data"')
    i = s.index(">", i) + 1
    j = s.index("</script>", i)
    return json.loads(s[i:j])


def clean(rows):
    """캠퍼스 별칭·잘린 전형명을 고친 사본을 돌려준다."""
    out = []
    for r in rows:
        r = list(r)
        r[C["대학"]] = UNIV_ALIAS.get(r[C["대학"]], r[C["대학"]])
        r[C["전형"]] = TYPE_FIX.get(str(r[C["전형"]] or "").strip(), r[C["전형"]])
        out.append(r)
    return out


def filled(r):
    return sum(1 for i in VALUE_COLS if r[i] is not None and r[i] != "")


def value_key(r):
    return (r[C["지역"]], r[C["대학"]], r[C["연도"]], r[C["카테고리"]], r[C["학과"]],
            *(r[i] for i in VALUE_COLS))


def dedupe(rows):
    """가져올 행 안에서 같은 전형이 두 번 들어간 것을 정리한다."""
    by_value = {}
    for r in rows:                    # ① 값이 통째로 같으면 한 줄
        by_value.setdefault(value_key(r), r)
    kept = collections.defaultdict(dict)   # (대학,학과,연도,카테고리) → {core: row}
    for r in by_value.values():
        g = (r[C["대학"]], r[C["학과"]], r[C["연도"]], r[C["카테고리"]])
        core = norm_type(r[C["전형"]])
        slot = kept[g]
        # ② 전형명이 접두 관계인 기존 행이 있으면 값이 더 채워진 쪽만 남긴다
        rival = next((c for c in slot
                      if c.startswith(core) or core.startswith(c)), None)
        if rival is None:
            slot[core] = r
        elif filled(r) > filled(slot[rival]):
            del slot[rival]
            slot[core] = r
    return [r for slot in kept.values() for r in slot.values()]


def main():
    check_only = "--check" in sys.argv

    a_doc = read_embedded(INDEX)
    b_doc = json.loads(LEGACY.read_text(encoding="utf-8"))
    for name, doc in (("index.html", a_doc), ("ipgyeol.json", b_doc)):
        if doc["columns"] != COLUMNS:
            raise SystemExit(f"{name} 의 컬럼 구성이 예상과 다릅니다: {doc['columns']}")

    A = clean(a_doc["rows"])
    B = clean(b_doc["rows"])

    covered = {(r[C["대학"]], r[C["학과"]], r[C["연도"]]) for r in A}
    junk = [r for r in B if JUNK_TYPE.search(str(r[C["전형"]] or ""))]
    gap_rows = [r for r in B
                if (r[C["대학"]], r[C["학과"]], r[C["연도"]]) not in covered
                and filled(r) > 0
                and not JUNK_TYPE.search(str(r[C["전형"]] or ""))]
    added = dedupe(gap_rows)

    merged = A + added
    merged.sort(key=lambda r: (r[C["대학"]], r[C["학과"]], r[C["연도"]],
                               r[C["카테고리"]], str(r[C["전형"]])))

    # ── 보고 ───────────────────────────────────────────────
    def stat(rows, y=None):
        rs = [r for r in rows if y is None or r[C["연도"]] == y]
        return len(rs), len({(r[C["대학"]], r[C["학과"]]) for r in rs})

    print("입결 병합 — A(index.html) 기준, B(ipgyeol.json)는 빈 학과만 채움")
    print("=" * 70)
    print(f"{'연도':>6} {'A행':>8} {'B행':>8} {'추가행':>8} {'합계행':>9} "
          f"{'A학과':>8} {'B학과':>8} {'합계학과':>9}")
    for y in sorted({r[C["연도"]] for r in merged}):
        ar, ad = stat(A, y); br, bd = stat(B, y)
        nr, _ = stat(added, y); mr, md = stat(merged, y)
        print(f"{y:>6} {ar:>8} {br:>8} {nr:>8} {mr:>9} {ad:>8} {bd:>8} {md:>9}")
    ar, ad = stat(A); br, bd = stat(B); nr, _ = stat(added); mr, md = stat(merged)
    print(f"{'계':>6} {ar:>8} {br:>8} {nr:>8} {mr:>9} {ad:>8} {bd:>8} {md:>9}")
    print()
    print(f"B에서 가져올 후보 {len(gap_rows)}행 → 중복 정리 후 {len(added)}행")
    print(f"버린 것: 파싱 부스러기 {len(junk)}행 · A가 이미 다루는 학과는 건드리지 않음")
    print(f"대학 {len({r[C['대학']] for r in merged})}개 · "
          f"학과명 {len({r[C['학과']] for r in merged})}종")
    print("카테고리 " + " · ".join(
        f"{k} {v}" for k, v in collections.Counter(
            r[C["카테고리"]] for r in merged).most_common()))

    # ── 안전장치 ───────────────────────────────────────────
    assert len(merged) == len(A) + len(added), "기준 자료 손실"
    for cat, want in (("실기", 305),):
        got = sum(1 for r in merged if r[C["카테고리"]] == cat)
        assert got >= want, f"{cat} 행이 {got}개로 줄었습니다 (최소 {want})"
        print(f"확인 — {cat} {got}행 유지")
    mixed = sum(1 for g, n in collections.Counter(
        (r[C["대학"]], r[C["학과"]], r[C["연도"]]) for r in added).items()
        if g in covered)
    assert mixed == 0, "한 학과 안에 두 자료가 섞였습니다"
    print("확인 — 한 학과 안에 두 자료가 섞인 곳 없음")

    if check_only:
        print("\n--check 모드: 파일을 쓰지 않았습니다.")
        return

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "schema": "v10",
        "built": datetime.date.today().isoformat(),
        "note": ("index.html 내장분(기준)과 ipgyeol.json(빈 학과 보충)을 합친 정본. "
                 "규칙은 scripts/merge_ipgyeol.py 문서화 부분 참고."),
        "columns": COLUMNS,
        "rows": merged,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"\n{OUT.relative_to(ROOT)} 생성 "
          f"({OUT.stat().st_size / 1024 / 1024:.1f}MB · {len(merged)}행)")


if __name__ == "__main__":
    main()
