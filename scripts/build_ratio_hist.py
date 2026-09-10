# -*- coding: utf-8 -*-
"""이투스 「수시 실시간 경쟁률 검색기」(xlsb) -> data/ratio_hist.json

  pip install pyxlsb
  python scripts/build_ratio_hist.py <파일.xlsb>

「2024-2026 경쟁률」 시트를 읽는다. 줄마다 2027 모집단위 코드·대학·세부전형·
중심분류·계열·모집단위·2027 모집인원, 그리고 학년도별로
[모집인원, 3일전, 2일전, 1일전, 마감일 오전, 마감일 오후, 최종] 일곱 칸.
xlsb 원본은 저장소에 넣지 않는다(19MB). 결과 json만 올린다.
"""
import json, os, sys, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'ratio_hist.json')
SHEET = re.compile(r'^\d{4}-\d{4}\s*경쟁률$')


def num(v):
    return float(v) if isinstance(v, (int, float)) else None


def main(path):
    from pyxlsb import open_workbook
    with open_workbook(path) as wb:
        name = next(s for s in wb.sheets if SHEET.match(s.strip()))
        with wb.get_sheet(name) as sh:
            rows = [[c.v for c in r] for r in sh.rows()]
    head0, head1 = rows[0], rows[1]
    years = [(i, str(int(v))[2:]) for i, v in enumerate(head0) if isinstance(v, (int, float))]
    out = []
    for r in rows[2:]:
        if not r or not r[2] or not r[7]:
            continue
        y = {}
        for start, yy in years:
            vals = [num(x) for x in r[start:start + 7]]
            if any(v is not None for v in vals[1:]):
                y[yy] = vals
        if not y:
            continue
        out.append({
            'code': int(r[0]) if isinstance(r[0], (int, float)) else None,
            'u': str(r[2]).strip(), 't': str(r[3] or '').strip(), 'k': str(r[4] or '').strip(),
            'g': str(r[5] or '').strip(), 'm': str(r[7]).strip(),
            'n27': num(r[8]), 'y': y,
        })
    meta = {'source': '이투스 2027 수시 실시간 경쟁률 검색기 (%s학년도 시점별)' %
                      '·'.join('20' + yy for _, yy in years),
            'points': ['모집인원', '3일전', '2일전', '1일전', '마감오전', '마감오후', '최종'],
            'years': [yy for _, yy in years],
            'rows': len(out), 'univs': len(set(r['u'] for r in out)),
            'file': os.path.basename(path)}
    json.dump({'meta': meta, 'rows': out}, open(OUT, 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    print('%s  %d행 / 대학 %d곳 / 학년도 %s' % (OUT, len(out), meta['univs'], meta['years']))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
