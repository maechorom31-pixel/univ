/**
 * 반 보드 — 6칸 (P2)
 * =====================================================================
 * 왼쪽에 반과 학생, 오른쪽에 그 학생의 6칸. 한 학생을 끝내고 다음으로 넘어간다.
 *
 * 자리를 옮기는 방법을 둘 둔다.
 *   - 카드마다 놓인 선택 상자: 어느 기기에서나 되고 키보드로도 된다
 *   - 끌어다 놓기: 마우스가 있을 때 더 빠르다
 * 끌어다 놓기만 두면 터치 기기에서 손이 묶인다.
 *
 * 6칸이 찬 상태에서 그 자리에 다른 걸 놓으면 **원래 있던 것을 후보로 밀어낸다.**
 * 조용히 사라지지 않도록 무엇이 밀려났는지 화면에 남긴다.
 */
import * as store from './store.js';

const RANKS = [1, 2, 3, 4, 5, 6];
const SLOT_LABEL = { rank: '순위', pool: '후보', archive: '보관', tray: '전문대' };

const MY_CLASS_KEY = 'board.myClass';

let cls = '';        // 지금 보고 있는 반. ''이면 학년 전체
let myClass = '';    // 이 컴퓨터의 기본 반
let hak = '';
let notice = '';
let busy = false;

try { myClass = localStorage.getItem(MY_CLASS_KEY) || ''; } catch (err) { myClass = ''; }

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls2, text) => {
  const node = document.createElement(tag);
  if (cls2) node.className = cls2;
  if (text != null) node.textContent = text;
  return node;
};

/** 마지막 어절이 짧으면 앞 어절에 붙여 혼자 한 줄로 떨어지지 않게 한다. */
const tidy = (s) => String(s || '').replace(/ (?=[^ ]{1,4}$)/, ' ');

/** 받침을 보고 조사를 고른다. 화면에 `학부을(를)` 같은 표기를 내지 않기 위해서다. */
function josa(word, withBatchim, without) {
  const last = String(word || '').trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 ? withBatchim : without;
  return withBatchim;                      // 숫자·영문으로 끝나면 보수적으로
}

/** 알림에 쓸 짧은 이름 — 캠퍼스 괄호를 떼고 학과를 붙인다. */
const shortName = (app) => `${app.univ.replace(/\(.*/, '')} ${app.dept}`;

export function start() {
  store.on('change', (what) => {
    if (what === 'data') {
      const list = store.classes();
      if (!cls) cls = list.includes(myClass) ? myClass : (list[0] || '');
      renderRoster();
    }
    render();
  });
  render();
}

/* ── 반 · 학생 ────────────────────────────────────────────────── */

