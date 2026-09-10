# -*- coding: utf-8 -*-
"""수시 경쟁률 스냅샷 수집기.

  python scripts/ratio_fetch.py            수집 후 data/ratio/ 에 스냅샷 저장
  python scripts/ratio_fetch.py --raw-dir  받은 원본 HTML도 함께 보관

표준 라이브러리만 쓴다. 선생님 PC(윈도우 포함)에서 그대로 돈다.
진학어플라이는 데이터센터 IP를 막고 있어 클라우드에서는 403이 나고
개인 PC·학교망에서는 정상적으로 열린다. 403이 나면 조용히 건너뛰고 로그에 남긴다.
"""
import base64, json, os, re, sys, time, datetime, urllib.request, urllib.error
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'ratio')
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
YEAR_CHAR = {2026: '-', 2027: '7'}


def kst_now():
    return datetime.datetime.utcnow() + datetime.timedelta(hours=9)


def uway_url(token, year=2027):
    """유웨이 주소의 학년도 문자를 바꿔 원하는 학년도 주소를 만든다."""
    pad = '=' * ((4 - len(token) % 4) % 4)
    plain = base64.b64decode(token + pad).decode('latin1')
    m = re.match(r'^(.*J)(.)(fTf)$', plain)
    if not m:
        return 'https://ratio.uwayapply.com/' + token
    want = YEAR_CHAR.get(year, m.group(2))
    plain = m.group(1) + want + m.group(3)
    tok = base64.b64encode(plain.encode('latin1')).decode()
    return 'https://ratio.uwayapply.com/' + tok


def get(url, timeout=40):
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
    except urllib.error.URLError as e:
        # 자체 사이트(창신대) 인증서가 검증되지 않는다. 공개 경쟁률 페이지라
        # 그 경우에만 검증 없이 다시 받는다.
        if 'CERTIFICATE_VERIFY_FAILED' not in str(e):
            raise
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            raw = r.read()
    head = raw[:2000].decode('latin1', 'replace').lower()
    enc = 'euc-kr'
    m = re.search(r'charset=["\']?([\w-]+)', head)
    if m and 'euc' not in m.group(1).lower() and 'ks_c' not in m.group(1).lower():
        enc = m.group(1)
    return raw.decode(enc, 'replace')


# ---------------------------------------------------------------- 표 추출
class Tables(HTMLParser):
    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=True)
        self.tables = []
        self.cur = self.row = self.cell = None
        self.buf = ''
        self.in_title = False
        self.next_title = None

    @staticmethod
    def _i(v):
        try:
            return max(1, int(str(v).strip()))
        except Exception:
            return 1

    HEAD_TAGS = ('h2', 'h3', 'h4', 'h5', 'h6')

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        is_title = (tag == 'caption' or tag in self.HEAD_TAGS
                    or (tag == 'a' and not a.get('href'))          # 탭 이름(창신대)
                    or a.get('id', '').startswith('strTitleId')
                    or (tag in ('span', 'div', 'p', 'strong', 'b') and
                        ('tit' in a.get('class', '') or 'subject' in a.get('class', ''))))
        if is_title and self.cur is None:
            self.in_title, self.buf, self.title_tag = True, '', tag
        if tag == 'table':
            self.cur = {'rows': [], 'head': [], 'title': self.next_title}
        elif tag == 'tr':
            self.row = []
        elif tag in ('td', 'th') and self.cur is not None:
            self.cell = {'text': '', 'rowspan': self._i(a.get('rowspan', 1)),
                         'colspan': self._i(a.get('colspan', 1)), 'th': tag == 'th'}

    def handle_endtag(self, tag):
        if self.in_title and tag == getattr(self, 'title_tag', None):
            self.in_title = False
            t = re.sub(r'\s+', ' ', self.buf).strip()
            if t and len(t) < 80:
                self.next_title = t
        if tag in ('td', 'th') and self.cell is not None and self.row is not None:
            self.row.append(self.cell)
            self.cell = None
        elif tag == 'tr' and self.row is not None and self.cur is not None:
            if self.row:
                key = 'head' if all(c['th'] for c in self.row) else 'rows'
                self.cur[key].append(self.row)
            self.row = None
        elif tag == 'table' and self.cur is not None:
            self.tables.append(self.cur)
            self.cur = None

    def handle_data(self, d):
        if self.in_title:
            self.buf += d
        if self.cell is not None:
            self.cell['text'] += d


def _norm(s):
    return re.sub(r'\s+', ' ', s).replace('\xa0', ' ').strip()


def expand(tbl):
    """rowspan/colspan을 펼쳐 격자로 만든다."""
    out, carry = [], {}
    for r in tbl['rows']:
        line, ci, k = [], 0, 0
        cells = list(r)
        while True:
            while ci in carry:
                txt, left = carry[ci]
                line.append(txt)
                carry[ci] = (txt, left - 1)
                if carry[ci][1] <= 0:
                    del carry[ci]
                ci += 1
            if k >= len(cells):
                break
            c = cells[k]
            k += 1
            txt = _norm(c['text'])
            for _ in range(c['colspan']):
                line.append(txt)
                if c['rowspan'] > 1:
                    carry[ci] = (txt, c['rowspan'] - 1)
                ci += 1
        out.append(line)
    return out


