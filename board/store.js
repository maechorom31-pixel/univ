/**
 * 자료 적재와 상태 보관 (P0)
 * =====================================================================
 * 두 갈래에서 받아 브라우저 안에서 합친다.
 *
 *   공개  data/ipgyeol.json · data/mojip2027.json   ← GitHub Pages에서 그대로
 *   개인  학생 · 지원 · 배치 · 메모 · 결과 · 일정    ← Apps Script (인증)
 *
 * 학생 이름이 공개 쪽으로 나가는 요청은 만들지 않는다.
 *
 * 공개 자료는 8MB가 넘는다. 이름이 먼저 뜨고 지표가 나중에 채워지도록,
 * 학생 목록을 받는 즉시 화면을 그리고 공개 자료는 뒤에서 받는다.
 */
import * as api from './api.js';
import {
  link as makeLink, summarize, examDate, examKindFits, paperDates,
  candidates as similarDepts,
  indexIpgyeol, indexMojip, indexCollege, indexSchedule,
} from './match.js';

const listeners = new Map();

export const state = {
  ready: false,          // 학생·지원을 받았는가
  enriched: false,       // 공개 자료까지 붙었는가
  who: '',               // 접속한 교사 계정
  students: new Map(),   // hak → Student
  apps: new Map(),       // id → Application
  placement: new Map(),  // id → { slot, rank }
  notes: [],
  dates: new Map(),      // `${id}|${kind}` → { from, to, status }
  aliases: new Map(),    // `${univ}|${dept}` → { toUniv, toDept, note }
  results: new Map(),    // id → { stage1, final, reason, waitNo, enrolled }
  source: { name: '', known: true },   // 어느 탭을 읽었나
  unknownCols: [],
  error: '',
};

let ipgyeol = null;
let mojip = null;
let college = null;
let sched = null;         // 전형일정표(PDF에서 뽑은 것)
let offline = false;      // 보기용 자료로 열었는가. 그때는 서버를 부르지 않는다
const linkCache = new Map();

/* ── 이벤트 ─────────────────────────────────────────────────────── */

export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => listeners.get(name).delete(fn);
}

function emit(name, payload) {
  for (const fn of listeners.get(name) || []) {
    try { fn(payload); } catch (err) { console.error(err); }
  }
}

/* ── 적재 ───────────────────────────────────────────────────────── */

/** 학생·지원·배치를 받는다. 화면은 이것만으로 그려진다. */
export async function load() {
  state.error = '';
  offline = false;
  const data = await api.students();
  apply(data);
  state.ready = true;
  emit('change', 'data');
  enrich();                 // 공개 자료는 기다리지 않고 뒤에서 받는다
  return state;
}

/** 서버를 부르지 않고 미리 만든 자료로 채운다(데모·시연용). */
export function loadLocal(data) {
  offline = true;
  apply(data);
  state.ready = true;
  emit('change', 'data');
  enrich();
  return state;
}

function apply(data) {
  state.who = data.who || '';
  state.source = {
    name: data.sourceSheet || '',
    known: data.sourceKnown !== false,
    book: data.sourceBook || '',      // 딴 파일에서 읽었으면 그 파일 이름
    warn: data.sourceWarn || '',      // 딴 파일을 열지 못했으면 그 사유
  };
  state.unknownCols = data.unknownCols || [];
  state.students = new Map((data.students || []).map((s) => [s.hak, s]));
  state.apps = new Map((data.apps || []).map((a) => [a.id, a]));
  state.notes = data.notes || [];
  // 선생님이 시트에 적어 둔 결과. 즐겨찾기가 준 값 위에 덮어쓴다 —
  // 예비번호가 도는 12월에는 대교협보다 담임이 먼저 안다.
  state.results = new Map((data.results || []).map((r) => [String(r.id), {
    stage1: String(r.stage1 || ''), final: String(r.final || ''),
    reason: String(r.reason || ''), waitNo: String(r.waitNo || ''),
    enrolled: String(r.enrolled || ''),
    status: String(r.status || 'confirmed'), by: r.by || '', at: r.at || '',
  }]));
  state.aliases = new Map((data.aliases || [])
    .map((r) => [`${r.univ}|${r.dept}`, {
      toUniv: String(r.toUniv || ''), toDept: String(r.toDept || ''),
      note: String(r.note || ''), by: r.by || '', at: r.at || '',
    }]));
  state.dates = new Map((data.dates || []).map((r) => [`${r.id}|${r.kind}`, {
    from: String(r.from || ''), to: String(r.to || r.from || ''),
    status: r.status || 'pending',
  }]));
  state.placement = new Map();
  for (const row of data.state || []) {
    state.placement.set(String(row.id), {
      slot: row.slot || 'pool',
      rank: row.rank === '' || row.rank == null ? null : Number(row.rank),
    });
  }
  linkCache.clear();
}