function renderRoster() {
  const tabs = $('#tabs');
  tabs.textContent = '';
  const list = store.classes();
  for (const c of list) {
    const b = el('button', 'btn', c === myClass ? `${c}반 · 기본` : `${c}반`);
    b.setAttribute('aria-pressed', String(c === cls));
    b.onclick = () => { cls = c; hak = ''; notice = ''; renderRoster(); render(); };
    tabs.appendChild(b);
  }
  if (list.length > 1) {
    const all = el('button', 'btn', '학년 전체');
    all.setAttribute('aria-pressed', String(cls === ''));
    all.onclick = () => { cls = ''; hak = ''; notice = ''; renderRoster(); render(); };
    tabs.appendChild(all);
  }

  // 학교 컴퓨터를 여럿이 나눠 쓰므로 이 컴퓨터가 늘 여는 반을 기억해 둔다.
  const scope = $('#scope');
  scope.textContent = '';
  if (cls && cls !== myClass) {
    scope.appendChild(el('span', '', myClass ? `기본은 ${myClass}반입니다.` : '기본 반이 정해져 있지 않습니다.'));
    const set = el('button', 'btn', `${cls}반을 기본으로`);
    set.onclick = () => {
      myClass = cls;
      try { localStorage.setItem(MY_CLASS_KEY, myClass); } catch (err) { /* 저장이 막혀도 이번엔 쓴다 */ }
      renderRoster();
    };
    scope.appendChild(set);
  } else if (!cls) {
    scope.appendChild(el('span', '', '학년 전체를 보는 중입니다.'));
  }

  const roster = $('#roster');
  roster.textContent = '';
  const students = store.studentsOf(cls);
  if (!students.length) {
    roster.appendChild(el('li', '', '이 반에 학생이 없습니다.'));
    return;
  }
  for (const s of students) {
    const apps = store.appsOf(s.hak);
    const ranked = apps.filter((a) => store.placementOf(a.id).slot === 'rank').length;
    const li = el('li');
    const b = el('button');
    b.setAttribute('aria-current', String(s.hak === hak));
    b.onclick = () => { hak = s.hak; notice = ''; renderRoster(); render(); };
    b.appendChild(el('span', 'hak num', s.hak));
    b.appendChild(el('span', 'nm', tidy(s.name)));
    const cnt = el('span', `cnt${ranked >= 6 ? ' full' : ''}`, `${ranked}/6`);
    cnt.title = `확정 ${ranked}건 · 지원 ${apps.length}건`;
    b.appendChild(cnt);
    li.appendChild(b);
    roster.appendChild(li);
  }
  $('#roster-count').textContent = `${students.length}명`;
}

/* ── 보드 ─────────────────────────────────────────────────────── */

function render() {
  const main = $('#board');
  main.textContent = '';

  if (!store.state.ready) {
    main.appendChild(skeleton());
    return;
  }
  if (store.state.error) main.appendChild(banner(store.state.error, true));
  if (store.state.unknownCols.length) {
    main.appendChild(banner(
      `엑셀에서 알아보지 못한 칸이 ${store.state.unknownCols.length}개 있습니다 — `
      + store.state.unknownCols.slice(0, 4).join(', '),
    ));
  }
  if (notice) main.appendChild(banner(notice));

  const student = store.state.students.get(hak);
  if (!student) {
    main.appendChild(hint('왼쪽에서 학생을 고르면 지원 현황이 나옵니다.'));
    return;
  }

  main.appendChild(header(student));

  const apps = store.appsOf(hak);
  const general = apps.filter((a) => a.univType !== '전문대' && a.univType !== '특수대');
  const others = apps.filter((a) => a.univType === '전문대' || a.univType === '특수대');
  const at = (r) => general.find((a) => {
    const p = store.placementOf(a.id);
    return p.slot === 'rank' && p.rank === r;
  });

  main.appendChild(label('지원 6칸'));
  const slots = el('div', 'slots');
  for (const r of RANKS) {
    const app = at(r);
    slots.appendChild(app ? card(app, r, student) : emptySlot(r));
  }
  main.appendChild(slots);

  const pool = general.filter((a) => store.placementOf(a.id).slot === 'pool');
  const archive = general.filter((a) => store.placementOf(a.id).slot === 'archive');

  main.appendChild(group('후보', pool, '아직 순위를 정하지 않은 지원입니다.', student));
  if (others.length) {
    main.appendChild(group('전문대 · 특수대', others,
      '수시 6회 제한 밖이라 순위를 매기지 않습니다.', student));
  }
  if (archive.length) main.appendChild(group('보관', archive, '', student));
}

function header(s) {
  const box = el('div', 'who');
  box.appendChild(el('div', 'name', `${s.hak} ${tidy(s.name)}`));
  const meta = el('div', 'meta');
  const bits = [];
  const all = s.naesin || {};
  const total = all['전교과'] ?? all['전교과(100)'];
  if (total != null) bits.push(`전교과 ${total}`);
  const sn = s.suneung || {};
  const order = ['국어', '수학', '영어', '탐구1', '탐구2'];
  const grades = order.map((k) => (sn[k] && sn[k].grade != null ? sn[k].grade : null));
  if (grades.some((g) => g != null)) {
    bits.push(`수능 ${grades.map((g) => (g == null ? '–' : g)).join('/')}`);
  }
  meta.textContent = bits.join('  ·  ') || '성적 정보가 없습니다';
  box.appendChild(meta);
  return box;
}

