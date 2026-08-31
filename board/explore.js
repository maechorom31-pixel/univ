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
    + ' 학생을 누르면 그 학생의 보드로, 학과 이름을 누르면 연도별 추이·충원 상세로 갑니다.'));

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
  // 학과 이름을 누르면 대표 지원의 상세(연도별 추이·충원·전형 방법)가 뜬다 —
  // 추이를 여기 또 그리지 않는다. 상세가 이미 그 표를 가진 화면이다.
  const best = list.slice().sort((a, b) => order(a) - order(b))[0];
  const nameBtn = el('button', 'linkish uni-name', `${univ} ${dept}`);
  nameBtn.type = 'button';
  nameBtn.title = '연도별 추이·충원 상세 열기';
  nameBtn.onclick = () => store.select({ appId: best.app.id });
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
    Number((x.student.naesin || {})['전교과'] ?? (x.student.naesin || {})['전교과(100)'])])).values()]
    .filter(Number.isFinite);
  const conv = [...new Map(list.map((x) => [String(x.student.hak),
    Number(x.app.myScore && x.app.myScore.grade)])).values()]
    .filter(Number.isFinite);
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
    chip.onclick = () => {
      backScroll = window.scrollY;
      // 화면을 먼저 보드로 바꾼다 — 탐색이 보이는 채로 select 를 부르면
      // 탐색이 다시 그려지며 방금 켠 돌아가기 단추를 도로 숨긴다.
      const b = document.getElementById('view-board');
      if (b) b.click();
      store.select({ hak: x.student.hak, appId: '' });
      if (backBtn) backBtn.hidden = false;
    };
    pills.appendChild(chip);
  }
  row.appendChild(pills);
  return row;
}
