/**
 * Apps Script 백엔드 통신 (P0)
 * =====================================================================
 * 보드 화면은 GitHub Pages에 있고 학생 자료는 Apps Script 뒤에 있다.
 * 도메인이 다르고 Apps Script 웹앱은 CORS 헤더를 제대로 주지 않으므로
 * JSONP(<script> 태그)로 부른다. counsel.html 이 쓰던 방식과 같다.
 *
 * 응답은 언제나 { ok:true, ... } 또는 { ok:false, error:"사람이 읽을 문장" }.
 * ok:false 를 조용히 삼키지 않는다 — 부르는 쪽으로 던져서 화면에 띄운다.
 */

const CONFIG_KEY = 'board.apiUrl';
/*
 * 교사 열쇠. **보드만 갖고 학생 링크에는 안 들어간다.**
 *
 * 학생 링크에는 배포 주소가 `?api=` 로 그대로 들어 있고, 「액세스: 모든 사용자」
 * 배포라 서버가 접속자를 못 알아본다. 열쇠가 없으면 학생이 주소만 떼어
 * `?action=students` 를 불러 전교생 자료를 통째로 가져갈 수 있다.
 */
const KEY_KEY = 'board.teacherKey';

/*
 * 기본 교사 열쇠. **`board/apps-script/Code.gs` 의 `DEFAULT_KEY` 와 같아야 한다.**
 * 선생님이 따로 안 넣으면 이걸 보낸다 — 설치할 때 손댈 곳이 하나 줄어든다.
 * 저장소에 적혀 있는 값이라 잠금이 아니라 빗장이다(Code.gs 의 설명 참고).
 */
const DEFAULT_KEY = '84348434';

/**
 * 토큰으로 여는 경로. **`Code.gs` 의 `STUDENT_ACTION` 과 같아야 한다.**
 *
 * 이름 앞자리로 가르지 않는다. 예전에는 `action.startsWith('student')` 였는데
 * 교사 화면의 자료 적재인 **`students` 가 여기 걸려서**(`'students'` 는
 * `'student'` 로 시작한다) 열쇠를 안 붙였고, 서버는 「열쇠가 맞지 않습니다」로
 * 돌려보냈다. 서버에서 똑같은 함정을 고쳐 놓고 여기에 새로 심은 것이다.
 *
 * 두 목록이 어긋나면 `board/auth.test.mjs` 가 잡는다.
 */
const STUDENT_ACTION = new Set([
  'student', 'studentDate', 'studentApplyNo', 'studentField', 'studentResult',
  'studentNote', 'studentNoteRemove', 'studentAsk', 'studentRank',
]);
let apiUrl = '';
let teacherKey = '';
let seq = 0;

try {
  apiUrl = localStorage.getItem(CONFIG_KEY) || '';
  teacherKey = localStorage.getItem(KEY_KEY) || '';
} catch (err) {
  apiUrl = '';        // 사생활 보호 모드 등에서 막히면 그냥 빈 값으로 둔다
  teacherKey = '';
}

/**
 * 서버 주소를 정한다.
 *
 * `persist` 를 끄면 **이번 화면에서만** 쓰고 브라우저에 남기지 않는다.
 * 학생 화면이 그렇게 쓴다 — 링크의 `?api=` 를 그대로 저장하면, 선생님이 학생 링크
 * 하나를 자기 브라우저에서 열어 보는 것만으로 **교사 보드의 서버 주소가 바뀐다.**
 * 둘이 같은 열쇠(`board.apiUrl`)를 쓰기 때문이다. 링크는 남이 만들어 보낼 수도 있다.
 */
export function configure(url, opts) {
  apiUrl = String(url || '').trim();
  if (opts && opts.persist === false) return;
  try {
    if (apiUrl) localStorage.setItem(CONFIG_KEY, apiUrl);
    else localStorage.removeItem(CONFIG_KEY);
  } catch (err) { /* 저장이 막혀도 이번 세션 동안은 쓸 수 있다 */ }
}

export function configured() {
  return Boolean(apiUrl);
}

/**
 * 교사 열쇠를 정한다. 학생 화면은 이걸 부르지 않는다 —
 * `configure` 와 달리 링크에서 오는 값이 아니라 선생님이 손으로 넣는 값이다.
 */
export function setKey(value) {
  teacherKey = String(value || '').trim();
  try {
    if (teacherKey) localStorage.setItem(KEY_KEY, teacherKey);
    else localStorage.removeItem(KEY_KEY);
  } catch (err) { /* 저장이 막혀도 이번 세션 동안은 쓸 수 있다 */ }
}

export function key() {
  return teacherKey;
}

