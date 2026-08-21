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

export function configure(url) {
  apiUrl = String(url || '').trim();
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
      reject(new Error('Apps Script 주소가 설정되지 않았습니다.'));
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
      delete window[cb];
      if (tag.parentNode) tag.parentNode.removeChild(tag);
    };

    window[cb] = (data) => { cleanup(); resolve(data); };
    tag.onerror = () => { cleanup(); reject(new Error('서버에 연결하지 못했습니다.')); };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('서버가 응답하지 않습니다. 잠시 뒤 다시 시도해 주세요.'));
    }, timeoutMs);

    tag.src = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}${query}`;
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

export const ping = () => call('ping', {});
export const students = () => call('students', {}, { timeout: 45000 });
export const setState = (s) => call('setState', s);
export const addNote = (n) => call('addNote', n);
export const removeNote = (noteId) => call('removeNote', { noteId });
export const setResult = (r) => call('setResult', r);
export const setDate = (d) => call('setDate', d);
export const issueToken = (hak) => call('issueToken', { hak });
