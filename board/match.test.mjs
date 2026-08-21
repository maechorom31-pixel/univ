/**
 * board/match.js 를 실제 자료로 검증한다.
 *
 *   node board/match.test.mjs [<시트를_2차원배열로_뽑은.json> ...]
 *
 * 픽스처 없이 돌리면 규칙 단위 확인만 한다.
 * 픽스처를 넘기면 즐겨찾기 → 입결·모집요강 연결률을 실제로 잰다.
 * 시트 픽스처에는 학생 실명이 들어 있으므로 저장소에 커밋하지 않는다.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  univStem, campusOf, resolveUniv, buildUnivIndex,
  normDept, key, isUmbrella, link, indexIpgyeol, indexMojip, indexCollege,
} from './match.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
let fails = 0;
const eq = (got, want, label) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log(`  ✗ ${label}\n      받음 ${JSON.stringify(got)}\n      기대 ${JSON.stringify(want)}`);
    fails++;
  } else console.log(`  ✓ ${label}`);
};

/* ── 규칙 ────────────────────────────────────────────────────────── */
console.log('대학명 줄이기');
eq(univStem('부산외국어대학교(부산)'), '부산외대', '외국어대학교 → 외대');
eq(univStem('경인교육대학교(인천)'), '경인교대', '교육대학교 → 교대');
eq(univStem('숙명여자대학교(서울)'), '숙명여대', '여자대학교 → 여대');
eq(univStem('서울과학기술대학교(서울)'), '서울과기대', '과학기술대학교 → 과기대');
eq(univStem('국립금오공과대학교(구미)'), '국립금오공대', '공과대학교 → 공대, 국립은 유지');
eq(univStem('한국외국어대학교(용인) - 글로벌캠퍼스'), '한국외대', '꼬리표 붙은 이름');

console.log('캠퍼스 가려내기');
eq(campusOf('건국대학교(글로컬)'), '글로컬', '괄호');
eq(campusOf('한양대학교(ERICA)'), '에', 'ERICA는 별칭표로');
eq(campusOf('동국대학교(WISE)'), 'W', 'WISE는 별칭표로');
eq(campusOf('연세대학교'), null, '표시 없으면 본교');

console.log('학과명 정규화 (build_xref.py 와 같아야 한다)');
eq(normDept('통합모집(자유전공)'), '통합모집', '괄호 설명 제거 — 입결도 같은 표기를 쓴다');
eq(normDept('한의예과(인문)'), '한의예~인문', '계열 구분자는 키에 남긴다');
eq(normDept('한의예과(자연)'), '한의예~자연', '인문과 자연이 갈린다');
eq(normDept('[통합]수소테크융합대학'), '수소테크융합대', '앞머리 대괄호 제거');
eq(normDept('경영학부'), '경영', '학부 접미 제거');
eq(isUmbrella('통합모집(자유전공)'), true, '통합 모집 인식');
eq(isUmbrella('간호학과'), false, '일반 학과');

console.log('캠퍼스 분기');
const idx = buildUnivIndex(['건국대', '건국대(글)', '고려대', '고려대(세)',
  '단국대(죽전)', '단국대(천안)', '한양대', '한양대(에)', '동국대', '동국대(W)',
  '한국외대', '한국외대(글)', '부산외대', '국립금오공대']);
eq(resolveUniv('건국대학교(글로컬)', idx), '건국대(글)', '글로컬 → (글)');
eq(resolveUniv('건국대학교(서울)', idx), '건국대', '서울 → 본교');
eq(resolveUniv('고려대학교(세종)', idx), '고려대(세)', '세종 → (세)');
eq(resolveUniv('단국대학교(죽전)', idx), '단국대(죽전)', '본교가 없는 경우');
eq(resolveUniv('한양대학교(ERICA)', idx), '한양대(에)', 'ERICA → (에)');
eq(resolveUniv('동국대학교(WISE)', idx), '동국대(W)', 'WISE → (W)');
eq(resolveUniv('한국외국어대학교(용인) - 글로벌캠퍼스', idx), '한국외대(글)', '꼬리표에서 캠퍼스');
eq(resolveUniv('부산외국어대학교(부산)', idx), '부산외대', '축약형 대학');
eq(resolveUniv('금오공과대학교(구미)', idx), '국립금오공대', '자료 쪽에만 국립이 붙은 경우');
eq(resolveUniv('없는대학교(서울)', idx), null, '없으면 null — 지어내지 않는다');

/* ── 실제 자료 ───────────────────────────────────────────────────── */
const ip = indexIpgyeol(JSON.parse(readFileSync(resolve(ROOT, 'data/ipgyeol.json'), 'utf8')));
const mo = indexMojip(JSON.parse(readFileSync(resolve(ROOT, 'data/mojip2027.json'), 'utf8')));

