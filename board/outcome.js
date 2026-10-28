/**
 * 결과의 경우의 수 — 학생 카드와 선생님 보드가 같이 쓴다
 * =====================================================================
 * 원서를 낸 뒤(지원 확정)에는 카드에서 할 일이 **결과를 모으는 것** 하나다. 그런데
 * 결과는 한 칸이 아니다.
 *
 *   단계별 전형   1단계 발표 → (합격이면) 대학별고사 → 최종 발표
 *   일괄 전형     (대학별고사가 있으면 그것) → 최종 발표
 *   최종 발표 뒤  최초합격 · 예비(기다리는 중) · 충원합격 · 불합격
 *   불합격의 까닭 수능최저 미충족 · 면접/논술/실기 **미응시** · 그 밖
 *   붙은 뒤       등록하나, 안 하나
 *
 * 카드는 **지금 물을 것 하나만** 묻는다 — 1단계가 있고 아직 안 났으면 1단계, 아니면
 * 최종(`stepOf`). 지난 칸은 위에 한 줄로 남긴다(「1단계 합격」).
 *
 * **시트의 한 줄은 통째로 덮어쓴다**(Code.gs setResult_). 그래서 최종을 적을 때 1단계를
 * 비워 보내면 1단계 결과가 지워진다 — 예전 학생 화면이 그랬다. 여기서 고른 값은 늘
 * **지금 줄 위에 얹어서**(`withChoice`) 보낸다.
 *
 * 적히는 말은 stats.js `verdict()` 가 아는 말만 쓴다 — 「불합격」 + 사유. 사유에 「최저」가
 * 있으면 보고서의 「최저 미충족」으로 센다. 「예비(기다리는 중)」는 최종을 비우고 예비번호만
 * 적는다 — 아직 결정이 아니므로 통계는 세지 않는다.
 */

/** 단계별인가 — 1단계 발표가 있는 전형. 선생님이 「면접 없음」으로 정했으면 일괄로 본다. */
export function isStaged(stages, interviewForce) {
  return Number(stages) > 1 && interviewForce !== '없음';
}

/**
 * 지금 물을 것.
 * @param r       결과 줄 {stage1, final, waitNo, reason, enrolled}
 * @return 'stage1' | 'final' | 'out'(1단계 불합격 — 더 물을 것 없음)
 */
export function stepOf(r, staged) {
  const s1 = String((r && r.stage1) || '');
  const fin = String((r && r.final) || '');
  if (/불합격|탈락/.test(s1) && !fin) return 'out';
  if (staged && !s1 && !fin && !(r && r.waitNo)) return 'stage1';
  return 'final';
}

export const STAGE1_CHOICES = [
  { value: '', label: '아직 발표 전' },
  { value: '합격', label: '1단계 합격' },
  { value: '불합격', label: '1단계 불합격' },
];

/** 이 전형에서 빠질 수 있는 대학별고사 — 미응시 갈래를 이것만큼만 보인다. */
export function examsOf(ctx) {
  const out = [];
  if (ctx.interview) out.push('면접');
  if (ctx.cat === '논술') out.push('논술');
  if (ctx.cat === '실기') out.push('실기');
  // 적성은 유형이 따로 없다 — 적성 날이 잡힌 지원이면(ctx.aptitude) 갈래를 보인다
  if (ctx.aptitude) out.push('적성');
  return out;
}

/**
 * 최종 칸의 갈래. ctx = {interview: 면접이 있나, cat: '교과'|'종합'|'논술'|'실기', college: 전문대인가}
 * 전문대 수시는 수능최저를 거의 안 걸어서 「최저」 갈래를 안 보인다(고르면 틀린 말이 남는다).
 */
