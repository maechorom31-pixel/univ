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
import { link as makeLink, indexIpgyeol, indexMojip, indexCollege, summarize } from './match.js';

const ATTEND = ['면접', '실기', '논술', '적성'];
const MOCK = '모의면접';
/** 모의면접은 여러 번 한다. 학생 화면도 전부 보여 준다. */
// 학교에서 잡아 준다 — 학생은 보기만 한다. 여러 번 하므로 전부 본다.
const MOCKS = [MOCK, ...Array.from({ length: 5 }, (_, i) => `${MOCK}${i + 1}`)];
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

let offline = false;

const state = {
  results: new Map(),
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
  // 보기용 자료로 열면 서버를 부르지 않는다. 그래야 학생에게 링크를 주기 전에
  // 선생님이 저장까지 눌러 보며 확인할 수 있다.
  offline = Boolean(demoData);
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
  state.results = new Map((data.results || []).map((r) => [String(r.id), {
    stage1: String(r.stage1 || ''), final: String(r.final || ''),
    reason: String(r.reason || ''), waitNo: String(r.waitNo || ''),
    enrolled: String(r.enrolled || ''), status: String(r.status || 'confirmed'),
  }]));
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

/** 선생님 화면과 **같은** 요약을 본다. 같은 지원이 두 화면에서 다르게 보이면 안 된다. */
function summaryOf(app) {
  if (!state.src) return null;
  return summarize(makeLink(app, state.src), app);
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
  firstApplyNo = false;

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

  /*
   * 차례는 **지금 급한 것**을 따른다.
   *
   * 원서 마감이 9월 11일이고 면접은 10월부터다. 지원을 고르는 지금은 「내가 어디
   * 여섯 곳을 넣었나」가 먼저고, 면접 날짜는 아직 한참 뒤다. 그래서 6칸을 위에 둔다.
   *
   * 다만 면접이 코앞이면 그때는 그게 먼저다. 여섯 장을 스크롤해서 내려가야 내일
   * 면접 날짜가 나오면 안 된다. 그래서 **이레 안에 닥친 것만** 맨 위에 한 줄로 띄운다.
   * 지원철에는 닥친 것이 없으니 이 줄이 아예 안 나오고, 11월이 되면 저절로 나타난다.
   * 학생이 무엇을 켜고 끌 필요가 없다.
   */
  main.appendChild(soon());

  const ranked = state.apps
    .filter((a) => (state.placement.get(String(a.id)) || {}).slot === 'rank')
    .sort((a, b) => state.placement.get(String(a.id)).rank - state.placement.get(String(b.id)).rank);
  const rest = state.apps.filter((a) => !ranked.includes(a));

  main.appendChild(group('지원 6칸', ranked, `${ranked.length}/6`,
    ranked.length ? '' : '아직 순위가 정해지지 않았습니다. 상담 때 함께 정합니다.'));

  /*
   * 숫자를 처음 만나는 자리에 읽는 법을 둔다.
   *
   * 카드에는 「70%컷 2.96 / 내 환산 3.17」이 나란히 있는데, 옆에 선생님이 없으면
   * 학생은 이걸 보고 혼자 「나는 떨어지는구나」로 끝낸다. 실제로는 작년 한 해의
   * 한 지점일 뿐이고, 올해 모집인원·경쟁률·최저가 다르면 통째로 달라진다.
   *
   * 이 말은 맨 아래 각주에도 있지만 거기까지 스크롤하는 학생은 없다.
   * 숫자 바로 앞에 둬야 읽는다.
   */
  if (ranked.length || rest.length) {
    const how = el('p', 'howto');
    how.appendChild(el('b', '', '숫자 읽는 법'));
    how.appendChild(document.createTextNode(' 왼쪽은 '));
    how.appendChild(el('b', '', '작년에 붙은 사람들'));
    how.appendChild(document.createTextNode(
      '의 성적이고 오른쪽이 내 성적입니다. 작년 한 해의 한 지점일 뿐이라,'
        + ' 올해 뽑는 인원이나 경쟁률이 달라지면 함께 움직입니다.'
        + ' 숫자만 보고 혼자 판단하지 말고 담임 선생님과 같이 봐 주세요.'));
    main.appendChild(how);
  }

  if (rest.length) {
    main.appendChild(group('그 밖의 지원', rest, `${rest.length}곳`,
      '6칸에 넣지 않았거나 6회 제한 밖(전문대·특수대)인 지원입니다.'));
  }

  main.appendChild(upcoming());
  main.appendChild(clashPanel());
}

/** 오늘. 시험에서 흔들리지 않게 한곳에서 만든다. */
const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * 이레 안에 닥친 것만. 없으면 아무것도 그리지 않는다.
 *
 * 지원철에는 이 줄이 안 나온다. 11월이 되면 저절로 나타난다.
 */
function soon() {
  const wrap = el('div');
  const today = todayISO();
  const limit = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);

  const list = [];
  for (const app of state.apps) {
    for (const kind of [...ATTEND, ...MOCKS]) {
      const d = dateOf(app, kind);
      if (d && d.to >= today && d.from <= limit) list.push({ app, kind, d });
    }
  }
  if (!list.length) return wrap;
  list.sort((a, b) => (a.d.from < b.d.from ? -1 : 1));

  const box = el('section', 'panel soon');
  box.appendChild(el('h2', '', '곧 있습니다'));
  const stack = el('div', 'stack');
  for (const x of list) {
    const row = el('div', 'row');
    const txt = el('div', 'txt');
    txt.appendChild(el('div', 'univ', `${shortUniv(x.app.univ)} ${x.kind}`));
    txt.appendChild(el('div', 'dept', x.d.fixed
      ? label(x.d.from)
      : `${label(x.d.from)}~${label(x.d.to)} 중 하루`));
    row.appendChild(txt);
    const days = Math.round((Date.parse(x.d.from) - Date.parse(today)) / 86400000);
    row.appendChild(el('span', 'pill mark num', days <= 0 ? '오늘' : `D-${days}`));
    stack.appendChild(row);
  }
  box.appendChild(stack);
  wrap.appendChild(box);
  return wrap;
}

