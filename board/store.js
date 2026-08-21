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
import { link as makeLink, indexIpgyeol, indexMojip } from './match.js';

const listeners = new Map();

export const state = {
  ready: false,          // 학생·지원을 받았는가
  enriched: false,       // 공개 자료까지 붙었는가
  who: '',               // 접속한 교사 계정
  students: new Map(),   // hak → Student
  apps: new Map(),       // id → Application
  placement: new Map(),  // id → { slot, rank }
  notes: [],
  unknownCols: [],
  error: '',
};

let ipgyeol = null;
let mojip = null;
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
  state.unknownCols = data.unknownCols || [];
  state.students = new Map((data.students || []).map((s) => [s.hak, s]));
  state.apps = new Map((data.apps || []).map((a) => [a.id, a]));
  state.notes = data.notes || [];
  state.placement = new Map();
  for (const row of data.state || []) {
    state.placement.set(String(row.id), {
      slot: row.slot || 'pool',
      rank: row.rank === '' || row.rank == null ? null : Number(row.rank),
    });
  }
  linkCache.clear();
}

/** 공개 자료(입결·모집요강)를 받아 지표를 붙인다. */
export async function enrich() {
  if (state.enriched) return;
  try {
    const [ip, mo] = await Promise.all([
      fetch('data/ipgyeol.json').then((r) => r.json()),
      fetch('data/mojip2027.json').then((r) => r.json()),
    ]);
    ipgyeol = indexIpgyeol(ip);
    mojip = indexMojip(mo);
    state.enriched = true;
    linkCache.clear();
    emit('change', 'enriched');
  } catch (err) {
    // 지표가 없어도 보드 자체는 쓸 수 있다. 조용히 넘기지 말고 알린다.
    state.error = '입결 자료를 불러오지 못했습니다. 경쟁률·컷 없이 보드만 표시합니다.';
    emit('change', 'enriched');
  }
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
export function link(app) {
  if (!ipgyeol || !mojip) return null;
  if (linkCache.has(app.id)) return linkCache.get(app.id);
  const result = makeLink(app, { ipgyeol, mojip, related: new Map() });
  linkCache.set(app.id, result);
  return result;
}

/** 카드에 얹을 요약. 연결이 없으면 null 필드로 둔다 — 지어내지 않는다. */
export function summary(app) {
  const l = link(app);
  if (!l || l.confidence === 'none') {
    return { linked: false, why: l ? l.why : '입결 자료를 받는 중입니다', rows: [] };
  }
  const rows = l.ipgyeol;
  const latest = rows[rows.length - 1] || null;
  const mine = app.myScore && app.myScore.grade != null ? app.myScore.grade : null;
  const cut = latest && latest.g70 != null ? latest.g70 : null;
  return {
    linked: true,
    why: l.why,
    rows,
    year: latest ? latest.year : null,
    rate: latest ? latest.rate : null,
    cut,
    gap: mine != null && cut != null ? +(cut - mine).toFixed(2) : null,
    mojip: l.mojip[0] || null,
  };
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

/** 같은 학생 안에서 그 순위를 이미 쓰고 있는 지원. 없으면 null. */
export function occupant(hak, rank) {
  for (const app of appsOf(hak)) {
    const p = placementOf(app.id);
    if (p.slot === 'rank' && p.rank === rank) return app;
  }
  return null;
}
