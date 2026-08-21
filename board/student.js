/**
 * 학생 화면 (P5)
 * =====================================================================
 * 개인 링크로 열면 자기 지원만 보인다. 토큰이 가리키는 학번의 것만 서버가 내주고,
 * 쓰는 것도 자기 것만 된다. 다른 학생을 고르는 길은 화면에도 서버에도 없다.
 *
 * 학생이 넣는 것
 *   면접 확정일 — 대학에서 배정을 받는 사람이 학생이다. 모집요강은 기간만 주는
 *                경우가 41%라, 확정일은 통보받은 학생이 넣는 게 가장 정확하다.
 *   접수번호 · 질문
 * 넣으면 곧바로 확정되지 않고 **확인 대기**로 들어간다. 담임이 눌러야 확정된다.
 * 잘못 적은 날짜로 겹침 판정이 틀어지면 안 되기 때문이다.
 *
 * 보이지 않는 것 — 다른 학생, 교사 비공개 메모, 발표 전 결과.
 */
import * as api from './api.js';
import { link as makeLink, indexIpgyeol, indexMojip, indexCollege } from './match.js';

const ATTEND = ['면접', '실기', '논술', '적성'];
const MOCK = '모의면접';        // 학교에서 잡아 준다 — 학생은 보기만 한다
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const state = {
  token: '',
  student: null,
  apps: [],
  placement: new Map(),
  dates: new Map(),      // `${id}|${kind}` → { from, to, status }
  notes: [],
  src: null,
  busy: false,
  notice: '',
  error: '',
};

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const tidy = (s) => String(s || '').replace(/ (?=[^ ]{1,4}$)/, ' ');
const shortUniv = (n) => String(n || '').replace(/\s*[-–—]\s*.*$/, '');
const g2 = (n) => (n == null ? null : Number(n).toFixed(2));
const label = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${m}/${d}(${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
};

/* ── 시작 ─────────────────────────────────────────────────────── */

export async function start(token, demoData) {
  state.token = token;
  render();
  try {
    const data = demoData || await api.call('student', { token }, { timeout: 45000 });
    apply(data);
  } catch (err) {
    state.error = err.message;
  }
  render();
  loadPublic();
}

function apply(data) {
  state.student = data.student || null;
  state.apps = data.apps || [];
  state.notes = data.notes || [];
  state.placement = new Map((data.state || []).map((r) => [String(r.id), {
    slot: r.slot || 'pool',
    rank: r.rank === '' || r.rank == null ? null : Number(r.rank),
  }]));
  state.dates = new Map((data.dates || []).map((r) => [`${r.id}|${r.kind}`, {
    from: String(r.from || ''), to: String(r.to || r.from || ''), status: r.status || 'pending',
  }]));
}

/** 입결은 공개 자료라 학생 화면에서도 그대로 받는다. */
async function loadPublic() {
  const grab = async (url, build) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      return build(await res.json());
    } catch (err) { return null; }
  };
  const [ipgyeol, mojip, college] = await Promise.all([
    grab('data/ipgyeol.json', indexIpgyeol),
    grab('data/mojip2027.json', indexMojip),
    grab('../College/data/departments.json', indexCollege),
  ]);
  state.src = { ipgyeol, mojip, college, related: new Map() };
  render();
}

function summaryOf(app) {
  if (!state.src) return null;
  const l = makeLink(app, state.src);
  if (l.confidence === 'none') return { linked: false, why: l.why };
  if (l.kind === 'college') {
    const d = l.college[0];
    return { linked: true, kind: 'college', rate: d.comp[0], avg: d.avg[0], cut: d.min[0], employ: d.employ };
  }
  const last = l.ipgyeol[l.ipgyeol.length - 1];
  return { linked: true, kind: 'univ', rate: last ? last.rate : null, cut: last ? last.g70 : null };
}

/** 이 지원의 일정 — 학생이 넣은 값이 있으면 그것이 우선한다. */
function dateOf(app, kind) {
  const mine = state.dates.get(`${app.id}|${kind}`);
  if (mine && mine.from) {
    return { from: mine.from, to: mine.to || mine.from, fixed: true, status: mine.status };
  }
  const d = app.dates && app.dates[kind];
  return d ? { ...d, status: 'source' } : null;
}

/* ── 그리기 ───────────────────────────────────────────────────── */

