/**
 * 경쟁률 변화 분석 — 2026 입결과 2027 최종 경쟁률을 맞대어 한 장짜리 보고서를 만든다
 * =====================================================================
 *   node scripts/ratio_report.mjs            →  경쟁률분석.html
 *
 * 잇는 잣대는 `board/ratio.js` 를 그대로 쓴다. 이름이 딱 맞거나, 앞부분이 같고
 * 후보가 하나일 때만 잇는다 — 카드에 경쟁률을 붙일 때와 같은 엄격함이다.
 *
 * **정원외·사회적배려 전형은 뺀다.** 기회균형·농어촌 같은 갈래는 대학마다 이름이
 * 제각각이라 잘못 이어지기 쉽고, 뽑는 성격도 일반전형과 달라 같은 자로 재면 안 된다.
 * 지역인재는 빼지 않는다 — 정상 전형이고 우리 학생이 많이 쓴다.
 *
 * 중앙값을 쓰는 것은 평균이 소수 모집 학과의 극단값에 끌려가기 때문이다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const m = await import(path.join(ROOT, 'board/ratio.js'));

const SPECIAL = /기회균형|고른기회|사회통합|사회배려|사회기여|배려대상|기초생활|기초수급|수급자|차상위|한부모|저소득|취약|자립|다자녀|조손|국가보훈|보훈|농어촌|특성화고|마이스터|재직자|만학|성인학습|평생학습|특수교육|장애|서해5도|다문화|북한이탈|탈북|정원\s*외|정원외/;
const isSpecial = (s) => SPECIAL.test(String(s || ''));

const ZONE = { '서울15': '서울 상위', 서울: '서울 그 외', 경기: '경기·인천', 인천: '경기·인천',
  충남: '충청', 충북: '충청', 대전: '충청', 광주전남: '호남', 전북: '호남',
  대구경북: '영남', 부산울산경남: '영남', 강원: '강원·제주', 제주: '강원·제주' };
const ZONES = ['서울 상위', '서울 그 외', '경기·인천', '충청', '호남', '영남', '강원·제주'];
const KINDS = ['학생부교과', '학생부종합', '논술', '실기'];

const med = (v) => {
  if (!v.length) return null;
  const s = v.slice().sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
const ch = (s) => s.map((x) => (x.r27 - x.r26) / x.r26);

/* ── 잇기 ───────────────────────────────────────────────────────── */

function pairs() {
  const cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ratio/board.json'), 'utf8'));
  const ip = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ipgyeol.json'), 'utf8'));
  const C = Object.fromEntries(ip.columns.map((c, i) => [c, i]));
  const exact = new Map(); const byUnit = new Map(); const dup = new Set();
  for (const r of ip.rows) {
    if (r[C['연도']] !== 2026) continue;
    const track = r[C['전형']];
    if (isSpecial(track) || isSpecial(r[C['카테고리']])) continue;
    const base = m.univBase(r[C['대학']]);
    const kind = m.kindOf(`${r[C['카테고리']]} ${track}`);
    const unit = m.normUnit(r[C['학과']]);
    const row = { region: r[C['지역']], track, norm: m.normTrack(track),
      quota: r[C['모집']], rate: r[C['경쟁률']], applied: r[C['지원']],
      cut: r[C['등급70']], gye: r[C['계열']] };
    const k = [base, kind, row.norm, unit].join('|');
    if (exact.has(k)) dup.add(k); else exact.set(k, row);
    const ku = [base, kind, unit].join('|');
    if (!byUnit.has(ku)) byUnit.set(ku, []);
    byUnit.get(ku).push(row);
  }
  for (const k of dup) exact.delete(k);

  const out = []; let live = 0; let dropped = 0;
  for (const u of cur.univs) {
    const base = m.univBase(u.u);
    for (const t of u.t) {
      if (isSpecial(t.n)) { dropped += t.r.length; continue; }
      const kind = t.k || m.kindOf(t.n); const tn = m.normTrack(t.n);
      for (const r of t.r) {
        const [dept, q, a, rate] = r;
        if (!q || a == null || rate == null) continue;
        // 전형 총계가 학과마다 퍼진 줄은 학과 값이 아니다
        if (Math.abs(rate - a / q) > 0.011) continue;
        live += 1;
        const unit = m.normUnit(dept);
        let p = exact.get([base, kind, tn, unit].join('|'));
        if (!p) {
          const cands = (byUnit.get([base, kind, unit].join('|')) || []).filter((x) =>
            x.norm.length >= 2 && tn.length >= 2
            && (x.norm.startsWith(tn) || tn.startsWith(x.norm)));
          if (cands.length === 1) [p] = cands;
        }
        if (!p || !p.quota || !p.rate) continue;
        out.push({ univ: u.u, base, region: p.region, zone: ZONE[p.region] || p.region,
          kind, track: t.n, dept, q27: q, a27: a, r27: rate,
          q26: p.quota, a26: p.applied, r26: p.rate, k26: p.cut, gye: p.gye });
      }
    }
  }
  return { rows: out, live, dropped };
}

/**
 * 세 해치 최종 경쟁률을 붙인다 — `data/ratio_hist.json` (이투스 시점별 자료).
 *
 * 입결 자료만으로는 「올해 얼마나 변했나」밖에 말할 수 없다. 그 학과가 평소
 * 얼마나 출렁이는 곳인지 알아야 올해 변화가 소식인지 늘 있던 일인지 가른다.
 * 잇는 잣대는 입결과 같다 — 이름이 딱 맞을 때만 잇고, 한 키에 둘이 걸리면 버린다.
 */
function histJoin(rows) {
  const f = path.join(ROOT, 'data/ratio_hist.json');
  if (!fs.existsSync(f)) return 0;
  const hs = JSON.parse(fs.readFileSync(f, 'utf8'));
  const key = (u, k, t, d) => [m.univBase(u), k, m.normTrack(t), m.normUnit(d)].join('|');
  const idx = new Map(); const dup = new Set();
  for (const r of hs.rows) {
    if (isSpecial(r.t)) continue;
    const k = key(r.u, r.k || m.kindOf(r.t), r.t, r.m);
    if (idx.has(k)) dup.add(k); else idx.set(k, r);
  }
  for (const k of dup) idx.delete(k);
  let hit = 0;
  for (const x of rows) {
    const h = idx.get(key(x.univ, x.kind, x.track, x.dept));
    if (!h || !h.y) continue;
    const v = ['24', '25', '26'].map((y) => (h.y[y] ? h.y[y][6] : null));
    if (v.some((t) => t == null)) continue;
    x.past = { 24: v[0], 25: v[1], 26: v[2] };
    // 평소 한 해 출렁임 — 두 번의 변화 가운데 큰 쪽
    x.swing = Math.max(Math.abs(v[1] - v[0]), Math.abs(v[2] - v[1]));
    hit += 1;
  }
  return hit;
}

const { rows: P, live, dropped } = pairs();
const HITS = histJoin(P);
console.log(`특별전형으로 뺀 2027 줄 ${dropped.toLocaleString()}`);
console.log(`남은 2027 줄 ${live.toLocaleString()} · 이어진 쌍 ${P.length.toLocaleString()} (${(P.length / live * 100).toFixed(1)}%) · 대학 ${new Set(P.map((x) => x.base)).size}곳`);
console.log(`세 해치 경쟁률을 붙인 쌍 ${HITS.toLocaleString()}`);
fs.writeFileSync(path.join(ROOT, 'scripts/.ratio_pairs.json'), JSON.stringify({ rows: P, live, dropped }));

/* ── 세기 ───────────────────────────────────────────────────────── */

/**
 * 한 묶음을 요약한다.
 *
 *   d  학과마다의 변화율을 모아 낸 **중앙값** — 「보통 학과가 어떻게 움직였나」.
 *   w  묶음 전체를 한 덩이로 합쳐 낸 **자리 가중 경쟁률**의 변화
 *      — (지원 합 ÷ 모집 합)을 두 해에 대해 내고 견준 것. 「이 묶음에 실제로
 *      얼마나 몰렸나」에 해당하며, 큰 학과가 그만큼 큰 무게를 갖는다.
 *
 * 단순평균은 쓰지 않는다. 한 명 뽑는 학과가 4.2 → 25.3이 되는 일이 흔해,
 * 평균은 그런 몇 자리에 통째로 끌려간다(어떤 대학에서는 중앙값 −11%와
 * 평균 +11%가 갈렸다). 중앙값과 자리 가중은 서로 다른 물음에 답하므로
 * 둘을 함께 적고, 어긋나면 그 어긋남 자체를 읽는다.
 */
const blk = (s) => {
  const sum = (f) => s.reduce((a, x) => a + (f(x) || 0), 0);
  const a26 = sum((x) => x.a26); const q26 = sum((x) => x.q26);
  const a27 = sum((x) => x.a27); const q27 = sum((x) => x.q27);
  const w26 = a26 && q26 ? a26 / q26 : null; const w27 = a27 && q27 ? a27 / q27 : null;
  return { n: s.length, r26: med(s.map((x) => x.r26)), r27: med(s.map((x) => x.r27)),
    d: med(ch(s)), up: s.length ? s.filter((x) => x.r27 > x.r26).length / s.length : null,
    q26, q27, w26, w27, w: w26 && w27 ? (w27 - w26) / w26 : null };
};

/** 우리 학생이 지원한 (대학, 학과). 이름·학번은 읽지 않는다. */
function wanted() {
  const f = path.join(ROOT, 'scripts/ratio_wanted.json');
  if (!fs.existsSync(f)) return { unit: new Map(), univ: new Map() };
  const w = JSON.parse(fs.readFileSync(f, 'utf8'));
  const unit = new Set(); const univ = new Map();
  for (const [u, d] of Object.entries(w.units || {})) {
    const b = m.univBase(u);
    for (const k of Object.keys(d)) unit.add(`${b}|${m.normUnit(k)}`);
  }
  for (const u of w.univs || []) {
    const b = m.univBase(u.u);
    univ.set(b, (univ.get(b) || 0) + u.n);
  }
  return { unit, univ };
}

