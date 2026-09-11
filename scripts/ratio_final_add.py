# -*- coding: utf-8 -*-
"""최종 발표 주소를 목록에 넣는다.

  python scripts/ratio_final_add.py <주소 또는 코드> [<주소 또는 코드> ...]
  python scripts/ratio_final_add.py --file 최종주소.txt     (한 줄에 하나씩)

마감 뒤 대학이 올리는 **최종 경쟁률 페이지는 주소가 따로**인 곳이 있다(진학어플라이).
그 주소를 여기 넣어 두면 다음 수집부터 실시간 주소와 함께 받고, 최종으로 친다.

무엇을 넣을지 몰라도 된다 — 주소를 그대로 붙이면 어디 것인지 알아서 가른다.

  https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10080381.html   진학어플라이
  10080381                                                          진학어플라이 코드
  https://ratio.uwayapply.com/Sl5KOGB9YTlKZiUmOiZKN2ZUZg==          유웨이
  그 밖의 주소                                                        자체 사이트

같은 것을 두 번 넣어도 한 번만 남는다. 지우려면 `scripts/ratio_sources.json` 의
`*_final` 목록에서 그 줄을 지우면 된다.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'scripts', 'ratio_sources.json')


def classify(text):
    """한 줄이 어느 갈래인지. (목록 이름, 넣을 값) 또는 None."""
    t = (text or '').strip().strip('"\'')
    if not t or t.startswith('#'):
        return None
    m = re.search(r'addon\.jinhakapply\.com/\S*?Ratio(\w+)\.html', t)
    if m:
        return 'jinhak_final', m.group(1)
    m = re.search(r'ratio\.uwayapply\.com/([^/?#\s]+)', t)
    if m:
        return 'uway_final', m.group(1)
    if re.fullmatch(r'\d{6,12}', t):
        return 'jinhak_final', t
    if t.startswith('http'):
        return 'other_final', t
    return None


def main(argv):
    items = []
    if argv and argv[0] == '--file':
        if len(argv) < 2:
            raise SystemExit('파일 이름을 함께 적어 주세요.')
        items = open(argv[1], encoding='utf-8-sig').read().splitlines()
    else:
        items = argv
    if not items:
        raise SystemExit(__doc__)

    src = json.load(open(SRC, encoding='utf-8'))
    added, skipped, unknown = [], [], []
    for line in items:
        got = classify(line)
        if not got:
            if line.strip():
                unknown.append(line.strip()[:60])
            continue
        key, value = got
        src.setdefault(key, [])
        if value in src[key]:
            skipped.append(value)
        else:
            src[key].append(value)
            added.append((key, value))

    json.dump(src, open(SRC, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    open(SRC, 'a', encoding='utf-8').write('\n')

    for key, value in added:
        print('  넣음   %-14s %s' % (key, value))
    for value in skipped:
        print('  이미 있음      %s' % value)
    for line in unknown:
        print('  못 알아봄      %s' % line)
    print('\n최종 주소 — 유웨이 %d · 진학어플라이 %d · 그 밖 %d'
          % (len(src.get('uway_final', [])), len(src.get('jinhak_final', [])),
             len(src.get('other_final', []))))
    if added:
        print('이제 경쟁률수집을 한 번 돌리면 최종으로 들어옵니다.')


if __name__ == '__main__':
    main(sys.argv[1:])
