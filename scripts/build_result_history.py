#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
지난해 수시 최종 결과 보고서(xls) -> data/result_history.json

최종 결과 보고서 1부는 대학마다 그해 지원·합격·등록과 지난 2개년 지원·합격을
나란히 놓는다. 보드는 올해 것만 들고 있으므로 예년 칸을 채우려면 작년 문서가
있어야 한다. 여기서 그 숫자를 떠 온다.

2부(학생별 명단)는 실명·학번이 들어 있어 읽지 않는다.

까다로운 점 — 원본이 한글에서 쪽 단위로 저장돼 표 하나가 여러 시트에 걸쳐
잘려 있고, 잘린 쪽에는 머리행이 없으며 열 위치도 쪽마다 다르다. 그래서
머리행이 있는 쪽에서 (열 -> 연도·항목) 을 얻고, 머리행이 없는 쪽은 숫자가
실린 열을 왼쪽부터 항목 차례에 맞춘다. 맞췄는지는 원본의 「합계」 행과
열별 합을 대조해 확인한다. 어긋나면 그 묶음의 예년 값은 버리고 그해
지원·합격·등록만 남긴다 — 틀린 숫자를 싣는 것보다 비는 편이 낫다.

입력 : data/result_source.xls  (지난해 보고서. 저장소에 포함하지 않는다)
출력 : data/result_history.json
"""
import json, os, re
import xlrd

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "data", "result_source.xls")
OUT = os.path.join(ROOT, "data", "result_history.json")

FIELDS = ("지원", "합격", "등록")
SKIP_NAMES = {"연번", "대학명", "학과", "구분", "계"}
MED = ("의예과", "치의예과", "약학과", "한의예과", "수의예과")


def num(v):
    v = str(v).strip()
    if not v:
        return None
    try:
        return int(round(float(v)))
    except ValueError:
        return None


def year_of(v):
    n = num(v)
    return n if n and 2000 < n < 2100 else None


class Reader:
    def __init__(self, path):
        self.wb = xlrd.open_workbook(path)
        self.rows = []                       # (시트, 행번호, 셀들)
        for sh in self.wb.sheets():
            for r in range(sh.nrows):
                self.rows.append((sh.name, r,
                                  [str(sh.cell_value(r, c)).strip() for c in range(sh.ncols)]))

    def title_and_date(self):
        title = date = ""
        for _, _, line in self.rows[:12]:
            first = next((v for v in line if v), "")
            if not title and "수시" in first:
                title = first
            elif not date and re.match(r"^\d{4}\.\s*\d", first):
                date = first
        return title, date


def header_slots(rows, i):
    """
    머리행이면 [(연도, 항목), ...] 을 열 차례대로. 아니면 None.

    연도는 위쪽 행에 병합돼 있는데 그 시작 열이 항목 열과 어긋난다
    (「지원」이 2025 라벨보다 한 칸 왼쪽에 있는 식). 그래서 열 위치로
    맞추지 않고 항목 차례로 가른다 — 「지원」이 나올 때마다 다음 연도다.
    """
    _, _, line = rows[i]
    if "지원" not in line or "합격" not in line:
        return None
    years = []
    for back in range(1, 4):
        if i - back < 0:
            break
        _, _, up = rows[i - back]
        found = sorted({y for y in (year_of(v) for v in up) if y}, reverse=True)
        if len(found) >= 2:
            years = found
            break
    if not years:
        return None
    labels = [v for v in line if v in FIELDS]
    slots, k = [], -1
    for v in labels:
        if v == "지원":
            k += 1
        if k < 0 or k >= len(years):
            return None
        slots.append((years[k], v))
    return slots or None


def data_row(line):
    """(대학명, [(열, 숫자)]) — 연번은 버린다."""
    idx = next((c for c, v in enumerate(line) if v and num(v) is None), None)
    if idx is None:
        return None, []
    nums = [(c, num(v)) for c, v in enumerate(line) if c > idx and num(v) is not None]
    return line[idx], nums


def main():
    rd = Reader(SRC)
    rows = rd.rows
    title, date = rd.title_and_date()

    groups, order, heading = {}, [], None
    letters = iter("가나다라마바사아자차카타")
    slots = None
    cur = None
    warn = []

    def close():
        nonlocal cur
        if cur and cur["rows"]:
            key = next(letters, f"?{len(groups)}")
            groups[key] = cur
            order.append(key)
        cur = None

    i = 0
    while i < len(rows):
        _, _, line = rows[i]
        first = next((v for v in line if v), "")
        if first.startswith("2. "):
            break                                   # 2부는 개인정보
        m = re.match(r"^([가-힣])\.\s*(.+)$", first)
        if m and not any(v in FIELDS for v in line):
            heading = m.group(2)
        s = header_slots(rows, i)
        if s:
            close()
            slots = s
            cur = {"title": heading or "", "years": sorted({y for y, _ in s}, reverse=True),
                   "rows": [], "total": None}
            heading = None
            i += 1
            continue
        if cur is not None:
            name, nums = data_row(line)
            if name in SKIP_NAMES:
                i += 1
                continue
            if name and name != "합계" and not re.match(r"^[가-힣]\.", name) and len(nums) >= 2:
                """
                숫자가 슬롯보다 적으면 어느 칸이 빈 것인지 알 수 없다. 예년 합격
                칸이 통째로 비어 있는 묶음이 있어서, 순서대로 밀어 넣으면 재작년
                지원 수가 작년 합격 수로 둔갑한다(실제로 그랬다). 그래서 그럴
                때는 맨 앞 — 그해 지원·합격·등록 — 만 취한다.
                """
                use = slots if len(nums) >= len(slots) else \
                    [sl for sl in slots if sl[0] == slots[0][0]]
                by = {}
                for (y, field), (_, v) in zip(use, nums):
                    by.setdefault(str(y), {})[field] = v
                cur["rows"].append({"name": name, "by": by, "n": len(nums)})
            elif name == "합계":
                by = {}
                for (y, field), (_, v) in zip(slots, nums):
                    by.setdefault(str(y), {})[field] = v
                cur["total"] = by
                close()
        i += 1
    close()

    # 열을 제대로 맞췄는지 합계로 검증한다
    for key, g in groups.items():
        if not g["total"]:
            continue
        ok = True
        for y, fields in g["total"].items():
            for field, want in fields.items():
                got = sum((r["by"].get(y, {}).get(field) or 0) for r in g["rows"])
                if want is not None and got != want:
                    ok = False
        g["verified"] = ok
        if not ok:
            newest = str(max(int(y) for y in g["years"]))
            for r in g["rows"]:
                r["by"] = {newest: r["by"].get(newest, {})}
            g["years"] = [int(newest)]
            warn.append(f"{key}. {g['title'] or '이름 없음'}")
    for g in groups.values():
        for r in g["rows"]:
            r.pop("n", None)

    # 의치약한수 — 학과별 합격 수와 합격 대학
    med = []
    for _, _, line in rows[:40]:
        dept = next((v for v in line if v in MED), None)
        if not dept:
            continue
        after = line[line.index(dept) + 1:]
        cnt = next((num(v) for v in after if num(v) is not None), None)
        univ = next((v for v in after if v and num(v) is None), "")
        med.append({"dept": dept, "passed": cnt, "univs": univ})

    # 묶음 구분과 그 안의 순서는 report_history.json(지난해 지원 결과 보고서를
    # 한글 원본에서 뽑은 것)이 정확하다. 여기서는 대학별 숫자만 평면으로 내보내고,
    # 묶기는 화면에서 그쪽 명단으로 한다.
    by_univ = {}
    for g in groups.values():
        for r in g["rows"]:
            slot = by_univ.setdefault(r["name"], {})
            for y, fields in r["by"].items():
                cell = slot.setdefault(y, {})
                for k2, v in fields.items():
                    if v is not None:
                        cell[k2] = v

    years = sorted({int(y) for v in by_univ.values() for y in v}, reverse=True)
    json.dump({"source": f"{title} ({date})".strip(), "years": years,
               "byUniv": by_univ, "med": med},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    newest = str(years[0]) if years else None
    full = sum(1 for v in by_univ.values() if len(v) > 1)
    print(f"연도 {years} · 대학 {len(by_univ)}곳 · 의치약한수 {len(med)}줄")
    print(f"  예년 값까지 실린 대학 {full}곳, 그해 값만 {len(by_univ) - full}곳")
    if newest:
        tot = {k: sum((v.get(newest, {}).get(k) or 0) for v in by_univ.values())
               for k in FIELDS}
        print(f"  {newest} 합계 — 지원 {tot['지원']} · 합격 {tot['합격']} · 등록 {tot['등록']}")
    if warn:
        print("합계가 안 맞아 예년 값을 버린 묶음:", ", ".join(warn))


if __name__ == "__main__":
    main()
