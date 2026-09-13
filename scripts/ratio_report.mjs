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
      quota: r[C['모집']], rate: r[C['경쟁률']], applied: r[C['지원']] };
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
          q26: p.quota, a26: p.applied, r26: p.rate });
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
};
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
fs.writeFileSync(path.join(ROOT, 'scripts/.ratio_data.json'), JSON.stringify(D));
console.log(`우리 학생이 쓴 학과 ${D.mine.n}쌍 · 대학 표 ${D.byuniv.length}곳`);

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
  <p class="lede">2026 입시 결과와 2027 최종 경쟁률을 같은 대학·전형·모집단위끼리 맞대어 본 결과입니다. 견줄 수 있었던 것은 ${n0(A.n)}쌍, ${D.univs}개&nbsp;대학입니다. 기회균형·농어촌 같은 정원외 전형은 빼고&nbsp;봤습니다.</p>
</header>

<h2>한눈에</h2>
<div class="cards">
  <div class="card"><p class="k">전체 경쟁률 중앙값</p><p class="v">${r2(A.r26)} → ${r2(A.r27)}</p><p class="n">${pct(A.d)} · 거의 제자리</p></div>
  <div class="card"><p class="k">오른 줄</p><p class="v">${(A.up * 100).toFixed(0)}%</p><p class="n">${n0(A.n)}쌍 가운데 절반 남짓</p></div>
  <div class="card"><p class="k">교과 ↔ 논술</p><p class="v">${pct(K[0].d)} / ${pct(K[2].d)}</p><p class="n">방향이 정반대</p></div>
  <div class="card"><p class="k">우리 학생이 쓴 학과</p><p class="v">${pct(D.mine.d)}</p><p class="n">${D.mine.n}쌍 · 전체보다 빡빡</p></div>
</div>
<p>총계만 보면 작년과 다를 바 없어 보입니다. 그런데 안을 들여다보면 방향이 크게 갈립니다. <strong>전형 유형</strong>이 가장 크게 가르고, 그다음이 <strong>권역</strong>입니다.</p>

<h2>1. 전형 유형 — 교과는 빠지고 논술은 몰렸다</h2>
<div class="tw"><table>
  <caption>2026 대비 2027 최종 경쟁률 변화율의 중앙값. 막대는 0을 가운데 두고 왼쪽이 하락, 오른쪽이 상승입니다.</caption>
  <thead><tr><th scope="col">전형 유형</th><th scope="col">변화</th><th scope="col">중앙 변화율</th><th scope="col">쌍</th></tr></thead>
  <tbody>
${dbar(kindRows)}
  </tbody>
</table></div>
<p>교과가 8% 남짓 빠지는 동안 논술은 15% 올랐습니다. 종합은 그 사이에서 소폭 올랐고요. 수시에서 <strong>교과의 문턱이 낮아지고 논술 쏠림이 심해졌다</strong>는 이야기인데, 이것이 전국에서 고르게 일어난 일은 아닙니다.</p>

<h2>2. 권역 — 수도권과 호남이 반대로 움직였다</h2>
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

<h2>3. 모집인원 — 경쟁률을 움직인 것은 지원자보다 모집인원이었다</h2>
<div class="tw"><table>
  <caption>모집인원을 10% 넘게 줄인 곳 · 비슷한 곳 · 10% 넘게 늘린 곳으로 나눠 봤습니다.</caption>
  <thead><tr><th scope="col">2027 모집인원</th><th scope="col" class="num">쌍</th><th scope="col" class="num">모집인원</th><th scope="col" class="num">지원자</th><th scope="col" class="num">경쟁률</th></tr></thead>
  <tbody>
${quotaRows}
  </tbody>
</table></div>
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

<h2>4. 우리 학생이 쓴 대학</h2>
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
  <p>중앙값을 쓴 것은 평균이 소수 모집 학과의 극단값에 끌려가기 때문입니다. 「크게 오른 곳」 표에서 10명 이상만 고른 것도 같은 이유입니다.</p>
</div>

<footer>
  <p>자료 — 2027 수시 최종 경쟁률(대학 발표) · 2026 대입 입시 결과. 학생 개인 정보는 들어 있지 않고, 「지원」 칸은 우리 학교 지원 건수를 대학 단위로 센 것입니다.</p>
  <p>나주고등학교 3학년 · <code>node scripts/ratio_report.mjs</code> 로 다시 만듭니다</p>
</footer>
</div>
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, '경쟁률분석.html'), html);
console.log(`경쟁률분석.html  ${(html.length / 1024).toFixed(0)}KB`);
