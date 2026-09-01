/**
 * board/apps-script/Code.gs 의 파서를 node에서 그대로 돌려 본다.
 *
 * Apps Script 는 모듈이 없어서 Code.gs 를 통째로 읽어 함수로 감싸 실행하고,
 * 시트 API 자리에는 최소한의 대역을 넣는다. **테스트 대상은 실제로 배포되는 그 코드다.**
 *
 * 실행:
 *     node board/parse.test.mjs <시트를_2차원배열로_뽑은.json> [...]
 *
 * 시트 픽스처에는 학생 실명이 들어 있으므로 저장소에 커밋하지 않는다.
 * 스크래치 폴더에 두고 경로로 넘긴다.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ── Apps Script 대역 ────────────────────────────────────────────── */
const Utilities = {
  DigestAlgorithm: { SHA_1: 'SHA_1' },
  Charset: { UTF_8: 'utf8' },
  computeDigest(_alg, s) {
    // Apps Script 는 부호 있는 바이트를 준다. sha1_() 가 그걸 되돌리므로 맞춰 준다.
    return [...createHash('sha1').update(s, 'utf8').digest()]
      .map((b) => (b > 127 ? b - 256 : b));
  },
  formatDate: () => '2026-09-01T00:00:00+09:00',
  getUuid: () => '00000000-0000-0000-0000-000000000000',
};
const stub = new Proxy({}, { get: () => () => { throw new Error('시트 API는 파서에서 쓰지 않는다'); } });

const src = readFileSync(resolve(HERE, 'apps-script/Code.gs'), 'utf8');
const load = new Function(
  'Utilities', 'SpreadsheetApp', 'ContentService', 'LockService', 'Session',
  `${src}\nreturn { parseFavorites_, parseDates_, parseQuota_, readHeader_, appId_, parseGradeRows_ };`
);
const G = load(Utilities, stub, stub, stub, stub);

