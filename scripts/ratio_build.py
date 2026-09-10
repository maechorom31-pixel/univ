# -*- coding: utf-8 -*-
"""스냅샷 + 3개년 시점별 자료 -> 통합 경쟁률 화면(ratio.html) 생성.

  python scripts/ratio_build.py

예측은 「같은 시점의 경쟁률이 최종까지 몇 배로 늘었나」(배율)를 과거
자료에서 모아 적용한다. 배율은 두 갈래로 뽑아 합친다.

  · 자리 배율  — 같은 모집단위 → 같은 대학·전형 → 같은 대학·유형 → 유형
                 순으로 표본이 넉넉한 단계의 것. 그 전형만의 막판 흐름을 안다.
  · 구간 배율  — 같은 시점에 경쟁률이 비슷했던 곳들의 것. 지금 낮은 곳일수록
                 막판에 크게 뛰는 경향(평균 회귀)을 안다.

둘의 기하평균을 중앙값으로 쓰고, 구간 표본의 퍼짐으로 80% 구간과
「최종 2:1 미만으로 끝날 확률」을 낸다. 이 파일 끝의 backtest()가
2023·2024 배율로 2025 최종을 맞혀 보고 그 결과를 화면에 그대로 적는다.
"""
import json, os, re, glob, math, datetime, difflib, collections, statistics as st

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNAP_DIR = os.path.join(ROOT, 'data', 'ratio')
HIST_GLOB = os.path.join(ROOT, 'data', 'ratio_hist*.json')
MOJIP = os.path.join(ROOT, 'data', 'mojip2027.json')
OUT = os.path.join(ROOT, 'ratio.html')

YEAR = 2026                        # 올해 달력 연도(2027학년도 수시 접수)
CUR_YY = '27'                      # 올해 학년도 — 이 해의 시점별 자료는 예측에 쓰지 않는다
BUCKETS = ['d3', 'd2', 'd1', 'am', 'pm']
BUCKET_KO = {'d3': '3일 전', 'd2': '2일 전', 'd1': '1일 전',
             'am': '마감일 오전', 'pm': '마감일 오후'}
BUCKET_IDX = {'d3': 1, 'd2': 2, 'd1': 3, 'am': 4, 'pm': 5}   # hist 배열 위치


def kst_now():
    return datetime.datetime.utcnow() + datetime.timedelta(hours=9)


# ------------------------------------------------------------- 마감 시각
def _hhmm(hour, minute, ampm):
    h = int(hour)
    if ampm == '오후' and h < 12:
        h += 12
    return h, int(minute or 0)


DEADLINE_PATTERNS = [
    r'(?:접수\s*마감|원서접수\s*마감|마감\s*시간[은]?)[^\d오]{0,12}'
    r'(?:(\d{4})\s*[년.]\s*)?(\d{1,2})\s*[월.]\s*(\d{1,2})\s*[일.]?[^\d오]{0,10}'
    r'(오전|오후)?\s*(\d{1,2})\s*[:시]\s*(\d{2})?',
    r'(?:접수기간|원서접수|접수\s*기간)[\s\S]{0,70}?~[^\d오]{0,12}'
    r'(?:(\d{4})\s*[년.]\s*)?(\d{1,2})\s*[월.]\s*(\d{1,2})\s*[일.]?[^\d오]{0,10}'
    r'(오전|오후)?\s*(\d{1,2})\s*[:시]\s*(\d{2})?',
]


def find_deadline(notice, year=YEAR):
    """공지문에서 마감 시각을 읽는다. (datetime, 연도가 다른 문구를 봤는지)."""
    stale = False
    for pat in DEADLINE_PATTERNS:
        for m in re.finditer(pat, notice):
            yr, mo, da, ampm, hh, mm = m.groups()
            if yr and int(yr) != year:
                stale = True          # 작년 공지가 그대로 남은 것
                continue
            h, mi = _hhmm(hh, mm, ampm)
            try:
                return datetime.datetime(year, int(mo), int(da), h, mi), stale
            except ValueError:
                pass
    return None, stale


def consensus_deadline(pages):
    """대학들이 적어 둔 마감 시각 중 가장 흔한 날짜(시각은 그날 18시)."""
    days = collections.Counter()
    for p in pages:
        dl, _ = find_deadline(p['meta'].get('notice', ''))
        if dl:
            days[dl.date()] += 1
    if not days:
        return None
    d = days.most_common(1)[0][0]
    return datetime.datetime(d.year, d.month, d.day, 18, 0)


