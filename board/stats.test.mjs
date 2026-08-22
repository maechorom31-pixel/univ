/**
 * 지원 결과 통계 시험
 * =====================================================================
 *   node board/stats.test.mjs
 *
 * 여기 있는 이름은 전부 지어낸 것이다. 실제 학생 자료는 저장소에 넣지 않는다.
 *
 * 이 시험이 지키는 것은 셋이다.
 *   1. 결과 표기를 갈래로 제대로 나누는가 (충원·1단계 탈락·최저 미충족)
 *   2. 「커트」와 「최고」를 뒤집지 않는가 — 등급은 작을수록 좋다
 *   3. 모르는 표기를 조용히 버리지 않는가
 */
import {
  verdict, typeOf, gradeOf, univKey,
  overall, byUniv, byType, gyoVsJong, minFails, byBand,
} from './stats.js';

let fails = 0;
const eq = (got, want, label) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log(`  ✗ ${label}\n      받음 ${JSON.stringify(got)}\n      기대 ${JSON.stringify(want)}`);
    fails++;
  } else console.log(`  ✓ ${label}`);
};
const near = (got, want, label, tol = 0.005) => {
  if (got == null || Math.abs(got - want) > tol) {
    console.log(`  ✗ ${label}\n      받음 ${got}\n      기대 ${want}`);
    fails++;
  } else console.log(`  ✓ ${label}`);
};

/* ── 만들기 ──────────────────────────────────────────────────────── */

const S = (hak, grade) => ({ hak, name: `학생${hak}`, naesin: { 전교과: grade } });
const A = (hak, univ, dept, cat, result = {}) => ({
  app: {
    hak, univ, dept, typeCat: cat, typeSub: cat, univType: '일반대',
    result: { stage1: null, final: null, reason: null, waitNo: null, enrolled: null, ...result },
  },
});
/** 학생과 지원을 묶는다 */
const R = (students, apps) => apps.map((a) => ({
  ...a, student: students.find((s) => s.hak === a.app.hak),
}));

/* ── 결과 읽기 ───────────────────────────────────────────────────── */
console.log('결과 갈래');
eq(verdict(A('1', 'A', 'x', '교과', { final: '최초합격' }).app).passed, true, '최초합격');
eq(verdict(A('1', 'A', 'x', '교과', { final: '최초합격' }).app).extra, false, '최초합격은 충원이 아니다');
eq(verdict(A('1', 'A', 'x', '교과', { final: '충원합격' }).app).extra, true, '충원합격');
eq(verdict(A('1', 'A', 'x', '교과', { final: '합격', waitNo: '12' }).app).extra, true,
  '예비번호가 있으면 충원으로 본다');
eq(verdict(A('1', 'A', 'x', '교과', { final: '불합격' }).app).passed, false, '불합격');
eq(verdict(A('1', 'A', 'x', '종합', { stage1: '불합격' }).app).stage1Out, true, '1단계 탈락');
eq(verdict(A('1', 'A', 'x', '종합', { stage1: '불합격' }).app).decided, true,
  '최종이 비어도 1단계 탈락은 결정된 결과다');
eq(verdict(A('1', 'A', 'x', '교과', { final: '불합격', reason: '수능최저 미충족' }).app).minFail,
  true, '수능최저 미충족');
eq(verdict(A('1', 'A', 'x', '교과', {}).app).decided, false, '아직 결과가 없으면 세지 않는다');
eq(verdict(A('1', 'A', 'x', '교과', { final: '외계어' }).app).raw, '외계어',
  '모르는 표기는 버리지 않고 돌려준다');

console.log('전형 갈래');
eq(typeOf({ typeCat: '학생부위주(교과)' }), '교과', '교과');
eq(typeOf({ typeCat: '학생부위주(종합)' }), '종합', '종합');
eq(typeOf({ typeCat: '논술위주' }), '논술', '논술');
eq(typeOf({ typeCat: '' }), '기타', '못 가리면 기타');
eq(gradeOf({ naesin: { 전교과: 3.2 } }), 3.2, '전교과');
eq(gradeOf({ naesin: {} }), null, '없으면 null');
eq(univKey('한국외국어대학교(용인) - 글로벌캠퍼스'), '한국외국어대학교(용인)', '꼬리표를 뗀다');

/* ── 셈 ──────────────────────────────────────────────────────────── */
const students = [S('3101', 2.0), S('3102', 3.0), S('3103', 4.0), S('3104', 5.0)];
const rows = R(students, [
  A('3101', '가대', '경영', '학생부위주(교과)', { final: '최초합격', enrolled: '등록' }),
  A('3101', '가대', '경제', '학생부위주(종합)', { final: '불합격', stage1: '불합격' }),
  A('3102', '가대', '경영', '학생부위주(교과)', { final: '충원합격', waitNo: '5' }),
  A('3102', '가대', '행정', '학생부위주(종합)', { final: '최초합격' }),
  A('3103', '가대', '경영', '학생부위주(교과)', { final: '충원합격' }),
  A('3103', '가대', '사회', '학생부위주(종합)', { final: '최초합격' }),
  A('3104', '가대', '경영', '학생부위주(교과)', { final: '불합격', reason: '수능최저 미충족' }),
  A('3104', '나대', '간호', '학생부위주(교과)', { final: '최초합격' }),
]);

