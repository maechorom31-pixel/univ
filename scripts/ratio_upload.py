# -*- coding: utf-8 -*-
"""git 없이 스냅샷과 화면을 저장소에 올린다.

  python scripts/ratio_upload.py

ZIP으로 내려받은 폴더에서도 된다. GitHub 토큰 하나만 있으면 되고, 처음 한 번
물어본 뒤 사용자 홈 폴더의 .univ_token 에 둔다(저장소 폴더 밖이라 함께 올라가지
않는다). 토큰은 채팅이나 코드에 적지 않는다.

토큰 만들기: github.com → 오른쪽 위 프로필 → Settings → Developer settings →
Personal access tokens → Fine-grained tokens → Generate new token.
Repository access 에서 이 저장소만 고르고, Permissions → Contents 를 Read and write 로.

올리는 것: data/ratio/snap-*.json 중 저장소에 없는 것 전부, 그리고 ratio.html 과
data/ratio/board.json(상담 보드가 읽는 파일).
한 커밋으로 묶어 올린다 — 페이지 배포가 커밋마다 새로 시작되어 앞 것을 취소하기 때문.
"""
import base64, hashlib, json, os, re, sys, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = json.load(open(os.path.join(ROOT, 'scripts', 'ratio_sources.json'), encoding='utf-8'))
REPO = SRC.get('repo', {'owner': 'maechorom31-pixel', 'name': 'univ',
                        'branch': 'claude/university-counseling-program-hkf8qg'})
API = 'https://api.github.com/repos/%s/%s' % (REPO['owner'], REPO['name'])
TOKEN_FILE = os.path.join(os.path.expanduser('~'), '.univ_token')


def token():
    t = os.environ.get('GITHUB_TOKEN', '').strip()
    if t:
        return t
    if os.path.exists(TOKEN_FILE):
        t = open(TOKEN_FILE, encoding='utf-8').read().strip()
        if t:
            return t
    print('  GitHub 토큰이 필요합니다(처음 한 번). 만드는 법은 scripts/RATIO.md 에 있습니다.')
    try:
        t = input('  토큰 붙여넣기: ').strip()
    except EOFError:
        t = ''
    if not t:
        raise SystemExit('  토큰이 없어 올리지 못했습니다. 화면 파일은 정상입니다.')
    open(TOKEN_FILE, 'w', encoding='utf-8').write(t)
    try:
        os.chmod(TOKEN_FILE, 0o600)
    except Exception:
        pass
    print('  %s 에 두었습니다. 다음부터는 묻지 않습니다.' % TOKEN_FILE)
    return t


def call(tok, method, path, body=None):
    req = urllib.request.Request(API + path, method=method, headers={
        'Authorization': 'Bearer ' + tok,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'univ-ratio-upload',
    })
    data = json.dumps(body).encode() if body is not None else None
    if data:
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, data, timeout=120) as r:
            return r.status, json.loads(r.read().decode() or 'null')
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode()).get('message', '')
        except Exception:
            msg = ''
        return e.code, {'message': msg}


def blob_sha(data):
    """깃이 파일에 매기는 sha. 같으면 올릴 필요가 없다."""
    h = hashlib.sha1()
    h.update(b'blob %d\0' % len(data))
    h.update(data)
    return h.hexdigest()


def remote_listing(tok, path):
    st, d = call(tok, 'GET', '/contents/%s?ref=%s' % (path, REPO['branch']))
    if st == 200 and isinstance(d, list):
        return {x['name']: x['sha'] for x in d}
    if st == 200 and isinstance(d, dict):
        return {d['name']: d['sha']}
    if st == 404:
        return {}
    raise SystemExit('  저장소를 읽지 못했습니다 (HTTP %s %s). 토큰의 저장소·권한을 확인해 주세요.'
                     % (st, d.get('message', '')))


def put(tok, path, data, sha, msg):
    body = {'message': msg, 'branch': REPO['branch'],
            'content': base64.b64encode(data).decode()}
    if sha:
        body['sha'] = sha
    st, d = call(tok, 'PUT', '/contents/' + path, body)
    if st in (200, 201):
        return True
    print('  실패 %s: HTTP %s %s' % (path, st, d.get('message', '')))
    return False


