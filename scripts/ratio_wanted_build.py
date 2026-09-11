# -*- coding: utf-8 -*-
"""즐겨찾기 엑셀 → `ratio_wanted.json`. **대학·모집단위·모집인원만** 담는다.

  python scripts/ratio_wanted_build.py 즐겨찾기.xlsx
  python scripts/ratio_wanted_build.py 즐겨찾기.csv

이름·학번·반·번호·점수는 **읽지도 않는다**. 담기는 것은 두 가지뿐이다.

  univs   지원한 대학과 건수 — 아직 최종 경쟁률을 못 받은 곳을 세는 데 쓴다
  units   대학별 「모집단위 → 모집인원」 — 받아 온 경쟁률 표가 **올해 것인지**
          가리는 잣대로 쓴다(`ratio_final.py` 의 모집인원 대조)

잣대가 왜 필요한가. 진학어플라이는 **작년 페이지도 그대로 열린다**. 작년 것은
언제나 「최종」이라 적혀 있어서 표기만 보고는 가릴 수가 없다. 2027 조선대(11300581)
대신 2026 조선대(11300471)를 받아도 「최종」이라 그냥 담겼고, 실제로 그렇게 담긴
적이 있다. 연도가 다르면 **모집인원이 어긋난다** — 그것이 가장 확실한 표시다.

엑셀은 여기(선생님 컴퓨터)에서만 읽는다. 만들어지는 json 에는 학생을 가리킬 수
있는 것이 하나도 들어가지 않으므로 저장소에 두어도 된다.
"""
import csv, io, json, os, re, sys, zipfile, datetime
from xml.etree import ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'ratio_wanted.json')

# 엑셀에서 읽을 칸. 여기 없는 칸(이름·학번·점수·합격 여부)은 손대지 않는다.
NEED = ['학교유형', '대학명', '모집단위', '모집인원', '세부유형']

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def _cell(c, shared):
    """칸 하나의 글자. 엑셀은 글자를 공유표에 두기도 하고 칸 안에 두기도 한다."""
    inline = c.find(NS + 'is')
    if inline is not None:
        return ''.join(t.text or '' for t in inline.iter(NS + 't'))
    v = c.find(NS + 'v')
    if v is None:
        return ''
    if c.get('t') == 's':
        try:
            return shared[int(v.text)]
        except (ValueError, IndexError):
            return ''
    return v.text or ''


def read_xlsx(path):
    """xlsx 첫 장을 줄의 목록으로. 머리글은 「대학명」이 있는 줄이다."""
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        shared = [''.join(t.text or '' for t in si.iter(NS + 't'))
                  for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
    sheet = next(n for n in z.namelist() if n.startswith('xl/worksheets/sheet'))
    rows = list(ET.fromstring(z.read(sheet)).find(NS + 'sheetData'))
    return [[_cell(c, shared) for c in r] for r in rows]


def read_csv(path):
    for enc in ('utf-8-sig', 'cp949', 'utf-8'):
        try:
            return list(csv.reader(io.open(path, encoding=enc)))
        except UnicodeDecodeError:
            continue
    raise SystemExit('csv 를 읽지 못했습니다 — utf-8 이나 cp949 로 저장해 주세요.')


def pick(rows):
    """머리글 줄을 찾아 필요한 칸만 뽑는다. 없는 칸이 있으면 말해 준다."""
    for i, r in enumerate(rows[:20]):
        if '대학명' in r:
            head, body = r, rows[i + 1:]
            break
    else:
        raise SystemExit('머리글에서 「대학명」 칸을 찾지 못했습니다.')
    miss = [n for n in NEED if n not in head]
    if miss:
        raise SystemExit('없는 칸: %s' % ' · '.join(miss))
    ix = {n: head.index(n) for n in NEED}
    out = []
    for r in body:
        if len(r) <= max(ix.values()):
            r = r + [''] * (max(ix.values()) + 1 - len(r))
        rec = {n: (r[ix[n]] or '').strip() for n in NEED}
        if not rec['대학명'] or rec['대학명'] == '대학명':
            continue
        out.append(rec)
    return out


def quota_of(s):
    """모집인원. 「(44)」처럼 괄호가 붙은 정원 외도 숫자만 본다."""
    m = re.search(r'\d+', s or '')
    return int(m.group()) if m else None


def norm_unit(s):
    """모집단위를 견주기 좋은 꼴로. 가운뎃점이 글꼴마다 달라 그것부터 맞춘다."""
    s = re.sub(r'[ㆍ・･•․‧∙⋅.]', '·', s or '')
    return re.sub(r'\s+', '', s)


def build(recs):
    univs, units = {}, {}
    for r in recs:
        u = r['대학명']
        if u not in univs:
            univs[u] = {'u': u, 'n': 0, 'type': r['학교유형'] or '일반대'}
        univs[u]['n'] += 1
        q = quota_of(r['모집인원'])
        unit = norm_unit(r['모집단위'])
        if q is None or not unit:
            continue
        units.setdefault(u, {}).setdefault(unit, set()).add(q)
    return (sorted(univs.values(), key=lambda x: -x['n']),
            {u: {k: sorted(v) for k, v in sorted(d.items())} for u, d in sorted(units.items())})


def main(argv):
    if not argv:
        raise SystemExit('쓰는 법: python scripts/ratio_wanted_build.py <즐겨찾기 엑셀>')
    path = argv[0]
    rows = read_xlsx(path) if path.lower().endswith('.xlsx') else read_csv(path)
    recs = pick(rows)
    univs, units = build(recs)
    doc = {
        'note': '우리 학생이 지원한 대학과 건수, 그리고 대학별 모집단위 모집인원.'
                ' 이름·학번·점수는 담지 않는다. 최종 경쟁률을 어디까지 받았는지 세고,'
                ' 받아 온 표가 올해 것인지 모집인원으로 가리는 데 쓴다.',
        'built': datetime.date.today().isoformat(),
        'univs': univs,
        'units': units,
    }
    json.dump(doc, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('%s\n  대학 %d곳 · 지원 %d건 · 모집단위 %d개'
          % (OUT, len(univs), sum(u['n'] for u in univs),
             sum(len(d) for d in units.values())))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