def page_deadline(notice, fallback):
    """(마감 datetime, 화면에 적을 사유). 공지에 없거나 연도가 어긋나면 fallback."""
    dl, stale = find_deadline(notice)
    if dl:
        return dl, ''
    if stale:
        return fallback, '공지의 마감 연도가 작년이라 다른 대학의 마감일로 봄'
    return fallback, '공지에 마감이 없어 다른 대학의 마감일로 봄'


def is_final(meta):
    """페이지가 「최종」이라 적은 것만. 공지문의 「최종 경쟁률은 … 이후 공지」에 속지 않는다."""
    return bool(meta.get('final')) and '최종' in (meta.get('stamp') or '')


def parse_stamp(iso):
    if not iso:
        return None
    try:
        return datetime.datetime.strptime(iso, '%Y-%m-%dT%H:%M')
    except ValueError:
        return None


def bucket_of(stamp, deadline):
    if not stamp or not deadline:
        return 'd1'
    gap = (deadline.date() - stamp.date()).days
    if gap <= 0:
        return 'am' if stamp.hour < 12 else 'pm'
    if gap == 1:
        return 'd1'
    if gap == 2:
        return 'd2'
    return 'd3'


# ------------------------------------------------------------- 이름 정규화
def norm_unit(s):
    s = re.sub(r'\s+', '', s or '')
    s = re.sub(r'[\[［].*?[\]］]', '', s)          # [교직] [신설] [간호교육인증]
    s = re.sub(r'[▲■★☆※◆●○△□▶▷]', '', s)
    s = s.replace('ㆍ', '·').replace('•', '·').replace('․', '·').replace('.', '·')
    s = re.sub(r'[（(].*?[)）]', '', s)
    s = re.sub(r'[-–—/].*$', '', s)
    s = re.sub(r'(전공|과정)$', '', s)
    return s


def paren_inner(s):
    """「경영학부(경영학과)」의 괄호 안 이름들. 학과명이 괄호 안에만 있는 대학이 있다."""
    return [x for x in re.findall(r'[（(]([^()（）]*)[)）]', s or '') if x]


KINDS = [('학생부교과', '교과'), ('학생부종합', '종합'), ('논술', '논술'),
         ('실기', '실기'), ('교과', '교과'), ('종합', '종합')]


def kind_of(text):
    t = re.sub(r'\s+', '', text or '')
    for pat, k in KINDS:
        if pat in t:
            return {'교과': '학생부교과', '종합': '학생부종합',
                    '논술': '논술', '실기': '실기'}[k]
    return '기타'


def clean_track(t):
    t = re.sub(r'\s*경쟁률\s*현황\s*(\[.*?\])?\s*$', '', t or '')
    t = re.sub(r'^\s*[가-힣]+캠퍼스\s*', '', t)
    return t.strip()


def norm_track(t):
    s0 = t or ''
    t = re.sub(r'\s+', '', t or '')
    t = re.sub(r'실기/?실적', '', t)
    t = re.sub(r'전형기간자율화', '', t)
    t = re.sub(r'(학생부교과|학생부종합|전형|위주|모집|정원내|정원외)', '', t)
    t = re.sub(r'[（(](.*?)[)）]', r'\1', t)
    t = t.replace('Ⅰ', '1').replace('Ⅱ', '2').replace('Ⅲ', '3')
    t = re.sub(r'[^0-9A-Za-z가-힣]', '', t)
    if not t:
        t = re.sub(r'[^0-9A-Za-z가-힣]', '', re.sub(r'\s+', '', s0))
    return t


def track_score(a, b):
    """전형 이름 둘의 닮음. 「논술(일반)」과 「일반(논술)」처럼 순서만 다른 것도 잡는다."""
    if not a or not b:
        return 0.0
    sc = difflib.SequenceMatcher(None, a, b).ratio()
    if a in b or b in a:
        sc = max(sc, 0.86)
    if sorted(a) == sorted(b):
        sc = max(sc, 0.9)
    return sc


def best_track(probe, cands):
    nt = norm_track(probe)
    best, score = None, 0.0
    for t in cands:
        sc = track_score(nt, norm_track(t))
        if sc > score:
            best, score = t, sc
    return best if score >= 0.62 else None


