/**
 * 학과 탐색 — 같은 (대학·학과)를 순위나 후보에 둔 학생을 모아 본다.
 * =====================================================================
 * 상담에서 자주 나오는 물음이 「이 학과 쓰는 애가 우리 반에 또 있나」다.
 * 여태는 학생을 하나씩 눌러 훑어야 했다. 여기서는 학과가 줄이 되고
 * 학생이 칩이 된다 — 몰린 학과(같은 학과 네 명!)가 위로 온다.
 *
 * **교사 전용이다.** 학생 화면에는 다른 학생이 절대 보이지 않는다(CONTRACT).
 * 보관(archive)은 뺀다 — 올해 안 넣기로 한 지원이다.
 * 반 선택은 일정판과 같은 선택(store.selection.cls)을 따른다.
 */
import * as store from './store.js';
import { fillTrend } from './match.js';
import { rate1, minReqShort } from './text.js';
import { fitCurve, density, percentile, pctText } from './confidence.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const tidy = (s) => String(s || '').trim();
const shortUniv = (n) => String(n || '').replace(/\s*[-–—]\s*.*$/, '');
const g2 = (n) => (n == null || n === '' ? null : Number(n).toFixed(2));

let query = '';
let backBtn = null;    // 학생 보드로 건너뛴 뒤 「탐색으로」 돌아오는 단추
let backScroll = 0;

/*
 * 칩으로 학생 보드에 다녀오면 **돌아올 길**이 있어야 한다. 화면 단추 줄에
 * 「← 탐색으로」를 만들어 두고, 건너뛸 때만 보인다. 돌아오면 보던 자리
 * (찾기 글·스크롤)가 그대로다.
 */
function ensureBackBtn() {
  if (backBtn) return;
  const bar = document.querySelector('.tabs.views');
  if (!bar) return;
  backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn back-explore';
  backBtn.textContent = '← 탐색으로';
  backBtn.hidden = true;
  backBtn.onclick = () => {
    backBtn.hidden = true;
    const b = document.getElementById('view-explore');
    if (b) b.click();
    setTimeout(() => window.scrollTo(0, backScroll), 60);
  };
  bar.appendChild(backBtn);
}

export function start() {
  store.on('change', render);
  ensureBackBtn();
  render();
}

/** 학생 보드로 건너뛴다 — 돌아올 자리를 기억하고 「← 탐색으로」를 켠다. */
function goStudent(hak) {
  backScroll = window.scrollY;
  // 화면을 먼저 보드로 바꾼다 — 탐색이 보이는 채로 select 를 부르면
  // 탐색이 다시 그려지며 방금 켠 돌아가기 단추를 도로 숨긴다.
  const b = document.getElementById('view-board');
  if (b) b.click();
  store.select({ hak, appId: '' });
  if (backBtn) backBtn.hidden = false;
}

/**
 * 학과 검토판 — 전형별 자료 한 표, 생각 있는 학생 한 표.
 * 값은 전부 잰 값이다(카드 상세와 같은 summary 에서 온다). 어림·판정은
 * 여기 없다 — 견주는 눈은 상담이 갖는다.
 */
