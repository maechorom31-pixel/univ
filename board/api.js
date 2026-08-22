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
let apiUrl = '';
let seq = 0;

try {
  apiUrl = localStorage.getItem(CONFIG_KEY) || '';
} catch (err) {
  apiUrl = '';        // 사생활 보호 모드 등에서 막히면 그냥 빈 값으로 둔다
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
      if (data && data.ok === false) throw new Error(data.error || '요청이 거절되었습니다.');
      return data;
    } catch (err) {
      last = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw last;
}

export const students = () => call('students', {}, { timeout: 45000 });
export const setState = (s) => call('setState', s);
export const addNote = (n) => call('addNote', n);
export const removeNote = (noteId) => call('removeNote', { noteId });
export const setResult = (r) => call('setResult', r);
export const setDate = (d) => call('setDate', d);

