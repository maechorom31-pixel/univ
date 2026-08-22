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
  `${src}\nreturn { parseFavorites_, parseDates_, parseQuota_, readHeader_, appId_ };`
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

/* ── 실제 시트 ───────────────────────────────────────────────────── */
const files = process.argv.slice(2);
if (!files.length) {
  console.log('\n시트 픽스처를 넘기지 않아 단위 확인만 했습니다.');
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