const W = wanted();
const D = {
  live, dropped, univs: new Set(P.map((x) => x.base)).size,
  all: blk(P),
  kind: KINDS.map((k) => ({ k, ...blk(P.filter((x) => x.kind === k)) })),
  zone: ZONES.map((z) => ({ z, ...blk(P.filter((x) => x.zone === z)) })),
  matrix: ZONES.map((z) => ({ z, cells: ['학생부교과', '학생부종합', '논술'].map((k) => {
    const s = P.filter((x) => x.zone === z && x.kind === k);
    return { k, n: s.length, d: s.length >= 15 ? med(ch(s)) : null };
  }) })),
  size: [[1, 3, '1~3명'], [4, 7, '4~7명'], [8, 15, '8~15명'], [16, 30, '16~30명'], [31, 1e9, '31명 이상']]
    .map(([lo, hi, lab]) => ({ lab, ...blk(P.filter((x) => x.q27 >= lo && x.q27 <= hi)) })),
  quota: [['줄임', (x) => (x.q27 - x.q26) / x.q26 <= -0.10],
    ['비슷', (x) => Math.abs((x.q27 - x.q26) / x.q26) < 0.10],
    ['늘림', (x) => (x.q27 - x.q26) / x.q26 >= 0.10]].map(([lab, f]) => {
    const s = P.filter((x) => x.q26 && f(x));
    return { lab, ...blk(s), ad: med(s.filter((x) => x.a26).map((x) => (x.a27 - x.a26) / x.a26)) };
  }),
  mine: blk(P.filter((x) => W.unit.has(`${x.base}|${m.normUnit(x.dept)}`))),
  applied26: P.reduce((a, x) => a + (x.a26 || 0), 0),
  applied27: P.reduce((a, x) => a + x.a27, 0),
};
const MINE = P.filter((x) => W.unit.has(`${x.base}|${m.normUnit(x.dept)}`));
/* 대학별 표는 **우리 학생이 실제로 쓴 학과**만 센다.
 * 전에는 그 대학의 모든 학과를 셌는데, 「우리 학생이 쓴 대학」이라는 표
 * 이름과 어긋났다. 이를테면 전남대는 전체 155학과로는 −11.3%지만
 * 우리 학생이 쓴 61학과로는 −5.3%로, 방향은 같아도 폭이 절반이었다. */
D.byuniv = [...W.univ].sort((a, b) => b[1] - a[1])
  .map(([b, apps]) => ({ b, all: P.filter((x) => x.base === b),
    s: P.filter((x) => x.base === b && W.unit.has(`${b}|${m.normUnit(x.dept)}`)) }))
  .filter((x) => x.s.length >= 3)
  .slice(0, 22)
  .map((x) => ({ u: x.s[0].univ, apps: W.univ.get(x.b), all: x.all.length, ...blk(x.s) }));
{
  const big = P.filter((x) => x.q27 >= 10 && x.q26 >= 10
    && W.unit.has(`${x.base}|${m.normUnit(x.dept)}`))
    .sort((a, b) => (a.r27 - a.r26) / a.r26 - (b.r27 - b.r26) / b.r26);
  const pick = (x) => ({ u: x.univ, d: x.dept, t: x.track, r26: x.r26, r27: x.r27,
    q26: x.q26, q27: x.q27, c: (x.r27 - x.r26) / x.r26 });
  D.down = big.slice(0, 8).map(pick);
  D.up = big.slice(-8).reverse().map(pick);
}
/* ── 경쟁률과 합격선 ─────────────────────────────────────────────
 *
 * 앞 절까지는 경쟁률이 어떻게 움직였는지만 보았다. 정작 궁금한 것은 그
 * 움직임이 합격에 닿느냐다. 그래서 2022~2026 다섯 해 입결을 같은
 * (대학·전형유형·전형·학과)끼리 해마다 이어 붙여, 「경쟁률이 얼마나
 * 변했을 때 이듬해 합격선이 얼마나 움직였는가」를 센다.
 *
 * 합격선은 등급70(지원자 상위 70% 지점의 내신)을 쓴다. 등급은 숫자가
 * 작을수록 우수하므로, 이동값이 **음수면 합격선이 올라간(빡세진) 것**이다.
 * 이 부호는 읽는 사람이 뒤집어 생각하기 쉬워 표마다 다시 적어 둔다.
 */
function panel() {
  const ip = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ipgyeol.json'), 'utf8'));
  const C = Object.fromEntries(ip.columns.map((c, i) => [c, i]));
  const by = new Map();
  for (const r of ip.rows) {
    const track = r[C['전형']];
    if (isSpecial(track) || isSpecial(r[C['카테고리']])) continue;
    const k = [r[C['대학']], r[C['카테고리']], track, r[C['학과']]].join('|');
    if (!by.has(k)) by.set(k, new Map());
    by.get(k).set(r[C['연도']], r);
  }
  const out = [];
  for (const yy of by.values()) {
    for (const y of [2023, 2024, 2025, 2026]) {
      const a = yy.get(y - 1); const b = yy.get(y);
      if (!a || !b) continue;
      const c0 = a[C['경쟁률']]; const c1 = b[C['경쟁률']];
      const k0 = a[C['등급70']]; const k1 = b[C['등급70']];
      if (c0 == null || c1 == null || k0 == null || k1 == null || !c0) continue;
      const q0 = a[C['모집']]; const q1 = b[C['모집']];
      // 그 학과가 평소 한 해에 얼마나 출렁이는지 — 앞선 세 해의 경쟁률로 잰다.
      // 이것이 있어야 올해 변화가 소식인지 늘 있던 일인지 가를 수 있다.
      const back = [y - 3, y - 2, y - 1].map((t) => yy.get(t))
        .map((r) => (r ? r[C['경쟁률']] : null));
      const swing = back.every((v) => v != null)
        ? Math.max(Math.abs(back[1] - back[0]), Math.abs(back[2] - back[1])) : null;
      out.push({ y, cat: b[C['카테고리']], gye: b[C['계열']], q: q1,
        c0, c1, k0, k1, dc: (c1 - c0) / c0, dn: c1 - c0, dk: k1 - k0, swing,
        dq: q0 && q1 != null ? (q1 - q0) / q0 : null });
    }
  }
  return out;
}

const PAN = panel();

/** 사분위. 표에 산포를 함께 적기 위해 쓴다. */
const qt = (v, p) => {
  if (!v.length) return null;
  const s = v.slice().sort((a, b) => a - b);
  const i = (s.length - 1) * p; const lo = Math.floor(i);
  return lo + 1 >= s.length ? s[lo] : s[lo] + (s[lo + 1] - s[lo]) * (i - lo);
};
/** 스피어만 — 등급 이동이 고르지 않아 순위로 잰다. */
function spearman(rows, fx, fy) {
  const rk = (vals) => {
    const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    const r = new Array(vals.length); let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && vals[idx[j + 1]] === vals[idx[i]]) j += 1;
      const avg = (i + j) / 2 + 1;
      for (let t = i; t <= j; t += 1) r[idx[t]] = avg;
      i = j + 1;
    }
    return r;
  };
  const x = rk(rows.map(fx)); const y = rk(rows.map(fy));
  const n = x.length; const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0; let sx = 0; let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sx * sy);
}

/**
 * 경쟁률 변화를 **명**으로 끊는다. 경쟁률은 본디 「한 자리에 몇 명」이므로
 * 그 차이도 명이다. 백분율로 적으면 2.4 → 8.5 가 +250%로 부풀어 여섯 명
 * 늘었다는 사실이 가려진다. 백분율과 명 중 무엇이 합격선을 더 잘 잡아내는지
 * 재 보면 거의 같았으므로(아래 rho / rhoN), 읽히는 쪽을 쓴다.
 */
const CBIN = [[-9e9, -3, '3명 넘게 줄고', '−3명 아래'], [-3, -1, '1~3명 줄고', '−3~−1명'],
  [-1, -0.3, '0.3~1명 줄고', '−1~−0.3명'], [-0.3, 0.3, '거의 그대로', '±0.3명 안'],
  [0.3, 1, '0.3~1명 늘고', '+0.3~1명'], [1, 3, '1~3명 늘고', '+1~3명'],
  [3, 9e9, '3명 넘게 늘고', '+3명 위']];

/** 한 묶음을 요약한다. up = 합격선이 올라간(등급 숫자가 내려간) 비율. */
const hblk = (s) => ({ n: s.length, dk: med(s.map((x) => x.dk)),
  lo: qt(s.map((x) => x.dk), 0.25), hi: qt(s.map((x) => x.dk), 0.75),
  up: s.length ? s.filter((x) => x.dk < 0).length / s.length : null,
  dc: med(s.map((x) => x.dc)), dn: med(s.map((x) => x.dn)) });

const BIG = (x) => x.dn >= 3;   // 「한 자리에 세 명 넘게 더 몰렸다」
const FEW = (x) => x.dn < -3;

const H = {
  n: PAN.length,
  rho: spearman(PAN, (x) => x.dc, (x) => x.dk),    // 백분율 기준
  rhoN: spearman(PAN, (x) => x.dn, (x) => x.dk),   // 명 기준
  bins: CBIN.map(([lo, hi, lab]) => ({ lab, ...hblk(PAN.filter((x) => x.dn >= lo && x.dn < hi)) })),
  // 작년 합격선 수준별로 같은 자를 댄다 — 상위권과 중하위권은 다르게 움직인다
  level: [[0, 2, '1~2등급대'], [2, 3, '2~3등급대'], [3, 4, '3~4등급대'],
    [4, 5, '4~5등급대'], [5, 9.1, '5등급 아래']].map(([lo, hi, lab]) => {
    const s = PAN.filter((x) => x.k0 >= lo && x.k0 < hi);
    return { lab, n: s.length, up: hblk(s.filter(BIG)), down: hblk(s.filter(FEW)) };
  }),
  size: [[1, 4, '1~4명'], [5, 9, '5~9명'], [10, 19, '10~19명'], [20, 49, '20~49명'],
    [50, 9e9, '50명 위']].map(([lo, hi, lab]) => {
    const s = PAN.filter((x) => x.q != null && x.q >= lo && x.q <= hi);
    return { lab, ...hblk(s), big: hblk(s.filter(BIG)) };
  }),
  // 모집인원을 거의 건드리지 않은 학과만 따로 — 「모집을 줄여 경쟁률도 컷도
  // 같이 올랐을 뿐」이라는 딴 설명을 걷어내기 위한 대조군이다.
  same: (() => {
    const s = PAN.filter((x) => x.dq != null && Math.abs(x.dq) < 0.05);
    return { n: s.length, lo: hblk(s.filter(FEW)), hi: hblk(s.filter(BIG)) };
  })(),
  kind: ['교과', '종합', '논술'].map((k) => {
    const s = PAN.filter((x) => x.cat === k);
    return { lab: k, ...hblk(s), big: hblk(s.filter(BIG)) };
  }),
  /* 평소 출렁임 —— 이 절의 고갱이다.
   *
   * 경쟁률은 아무 일 없어도 해마다 몇 명씩 오르내린다. 그러니 「올랐다」는
   * 사실만으로는 소식이 못 된다. 앞선 세 해의 출렁임 폭과 견주어 그 범위를
   * 넘었을 때에만 신호로 친다. 아래 숫자가 그 가름이 값을 한다는 증거다. */
  sig: (() => {
    const s = PAN.filter((x) => x.swing != null);
    const upR = s.filter((x) => x.dn > 0); const dnR = s.filter((x) => x.dn < 0);
    return { n: s.length, swing: med(s.map((x) => x.swing)),
      upIn: hblk(upR.filter((x) => x.dn <= x.swing)),
      upOut: hblk(upR.filter((x) => x.dn > x.swing)),
      upFar: hblk(upR.filter((x) => x.dn > 2 * x.swing)),
      dnIn: hblk(dnR.filter((x) => -x.dn <= x.swing)),
      dnOut: hblk(dnR.filter((x) => -x.dn > x.swing)),
      // 같은 「세 명 넘게 늘었다」 안에서도 갈린다는 것을 보이는 대조
      bigIn: hblk(s.filter((x) => BIG(x) && x.dn <= x.swing)),
      bigOut: hblk(s.filter((x) => BIG(x) && x.dn > x.swing)) };
  })(),
};

