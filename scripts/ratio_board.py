# -*- coding: utf-8 -*-
"""경쟁률 스냅샷 -> 상담 보드가 읽는 한 파일(data/ratio/board.json).

  python scripts/ratio_board.py        (ratio_build.py 가 끝에 저절로 부른다)

보드(board.html)는 정적 페이지라 폴더 목록을 읽지 못한다. 스냅샷이 늘어날 때마다
파일 이름이 바뀌므로, 대학마다 **가장 최근 것 한 장**만 남긴 파일을 따로 만들어 둔다.
보드는 이 파일 하나만 가져간다.

여기서 **미리 잘라 내는 것**이 이 파일의 일이다. 보드는 학생이 지원한 학과에
경쟁률을 붙이는데, 붙일 수 없는 줄이 섞여 있으면 옆 전형의 숫자가 붙는다.
그래서 다음은 아예 내보내지 않는다.

  · 전형 제목을 못 읽은 줄 — 진학어플라이 몇 곳은 전형마다 표가 따로인데 제목이
    없다(동국대). 같은 학과가 교과·종합·논술에 한 번씩 나오는데 어느 것인지 모른다.
  · 같은 (전형·모집단위)가 두 줄 이상인 것 — 어느 줄이 그 학생의 것인지 모른다.
  · 소계·총계 줄, 전형별 총괄 줄(summary).
  · 학과 여럿을 쉼표로 묶어 한 줄에 적은 계열모집 — 그 숫자는 묶음의 것이지
    한 학과의 것이 아니다(조선대).

남은 줄은 대학이 적은 이름 그대로 둔다. 이름을 맞추는 일은 보드에서 한다.
"""
import json, os, re, glob, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ratio_build as rb                                        # noqa: E402

ROOT = rb.ROOT
OUT = os.path.join(ROOT, 'data', 'ratio', 'board.json')

GENERIC_TRACK = re.compile(r'^(전형별|계열별|모집시기|모집단위별|학과별)')


def _num(x):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return None if v != v else v


def latest_pages(snaps):
    """대학마다 쓸 한 장. 최종이 있으면 최종, 없으면 가장 늦게 수집한 것.

    **한 번 수집한 것 안에 같은 이름이 둘이면 그 대학은 통째로 뺀다.** 홍익대는
    서울·세종 페이지가 둘 다 「홍익대학교」로 온다. 이름으로 묶으면 한 쪽을 잃고,
    남은 쪽의 숫자가 다른 캠퍼스 지원자에게 붙는다. 가릴 방법이 없으니 내보내지
    않고 `dropped` 에 사유와 함께 적어 둔다 — 보드가 그 대학은 손으로 보라고 알린다.

    수집한 때가 다른 두 장은 같은 페이지의 어제·오늘이므로 겹침이 아니다
    (주소는 해마다, 때로는 접수 중에도 바뀐다).
    """
    best, ambiguous = {}, {}
    for path in snaps:
        snap = json.load(open(path, encoding='utf-8'))
        collected = rb.datetime.datetime.strptime(snap['collected'][:16], '%Y-%m-%dT%H:%M')
        deadline = rb.consensus_deadline(snap['pages'])
        here = {}
        for page in snap['pages']:
            if not page.get('rows'):
                continue                       # 표를 못 읽은 페이지(로그인 화면 등)
            name = rb.clean_univ(page['meta'].get('univ') or '')
            if not name:
                continue
            here.setdefault(name, []).append(page)
        for name, pages in here.items():
            if len(pages) > 1:
                ambiguous[name] = '한 번 수집한 것에 같은 이름이 %d장이라 캠퍼스를 가릴 수 없습니다' % len(pages)
                continue
            page = pages[0]
            dl, _ = rb.page_deadline(page['meta'].get('notice', ''), deadline)
            final = rb.is_final(page['meta'], collected, dl)
            stamp = rb.parse_stamp(page['meta'].get('stampISO')) or collected
            cand = {'page': page, 'final': final, 'stamp': stamp, 'collected': collected,
                    'src': os.path.basename(path), 'deadline': dl}
            old = best.get(name)
            # 최종이 늘 이긴다. 둘 다 최종이 아니면 늦게 수집한 것.
            if old is None or (final, collected) > (old['final'], old['collected']):
                best[name] = cand

    dropped = [{'u': n, 'why': w} for n, w in ambiguous.items()]
    return {n: c for n, c in best.items() if n not in ambiguous}, dropped