/* ── 작은 단위 확인 ──────────────────────────────────────────────── */
let fails = 0;
const eq = (got, want, label) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${label}\n      받음 ${a}\n      기대 ${b}`); fails++; }
  else console.log(`  ✓ ${label}`);
};

console.log('날짜 파싱');
eq(G.parseDates_('2025-11-29 ~ 2025-11-30'), { from: '2025-11-29', to: '2025-11-30', fixed: false }, '기간 (export 형식)');
eq(G.parseDates_('2025-12-05 ~ 2025-12-05'), { from: '2025-12-05', to: '2025-12-05', fixed: true }, '하루짜리는 확정');
eq(G.parseDates_('11.25(수)~11.27(금)', 2025), { from: '2025-11-25', to: '2025-11-27', fixed: false }, '모집요강 기간 형식');
eq(G.parseDates_('2025.12.12.(금) 14:00'), { from: '2025-12-12', to: '2025-12-12', fixed: true }, '점 구분 + 시각');
eq(G.parseDates_('12월 18일(금)까지', 2025), { from: '2025-12-18', to: '2025-12-18', fixed: true }, '한글 날짜');
eq(G.parseDates_(''), null, '빈 값은 null');
eq(G.parseDates_('추후 공지'), null, '못 읽으면 null');

console.log('모집인원 파싱');
eq(G.parseQuota_('586'), 586, '그냥 숫자');
eq(G.parseQuota_('(29)'), 29, '정원 외 괄호');
eq(G.parseQuota_('7(<10)'), 7, '증감 표기');
eq(G.parseQuota_(''), null, '빈 값');

/* ── 두 모양을 다 읽는가 ─────────────────────────────────────────
 *
 * 대교협 파일은 해마다 모양이 다르다. 지어낸 이름으로 만든 두 벌을 늘 돌려서
 * 한쪽을 고치다 다른 쪽이 깨지는 것을 잡는다. 실제 시트는 실명이 들어 있어
 * 커밋하지 않고, 필요하면 경로로 넘긴다.
 */
const F = (name) => JSON.parse(readFileSync(resolve(HERE, 'fixtures', name), 'utf8'));

console.log('\n모양 둘 — 즐겨찾기(머리글 두 줄) · 관심대학 리스트(머리글이 4행)');
{
  const oldV = F('즐겨찾기-옛모양.json');
  const oldH = G.readHeader_(oldV);
  eq([oldH.headerAt, oldH.dataFrom], [0, 2], '옛 모양 — 머리글 0행 · 자료 2행');
  eq(oldH.suneungAt, 28, '옛 모양 — 수능 블록을 찾는다');
  const o = G.parseFavorites_(oldV, { year: 2025 });
  eq([o.students.length, o.apps.length, o.skipped], [2, 2, 0], '옛 모양 — 학생 2 · 지원 2');
  eq(o.unknownCols, [], '옛 모양 — 미인식 칸 없음');
  eq(o.apps[0].dates['면접'], { from: '2025-11-29', to: '2025-11-29', fixed: true },
    '옛 모양 — 면접 일자');
  eq(o.students[0].naesin['전교과'], 3.2, '옛 모양 — 내신 조합');
  eq(o.students[0].suneung['국어'], { subject: '화법과작문', std: 128 }, '옛 모양 — 수능 영역');
  eq(o.apps[0].minReq, true, '옛 모양 — 최저 기준 글이 있으면 있는 것');

  const newV = F('관심대학-새모양.json');
  const newH = G.readHeader_(newV);
  eq([newH.headerAt, newH.dataFrom], [3, 4], '새 모양 — 머리글 3행 · 자료 4행');
  eq(newH.suneungAt, -1, '새 모양 — 수능 블록 없음');
  const n = G.parseFavorites_(newV, { year: 2025 });
  eq([n.students.length, n.apps.length, n.skipped], [2, 3, 0], '새 모양 — 학생 2 · 지원 3');
  eq(n.unknownCols, [], '새 모양 — 미인식 칸 없음 (No 는 줄 번호라 뺀다)');
  eq(n.apps[0].univType, '일반대', '새 모양 — 「설립 구분」을 학교유형으로');
  eq(n.apps[0].period, '수시', '새 모양 — 「시기」를 모집시기로');
  eq(n.apps[0].quota, 30, '새 모양 — 「모집 인원」 (줄바꿈 든 이름)');
  eq(n.apps[0].selectType, '일괄합산', '새 모양 — 「선발 유형」');
  eq([n.apps[0].minReq, n.apps[1].minReq], [true, false],
    '새 모양 — 「수능 최저 유무」 Y/N 을 있다/없다로');
  eq(n.apps[0].minReqText, '', '새 모양 — Y 를 기준 글로 쓰지 않는다');
  eq(n.apps[0].stage1Rule, '서류 100%', '새 모양 — 1단계 반영요소');
  eq(n.apps[0].myScore, { score: 921.5, grade: 3.17 }, '새 모양 — 내등급·내점수');
  eq(n.apps[2].myScore, null, '새 모양 — 0 은 「아직 안 적음」이다');
  /*
   * **모양이 바뀌면 안정키도 바뀐다.** 여기서 못 박아 둔다.
   *
   * 안정키는 학번+대학+세부유형+학과의 sha1 인데, 두 파일이 같은 전형을 다르게
   * 적는다 — 즐겨찾기는 「종합(KU자기추천)」, 관심대학 리스트는
   * 「학생부종합(KU자기추천전형)」. 글자가 다르니 키가 달라지고, 그 지원에 붙어
   * 있던 순위·메모·결과가 **통째로 떨어진다.**
   *
   * 파서가 고칠 수 있는 문제가 아니다(어느 쪽이 옳은지 자료가 말해 주지 않는다).
   * 학년 중간에 파일 모양을 바꾸지 않는 것으로 푼다 — `board/SETUP.md` 에 적었다.
   */
  eq(n.apps[0].id === o.apps[0].id, false,
    '모양이 바뀌면 안정키가 달라진다 — 학년 중간에 바꾸지 않는다');
}

/* ── 시나리오 — 실제로 올 법한 이상한 자료 ──────────────────────────
 *
 * 아래는 모두 **한 번은 실제로 틀렸던 것**이다. 시나리오를 돌려 보고 잡았다.
 */
const H2 = ['No', '학년', '반', '번호', '이름', '설립\n구분', '지역', '계열', '대학명',
  '모집단위', '모집\n인원', '1단계 반영요소', '수능\n최저\n유무', '시기', '전형유형',
  '세부유형', '선발\n유형', '접수\n일자', '면접\n일자', '실기\n일자', '',
  '논술\n일자', '적성\n일자', '최종\n발표일', '내등급', '내점수'];
const ROW = (over = {}) => {
  const r = ['1', '3', '1', '1', '김가나', '일반대', '서울', '인문', '건국대학교(서울)',
    '영어영문학과', '30', '서류 100%', 'Y', '수시', '학생부위주(종합)',
    '학생부종합(KU자기추천전형)', '일괄합산', '-', '', '', '', '', '', '', '3.17', '921.5'];
  for (const [k, v] of Object.entries(over)) r[Number(k)] = v;
  return r;
};
const SHEET = (...rows) => [[], ['관심대학 리스트'], [], H2, ...rows];

console.log('\n시나리오');
{
  // 시트는 날짜 서식이 걸린 칸을 문자열이 아니라 Date 로 준다
  const d = G.parseFavorites_(SHEET(ROW({ 18: new Date(2026, 10, 29) })), { year: 2026 });
  eq(d.apps[0].dates['면접'], { from: '2026-11-29', to: '2026-11-29', fixed: true },
    'Date 객체로 온 날짜를 읽는다');

  // 예전에는 「d 로 시작하면 일정」이라 dept(모집단위)가 날짜로 읽혔다
  eq(d.apps[0].unknown, {}, '학과가 일정으로 새지 않는다 (dept ↔ d접두사)');

  // 첫 칸은 줄 번호라 비거나 글자일 수 있다. 학년 칸을 봐야 한다.
  const n = G.parseFavorites_(SHEET(ROW({ 0: '' }), ROW({ 0: 'A-1' })), {});
  eq([n.apps.length, n.skipped], [2, 0], '첫 칸이 비어도 학년 칸으로 자료 줄을 가린다');

  // 시트가 수로 주는 칸
  const m = G.parseFavorites_(SHEET(ROW({ 1: 3, 2: 1, 3: 1, 10: 30, 24: 3.17 })), {});
  eq([m.students[0].hak, m.apps[0].quota, m.apps[0].myScore.grade], ['3101', 30, 3.17],
    '숫자로 와도 읽는다');

  // 엉뚱한 파일을 가리켰을 때 — 조용히 0명이 아니라 왜인지 말한다
  const junk = G.parseFavorites_([['안녕하세요'], ['표가', '아닙니다'], ['1', '2', '3']], {});
  eq([junk.apps.length, Boolean(junk.problem)], [0, true], '머리글을 못 찾으면 사유를 돌려준다');

  // 「-」는 못 읽은 날짜가 아니라 「없다」는 뜻
  eq(G.parseDates_('-'), null, '「-」는 빈 날짜');
  eq(G.parseFavorites_(SHEET(ROW()), {}).apps[0].unknown, {},
    '「-」를 알아보지 못한 일정으로 올리지 않는다');

  // 머리글이 한참 아래 있어도 찾는다
  const deep = [...Array.from({ length: 32 }, () => []), H2, ROW()];
  eq(G.readHeader_(deep).headerAt, 32, '머리글이 32행이어도 찾는다');
}

/* ── 성적 탭 — 학년 전체 전교과 일반등급 ─────────────────────────── */
console.log('성적 탭 파서');
{
  const sheet = [
    ['학년', '반', '번호', '이름', '일반등급'],
    ['3', '5', '3', '가상갑', '1.03'],
    ['3', '1', '15', '가상을', '3.5'],
    ['3', '2', '9', '가상병', '0'],          // 0 은 「안 적음」 — null 이어야 한다
    ['', '', '', '', ''],                     // 빈 줄은 건너뛴다
    ['합계', '', '', '', '4.5'],              // 숫자 아닌 반·번호는 자료가 아니다
  ];
  const got = G.parseGradeRows_(sheet);
  eq(got.rows.length, 3, '  세 줄을 읽는다');
  eq(got.rows[0], { hak: '3503', name: '가상갑', grade: 1.03 }, '  학번은 학년+반+번호 두 자리');
  eq(got.rows[1].hak, '3115', '  번호 두 자리는 그대로');
  eq(got.rows[2].grade, null, '  등급 0 은 값이 아니라 안 적음');

  // 머리글이 첫 줄이 아니어도, 학년 칸이 없어도 (3학년으로 본다)
  const messy = [
    ['2027 대비 성적'],
    ['반', '번호', '성명', '전교과'],
    ['5', '3', '가상갑', '2.5'],
  ];
  const got2 = G.parseGradeRows_(messy);
  eq(got2.rows, [{ hak: '3503', name: '가상갑', grade: 2.5 }], '  머리글을 이름으로 찾는다 · 학년 없으면 3');

  // 엉뚱한 시트면 왜 못 읽었는지 말한다
  eq(G.parseGradeRows_([['아무', '관계없는', '표']]).problem.length > 0, true, '  머리글을 못 찾으면 말한다');
  eq(G.parseGradeRows_([]).rows.length, 0, '  빈 시트는 조용히 빈 목록');
}

/* ── 실제 시트 ───────────────────────────────────────────────────── */
const files = process.argv.slice(2);
if (!files.length) {
  console.log('\n실제 시트를 넘기지 않아 지어낸 두 벌만 읽었습니다.');
  process.exit(fails ? 1 : 0);
}

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');

for (const file of files) {
  const values = JSON.parse(readFileSync(file, 'utf8'));
  const head = G.readHeader_(values);
  const out = G.parseFavorites_(values, { year: 2025 });
  const { students, apps } = out;

  console.log(`\n${file.split('/').pop()}  (${values.length}행 × ${head.main.length}열)`);
  console.log(`  학생 ${students.length}명 · 지원 ${apps.length}건 · 건너뜀 ${out.skipped}`);
  console.log(`  수능 블록 ${head.suneungAt >= 0 ? `${head.suneungAt}열부터` : '없음'} · 데이터 ${head.dataFrom}행부터`);

  const filled = (f) => apps.filter(f).length;
  console.log(`  채워진 비율 — 대학 ${pct(filled((a) => a.univ), apps.length)}`
    + ` · 모집단위 ${pct(filled((a) => a.dept), apps.length)}`
    + ` · 세부유형 ${pct(filled((a) => a.typeSub), apps.length)}`
    + ` · 모집인원 ${pct(filled((a) => a.quota != null), apps.length)}`
    + ` · 내등급 ${pct(filled((a) => a.myScore && a.myScore.grade != null), apps.length)}`);

  const kinds = {};
  for (const a of apps) for (const k of Object.keys(a.dates)) kinds[k] = (kinds[k] || 0) + 1;
  const fixedN = apps.reduce((n, a) => n + Object.values(a.dates).filter((d) => d.fixed).length, 0);
  const dateN = Object.values(kinds).reduce((n, v) => n + v, 0);
  console.log(`  일정 ${dateN}건 (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(' · ')})`
    + ` · 확정일 ${pct(fixedN, dateN)}`);

  const naesinKeys = new Set(students.flatMap((s) => Object.keys(s.naesin)));
  const suneungKeys = new Set(students.flatMap((s) => Object.keys(s.suneung)));
  console.log(`  내신 조합 ${naesinKeys.size}종 · 수능 영역 ${suneungKeys.size}종`);
  console.log(`  미인식 컬럼 ${out.unknownCols.length}${out.unknownCols.length ? ': ' + out.unknownCols.slice(0, 6).join(' · ') : ''}`);

  // id 는 안정적이어야 한다 — 같은 입력이면 같은 값, 서로 겹치지 않을 것
  const again = G.parseFavorites_(values, { year: 2025 });
  eq(again.apps.map((a) => a.id).join(), apps.map((a) => a.id).join(), '  id 재현성');
  const dup = apps.length - new Set(apps.map((a) => a.id)).size;
  eq(dup, 0, `  id 충돌 없음 (${apps.length}건)`);

  // 학생 한 명이 지원 목록을 온전히 갖고 있는지
  const linked = students.reduce((n, s) => n + s.apps.length, 0);
  eq(linked, apps.length, '  학생↔지원 연결 수 일치');
}

console.log(fails ? `\n${fails}건 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