/* 2027에 대보기 — 올해 경쟁률 변화를 위 구간표에 넣어 합격선이 어느 쪽으로
 * 기울지 센다. 낱낱의 학과를 맞히는 것이 아니라 판이 어느 쪽으로 쏠렸는지만
 * 말할 수 있다. 기울기는 작년 합격선 수준에 따라 다르므로 구간 하나로
 * 뭉뚱그리지 않고 그 학과가 앉아 있는 등급대의 값을 쓴다. */
{
  const LV = [[0, 2], [2, 3], [3, 4], [4, 5], [5, 9.1]];
  /** 작년 컷이 lv 등급대인 학과에서, 경쟁률이 dc만큼 변했을 때의 합격선 이동 중앙값. */
  const shiftOf = (dn, k26) => {
    const li = LV.findIndex(([lo, hi]) => k26 >= lo && k26 < hi);
    if (li < 0) return null;
    const s2 = PAN.filter((x) => x.k0 >= LV[li][0] && x.k0 < LV[li][1]
      && Math.abs(x.dn - dn) <= Math.max(0.8, Math.abs(dn) * 0.25));
    return s2.length >= 30 ? med(s2.map((x) => x.dk)) : null;
  };
  const dist = (s) => CBIN.map(([lo, hi, lab]) => {
    const v = s.filter((x) => x.r27 - x.r26 >= lo && x.r27 - x.r26 < hi);
    return { lab, n: v.length, share: s.length ? v.length / s.length : 0 };
  });
  const shifts = (s) => s.map((x) => (x.k26 == null ? null : shiftOf(x.r27 - x.r26, x.k26)))
    .filter((v) => v != null);
  const sa = shifts(P); const sm = shifts(MINE);
  H.p27 = { n: P.length, mineN: MINE.length,
    dist: dist(P), mineDist: dist(MINE),
    shift: med(sa), shiftN: sa.length, up: sa.filter((v) => v < 0).length / sa.length,
    mineShift: med(sm), mineShiftN: sm.length,
    mineUp: sm.length ? sm.filter((v) => v < 0).length / sm.length : null };
  /* 평소 출렁임을 아는 학과만 따로 센다 — 올해 변화가 그 범위 안인지 밖인지. */
  const known = (s) => s.filter((x) => x.swing != null);
  const outOf = (s) => known(s).filter((x) => Math.abs(x.r27 - x.r26) > x.swing);
  H.p27.swingN = known(P).length;
  H.p27.swing = med(known(P).map((x) => x.swing));
  H.p27.out = outOf(P).length / known(P).length;
  H.p27.outUp = outOf(P).filter((x) => x.r27 > x.r26).length;
  H.p27.outDn = outOf(P).filter((x) => x.r27 < x.r26).length;
  H.p27.mineSwingN = known(MINE).length;
  H.p27.mineOut = known(MINE).length ? outOf(MINE).length / known(MINE).length : null;

  /* 우리 학생이 쓴 곳 가운데 「평소보다 크게」 몰린 학과.
   * 그냥 많이 오른 곳이 아니라 그 학과 기준으로 유별난 곳을 고른다. */
  H.watch = MINE.filter((x) => x.k26 != null && x.swing != null && x.q27 >= 5
      && x.r27 - x.r26 > x.swing && x.r27 - x.r26 >= 1)
    .map((x) => ({ u: x.univ, d: x.dept, t: String(x.track).replace(/\s*[[【][^\]】]*[\]】]?/g, '').trim(),
      k26: x.k26, dn: x.r27 - x.r26, c: (x.r27 - x.r26) / x.r26,
      r26: x.r26, r27: x.r27, swing: x.swing, past: x.past,
      shift: shiftOf(x.r27 - x.r26, x.k26) }))
    .filter((x) => x.shift != null)
    .sort((a, b) => a.shift - b.shift || b.dn - a.dn)
    .slice(0, 12);
}

fs.writeFileSync(path.join(ROOT, 'scripts/.hap.json'), JSON.stringify(H, null, 1));
console.log(`합격선 패널 ${H.n.toLocaleString()}쌍 · 스피어만 ${H.rho.toFixed(3)} · 지켜볼 학과 ${H.watch.length}`);

fs.writeFileSync(path.join(ROOT, 'scripts/.ratio_data.json'), JSON.stringify(D));
console.log(`우리 학생이 쓴 학과 ${D.mine.n}쌍 · 대학 표 ${D.byuniv.length}곳`);

/* ── 그림 ───────────────────────────────────────────────────────── */

/**
 * 2027 수능 응시원서 접수 결과 (한국교육과정평가원 발표, 2026-09-08 보도).
 * 이 판의 크기가 어떻게 바뀌었는지는 우리 자료로는 알 수 없어 바깥 숫자를 들여온다.
 */
const SUNEUNG = {
  total: 551864,
  rows: [
    { k: '재학생 (고3)', now: 355391, was: 371897 },
    { k: '졸업생 (N수생)', now: 173706, was: 159922 },
  ],
  src: 'https://www.eduplusnews.com/news/articleView.html?idxno=20096',
};

/** 변화율 분포. -60%부터 +60%까지 10%p 칸으로 나눈다. */
function hist(rows) {
  const bins = [];
  for (let lo = -0.6; lo < 0.6; lo += 0.1) bins.push({ lo, hi: lo + 0.1, n: 0 });
  const under = { n: 0 }; const over = { n: 0 };
  for (const v of ch(rows)) {
    if (v < -0.6) { under.n += 1; continue; }
    if (v >= 0.6) { over.n += 1; continue; }
    bins[Math.min(bins.length - 1, Math.floor((v + 0.6) / 0.1))].n += 1;
  }
  return { bins, under, over, total: rows.length };
}

/**
 * 변화율 분포 그림 — 전체와 우리 학생이 쓴 학과를 나란히.
 *
 * 세로는 **비율**이다. 5,027쌍과 556쌍을 같은 자로 재려면 건수로는 안 된다.
 * 두 계열이라 범례를 두고, 중앙값 자리에 선을 그어 이름을 적는다 —
 * 색만으로 가리지 않게.
 */
function histSvg(a, b, medA, medB) {
  const W = 760; const H = 260; const L = 44; const R = 16; const T = 16; const B = 44;
  const ha = hist(a); const hb = hist(b);
  const n = ha.bins.length;
  const bw = (W - L - R) / n;
  const top = Math.max(...ha.bins.map((x) => x.n / ha.total), ...hb.bins.map((x) => x.n / hb.total));
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const x = (i) => L + i * bw;
  let g = '';
  for (const v of [0, top / 2, top]) {
    g += `<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" stroke="#E8E6E2"/>`
      + `<text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="ax">${(v * 100).toFixed(0)}%</text>`;
  }
  ha.bins.forEach((bin, i) => {
    const pa = bin.n / ha.total; const pb = hb.bins[i].n / hb.total;
    const w = bw / 2 - 2;
    g += `<rect x="${(x(i) + 1).toFixed(1)}" y="${y(pa).toFixed(1)}" width="${w.toFixed(1)}" height="${(y(0) - y(pa)).toFixed(1)}" fill="#F59E0B" rx="2">`
      + `<title>${(bin.lo * 100).toFixed(0)}~${(bin.hi * 100).toFixed(0)}% · 전체 ${(pa * 100).toFixed(1)}% (${bin.n}쌍)</title></rect>`
      + `<rect x="${(x(i) + bw / 2 + 1).toFixed(1)}" y="${y(pb).toFixed(1)}" width="${w.toFixed(1)}" height="${(y(0) - y(pb)).toFixed(1)}" fill="#B45309" rx="2">`
      + `<title>${(bin.lo * 100).toFixed(0)}~${(bin.hi * 100).toFixed(0)}% · 우리 ${(pb * 100).toFixed(1)}% (${hb.bins[i].n}쌍)</title></rect>`;
    if (i % 2 === 0) {
      // 「-0」이 되지 않게 0은 부호 없이 적는다
      const t = Math.round(bin.lo * 100);
      g += `<text x="${x(i).toFixed(1)}" y="${H - B + 18}" text-anchor="middle" class="ax">${t === 0 ? '0' : t}</text>`;
    }
  });
  /*
   * 중앙값 점선은 뺐다. 둘이 4%p 밖에 안 떨어져 있어 겹쳐 보이고, 겹친 선 하나가
   * 어느 쪽인지 알 수 없으면 없느니만 못하다. 두 중앙값은 그림 아래 글로 적는다.
   */
  g += `<line x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}" stroke="#A8A29A"/>`;
  g += `<text x="${W - R}" y="${H - 6}" text-anchor="end" class="ax">경쟁률 변화율(%)</text>`;
  return `<figure class="fig"><svg viewBox="0 0 ${W} ${H}" role="img" width="100%" height="auto" aria-label="경쟁률 변화율 분포. 전체와 우리 학교가 쓴 학과를 비교한 막대그림.">${g}</svg>`
    + `<figcaption><span class="key"><span class="sw" style="background:#F59E0B"></span>전체 ${n0(ha.total)}쌍</span>`
    + `<span class="key"><span class="sw" style="background:#B45309"></span>우리 학생이 쓴 학과 ${n0(hb.total)}쌍</span>`
    + ` · 세로축은 비율입니다. 점선은 각각의 중앙값(전체 ${pct(medA)} · 우리 ${pct(medB)}).</figcaption></figure>`;
}

/**
 * 모집인원 변화 구간별 경쟁률 변화 중앙값.
 *
 * 처음에는 산점도로 그렸다. 그런데 모집인원이 그대로인 3,653쌍이 0 자리에 세로로
 * 쌓여 흐름을 통째로 가렸고, 축 밖으로 나간 점을 가장자리에 붙이니 그쪽에도
 * 기둥이 섰다. 점을 5천 개 뿌린다고 관계가 보이는 것이 아니었다.
 *
 * 구간마다 중앙값 하나씩만 찍으면 기울기가 그대로 드러난다. 점 아래 쌍의 수를
 * 적어 어느 구간이 얇은지 함께 보이게 한다.
 */
