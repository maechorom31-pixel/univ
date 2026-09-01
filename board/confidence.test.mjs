/**
 * 「얼마나 믿을 수 있나」 시험
 * =====================================================================
 *   node board/confidence.test.mjs
 *
 * 이 시험이 지키는 것
 *   1. 자료가 없으면 숫자를 만들지 않는다 (두 해뿐이면 표준편차 없음, 밖이면 위치 없음)
 *   2. 등급 방향을 뒤집지 않는다 — 등급은 작을수록 좋다
 *   3. 들쭉날쭉한 것을 추세라 부르지 않는다
 */
import { swing, thinness, position, confidence, worthFlagging,
  percentile, fitCurve, density, predictCut, stance, pctText } from './confidence.js';

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

const R = (year, g70, type = '교과', extra = {}) => ({ year, g70, type, ...extra });

/* ── 해마다 얼마나 움직였나 ─────────────────────────────────────── */
console.log('움직임');
{
  const s = swing([R(2024, 3.0), R(2025, 3.5), R(2026, 4.0)]);
  eq(s.n, 3, '세 해');
  near(s.span, 1.0, '범위 1.00');
  near(s.latest, 4.0, '가장 최근이 latest');
  near(s.slope, 0.5, '해마다 0.5씩');
  near(s.r2, 1, '완전한 직선이면 R²=1');
  eq(s.direction, 'easier', '등급 숫자가 커지면 낮은 성적으로도 붙는 흐름');
  eq(swing([R(2024, 3.10), R(2025, 3.15), R(2026, 3.20)]).direction, 'flat',
    '해마다 0.05는 흐름이 아니다 — 문턱은 0.1');
}
{
  const s = swing([R(2024, 4.0), R(2025, 3.5), R(2026, 3.0)]);
  eq(s.direction, 'harder', '등급 숫자가 작아지면 올라가는 흐름');
}
{
  // 들쭉날쭉 — 추세라 부르면 안 된다
  const s = swing([R(2023, 3.0), R(2024, 4.2), R(2025, 3.1), R(2026, 4.0)]);
  eq(s.direction, 'unclear', 'R²가 낮으면 방향을 말하지 않는다');
}
{
  const s = swing([R(2025, 3.0), R(2026, 3.4)]);
  eq(s.n, 2, '두 해도 범위는 낸다');
  near(s.span, 0.4, '범위 0.40');
  eq(s.sd, null, '두 해뿐이면 표준편차를 내지 않는다');
  eq(s.slope, null, '두 해뿐이면 기울기도 내지 않는다');
}
eq(swing([R(2026, 3.0)]), null, '한 해뿐이면 null');
eq(swing([R(2025, null), R(2026, null)]), null, '값이 없으면 null');
eq(swing([]), null, '빈 목록');
{
  // 전형이 섞여 있으면 그 전형만 골라 봐야 한다
  const rows = [R(2025, 3.0, '교과'), R(2026, 3.2, '교과'), R(2026, 5.5, '종합')];
  const s = swing(rows, '교과');
  near(s.span, 0.2, '전형을 가려 재면 0.20');
  const mixed = swing(rows);
  eq(mixed.span > 2, true, '섞어 재면 전형 차이가 변동폭으로 둔갑한다');
}

/* ── 몇 명을 뽑나 ───────────────────────────────────────────────── */
console.log('모집인원으로 본 흔들림');
eq(thinness(3).level, 'thin', '3명은 많이 흔들림');
eq(thinness(4).at, 3, '4명의 70% 지점은 3번째');
// 모집 10명 이하가 전체의 62%다. 흔한 것을 경고하면 경고가 사라진다.
eq(thinness(12).level, 'ok', '12명은 경고하지 않는다 — 그게 보통이다');
eq(thinness(40).level, 'ok', '40명은 괜찮음');
eq(thinness(40).text, '', '괜찮으면 경고하지 않는다');
eq(thinness(40).note.includes('28번째'), true, '다만 몇 번째 사람인지는 늘 알려 준다');
eq(thinness(null), null, '없으면 null');
eq(thinness(0), null, '0명은 null');

