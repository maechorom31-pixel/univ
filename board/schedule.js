/**
 * 일정판 (P4)
 * =====================================================================
 * 12월 달력이 아니다. 작년 실적을 보면 첫 실기가 9월 25일, 면접이 9월 하순에
 * 시작해 10월 31건 · 11월 75건 · 12월 24건으로 흐른다. 그래서 9월부터 본다.
 *
 * 날짜는 세 상태를 갖는다 (CONTRACT.md §4)
 *   확정  하루로 공지됐거나 학생이 배정받은 날
 *   기간  `11.25(수)~11.27(금)` 처럼 며칠에 걸쳐 실시 — 모집요강 면접일정의 41%가 이렇다
 *   미정  자료에 없음
 *
 * 겹침도 그래서 두 단계다.
 *   겹침       둘 다 확정이고 같은 날 → 한 곳은 못 간다
 *   겹칠 수 있음  한쪽이라도 기간 → 지금은 알 수 없다는 것도 정보다
 *
 * 학생을 고르면 그 학생의 달력을, 고르지 않으면 반 전체를 날짜순으로 보여 준다.
 * 담임에게는 「그날 누가 어디로 가는지」가 한눈에 필요하다.
 *
 * 모의면접은 자동으로 잡지 않는다. 다른 학생과 겹치고 교실 사정도 있어서 사람이
 * 정해야 한다. 선생님이 넣은 날짜는 학생 화면에도 그대로 간다.
 */
import * as store from './store.js';

/** 가야 하는 것 — 겹치면 한 곳은 포기해야 한다 */
const ATTEND = ['면접', '실기', '논술', '적성'];
/** 보기만 하는 것 — 겹쳐도 상관없다 */
const NOTICE = ['1단계발표', '최종발표'];
/**
 * 학교에서 잡는 일정. 대학 일정과 겹침을 따지지 않는다.
 *
 * **모의면접은 여러 번 한다.** 한 번 보고 끝나는 게 아니라 고쳐 가며 두세 번 본다.
 * 그래서 `모의면접1` · `모의면접2` … 로 나눠 담는다. 시트의 (id, kind) 키가
 * 그대로 쓰이므로 저장 구조를 바꾸지 않아도 된다.
 */