console.log('전체 요약');
const o = overall(rows);
eq(o.applied, 8, '총 지원 8건');
eq(o.students, 4, '학생 4명');
eq(o.univs, 2, '대학 2곳');
eq(o.first, 4, '최초합격 4건');
eq(o.extra, 2, '충원합격 2건');
eq(o.passed, 6, '총 합격 6건');
eq(o.passPeople, 4, '합격한 학생 4명');
near(o.perPerson, 1.5, '1인당 1.5건');
eq(o.enrolled, 1, '등록 1명');
eq(o.unknown, [], '모르는 표기 없음');

console.log('커트와 최고 — 등급은 작을수록 좋다');
const gadae = byUniv(rows).find((u) => u.univ === '가대');
const gyo = gadae.byType.find((t) => t.type === '교과');
eq(gyo.applied, 4, '가대 교과 4건 지원');
eq(gyo.passed, 3, '가대 교과 3건 합격');
eq(gyo.best, 2, '최고는 가장 작은 등급');
eq(gyo.cut, 4, '커트는 가장 큰 등급 — 뒤집으면 안 된다');
near(gyo.avg, 3, '평균 3.00');
eq(gyo.depts.map((d) => d.grade), [2, 3, 4], '합격 학과는 좋은 등급부터');

console.log('전형별');
const t = byType(rows);
const tg = t.find((x) => x.type === '교과');
const tj = t.find((x) => x.type === '종합');
eq(tg.passed, 4, '교과 4건 합격');
near(tg.rate, 80, '교과 합격률 80%');
eq(tg.extra, 2, '교과 충원 2건');
near(tg.extraShare, 50, '교과 합격의 절반이 충원');
eq(tj.stage1Out, 1, '종합 1단계 탈락 1건');
near(tj.stage1Share, 100, '종합 불합격은 전부 1단계 탈락');
// 최초합격 3101(2.0)·3104(5.0) 평균 3.5, 충원 3102(3.0)·3103(4.0) 평균 3.5
near(tg.extraGap, 0, '충원과 최초의 등급 차 0');

console.log('같은 대학 안에서 교과 대 종합');
const vs = gyoVsJong(rows, 1);
eq(vs.length, 1, '두 전형 모두 합격자가 있는 대학만');
eq(vs[0].univ, '가대', '가대');
near(vs[0].gyoAvg, 3, '교과 평균 3.00');
near(vs[0].jongAvg, 3.5, '종합 평균 3.50');
eq(vs[0].better, '종합', '종합 평균이 더 낮은 성적이면 종합이 유리');
eq(gyoVsJong(rows, 4).length, 0, '건수가 적으면 견주지 않는다');

console.log('수능최저 미충족');
const mf = minFails(rows);
eq(mf.count, 1, '1건');
eq(mf.byUniv, [{ univ: '가대', n: 1 }], '대학별');
eq(mf.worst.grade, 5, '가장 성적이 좋았던 학생');

console.log('등급대별로 실제 어디에 붙었나');
const b = byBand(rows);
// 2.0 인 3101 만 이 구간이다. 3.0 인 3102 는 [3,4) 로 간다.
eq(b.find((x) => x.lo === 2).univs, [{ univ: '가대', n: 1 }], '2~3등급대 — 경계는 아래를 포함');
eq(b.find((x) => x.lo === 3).univs, [{ univ: '가대', n: 2 }], '3~4등급대');
eq(b.find((x) => x.lo === 5).univs, [{ univ: '나대', n: 1 }], '5~6등급대');
eq(b.some((x) => x.lo === 6), false, '합격이 없는 구간은 내지 않는다');

console.log('1단계는 최종이 아니다');
{
  const V = (result) => verdict({ result });
  eq(V({ final: '1단계 합격' }).passed, null, '「1단계 합격」을 최종 합격으로 세지 않는다');
  eq(V({ final: '1단계 합격' }).decided, false, '아직 결정된 것이 아니다');
  eq(V({ final: '1단계 불합격' }).passed, false, '1단계 탈락은 결정된 결과다');
  eq(V({ final: '1단계 불합격' }).stage1Out, true, '1단계에서 떨어진 것으로 표시');
  eq(V({ stage1: '합격', final: '' }).passed, null, '1단계만 붙었으면 아직 모른다');
  eq(V({ stage1: '합격', final: '최초합격' }).passed, true, '최종이 나오면 그것으로');
}

console.log('「미등록」은 「등록」이 아니다');
{
  const V = (result) => verdict({ result });
  eq(V({ final: '최초합격', enrolled: '미등록' }).passed, true, '붙은 것은 붙은 것이다');
  eq(V({ final: '최초합격', enrolled: '미등록' }).enrolled, false, '다만 등록하지는 않았다');
  eq(V({ final: '최초합격', enrolled: '미등록' }).raw, '', '아는 값이라 경고하지 않는다');
  eq(V({ final: '최초합격', enrolled: '등록' }).enrolled, true, '등록');
  eq(V({ final: '최초합격', enrolled: '포기' }).enrolled, false, '포기');
  eq(V({ final: '최초합격', enrolled: '' }).enrolled, false, '비었으면 아니다');
}

console.log('모르는 표기를 감추지 않는다');
const odd = R([S('3105', 3.0)], [A('3105', '다대', 'x', '학생부위주(교과)', { final: '???' })]);
eq(overall(odd).unknown, ['???'], '원문 그대로 돌려준다');
eq(overall(odd).passed, 0, '모르는 값을 합격으로 세지 않는다');

console.log(fails ? `\n${fails}건 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