function render() {
  const main = $('#me');
  main.textContent = '';

  if (state.error) {
    main.appendChild(note(`오류: ${state.error}`, true));
    return;
  }
  if (!state.student) {
    main.appendChild(el('p', 'empty-state', '내 지원 내역을 불러오는 중입니다.'));
    return;
  }

  const s = state.student;
  $('#who').textContent = `${s.hak} ${tidy(s.name)}`;

  if (state.notice) main.appendChild(note(state.notice));
  main.appendChild(upcoming());
  main.appendChild(clashPanel());

  const ranked = state.apps
    .filter((a) => (state.placement.get(String(a.id)) || {}).slot === 'rank')
    .sort((a, b) => state.placement.get(String(a.id)).rank - state.placement.get(String(b.id)).rank);
  const rest = state.apps.filter((a) => !ranked.includes(a));

  main.appendChild(group('지원 6칸', ranked, `${ranked.length}/6`,
    ranked.length ? '' : '아직 순위가 정해지지 않았습니다. 상담 때 함께 정합니다.'));
  if (rest.length) main.appendChild(group('그 밖의 지원', rest, `${rest.length}곳`, ''));
}

function upcoming() {
  const box = el('section', 'panel');
  box.appendChild(el('h2', '', '다가오는 일정'));
  const today = new Date().toISOString().slice(0, 10);
  const list = [];
  for (const app of state.apps) {
    for (const kind of [...ATTEND, MOCK]) {
      const d = dateOf(app, kind);
      if (d && d.to >= today) list.push({ app, kind, d });
    }
  }
  list.sort((a, b) => (a.d.from < b.d.from ? -1 : 1));
  if (!list.length) {
    box.appendChild(el('p', 'empty-state', '남은 면접·실기·논술 일정이 없습니다.'));
    return box;
  }
  const stack = el('div', 'stack');
  for (const x of list.slice(0, 5)) {
    const row = el('div', 'row');
    const txt = el('div', 'txt');
    txt.appendChild(el('div', 'univ', `${shortUniv(x.app.univ)} ${x.kind}`));
    txt.appendChild(el('div', 'dept', x.d.fixed
      ? label(x.d.from)
      : `${label(x.d.from)}~${label(x.d.to)} 중 하루`));
    row.appendChild(txt);
    const days = Math.round((Date.parse(x.d.from) - Date.parse(today)) / 86400000);
    row.appendChild(el('span', `pill num${days <= 7 ? ' mark' : ''}`,
      days <= 0 ? '오늘' : `D-${days}`));
    stack.appendChild(row);
  }
  box.appendChild(stack);
  return box;
}

function clashPanel() {
  const box = el('section', 'panel');
  const events = [];
  for (const app of state.apps) {
    for (const kind of ATTEND) {
      const d = dateOf(app, kind);
      if (d) events.push({ app, kind, ...d });
    }
  }
  const hits = [];
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const a = events[i]; const b = events[j];
      if (a.app.id === b.app.id) continue;
      if (a.from > b.to || b.from > a.to) continue;
      hits.push({ a, b, sure: a.fixed && b.fixed && a.from === b.from });
    }
  }
  hits.sort((x, y) => y.sure - x.sure);

  box.appendChild(el('h2', '', '겹치는 날'));
  if (!hits.length) {
    box.appendChild(el('p', 'empty-state', '지금 들어온 날짜로는 겹치는 곳이 없습니다.'));
    return box;
  }
  const stack = el('div', 'stack');
  for (const h of hits) {
    const row = el('div', 'row');
    const txt = el('div', 'txt');
    txt.appendChild(el('div', 'univ',
      `${shortUniv(h.a.app.univ)} ${h.a.kind} ↔ ${shortUniv(h.b.app.univ)} ${h.b.kind}`));
    txt.appendChild(el('div', 'dept', h.sure
      ? `${label(h.a.from)} 같은 날입니다. 담임 선생님과 상의해 주세요.`
      : '날짜가 포개집니다. 확정일이 나오면 넣어 주세요.'));
    row.appendChild(txt);
    row.appendChild(el('span', `pill ${h.sure ? 'warn' : 'wait'}`, h.sure ? '겹침' : '겹칠 수 있음'));
    stack.appendChild(row);
  }
  box.appendChild(stack);
  return box;
}

function group(title, apps, count, help) {
  const box = el('section', 'panel');
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', title));
  head.appendChild(el('span', 'count num', count));
  box.appendChild(head);
  if (help) box.appendChild(el('p', 'section-label', help));
  for (const app of apps) box.appendChild(card(app));
  return box;
}

function card(app) {
  const box = el('article', 'mycard');
  const place = state.placement.get(String(app.id)) || {};
  if (place.slot === 'rank') box.appendChild(el('div', 'rank', `${place.rank}순위`));
  box.appendChild(el('div', 'univ', tidy(shortUniv(app.univ))));
  box.appendChild(el('div', 'dept', `${tidy(app.dept)} · ${app.typeSub || app.typeName || ''}`));

  const s = summaryOf(app);
  const figs = el('div', 'figs');
  const add = (k, v) => {
    if (v == null) return;
    const f = el('div', 'fig');
    f.appendChild(el('span', 'k', k));
    f.appendChild(el('span', 'v num', v));
    figs.appendChild(f);
  };
  if (s && s.linked) {
    if (s.kind === 'college') { add('평균등급', g2(s.avg)); add('최저등급', g2(s.cut)); }
    else add('작년 70컷', g2(s.cut));
    add('경쟁률', s.rate != null ? `${s.rate}:1` : null);
  }
  if (app.quota != null) add('모집', `${app.quota}명`);
  box.appendChild(figs);

  const mock = dateOf(app, MOCK);
  if (mock) {
    const line = el('p', 'hint', `모의면접 ${label(mock.from)} — 학교에서 잡아 준 날짜입니다.`);
    box.appendChild(line);
  }
  for (const kind of ATTEND) {
    const d = dateOf(app, kind);
    if (!d && !(app.dates && app.dates[kind])) continue;
    box.appendChild(dateRow(app, kind, d));
  }
  box.appendChild(applyNoRow(app));
  return box;
}