/* ── 내 위치 ────────────────────────────────────────────────────── */
console.log('내 위치 — 두 컷 사이일 때만');
eq(position(2.50, 2.64, 2.96).where, 'above', '50%컷보다 좋으면 상위 절반 안');
eq(position(3.20, 2.64, 2.96).where, 'below', '70%컷 밖');
eq(position(3.20, 2.64, 2.96).pct, null, '밖이면 숫자를 만들지 않는다');
{
  const p = position(2.80, 2.64, 2.96);
  eq(p.where, 'between', '두 컷 사이');
  near(p.pct, 60, '가운데면 60% — 50과 70의 중간');
}
near(position(2.96, 2.64, 2.96).pct, 70, '70%컷과 같으면 70%');
eq(position(2.8, 2.96, 2.64).where, 'unknown', '두 컷이 뒤집혀 있으면 재지 않는다');
eq(position(null, 2.64, 2.96), null, '내 점수가 없으면 null');
eq(position(2.8, null, 2.96), null, '컷이 없으면 null');

/* ── 묶어서 ─────────────────────────────────────────────────────── */
console.log('흐름은 못 믿을 까닭이 아니다');
{
  const rows = [R(2024, 3.0), R(2025, 3.5), R(2026, 4.0)];
  const s = { linked: true, quota: 40, cut: 4.0, cut50: 3.5, rows, mine: rows };
  const c = confidence(s, 3.8);
  eq(c.why.some((w) => w.includes('흐름')), false, '흐름은 why 에 넣지 않는다');
  eq(c.trend.includes('내려가는'), true, 'trend 에 따로 낸다');
  eq(c.trend.includes('설명력'), true, '설명력(R²)을 함께 적는다');
}

console.log('한 줄로 묶기');
{
  const rows = [R(2024, 3.10), R(2025, 3.15), R(2026, 3.20)];
  const s = { linked: true, quota: 40, cut: 3.20, cut50: 2.90, rows, mine: rows };
  const c = confidence(s, 3.05);
  eq(c.level, 'solid', '넉넉히 뽑고 안 흔들리면 안정적');
  eq(c.why, [], '깎을 까닭이 없으면 빈 목록');
  eq(c.trend.includes('비슷'), true, '해마다 0.05는 흐름이 아니라 잔물결');
  eq(c.spot.where, 'between', '내 위치도 함께');
}
{
  const rows = [R(2023, 2.50), R(2024, 2.80), R(2025, 4.30), R(2026, 4.00)];
  const s = { linked: true, quota: 3, cut: 4.00, cut50: 3.50, rows, mine: rows };
  const c = confidence(s, 3.80);
  eq(c.level, 'thin', '적게 뽑고 크게 흔들리면 많이 흔들림');
  eq(c.why.length >= 2, true, '까닭을 여럿 적는다');
  eq(c.why.some((w) => w.includes('3명')), true, '모집인원을 짚는다');
}
console.log('「흔들린다」와 「모른다」를 가른다');
{
  // 자료의 61% 가 한 해치뿐이다. 그건 불안정하다는 뜻이 아니라 아직 모른다는 뜻이다.
  const one = [R(2026, 3.0)];
  const c = confidence({ linked: true, quota: 30, cut: 3.0, rows: one, mine: one }, 3.0);
  eq(c.evidence, 'one-year', '견줄 해가 하나뿐');
  eq(c.level, 'solid', '못 쟀을 뿐이지 흔들린 것은 아니다');
  eq(c.label, '알 수 없음', '그런데 「안정적」이라 적으면 안 된다');
  eq(c.lack.includes('알 수 없습니다'), true, '까닭을 적는다');
  eq(c.why, [], '못 잰 것은 흔들림의 까닭이 아니다');
  eq(worthFlagging(c), false, '카드 꼬리표는 붙이지 않는다');
}
{
  const many = [R(2024, 3.0), R(2025, 4.4), R(2026, 4.5)];
  const c = confidence({
    linked: true, quota: 30, cut: 4.5, cut50: 4.0, rows: many, mine: many,
  }, 4.2);
  eq(worthFlagging(c), true, '정말 움직인 것에는 붙인다');
  eq(c.label, '많이 흔들림', '1.5등급 이상 움직임');
}
eq(confidence({ linked: false }, 3.0), null, '안 붙었으면 null');
// 학과 입결은 있는데 **지원한 전형**을 가려내지 못한 경우.
// 옆 전형의 변동폭을 빌려 오면 그럴듯하게 틀린다 — 아예 내지 않는다.
eq(confidence({
  linked: true, quota: 30, cut: 3.0,
  rows: [R(2026, 3.0, '교과'), R(2026, 4.4, '종합')], mine: [],
}, 3.0), null, '지원한 전형을 못 가려냈으면 null — 옆 전형 것을 빌리지 않는다');
eq(confidence(null, 3.0), null, '요약이 없으면 null');