def git_api(tok, method, path, body=None):
    return call(tok, method, '/git' + path, body)


def push_one_commit(tok, files, msg):
    """여러 파일을 한 커밋으로 올린다(Git Data API). 페이지 배포가 한 번만 돌게."""
    branch = REPO['branch']
    st, ref = call(tok, 'GET', '/git/ref/heads/' + branch)
    if st != 200:
        return False, 'ref HTTP %s' % st
    head = ref['object']['sha']
    st, commit = git_api(tok, 'GET', '/commits/' + head)
    base_tree = commit['tree']['sha']
    tree = []
    for path, data in files:
        st, blob = git_api(tok, 'POST', '/blobs', {'content': base64.b64encode(data).decode(),
                                                   'encoding': 'base64'})
        if st != 201:
            return False, 'blob %s HTTP %s' % (path, st)
        tree.append({'path': path, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
    st, t = git_api(tok, 'POST', '/trees', {'base_tree': base_tree, 'tree': tree})
    if st != 201:
        return False, 'tree HTTP %s' % st
    st, c = git_api(tok, 'POST', '/commits', {'message': msg, 'tree': t['sha'], 'parents': [head]})
    if st != 201:
        return False, 'commit HTTP %s' % st
    st, r = call(tok, 'PATCH', '/git/refs/heads/' + branch, {'sha': c['sha'], 'force': False})
    if st != 200:
        return False, 'ref update HTTP %s %s' % (st, r.get('message', ''))
    return True, c['sha'][:7]


def save_token():
    """토큰만 받아 두고 정말 되는지 확인한다.

      python scripts/ratio_upload.py --토큰

    올리기와 갈라 둔 까닭. 받는 데 몇 분이 걸리고 나서야 토큰을 묻고 거기서
    틀리면, 무엇이 잘못됐는지 알기까지 또 몇 분이 든다. 토큰만 먼저 넣어 보고
    「됐습니다」를 확인한 뒤 받는 편이 낫다.
    """
    print()
    print('  GitHub 토큰을 넣습니다. 붙여 넣고 엔터를 치세요.')
    print('  (만드는 법은 scripts/RATIO.md 에 있습니다. 채팅에는 올리지 마세요.)')
    print()
    try:
        t = input('  토큰: ').strip()
    except EOFError:
        t = ''
    if not t:
        raise SystemExit('  아무것도 안 넣으셨습니다.')
    # 붙여 넣다 엉뚱한 것이 들어오면 파이썬이 헤더를 만들다 그대로 터진다.
    # 오류 덩어리 대신 무엇이 잘못됐는지 한 줄로 말해 준다.
    bad = [c for c in t if not (32 < ord(c) < 127)]
    if bad:
        raise SystemExit('\n  토큰에 영문·숫자가 아닌 글자가 섞여 있습니다(%s).\n'
                         '  다른 것을 붙여 넣으셨거나 복사할 때 딸려 온 것 같습니다.'
                         % ''.join(sorted(set(bad))[:5]))
    if len(t) < 20:
        raise SystemExit('\n  토큰이 너무 짧습니다(%d글자). 앞뒤가 잘리지 않았는지 봐 주세요.'
                         % len(t))
    # GitHub 토큰은 github_pat_ · ghp_ 처럼 gh 로 시작한다(아주 옛 것은 16진수 40자).
    if not (t.startswith('gh') or re.fullmatch(r'[0-9a-f]{40}', t)):
        raise SystemExit('\n  GitHub 토큰으로 보이지 않습니다(토큰은 github_pat_ 나 ghp_ 로'
                         ' 시작합니다).\n  비밀번호나 다른 것을 붙여 넣으신 것 같습니다.')
    st, d = call(t, 'GET', '')
    if st == 401:
        raise SystemExit('\n  토큰이 맞지 않습니다. 복사할 때 앞뒤가 잘리지 않았는지 봐 주세요.')
    if st == 404:
        raise SystemExit('\n  이 토큰으로는 %s/%s 저장소가 안 보입니다.\n'
                         '  Repository access 에서 이 저장소를 골랐는지 봐 주세요.'
                         % (REPO['owner'], REPO['name']))
    if st != 200:
        raise SystemExit('\n  확인하지 못했습니다 (HTTP %s %s).' % (st, d.get('message', '')))
    st, d = call(t, 'GET', '/contents/data/ratio/board.json?ref=' + REPO['branch'])
    if st == 403:
        raise SystemExit('\n  저장소는 보이는데 권한이 모자랍니다.\n'
                         '  Permissions → Contents 를 Read and write 로 해 주세요.')
    open(TOKEN_FILE, 'w', encoding='utf-8').write(t)
    try:
        os.chmod(TOKEN_FILE, 0o600)
    except Exception:
        pass
    print()
    print('  됐습니다. %s 에 두었습니다.' % TOKEN_FILE)
    print('  다음부터는 묻지 않습니다. 이제 최종경쟁률을 돌리시면 됩니다.')
    return 0


def main():
    if any(a in ('--토큰', '--token') for a in sys.argv[1:]):
        return save_token()
    tok = token()
    st, _ = call(tok, 'GET', '')
    if st == 401:
        if os.path.exists(TOKEN_FILE):
            os.remove(TOKEN_FILE)
        raise SystemExit('  토큰이 맞지 않아 지웠습니다. 다시 돌리면 새로 묻습니다.')
    snaps = remote_listing(tok, 'data/ratio')
    local = sorted(f for f in os.listdir(os.path.join(ROOT, 'data', 'ratio'))
                   if f.startswith('snap-') and f.endswith('.json'))
    files, names = [], []
    for f in local:
        if f in snaps:
            continue
        files.append(('data/ratio/' + f, open(os.path.join(ROOT, 'data', 'ratio', f), 'rb').read()))
        names.append(f[5:-5])
    html_path = os.path.join(ROOT, 'ratio.html')
    if os.path.exists(html_path):
        data = open(html_path, 'rb').read()
        cur = remote_listing(tok, 'ratio.html').get('ratio.html')
        if cur != blob_sha(data):
            files.append(('ratio.html', data))
    # 상담 보드가 읽는 파일. 스냅샷과 달리 같은 이름을 덮어쓰므로 내용으로 견준다.
    board_path = os.path.join(ROOT, 'data', 'ratio', 'board.json')
    if os.path.exists(board_path):
        data = open(board_path, 'rb').read()
        if snaps.get('board.json') != blob_sha(data):
            files.append(('data/ratio/board.json', data))
    # 선생님이 주소를 더하면 바뀌는 파일들. 빠뜨리면 board.json 만 올라가고
    # 「어느 주소로 받은 것인지」가 저장소에 안 남는다.
    for rel in ('scripts/ratio_final_urls.txt', 'scripts/ratio_sources.json'):
        path = os.path.join(ROOT, *rel.split('/'))
        if not os.path.exists(path):
            continue
        data = open(path, 'rb').read()
        cur = remote_listing(tok, rel).get(os.path.basename(rel))
        if cur != blob_sha(data):
            files.append((rel, data))
    if not files:
        print('  올릴 것이 없습니다(저장소와 같습니다).')
        return
    msg = '경쟁률 스냅샷 ' + ', '.join(names) if names else '경쟁률 화면 갱신'
    ok, info = push_one_commit(tok, files, msg)
    if ok:
        print('  %d개를 한 커밋(%s)으로 올렸습니다. 배포 주소는 1~2분 뒤 갱신됩니다.' % (len(files), info))
    else:
        print('  실패: %s' % info)
        # 한 커밋이 안 되면 파일마다 따로라도 올린다
        for path, data in files:
            # 덮어쓰는 파일은 지금 저장소에 있는 것의 sha 가 있어야 올라간다
            overwrite = path in ('ratio.html', 'data/ratio/board.json')
            sha = remote_listing(tok, path).get(os.path.basename(path)) if overwrite else None
            if put(tok, path, data, sha, msg):
                print('  올림 %s' % path)


if __name__ == '__main__':
    sys.exit(main() or 0)
