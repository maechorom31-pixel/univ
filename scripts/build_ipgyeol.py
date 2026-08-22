#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
수시 입결 통합 데이터 빌드 (2022~2026)

입력
  data/source.xlsx   대학어디가 발표자료 원본(대용량, 저장소에 포함하지 않음)
                     -> '대학자료' 시트만 사용 (2023~2026 수시)
  index.html         기존 사이트 내장 데이터 (2022~2026) — 2022년치와
                     엑셀에 없는 논술·실기 행의 유일한 출처

출력
  data/ipgyeol.json          통합 입결 데이터
  data/track_alias.json      전형명 별칭표 (사이트 표기 -> 엑셀 정본 표기)
  data/review_track_conflict.csv   전형명 통일 시 키가 겹치는 행(육안 확인용)
  data/review_comp_anomaly.csv     경쟁률 1 미만 행(시간서식 오파싱 의심분 포함)

병합 규칙
  1) 전형명은 엑셀 표기를 정본으로 삼는다.
     엑셀은 2023~2026 전 연도에 같은 표기를 쓰지만 기존 사이트 데이터는
     연도마다 표기가 달라('교과(지역)' vs '교과(지역균형)') 연도 연결이 끊겼다.
     겹치는 행에서 (사이트 전형명 -> 엑셀 전형명) 대응을 학습해
     2022년과 엑셀에 없는 행에도 소급 적용한다.
  2) 키가 겹치면 엑셀 행을 남긴다. 엑셀에 없는 해·전형은 사이트 행을 보존한다.
     **개명한 이름이 같은 학과 안에서 다른 전형과 부딪히면 개명을 포기한다.**
     별칭표 키에 학과가 없어서(대학|카테고리|전형) 한 대학에 일괄로 적용되는데,
     두 이름이 같은 학과 같은 해에 다 있는 곳이 100 군데 있다. 예전에는 그때
     한 줄을 버려서 서로 다른 전형이 통째로 사라졌다. 이름을 맞추는 것보다
     줄을 지키는 것이 먼저다.

     ※ 이 규칙은 원본 엑셀이 없어 **아직 돌려 보지 못했다.** 이미 나와 있는
       data/ipgyeol.json 은 scripts/fix_track_conflict.py 로 되돌려 두었다.
  3) 등급50 > 등급70 인 행은 두 값을 맞바꾼다.
     70%컷은 50%컷보다 나쁜(숫자가 큰) 값이어야 하는데 엑셀 원본에 역전이 있다.
  4) 경쟁률이 1 미만이면서 엑셀 시간서식으로 오파싱된 값은 되돌린다.
     흔적은 (a) 정확히 분 단위로 떨어지고 (b) 소수 네 자리로 표현되지 않는 것.
     시간서식은 20/24 처럼 나눈 값이라 소수가 길게 이어지지만, 손으로 적는
     경쟁률은 길어야 소수 두세 자리다. 0.5·0.25·0.075 같은 값은 실제 미달로 본다.