/** 지금 저장소에 적힌 기본 열쇠를 쓰고 있나. 설정 화면이 안내에 쓴다. */
export function usingDefaultKey() {
  return !teacherKey || teacherKey === DEFAULT_KEY;
}

export function url() {
  return apiUrl;
}

/** 한 번 부른다. 성공하면 응답 객체, 실패하면 throw. */
function once(action, params, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!apiUrl) {
      // 학생도 이 오류를 본다. 링크에서 `api` 조각이 잘려 나가면 여기로 온다.
      // 「Apps Script 주소」는 학생이 못 알아듣는 말이라 양쪽 다 읽히게 적는다.
      reject(new Error('주소가 온전하지 않습니다.'
        + ' 링크를 끝까지 복사했는지 확인하시고, 그래도 안 되면 담임 선생님께 다시 받아 주세요.'));
      return;
    }
    const cb = `__board_cb_${Date.now()}_${seq += 1}`;
    const query = new URLSearchParams({ action, callback: cb });
    // 학생 경로에는 안 붙인다 — 링크를 받은 사람이 열쇠까지 갖게 되면 안 된다
    if (!STUDENT_ACTION.has(action)) query.set('key', teacherKey || DEFAULT_KEY);
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null) query.set(k, String(v));
    }

    const tag = document.createElement('script');
    let timer = 0;
    const cleanup = () => {
      clearTimeout(timer);
      /*
       * 지우지 않고 **빈 함수로 바꾼다.** 시간이 지나 포기한 뒤에도 스크립트가 늦게
       * 도착해 `cb(...)` 를 부르는 일이 있는데, 지워 버리면 그때 콘솔에 오류가 남는다.
       * 콘솔이 지저분하면 진짜 오류를 못 알아본다.
       */
      window[cb] = () => {};
      if (tag.parentNode) tag.parentNode.removeChild(tag);
    };

    window[cb] = (data) => { cleanup(); resolve(data); };
    tag.onerror = () => { cleanup(); reject(new Error('서버에 연결하지 못했습니다.')); };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('서버가 응답하지 않습니다. 잠시 뒤 다시 시도해 주세요.'));
    }, timeoutMs);

    const src = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}${query}`;
    /*
     * JSONP 는 GET 이라 주소 길이에 한계가 있다. 한글은 URL 인코딩으로 글자당 9바이트가
     * 되어서, 긴 상담 메모는 800자쯤부터 위험하다. 잘려서 절반만 저장되면 아무 데도
     * 「잘렸다」고 안 적힌다 — **보내기 전에 막고, 왜 못 보내는지 말한다.**
     */
    if (src.length > 7500) {
      cleanup();
      reject(new Error('내용이 너무 깁니다. 메모를 나눠서 저장해 주세요.'
        + ' (한글은 한 글자가 주소에서 아홉 자리를 차지합니다)'));
      return;
    }
    tag.src = src;
    document.head.appendChild(tag);
  });
}

/**
 * 부르고, 실패하면 두 번까지 다시 시도한다.
 * 시트를 여러 명이 동시에 만질 때 잠금 대기로 한 번씩 미끄러지는 일이 있어서다.
 */
export async function call(action, params, opts = {}) {
  const timeout = opts.timeout || 25000;
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const data = await once(action, params, timeout);
      if (data && data.ok === false) {
        const err = new Error(data.error || '요청이 거절되었습니다.');
        /*
         * 서버가 **판단해서** 거절한 것은 다시 물어도 답이 같다. 특히 순위 충돌
         * (`stale`)은 화면이 한 발 늦었다는 뜻이라, 재시도 두 번은 똑같이 거절될
         * 왕복만 늘린다. 글자(/그 사이에/)가 아니라 값으로 넘긴다 — 서버 문구를
         * 다듬는 순간 화면 쪽 판별이 조용히 죽는 함정을 만들지 않는다.
         */
        err.server = true;
        if (data.stale) err.stale = true;
        throw err;
      }
      return data;
    } catch (err) {
      last = err;
      if (err && err.stale) break;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw last;
}

export const students = () => call('students', {}, { timeout: 45000 });
// setState 는 setRank 로 통일했다. 서버 쪽 setState_ 는 옛 화면을 위해 남아 있다.
/** 순위 옮기기 — 맞바꾸기까지 서버가 한 번에 한다. board/CONTRACT.md §2.4 */
export const setRank = (s) => call('setRank', s);
export const addNote = (n) => call('addNote', n);
export const removeNote = (noteId) => call('removeNote', { noteId });
export const setResult = (r) => call('setResult', r);
export const setDate = (d) => call('setDate', d);

