#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
2027학년도 수시 모집요강 요약본(김영일교육컨설팅) 엑셀 → 정제 JSON 변환기

사용법:
    python3 scripts/parse_2027.py <엑셀파일경로> [출력경로=data/mojip2027.json]

원본 시트: '2027모집요강' (헤더 4행, 데이터 5행~, B~BE열)

출력 JSON 구조 (크기 절감을 위해 긴 텍스트는 문자열 테이블로 중복 제거):
{
  "schema": "mojip2027-v2",
  "meta": {...},
  "strings": ["...", ...],          # 텍스트 컬럼의 값 사전 (rows에는 인덱스만 저장)
  "columns": [...],                  # rows 각 원소의 컬럼 순서
  "textCols": [...],                 # strings 인덱스를 담는 컬럼 목록
  "rows": [[...], ...]
}

정제 규칙:
  - "-", 공백 → null
  - 수치 컬럼은 엄격하게 숫자만 저장. 원본에 섞인 텍스트는 아래처럼 처리한다.
      · "통합(10)" 형태(계열통합 모집)  → 괄호 안 숫자 10을 모집인원으로 사용
      · "미발표"                        → null
      · "2027 신설"/"2025 통합 모집"    → null 로 두고 별도 컬럼 '특이표기'에 수집
      · "5..38"(마침표 중복 오타)       → 5.38 로 교정
      · 그 밖에 숫자로 못 읽는 값       → null (건수는 meta.coerce_dropped 에 기록)
  - 완전 동일 중복행(NO 제외) 제거
  - 키(대학+전형+계열+모집단위+세부모집단위) 중복 시 결측이 적은 행 유지
  - 실질경쟁률/충원율은 저장하지 않음(뷰어에서 모집·경쟁률·추합으로 계산)