// 전문대는 옆 저장소(College)에 있다. 없으면 그 부분만 건너뛴다.
let co = null;
try {
  co = indexCollege(JSON.parse(readFileSync(resolve(ROOT, '../College/data/departments.json'), 'utf8')));
} catch (err) {
  console.log('\n(College 자료가 없어 전문대 확인은 건너뜁니다)');
}
console.log(`\n자료 — 입결 대학 ${ip.univNames.length} · 학과키 ${ip.byKey.size}`
  + ` / 모집요강 대학 ${mo.univNames.length} · 학과키 ${mo.byKey.size}`
  + (co ? ` / 전문대 ${co.univNames.length} · 학과키 ${co.byKey.size}` : ''));

const files = process.argv.slice(2);
if (!files.length) {
  console.log('\n시트 픽스처를 넘기지 않아 규칙 확인만 했습니다.');
  process.exit(fails ? 1 : 0);
}

/* Code.gs 파서를 그대로 써서 지원 레코드를 만든다 */
const Utilities = {
  DigestAlgorithm: { SHA_1: 'SHA_1' }, Charset: { UTF_8: 'utf8' },
  computeDigest: (_a, s) => [...createHash('sha1').update(s, 'utf8').digest()]
    .map((b) => (b > 127 ? b - 256 : b)),
  formatDate: () => '', getUuid: () => '',
};
const stub = new Proxy({}, { get: () => () => { throw new Error('시트 API 미사용'); } });
const gs = new Function('Utilities', 'SpreadsheetApp', 'ContentService', 'LockService', 'Session',
  `${readFileSync(resolve(HERE, 'apps-script/Code.gs'), 'utf8')}\nreturn { parseFavorites_ };`,
)(Utilities, stub, stub, stub, stub);

const src = { ipgyeol: ip, mojip: mo, college: co, related: new Map() };
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');

for (const file of files) {
  const { apps } = gs.parseFavorites_(JSON.parse(readFileSync(file, 'utf8')), { year: 2025 });
  const general = apps.filter((a) => a.univType === '일반대');
  const links = general.map((a) => ({ a, l: link(a, src) }));
  const okUniv = links.filter((x) => !x.l.why.includes('찾지 못했습니다'));
  const exact = links.filter((x) => x.l.confidence === 'exact');
  const loose = links.filter((x) => x.l.confidence === 'loose');
  const dead = links.filter((x) => x.l.confidence === 'none');
  const withMojip = links.filter((x) => x.l.mojip.length);

  console.log(`\n${file.split('/').pop()}  일반대 지원 ${general.length}건`
    + ` (전문대·특수대 ${apps.length - general.length}건은 College 소관)`);
  console.log(`  대학 연결   ${okUniv.length}/${general.length}  ${pct(okUniv.length, general.length)}`);
  console.log(`  학과까지    exact ${exact.length} · loose ${loose.length}`
    + `  → ${pct(exact.length + loose.length, general.length)}`);
  console.log(`  모집요강    ${withMojip.length}/${general.length}  ${pct(withMojip.length, general.length)}`);

  const reasons = new Map();
  for (const x of dead) {
    const kind = x.l.why.includes('찾지 못했습니다') ? '대학 미연결' : '학과 미연결';
    reasons.set(kind, (reasons.get(kind) || 0) + 1);
  }
  console.log(`  미연결 ${dead.length}건 — ${[...reasons].map(([k, v]) => `${k} ${v}`).join(' · ') || '없음'}`);

  const deadDepts = [...new Set(dead.map((x) => `${x.a.univ.replace(/\(.*/, '')} ${x.a.dept}`))];
  if (deadDepts.length) {
    console.log(`  미연결 학과 ${deadDepts.length}종 (앞 8개):`);
    for (const d of deadDepts.slice(0, 8)) console.log(`     ${d}`);
  }
  const umbrella = general.filter((a) => isUmbrella(a.dept));
  console.log(`  통합·자유전공 ${umbrella.length}건`
    + ` (그중 입결 직접 연결 ${umbrella.filter((a) => link(a, src).confidence === 'exact').length}건)`);

  if (co) {
    const col = apps.filter((a) => a.univType === '전문대');
    const okCol = col.filter((a) => link(a, src).confidence !== 'none');
    console.log(`  전문대 ${okCol.length}/${col.length}  ${pct(okCol.length, col.length)}`);
    for (const a of col) {
      const l = link(a, src);
      if (l.confidence === 'none') console.log(`     ✗ ${a.univ} ${a.dept} — ${l.why}`);
    }
  }
}

console.log(fails ? `\n${fails}건 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
