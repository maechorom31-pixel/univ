/**
 * 지원 결과 통계 (P7)
 * =====================================================================
 * 보내주신 「수시 진학 분석 리포트」의 항목이 이 파일의 명세다. 손으로 세던 것을
 * 즐겨찾기의 결과 칸에서 뽑는다.
 *
 * 결과 칸의 값은 대교협이 주는 대로라 표기가 해마다 조금씩 다르다. 그래서
 * **아는 말만 골라 세고, 모르는 값은 버리지 않고 돌려준다**(`unknown`).
 * 화면이 그걸 보여 주어야 숫자가 왜 안 맞는지 알 수 있다.
 *
 * 여기 있는 함수는 전부 순수 함수다 — 같은 입력에 같은 값을 낸다.
 * board/stats.test.mjs 가 이 규칙을 지킨다.
 */

/* ── 결과 읽기 ────────────────────────────────────────────────────── */

const has = (v, ...words) => {
  const s = String(v || '');
  return words.some((w) => s.includes(w));
};

/**
 * 지원 한 건의 결과를 갈래로 나눈다.
 *
 * @return {{
 *   decided: boolean,      결과가 나왔는가
 *   passed: ?boolean,      최종 합격인가 (모르면 null)
 *   extra: boolean,        충원(추가) 합격인가
 *   stage1Out: boolean,    1단계에서 떨어졌는가
 *   minFail: boolean,      수능최저 미충족으로 떨어졌는가
 *   enrolled: boolean,     등록했는가
 *   raw: string            알아보지 못한 원문 (빈 문자열이면 알아본 것)
 * }}
 */
export function verdict(app) {
  const r = (app && app.result) || {};
  const final = String(r.final || '').trim();
  const stage1 = String(r.stage1 || '').trim();
  const reason = String(r.reason || '').trim();

  const out = {
    decided: false, passed: null, extra: false,
    stage1Out: false, minFail: false, enrolled: false, raw: '',
  };

  // 1단계는 최종과 따로 본다. 종합에서 서류로 떨어지는 것이 별개의 관문이라서다.
  if (has(stage1, '불합격', '탈락')) out.stage1Out = true;

  /*
   * **「미등록」은 「등록」을 품고 있다.** 글자로만 보면 안 간 학생이 등록한 것으로 센다.
   * 아닌 것을 먼저 걸러 낸 뒤에 맞는 것을 본다.
   */
  out.enrolled = !has(r.enrolled, '미등록', '포기', '취소', '안 함', '안함', 'N')
    && has(r.enrolled, '등록', 'Y', '예');
  out.minFail = has(reason, '최저');

  /*
   * 최종 칸에 **1단계 이야기가 적혀 있으면 최종이 아니다.**
   * 「1단계 합격」이 그대로 들어오면 아래에서 「합격」이라는 글자를 보고 최종 합격으로
   * 센다. 11월에 1단계 발표만 난 건들이 보고서에 최종 합격으로 부풀려 들어간다.
   * 화면(student.js CHOICE)이 이제 안 그렇게 보내지만, 즐겨찾기가 직접 이렇게 적어
   * 두거나 예전에 저장된 값이 남아 있을 수 있어 여기서도 막는다.
   */
  if (/1\s*단계|일단계/.test(final)) {
    if (has(final, '불합격', '탈락', '미선발')) { out.stage1Out = true; out.decided = true; out.passed = false; }
    return out;
  }

  if (!final) {
    // 최종이 비어도 1단계 탈락은 이미 결정된 결과다
    if (out.stage1Out) { out.decided = true; out.passed = false; }
    return out;
  }

  if (has(final, '불합격', '탈락', '미선발')) {
    out.decided = true; out.passed = false;
    return out;
  }
  if (has(final, '합격', '충원', '추가', '선발')) {
    out.decided = true; out.passed = true;
    out.extra = has(final, '충원', '추가') || Boolean(String(r.waitNo || '').trim());
    return out;
  }
  if (has(final, '미등록', '포기', '취소')) {
    out.decided = true; out.passed = null;
    out.raw = final;
    return out;
  }
  out.raw = final;                 // 아는 말이 하나도 없다 — 감추지 않고 남긴다
  return out;
}

/** 전형 갈래. 입결 카테고리와 같은 말을 쓴다. */
export function typeOf(app) {
  const t = `${(app && app.typeCat) || ''} ${(app && app.typeSub) || ''}`;
  if (t.includes('논술')) return '논술';
  if (/실기|실적|특기/.test(t)) return '실기';
  if (t.includes('교과')) return '교과';
  if (t.includes('종합')) return '종합';
  return '기타';
}

/** 이 학생의 기준 등급 — 전교과. 없으면 null. */
export function gradeOf(student) {
  const n = (student && student.naesin) || {};
  const v = n['전교과'] ?? n['전교과(100)'];
  return v == null || v === '' ? null : Number(v);
}

/* ── 셈 ──────────────────────────────────────────────────────────── */

