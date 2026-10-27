/**
 * 결과의 경우의 수(outcome.js) — 고른 것이 어느 칸에 무엇으로 들어가는지,
 * 그리고 그 줄을 통계(stats.verdict)가 맞게 세는지 못박는다.
 *
 *   node board/outcome.test.mjs
 */
import {
  isStaged, stepOf, finalChoices, finalOf, outcomeText, withChoice, examsOf,
} from './outcome.js';
import { verdict } from './stats.js';

let fail = 0;
const eq = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail += 1;
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) console.log(`      받음 ${JSON.stringify(got)}\n      기대 ${JSON.stringify(want)}`);
};
const V = (row) => verdict({ result: row });

console.log('지금 물을 것 (stepOf)');
eq(stepOf({}, true), 'stage1', '단계별 — 아무것도 없으면 1단계부터');
eq(stepOf({}, false), 'final', '일괄 — 곧장 최종');
eq(stepOf({ stage1: '합격' }, true), 'final', '1단계 합격 뒤에는 최종');
eq(stepOf({ stage1: '불합격' }, true), 'out', '1단계 불합격이면 더 물을 것 없음');
eq(stepOf({ final: '최초합격' }, true), 'final', '최종이 이미 있으면 최종 칸(1단계를 안 적었어도)');
eq(isStaged(2, ''), true, '2단계는 단계별');
eq(isStaged(2, '없음'), false, '선생님이 「면접 없음」이면 일괄');

console.log('미응시 갈래는 이 전형의 고사만큼');
eq(examsOf({ interview: true, cat: '종합' }), ['면접'], '면접 있는 종합 → 면접 미응시');
eq(examsOf({ interview: false, cat: '논술' }), ['논술'], '논술 → 논술 미응시');
eq(examsOf({ interview: false, cat: '교과' }), [], '면접 없는 교과 → 미응시 갈래 없음');
eq(finalChoices({ interview: true, cat: '종합' }).some((c) => c.value === '미응시:면접'), true, '선택지에 「면접 미응시」');

console.log('1단계를 지우지 않는다 — 최종을 적어도 남는다');
{
  let r = withChoice({}, 'stage1', '합격');
  eq(r.stage1, '합격', '1단계 합격');
  r = withChoice(r, 'final', '최초합격', { enrolled: '등록' });
  eq([r.stage1, r.final, r.enrolled], ['합격', '최초합격', '등록'], '최종을 적어도 1단계 합격이 남는다');
  eq(outcomeText(r), '1단계 합격 → 최초합격 → 등록', '한 줄로');
}

console.log('경우마다 적히는 말과 통계');
{
  const r1 = withChoice({ stage1: '합격' }, 'final', '미응시:면접');
  eq([r1.final, r1.reason], ['불합격', '면접 미응시'], '면접 미응시 → 불합격 + 사유');
  eq([V(r1).decided, V(r1).passed, V(r1).minFail], [true, false, false], '통계: 결정·불합격·최저 아님');
  eq(finalOf(r1), '미응시:면접', '되읽으면 같은 갈래');

  const r2 = withChoice({}, 'final', '최저');
  eq([r2.final, r2.reason], ['불합격', '수능최저 미충족'], '최저 미충족');
  eq(V(r2).minFail, true, '통계가 최저 미충족으로 센다');

  const r3 = withChoice({}, 'final', '예비', { waitNo: '12' });
  eq([r3.final, r3.waitNo], ['', '12'], '예비 — 최종은 비우고 번호만');
  eq(V(r3).decided, false, '통계: 아직 결정 아님');
  eq(finalOf(r3), '예비', '되읽으면 예비');
  eq(outcomeText(r3), '예비 12번 · 기다리는 중', '한 줄로');

  const r4 = withChoice(r3, 'final', '충원합격');
  eq([r4.final, r4.waitNo], ['충원합격', '12'], '예비에서 충원합격 — 번호는 그대로');
  eq([V(r4).passed, V(r4).extra], [true, true], '통계: 충원 합격');

  const r5 = withChoice(r3, 'final', '불합격');
  eq([r5.final, r5.waitNo], ['불합격', '12'], '예비에서 끝내 못 붙음 — 몇 번까지였는지 남긴다');

  const r6 = withChoice({ final: '최초합격', enrolled: '등록' }, 'final', '불합격');
  eq(r6.enrolled, '', '불합격으로 고치면 등록 표시는 지운다');

  const r7 = withChoice({ stage1: '합격', final: '최초합격', waitNo: '3' }, 'stage1', '불합격');
  eq([r7.stage1, r7.final, r7.waitNo], ['불합격', '', ''], '1단계 불합격으로 고치면 뒤 칸은 지운다');
  eq([V(r7).decided, V(r7).stage1Out], [true, true], '통계: 1단계 탈락');

  const r8 = withChoice({ final: '최초합격' }, 'final', '최초합격', { enrolled: '미등록' });
  eq(outcomeText(r8), '최초합격 → 등록 안 함', '붙었지만 등록 안 함');
  eq(V(r8).passed, true, '통계: 합격은 합격');
}

console.log('즐겨찾기가 준 모르는 말은 버리지 않는다');
eq(finalOf({ final: '합격' }), '최초합격', '「합격」은 최초합격 갈래');
eq(finalOf({ final: '추가합격' }), '충원합격', '「추가합격」은 충원');
eq(finalOf({ final: '보류' }), '보류', '모르는 말은 원문 그대로');

console.log(fail ? `\n${fail}개 실패` : '\n모두 통과');
process.exitCode = fail ? 1 : 0;
