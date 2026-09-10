# -*- coding: utf-8 -*-
"""git 없이 스냅샷과 화면을 저장소에 올린다.

  python scripts/ratio_upload.py

ZIP으로 내려받은 폴더에서도 된다. GitHub 토큰 하나만 있으면 되고, 처음 한 번
물어본 뒤 사용자 홈 폴더의 .univ_token 에 둔다(저장소 폴더 밖이라 함께 올라가지
않는다). 토큰은 채팅이나 코드에 적지 않는다.

토큰 만들기: github.com → 오른쪽 위 프로필 → Settings → Developer settings →
Personal access tokens → Fine-grained tokens → Generate new token.
Repository access 에서 이 저장소만 고르고, Permissions → Contents 를 Read and write 로.

올리는 것: data/ratio/snap-*.json 중 저장소에 없는 것 전부, 그리고 ratio.html.
"""
import base64, hashlib, json, os, sys, urllib.request, urllib.error

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


def main():
    tok = token()
    st, _ = call(tok, 'GET', '')
    if st == 401:
        if os.path.exists(TOKEN_FILE):
            os.remove(TOKEN_FILE)
        raise SystemExit('  토큰이 맞지 않아 지웠습니다. 다시 돌리면 새로 묻습니다.')
    snaps = remote_listing(tok, 'data/ratio')
    local = sorted(f for f in os.listdir(os.path.join(ROOT, 'data', 'ratio'))
                   if f.startswith('snap-') and f.endswith('.json'))
    n = 0
    for f in local:
        if f in snaps:
            continue
        data = open(os.path.join(ROOT, 'data', 'ratio', f), 'rb').read()
        if put(tok, 'data/ratio/' + f, data, None, '경쟁률 스냅샷 ' + f[5:-5]):
            n += 1
            print('  올림 %s' % f)
    html_path = os.path.join(ROOT, 'ratio.html')
    if os.path.exists(html_path):
        data = open(html_path, 'rb').read()
        cur = remote_listing(tok, 'ratio.html').get('ratio.html')
        if cur == blob_sha(data):
            print('  ratio.html 은 이미 같습니다.')
        elif put(tok, 'ratio.html', data, cur, '경쟁률 화면 갱신'):
            n += 1
            print('  올림 ratio.html')
    print('  %d개 올렸습니다. 배포 주소는 1~2분 뒤 갱신됩니다.' % n)


if __name__ == '__main__':
    main()
