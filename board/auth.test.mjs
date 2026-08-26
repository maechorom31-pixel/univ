/**
 * 권한 — **누가 무엇을 부를 수 있나.**
 * =====================================================================
 * `board/parse.test.mjs` 처럼 Code.gs 를 node 에서 그대로 돌린다. 다른 점은
 * 시트 API 를 대역으로 채워서 `handle_` 까지 부른다는 것이다.
 *
 * 여기서 잡은 것 둘 —
 *
 *   1. `action.indexOf('student') === 0` 이 **`students`(교사 자료 적재)를 삼켰다.**
 *      토큰이 없으니 늘 실패했고 보드는 실제 시트에 붙으면 통째로 비었다.
 *      보기용 자료는 서버를 안 불러서 안 드러났다.
 *   2. 「액세스: 모든 사용자」 배포라 서버가 접속자를 못 알아보는데, 학생 링크에는
 *      배포 주소가 `?api=` 로 들어 있다. 학생이 주소만 떼어 `?action=students` 를
 *      부르면 **전교생 이름·내신·지원 목록에 교사 비공개 메모까지** 나왔다.
 *
 * 실행: node board/auth.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
import { createHash } from 'node:crypto';

const Utilities = {
  DigestAlgorithm: { SHA_1: 'SHA_1' }, Charset: { UTF_8: 'utf8' },
  computeDigest: (_a, s) => [...createHash('sha1').update(s, 'utf8').digest()].map(b => b > 127 ? b - 256 : b),
  /*
   * 진짜 formatDate 흉내 — 날짜 세탁(cell_) 시험에 실제 서식이 필요하다.
   * KST 로만 계산한다. 시험 자료가 그 시간대라서다.
   */
  formatDate: (d, _tz, fmt) => {
    const t = new Date(d.getTime() + 9 * 3600 * 1000);
    const p2 = (n) => String(n).padStart(2, '0');
    if (fmt === 'yyyy-MM-dd') return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
    if (fmt === 'HH:mm:ss') return `${p2(t.getUTCHours())}:${p2(t.getUTCMinutes())}:${p2(t.getUTCSeconds())}`;
    return '2026-09-01T00:00:00+09:00';
  },
  getUuid: () => 'x',
};
// 「모든 사용자」 배포에서 구글은 접속자 계정을 안 알려 준다 — 실제로 이렇게 던진다
const Session = { getActiveUser: () => ({ getEmail: () => { throw new Error('no permission'); } }) };

// 시트 대역 — 설정 탭은 SETUP.md 가 시키는 대로 비어 있다
const sheets = {};
const mkSheet = (rows = []) => ({
  getLastRow: () => rows.length,
  // A1 표기('C2')와 숫자 표기(r,c,nr,nc) 둘 다 받는다 — 실제 시트가 그렇다
  getRange: (r, c, nr, nc) => {
    if (typeof r === 'string') {
      const m = r.match(/^([A-Z]+)(\d+)$/);
      let col = 0;
      for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
      const row = Number(m[2]);
      return {
        getValue: () => (rows[row - 1] || [])[col - 1] || '',
        getValues: () => [[(rows[row - 1] || [])[col - 1] || '']],
        setValues: () => {},
      };
    }
    return {
      getValues: () => rows.slice(r - 1, r - 1 + nr).map(x => x.slice(c - 1, c - 1 + nc)),
      getValue: () => (rows[r - 1] || [])[c - 1] || '',
      setValues: (v) => { rows.splice(r - 1, v.length, ...v); },
    };
  },
  setFrozenRows: () => {},
  getDataRange: () => ({ getValues: () => rows }),
  getName: () => 'src',
});
const book = {
  getSheetByName: (n) => sheets[n] || null,
  insertSheet: (n) => (sheets[n] = mkSheet([])),
  getSheets: () => Object.keys(sheets).map((n) => ({ ...sheets[n], getName: () => n })),
  getName: () => '보드 시트',
};
const SpreadsheetApp = { getActiveSpreadsheet: () => book, openById: () => book };
const ContentService = { MimeType: {}, createTextOutput: (t) => ({ setMimeType: () => t }) };