/* ── 카드 ─────────────────────────────────────────────────────── */

function card(app, rank, student) {
  const box = el('div', 'card');
  box.draggable = true;
  box.dataset.id = app.id;
  box.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', app.id);
    e.dataTransfer.effectAllowed = 'move';
  });

  if (rank) box.appendChild(el('div', 'rank', `${rank}순위`));
  box.appendChild(el('div', 'univ', tidy(app.univ.replace(/\s*[-–—]\s*.*$/, ''))));
  box.appendChild(el('div', 'dept', `${tidy(app.dept)} · ${app.typeSub || app.typeName || ''}`));
  box.appendChild(figures(app, student));
  box.appendChild(pills(app));
  box.appendChild(mover(app));
  return box;
}

const g2 = (n) => (n == null ? null : Number(n).toFixed(2));

/**
 * 견줘 볼 숫자를 나란히 놓는다 — 작년 컷 · 전교과 · 대학 환산.
 *
 * 차이값을 계산해 「여유 0.24」처럼 쓰지 않는다. 전교과 등급과 대학 환산 등급은
 * 애초에 같은 잣대가 아니라, 빼는 순간 자료가 말하지 않는 것을 말하게 된다.
 * 숫자를 그대로 두고 판단은 사람이 한다.
 */
function figures(app, student) {
  const wrap = el('div', 'figs');
  const add = (k, v) => {
    if (v == null) return;
    const box = el('div', 'fig');
    box.appendChild(el('span', 'k', k));
    box.appendChild(el('span', 'v num', v));
    wrap.appendChild(box);
  };

  // 카드에는 셋만 둔다. 넷을 넣으면 줄이 접혀 견주기가 어려워진다.
  // 50컷·연도별 추이는 카드를 눌러 여는 상세(P3)에서 본다.
  const s = store.summary(app);
  if (s.linked) add('70컷', g2(s.cut));
  const naesin = (student && student.naesin) || {};
  add('전교과', g2(naesin['전교과'] ?? naesin['전교과(100)']));

  const mine = app.myScore || {};
  if (mine.grade != null) add('환산', g2(mine.grade));
  else if (mine.score != null) add('환산점수', String(mine.score));

  return wrap;
}

function pills(app) {
  const wrap = el('div', 'pills');
  const add = (text, kind) => wrap.appendChild(el('span', `pill${kind ? ' ' + kind : ''}`, text));

  if (app.quota != null) add(`${app.quota}명`);

  const s = store.summary(app);
  if (!s.linked) {
    add(store.state.enriched ? '연결 안 됨' : '입결 불러오는 중', store.state.enriched ? 'warn' : 'wait');
  } else {
    if (s.year) add(`${String(s.year).slice(2)}입결`);
    if (s.rate != null) add(`${s.rate}:1`);
  }
  if (s.linked && s.cut == null) add('작년 컷 없음');

  const day = app.dates && (app.dates['면접'] || app.dates['실기'] || app.dates['논술']);
  if (day) {
    const [, m, d] = day.from.split('-');
    add(day.fixed ? `${+m}/${+d}` : `${+m}/${+d}~`, day.fixed ? '' : 'wait');
  }
  if (app.minReqText) add('최저 있음');
  return wrap;
}

