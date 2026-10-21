/**
 * 선생님 고침 — 카드에 뜨는 값을 손으로 고친다
 * =====================================================================
 * 카드의 값은 거의 다 남이 만든 자료에서 온다 — 즐겨찾기 · 모집요강 · 입결.
 * 셋 다 틀릴 수 있고, 특히 **수능최저는 이름을 못 맞추면 옆 전형의 글이 붙는다**
 * (아래 `minReqOf`). 틀린 것을 보고도 고칠 길이 없으면 선생님은 카드를 믿지 않게 된다.
 *
 * 그래서 카드의 항목마다 손으로 적을 자리를 둔다. 값은 시트 입력 탭에 남고
 * (`setField` — 수험번호와 같은 길), 이름 앞에 `고침:` 을 붙여 가른다.
 *
 *   전형 단위(scope 'type')   대학·세부유형·모집단위가 같은 지원 **모두에** 붙는다.
 *                             최저·컷·모집인원처럼 학생과 상관없는 사실이라 한 번
 *                             고치면 같은 전형을 쓴 학생 카드가 다 같이 바뀐다.
 *                             입력 탭에는 hak 칸에 `*`, id 칸에 전형 열쇠가 들어간다.
 *   카드 단위(scope 'app')    그 학생의 그 지원 하나 — 내 환산 등급·점수.
 *
 * **사람이 적은 값이 언제나 먼저다.** 비우고 저장하면 지워지고 자동 값으로 돌아간다.
 * 학생 링크로는 못 고친다(서버가 `고침:` 칸을 학생 경로에서 막는다).
 *
 * 화면(카드·보드·탐색·학생 화면)이 따로 고침을 읽지 않는다. 요약(summary)을 만드는
 * 자리에서 `applyFixes` 가 한 번 덮어쓰고, 모두 그 요약을 본다 — 화면마다 다른 값을
 * 말하면 안 된다.
 */

export const PREFIX = '고침:';
/** 전형 단위 고침의 학번 칸. 학번은 숫자 넷이라 겹칠 일이 없다. */
export const TYPE_HAK = '*';

/*
 * 고칠 수 있는 항목. 순서가 카드의 순서다.
 *   key    입력 탭에 `고침:${key}` 로 남는 이름 — **바꾸면 적어 둔 값이 떨어진다**
 *   kind   text 한 줄 · long 여러 줄 · num 정수 · dec 소수
 */
export const ITEMS = [
  { key: '모집시기', group: '전형', scope: 'type', kind: 'text' },
  { key: '전형유형', group: '전형', scope: 'type', kind: 'text' },
  { key: '전형이름', group: '전형', scope: 'type', kind: 'text' },
  { key: '세부유형', group: '전형', scope: 'type', kind: 'text' },
  { key: '선발방식', group: '전형', scope: 'type', kind: 'text' },
  { key: '계열', group: '전형', scope: 'type', kind: 'text' },
  { key: '지역', group: '전형', scope: 'type', kind: 'text' },
  { key: '전형방법', group: '전형', scope: 'type', kind: 'long', ph: '예) 1단계 서류100 (3배수) → 2단계 1단계70+면접30' },
  { key: '전형단계', group: '전형', scope: 'type', kind: 'num', ph: '예) 2' },
  { key: '학생부구성', group: '전형', scope: 'type', kind: 'text', ph: '예) 교과 90 + 출결 10' },
  { key: '올해모집인원', group: '인원과 경쟁률', scope: 'type', kind: 'num', ph: '예) 12' },
  { key: '작년모집인원', group: '인원과 경쟁률', scope: 'type', kind: 'num', ph: '예) 10' },
  { key: '작년경쟁률', group: '인원과 경쟁률', scope: 'type', kind: 'dec', ph: '예) 8.5' },
  { key: '작년실질경쟁률', group: '인원과 경쟁률', scope: 'type', kind: 'dec', ph: '예) 4.2' },
  { key: '충원율', group: '인원과 경쟁률', scope: 'type', kind: 'num', ph: '예) 85 (%)' },
  { key: '내환산등급', group: '성적', scope: 'app', kind: 'dec', ph: '예) 3.42' },
  { key: '내환산점수', group: '성적', scope: 'app', kind: 'dec', ph: '예) 966' },
  { key: '70컷', group: '성적', scope: 'type', kind: 'dec', ph: '예) 3.85 · 전문대는 작년 최저 등급' },
  { key: '50컷', group: '성적', scope: 'type', kind: 'dec', ph: '예) 3.40' },
  { key: '평균등급', group: '성적', scope: 'type', kind: 'dec', ph: '전문대 작년 평균 등급' },
  { key: '원서접수마감', group: '일정', scope: 'type', kind: 'text', ph: '예) 9/12(금) 18:00' },
  { key: '대학별고사', group: '일정', scope: 'type', kind: 'text', ph: '예) 면접 · 11/22(토)' },
  { key: '등록마감', group: '일정', scope: 'type', kind: 'text', ph: '예) 12/17(수)' },
  { key: '미등록충원발표', group: '일정', scope: 'type', kind: 'text', ph: '예) 12/18(목)~12/24(수)' },
  { key: '수능최저', group: '수능 최저', scope: 'type', kind: 'long', ph: '예) 국어·수학·영어·탐구(1) 중 2개 영역 등급 합 6 이내 — 최저가 없으면 「없음」' },
  { key: '반영교과', group: '반영 교과', scope: 'type', kind: 'long', ph: '공통·일반선택 반영 교과' },
  { key: '진로선택', group: '반영 교과', scope: 'type', kind: 'long', ph: '진로선택 반영 방법' },
  { key: '지원자격', group: '지원 자격', scope: 'type', kind: 'long' },
];

