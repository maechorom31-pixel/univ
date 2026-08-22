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
  splitDepts, catOf, realRate, referenceLine, similarity, candidates,
  normType, pickIpgyeol,
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

console.log('자유전공 — 묶이기 전 학과');
eq(splitDepts('국어국문학과, 철학과, 사학과'), ['국어국문학과', '철학과', '사학과'], '쉼표');
eq(splitDepts('기계공학부/전기전자공학부/항공우주공학과'),
  ['기계공학부', '전기전자공학부', '항공우주공학과'], '빗금');
eq(splitDepts('생명산업과학분야(농생명과학전공, 산림자원학전공)'), null,
  '괄호가 걸친 목록은 잘못 쪼개느니 버린다');
eq(splitDepts(''), null, '빈 값');

console.log('전형 카테고리 맞추기 (즐겨찾기 → 입결)');
eq(catOf('학생부위주(교과)'), '교과', '교과');
eq(catOf('학생부위주(종합)'), '종합', '종합');
eq(catOf('논술위주'), '논술', '논술');
eq(catOf('실기/실적위주'), '실기', '실기');
eq(catOf(''), null, '못 가리면 null — 아무 카테고리나 쓰지 않는다');

console.log('실질경쟁률');
eq(realRate(10, 10, 10).value, 5, '명목 10:1, 모집 10, 추합 10 → 5:1');
eq(realRate(10, 10, 0).value, 10, '추합이 없으면 명목 그대로');
eq(realRate(0.8, 10, 2).value, 0.8, '미달이면 명목값을 그대로');
eq(realRate(2, 10, 30).value, null, '모집+추합이 지원자보다 많으면 계산하지 않는다');
eq(realRate(null, 10, 5).value, null, '값이 없으면 null');

console.log('묶이기 전 선');
{
  // 키는 손으로 적지 않고 key() 로 만든다 — normDept 규칙이 바뀌면 시험도 따라간다
  const fake = { byKey: new Map([
    [key('A', '국어국문학과'), [
      { year: 2026, cat: '교과', g70: 4.0, rate: 5, quota: 10 },
      { year: 2026, cat: '종합', g70: 3.0, rate: 9, quota: 5 },
      { year: 2025, cat: '교과', g70: 9.9, rate: 1, quota: 10 }]],
    [key('A', '철학과'), [{ year: 2026, cat: '교과', g70: 5.0, rate: 3, quota: 6 }]],
  ]) };
  const line = referenceLine('A', ['국어국문학과', '철학과', '없는학과'], fake, '교과');
  eq(line.year, 2026, '가장 최근 해만 본다');
  eq(line.g70, { lo: 4, mid: 4.5, hi: 5, n: 2 }, '교과만 모은다 — 종합 3.0 은 섞이지 않는다');
  eq(line.missing, ['없는학과'], '못 찾은 학과를 감추지 않는다');
  eq(referenceLine('A', ['국어국문학과'], fake, '논술'), null,
    '그 카테고리가 없으면 빈손 — 잣대가 다른 값을 보여 주느니 낫다');
  eq(referenceLine('A', [], fake, '교과'), null, '목록이 비면 null');
}

console.log('닮은 학과 고르기 — 순서가 뒤집히면 안 된다');
{
  // 글자 차례가 바뀐 같은 학과가, 글자만 겹치는 다른 학과보다 위로 와야 한다
  const a = similarity('화공생명공학과', '생명화학공학과');
  const b = similarity('화공생명공학과', '생명과학과');
  eq(a > b, true, `생명화학공학과(${a.toFixed(2)}) > 생명과학과(${b.toFixed(2)})`);
  eq(similarity('간호학과', '간호학부'), 1, '접미만 다르면 같은 것');
  eq(similarity('간호학과', '기계공학과'), 0, '전혀 다르면 0');
  eq(similarity('', '간호학과'), 0, '빈 값');
}

console.log('후보 내놓기 — 고르지는 않는다');
{
  const fake = {
    index: buildUnivIndex(['가대']),
    byKey: new Map([
      [key('가대', '생명화학공학과'), [{ dept: '생명화학공학과', year: 2026 }]],
      [key('가대', '생명과학과'), [{ dept: '생명과학과', year: 2026 }, { dept: '생명과학과', year: 2025 }]],
      [key('가대', '기계공학과'), [{ dept: '기계공학과', year: 2026 }]],
    ]),
  };
  const app = { univType: '일반대', univ: '가대학교', dept: '화공생명공학과' };
  const got = candidates(app, { ipgyeol: fake, college: null }, 5);
  eq(got[0].dept, '생명화학공학과', '가장 닮은 것이 앞');
  eq(got.some((c) => c.dept === '기계공학과'), false, '안 닮은 것은 아예 내지 않는다');
  eq(got.find((c) => c.dept === '생명과학과').years, [2025, 2026], '자료가 있는 해를 함께');
  eq(candidates({ univType: '일반대', univ: '없는대학교', dept: 'x' },
    { ipgyeol: fake, college: null }), [], '대학을 못 찾으면 빈손');
}

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