const MOCK = '모의면접';
const MOCK_MAX = 5;
const MOCKS = Array.from({ length: MOCK_MAX }, (_, i) => `${MOCK}${i + 1}`);
const isMock = (kind) => String(kind || '').startsWith(MOCK);
const KINDS = [...ATTEND, ...NOTICE, MOCK, ...MOCKS];

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const tidy = (s) => String(s || '').replace(/ (?=[^ ]{1,4}$)/, ' ');
const shortUniv = (name) => String(name || '').replace(/\s*[-–—]\s*.*$/, '').replace(/\(.*/, '');

/* ── 날짜 ─────────────────────────────────────────────────────── */

const ymd = (iso) => String(iso || '').split('-').map(Number);
const dayOf = (iso) => { const [y, m, d] = ymd(iso); return new Date(Date.UTC(y, m - 1, d)); };
const isoOf = (date) => date.toISOString().slice(0, 10);
const shift = (iso, days) => {
  const d = dayOf(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoOf(d);
};
const label = (iso) => {
  const [, m, d] = ymd(iso);
  return `${m}/${d}(${DOW[dayOf(iso).getUTCDay()]})`;
};
const overlaps = (a, b) => a.from <= b.to && b.from <= a.to;

/* ── 모으기 ───────────────────────────────────────────────────── */

/**
 * 지원 목록에서 일정을 뽑는다.
 * @return {Array<{hak,name,app,kind,from,to,fixed}>} 날짜순
 */
export function eventsOf(apps) {
  const out = [];
  for (const app of apps) {
    const student = store.state.students.get(app.hak);
    for (const kind of KINDS) {
      const d = store.dateOf(app, kind);
      if (!d || !d.from) continue;
      out.push({
        hak: app.hak,
        name: student ? student.name : '',
        app,
        kind,
        from: d.from,
        to: d.to || d.from,
        fixed: Boolean(d.fixed),
        status: d.status || 'source',
      });
    }
  }
  return out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/**
 * 한 학생 안에서 서로 부딪히는 조합을 찾는다.
 * 발표는 겹쳐도 상관없으므로 가야 하는 것만 본다.
 */
export function clashes(events) {
  const attend = events.filter((e) => ATTEND.includes(e.kind));
  const out = [];
  for (let i = 0; i < attend.length; i += 1) {
    for (let j = i + 1; j < attend.length; j += 1) {
      const a = attend[i];
      const b = attend[j];
      if (a.hak !== b.hak || a.app.id === b.app.id) continue;
      if (!overlaps(a, b)) continue;
      out.push({ a, b, sure: a.fixed && b.fixed && a.from === b.from });
    }
  }
  // 확실히 겹치는 것을 위로. 「겹칠 수 있음」이 앞을 막으면 정작 급한 걸 놓친다.
  return out.sort((x, y) => (y.sure - x.sure) || (x.a.from < y.a.from ? -1 : 1));
}

/**
 * 모의면접을 언제쯤 하면 좋을지 되짚어 본다 — **제안일 뿐이다.**
 * 실제 날짜는 선생님이 넣고, 넣은 값이 학생 화면에도 그대로 간다.
 */
const MOCK_BEFORE = 3;

export function suggestMock(interviewFrom) {
  return shift(interviewFrom, -MOCK_BEFORE);
}

/* ── 화면 ─────────────────────────────────────────────────────── */

export function start() {
  store.on('change', render);
  render();
}

function render() {
  const main = $('#schedule');
  if (!main || main.hidden) return;
  main.textContent = '';

  if (!store.state.ready) {
    main.appendChild(el('p', 'empty-state', '자료를 불러오는 중입니다.'));
    return;
  }

  const { cls, hak } = store.selection;
  const student = store.state.students.get(hak);
  const apps = student
    ? store.appsOf(hak)
    : store.studentsOf(cls).flatMap((s) => store.appsOf(s.hak));
  const events = eventsOf(apps);

  const head = el('div', 'who');
  const line = el('div', 'who-line');
  line.appendChild(el('div', 'name', student
    ? `${student.hak} ${tidy(student.name)} 일정`
    : (cls ? `${cls}반 일정` : '학년 전체 일정')));

  // 담임이 제일 자주 보는 것은 「그날 누가 어디로 가는지」인데, 학생을 한 번 고르면
  // 반을 바꾸는 것 말고는 돌아갈 길이 없었다. 반이 하나뿐이면 그 단추조차 없다.
  if (student) {
    const back = el('button', 'btn', cls ? `${cls}반 전체 보기` : '학년 전체 보기');
    back.type = 'button';
    back.onclick = () => store.select({ hak: '' });
    line.appendChild(back);
  }
  head.appendChild(line);
  const kinds = ATTEND.filter((k) => events.some((e) => e.kind === k));
  const bits = [];
  if (events.length) bits.push(`${events.length}건`);
  if (kinds.length) bits.push(kinds.join(' · '));

  // 확정 겹침과 「겹칠 수 있음」을 **따로 센다.**
  // 뭉쳐서 「겹치는 날 5건」이라 적으면, 정작 하나를 버려야 하는 진짜 겹침 한 건이
  // 기간 때문에 생긴 잠재 넷에 묻힌다. 겁만 주고 판단은 못 돕는다.
  if (student) {
    const cs = clashes(events);
    const sure = cs.filter((c) => c.sure).length;
    const maybe = cs.length - sure;
    if (sure) bits.push(`겹침 ${sure}건`);
    if (maybe) bits.push(`겹칠 수 있음 ${maybe}건`);
  }
  head.appendChild(el('div', 'meta', bits.join(' · ') || '아직 일정이 없습니다'));
  main.appendChild(head);

  if (!events.length) {
    main.appendChild(el('p', 'empty-state',
      '즐겨찾기에 면접·실기·논술 날짜가 들어오면 여기에 나옵니다.'));
    return;
  }

  if (student) {
    main.appendChild(clashPanel(clashes(events)));
    main.appendChild(calendars(events));
    main.appendChild(interviewPanel(student));
  } else {
    main.appendChild(dayList(events));
  }
}

/* 겹침 */

function clashPanel(list) {
  const box = el('section', 'panel');
  const head = el('div', 'panel-head');
  const sure = list.filter((c) => c.sure).length;
  head.appendChild(el('h2', '', sure ? '겹치는 날' : '겹칠 수 있는 날'));
  head.appendChild(el('span', 'count num', `${list.length}건`));
  box.appendChild(head);

  if (!list.length) {
    box.appendChild(el('p', 'empty-state', '지금까지 들어온 날짜로는 겹치는 곳이 없습니다.'));
    return box;
  }
  const stack = el('div', 'stack');
  for (const c of list) {
    const row = el('div', 'row');
    const txt = el('div', 'txt');
    txt.appendChild(el('div', 'univ',
      `${shortUniv(c.a.app.univ)} ${c.a.kind} ↔ ${shortUniv(c.b.app.univ)} ${c.b.kind}`));
    txt.appendChild(el('div', 'dept', c.sure
      ? `${label(c.a.from)} 같은 날입니다. 한 곳은 응시할 수 없습니다.`
      : `${span(c.a)} 와 ${span(c.b)} 가 포개집니다. 대학 공지를 확인해 주세요.`));
    row.appendChild(txt);
    row.appendChild(el('span', `pill ${c.sure ? 'warn' : 'wait'}`,
      c.sure ? '겹침' : '겹칠 수 있음'));
    stack.appendChild(row);
  }
  box.appendChild(stack);
  return box;
}

const span = (e) => (e.fixed ? label(e.from) : `${label(e.from)}~${label(e.to)}`);

/* 달력 */

function calendars(events) {
  const box = el('section', 'panel');
  box.appendChild(el('h2', '', '달력'));

  const months = [...new Set(events.map((e) => e.from.slice(0, 7)))].sort();
  const wrap = el('div', 'months');
  for (const ym of months) wrap.appendChild(month(ym, events));
  box.appendChild(wrap);

  const legend = el('div', 'legend');
  for (const [cls, text] of [['', '가는 날'], ['soft', '기간(미확정)'],
    ['mock', '모의면접'], ['note', '발표']]) {
    const item = el('span');
    item.appendChild(el('i', `sw ${cls}`));
    item.appendChild(el('span', null, text));
    legend.appendChild(item);
  }
  box.appendChild(legend);
  return box;
}

function month(ym, events) {
  const [y, m] = ym.split('-').map(Number);
  const box = el('div', 'month');
  box.appendChild(el('div', 'month-h', `${y}년 ${m}월`));

  const grid = el('div', 'cal');
  for (const d of DOW) grid.appendChild(el('div', 'dow', d));

  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let i = 0; i < first.getUTCDay(); i += 1) grid.appendChild(el('div', 'off'));

  for (let d = 1; d <= days; d += 1) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cell = el('div', 'day');
    cell.appendChild(el('span', 'dn num', String(d)));
    for (const e of events.filter((x) => x.from <= iso && iso <= x.to)) {
      const kind = e.kind === MOCK ? 'mock'
        : NOTICE.includes(e.kind) ? 'note'
          : (e.fixed ? '' : 'soft');
      const tag = el('span', `ev ${kind}`.trim(),
        `${shortUniv(e.app.univ)} ${e.kind}`);
      tag.title = `${e.name} · ${e.app.dept} · ${span(e)}`;
      cell.appendChild(tag);
    }
    grid.appendChild(cell);
  }
  box.appendChild(grid);
  return box;
}

/* 준비 일정 */

/**
 * 모의면접 — 선생님이 날짜를 넣는다.
 * 자동으로 D-3을 잡아 두지 않는다. 실제로는 다른 학생과 겹치고 교실 사정도 있어서
 * 사람이 정해야 한다. 대신 제안일을 옆에 띄우고 한 번에 넣을 수 있게 한다.
 */
/**
 * 면접 — **대학별로 묶는다.**
 *
 * 면접이 넷이고 대학마다 모의면접을 세 번 하면 열여섯 줄이 날짜순으로 섞여 나온다.
 * 그 상태로는 「숭실대 준비가 어디까지 됐나」를 볼 수가 없다. 상담에서 묻는 것은
 * 늘 대학 단위다 — 숭실대 면접이 언제고, 그 전에 모의면접을 몇 번 했나.
 *
 * 그래서 한 대학이 한 덩이다. 본 면접이 맨 위, 그 아래 모의면접이 차례로,
 * 맨 밑에 「모의면접 추가」.
 *
 * 전문대·특수대도 여기 들어온다. 즐겨찾기가 그쪽 면접일을 주지 않는 일이 많아서
 * **날짜가 없어도 덩이를 만들고** 선생님이 직접 넣을 수 있게 둔다.
 */
function interviewPanel(student) {
  const box = el('section', 'panel');
  const apps = store.appsOf(student.hak);

  // 면접·실기·논술이 있거나, 있을 법한 지원. 전문대는 날짜가 없어도 넣는다 —
  // 그게 바로 선생님이 손으로 채워야 하는 자리다.
  const rows = [];
  for (const app of apps) {
    const go = ATTEND.map((k) => ({ kind: k, d: store.dateOf(app, k) })).filter((x) => x.d);
    const other = app.univType === '전문대' || app.univType === '특수대';
    if (!go.length && !other) continue;
    rows.push({ app, go, other });
  }

  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '면접 준비'));
  head.appendChild(el('span', 'count num', `${rows.length}곳`));
  box.appendChild(head);

  if (!rows.length) {
    box.appendChild(el('p', 'empty-state',
      '면접·실기·논술이 있는 지원이 없습니다.'));
    return box;
  }
  box.appendChild(el('p', 'section-label',
    '대학마다 묶어 두었습니다. 넣은 날짜는 학생 화면에도 그대로 보입니다.'));

  for (const r of rows) box.appendChild(univBlock(r));
  return box;
}