const src = readFileSync(resolve(HERE, 'apps-script/Code.gs'), 'utf8');
const G = new Function('Utilities', 'SpreadsheetApp', 'ContentService', 'LockService', 'Session',
  `${src}\nreturn { handle_, access_, HEADERS, SHEET };`
)(Utilities, SpreadsheetApp, ContentService, { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }, Session);

let fails = 0;
const eq = (got, want, label) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${label}\n      받음 ${a}\n      기대 ${b}`); fails++; }
  else console.log(`  ✓ ${label}`);
};

/* 원본 탭 — 지어낸 학생 둘, 교사 비공개 메모 하나 */
sheets['다운로드 원본'] = mkSheet([
  ['학년', '반', '번호', '성명', '학교유형', '지역', '대학명', '모집시기', '전형유형',
    '세부유형', '계열', '모집단위', '모집인원', '내등급(환산)'],
  ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['3', '1', '1', '김가나', '일반대', '서울', '건국대학교(서울)', '수시', '학생부위주(종합)',
    '종합(KU자기추천)', '인문', '영어영문학과', '30', '3.17'],
  ['3', '1', '2', '이다라', '일반대', '서울', '연세대학교(서울)', '수시', '학생부위주(교과)',
    '교과(추천형)', '인문', '경제학부', '24', '1.40'],
]);
sheets['메모'] = mkSheet([
  G.HEADERS['메모'],
  ['m1', '3101', '', '최저 못 맞출 것 같음. 하향 권유 필요.', 'N', '담임', '2026-08-20'],
]);

console.log('C2 를 비워 두면 — 저장소에 적힌 기본 열쇠를 쓴다');
sheets['설정'] = mkSheet([G.HEADERS['설정']]);
{
  eq(G.handle_({ action: 'students' }).ok, false, '기본 열쇠도 열쇠다 — 안 보내면 막는다');
  const r = G.handle_({ action: 'students', key: '84348434' });
  eq([r.ok, r.students.length], [true, 2],
    '기본 열쇠로 통과 (자료 적재가 학생 경로에 안 먹힌다)');
  eq(r.openToAll, true, '기본 열쇠를 쓰는 중이라고 알린다 — 저장소에 적혀 있다');
}

console.log('\nC2 에 다른 글자를 적으면 — 저장소에 없는 값이라 진짜로 잠긴다');
sheets['설정'] = mkSheet([G.HEADERS['설정'], ['', '', '우리반만아는글자']]);
{
  eq(G.handle_({ action: 'students' }).ok, false, '열쇠 없이 부르면 막는다');
  eq(G.handle_({ action: 'students', key: '84348434' }).ok, false, '기본 열쇠도 더는 안 통한다');
  eq(G.handle_({ action: 'addNote', key: '84348434', hak: '3101', text: 'x' }).ok, false,
    '읽기만이 아니라 쓰기도 막는다');
  const r = G.handle_({ action: 'students', key: '우리반만아는글자' });
  eq([r.ok, r.students.length, r.openToAll], [true, 2, false], '적어 둔 열쇠는 통과');
}

/*
 * **시트가 날짜 칸을 Date 로 되돌려 주는 문제.**
 *
 * 학생이 「2026-11-28」을 넣으면 구글 시트가 그 칸을 날짜형으로 바꾼다. 읽어 오면
 * 글자가 아니라 Date 객체고, JSON 으로 나가면서 UTC 로 적혀
 * 「2026-11-27T15:00:00.000Z」— **하루 전 날짜에 시각까지 붙은 딴 값**이 된다.
 * 달력은 「from ≤ 날짜 ≤ to」 글자 비교라 이 값과는 어떤 날도 안 맞아서,
 * 학생이 넣고 담임이 확인한 면접일이 **화면에서 통째로 사라졌다.**
 */
console.log('\n시트가 Date 로 되돌려 준 날짜');
sheets['설정'] = mkSheet([G.HEADERS['설정']]);
{
  // 시트가 날짜형으로 바꾼 칸 — 2026-11-28 KST 자정
  const kst = new Date(Date.UTC(2026, 10, 27, 15, 0, 0));
  sheets['일정'] = mkSheet([G.HEADERS['일정'],
    ['A', '3101', '면접', kst, kst, 'confirmed', '담임', '2026-09-02T10:00:00+09:00'],
  ]);
  const r = G.handle_({ action: 'students', key: '84348434' });
  eq(r.dates.length, 1, '일정이 내려온다');
  eq(r.dates[0].from, '2026-11-28', 'Date 칸이 KST 날짜 글자로 돌아온다 — 하루 밀리지 않는다');
  eq(r.dates[0].to, '2026-11-28', 'to 도 같다');
  // 시각이 든 datetime 칸은 시각을 잃지 않는다 (배치 at 이 seen 비교에 쓴다)
  const dt = new Date(Date.UTC(2026, 8, 2, 1, 11, 0));   // 2026-09-02 10:11 KST
  sheets['배치'] = mkSheet([G.HEADERS['배치'],
    ['B', '3101', 'rank', 1, '담임', dt],
  ]);
  const r2 = G.handle_({ action: 'students', key: '84348434' });
  eq(r2.state[0].at, '2026-09-02T10:11:00+09:00', 'datetime 칸은 시각까지 KST 로');
}

console.log('\n학생 경로는 열쇠와 무관하게 토큰으로만');
{
  eq(G.handle_({ action: 'student', token: '' }).ok, false, '토큰 없이 못 연다');
  eq(G.handle_({ action: 'student', token: '없는것' }).ok, false, '엉뚱한 토큰도 못 연다');
  // 열쇠를 학생 경로에 요구하지 않는다 — 요구하면 학생이 아예 못 쓴다
  eq(G.handle_({ action: 'student', token: '없는것' }).error.indexOf('열쇠') < 0, true,
    '학생에게 열쇠를 묻지 않는다');
  // 적어 두지 않은 student* 는 학생 경로로 안 가고 교사 경로로 떨어져 열쇠에 막힌다
  eq(G.handle_({ action: 'studentXyz', token: 'x' }).ok, false,
    '적어 두지 않은 student* 는 토큰이 있어도 안 받는다');
}

/*
 * 순위 맞바꾸기 — **한 번에, 그리고 늦은 화면은 되돌린다.**
 *
 * 이제 담임도 학생도 순위를 바꾼다. 화면에서 두 번 나눠 쓰면 둘이 끼어들어
 * 두 카드가 나란히 1순위가 될 수 있다. 서버가 잠금 안에서 한 번에 한다.
 */
console.log('\n순위 맞바꾸기');
sheets['설정'] = mkSheet([G.HEADERS['설정']]);
{
  const K = '84348434';
  const st = () => (sheets['배치'] ? sheets['배치'].getDataRange().getValues() : []);
  const place = (id, rank) => Object.fromEntries(
    st().slice(1).map((r) => [String(r[0]), { slot: r[2], rank: r[3], at: r[5] }]),
  )[id];
  sheets['배치'] = mkSheet([G.HEADERS['배치'],
    ['A', '3101', 'rank', 1, '담임', '2026-09-01T00:00:00+09:00'],
    ['B', '3101', 'rank', 2, '담임', '2026-09-01T00:00:00+09:00'],
    ['C', '3101', 'pool', '', '담임', '2026-09-01T00:00:00+09:00'],
  ]);

  const r1 = G.handle_({ action: 'setRank', key: K, id: 'A', hak: '3101', slot: 'rank', rank: 2 });
  eq(r1.ok, true, '1순위를 2순위로 옮긴다');
  eq([place('A').rank, place('B').rank], [2, 1], 'B 가 A 가 있던 1순위로 온다 (맞바꾸기)');

  const r2 = G.handle_({ action: 'setRank', key: K, id: 'C', hak: '3101', slot: 'rank', rank: 1 });
  eq(r2.ok, true, '후보를 1순위로 올린다');
  eq([place('C').rank, place('B').slot], [1, 'pool'],
    '밀려난 것은 후보로 내려간다 — 조용히 사라지지 않는다');

  const r3 = G.handle_({ action: 'setRank', key: K, id: 'A', hak: '3101', slot: 'rank', rank: 3,
    seen: '2026-08-01T00:00:00+09:00' });
  eq([r3.ok, r3.stale], [false, true], '한 발 늦은 화면은 되돌린다');
  eq(place('A').rank, 2, '되돌렸으니 자리도 그대로다');

  // 첫 배치를 못 본 화면(seen='') 도 한 발 늦은 것이다 — 빈 글자로 못 빠져나간다
  const r3b = G.handle_({ action: 'setRank', key: K, id: 'A', hak: '3101', slot: 'rank', rank: 3,
    seen: '' });
  eq([r3b.ok, r3b.stale], [false, true], 'seen 이 빈 글자여도 검사한다 (첫 배치 경합)');
  // 옛 화면(seen 자체가 없음)은 검사 없이 통과한다 — 배포가 엇갈려도 멈추지 않는다
  const r3c = G.handle_({ action: 'setRank', key: K, id: 'A', hak: '3101', slot: 'rank', rank: 2 });
  eq(r3c.ok, true, 'seen 을 안 보내는 옛 화면은 그대로 동작한다');

  const r4 = G.handle_({ action: 'setRank', key: K, id: 'A', hak: '3101', slot: 'rank', rank: 9 });
  eq(r4.ok, false, '1~6 밖은 안 받는다');
}

/*
 * 같은 목록이 서버(`Code.gs`)와 화면(`store.js`) 양쪽에 있다. 어긋나면 학생이
 * 적은 값이 「모르는 칸입니다」로 조용히 거절된다. 글자로 견줘 둔다.
 */
console.log('\n서버와 화면이 같은 이름을 쓰나');
{
  /*
   * 학생 경로 목록이 서버(`Code.gs`)와 통신(`api.js`) 양쪽에 있다. 어긋나면
   * 조용히 틀린다 — 교사 경로가 학생 목록에 잘못 들어가 있으면 열쇠를 안 붙여
   * 보내서 「열쇠가 맞지 않습니다」가 되고, 반대면 학생 링크에 열쇠가 샌다.
   * 실제로 `students` 가 `startsWith('student')` 에 걸려 그렇게 됐었다.
   */
  const pick = (text, re) => {
    const m = text.match(re);
    return m ? m[1].match(/[A-Za-z]+/g).sort().join(',') : null;
  };
  const gsA = pick(readFileSync(resolve(HERE, 'apps-script/Code.gs'), 'utf8'),
    /var STUDENT_ACTION = \{([^}]*)\}/);
  const jsA = pick(readFileSync(resolve(HERE, 'api.js'), 'utf8'),
    /const STUDENT_ACTION = new Set\(\[([^\]]*)\]/);
  eq(gsA, jsA, '학생 경로 목록이 서버·통신에서 같다');
  eq(gsA && gsA.indexOf('students') < 0, true, '교사 자료 적재(students)가 학생 목록에 없다');
{
  const gs = readFileSync(resolve(HERE, 'apps-script/Code.gs'), 'utf8')
    .match(/var FIELDS = (\[[^\]]*\])/);
  const js = readFileSync(resolve(HERE, 'store.js'), 'utf8')
    .match(/export const FIELDS = (\[[^\]]*\])/);
  const norm = (m) => (m ? m[1].replace(/[\s'"]/g, '') : null);
  eq(norm(gs), norm(js), '원서 뒤 채우는 칸 이름이 서버·화면에서 같다');

  // 기본 열쇠가 어긋나면 설치하자마자 「열쇠가 맞지 않습니다」가 된다
  const one = (t, re) => { const m = t.match(re); return m ? m[1] : null; };
  eq(one(readFileSync(resolve(HERE, 'apps-script/Code.gs'), 'utf8'),
    /var DEFAULT_KEY = '([^']*)'/),
  one(readFileSync(resolve(HERE, 'api.js'), 'utf8'),
    /const DEFAULT_KEY = '([^']*)'/),
  '기본 열쇠가 서버·통신에서 같다');
}
}

console.log(fails ? `\n${fails}건 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
