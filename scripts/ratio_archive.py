# -*- coding: utf-8 -*-
"""올해 스냅샷들을 내년 예측용 시점별 자료로 접는다.

  python scripts/ratio_archive.py            data/ratio/snap-*.json -> data/ratio_hist_2027.json

data/ratio_hist.json(이투스 자료)과 같은 꼴로 만든다. 시점 구간은 다섯 개
(3일 전·2일 전·1일 전·마감일 오전·마감일 오후)와 최종이고, 구간마다
그 구간에서 가장 늦게 받은 스냅샷 값을 쓴다. 최종은 페이지가 「최종」이라
적은 스냅샷에서만 온다. 몇 번을 돌려도 결과가 같다(덮어쓴다).

ratio_build.py는 data/ratio_hist*.json 을 모두 읽으므로, 이 파일이 있으면
내년 화면에서 2027학년도 시점별 자료로 쓰인다.
"""
import glob, json, os, sys, datetime, re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ratio_build as rb  # noqa: E402

ROOT = rb.ROOT
YEAR = 2027          # 학년도
YY = '27'


def main():
    snaps = sorted(glob.glob(os.path.join(rb.SNAP_DIR, 'snap-*.json')))
    if not snaps:
        raise SystemExit('스냅샷이 없습니다.')
    hist_univs = set()
    for f in glob.glob(os.path.join(ROOT, 'data', 'ratio_hist.json')):
        hist_univs |= set(r['u'] for r in json.load(open(f, encoding='utf-8'))['rows'])

    # (univ, track, unit) -> {bucket: (stampISO, recruit, ratio)}
    cells, kinds = {}, {}
    n_pages = 0
    for path in snaps:
        snap = json.load(open(path, encoding='utf-8'))
        dl_all = rb.consensus_deadline(snap['pages'])
        for p in snap['pages']:
            meta = p['meta']
            stamp = rb.parse_stamp(meta.get('stampISO'))
            if not stamp:
                continue
            dl, _ = rb.page_deadline(meta.get('notice', ''), dl_all)
            b = 'fin' if rb.is_final(meta) else rb.bucket_of(stamp, dl)
            hu = rb.resolve_univ(meta['univ'], hist_univs) or \
                meta['univ'].replace('대학교', '대')
            n_pages += 1
            for row in p['rows']:
                if row.get('summary'):
                    continue
                track = rb.clean_track(row['track'])
                key = (hu, track, row['unit'])
                kinds[key] = rb.kind_of(track)
                slot = cells.setdefault(key, {})
                old = slot.get(b)
                if old is None or old[0] <= meta['stampISO']:
                    slot[b] = (meta['stampISO'], row['recruit'], row['ratio'])

    rows = []
    for (u, t, m), slot in sorted(cells.items()):
        rc = None
        vals = [None] * 7
        for b, (_, recruit, ratio) in slot.items():
            i = 6 if b == 'fin' else rb.BUCKET_IDX[b]
            vals[i] = ratio
            rc = recruit
        vals[0] = rc
        rows.append({'u': u, 't': t, 'k': kinds[(u, t, m)], 'g': '', 'm': m,
                     'y': {YY: vals}})

    out = {'meta': {'source': '%d학년도 수시 스냅샷(ratio_fetch.py)' % YEAR,
                    'points': ['모집인원', '3일전', '2일전', '1일전', '마감오전', '마감오후', '최종'],
                    'snapshots': [os.path.basename(s) for s in snaps],
                    'built': rb.kst_now().strftime('%Y-%m-%dT%H:%M'),
                    'rows': len(rows)},
           'rows': rows}
    path = os.path.join(ROOT, 'data', 'ratio_hist_%d.json' % YEAR)
    json.dump(out, open(path, 'w', encoding='utf-8'), ensure_ascii=False,
              separators=(',', ':'))
    have = {b: sum(1 for s in cells.values() if b in s) for b in rb.BUCKETS + ['fin']}
    print('%s  %d행 (스냅샷 %d개, 페이지 %d)' % (path, len(rows), len(snaps), n_pages))
    print('  구간별 채워진 행: ' + ' · '.join(
        '%s %d' % (rb.BUCKET_KO.get(b, '최종'), have[b]) for b in rb.BUCKETS + ['fin']))


if __name__ == '__main__':
    main()
