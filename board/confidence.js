/**
 * 이 숫자를 얼마나 믿을 수 있나
 * =====================================================================
 * 먼저 못 하는 것부터 적는다.
 *
 * **유의검정(p값·신뢰구간)은 이 자료로 할 수 없다.** 입결은 대학이 공개한 요약값이다 —
 * 70%컷 하나, 50%컷 하나, 경쟁률 하나. 합격자 개개인의 점수가 없다. 개별 값이 없으면
 * 분산을 모르고, 분산을 모르면 검정도 신뢰구간도 만들 수 없다.
 * 그런데도 p값을 적으면 그건 계산이 아니라 지어내기다.
 *
 * 대신 **정말로 셀 수 있는 것** 넷을 낸다.
 *
 *   1. 해마다 얼마나 움직였나   같은 전형의 3~5년치 70%컷을 견준다
 *   2. 몇 명을 뽑는 전형인가    모집 5명이면 70%컷은 사실상 서너 번째 한 사람의 점수다
 *   3. 어느 쪽으로 가고 있나    3년 이상이면 기울기. 뚜렷하지 않으면 뚜렷하지 않다고 적는다
 *   4. 내 점수는 어디쯤인가     50%컷과 70%컷 **사이일 때만** 위치를 말한다
 *
 * 넷을 묶어 한 줄로 「이 컷을 얼마나 믿을 수 있나」를 낸다.
 *
 * 여기 있는 함수는 전부 순수 함수다. board/confidence.test.mjs 가 지킨다.
 */

/* ── 작은 셈 ────────────────────────────────────────────────────── */

const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/**
 * 표본표준편차 (n-1). 두 해뿐이면 내지 않는다 —
 * 점 두 개짜리 표준편차는 그냥 두 값의 차이를 √2 로 나눈 것이라 새로 아는 게 없다.
 */
function sd(v) {
  if (v.length < 3) return null;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
}

/** 최소제곱 기울기와 결정계수. 점이 셋 미만이면 내지 않는다. */
function fit(xs, ys) {
  if (xs.length < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  if (!sxx) return null;
  const slope = sxy / sxx;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const pred = my + slope * (xs[i] - mx);
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  return { slope, r2: ssTot ? 1 - ssRes / ssTot : null };
}

/* ── 1·3. 해마다 얼마나 움직였나 ────────────────────────────────── */

/**
 * 같은 전형의 연도별 70%컷을 견준다.
 *
 * `rows` 는 store.summary(app).rows — 같은 학과의 입결 행들이다. 전형이 섞여 있을 수
 * 있어서 `type` 이 주어지면 그것만 골라 본다. **섞어서 재면 전형 차이가 변동폭으로
 * 둔갑한다** — 교과와 종합의 컷은 애초에 다른 잣대다.
 *
 * @return {?{n, years, lo, hi, span, sd, latest, slope, r2, direction}}
 */
export function swing(rows, type) {
  if (!rows || !rows.length) return null;
  const pick = type
    ? rows.filter((r) => String(r.type || '') === String(type))
    : rows;
  const use = (pick.length >= 2 ? pick : rows)
    .filter((r) => r.g70 != null && r.year != null)
    .sort((a, b) => a.year - b.year);
  if (use.length < 2) return null;

  const ys = use.map((r) => r.g70);
  const xs = use.map((r) => r.year);
  const line = fit(xs, ys);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);

  let direction = null;
  if (line && line.r2 != null) {
    // R² 가 낮으면 방향을 말하지 않는다. 세 점이 들쭉날쭉한 것을 추세라 부르면 안 된다.
    //
    // 문턱은 해마다 0.1등급. 그보다 작은 기울기는 자료의 잔물결이지 흐름이 아니다.
    // 3.10 → 3.15 → 3.20 을 「해마다 0.05씩 내려가는 흐름」이라 적으면,
    // 상담에서 없는 이야기를 하게 된다.
    if (line.r2 < 0.5) direction = 'unclear';
    else if (line.slope > 0.1) direction = 'easier';   // 등급 숫자가 커짐 = 낮은 성적으로도 붙음
    else if (line.slope < -0.1) direction = 'harder';
    else direction = 'flat';
  }

  return {
    n: use.length,
    years: xs,
    lo, hi, span: hi - lo,
    sd: sd(ys),
    latest: ys[ys.length - 1],
    slope: line ? line.slope : null,
    r2: line ? line.r2 : null,
    direction,
  };
}