export const ITEM = Object.fromEntries(ITEMS.map((x) => [x.key, x]));

/** 「없음」이라 적으면 그 항목이 없다는 뜻이다 — 최저가 없는 전형. */
export const NONE = '없음';

const squash = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/**
 * 전형 열쇠 — 대학 · 세부유형 · 모집단위. **원문 그대로**(정규화하지 않는다).
 * 카드 id(`CONTRACT.md` §3)와 같은 조각에서 학번만 뺀 것이라, 같은 원본에서 온
 * 같은 전형이면 학생이 달라도 같은 열쇠가 된다.
 */
export function typeKey(app) {
  return ['전형', squash(app.univ), squash(app.typeSub || app.typeName), squash(app.dept)].join('|');
}

/** 이 항목의 고침이 시트에서 어느 (id, hak) 줄에 서는가. */
export function slotOf(app, key) {
  const item = ITEM[key];
  if (!item) return null;
  return item.scope === 'app'
    ? { id: String(app.id || ''), hak: String(app.hak || ''), field: PREFIX + key }
    : { id: typeKey(app), hak: TYPE_HAK, field: PREFIX + key };
}

/**
 * 이 지원의 고침 전부 — `{ 항목: {value, by, at} }`.
 * @param {Function} get  (id, hak, field) → 입력 탭 한 줄 또는 null
 *                        교사 화면과 학생 화면의 Map 열쇠 모양이 달라 부르는 쪽이 준다
 */
export function fixesOf(app, get) {
  const out = {};
  if (!app) return out;
  for (const item of ITEMS) {
    const at = slotOf(app, item.key);
    const row = get(at.id, at.hak, at.field);
    const v = row && squash(row.value);
    if (v) out[item.key] = { value: String(row.value).trim(), by: row.by || '', at: row.at || '' };
  }
  return out;
}