function slopeSvg(rows) {
  // 위쪽 여백은 첫 점 위의 값 이름이 잘리지 않을 만큼 둔다
  const W = 760; const H = 296; const L = 52; const R = 20; const T = 32; const B = 54;
  const CUT = [[-1, -0.3, '−30%↓'], [-0.3, -0.15, '−30~15'], [-0.15, -0.05, '−15~5'],
    [-0.05, 0.05, '±5% 안'], [0.05, 0.15, '+5~15'], [0.15, 0.3, '+15~30'], [0.3, 9, '+30%↑']];
  const bins = CUT.map(([lo, hi, lab]) => {
    const s = rows.filter((x) => x.q26 && (x.q27 - x.q26) / x.q26 > lo && (x.q27 - x.q26) / x.q26 <= hi);
    return { lab, n: s.length, d: s.length ? med(ch(s)) : null };
  });
  const vals = bins.filter((b2) => b2.d != null).map((b2) => b2.d);
  const hi = Math.max(0.2, ...vals.map(Math.abs));
  const y = (v) => T + (1 - (v + hi) / (2 * hi)) * (H - T - B);
  const x = (i) => L + (i + 0.5) * ((W - L - R) / bins.length);
  let g = '';
  for (const v of [-hi, -hi / 2, 0, hi / 2, hi]) {
    g += `<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" stroke="${Math.abs(v) < 1e-9 ? '#A8A29A' : '#EFEDE9'}"/>`
      + `<text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="ax">${(v * 100).toFixed(0)}%</text>`;
  }
  const pts = bins.map((b2, i) => (b2.d == null ? null : [x(i), y(b2.d)])).filter(Boolean);
  g += `<polyline fill="none" stroke="#F59E0B" stroke-width="2" points="${pts.map((p2) => `${p2[0].toFixed(1)},${p2[1].toFixed(1)}`).join(' ')}"/>`;
  bins.forEach((b2, i) => {
    if (b2.d != null) {
      g += `<circle cx="${x(i).toFixed(1)}" cy="${y(b2.d).toFixed(1)}" r="5" fill="#B45309" stroke="#fff" stroke-width="2">`
        + `<title>${b2.lab} · 경쟁률 ${pct(b2.d)} · ${n0(b2.n)}쌍</title></circle>`
        + `<text x="${x(i).toFixed(1)}" y="${(y(b2.d) - 12).toFixed(1)}" text-anchor="middle" class="val">${pct(b2.d)}</text>`;
    }
    g += `<text x="${x(i).toFixed(1)}" y="${H - B + 18}" text-anchor="middle" class="ax">${b2.lab}</text>`
      + `<text x="${x(i).toFixed(1)}" y="${H - B + 33}" text-anchor="middle" class="ax">${n0(b2.n)}쌍</text>`;
  });
  // 가로축 이름은 그림 안에 두지 않는다 — 오른쪽 끝 칸 이름과 겹친다. 아래 글이 말한다.
  return `<figure class="fig"><svg viewBox="0 0 ${W} ${H}" role="img" width="100%" height="auto" aria-label="모집인원을 줄인 구간일수록 경쟁률 변화 중앙값이 높고, 늘린 구간일수록 낮은 내리막 선.">${g}</svg>`
    + `<figcaption>가로는 모집인원 변화, 세로는 경쟁률 변화율의 중앙값입니다. 왼쪽이 모집을 줄인 자리, 오른쪽이 늘린 자리입니다.</figcaption></figure>`;
}


/** 합격선을 「올라간 폭」으로 적는다. 등급 숫자의 부호를 그대로 두면 읽는
 *  사람이 매번 뒤집어 생각해야 한다. 여기 들어오는 값은 이미 뒤집힌 값이다. */
const up2 = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);

/**
 * 경쟁률 변화 → 합격선 이동. 가운데 굵은 선이 중앙값, 옅은 띠가 가운데 절반
 * (25~75%)이다. 띠를 함께 그리는 것은 방향만 보고 폭을 오해하지 않도록
 * 하기 위함이다 — 어느 구간에서나 띠가 0을 걸치거나 스친다.
 *
 * 세로축은 **뒤집어** 그린다. 등급은 숫자가 작을수록 우수하므로 그대로
 * 그리면 「합격선이 올라간」 쪽이 아래로 내려가 읽는 사람이 반대로 본다.
 */
function bandSvg(bins) {
  const W = 760; const H = 300; const L = 56; const R = 18; const T = 26; const B = 56;
  const hi = 0.7;
  const y = (v) => T + (1 - (-v + hi) / (2 * hi)) * (H - T - B); // v는 등급 이동(음수=상승)
  const x = (i) => L + (i + 0.5) * ((W - L - R) / bins.length);
  let g = '';
  for (const v of [-0.6, -0.3, 0, 0.3, 0.6]) {
    g += `<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" stroke="${v === 0 ? '#A8A29A' : '#EFEDE9'}"/>`
      + `<text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="ax">${v === 0 ? '0' : (-v).toFixed(1)}</text>`;
  }
  g += `<text x="${L - 8}" y="${(T - 8).toFixed(1)}" text-anchor="end" class="ax">등급</text>`;
  const band = bins.map((b2, i) => `${x(i).toFixed(1)},${y(b2.lo).toFixed(1)}`).join(' ')
    + ' ' + bins.map((b2, i) => `${x(i).toFixed(1)},${y(b2.hi).toFixed(1)}`).reverse().join(' ');
  g += `<polygon points="${band}" fill="#F59E0B" fill-opacity="0.16"/>`;
  g += `<polyline fill="none" stroke="#F59E0B" stroke-width="2.5" points="${bins.map((b2, i) => `${x(i).toFixed(1)},${y(b2.dk).toFixed(1)}`).join(' ')}"/>`;
  bins.forEach((b2, i) => {
    g += `<circle cx="${x(i).toFixed(1)}" cy="${y(b2.dk).toFixed(1)}" r="4.5" fill="#B45309" stroke="#fff" stroke-width="2">`
      + `<title>${b2.lab} · 합격선 ${b2.dk < 0 ? '상승' : '완화'} ${Math.abs(b2.dk).toFixed(2)}등급 · ${n0(b2.n)}쌍</title></circle>`
      + `<text x="${x(i).toFixed(1)}" y="${(y(b2.dk) - 11).toFixed(1)}" text-anchor="middle" class="val">${up2(-b2.dk)}</text>`
      + `<text x="${x(i).toFixed(1)}" y="${H - B + 18}" text-anchor="middle" class="ax">${b2.lab}</text>`
      + `<text x="${x(i).toFixed(1)}" y="${H - B + 33}" text-anchor="middle" class="ax">${(b2.up * 100).toFixed(0)}%</text>`;
  });
  g += `<text x="${W - R}" y="${(T + 10).toFixed(1)}" text-anchor="end" class="ax">위로 갈수록 합격선이 올라감</text>`;
  return `<figure class="fig"><svg viewBox="0 0 ${W} ${H}" role="img" width="100%" height="auto" aria-label="경쟁률이 많이 오른 구간일수록 이듬해 합격선이 높아지는 오르막 선. 가운데 절반의 범위는 어느 구간에서나 0을 걸친다.">${g}</svg>`
    + '<figcaption>가로는 그해 경쟁률 변화, 세로는 이듬해 합격선(등급70)이 움직인 폭입니다. 굵은 선이 중앙값, 옅은 띠가 가운데 절반(25~75%)이고, 칸 밑 백분율은 그 구간에서 합격선이 실제로 올라간 학과의 비율입니다. 2022~2026학년도 입결.</figcaption></figure>';
}

/** 작년 합격선 수준별로, 경쟁률이 크게 오른 해와 크게 내린 해의 이동폭. */
function levelSvg(rows) {
  const W = 760; const H = 250; const L = 78; const R = 18; const T = 20; const B = 52;
  const hi = 0.6;
  const y = (v) => T + (1 - (-v + hi) / (2 * hi)) * (H - T - B);
  const bw = (W - L - R) / rows.length;
  let g = '';
  for (const v of [-0.5, -0.25, 0, 0.25, 0.5]) {
    g += `<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" stroke="${v === 0 ? '#A8A29A' : '#EFEDE9'}"/>`
      + `<text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="ax">${v === 0 ? '0' : (-v).toFixed(2)}</text>`;
  }
  rows.forEach((r, i) => {
    const x0 = L + i * bw; const w = bw * 0.30;
    [[r.up.dk, '#F59E0B', '세 명 넘게 더 몰린 해'], [r.down.dk, '#B45309', '세 명 넘게 빠진 해']]
      .forEach(([v, c, nm], j) => {
        const bx = x0 + bw * 0.16 + j * (w + bw * 0.08);
        const top = Math.min(y(v), y(0)); const h = Math.abs(y(v) - y(0));
        g += `<rect x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" fill="${c}" rx="2">`
          + `<title>${r.lab} · ${nm} · 합격선 ${v < 0 ? '상승' : '완화'} ${Math.abs(v).toFixed(2)}등급</title></rect>`
          + `<text x="${(bx + w / 2).toFixed(1)}" y="${(v < 0 ? top - 5 : top + h + 13).toFixed(1)}" text-anchor="middle" class="val">${Math.abs(v).toFixed(2)}</text>`;
      });
    g += `<text x="${(x0 + bw / 2).toFixed(1)}" y="${H - B + 20}" text-anchor="middle" class="ax">${r.lab}</text>`
      + `<text x="${(x0 + bw / 2).toFixed(1)}" y="${H - B + 35}" text-anchor="middle" class="ax">${n0(r.n)}쌍</text>`;
  });
  return `<figure class="fig"><svg viewBox="0 0 ${W} ${H}" role="img" width="100%" height="auto" aria-label="작년 합격선이 낮은 등급대일수록 경쟁률 변화에 합격선이 크게 흔들리는 막대그림.">${g}</svg>`
    + '<figcaption><span class="key"><span class="sw" style="background:#F59E0B"></span>한 자리에 세 명 넘게 더 몰린 해</span>'
    + '<span class="key"><span class="sw" style="background:#B45309"></span>세 명 넘게 빠진 해</span><br>'
    + '위로 솟은 막대가 합격선이 올라간 폭, 아래로 뻗은 막대가 내려간 폭입니다(등급). 가로는 그 학과의 <em>작년</em> 합격선 수준입니다.</figcaption></figure>';
}

/* ── 쓰기 ───────────────────────────────────────────────────────── */

const pct = (v, sign = true) => {
  if (v == null) return '—';
  const s = (v * 100).toFixed(1);
  return (sign && Number(s) !== 0 ? (v > 0 ? '+' : '') : '') + s + '%';
};
const r2 = (v) => (v == null ? '—' : v.toFixed(2));
const n0 = (v) => v.toLocaleString('ko-KR');

/** 0을 가운데 둔 막대. **방향은 자리로 나타내고 색은 하나만 쓴다.** */
function dbar(items) {
  const mx = Math.max(...items.filter((i) => i.d != null).map((i) => Math.abs(i.d)), 0.0001);
  return items.map((i) => {
    if (i.d == null) {
      return `<tr><th scope="row">${i.lab}</th><td class="bar"><span class="muted">견줄 줄이 적어 내지 않았습니다</span></td><td class="num">—</td><td class="num">${n0(i.n)}</td></tr>`;
    }
    const f = i.d / mx;
    const left = 50 + (f < 0 ? f * 50 : 0);
    return `<tr><th scope="row">${i.lab}</th><td class="bar">`
      + `<span class="track"><span class="zero"></span>`
      + `<span class="fill" style="left:${left.toFixed(2)}%;width:${(Math.abs(f) * 50).toFixed(2)}%"></span></span></td>`
      + `<td class="num strong">${pct(i.d)}</td><td class="num">${n0(i.n)}</td></tr>`;
  }).join('\n');
}