/** 면접 확정일을 넣는 줄. 넣으면 확인 대기로 들어간다. */
function dateRow(app, kind, d) {
  const wrap = el('div', 'field');
  const id = `d-${app.id}-${kind}`;
  const lab = el('label', '', `${kind}일`);
  lab.htmlFor = id;
  wrap.appendChild(lab);

  const hint = el('p', 'hint');
  if (!d) hint.textContent = '아직 공지된 날짜가 없습니다.';
  else if (d.status === 'pending') hint.textContent = `${label(d.from)} — 선생님 확인을 기다리는 중입니다.`;
  else if (d.status === 'confirmed') hint.textContent = `${label(d.from)} 로 확정되었습니다.`;
  else if (d.fixed) hint.textContent = `${label(d.from)} 로 공지되어 있습니다.`;
  else hint.textContent = `${label(d.from)}~${label(d.to)} 중 하루입니다. 배정을 받으면 아래에 넣어 주세요.`;
  wrap.appendChild(hint);

  const row = el('div', 'field-in');
  const input = document.createElement('input');
  input.type = 'date';
  input.id = id;
  input.value = d && d.status !== 'source' ? d.from : '';
  if (d) { input.min = d.from; input.max = d.to; }
  input.disabled = state.busy;
  row.appendChild(input);

  const btn = el('button', 'btn btn-primary', '저장');
  btn.type = 'button';
  btn.disabled = state.busy;
  btn.onclick = () => saveDate(app, kind, input.value);
  row.appendChild(btn);
  wrap.appendChild(row);
  return wrap;
}

function applyNoRow(app) {
  const wrap = el('div', 'field');
  const id = `n-${app.id}`;
  const lab = el('label', '', '원서 접수번호');
  lab.htmlFor = id;
  wrap.appendChild(lab);

  const saved = state.notes.find((n) => String(n.id) === String(app.id)
    && String(n.text || '').startsWith('접수번호'));
  wrap.appendChild(el('p', 'hint', saved
    ? `${String(saved.text).replace('접수번호', '').trim()} 로 저장되어 있습니다.`
    : '원서를 넣고 받은 번호를 적어 두면 나중에 찾기 쉽습니다.'));

  const row = el('div', 'field-in');
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.id = id;
  input.value = saved ? String(saved.text).replace('접수번호', '').trim() : '';
  input.disabled = state.busy;
  row.appendChild(input);

  const btn = el('button', 'btn', '저장');
  btn.type = 'button';
  btn.disabled = state.busy;
  btn.onclick = () => saveApplyNo(app, input.value);
  row.appendChild(btn);
  wrap.appendChild(row);
  return wrap;
}

/* ── 쓰기 ─────────────────────────────────────────────────────── */

async function saveDate(app, kind, value) {
  if (!value) { state.notice = '날짜를 골라 주세요.'; render(); return; }
  state.busy = true; state.notice = ''; render();
  try {
    await api.call('studentDate', { token: state.token, id: app.id, kind, from: value, to: value });
    state.dates.set(`${app.id}|${kind}`, { from: value, to: value, status: 'pending' });
    state.notice = `${shortUniv(app.univ)} ${kind}일을 ${label(value)} 로 보냈습니다. 선생님이 확인하면 확정됩니다.`;
  } catch (err) {
    state.notice = `오류: ${err.message}`;
  } finally {
    state.busy = false; render();
  }
}

async function saveApplyNo(app, value) {
  state.busy = true; state.notice = ''; render();
  try {
    await api.call('studentApplyNo', { token: state.token, id: app.id, applyNo: value });
    const key = state.notes.find((n) => String(n.id) === String(app.id)
      && String(n.text || '').startsWith('접수번호'));
    if (key) key.text = `접수번호 ${value}`;
    else state.notes.push({ id: app.id, text: `접수번호 ${value}`, visible: 'Y' });
    state.notice = '접수번호를 저장했습니다.';
  } catch (err) {
    state.notice = `오류: ${err.message}`;
  } finally {
    state.busy = false; render();
  }
}

function note(text, isError) {
  return el('p', `note${isError ? ' error' : ''}`, text);
}