RATIO_RE = re.compile(r'^([\d.,]+)\s*:\s*1$')
PLAIN_RE = re.compile(r'^\d+(\.\d+)?$')          # 「4.70」처럼 「: 1」 없이 적는 대학


def _ratio_val(v):
    m = RATIO_RE.match(v)
    return float((m.group(1) if m else v).replace(',', ''))
RATIO_HEAD = ('경쟁률', '경쟁율', '지원현황', '지원율')
UNIT_HEAD = ('모집단위', '모집단위명', '학과', '전공')
SUMM_HEAD = ('구분', '전형명', '전형', '모집구분')
COLL_HEAD = ('대학', '단과대학', '계열', '모집단위군')


def _cell_num(v):
    v = (v or '').replace(',', '').strip()
    return float(v) if re.match(r'^\d+(\.\d+)?$', v) else None


def parse_page(html, univ):
    """경쟁률 표를 찾아 행 목록으로 만든다. 열 위치는 머리행 이름으로 잡는다."""
    p = Tables()
    p.feed(html)
    rows, seen_summary, summary_done = [], set(), [False]
    for tbl in p.tables:
        hcols = []
        for r in tbl['head']:
            if len(r) == 1 and r[0]['colspan'] >= 3:
                t = _norm(r[0]['text'])
                if t and not any(h in t for h in RATIO_HEAD + UNIT_HEAD):
                    tbl['title'] = t          # 표 안에 든 전형 제목 줄
                    continue
            for c in r:
                hcols += [_norm(c['text'])] * c['colspan']
        if not any(h in RATIO_HEAD for h in hcols):
            continue
        idx_unit = next((i for i, h in enumerate(hcols) if h in UNIT_HEAD), None)
        idx_sub = None
        if idx_unit is not None:
            same = [i for i, h in enumerate(hcols) if h == hcols[idx_unit]]
            if len(same) > 1:
                idx_sub = same[-1]
        idx_summ = next((i for i, h in enumerate(hcols) if h in SUMM_HEAD), None)
        idx_coll = next((i for i, h in enumerate(hcols)
                         if h in COLL_HEAD and i != idx_unit), None)
        is_summary = idx_unit is None and idx_summ is not None
        label_i = idx_unit if idx_unit is not None else idx_summ

        for line in expand(tbl):
            if any('{' in x for x in line):
                continue
            cand = [i for i, v in enumerate(line)
                    if i < len(hcols) and hcols[i] in RATIO_HEAD
                    and (RATIO_RE.match(v) or PLAIN_RE.match(v))]
            if not cand:
                cand = [i for i, v in enumerate(line) if RATIO_RE.match(v)]
            if not cand:
                continue
            i = cand[-1]
            recruit, applied = _cell_num(line[i - 2]), _cell_num(line[i - 1])
            if recruit is None or applied is None:
                continue
            def at(j):
                return line[j] if (j is not None and j < len(line)) else ''
            unit = at(label_i)
            sub = at(idx_sub)
            if not unit or re.match(r'^[\d.,\-]*$', unit):
                labels = [v for j, v in enumerate(line[:max(0, i - 2)])
                          if v and not re.match(r'^[\d.,\-]*$', v)]
                if not labels:
                    continue
                unit = labels[-1]
                sub = ''
            if sub and sub != unit:
                shown = '%s(%s)' % (unit, sub)
            else:
                shown, sub = unit, ''
            if is_summary:
                if summary_done[0] and not seen_summary:
                    continue
                key = _norm(shown)
                if key in seen_summary:
                    continue
                seen_summary.add(key)
            rows.append({
                'univ': univ,
                'track': tbl['title'] or '',
                'college': at(idx_coll),
                'unit': shown,
                'unit0': unit,
                'sub': sub,
                'recruit': recruit,
                'applied': applied,
                'ratio': _ratio_val(line[i]),
                'summary': 1 if is_summary else 0,
            })
        if is_summary and seen_summary:
            summary_done[0] = True
    return rows


def clean_univ(title):
    """페이지 제목에서 대학 이름만. 「○○대학교 2027학년도 수시 경쟁률 서비스」 같은 꼴."""
    t = title.replace('경/쟁/률/서/비/스', '')
    t = re.sub(r'\d{4}\s*학년도|수시\s*모집|수시|정시|경쟁률|지원\s*현황|현황|서비스|원서\s*접수|모집|실시간',
               '', t)
    t = re.sub(r'[/\s\-|:·]+', '', t)
    return t.strip()