def rows_of(page):
    """내보낼 줄만 남긴다. (전형, 모집단위, 세부) 가 겹치는 줄은 통째로 버린다."""
    kept, seen = [], {}
    for row in rb.recover_tracks(page['rows']):
        if row.get('summary'):
            continue
        unit = (row.get('unit') or '').strip()
        if not unit or unit in rb.TOTAL_NAMES:
            continue
        if ',' in unit:
            continue                           # 학과 여럿을 묶은 계열모집 줄
        track = rb.clean_track(row.get('track') or '')
        if not track or GENERIC_TRACK.match(track):
            continue                           # 전형을 못 읽은 줄
        ratio = _num(row.get('ratio'))
        recruit = _num(row.get('recruit'))
        applied = _num(row.get('applied'))
        if ratio is None or ratio < 0:
            continue
        sub = (row.get('sub') or '').strip()
        key = (track, unit, sub)
        if key in seen:
            seen[key] = None                   # 겹치면 둘 다 못 쓴다
            continue
        seen[key] = len(kept)
        kept.append({'t': track, 'm': unit, 's': sub, 'n': recruit, 'a': applied, 'r': ratio})
    drop = set(k for k, v in seen.items() if v is None)
    return [r for r in kept if (r['t'], r['m'], r['s']) not in drop], len(drop)


def build(quiet=False):
    snaps = sorted(glob.glob(os.path.join(rb.SNAP_DIR, 'snap-*.json')))
    if not snaps:
        raise SystemExit('스냅샷이 없습니다. scripts/ratio_fetch.py를 먼저 실행해 주세요.')
    pages, dropped = latest_pages(snaps)

    univs, total, hidden = [], 0, 0
    for name in sorted(pages):
        got = pages[name]
        rows, drop = rows_of(got['page'])
        hidden += drop
        if not rows:
            continue
        by_track = {}
        for r in rows:
            by_track.setdefault(r['t'], []).append(r)
        total += len(rows)
        univs.append({
            'u': name,
            'stamp': got['stamp'].strftime('%Y-%m-%dT%H:%M'),
            'final': bool(got['final']),
            'deadline': got['deadline'].strftime('%Y-%m-%dT%H:%M') if got['deadline'] else '',
            'src': got['src'],
            't': [{
                'n': track,
                'k': rb.kind_of(track),
                'r': [([r['m'], r['n'], r['a'], r['r']] + ([r['s']] if r['s'] else []))
                      for r in by_track[track]],
            } for track in sorted(by_track)],
        })

    payload = {
        'built': rb.kst_now().strftime('%Y-%m-%dT%H:%M'),
        'note': '대학이 적은 이름 그대로. 줄은 [모집단위, 모집인원, 지원인원, 경쟁률, 세부].',
        'univs': univs,
        'dropped': sorted(dropped, key=lambda x: x['u']),
    }
    open(OUT, 'w', encoding='utf-8').write(
        json.dumps(payload, ensure_ascii=False, separators=(',', ':')))
    fin = sum(1 for u in univs if u['final'])
    if not quiet:
        print('%s  대학 %d곳(최종 %d곳) / %d행 · 가린 줄 %d'
              % (OUT, len(univs), fin, total, hidden))
        for x in dropped:
            print('  뺀 대학 %s — %s' % (x['u'], x['why']))
    return payload


if __name__ == '__main__':
    build()
