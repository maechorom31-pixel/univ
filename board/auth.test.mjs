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
  formatDate: () => '2026-09-01T00:00:00+09:00', getUuid: () => 'x',
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

console.log('열쇠를 안 걸었을 때 — 예전처럼 열려 있되 그렇다고 말한다');
sheets['설정'] = mkSheet([G.HEADERS['설정']]);
{
  const r = G.handle_({ action: 'students' });
  eq(r.ok, true, '열쇠가 없으면 그대로 열린다 (옛 시트가 갑자기 막히면 더 나쁘다)');
  eq(r.openToAll, true, '「누구나 볼 수 있다」고 알린다');
  eq(r.students.length, 2, '자료 적재가 학생 경로에 안 먹힌다 (students ↔ student)');
}

console.log('\n열쇠를 걸었을 때');
sheets['설정'] = mkSheet([G.HEADERS['설정'], ['', '', '열쇠글자']]);
{
  eq(G.handle_({ action: 'students' }).ok, false, '열쇠 없이 부르면 막는다');
  eq(G.handle_({ action: 'students', key: '틀린것' }).ok, false, '틀린 열쇠도 막는다');
  eq(G.handle_({ action: 'addNote', key: '틀린것', hak: '3101', text: 'x' }).ok, false,
    '읽기만이 아니라 쓰기도 막는다');
  const r = G.handle_({ action: 'students', key: '열쇠글자' });
  eq([r.ok, r.students.length, r.openToAll], [true, 2, false], '맞는 열쇠는 통과');
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
 * 같은 목록이 서버(`Code.gs`)와 화면(`store.js`) 양쪽에 있다. 어긋나면 학생이
 * 적은 값이 「모르는 칸입니다」로 조용히 거절된다. 글자로 견줘 둔다.
 */
console.log('\n서버와 화면이 같은 이름을 쓰나');
{
  const gs = readFileSync(resolve(HERE, 'apps-script/Code.gs'), 'utf8')
    .match(/var FIELDS = (\[[^\]]*\])/);
  const js = readFileSync(resolve(HERE, 'store.js'), 'utf8')
    .match(/export const FIELDS = (\[[^\]]*\])/);
  const norm = (m) => (m ? m[1].replace(/[\s'"]/g, '') : null);
  eq(norm(gs), norm(js), '원서 뒤 채우는 칸 이름이 서버·화면에서 같다');
}

console.log(fails ? `\n${fails}건 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