function deptDetail({ list, order }) {
  const box = el('div', 'dept-detail');

  // 1. 전형별 자료 — 우리 학생들이 실제로 쓴 전형만
  const types = new Map();
  for (const x of list) {
    const t = x.app.typeSub || x.app.typeName || '전형 미상';
    if (!types.has(t)) types.set(t, x.app);
  }
  {
    const tw = el('div', 'tw');
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const h of ['전형', '올해 모집', '경쟁률', '실질', '70%컷', '50%컷', '최저', '작년 충원율']) {
      hr.appendChild(el('th', '', h));
    }
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const [t, app] of types) {
      const sum = store.summary(app) || {};
      const mo = sum.mojip;
      const ft = fillTrend(mo);
      const minTxt = app.minReqText || (mo && mo.minReq) || '';
      const tr = document.createElement('tr');
      tr.appendChild(el('th', 'rowhead', t));
      tr.appendChild(el('td', 'num', sum.quotaNow != null ? `${sum.quotaNow}명` : '—'));
      const yr = sum.year && sum.year !== 2026 ? ` (${sum.year})` : '';
      tr.appendChild(el('td', 'num', sum.rate != null ? `${rate1(sum.rate)}:1${yr}` : '—'));
      tr.appendChild(el('td', 'num', sum.real && sum.real.value != null ? `${rate1(sum.real.value)}:1` : '—'));
      tr.appendChild(el('td', 'num', sum.cut != null ? `${g2(sum.cut)}${yr}` : '—'));
      tr.appendChild(el('td', 'num', sum.cut50 != null ? g2(sum.cut50) : '—'));
      const short = minReqShort(minTxt);
      const minCell = el('td', '', short || (minTxt ? '있음' : (app.minReq === false ? '없음' : '—')));
      if (minTxt) minCell.title = String(minTxt);
      tr.appendChild(minCell);
      tr.appendChild(el('td', 'num', ft.length && ft[0].fillPct != null ? `${ft[0].fillPct}%` : '—'));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tw.appendChild(table);
    box.appendChild(tw);
  }

  // 2. 생각 있는 학생 — 자리·전형·내신을 한 표로. 줄을 누르면 그 학생 보드.
  {
    const tw = el('div', 'tw');
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const h of ['학생', '자리', '전형', '전교과', '환산']) hr.appendChild(el('th', '', h));
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const x of list.slice().sort((a, b) => order(a) - order(b)
      || String(a.student.hak).localeCompare(String(b.student.hak)))) {
      const tr = document.createElement('tr');
      tr.className = 'stu-row';
      tr.tabIndex = 0;
      tr.appendChild(el('th', 'rowhead', `${x.student.hak} ${tidy(x.student.name)}`));
      tr.appendChild(el('td', '', slotWord(x.app)));
      tr.appendChild(el('td', '', x.app.typeSub || x.app.typeName || '—'));
      const whole = store.wholeGrade(x.student);
      tr.appendChild(el('td', 'num', whole != null ? g2(whole) : '—'));
      /*
       * `Number(null)` 은 0 이다 — myScore 가 비면(종합전형 등) 환산 칸에
       * 0.00 이 찍혀 1등급보다 좋은 성적으로 읽힌다. 등급에 0 은 없다.
       */
      const conv = Number(x.app.myScore && x.app.myScore.grade);
      tr.appendChild(el('td', 'num', Number.isFinite(conv) && conv > 0 ? g2(conv) : '—'));
      const go = () => goStudent(x.student.hak);
      tr.onclick = go;
      tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tw.appendChild(table);
    box.appendChild(tw);
    box.appendChild(el('p', 'hint',
      '전형이 다르면 환산 잣대도 달라 세로로 곧장 견주기 어렵습니다. 줄을 누르면 그 학생의 보드로 갑니다.'));
  }

  // 3. 가상 분포 — 접어 둔다. 표가 주역이고 이건 어림이다.
  const dist = distBlock({ list });
  if (dist) box.appendChild(dist);

  return box;
}