/* ── 전형 이름 정규화와 전형 고르기 ─────────────────────────────── */
console.log('전형 이름 정규화');
{
  const same = (a, b, label) => eq(normType(a) === normType(b), true, label);
  const diff = (a, b, label) => eq(normType(a) === normType(b), false, label);
  same('교과(일반)', '교과(일반전형)', '꼬리 「전형」은 턴다');
  same('종합(고교생활Ⅰ)', '종합(고교Ⅰ)', '「생활」은 붙었다 떨어졌다 한다');
  same('교과(지역)', '교과(지역인재)', '「인재」도 마찬가지');
  same('종합(고교Ⅱ)', '종합(고교2)', '로마 숫자와 아라비아 숫자는 같은 것');
  same('학생부교과(일반전형)', '교과(일반)', '「학생부」는 「학생」보다 먼저 턴다');
  diff('종합(고교Ⅰ)', '종합(고교Ⅱ)', 'Ⅰ과 Ⅱ는 다른 전형이다');
  diff('교과(일반)', '종합(일반)', '교과와 종합은 절대 안 합친다');
  diff('교과(지역)', '교과(학교장추천)', '지역과 학교장추천도 다르다');
}

console.log('지원한 전형의 입결 줄 고르기');
{
  const r = (year, type, g70, cat) => ({ year, type, g70, cat: cat || (type.includes('종합') ? '종합' : '교과') });
  // 전남대 영어영문 꼴 — 연도순 마지막 줄을 집으면 교과 지원자에게 종합의 컷이 붙는다
  const rows = [
    r(2025, '교과(일반)', 3.05), r(2026, '교과(일반)', 3.20),
    r(2025, '교과(지역)', 3.74), r(2026, '교과(지역인재)', 3.33),
    r(2025, '종합(고교Ⅰ)', 3.65), r(2026, '종합(고교생활Ⅰ)', 3.58),
  ];
  const a = pickIpgyeol(rows, { typeSub: '교과(일반)', typeCat: '학생부위주(교과)' });
  eq(a.fit, 'exact', '이름이 같으면 exact');
  eq(a.rows.map((x) => x.g70), [3.05, 3.20], '그 전형의 줄만, 연도 오름차순');
  eq(a.type, '교과(일반)', '입결 쪽 이름을 돌려준다');

  const b = pickIpgyeol(rows, { typeSub: '교과(지역인재)', typeCat: '학생부위주(교과)' });
  eq(b.rows.map((x) => x.g70), [3.74, 3.33], '이름이 해마다 달라도 한 묶음');
  eq(b.type, '교과(지역인재)', '가장 최근 해의 표기를 쓴다');

  const c = pickIpgyeol(rows, { typeSub: '학생부교과(일반전형)', typeCat: '학생부위주(교과)' });
  eq(c.fit, 'exact', '즐겨찾기가 「학생부교과(일반전형)」이라 적어도 붙는다');

  // 「일반」은 「교과일반」에 감싸인다. 길이를 안 재면 둘이 비겨서 못 고른다.
  const loose = [r(2026, '일반', 4.0), r(2026, '교과(일반)', 3.2)];
  const d = pickIpgyeol(loose, { typeSub: '학생부교과(일반전형)', typeCat: '학생부위주(교과)' });
  eq(d.type, '교과(일반)', '겹치는 글자가 더 긴 쪽을 고른다');

  // 이름을 못 맞추고 같은 유형이 둘이면 **고르지 않는다**
  const amb = [r(2026, '교과(가야인재)', 3.9), r(2026, '교과(다른것)', 2.7)];
  const e = pickIpgyeol(amb, { typeSub: '교과(없는이름)', typeCat: '학생부위주(교과)' });
  eq(e.fit, 'none', '어느 줄인지 못 가리면 고르지 않는다');
  eq(e.rows, [], '옆 전형의 줄을 빌려 오지 않는다');
  eq(e.among, ['교과(가야인재)', '교과(다른것)'], '무엇들 사이에서 못 골랐는지는 말해 준다');

  // 유형이 하나뿐이면 그것으로
  const one = [r(2026, '교과(가야인재)', 3.9), r(2026, '종합(무언가)', 5.0)];
  const f = pickIpgyeol(one, { typeSub: '교과(없는이름)', typeCat: '학생부위주(교과)' });
  eq(f.fit, 'cat', '유형이 같은 묶음이 하나뿐이면 그것');
  eq(f.type, '교과(가야인재)', '교과 쪽');

  const g = pickIpgyeol([r(2026, '교과(일반)', 3.2)], { typeSub: '전혀다른것', typeCat: '' });
  eq(g.fit, 'only', '전형이 하나뿐이면 그것');
  eq(pickIpgyeol([], { typeSub: '교과(일반)' }).fit, 'none', '빈 목록');
}


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