/* ── 근사로 내는 것 — counsel.html 과 같은 식이어야 한다 ────────── */
console.log('합격자 분포에서 내 위치');
{
  const R2 = (year, g70, g50) => ({ year, g70, g50, type: '교과' });
  // μ=등급50 에 서면 상위 50%, 등급70 에 서면 상위 70%
  const rows = [R2(2025, 3.20, 3.00), R2(2026, 3.20, 3.00)];
  near(percentile(rows, 3.00).pct, 50, '50%컷과 같으면 50%');
  near(percentile(rows, 3.20).pct, 70, '70%컷과 같으면 70%', 0.5);
  eq(percentile(rows, 2.50).pct < 50, true, '더 좋은 등급이면 위쪽');
  eq(percentile(rows, 4.00).pct > 70, true, '더 낮은 등급이면 아래쪽');
  near(percentile(rows, 3.00).sd, (3.20 - 3.00) / 0.524, 'σ = (70컷−50컷) ÷ 0.524');

  // 두 컷이 붙어 있으면 σ 가 0 으로 가서 위치가 0/100 으로 튄다 — 눌러 둔다
  const tight = [R2(2026, 3.00, 2.99)];
  near(percentile(tight, 3.00).sd, 0.18, 'σ 아래 한계 0.18');
  const wide = [R2(2026, 5.00, 2.00)];
  near(percentile(wide, 3.00).sd, 1.5, 'σ 위 한계 1.5');

  // 50%컷이 없으면 전체 중앙값으로 때운다. 그렇다고 표시한다.
  const only70 = [R2(2026, 3.20, null)];
  eq(percentile(only70, 3.20).weak, true, '50%컷이 없으면 weak');
  near(percentile(only70, 3.20).sd, 0.38, '그때 σ 는 전체 중앙값 기반 0.38');

  eq(percentile([], 3.0), null, '자료가 없으면 null');
  eq(percentile(rows, null), null, '내 등급이 없으면 null');
  eq(percentile([R2(2026, null, null)], 3.0), null, '컷이 없으면 null');
  // 최근 두 해만
  eq(percentile([R2(2022, 9.0, 8.9), R2(2025, 3.2, 3.0), R2(2026, 3.2, 3.0)], 3.0).years,
    [2025, 2026], '오래된 해는 안 본다');
}

/* ── 곡선은 한 곳에서만 잡는다 ───────────────────────────────────
 * 학과 탐색의 분포 그림과 `percentile` 이 **같은 `fitCurve`** 를 본다.
 * 식이 두 군데 있으면 그림과 숫자가 조용히 어긋나고, 어긋나도 아무 데도 안 적힌다.
 */
