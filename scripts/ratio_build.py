# -*- coding: utf-8 -*-
"""스냅샷 + 3개년 시점별 자료 -> 통합 경쟁률 화면(ratio.html) 생성.

  python scripts/ratio_build.py
"""
import json, os, re, glob, math, datetime, difflib, statistics as st

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNAP_DIR = os.path.join(ROOT, 'data', 'ratio')
HIST = os.path.join(ROOT, 'data', 'ratio_hist.json')
MOJIP = os.path.join(ROOT, 'data', 'mojip2027.json')
OUT = os.path.join(ROOT, 'ratio.html')

BUCKETS = ['d3', 'd2', 'd1', 'am', 'pm']
BUCKET_KO = {'d3': '3일 전', 'd2': '2일 전', 'd1': '1일 전',
             'am': '마감일 오전', 'pm': '마감일 오후'}
BUCKET_IDX = {'d3': 1, 'd2': 2, 'd1': 3, 'am': 4, 'pm': 5}   # hist 배열 위치


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


def find_deadline(notice, year=2026):
    for pat in DEADLINE_PATTERNS:
        m = re.search(pat, notice)
        if m:
            _, mo, da, ampm, hh, mm = m.groups()
            h, mi = _hhmm(hh, mm, ampm)
            try:
                return datetime.datetime(year, int(mo), int(da), h, mi)
            except ValueError:
                pass
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
    s = s.replace('ㆍ', '·').replace('•', '·').replace('․', '·').replace('.', '·')
    s = re.sub(r'[（(].*?[)）]', '', s)
    s = re.sub(r'[-–—/].*$', '', s)
    s = re.sub(r'(전공|과정)$', '', s)
    return s


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
    t = re.sub(r'\s*경쟁률\s*현황\s*$', '', t or '')
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
def quantiles(xs):
    xs = sorted(xs)
    n = len(xs)
    q = lambda f: xs[min(n - 1, int(n * f))]
    return st.median(xs), q(0.25), q(0.75)


def build_multipliers(hist_rows):
    """(수준, 키) -> 시점별 배율 표본."""
    tab = {}
    for r in hist_rows:
        kind = kind_of(r.get('k') or '')
        for y, v in r['y'].items():
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
                    tab.setdefault((lvl, b, key), []).append(k)
    return tab


MINN = {1: 3, 2: 8, 3: 15, 4: 40, 5: 1}
LVL_KO = {1: '모집단위', 2: '대학·전형', 3: '대학·유형', 4: '전형유형', 5: '전체'}


def pick_multiplier(tab, bucket, univ, track, unit, kind):
    keys = [(1, (univ, track, norm_unit(unit))), (2, (univ, track)),
            (3, (univ, kind)), (4, (kind,)), (5, ())]
    for lvl, key in keys:
        xs = tab.get((lvl, bucket, key))
        if xs and len(xs) >= MINN[lvl]:
            med, lo, hi = quantiles(xs)
            return {'k': med, 'lo': lo, 'hi': hi, 'n': len(xs), 'lvl': lvl}
    return None


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


