/**
 * 화면에 쓰는 짧은 글자 다루기.
 * =====================================================================
 * 여러 화면이 같이 쓴다. 한 벌만 두는 까닭 — 조사 규칙이 두 벌이 되면
 * 한쪽만 고쳐지고, 화면에 `학부을(를)` 같은 표기가 남는다.
 */

/**
 * 받침을 보고 조사를 고른다.
 * 숫자·영문으로 끝나면 보수적으로 받침 있는 쪽을 쓴다 — 「AI를」보다 「AI을」이
 * 어색하지만, 읽는 데 걸리지는 않는다. 반대는 문장이 깨진 것처럼 보인다.
 */
export function josa(word, withBatchim, without) {
  /*
   * 뒤에 붙은 괄호·따옴표는 떼고 본다. 「교과(지역인재)」 의 마지막 글자는 `)` 지만
   * 소리 내어 읽을 때는 `재` 로 끝난다. 안 떼면 「교과(지역인재)」은 이 된다.
   */
  const last = String(word || '').trim().replace(/[)\]}」』"'’”.·]+$/, '').slice(-1);
  if (!last) return withBatchim;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 ? withBatchim : without;
  return withBatchim;
}