/** 대학 한 덩이. */
function univBlock({ app, go, other }) {
  const box = el('div', 'uni-block');

  const h = el('div', 'uni-head');
  h.appendChild(el('span', 'nm', tidy(shortUniv(app.univ))));
  h.appendChild(el('span', 'fig', app.typeSub || app.typeName || ''));
  box.appendChild(h);

  const list = el('div', 'stack');

  // 1. 대학이 정한 것
  if (go.length) {
    for (const x of go) list.appendChild(fixedRow(app, x.kind, x.d));
  } else {
    list.appendChild(missingRow(app, other));
  }

  // 2. 학교에서 잡는 모의면접. 여러 번 한다.
  const mocks = MOCKS
    .map((kind) => ({ kind, d: store.dateOf(app, kind) }))
    .filter((x) => x.d);
  // 예전 방식(`모의면접` 하나)으로 저장된 것도 그대로 보여 준다
  const old = store.dateOf(app, MOCK);
  if (old) mocks.unshift({ kind: MOCK, d: old });

  mocks.forEach((m, i) => list.appendChild(mockRow(app, m.kind, m.d, i + 1)));

  const next = MOCKS.find((k) => !store.dateOf(app, k));
  if (next) {
    const first = go[0];
    list.appendChild(addMockRow(app, next, mocks.length + 1,
      first ? suggestMock(first.d.from) : ''));
  }

  box.appendChild(list);
  return box;
}