"""
import sys
import re
import json
import datetime
import collections
import pandas as pd

COLS = ["NO","지역","대학명","세부전형","계열","모집단위","세부모집단위",
        "모집2027","모집2026","모집2025","모집2024","경쟁2026","경쟁2025","경쟁2024",
        "자격학년도","지원자격","전형단계","선발비율1","전형방법1","선발비율2","전형방법2",
        "반영1학년","반영2학년","반영3학년","반영12학년","반영23학년","반영전체",
        "교과","출결","봉사","공통일반","진로선택","전형총점","반영총점",
        "수능최저","대학고사","고사시기","발표1단계","논술일정","면접일정","합격자발표",
        "입결1기준26","입결1_26","입결2기준26","입결2_26","추합26",
        "입결1기준25","입결1_25","입결2기준25","입결2_25","추합25",
        "입결1기준24","입결1_24","입결2기준24","입결2_24","추합24"]

NUM_COLS = ["모집2027","모집2026","모집2025","모집2024","경쟁2026","경쟁2025","경쟁2024",
            "입결1_26","입결2_26","추합26","입결1_25","입결2_25","추합25",
            "입결1_24","입결2_24","추합24","전형단계","선발비율1","선발비율2",
            "반영1학년","반영2학년","반영3학년","반영12학년","반영23학년","반영전체",
            "교과","출결","봉사","전형총점","반영총점"]

# strings 테이블로 뺄 텍스트 컬럼(반복이 많은 긴 문장 위주)
TEXT_COLS = ["지역","대학명","세부전형","계열","모집단위","세부모집단위","자격학년도",
             "지원자격","전형방법1","전형방법2","공통일반","진로선택",
             "수능최저","대학고사","고사시기","발표1단계","논술일정","면접일정","합격자발표",
             "입결1기준26","입결2기준26","입결1기준25","입결2기준25","입결1기준24","입결2기준24",
             "특이표기"]

# 신설·통합 표기가 나타날 수 있는 컬럼 (기준칸·값칸 양쪽 모두)
NEW_SCAN = ["입결1기준26","입결1_26","입결2기준26","입결2_26",
            "입결1기준25","입결1_25","입결2기준25","입결2_25",
            "입결1기준24","입결1_24","입결2기준24","입결2_24"]

KEY = ["대학명","세부전형","계열","모집단위","세부모집단위"]

NUM_RE = re.compile(r"^-?\d+(?:\.\d+)?$")
PAREN_RE = re.compile(r"\((\d+(?:\.\d+)?)\)\s*$")   # "통합(10)" → 10
NEW_RE = re.compile(r"신설|통합\s*모집")

dropped = collections.Counter()


def clean(v):
    """빈값 표기를 None으로 통일."""
    if v is None:
        return None
    s = str(v).strip()
    if s in ("-", "", "nan", "None", "미발표"):
        return None
    return s


def to_num(s, col):
    """수치 컬럼 값을 엄격하게 숫자로 변환. 불가하면 None."""
    t = s.replace(",", "").strip()
    if NUM_RE.match(t):
        f = float(t)
        return int(f) if f == int(f) else round(f, 3)
    # "5..38" 같은 마침표 중복 오타 교정
    fixed = re.sub(r"\.{2,}", ".", t)
    if fixed != t and NUM_RE.match(fixed):
        f = float(fixed)
        return int(f) if f == int(f) else round(f, 3)
    # "통합(10)" 등 괄호 안 숫자 = 실제 모집인원
    m = PAREN_RE.search(t)
    if m:
        f = float(m.group(1))
        return int(f) if f == int(f) else round(f, 3)
    # 신설·통합 표기는 별도 컬럼에서 다루므로 여기서는 조용히 버린다
    if not NEW_RE.search(t):
        dropped[f"{col}: {t}"] += 1
    return None


def new_mark(row):
    """행에서 신설/통합 표기를 찾아 가장 최근 연도의 것을 반환."""
    found = []
    for c in NEW_SCAN:
        v = clean(row[c])
        if v and NEW_RE.search(v):
            found.append(v)
    if not found:
        return None
    def yr(s):
        m = re.search(r"(20\d{2})", s)
        return int(m.group(1)) if m else 0
    return sorted(found, key=yr)[-1]


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "data/mojip2027.json"

    df = pd.read_excel(src, sheet_name="2027모집요강", header=None,
                       skiprows=4, usecols="B:BE", names=COLS)
    n_raw = len(df)

    # 완전 동일 중복(NO 제외) 제거
    body = [c for c in df.columns if c != "NO"]
    df = df.drop_duplicates(subset=body)

    # 키 중복(입력 글리치): 결측 표기가 적은 행을 남김
    filled = df[body].astype(str).apply(
        lambda r: sum(v not in ("-", "0", "nan") for v in r), axis=1)
    df = df.assign(_filled=filled).sort_values("_filled", ascending=False)
    df = df.drop_duplicates(subset=KEY).drop(columns="_filled").sort_index()
    n_clean = len(df)

    strings, sidx = [], {}

    def intern(s):
        if s not in sidx:
            sidx[s] = len(strings)
            strings.append(s)
        return sidx[s]

    out_cols = [c for c in COLS if c != "NO"] + ["특이표기"]
    rows = []
    for _, r in df.iterrows():
        mark = new_mark(r)
        row = []
        for c in out_cols:
            v = mark if c == "특이표기" else clean(r[c])
            if v is None:
                row.append(None)
            elif c in NUM_COLS:
                row.append(to_num(v, c))
            elif c in TEXT_COLS:
                row.append(intern(v))
            else:
                row.append(v)
        rows.append(row)

    payload = {
        "schema": "mojip2027-v2",
        "meta": {
            "source": "2027학년도 수시 모집요강 요약본 (김영일교육컨설팅, 2026-07-23 기준)",
            "note": "최종 모집요강 및 대학 공식 발표 자료를 반드시 확인할 것",
            "built": datetime.date.today().isoformat(),
            "rows_raw": n_raw, "rows_clean": n_clean,
            "coerce_dropped": dict(dropped.most_common(20)),
        },
        "strings": strings,
        "columns": out_cols,
        "textCols": TEXT_COLS,
        "rows": rows,
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    print(f"rows {n_raw} -> {n_clean}, strings {len(strings)}, wrote {out}")
    if dropped:
        print("숫자로 읽지 못해 버린 값:")
        for k, n in dropped.most_common(20):
            print(f"  {k}  ({n}건)")


if __name__ == "__main__":
    main()
