# -*- coding: utf-8 -*-
"""한 대학의 연결 상태를 행마다 보여 준다.

  python scripts/ratio_debug.py 동덕여자대학교           최신 스냅샷에서 그 대학
  python scripts/ratio_debug.py 제주대학교 경영학과      모집단위 이름을 포함한 행만

각 행에 대해 페이지 전형 → 엑셀 전형, 페이지 모집단위 → 엑셀 모집단위(2026 최종),
모집요강 2026 최종을 나란히 적는다. 엑셀과 요강의 최종이 크게 다르면 * 를 붙인다.
"""
import glob, json, os, sys, collections

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ratio_build as rb  # noqa: E402


def main(name, unit_q=''):
    mojip = rb.load_mojip()
    hist, _ = rb.load_hist()
    last = rb.HIST_YEARS[-1]
    hist_univs = set(r['u'] for r in hist)
    by = collections.defaultdict(list)
    for r in hist:
        by[r['u']].append(r)
    snap = json.load(open(sorted(glob.glob(os.path.join(rb.SNAP_DIR, 'snap-*.json')))[-1],
                          encoding='utf-8'))
    pages = [p for p in snap['pages'] if rb.clean_univ(p['meta']['univ']).startswith(name)]
    if not pages:
        raise SystemExit('그 이름으로 시작하는 페이지가 없습니다.')
    for p in pages:
        pname = rb.clean_univ(p['meta']['univ'])
        hu = rb.resolve_univ(pname, hist_univs)
        hrows = by.get(hu, [])
        htracks = sorted(set((r['t'], r['k'] or '') for r in hrows if r['t']))
        mrows = mojip.get(hu, [])
        mtracks = sorted(set(r['t'] for r in mrows if r['t']))
        print('== %s → 엑셀 %s (%d행, 전형 %d) · 요강 %d행' % (pname, hu, len(hrows), len(htracks), len(mrows)))
        print('   엑셀 전형:', ' | '.join('%s[%s]' % (t, k[:2]) for t, k in htracks))
        stat = collections.Counter()
        for row in rb.recover_tracks(p['rows']):
            if row.get('summary') or row['unit'] in rb.TOTAL_NAMES:
                continue
            if unit_q and unit_q not in row['unit']:
                continue
            track = rb.clean_track(row['track'])
            kind = rb.kind_of(track)
            cands = [t for t, k in htracks if k == kind] or [t for t, _ in htracks]
            ht = rb.best_track(track, cands)
            probes = rb.unit_probes(row)
            hrec = None
            if ht:
                pool = [r for r in hrows if r['t'] == ht and (r['k'] or '') == kind] or \
                       [r for r in hrows if r['t'] == ht]
                hrec = rb.match_unit(probes, rb.index_units(pool, lambda r: r['m']))
            same = [t for t in mtracks if rb.kind_of(t) == kind] if kind != '기타' else []
            mt = rb.best_track(track, same or mtracks)
            mrec = None
            if mt:
                pool = [r for r in mrows if r['t'] == mt]
                names = rb.index_units(pool, lambda r: r['m'])
                for k, r in rb.index_units([r for r in pool if r['sub']], lambda r: r['sub']).items():
                    names.setdefault(k, r)
                mrec = rb.match_unit(probes, names, 0.8)
            hf = hrec['y'].get(last, [None] * 7)[6] if hrec else None
            mf = mrec.get('c26') if mrec else None
            flag = ''
            if hf and mf and abs(hf - mf) > 0.06 * max(hf, mf) + 0.02:
                flag = ' *'
            key = ('전형X' if not ht else ('단위X' if not hrec else '연결')) + flag
            stat[key] += 1
            if unit_q or key != '연결':
                print('   [%s] %-28s | %-22s → 전형 %-16s 단위 %-16s 엑셀 %s 요강 %s' % (
                    key, track[:28], row['unit'][:22], (ht or '-')[:16],
                    (hrec['m'] if hrec else '-')[:16], hf, mf))
        print('   요약:', dict(stat))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else '')