/** 대학이 정한 날. 고치지 않는다 — 학생이 배정받으면 학생 화면에서 넣는다. */
function fixedRow(app, kind, d) {
  const row = el('div', 'row ev-row');
  const txt = el('div', 'txt');
  txt.appendChild(el('div', 'univ', kind));
  txt.appendChild(el('div', 'dept', d.fixed
    ? label(d.from)
    : `${label(d.from)}~${label(d.to)} 중 하루`));
  row.appendChild(txt);
  const tag = d.status === 'pending' ? '학생 입력 · 확인 대기'
    : d.status === 'confirmed' ? '확정'
      : d.fixed ? '공지' : '기간';
  row.appendChild(el('span', `pill${d.fixed ? '' : ' wait'}`, tag));
  return row;
}

/** 날짜가 없는 지원 — 선생님이 직접 넣는다. 전문대가 주로 여기다. */
function missingRow(app, other) {
  const wrap = el('div', 'field');
  wrap.appendChild(el('label', '', '면접일'));
  wrap.appendChild(el('p', 'hint', other
    ? '전문대·특수대는 즐겨찾기에 면접일이 없는 일이 많습니다. 직접 넣어 주세요.'
    : '즐겨찾기에 면접일이 없습니다. 아는 날짜가 있으면 넣어 주세요.'));
  const line = el('div', 'field-in');
  const input = document.createElement('input');
  input.type = 'date';
  input.setAttribute('aria-label', `${shortUniv(app.univ)} 면접일`);
  line.appendChild(input);
  const save = el('button', 'btn', '넣기');
  save.type = 'button';
  save.onclick = () => saveDate(app, '면접', input.value);
  line.appendChild(save);
  wrap.appendChild(line);
  return wrap;
}

