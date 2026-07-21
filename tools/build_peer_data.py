#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""parsed.json + 입결(index.html) → peer.html에 내장할 컴팩트 데이터(JS) 생성.

산출물(peer_data.js: `window.PEER = {...}`)은 학생 파생 데이터라 커밋 금지(.gitignore 차단).
확률 모델(힌지 로지스틱)·슈링크 강도 m·버킷 곡선은 여기서 데이터로부터 재적합해 내장한다.

모델 선택 근거(학생 단위 80/20 홀드아웃, 2025 전남):
  버킷보간 AUC .674/.687(교과/종합) < 로지스틱(gap+logCR) .737/.749 < 힌지 .746/.750.
  경쟁률(logCR)이 gap과 독립적인 강한 예측변수. 힌지(gap± 분리)로 단조 보장.
  m은 {4,8,12,20,40} 그리드에서 홀드아웃 Brier 최소값 채택(실측 m=4).
  외부검증: 전남 학습→나주고 5년 테스트 AUC .83(교과)/.75(종합), 관측이 예측보다
  +13%p 높음(과거 연도 완화 효과) → UI에 "보수적 예측" 고지.

사용법:
    python3 tools/build_peer_data.py <parsed.json> <index.html> <out peer_data.js>
"""
import json
import math
import random
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


def join_cut(idx, year, univ, cat, major):
    """3단계 폴백으로 입결 컷(등급70 우선, 없으면 등급50) 중앙값을 찾는다.

    등급70이 합격선에 가까워 예측력이 더 높음(홀드아웃 AUC 교과 .753→.758, 종합 .735→.741).
    index.html 추이 그래프의 '등급70 ?? 등급50' 관행과도 일치.
    """
    _, by_ycm, by_ym, by_yc = idx
    for tbl, key in ((by_ycm, (year, univ, cat, major)),
                     (by_ym, (year, univ, major)),
                     (by_yc, (year, univ, cat))):
        rows = tbl.get(key)
        if rows:
            vals = [r["g70"] for r in rows if r["g70"] is not None] or \
                   [r["g50"] for r in rows if r["g50"] is not None]
            if vals:
                return statistics.median(vals)
    return None


def major_group(m):
    return re.sub(r"(학부|학과|학전공|전공|과)$", "", norm_major(m))


def join_cut_cr(idx, year, univ, cat, major):
    """입결 컷(등급70 우선)과 경쟁률을 함께 조인(3단계 폴백)."""
    _, by_ycm, by_ym, by_yc = idx
    for tbl, key in ((by_ycm, (year, univ, cat, major)),
                     (by_ym, (year, univ, major)),
                     (by_yc, (year, univ, cat))):
        rows = tbl.get(key)
        if rows:
            g = [r["g70"] for r in rows if r["g70"] is not None] or \
                [r["g50"] for r in rows if r["g50"] is not None]
            cr = [r["cr"] for r in rows if r["cr"] is not None]
            if g:
                return statistics.median(g), (statistics.median(cr) if cr else None)
    return None, None


def sig(z):
    return 1 / (1 + math.exp(-max(-30, min(30, z))))


def logistic_fit(X, Y, iters=60):
    """IRLS(뉴턴법) 로지스틱 회귀 — 외부 의존성 없이 순수 파이썬."""
    k = len(X[0])
    w = [0.0] * k
    for _ in range(iters):
        gw = [0.0] * k
        H = [[0.0] * k for _ in range(k)]
        for xi, yi in zip(X, Y):
            p = sig(sum(a * b for a, b in zip(w, xi)))
            r = p * (1 - p) + 1e-9
            for a in range(k):
                gw[a] += (yi - p) * xi[a]
                for b in range(k):
                    H[a][b] += r * xi[a] * xi[b]
        M = [row[:] + [gw[i]] for i, row in enumerate(H)]
        for col in range(k):
            piv = max(range(col, k), key=lambda r2: abs(M[r2][col]))
            M[col], M[piv] = M[piv], M[col]
            for r2 in range(k):
                if r2 != col and abs(M[col][col]) > 1e-12:
                    f = M[r2][col] / M[col][col]
                    for c2 in range(col, k + 1):
                        M[r2][c2] -= f * M[col][c2]
        dw = [M[i][k] / M[i][i] if abs(M[i][i]) > 1e-12 else 0 for i in range(k)]
        w = [wi + di for wi, di in zip(w, dw)]
        if max(abs(x) for x in dw) < 1e-8:
            break
    return w


def brier(pairs):
    return sum((p - y) ** 2 for p, y in pairs) / len(pairs)


def fit_prob_model(d, idx):
    """힌지 로지스틱 P(합격)=σ(w0+w1·gap⁻+w2·gap⁺+w3·logCR) 적합 + m 튜닝.

    반환: {cat: {w:[...], crmed}}, m, 진단문자열
    """
    j = d["jeonnam"]
    samples = []
    for si, s in enumerate(j["students"]):
        g = rep_grade(s)
        if g is None:
            continue
        for i in s["apps"]:
            a = j["apps"][i]
            if a["final"] not in ("합격", "충원합격", "불합격") or a["cat"] not in ("교과", "종합"):
                continue
            g50, cr = join_cut_cr(idx, s["year"], a["univ"], a["cat"], norm_major(a["major"]))
            if g50 is None:
                continue
            samples.append(dict(gap=g - g50, cat=a["cat"], cr=cr,
                                y=1 if a["final"] != "불합격" else 0,
                                si=si, g=g, u=a["univ"], mg=major_group(a["major"])))
    random.seed(42)
    sids = list(set(s["si"] for s in samples))
    random.shuffle(sids)
    test_sid = set(sids[:len(sids) // 5])
    train = [s for s in samples if s["si"] not in test_sid]
    test = [s for s in samples if s["si"] in test_sid]

    crmed = {c: statistics.median([s["cr"] for s in train if s["cat"] == c and s["cr"] and s["cr"] > 0])
             for c in ("교과", "종합")}

    def feats(s):
        lcr = math.log(max(0.1, s["cr"] if (s["cr"] and s["cr"] > 0) else crmed[s["cat"]]))
        gap = max(-2.5, min(2.5, s["gap"]))
        return [1, min(gap, 0), max(gap, 0), lcr]

    model = {}
    for c in ("교과", "종합"):
        tr = [s for s in train if s["cat"] == c]
        w = logistic_fit([feats(s) for s in tr], [s["y"] for s in tr])
        model[c] = {"w": [round(x, 4) for x in w], "crmed": round(crmed[c], 2)}

    def p_curve(s):
        w = model[s["cat"]]["w"]
        return sig(sum(a * b for a, b in zip(w, feats(s))))

    # m 튜닝: 로컬 관측(대학·카테고리·학과군·등급밴드±0.25)과의 혼합
    loc = defaultdict(lambda: [0, 0])
    for s in train:
        band = round(s["g"] * 4) / 4
        for db in (-0.25, 0, 0.25):
            key = (s["u"], s["cat"], s["mg"], band + db)
            loc[key][0] += s["y"]
            loc[key][1] += 1
    best_m, best_b = None, 1e9
    for m in (2, 4, 8, 12, 20, 40):
        pairs = []
        for s in test:
            pc = p_curve(s)
            k, n = loc.get((s["u"], s["cat"], s["mg"], round(s["g"] * 4) / 4), (0, 0))
            pairs.append(((k + m * pc) / (n + m), s["y"]))
        b = brier(pairs)
        if b < best_b:
            best_m, best_b = m, b

    # 최종 모델은 전체 표본으로 재적합
    for c in ("교과", "종합"):
        alls = [s for s in samples if s["cat"] == c]
        w = logistic_fit([feats(s) for s in alls], [s["y"] for s in alls])
        model[c] = {"w": [round(x, 4) for x in w], "crmed": round(crmed[c], 2)}
    diag = f"m={best_m} (holdout Brier {best_b:.4f}), n={len(samples)}"
    return model, best_m, diag


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
            g50 = join_cut(idx, s["year"], a["univ"], a["cat"], norm_major(a["major"]))
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

    MR = []  # 수능최저 원문 dedup 테이블 (나주고)
    MRi = {}

    def mrid(t):
        if not t:
            return -1
        t = re.sub(r"_x000D_", " ", t)
        t = re.sub(r"\s+", " ", t).strip(" *")
        if not t:
            return -1
        if t not in MRi:
            MRi[t] = len(MR)
            MR.append(t)
        return MRi[t]

    COMBOS = ["전과목", "국수영사과", "국영수사", "국영수과", "국영수", "국영사", "수영과"]

    def pack(section, with_year):
        # 학생 단위 배열(sg=대표등급, g7=조합별 등급, sy=학년도)과 앱 단위 병렬 배열(s=학생인덱스)
        cols = {"s": [], "u": [], "m": [], "c": [], "t": [], "res": [],
                "reg": [], "rgn": [], "ad": [], "chungwon": []}
        sg, sy = [], []
        g7 = [[] for _ in COMBOS]
        for si, s in enumerate(section["students"]):
            g = rep_grade(s)
            sg.append(round(g, 2) if g is not None else None)
            sy.append(s["year"])
            for ci, combo in enumerate(COMBOS):
                v = s["grades"].get(combo)
                g7[ci].append(round(v, 2) if v is not None else None)
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
                if with_year:
                    cols.setdefault("mr", []).append(mrid(a.get("minreq")))
        cols["sg"] = sg
        cols["g7"] = g7
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
    prob_model, shrink_m, diag = fit_prob_model(d, idx)

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
        "U": U, "U_inip": U_inip, "Mj": Mj, "Rg": Rg, "Ad": Ad, "ipMj": ipMj, "MR": MR,
        "CAT": CAT, "TRK": TRK, "COMBOS": COMBOS,
        "jn": jn, "nj": nj, "ip": ipc,
        "gapCurve": gap_curve, "bands": bands_out,
        "probModel": prob_model, "shrinkM": shrink_m,
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
    print(f"  확률모델: {json.dumps(prob_model, ensure_ascii=False)} | {diag}")
    print(f"  최저 원문 테이블 {len(MR)}건")
    print("  gapCurve 교과:", [f"{k:+.2f}:{p*100:.0f}%(n{n})" for k, p, n in gap_curve["교과"]])
    print("  gapCurve 종합:", [f"{k:+.2f}:{p*100:.0f}%(n{n})" for k, p, n in gap_curve["종합"]])


if __name__ == "__main__":
    main()
