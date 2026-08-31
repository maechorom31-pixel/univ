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

export function start() {
  store.on('change', render);
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
    + ' 학생을 누르면 그 학생의 보드로 갑니다.'));

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
  const txt = el('div', 'txt');
  txt.appendChild(el('div', 'univ', `${univ} ${dept}`));
  txt.appendChild(el('div', 'dept', `${n}명`));
  row.appendChild(txt);

  const pills = el('div', 'pills');
  // 순위에 넣은 학생이 앞에 온다 — 진지한 순서대로 읽힌다
  const order = (x) => {
    const p = store.placementOf(x.app.id);
    return p.slot === 'rank' ? (p.rank || 9) : p.slot === 'tray' ? 20 : 30;
  };
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
      store.select({ hak: x.student.hak, appId: '' });
      const b = document.getElementById('view-board');
      if (b) b.click();
    };
    pills.appendChild(chip);
  }
  row.appendChild(pills);
  return row;
}