console.log('분포 곡선 (fitCurve)');
{
  const R2 = (year, g70, g50) => ({ year, g70, g50, type: '교과' });
  const rows = [R2(2025, 3.20, 3.00), R2(2026, 3.20, 3.00)];
  const f = fitCurve(rows);
  near(f.mu, 3.00, 'μ 는 50%컷');
  near(f.sd, (3.20 - 3.00) / 0.524, 'σ = (70컷−50컷) ÷ 0.524');
  eq(f.clamped, false, '한계에 안 걸리면 clamped 는 false');
  near(f.cut50, 3.00, '잰 두 컷을 그대로 들고 나온다 (50)');
  near(f.cut70, 3.20, '잰 두 컷을 그대로 들고 나온다 (70)');

  // **폭이 자료가 아니라 한계값에서 왔으면 그렇다고 말해야 한다.**
  // 두 컷이 똑같이 적힌 줄이 12.1% 라 이 표시가 자주 켜진다.
  const same = fitCurve([R2(2026, 3.00, 3.00)]);
  near(same.sd, 0.18, '두 컷이 같으면 σ 는 하한 0.18');
  eq(same.clamped, true, '눌렀다고 표시한다');
  eq(fitCurve([R2(2026, 5.00, 2.00)]).clamped, true, '너무 벌어져도 눌렀다고 표시한다');
  eq(fitCurve([R2(2026, 3.20, null)]).weak, true, '50%컷이 없으면 weak');
  eq(fitCurve([R2(2026, 3.20, null)]).cut50, null, '없는 50%컷을 지어내지 않는다');
  eq(fitCurve([]), null, '자료가 없으면 null');

  // percentile 은 fitCurve 위에 Φ 하나만 얹은 것이다 — 둘이 같은 μ·σ 를 써야 한다
  const pc = percentile(rows, 3.10);
  near(pc.mu, f.mu, 'percentile 과 μ 가 같다');
  near(pc.sd, f.sd, 'percentile 과 σ 가 같다');

  // 그림 높이는 봉우리를 1 로 맞춘 밀도다. 넓이는 뜻이 없다.
  near(density(3.00, 3.00, 0.4), 1, '봉우리에서 1');
  eq(density(3.40, 3.00, 0.4) < 1, true, '봉우리에서 멀수록 낮다');
  near(density(2.60, 3.00, 0.4), density(3.40, 3.00, 0.4), '봉우리를 사이에 두고 대칭');
}

console.log('판정 — 출발점이지 결론이 아니다');
eq(stance(20).label, '안정', '40% 미만');
eq(stance(50).label, '적정', '40~75%');
eq(stance(80).label, '소신', '75~92%');
eq(stance(95).label, '상향', '92% 이상');
eq(stance(50, '높음').shaky, true, '변동이 크면 표시한다');
eq(stance(null), null, '위치를 못 내면 판정도 없다');
eq(pctText(97), '작년 합격선 밖으로 보입니다', '양 끝은 숫자로 읽히면 안 된다');
eq(pctText(3), '작년 합격자 가운데 위쪽입니다', '반대쪽도');

console.log('올해 컷 예측 — 점이 아니라 범위');
{
  const R2 = (year, g70) => ({ year, g70, g50: null, type: '교과' });
  eq(predictCut([R2(2026, 3.0)]), null, '한 해로는 다음 해를 말할 수 없다');
  const p = predictCut([R2(2024, 3.0), R2(2025, 3.1), R2(2026, 3.2)]);
  eq(p.lo < p.center && p.center < p.hi, true, '범위가 중심을 감싼다');
  eq(p.vola, '낮음', '거의 안 움직였으면 변동 낮음');
  eq(predictCut([R2(2024, 2.0), R2(2025, 4.5), R2(2026, 2.2)]).vola, '높음', '들쭉날쭉하면 높음');
  // 작년에 크게 뛰었으면 절반쯤 되돌린다
  const jump = predictCut([R2(2024, 3.0), R2(2025, 3.0), R2(2026, 4.2)]);
  eq(jump.rebound != null, true, '1.2등급 뛰었으면 반동을 본다');
  eq(jump.center < 4.2, true, '되돌리는 쪽으로 잡는다');
}

console.log(fails ? `\n${fails}건 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