/**
 * 공개 자료를 받아 지표를 붙인다.
 *
 * 전문대는 자료가 다른 저장소(College)에 있다. 같은 호스트라 출처가 같아서
 * 그대로 받아 올 수 있고, 없더라도 일반대 쪽은 그대로 쓴다.
 */
const SOURCES = [
  ['ipgyeol', 'data/ipgyeol.json', indexIpgyeol, '입결'],
  ['mojip', 'data/mojip2027.json', indexMojip, '모집요강'],
  ['college', '../College/data/departments.json', indexCollege, '전문대 자료'],
  ['sched', 'data/schedule2027.json', indexSchedule, '전형일정표'],
];

export async function enrich() {
  if (state.enriched) return;
  const missing = [];
  const got = await Promise.all(SOURCES.map(async ([name, url, build, label]) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      return build(await res.json());
    } catch (err) {
      missing.push(label);
      return null;
    }
  }));
  [ipgyeol, mojip, college, sched] = got;

  state.enriched = true;
  linkCache.clear();
  // 일부만 못 받아도 보드는 쓸 수 있다. 조용히 넘기지 말고 무엇이 빠졌는지 알린다.
  state.error = missing.length
    ? `불러오지 못한 자료 — ${missing.join(' · ')}. 해당 지표 없이 표시합니다.`
    : '';
  emit('change', 'enriched');
}

/* ── 선택 ───────────────────────────────────────────────────────── */

/**
 * 지금 보고 있는 반과 학생. 보드와 일정판이 같은 선택을 본다.
 * 화면마다 따로 들고 있으면 탭을 옮길 때 선택이 풀린다.
 */
export const selection = { cls: '', hak: '', appId: '' };

export function select(next) {
  Object.assign(selection, next);
  emit('change', 'selection');
}

/* ── 조회 ───────────────────────────────────────────────────────── */

export function classes() {
  return [...new Set([...state.students.values()].map((s) => s.cls))]
    .sort((a, b) => String(a).localeCompare(String(b), 'ko', { numeric: true }));
}

export function studentsOf(cls) {
  return [...state.students.values()]
    .filter((s) => !cls || String(s.cls) === String(cls))
    .sort((a, b) => a.hak.localeCompare(b.hak, 'ko', { numeric: true }));
}

export function appsOf(hak) {
  const student = state.students.get(hak);
  if (!student) return [];
  return student.apps.map((id) => state.apps.get(id)).filter(Boolean);
}

export function placementOf(id) {
  return state.placement.get(String(id)) || { slot: 'pool', rank: null };
}

/** 지원 한 건의 입결·모집요강 연결. 공개 자료가 아직이면 null. */
/**
 * 이 지원에 자료를 붙인다.
 *
 * 선생님이 손으로 이어 준 별칭이 있으면 **그 이름으로 바꿔서** 붙인다.
 * 원래 이름은 그대로 두고 찾을 때만 바꾼다 — 화면에는 학생이 넣은 이름이 나와야 한다.
 */
