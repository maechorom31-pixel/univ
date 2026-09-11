# -*- coding: utf-8 -*-
"""최종 경쟁률만 받아 상담 보드가 읽는 파일로 정리한다.

  python scripts/ratio_final.py                     scripts/ratio_final_urls.txt 를 읽는다
  python scripts/ratio_final.py <주소> [<주소> ...]   그 주소만 받는다

접수 중의 실시간 경쟁률은 이제 받지 않는다. **대학이 최종을 올린 주소만** 받아
`data/ratio/board.json` 에 쌓는다. 보드는 그 파일 하나만 읽어 카드와 내보내기에 붙인다.

  ratio_final.py  →  data/ratio/board.json  →  board.html

한 번에 다 받을 필요가 없다. 주소를 구하는 대로 목록에 더해 다시 돌리면, **이미 받아
둔 대학은 그대로 두고** 새로 받은 것만 더한다. 끝에 「아직 최종이 없는 대학」을
지원 건수 순으로 적어 주니 그 순서대로 주소를 구해 오면 된다.

진학어플라이는 학교·집 인터넷에서만 열린다(클라우드는 막혀 있다).
"""
import json, os, re, sys, time, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ratio_fetch as rf                                        # noqa: E402
import ratio_board as rb                                        # noqa: E402

ROOT = rf.ROOT
OUT = os.path.join(ROOT, 'data', 'ratio', 'board.json')
URLS = os.path.join(HERE, 'ratio_final_urls.txt')
WANTED = os.path.join(HERE, 'ratio_wanted.json')
SOURCES = os.path.join(HERE, 'ratio_sources.json')


def read_urls(path):
    """목록 파일에서 주소만 뽑는다. 「#」 뒤는 메모다."""
    out = []
    if not os.path.exists(path):
        return out
    for line in open(path, encoding='utf-8-sig'):
        line = line.split('#')[0].strip()
        if line.startswith('http'):
            out.append(line)
    return out


def univ_key(name):
    """대학 이름을 견주기 좋은 꼴로. 「국립목포대학교(목포)」와 「목포대학교」가 같아진다."""
    s = re.sub(r'\s+', '', name or '')
    s = re.sub(r'[（(][^()（）]*[)）]\s*$', '', s)
    s = re.sub(r'([가-힣A-Za-z]{1,6})캠퍼스$', '', s)
    s = s.replace('대학교', '대').replace('대학', '대')
    s = re.sub(r'^국립', '', s)
    s = s.replace('여자대', '여대').replace('한국외국어대', '한국외대')
    return s


def uway_urls():
    """유웨이는 최종이 뜨면 **같은 주소**의 표기가 「최종현황」으로 바뀐다.

    주소를 이미 알고 있으니 따로 구해 올 것이 없다. 훑어보고 최종인 것만 담는다 —
    아직 아니면 조용히 건너뛴다. 선생님이 손으로 구해 오실 것은 진학어플라이뿐이다.
    """
    if not os.path.exists(SOURCES):
        return []
    src = json.load(open(SOURCES, encoding='utf-8'))
    return [rf.uway_url(t, 2027) for t in src.get('uway', [])]


def fetch_one(url):
    """주소 하나 → (대학 이름, 줄들). 실패하면 예외."""
    try:
        html = rf.get(url)
    except Exception:
        time.sleep(2)                       # 끊김·타임아웃은 한 번 더
        html = rf.get(url)
    meta = rf.page_meta(html)
    if '안전한 접속 확인' in html or not meta['univ']:
        raise RuntimeError('페이지를 알아보지 못했습니다(차단이거나 다른 화면입니다)')
    name = rb.rb.clean_univ(meta['univ'])
    rows, hidden = rb.rows_of({'rows': rf.parse_page(html, meta['univ'])})
    if not rows:
        raise RuntimeError('표에서 쓸 줄을 찾지 못했습니다')
    return name, rows, hidden, meta


def pack(name, rows, stamp, url):
    """보드가 읽는 모양으로. `ratio_board.build` 와 같은 꼴이어야 한다."""
    by_track = {}
    for r in rows:
        by_track.setdefault((r['c'], r['t']), []).append(r)
    return {
        'u': name, 'stamp': stamp, 'final': True, 'deadline': '', 'src': url,
        't': [{
            'n': track, 'c': campus, 'k': rb.rb.kind_of(track),
            'r': [([r['m'], r['n'], r['a'], r['r']] + ([r['s']] if r['s'] else []))
                  for r in by_track[(campus, track)]],
        } for campus, track in sorted(by_track)],
    }