/** 이미 잡힌 모의면접. */
function mockRow(app, kind, d, n) {
  const row = el('div', 'row ev-row mock-row');
  const txt = el('div', 'txt');
  txt.appendChild(el('div', 'univ', `모의면접 ${n}차`));
  txt.appendChild(el('div', 'dept', label(d.from)));
  row.appendChild(txt);
  const del = el('button', 'btn', '지우기');
  del.type = 'button';
  del.onclick = () => saveDate(app, kind, '');
  row.appendChild(del);
  return row;
}

/** 모의면접 한 번 더. */
function addMockRow(app, kind, n, suggested) {
  const wrap = el('div', 'field');
  wrap.appendChild(el('label', '', `모의면접 ${n}차`));
  if (suggested) {
    wrap.appendChild(el('p', 'hint', `${label(suggested)} 쯤이 면접 사흘 전입니다.`));
  }
  const line = el('div', 'field-in');
  const input = document.createElement('input');
  input.type = 'date';
  input.value = n === 1 ? suggested : '';
  input.setAttribute('aria-label', `${shortUniv(app.univ)} 모의면접 ${n}차 날짜`);
  line.appendChild(input);
  const save = el('button', 'btn', '넣기');
  save.type = 'button';
  save.onclick = () => saveDate(app, kind, input.value);
  line.appendChild(save);
  wrap.appendChild(line);
  return wrap;
}

async function saveDate(app, kind, value) {
  try {
    await store.setDate(app, kind, value, value);
  } catch (err) {
    const main = $('#schedule');
    if (main) main.prepend(el('p', 'note error', `오류: ${err.message}`));
  }
}

/* 반 전체 — 날짜순 */

function dayList(events) {
  const box = el('section', 'panel');
  const attend = events.filter((e) => ATTEND.includes(e.kind));
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '날짜순'));
  head.appendChild(el('span', 'count num', `${attend.length}건`));
  box.appendChild(head);
  box.appendChild(el('p', 'section-label',
    '가야 하는 일정만 모았습니다. 그날 학교를 비우는 학생입니다.'));

  if (!attend.length) {
    box.appendChild(el('p', 'empty-state', '면접·실기·논술 일정이 아직 없습니다.'));
    return box;
  }

  const byDay = new Map();
  for (const e of attend) {
    if (!byDay.has(e.from)) byDay.set(e.from, []);
    byDay.get(e.from).push(e);
  }

  const stack = el('div', 'stack');
  for (const [day, list] of [...byDay.entries()].sort()) {
    const row = el('div', 'row');
    const txt = el('div', 'txt');
    txt.appendChild(el('div', 'univ', label(day) + (list.every((e) => e.fixed) ? '' : ' 무렵')));
    const who = list.map((e) => `${e.hak} ${e.name} — ${shortUniv(e.app.univ)} ${e.kind}`
      + (e.fixed ? '' : ` (${span(e)})`));
    for (const line of who) txt.appendChild(el('div', 'dept', line));
    row.appendChild(txt);
    row.appendChild(el('span', 'pill num', `${list.length}명`));
    stack.appendChild(row);
  }
  box.appendChild(stack);
  return box;
}