/** 숫자 칸의 글을 숫자로. 「12명」「8.5:1」「85%」도 받는다. 못 읽으면 null. */
export function numOf(text) {
  const m = String(text == null ? '' : text).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * 적은 값이 그 칸에 맞는지. 맞으면 저장할 글(씻은 것), 아니면 사람에게 할 말.
 * @return {{ok:boolean, value?:string, error?:string}}
 */
export function check(key, text) {
  const item = ITEM[key];
  const v = String(text == null ? '' : text).trim();
  if (!item) return { ok: false, error: `모르는 항목입니다: ${key}` };
  if (!v) return { ok: true, value: '' };
  if (item.kind === 'num' || item.kind === 'dec') {
    const n = numOf(v);
    if (n == null || n < 0) return { ok: false, error: '숫자로 적어 주세요.' };
    if (item.kind === 'num' && !Number.isInteger(n)) return { ok: false, error: '정수로 적어 주세요.' };
    return { ok: true, value: String(n) };
  }
  return { ok: true, value: v };
}

/**
 * 요약에 고침을 덮어쓴다. **원본 요약은 건드리지 않는다**(캐시가 들고 있을 수 있다).
 *
 * 모집요강 줄의 글(최저·자격·반영교과)도 여기서 정리한다 — 전형 이름으로 못 맞춘
 * 줄(`mojipOff`)이면 그 글은 **옆 전형의 것일 수 있다.** 작년 모집인원·실질경쟁률은
 * 이미 그 규칙으로 비우는데(match.js summarize), 글은 여태 그대로 써서 기회균형
 * 카드에 일반전형의 최저가 붙었다. 이 전형의 값 자리에서는 빼고, 참고(`mojipRef`)로만
 * 넘긴다 — 카드는 「다른 전형 줄일 수 있다」고 적고 보여 준다.
 *
 * @param {Object} s     summarize() 결과
 * @param {Object} fx    fixesOf() 결과
 */
export function applyFixes(s, fx) {
  if (!s) return s;
  const out = { ...s, fixed: fx || {} };
  const f = (k) => (fx && fx[k] ? fx[k].value : null);
  const n = (k) => (f(k) != null ? numOf(f(k)) : null);

  if (s.mojip) {
    const mo = { ...s.mojip };
    if (s.mojipOff) {
      const ref = {
        type: mo.type || '', minReq: mo.minReq || '', eligibility: mo.eligibility || '',
        refMain: mo.refMain || '', refCareer: mo.refCareer || '',
      };
      if (ref.minReq || ref.eligibility || ref.refMain || ref.refCareer) out.mojipRef = ref;
      mo.minReq = null; mo.eligibility = null; mo.refMain = null; mo.refCareer = null;
    }
    out.mojip = mo;
  }
  const mo = () => {
    if (!out.mojip) out.mojip = {};
    return out.mojip;
  };
  if (f('전형방법')) mo().methodFix = f('전형방법');
  if (n('전형단계') != null) { out.stages = n('전형단계'); mo().stages = n('전형단계'); }
  if (f('대학별고사')) { mo().exam = f('대학별고사'); mo().examWhen = ''; }
  if (f('반영교과')) mo().refMain = f('반영교과') === NONE ? null : f('반영교과');
  if (f('진로선택')) mo().refCareer = f('진로선택') === NONE ? null : f('진로선택');
  if (f('지원자격')) mo().eligibility = f('지원자격') === NONE ? null : f('지원자격');

  if (n('올해모집인원') != null) out.quotaNow = n('올해모집인원');
  if (n('작년모집인원') != null) out.quotaPrev = n('작년모집인원');
  if (n('작년경쟁률') != null) out.rate = n('작년경쟁률');
  if (n('작년실질경쟁률') != null) out.real = { value: n('작년실질경쟁률'), why: '선생님 고침' };
  if (n('70컷') != null) out.cut = n('70컷');
  if (n('50컷') != null) out.cut50 = n('50컷');
  if (n('평균등급') != null) out.avg = n('평균등급');
  return out;
}

/**
 * 이 지원의 수능최저 — **화면들이 같이 쓰는 한 곳.**
 *
 * 차례: 선생님 고침 → 즐겨찾기 원문 → 모집요강(전형 이름으로 맞은 줄만).
 * 관심대학 리스트는 기준 글 없이 Y/N 만 준다(`app.minReq`).
 *
 * @return {{
 *   text: string,          이 전형의 기준 글. 없으면 ''
 *   src: string,           어디서 왔나 — 화면에 그대로 적는다
 *   has: ?boolean,         최저가 있나. null 이면 모른다
 *   conflict: boolean,     관심대학은 「없음」인데 모집요강엔 글이 있다
 *   ref: ?{type, text},    이름을 못 맞춘 모집요강 줄의 글 — 옆 전형 것일 수 있다
 *   fixed: boolean
 * }}
 */
export function minReqOf(app, s) {
  const fx = (s && s.fixed && s.fixed['수능최저']) || null;
  const ref = s && s.mojipRef && s.mojipRef.minReq
    ? { type: s.mojipRef.type, text: s.mojipRef.minReq } : null;
  if (fx) {
    const none = fx.value === NONE;
    return { text: none ? '' : fx.value, src: '선생님 고침', has: !none, conflict: false, ref: null, fixed: true };
  }
  const yn = app && app.minReq === true ? true : app && app.minReq === false ? false : null;
  if (app && app.minReqText) {
    return { text: String(app.minReqText), src: '즐겨찾기', has: true, conflict: false, ref: null, fixed: false };
  }
  const mo = s && s.mojip;
  if (mo && mo.minReq) {
    return { text: String(mo.minReq), src: '모집요강', has: true, conflict: yn === false, ref: null, fixed: false };
  }
  return { text: '', src: yn == null ? '' : '즐겨찾기', has: yn, conflict: false, ref, fixed: false };
}

/**
 * 꼬리표에 쓸 말 — 「최저 2합 6」 · 「최저 있음」 · 「최저 확인」. 안 달 거면 null.
 * @param {Function} short  text.js 의 minReqShort
 */
export function minReqPill(m, short) {
  if (m.conflict) return '최저 확인';
  if (m.text) {
    const s = short(m.text);
    return s ? `최저 ${s}` : '최저 있음';
  }
  if (m.has === true) return '최저 있음';
  if (m.has == null && m.ref) return '최저 확인';
  return null;
}

/**
 * 내 환산 등급·점수 — 선생님이 고쳐 적었으면 그 값. `app.myScore` 와 같은 모양이다.
 */
export function myScoreOf(app, s) {
  const base = (app && app.myScore) || {};
  const fx = (s && s.fixed) || {};
  const g = fx['내환산등급'] ? numOf(fx['내환산등급'].value) : null;
  const sc = fx['내환산점수'] ? numOf(fx['내환산점수'].value) : null;
  if (g == null && sc == null) return base;
  return { ...base, ...(g != null ? { grade: g } : {}), ...(sc != null ? { score: sc } : {}) };
}