/* ── 가상 분포 그림 ────────────────────────────────────────────────
 *
 * **먼저 이 그림이 무엇이 아닌지 적는다.** 합격 확률이 아니다. 입결은 대학이
 * 공개한 요약값 두 개(50%컷·70%컷)뿐이고, 합격자 개개인의 점수가 없다. 여기
 * 그려지는 곡선은 그 두 분위점에 정규분포를 맞춘 **가정**이지 잰 것이 아니다
 * (ARCHITECTURE §6).
 *
 * 그런데도 그리는 까닭 — 표의 「70%컷 5.60」 옆에 학생의 「5.20」이 서 있으면,
 * 그 둘 사이가 얼마나 되는 자리인지가 안 읽힌다. 폭이 0.1인 전형과 0.9인 전형에서
 * 같은 0.4 차이가 전혀 다른 뜻인데 표는 그 말을 못 한다.
 *
 * **그릴 만한지 재 보고 넣었다.** 두 가지를 쟀다(2022~2026 입결 75,592행).
 *
 *   1. **모양을 몰라도 되는가.** 같은 두 분위점에 정규분포 대신 로지스틱·t(5)를
 *      맞춰 보면, 안정/적정/소신/상향 판정이 갈리는 것이 각각 **0.7% · 1.2%**,
 *      백분위는 중앙 0.2~0.3%p(95% 1.5~2.0%p)밖에 안 움직인다. 두 분위점을 지나는
 *      곡선은 어떤 모양을 골라도 그 언저리를 지난다. **모양은 약한 고리가 아니다.**
 *
 *   2. **약한 고리는 해다.** 같은 전형의 작년 곡선 대신 재작년 곡선으로 재면
 *      백분위가 중앙 **13.1%p**(75% 28.4 · 95% 55.3) 움직이고 판정은 **45.1%**가
 *      갈린다(이웃한 두 해가 다 있는 31,163 쌍). 모양을 바꾼 것보다 40배 크다.
 *      그래서 **한 해짜리 매끈한 곡선 하나로 그리지 않는다** — 해마다의 곡선을
 *      옅게 겹쳐 그려서, 이 그림이 해마다 얼마나 달라지는지를 같이 보이게 한다.
 *
 * 그리고 **잰 데와 가정한 데를 선으로 가른다.** 두 컷 사이(50%컷~70%컷)만 실선·
 * 진한 면이고 그 밖은 점선·옅은 면이다. 학생이 두 컷 사이에 서는 일은 드물다 —
 * 50%컷보다 0.5등급 아래면 17.9%, 1등급 아래면 4.8%뿐이다. **이 그림에서 학생은
 * 대개 가정한 쪽에 선다.** 그걸 안 가르면 가정을 자료로 읽게 된다.
 *
 * 표를 밀어내지 않도록 접어 둔다 — 상담에서 읽는 것은 숫자다(ARCHITECTURE §7).
 */
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k of Object.keys(attrs || {})) {
    if (attrs[k] != null) n.setAttribute(k, String(attrs[k]));
  }
  return n;
};

const VW = 320;          // viewBox 폭 — 화면 폭에 맞춰 늘어난다
const BASE = 60;         // 가로축 y
const TOP = 16;          // 봉우리 y
const STEM = 11;         // 학생 막대가 닿는 y
const PAD = 8;

/**
 * 사람 하나에 점 하나. 같은 학과에 전형을 달리 두 번 넣어도 한 번만 센다.
 * 등급은 store.gradeOf 하나로 잰다 — 환산이 없으면(종합전형 등) 전교과로
 * 대신하고 잣대를 함께 적는다. 카드의 어림과 같은 값이어야 한다.
 */
function marksOf(students, rows, curve) {
  const seen = new Set();
  const out = [];
  for (const x of students) {
    const hak = String(x.student.hak);
    if (seen.has(hak)) continue;
    seen.add(hak);
    const g = store.gradeOf(x.app);
    if (g.value == null) continue;
    const est = curve ? percentile(rows, g.value) : null;
    out.push({
      hak, name: tidy(x.student.name), g: g.value,
      scale: g.scale,
      pct: est ? est.pct : null,
    });
  }
  return out.sort((a, b) => a.g - b.g);
}

/** 곡선 하나를 꺾은선 좌표로. 봉우리를 1 로 맞춘 높이라 넓이는 뜻이 없다. */
function curvePts(f, X, from, to, step) {
  const pts = [];
  for (let g = from; g <= to + 1e-9; g += step) {
    pts.push([X(g), BASE - (BASE - TOP) * density(g, f.mu, f.sd)]);
  }
  return pts;
}
const asLine = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const asArea = (pts) => `${asLine(pts)} L${pts[pts.length - 1][0].toFixed(1)},${BASE} L${pts[0][0].toFixed(1)},${BASE} Z`;