export function link(app) {
  if (!state.enriched) return null;
  if (linkCache.has(app.id)) return linkCache.get(app.id);

  const alias = state.aliases.get(`${app.univ}|${app.dept}`);
  const target = alias && (alias.toUniv || alias.toDept)
    ? { ...app, univ: alias.toUniv || app.univ, dept: alias.toDept || app.dept }
    : app;

  const result = makeLink(target, { ipgyeol, mojip, college, related: new Map() });
  if (alias) result.alias = alias;
  linkCache.set(app.id, result);
  return result;
}

/* ── 학과 별칭 ─────────────────────────────────────────────────── */

/** 같은 대학에서 이름이 닮은 학과. 고르지는 않는다 — 사람이 고른다. */
export function candidatesFor(app, n) {
  if (!state.enriched) return [];
  return similarDepts(app, { ipgyeol, college }, n);
}

/** 못 붙인 지원. 같은 (대학·학과)끼리 묶어서 돌려준다 — 한 번 이으면 다 붙는다. */
export function unmatched(cls) {
  if (!state.enriched) return [];
  const groups = new Map();
  for (const student of studentsOf(cls || '')) {
    for (const app of appsOf(student.hak)) {
      const l = link(app);
      if (!l || l.confidence !== 'none') continue;
      const key = `${app.univ}|${app.dept}`;
      if (!groups.has(key)) {
        /*
         * **「없음으로 표시」한 것은 목록에서 내린다.**
         * 그 별칭은 `toDept` 가 비어 있어서 `link()` 가 원래 이름으로 다시 찾고,
         * 그래서 다시 `none` 이 되어 그대로 목록에 남았다. 눌러도 아무 일이
         * 안 일어나고 다음 화면에 또 나왔다 — 121명이면 목록이 안 줄어든다.
         *
         * 지우지는 않는다. 접힌 자리로 내려서, 잘못 눌렀으면 되돌릴 수 있게 둔다.
         */
        const alias = state.aliases.get(key);
        const skipped = Boolean(alias) && !alias.toUniv && !alias.toDept;
        groups.set(key, {
          key, univ: app.univ, dept: app.dept, why: l.why, apps: [], who: [],
          skipped, note: (alias && alias.note) || '',
        });
      }
      groups.get(key).apps.push(app);
      groups.get(key).who.push(`${student.hak} ${student.name}`);
    }
  }
  return [...groups.values()].sort((a, b) => (a.skipped - b.skipped)
    || b.apps.length - a.apps.length
    || a.univ.localeCompare(b.univ, 'ko'));
}

export async function setAlias(univ, dept, toUniv, toDept, note) {
  const key = `${univ}|${dept}`;
  const before = new Map(state.aliases);
  state.aliases.set(key, { toUniv: toUniv || '', toDept: toDept || '', note: note || '' });
  linkCache.clear();
  emit('change', 'state');
  if (offline) return;
  try {
    await api.call('setAlias', { univ, dept, toUniv, toDept, note });
  } catch (err) {
    state.aliases = before;
    linkCache.clear();
    emit('change', 'state');
    throw err;
  }
}

export async function removeAlias(univ, dept) {
  const before = new Map(state.aliases);
  state.aliases.delete(`${univ}|${dept}`);
  linkCache.clear();
  emit('change', 'state');
  if (offline) return;
  try {
    await api.call('removeAlias', { univ, dept });
  } catch (err) {
    state.aliases = before;
    linkCache.clear();
    emit('change', 'state');
    throw err;
  }
}

/** 카드에 얹을 요약. 모양은 match.js 의 summarize() 가 정한다. */
export function summary(app) {
  return summarize(link(app), app);
}

/* ── 쓰기 ───────────────────────────────────────────────────────── */

/**
 * 배치를 바꾼다. 화면을 먼저 바꾸고 서버에 보낸 뒤, 실패하면 되돌린다.
 * 상담 중에는 반응이 느린 것보다 되돌아가는 편이 낫다.
 */