def load_old():
    """이미 받아 둔 것. **최종만 남긴다** — 접수 중의 잠정값은 더 쓰지 않는다."""
    if not os.path.exists(OUT):
        return []
    try:
        doc = json.load(open(OUT, encoding='utf-8'))
    except ValueError:
        return []
    return [u for u in doc.get('univs', []) if u.get('final')]


def norm_unit(s):
    """모집단위를 견주기 좋은 꼴로. 가운뎃점이 글꼴마다 달라 그것부터 맞춘다."""
    s = re.sub(r'[\u318d\u30fb\uff65\u2022\u2024\u2027\u2219\u22c5.]', '\u00b7', s or '')
    return re.sub(r'\s+', '', s)


def load_units():
    """즐겨찾기에서 뽑아 둔 대학별 「모집단위 → 모집인원」. 없으면 빈 것."""
    if not os.path.exists(WANTED):
        return {}
    want = json.load(open(WANTED, encoding='utf-8')).get('units', {})
    out = {}
    for u, d in want.items():
        out.setdefault(univ_key(u), {}).update(
            {norm_unit(k): set(v) for k, v in d.items()})
    return out


def year_check(name, rows, units):
    """**작년 표를 받아 오지 않았는지** 모집인원으로 가린다.

    진학어플라이는 작년 페이지도 그대로 열리고, 작년 것은 언제나 「최종」이라
    적혀 있어 표기로는 가릴 수가 없다. 2027 조선대(11300581) 대신 2026
    조선대(11300471)를 받아도 「최종」이라 그냥 담겼고, 실제로 그렇게 담겨
    카드의 모집인원과 경쟁률 표의 모집인원이 어긋났다.

    연도가 다르면 모집인원이 어긋난다. 잣대는 즐겨찾기다. 올해 제대로 받은
    32곳을 견줘 보니 **어긋난 모집단위가 하나도 없었고**, 작년 표는 여럿
    어긋났다. 그래서 이렇게 나눈다.

        어긋남 0    그대로 담는다
        어긋남 1    담되 한 줄 알린다 — 모집인원 변경이나 입력 실수일 수 있다
        어긋남 2 이상 빼고 올해 주소를 다시 구해 달라고 말한다

    돌려주는 것은 (괜찮은가, 할 말). 즐겨찾기에 없는 대학은 견줄 것이 없으니
    잠자코 통과시킨다.
    """
    mine = units.get(univ_key(name))
    if not mine:
        return True, ''
    theirs = {}
    for r in rows:
        theirs.setdefault(norm_unit(r['m']), set()).add(r['n'])
    hit, off = 0, []
    for unit, qs in sorted(mine.items()):
        got = theirs.get(unit)
        if not got:
            continue
        if qs & got:
            hit += 1
        else:
            off.append('%s 즐겨찾기 %s \u2194 표 %s'
                       % (unit, '·'.join(str(q) for q in sorted(qs)),
                          '·'.join(str(int(q)) for q in sorted(got))))
    if not off:
        return True, ''
    said = '모집인원이 즐겨찾기와 %d곳 어긋납니다 (맞은 곳 %d) — %s' % (
        len(off), hit, ' / '.join(off[:3]))
    return len(off) < 2, said


def missing(univs):
    """지원한 대학 가운데 아직 최종이 없는 곳. 전문대는 뺀다(자료가 다르다)."""
    if not os.path.exists(WANTED):
        return []
    want = json.load(open(WANTED, encoding='utf-8')).get('univs', [])
    have = set(univ_key(u['u']) for u in univs)
    out = []
    for w in want:
        if w.get('type') == '전문대':
            continue
        if univ_key(w['u']) in have:
            continue
        out.append(w)
    return out