"""
import openpyxl, json, csv, os, re, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
SRC = os.path.join(ROOT, "data", "source.xlsx")
OUT = os.path.join(ROOT, "data")

# 같은 대학의 표기 차이 (엑셀 표기 -> 사이트 표기)
UNIV_ALIAS = {
    "고려대(세종)": "고려대(세)",
    "홍익대(세종)": "홍익대(세)",
    "한국기술교육대": "한국기술교대",
    "가톨릭꽃동네대": "꽃동네대",
}


def uni(v):
    return UNIV_ALIAS.get(str(v), str(v))


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def key(u, y, cat, track, dept):
    return (u, y, cat, str(track), str(dept))


# ---------------------------------------------------------------- 원본 로드
print("[1/6] 엑셀 '대학자료' 시트 로드")
wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
it = wb["대학자료"].iter_rows(values_only=True)
XH = {h.strip(): i for i, h in enumerate(str(x) for x in next(it))}
X = [list(r) for r in it if r[XH["대학"]] is not None]
print(f"      {len(X)}행")

print("[2/6] index.html 내장 데이터 로드")
html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
S = json.loads(re.search(r'<script type="application/json" id="raw-data">(.*?)</script>',
                         html, re.S).group(1))
COLS, SR = S["columns"], S["rows"]
C = {c: i for i, c in enumerate(COLS)}
print(f"      {len(SR)}행")

# ---------------------------------------------------------------- 전형명 별칭 학습
print("[3/6] 전형명 별칭 학습")
# 전형명을 뺀 나머지가 모두 같으면 같은 행으로 본다
xsig = {}
for r in X:
    xsig.setdefault((uni(r[XH["대학"]]), r[XH["연도"]], str(r[XH["교과/종합"]]),
                     str(r[XH["학과"]]), round(num(r[XH["모집인원"]]) or -1, 2),
                     round(num(r[XH["경쟁률"]]) or -1, 2)), r)

votes = collections.defaultdict(collections.Counter)
for r in SR:
    k = (r[C["대학"]], r[C["연도"]], r[C["카테고리"]], str(r[C["학과"]]),
         round(num(r[C["모집"]]) or -1, 2), round(num(r[C["경쟁률"]]) or -1, 2))
    x = xsig.get(k)
    if x:
        votes[(r[C["대학"]], r[C["카테고리"]], str(r[C["전형"]]))][str(x[XH["전형"]])] += 1

alias, ambiguous = {}, 0
for k, cnt in votes.items():
    top, n = cnt.most_common(1)[0]
    if len(cnt) > 1 and n / sum(cnt.values()) < 0.8:
        ambiguous += 1          # 한 이름이 여러 전형으로 갈리면 건드리지 않는다
        continue
    if k[2] != top:
        alias[k] = top
print(f"      개명 {len(alias)}건 · 모호해서 보류 {ambiguous}건")


def renamed(u, cat, track):
    return alias.get((u, cat, str(track)), str(track))


# ---------------------------------------------------------------- 보정 헬퍼
stat = collections.Counter()


def fix_grade(g50, g70):
    """70%컷은 50%컷보다 나쁜 값이어야 한다."""
    if g50 is not None and g70 is not None and g50 > g70 + 0.005:
        stat["등급50/70 역전 보정"] += 1
        return g70, g50
    return g50, g70


# 학과 단위로 엑셀 경쟁률을 모아 복원값 대조에 쓴다
xcomp = collections.defaultdict(list)
for r in X:
    v = num(r[XH["경쟁률"]])
    if v is not None:
        xcomp[(uni(r[XH["대학"]]), r[XH["연도"]], str(r[XH["학과"]]))].append(v)


def timeserial(v):
    """엑셀 시간서식으로 읽힌 값이면 복원값을, 아니면 None을 준다."""
    if v is None or not 0 < v < 1:
        return None
    if abs(v * 1440 - round(v * 1440)) > 1e-6:
        return None                     # 분 단위로 안 떨어지면 시간서식이 아니다
    if abs(round(v, 4) - v) < 1e-9:
        return None                     # 0.5·0.075 처럼 짧게 쓸 수 있으면 실제 미달
    m = int(round(v * 1440))
    return m // 60 + (m % 60) / 100


def fix_comp(u, y, dept, v):
    """0.375694 처럼 '9:01'로 읽힌 값을 9.01 로 되돌린다."""
    restored = timeserial(v)
    if restored is None:
        return v
    if any(abs(x - restored) < 0.06 for x in xcomp.get((u, y, str(dept)), [])):
        stat["경쟁률 보정(엑셀 대조 확인)"] += 1
    else:
        stat["경쟁률 보정(패턴만)"] += 1
    return restored


# 사이트에만 있는 값 채우기용
region_of, gyeyeol_of = {}, {}
for r in SR:
    region_of.setdefault(r[C["대학"]], r[C["지역"]])
    gyeyeol_of.setdefault((r[C["대학"]], str(r[C["학과"]])), r[C["계열"]])
for r in X:
    region_of.setdefault(uni(r[XH["대학"]]), str(r[XH["지역"]]))

# ---------------------------------------------------------------- 병합
print("[4/6] 병합")
rows, seen = [], set()

for r in X:                                   # 엑셀이 정본
    u, y = uni(r[XH["대학"]]), r[XH["연도"]]
    cat, dept, track = str(r[XH["교과/종합"]]), str(r[XH["학과"]]), str(r[XH["전형"]])
    k = key(u, y, cat, track, dept)
    if k in seen:
        stat["엑셀 내부 중복 스킵"] += 1
        continue
    seen.add(k)
    g50, g70 = fix_grade(num(r[XH["등급50"]]), num(r[XH["등급70"]]))
    gy = str(r[XH["인문/자연"]]) if r[XH["인문/자연"]] else None
    if gy == "통합":                           # 사이트 표기와 맞춘다
        gy = None
    row = [None] * len(COLS)
    row[C["지역"]] = region_of.get(u) or str(r[XH["지역"]])
    row[C["대학"]], row[C["연도"]], row[C["카테고리"]] = u, y, cat
    row[C["전형"]], row[C["학과"]] = track, dept
    row[C["계열"]] = gyeyeol_of.get((u, dept)) or gy
    row[C["모집"]] = num(r[XH["모집인원"]])
    row[C["경쟁률"]] = fix_comp(u, y, dept, num(r[XH["경쟁률"]]))
    row[C["등급50"]], row[C["등급70"]] = g50, g70
    row[C["지원"]] = num(r[XH["총지원지원"]])
    rows.append(row)
    stat["엑셀 행"] += 1

for r in SR:                                  # 엑셀에 없는 해·전형만 보존
    r = list(r)
    u, cat = r[C["대학"]], r[C["카테고리"]]
    orig = str(r[C["전형"]])
    track = renamed(u, cat, orig)
    k = key(u, r[C["연도"]], cat, track, r[C["학과"]])

    # 별칭표 키에 학과가 없어서(대학|카테고리|전형) 한 대학에 일괄로 적용된다.
    # 두 이름이 *같은 학과 같은 해*에 다 있는 곳에서는 개명한 키가 서로 부딪힌다.
    # 예전에는 그때 이 줄을 버렸는데, 그러면 서로 다른 전형 하나가 통째로 사라지고
    # 남은 줄은 제 이름이 아닌 개명후 이름을 달게 된다.
    #
    #     경성대 소프트웨어학과 2024
    #         종합(지역Ⅱ)   모집 4  70컷 2.67   ← 이 값이
    #         종합(학교생활)  모집 8  70컷 5.79   ← 이 이름을 달고 남았다
    #
    # 100 묶음이 이랬고 70%컷이 1등급 넘게 벌어지는 것이 16건이었다.
    # 부딪히면 **개명을 포기한다.** 이름을 맞추는 것보다 줄을 지키는 것이 먼저다.
    if k in seen and track != orig:
        stat["개명 보류(같은 학과에서 충돌)"] += 1
        track = orig
        k = key(u, r[C["연도"]], cat, track, r[C["학과"]])
    elif track != orig:
        stat["사이트 행 전형명 개명"] += 1

    if k in seen:
        stat["엑셀 우선으로 스킵"] += 1
        continue
    seen.add(k)
    r[C["전형"]] = track
    r[C["등급50"]], r[C["등급70"]] = fix_grade(num(r[C["등급50"]]), num(r[C["등급70"]]))
    r[C["경쟁률"]] = fix_comp(u, r[C["연도"]], r[C["학과"]], num(r[C["경쟁률"]]))
    rows.append(r)
    stat["사이트 전용 행 보존"] += 1

for k, v in stat.most_common():
    print(f"      {k}: {v}")

# ---------------------------------------------------------------- 검증
print("[5/6] 검증")
assert len(rows) == len(seen), "키 중복"
bad = [r for r in rows if r[C["등급50"]] is not None and r[C["등급70"]] is not None
       and r[C["등급50"]] > r[C["등급70"]] + 0.005]
assert not bad, f"등급 역전 {len(bad)}건"
missing = [c for c in ("지역", "대학", "연도", "카테고리", "전형", "학과")
           if any(r[C[c]] in (None, "") for r in rows)]
assert not missing, f"필수 컬럼 결측: {missing}"
# 기존 사이트 행이 살아있는지 — 개명한 이름으로든 원래 이름으로든.
# 충돌하면 개명을 포기하므로 둘 다 봐야 한다.
newk = {key(r[C["대학"]], r[C["연도"]], r[C["카테고리"]], r[C["전형"]], r[C["학과"]]) for r in rows}
lost = [r for r in SR
        if key(r[C["대학"]], r[C["연도"]], r[C["카테고리"]],
               renamed(r[C["대학"]], r[C["카테고리"]], r[C["전형"]]), r[C["학과"]]) not in newk
        and key(r[C["대학"]], r[C["연도"]], r[C["카테고리"]],
                str(r[C["전형"]]), r[C["학과"]]) not in newk]
assert not lost, f"기존 행 유실 {len(lost)}건"

grp = collections.defaultdict(dict)
for r in rows:
    grp[(r[C["대학"]], str(r[C["학과"]]), r[C["카테고리"]], str(r[C["전형"]]))][r[C["연도"]]] = r
has26 = sum(1 for v in grp.values() if 2026 in v)
delta = sum(1 for v in grp.values() if 2026 in v and 2025 in v
            and v[2026][C["등급70"]] is not None and v[2025][C["등급70"]] is not None)
print(f"      {len(rows)}행 · 연도별 "
      f"{dict(sorted(collections.Counter(r[C['연도']] for r in rows).items()))}")
print(f"      전년 대비 비교 가능: {delta}/{has26} ({delta / has26 * 100:.1f}%)")

# ---------------------------------------------------------------- 출력
print("[6/6] 저장")
json.dump({"schema": "v10", "columns": COLS, "rows": rows},
          open(os.path.join(OUT, "ipgyeol.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
json.dump({f"{k[0]}|{k[1]}|{k[2]}": v for k, v in sorted(alias.items())},
          open(os.path.join(OUT, "track_alias.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

# 개명 후 같은 키가 되는 행 — 값이 달라 하나만 남으므로 육안 확인이 필요하다
collide = collections.Counter()
for r in SR:
    collide[key(r[C["대학"]], r[C["연도"]], r[C["카테고리"]],
                renamed(r[C["대학"]], r[C["카테고리"]], r[C["전형"]]), r[C["학과"]])] += 1
with open(os.path.join(OUT, "review_track_conflict.csv"), "w",
          newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["대학", "연도", "카테고리", "원래전형", "개명후전형", "학과",
                "모집", "경쟁률", "등급50", "등급70"])
    for r in sorted(SR, key=lambda r: (r[C["대학"]], r[C["연도"]], str(r[C["학과"]]))):
        t = renamed(r[C["대학"]], r[C["카테고리"]], r[C["전형"]])
        if collide[key(r[C["대학"]], r[C["연도"]], r[C["카테고리"]], t, r[C["학과"]])] > 1:
            w.writerow([r[C["대학"]], r[C["연도"]], r[C["카테고리"]], r[C["전형"]], t,
                        r[C["학과"]], r[C["모집"]], r[C["경쟁률"]],
                        r[C["등급50"]], r[C["등급70"]]])

with open(os.path.join(OUT, "review_comp_anomaly.csv"), "w",
          newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["대학", "연도", "카테고리", "전형", "학과", "경쟁률",
                "시간서식의심", "복원하면"])
    for r in rows:
        v = num(r[C["경쟁률"]])
        if v is None or not 0 < v < 1:
            continue
        restored = timeserial(v)
        w.writerow([r[C["대학"]], r[C["연도"]], r[C["카테고리"]], r[C["전형"]], r[C["학과"]],
                    v, "Y" if restored is not None else "",
                    restored if restored is not None else ""])
print("      완료")