def main():
    mojip = load_mojip()
    hist = json.load(open(HIST, encoding='utf-8'))
    hist_rows = hist['rows']
    hist_univs = set(r['u'] for r in hist_rows)
    tab = build_multipliers(hist_rows)

    by_univ = {}
    for r in hist_rows:
        by_univ.setdefault(r['u'], []).append(r)

    snaps = sorted(glob.glob(os.path.join(SNAP_DIR, 'snap-*.json')))
    if not snaps:
        raise SystemExit('스냅샷이 없습니다. scripts/ratio_fetch.py를 먼저 실행해 주세요.')
    cur = json.load(open(snaps[-1], encoding='utf-8'))
    prev = json.load(open(snaps[-2], encoding='utf-8')) if len(snaps) > 1 else None
    prev_map = {}
    if prev:
        for p in prev['pages']:
            for row in p['rows']:
                prev_map[(p['meta']['univ'], row['track'], row['unit'])] = row['applied']

    out_rows, univ_meta, unmatched = [], [], 0
    for p in cur['pages']:
        meta = p['meta']
        pname = meta['univ']
        hu = resolve_univ(pname, hist_univs)
        stamp = None
        if meta.get('stampISO'):
            stamp = datetime.datetime.strptime(meta['stampISO'], '%Y-%m-%dT%H:%M')
        dl = find_deadline(meta.get('notice', ''))
        b = 'fin' if meta.get('final') else bucket_of(stamp, dl)
        univ_meta.append({
            'univ': pname, 'hist': hu, 'stamp': meta.get('stampISO', ''),
            'deadline': dl.strftime('%m/%d %H:%M') if dl else '',
            'bucket': b, 'final': bool(meta.get('final')), 'rows': len(p['rows']),
        })
        mrows = mojip.get(hu, []) if hu else []
        mtracks = sorted(set(r['t'] for r in mrows if r['t']))
        mcache = {}
        hrows = by_univ.get(hu, []) if hu else []
        htracks = sorted(set((r['t'], r['k'] or '') for r in hrows if r['t']))

        track_cache = {}
        for row in p['rows']:
            track = clean_track(row['track'])
            summary = bool(row.get('summary')) or bool(
                re.match(r'^전형별|^계열별|^모집시기', track))
            kind = kind_of(row['unit'] if summary else track)
            # 전형 매칭
            probe = row['unit'] if summary else track
            if probe in track_cache:
                htrack = track_cache[probe]
            else:
                cands = [t for t, k in htracks if k == kind] or [t for t, _ in htracks]
                nt = norm_track(probe)
                best, score = None, 0.0
                for t in cands:
                    nx = norm_track(t)
                    sc = difflib.SequenceMatcher(None, nt, nx).ratio()
                    if nt and nx and (nt in nx or nx in nt):
                        sc = max(sc, 0.86)
                    if sc > score:
                        best, score = t, sc
                htrack = best if score >= 0.62 else None
                track_cache[probe] = htrack
            # 모집단위 매칭
            hrec = None
            if htrack and not summary:
                pool = [r for r in hrows if r['t'] == htrack and (r['k'] or '') == kind]
                if not pool:
                    pool = [r for r in hrows if r['t'] == htrack]
                names = {}
                for r in pool:
                    names.setdefault(norm_unit(r['m']), r)
                probes = []
                raw = [row.get('unit0'), row.get('sub'), row['unit']]
                for cand in list(raw):
                    if cand and ' ' in cand:
                        raw.append(cand.split(' ')[0])
                        raw.append(cand.split(' ')[-1])
                for cand in raw:
                    n = norm_unit(cand or '')
                    if n and n not in probes:
                        probes.append(n)
                for n in probes:
                    if n in names:
                        hrec = names[n]
                        break
                if hrec is None:
                    for n in probes:
                        m = difflib.get_close_matches(n, list(names), 1, 0.78)
                        if m:
                            hrec = names[m[0]]
                            break
            # 저장소 모집요강 자료에서 최근 최종 경쟁률
            mrec = None
            if mrows and not summary:
                if track in mcache:
                    mt = mcache[track]
                else:
                    nt = norm_track(track)
                    best, sc = None, 0.0
                    for t in mtracks:
                        nx = norm_track(t)
                        v = difflib.SequenceMatcher(None, nt, nx).ratio()
                        if nt and nx and (nt in nx or nx in nt):
                            v = max(v, 0.86)
                        if v > sc:
                            best, sc = t, v
                    mt = best if sc >= 0.62 else None
                    mcache[track] = mt
                if mt:
                    pool = [r for r in mrows if r['t'] == mt]
                    names = {}
                    for r in pool:
                        names.setdefault(norm_unit(r['m']), r)
                        if r['sub']:
                            names.setdefault(norm_unit(r['sub']), r)
                    for cand in (row.get('unit0'), row.get('sub'), row['unit']):
                        n = norm_unit(cand or '')
                        if n and n in names:
                            mrec = names[n]
                            break
                    if mrec is None:
                        for cand in (row.get('unit0'), row.get('sub')):
                            n = norm_unit(cand or '')
                            if not n:
                                continue
                            g = difflib.get_close_matches(n, list(names), 1, 0.8)
                            if g:
                                mrec = names[g[0]]
                                break
            if mrec:
                if mrec.get('c26'):
                    rec['y26'] = mrec['c26']
                    if mrec['c26'] > 0:
                        rec['pr26'] = cur_ratio / mrec['c26']
                if mrec.get('c25'):
                    rec['y25'] = mrec['c25']
            if hrec is None and mrec is None and not summary:
                unmatched += 1

            mult = pick_multiplier(tab, b if b != 'fin' else 'pm',
                                   hu or '', htrack or '',
                                   row.get('unit0') or row['unit'], kind)
            cur_ratio = row['ratio']
            rec = {
                'u': pname, 'tr': track, 'kd': kind,
                'cl': row.get('college', ''), 'un': row['unit'],
                'rc': row['recruit'], 'ap': row['applied'], 'r': cur_ratio,
            }
            # 작년(2025) 같은 시점
            if hrec and '25' in hrec['y']:
                v = hrec['y']['25']
                rc25, r25b, r25f = v[0], v[BUCKET_IDX.get(b, 3)], v[6]
                rec['p_rc'] = rc25
                rec['p_b'] = r25b
                rec['p_f'] = r25f
                if r25b and r25b > 0:
                    rec['vs'] = cur_ratio / r25b
                if r25f and rc25:
                    rec['reach'] = row['applied'] / (r25f * rc25)
            if hrec and '24' in hrec['y']:
                rec['p24_f'] = hrec['y']['24'][6]
            if mult and b != 'fin':
                rec['k'] = round(mult['k'], 3)
                rec['pl'] = round(cur_ratio * mult['lo'], 2)
                rec['pm'] = round(cur_ratio * mult['k'], 2)
                rec['ph'] = round(cur_ratio * mult['hi'], 2)
                rec['kn'] = mult['n']
                rec['kl'] = mult['lvl']
            rec['fin'] = 1 if b == 'fin' else 0
            rec['sm'] = 1 if summary else 0
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
        'histSource': hist['meta']['source'],
        'hasPrev': bool(prev),
        'prevAt': prev['collected'] if prev else '',
        'unmatched': unmatched,
    }
    tpl = open(os.path.join(ROOT, 'src', 'ratio.tpl.html'), encoding='utf-8').read()
    html = tpl.replace('/*__DATA__*/null',
                       json.dumps(payload, ensure_ascii=False, separators=(',', ':')))
    open(OUT, 'w', encoding='utf-8').write(html)
    print('%s  %d행 / 대학 %d곳 / 작년 미매칭 %d행 (%.0f%%)'
          % (OUT, len(out_rows), len(univ_meta), unmatched,
             100.0 * unmatched / max(1, len(out_rows))))


if __name__ == '__main__':
    main()
