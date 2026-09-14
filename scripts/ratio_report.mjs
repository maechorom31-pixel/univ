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

const { rows: P, live, dropped } = pairs();
console.log(`특별전형으로 뺀 2027 줄 ${dropped.toLocaleString()}`);
console.log(`남은 2027 줄 ${live.toLocaleString()} · 이어진 쌍 ${P.length.toLocaleString()} (${(P.length / live * 100).toFixed(1)}%) · 대학 ${new Set(P.map((x) => x.base)).size}곳`);
fs.writeFileSync(path.join(ROOT, 'scripts/.ratio_pairs.json'), JSON.stringify({ rows: P, live, dropped }));

/* ── 세기 ───────────────────────────────────────────────────────── */

const blk = (s) => ({ n: s.length, r26: med(s.map((x) => x.r26)), r27: med(s.map((x) => x.r27)),
  d: med(ch(s)), up: s.length ? s.filter((x) => x.r27 > x.r26).length / s.length : null,
  q26: s.reduce((a, x) => a + x.q26, 0), q27: s.reduce((a, x) => a + x.q27, 0) });

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
D.byuniv = [...W.univ].sort((a, b) => b[1] - a[1])
  .map(([b, apps]) => ({ b, apps, s: P.filter((x) => x.base === b) }))
  .filter((x) => x.s.length >= 20)
  .slice(0, 20)
  .map((x) => ({ u: x.s[0].univ, apps: x.apps, ...blk(x.s) }));
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
      out.push({ y, cat: b[C['카테고리']], gye: b[C['계열']], q: q1,
        c0, c1, k0, k1, dc: (c1 - c0) / c0, dk: k1 - k0,
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

const CBIN = [[-1, -0.3, '−30% 아래'], [-0.3, -0.15, '−30~−15%'], [-0.15, -0.05, '−15~−5%'],
  [-0.05, 0.05, '±5% 안'], [0.05, 0.15, '+5~15%'], [0.15, 0.3, '+15~30%'], [0.3, 9e9, '+30% 위']];

/** 한 묶음을 요약한다. up = 합격선이 올라간(등급 숫자가 내려간) 비율. */
const hblk = (s) => ({ n: s.length, dk: med(s.map((x) => x.dk)),
  lo: qt(s.map((x) => x.dk), 0.25), hi: qt(s.map((x) => x.dk), 0.75),
  up: s.length ? s.filter((x) => x.dk < 0).length / s.length : null,
  dc: med(s.map((x) => x.dc)) });

const H = {
  n: PAN.length,
  rho: spearman(PAN, (x) => x.dc, (x) => x.dk),
  bins: CBIN.map(([lo, hi, lab]) => ({ lab, ...hblk(PAN.filter((x) => x.dc >= lo && x.dc < hi)) })),
  // 작년 합격선 수준별로 같은 자를 댄다 — 상위권과 중하위권은 다르게 움직인다
  level: [[0, 2, '1~2등급대'], [2, 3, '2~3등급대'], [3, 4, '3~4등급대'],
    [4, 5, '4~5등급대'], [5, 9.1, '5등급 아래']].map(([lo, hi, lab]) => {
    const s = PAN.filter((x) => x.k0 >= lo && x.k0 < hi);
    return { lab, n: s.length,
      up: hblk(s.filter((x) => x.dc >= 0.3)), down: hblk(s.filter((x) => x.dc < -0.3)) };
  }),
  size: [[1, 4, '1~4명'], [5, 9, '5~9명'], [10, 19, '10~19명'], [20, 49, '20~49명'],
    [50, 9e9, '50명 위']].map(([lo, hi, lab]) => {
    const s = PAN.filter((x) => x.q != null && x.q >= lo && x.q <= hi);
    return { lab, ...hblk(s), big: hblk(s.filter((x) => x.dc >= 0.3)) };
  }),
  // 모집인원을 거의 건드리지 않은 학과만 따로 — 「모집을 줄여 경쟁률도 컷도
  // 같이 올랐을 뿐」이라는 딴 설명을 걷어내기 위한 대조군이다.
  same: (() => {
    const s = PAN.filter((x) => x.dq != null && Math.abs(x.dq) < 0.05);
    return { n: s.length, lo: hblk(s.filter((x) => x.dc < -0.3)),
      hi: hblk(s.filter((x) => x.dc >= 0.3)) };
  })(),
  kind: ['교과', '종합', '논술'].map((k) => {
    const s = PAN.filter((x) => x.cat === k);
    return { lab: k, ...hblk(s), big: hblk(s.filter((x) => x.dc >= 0.3)) };
  }),
};

/* 2027에 대보기 — 올해 경쟁률 변화를 위 구간표에 넣어 합격선이 어느 쪽으로
 * 기울지 센다. 낱낱의 학과를 맞히는 것이 아니라 판이 어느 쪽으로 쏠렸는지만
 * 말할 수 있다. 기울기는 작년 합격선 수준에 따라 다르므로 구간 하나로
 * 뭉뚱그리지 않고 그 학과가 앉아 있는 등급대의 값을 쓴다. */
{
  const LV = [[0, 2], [2, 3], [3, 4], [4, 5], [5, 9.1]];
  /** 작년 컷이 lv 등급대인 학과에서, 경쟁률이 dc만큼 변했을 때의 합격선 이동 중앙값. */
  const shiftOf = (dc, k26) => {
    const li = LV.findIndex(([lo, hi]) => k26 >= lo && k26 < hi);
    if (li < 0) return null;
    const s2 = PAN.filter((x) => x.k0 >= LV[li][0] && x.k0 < LV[li][1]
      && Math.abs(x.dc - dc) <= Math.max(0.08, Math.abs(dc) * 0.25));
    return s2.length >= 30 ? med(s2.map((x) => x.dk)) : null;
  };
  const dist = (s) => CBIN.map(([lo, hi, lab]) => {
    const v = s.filter((x) => (x.r27 - x.r26) / x.r26 >= lo && (x.r27 - x.r26) / x.r26 < hi);
    return { lab, n: v.length, share: s.length ? v.length / s.length : 0 };
  });
  const shifts = (s) => s.map((x) => (x.k26 == null ? null : shiftOf((x.r27 - x.r26) / x.r26, x.k26)))
    .filter((v) => v != null);
  const sa = shifts(P); const sm = shifts(MINE);
  H.p27 = { n: P.length, mineN: MINE.length,
    dist: dist(P), mineDist: dist(MINE),
    shift: med(sa), shiftN: sa.length, up: sa.filter((v) => v < 0).length / sa.length,
    mineShift: med(sm), mineShiftN: sm.length,
    mineUp: sm.length ? sm.filter((v) => v < 0).length / sm.length : null };
  // 우리 학생이 쓴 곳 가운데 경쟁률이 크게 오르고 작년 합격선을 아는 학과
  H.watch = MINE.filter((x) => x.k26 != null && x.q27 >= 5
      && (x.r27 - x.r26) / x.r26 >= 0.3)
    .map((x) => ({ u: x.univ, d: x.dept, t: String(x.track).replace(/\s*[[【][^\]】]*[\]】]?/g, '').trim(),
      k26: x.k26, c: (x.r27 - x.r26) / x.r26, r26: x.r26, r27: x.r27,
      shift: shiftOf((x.r27 - x.r26) / x.r26, x.k26) }))
    .filter((x) => x.shift != null)
    .sort((a, b) => a.shift - b.shift || b.c - a.c)
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
    [[r.up.dk, '#F59E0B', '경쟁률 +30% 위'], [r.down.dk, '#B45309', '경쟁률 −30% 아래']]
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
    + '<figcaption><span class="key"><span class="sw" style="background:#F59E0B"></span>경쟁률이 30% 넘게 오른 해</span>'
    + '<span class="key"><span class="sw" style="background:#B45309"></span>30% 넘게 내린 해</span><br>'
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
  + `<td class="num">${n0(x.n)}</td><td class="num">${r2(x.r26)}</td><td class="num">${r2(x.r27)}</td>`
  + `<td class="num strong">${pct(x.d)}</td><td class="num">${pct((x.q27 - x.q26) / x.q26)}</td></tr>`).join('\n');

const cases = (items) => items.map((x) => `<tr><th scope="row">${x.u}<small>${x.t}</small></th>`
  + `<td>${x.d}</td><td class="num">${x.q26}→${x.q27}</td>`
  + `<td class="num">${x.r26.toFixed(2)}</td><td class="num">${x.r27.toFixed(2)}</td>`
  + `<td class="num strong">${pct(x.c)}</td></tr>`).join('\n');

const A = D.all; const K = D.kind;
const html = `<!doctype html>
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
.lede { max-width:33em; color:var(--sub); margin:0; }
h2 { font-size:20px; line-height:1.3; font-weight:700; color:var(--ink); margin:48px 0 4px; letter-spacing:-0.01em; }
h3 { font-size:16px; font-weight:600; color:var(--ink); margin:32px 0 4px; }
p { max-width:38em; margin:12px 0; }
.cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin:24px 0 8px; }
.card { background:var(--surface); border:1px solid var(--line); padding:16px; }
.card .k { font-size:13px; color:var(--sub); margin:0 0 6px; }
.card .v { font-size:29px; font-weight:700; color:var(--ink); line-height:1.2; margin:0; letter-spacing:-0.02em; }
.card .n { font-size:13px; color:var(--sub); margin:6px 0 0; }
.tw { overflow-x:auto; margin:16px 0 0; border:1px solid var(--line); background:var(--surface); }
table { border-collapse:collapse; width:100%; font-size:14px; }
caption { text-align:left; padding:14px 16px 0; font-size:13px; color:var(--sub); line-height:1.55; }
th,td { padding:9px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:middle; }
thead th { font-size:12px; font-weight:600; color:var(--sub); white-space:nowrap; background:var(--surface); }
tbody th { font-weight:600; color:var(--ink); white-space:nowrap; }
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
.fig { margin:20px 0 0; padding:16px 16px 12px; background:var(--surface); border:1px solid var(--line); }
.fig svg { display:block; }
.fig figcaption { margin-top:10px; font-size:13px; color:var(--sub); line-height:1.55; }
.key { display:inline-flex; align-items:center; margin-right:14px; white-space:nowrap; }
.sw { display:inline-block; width:10px; height:10px; margin-right:6px; border-radius:2px; }
.ax { font-size:11px; fill:#6B6B6B; font-family:inherit; }
.val { font-size:12px; font-weight:700; fill:#1A1A1A; font-family:inherit; }
.note { background:var(--surface); border:1px solid var(--line); padding:16px 18px; margin:24px 0 0; }
.note p { margin:0 0 10px; max-width:40em; }
.note p:last-child { margin-bottom:0; }
.note h3 { margin:0 0 8px; }
footer { margin-top:56px; padding-top:20px; border-top:1px solid var(--line); color:var(--sub); font-size:13px; }
footer p { max-width:40em; margin:0 0 8px; }
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
  <p class="lede">2026 입시 결과와 2027 최종 경쟁률을 같은 대학·전형·모집단위끼리 맞대어 본 결과입니다. 견줄 수 있었던 것은 ${n0(A.n)}쌍, ${D.univs}개&nbsp;대학입니다. 기회균형·농어촌 같은 정원외 전형은 빼고&nbsp;봤습니다. 5절에서는 다섯 해 입결을 이어 붙여 <strong>경쟁률이 정말 합격선을 움직이는지</strong>도 함께&nbsp;쟀습니다.</p>
</header>

<h2>한눈에</h2>
<div class="cards">
  <div class="card"><p class="k">전체 경쟁률 중앙값</p><p class="v">${r2(A.r26)} → ${r2(A.r27)}</p><p class="n">${pct(A.d)} · 거의 제자리</p></div>
  <div class="card"><p class="k">오른 줄</p><p class="v">${(A.up * 100).toFixed(0)}%</p><p class="n">${n0(A.n)}쌍 가운데 절반 남짓</p></div>
  <div class="card"><p class="k">교과 ↔ 논술</p><p class="v">${pct(K[0].d)} / ${pct(K[2].d)}</p><p class="n">방향이 정반대</p></div>
  <div class="card"><p class="k">우리 학생이 쓴 학과</p><p class="v">${pct(D.mine.d)}</p><p class="n">${D.mine.n}쌍 · 전체보다 빡빡</p></div>
  <div class="card"><p class="k">경쟁률 30%↑일 때 합격선</p><p class="v">${Math.abs(H.bins[6].dk).toFixed(2)}</p><p class="n">등급 상승 · 다섯 해 ${n0(H.n)}쌍</p></div>
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

<h2>5. 경쟁률이 오르면 합격선도 오르나 — 방향은 맞지만 폭은 작다</h2>
<p>여기까지는 경쟁률이 어떻게 움직였는지만 보았습니다. 정작 궁금한 것은 그 움직임이 합격에 닿느냐입니다. 2022~2026학년도 다섯 해 입결을 같은 대학·전형·모집단위끼리 해마다 이어 붙여 <strong>${n0(H.n)}쌍</strong>을 얻었고, 「경쟁률이 얼마나 변했을 때 이듬해 합격선이 얼마나 움직였는가」를 세었습니다. 합격선은 등급70을 씁니다.</p>
${bandSvg(H.bins)}
<p>선은 한 번도 꺾이지 않고 오른쪽으로 올라갑니다. 경쟁률이 30% 넘게 빠진 자리는 이듬해 합격선이 중앙값 <strong>${Math.abs(H.bins[0].dk).toFixed(2)}등급 내려갔고</strong>, 30% 넘게 오른 자리는 <strong>${Math.abs(H.bins[6].dk).toFixed(2)}등급 올라갔습니다.</strong> 합격선이 실제로 올라간 학과의 비율도 ${(H.bins[0].up * 100).toFixed(0)}%에서 ${(H.bins[6].up * 100).toFixed(0)}%까지 한 계단씩 늡니다. 순위끼리 견준 상관계수는 ${Math.abs(H.rho).toFixed(2)}(등급 숫자 그대로는 ${H.rho.toFixed(2)})로, 사회 자료에서는 뚜렷한 축에 듭니다. <strong>경쟁률은 합격선의 신호가 맞습니다.</strong></p>
<p>다만 폭을 보아야 합니다. 경쟁률이 중앙값 ${pct(H.bins[6].dc)} 오른 자리에서도 합격선은 ${Math.abs(H.bins[6].dk).toFixed(2)}등급 남짓 움직였습니다. 내신 0.3등급은 상담에서 진로를 바꿀 만한 크기가 아닙니다. 게다가 옅은 띠가 말해 주듯 <strong>같은 구간 안에서도 학과마다 제각각입니다</strong> — 경쟁률이 30% 넘게 오른 자리 가운데 ${(100 - H.bins[6].up * 100).toFixed(0)}%는 오히려 합격선이 내려갔습니다. 경쟁률만 보고 「이 학과는 올해 힘들겠다」고 말하면 넷에 하나는 틀리는 셈입니다.</p>

<p>「모집인원을 줄여서 경쟁률도 컷도 같이 올랐을 뿐 아니냐」는 반문이 자연스럽습니다. 그래서 <strong>모집인원을 5% 안쪽으로밖에 건드리지 않은 ${n0(H.same.n)}쌍</strong>만 따로 세어 보았습니다. 경쟁률이 30% 넘게 오른 자리의 합격선이 ${Math.abs(H.same.hi.dk).toFixed(2)}등급 올라갔고, 30% 넘게 내린 자리는 ${Math.abs(H.same.lo.dk).toFixed(2)}등급 내려가 <strong>전체와 거의 같았습니다.</strong> 모집인원이 뒤에서 둘 다 끌어당긴 것만은 아니라는 뜻입니다.</p>

<h3>누구의 합격선이 흔들리는가</h3>
${levelSvg(H.level)}
<p>같은 자를 작년 합격선 수준별로 나눠 대면 그림이 갈립니다. <strong>${H.level[0].lab} 학과는 경쟁률이 30% 넘게 올라도 합격선이 ${Math.abs(H.level[0].up.dk).toFixed(2)}등급밖에 움직이지 않습니다.</strong> 반대로 ${H.level[4].lab} 학과는 ${Math.abs(H.level[4].up.dk).toFixed(2)}등급, 열 배입니다. 상위권은 어차피 지원자 윗머리가 두꺼워 몇 명 더 온다고 컷이 밀리지 않고, 중하위권은 지원자층이 얇아 조금만 몰려도 컷이 따라 올라가기 때문으로 보입니다.</p>
<p>상담에 그대로 옮기면 이렇습니다. <strong>1~3등급대 학과를 쓰는 학생에게 경쟁률 변화는 거의 소식이 아니고, 4등급 아래 학과를 쓰는 학생에게는 실제로 영향이 있습니다.</strong> 정작 경쟁률 표를 들여다보며 불안해하는 쪽은 앞의 학생들인 경우가 많습니다.</p>
<div class="tw"><table>
<caption>전형 유형과 모집 규모별로 본, 경쟁률이 30% 넘게 오른 해의 합격선 이동입니다. 「상승 폭」은 등급이고, 클수록 빡빡해진 것입니다.</caption>
<thead><tr><th scope="col">묶음</th><th scope="col" class="num">쌍</th><th scope="col" class="num">상승 폭</th><th scope="col" class="num">올라간 비율</th></tr></thead>
<tbody>
${H.kind.map((k) => `<tr><th scope="row">${k.lab}</th><td class="num">${n0(k.big.n)}</td><td class="num strong">${up2(-k.big.dk)}</td><td class="num">${(k.big.up * 100).toFixed(0)}%</td></tr>`).join('\n')}
${H.size.map((s) => `<tr><th scope="row">${s.lab} 뽑는 곳</th><td class="num">${n0(s.big.n)}</td><td class="num strong">${up2(-s.big.dk)}</td><td class="num">${(s.big.up * 100).toFixed(0)}%</td></tr>`).join('\n')}
</tbody></table></div>
<p>교과가 종합보다 크게 흔들립니다(${Math.abs(H.kind[0].big.dk).toFixed(2)} 대 ${Math.abs(H.kind[1].big.dk).toFixed(2)}등급). 교과는 내신 줄 세우기가 곧 합격선이라 지원자가 늘면 바로 컷에 닿지만, 종합은 서류와 면접이 사이에 끼어 있어 한 겹 걸러집니다. <strong>종합 지원자에게 경쟁률은 교과 지원자보다 더 먼 이야기입니다.</strong> 모집 규모는 생각만큼 크게 가르지 않았습니다.</p>

<h3>그래서 2027은</h3>
<p>올해 경쟁률 변화를 위 표에 대 보았습니다. 낱낱의 학과를 맞히려는 것이 아니라 판이 어느 쪽으로 기울었는지만 보는 것이고, 그 학과가 앉은 등급대의 값을 씁니다.</p>
<div class="cards">
  <div class="card"><p class="k">경쟁률이 30% 넘게 오른 학과</p><p class="v">${(H.p27.dist[6].share * 100).toFixed(0)}%</p><p class="n">이어진 ${n0(H.p27.n)}곳 가운데 ${n0(H.p27.dist[6].n)}곳</p></div>
  <div class="card"><p class="k">우리 학생이 쓴 곳 가운데</p><p class="v">${(H.p27.mineDist[6].share * 100).toFixed(0)}%</p><p class="n">${n0(H.p27.mineN)}곳 가운데 ${n0(H.p27.mineDist[6].n)}곳</p></div>
  <div class="card"><p class="k">예상 합격선 상승 · 전체</p><p class="v">${up2(-H.p27.shift)}</p><p class="n">등급, 중앙값 · ${(H.p27.up * 100).toFixed(0)}%가 올라가는 쪽</p></div>
  <div class="card"><p class="k">예상 합격선 상승 · 우리</p><p class="v">${up2(-H.p27.mineShift)}</p><p class="n">등급, 중앙값 · ${(H.p27.mineUp * 100).toFixed(0)}%가 올라가는 쪽</p></div>
</div>
<p>중앙값으로는 ${Math.abs(H.p27.shift).toFixed(2)}등급, 우리 학생이 쓴 곳은 ${Math.abs(H.p27.mineShift).toFixed(2)}등급입니다. <strong>판 전체로는 지난해와 크게 다르지 않은 해입니다.</strong> 우리 쪽이 조금 더 빡빡한 것은 4절에서 본 대로 지원이 호남권 국립대에 몰려 있고, 그쪽이 마침 경쟁률이 오른 자리이기 때문입니다.</p>
<p>다만 중앙값이 조용하다고 모두가 조용한 것은 아닙니다. 우리 학생이 쓴 곳 가운데 경쟁률이 크게 오르고, 작년 합격선으로 보아 흔들릴 만한 자리를 골라 두었습니다.</p>
<div class="tw"><table>
<caption>우리 학생이 지원한 학과 가운데 경쟁률이 30% 넘게 오른 곳입니다. 「예상」은 지난 다섯 해에 같은 등급대에서 같은 정도로 경쟁률이 올랐을 때의 합격선 이동 중앙값으로, <strong>예측이 아니라 과거의 평균적 반응</strong>입니다. 값이 클수록 합격선이 올라가는 쪽입니다. 실제로는 이 값의 양쪽으로 크게 흩어집니다.</caption>
<thead><tr><th scope="col">대학 · 모집단위</th><th scope="col" class="num">작년 컷</th><th scope="col" class="num">경쟁률</th><th scope="col" class="num">변화</th><th scope="col" class="num">예상 상승</th></tr></thead>
<tbody>
${H.watch.map((w) => `<tr><th scope="row">${w.u}<small>${w.d} · ${w.t}</small></th><td class="num">${w.k26.toFixed(2)}</td><td class="num">${r2(w.r26)}<small>→ ${r2(w.r27)}</small></td><td class="num">${pct(w.c)}</td><td class="num strong">${up2(-w.shift)}</td></tr>`).join('\n')}
</tbody></table></div>
<p>모두 중하위 등급대의 지역 국립대·사립대 학과입니다. 앞에서 본 대로 <strong>경쟁률 변화가 합격선에 가장 잘 옮겨붙는 자리</strong>이기도 합니다. 이 학과들을 쓴 학생과는 한 번 더 이야기를 나눠 둘 만합니다. 반대로 서울권 상위 학과를 쓴 학생에게는, 경쟁률이 올랐다는 소식을 전할 때 위 그림의 왼쪽 막대를 함께 보여 주는 편이 낫겠습니다.</p>

<h2>6. 우리 학교는 그 안에서 어디쯤인가</h2>
${histSvg(P, MINE, A.d, D.mine.d)}
<p>전체와 우리 학생이 쓴 학과의 변화율 분포를 겹쳐 본 것입니다. 모양은 닮았지만 <strong>우리 쪽이 오른쪽으로 조금 밀려 있습니다.</strong> 중앙값이 전체 ${pct(A.d)}인데 우리는 ${pct(D.mine.d)}이고, 경쟁률이 오른 자리의 비율도 전체 ${(A.up * 100).toFixed(0)}%에 견줘 우리는 ${(D.mine.up * 100).toFixed(0)}%입니다.</p>
<p>크지는 않지만 방향이 분명한 차이입니다. 앞에서 본 대로 <strong>호남권과 지역 국립대의 교과·종합이 오른 해</strong>인데, 우리 학생 지원이 바로 그쪽에 몰려 있기 때문입니다. 전국 평균이 제자리라는 말을 우리 교실에 그대로 옮기기 어려운 까닭이 여기 있습니다.</p>

<h2>7. 우리 학생이 쓴 대학</h2>
<div class="tw"><table>
  <caption>우리 학생 지원이 있는 대학 가운데, 견줄 쌍이 20개 이상인 곳입니다. 「지원」은 우리 학교 지원 건수입니다.<br>「경쟁률」 칸은 학과마다의 변화율을 모아 중앙값을 낸 것이라, 왼쪽 두 칸의 중앙값 차이와 방향이 다를 수 있습니다 — 많이 오른 학과가 적게 내린 학과보다 많으면 그렇게 됩니다.</caption>
  <thead><tr><th scope="col">대학</th><th scope="col" class="num">지원</th><th scope="col" class="num">쌍</th><th scope="col" class="num">2026</th><th scope="col" class="num">2027</th><th scope="col" class="num">경쟁률</th><th scope="col" class="num">모집인원</th></tr></thead>
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