const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const pct = (a, b) => (b ? (a / b) * 100 : null);

/** 캠퍼스 괄호를 뗀 대학명. 통계에서는 캠퍼스를 나누지 않는다. */
export const univKey = (name) => String(name || '').replace(/\s*[-–—]\s*.*$/, '').trim();

/**
 * 전체 요약. 리포트 첫 표.
 * @param {Array} rows [{app, student}]
 */
export function overall(rows) {
  const decided = rows.filter((r) => verdict(r.app).decided);
  const passes = rows.filter((r) => verdict(r.app).passed === true);
  const extra = passes.filter((r) => verdict(r.app).extra);
  const first = passes.filter((r) => !verdict(r.app).extra);
  const enrolled = rows.filter((r) => verdict(r.app).enrolled);

  const people = new Set(rows.map((r) => r.app.hak));
  const passPeople = new Set(passes.map((r) => r.app.hak));
  const unknown = rows.filter((r) => verdict(r.app).raw)
    .map((r) => verdict(r.app).raw);

  return {
    applied: rows.length,
    students: people.size,
    univs: new Set(rows.map((r) => univKey(r.app.univ))).size,
    decided: decided.length,
    first: first.length,
    extra: extra.length,
    passed: passes.length,
    passPeople: passPeople.size,
    perPerson: passPeople.size ? passes.length / passPeople.size : null,
    enrolled: new Set(enrolled.map((r) => r.app.hak)).size,
    firstShare: pct(first.length, passes.length),
    extraShare: pct(extra.length, passes.length),
    unknown: [...new Set(unknown)],
  };
}

/**
 * 대학별 · 전형별 표. 리포트의 「주요 대학별 합격 커트라인」.
 *
 * 「커트」는 합격자 중 **가장 낮은 등급**이다. 숫자가 클수록 낮은 성적이므로
 * 최댓값이 커트가 된다. 「최고」는 최솟값이다. 여기서 뒤집으면 표 전체가 뒤집힌다.
 */
export function byUniv(rows, limit) {
  const map = new Map();
  for (const r of rows) {
    const u = univKey(r.app.univ);
    if (!map.has(u)) map.set(u, []);
    map.get(u).push(r);
  }

  const out = [];
  for (const [univ, list] of map) {
    const types = new Map();
    for (const r of list) {
      const t = typeOf(r.app);
      if (!types.has(t)) types.set(t, []);
      types.get(t).push(r);
    }
    const byType = [];
    for (const [type, sub] of types) {
      const won = sub.filter((r) => verdict(r.app).passed === true);
      const g = won.map((r) => gradeOf(r.student)).filter((x) => x != null);
      byType.push({
        type, applied: sub.length, passed: won.length,
        rate: pct(won.length, sub.length),
        avg: mean(g),
        best: g.length ? Math.min(...g) : null,
        cut: g.length ? Math.max(...g) : null,
        depts: won
          .map((r) => ({ dept: r.app.dept, grade: gradeOf(r.student) }))
          .filter((d) => d.grade != null)
          .sort((a, b) => a.grade - b.grade),
      });
    }
    byType.sort((a, b) => b.applied - a.applied);
    const won = list.filter((r) => verdict(r.app).passed === true);
    out.push({
      univ, applied: list.length, passed: won.length,
      rate: pct(won.length, list.length),
      byType,
    });
  }
  out.sort((a, b) => b.applied - a.applied || a.univ.localeCompare(b.univ, 'ko'));
  return limit ? out.slice(0, limit) : out;
}

/**
 * 같은 대학 안에서 교과와 종합을 견준다.
 *
 * 전체 평균으로 견주면 「종합이 더 높은 성적을 요구한다」는 잘못된 결론이 나온다.
 * 종합으로 상위권에 더 많이 넣기 때문이다. **같은 대학 안에서만** 견주어야 한다.
 * 리포트에도 그렇게 적혀 있다.
 *
 * @param {number} least 한 전형에 최소 몇 건이 있어야 견주는가
 */
export function gyoVsJong(rows, least = 3) {
  const out = [];
  for (const u of byUniv(rows)) {
    const g = u.byType.find((t) => t.type === '교과');
    const j = u.byType.find((t) => t.type === '종합');
    if (!g || !j || g.avg == null || j.avg == null) continue;
    if (g.passed < least || j.passed < least) continue;
    out.push({
      univ: u.univ,
      gyoAvg: g.avg, jongAvg: j.avg, gap: j.avg - g.avg,
      // 등급은 작을수록 좋다. 종합 평균이 더 크면(=낮은 성적으로도 붙었으면) 종합이 유리하다.
      better: j.avg > g.avg ? '종합' : '교과',
      gyoRate: g.rate, jongRate: j.rate,
      gyoApplied: g.applied, jongApplied: j.applied,
    });
  }
  out.sort((a, b) => (b.gyoApplied + b.jongApplied) - (a.gyoApplied + a.jongApplied));
  return out;
}