/* ── 문턱 ───────────────────────────────────────────────────────
 * 문턱은 짐작이 아니라 **자료를 재서** 잡았다.
 * data/ipgyeol.json 의 (대학·학과·전형) 13,948 조합에서 잰 값이다.
 *
 *   움직인 폭   25% 0.28 · 중앙 0.54 · 75% 0.98 · 90% 1.49 · 95% 1.89
 *   모집인원    5명 이하 32% · 10명 이하 62% · 15명 이하 76%
 *
 * 처음에 폭 0.5 를 「흔들림」으로 잡았더니 절반이 걸렸고, 모집 15명 이하를 경고로
 * 띄웠더니 넷 중 셋이 걸렸다. **흔한 것을 경고하면 경고가 사라진다.**
 * 그래서 상위 10% 언저리만 짚는다.
 */
const SWING_HIGH = 1.5;      // 상위 10%
const SWING_MID = 1.0;       // 상위 24%
const QUOTA_TINY = 3;        // 이 아래는 컷이 한 사람에 좌우된다

/* ── 2. 몇 명을 뽑는 전형인가 ───────────────────────────────────── */

/**
 * 모집인원으로 본 흔들림.
 *
 * 70%컷은 합격자를 성적순으로 세웠을 때 위에서 70% 지점에 선 사람의 점수다.
 * 모집 5명이면 그 자리는 3~4번째, **사실상 한 사람의 점수**다. 그 한 명이 올해 다른
 * 학교에 가면 컷이 통째로 움직인다. 모집 100명이면 그런 일이 안 생긴다.
 *
 * 자료의 3분의 1이 모집 5명 이하다. 이 경고가 없으면 상담에서 매년 같은 사고가 난다.
 *
 * @return {?{quota, at, level, text}}  level: 'thin' | 'small' | 'ok'
 */
export function thinness(quota) {
  if (quota == null || !(quota > 0)) return null;
  const at = Math.max(1, Math.round(quota * 0.7));

  // 「모집 N명이면 70%컷은 대략 M번째 사람」은 크든 작든 알아 둘 값이라 늘 낸다.
  // 다만 **경고**는 아주 적을 때만 한다 — 모집 10명 이하가 전체의 62%다.
  const note = `${quota}명을 뽑으니 70%컷은 합격자를 줄 세웠을 때 대략 ${at}번째 사람의 점수입니다.`;
  if (quota <= QUOTA_TINY) {
    return {
      quota, at, level: 'thin', note,
      text: `${quota}명만 뽑는 전형이라 70%컷이 사실상 ${at}번째 한 사람의 점수입니다.`
        + ' 그 한 명이 바뀌면 컷도 통째로 움직입니다.',
    };
  }
  return { quota, at, level: 'ok', note, text: '' };
}

/* ── 4. 내 점수는 어디쯤인가 ────────────────────────────────────── */

/**
 * 50%컷과 70%컷 사이에서 내 위치를 어림한다.
 *
 * **두 컷 사이일 때만** 말한다. 밖이면 「밖」이라고만 적고 숫자를 만들지 않는다 —
 * 두 점으로 바깥을 늘려 재는 건 자료가 하지 않은 말이다.
 *
 * 등급은 작을수록 좋다. 그래서 cut50 < cut70 이 정상이고, 뒤집혀 있으면 자료가
 * 이상한 것이라 계산하지 않는다.
 *
 * @return {?{where, pct, text}}  where: 'above' | 'between' | 'below' | 'unknown'
 */
export function position(mine, cut50, cut70) {
  if (mine == null || cut50 == null || cut70 == null) return null;
  if (!(cut50 < cut70)) {
    return { where: 'unknown', pct: null, text: '50%컷과 70%컷이 뒤집혀 있어 위치를 재지 않았습니다.' };
  }
  if (mine <= cut50) {
    return { where: 'above', pct: null, text: '작년 합격자 기준 상위 절반 안쪽입니다.' };
  }
  if (mine > cut70) {
    return { where: 'below', pct: null, text: '작년 70%컷 밖입니다. 얼마나 밖인지는 이 자료로 알 수 없습니다.' };
  }
  const pct = 50 + ((mine - cut50) / (cut70 - cut50)) * 20;
  return {
    where: 'between', pct,
    text: `작년 합격자 기준 상위 ${Math.round(pct)}% 언저리입니다.`,
  };
}

/* ── 묶어서 한 줄 ───────────────────────────────────────────────── */

const LEVEL = {
  thin: { rank: 0, label: '많이 흔들림' },
  wobbly: { rank: 1, label: '흔들림' },
  fair: { rank: 2, label: '보통' },
  solid: { rank: 3, label: '안정적' },
};

/** 카드 꼬리표를 붙일 만한가. 「모른다」는 붙이지 않는다. */
export function worthFlagging(c) {
  return Boolean(c) && (c.level === 'thin' || c.level === 'wobbly');
}