export function finalChoices(ctx = {}) {
  /*
   * 단계별이면 「1단계 불합격」으로 고치는 갈래를 끝에 둔다. 최종 칸으로 넘어간 뒤에는
   * 1단계를 고칠 길이 학생 화면에 없었다 — 잘못 「1단계 합격」을 고른 경우, 그리고
   * 고사 미응시를 골랐다 되돌려 1단계 합격만 남은 경우(withChoice 의 채움)가 그랬다.
   */
  const fix1 = ctx.staged ? [{ value: '1단계불합격', label: '1단계 불합격(1단계 결과 고치기)' }] : [];
  return [
    { value: '', label: '아직 발표 전' },
    { value: '최초합격', label: '최초합격' },
    { value: '예비', label: '예비 — 기다리는 중', wait: true },
    { value: '충원합격', label: '충원합격(예비에서 붙음)', wait: true },
    { value: '불합격', label: '불합격' },
    ...(ctx.college ? [] : [{ value: '최저', label: '불합격 — 수능최저 미충족' }]),
    ...examsOf(ctx).map((k) => ({ value: `미응시:${k}`, label: `${k} 미응시(시험에 안 감)` })),
    ...fix1,
  ];
}

const MISS = /(면접|논술|실기|적성)\s*(미응시|결시|불참)/;

/** 시트 줄 → 최종 칸의 갈래 값. 아는 말이 아니면 원문 그대로(버리지 않는다). */
export function finalOf(r) {
  const fin = String((r && r.final) || '').trim();
  const reason = String((r && r.reason) || '');
  if (!fin) return r && String(r.waitNo || '').trim() ? '예비' : '';
  if (/불합격|탈락|미선발/.test(fin)) {
    const m = reason.match(MISS);
    if (m) return `미응시:${m[1]}`;
    if (/최저/.test(reason)) return '최저';
    return '불합격';
  }
  if (/충원|추가/.test(fin)) return '충원합격';
  if (/합격/.test(fin)) return '최초합격';
  return fin;
}

/** 갈래 값 → 사람에게 보일 한 줄. */
export function outcomeText(r) {
  const s1 = String((r && r.stage1) || '');
  const v = finalOf(r);
  const wait = String((r && r.waitNo) || '').trim();
  const parts = [];
  if (s1) parts.push(`1단계 ${/불합격|탈락/.test(s1) ? '불합격' : '합격'}`);
  if (v === '예비') parts.push(`예비 ${wait}번 · 기다리는 중`);
  else if (v === '충원합격') parts.push(`충원합격${wait ? `(예비 ${wait}번)` : ''}`);
  else if (v === '최저') parts.push('불합격 · 수능최저 미충족');
  else if (v.startsWith('미응시:')) parts.push(`불합격 · ${v.slice(4)} 미응시`);
  else if (v) parts.push(v);
  const en = String((r && r.enrolled) || '');
  if (/미등록/.test(en)) parts.push('등록 안 함');
  else if (/등록/.test(en)) parts.push('등록');
  return parts.join(' → ');
}

/**
 * 고른 것을 **지금 줄 위에 얹은** 새 줄. 다른 단계의 값은 그대로 둔다.
 * @param r       지금 줄
 * @param step    'stage1' | 'final'
 * @param value   STAGE1_CHOICES / finalChoices 의 value
 * @param extra   {waitNo, enrolled: '등록'|'미등록'|'', staged}
 *
 * `staged`(단계별 전형)이고 1단계가 비었는데 **2단계에 가야만 나오는 값**(최초·예비·충원
 * 합격, 고사 미응시)을 고르면 1단계를 「합격」으로 채운다. 면접 통보를 받았거나 최종에
 * 붙었으면 1단계는 붙은 것이다. 불합격·최저는 1단계에서 떨어진 것일 수도 있어 안 채운다.
 */
