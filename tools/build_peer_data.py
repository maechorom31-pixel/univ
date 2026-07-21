#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""parsed.json + 입결(index.html) → peer.html에 내장할 컴팩트 데이터(JS) 생성.

산출물(peer_data.js: `window.PEER = {...}`)은 학생 파생 데이터라 커밋 금지(.gitignore 차단).
gap-합격률 곡선·등급밴드 표본은 여기서 데이터로부터 재계산해 내장한다(DESIGN §3 준수).

사용법:
    python3 tools/build_peer_data.py <parsed.json> <index.html> <out peer_data.js>
"""
import json
import re
import statistics
import sys
from collections import Counter, defaultdict

CAT = ["교과", "종합", "논술", "실기", "수능", "기타"]
TRK = ["인문", "자연", "예체능", "공학", "공통", "의학"]
CAT_I = {c: i for i, c in enumerate(CAT)}
TRK_I = {t: i for i, t in enumerate(TRK)}


def norm_major(m):
    if not m:
        return ""
    m = re.sub(r"[\s·ㆍ()\[\]/]", "", m)
    m = re.sub(r"^\[통합\]|^\[야\]", "", m)
    return m


def rep_grade(s):
    return s["grades"].get("전과목") or s["grades"].get("국수영사과")


def load(parsed_path, index_html):
    d = json.load(open(parsed_path, encoding="utf-8"))
    html = open(index_html, encoding="utf-8").read()
    m = re.search(r'<script[^>]*id="raw-data"[^>]*>(.*?)</script>', html, re.S)
    ip = json.loads(m.group(1))
    return d, ip


def build_ipgyeol_index(ip):
    """(연도,대학,카테고리,정규화학과)·(연도,대학,정규화학과)·(연도,대학,카테고리) → 행 목록."""
    C = {c: i for i, c in enumerate(ip["columns"])}
    by_ycm = defaultdict(list)
    by_ym = defaultdict(list)
    by_yc = defaultdict(list)
    for r in ip["rows"]:
        y, u, cat, maj = r[C["연도"]], r[C["대학"]], r[C["카테고리"]], norm_major(r[C["학과"]])
        rec = {"g50": r[C["등급50"]], "g70": r[C["등급70"]], "cr": r[C["경쟁률"]],
               "mo": r[C["모집"]], "reg": r[C["지역"]]}
        by_ycm[(y, u, cat, maj)].append(rec)
        by_ym[(y, u, maj)].append(rec)
        by_yc[(y, u, cat)].append(rec)
    return C, by_ycm, by_ym, by_yc


def join_g50(idx, year, univ, cat, major, latest=None):
    """3단계 폴백으로 등급50 중앙값을 찾는다. latest 주면 그 연도 우선 후 근접연도."""
    _, by_ycm, by_ym, by_yc = idx
    years = [year] if latest is None else [year]
    for y in years:
        for tbl, key in ((by_ycm, (y, univ, cat, major)),
                         (by_ym, (y, univ, major)),
                         (by_yc, (y, univ, cat))):
            rows = tbl.get(key)
            if rows:
                vals = [r["g50"] for r in rows if r["g50"] is not None]
                if vals:
                    return statistics.median(vals)
    return None


def compute_gap_curve(d, idx):
    """전남 2025 지원을 입결 등급50에 조인해 카테고리별 gap-합격률 곡선(0.25 버킷) 산출."""
    j = d["jeonnam"]
    raw = defaultdict(lambda: [0, 0])  # (cat, bucket) -> [pass, total]
    for s in j["students"]:
        g = rep_grade(s)
        if g is None:
            continue
        for i in s["apps"]:
            a = j["apps"][i]
            if a["final"] not in ("합격", "충원합격", "불합격"):
                continue
            g50 = join_g50(idx, s["year"], a["univ"], a["cat"], norm_major(a["major"]))
            if g50 is None:
                continue
            b = round((g - g50) * 4) / 4  # 0.25 단위
            b = max(-2.0, min(2.0, b))
            key = (a["cat"], b)
            raw[key][1] += 1
            if a["final"] in ("합격", "충원합격"):
                raw[key][0] += 1
    curve = {}
    for cat in ("교과", "종합"):
        pts = []
        for k in [x / 4 for x in range(-8, 9)]:
            p, n = raw[(cat, k)]
            pts.append([k, p, n])
        # n<30 버킷은 이웃과 병합하며 유효 확률만 남긴다
        merged = []
        acc_p = acc_n = 0
        buf_k = []
        for k, p, n in pts:
            acc_p += p
            acc_n += n
            buf_k.append(k)
            if acc_n >= 30:
                merged.append([statistics.mean(buf_k), round(acc_p / acc_n, 3), acc_n])
                acc_p = acc_n = 0
                buf_k = []
        if buf_k and merged:  # 잔여는 마지막에 흡수
            merged[-1] = [merged[-1][0], round((merged[-1][1] * merged[-1][2] + acc_p) /
                                               (merged[-1][2] + acc_n), 3), merged[-1][2] + acc_n]
        curve[cat] = merged
    return curve


def main():
    parsed_path, index_html, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    d, ip = load(parsed_path, index_html)
    idx = build_ipgyeol_index(ip)
    C = idx[0]

    # ---- 문자열 테이블 (인덱스 인코딩) ----
    univ_set = set(r[C["대학"]] for r in ip["rows"])
    for lbl in ("jeonnam", "naju"):
        for a in d[lbl]["apps"]:
            if a["univ"]:
                univ_set.add(a["univ"])
    U = sorted(univ_set)
    Ui = {u: i for i, u in enumerate(U)}
    ip_univ = set(r[C["대학"]] for r in ip["rows"])
    U_inip = [1 if u in ip_univ else 0 for u in U]

    Mj = []
    Mi = {}

    def mid(m):
        m = m or ""
        if m not in Mi:
            Mi[m] = len(Mj)
            Mj.append(m)
        return Mi[m]

    Rg = []
    Ri = {}

    def rid(r):
        r = r or ""
        if r not in Ri:
            Ri[r] = len(Rg)
            Rg.append(r)
        return Ri[r]

    Ad = []
    Ai = {}

    def aid(a):
        a = a or ""
        if a not in Ai:
            Ai[a] = len(Ad)
            Ad.append(a)
        return Ai[a]

    def res_code(f):
        if f in ("합격", "충원합격"):
            return 1
        if f == "불합격":
            return 0
        return None

    def pack(section, with_year):
        # 학생 단위 배열(sg=대표등급, sy=학년도)과 앱 단위 병렬 배열(s=학생인덱스)
        cols = {"s": [], "u": [], "m": [], "c": [], "t": [], "res": [],
                "reg": [], "rgn": [], "ad": [], "chungwon": []}
        sg, sy = [], []
        for si, s in enumerate(section["students"]):
            g = rep_grade(s)
            sg.append(round(g, 2) if g is not None else None)
            sy.append(s["year"])
            for i in s["apps"]:
                a = section["apps"][i]
                cols["s"].append(si)
                cols["u"].append(Ui.get(a["univ"], -1) if a["univ"] else -1)
                cols["m"].append(mid(a["major"]))
                cols["c"].append(CAT_I.get(a["cat"], 5))
                cols["t"].append(TRK_I.get(a["track"], -1))
                cols["res"].append(res_code(a["final"]))
                cols["reg"].append(1 if a["reg"] else 0)
                cols["rgn"].append(rid(a["region"]))
                cols["ad"].append(aid(a["adm"]))
                cols["chungwon"].append(1 if a["final"] == "충원합격" else 0)
        cols["sg"] = sg
        if with_year:
            cols["sy"] = sy
        return cols

    jn = pack(d["jeonnam"], with_year=False)
    nj = pack(d["naju"], with_year=True)

    # ---- 입결 컴팩트 (런타임 카드·추이용) ----
    ipMj = []
    ipMi = {}

    def ip_mid(m):
        m = m or ""
        if m not in ipMi:
            ipMi[m] = len(ipMj)
            ipMj.append(m)
        return ipMi[m]

    ipc = {"u": [], "y": [], "c": [], "m": [], "g50": [], "g70": [], "cr": [], "mo": []}
    for r in ip["rows"]:
        u = r[C["대학"]]
        if u not in Ui:  # 입결 대학은 U에 모두 포함되어 있음
            continue
        ipc["u"].append(Ui[u])
        ipc["y"].append(r[C["연도"]])
        ipc["c"].append(CAT_I.get(r[C["카테고리"]], 5))
        ipc["m"].append(ip_mid(r[C["학과"]]))
        ipc["g50"].append(r[C["등급50"]])
        ipc["g70"].append(r[C["등급70"]])
        ipc["cr"].append(r[C["경쟁률"]])
        ipc["mo"].append(r[C["모집"]])

    gap_curve = compute_gap_curve(d, idx)

    # 등급밴드 표본(검증/표시용)
    bands = defaultdict(lambda: [0, 0])
    for s in d["jeonnam"]["students"]:
        g = rep_grade(s)
        if g is None:
            continue
        b = round(g * 2) / 2
        bands[b][0] += 1
        bands[b][1] += len(s["apps"])
    bands_out = {f"{k:.1f}": v for k, v in sorted(bands.items())}

    peer = {
        "meta": {
            "jeonnam_year": 2025,
            "naju_years": sorted(set(nj["sy"])),
            "n_jeonnam_students": len(d["jeonnam"]["students"]),
            "n_naju_students": len(d["naju"]["students"]),
            "latest_ip_year": max(ipc["y"]),
        },
        "U": U, "U_inip": U_inip, "Mj": Mj, "Rg": Rg, "Ad": Ad, "ipMj": ipMj,
        "CAT": CAT, "TRK": TRK,
        "jn": jn, "nj": nj, "ip": ipc,
        "gapCurve": gap_curve, "bands": bands_out,
    }

    payload = json.dumps(peer, ensure_ascii=False, separators=(",", ":"))
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("window.PEER=")
        f.write(payload)
        f.write(";")
    mb = len(payload.encode()) / 1e6
    print(f"peer_data.js 작성: {out_path}  ({mb:.1f} MB)")
    print(f"  대학 {len(U)} · 학과 {len(Mj)} · 지역 {len(Rg)} · 전형명 {len(Ad)}")
    print(f"  전남 지원행 {len(jn['s'])} · 나주고 지원행 {len(nj['s'])} · 입결행 {len(ipc['u'])}")
    print("  gapCurve 교과:", [f"{k:+.2f}:{p*100:.0f}%(n{n})" for k, p, n in gap_curve["교과"]])
    print("  gapCurve 종합:", [f"{k:+.2f}:{p*100:.0f}%(n{n})" for k, p, n in gap_curve["종합"]])


if __name__ == "__main__":
    main()