export async function place(id, slot, rank) {
  const before = placementOf(id);
  const app = state.apps.get(id);
  if (!app) throw new Error('지원 내역을 찾지 못했습니다.');

  state.placement.set(String(id), { slot, rank: slot === 'rank' ? rank : null });
  emit('change', 'state');
  if (offline) return;         // 보기용 자료는 브라우저 안에서만 바뀐다
  try {
    await api.setState({ id, hak: app.hak, slot, rank: slot === 'rank' ? rank : '' });
  } catch (err) {
    state.placement.set(String(id), before);
    emit('change', 'state');
    throw err;
  }
}

/**
 * 이 지원의 일정 한 종목.
 * 시트에 들어온 값(학생이 넣었거나 선생님이 확정한 것)이 즐겨찾기 원본보다 우선한다.
 * @return {?{from,to,fixed,status}} status: source | pending | confirmed
 */
/**
 * 이 지원의 그 날짜. 여러 자료가 같은 날을 두고 다른 말을 해서 순서를 정해 둔다.
 *
 *   1. 선생님이 확정한 것          시트
 *   2. 학생이 넣고 확인 기다리는 것   시트
 *   3. 즐겨찾기가 준 확정일         export
 *   4. 전형일정표의 날짜별 고사표     schedule2027.json  ← 기간만 있던 자리를 메운다
 *   5. 즐겨찾기가 준 기간           export
 *
 * 사람이 넣은 것이 언제나 먼저다. 3이 4보다 앞인 이유 — 즐겨찾기가 확정일을 주었다면
 * 그건 그 학생의 지원에 붙은 값이고, 일정표는 대학 전체를 두고 한 말이라서다.
 */
export function dateOf(app, kind) {
  const saved = state.dates.get(`${app.id}|${kind}`);
  if (saved && saved.from) {
    return {
      from: saved.from, to: saved.to || saved.from,
      fixed: saved.from === (saved.to || saved.from),
      status: saved.status,
    };
  }
  const d = (app.dates && app.dates[kind]) || null;
  if (d && d.fixed) return { from: d.from, to: d.to, fixed: true, status: 'source' };

  // 즐겨찾기가 기간만 주었거나 아예 없을 때 일정표를 본다.
  // 고사 종류가 이 전형의 유형과 맞고, **전형 이름까지 맞을 때만** 쓴다.
  // 느슨한 값은 이 지원의 날짜가 아니다 — 상세에서 참고로만 보여 준다.
  if (examKindFits(app, kind)) {
    const found = examDate(app, sched);
    if (found && !found.loose) {
      return {
        from: found.from, to: found.to, fixed: found.fixed, status: 'sched',
        why: `전형일정표 · ${found.type || found.kind}`,
      };
    }
  }
  return d ? { from: d.from, to: d.to, fixed: d.fixed, status: 'source' } : null;
}

/** 원서 마감 · 1단계 발표 · 최종 발표. 전형일정표에서 온다. */
export function paperOf(app) {
  return paperDates(app, sched);
}

/**
 * 전형 이름을 못 맞춰 이 지원의 날짜로는 쓰지 않은 고사일.
 * 「이 대학 종합전형은 이때 본다」는 참고다. 상세에서만 보여 준다.
 */
export function examHint(app) {
  const found = examDate(app, sched);
  return found && found.loose ? found : null;
}

/** 일정 한 종목을 넣는다(선생님). 화면을 먼저 바꾸고 서버에 보낸다. */
/**
 * 날짜를 넣는다. **빈 값으로 부르면 지운다** — 모의면접을 잘못 잡았을 때 되돌려야 한다.
 */
export async function setDate(app, kind, from, to) {
  const key = `${app.id}|${kind}`;
  const before = state.dates.get(key);
  if (!from) state.dates.delete(key);
  else state.dates.set(key, { from, to: to || from, status: 'confirmed' });
  emit('change', 'state');
  if (offline) return;
  try {
    await api.setDate({ id: app.id, hak: app.hak, kind, from, to: to || from });
  } catch (err) {
    if (before) state.dates.set(key, before); else state.dates.delete(key);
    emit('change', 'state');
    throw err;
  }
}

