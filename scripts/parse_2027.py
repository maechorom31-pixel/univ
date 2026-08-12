#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
2027학년도 수시 모집요강 요약본(김영일교육컨설팅) 엑셀 → 정제 JSON 변환기

사용법:
    python3 scripts/parse_2027.py <엑셀파일경로> [출력경로=data/mojip2027.json]

원본 시트: '2027모집요강' (헤더 4행, 데이터 5행~, B~BE열)

출력 JSON 구조 (크기 절감을 위해 긴 텍스트는 문자열 테이블로 중복 제거):
{
  "schema": "mojip2027-v1",
  "meta": {...},
  "strings": ["...", ...],          # 텍스트 컬럼의 값 사전 (rows에는 인덱스만 저장)
  "columns": [...],                  # rows 각 원소의 컬럼 순서
  "textCols": [...],                 # strings 인덱스를 담는 컬럼 목록
  "rows": [[...], ...]
}

정제 규칙:
  - "-", 공백 → null
  - 수치 컬럼(모집인원/경쟁률/입결/추합)은 number로 변환
  - 완전 동일 중복행(NO 제외) 제거
  - 키(대학+전형+계열+모집단위+세부모집단위) 중복 시 결측('-','0')이 적은 행 유지
  - 실질경쟁률/충원율은 저장하지 않음(뷰어에서 모집·경쟁률·추합으로 계산)
"""
import sys, json, datetime
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
            "입결1_24","입결2_24","추합24","전형단계","선발비율1","선발비율2"]

# strings 테이블로 뺄 텍스트 컬럼(반복이 많은 긴 문장 위주)
TEXT_COLS = ["지역","대학명","세부전형","계열","모집단위","세부모집단위","자격학년도",
             "지원자격","전형방법1","전형방법2",
             "반영1학년","반영2학년","반영3학년","반영12학년","반영23학년","반영전체",
             "교과","출결","봉사","공통일반","진로선택","전형총점","반영총점",
             "수능최저","대학고사","고사시기","발표1단계","논술일정","면접일정","합격자발표",
             "입결1기준26","입결2기준26","입결1기준25","입결2기준25","입결1기준24","입결2기준24"]

KEY = ["대학명","세부전형","계열","모집단위","세부모집단위"]


def clean(v):
    if v is None:
        return None
    s = str(v).strip()
    if s in ("-", "", "nan", "None"):
        return None
    return s


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "data/mojip2027.json"

    df = pd.read_excel(src, sheet_name="2027모집요강", header=None,
                       skiprows=4, usecols="B:BE", names=COLS)
    n_raw = len(df)

    # 완전 동일 중복(NO 제외) 제거
    body = [c for c in df.columns if c != "NO"]
    df = df.drop_duplicates(subset=body)

    # 키 중복(입력 글리치): 결측 표기('-','0')가 적은 행을 남김
    filled = df[body].astype(str).apply(lambda r: sum(v not in ("-", "0", "nan") for v in r), axis=1)
    df = df.assign(_filled=filled).sort_values("_filled", ascending=False)
    df = df.drop_duplicates(subset=KEY).drop(columns="_filled")
    df = df.sort_index()
    n_clean = len(df)

    strings, sidx = [], {}

    def intern(s):
        if s not in sidx:
            sidx[s] = len(strings)
            strings.append(s)
        return sidx[s]

    out_cols = [c for c in COLS if c != "NO"]
    rows = []
    for _, r in df.iterrows():
        row = []
        for c in out_cols:
            v = clean(r[c])
            if v is None:
                row.append(None)
            elif c in NUM_COLS:
                try:
                    f = float(str(v).replace(",", ""))
                    row.append(int(f) if f == int(f) else round(f, 3))
                except ValueError:
                    row.append(intern(v) if c in TEXT_COLS else v)
            elif c in TEXT_COLS:
                row.append(intern(v))
            else:
                row.append(v)
        rows.append(row)

    payload = {
        "schema": "mojip2027-v1",
        "meta": {
            "source": "2027학년도 수시 모집요강 요약본 (김영일교육컨설팅, 2026-07-23 기준)",
            "note": "최종 모집요강 및 대학 공식 발표 자료를 반드시 확인할 것",
            "built": datetime.date.today().isoformat(),
            "rows_raw": n_raw, "rows_clean": n_clean,
        },
        "strings": strings,
        "columns": out_cols,
        "textCols": TEXT_COLS,
        "rows": rows,
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"rows {n_raw} -> {n_clean}, strings {len(strings)}, wrote {out}")


if __name__ == "__main__":
    main()