def stamp_iso(stamp):
    """「2026년 9월 10일 17시 10분」「2026.09.10 17:10」「9월 10일 17:10」을 ISO로."""
    m = re.search(r'(?:(\d{4})\s*[년.]\s*)?(\d{1,2})\s*[월.]\s*(\d{1,2})\s*일?[^\d]{0,8}'
                  r'(\d{1,2})\s*[:시]\s*(\d{1,2})', stamp or '')
    if not m:
        return ''
    y, mo, da, hh, mi = m.groups()
    y = int(y) if y else kst_now().year
    try:
        return datetime.datetime(y, int(mo), int(da), int(hh), int(mi)).strftime('%Y-%m-%dT%H:%M')
    except ValueError:
        return ''


def page_meta(html):
    t = re.search(r'<title>([^<]*)</title>', html)
    univ = clean_univ(t.group(1)) if t else ''
    text = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', html, flags=re.S)
    text = re.sub(r'<[^>]+>', ' ', text).replace('\xa0', ' ')
    text = re.sub(r'\s+', ' ', text)
    d = re.search(r"ID_DateStr'>(.*?)</span>", html, re.S)
    stamp = re.sub(r'<[^>]+>|\s+', ' ', d.group(1)).replace('\xa0', ' ').strip() if d else ''
    if not stamp:
        # 유웨이가 아닌 페이지(진학어플라이 등): 본문에서 「… 기준」을 찾는다
        d = re.search(r'((?:\d{4}\s*[년.]\s*)?\d{1,2}\s*[월.]\s*\d{1,2}\s*일?[^가-힣\d]{0,6}'
                      r'(?:\d{1,2}\s*[:시]\s*\d{1,2}\s*분?)[^가-힣]{0,6}(?:현재|기준)[^가-힣]{0,3}(?:최종)?)', text)
        # 날짜·시각이 없는 「최종」만은 믿지 않는다 — 진학어플라이의 「최종 마감 현황」은 탭 이름이다
        stamp = d.group(1).strip() if d else ''
    final = '최종' in stamp
    iso = stamp_iso(stamp)
    c = re.search(r'id="Ratio_Comment".*?>(.*?)</dl>', html, re.S)
    notice = re.sub(r'<[^>]+>', ' ', c.group(1)) if c else ''
    if not notice:
        # 마감을 적은 문장을 본문에서 모은다
        notice = ' '.join(m.group(0) for m in re.finditer(
            r'[^□※▶]{0,40}(?:마감|접수\s*기간|원서\s*접수)[^□※▶]{0,60}', text))[:400]
    return {'univ': univ, 'stamp': stamp, 'stampISO': iso,
            'final': final, 'notice': re.sub(r'\s+', ' ', notice).strip()[:400]}


def main(argv):
    keep_raw = '--raw-dir' in argv
    src = json.load(open(os.path.join(ROOT, 'scripts', 'ratio_sources.json'),
                         encoding='utf-8'))
    now = kst_now()
    tag = now.strftime('%Y%m%d-%H%M')
    os.makedirs(OUT, exist_ok=True)
    raw_dir = os.path.join(OUT, 'raw', tag)
    if keep_raw:
        os.makedirs(raw_dir, exist_ok=True)

    jobs = [('uway', uway_url(t, 2027), t) for t in src['uway']]
    jobs += [('jinhak', 'https://addon.jinhakapply.com/RatioV1/RatioH/Ratio%s.html' % c, c)
             for c in src['jinhak']]
    jobs += [('other', u, u.split('//')[-1].split('/')[0]) for u in src.get('other', [])]

    pages, log = [], []
    for kind, url, key in jobs:
        try:
            html = get(url)
        except urllib.error.HTTPError as e:
            log.append({'key': key, 'kind': kind, 'error': 'HTTP %s' % e.code})
            print('  [건너뜀] %s %s HTTP %s' % (kind, key, e.code))
            continue
        except Exception as e:
            log.append({'key': key, 'kind': kind, 'error': str(e)[:120]})
            print('  [건너뜀] %s %s %s' % (kind, key, str(e)[:60]))
            continue
        meta = page_meta(html)
        if '안전한 접속 확인' in html or not meta['univ']:
            log.append({'key': key, 'kind': kind, 'error': '차단 또는 인식 불가'})
            print('  [건너뜀] %s %s 차단' % (kind, key))
            continue
        rows = parse_page(html, meta['univ'])
        if keep_raw:
            open(os.path.join(raw_dir, '%s-%s.html' % (kind, key)), 'w',
                 encoding='utf-8').write(html)
        pages.append({'key': key, 'kind': kind, 'url': url,
                      'meta': meta, 'rows': rows})
        print('  %-10s %-12s %4d행  기준 %s' % (kind, meta['univ'], len(rows), meta['stamp']))
        time.sleep(0.8)

    snap = {'collected': now.strftime('%Y-%m-%dT%H:%M:%S+09:00'),
            'pages': pages, 'skipped': log}
    path = os.path.join(OUT, 'snap-%s.json' % tag)
    json.dump(snap, open(path, 'w', encoding='utf-8'), ensure_ascii=False,
              separators=(',', ':'))
    total = sum(len(p['rows']) for p in pages)
    print('\n%s  대학 %d곳 / %d행 / 건너뜀 %d곳' % (path, len(pages), total, len(log)))
    return path


if __name__ == '__main__':
    main(sys.argv[1:])