def main(argv):
    urls = [a for a in argv if a.startswith('http')] or read_urls(URLS)
    if not urls:
        raise SystemExit('받을 주소가 없습니다. %s 에 한 줄에 하나씩 적어 주세요.' % URLS)

    got = {}
    for u in load_old():
        got[univ_key(u['u'])] = u          # 이미 받아 둔 최종은 그대로 둔다
    before = len(got)

    # 목록에 적어 준 주소는 사람이 확인한 것이라 그대로 담고,
    # 유웨이는 훑어보고 최종인 것만 담는다(`--목록만` 이면 훑지 않는다).
    jobs = [(u, True) for u in urls]
    if '--목록만' not in argv and '--only-list' not in argv:
        jobs += [(u, False) for u in uway_urls()]

    stamp = rb.rb.kst_now().strftime('%Y-%m-%dT%H:%M')
    units = load_units()
    fresh, failed, waiting, stale, odd = [], [], [], [], []

    # 전에 받아 둔 것도 같은 잣대로 한 번 더 본다 — 잣대가 없던 때 담긴 것이 있다
    for key, u in list(got.items()):
        rows = [{'m': r[0], 'n': r[1]} for t in u['t'] for r in t['r']]
        fine, why = year_check(u['u'], rows, units)
        if not fine:
            stale.append((u['u'], u.get('src', ''), why))
            del got[key]
            before -= 1
        elif why:
            odd.append((u['u'], why))
    for url, trust in jobs:
        try:
            name, rows, hidden, meta = fetch_one(url)
        except Exception as e:
            if trust:
                failed.append((url, str(e)[:80]))
                print('  [실패] %s\n         %s' % (url, str(e)[:80]))
            continue
        said = re.sub(r'&nbsp;|\s+', ' ', meta.get('stamp') or '').strip()
        if not trust and not meta.get('final'):
            waiting.append((name, said))    # 아직 최종이 아니다 — 담지 않는다
            continue
        fine, why = year_check(name, rows, units)
        if not fine:
            stale.append((name, url, why))
            print('  [해] %-20s %s' % (name, why))
            continue
        if why:
            odd.append((name, why))
        got[univ_key(name)] = pack(name, rows, stamp, url)
        fresh.append(name)
        mark = '' if (meta.get('final') or not trust) else '   ← 페이지는 아직 최종이라 안 적었습니다'
        print('  %-22s %4d행  「%s」%s' % (name, len(rows), said or '표기 없음', mark))
        time.sleep(0.6)

    univs = sorted(got.values(), key=lambda x: x['u'])
    doc = {
        'built': stamp,
        'note': '최종 경쟁률만 담는다. 전형은 {n 이름, c 캠퍼스, k 유형},'
                ' 줄은 [모집단위, 모집인원, 지원인원, 경쟁률, 세부].',
        'univs': univs,
        'dropped': [],
    }
    json.dump(doc, open(OUT, 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    rows = sum(len(t['r']) for u in univs for t in u['t'])
    print('\n%s  대학 %d곳 / %d행  (새로 받은 것 %d곳, 전에 받아 둔 것 %d곳)'
          % (OUT, len(univs), rows, len(fresh), before))

    if waiting:
        print('\n유웨이 %d곳은 아직 최종이 아니라 건너뛰었습니다 — 뜨면 다음에 저절로 들어옵니다.'
              % len(waiting))
        for name, said in waiting[:8]:
            print('   %-22s 「%s」' % (name, said))
        if len(waiting) > 8:
            print('   … 외 %d곳' % (len(waiting) - 8))

    left = missing(univs)
    if left:
        print('\n아직 최종이 없는 대학 %d곳 — 지원이 많은 쪽부터' % len(left))
        for w in left[:20]:
            print('   %-24s 지원 %d건' % (w['u'], w['n']))
        if len(left) > 20:
            print('   … 외 %d곳' % (len(left) - 20))
        print('\n그 대학 입학처에서 최종 경쟁률 페이지를 열어 주소를 %s 에 한 줄씩 더한 뒤'
              ' 다시 돌리면 됩니다.' % os.path.basename(URLS))
    else:
        print('\n지원한 대학은 모두 받았습니다.')
    if odd:
        print('\n모집인원이 한 곳 어긋난 대학 %d곳 — 담긴 했으니 눈으로 한 번 보세요.' % len(odd))
        for name, why in odd:
            print('   %-22s %s' % (name, why))
    if stale:
        print('\n작년 표로 보여 뺀 대학 %d곳 — 올해 주소를 다시 구해 주세요.' % len(stale))
        for name, where, why in stale:
            print('   %-22s %s' % (name, why))
            print('   %s%s' % (' ' * 24, where))
    if failed:
        print('\n못 받은 주소 %d개 — 주소가 바뀌었거나 아직 안 열린 것입니다.' % len(failed))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