/**
 * 전형 한 칸. 곡선·잰 구간·해마다의 옅은 곡선·학생 자리.
 * 그릴 수 없으면 **왜 못 그리는지** 적는다 — 빈 칸은 「자료가 없나 보다」로 읽힌다.
 */
function distPanel(p, lo, hi) {
  const box = el('div', 'dist-panel');
  const head = el('div', 'dist-title');
  head.appendChild(el('span', 'nm', p.type));
  box.appendChild(head);

  if (!p.f) {
    box.appendChild(el('p', 'hint', p.why));
    if (p.marks.length) {
      box.appendChild(el('p', 'dist-legend',
        p.marks.map((m) => `${m.hak} ${tidy(m.name)} ${g2(m.g)}(${m.scale})`).join(' · ')));
    }
    return box;
  }

  const X = (g) => PAD + ((g - lo) / (hi - lo)) * (VW - PAD * 2);
  const svg = sv('svg', {
    viewBox: `0 0 ${VW} 78`, class: 'dist-svg', role: 'img',
    'aria-label': `${p.type} 작년 합격자 분포 어림과 학생 ${p.marks.length}명의 자리`,
  });

  // 1. 가정한 면 — 전체. 옅게 깔고 위에 잰 구간을 덮는다.
  const all = curvePts(p.f, X, lo, hi, (hi - lo) / 160);
  svg.appendChild(sv('path', { d: asArea(all), class: 'dist-area-guess' }));

  // 2. 잰 구간 — 50%컷과 70%컷 사이. 여기만 자료가 말한 자리다.
  if (p.f.cut50 != null && p.f.cut70 > p.f.cut50) {
    const a = Math.max(lo, p.f.cut50);
    const b = Math.min(hi, p.f.cut70);
    if (b > a) {
      const seg = curvePts(p.f, X, a, b, Math.max((b - a) / 40, 0.002));
      svg.appendChild(sv('path', { d: asArea(seg), class: 'dist-area-known' }));
      svg.appendChild(sv('path', { d: asLine(seg), class: 'dist-line-known' }));
    }
    for (const c of [p.f.cut50, p.f.cut70]) {
      if (c < lo || c > hi) continue;
      svg.appendChild(sv('line', {
        x1: X(c), x2: X(c), y1: BASE, y2: BASE - (BASE - TOP) * density(c, p.f.mu, p.f.sd),
        class: 'dist-cut',
      }));
    }
  }

  /*
   * 3. 가정한 쪽 곡선은 **점선**이다. 실선과 점선이 잰 것과 가정한 것을 가른다.
   *    잰 구간 위에는 안 긋는다 — 덧그으면 점선이 실선을 덮어 구별이 사라진다.
   */
  const kLo = p.f.cut50 != null && p.f.cut70 > p.f.cut50 ? p.f.cut50 : null;
  const kHi = kLo != null ? p.f.cut70 : null;
  for (const [a, b] of (kLo == null ? [[lo, hi]] : [[lo, Math.min(kLo, hi)], [Math.max(kHi, lo), hi]])) {
    if (!(b > a)) continue;
    svg.appendChild(sv('path', {
      d: asLine(curvePts(p.f, X, a, b, Math.max((b - a) / 80, 0.002))), class: 'dist-line-guess',
    }));
  }

  // 4. 해마다의 곡선을 옅게 겹친다 — 이 그림이 해마다 얼마나 달라지는지가 약한 고리다
  for (const r of p.rows.slice(-3)) {
    const one = fitCurve([r]);
    if (!one) continue;
    svg.appendChild(sv('path', {
      d: asLine(curvePts(one, X, lo, hi, (hi - lo) / 90)), class: 'dist-line-year',
    }));
  }

  // 5. 가로축과 등급 눈금
  svg.appendChild(sv('line', { x1: PAD, x2: VW - PAD, y1: BASE, y2: BASE, class: 'dist-axis' }));
  for (let g = Math.ceil(lo); g <= Math.floor(hi); g += 1) {
    svg.appendChild(sv('line', { x1: X(g), x2: X(g), y1: BASE, y2: BASE + 3, class: 'dist-axis' }));
    const t = sv('text', { x: X(g), y: BASE + 13, class: 'dist-tick' });
    t.textContent = String(g);
    svg.appendChild(t);
  }

  // 6. 학생 자리 — 사람마다 막대 하나와 번호. 이름은 아래 줄에 적는다(겹치지 않게).
  p.marks.forEach((m, i) => {
    const x = Math.min(Math.max(X(m.g), PAD), VW - PAD);
    svg.appendChild(sv('line', { x1: x, x2: x, y1: BASE, y2: STEM + 4, class: 'dist-stem' }));
    svg.appendChild(sv('circle', { cx: x, cy: STEM, r: 4.4, class: 'dist-dot' }));
    const n = sv('text', { x, y: STEM + 2.4, class: 'dist-num' });
    n.textContent = String(i + 1);
    svg.appendChild(n);
  });

  box.appendChild(svg);

  const yrs = p.f.years.map((y) => String(y).slice(2)).join('·');
  const bits = [];
  if (p.f.cut50 != null) {
    bits.push(`실선 = 대학이 낸 두 컷 ${g2(p.f.cut50)}~${g2(p.f.cut70)} 사이`
      + `(${yrs}${p.f.years.length > 1 ? ' 평균' : ''}) · 점선 쪽은 가정`);
  } else {
    bits.push(`70%컷 ${g2(p.f.cut70)} (${yrs}) · 50%컷이 없어 폭은 전체 중앙값 0.38 로 때웠습니다`);
  }
  if (p.f.inverted) {
    bits.push('50%컷과 70%컷이 뒤집혀 있어 폭을 알 수 없습니다 — 한계값(0.18)으로 그렸습니다');
  } else if (p.f.clamped) {
    bits.push(p.f.raw < p.f.sd
      ? '두 컷이 거의 붙어 있어 폭은 자료가 아니라 한계값(0.18)입니다'
      : '두 컷이 너무 벌어져 폭을 한계값(1.5)으로 눌렀습니다');
  }
  if (p.rows.length >= 2) bits.push(`옅은 선은 해마다의 곡선 (${p.rows.slice(-3).map((r) => String(r.year).slice(2)).join('·')})`);
  box.appendChild(el('p', 'hint', bits.join(' · ')));

  if (p.marks.length) {
    // 한 줄에 몰아 적으면 번호와 이름이 엉킨다. 사람마다 제 줄을 준다.
    const legend = el('div', 'dist-legend');
    p.marks.forEach((m, i) => {
      const where = m.pct == null ? '' : ` — ${pctText(m.pct)}`;
      legend.appendChild(el('div', '', `${i + 1}. ${m.hak} ${tidy(m.name)} ${g2(m.g)}(${m.scale})${where}`));
    });
    box.appendChild(legend);
  }
  return box;
}