const kindRows = D.kind.map((k) => ({ lab: k.k.replace('학생부', ''), d: k.d, n: k.n }));
const zoneRows = D.zone.map((z) => ({ lab: z.z, d: z.d, n: z.n }));
const sizeRows = D.size.map((s) => ({ lab: s.lab, d: s.d, n: s.n }));

const matrix = D.matrix.map((row) => `<tr><th scope="row">${row.z}</th>`
  + row.cells.map((c) => `<td class="num ${c.d == null ? 'muted' : 'strong'}">${pct(c.d)}`
    + (c.d == null ? (c.n ? `<small>${c.n}</small>` : '') : `<small>${n0(c.n)}</small>`) + '</td>').join('')
  + '</tr>').join('\n');

const quotaRows = D.quota.map((x) => `<tr><th scope="row">${x.lab}</th><td class="num">${n0(x.n)}</td>`
  + `<td class="num">${pct((x.q27 - x.q26) / x.q26)}</td><td class="num">${pct(x.ad)}</td>`
  + `<td class="num strong">${pct(x.d)}</td></tr>`).join('\n');

const univRows = D.byuniv.map((x) => `<tr><th scope="row">${x.u}</th><td class="num">${x.apps}</td>`
  + `<td class="num">${n0(x.n)}</td>`
  + `<td class="num">${r2(x.w26)}<small>→ ${r2(x.w27)}</small></td>`
  + `<td class="num strong">${pct(x.w)}</td>`
  + `<td class="num">${pct(x.d)}</td><td class="num">${(x.up * 100).toFixed(0)}%</td></tr>`).join('\n');

const cases = (items) => items.map((x) => `<tr><th scope="row">${x.u}<small>${x.t}</small></th>`
  + `<td>${x.d}</td><td class="num">${x.q26}→${x.q27}</td>`
  + `<td class="num">${x.r26.toFixed(2)}</td><td class="num">${x.r27.toFixed(2)}</td>`
  + `<td class="num strong">${pct(x.c)}</td></tr>`).join('\n');

const A = D.all; const K = D.kind;
let html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>2027 수시 최종 경쟁률 변화 분석</title>
<style>
:root {
  --bg:#FAF9F7; --surface:#FFFFFF; --line:#E8E6E2; --ink:#1A1A1A; --ink2:#2B2B2B;
  --sub:#6B6B6B; --amber:#F59E0B;
}
* { box-sizing:border-box; }
html { -webkit-text-size-adjust:100%; }
body {
  margin:0; background:var(--bg); color:var(--ink2);
  font-family:Pretendard,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;
  font-size:15px; line-height:1.65; word-break:keep-all;
  overflow-wrap:break-word; overflow-wrap:anywhere;
  font-variant-numeric:tabular-nums;
}
.wrap { max-width:1120px; margin:0 auto; padding:40px 24px 64px; }
header { padding-bottom:24px; border-bottom:1px solid var(--line); margin-bottom:8px; }
h1 { font-size:27px; line-height:1.3; font-weight:700; color:var(--ink); margin:0 0 8px; letter-spacing:-0.01em; }
.lede { max-width:32em; color:var(--sub); margin:0 0 10px; }
.lede:last-child { margin-bottom:0; }
h2 { font-size:20px; line-height:1.35; font-weight:700; color:var(--ink); margin:52px 0 8px; letter-spacing:-0.01em; }
h3 { font-size:16px; line-height:1.4; font-weight:600; color:var(--ink); margin:36px 0 8px; }
p { max-width:36em; margin:0 0 20px; }
h2 + p, h3 + p, .note h3 + p { margin-top:4px; }
.cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(168px,1fr)); gap:12px; margin:24px 0; }
.card { background:var(--surface); border:1px solid var(--line); padding:16px; }
.card .k { font-size:13px; color:var(--sub); margin:0 0 6px; }
.card .v { font-size:29px; font-weight:700; color:var(--ink); line-height:1.2; margin:0; letter-spacing:-0.02em; }
.card .n { font-size:13px; color:var(--sub); margin:6px 0 0; }
.tw { overflow-x:auto; margin:16px 0 24px; border:1px solid var(--line); background:var(--surface); }
table { border-collapse:collapse; width:100%; font-size:14px; }
caption { text-align:left; padding:14px 16px 4px; font-size:13px; color:var(--sub); line-height:1.65; }
/* 표 설명은 표 폭을 따라가면 안 된다 — 좁은 화면에서 옆으로 밀려 읽히지 않는다.
   스크롤 래퍼 왼쪽에 붙여 두고 화면 폭 안으로 가둔다. */
.capin { display:block; position:sticky; left:0; max-width:44em;
  width:min(100%, calc(100vw - 66px)); }