def unit_probes(row):
    """모집단위 이름에서 작년 자료와 맞춰 볼 후보들(정규화 후, 순서대로)."""
    raw = [row.get('unit0'), row.get('sub'), row.get('unit')]
    for cand in list(raw):
        if cand and ' ' in cand:
            raw.append(cand.split(' ')[0])
            raw.append(cand.split(' ')[-1])
    for cand in list(raw):
        raw += paren_inner(cand)
    out = []
    for cand in raw:
        n = norm_unit(cand or '')
        if n and n not in out:
            out.append(n)
    return out


def match_unit(probes, names, cutoff=0.78):
    for n in probes:
        if n in names:
            return names[n]
    for n in probes:
        m = difflib.get_close_matches(n, list(names), 1, cutoff)
        if m:
            return names[m[0]]
    return None


def resolve_univ(page_name, hist_univs):
    cands = [page_name,
             page_name.replace('대학교', '대'),
             page_name.replace('대학교', '대').replace('국립', ''),
             page_name.replace('대학교', '대').replace('여자대', '여대'),
             page_name.replace('한국외국어대학교', '한국외대'),
             page_name.replace('대학교', '대').replace('여자대', '여대').replace('국립', '')]
    for c in cands:
        if c in hist_univs:
            return c
    m = difflib.get_close_matches(page_name.replace('대학교', '대'),
                                  list(hist_univs), 1, 0.72)
    return m[0] if m else None


# ------------------------------------------------------------- 배율 통계
def cbin(c):
    """현재 경쟁률 구간. 배율은 지금 경쟁률이 낮을수록 크다."""
    return 0 if c < 1 else 1 if c < 2 else 2 if c < 3 else 3 if c < 5 else 4 if c < 10 else 5


BIN_KO = ['1 미만', '1~2', '2~3', '3~5', '5~10', '10 이상']
MINN = {1: 3, 2: 8, 3: 15, 4: 40, 5: 1}
LVL_KO = {1: '모집단위', 2: '대학·전형', 3: '대학·유형', 4: '전형유형', 5: '전체'}
BIN_MINN = {'u': 15, 'k': 30}


class Multipliers(object):
    """과거 자료에서 (시점, 자리)·(시점, 구간)별 배율 표본을 모아 둔다."""

    def __init__(self, hist_rows, years=None):
        self.place = {}
        self.bin = {}
        self.all = collections.defaultdict(list)
        for r in hist_rows:
            kind = kind_of(r.get('k') or '')
            for y, v in r['y'].items():
                if years and y not in years:
                    continue
                fin = v[6]
                if not fin or fin <= 0:
                    continue
                for b in BUCKETS:
                    cur = v[BUCKET_IDX[b]]
                    if not cur or cur < 0.3:
                        continue
                    k = fin / cur
                    if k < 1 or k > 60:
                        continue
                    for lvl, key in (
                            (1, (r['u'], r['t'], norm_unit(r['m']))),
                            (2, (r['u'], r['t'])),
                            (3, (r['u'], kind)),
                            (4, (kind,)),
                            (5, ())):
                        self.place.setdefault((lvl, b, key), []).append(k)
                    cb = cbin(cur)
                    self.bin.setdefault(('u', b, r['u'], cb), []).append(k)
                    self.bin.setdefault(('k', b, kind, cb), []).append(k)
                    self.bin.setdefault(('', b, cb), []).append(k)
                    self.all[b].append(k)
        self._med = {}

    def _median(self, key, xs):
        m = self._med.get(key)
        if m is None:
            m = self._med[key] = st.median(xs)
        return m

    def place_pick(self, bucket, univ, track, unit, kind):
        for lvl, key in ((1, (univ, track, norm_unit(unit))), (2, (univ, track)),
                         (3, (univ, kind)), (4, (kind,)), (5, ())):
            xs = self.place.get((lvl, bucket, key))
            if xs and len(xs) >= MINN[lvl]:
                return self._median(('p', lvl, bucket, key), xs), len(xs), lvl
        return None

    def bin_pick(self, bucket, univ, kind, cur):
        cb = cbin(cur)
        for key, minn in ((('u', bucket, univ, cb), BIN_MINN['u']),
                          (('k', bucket, kind, cb), BIN_MINN['k']),
                          (('', bucket, cb), 1)):
            xs = self.bin.get(key)
            if xs and len(xs) >= minn:
                return xs, self._median(('b',) + key, xs), key[0]
        return None

    def predict(self, bucket, univ, track, unit, kind, cur):
        """중앙값 배율과 그 배율을 둘러싼 표본(80% 구간·확률용)."""
        if cur is None or cur <= 0:
            return None
        pp = self.place_pick(bucket, univ, track, unit, kind)
        bp = self.bin_pick(bucket, univ, kind, cur)
        if not pp and not bp:
            return None
        if pp and bp:
            k = math.sqrt(pp[0] * bp[1])
        else:
            k = pp[0] if pp else bp[1]
        if bp:
            scale = k / bp[1]
            samples = sorted(x * scale for x in bp[0])
        else:
            samples = sorted(self.place.get((pp[2], bucket, self._place_key(pp[2], univ, track, unit, kind)), [k]))
            samples = [x * (k / st.median(samples)) for x in samples]
        n = len(samples)
        q = lambda f: samples[min(n - 1, int(n * f))]
        # 확률은 옮기지 않은 구간 표본 그대로 — 「같은 시점에 경쟁률이 비슷했던
        # 곳 중 실제로 그렇게 끝난 비율」이다. 옮긴 표본으로 재면 과신이 된다.
        raw = bp[0] if bp else samples
        return {'k': k, 'lo': q(0.10), 'hi': q(0.90), 'n': n,
                'lvl': pp[2] if pp else 0, 'src': (bp[2] if bp else '-'),
                'p1': sum(1 for x in raw if cur * x < 1) / float(len(raw)),
                'p2': sum(1 for x in raw if cur * x < 2) / float(len(raw))}

    @staticmethod
    def _place_key(lvl, univ, track, unit, kind):
        return {1: (univ, track, norm_unit(unit)), 2: (univ, track),
                3: (univ, kind), 4: (kind,), 5: ()}[lvl]