/**
 * 학과 안 전형별 가상 분포. 접어 둔다 — 표가 주역이다.
 * 가로축(등급)은 전형끼리 같게 둬서 칸이 나란히 읽히게 하되, **학생의 값은
 * 전형마다 환산 잣대가 달라** 가로로 곧장 견주면 안 된다는 것을 함께 적는다.
 */
function distBlock({ list }) {
  const byType = new Map();
  for (const x of list) {
    const t = x.app.typeSub || x.app.typeName || '전형 미상';
    if (!byType.has(t)) byType.set(t, { app: x.app, students: [] });
    byType.get(t).students.push(x);
  }

  const panels = [];
  for (const [type, v] of byType) {
    const sum = store.summary(v.app) || {};
    const rows = (sum.mine || []).filter((r) => r.g70 != null);
    const f = rows.length ? fitCurve(rows) : null;
    let why = '';
    if (!f) {
      if (!sum.linked) why = '이 학과 입결을 찾지 못해 그릴 수 없습니다.';
      else if (sum.isNew) why = '올해 처음 뽑는 전형이라 그릴 작년 분포가 없습니다.';
      else if (sum.typeFit === 'none') why = '지원한 전형을 가려내지 못해 그릴 수 없습니다.';
      else why = '70%컷이 비어 있어 그릴 수 없습니다.';
    }
    panels.push({ type, sum, rows, f, why, marks: marksOf(v.students, rows, f) });
  }
  if (!panels.some((p) => p.f)) return null;

  // 가로축은 전형끼리 같게. 곡선은 ±2.2σ 까지, 학생은 다 들어오게.
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of panels) {
    if (p.f) { lo = Math.min(lo, p.f.mu - 2.2 * p.f.sd); hi = Math.max(hi, p.f.mu + 2.2 * p.f.sd); }
    for (const m of p.marks) { lo = Math.min(lo, m.g); hi = Math.max(hi, m.g); }
  }
  lo = Math.max(0.5, Math.floor((lo - 0.3) * 2) / 2);
  hi = Math.min(9.5, Math.ceil((hi + 0.3) * 2) / 2);
  if (!(hi > lo)) return null;

  const fold = document.createElement('details');
  fold.className = 'dist-fold';
  const sum = document.createElement('summary');
  sum.textContent = '가상 분포로 보기 — 작년 합격자 사이에서 우리 학생이 어디쯤인가';
  fold.appendChild(sum);
  fold.appendChild(el('p', 'section-label',
    '두 컷(50%컷·70%컷)에 정규분포를 맞춰 그린 가정입니다. 합격 확률이 아닙니다 —'
    + ' 작년 합격자들 사이에서 어디쯤인가일 뿐입니다.'));
  fold.appendChild(el('p', 'hint',
    '한계 셋. ① 최종등록자 기준이라 추가합격 막차는 더 낮습니다.'
    + ' ② 적게 뽑는 전형일수록 컷이 한두 사람에 좌우되어 곡선이 흔들립니다.'
    + ' ③ 대학별 반영교과 차이는 안 들어 있습니다.'
    + ' 가로축은 전형끼리 같게 뒀지만 학생의 값은 전형마다 환산 잣대가 달라'
    + ' 칸을 넘어 가로로 곧장 견주면 안 됩니다. 출발점이지 결론이 아닙니다.'));
  for (const p of panels) fold.appendChild(distPanel(p, lo, hi));
  return fold;
}

