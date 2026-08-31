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
import { catOf } from './match.js';
import { methodHasInterview } from './text.js';

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
      /*
       * **학생이 넣고 아직 확인 안 된 날짜로 「겹침」을 확정하지 않는다.**
       * pending 을 두는 까닭이 애초에 그것이다 — 잘못 적은 날짜 하나로 여섯 칸 판단이
       * 흔들리면 안 된다. 확인 전까지는 「겹칠 수 있음」까지만 말한다.
       */
      /*
       * 전형일정표에서 온 날짜(sched)도 확정으로 안 친다. 대학 전체를 두고
       * 한 말이지 이 학생이 잡은 날이 아니고, 전형 이름이 어긋난 채 붙었을
       * 수도 있다. 사람이 넣거나 확인한 날짜만 「겹침」을 확정한다.
       */
      const settled = (e) => e.status === 'confirmed' || e.status === 'source';
      out.push({
        a, b,
        sure: a.fixed && b.fixed && a.from === b.from && settled(a) && settled(b),
      });
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

  /*
   * **날짜가 하나도 없어도 학생을 골랐으면 「면접 준비」는 그린다.**
   *
   * 예전에는 여기서 통째로 끊었다. 그런데 실제 관심대학 리스트는 일정 칸이
   * 통째로 비어서(502건 중 0건), 이 탭이 늘 빈말 한 줄이었고 **날짜를 넣는
   * 칸까지 같이 사라졌다.** 날짜가 없다는 것이 바로 넣어야 한다는 뜻인데,
   * 없어서 못 넣는 꼴이었다. 겹침 판과 달력은 날짜가 있어야 뜻이 있으니
   * 그때만 그린다.
   */
  if (student) {
    if (events.length) {
      main.appendChild(clashPanel(clashes(events)));
      main.appendChild(calendars(events));
    }
    main.appendChild(interviewPanel(student));
  } else if (events.length) {
    main.appendChild(dayList(events));
    /*
     * **반 전체 달력.** 겹침 판정은 학생 한 명 안에서만 보지만, 11월의 실제
     * 문제는 여러 학생의 모의면접이 같은 날 몰리는 것이다 — 교실도 담임의
     * 몸도 하나다. 달력에 다 얹으면 몰린 날이 칩 무더기로 바로 보인다.
     */
    main.appendChild(calendars(events, true));
  } else {
    main.appendChild(el('p', 'empty-state',
      '아직 잡힌 날짜가 없습니다. 왼쪽에서 학생을 고르면 면접·실기 날짜를 넣을 수 있습니다.'));
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

function calendars(events, withName) {
  const box = el('section', 'panel');
  box.appendChild(el('h2', '', withName ? '반 달력' : '달력'));
  if (withName) {
    box.appendChild(el('p', 'section-label',
      '모의면접이 한 날에 몰리면 여기서 보입니다. 칩을 누르면 그 지원의 카드가 열립니다.'));
  }

  const months = [...new Set(events.map((e) => e.from.slice(0, 7)))].sort();
  const wrap = el('div', 'months');
  for (const ym of months) wrap.appendChild(month(ym, events, withName));
  box.appendChild(wrap);

  const legend = el('div', 'legend');
  for (const [cls, text] of [['', '가는 날'], ['soft', '기간(미확정)'],
    ['mock', '모의면접'], ['tell', '발표']]) {
    const item = el('span');
    item.appendChild(el('i', `sw ${cls}`));
    item.appendChild(el('span', null, text));
    legend.appendChild(item);
  }
  box.appendChild(legend);
  return box;
}

function month(ym, events, withName) {
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
      /*
       * **`isMock` 으로 봐야 한다.** 칸 이름이 `모의면접1`…`모의면접5` 라서
       * `=== '모의면접'` 은 한 번도 안 맞았다. 그래서 모의면접이 달력에서
       * 대학에 실제로 가는 날과 똑같이 칠해졌다 — 범례에 따로 두고도 구별이 안 됐다.
       * 학생이 이걸 보고 학교에 있어야 할 날을 대학 가는 날로 읽으면 큰일이다.
       */
      /*
       * **꽉 채운 칠은 사람이 잡은 날에만.** 전형일정표에서 온 날짜를 「가는 날」로
       * 칠했더니, 학생이 잡지도 않은 숭실대 면접이 달력에 박혀 보였다. 사실이긴
       * 하지만(그 전형의 고사일이다) 아직 이 학생의 확정이 아니다 — 점선으로 두고
       * 어디서 온 날짜인지 제목에 적는다.
       */
      const settled = e.status === 'confirmed' || e.status === 'source';
      const kind = isMock(e.kind) ? 'mock'
        : NOTICE.includes(e.kind) ? 'tell'
          : (e.fixed && settled ? '' : 'soft');
      /*
       * 칩이 대학·종류만 말해서, 한 대학 두 학과를 지원한 학생의 달력에서는
       * 어느 면접인지 못 갈랐다. 학과를 둘째 줄로 단다 — 한 줄에 붙이면
       * 칸 폭에서 말줄임표에 다 먹힌다.
       *
       * 그리고 **누르면 그 지원의 카드 상세가 뜬다.** 달력에서 본 날짜를
       * 고치려면 보드 탭으로 돌아가 카드를 찾아야 했는데, 상세 덮개는 탭과
       * 무관하게 뜨는 자리다. 상세에 「면접·실기 날짜 넣기 · 고치기」가 이미 있다.
       */
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = `ev ${kind}`.trim();
      tag.appendChild(el('span', '', `${shortUniv(e.app.univ)} ${e.kind}`));
      // 학생 한 명의 달력에서는 학과가, 반 전체 달력에서는 누구인지가 갈라 준다
      tag.appendChild(el('i', 'd', withName ? `${e.hak} ${tidy(e.name)}` : tidy(e.app.dept)));
      const src = e.status === 'sched' ? ' · 전형일정표'
        : e.status === 'pending' ? ' · 학생 입력, 확인 대기' : '';
      tag.title = `${e.name} · ${e.app.dept} · ${span(e)}${src} — 누르면 카드가 열립니다`;
      tag.onclick = () => store.select({ appId: e.app.id });
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
/**
 * 이 지원이 **가야 할 법한** 고사. 날짜가 아직 없어도 근거가 말해 준다.
 * 학생 화면의 날짜 칸과 같은 규칙이다 — 두 화면이 다른 지원을 세우면 안 된다.
 *
 *   면접   모집요강이 단계별전형이라고 말하거나(전형단계 ≥ 2),
 *          전형 방법 글에 면접이 있을 때 (일괄 「학생부60+면접40」 꼴 —
 *          실제 지원 500건에 18건이 단계 수만으로는 안 잡히던 면접이다)
 *   논술   전형 유형이 논술
 *   실기   전형 유형이 실기
 */
function expectedKinds(app) {
  const s = store.summary(app);
  const cat = catOf(app.typeCat) || catOf(app.typeSub) || catOf(app.typeName);
  const out = [];
  if (s && (s.stages > 1 || methodHasInterview(s.mojip))) out.push('면접');
  if (cat === '논술') out.push('논술');
  if (cat === '실기') out.push('실기');
  return out;
}

function interviewPanel(student) {
  const box = el('section', 'panel');
  const apps = store.appsOf(student.hak);

  /*
   * 면접·실기·논술이 있거나, **있을 법한** 지원. 전문대는 날짜가 없어도 넣는다.
   *
   * 예전 조건은 「이미 날짜가 있을 때」뿐이었다. 그런데 실제 관심대학 리스트는
   * 일정 칸이 통째로 비어서(502건 중 0건), 일반대 지원은 이 판에 **한 줄도 안
   * 섰고 날짜를 넣을 칸도 없었다.** 학생 화면에서 잡았던 것과 똑같은 구멍이
   * 교사 쪽에 그대로 있었다 — 단계별전형이면 날짜가 없어도 세운다.
   */
  const rows = [];
  const outside = [];              // 근거가 없어 안 세운 지원 — 접힌 줄로 길을 연다
  for (const app of apps) {
    // 보관은 「올해 안 넣기로 한 것」이다. 여기 세우면 안 내는 원서의 면접일을
    // 넣으라는 칸이 생긴다 — 판에서도, 접힌 줄에서도 뺀다.
    if (store.placementOf(app.id).slot === 'archive') continue;
    const go = ATTEND.map((k) => ({ kind: k, d: store.dateOf(app, k) })).filter((x) => x.d);
    const other = app.univType === '전문대' || app.univType === '특수대';
    const expect = go.length ? [] : expectedKinds(app);
    if (!go.length && !other && !expect.length) { outside.push(app); continue; }
    rows.push({ app, go, other, expect });
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

  /*
   * **근거가 없어도 길은 열어 둔다.** 모집요강이 전형단계를 모르는 지원이 12%
   * 있고, 알아도 틀릴 수 있다. 면접 통보를 받았는데 넣을 자리가 없으면
   * 이 판이 없는 것과 같다. 접어 두어 평소에는 한 줄만 보인다.
   */
  if (outside.length) box.appendChild(outsideAdder(outside));
  return box;
}

/** 판에 안 선 지원에 날짜를 넣는 접힌 줄. */
function outsideAdder(apps) {
  const fold = document.createElement('details');
  fold.className = 'date-add';
  const sum = document.createElement('summary');
  sum.textContent = `여기 없는 지원에 날짜 적기 (${apps.length}곳)`;
  fold.appendChild(sum);

  const wrap = el('div', 'field');
  wrap.appendChild(el('p', 'hint',
    '일괄전형이라 면접이 없는 것으로 본 지원들입니다. 그래도 고사가 잡혔으면 여기서 넣어 주세요.'));
  const line = el('div', 'field-in');

  const who = document.createElement('select');
  who.setAttribute('aria-label', '지원 고르기');
  for (const app of apps) {
    const o = document.createElement('option');
    o.value = app.id;
    o.textContent = `${tidy(shortUniv(app.univ))} ${tidy(app.dept)}`;
    who.appendChild(o);
  }
  line.appendChild(who);

  const kindSel = document.createElement('select');
  kindSel.setAttribute('aria-label', '고사 종류');
  for (const k of ATTEND) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = k;
    kindSel.appendChild(o);
  }
  line.appendChild(kindSel);

  const input = document.createElement('input');
  input.type = 'date';
  input.setAttribute('aria-label', '날짜');
  line.appendChild(input);

  const save = el('button', 'btn', '넣기');
  save.type = 'button';
  save.onclick = () => {
    const app = apps.find((a) => a.id === who.value);
    if (app) saveDate(app, kindSel.value, input.value);
  };
  line.appendChild(save);
  wrap.appendChild(line);
  fold.appendChild(wrap);
  return fold;
}

/** 대학 한 덩이. */
function univBlock({ app, go, other, expect }) {
  const box = el('div', 'uni-block');

  const h = el('div', 'uni-head');
  h.appendChild(el('span', 'nm', tidy(shortUniv(app.univ))));
  // 학과가 빠져 있었다 — 한 대학에 두 학과를 지원한 학생이면 어느 면접인지 못 가른다
  h.appendChild(el('span', 'fig', [tidy(app.dept), app.typeSub || app.typeName || '']
    .filter(Boolean).join(' · ')));
  box.appendChild(h);

  const list = el('div', 'stack');
  // 입력 칩(날짜 적기·모의면접 적기)은 값 줄들 아래 한 줄 띠에 모은다 —
  // 빈 입력이 대학마다 두 줄씩 펴져 있으면 판이 세로로 늘어진다.
  const strip = el('div', 'fold-strip');

  // 1. 대학이 정한 것 — 없으면 근거가 말한 종류마다 넣는 칩을 세운다
  if (go.length) {
    for (const x of go) list.appendChild(fixedRow(app, x.kind, x.d));
  } else if (expect && expect.length) {
    for (const kind of expect) strip.appendChild(missingRow(app, other, kind));
  } else {
    strip.appendChild(missingRow(app, other, '면접'));
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
    strip.appendChild(addMockRow(app, next, mocks.length + 1,
      first ? suggestMock(first.d.from) : ''));
  }

  box.appendChild(list);
  if (strip.children.length) box.appendChild(strip);
  return box;
}

/** 대학이 정한 날 — 파싱해 온 값이면 선생님이 고칠 수 있다. */
function fixedRow(app, kind, d) {
  const row = el('div', 'row ev-row');
  const txt = el('div', 'txt');
  txt.appendChild(el('div', 'univ', kind));
  txt.appendChild(el('div', 'dept', d.fixed
    ? label(d.from)
    : `${label(d.from)}~${label(d.to)} 중 하루`));
  /*
   * **파싱한 날짜는 고칠 수 있어야 한다.** 일정표·즐겨찾기에서 온 값은 대학 전체를
   * 두고 한 말이라 이 학생의 실제 날짜와 다를 수 있는데, 여태 그 줄에는 아무
   * 입력이 없어서 틀린 채로 두는 수밖에 없었다. 고치면 시트에 확정으로 남고
   * 그 값이 파싱값을 덮는다(사람이 넣은 것이 언제나 먼저다).
   */
  if (d.status !== 'pending') {
    const fix = document.createElement('details');
    fix.className = 'date-add';
    const sum = document.createElement('summary');
    sum.textContent = '날짜 고치기';
    fix.appendChild(sum);
    const line = el('div', 'field-in');
    const input = document.createElement('input');
    input.type = 'date';
    input.value = d.fixed ? d.from : '';
    input.setAttribute('aria-label', `${shortUniv(app.univ)} ${kind}일 고치기`);
    line.appendChild(input);
    const save = el('button', 'btn', '넣기');
    save.type = 'button';
    save.onclick = () => saveDate(app, kind, input.value);
    line.appendChild(save);
    fix.appendChild(line);
    txt.appendChild(fix);
  }
  row.appendChild(txt);
  const tag = d.status === 'pending' ? '학생 입력 · 확인 대기'
    : d.status === 'confirmed' ? '확정'
      : d.status === 'sched' ? '전형일정표'
        : d.fixed ? '공지' : '기간';
  row.appendChild(el('span', `pill${d.fixed ? '' : ' wait'}`, tag));

  /*
   * 확인할 길을 화면에 둔다. 예전에는 `approveDate` 가 서버와 계약서에만 있고
   * 부르는 데가 없어서, 학생이 넣은 날짜는 **영영 확인 대기**로 남았다.
   * 결과 쪽의 「맞습니다」와 같은 흐름이다 — 대개 맞으니 한 번에 되게 둔다.
   */
  if (d.status === 'pending') {
    const ok = el('button', 'btn', '맞습니다');
    ok.type = 'button';
    ok.title = '학생이 넣은 날짜를 확정합니다. 확정해야 겹침 판정에 쓰입니다.';
    ok.onclick = async () => {
      ok.disabled = true;
      try {
        await store.approveDate(app, kind);
      } catch (err) {
        ok.disabled = false;
        window.alert(`확정하지 못했습니다 — ${err.message}`);
      }
    };
    row.appendChild(ok);
  }
  return row;
}

/** 접힘 칩 — 학생 화면과 같은 규칙: 끝말이 「적기」면 할 일 표시가 붙는다. */
function chip(summaryText, node) {
  const d = document.createElement('details');
  d.className = 'fold-row';
  const sum = document.createElement('summary');
  sum.textContent = summaryText;
  if (/적기$/.test(summaryText)) sum.className = 'todo';
  d.appendChild(sum);
  d.appendChild(node);
  return d;
}

/** 날짜가 없는 지원 — 선생님이 직접 넣는다. 종류는 부르는 쪽의 근거가 정한다. */
function missingRow(app, other, kind) {
  const wrap = el('div', 'field');
  wrap.appendChild(el('p', 'hint', other
    ? `전문대·특수대는 즐겨찾기에 ${kind}일이 없는 일이 많습니다. 직접 넣어 주세요.`
    : `아직 ${kind} 날짜가 없습니다. 학생이 넣으면 여기로 오고, 아는 날짜가 있으면 직접 넣어도 됩니다.`));
  const line = el('div', 'field-in');
  const input = document.createElement('input');
  input.type = 'date';
  input.setAttribute('aria-label', `${shortUniv(app.univ)} ${kind}일`);
  line.appendChild(input);
  const save = el('button', 'btn', '넣기');
  save.type = 'button';
  save.onclick = () => saveDate(app, kind, input.value);
  line.appendChild(save);
  wrap.appendChild(line);
  return chip(`${kind}일 적기`, wrap);
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
  return chip(`모의면접 ${n}차 적기`, wrap);
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
    const who = list.map((e) => `${e.hak} ${e.name} — ${shortUniv(e.app.univ)} ${tidy(e.app.dept)} ${e.kind}`
      + (e.fixed ? '' : ` (${span(e)})`));
    for (const line of who) txt.appendChild(el('div', 'dept', line));
    row.appendChild(txt);
    row.appendChild(el('span', 'pill num', `${list.length}명`));
    stack.appendChild(row);
  }
  box.appendChild(stack);
  return box;
}