/**
 * 학생이 넣은 날짜를 그대로 확정한다.
 *
 * 확인 전(`pending`)에는 겹침을 「겹칠 수 있음」까지만 말한다(schedule.js clashes).
 * 확정해야 「겹침」이 된다 — 잘못 적은 날짜 하나로 여섯 칸 판단이 흔들리면 안 되기 때문이다.
 */
export async function approveDate(app, kind) {
  const key = `${app.id}|${kind}`;
  const before = state.dates.get(key);
  if (!before) return;
  state.dates.set(key, { ...before, status: 'confirmed' });
  emit('change', 'state');
  if (offline) return;
  try {
    await api.call('approveDate', { id: app.id, hak: app.hak, kind });
  } catch (err) {
    state.dates.set(key, before);
    emit('change', 'state');
    throw err;
  }
}

/** 학생이 넣고 아직 확인 안 된 날짜 전부 — 담임의 「오늘 할 일」에 쓴다. */
export function pendingDates(cls) {
  const out = [];
  for (const [key, d] of state.dates) {
    if (!d || d.status !== 'pending') continue;
    const id = key.slice(0, key.lastIndexOf('|'));
    const kind = key.slice(key.lastIndexOf('|') + 1);
    const app = state.apps.get(id);
    if (!app) continue;
    const student = state.students.get(app.hak);
    if (!student || (cls && String(student.cls) !== String(cls))) continue;
    out.push({ app, student, kind, date: d });
  }
  return out;
}

/* ── 결과 ───────────────────────────────────────────────────────── */

/**
 * 이 지원의 결과.
 *
 * 두 곳에서 온다 — 즐겨찾기 export 와 선생님이 시트에 적은 것.
 * **시트가 이긴다.** 예비번호가 도는 12월에는 대교협 자료보다 담임이 먼저 알고,
 * 등록 여부는 애초에 대교협이 모른다.
 *
 * 칸별로 덮어쓴다. 시트에 최종만 적었다면 1단계는 즐겨찾기 값이 그대로 남는다.
 */
export function resultOf(app) {
  const base = (app && app.result) || {};
  const mine = state.results.get(String(app && app.id)) || {};
  const pick = (k) => (mine[k] ? mine[k] : (base[k] || null));
  const written = Boolean(mine.final || mine.stage1 || mine.waitNo || mine.enrolled);

  /*
   * **칸마다 따로 메우면 안 되는 것이 있다.**
   *
   * 예비번호와 불합격 사유는 최종 결과에 딸린 값이다. 칸마다 「비었으면 즐겨찾기 것」을
   * 하면, 최초합격으로 고쳐 저장한 뒤에도 즐겨찾기의 옛 예비번호가 그대로 새어 나와
   * 「최초합격 · 예비 7번」이 되고, 불합격이었던 건은 「최초합격 · 수능최저 미충족」이
   * 된다. 둘 다 말이 안 되는데 화면에는 그럴듯하게 찍힌다.
   *
   * 그래서 **최종 결과를 새로 적었으면 거기 딸린 값도 그 사람이 적은 것만 쓴다.**
   * 같은 결과를 다시 적은 것이면(고친 게 아니라 확인한 것이면) 즐겨찾기 값을 그대로 둔다.
   */
  const changedFinal = Boolean(mine.final) && mine.final !== base.final;
  const attached = (k) => (changedFinal ? (mine[k] || null) : pick(k));

  return {
    stage1: pick('stage1'), final: pick('final'), reason: attached('reason'),
    waitNo: attached('waitNo'), enrolled: attached('enrolled'),
    edited: written,
    // 학생이 적고 아직 선생님이 확인하지 않은 것
    pending: written && mine.status === 'student',
    status: written ? (mine.status || 'confirmed') : '',
    by: mine.by || '', at: mine.at || '',
  };
}

