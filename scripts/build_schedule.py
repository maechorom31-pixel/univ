#!/usr/bin/env python3
"""
2027 수시모집 전형일정 PDF → data/schedule2027.json

왜 이걸 만드나
--------------
모집요강(data/mojip2027.json)의 면접일정은 41%가 기간으로만 적혀 있다.
「11.15 ~ 11.17」 같은 것이다. 그 상태로는 학생 둘의 면접이 겹치는지 알 수 없다.

이 PDF(「수박먹고 대학간다(실전)」 전형일정)는 대학·전형별로 **정확한 날짜**를 준다.
학과별로 나뉜 것까지 적혀 있다. 그래서 모집요강이 기간만 줄 때 이걸로 메운다.

읽는 방법
---------
pypdf 의 layout 모드는 표의 칸 위치를 공백으로 살려 준다. 머리줄에서 칸이 시작하는
자리를 읽어 두고, 아래 줄을 그 자리로 자른다.

    대학      유형      전형          원서접수 마감      대학별 고사      1단계 발표   최종 발표
    한국공학   교과    교과우수자        9.11(금) 18:00                              12.18(금)
             교과     지역균형        9.11(금) 18:00                              12.18(금)
                              학교장추천: 9.18(금) 18:00      ← 앞 줄에 딸린 덧말

대학 칸이 비면 앞 대학이 이어지는 것이고, 유형 낱말이 없으면 앞 줄에 딸린 덧말이다.

한계 하나 — 한 칸이 여러 줄에 걸치면(학과별 면접일 같은 것) 그 줄이 위 행에 속하는지
아래 행에 속하는지 글자만으로는 가릴 수 없다. 잘못 붙이면 면접이 없는 전형에 면접일이
생긴다. 그래서 **행 자기 칸의 날짜만 날짜로 쓰고**, 덧말은 원문 그대로 `notes` 에
남긴다. 화면이 그걸 보여 주면 사람이 읽고 판단한다.

쓰는 법
-------
    python3 scripts/build_schedule.py <pdf 경로들...> -o data/schedule2027.json

원본 PDF 는 저장소에 넣지 않는다. 배포처가 따로 있는 자료다.
"""
import argparse
import json
import re
import sys
from pathlib import Path

try:
    import pypdf
except ImportError:                                   # pragma: no cover
    sys.exit('pypdf 가 필요합니다:  pip install pypdf')

# 2027학년도 수시는 2026년 가을에 치른다. 이 표의 날짜는 전부 2026년이다.
YEAR = 2026

HEAD_MARK = ('대학', '유형', '전형', '원서접수')

# 전형 유형. 이 낱말이 줄 앞쪽에 있으면 **자료 줄**, 없으면 앞 줄에 딸린 덧말이다.
# 덧말에는 학과별 면접일이 들어 있어 버릴 수 없다.
KINDS = ('교과', '종합', '논술', '실기', '특기')
KIND_ZONE = 30            # 유형 칸은 줄 앞 서른 자 안에 있다


def is_data(line: str):
    """자료 줄인가, 앞 줄에 딸린 덧말인가."""
    head = line[:KIND_ZONE]
    if not any(k in head for k in KINDS):
        return False
    # `‣ 11.22(일)` 처럼 덧말이 우연히 유형 낱말을 품는 일이 있어 앞머리 기호를 본다
    return not line.strip()[0] in '‣※▶-·'


def gap_runs(lines):
    """
    **자료 줄만** 놓고, 모든 줄이 공백인 자리를 찾는다. 그게 칸과 칸 사이다.

    머리글의 글자 자리를 쓰지 않는 이유 — 머리글은 칸 가운데에 놓여 있어서,
    `대학별 고사` 라는 글자가 시작하는 자리와 그 칸의 자료가 시작하는 자리가 다르다.
    그대로 자르면 `11.24(화)` 가 앞 칸에 붙어 날짜를 통째로 놓친다.

    덧말 줄을 빼는 이유 — 덧말(`‣ 11.22(일) 10:00 AI융합 자율전공…`)은 칸을 무시하고
    줄을 가로질러 쓰인다. 그 줄까지 세면 빈 자리가 하나도 안 남아 경계를 못 찾는다.
    """
    rows = [l for l in lines if is_data(l)]
    if len(rows) < 3:
        rows = lines
    width = max((len(l) for l in rows), default=0)
    if not width:
        return []
    blank = [True] * width
    for line in rows:
        for i in range(width):
            if i < len(line) and line[i] != ' ':
                blank[i] = False

    runs, start = [], None
    for i in range(width):
        if blank[i]:
            if start is None:
                start = i
        elif start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, width))
    return [r for r in runs if r[1] - r[0] >= 2]