/** 전형 갈래별 셈. 합격률·충원율·1단계 탈락. */
export function byType(rows) {
  const map = new Map();
  for (const r of rows) {
    const t = typeOf(r.app);
    if (!map.has(t)) map.set(t, []);
    map.get(t).push(r);
  }
  const out = [];
  for (const [type, list] of map) {
    const won = list.filter((r) => verdict(r.app).passed === true);
    const extra = won.filter((r) => verdict(r.app).extra);
    const lost = list.filter((r) => verdict(r.app).passed === false);
    const s1 = lost.filter((r) => verdict(r.app).stage1Out);
    const firstAvg = mean(won.filter((r) => !verdict(r.app).extra)
      .map((r) => gradeOf(r.student)).filter((x) => x != null));
    const extraAvg = mean(extra.map((r) => gradeOf(r.student)).filter((x) => x != null));
    out.push({
      type, applied: list.length, passed: won.length,
      rate: pct(won.length, list.length),
      extra: extra.length,
      extraShare: pct(extra.length, won.length),
      stage1Out: s1.length,
      stage1Share: pct(s1.length, lost.length),
      firstAvg, extraAvg,
      // 충원합격자가 최초합격자보다 몇 등급 낮았나 (양수면 낮다)
      extraGap: firstAvg != null && extraAvg != null ? extraAvg - firstAvg : null,
    });
  }
  out.sort((a, b) => b.applied - a.applied);
  return out;
}

/** 수능최저 미충족으로 떨어진 건. 대학별로 모은다. */
export function minFails(rows) {
  const hit = rows.filter((r) => verdict(r.app).minFail);
  const map = new Map();
  for (const r of hit) {
    const u = univKey(r.app.univ);
    map.set(u, (map.get(u) || 0) + 1);
  }
  const worst = hit
    .map((r) => ({ univ: univKey(r.app.univ), dept: r.app.dept, grade: gradeOf(r.student) }))
    .filter((x) => x.grade != null)
    .sort((a, b) => a.grade - b.grade)[0] || null;
  return {
    count: hit.length,
    share: pct(hit.length, rows.length),
    byUniv: [...map].sort((a, b) => b[1] - a[1]).map(([univ, n]) => ({ univ, n })),
    worst,                          // 「1.14등급 학생도 최저 미충족」 같은 줄에 쓴다
  };
}

/**
 * 등급대별로 실제 어디에 붙었나.
 *
 * 리포트의 「등급대별 현실적 목표」를 손으로 적지 않고 **작년 우리 학교 결과에서**
 * 뽑는다. 남이 만든 배치표가 아니라 우리 아이들이 실제로 간 곳이라는 게 요점이다.
 */
/*
 * **한 칸을 0.5등급으로 잡는다.**
 *
 * 예전에는 맨 위가 1~2등급 한 칸이었다. 그런데 상담에서 1.2와 1.9는 갈 수 있는
 * 대학이 다르다. 한 칸에 묶어 놓으면 「1~2등급이면 여기 갔다」가 되어 아무한테도
 * 안 맞는 말이 된다. 0.5칸이면 1.0~1.5 · 1.5~2.0 으로 갈려 그 차이가 표에 남는다.
 *
 * 아래 끝은 6.0 에서 묶는다. 그 아래는 사람이 적어 0.5로 갈라 봐야 칸마다 한둘이라
 * 흐름이 안 읽힌다. 아무도 없는 칸은 마지막에 걷어 낸다.
 */
const BAND = 0.5;
const DEFAULT_BANDS = (() => {
  const out = [];
  for (let g = 1; g < 6; g += BAND) out.push([g, Number((g + BAND).toFixed(1))]);
  out.push([6, 10]);
  return out;
})();

export function byBand(rows, bands) {
  const cuts = bands || DEFAULT_BANDS;
  return cuts.map(([lo, hi]) => {
    const mine = rows.filter((r) => {
      const g = gradeOf(r.student);
      return g != null && g >= lo && g < hi && verdict(r.app).passed === true;
    });
    const map = new Map();
    for (const r of mine) {
      const u = univKey(r.app.univ);
      map.set(u, (map.get(u) || 0) + 1);
    }
    return {
      lo, hi,
      label: hi >= 10 ? `${lo.toFixed(1)} 아래` : `${lo.toFixed(1)} ~ ${hi.toFixed(1)}`,
      people: new Set(mine.map((r) => r.app.hak)).size,
      univs: [...map].sort((a, b) => b[1] - a[1]).map(([univ, n]) => ({ univ, n })),
    };
  }).filter((b) => b.univs.length);
}

/** 리포트 한 판. 화면과 인쇄가 같은 값을 본다. */
export function report(rows, opts = {}) {
  return {
    overall: overall(rows),
    byType: byType(rows),
    gyoVsJong: gyoVsJong(rows, opts.least || 3),
    minFails: minFails(rows),
    byUniv: byUniv(rows, opts.topUnivs || 8),
    byBand: byBand(rows),
  };
}
