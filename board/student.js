/**
 * 학생 화면 (P5)
 * =====================================================================
 * 개인 링크로 열면 자기 지원만 보인다. 토큰이 가리키는 학번의 것만 서버가 내주고,
 * 쓰는 것도 자기 것만 된다. 다른 학생을 고르는 길은 화면에도 서버에도 없다.
 *
 * 학생이 넣는 것
 *   면접 확정일 — 대학에서 배정을 받는 사람이 학생이다. 모집요강은 기간만 주는
 *                경우가 41%라, 확정일은 통보받은 학생이 넣는 게 가장 정확하다.
 *   접수번호
 *   메모 — 선생님이 「학생도 보게」로 적어 둔 것과 한 줄에 섞여 보인다.
 *          자기가 적은 것만 지울 수 있다.
 * 넣으면 곧바로 확정되지 않고 **확인 대기**로 들어간다. 담임이 눌러야 확정된다.
 * 잘못 적은 날짜로 겹침 판정이 틀어지면 안 되기 때문이다.
 *
 * 보이지 않는 것 — 다른 학생, 교사 비공개 메모, 발표 전 결과.
 */
import * as api from './api.js';
import {
  link as makeLink, indexIpgyeol, indexMojip, indexCollege, indexSchedule,
  summarize, catOf, examDate, examKindFits, paperDates, splitDepts, referenceLine, resolveUniv,
  fillTrend, outsideLimit,
} from './match.js';
import { josa, rate1, isoDay, minReqShort, methodLine, interviewShare, methodHasInterview } from './text.js';

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
  seen: '',              // 배치를 마지막으로 본 시각 — 덮어쓰기 막이. CONTRACT §2.4
  dates: new Map(),      // `${id}|${kind}` → { from, to, status }
  fields: new Map(),     // `${id}|${field}` → { value, status }. 생년월일은 id 가 빈 문자열
  notes: [],
  aliases: new Map(),   // `${univ}|${dept}` → { toUniv, toDept } — 선생님이 이어 준 학과
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
  // 원서를 낸 뒤에 채워지는 칸. 생년월일은 학생당 하나라 id 가 비어 있다.
  state.fields = new Map((data.fields || []).map((r) => [
    `${String(r.id || '')}|${String(r.field)}`,
    { value: String(r.value || ''), status: String(r.status || 'confirmed') },
  ]));
  state.results = new Map((data.results || []).map((r) => [String(r.id), {
    stage1: String(r.stage1 || ''), final: String(r.final || ''),
    reason: String(r.reason || ''), waitNo: String(r.waitNo || ''),
    enrolled: String(r.enrolled || ''), status: String(r.status || 'confirmed'),
  }]));
  state.placement = new Map((data.state || []).map((r) => [String(r.id), {
    slot: r.slot || 'pool',
    rank: r.rank === '' || r.rank == null ? null : Number(r.rank),
  }]));
  // 배치를 마지막으로 본 시각. 순위를 바꿀 때 되돌려 보내 한 발 늦은 화면이
  // 담임의 변경을 덮어쓰지 못하게 한다. CONTRACT §2.4
  state.seen = (data.state || []).reduce((hi, r) => (String(r.at || '') > hi ? String(r.at) : hi), '');
  // 옛 배포의 서버가 시트의 Date 칸을 UTC 로 적어 보낼 수 있다 — 받는 쪽에서도 씻는다
  state.dates = new Map((data.dates || []).map((r) => [`${r.id}|${r.kind}`, {
    from: isoDay(r.from), to: isoDay(r.to || r.from), status: r.status || 'pending',
  }]));
  summaryCache.clear();
  state.aliases = new Map((data.aliases || []).map((r) => [
    `${r.univ}|${r.dept}`,
    { toUniv: String(r.toUniv || ''), toDept: String(r.toDept || ''), note: String(r.note || '') },
  ]));
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
  /*
   * 전형일정표도 받는다. 예전에는 안 받아서, 선생님 화면은 「면접 11/21~11/23」을
   * 아는데 학생 화면은 같은 지원에 「아직 날짜가 없습니다」라고 말했다.
   * 같은 지원이 두 화면에서 다른 말을 하면 안 된다.
   */
  const [ipgyeol, mojip, college, sched] = await Promise.all([
    grab('data/ipgyeol.json', indexIpgyeol),
    grab('data/mojip2027.json', indexMojip),
    grab('../College/data/departments.json', indexCollege),
    grab('data/schedule2027.json', indexSchedule),
  ]);
  state.src = { ipgyeol, mojip, college, sched, related: new Map() };
  summaryCache.clear();
  render();
}

/**
 * 선생님 화면과 **같은** 요약을 본다. 같은 지원이 두 화면에서 다르게 보이면 안 된다.
 *
 * 별칭도 여기서 탄다 — 선생님이 점검에서 이어 준 학과다. 예전에는 학생 화면이
 * 별칭을 아예 못 받아서, 같은 지원이 선생님 화면에는 작년 참고선이 붙는데
 * 학생 화면에는 「자료 없음」이었다. 규칙은 store.link 와 같다:
 * 하나로 이었으면 그 이름으로 바꿔 찾고, 여럿이면 이름을 안 바꾸고 참고선만 긋는다.
 */
const summaryCache = new Map();

function summaryOf(app) {
  if (!state.src) return null;
  if (summaryCache.has(app.id)) return summaryCache.get(app.id);
  const alias = state.aliases.get(`${app.univ}|${app.dept}`);
  const to = splitDepts(alias && alias.toDept) || [];
  const one = to.length === 1 ? to[0] : (to.length ? null : (alias && alias.toDept) || '');
  const target = alias && (alias.toUniv || one)
    ? { ...app, univ: alias.toUniv || app.univ, dept: one || app.dept }
    : app;
  const l = makeLink(target, state.src);
  if (alias) l.alias = alias;
  if (to.length > 1 && state.src.ipgyeol) {
    const univ = resolveUniv(alias.toUniv || app.univ, state.src.ipgyeol.index);
    const line = univ ? referenceLine(univ, to, state.src.ipgyeol, catOf(app.typeCat)) : null;
    if (line) {
      l.before = { type: '손으로 이음', parts: to, line, byHand: true };
      /*
       * `confidence` 도 같이 바꿔야 한다. summarize 는 'none' 이면 before 를
       * 버리므로(자료 없음 갈래), 여기서 안 바꾸면 참고선을 그려 놓고도 학생
       * 카드에는 영영 안 나온다 — store.link 와 글자까지 같은 규칙이다.
       */
      l.confidence = 'loose';
      l.why = `선생님이 이어 둔 학과 ${to.length}곳의 선을 참고로 봅니다`
        + ` — ${to.slice(0, 3).join(' · ')}${to.length > 3 ? ' 외' : ''}`;
    }
  }
  const out = summarize(l, app);
  summaryCache.set(app.id, out);
  return out;
}

/**
 * 이 지원의 일정. **선생님 화면(store.dateOf)과 같은 차례**여야 한다 —
 * 내가 넣은 값 → 즐겨찾기 확정일 → 전형일정표(이름까지 맞을 때만) → 즐겨찾기 기간.
 */
function dateOf(app, kind) {
  const mine = state.dates.get(`${app.id}|${kind}`);
  if (mine && mine.from) {
    return { from: mine.from, to: mine.to || mine.from, fixed: true, status: mine.status };
  }
  const d = (app.dates && app.dates[kind]) || null;
  if (d && d.fixed) return { ...d, status: 'source' };
  if (state.src && state.src.sched && examKindFits(app, kind)) {
    const found = examDate(app, state.src.sched);
    // 전형 이름을 못 맞춘 값(loose)은 이 지원의 날짜가 아니다 — 상세에서 참고로만
    if (found && !found.loose) {
      return { from: found.from, to: found.to, fixed: found.fixed, status: 'sched' };
    }
  }
  return d ? { ...d, status: 'source' } : null;
}

/* ── 그리기 ───────────────────────────────────────────────────── */

/**
 * 이 지원의 면접 일정을 **다룰 때인가** — 순위(1~6칸)에 넣었거나 6회 밖
 * (전문대·특수대·과기원 — 순위 없이 지원 상태)일 때만이다. 후보 카드에까지
 * 빈 「면접일 적기」가 서면 아직 넣지도 않은 원서의 면접 날짜를 고민하게 된다.
 * 이미 사람이 잡은 날짜는 어디서든 보인다 — 값은 버리지 않는다.
 */
function schedTarget(app) {
  const slot = (state.placement.get(String(app.id)) || {}).slot;
  // 6회 밖(전문대·과기원)은 「지원」(tray)으로 올린 것이 순위에 해당한다
  if (outsideLimit(app)) return slot === 'tray';
  return slot === 'rank';
}

/* 접힘의 자리표 — 카드 id + 접힌 글줄의 첫 낱말. 값이 저장돼 글줄 뒤가 바뀌어도
   첫 낱말(면접일·접수번호·결과·메모…)은 그대로라 다시 찾을 수 있다. */
function foldKeyOf(d) {
  const sum = d.querySelector('summary');
  const card = d.closest('[data-id]');
  return `${card ? card.dataset.id : 'top'}|${(sum ? sum.textContent : '').split(' ')[0]}`;
}