th,td { padding:9px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:middle; }
thead th { font-size:12px; font-weight:600; color:var(--sub); white-space:nowrap; background:var(--surface); }
tbody th { font-weight:600; color:var(--ink); white-space:nowrap; }
/* 좁은 화면에서 가로로 밀 때 이름 열은 붙들어 둔다 */
@media (max-width:640px) {
  tbody th[scope="row"], thead th:first-child {
    position:sticky; left:0; z-index:10; background:var(--surface);
    box-shadow:1px 0 0 var(--line); }
}
tbody th small { display:block; font-weight:400; font-size:12px; color:var(--sub); white-space:normal; }
tbody tr:last-child th, tbody tr:last-child td { border-bottom:0; }
.num { text-align:right; white-space:nowrap; }
.num small { display:block; font-size:11px; color:var(--sub); font-weight:400; }
.strong { font-weight:700; color:var(--ink); }
.muted { color:var(--sub); }
td.bar { width:46%; min-width:220px; }
.track { position:relative; display:block; height:14px; background:#F2F0EC; }
.zero { position:absolute; left:50%; top:-3px; bottom:-3px; width:1px; background:#A8A29A; }
.fill { position:absolute; top:0; bottom:0; background:var(--amber); border-radius:2px; }
.fig { margin:20px 0 24px; padding:16px 16px 12px; background:var(--surface); border:1px solid var(--line); }
.fig svg { display:block; }
.fig figcaption { margin-top:12px; font-size:13px; color:var(--sub); line-height:1.65; max-width:48em; }
.key { display:inline-flex; align-items:center; margin-right:14px; white-space:nowrap; }
.sw { display:inline-block; width:10px; height:10px; margin-right:6px; border-radius:2px; }
.ax { font-size:11px; fill:#6B6B6B; font-family:inherit; }
.val { font-size:12px; font-weight:700; fill:#1A1A1A; font-family:inherit; }
.note { background:var(--surface); border:1px solid var(--line); padding:18px 20px; margin:24px 0; }
.note p { margin:0 0 14px; max-width:36em; }
.note p:last-child { margin-bottom:0; }
.note h3 { margin:0 0 8px; }
footer { margin-top:56px; padding-top:20px; border-top:1px solid var(--line); color:var(--sub); font-size:13px; }
footer p { max-width:38em; margin:0 0 10px; line-height:1.65; }
@media (max-width:640px) {
  .wrap { padding:28px 16px 48px; }
  h1 { font-size:23px; }
  td.bar { display:none; }
}
@media print {
  body { background:#fff; color:#000; font-size:10.5pt; }
  .wrap { max-width:none; padding:0; }
  .tw { overflow:visible; }
  .track { border:1px solid #999; }
  .fill { background:#666; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  tr { page-break-inside:avoid; }
  h2 { page-break-after:avoid; }
}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>2027 수시 최종 경쟁률, 무엇이 달라졌나</h1>
  <p class="lede">2026 입시 결과와 2027 최종 경쟁률을 같은 대학·전형·모집단위끼리 맞대어 본 결과입니다. 견줄 수 있었던 것은 ${n0(A.n)}쌍, ${D.univs}개 대학이고, 기회균형·농어촌 같은 정원외 전형은 빼고&nbsp;봤습니다.</p>
  <p class="lede">5절부터는 다섯 해 입결을 이어 붙여 <strong>경쟁률이 정말 합격선을 움직이는지</strong>, 그 변화가 소식인지 늘 있던 출렁임인지까지 함께&nbsp;쟀습니다.</p>
</header>

<h2>한눈에</h2>
<div class="cards">
  <div class="card"><p class="k">전체 경쟁률</p><p class="v">${r2(A.w26)} → ${r2(A.w27)}</p><p class="n">자리 가중 ${pct(A.w)} · 거의 제자리</p></div>
  <div class="card"><p class="k">오른 줄</p><p class="v">${(A.up * 100).toFixed(0)}%</p><p class="n">${n0(A.n)}쌍 가운데 절반 남짓</p></div>
  <div class="card"><p class="k">교과 ↔ 논술</p><p class="v">${pct(K[0].d)} / ${pct(K[2].d)}</p><p class="n">방향이 정반대</p></div>
  <div class="card"><p class="k">우리 학생이 쓴 학과</p><p class="v">${pct(D.mine.w)}</p><p class="n">자리 가중 · 학과별 중앙값은 ${pct(D.mine.d)}</p></div>
  <div class="card"><p class="k">세 명 더 몰릴 때 합격선</p><p class="v">${Math.abs(H.bins[6].dk).toFixed(2)}</p><p class="n">등급 상승 · 다섯 해 ${n0(H.n)}쌍</p></div>
</div>
<p>총계만 보면 작년과 다를 바 없어 보입니다. 그런데 안을 들여다보면 방향이 크게 갈립니다. <strong>전형 유형</strong>이 가장 크게 가르고, 그다음이 <strong>권역</strong>입니다.</p>

<h2>1. 판의 크기 — 고3은 줄고 N수생은 늘었다</h2>
<div class="tw"><table>
  <caption>2027학년도 수능 응시원서 접수 결과입니다. 경쟁률 자료로는 알 수 없는 숫자라 바깥에서 들여왔습니다.</caption>
  <thead><tr><th scope="col">구분</th><th scope="col" class="num">2027</th><th scope="col" class="num">2026</th><th scope="col" class="num">증감</th></tr></thead>
  <tbody>
${SUNEUNG.rows.map((r) => `<tr><th scope="row">${r.k}</th><td class="num">${n0(r.now)}</td><td class="num">${n0(r.was)}</td><td class="num strong">${(r.now - r.was > 0 ? '+' : '') + n0(r.now - r.was)}</td></tr>`).join('\n')}
  </tbody>
</table></div>
<p>수능 지원자는 모두 ${n0(SUNEUNG.total)}명입니다. <strong>고3은 1만 6천 명 줄었는데 N수생이 1만 4천 명 늘어, 전체 머릿수는 거의 그대로입니다.</strong> 바뀐 것은 크기가 아니라 구성입니다.</p>
<p>우리가 이은 ${n0(A.n)}쌍에서도 같은 그림이 나옵니다 — 모집인원 ${pct((A.q27 - A.q26) / A.q26)}, 지원 연인원 ${pct((D.applied27 - D.applied26) / D.applied26)}. 뽑는 자리도 쓰는 사람도 작년과 비슷합니다. 그러니 아래에서 보는 변화는 <strong>판이 커지거나 작아져서가 아니라, 사람들이 쓰는 자리가 옮겨 가서</strong> 생긴 것입니다.</p>

<h2>2. 전형 유형 — 교과는 빠지고 논술은 몰렸다</h2>
<div class="tw"><table>
  <caption>2026 대비 2027 최종 경쟁률 변화율의 중앙값. 막대는 0을 가운데 두고 왼쪽이 하락, 오른쪽이 상승입니다.</caption>
  <thead><tr><th scope="col">전형 유형</th><th scope="col">변화</th><th scope="col">중앙 변화율</th><th scope="col">쌍</th></tr></thead>
  <tbody>
${dbar(kindRows)}
  </tbody>
</table></div>
<p>교과가 8% 남짓 빠지는 동안 논술은 15% 올랐습니다. 종합은 그 사이에서 소폭 올랐고요. 수시에서 <strong>교과의 문턱이 낮아지고 논술 쏠림이 심해졌다</strong>는 이야기인데, 이것이 전국에서 고르게 일어난 일은 아닙니다.</p>

<h2>3. 권역 — 수도권과 호남이 반대로 움직였다</h2>
<div class="tw"><table>
  <caption>「서울 상위」는 입결 자료가 서울 주요 대학으로 따로 묶어 둔 분류를 그대로 쓴 것입니다.</caption>
  <thead><tr><th scope="col">권역</th><th scope="col">변화</th><th scope="col">중앙 변화율</th><th scope="col">쌍</th></tr></thead>
  <tbody>
${dbar(zoneRows)}
  </tbody>
</table></div>

<h3>권역 × 전형 유형</h3>
<div class="tw"><table>
  <caption>칸 안의 작은 숫자는 견준 쌍의 수입니다. 15쌍이 안 되는 칸은 내지 않았습니다.</caption>
  <thead><tr><th scope="col">권역</th><th scope="col" class="num">교과</th><th scope="col" class="num">종합</th><th scope="col" class="num">논술</th></tr></thead>
  <tbody>
${matrix}
  </tbody>
</table></div>
<p>여기가 이 자료에서 가장 뚜렷한 자리입니다. <strong>수도권 교과는 어디서나 18~24% 빠졌는데, 호남 교과는 오히려 올랐습니다.</strong> 종합도 마찬가지로 수도권은 내리고 호남·영남은 올랐습니다. 수도권 학생들이 교과를 덜 쓰고 논술로 옮겨 가는 동안, 지역 학생들은 지역 대학의 교과·종합에 더 몰린 모양입니다.</p>
<p>우리 학생들이 호남권에 많이 쓴다는 점을 생각하면, <strong>작년 경쟁률을 그대로 기준 삼기 어려운 해</strong>입니다. 호남권 종합은 작년보다 한 단계 빡빡하게 잡고 보는 편이 안전하겠습니다.</p>

<h2>4. 모집인원 — 경쟁률을 움직인 것은 지원자보다 모집인원이었다</h2>
<div class="tw"><table>
  <caption>모집인원을 10% 넘게 줄인 곳 · 비슷한 곳 · 10% 넘게 늘린 곳으로 나눠 봤습니다.</caption>
  <thead><tr><th scope="col">2027 모집인원</th><th scope="col" class="num">쌍</th><th scope="col" class="num">모집인원</th><th scope="col" class="num">지원자</th><th scope="col" class="num">경쟁률</th></tr></thead>
  <tbody>
${quotaRows}
  </tbody>
</table></div>
${slopeSvg(P)}
<p><strong>왼쪽에서 오른쪽으로 곧게 내려갑니다.</strong> 모집을 30% 넘게 줄인 자리는 경쟁률이 크게 올랐고, 30% 넘게 늘린 자리는 크게 내렸습니다. 중간 구간들도 순서가 어긋나지 않습니다 — 우연히 그렇게 보이는 모양이 아니라는 뜻입니다.</p>
<p>모집을 줄인 곳은 <strong>지원자도 16% 줄었는데 경쟁률은 11% 올랐습니다.</strong> 학생들이 모집인원 감소를 보고 피했는데도, 줄어든 자리 수가 더 커서 결국 더 빡빡해진 것입니다. 늘린 곳은 그 반대고요.</p>
<p>상담에서 쓸 수 있는 말은 이렇습니다 — <strong>작년 경쟁률보다 올해 모집인원 증감을 먼저 보십시오.</strong> 경쟁률 변화의 방향은 모집인원이 거의 정해 줍니다.</p>

<h3>모집 규모별</h3>
<div class="tw"><table>
  <caption>모집인원이 적을수록 경쟁률이 높고, 변동도 큽니다.</caption>
  <thead><tr><th scope="col">모집 규모</th><th scope="col">변화</th><th scope="col">중앙 변화율</th><th scope="col">쌍</th></tr></thead>
  <tbody>
${dbar(sizeRows)}
  </tbody>
</table></div>
<p>소수 모집(1~3명)은 경쟁률 자체가 높은 데다 해마다 크게 출렁입니다. 한두 명 더 쓰고 덜 쓰는 것으로 경쟁률이 배로 움직이니, <strong>소수 모집 학과의 작년 경쟁률은 참고치 이상으로 쓰기 어렵습니다.</strong></p>

<h2>5. 경쟁률이 오르면 합격선도 오르나 — 올라갈 때만 그렇다</h2>
<p>여기까지는 경쟁률이 어떻게 움직였는지만 보았습니다. 정작 궁금한 것은 그 움직임이 합격에 닿느냐입니다. 2022~2026학년도 다섯 해 입결을 같은 대학·전형·모집단위끼리 해마다 이어 붙여 <strong>${n0(H.n)}쌍</strong>을 얻었고, 「경쟁률이 얼마나 변했을 때 이듬해 합격선이 얼마나 움직였는가」를 세었습니다. 합격선은 등급70을 씁니다.</p>
<div class="note">
  <h3>경쟁률은 「명」으로 읽습니다</h3>
  <p>이 절부터는 경쟁률 변화를 백분율이 아니라 <strong>명</strong>으로 적습니다. 경쟁률은 본디 「한 자리에 몇 명」이니 그 차이도 명입니다. 백분율로 적으면 <strong>2.4 → 8.5가 +254%</strong>로 부풀어, 정작 <strong>한 자리 놓고 겨루는 사람이 여섯 명 늘었다</strong>는 사실이 가려집니다. 반대로 20 → 25는 +25%로 조그맣게 보이지만 다섯 명이 는 것입니다.</p>
  <p>둘 중 무엇이 합격선을 더 잘 잡아내는지 재 보았습니다. 순위 상관이 백분율 ${Math.abs(H.rho).toFixed(2)}, 명 ${Math.abs(H.rhoN).toFixed(2)}로 <strong>사실상 같았습니다</strong> — 경쟁률이 3 아래인 자리에서는 명 쪽이 오히려 나았습니다. 잃는 것이 없으니 읽히는 쪽을 씁니다.</p>
</div>
${bandSvg(H.bins)}
<p>선은 한 번도 꺾이지 않고 오른쪽으로 올라갑니다. <strong>한 자리에 세 명 넘게 더 몰린 자리는 이듬해 합격선이 중앙값 ${Math.abs(H.bins[6].dk).toFixed(2)}등급 올라갔고</strong>, 실제로 올라간 학과가 ${(H.bins[6].up * 100).toFixed(0)}%였습니다. 경쟁률은 합격선의 신호가 맞습니다.</p>
<p>다만 폭을 보아야 합니다. 세 명이 더 몰려도 합격선은 0.3등급 남짓 움직입니다. 내신 0.3등급은 상담에서 진로를 바꿀 만한 크기가 아닙니다. 게다가 옅은 띠가 말해 주듯 <strong>같은 구간 안에서도 학과마다 제각각입니다</strong> — 세 명 넘게 몰린 자리 가운데 ${(100 - H.bins[6].up * 100).toFixed(0)}%는 오히려 합격선이 내려갔습니다.</p>

<h3>내려갈 때는 따라 내려오지 않는다</h3>
<p>명으로 바꿔 보니 전에 안 보이던 것이 하나 드러났습니다. <strong>선의 왼쪽 절반이 거의 평평합니다.</strong> 경쟁률이 한 자리에 세 명 넘게 빠진 자리에서도 합격선은 ${Math.abs(H.bins[0].dk).toFixed(2)}등급밖에 내려가지 않았고, 그마저 절반 가까이(${(H.bins[0].up * 100).toFixed(0)}%)는 오히려 올라갔습니다. 오른쪽 끝의 ${Math.abs(H.bins[6].dk).toFixed(2)}등급과 견주면 <strong>대여섯 배 차이입니다.</strong></p>
<p>합격선은 올라가기는 쉬워도 내려가기는 어렵다는 뜻입니다. 지원자가 빠져도 남은 지원자 가운데 윗머리는 그대로 남기 때문으로 보입니다. 상담에 옮기면 이렇습니다 — <strong>「작년보다 경쟁률이 떨어졌으니 해볼 만하다」는 기대는 대체로 빗나갑니다.</strong> 경쟁률이 빠졌다는 소식은 오른 소식만큼의 무게를 갖지 않습니다.</p>
<p>「모집인원을 줄여서 경쟁률도 컷도 같이 올랐을 뿐 아니냐」는 반문도 자연스럽습니다. 그래서 <strong>모집인원을 5% 안쪽으로밖에 건드리지 않은 ${n0(H.same.n)}쌍</strong>만 따로 세어 보았습니다. 세 명 넘게 몰린 자리의 합격선이 ${Math.abs(H.same.hi.dk).toFixed(2)}등급 올라가 <strong>전체와 거의 같았습니다.</strong> 모집인원이 뒤에서 둘 다 끌어당긴 것만은 아니라는 뜻입니다.</p>

<h3>누구의 합격선이 흔들리는가</h3>
${levelSvg(H.level)}
<p>같은 자를 작년 합격선 수준별로 나눠 대면 그림이 갈립니다. <strong>${H.level[0].lab} 학과는 세 명이 더 몰려도 합격선이 ${Math.abs(H.level[0].up.dk).toFixed(2)}등급밖에 움직이지 않습니다.</strong> 반대로 ${H.level[4].lab} 학과는 ${Math.abs(H.level[4].up.dk).toFixed(2)}등급, 열 배가 넘습니다. 상위권은 어차피 지원자 윗머리가 두꺼워 몇 명 더 온다고 컷이 밀리지 않고, 중하위권은 지원자층이 얇아 조금만 몰려도 컷이 따라 올라가기 때문으로 보입니다. 앞서 본 비대칭도 모든 등급대에서 한결같습니다 — 어느 줄에서나 <strong>내려가는 쪽 막대가 훨씬 짧습니다.</strong></p>
<p>상담에 그대로 옮기면 이렇습니다. <strong>1~3등급대 학과를 쓰는 학생에게 경쟁률 변화는 거의 소식이 아니고, 4등급 아래 학과를 쓰는 학생에게는 실제로 영향이 있습니다.</strong> 정작 경쟁률 표를 들여다보며 불안해하는 쪽은 앞의 학생들인 경우가 많습니다.</p>
<div class="tw"><table>
<caption>전형 유형과 모집 규모별로 본, 한 자리에 세 명 넘게 더 몰린 해의 합격선 이동입니다. 「상승 폭」은 등급이고, 클수록 빡빡해진 것입니다.</caption>
<thead><tr><th scope="col">묶음</th><th scope="col" class="num">쌍</th><th scope="col" class="num">상승 폭</th><th scope="col" class="num">올라간 비율</th></tr></thead>
<tbody>
${H.kind.map((k) => `<tr><th scope="row">${k.lab}</th><td class="num">${n0(k.big.n)}</td><td class="num strong">${up2(-k.big.dk)}</td><td class="num">${(k.big.up * 100).toFixed(0)}%</td></tr>`).join('\n')}
${H.size.map((s) => `<tr><th scope="row">${s.lab} 뽑는 곳</th><td class="num">${n0(s.big.n)}</td><td class="num strong">${up2(-s.big.dk)}</td><td class="num">${(s.big.up * 100).toFixed(0)}%</td></tr>`).join('\n')}
</tbody></table></div>
<p>교과가 종합보다 크게 흔들립니다(${Math.abs(H.kind[0].big.dk).toFixed(2)} 대 ${Math.abs(H.kind[1].big.dk).toFixed(2)}등급). 교과는 내신 줄 세우기가 곧 합격선이라 지원자가 늘면 바로 컷에 닿지만, 종합은 서류와 면접이 사이에 끼어 있어 한 겹 걸러집니다. <strong>종합 지원자에게 경쟁률은 교과 지원자보다 더 먼 이야기입니다.</strong> 모집 규모는 생각만큼 크게 가르지 않았습니다.</p>

<h2>6. 평소에도 이만큼은 출렁인다 — 무엇이 진짜 소식인가</h2>
<p>지금까지는 「올해 몇 명 늘었나」만 보았습니다. 그런데 경쟁률은 아무 일 없어도 해마다 오르내립니다. 세 해 최종 경쟁률을 이어 붙여 재 보니, <strong>한 학과가 평소 한 해에 출렁이는 폭이 중앙값 ${H.sig.swing.toFixed(1)}명</strong>이었습니다. 앞 절에서 「세 명 넘게 늘었다」를 큰 변화로 친 것이, 사실은 <strong>웬만한 학과의 평소 출렁임과 비슷한 크기</strong>였던 셈입니다.</p>
<p>그래서 가름을 하나 더 두었습니다. 그 학과의 <strong>평소 출렁임 폭을 넘었을 때에만</strong> 신호로 치는 것입니다. 값을 하는지 확인해 보았습니다.</p>
<div class="tw"><table>
<caption>앞선 세 해의 출렁임 폭과 견주어, 올해 변화가 그 안인지 밖인지로 가른 것입니다. 「상승 폭」이 클수록 이듬해 합격선이 빡빡해졌다는 뜻입니다.</caption>
<thead><tr><th scope="col">묶음</th><th scope="col" class="num">쌍</th><th scope="col" class="num">상승 폭</th><th scope="col" class="num">올라간 비율</th></tr></thead>
<tbody>
<tr><th scope="row">늘어난 학과<small>평소 출렁임 안</small></th><td class="num">${n0(H.sig.upIn.n)}</td><td class="num strong">${up2(-H.sig.upIn.dk)}</td><td class="num">${(H.sig.upIn.up * 100).toFixed(0)}%</td></tr>
<tr><th scope="row">늘어난 학과<small>평소 범위를 넘어섬</small></th><td class="num">${n0(H.sig.upOut.n)}</td><td class="num strong">${up2(-H.sig.upOut.dk)}</td><td class="num">${(H.sig.upOut.up * 100).toFixed(0)}%</td></tr>
<tr><th scope="row">늘어난 학과<small>평소 범위의 두 배를 넘어섬</small></th><td class="num">${n0(H.sig.upFar.n)}</td><td class="num strong">${up2(-H.sig.upFar.dk)}</td><td class="num">${(H.sig.upFar.up * 100).toFixed(0)}%</td></tr>
<tr><th scope="row">줄어든 학과<small>평소 출렁임 안</small></th><td class="num">${n0(H.sig.dnIn.n)}</td><td class="num strong">${up2(-H.sig.dnIn.dk)}</td><td class="num">${(H.sig.dnIn.up * 100).toFixed(0)}%</td></tr>
<tr><th scope="row">줄어든 학과<small>평소 범위를 넘어섬</small></th><td class="num">${n0(H.sig.dnOut.n)}</td><td class="num strong">${up2(-H.sig.dnOut.dk)}</td><td class="num">${(H.sig.dnOut.up * 100).toFixed(0)}%</td></tr>
</tbody></table></div>
<p>가름이 값을 합니다. 경쟁률이 늘어난 학과라도 <strong>평소 출렁임 안이면 합격선이 ${Math.abs(H.sig.upIn.dk).toFixed(2)}등급, 평소 범위를 넘었으면 ${Math.abs(H.sig.upOut.dk).toFixed(2)}등급</strong>으로 세 배 가까이 벌어집니다. 두 배를 넘긴 자리는 ${Math.abs(H.sig.upFar.dk).toFixed(2)}등급입니다.</p>
<p>더 또렷한 것은 이것입니다. 앞 절의 <strong>「세 명 넘게 늘었다」는 한 묶음을 다시 갈라 보면</strong>, 그 정도가 평소 출렁임인 학과는 ${Math.abs(H.sig.bigIn.dk).toFixed(2)}등급(${n0(H.sig.bigIn.n)}쌍), 평소보다 유별난 학과는 ${Math.abs(H.sig.bigOut.dk).toFixed(2)}등급(${n0(H.sig.bigOut.n)}쌍)으로 <strong>두 배 갈립니다.</strong> 같은 「세 명 증가」라도 어떤 학과에서 일어났느냐가 그만큼 중요합니다.</p>
<p>줄어든 쪽은 여기서도 조용합니다. 평소 범위를 크게 벗어나 빠져도 합격선은 ${Math.abs(H.sig.dnOut.dk).toFixed(2)}등급 움직였을 뿐입니다.</p>

<h3>그래서 2027은</h3>
<p>올해 자료에 같은 자를 대 보았습니다. 세 해치 경쟁률을 붙일 수 있었던 ${n0(H.p27.swingN)}곳이 대상입니다.</p>
<div class="cards">
  <div class="card"><p class="k">평소 출렁임 폭</p><p class="v">${H.p27.swing.toFixed(1)}명</p><p class="n">한 자리당 · 중앙값</p></div>
  <div class="card"><p class="k">평소 범위를 벗어난 곳</p><p class="v">${(H.p27.out * 100).toFixed(0)}%</p><p class="n">위로 ${n0(H.p27.outUp)} · 아래로 ${n0(H.p27.outDn)}</p></div>
  <div class="card"><p class="k">우리 학생이 쓴 곳 가운데</p><p class="v">${(H.p27.mineOut * 100).toFixed(0)}%</p><p class="n">${n0(H.p27.mineSwingN)}곳 가운데</p></div>
  <div class="card"><p class="k">예상 합격선 상승 · 우리</p><p class="v">${up2(-H.p27.mineShift)}</p><p class="n">등급, 중앙값 · ${(H.p27.mineUp * 100).toFixed(0)}%가 올라가는 쪽</p></div>
</div>
<p><strong>올해 경쟁률 변화의 셋 가운데 둘은 그 학과가 평소에도 하던 출렁임 안입니다.</strong> 경쟁률 표를 열어 「작년보다 올랐다/내렸다」를 세는 일의 상당 부분이 잡음을 읽는 일이라는 뜻입니다. 판 전체의 예상 합격선 이동이 ${up2(-H.p27.shift)}등급으로 사실상 제자리인 것도 같은 이야기입니다.</p>
<p>남은 셋 중 하나가 볼 만한 자리입니다. 우리 학생이 쓴 곳 가운데 <strong>그 학과 기준으로 유별나게 몰린 곳</strong>을 골라 두었습니다.</p>
<div class="tw"><table>
<caption>우리 학생이 지원한 학과 가운데, 올해 늘어난 폭이 그 학과의 평소 출렁임을 넘어선 곳입니다. 「평소」는 앞선 세 해에 한 해 동안 오르내리던 폭이고, 「예상」은 지난 다섯 해에 같은 등급대에서 같은 정도로 몰렸을 때의 합격선 이동 중앙값입니다 — <strong>예측이 아니라 과거의 평균적 반응</strong>이며, 실제로는 이 값의 양쪽으로 크게 흩어집니다.</caption>
<thead><tr><th scope="col">대학 · 모집단위</th><th scope="col" class="num">작년 컷</th><th scope="col" class="num">경쟁률</th><th scope="col" class="num">늘어난 폭</th><th scope="col" class="num">평소</th><th scope="col" class="num">예상 상승</th></tr></thead>
<tbody>
${H.watch.map((w) => `<tr><th scope="row">${w.u}<small>${w.d} · ${w.t}</small></th><td class="num">${w.k26.toFixed(2)}</td><td class="num">${r2(w.r26)}<small>→ ${r2(w.r27)}</small></td><td class="num strong">+${w.dn.toFixed(1)}명</td><td class="num muted">${w.swing.toFixed(1)}명</td><td class="num strong">${up2(-w.shift)}</td></tr>`).join('\n')}
</tbody></table></div>
<p>모두 중하위 등급대의 지역 국립대·사립대 학과입니다. 앞에서 본 대로 <strong>경쟁률 변화가 합격선에 가장 잘 옮겨붙는 자리</strong>이기도 합니다. 맨 윗줄은 평소 ${H.watch[0].swing.toFixed(1)}명씩 오르내리던 곳에 올해만 ${H.watch[0].dn.toFixed(0)}명이 몰린 것이니, 다른 줄과는 성격이 다릅니다. 이 학과들을 쓴 학생과는 한 번 더 이야기를 나눠 둘 만합니다.</p>
<p>반대로 표에 없는 학과, 특히 서울권 상위 학과를 쓴 학생에게는 <strong>경쟁률이 올랐다는 소식 자체가 대개 소식이 아니라는 점</strong>을 함께 일러 주는 편이 낫겠습니다.</p>

<h2>7. 우리 학교는 그 안에서 어디쯤인가</h2>
${histSvg(P, MINE, A.d, D.mine.d)}
<p>전체와 우리 학생이 쓴 학과의 변화율 분포를 겹쳐 본 것입니다. 모양은 닮았지만 <strong>우리 쪽이 오른쪽으로 조금 밀려 있습니다.</strong> 중앙값이 전체 ${pct(A.d)}인데 우리는 ${pct(D.mine.d)}이고, 경쟁률이 오른 자리의 비율도 전체 ${(A.up * 100).toFixed(0)}%에 견줘 우리는 ${(D.mine.up * 100).toFixed(0)}%입니다.</p>
<div class="note">
  <h3>중앙값과 자리 가중 — 어느 쪽을 볼 것인가</h3>
  <p>같은 묶음을 두 가지로 셀 수 있습니다. <strong>학과별 중앙값</strong>은 학과 하나를 한 표로 치므로 「보통 학과가 어떻게 움직였나」를 말하고, <strong>자리 가중</strong>은 지원 합을 모집 합으로 나누므로 「실제로 얼마나 몰렸나」를 말합니다. 뒤엣것은 큰 학과가 그만큼 큰 무게를 갖습니다.</p>
  <p>우리 학생이 쓴 학과는 중앙값 ${pct(D.mine.d)}, 자리 가중 ${pct(D.mine.w)}로 <strong>자리 가중 쪽이 더 높습니다.</strong> 크게 오른 자리가 대체로 사람을 많이 뽑는 학과였다는 뜻입니다. 체감이 중앙값보다 높게 느껴진다면 그 어긋남이 까닭입니다.</p>
  <p>단순평균은 쓰지 않았습니다. 한 명 뽑는 학과가 4.2 → 25.3이 되는 일이 흔해, 평균은 그런 몇 자리에 통째로 끌려갑니다 — 어떤 대학에서는 중앙값 −11%와 평균 +11%가 갈렸습니다.</p>
</div>
<p>크지는 않지만 방향이 분명한 차이입니다. 앞에서 본 대로 <strong>호남권과 지역 국립대의 교과·종합이 오른 해</strong>인데, 우리 학생 지원이 바로 그쪽에 몰려 있기 때문입니다. 전국 평균이 제자리라는 말을 우리 교실에 그대로 옮기기 어려운 까닭이 여기 있습니다.</p>

<h2>8. 우리 학생이 쓴 대학</h2>
<div class="tw"><table>
  <caption>우리 학생이 지원한 대학 가운데, <strong>우리 학생이 쓴 학과</strong>로 견줄 쌍이 셋 이상인 곳입니다. 「지원」은 우리 학교 지원 건수, 「학과」는 그중 작년 자료와 이어진 학과 수입니다.<br>「경쟁률」은 그 학과들의 지원 합을 모집 합으로 나눈 것이라 <strong>큰 학과가 그만큼 큰 무게</strong>를 갖습니다. 오른쪽 「학과별」은 학과마다의 변화율을 모아 낸 중앙값으로, 보통 학과가 어떻게 움직였는지를 봅니다. 둘이 어긋나면 몇몇 큰 학과가 판을 끌고 갔다는 뜻입니다.</caption>
  <thead><tr><th scope="col">대학</th><th scope="col" class="num">지원</th><th scope="col" class="num">학과</th><th scope="col" class="num">경쟁률</th><th scope="col" class="num">변화</th><th scope="col" class="num">학과별</th><th scope="col" class="num">오른 곳</th></tr></thead>
  <tbody>
${univRows}
  </tbody>
</table></div>

<h3>크게 오른 곳</h3>
<div class="tw"><table>
  <caption>우리 학생이 지원한 학과 가운데, 양쪽 해 모두 10명 이상 뽑은 것만 골랐습니다. 소수 모집의 출렁임을 빼기 위해서입니다.</caption>
  <thead><tr><th scope="col">대학 · 전형</th><th scope="col">모집단위</th><th scope="col" class="num">모집</th><th scope="col" class="num">2026</th><th scope="col" class="num">2027</th><th scope="col" class="num">변화</th></tr></thead>
  <tbody>
${cases(D.up)}
  </tbody>
</table></div>

<h3>크게 내린 곳</h3>
<div class="tw"><table>
  <thead><tr><th scope="col">대학 · 전형</th><th scope="col">모집단위</th><th scope="col" class="num">모집</th><th scope="col" class="num">2026</th><th scope="col" class="num">2027</th><th scope="col" class="num">변화</th></tr></thead>
  <tbody>
${cases(D.down)}
  </tbody>
</table></div>

<div class="note">
  <h3>무엇을 빼고 보았나</h3>
  <p><strong>기회균형·고른기회·사회통합·농어촌·기초생활·특성화고·재직자·특수교육·서해5도·다문화 같은 정원외 전형은 뺐습니다.</strong> 대학마다 이름이 제각각이라 작년 자료와 잘못 이어지기 쉽고, 뽑는 성격도 일반전형과 달라 같은 자로 재면 안 됩니다. 2027 자료에서 ${n0(D.dropped)}줄이 이렇게 빠졌습니다.</p>
  <p><strong>지역인재는 빼지 않았습니다</strong> — 정상 전형이고 우리 학생이 많이 쓰는 자리입니다. (「지역기회균형」처럼 기회균형이 이름에 든 것은 빠집니다.)</p>
  <p>빼고 다시 세어도 위의 숫자는 거의 그대로였습니다. 특별전형은 애초에 작년 자료와 이어진 것이 열몇 쌍뿐이었기 때문입니다 — 이 보고서의 결론이 그쪽에 기대고 있지는 않다는 뜻입니다.</p>
</div>

<div class="note">
  <h3>이 분석의 한계</h3>
  <p>견준 것은 ${n0(A.n)}쌍입니다. 2027 자료가 있는 대학 가운데 모집단위·전형 이름이 작년과 그대로인 것만 이었습니다 — 이름이 바뀌거나 학과가 통폐합된 것은 빠졌습니다. 특별전형을 뺀 ${n0(live)}줄 가운데 ${(A.n / live * 100).toFixed(0)}%입니다.</p>
  <p>2026 쪽 숫자는 입결 자료의 경쟁률이고, 2027 쪽은 대학이 발표한 최종 경쟁률입니다. 두 자료의 집계 시점이 완전히 같다고 보기는 어렵습니다. 그래서 개별 학과의 값보다 <strong>묶음별 중앙값과 방향</strong>을 보는 편이 낫습니다.</p>
  <p>5절의 합격선은 <strong>대학어디가가 공시한 최종등록자 70% 지점의 내신</strong>입니다. 합격선 그 자체가 아니라 합격자 분포의 한 지점이고, 대학이 무엇을 어떻게 세어 올렸는지는 학교마다 조금씩 다릅니다. 교과 성적을 산출하는 방식도 대학마다 달라 등급 0.1의 무게가 어디서나 같지는 않습니다.</p>
  <p>5절 마지막 표의 「예상」은 <strong>예측이 아니라 지난 다섯 해의 평균적 반응</strong>입니다. 같은 구간 안에서도 학과마다 크게 흩어지고(가운데 절반이 ${up2(-H.bins[6].hi)}~${up2(-H.bins[6].lo)}등급), 올해 대학이 전형을 어떻게 바꿨는지는 들어 있지 않습니다. 한 학생의 지원 여부를 이 숫자로 정하지는 마시기 바랍니다.</p>
  <p>중앙값을 쓴 것은 평균이 소수 모집 학과의 극단값에 끌려가기 때문입니다. 「크게 오른 곳」 표에서 10명 이상만 고른 것도 같은 이유입니다.</p>
</div>

<footer>
  <p>자료 — 2027 수시 최종 경쟁률(대학 발표) · 2026 대입 입시 결과. 학생 개인 정보는 들어 있지 않고, 「지원」 칸은 우리 학교 지원 건수를 대학 단위로 센 것입니다.</p>
  <p>수능 지원자 수는 2027학년도 대학수학능력시험 응시원서 접수 결과입니다 — <a href="${SUNEUNG.src}">에듀플러스 보도</a>.</p>
  <p>나주고등학교 3학년 · <code>node scripts/ratio_report.mjs</code> 로 다시 만듭니다</p>
</footer>
</div>
</body>
</html>
`;
const wrapCaption = (t) => t.replace(/<caption>([\s\S]*?)<\/caption>/g,
  (_, inner) => `<caption><span class="capin">${inner}</span></caption>`);
html = wrapCaption(html);
fs.writeFileSync(path.join(ROOT, '경쟁률분석.html'), html);
console.log(`경쟁률분석.html  ${(html.length / 1024).toFixed(0)}KB`);

/* ── 아티팩트용 ──────────────────────────────────────────────────
 *
 * 같은 내용을 클로드 아티팩트에 올릴 수 있는 꼴로 한 벌 더 쓴다. 아티팩트는
 * <!doctype>·<html>·<head>·<body> 를 스스로 씌우므로 알맹이만 남기고,
 * 보는 사람의 테마를 따라가도록 색을 토큰으로 바꾼다. 그림 속 색까지 함께
 * 바꾸는 것은, 밝은 배경에 맞춰 고른 색이 어두운 배경에서 읽히지 않기 때문이다.
 */
const DARK = `    --bg:#161513; --surface:#1E1D1A; --line:#33312D; --ink:#F4F2EE; --ink2:#DCD9D3;
    --sub:#9C978E; --amber:#FBBF24; --amber2:#F97316;
    --grid:#2C2A26; --rule:#6E6A63; --track:#2A2825;`;
const TOKEN = [
  [/--sub:#6B6B6B; --amber:#F59E0B;/, '--sub:#6B6B6B; --amber:#F59E0B; --amber2:#B45309;\n  --grid:#EFEDE9; --rule:#A8A29A; --track:#F2F0EC;'],
  [/background:#F2F0EC;/g, 'background:var(--track);'],
  [/width:1px; background:#A8A29A;/g, 'width:1px; background:var(--rule);'],
  [/\.ax \{ font-size:11px; fill:#6B6B6B;/, '.ax { font-size:11px; fill:var(--sub);'],
  [/\.val \{ font-size:12px; font-weight:700; fill:#1A1A1A;/, '.val { font-size:12px; font-weight:700; fill:var(--ink);'],
];
const PAINT = [
  [/stroke="#EFEDE9"/g, 'stroke="var(--grid)"'], [/stroke="#E8E6E2"/g, 'stroke="var(--line)"'],
  [/stroke="#A8A29A"/g, 'stroke="var(--rule)"'], [/stroke="#F59E0B"/g, 'stroke="var(--amber)"'],
  [/stroke="#fff"/g, 'stroke="var(--surface)"'], [/fill="#F59E0B"/g, 'fill="var(--amber)"'],
  [/fill="#B45309"/g, 'fill="var(--amber2)"'], [/background:#F59E0B/g, 'background:var(--amber)'],
  [/background:#B45309/g, 'background:var(--amber2)'],
];
{
  const head = html.slice(html.indexOf('<title>'), html.indexOf('</style>'));
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  const css = TOKEN.reduce((t, [re, to]) => t.replace(re, to), head);
  const art = `${css}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${DARK}
  }
}
:root[data-theme="dark"] {
${DARK.replace(/^ {4}/gm, '  ')}
}
a { color:var(--amber2); text-underline-offset:2px; }
a:focus-visible, :focus-visible { outline:2px solid var(--amber); outline-offset:2px; }
code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:0.9em; color:var(--sub); }
</style>
${PAINT.reduce((t, [re, to]) => t.replace(re, to), body)}`;
  fs.writeFileSync(path.join(ROOT, '경쟁률분석.아티팩트.html'), art);
  console.log(`경쟁률분석.아티팩트.html  ${(art.length / 1024).toFixed(0)}KB`);
}