def backtest(hist_rows):
    """2023·2024 배율로 2025 최종을 맞혀 본다. 화면의 「정확도」가 여기서 나온다."""
    train = Multipliers(hist_rows, years={'23', '24'})
    err = collections.defaultdict(list)
    cov = collections.defaultdict(lambda: [0, 0])
    cal = collections.defaultdict(lambda: [0, 0])
    for r in hist_rows:
        v = r['y'].get('25')
        if not v or not v[6] or v[6] <= 0:
            continue
        kind = kind_of(r.get('k') or '')
        for b in BUCKETS:
            cur = v[BUCKET_IDX[b]]
            if not cur or cur < 0.3:
                continue
            m = train.predict(b, r['u'], r['t'], r['m'], kind, cur)
            if not m:
                continue
            fin = v[6]
            pred = cur * m['k']
            err[b].append(abs(pred - fin) / fin)
            err[(b, cbin(cur))].append(abs(pred - fin) / fin)
            c = cov[b]
            c[0] += int(cur * m['lo'] <= fin <= cur * m['hi'])
            c[1] += 1
            hit = cal[(b, min(9, int(m['p2'] * 10)))]
            hit[0] += int(fin < 2)
            hit[1] += 1
    out = {}
    for b in BUCKETS:
        if not err[b]:
            continue
        out[b] = {
            'n': len(err[b]),
            'mdape': round(100 * st.median(err[b])),
            'in20': round(100 * sum(1 for e in err[b] if e <= 0.2) / len(err[b])),
            'cov80': round(100 * cov[b][0] / max(1, cov[b][1])),
            'byBin': [round(100 * st.median(err[(b, i)])) if err[(b, i)] else None
                      for i in range(6)],
            'cal': [[round(100 * cal[(b, i)][0] / cal[(b, i)][1]), cal[(b, i)][1]]
                    if cal[(b, i)][1] >= 30 else None for i in range(10)],
        }
    return out


# ------------------------------------------------------------- 본체
def load_mojip():
    """저장소의 2027 모집요강 요약에서 대학별 최근 최종 경쟁률을 꺼낸다."""
    d = json.load(open(MOJIP, encoding='utf-8'))
    S, C, T = d['strings'], d['columns'], set(d['textCols'])
    ix = {c: i for i, c in enumerate(C)}

    def val(r, c):
        i = ix.get(c)
        if i is None or i >= len(r):
            return None
        v = r[i]
        if c in T:
            return S[v] if isinstance(v, int) and 0 <= v < len(S) else v
        return v

    by = {}
    for r in d['rows']:
        u = val(r, '대학명')
        if not u:
            continue
        by.setdefault(u, []).append({
            't': val(r, '세부전형') or '',
            'm': val(r, '모집단위') or '',
            'sub': val(r, '세부모집단위') or '',
            'n27': val(r, '모집2027'),
            'c26': val(r, '경쟁2026'),
            'c25': val(r, '경쟁2025'),
            'c24': val(r, '경쟁2024'),
        })
    return by