function render() {
  const main = $('#me');
  /*
   * **학생이 펴 둔 접힘은 다시 그려도 펴 둔다.** 저장이 실패하거나(빈 날짜로
   * 저장을 눌렀거나 통신이 끊겼거나) 다른 카드의 저장이 화면을 다시 그릴 때,
   * 적던 줄이 눈앞에서 닫히면 학생은 어디에 적고 있었는지 잃는다.
   */
  const openFolds = new Set([...main.querySelectorAll('details[open]')].map(foldKeyOf));
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
  main.appendChild(announcePanel());

  const ranked = state.apps
    .filter((a) => (state.placement.get(String(a.id)) || {}).slot === 'rank'
      && !outsideLimit(a))
    .sort((a, b) => state.placement.get(String(a.id)).rank - state.placement.get(String(b.id)).rank);
  const rest = state.apps.filter((a) => !ranked.includes(a));

  /*
   * **빈 칸 여섯이 먼저 보인다.**
   *
   * 수시는 여섯 장이다. 그 사실이 화면 맨 위에 그대로 있어야, 학생이 「나는 지금
   * 몇 칸을 채웠나」를 세지 않고 본다. 아래 카드마다 순위를 고르면 이 칸이 찬다.
   */
  main.appendChild(slotGrid(ranked,
    state.apps.filter((a) => outsideLimit(a)
      && (state.placement.get(String(a.id)) || {}).slot === 'tray')));

  /*
   * 위의 격자와 **제목이 겹치면 안 된다.** 둘 다 「지원 6칸」이면 같은 것이 두 번
   * 나온 줄로 읽는다. 위는 자리표, 여기는 그 자리에 든 지원의 속내다.
   */
  main.appendChild(group('순위를 정한 지원', ranked, `${ranked.length}곳`,
    ranked.length ? '' : '아직 순위가 없습니다. 아래 지원에서 순위를 골라 보세요.'));

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
    if (rest.some((a) => a.univType === '전문대')) main.appendChild(jcNotice());
  }

  main.appendChild(upcoming());
  main.appendChild(clashPanel());
  main.appendChild(birthPanel());

  if (openFolds.size) {
    for (const d of main.querySelectorAll('details')) {
      if (openFolds.has(foldKeyOf(d))) d.open = true;
    }
  }
}

/**
 * 전문대 수시의 규칙 — **4년제와 다른 것만** 적는다.
 * =====================================================================
 * 전문대 지원이 있는 학생에게만 나온다. 원서접수 기간은 전 대학 공통이고
 * (한국전문대학교육협의회), 등록 규칙은 몰랐다가는 정시를 통째로 잃는 자리라
 * 화면에 박아 둔다. V9.7 상담카드(운정고 이재규 외)에서 배워 온 안내다.
 * 마감 시각·조기 마감·대학 안 복수지원은 대학마다 달라 요강 확인으로 돌린다.
 */
function jcNotice() {
  const box = el('section', 'panel');
  box.appendChild(el('h2', '', '전문대 수시는 규칙이 다릅니다'));
  const ul = el('ul', 'memo-list');
  const li = (strong, rest) => {
    const item = document.createElement('li');
    const p = el('p', 'memo-text');
    p.appendChild(el('b', '', strong));
    p.appendChild(document.createTextNode(' ' + rest));
    item.appendChild(p);
    ul.appendChild(item);
  };
  li('지원 횟수 제한이 없습니다.', '4년제 수시 6회와 별개로 셉니다. 순위 6칸에는 안 들어가고, 원서를 낸 것은 6칸 아래 「전문대 지원」 줄에 붙습니다.');
  li('원서접수는 전 대학이 같은 기간입니다.', '1차 2026. 9. 7 ~ 9. 30 · 2차 11. 11 ~ 11. 25. 발표일은 대학마다 다릅니다. 마감 시각과 조기 마감은 요강에서 확인하세요.');
  li('등록은 반드시 한 곳만.', '1차에 붙어도 등록하지 않으면 2차에 지원할 수 있지만, 수시에 붙어 등록하면 정시·추가모집에 지원할 수 없습니다.');
  li('같은 대학 안 복수지원은 대학마다 다릅니다.', '허용 여부와 횟수를 모집요강에서 확인하세요.');
  box.appendChild(ul);
  box.appendChild(el('p', 'hint', '출처: 한국전문대학교육협의회 공통 일정. 최종 확정 내용은 각 대학 모집요강이 기준입니다.'));
  return box;
}

/**
 * 생년월일 — **학생 한 명에 하나**라 지원마다 묻지 않는다.
 *
 * 합격 조회에 쓴다. 대학 홈페이지가 수험번호와 생년월일을 함께 묻는 일이 흔해서,
 * 12월에 담임이 대신 확인해 줄 때 없으면 학생에게 전화를 걸어야 한다.
 *
 * 원서를 낸 뒤에만 묻는다 — 지원 하나라도 접수번호가 적혔을 때. 9월에는 안 나온다.
 * 이미 적었으면 접힌 채로 둔다. 자주 고칠 값이 아니다.
 */
function birthPanel() {
  const wrap = el('div');
  if (!state.apps.some((a) => afterApply(a))) return wrap;

  const saved = state.fields.get('|생년월일');
  const box = el('section', 'panel');
  const fold = document.createElement('details');
  fold.open = !saved;
  const sum = document.createElement('summary');
  sum.textContent = saved
    ? `생년월일 ${saved.value}${saved.status === 'student' ? ' — 확인 대기' : ''}`
    : '생년월일 적기';
  fold.appendChild(sum);

  const field = el('div', 'field');
  field.appendChild(el('p', 'hint',
    '합격 조회에 씁니다. 대학 홈페이지가 수험번호와 함께 묻는 일이 많습니다.'
    + ' 한 번만 적으면 됩니다.'));
  const row = el('div', 'field-in');
  const input = document.createElement('input');
  input.type = 'date';
  input.setAttribute('aria-label', '생년월일');
  input.value = saved ? saved.value : '';
  input.disabled = state.busy;
  row.appendChild(input);
  const btn = el('button', 'btn', '저장');
  btn.type = 'button';
  btn.disabled = state.busy;
  btn.onclick = () => saveField({ id: '' }, '생년월일', input.value);
  row.appendChild(btn);
  field.appendChild(row);
  fold.appendChild(field);
  box.appendChild(fold);
  wrap.appendChild(box);
  return wrap;
}

/** 오늘. 시험에서 흔들리지 않게 한곳에서 만든다. */
// UTC 로 자르면 자정~아침 9시에 어제 날짜가 나온다. +9시간이 KST 다.
const todayISO = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * 이레 안에 닥친 것만. 없으면 아무것도 그리지 않는다.
 *
 * 지원철에는 이 줄이 안 나온다. 11월이 되면 저절로 나타난다.
 */
/**
 * **발표일이 지났는데 결과가 비어 있는 지원** — 맨 위에서 적으라고 말한다.
 *
 * 결과는 학생이 적는다(집 원칙). 그런데 발표일을 아는 것은 도구다 —
 * 전형일정표와 즐겨찾기가 1단계·최종 발표일을 준다. 발표가 나왔을 시간인데
 * 결과 칸이 비어 있으면, 학생이 잊은 것이지 안 나온 것이 아니다.
 * 12월에는 이 줄이 리마인드가 되고, 발표 전에는 아예 안 그려진다.
 *
 * 1단계는 단계별전형에만 묻는다 — 일괄전형은 1단계 발표가 없다.
 */
