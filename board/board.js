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
 *
 * 카드에는 견줄 숫자 셋만 둔다. 나머지(50컷·실질경쟁률·연도별 추이·일정·최저·메모)는
 * 카드를 눌러 여는 상세(card.js)에서 본다. 상세는 자리를 옮기지 않으므로
 * 보드 본문과 따로 그린다 — 순위를 바꿔도 열어 둔 상세가 닫히지 않는다.
 */
import * as store from './store.js';
import { detailPanel } from './card.js';

const RANKS = [1, 2, 3, 4, 5, 6];
const SLOT_LABEL = { rank: '순위', pool: '후보', archive: '보관', tray: '전문대' };

const MY_CLASS_KEY = 'board.myClass';

let myClass = '';    // 이 컴퓨터의 기본 반 (이 컴퓨터만의 취향이라 store에 두지 않는다)
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
      if (!store.selection.cls) store.select({ cls: list.includes(myClass) ? myClass : (list[0] || '') });
      renderRoster();
    }
    render();
    renderDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && store.selection.appId) closeDetail();
  });
  render();
  renderDetail();
}

/* ── 반 · 학생 ────────────────────────────────────────────────── */

function renderRoster() {
  const tabs = $('#tabs');
  tabs.textContent = '';
  const { cls } = store.selection;
  const list = store.classes();
  for (const c of list) {
    const b = el('button', 'btn', c === myClass ? `${c}반 · 기본` : `${c}반`);
    b.setAttribute('aria-pressed', String(c === cls));
    b.onclick = () => { store.select({ cls: c, hak: '', appId: '' }); notice = ''; renderRoster(); render(); };
    tabs.appendChild(b);
  }
  if (list.length > 1) {
    const all = el('button', 'btn', '학년 전체');
    all.setAttribute('aria-pressed', String(cls === ''));
    all.onclick = () => { store.select({ cls: '', hak: '', appId: '' }); notice = ''; renderRoster(); render(); };
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
    b.setAttribute('aria-current', String(s.hak === store.selection.hak));
    b.onclick = () => { store.select({ hak: s.hak, appId: '' }); notice = ''; renderRoster(); render(); };
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
  if (main.hidden) return;         // 일정 화면을 보는 중이면 손대지 않는다
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

  const student = store.state.students.get(store.selection.hak);
  if (!student) {
    main.appendChild(hint('왼쪽에서 학생을 고르면 지원 현황이 나옵니다.'));
    return;
  }

  main.appendChild(header(student));

  const apps = store.appsOf(student.hak);
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

  // 보관도 순위도 아닌 것은 전부 후보로 본다.
  // 시트에 예전 칸 이름이 남아 있거나 전문대로 잡혔던 지원이 일반대로 바뀌면
  // 어느 무리에도 안 걸려 카드가 조용히 사라진다. 상담 도구에서 가장 나쁜 실패다.
  const archive = general.filter((a) => store.placementOf(a.id).slot === 'archive');
  const pool = general.filter((a) => {
    const slot = store.placementOf(a.id).slot;
    return slot !== 'archive' && slot !== 'rank';
  });

  main.appendChild(group('후보', pool, '아직 순위를 정하지 않은 지원입니다.', student));
  if (others.length) {
    const kept = others.filter((a) => store.placementOf(a.id).slot !== 'archive');
    const put = others.filter((a) => store.placementOf(a.id).slot === 'archive');
    main.appendChild(group('전문대 · 특수대', kept,
      '수시 6회 제한 밖이라 순위를 매기지 않습니다.', student));
    if (put.length) main.appendChild(group('전문대 보관', put, '', student));
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
  openable(box, app);

  if (rank) box.appendChild(el('div', 'rank', `${rank}순위`));
  box.appendChild(el('div', 'univ', tidy(app.univ.replace(/\s*[-–—]\s*.*$/, ''))));
  box.appendChild(el('div', 'dept', `${tidy(app.dept)} · ${app.typeSub || app.typeName || ''}`));
  box.appendChild(figures(app, student));
  box.appendChild(pills(app));
  box.appendChild(mover(app));
  return box;
}

/**
 * 카드를 눌러 상세를 연다.
 *
 * 선택 상자와 단추까지 삼키면 자리를 못 옮기므로, 그 안에서 시작된 누름은 흘려보낸다.
 * 마우스로 끌어다 놓기를 하다 손이 살짝 움직여도 상세가 열리지 않도록,
 * 끌기가 시작됐으면 이번 누름은 없던 것으로 친다.
 */
const PASS = 'select, button, a, input, label, textarea, option';
function openable(box, app) {
  let dragging = false;
  box.addEventListener('dragstart', () => { dragging = true; });
  box.addEventListener('dragend', () => { dragging = false; });
  box.addEventListener('click', (e) => {
    if (dragging) { dragging = false; return; }
    if (e.target.closest(PASS)) return;
    openDetail(app, box);
  });
}

const g2 = (n) => (n == null ? null : Number(n).toFixed(2));
const one = (n) => (n == null ? null : Number(n).toFixed(1));

/**
 * 카드의 숫자 — **대학 쪽과 학생 쪽을 갈라 놓는다.**
 *
 *     작년(26입결)  │  내 성적
 *     70%컷  3.58   │  환산   2.94
 *     실질   2.4:1  │  전교과 3.20
 *
 * 셋을 한 줄에 늘어놓으면 70%컷·전교과·환산이 같은 종류의 숫자로 읽힌다.
 * 왼쪽은 **대학이 작년에 어땠나**, 오른쪽은 **내가 어디에 있나**로 서로 다른 것이다.
 * 가운데 줄 하나가 그 경계다.
 *
 * 윗줄끼리 붙여 놓은 이유 — 70%컷과 대학 환산등급은 **같은 잣대**다. 눈이 가로로
 * 한 번 움직이면 되는 자리에 둔다. 전교과는 잣대가 달라 아랫줄에 참고로 둔다.
 * 차이값은 여전히 계산하지 않는다. 빼는 순간 자료가 말하지 않는 것을 말하게 된다.
 */
function figures(app, student) {
  const s = store.summary(app);
  const naesin = (student && student.naesin) || {};
  const total = g2(naesin['전교과'] ?? naesin['전교과(100)']);
  const mine = app.myScore || {};

  const wrap = el('div', 'figs');
  const group = (title, list) => {
    const rows = list.filter((x) => x && x[1] != null);
    if (!rows.length) return null;
    const box = el('div', 'fig-g');
    box.appendChild(el('div', 'fig-h', title));
    for (const [k, v, note] of rows) {
      const line = el('div', 'fig');
      line.appendChild(el('span', 'k', k));
      line.appendChild(el('span', 'v num', v));
      if (note) line.title = note;
      box.appendChild(line);
    }
    return box;
  };

  let left = null;
  if (s.kind === 'college') {
    // 전문대는 환산점수가 없다. 최종등록자 평균등급과 최저등급이 그 자리에 온다.
    left = group(s.year ? `작년 ${String(s.year).slice(2)}` : '작년', [
      ['평균등급', g2(s.avg)],
      ['최저등급', g2(s.cut)],
    ]);
  } else if (s.linked) {
    // 실질경쟁률이 나오면 그걸 쓴다. 명목만으로는 추합이 얼마나 돌았는지 안 보인다.
    const comp = s.real.value != null
      ? ['실질', `${one(s.real.value)}:1`, `명목 ${s.rate != null ? s.rate + ':1' : '?'} · 모집과 추합을 반영한 값`]
      : (s.rate != null ? ['경쟁률', `${s.rate}:1`, s.real.why || '추가합격 자료가 없어 명목값입니다'] : null);
    left = group(s.year ? `작년 ${String(s.year).slice(2)}입결` : '작년', [
      ['70%컷', g2(s.cut)],
      comp,
    ]);
  } else if (s.before && s.before.line.g70) {
    // 올해 새로 묶여 제 입결이 없는 자유전공. 묶이기 전 학과들의 선을 참고로 둔다.
    const g = s.before.line.g70;
    left = group('묶이기 전 참고', [
      ['가운데', g2(g.mid), `${s.before.line.year} 70%컷 · ${g.n}개 학과의 가운데값`],
      ['범위', `${g2(g.lo)}~${g2(g.hi)}`,
        `${s.before.parts.length}개 학과 중 ${g.n}곳에서 값을 찾았습니다`],
    ]);
    if (left) left.classList.add('approx');
  }

  const right = group('내 성적', [
    ['환산', g2(mine.grade) || (mine.score != null ? String(mine.score) : null),
      mine.grade != null ? '대학이 제 방식으로 환산한 등급' : '대학 환산 점수'],
    ['전교과', total, '학교 전 과목 등급. 대학 환산과는 잣대가 다릅니다'],
  ]);

  if (left) wrap.appendChild(left);
  if (right) wrap.appendChild(right);
  if (left && right) wrap.classList.add('two');
  return wrap;
}

/**
 * 꼬리표 — 숫자 둘로는 안 되는, 그러나 판단을 바꾸는 것들.
 *
 * 고른 기준은 「이걸 모르면 상담에서 틀린 말을 하게 되는가」다.
 *   모집인원 증감   30명이 3명이 되면 작년 컷은 더 이상 쓸 수 없다
 *   단계별 전형     1단계를 따로 통과해야 한다. 최종 컷만 보면 안 된다
 *   수능최저        내신이 닿아도 최저에서 떨어진다
 *   가야 하는 날    면접·실기·논술은 겹치면 하나를 버려야 한다
 *   연결 상태       값이 왜 비었는지 감추지 않는다
 *
 * 지역·계열·모집시기·50%컷·취업률 같은 것은 여기 두지 않는다. 상세에서 본다.
 */
function pills(app) {
  const wrap = el('div', 'pills');
  const add = (text, kind) => wrap.appendChild(el('span', `pill${kind ? ' ' + kind : ''}`, text));

  const s = store.summary(app);

  // 모집인원 — 줄었으면 그게 올해 이 전형의 가장 큰 변수다
  const now = s.quotaNow;
  const prev = s.quotaPrev;
  if (now != null) {
    const d = prev != null ? now - prev : null;
    if (d) {
      // 붉은색은 진짜 문제에만 쓴다. 두어 명 줄어든 것까지 붉게 칠하면
      // 정작 반 토막 난 전형이 눈에 안 들어온다.
      const heavy = d < 0 && Math.abs(d) >= 3 && Math.abs(d) / prev >= 0.2;
      const p = add(`${now}명 (작년 ${prev})`, heavy ? 'warn' : '');
      p.title = `작년보다 ${Math.abs(d)}명 ${d > 0 ? '늘었습니다' : '줄었습니다'}`;
    } else {
      add(`${now}명`);
    }
  } else if (app.quotaText) {
    add(app.quotaText);
  }

  if (s.stages > 1) add(`${s.stages}단계`);
  if (app.minReqText) add('최저 있음', 'mark');

  // 가야 하는 날. 기간으로만 나온 것은 점선으로 둔다 — 아직 확정이 아니다.
  const go = ['면접', '실기', '논술', '적성']
    .map((kind) => [kind, store.dateOf(app, kind)])
    .filter(([, d]) => d)[0];
  if (go) {
    const [kind, d] = go;
    const [, m, day] = d.from.split('-');
    add(`${kind} ${+m}/${+day}${d.fixed ? '' : '~'}`, d.fixed ? '' : 'wait');
  }

  if (s.kind === 'college' && s.linked) {
    if (s.employ != null) add(`취업 ${Math.round(s.employ)}%`);
    if (s.transfer) add('연계편입', 'mark');
  }

  // 값이 왜 비었는지 감추지 않는다
  if (!store.state.enriched) {
    add('자료 불러오는 중', 'wait');
  } else if (!s.linked && s.before) {
    const p = add(`묶이기 전 ${s.before.line.found.length}곳 참고`, 'wait');
    p.title = s.why;
  } else if (!s.linked) {
    const p = add('작년 자료 없음', 'warn');
    if (s.why) p.title = s.why;
  } else if (s.cut == null && s.avg == null) {
    add('작년 컷 없음');
  }

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

  // 카드를 눌러도 열리지만, 눌러야 열린다는 걸 알 수 있게 단추를 함께 둔다.
  // 키보드만 쓰는 경우에도 이 단추가 유일한 길이다.
  const more = el('button', 'btn', '자세히');
  more.type = 'button';
  more.setAttribute('aria-label', `${app.univ} ${app.dept} 자세히`);
  more.onclick = (e) => openDetail(app, e.currentTarget);
  box.appendChild(more);
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
    openable(row, app);
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

/* ── 상세 ─────────────────────────────────────────────────────── */

/**
 * 상세는 보드 본문 밖(#detail)에 그린다. 본문은 순위를 옮길 때마다 통째로 다시
 * 그려지는데, 상세까지 함께 지워지면 메모를 적다 말고 창이 닫힌다.
 *
 * 다시 그릴 일이 있어도 적던 메모와 스크롤 위치는 그대로 둔다.
 */
let detailReturn = null;      // 상세를 연 자리. 닫을 때 초점을 여기로 되돌린다
let detailShown = '';         // 지금 화면에 그려져 있는 지원. 처음 열 때만 초점을 옮긴다

function openDetail(app, from) {
  detailReturn = from || null;
  store.select({ appId: app.id });
}

function closeDetail() {
  const back = detailReturn;
  detailReturn = null;
  store.select({ appId: '' });
  if (back && document.contains(back)) back.focus();
}

function renderDetail() {
  const host = $('#detail');
  if (!host) return;

  const id = store.selection.appId;
  const app = id ? store.state.apps.get(id) : null;
  if (!app) {
    host.textContent = '';
    host.hidden = true;
    detailShown = '';
    delete document.body.dataset.detail;
    return;
  }

  // 다시 그리기 전에 적던 것과 본 자리를 챙겨 둔다
  const draftBox = host.querySelector('.memo-new textarea');
  const draft = draftBox ? draftBox.value : '';
  const top = host.scrollTop;          // 스크롤은 덮개가 한다
  const first = detailShown !== id;

  host.textContent = '';
  host.hidden = false;
  document.body.dataset.detail = '1';

  const panel = detailPanel(app, store.state.students.get(app.hak), closeDetail);
  host.appendChild(panel);

  const back = host.querySelector('.memo-new textarea');
  if (back && draft) back.value = draft;
  host.scrollTop = first ? 0 : top;
  if (first) panel.focus();
  detailShown = id;
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
