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
 * 담임에게는 「그날 누가 어디로 가는지」가 결석계와 인솔의 근거가 된다.
 */
import * as store from './store.js';

/** 가야 하는 것 — 겹치면 한 곳은 포기해야 한다 */
const ATTEND = ['면접', '실기', '논술', '적성'];
/** 보기만 하는 것 — 겹쳐도 상관없다 */
const NOTICE = ['1단계발표', '최종발표'];
const KINDS = [...ATTEND, ...NOTICE];

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
      const d = app.dates && app.dates[kind];
      if (!d || !d.from) continue;
      out.push({
        hak: app.hak,
        name: student ? student.name : '',
        app,
        kind,
        from: d.from,
        to: d.to || d.from,
        fixed: Boolean(d.fixed),
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
 * 면접일에서 되짚어 준비 일정을 만든다.
 * 면접이 잡히면 그 앞이 따라 정해진다. 몰리는 주를 미리 보는 것이 이 표의 쓸모다.
 */
const STEPS = [
  [-14, '1차 답변 마감'],
  [-10, '피드백'],
  [-7, '2차 답변 마감'],
  [-3, '모의면접'],
];

export function prepPlan(events) {
  return events
    .filter((e) => e.kind === '면접')
    .flatMap((e) => STEPS.map(([offset, what]) => ({
      on: shift(e.from, offset),
      what,
      target: e,
      soft: !e.fixed,          // 면접일이 기간이면 준비 일정도 대략이다
    })))
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
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
  head.appendChild(el('div', 'name', student
    ? `${student.hak} ${tidy(student.name)} 일정`
    : (cls ? `${cls}반 일정` : '학년 전체 일정')));
  const kinds = ATTEND.filter((k) => events.some((e) => e.kind === k));
  head.appendChild(el('div', 'meta', events.length
    ? `${events.length}건 · ${kinds.join(' · ') || '발표만'}`
    : '아직 일정이 없습니다'));
  main.appendChild(head);

  if (!events.length) {
    main.appendChild(el('p', 'empty-state',
      '즐겨찾기에 면접·실기·논술 날짜가 들어오면 여기에 나옵니다.'));
    return;
  }

  if (student) {
    main.appendChild(clashPanel(clashes(events)));
    main.appendChild(calendars(events));
    main.appendChild(prepPanel(prepPlan(events)));
  } else {
    main.appendChild(dayList(events));
  }
}

/* 겹침 */

function clashPanel(list) {
  const box = el('section', 'panel');
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '겹치는 날'));
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
  for (const [cls, text] of [['', '가는 날'], ['soft', '기간(미확정)'], ['note', '발표']]) {
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
      const kind = NOTICE.includes(e.kind) ? 'note' : (e.fixed ? '' : 'soft');
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

function prepPanel(plan) {
  const box = el('section', 'panel');
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '면접 준비'));
  head.appendChild(el('span', 'count num', `${plan.length}건`));
  box.appendChild(head);

  if (!plan.length) {
    box.appendChild(el('p', 'empty-state', '면접이 있는 지원이 없습니다.'));
    return box;
  }
  box.appendChild(el('p', 'section-label',
    '면접일에서 되짚은 일정입니다. 실제 날짜는 상담하며 조정합니다.'));

  // 날짜로 묶는다. 줄줄이 늘어놓으면 며칠에 몰렸는지가 안 보인다.
  const byDay = new Map();
  for (const item of plan) {
    if (!byDay.has(item.on)) byDay.set(item.on, []);
    byDay.get(item.on).push(item);
  }

  const stack = el('div', 'stack');
  for (const [day, list] of [...byDay.entries()].sort()) {
    const row = el('div', 'row');
    const txt = el('div', 'txt');
    txt.appendChild(el('div', 'univ', label(day)));
    for (const item of list) {
      txt.appendChild(el('div', 'dept',
        `${item.what} · ${shortUniv(item.target.app.univ)}`
        + (item.soft ? ` (면접 ${span(item.target)})` : '')));
    }
    row.appendChild(txt);
    row.appendChild(el('span', `pill num${list.length > 2 ? ' mark' : ''}`, `${list.length}건`));
    stack.appendChild(row);
  }
  box.appendChild(stack);
  return box;
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
    '가야 하는 일정만 모았습니다. 그날 결석계와 인솔이 필요한 학생입니다.'));

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