/**
 * 「이 컷을 얼마나 믿을 수 있나」 한 줄.
 *
 * 점수를 매기지 않고 **까닭을 함께** 돌려준다. 「신뢰도 62점」 같은 숫자는 그 자체가
 * 근거 없는 값이라, 무엇 때문에 흔들리는지를 그대로 적는 편이 상담에서 쓸모 있다.
 *
 * @param {Object} s  store.summary(app) 의 결과
 * @param {?number} mine  내 환산 등급
 * @return {?{level, label, why:string[], swing, thin, spot}}
 */
export function confidence(s, mine) {
  if (!s || !s.linked) return null;

  const type = s.rows && s.rows.length ? s.rows[s.rows.length - 1].type : null;
  const sw = swing(s.rows, type);
  const th = thinness(s.quota != null ? s.quota : s.quotaNow);
  const spot = position(mine, s.cut50, s.cut);

  const why = [];
  let rank = 3;                                   // solid 에서 깎아 내려간다

  /*
   * 「흔들린다」와 「견줄 게 없다」는 다른 말이다.
   *
   * 자료의 58% 는 그 전형의 입결이 한 해치뿐이다. 그건 이 전형이 불안정하다는 뜻이
   * 아니라 **아직 모른다**는 뜻이다. 둘을 섞어 세면 절반 넘는 카드에 「흔들림」이
   * 붙고, 그러면 정말 흔들리는 16% 가 묻힌다.
   *
   * 그래서 `level` 은 **잰 흔들림**만 담고, 자료가 얼마나 있는지는 `evidence` 에 따로 둔다.
   * 카드 꼬리표는 `level` 만 보고, 상세는 둘 다 보여 준다.
   */
  let evidence = 'enough';
  if (!sw) {
    evidence = 'one-year';
  } else if (sw.n < 3) {
    evidence = 'two-years';
  }

  if (sw) {
    if (sw.span >= SWING_HIGH) {
      why.push(`최근 ${sw.n}년 사이 ${sw.lo.toFixed(2)}~${sw.hi.toFixed(2)} 로`
        + ` ${sw.span.toFixed(2)}등급 움직였습니다 — 전체 전형 중 많이 움직인 10% 안에 듭니다.`);
      rank = Math.min(rank, 0);
    } else if (sw.span >= SWING_MID) {
      why.push(`최근 ${sw.n}년 사이 ${sw.span.toFixed(2)}등급 움직였습니다`
        + ' — 전체 전형 중 위쪽 4분의 1에 듭니다.');
      rank = Math.min(rank, 1);
    }
    if (sw.direction === 'unclear') {
      why.push('오르내림이 들쭉날쭉해 방향을 말하기 어렵습니다.');
    }
  }

  const lack = evidence === 'one-year'
    ? '견줄 지난 해 자료가 한 해뿐이라 흔들리는지 아닌지 알 수 없습니다.'
    : (evidence === 'two-years'
      ? `두 해치(${sw.years.join('·')})만 있어 흔들림을 재기 어렵습니다.`
      : '');

  if (th && th.level === 'thin') {
    why.push(th.text);
    rank = Math.min(rank, 0);
  }

  // 흐름은 **못 믿을 까닭이 아니다.** 뚜렷한 흐름은 오히려 읽을거리라서 따로 낸다.
  let trend = '';
  if (sw && sw.direction === 'harder') {
    trend = `해마다 ${Math.abs(sw.slope).toFixed(2)}등급씩 올라가는 흐름입니다`
      + ` (최근 ${sw.n}년, 설명력 ${Math.round(sw.r2 * 100)}%).`;
  } else if (sw && sw.direction === 'easier') {
    trend = `해마다 ${Math.abs(sw.slope).toFixed(2)}등급씩 내려가는 흐름입니다`
      + ` (최근 ${sw.n}년, 설명력 ${Math.round(sw.r2 * 100)}%).`;
  } else if (sw && sw.direction === 'flat') {
    trend = `최근 ${sw.n}년 큰 변화 없이 비슷합니다.`;
  }

  const level = Object.keys(LEVEL).find((k) => LEVEL[k].rank === rank) || 'fair';

  // 흔들림을 못 쟀는데 「안정적」이라 적으면 안 된다. 안 흔들린 게 아니라 모르는 것이다.
  const label = (level === 'solid' || level === 'fair') && evidence === 'one-year'
    ? '알 수 없음'
    : LEVEL[level].label;

  return { level, label, evidence, lack, why, trend, swing: sw, thin: th, spot };
}