function upcoming() {
  const box = el('section', 'panel');
  box.appendChild(el('h2', '', '다가오는 일정'));
  const today = todayISO();
  const list = [];
  for (const app of state.apps) {
    for (const kind of [...ATTEND, ...MOCKS]) {
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

/**
 * 대학 쪽 숫자와 내 성적을 갈라 놓는다.
 *
 *     작년 26입결        내 성적
 *     70%컷  3.58        환산   2.94
 *     실질   2.4:1       전교과 3.20
 *
 * 윗줄 둘은 **같은 잣대**다 — 대학이 제 방식으로 환산한 등급끼리라 가로로 견줄 수 있다.
 * 전교과는 잣대가 달라 아랫줄에 참고로 둔다. 차이값은 계산하지 않는다.
 * 「3.58인데 2.94니까 된다」는 말은 이 자료가 할 수 있는 말이 아니다.
 */
function figures(app) {
  const s = summaryOf(app);
  const naesin = (state.student && state.student.naesin) || {};
  const total = g2(naesin['전교과'] ?? naesin['전교과(100)']);
  const mine = app.myScore || {};

  const wrap = el('div', 'figs');
  const group = (title, list) => {
    const rows = list.filter((x) => x && x[1] != null);
    if (!rows.length) return null;
    const box = el('div', 'fig-g');
    box.appendChild(el('div', 'fig-h', title));
    for (const [k, v] of rows) {
      const line = el('div', 'fig');
      line.appendChild(el('span', 'k', k));
      line.appendChild(el('span', 'v num', v));
      box.appendChild(line);
    }
    return box;
  };

  let left = null;
  if (s && s.kind === 'college' && s.linked) {
    left = group('작년', [['평균등급', g2(s.avg)], ['최저등급', g2(s.cut)]]);
  } else if (s && s.linked) {
    const comp = s.real.value != null
      ? ['실질', `${Number(s.real.value).toFixed(1)}:1`]
      : (s.rate != null ? ['경쟁률', `${s.rate}:1`] : null);
    left = group(s.year ? `작년 ${String(s.year).slice(2)}입결` : '작년', [
      ['70%컷', g2(s.cut)], comp,
    ]);
    // 어느 전형의 컷인지. 이 학과 입결에 전형이 여럿인 경우가 훨씬 흔하다.
    if (left && s.type) {
      const guessed = s.typeFit === 'cat' || s.typeFit === 'only';
      left.appendChild(el('div', 'fig-note', guessed ? `${s.type} (아마도)` : s.type));
    }
  } else if (s && s.before && s.before.line.g70) {
    const g = s.before.line.g70;
    left = group('묶이기 전 참고', [
      ['가운데', g2(g.mid)],
      ['범위', `${g2(g.lo)}~${g2(g.hi)}`],
    ]);
    if (left) left.classList.add('approx');
  }

  const right = group('내 성적', [
    ['환산', g2(mine.grade) || (mine.score != null ? String(mine.score) : null)],
    ['전교과', total],
  ]);

  if (left) wrap.appendChild(left);
  if (right) wrap.appendChild(right);
  if (left && right) wrap.classList.add('two');
  return wrap;
}

/** 숫자로는 안 되지만 알아야 하는 것 — 뽑는 인원과 수능 최저. */
function marks(app) {
  const s = summaryOf(app);
  const wrap = el('div', 'pills');
  const add = (text, kind) => wrap.appendChild(el('span', `pill${kind ? ' ' + kind : ''}`, text));

  const now = s ? s.quotaNow : app.quota;
  const prev = s ? s.quotaPrev : null;
  if (now != null) {
    const d = prev != null ? now - prev : null;
    const heavy = d < 0 && Math.abs(d) >= 3 && Math.abs(d) / prev >= 0.2;
    if (d) add(`${now}명 뽑음 (작년 ${prev})`, heavy ? 'warn' : '');
    else add(`${now}명 뽑음`);
  }
  if (s && s.stages > 1) add(`${s.stages}단계`);
  if (app.minReqText) add('수능 최저 있음', 'mark');
  /*
   * 학과 입결은 있는데 이 전형이 어느 줄인지 못 가린 경우. 그냥 비워 두면
   * 학생은 「자료가 없구나」로 읽는다. 있는데 못 골랐다는 것과는 다른 말이다.
   */
  if (s && s.linked && s.kind === 'univ' && s.typeFit === 'none') {
    add('작년 숫자 못 붙임', 'warn');
  }
  return wrap;
}

function card(app) {
  const box = el('article', 'mycard');
  const place = state.placement.get(String(app.id)) || {};
  if (place.slot === 'rank') box.appendChild(el('div', 'rank', `${place.rank}순위`));
  box.appendChild(el('div', 'univ', tidy(shortUniv(app.univ))));
  box.appendChild(el('div', 'dept', `${tidy(app.dept)} · ${app.typeSub || app.typeName || ''}`));

  box.appendChild(figures(app));
  box.appendChild(marks(app));

  // 모의면접은 여러 번 한다. 잡힌 것을 다 보여 준다.
  const mocks = MOCKS.map((k) => dateOf(app, k)).filter(Boolean);
  if (mocks.length) {
    box.appendChild(el('p', 'hint', mocks.length === 1
      ? `모의면접 ${label(mocks[0].from)} — 학교에서 잡아 준 날짜입니다.`
      : `모의면접 ${mocks.map((m, i) => `${i + 1}차 ${label(m.from)}`).join(' · ')}`
        + ' — 학교에서 잡아 준 날짜입니다.'));
  }
  for (const kind of ATTEND) {
    const d = dateOf(app, kind);
    if (!d && !(app.dates && app.dates[kind])) continue;
    box.appendChild(dateRow(app, kind, d));
  }
  box.appendChild(applyNoRow(app));
  box.appendChild(resultRow(app));
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

/* ── 결과 ───────────────────────────────────────────────────────── */

const FINAL = ['', '1단계 합격', '최초합격', '충원합격', '불합격', '미등록'];

/**
 * 합격·불합격을 **학생이 적는다.**
 *
 * 한 학년 121명 × 여섯 칸이면 700건이다. 담임이 다 칠 수 없고, 애초에 합격자 발표는
 * 학생이 대학 홈페이지에서 먼저 본다. 예비번호가 몇 번까지 돌았는지는 더 그렇다 —
 * 학생은 하루에도 몇 번씩 들여다본다.
 *
 * 그래서 학생이 적고 선생님은 확인만 한다. 적은 값은 바로 선생님 화면에 뜨되
 * 「학생이 적음」으로 표시된다.
 *
 * 칸을 셋으로 줄였다. 학생이 발표 화면에서 그대로 옮길 수 있는 것만 남긴다 —
 * 「불합격 사유」 같은 건 학생이 모르고, 알아도 적기 괴로운 칸이다.
 */
function resultRow(app) {
  const wrap = el('div', 'field');
  const saved = state.results.get(String(app.id)) || {};
  const base = app.result || {};
  const now = saved.final || base.final || '';

  const lab = el('label', '', '결과');
  wrap.appendChild(lab);

  const hint = el('p', 'hint');
  if (!now) {
    hint.textContent = '발표가 나면 여기에 적어 주세요. 선생님도 함께 봅니다.';
  } else if (saved.status === 'student') {
    hint.textContent = `${now}${saved.waitNo ? ` · 예비 ${saved.waitNo}번` : ''}`
      + ' — 선생님 확인을 기다리는 중입니다.';
  } else {
    hint.textContent = `${now}${saved.waitNo || base.waitNo ? ` · 예비 ${saved.waitNo || base.waitNo}번` : ''}`
      + (saved.status === 'confirmed' && saved.final ? ' 로 확인되었습니다.' : ' 입니다.');
  }
  wrap.appendChild(hint);

  const row = el('div', 'field-in res-in');
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', `${app.univ} 결과`);
  for (const o of FINAL) {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o || '아직 발표 전';
    if (now === o) opt.selected = true;
    sel.appendChild(opt);
  }
  if (now && !FINAL.includes(now)) {
    const opt = document.createElement('option');
    opt.value = now; opt.textContent = now; opt.selected = true;
    sel.appendChild(opt);
  }
  sel.disabled = state.busy;
  row.appendChild(sel);

  // 예비번호는 충원합격일 때만 묻는다. 늘 띄우면 여섯 칸이 다 예비번호 칸이 된다.
  const wait = document.createElement('input');
  wait.type = 'text';
  wait.inputMode = 'numeric';
  wait.placeholder = '예비번호';
  wait.setAttribute('aria-label', `${app.univ} 예비번호`);
  wait.value = saved.waitNo || base.waitNo || '';
  wait.hidden = !/충원|예비/.test(now);
  sel.onchange = () => { wait.hidden = !/충원|예비/.test(sel.value); };
  row.appendChild(wait);

  const btn = el('button', 'btn btn-primary', '저장');
  btn.type = 'button';
  btn.disabled = state.busy;
  btn.onclick = () => saveResult(app, sel.value, wait.value.trim());
  row.appendChild(btn);
  wrap.appendChild(row);
  return wrap;
}

async function saveResult(app, final, waitNo) {
  state.busy = true; render();
  try {
    if (!offline) {
      await api.call('studentResult', {
        token: state.token, id: app.id,
        final, waitNo: /충원|예비/.test(final) ? waitNo : '',
        stage1: final === '1단계 합격' ? '합격' : '',
        enrolled: final === '미등록' ? '미등록' : '',
      });
    }
    state.results.set(String(app.id), {
      final, waitNo: /충원|예비/.test(final) ? waitNo : '',
      stage1: final === '1단계 합격' ? '합격' : '', reason: '',
      enrolled: final === '미등록' ? '미등록' : '', status: 'student',
    });
    state.notice = `${shortUniv(app.univ)} 결과를 ${final || '지움'} 으로 보냈습니다.`
      + ' 선생님도 함께 봅니다.';
  } catch (err) {
    state.notice = `오류: ${err.message}`;
  } finally {
    state.busy = false; render();
  }
}

/** 접수번호 안내를 이미 한 번 냈나. 일곱 장에 같은 문장이 일곱 번 나오면 소음이다. */
let firstApplyNo = false;

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
    : (firstApplyNo ? '' : '원서를 넣고 받은 번호를 적어 두면 나중에 찾기 쉽습니다.')));
  if (!saved) firstApplyNo = true;   // 같은 안내를 카드마다 되풀이하지 않는다

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
    if (!offline) await api.call('studentDate', { token: state.token, id: app.id, kind, from: value, to: value });
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
    if (!offline) await api.call('studentApplyNo', { token: state.token, id: app.id, applyNo: value });
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