def columns_of(head: str, lines):
    """
    칸이 시작하는 자리 일곱 개.

    빈 자리(gap)를 경계 후보로 놓고, 머리글 낱말이 어느 구획에 드는지로 고른다.
    낱말이 없는 구획은 앞 칸에 붙인다 — 자료가 칸 밖으로 삐져나온 것이지
    새 칸이 아니다.
    """
    want = ['대학', '유형', '전형', '원서접수', '대학별', '1단계', '최종']
    at = []
    pos = 0
    for w in want:
        i = head.find(w, pos)
        if i < 0:
            return None
        at.append(i)
        pos = i + len(w)

    runs = gap_runs(lines)
    bounds = [0] + [(a + b) // 2 for a, b in runs if a > 0]
    bounds = sorted(set(bounds))

    cols = []
    for i, word_at in enumerate(at):
        # 이 낱말을 품는 구획의 시작
        start = 0
        for b in bounds:
            if b <= word_at:
                start = b
            else:
                break
        # 앞 칸과 같은 구획이면 머리글 자리를 그대로 쓴다 (두 낱말이 한 구획에 든 경우)
        if cols and start <= cols[-1]:
            start = word_at
        cols.append(start)
    return cols if cols == sorted(cols) else None


def slice_row(line: str, cols):
    """머리줄의 자리대로 한 줄을 자른다. 마지막 칸은 줄 끝까지."""
    out = []
    for i, start in enumerate(cols):
        end = cols[i + 1] if i + 1 < len(cols) else len(line)
        out.append(line[start:end].strip())
    return out


DATE = re.compile(r'(\d{1,2})\.(\d{1,2})\s*\(([월화수목금토일])\)')
TIME = re.compile(r'(\d{1,2}):(\d{2})')


def dates_in(text: str):
    """
    글 안의 날짜를 전부 뽑는다.

    `11.25(수)~26(목)` 처럼 뒤 날짜에 월이 빠지는 표기가 있어, 월이 없는 `26(목)` 은
    바로 앞 날짜의 월을 잇는다. 이걸 안 하면 기간의 끝이 사라진다.
    """
    out = []
    last_month = None
    for m in re.finditer(r'(?:(\d{1,2})\.)?(\d{1,2})\s*\(([월화수목금토일])\)', text):
        month = int(m.group(1)) if m.group(1) else last_month
        if month is None or not (1 <= month <= 12):
            continue
        day = int(m.group(2))
        if not (1 <= day <= 31):
            continue
        last_month = month
        out.append({'iso': f'{YEAR}-{month:02d}-{day:02d}', 'at': m.start()})
    return out


def spans(text: str):
    """
    날짜 목록을 기간으로 묶는다.

    `11.25(수)~26(목)` 은 한 기간, `10.24(토)~25(일)` 도 한 기간,
    `10.9(금) 또는 10.10(토)` 은 **기간이 아니라** 둘 중 하나다 — 갈라서 둔다.
    """
    found = dates_in(text)
    if not found:
        return []
    out = []
    i = 0
    while i < len(found):
        a = found[i]
        if i + 1 < len(found):
            b = found[i + 1]
            between = text[a['at']:b['at']]
            # `-10.25(일) 스포츠과학과` 처럼 날짜 앞의 붙임표는 **목록 기호**다.
            # 그걸 범위로 읽으면 서로 다른 학과의 면접일 둘이 한 기간으로 뭉쳐진다.
            ranged = '~' in between or '∼' in between or ' - ' in between
            if ranged:
                out.append({'from': a['iso'], 'to': b['iso'], 'fixed': False})
                i += 2
                continue
        out.append({'from': a['iso'], 'to': a['iso'], 'fixed': True})
        i += 1
    return out


def clock(text: str):
    """마감 시각. `9.11(금) 18:00` 의 18:00."""
    m = TIME.search(text)
    return m.group(0) if m else None


def split_top(text: str):
    """
    `가천대[바람개비], 고려대[학업우수, 계열적합]` 처럼 대괄호 안에 쉼표가 또 있는 글을
    **바깥 쉼표에서만** 가른다. 그냥 split 하면 전형 목록이 대학 이름으로 둔갑한다.
    """
    out, depth, buf = [], 0, ''
    for ch in text:
        if ch in '[(':
            depth += 1
        elif ch in '])':
            depth = max(0, depth - 1)
        if ch == ',' and depth == 0:
            out.append(buf.strip())
            buf = ''
        else:
            buf += ch
    if buf.strip():
        out.append(buf.strip())
    return [x for x in out if x]


BYDATE_HEAD = re.compile(r'^\s*(\d{1,2})\s+(\d{1,2})\s+([월화수목금토일])\s*(.*)$')

# 대학 이름꼴. 이걸로 거르지 않으면 학과 목록의 조각(`환경공학부`, `인공지능학과`)이
# 대학으로 둔갑한다. 논술 표는 학과 목록이 여러 줄에 걸쳐 있어 특히 심하다.
UNIV_LIKE = re.compile(r'(대|대학교|교대|여대|공대|과기대|해양대|원|KAIST|GIST|UNIST|DGIST|POSTECH|KENTECH)$')


def looks_univ(name: str):
    n = name.strip()
    return bool(n) and len(n) <= 14 and bool(UNIV_LIKE.search(n))


def parse_bydate(path: Path):
    """
    날짜가 먼저 오는 표(교과 면접 · 종합 면접 · 논술) → (날짜, 대학, 전형) 목록.

        9    21   월   경인교대[교직적성: *면접평가 동영상 제출, ~23(수) 11:00],
        10   3    토   강서대[일반학생: 경영학과], 성결대[신학과], 한신대[참인재]
        10   3    토   ∎서울시립대: 논술전형[10:00 전자전기컴퓨터공학부, …]

    이쪽이 **고사일의 으뜸 자료**다. 대학별 표와 달리 한 칸이 여러 줄에 걸치더라도
    날짜가 줄 앞에 박혀 있어서, 어느 날에 속하는지 헷갈릴 여지가 없다.

    표기가 둘이다 — 쉼표로 잇는 것과 `∎` 로 잇는 것. 둘 다 받는다.
    대학 이름꼴이 아닌 조각은 버린다. 학과 목록이 줄을 넘어오기 때문이다.
    """
    reader = pypdf.PdfReader(str(path))
    out = []
    cur = None                       # 이어지는 줄이 붙을 날짜

    for page in reader.pages:
        text = page.extract_text(extraction_mode='layout') or ''
        for raw in text.split('\n'):
            line = raw.rstrip()
            if not line.strip():
                continue
            if line.strip().startswith(('※', '▮', '구분')) or '날짜' in line[:12]:
                continue

            m = BYDATE_HEAD.match(line)
            if m:
                month, day = int(m.group(1)), int(m.group(2))
                if not (1 <= month <= 12 and 1 <= day <= 31):
                    continue
                cur = f'{YEAR}-{month:02d}-{day:02d}'
                body = m.group(4)
            elif cur and line.startswith(' ' * 8):
                body = line.strip()        # 앞 날짜에서 이어지는 줄
            else:
                continue

            items = re.split(r'[∎▪■]', body) if '∎' in body or '▪' in body else split_top(body)
            for item in items:
                item = item.strip().lstrip('❚•·-').strip()
                if not item:
                    continue
                mm = re.match(r'^([^\[:]+?)\s*[\[:]\s*(.*)$', item)
                univ, typ = (mm.group(1), mm.group(2)) if mm else (item, '')
                univ = re.sub(r'\s+', '', univ.strip())
                typ = typ.strip().rstrip(']').strip()
                if not looks_univ(univ):
                    continue
                out.append({'date': cur, 'univ': univ, 'type': typ})
    return out


def parse_pdf(path: Path):
    """전형일정(대학) PDF 한 부 → 레코드 목록."""
    reader = pypdf.PdfReader(str(path))
    rows = []
    region = ''

    for page in reader.pages:
        text = page.extract_text(extraction_mode='layout') or ''
        lines = text.split('\n')

        body = [l.rstrip() for l in lines if l.strip()]
        cols = None
        cur = None
        univ = ''
        for raw in lines:
            line = raw.rstrip()
            if not line.strip():
                continue

            mark = line.strip()
            if mark.startswith('■'):
                region = re.sub(r'\s+', ' ', mark[1:]).strip()
                continue

            if all(w in line for w in HEAD_MARK):
                found = columns_of(line, body)
                if found:
                    cols = found
                    univ = ''          # 쪽이 바뀌면 대학도 새로 읽는다
                continue
            if cols is None:
                continue

            # 자료 줄이 아니면 덧말이다. 글로는 남기되 **날짜로는 세지 않는다.**
            #
            # 한 칸이 여러 줄에 걸치면 pypdf 는 그 칸을 위아래로 흩어 놓는데,
            # 칸이 세로 가운데 정렬이라 흩어진 줄이 **위 행에 속하는지 아래 행에
            # 속하는지 글자만으로는 가릴 수 없다.** 성균관 성균인재의 세 날짜 중
            # 첫 줄은 바로 위 탐구인재 행과 성균인재 행 사이에 놓인다.
            #
            # 잘못 붙이면 면접이 없는 전형에 면접일이 생긴다. 그건 이 도구에서
            # 가장 나쁜 실패다. 그래서 행 자기 칸에 있는 날짜만 쓰고, 덧말은
            # 원문 그대로 `notes` 에 남겨 사람이 읽게 한다.
            if not is_data(line):
                note = line.strip()
                if note and cur is not None:
                    cur['notes'].append(note)
                continue

            cut = slice_row(line, cols)
            name, kind, typ, apply_by, exam, stage1, final = cut
            if name:
                univ = name
            if not univ or not typ:
                continue

            cur = {
                'region': region,
                'univ': univ,
                'kind': kind,                 # 교과 · 종합 · 논술 · 실기
                'type': typ,                  # 전형 이름
                'applyBy': apply_by,
                'applyClock': clock(apply_by),
                'examText': [exam] if exam else [],
                'stage1Text': stage1,
                'finalText': final,
                'notes': [],
            }
            rows.append(cur)

    # 글을 날짜로 바꾼다
    for r in rows:
        blob = ' '.join(r['examText'])
        r['exam'] = spans(blob)
        r['apply'] = (spans(r['applyBy']) or [None])[0]
        r['stage1'] = (spans(r['stage1Text']) or [None])[0]
        r['final'] = (spans(r['finalText']) or [None])[0]
    return rows


def kind_of(path: Path):
    """PDF 한 부가 어느 표인지 첫 쪽으로 가린다. 파일 이름은 믿지 않는다."""
    first = pypdf.PdfReader(str(path)).pages[0].extract_text() or ''
    if '전형일정(대학)' in first:
        return 'univ'
    if '전형일정(달력)' in first:
        return 'calendar'
    if '전형일정(학생부교과)' in first:
        return '교과'
    if '전형일정(학생부종합)' in first:
        return '종합'
    if '전형일정(논술)' in first:
        return '논술'
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('pdfs', nargs='+', type=Path)
    ap.add_argument('-o', '--out', type=Path, default=Path('data/schedule2027.json'))
    args = ap.parse_args()

    rows, exams = [], []
    for path in args.pdfs:
        kind = kind_of(path)
        if kind == 'univ':
            got = parse_pdf(path)
            rows.extend(got)
            print(f'{path.name[:40]:42} 대학별 표     {len(got)}건')
        elif kind in ('교과', '종합', '논술'):
            got = parse_bydate(path)
            for g in got:
                g['kind'] = kind
            exams.extend(got)
            print(f'{path.name[:40]:42} {kind} 고사일   {len(got)}건')
        elif kind == 'calendar':
            print(f'{path.name[:40]:42} 달력 — 대학별 표와 겹쳐서 넘어갑니다')
        else:
            print(f'{path.name[:40]:42} 무슨 표인지 몰라 넘어갑니다')

    if not rows:
        sys.exit('전형일정(대학) PDF 가 필요합니다.')

    # 재는 자리 — 무엇이 얼마나 붙었는지 밝히고 넘어간다
    have_exam = sum(1 for r in rows if r['exam'])
    fixed = sum(1 for r in rows if r['exam'] and all(x['fixed'] for x in r['exam']))
    have_final = sum(1 for r in rows if r['final'])
    have_apply = sum(1 for r in rows if r['apply'])
    n = len(rows)
    print(f'\n전형 {n}건 · 대학 {len({r["univ"] for r in rows})}곳')
    print(f'  원서접수 마감      {have_apply}건 ({have_apply / n * 100:.1f}%)')
    print(f'  최종 발표          {have_final}건 ({have_final / n * 100:.1f}%)')
    print(f'  대학별 고사(자기 칸) {have_exam}건 ({have_exam / n * 100:.1f}%) · 그중 확정 {fixed}건')
    if exams:
        print(f'  날짜별 고사표      {len(exams)}건 · 대학 {len({e["univ"] for e in exams})}곳'
              f' · {len({e["date"] for e in exams})}일')

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({
        'year': 2027,
        'source': '수박먹고 대학간다(실전) 2027 수시모집 전형일정 · 2026.07.18.',
        # 대학별 표 — 원서 마감 · 1단계 발표 · 최종 발표가 여기서 온다
        'rows': [{
            'region': r['region'], 'univ': r['univ'], 'kind': r['kind'], 'type': r['type'],
            'apply': r['apply'], 'applyClock': r['applyClock'],
            'exam': r['exam'], 'stage1': r['stage1'], 'final': r['final'],
            'notes': r['notes'],
        } for r in rows],
        # 날짜별 고사표 — 고사일의 으뜸 자료. 대학별 표보다 이쪽을 먼저 본다
        'exams': exams,
    }, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'\n{args.out} 에 썼습니다 ({args.out.stat().st_size / 1024:.0f} KB)')


if __name__ == '__main__':
    main()