export function withChoice(r, step, value, extra = {}) {
  const cur = {
    stage1: (r && r.stage1) || '', final: (r && r.final) || '', reason: (r && r.reason) || '',
    waitNo: (r && r.waitNo) || '', enrolled: (r && r.enrolled) || '',
  };
  const past1 = ['최초합격', '예비', '충원합격'].includes(value) || String(value).startsWith('미응시:');
  if (step === 'final' && extra.staged && !cur.stage1 && past1) cur.stage1 = '합격';
  // 최종 칸에서 고른 「1단계 불합격」 — 1단계 칸으로 적는다(뒤 칸은 지운다)
  if (step === 'final' && value === '1단계불합격') return withChoice(r, 'stage1', '불합격');
  if (step === 'stage1') {
    const next = { ...cur, stage1: value };
    // 1단계 불합격이면 그 뒤는 없다 — 남은 최종·예비가 있으면 지운다(서로 어긋난 줄이 남지 않게)
    if (value === '불합격') return { ...next, final: '', waitNo: '', enrolled: '' };
    return next;
  }
  const wait = String(extra.waitNo == null ? cur.waitNo : extra.waitNo).trim();
  const pass = value === '최초합격' || value === '충원합격';
  const base = { ...cur, enrolled: pass ? (extra.enrolled == null ? cur.enrolled : extra.enrolled) : '' };
  if (value === '') return { ...base, final: '', reason: '', waitNo: '', enrolled: '' };
  if (value === '최초합격') return { ...base, final: '최초합격', reason: '', waitNo: '' };
  if (value === '예비') return { ...base, final: '', reason: '', waitNo: wait };
  if (value === '충원합격') return { ...base, final: '충원합격', reason: '', waitNo: wait };
  if (value === '불합격') {
    // 예비번호는 남긴다 — 「예비 12번까지 돌았는데 못 붙음」도 보고서가 보는 값이다
    return { ...base, final: '불합격', reason: MISS.test(cur.reason) || /최저/.test(cur.reason) ? '' : cur.reason };
  }
  if (value === '최저') return { ...base, final: '불합격', reason: '수능최저 미충족' };
  if (value.startsWith('미응시:')) return { ...base, final: '불합격', reason: `${value.slice(4)} 미응시`, waitNo: '' };
  return { ...base, final: value };
}

/* ── 대학별고사 — 봤나, 안 봤나, 아직인가 ─────────────────────────
 * 원서를 낸 뒤에도 고사 일정은 카드에 남는다 — 지난 것도. 지난 고사는 「봤나」가
 * 결과만큼 중요한 값이라서다(안 갔으면 그 원서는 끝났다).
 *
 * **응시는 따로 적게 하지 않는다 — 날과 결과에서 읽는다.** 날이 지났으면 응시로,
 * 최종 결과가 났으면(미응시가 아니면) 응시로 본다. 사람이 적는 것은 예외인 「미응시」
 * 하나뿐이고, 그건 결과 줄의 사유(「면접 미응시」)에 들어간다 — 따로 칸을 두면 결과와
 * 서로 다른 말을 할 수 있다. 단계별에서 1단계에 떨어졌으면 고사는 「대상 아님」이다.
 */

/**
 * @param kind   '면접' | '논술' | '실기' | '적성'
 * @param d      날짜 {from, to, fixed} | null
 * @param r      결과 줄
 * @param opt    {staged, today: 'YYYY-MM-DD'}
 * @return {{state: '미응시'|'대상아님'|'응시'|'오늘'|'예정'|'미정', auto: boolean, text: string}}
 */
export function examStatus(kind, d, r, opt = {}) {
  const today = opt.today || '';
  if (finalOf(r) === `미응시:${kind}`) return { state: '미응시', auto: false, text: '미응시' };
  const s1 = String((r && r.stage1) || '');
  if (opt.staged && /불합격|탈락/.test(s1)) {
    return { state: '대상아님', auto: true, text: '1단계 불합격 — 안 봄' };
  }
  const fin = finalOf(r);
  // 최종이 났다(최초·예비·충원·불합격·최저) — 고사를 본 것이다
  const decided = fin && !fin.startsWith('미응시:');
  if (d && d.from && today) {
    if (d.to < today) return { state: '응시', auto: true, text: '응시(날짜 지남)' };
    if (d.from <= today) {
      return { state: '오늘', auto: true, text: d.fixed ? '오늘' : '기간 중' };
    }
    if (!decided) {
      const days = Math.round((Date.parse(d.from) - Date.parse(today)) / 86400000);
      return { state: '예정', auto: true, text: `예정 D-${days}` };
    }
  }
  if (decided) return { state: '응시', auto: true, text: '응시(결과 나옴)' };
  return { state: '미정', auto: true, text: '날짜 미정' };
}

/** 이 고사를 미응시로 적은 줄 / 되돌린 줄. 되돌리면 최종을 비운다(발표 전으로). */
export function withMissed(r, kind, missed, staged = false) {
  if (missed) return withChoice(r, 'final', `미응시:${kind}`, { staged });
  return finalOf(r) === `미응시:${kind}` ? withChoice(r, 'final', '') : withChoice(r, 'final', finalOf(r));
}