function announcePanel() {
  const wrap = el('div');
  const today = todayISO();
  const paperOf = (app) => (state.src && state.src.sched ? paperDates(app, state.src.sched) : null);
  const resOf = (app) => {
    const saved = state.results.get(String(app.id)) || {};
    const src = app.result || {};
    return { stage1: saved.stage1 || src.stage1 || '', final: saved.final || src.final || '' };
  };
  const asDate = (x) => (x && x.from ? { from: x.from, to: x.to || x.from } : null);

  const list = [];
  for (const app of state.apps) {
    const r = resOf(app);
    if (r.final) continue;                      // 최종까지 적었으면 볼 것 없다
    const paper = paperOf(app);
    const fin = dateOf(app, '최종발표') || asDate(paper && paper.final);
    const st1 = dateOf(app, '1단계발표') || asDate(paper && paper.stage1);
    if (fin && fin.to <= today) {
      list.push({ app, kind: '최종 발표', d: fin });
    } else if (st1 && st1.to <= today && !r.stage1) {
      const s = summaryOf(app);
      if (s && s.stages > 1) list.push({ app, kind: '1단계 발표', d: st1 });
    }
  }
  if (!list.length) return wrap;
  list.sort((a, b) => (a.d.to < b.d.to ? -1 : 1));

  const box = el('section', 'panel announce');
  box.appendChild(el('h2', '', '결과를 적어 주세요'));
  box.appendChild(el('p', 'section-label',
    '발표일이 지났습니다. 확인한 결과를 카드의 「결과」 칸에 적어 주세요 — 선생님도 함께 봅니다.'));
  const stack = el('div', 'stack');
  for (const x of list) {
    const row = el('div', 'row');
    const txt = el('div', 'txt');
    txt.appendChild(el('div', 'univ', `${shortUniv(x.app.univ)} ${tidy(x.app.dept)}`));
    txt.appendChild(el('div', 'dept', `${x.kind} ${label(x.d.to)}`));
    row.appendChild(txt);
    const go = el('button', 'btn', '적으러 가기');
    go.type = 'button';
    go.onclick = () => {
      const card = document.querySelector(`.mycard[data-id="${x.app.id}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // 결과가 접혀 있다 — 적으러 왔으니 펴 준다
        const fold = [...card.querySelectorAll('details.fold-row')]
          .find((f) => f.querySelector('summary').textContent.startsWith('결과'));
        if (fold) fold.open = true;
        const sel = card.querySelector('.fold-row .res-in select');
        if (sel) sel.focus({ preventScroll: true });
      }
    };
    row.appendChild(go);
    stack.appendChild(row);
  }
  box.appendChild(stack);
  wrap.appendChild(box);
  return wrap;
}

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
      // 일정표에서 온 「예정」은 순위에 넣은 지원만 — 후보의 예정일로 재촉하지 않는다
      if (d && d.to >= today && (d.status !== 'sched' || schedTarget(app))) list.push({ app, kind, d });
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
      // 일정표에서 온 날짜(sched)와 확인 대기(pending)로는 「겹침」을 확정하지 않는다
      const settled = (e) => e.status === 'confirmed' || e.status === 'source';
      hits.push({ a, b, sure: a.fixed && b.fixed && a.from === b.from && settled(a) && settled(b) });
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

const RANKS = [1, 2, 3, 4, 5, 6];

/**
 * **여섯 칸 — 비어 있어도 그린다.**
 *
 * 교사 보드와 같은 모양이다. 다만 학생 화면은 좁으니 대학 이름과 학과만 둔다.
 * 숫자는 아래 카드에 있고, 여기는 「어디를 몇 순위로 넣었나」만 말한다.
 */
function slotGrid(ranked, tray = []) {
  const at = (r) => ranked.find((a) => (state.placement.get(String(a.id)) || {}).rank === r);
  const wrap = el('section', 'panel');
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '지원 6칸'));
  head.appendChild(el('span', 'count num',
    `${ranked.length}/6${tray.length ? ` · 전문대 ${tray.length}` : ''}`));
  wrap.appendChild(head);
  const grid = el('div', ranked.length ? 'slots mine' : 'slots mine thin');
  for (const r of RANKS) {
    const app = at(r);
    const box = el('div', app ? 'slot-card' : 'slot-card empty');
    box.appendChild(el('div', 'rank', `${r}순위`));
    if (app) {
      box.appendChild(el('div', 'univ', tidy(shortUniv(app.univ))));
      box.appendChild(el('div', 'dept', tidy(app.dept)));
      /*
       * **훑는 눈에 숫자 한 줄과 꼬리표를 준다** — 교사 6칸과 같은 뜻이다.
       * 여섯 칸을 나란히 보며 「어디가 빠듯한가」를 견주는 자리라, 컷·내 환산과
       * 최저·단계·면접일이 칸 안에 있어야 한다. 자세한 것은 아래 카드가 맡는다.
       */
      const s = summaryOf(app);
      const mine = app.myScore || {};
      const fig = el('div', 'slot-fig');
      const put = (k, v) => {
        if (v == null) return;
        fig.appendChild(el('span', 'k', k));
        fig.appendChild(el('b', 'num', String(v)));
      };
      put('70%컷', s && s.cut != null ? g2(s.cut) : null);
      put('내', mine.grade != null ? g2(mine.grade) : null);
      if (fig.children.length) box.appendChild(fig);

      const pills = el('div', 'pills mini');
      const pin = (text, kind, title) => {
        const p = el('span', `pill${kind ? ' ' + kind : ''}`, text);
        if (title) p.title = title;
        pills.appendChild(p);
      };
      const minTxt = app.minReqText || (s && s.mojip && s.mojip.minReq) || '';
      if (minTxt || app.minReq === true) {
        const short = minReqShort(minTxt);
        pin(short ? `최저 ${short}` : '최저 있음', 'mark', minTxt);
      }
      const share = s ? interviewShare(s.mojip) : null;
      if (s && s.stages > 1) pin(share != null ? `${s.stages}단계 면접${share}%` : `${s.stages}단계`);
      else if (share != null) pin(`면접 ${share}%`);
      const iv = dateOf(app, '면접');
      if (iv) {
        pin(`면접 ${label(iv.from)}`,
          iv.status === 'confirmed' || iv.status === 'source' ? 'mark' : 'wait');
      }
      if (pills.children.length) box.appendChild(pills);
      dragify(box, app);
    } else {
      box.appendChild(el('div', 'dept', '비어 있음'));
    }
    dropify(box, (dragged) => (app && dragged.id === app.id ? null : `rank:${r}`));
    grid.appendChild(box);
  }
  wrap.appendChild(grid);

  /*
   * **지원한 전문대는 6칸 아래 붙는다** — 교사 보드와 같은 자리다. 6회 밖이라
   * 순위는 없지만 「원서를 냈다」는 사실은 6칸과 같은 무게로 보여야 한다.
   * 기본은 후보고, 선생님이 「지원」으로 올린 것만 여기 선다.
   */
  if (tray.length) {
    wrap.appendChild(el('p', 'section-label', '전문대 지원 — 6회 밖'));
    const tgrid = el('div', 'slots mine');
    for (const app of tray) {
      const box = el('div', 'slot-card');
      box.appendChild(el('div', 'rank', '전문대'));
      box.appendChild(el('div', 'univ', tidy(shortUniv(app.univ))));
      box.appendChild(el('div', 'dept', tidy(app.dept)));
      const iv = dateOf(app, '면접');
      if (iv) {
        const pills = el('div', 'pills mini');
        pills.appendChild(el('span', 'pill mark', `면접 ${label(iv.from)}`));
        box.appendChild(pills);
      }
      tgrid.appendChild(box);
    }
    wrap.appendChild(tgrid);
  }
  return wrap;
}

/**
 * **순위 고르개 — 학생이 직접 바꾼다.**
 * =====================================================================
 * 어디를 몇 순위로 넣을지는 원래 학생이 정하는 것이다. 여태 상담 때 담임만
 * 바꿀 수 있었는데, 집에서 밤에 마음이 바뀌는 쪽은 학생이다.
 *
 * 차 있는 순위를 고르면 **거기 있던 것과 자리를 맞바꾼다.** 무엇이 밀려났는지
 * 고르개에 미리 적어 둔다 — 「2순위 ⇄ 국어국문학과」. 조용히 사라지면 안 된다.
 *
 * 맞바꾸기는 서버가 잠금 안에서 한 번에 한다(`studentRank`). 담임이 같은 순간
 * 같은 6칸을 만지고 있어도 두 카드가 나란히 1순위가 되지 않는다.
 */
function rankPicker(app) {
  const wrap = el('div', 'field rank-pick');
  const id = `r-${app.id}`;
  const lab = el('label', '', '순위');
  lab.htmlFor = id;
  wrap.appendChild(lab);

  const sel = document.createElement('select');
  sel.id = id;
  sel.disabled = state.busy;
  const now = state.placement.get(String(app.id)) || { slot: 'pool', rank: null };
  const opt = (value, text) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    sel.appendChild(o);
    return o;
  };
  opt('pool', '아직 안 정함');
  for (const r of RANKS) {
    const taken = state.apps.find((a) => a.id !== app.id
      && (state.placement.get(String(a.id)) || {}).slot === 'rank'
      && (state.placement.get(String(a.id)) || {}).rank === r);
    opt(`rank:${r}`, taken ? `${r}순위 ⇄ ${tidy(taken.dept)}` : `${r}순위`);
  }
  sel.value = now.slot === 'rank' ? `rank:${now.rank}` : 'pool';
  sel.onchange = () => { moveRank(app, sel.value); };
  wrap.appendChild(sel);
  return wrap;
}

/*
 * **끌어다 놓기 — 교사 보드와 같은 버릇.**
 *
 * 고르개는 어느 기기서나 되는 기본 길이고, 끌어다 놓기는 마우스가 있을 때 더
 * 빠른 덤이다. 카드나 찬 칸을 잡아 6칸 위에 놓으면 그 순위로 가고, 차 있으면
 * 맞바꾼다. 목록 위에 놓으면 순위에서 내려온다. 휴대폰은 끌기가 브라우저마다
 * 들쭉날쭉해서(안드로이드 크롬은 아예 안 된다) 고르개가 늘 남아 있어야 한다.
 */
function dragify(node, app) {
  if (outsideLimit(app)) return;
  node.draggable = true;
  node.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(app.id));
    e.dataTransfer.effectAllowed = 'move';
    node.classList.add('dragging');
  });
  node.addEventListener('dragend', () => node.classList.remove('dragging'));
}

function dropify(node, where) {
  node.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    node.classList.add('over');
  });
  node.addEventListener('dragleave', () => node.classList.remove('over'));
  node.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    node.classList.remove('over');
    const app = state.apps.find((a) => String(a.id) === e.dataTransfer.getData('text/plain'));
    if (!app) return;
    if (outsideLimit(app)) return;
    const value = where(app);
    if (value) moveRank(app, value);
  });
}

async function moveRank(app, value) {
  if (state.busy) return;
  const [slot, rankText] = String(value).split(':');
  const rank = rankText ? Number(rankText) : null;
  const was = state.placement.get(String(app.id)) || { slot: 'pool', rank: null };
  const taken = slot === 'rank'
    ? state.apps.find((a) => a.id !== app.id
      && (state.placement.get(String(a.id)) || {}).slot === 'rank'
      && (state.placement.get(String(a.id)) || {}).rank === rank)
    : null;

  // 화면부터 옮긴다. 실패하면 되돌린다.
  const before = new Map(state.placement);
  state.placement.set(String(app.id), { slot, rank: slot === 'rank' ? rank : null });
  if (taken) {
    state.placement.set(String(taken.id), was.slot === 'rank'
      ? { slot: 'rank', rank: was.rank }
      : { slot: 'pool', rank: null });
  }
  state.busy = true;
  state.notice = '';
  if (taken) {
    const name = tidy(taken.dept);
    state.notice = was.slot === 'rank'
      ? `${name}${josa(taken.dept, '과', '와')} ${was.rank}순위를 맞바꿨습니다.`
      : `${name}${josa(taken.dept, '은', '는')} 순위에서 내렸습니다.`;
  }
  render();

  if (offline) { state.busy = false; render(); return; }
  try {
    const res = await api.call('studentRank', {
      token: state.token, id: app.id, slot,
      rank: slot === 'rank' ? rank : '',
      seen: state.seen || '',
    });
    if (res && res.at) state.seen = String(res.at);
    state.notice = state.notice || '순위를 바꿨습니다.';
  } catch (err) {
    state.placement = before;
    /*
     * **여기서 `state.error` 를 건드리면 안 된다.** 그 값은 화면을 통째로
     * 지우고 오류 한 줄만 남기는 자리다(자료를 못 받았을 때). 순위 하나를
     * 못 바꾼 것 때문에 학생이 제 지원 목록을 잃으면 안 된다.
     *
     * 「그 사이에 바뀌었다」면 **다시 불러온다.** 새로고침을 시키면 학생은
     * 자기가 무엇을 놓쳤는지 모른 채 같은 것을 다시 누른다.
     */
    if (err.stale) {
      state.notice = '선생님이 방금 순위를 바꾸셨습니다. 새로 불러왔습니다 — 다시 골라 주세요.';
      try {
        apply(await api.call('student', { token: state.token }, { timeout: 45000 }));
      } catch (e2) { state.notice = `다시 불러오지 못했습니다 — ${e2.message}`; }
    } else {
      state.notice = `순위를 바꾸지 못했습니다 — ${err.message}`;
    }
  }
  state.busy = false;
  render();
}

function group(title, apps, count, help) {
  const box = el('section', 'panel');
  // 찬 칸을 여기로 끌어다 놓으면 순위에서 내려온다 — 6칸에서 빼는 길도 있어야 한다
  dropify(box, (dragged) => ((state.placement.get(String(dragged.id)) || {}).slot === 'rank' ? 'pool' : null));
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', title));
  head.appendChild(el('span', 'count num', count));
  box.appendChild(head);
  if (help) box.appendChild(el('p', 'section-label', help));
  // 좁은 화면에서는 한 줄기 목록, 넓은 화면에서는 두 단 격자 — CSS 가 가른다
  const list = el('div', 'cards');
  for (const app of apps) list.appendChild(card(app));
  box.appendChild(list);
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
      ? ['실질', `${rate1(s.real.value)}:1`]
      : (s.rate != null ? ['경쟁률', `${rate1(s.rate)}:1`] : null);
    left = group(s.year ? `작년 ${String(s.year).slice(2)}입결` : '작년', [
      ['70%컷', g2(s.cut)], comp,
    ]);
    // 어느 전형의 컷인지. 이 학과 입결에 전형이 여럿인 경우가 훨씬 흔하다.
    if (left && s.alias && (s.alias.toUniv || s.alias.toDept)) {
      // 다른 학과의 숫자다. 안 적으면 내 학과의 작년 값으로 읽는다.
      const to = [s.alias.toUniv || '', s.alias.toDept || ''].filter(Boolean).join(' ');
      left.appendChild(el('div', 'fig-note', `${to} 자료`));
    } else if (left && s.type) {
      const guessed = s.typeFit === 'cat' || s.typeFit === 'only' || s.typeFit === 'alive';
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
  const add = (text, kind) => {
    const p = el('span', `pill${kind ? ' ' + kind : ''}`, text);
    wrap.appendChild(p);
    return p;
  };

  const now = s ? s.quotaNow : app.quota;
  const prev = s ? s.quotaPrev : null;
  if (now != null) {
    const d = prev != null ? now - prev : null;
    const heavy = d < 0 && Math.abs(d) >= 3 && Math.abs(d) / prev >= 0.2;
    if (d) add(`${now}명 뽑음 (작년 ${prev})`, heavy ? 'warn' : '');
    else add(`${now}명 뽑음`);
  }
  if (outsideLimit(app) && app.univType !== '전문대' && app.univType !== '특수대') {
    add('수시 6회에 안 셈');
  }
  // 단계 꼬리표에 면접 비중을 같이 적는다 — 교사 보드와 같은 규칙.
  // 일괄인데 면접이 든 전형(학생부60+면접40 꼴)도 여기서 처음 면접이 보인다.
  {
    const share = s ? interviewShare(s.mojip) : null;
    if (s && s.stages > 1) {
      const p = add(share != null ? `${s.stages}단계 면접${share}%` : `${s.stages}단계`);
      const line = methodLine(s.mojip);
      if (line) p.title = line;
    } else if (share != null) {
      const p = add(`면접 ${share}%`);
      const line = methodLine(s.mojip);
      if (line) p.title = line;
    }
  }
  /*
   * **가야 하는 날은 꼬리표로 단다.** 날짜를 넣고도 카드를 펼쳐야 보이면
   * 여섯 장을 훑을 때 어느 면접이 잡혔는지 안 보인다. 선생님 보드의 노란
   * 꼬리표와 같은 자리 — 놓치면 지원이 통째로 헛일이 되는 것들이다.
   * 확인 대기는 점선(wait)으로 가른다. 아직 확정이 아니라는 뜻 그대로다.
   */
  for (const kind of ATTEND) {
    const d = dateOf(app, kind);
    if (!d) continue;
    if (d.status === 'sched' && !schedTarget(app)) continue;   // 예정은 순위만
    const day = d.fixed ? label(d.from) : `${label(d.from)}~${label(d.to)}`;
    // 내가 잡은 날(확정·즐겨찾기)만 꽉 채운 칠. 일정표에서 온 것과 확인 대기는 점선.
    const settled = d.status === 'confirmed' || d.status === 'source';
    const p = add(`${kind} ${day}`, settled ? 'mark' : 'wait');
    if (d.status === 'sched') p.title = '전형일정표의 날짜입니다. 배정받은 날이 다르면 카드에서 고쳐 주세요.';
    if (d.status === 'pending') p.title = '선생님 확인을 기다리는 중입니다.';
  }
  // 관심대학 리스트는 기준 글 없이 Y/N 만 준다 — 그때도 표시가 나와야 한다.
  // 기준을 줄일 수 있으면 숫자로 말한다(「최저 3합 12」). 못 줄이면 예전 그대로.
  if (app.minReqText || app.minReq === true) {
    const txt = app.minReqText || (s && s.mojip && s.mojip.minReq) || '';
    const short = minReqShort(txt);
    const pill = add(short ? `최저 ${short}` : '수능 최저 있음', 'mark');
    if (txt) pill.title = String(txt);
  }
  /*
   * 올해 처음 뽑는 전형. 학생에게는 이게 제일 헷갈리는 자리다 —
   * 숫자가 비어 있으면 「자료가 아직 안 왔나 보다」로 읽는다. 작년에 없었다고 말해 준다.
   */
  if (s && s.isNew) add('올해 새로 생긴 전형', 'mark');
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
  box.dataset.id = app.id;          // 「적으러 가기」가 이 닻으로 내려온다
  const place = state.placement.get(String(app.id)) || {};
  if (place.slot === 'rank') box.appendChild(el('div', 'rank', `${place.rank}순위`));
  /*
   * 머리에 「자세히」를 둔다. 카드 전체를 누르게 하면 안 된다 — 카드 안이
   * 온통 입력칸(순위·날짜·결과·메모)이라 누르려던 것과 열리는 것이 싸운다.
   */
  const head = el('div', 'mycard-head');
  head.appendChild(el('div', 'univ', tidy(shortUniv(app.univ))));
  const more = el('button', 'btn', '자세히');
  more.type = 'button';
  more.onclick = () => openDetail(app);
  head.appendChild(more);
  box.appendChild(head);
  box.appendChild(el('div', 'dept', `${tidy(app.dept)} · ${app.typeSub || app.typeName || ''}`));

  box.appendChild(figures(app));
  box.appendChild(marks(app));
  /*
   * **전문대·특수대에는 순위 고르개를 안 단다.** 수시 6회 제한 밖이라 교사 보드도
   * 순위를 안 매긴다(tray). 여기서 달아 주면 학생이 전문대를 1순위에 넣을 수 있고,
   * 그 칸은 교사 보드의 6칸 찾기(일반대만 본다)에는 비어 보이면서 서버에는 차
   * 있어서 — 두 화면이 서로 다른 6칸을 보게 된다.
   */
  const outside = outsideLimit(app);
  if (!outside) {
    box.appendChild(rankPicker(app));
    dragify(box, app);
  }

  // 모의면접은 여러 번 한다. 잡힌 것을 다 보여 준다.
  const mocks = MOCKS.map((k) => dateOf(app, k)).filter(Boolean);
  if (mocks.length) {
    box.appendChild(el('p', 'hint', mocks.length === 1
      ? `모의면접 ${label(mocks[0].from)} — 학교에서 잡아 준 날짜입니다.`
      : `모의면접 ${mocks.map((m, i) => `${i + 1}차 ${label(m.from)}`).join(' · ')}`
        + ' — 학교에서 잡아 준 날짜입니다.'));
  }
  /*
   * **면접 날짜를 적을 칸이 아예 안 나오던 것.**
   *
   * 여태 조건이 「이미 날짜가 있을 때」였다. 즐겨찾기가 면접 기간을 주거나 학생이
   * 이미 적었을 때만 줄이 섰다. 그런데 실제 관심대학 리스트에는 **일정 칸이 통째로
   * 비어 있다** — 502건 중 0건이다. 그래서 「학생이 확정일을 넣는다」고 만들어 놓고
   * 넣을 자리가 화면에 한 번도 안 나왔다. 서울시립대 종합처럼 대놓고 2단계인
   * 카드에서도 그랬다.
   *
   * 이제 **볼 근거가 있으면 빈 칸이라도 세운다.**
   *
   *   면접   모집요강이 단계별전형이라고 말하거나(전형단계 ≥ 2),
   *          전형 방법 글에 면접이 있을 때 (일괄 「학생부60+면접40」 꼴)
   *   논술   전형 유형이 논술일 때
   *   실기   전형 유형이 실기일 때
   *
   * 실제 502건으로 재 보니 모집요강이 전형단계를 아는 것이 87.6% 이고, 그중
   * 단계별은 71건이다. 일괄인데 전형 방법에 면접이 든 것이 18건 더 있다 —
   * 단계 수만 보면 이 18건은 면접 칸이 안 서던 자리다(항공서비스·간호 계열).
   * 나머지는 정말 면접이 없어서 칸도 안 선다. 근거 없이 다 세우면 면접 없는
   * 카드마다 빈 날짜 칸이 붙어 시끄러워진다.
   */
  const s = summaryOf(app);
  const cat = catOf(app.typeCat) || catOf(app.typeSub) || catOf(app.typeName);
  const expects = (kind) => {
    if (kind === '면접') return s ? (s.stages > 1 || methodHasInterview(s.mojip)) : false;
    if (kind === '논술') return cat === '논술';
    if (kind === '실기') return cat === '실기';
    return false;                       // 적성은 즐겨찾기가 줄 때만
  };
  /*
   * **접힌 입력들은 한 줄 띠(fold-strip)에 나란히 선다.** 접힘마다 제 줄을
   * 차지하면 칩 서너 개가 카드 아래를 세로로 늘인다 — 닫힌 것은 옆으로
   * 나란히, 누른 것만 제 줄로 내려와 펴진다.
   */
  const strip = el('div', 'fold-strip');
  let shown = 0;
  for (const kind of ATTEND) {
    const d = dateOf(app, kind);
    // 사람이 잡은 날짜(확정·대기·즐겨찾기)는 어느 카드에서든 보인다.
    // 빈 칸과 일정표 예정은 **순위에 넣은 지원에만** 선다 — 후보 카드에서
    // 면접 날짜를 고민하게 하지 않는다.
    const human = d && d.status !== 'sched';
    if (!human && !(schedTarget(app) && (d || expects(kind)))) continue;
    strip.appendChild(dateRow(app, kind, d));
    shown += 1;
  }
  /*
   * **근거가 없어도 길은 열어 둔다.**
   * 모집요강이 전형단계를 모르는 지원이 12% 있고, 알아도 틀릴 수 있다. 면접 통보를
   * 받았는데 적을 자리가 없으면 그 학생에게는 이 기능이 없는 것과 같다.
   * 접어 두어 평소에는 한 줄만 보인다.
   */
  if (!shown && schedTarget(app)) strip.appendChild(dateAdder(app));
  strip.appendChild(applyNoRow(app));

  /*
   * 수험번호·최종경쟁률은 **원서를 내고 나서야** 알 수 있다.
   * 학생 화면에는 단계 단추가 없으니 날짜로 저절로 갈린다 —
   * 접수번호를 이미 적었거나, 원서 마감이 지났으면 나온다.
   * 「곧 있습니다」와 같은 방식이다. 켜고 끄는 단추를 두지 않는 까닭이다.
   */
  if (afterApply(app)) {
    for (const spec of CARD_FIELDS) strip.appendChild(fieldRow(app, spec));
  }
  strip.appendChild(resultRow(app));

  /*
   * 메모는 두 얼굴 — 주고받은 목록이 있으면 제 블록으로 내용을 보이고,
   * 빈 카드에서는 「메모 적기」 칩 하나로 띠에 들어간다.
   */
  const memo = memoRow(app);
  if (memo.hasList) {
    box.appendChild(strip);
    box.appendChild(memo.node);
  } else {
    strip.appendChild(memo.node);
    box.appendChild(strip);
  }
  return box;
}

/**
 * 메모 — **학생과 담임이 같은 자리에 적는다.**
 * =====================================================================
 * 선생님 화면에는 「학생도 보게」 표시가 있었는데, 표시해도 학생 화면에 나오는
 * 곳이 없었다. 시트에는 `visible: 'Y'` 로 잘 들어가고 서버도 내려 주는데
 * 화면이 안 그렸다. 그 자리를 여기서 메운다.
 *
 * 학생이 적은 것과 선생님이 적은 것을 한 줄로 늘어놓되 **누가 적었는지 적는다.**
 * 나눠 놓으면 주고받은 이야기가 두 덩이로 갈려서 흐름이 안 읽힌다.
 *
 * 접수번호는 이 목록에서 뺀다. 저장하는 자리가 메모 탭이라 같이 섞이는데,
 * 그건 메모가 아니라 칸이고 바로 위에 제 줄이 따로 있다.
 */
const isApplyNo = (n) => String(n.text || '').startsWith('접수번호');
/** 이 메모를 학생이 적었나. 서버가 `by` 에 「3201 학생」으로 적어 둔다. */
const byMe = (n) => /학생$/.test(String(n.by || ''));

/** @return {{hasList: boolean, node: Element}} 목록이 있으면 블록 전체, 없으면 접힘 칩만 */
function memoRow(app) {
  const wrap = el('div', 'field memo');
  const id = `m-${app.id}`;

  const list = state.notes
    .filter((n) => String(n.id) === String(app.id) && !isApplyNo(n))
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));

  // 주고받은 메모가 있을 때만 「메모」 머리말과 목록이 선다. 빈 카드는
  // 접힌 「메모 적기」 한 줄만 — 안내문은 편 뒤에야 나온다.
  if (list.length) {
    const lab = el('label', '', '메모');
    lab.htmlFor = id;
    wrap.appendChild(lab);
    const ul = el('ul', 'memo-list');
    for (const n of list) ul.appendChild(memoItem(app, n));
    wrap.appendChild(ul);
  }

  /*
   * **적는 칸은 접어 둔다.** 카드 열 장마다 빈 글상자와 단추가 펼쳐져 있으면
   * 화면이 길게 늘어진다 — 적힌 메모는 위에 그대로 보이고, 적을 때만 편다.
   */
  const fold = document.createElement('details');
  fold.className = 'date-add';
  const sum = document.createElement('summary');
  sum.textContent = '메모 적기';
  fold.appendChild(sum);

  if (!list.length) {
    fold.appendChild(el('p', 'hint',
      '궁금한 것이나 기억해 둘 것을 적어 두면 선생님도 함께\u00A0봅니다.'));
  }

  const ta = document.createElement('textarea');
  ta.rows = 2;
  ta.id = id;
  ta.placeholder = '면접 준비 중 막히는 것, 물어보고 싶은 것';
  ta.disabled = state.busy;
  fold.appendChild(ta);

  const btn = el('button', 'btn', '메모 저장');
  btn.type = 'button';
  btn.disabled = state.busy;
  btn.onclick = () => saveNote(app, ta.value);
  fold.appendChild(btn);
  if (!list.length) return { hasList: false, node: fold };
  wrap.appendChild(fold);
  return { hasList: true, node: wrap };
}

function memoItem(app, n) {
  const li = document.createElement('li');
  li.appendChild(el('p', 'memo-text', n.text));

  const foot = el('p', 'memo-foot');
  const who = byMe(n) ? '내가 적음' : '선생님';
  foot.appendChild(el('span', '', [who, String(n.at || '').slice(0, 10)]
    .filter(Boolean).join(' · ')));

  // 지우는 것은 **내가 적은 것만.** 선생님이 적어 준 것은 남는다.
  if (byMe(n) && n.noteId) {
    const del = el('button', 'btn', '지우기');
    del.type = 'button';
    del.disabled = state.busy;
    del.onclick = () => removeNote(app, n.noteId);
    foot.appendChild(del);
  }
  li.appendChild(foot);
  return li;
}

/**
 * **날짜 칸이 안 선 카드에 두는 접힌 줄.**
 *
 * 모집요강이 전형단계를 모르거나(12%) 잘못 알고 있어도, 학생이 면접 통보를 받았으면
 * 적을 수 있어야 한다. 종류를 고르게 하는 까닭 — 근거가 없는 카드는 면접인지
 * 실기인지도 자료가 말해 주지 않아서다.
 */
function dateAdder(app) {
  const fold = document.createElement('details');
  fold.className = 'date-add';
  const sum = document.createElement('summary');
  sum.textContent = '면접·실기 날짜 적기';
  fold.appendChild(sum);

  const wrap = el('div', 'field');
  wrap.appendChild(el('p', 'hint',
    '대학에서 날짜를 받았는데 위에 칸이 없으면 여기에 넣어 주세요.'
    + ' 선생님이 확인하면 일정에 잡힙니다.'));

  const row = el('div', 'field-in');
  const pick = document.createElement('select');
  pick.disabled = state.busy;
  for (const kind of ATTEND) {
    const o = document.createElement('option');
    o.value = kind;
    o.textContent = kind;
    pick.appendChild(o);
  }
  row.appendChild(pick);

  const input = document.createElement('input');
  input.type = 'date';
  input.disabled = state.busy;
  row.appendChild(input);

  const btn = el('button', 'btn btn-primary', '저장');
  btn.type = 'button';
  btn.disabled = state.busy;
  btn.onclick = () => saveDate(app, pick.value, input.value);
  row.appendChild(btn);
  wrap.appendChild(row);
  fold.appendChild(wrap);
  return fold;
}

/**
 * **값이 정해진 입력은 접는다 — 지금 계절의 할 일만 편다.**
 *
 * 9월의 할 일은 순위 정하기다. 그런데 카드마다 면접일·접수번호·결과 입력이
 * 펼쳐져 있어서 정작 순위 고르개가 소음에 묻혔다. 값은 접힌 줄의 제목이
 * 그대로 보여 주고(「면접일 · 11/27(금)」), 고칠 때만 펴서 고친다.
 * 카드 꼬리표(면접 날짜)와 발표 리마인드가 「언제 펴야 하는지」를 말해 준다.
 */
function foldRow(summaryText, nodes, open) {
  const d = document.createElement('details');
  d.className = 'fold-row';
  if (open) d.open = true;
  const sum = document.createElement('summary');
  sum.textContent = summaryText;
  // 접힌 줄의 끝말이 「적기」면 아직 할 일 — 링크 모양(호박색)으로 보인다.
  if (/적기$/.test(summaryText)) sum.className = 'todo';
  d.appendChild(sum);
  for (const n of nodes) d.appendChild(n);
  return d;
}

/** 면접 확정일을 넣는 줄. 넣으면 확인 대기로 들어간다. */
function dateRow(app, kind, d) {
  const wrap = el('div', 'field');
  const id = `d-${app.id}-${kind}`;

  const hint = el('p', 'hint');
  // 빈 칸으로 서 있을 때가 이제 흔하다 — 무엇을 하라는 자리인지 말해 준다
  if (!d) {
    hint.textContent = `아직 날짜가 없습니다. 대학에서 ${kind} 날짜를 받으면 여기에 넣어 주세요.`;
  }
  else if (d.status === 'pending') hint.textContent = `${label(d.from)} — 선생님 확인을 기다리는 중입니다.`;
  else if (d.status === 'confirmed') hint.textContent = `${label(d.from)} 로 확정되었습니다.`;
  else if (d.status === 'sched') {
    hint.textContent = d.fixed
      ? `전형일정표에는 ${label(d.from)} 입니다. 받은 날짜가 다르면 고쳐서 저장해 주세요.`
      : `전형일정표에는 ${label(d.from)}~${label(d.to)} 입니다. 배정을 받으면 넣어 주세요.`;
  }
  else if (d.fixed) hint.textContent = `${label(d.from)} 로 공지되어 있습니다.`;
  else hint.textContent = `${label(d.from)}~${label(d.to)} 중 하루입니다. 배정을 받으면 아래에 넣어 주세요.`;
  wrap.appendChild(hint);

  const row = el('div', 'field-in');
  const input = document.createElement('input');
  input.type = 'date';
  input.id = id;
  // 접힘으로 바꾸며 <label> 이 빠졌다 — 읽어 주는 프로그램에는 이름이 남아야 한다
  input.setAttribute('aria-label', `${shortUniv(app.univ)} ${kind}일`);
  /*
   * **확정일이면 미리 채운다** — 어느 자료에서 왔든. 대개 그 날이 맞으니 저장
   * 한 번이면 되고, 다르면 고쳐서 저장한다(사람이 넣은 값이 파싱값을 덮는다).
   * 기간만 아는 값(fixed 아님)은 안 채운다 — 시작일을 확정일로 굳히게 된다.
   */
  input.value = d && d.fixed ? d.from : '';
  /*
   * min·max 는 **기간일 때만** 건다. 확정일 하루짜리에 걸면 min=max 가 되어
   * 다른 날을 고를 수 없다 — 「다르면 고쳐서 저장하라」고 해 놓고 달력이
   * 그 하루만 열리는 꼴이었다.
   */
  if (d && d.from !== d.to) { input.min = d.from; input.max = d.to; }
  input.disabled = state.busy;
  row.appendChild(input);

  const btn = el('button', 'btn btn-primary', '저장');
  btn.type = 'button';
  btn.disabled = state.busy;
  btn.onclick = () => saveDate(app, kind, input.value);
  row.appendChild(btn);
  wrap.appendChild(row);

  const word = !d ? ' 적기'
    : d.status === 'confirmed' ? ` · ${label(d.from)} · 확정`
      : d.status === 'pending' ? ` · ${label(d.from)} · 확인 대기`
        : d.status === 'sched' ? (d.fixed ? ` · ${label(d.from)} · 일정표` : ' · 일정표 기간 · 적기')
          : (d.fixed ? ` · ${label(d.from)}` : ' · 기간 · 적기');
  return foldRow(`${kind}일${word}`, [wrap]);
}

/* ── 결과 ───────────────────────────────────────────────────────── */

/*
 * 학생이 고르는 말 → 시트에 적히는 칸.
 * =====================================================================
 * **고르는 말을 그대로 `final` 에 넣으면 안 된다.**
 *
 * 「1단계 합격」을 final 에 넣으면 stats.js 의 `verdict()` 가 「합격」이라는 글자를 보고
 * 최종 합격으로 센다. 11월에 1단계 발표만 난 건들이 지원 결과 보고서와 진학 대장에
 * 최종 합격으로 부풀려 들어간다. 아무 데도 「틀렸다」고 안 적히는 자리다.
 *
 * 「미등록」은 반대다. final 에 넣으면 `passed=null` 이 되어 합격 통계에서 아예 빠지고,
 * 보고서에는 「알아보지 못한 표기 — 미등록」이라는 오경고까지 뜬다. 자기 화면이 준
 * 선택지인데도.
 *
 * 그래서 고르는 말마다 **어느 칸에 무엇을 넣을지**를 여기 한 곳에 적어 둔다.
 * `wait` 는 예비번호를 묻는가, `ask` 는 한 가지를 더 묻는가.
 */
const CHOICE = [
  { label: '', final: '', stage1: '', enrolled: '' },
  // 1단계는 최종이 아니다. final 은 비워 둔다 — 최종 발표가 나면 그때 다시 고른다.
  { label: '1단계 합격', final: '', stage1: '합격', enrolled: '' },
  { label: '1단계 불합격', final: '', stage1: '불합격', enrolled: '' },
  { label: '최초합격', final: '최초합격', stage1: '', enrolled: '' },
  { label: '충원합격', final: '충원합격', stage1: '', enrolled: '', wait: true },
  { label: '불합격', final: '불합격', stage1: '', enrolled: '' },
  // 붙고 나서 안 간 것이다. **합격은 합격으로 세고**, 등록 여부만 따로 적는다.
  { label: '합격했지만 등록 안 함', final: '최초합격', stage1: '', enrolled: '미등록' },
];
/**
 * 합격을 골랐을 때만 「여기로 갑니다」를 묻는다.
 *
 * **「불합격」이 「합격」을 품고 있다.** 글자로만 보면 떨어진 칸에도 등록 물음이 뜬다.
 * 아닌 것을 먼저 걸러 낸 뒤에 맞는 것을 본다 — stats.js 의 「미등록/등록」과 같은 자리다.
 */
const asksEnrolled = (label) => {
  const c = choiceOf(label);
  if (!c || !c.final || c.enrolled === '미등록') return false;
  return !/불합격|탈락|미선발/.test(c.final) && /합격/.test(c.final);
};
const FINAL = CHOICE.map((c) => c.label);
const choiceOf = (label) => CHOICE.find((c) => c.label === label) || null;

/** 시트에 적힌 것 → 학생이 고른 말. 되돌려 화면에 표시한다. */
function labelOf(r) {
  if (!r) return '';
  const final = String(r.final || '');
  const enrolled = String(r.enrolled || '');
  if (final && /합격/.test(final) && !/불합격/.test(final) && /미등록/.test(enrolled)) {
    return '합격했지만 등록 안 함';
  }
  if (final) return CHOICE.some((c) => c.final === final) ? final : final;
  const st = String(r.stage1 || '');
  if (/불합격|탈락/.test(st)) return '1단계 불합격';
  if (/합격|통과/.test(st)) return '1단계 합격';
  return '';
}

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
  // 시트에 적힌 칸들(final·stage1·enrolled)을 학생이 고른 말로 되돌린다
  const now = labelOf(state.results.has(String(app.id)) ? saved : base);

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
  const asksWait = (label) => Boolean((choiceOf(label) || {}).wait);
  wait.hidden = !asksWait(now);
  sel.onchange = () => { wait.hidden = !asksWait(sel.value); };
  row.appendChild(wait);

  const btn = el('button', 'btn btn-primary', '저장');
  btn.type = 'button';
  btn.disabled = state.busy;
  row.appendChild(btn);
  wrap.appendChild(row);

  /*
   * **등록은 합격과 다른 물음이다.**
   * 두 곳에 붙어도 가는 곳은 하나다. 12월에 담임이 여섯 칸을 보면 첫 물음이
   * 「어디로 갔나」인데, 그건 학생만 안다. 합격을 골랐을 때만 묻는다 —
   * 늘 띄우면 여섯 칸이 다 체크칸이 된다.
   */
  const go = el('label', 'go-in');
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = /^등록/.test(String(saved.enrolled || base.enrolled || ''));
  check.disabled = state.busy;
  go.appendChild(check);
  go.appendChild(el('span', '', '이 학교로 갑니다 (등록)'));
  go.hidden = !asksEnrolled(now);
  sel.addEventListener('change', () => { go.hidden = !asksEnrolled(sel.value); });
  wrap.appendChild(go);

  btn.onclick = () => saveResult(app, sel.value, wait.value.trim(),
    !go.hidden && check.checked);

  const word = now
    ? ` · ${now}${saved.waitNo || base.waitNo ? ` · 예비 ${saved.waitNo || base.waitNo}번` : ''}`
      + (saved.status === 'student' ? ' · 확인 대기' : '')
    : ' 적기';
  return foldRow(`결과${word}`, [wrap]);
}

async function saveResult(app, label, waitNo, enrolled) {
  // 고른 말을 어느 칸에 넣을지는 CHOICE 표가 정한다. 여기서 다시 짐작하지 않는다.
  const c = choiceOf(label) || { final: label, stage1: '', enrolled: '' };
  const row = {
    final: c.final, stage1: c.stage1,
    // 「합격했지만 등록 안 함」은 표가 이미 미등록이라 적어 두었다. 그건 그대로 둔다.
    enrolled: c.enrolled || (asksEnrolled(label) && enrolled ? '등록' : ''),
    reason: '',
    waitNo: c.wait ? waitNo : '',
  };
  state.busy = true; render();
  try {
    if (!offline) {
      await api.call('studentResult', { token: state.token, id: app.id, ...row });
    }
    state.results.set(String(app.id), { ...row, status: 'student' });
    state.notice = `${shortUniv(app.univ)} 결과를 ${label || '지움'} 으로 보냈습니다.`
      + ' 선생님도 함께 봅니다.';
  } catch (err) {
    state.notice = `오류: ${err.message}`;
  } finally {
    state.busy = false; render();
  }
}

/*
 * 원서를 내고 **나서야** 알게 되는 칸들.
 * =====================================================================
 * 즐겨찾기에도 모집요강에도 없다. 학생이 적고 선생님이 확인한다 —
 * 면접 날짜와 같은 흐름이다.
 *
 *   수험번호     원서를 내면 대학이 준다. 면접장에서 부르는 번호다
 *   최종경쟁률   마감 뒤 대학이 발표한다. 예비번호가 얼마나 돌지 가늠할 때 본다
 *
 * `생년월일` 은 지원마다 묻지 않는다 — 학생 한 명에 하나라 화면 맨 위에 한 번만 묻는다.
 */
const CARD_FIELDS = [
  { name: '수험번호', hint: '원서를 내면 대학이 주는 번호입니다. 면접장에서 이 번호로 부릅니다.',
    mode: 'numeric', ph: '예) 20260012' },
  { name: '최종경쟁률', hint: '마감 뒤 대학이 발표합니다. 예비번호가 얼마나 돌지 가늠할 때 봅니다.',
    mode: 'decimal', ph: '예) 12.4' },
];

/**
 * 이 지원의 원서를 이미 냈나.
 *
 * **접수번호가 적혀 있으면 낸 것이다.** 원서를 내야 받는 번호라 순서가 어긋날 수 없다.
 * 학생 화면은 전형일정표를 안 받아서 마감일로는 가릴 수 없고, 단계 단추도 없다.
 * 그래서 학생이 이미 한 일로 가른다 — 9월에는 저절로 안 보이고, 원서를 내고
 * 접수번호를 적는 순간 그 카드에만 나타난다.
 */
function afterApply(app) {
  if (CARD_FIELDS.some((f) => state.fields.has(`${app.id}|${f.name}`))) return true;
  return state.notes.some((n) => String(n.id) === String(app.id)
    && String(n.text || '').startsWith('접수번호'));
}

function fieldRow(app, spec) {
  const wrap = el('div', 'field');
  const id = `f-${app.id}-${spec.name}`;

  const saved = state.fields.get(`${app.id}|${spec.name}`);
  wrap.appendChild(el('p', 'hint', saved
    ? `${saved.value}${saved.status === 'student' ? ' — 선생님 확인을 기다리는 중입니다.' : ' 로 저장되어 있습니다.'}`
    : spec.hint));

  const row = el('div', 'field-in');
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = spec.mode;
  input.id = id;
  input.setAttribute('aria-label', `${shortUniv(app.univ)} ${spec.name}`);
  input.placeholder = spec.ph;
  input.value = saved ? saved.value : '';
  input.disabled = state.busy;
  row.appendChild(input);

  const btn = el('button', 'btn', '저장');
  btn.type = 'button';
  btn.disabled = state.busy;
  btn.onclick = () => saveField(app, spec.name, input.value);
  row.appendChild(btn);
  wrap.appendChild(row);
  return foldRow(saved
    ? `${spec.name} · ${saved.value}${saved.status === 'student' ? ' · 확인 대기' : ''}`
    : `${spec.name} 적기`, [wrap]);
}

/** 접수번호 안내를 이미 한 번 냈나. 일곱 장에 같은 문장이 일곱 번 나오면 소음이다. */
let firstApplyNo = false;

function applyNoRow(app) {
  const wrap = el('div', 'field');
  const id = `n-${app.id}`;

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
  input.setAttribute('aria-label', `${shortUniv(app.univ)} 접수번호`);
  input.value = saved ? String(saved.text).replace('접수번호', '').trim() : '';
  input.disabled = state.busy;
  row.appendChild(input);

  const btn = el('button', 'btn', '저장');
  btn.type = 'button';
  btn.disabled = state.busy;
  btn.onclick = () => saveApplyNo(app, input.value);
  row.appendChild(btn);
  wrap.appendChild(row);

  const no = saved ? String(saved.text).replace('접수번호', '').trim() : '';
  return foldRow(no ? `접수번호 · ${no}` : '접수번호 적기', [wrap]);
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

async function saveField(app, field, value) {
  state.busy = true; state.notice = ''; render();
  const key = `${field === '생년월일' ? '' : app.id}|${field}`;
  try {
    if (!offline) {
      await api.call('studentField', {
        token: state.token, id: field === '생년월일' ? '' : app.id, field, value,
      });
    }
    const text = String(value || '').trim();
    if (text) state.fields.set(key, { value: text, status: 'student' });
    else state.fields.delete(key);
    state.notice = text
      ? `${field}을(를) 보냈습니다. 선생님도 함께 봅니다.`
      : `${field}을(를) 지웠습니다.`;
  } catch (err) {
    state.notice = `오류: ${err.message}`;
  } finally {
    state.busy = false; render();
  }
}

/**
 * 메모를 보낸다.
 *
 * 서버가 준 `noteId` 를 받아 두어야 바로 지울 수 있다. 못 받으면 목록에는
 * 남되 「지우기」가 안 나온다 — 새로고침하면 서버 것으로 다시 그려진다.
 */
async function saveNote(app, value) {
  const text = String(value || '').trim();
  if (!text) { state.notice = '메모 내용을 적어 주세요.'; render(); return; }
  state.busy = true; state.notice = ''; render();
  try {
    let noteId = `tmp-${Date.now()}`;
    if (!offline) {
      const res = await api.call('studentNote', { token: state.token, id: app.id, text });
      if (res && res.noteId) noteId = String(res.noteId);
    }
    state.notes.push({
      noteId, id: app.id, hak: state.student.hak, text,
      visible: 'Y', by: `${state.student.hak} 학생`, at: new Date().toISOString(),
    });
    state.notice = '메모를 저장했습니다. 선생님도 함께 봅니다.';
  } catch (err) {
    state.notice = `오류: ${err.message}`;
  } finally {
    state.busy = false; render();
  }
}

async function removeNote(app, noteId) {
  state.busy = true; state.notice = ''; render();
  const before = state.notes;
  state.notes = state.notes.filter((n) => String(n.noteId) !== String(noteId));
  try {
    if (!offline) {
      await api.call('studentNoteRemove', { token: state.token, id: app.id, noteId });
    }
    state.notice = '메모를 지웠습니다.';
  } catch (err) {
    state.notes = before;             // 서버가 거절하면 화면도 되돌린다
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

/* ── 카드 상세 ──────────────────────────────────────────────────── */

/**
 * 카드를 누르면 뜨는 상세 — **읽는 자리다.**
 *
 * 선생님 보드의 상세(card.js)를 그대로 가져오면 결과 저장·메모 확정 같은
 * 교사 단추까지 딸려 오는데, 그 단추는 학생 링크로는 서버가 받지 않는다.
 * 눌리는데 안 되는 단추는 없느니만 못하다. 그래서 학생 상세는 **보여 주기만**
 * 한다 — 적는 것은 카드에 이미 다 있다(순위·날짜·접수번호·결과·메모).
 *
 * 담는 것: 연도별 추이 · 인원과 경쟁률 · 일정(원서 마감·발표 포함) ·
 * 수능최저 원문 · 지원 자격. 숫자는 선생님 화면과 같은 요약(summaryOf)에서 온다.
 */
function openDetail(app) {
  const host = document.getElementById('detail');
  if (!host) return;
  host.textContent = '';

  const s = summaryOf(app);
  const mo = (s && s.mojip) || null;

  const box = el('section', 'panel detail');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', `${app.univ} ${app.dept} 자세히`);
  box.tabIndex = -1;

  const closeAll = () => { host.hidden = true; host.textContent = ''; };

  const head = el('div', 'detail-head');
  const title = el('div');
  title.appendChild(el('div', 'univ', tidy(app.univ)));
  title.appendChild(el('div', 'dept',
    [tidy(app.dept), app.typeSub || app.typeName].filter(Boolean).join(' · ')));
  head.appendChild(title);
  const close = el('button', 'btn', '닫기');
  close.type = 'button';
  close.onclick = closeAll;
  head.appendChild(close);
  box.appendChild(head);

  const body = el('div', 'detail-body');
  box.appendChild(body);

  const block = (name, node) => {
    if (!node) return;
    const b = el('div', 'detail-block');
    b.appendChild(el('h3', '', name));
    b.appendChild(node);
    body.appendChild(b);
  };

  if (s && s.isNew) {
    body.appendChild(el('p', 'note',
      '올해 새로 생긴 전형이라 작년 값이 없습니다. 아래 표의 다른 전형은 참고일 뿐입니다.'));
  }

  /* 선생님 상세(card.js rows)와 같은 표 꼴 — CSS 도 그대로 탄다 */
  const factTable = (list) => {
    const have = list.filter((x) => x && x[1] != null && x[1] !== '');
    if (!have.length) return null;
    const tw = el('div', 'tw');
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    for (const [k, v] of have) {
      const tr = document.createElement('tr');
      tr.appendChild(el('th', 'rowhead', k));
      // num 은 줄바꿈을 막는다(nowrap). 「전형 방법」 같은 긴 글줄에 붙으면
      // 좁은 화면에서 잘리므로, 숫자와 단위만으로 된 짧은 값에만 붙인다.
      tr.appendChild(el('td', /^[\d.,:~\s%명개-]+$/.test(String(v)) ? 'num' : null, String(v)));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tw.appendChild(table);
    return tw;
  };

  /* 이 전형이 무엇으로 뽑는지 — 「1단계 서류100 (3배수) → 2단계 1단계70+면접30」 */
  block('전형 방법', factTable([
    ['방법', methodLine(mo)],
    ['학생부 구성', mo && mo.wSubj != null
      ? `교과 ${mo.wSubj}${mo.wAtt ? ` + 출결 ${mo.wAtt}` : ''}${mo.wVol ? ` + 봉사 ${mo.wVol}` : ''}`
      : null],
  ]));

  block('인원과 경쟁률', factTable([
    ['올해 모집', s && s.quotaNow != null ? `${s.quotaNow}명` : app.quotaText || null],
    ['작년 모집', s && s.quotaPrev != null ? `${s.quotaPrev}명` : null],
    [s && s.year ? `${s.year} 경쟁률` : '경쟁률', s && s.rate != null ? `${rate1(s.rate)}:1` : null],
    ['작년 실질 경쟁률', s && s.real && s.real.value != null ? `${rate1(s.real.value)}:1` : null],
  ]));

  /* 충원(추가합격) 3개년 — 예비번호가 어디까지 도는 전형인지. 선생님 상세와 같은 표 */
  const ft = fillTrend(mo);
  if (ft.length) {
    const tw = el('div', 'tw');
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const h of ['연도', '모집', '경쟁률', '추가 합격', '충원율', '실질']) hr.appendChild(el('th', '', h));
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const r of ft) {
      const tr = document.createElement('tr');
      tr.appendChild(el('td', 'num', r.year));
      tr.appendChild(el('td', 'num', r.quota != null ? `${Math.round(r.quota)}명` : '—'));
      tr.appendChild(el('td', 'num', r.rate != null ? `${rate1(r.rate)}:1` : '—'));
      const fc = el('td', 'num', r.filled != null ? `${r.filled}명` : '—');
      if (r.suspect) fc.title = r.real.why;
      tr.appendChild(fc);
      tr.appendChild(el('td', 'num', r.fillPct != null ? `${r.fillPct}%` : '—'));
      tr.appendChild(el('td', 'num', r.real.value != null ? `${rate1(r.real.value)}:1` : '—'));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tw.appendChild(table);
    const box = el('div');
    box.appendChild(tw);
    box.appendChild(el('p', 'hint',
      '충원율 = 추가 합격 ÷ 모집 × 100. 예비번호가 모집인원의 몇 %까지 돌았는지입니다.'));
    block('충원(추가합격) 추이', box);
  }

  /* 연도별 추이 — 이 학과의 모든 전형·모든 해 */
  if (s && s.rows && s.rows.length) {
    const byType = new Map();
    for (const r of s.rows) {
      const k = r.type || '전형 미상';
      if (!byType.has(k)) byType.set(k, []);
      byType.get(k).push(r);
    }
    const tw = el('div', 'tw');
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const h of ['연도', '모집', '경쟁률', '70%컷', '50%컷']) hr.appendChild(el('th', '', h));
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    // 내가 넣은 전형을 맨 위로
    const names = [...byType.keys()].sort((a, b) =>
      (b === (s.type || '')) - (a === (s.type || '')) || a.localeCompare(b, 'ko'));
    for (const name of names) {
      const grp = document.createElement('tr');
      grp.className = 'group';
      const th = el('th', '', name + (name === s.type ? ' — 내가 넣은 전형' : ''));
      th.colSpan = 5;
      grp.appendChild(th);
      tbody.appendChild(grp);
      for (const r of byType.get(name).slice().sort((a, b) => b.year - a.year)) {
        const tr = document.createElement('tr');
        tr.appendChild(el('td', 'num', r.year));
        tr.appendChild(el('td', 'num', r.quota != null ? Math.round(r.quota) : '—'));
        tr.appendChild(el('td', 'num', r.rate != null ? `${rate1(r.rate)}:1` : '—'));
        tr.appendChild(el('td', 'num', r.g70 != null ? g2(r.g70) : '—'));
        tr.appendChild(el('td', 'num', r.g50 != null ? g2(r.g50) : '—'));
        tbody.appendChild(tr);
      }
    }
    table.appendChild(tbody);
    tw.appendChild(table);
    block('연도별 추이', tw);
  }

  /* 일정 — 원서 마감과 발표일까지. 전형일정표가 준다. */
  {
    const list = [];
    for (const kind of ATTEND) {
      const d = dateOf(app, kind);
      if (!d) continue;
      list.push([`${kind}일`, d.fixed ? label(d.from) : `${label(d.from)}~${label(d.to)}`]);
    }
    const mocks = MOCKS.map((k) => dateOf(app, k)).filter(Boolean);
    if (mocks.length) list.push(['모의면접', mocks.map((m, i) => `${i + 1}차 ${label(m.from)}`).join(' · ')]);
    const paper = state.src && state.src.sched ? paperDates(app, state.src.sched) : null;
    if (paper) {
      const when = (x) => (x ? (x.from === x.to ? label(x.from) : `${label(x.from)}~${label(x.to)}`) : null);
      list.push(['원서 접수 마감', paper.apply ? when(paper.apply) : null]);
      list.push(['1단계 발표', when(paper.stage1)]);
      list.push(['최종 발표', when(paper.final)]);
    }
    if (mo && mo.exam) list.push(['대학별 고사', mo.exam]);
    // 전형 이름을 못 맞춰 카드 날짜로는 안 쓴 고사일 — 참고로만 (교사 상세와 같은 규칙)
    if (state.src && state.src.sched) {
      const near = examDate(app, state.src.sched);
      const already = ATTEND.some((k) => dateOf(app, k));
      if (near && near.loose && !already) {
        list.push([`(참고) ${near.kind} 고사일`,
          `${near.from === near.to ? label(near.from) : `${label(near.from)}~${label(near.to)}`}`
          + ' — 이 대학 같은 유형의 날짜라 이 전형의 날짜가 아닐 수 있습니다']);
      }
    }
    block('일정', factTable(list));
  }

  /* 수능최저 · 지원자격 — 원문 그대로. 요약하면 조건이 하나씩 빠진다. */
  const minText = app.minReqText || (mo && mo.minReq) || '';
  if (minText) block('수능 최저학력 기준', el('p', 'longtext', String(minText).replace(/^\s*\*\s*/, '')));
  else if (app.minReq === false) block('수능 최저학력 기준', el('p', 'hint', '이 전형은 수능 최저가 없습니다.'));
  if (mo && (mo.refMain || mo.refCareer)) {
    const rf = el('div');
    if (mo.refMain) rf.appendChild(el('p', 'longtext', `공통·일반선택 — ${mo.refMain}`));
    if (mo.refCareer) rf.appendChild(el('p', 'longtext', `진로선택 — ${mo.refCareer}`));
    block('반영 교과', rf);
  }
  if (mo && mo.eligibility) block('지원 자격', el('p', 'longtext', String(mo.eligibility)));

  body.appendChild(el('p', 'hint',
    '작년 자료는 참고값입니다. 최종 판단은 담임 선생님과 같이 해 주세요.'));

  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
  host.appendChild(box);
  host.hidden = false;
  box.focus();
}

function note(text, isError) {
  return el('p', `note${isError ? ' error' : ''}`, text);
}