def load_hist():
    rows, sources = [], []
    for f in sorted(glob.glob(HIST_GLOB)):
        d = json.load(open(f, encoding='utf-8'))
        n0 = len(rows)
        for r in d['rows']:
            y = {k: v for k, v in r['y'].items() if k != CUR_YY}
            if y:                      # 올해 것만 있는 행은 아직 자료가 아니다
                rows.append(dict(r, y=y))
        if len(rows) > n0:
            sources.append(d['meta']['source'])
    if not rows:
        raise SystemExit('data/ratio_hist.json 이 없습니다.')
    return rows, sources


def pick_prev(snaps, cur):
    """직전 대비에 쓸 스냅샷. 한 시간 넘게 앞선 것 중 가장 최근, 없으면 가장 오래된 것."""
    now = datetime.datetime.strptime(cur['collected'][:16], '%Y-%m-%dT%H:%M')
    older = []
    for path in snaps[:-1]:
        s = json.load(open(path, encoding='utf-8'))
        t = datetime.datetime.strptime(s['collected'][:16], '%Y-%m-%dT%H:%M')
        older.append((t, s))
    if not older:
        return None, 0
    far = [x for x in older if (now - x[0]).total_seconds() >= 3600]
    t, s = (far[-1] if far else older[0])
    return s, int((now - t).total_seconds() // 60)


def main():
    mojip = load_mojip()
    hist_rows, hist_sources = load_hist()
    hist_univs = set(r['u'] for r in hist_rows)
    mult = Multipliers(hist_rows)
    acc = backtest(hist_rows)

    by_univ = {}
    for r in hist_rows:
        by_univ.setdefault(r['u'], []).append(r)

    snaps = sorted(glob.glob(os.path.join(SNAP_DIR, 'snap-*.json')))
    if not snaps:
        raise SystemExit('스냅샷이 없습니다. scripts/ratio_fetch.py를 먼저 실행해 주세요.')
    cur = json.load(open(snaps[-1], encoding='utf-8'))
    prev, prev_gap = pick_prev(snaps, cur)
    prev_map = {}
    if prev:
        for p in prev['pages']:
            for row in p['rows']:
                prev_map[(p['meta']['univ'], row['track'], row['unit'])] = row['applied']

    dl_all = consensus_deadline(cur['pages'])
    out_rows, univ_meta, unmatched = [], [], 0
    for p in cur['pages']:
        meta = p['meta']
        pname = meta['univ']
        hu = resolve_univ(pname, hist_univs)
        stamp = parse_stamp(meta.get('stampISO'))
        dl, dl_note = page_deadline(meta.get('notice', ''), dl_all)
        b = 'fin' if is_final(meta) else bucket_of(stamp, dl)
        univ_meta.append({
            'univ': pname, 'hist': hu, 'stamp': meta.get('stampISO', ''),
            'deadline': dl.strftime('%m/%d %H:%M') if dl else '',
            'dlNote': dl_note,
            'bucket': b, 'final': b == 'fin', 'rows': len(p['rows']),
        })
        mrows = mojip.get(hu, []) if hu else []
        mtracks = sorted(set(r['t'] for r in mrows if r['t']))
        hrows = by_univ.get(hu, []) if hu else []
        htracks = sorted(set((r['t'], r['k'] or '') for r in hrows if r['t']))
        track_cache, mcache = {}, {}

        for row in p['rows']:
            track = clean_track(row['track'])
            summary = bool(row.get('summary')) or bool(
                re.match(r'^전형별|^계열별|^모집시기', track))
            kind = kind_of(row['unit'] if summary else track)
            probe = row['unit'] if summary else track
            # 작년 시점별 자료의 전형
            if probe not in track_cache:
                cands = [t for t, k in htracks if k == kind] or [t for t, _ in htracks]
                track_cache[probe] = best_track(probe, cands)
            htrack = track_cache[probe]
            probes = unit_probes(row)
            # 모집단위 매칭 (시점별 자료)
            hrec = None
            if htrack and not summary:
                pool = [r for r in hrows if r['t'] == htrack and (r['k'] or '') == kind]
                if not pool:
                    pool = [r for r in hrows if r['t'] == htrack]
                names = {}
                for r in pool:
                    names.setdefault(norm_unit(r['m']), r)
                hrec = match_unit(probes, names)
            # 모집요강 자료의 최근 최종 경쟁률
            mrec = None
            if mrows and not summary:
                if track not in mcache:
                    mcache[track] = best_track(track, mtracks)
                mt = mcache[track]
                if mt:
                    names = {}
                    for r in mrows:
                        if r['t'] != mt:
                            continue
                        names.setdefault(norm_unit(r['m']), r)
                        if r['sub']:
                            names.setdefault(norm_unit(r['sub']), r)
                    mrec = match_unit(probes, names, 0.8)
            if hrec is None and mrec is None and not summary:
                unmatched += 1

            cur_ratio = row['ratio']
            rec = {
                'u': pname, 'tr': track, 'kd': kind,
                'cl': row.get('college', ''), 'un': row['unit'],
                'rc': row['recruit'], 'ap': row['applied'], 'r': cur_ratio,
            }
            if mrec:
                if mrec.get('c26'):
                    rec['y26'] = mrec['c26']
                    if mrec['c26'] > 0:
                        rec['pr26'] = cur_ratio / mrec['c26']
                if mrec.get('c25'):
                    rec['y25'] = mrec['c25']
            # 작년(2025) 같은 시점
            if hrec and '25' in hrec['y']:
                v = hrec['y']['25']
                rc25, r25b, r25f = v[0], v[BUCKET_IDX.get(b, 3)], v[6]
                rec['p_rc'] = rc25
                rec['p_b'] = r25b
                rec['p_f'] = r25f
                if r25b and r25b > 0:
                    rec['vs'] = cur_ratio / r25b
            if hrec and '24' in hrec['y']:
                rec['p24_f'] = hrec['y']['24'][6]
            if b != 'fin' and row['applied'] > 0:
                m = mult.predict(b, hu or '', htrack or '',
                                 row.get('unit0') or row['unit'], kind, cur_ratio)
                if m:
                    rec['k'] = round(m['k'], 3)
                    rec['pl'] = round(cur_ratio * m['lo'], 2)
                    rec['pm'] = round(cur_ratio * m['k'], 2)
                    rec['ph'] = round(cur_ratio * m['hi'], 2)
                    rec['kn'] = m['n']
                    rec['kl'] = m['lvl']
                    rec['p1'] = round(m['p1'], 2)
                    rec['p2'] = round(m['p2'], 2)
            rec['fin'] = 1 if b == 'fin' else 0
            rec['sm'] = 1 if summary else 0
            rec['bk'] = b
            pv = prev_map.get((pname, row['track'], row['unit']))
            if pv is not None:
                rec['dp'] = row['applied'] - pv
            out_rows.append(rec)

    payload = {
        'collected': cur['collected'],
        'univs': univ_meta,
        'skipped': cur.get('skipped', []),
        'rows': out_rows,
        'bucketKo': BUCKET_KO,
        'lvlKo': LVL_KO,
        'binKo': BIN_KO,
        'histSource': ' · '.join(hist_sources),
        'hasPrev': bool(prev),
        'prevAt': prev['collected'] if prev else '',
        'prevGap': prev_gap,
        'unmatched': unmatched,
        'acc': acc,
    }
    tpl = open(os.path.join(ROOT, 'src', 'ratio.tpl.html'), encoding='utf-8').read()
    html = tpl.replace('/*__DATA__*/null',
                       json.dumps(payload, ensure_ascii=False, separators=(',', ':')))
    open(OUT, 'w', encoding='utf-8').write(html)
    print('%s  %d행 / 대학 %d곳 / 작년 미매칭 %d행 (%.0f%%)'
          % (OUT, len(out_rows), len(univ_meta), unmatched,
             100.0 * unmatched / max(1, len(out_rows))))
    for b, a in acc.items():
        print('  역검증 %s: 중앙 오차 %d%% · 80%% 구간 적중 %d%% · n=%d'
              % (BUCKET_KO[b], a['mdape'], a['cov80'], a['n']))
    for u in univ_meta:
        if u['dlNote']:
            print('  마감 주의 %s: %s' % (u['univ'], u['dlNote']))


if __name__ == '__main__':
    main()