/** 결과를 적는다. 빈 칸으로 저장하면 즐겨찾기 값으로 되돌아간다. */
export async function setResult(app, next) {
  const id = String(app.id);
  const before = new Map(state.results);
  const row = {
    stage1: next.stage1 || '', final: next.final || '', reason: next.reason || '',
    waitNo: next.waitNo || '', enrolled: next.enrolled || '',
    status: 'confirmed', by: state.who || '', at: new Date().toISOString(),
  };
  const empty = !row.stage1 && !row.final && !row.reason && !row.waitNo && !row.enrolled;
  if (empty) state.results.delete(id); else state.results.set(id, row);
  emit('change', 'state');
  if (offline) return;
  try {
    await api.setResult({ id, hak: app.hak, ...next });
  } catch (err) {
    state.results = before;
    emit('change', 'state');
    throw err;
  }
}

/** 학생이 적어 두고 선생님 확인을 기다리는 결과. */
export function pendingResults(cls) {
  const out = [];
  for (const student of studentsOf(cls || '')) {
    for (const app of appsOf(student.hak)) {
      const r = resultOf(app);
      if (r.pending) out.push({ app, student, result: r });
    }
  }
  return out;
}

/** 학생이 적은 결과를 그대로 확인한다. */
export async function approveResult(app) {
  const id = String(app.id);
  const row = state.results.get(id);
  if (!row) return;
  const before = new Map(state.results);
  state.results.set(id, { ...row, status: 'confirmed', by: state.who || '' });
  emit('change', 'state');
  if (offline) return;
  try {
    await api.call('approveResult', { id, hak: app.hak });
  } catch (err) {
    state.results = before;
    emit('change', 'state');
    throw err;
  }
}

/* ── 메모 ───────────────────────────────────────────────────────── */

/**
 * 이 지원(또는 이 학생)에 달린 메모.
 * `id` 를 주면 그 지원에 달린 것만, 안 주면 학생에게 달린 것까지 모두.
 */
export function notesOf(hak, id) {
  return state.notes
    .filter((n) => String(n.hak) === String(hak) && (!id || String(n.id) === String(id)))
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
}

/**
 * 메모를 단다. `visible` 이 참이면 학생 화면에도 같이 보인다.
 * 화면을 먼저 바꾸고 서버에 보낸 뒤, 실패하면 되돌린다.
 */
export async function addNote(hak, id, text, visible) {
  const body = String(text || '').trim();
  if (!body) return null;
  const noteId = `tmp-${Date.now()}`;
  const row = {
    noteId, hak, id: id || '', text: body,
    visible: visible ? 'Y' : 'N', by: state.who || '', at: new Date().toISOString(),
  };
  state.notes = [...state.notes, row];
  emit('change', 'state');
  if (offline) return row;
  try {
    const res = await api.addNote({ hak, id: id || '', text: body, visible: visible ? 'Y' : 'N' });
    if (res && res.noteId) row.noteId = String(res.noteId);   // 서버가 준 번호로 바꿔 둔다
    return row;
  } catch (err) {
    state.notes = state.notes.filter((n) => n !== row);
    emit('change', 'state');
    throw err;
  }
}

/** 메모를 지운다. */
export async function removeNote(noteId) {
  const before = state.notes;
  state.notes = state.notes.filter((n) => String(n.noteId) !== String(noteId));
  emit('change', 'state');
  if (offline) return;
  try {
    await api.removeNote(noteId);
  } catch (err) {
    state.notes = before;
    emit('change', 'state');
    throw err;
  }
}

/** 같은 학생 안에서 그 순위를 이미 쓰고 있는 지원. 없으면 null. */
export function occupant(hak, rank) {
  for (const app of appsOf(hak)) {
    const p = placementOf(app.id);
    if (p.slot === 'rank' && p.rank === rank) return app;
  }
  return null;
}