/** 자리 이름 — 학생 칩에 붙는 짧은 말. */
function slotWord(app) {
  const p = store.placementOf(app.id);
  if (p.slot === 'rank' && p.rank) return `${p.rank}순위`;
  if (p.slot === 'tray') return '전문대';
  return '후보';
}

function render() {
  const main = $('#explore');
  if (!main || main.hidden) return;
  if (backBtn) backBtn.hidden = true;
  main.textContent = '';

  if (!store.state.ready) {
    main.appendChild(el('p', 'empty-state', '자료를 불러오는 중입니다.'));
    return;
  }

  const { cls } = store.selection;
  const students = store.studentsOf(cls);

  // (대학·학과)로 묶는다. 전형이 달라도 같은 학과면 한 줄이다 —
  // 「이 학과에 누가 있나」가 물음이지 전형별 나눔이 아니다. 전형은 칩 제목에 남긴다.
  const groups = new Map();
  for (const s of students) {
    for (const app of store.appsOf(s.hak)) {
      if (store.placementOf(app.id).slot === 'archive') continue;
      const key = `${shortUniv(app.univ)}${tidy(app.dept)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ student: s, app });
    }
  }

  const box = el('section', 'panel');
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '학과 탐색'));
  const count = el('span', 'count num', '');
  head.appendChild(count);
  box.appendChild(head);
  box.appendChild(el('p', 'section-label',
    '같은 학과를 순위나 후보에 둔 학생을 한 줄로 모았습니다. 몰린 학과가 위에 옵니다.'
    + ' 학과 이름을 누르면 전형별 자료와 학생 검토판이 펼쳐지고, 학생을 누르면 그 학생의 보드로 갑니다.'));

  // 찾기 — 대학·학과 이름 글자로 거른다
  const line = el('div', 'field-in');
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = '대학이나 학과 이름으로 찾기';
  input.value = query;
  input.setAttribute('aria-label', '대학·학과 찾기');
  input.addEventListener('input', () => { query = input.value; drawRows(); });
  line.appendChild(input);
  box.appendChild(line);

  const stack = el('div', 'stack');
  box.appendChild(stack);

  const drawRows = () => {
    const qq = query.trim();
    // 몰린 학과가 위로 — 지원 수가 아니라 **사람 수**로 센다. 같은 학과에
    // 전형만 달리 두 번 지원해도 한 명이다.
    const now = [...groups.entries()]
      .map(([key, list]) => {
        const [univ, dept] = key.split('');
        return { univ, dept, list, n: new Set(list.map((x) => String(x.student.hak))).size };
      })
      .filter((r) => !qq || `${r.univ} ${r.dept}`.includes(qq))
      .sort((a, b) => (b.n - a.n)
        || a.univ.localeCompare(b.univ, 'ko') || a.dept.localeCompare(b.dept, 'ko'));
    count.textContent = `${cls ? `${cls}반` : '학년 전체'} · ${now.length}곳`;
    stack.textContent = '';
    if (!now.length) {
      stack.appendChild(el('p', 'empty-state',
        qq ? `「${qq}」에 닿는 학과가 없습니다.` : '지원이 아직 없습니다.'));
      return;
    }
    for (const r of now) stack.appendChild(deptRow(r));
  };

  drawRows();
  main.appendChild(box);
}

function deptRow({ univ, dept, list, n }) {
  const row = el('div', 'row explore-row');

  // 순위에 넣은 학생이 앞에 온다 — 진지한 순서대로 읽힌다
  const order = (x) => {
    const p = store.placementOf(x.app.id);
    return p.slot === 'rank' ? (p.rank || 9) : p.slot === 'tray' ? 20 : 30;
  };

  const txt = el('div', 'txt');
  /*
   * 학과 이름을 누르면 **학과 검토판**이 그 줄 아래로 펼쳐진다.
   * 처음에는 대표 학생 한 명의 카드를 열었는데, 그 카드에는 그 학생의
   * 성적이 붙어 있어 물음(「이 학과에 생각 있는 애들을 견줘 보자」)과
   * 어긋났다. 검토판은 전형별 자료 표와 학생 표 — 학과가 주인공이다.
   */
  let detail = null;
  /*
   * 대학과 학과를 **두 줄로** 적는다. 한 줄로 이으면 「국립목포대학교(목포)
   * 자율전공학부」처럼 긴 이름이 좁은 칸에서 아무 데서나 접혀 줄마다 키가 다르고,
   * 훑는 눈이 학과 이름을 찾아 헤맨다. 카드·점검판이 이미 쓰는 꼴(대학 위,
   * 학과 아래)과도 맞는다. 단추 하나라 누르는 자리는 두 줄 다다.
   */
  const nameBtn = el('button', 'linkish uni-name');
  nameBtn.appendChild(el('span', 'u', univ));
  nameBtn.appendChild(el('span', 'd', dept));
  nameBtn.type = 'button';
  nameBtn.title = '전형별 자료·학생 검토판 펴기';
  nameBtn.setAttribute('aria-expanded', 'false');
  nameBtn.onclick = () => {
    if (!detail) {
      detail = deptDetail({ univ, dept, list, order });
      row.appendChild(detail);
    } else {
      detail.hidden = !detail.hidden;
    }
    nameBtn.setAttribute('aria-expanded', String(!detail.hidden));
  };
  const nameLine = el('div', 'univ');
  nameLine.appendChild(nameBtn);
  txt.appendChild(nameLine);

  /*
   * **잰 값만 적는다 — 범위로.** 작년 70%컷은 전형별로 다르면 낮은~높은 값,
   * 우리 학생 내신은 전교과(전형 무관 공통 잣대) 낮은~높은 값이다.
   * 유의검정은 안 한다(ARCHITECTURE §6) — 요약값뿐이라 p값은 지어내기다.
   * 전형별 컷 내역은 제목(title)에 있다.
   */
  const cuts = [];
  const seenType = new Set();
  for (const x of list) {
    const t = x.app.typeSub || x.app.typeName || '';
    if (seenType.has(t)) continue;
    seenType.add(t);
    const sum = store.summary(x.app);
    if (sum && sum.cut != null) cuts.push({ type: t, cut: Number(sum.cut), year: sum.year });
  }
  const whole = [...new Map(list.map((x) => [String(x.student.hak),
    store.wholeGrade(x.student)])).values()]
    .filter((v) => v != null);
  // Number(null)=0 — myScore 가 빈 지원이 섞이면 환산 범위 아래끝이 0.00 이 된다
  const conv = [...new Map(list.map((x) => [String(x.student.hak),
    Number(x.app.myScore && x.app.myScore.grade)])).values()]
    .filter((v) => Number.isFinite(v) && v > 0);
  // 전교과(전형 무관 공통 잣대)가 있으면 그걸로, 없으면 전형별 환산으로 — 잣대를 적는다
  const grades = whole.length === n ? whole : conv;
  const scale = whole.length === n ? '전교과' : '환산';
  const bits = [`${n}명`];
  if (grades.length) {
    const lo = Math.min(...grades); const hi = Math.max(...grades);
    bits.push(lo === hi ? `${scale} ${g2(lo)}` : `${scale} ${g2(lo)}~${g2(hi)}`);
  }
  const sub = el('div', 'dept', bits.join(' · '));
  if (cuts.length) {
    const lo = Math.min(...cuts.map((c) => c.cut));
    const hi = Math.max(...cuts.map((c) => c.cut));
    const years = new Set(cuts.map((c) => c.year).filter(Boolean));
    const word = years.size === 1 ? ([...years][0] === 2026 ? '작년 70%컷' : `${[...years][0]} 70%컷`) : '70%컷';
    const cutEl = el('span', 'cutline', ` · ${word} ${lo === hi ? g2(lo) : `${g2(lo)}~${g2(hi)}`}`);
    cutEl.title = cuts.map((c) => `${c.type || '전형 미상'} ${g2(c.cut)}${c.year && c.year !== 2026 ? ` (${c.year})` : ''}`).join(' · ');
    sub.appendChild(cutEl);
  }
  txt.appendChild(sub);
  row.appendChild(txt);

  const pills = el('div', 'pills');
  /*
   * 같은 학과에 전형만 달리 두 번 지원한 학생은 칩 하나로 합친다 —
   * 물음이 「누가 있나」라 사람이 단위다. 가장 진지한 자리(순위)를 대표로 쓰고
   * 전형들은 제목(title)에 다 적는다.
   */
  const byStu = new Map();
  for (const x of list) {
    const k = String(x.student.hak);
    const have = byStu.get(k);
    if (!have) byStu.set(k, { ...x, types: [x.app.typeSub || x.app.typeName || ''] });
    else {
      have.types.push(x.app.typeSub || x.app.typeName || '');
      if (order(x) < order(have)) { have.app = x.app; }
    }
  }
  for (const x of [...byStu.values()].sort((a, b) => order(a) - order(b)
    || String(a.student.hak).localeCompare(String(b.student.hak)))) {
    const grade = g2(x.app.myScore && x.app.myScore.grade);
    const extra = x.types.filter(Boolean).length - 1;
    const chip = el('button', 'pill stu-chip',
      [`${x.student.hak} ${tidy(x.student.name)}`,
        slotWord(x.app) + (extra > 0 ? ` 외 ${extra}` : ''),
        grade ? `내신 ${grade}` : '']
        .filter(Boolean).join(' · '));
    chip.type = 'button';
    chip.title = [...new Set(x.types.filter(Boolean))].join(' · ');
    chip.onclick = () => goStudent(x.student.hak);
    pills.appendChild(chip);
  }
  row.appendChild(pills);
  return row;
}