function mover(app) {
  const box = el('div', 'move');
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', `${app.univ} 자리 옮기기`);
  const isOther = app.univType === '전문대' || app.univType === '특수대';
  const options = isOther
    ? [['tray', '지원'], ['archive', '보관']]
    : [...RANKS.map((r) => [`rank:${r}`, `${r}순위`]), ['pool', '후보'], ['archive', '보관']];

  const now = store.placementOf(app.id);
  const current = now.slot === 'rank' ? `rank:${now.rank}` : now.slot;
  for (const [value, text] of options) {
    const o = document.createElement('option');
    o.value = value; o.textContent = text;
    if (value === current) o.selected = true;
    sel.appendChild(o);
  }
  sel.disabled = busy;
  sel.onchange = () => move(app, sel.value);
  box.appendChild(sel);
  return box;
}

function emptySlot(rank) {
  const box = el('div', 'card empty', `${rank}순위 — 비어 있음`);
  box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('over'); });
  box.addEventListener('dragleave', () => box.classList.remove('over'));
  box.addEventListener('drop', (e) => {
    e.preventDefault();
    box.classList.remove('over');
    const app = store.state.apps.get(e.dataTransfer.getData('text/plain'));
    if (app) move(app, `rank:${rank}`);
  });
  return box;
}

function group(title, apps, help, student) {
  const box = el('section', 'panel');
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', title));
  head.appendChild(el('span', 'count num', `${apps.length}건`));
  box.appendChild(head);
  if (!apps.length) {
    box.appendChild(hint(help || '없습니다.'));
    return box;
  }
  if (help) box.appendChild(el('p', 'section-label', help));
  const stack = el('div', 'stack');
  for (const app of apps) {
    const row = el('div', 'row');
    const txt = el('div', 'txt');
    txt.appendChild(el('div', 'univ', tidy(app.univ.replace(/\s*[-–—]\s*.*$/, ''))));
    txt.appendChild(el('div', 'dept', `${tidy(app.dept)} · ${app.typeSub || app.typeName || ''}`));
    txt.appendChild(figures(app, student));
    txt.appendChild(pills(app));
    row.appendChild(txt);
    row.appendChild(mover(app));
    stack.appendChild(row);
  }
  box.appendChild(stack);
  return box;
}

/* ── 옮기기 ───────────────────────────────────────────────────── */

async function move(app, value) {
  if (busy) return;
  const [slot, rankText] = value.split(':');
  const rank = rankText ? Number(rankText) : null;
  const before = store.placementOf(app.id);

  // 그 순위를 이미 쓰고 있으면 밀어낸다. 사라지지 않도록 무엇이 밀렸는지 남긴다.
  let pushed = null;
  if (slot === 'rank') {
    const taken = store.occupant(app.hak, rank);
    if (taken && taken.id !== app.id) pushed = taken;
  }

  busy = true;
  render();
  try {
    if (pushed) {
      const to = before.slot === 'rank' ? before.rank : null;
      await store.place(pushed.id, to ? 'rank' : 'pool', to);
    }
    await store.place(app.id, slot, rank);
    if (pushed) {
      const name = shortName(pushed);
      const eul = josa(pushed.dept, '을', '를');
      notice = before.slot === 'rank'
        ? `${name}${eul} ${before.rank}순위로 맞바꿨습니다.`
        : `${name}${eul} 후보로 옮겼습니다.`;
    } else {
      notice = '';
    }
  } catch (err) {
    notice = `오류: ${err.message}`;
  } finally {
    busy = false;
    renderRoster();
    render();
  }
}

/* ── 조각 ─────────────────────────────────────────────────────── */

function banner(text, isError) {
  return el('p', `note${isError ? ' error' : ''}`, text);
}
function hint(text) {
  return el('p', 'empty-state', text);
}
function label(text) {
  return el('h2', 'section-label', text);
}
function skeleton() {
  const box = el('div', 'slots');
  for (let i = 0; i < 6; i += 1) {
    const c = el('div', 'card');
    for (const w of ['70%', '90%', '50%']) {
      const line = el('div', 'skeleton');
      line.style.width = w;
      c.appendChild(line);
    }
    box.appendChild(c);
  }
  return box;
}
