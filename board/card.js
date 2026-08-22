/**
 * 상담 카드 상세 (P3)
 * =====================================================================
 * 보내주신 구글 시트 상담 카드의 항목이 이 화면의 명세다. 항목은 그대로 두고
 * 채우는 방식만 바꿨다 — 손으로 적던 값 대부분이 즐겨찾기·모집요강·입결에서 온다.
 *
 * 어디서 오는지 화면에 밝힌다. 값 옆의 작은 글씨가 출처다. 자료에 없는 항목은
 * 비워 두고 「모집요강 확인」이라고 적는다. 지어내지 않는다.
 *
 * 실질경쟁률은 planner 가 쓰던 식을 그대로 쓴다 (README 참고)
 *     실질경쟁률 = 명목경쟁률 × 모집인원 ÷ (모집인원 + 추가합격인원)
 * 모집인원 + 추가합격이 지원자 수보다 많으면 추합이 누적 예비번호로 적힌 것이라
 * 계산하지 않고 「자료 불일치」로 둔다.
 */
import * as store from './store.js';
import { realRate, normType, typeGroups } from './match.js';
import { confidence, pctText } from './confidence.js';
import { josa } from './text.js';

export { realRate };

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

/** 마지막 어절이 짧으면 앞 어절에 붙여 혼자 한 줄로 떨어지지 않게 한다. */
const tidy = (s) => String(s || '').replace(/ (?=[^ ]{1,4}$)/, ' ');
const MID = '·';

const g2 = (n) => (n == null || n === '' ? null : Number(n).toFixed(2));
const one = (n) => (n == null || n === '' ? null : Number(n).toFixed(1));
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const day = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${m}/${d}(${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
};
const span = (d) => (d.fixed ? day(d.from) : `${day(d.from)}~${day(d.to)}`);

/*
 * 모의면접은 여러 번 잡는다(`모의면접1`…`모의면접5`, schedule.js 와 같은 이름).
 * 예전에는 여기만 구식 키 `모의면접` 하나를 봐서, 일정판에서 잡아 둔 것이
 * 일정판과 학생 화면에는 나오는데 **카드 상세에만 안 나왔다.**
 */
const MOCK_MAX = 5;
const DATE_KINDS = ['면접', '실기', '논술', '적성', '1단계발표', '최종발표', '모의면접']
  .concat(Array.from({ length: MOCK_MAX }, (_, i) => `모의면접${i + 1}`));

/** 표에서 숫자로 오른쪽 정렬할 값인지. `3.42`, `12`, `4.1:1` 까지만 숫자로 본다. */
const numeric = (v) => /^[\d.]+(:1)?$/.test(String(v == null ? '' : v));

/**
 * 카드 하나의 상세.
 * @param {Object} app      Application
 * @param {Object} student  Student
 * @param {Function} onClose
 * @return {HTMLElement}
 */
export function detailPanel(app, student, onClose) {
  const box = el('section', 'panel detail');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', `${app.univ} ${app.dept} 자세히`);
  box.tabIndex = -1;

  const s = store.summary(app);
  const mo = (s && s.mojip) || null;
  const isCollege = s && s.kind === 'college';

  /* 머리 */
  const head = el('div', 'detail-head');
  const title = el('div');
  title.appendChild(el('div', 'univ', tidy(app.univ)));
  title.appendChild(el('div', 'dept',
    [tidy(app.dept), app.typeSub || app.typeName].filter(Boolean).join(` ${MID} `)));
  head.appendChild(title);
  const close = el('button', 'btn', '닫기');
  close.type = 'button';
  close.onclick = onClose;
  head.appendChild(close);
  box.appendChild(head);

  const body = el('div', 'detail-body');
  box.appendChild(body);

  /*
   * **올해 신설이면 맨 먼저 말한다.**
   * 아래 숫자가 비어 있는 까닭이 「자료를 못 찾았다」가 아니라 「작년에 없었다」라는
   * 것은 상담에서 전혀 다른 이야기다. 앞은 더 찾아보면 되고, 뒤는 아무도 모른다.
   */
  if (s && s.isNew) {
    const p = el('p', 'note');
    p.appendChild(el('b', null, '올해 새로 생긴 전형입니다. '));
    p.appendChild(document.createTextNode(
      '작년 모집인원도 경쟁률도 모집요강에 없습니다. 작년 컷으로 가늠할 수 없는'
      + ' 자리라, 아래 숫자가 있더라도 이 전형의 작년 값은 아닙니다.'
      + ' 대학 홈페이지와 입시설명회 자료를 함께 봐 주세요.'));
    body.appendChild(p);
  }

  /*
   * **손으로 이어 둔 학과면 그것도 말한다.**
   * 점검 화면에서 선생님이 「영어영문학과 → 영어학부」로 이어 두면 그때부터 카드에
   * 다른 학과의 숫자가 뜬다. 어느 학과 것인지 안 적으면 이 학과의 작년 값으로 읽는다.
   */
  if (s && s.alias && (s.alias.toUniv || s.alias.toDept)) {
    const to = [s.alias.toUniv || app.univ, s.alias.toDept || app.dept].join(' ');
    const p = el('p', 'note');
    p.appendChild(document.createTextNode('아래 작년 숫자는 '));
    p.appendChild(el('b', null, `「${to}」의 것입니다.`));
    p.appendChild(document.createTextNode(
      ' 이름이 달라 안 붙던 것을 점검 화면에서 손으로 이어 둔 것입니다'
      + `${s.alias.note ? ` (${s.alias.note})` : ''}.`
      + ' 같은 학과가 맞는지 한 번 봐 주세요.'));
    body.appendChild(p);
  }

  /*
   * **고른 전형이 학과 자료보다 일찍 끊긴 경우.**
   *
   * 이 카드는 여태 3년 묵은 줄에 「작년 경쟁률」이라는 이름표를 달아 왔다.
   * 2027 모집요강의 전형·모집단위 가운데 입결이 붙는 12,294 가지를 다 돌려 보면
   * 352건(2.9%)이 그랬고, 그중 170건은 전형이 쪼개진 탓이다.
   *
   *     가톨릭대(성심) 영어영문  종합(잠재능력) ~2023  →  2026 면접 4.20 · 서류 4.91
   *     강원대(도계) 유아교육    종합(미래인재) ~2023 컷 5.53  →  2025 미래인재1 4.84 · 2 4.86
   *
   * 뒤를 잇는 전형이 무엇인지는 적어 주되 **잇지는 않는다** — 「미래인재면접」이
   * 1인지 2인지 이름으로는 못 가린다. 고르면 그럴듯하게 틀린다.
   */
  if (s && s.stale) {
    const st = s.stale;
    const note = el('p', 'note');
    const others = st.heirs.filter((h) => !st.heir || h.name !== st.heir.name);
    const label = (h) => `${h.name} (${h.year}년 `
      + `${h.g70 != null ? `70%컷 ${g2(h.g70)}` : '컷 없음'})`;
    const last = st.heirs[st.heirs.length - 1];

    note.appendChild(document.createTextNode(`「${st.was}」${josa(st.was, '은', '는')} 입결에 `));
    note.appendChild(el('b', null, `${st.hi}년까지만 있${st.heirs.length ? '고' : '습니다'}`));

    if (!st.heirs.length) {
      note.appendChild(document.createTextNode(
        `. 이 학과 자료는 ${st.deptHi}년까지 있으니, 아래 숫자는 작년이 아니라`
        + ` ${st.year}년 것입니다.`));
    } else {
      note.appendChild(document.createTextNode(` ${st.hi + 1}년에 `
        + `${st.heirs.map((h) => h.name).join(' · ')}`
        + `${josa(last.name, '으로', '로')} 쪼개졌습니다. `));
      if (st.heir) {
        /*
         * 가려냈으면 **근거를 그대로 적는다.** 「면접형으로 봤다」만 적으면 그건
         * 그냥 오연결이고, 왜 그렇게 봤는지 적어야 선생님이 아니라고 할 수 있다.
         */
        note.appendChild(el('b', null, `${st.heir.why} 「${st.heir.name}」`));
        note.appendChild(document.createTextNode(
          `${josa(st.heir.name, '으로', '로')} 이어 읽었습니다. 아래 숫자는 그 전형의`
          + ` ${st.heir.year}년 것입니다.`
          + (others.length ? ` 다른 갈래는 ${others.map(label).join(' · ')}입니다 —`
            + ' 아래 「연도별 추이」에서 함께 볼 수 있습니다.' : '')));
      } else {
        note.appendChild(document.createTextNode(
          `${st.heirs.map(label).join(' · ')} 가운데 어느 쪽인지 가릴 수 없어`
          + ' 잇지 않았습니다. 아래 숫자는 작년이 아니라'
          + ` ${st.year}년 「${st.was}」 것입니다. 「연도별 추이」에서 직접 견줘 주세요.`));
      }
    }
    body.appendChild(note);
  }

  /*
   * **이 학과 입결에 그 유형이 아예 없는 경우.**
   * 「전형을 못 가렸다」와 다른 말이다 — 가려낼 것이 애초에 없다.
   * 특히 논술이 그렇다. 입결 75,200행 가운데 논술은 966행뿐이고 그중 70%컷이 있는
   * 것은 46% 다. 공개하는 대학이 적다. 「자료 정리가 덜 됐나」로 읽히면 안 된다.
   */
  if (s && s.catMissing) {
    const note = el('p', 'note');
    note.appendChild(document.createTextNode('이 학과에는 '));
    note.appendChild(el('b', null, `${s.catMissing} 전형 입결이 없습니다`));
    note.appendChild(document.createTextNode(
      s.catMissing === '논술'
        ? '. 논술은 결과를 공개하는 대학이 적어 자료가 성깁니다 — 전체 입결의 1.3% 뿐이고'
          + ' 그중 70%컷이 적힌 것은 절반이 안 됩니다. 대학 홈페이지의 선행학습영향평가'
          + ' 보고서에 논술 결과가 실리는 경우가 있으니 그쪽을 봐 주세요.'
        : `. 아래 「연도별 추이」에는 다른 유형의 전형만 있습니다 — ${s.catMissing}과(와)는`
          + ' 잣대가 달라 견주지 마세요.'));
    body.appendChild(note);
  }

  /*
   * **전형은 붙었는데 어느 해에도 70%컷이 안 적힌 경우.**
   * 「연결이 안 됐다」도 「자료가 없다」도 아니다 — 줄은 있고 그 칸만 비어 있다.
   * 대학이 그 전형의 결과를 안 낸 것이라 더 찾아봐도 안 나온다. 그렇게 적는다.
   */
  /*
   * 끊긴 전형의 뒤를 잇는 것까지 찾아 놨으면 컷 빈칸은 다시 안 말한다.
   * 위 알림이 이미 「2023년까지만 있고 뒤는 이것들」이라 적었는데, 여기서
   * 「대학이 안 공개해서 다른 데서도 안 나온다」고 덧붙이면 더 찾을 데가 없는 것처럼
   * 읽힌다. 실제로는 뒤를 잇는 전형에 컷이 있다.
   */
  if (s && s.cutMissing && !(s.stale && s.stale.heirs.length)) {
    const note = el('p', 'note');
    note.appendChild(document.createTextNode(`「${s.type}」${josa(s.type, '은', '는')} 입결에 `));
    note.appendChild(el('b', null, '줄은 있는데 70%컷 칸이 비어 있습니다'));
    note.appendChild(document.createTextNode(
      '. 대학이 그 전형의 합격선을 공개하지 않은 것이라 다른 데서도 나오지 않습니다.'
      + ' 아래 「연도별 추이」의 경쟁률과 모집인원은 볼 수 있습니다.'));
    body.appendChild(note);
  }

  if (s && s.linked && s.kind === 'univ' && s.typeFit === 'none'
      && !s.isNew && !s.catMissing && !s.nearby) {
    /*
     * 학과 입결은 있는데 지원한 전형이 어느 줄인지 못 가렸다.
     * 옆 전형의 컷을 앉히면 그럴듯하게 틀린다 — 비워 두고, 아래 표에서 직접 보게 한다.
     */
    const all = s.among || [];
    const among = all.slice(0, 4);
    const rest = all.length - among.length;
    const list = among.join(' · ') + (rest > 0 ? ` 외 ${rest}개` : '');
    body.appendChild(el('p', 'note',
      `이 학과 입결에 전형이 여럿인데 「${app.typeSub || app.typeName || '지원한 전형'}」이`
      + ' 어느 줄인지 가려내지 못했습니다. 컷과 경쟁률을 비워 두었습니다.'
      + (among.length ? ` 아래 「연도별 추이」의 ${list} 가운데 하나입니다 —`
        + ' 직접 봐 주세요.' : ' 아래 「연도별 추이」에서 직접 봐 주세요.')));
  }

  /*
   * **이름이 바뀐 것 같은 앞선 학과.** 찾아 주기만 하고 잇지는 않는다.
   * 학과는 이름이 바뀔 때 가르치는 것과 뽑는 수도 같이 바뀌어서, 자료만 보고
   * 같은 곳인지 못 가린다(match.js predecessor 참고). 사람이 정할 일이다.
   */
  const older = store.renamedFrom(app);
  if (older) {
    const note = el('p', 'note');
    note.appendChild(document.createTextNode(
      `이 학과는 입결에 ${s && s.rows ? [...new Set(s.rows.map((r) => r.year))].length : 0}해치밖에`
      + ' 없습니다. 같은 대학에 '));
    note.appendChild(el('b', null, `「${older.dept}」`));
    note.appendChild(document.createTextNode(
      `가 ${older.years[older.years.length - 1]}까지 ${older.years.length}해 있었습니다 —`
      + ' 이름이 바뀐 것일 수 있습니다. 같은 곳이 맞다면 「점검」 화면에서 이어 주세요.'
      + ' 학과는 이름이 바뀔 때 가르치는 것과 뽑는 수도 같이 바뀌는 일이 있어'
      + ' 자동으로 잇지는 않습니다.'));
    body.appendChild(note);
  }

  if (s && !s.linked && s.before) {
    // 묶이기 전 선이라도 있으면 「없다」가 아니라 「이것으로 본다」고 적는다
    body.appendChild(el('p', 'note', s.why));
  } else if (s && !s.linked) {
    body.appendChild(el('p', 'note', `작년 자료가 붙지 않았습니다 — ${s.why}`));
  }

  /* 1. 전형 */
  body.appendChild(rows('전형', [
    ['모집 시기', app.period, '즐겨찾기'],
    ['전형 유형', app.typeCat, '즐겨찾기'],
    ['전형 이름', app.typeName, '즐겨찾기'],
    ['세부 유형', app.typeSub, '즐겨찾기'],
    ['선발 방식', app.selectType, '즐겨찾기'],
    ['계열', app.track || (isCollege ? s.track : null), app.track ? '즐겨찾기' : '전문대 자료'],
    ['지역', app.region, '즐겨찾기'],
    ['전형 단계', mo && mo.stages ? `${mo.stages}단계` : null, '모집요강'],
  ]));

  /*
   * 입결 숫자가 **어느 전형에서 왔는지** 늘 적는다.
   * 입결은 (대학·학과) 로만 묶여 있어 한 학과에 전형이 여럿 들어 있고,
   * 학과의 73% 는 가장 최근 해에만도 전형이 둘 이상이다. 어느 줄을 골랐는지
   * 안 적으면 선생님이 옆 전형의 컷을 이 전형의 컷으로 읽는다.
   */
  const ipSrc = ipgyeolSource(s);

  /*
   * **「작년」이라는 이름표는 정말 작년일 때만 단다.**
   *
   * 머리 숫자는 「컷이 있는 가장 최근 줄」에서 통째로 온다. 그 줄이 작년이 아닐 때가
   * 둘 있다 — 전형이 일찍 끊겼거나(`stale`, 352건), 전형은 이어지는데 그해 컷 칸만
   * 비어 앞 해를 썼거나(543건). 입결이 붙는 카드 12,294장 가운데 **895장(7.3%)** 이
   * 그런데, 여태 다 「작년 70% 컷」이라 적혀 있었다. 상담에서 3년 묵은 숫자를
   * 작년 것으로 읽으면 안 된다. 어긋나면 이름표에 연도를 박는다.
   *
   * 모집요강에서 온 줄(작년 모집인원·실질경쟁률·추가합격)은 그대로 「작년」이다.
   * 그쪽은 정말 2026년 값이다.
   */
  const dataHi = s && s.rows && s.rows.length ? Math.max(...s.rows.map((r) => r.year)) : null;
  const yearOff = s && s.year != null && dataHi != null && s.year < dataHi;
  const yr = (label) => (yearOff ? `${s.year}년 ${label}` : `작년 ${label}`);

  /* 2. 인원과 경쟁률 */
  const quotaNow = s.quotaNow;
  const quotaPrev = s.quotaPrev;
  const diff = quotaNow != null && quotaPrev != null ? quotaNow - quotaPrev : null;
  const real = s.real;

  const quotaBlock = rows('인원과 경쟁률', [
    ['올해 모집 인원', quotaNow != null
      ? `${quotaNow}명${diff ? ` (작년 ${quotaPrev}명, ${diff > 0 ? '+' : ''}${diff})` : ''}`
      : app.quotaText || null, '즐겨찾기 + 모집요강'],
    ['작년 모집 인원', !diff && quotaPrev != null ? `${quotaPrev}명` : null, '모집요강'],
    [yr('경쟁률'), s && s.rate != null ? `${s.rate}:1` : null, isCollege ? '전문대 자료' : ipSrc],
    ['작년 실질 경쟁률', real.value != null ? `${one(real.value)}:1` : null,
      real.why || '명목 × 모집 ÷ (모집 + 추합)'],
    ['작년 추가 합격', mo && mo.filled26 != null ? `${mo.filled26}명` : null, '모집요강'],
    ['충원율', isCollege && s.linked && s.rows[0] && s.rows[0].fill != null
      ? `${Math.round(s.rows[0].fill)}%` : null, '전문대 자료'],
  ]);

  /*
   * **미달은 말로 적어 준다.**
   *
   * 「0.54:1」은 훑으면 그냥 낮은 숫자로 읽히지만, 상담에서는 「뽑으려던 인원보다
   * 지원자가 적었다」는 뜻이고 컷도 그만큼 못 믿을 값이 된다. 숫자 옆에 한 줄 적는다.
   *
   * 이 값들이 **진짜 미달인지** 먼저 확인했다. 입결 75,592줄 가운데 경쟁률이 1 미만인
   * 줄이 487개인데(`data/review_comp_anomaly.csv`), 엑셀이 「13:1」을 시간으로 읽어
   * 0.542 로 뭉갠 것 아니냐는 의심이 있었다. 모집인원 × 경쟁률을 반올림해 지원자 수를
   * 되돌린 뒤 다시 나눠 보면 82.1% 가 원래 값과 자릿수까지 맞는다 — 경쟁률 1 초과인
   * 대조군의 78.3% 와 같은 수준이고, 같은 모집인원에 무작위 값을 넣었을 때의 16.9%
   * 와는 딴판이다. 시간 서식이었다면 이 정합이 나올 수 없다. 그대로 쓴다.
   */
  const rated = (s && s.mine ? s.mine : []).filter((r) => r.rate != null);
  const under = rated.filter((r) => r.rate < 1);
  if (under.length) {
    /*
     * 「작년」이라 안 쓰고 **연도를 적는다.** 전형에 따라 가장 최근 자료가 2024년인
     * 곳도 있어서, 머리의 「작년 경쟁률」 줄이 실제로는 재작년 값일 때가 있다.
     */
    const last = rated[rated.length - 1];
    const yrs = under.map((r) => r.year).join('·');
    const lead = last.rate < 1
      ? `${last.year}년 경쟁률이 1을 밑돕니다 — 뽑으려던 인원보다 지원자가 적었습니다(미달).`
        + (under.length > 1
          ? ` 자료에 있는 ${rated.length}해 가운데 ${under.length}해(${yrs})가 그렇습니다.`
          : '')
      : `${last.year}년은 아니지만 ${yrs}년에 미달이었습니다`
        + ' — 뽑으려던 인원보다 지원자가 적었던 해입니다.';
    quotaBlock.appendChild(el('p', 'hint', `${lead} 미달인 해는 컷이 지원자 몇 명에`
      + ' 좌우되므로 그 해 값은 특히 흔들립니다.'));
  }
  body.appendChild(quotaBlock);

  /* 3. 성적 — 내 성적과 작년 결과를 나란히. 빼지 않고 그대로 둔다. */
  const naesin = (student && student.naesin) || {};
  const mine = app.myScore || {};
  body.appendChild(rows('성적', [
    ['내 전교과', g2(naesin['전교과'] ?? naesin['전교과(100)']), '즐겨찾기'],
    ['내 환산 등급', g2(mine.grade), '즐겨찾기'],
    ['내 환산 점수', mine.score != null ? String(mine.score) : null, '즐겨찾기'],
    isCollege
      ? ['작년 평균 등급', g2(s.avg), '전문대 자료']
      : [yr('70% 컷'), g2(s && s.cut), ipSrc],
    isCollege
      ? ['작년 최저 등급', g2(s.cut), '전문대 자료']
      : [yr('50% 컷'), g2(s && s.cut50), ipSrc],
  ]));

  /*
   * 3.5 원서를 내고 **나서야** 채워지는 칸.
   * 학생이 적고 담임이 확인한다. 값이 하나도 없으면 구역 자체를 만들지 않는다 —
   * 9월에는 빈 줄 셋이 자리만 차지한다.
   */
  const paperwork = [
    ['수험번호', store.fieldOf(app, '수험번호')],
    ['최종 경쟁률', store.fieldOf(app, '최종경쟁률')],
    ['생년월일', store.fieldOf(app.hak, '생년월일')],
  ];
  if (paperwork.some(([, v]) => v && v.value)) {
    body.appendChild(rows('원서를 낸 뒤', paperwork.map(([k, v]) => [
      k,
      v && v.value ? (k === '최종 경쟁률' ? `${v.value}:1` : v.value) : null,
      v && v.status === 'student' ? '학생 입력 · 확인 대기' : '학생 입력 · 확인됨',
    ])));
  }

  /* 4. 일정 — 없는 항목도 「모집요강 확인」으로 남긴다. 빠뜨리는 것이 더 위험하다. */
  const sched = [];
  for (const kind of DATE_KINDS) {
    const d = store.dateOf(app, kind);
    if (!d) continue;
    const from = d.status === 'pending' ? '학생 입력 · 확인 대기'
      : d.status === 'confirmed' ? '선생님 확정'
        : d.status === 'sched' || d.status === 'sched-loose' ? (d.why || '전형일정표')
          : d.fixed ? '즐겨찾기' : '즐겨찾기 · 기간';
    sched.push([kind, span(d), from]);
  }
  if (mo && mo.exam) {
    sched.push(['대학별 고사', mo.exam + (mo.examWhen ? ` ${MID} ${mo.examWhen}` : ''), '모집요강']);
  }

  // 전형일정표가 원서 마감·발표일까지 준다. 모집요강에 없던 칸이 여기서 채워진다.
  const paper = store.paperOf(app);
  const when = (x) => (x ? span(x) : null);
  if (paper) {
    const tag = paper.loose ? `전형일정표 · ${paper.type} (전형 추정)` : '전형일정표';
    sched.push(['원서 접수 마감',
      paper.apply ? when(paper.apply) + (paper.applyClock ? ` ${paper.applyClock}` : '') : null, tag]);
    if (paper.stage1) sched.push(['1단계 발표', when(paper.stage1), tag]);
    if (paper.final) sched.push(['최종 발표', when(paper.final), tag]);
  }
  sched.push(['등록 마감', null, '모집요강 확인']);
  sched.push(['미등록 충원 발표', null, '모집요강 확인']);

  // 전형 이름을 못 맞춘 고사일은 **이 전형의 날짜가 아니다.** 참고로만 적는다.
  // 여기 적힌 값은 겹침 검사에도 쓰이지 않는다.
  const hint = store.examHint(app);
  if (hint) {
    sched.push([`(참고) ${hint.kind} 고사일`, span(hint),
      '전형일정표 · 이 대학 같은 유형. 이 전형의 날짜가 아닙니다']);
  }
  body.appendChild(rows('일정', sched));

  // 일정표가 학과별로 나눠 적은 것은 원문 그대로 보여 준다. 어느 행에 속하는지
  // 기계가 못 가리는 자리라, 사람이 읽고 판단하는 편이 낫다.
  if (paper && paper.notes.length) {
    const nb = el('div', 'detail-block');
    nb.appendChild(el('h3', '', '전형일정표 원문'));
    nb.appendChild(el('p', 'longtext', paper.notes.join('\n')));
    nb.appendChild(el('p', 'hint',
      '학과별로 날짜가 갈리는 경우가 있어 원문 그대로 둡니다. 모집요강과 함께 확인해 주세요.'));
    body.appendChild(nb);
  }

  /* 5. 수능최저 — 원문 그대로 둔다. 요약하면 조건이 하나씩 빠진다. */
  const minText = app.minReqText || (mo && mo.minReq) || '';
  const min = el('div', 'detail-block');
  min.appendChild(el('h3', '', '수능 최저학력 기준'));
  min.appendChild(minText
    ? el('p', 'longtext', String(minText).replace(/^\s*\*\s*/, ''))
    : el('p', 'hint', '즐겨찾기와 모집요강에 최저 기준이 적혀 있지 않습니다. 모집요강을 확인해 주세요.'));
  body.appendChild(min);

  /* 6. 지원 자격 */
  if (mo && mo.eligibility) {
    const q = el('div', 'detail-block');
    q.appendChild(el('h3', '', '지원 자격'));
    q.appendChild(el('p', 'longtext', String(mo.eligibility)));
    body.appendChild(q);
  }

  /* 7. 전문대만 있는 값 */
  if (isCollege && s.linked) {
    const d = s.rows[0] || {};
    body.appendChild(rows('전문대 정보', [
      ['분야', d.cat, '전문대 자료'],
      ['수업 연한', d.level, '전문대 자료'],
      ['취업률', d.employ != null ? `${Math.round(d.employ)}%` : null, '전문대 자료'],
      ['연계 편입', d.transfer ? `${d.transfer}곳` : null, '전문대 자료'],
      ['등록금', d.tuition != null ? `${Math.round(d.tuition).toLocaleString('ko-KR')}원` : null, '전문대 자료'],
      ['학과 변경', d.change, '전문대 자료'],
    ]));
  }

  /* 8. 묶이기 전 학과들 */
  body.appendChild(bundled(s));

  /* 8.5 신설 전형이면 곁들이는 관련 전형 */
  body.appendChild(nearbyBlock(s, app));

  /* 9. 연도별 추이 */
  body.appendChild(trend(s));

  /* 9.5 이 숫자를 얼마나 믿을 수 있나 */
  body.appendChild(howSure(s, mine.grade));

  /* 10. 결과 — 보고 적는다 */
  body.appendChild(result(app));

  /* 11. 상담 메모 */
  body.appendChild(memo(app, student));

  /* 12. 즐겨찾기에서 못 알아본 칸 — 버리지 않고 보여 준다 */
  const unknown = Object.entries(app.unknown || {});
  if (unknown.length) {
    body.appendChild(rows('알아보지 못한 칸', unknown.map(([k, v]) => [k, v, '즐겨찾기 원문'])));
  }

  return box;
}

/* ── 조각 ─────────────────────────────────────────────────────── */

/**
 * 값이 있는 줄만 남긴 작은 표. 남는 줄이 없으면 구역 자체를 만들지 않는다.
 * 다만 출처가 「모집요강 확인」인 줄은 값이 없어도 남긴다 — 빠뜨리면 안 되는 항목이라서다.
 */
function rows(title, list) {
  const wrap = el('div', 'detail-block');
  const have = list.filter((x) => x
    && ((x[1] != null && x[1] !== '') || x[2] === '모집요강 확인'));
  if (!have.length) return wrap;

  wrap.appendChild(el('h3', '', title));
  const tw = el('div', 'tw');
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  for (const [k, v, src] of have) {
    const tr = document.createElement('tr');
    tr.appendChild(el('th', 'rowhead', k));
    const blank = v == null || v === '';
    tr.appendChild(el('td', numeric(v) ? 'num' : (blank ? 'muted' : null), blank ? '—' : String(v)));
    tr.appendChild(el('td', 'src', src || ''));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tw.appendChild(table);
  wrap.appendChild(tw);
  return wrap;
}

/**
 * 올해 신설 전형에 곁들이는 **관련 전형**.
 *
 * 작년에 없던 전형이니 작년 컷도 없는 게 맞다. 그래도 같은 대학 같은 학과의
 * 유형이 같은 전형이면 대략의 선은 된다 — 건국대(글로컬) 의예과 「지역의사제」에
 * 「교과(지역인재)」를 곁들이는 식이다.
 *
 * **이 전형의 값인 척하지 않는다.** 그래서 머리 숫자(컷·경쟁률·모집)에는 안 넣고
 * 여기 따로 둔다. 자유전공의 「묶이기 전 학과 참고」와 같은 자리, 같은 꼴이다.
 */
function nearbyBlock(s, app) {
  const wrap = el('div', 'detail-block');
  if (!s || !s.nearby || !s.nearby.groups.length) return wrap;
  const { groups, sole } = s.nearby;

  wrap.appendChild(el('h3', '', '참고 — 이 학과의 관련 전형'));

  const p = el('p', 'note');
  p.appendChild(document.createTextNode('「'));
  const name = app.typeSub || app.typeName || '이 전형';
  p.appendChild(el('b', null, name));
  p.appendChild(document.createTextNode(s.nearby.reason === 'new'
    ? `」${josa(name, '은', '는')} 올해 신설이라 작년 값이 없습니다. `
    : `」${josa(name, '이', '가')} 작년 입결의 어느 전형인지 가려내지 못했습니다. `));
  p.appendChild(document.createTextNode(sole
    ? `이름이 닮은 「${groups[0].name}」${josa(groups[0].name, '을', '를')} 곁들입니다 — `
    : `같은 학과 같은 유형의 전형 ${groups.length}개를 곁들입니다 — `));
  p.appendChild(el('b', null, '이 전형의 작년 값이 아닙니다'));
  p.appendChild(document.createTextNode(s.nearby.reason === 'new'
    ? '. 대략의 선으로만 봐 주세요. 신설 전형은 첫해 경쟁률과 컷이 크게 흔들립니다.'
    : '. 대략의 선으로만 봐 주세요. 어느 것이 이 전형인지는 대학 홈페이지에서 확인해 주세요.'));
  wrap.appendChild(p);

  // 여럿이면 「이 언저리」를 먼저 한 줄로. 하나하나 읽기 전에 폭이 보여야 한다.
  const lasts = groups.map((g) => g.rows[g.rows.length - 1].g70).filter((v) => v != null);
  if (lasts.length > 1) {
    const lo = Math.min(...lasts);
    const hi = Math.max(...lasts);
    wrap.appendChild(rowsBare([['작년 이 학과 · 이 유형',
      lo === hi ? g2(lo) : `${g2(lo)} ~ ${g2(hi)}`,
      `${groups.length}개 전형의 가장 최근 70%컷`]]));
  }

  const tw = el('div', 'tw');
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const t of ['연도', '모집', '경쟁률', '70%컷', '50%컷']) tr.appendChild(el('th', null, t));
  thead.appendChild(tr);
  const tbody = document.createElement('tbody');
  for (const g of groups) {
    if (groups.length > 1) {
      const head = document.createElement('tr');
      head.className = 'group';
      const cell = el('th', 'gname', g.name);
      cell.colSpan = 5;
      head.appendChild(cell);
      tbody.appendChild(head);
    }
    for (const row of g.rows.slice().reverse()) {
      const line = document.createElement('tr');
      line.appendChild(el('td', 'num', String(row.year)));
      line.appendChild(el('td', 'num', row.quota != null ? String(row.quota) : '—'));
      line.appendChild(el('td', 'num', row.rate != null ? `${row.rate}:1` : '—'));
      line.appendChild(el('td', 'num', g2(row.g70) || '—'));
      line.appendChild(el('td', 'num', g2(row.g50) || '—'));
      tbody.appendChild(line);
    }
  }
  table.appendChild(thead);
  table.appendChild(tbody);
  tw.appendChild(table);
  wrap.appendChild(tw);
  return wrap;
}

/**
 * 묶이기 전 학과들 (자유전공 · 학과통합).
 *
 * 모집요강이 `[유형2] 인문사회계열` 아래에 묶인 학과 이름을 그대로 갖고 있다.
 * 그 학과들의 작년 선을 모아 대략의 자리를 잡는다. **참고값이다** — 묶고 나면
 * 경쟁률도 컷도 달라진다. 그래서 평균 하나로 줄이지 않고 학과별 값을 다 보여 준다.
 *
 * 지원한 전형과 같은 카테고리(교과/종합/논술/실기)만 모은다. 교과로 넣는 학생에게
 * 종합 컷을 보여 주면 없느니만 못하다.
 */
function bundled(s) {
  const wrap = el('div', 'detail-block');
  if (!s || !s.before) return wrap;
  const { type, parts, line } = s.before;

  wrap.appendChild(el('h3', '', `묶이기 전 학과 (${type || '통합'})`));

  const lead = s.linked
    ? `이 모집단위의 작년 입결이 따로 있습니다. 아래는 곁들여 보는 참고값입니다.`
    : `올해 새로 묶여 이 모집단위의 작년 입결이 없습니다. 아래를 참고로 봅니다.`;
  wrap.appendChild(el('p', 'hint', lead));

  const g = line.g70;
  const r = line.rate;
  wrap.appendChild(rowsBare([
    ['묶인 학과', `${parts.length}곳 · 값을 찾은 곳 ${line.found.length}곳`,
      line.missing.length ? `못 찾음 ${line.missing.length}곳` : ''],
    ['작년 70%컷', g ? `${g2(g.mid)} (${g2(g.lo)} ~ ${g2(g.hi)})` : null, `${line.year} · ${g ? g.n : 0}곳`],
    ['작년 경쟁률', r ? `${one(r.mid)}:1 (${one(r.lo)} ~ ${one(r.hi)})` : null, `${line.year} · ${r ? r.n : 0}곳`],
    ['전형', line.cat || '전부', line.cat ? '지원한 전형과 같은 것만' : '카테고리를 가리지 못했습니다'],
  ]));

  // 학과가 너무 많으면 그건 계열이 아니라 대학 전체다. 그렇게 적는다.
  if (parts.length > 12) {
    wrap.appendChild(el('p', 'hint',
      '묶인 학과가 많아 계열이라기보다 대학 전체 범위에 가깝습니다. 폭넓게만 보아 주세요.'));
  }

  const tw = el('div', 'tw');
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.appendChild((() => {
    const tr = document.createElement('tr');
    for (const t of ['묶이기 전 학과', '70%컷', '경쟁률', '모집']) tr.appendChild(el('th', null, t));
    return tr;
  })());
  const tbody = document.createElement('tbody');
  for (const f of line.found) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', null, f.dept));
    tr.appendChild(el('td', 'num', g2(f.g70) || '—'));
    tr.appendChild(el('td', 'num', f.rate != null ? `${one(f.rate)}:1` : '—'));
    tr.appendChild(el('td', 'num', f.quota != null ? String(f.quota) : '—'));
    tbody.appendChild(tr);
  }
  table.appendChild(thead);
  table.appendChild(tbody);
  tw.appendChild(table);
  wrap.appendChild(tw);

  if (line.missing.length) {
    wrap.appendChild(el('p', 'hint',
      `입결을 찾지 못한 학과 — ${line.missing.join(', ')}`));
  }
  return wrap;
}

/** rows() 와 같은 표지만 제목 없이. 이미 h3 를 쓴 구역 안에서 쓴다. */
function rowsBare(list) {
  const have = list.filter((x) => x && x[1] != null && x[1] !== '');
  const tw = el('div', 'tw');
  if (!have.length) return tw;
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  for (const [k, v, note] of have) {
    const tr = document.createElement('tr');
    tr.appendChild(el('th', 'rowhead', k));
    tr.appendChild(el('td', numeric(v) ? 'num' : null, String(v)));
    tr.appendChild(el('td', 'src', note || ''));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tw.appendChild(table);
  return tw;
}

/** 연도별 추이. 그래프 대신 표로 둔다 — 상담에서는 정확한 숫자를 읽는다. */
/**
 * 이 카드의 입결 숫자가 어느 전형에서 왔는지 한 줄로. match.js pickIpgyeol 의 결과를 옮긴다.
 * 「입결」이라고만 적으면 어느 전형인지 알 수 없어서 옆 전형의 컷과 구별이 안 된다.
 */
function ipgyeolSource(s) {
  if (!s || s.kind !== 'univ' || !s.linked) return '입결';
  switch (s.typeFit) {
    case 'exact': return `입결 · ${s.type}`;
    case 'near': return `입결 · ${s.type} · 이름이 조금 다르지만 같은 전형으로 봤습니다`;
    case 'cat': return `입결 · ${s.type} · 전형 이름은 못 맞추고 유형만 같습니다`;
    case 'only': return `입결 · ${s.type} · 이 학과 입결에 전형이 이것 하나뿐입니다`;
    case 'heir': return `입결 · ${s.type} · ${s.stale.was}에서 갈라져 나온 전형입니다`;
    default: return '입결 · 지원한 전형을 가려내지 못했습니다';
  }
}

function trend(s) {
  const wrap = el('div', 'detail-block');
  if (!s || !s.linked || !s.rows || !s.rows.length) return wrap;

  const tw = el('div', 'tw');
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  const th = (list) => {
    const tr = document.createElement('tr');
    for (const t of list) tr.appendChild(el('th', null, t));
    thead.appendChild(tr);
  };

  if (s.kind === 'college') {
    wrap.appendChild(el('h3', '', '3개년 추이'));
    th(['연도', '경쟁률', '평균등급', '최저등급']);
    const d = s.rows[0];
    [2026, 2025, 2024].forEach((year, i) => {
      const tr = document.createElement('tr');
      tr.appendChild(el('td', 'num', String(year)));
      tr.appendChild(el('td', 'num', d.comp[i] != null ? `${d.comp[i]}:1` : '—'));
      tr.appendChild(el('td', 'num', g2(d.avg[i]) || '—'));
      tr.appendChild(el('td', 'num', g2(d.min[i]) || '—'));
      tbody.appendChild(tr);
    });
  } else {
    /*
     * **전형으로 먼저 묶고, 그 안에서 연도순.**
     *
     * 연도순으로만 늘어놓으면 교과 3.58 · 종합 5.20 · 교과 3.62 처럼 서로 다른 잣대가
     * 번갈아 나와서 흐름이 안 읽힌다. 상담에서 보는 것은 「이 전형이 해마다 어떻게
     * 움직였나」이지 「2024년에 무슨 일이 있었나」가 아니다.
     *
     * 내가 넣은 전형을 맨 위에 둔다. 그게 지금 궁금한 것이다.
     */
    wrap.appendChild(el('h3', '', '연도별 추이'));
    th(['연도', '모집', '경쟁률', '70%컷', '50%컷']);

    /*
     * 묶는 일은 **match.js `typeGroups` 한 곳에서만** 한다. 카드 머리의 숫자를 고른
     * 것과 같은 함수다. 화면에서 따로 묶으면 표와 머리가 어긋나고, 어긋나도 아무 데도
     * 「어긋났다」고 안 적힌다.
     *
     * 화면에 적는 이름은 **가장 최근 해의 표기**를 쓴다. 올해 원서를 쓰는 사람에게는
     * 그게 지금 쓰이는 이름이다.
     */
    const groups = typeGroups(s.rows);
    // 「내가 넣은 전형」도 pickIpgyeol 이 가려 둔 것을 그대로 쓴다.
    const want = s.typeFit && s.typeFit !== 'none' ? (normType(s.type) || null) : null;
    const mine = want
      ? [...groups.keys()].find((k) => groups.get(k).keys.includes(want)) || null
      : null;
    const order = [...groups.keys()].sort((a, b) => {
      if (a === mine) return -1;
      if (b === mine) return 1;
      return groups.get(b).rows.length - groups.get(a).rows.length
        || groups.get(a).name.localeCompare(groups.get(b).name, 'ko');
    });

    for (const type of order) {
      const g = groups.get(type);
      const head = document.createElement('tr');
      head.className = 'group';
      const cell = el('th', 'gname', g.name);
      cell.colSpan = 5;
      if (type === mine) cell.appendChild(el('span', 'tag', '내가 넣은 전형'));
      // 해마다 이름이 달랐으면 그것도 적는다. 감추면 왜 묶였는지 알 수 없다.
      if (g.aliases.length) {
        cell.appendChild(el('span', 'alias', `예전 이름 ${g.aliases.join(' · ')}`));
      }
      head.appendChild(cell);
      tbody.appendChild(head);

      const rows = g.rows.slice().reverse();      // typeGroups 가 연도 오름차순으로 준다
      for (const row of rows) {
        const tr = document.createElement('tr');
        tr.appendChild(el('td', 'num', String(row.year)));
        tr.appendChild(el('td', 'num', row.quota != null ? String(row.quota) : '—'));
        tr.appendChild(el('td', 'num', row.rate != null ? `${row.rate}:1` : '—'));
        tr.appendChild(el('td', 'num', g2(row.g70) || '—'));
        tr.appendChild(el('td', 'num', g2(row.g50) || '—'));
        tbody.appendChild(tr);
      }
    }
  }
  table.appendChild(thead);
  table.appendChild(tbody);
  tw.appendChild(table);
  wrap.appendChild(tw);

  if (s.kind !== 'college') {
    wrap.appendChild(el('p', 'hint',
      '전형끼리는 잣대가 달라 견주지 않습니다. 같은 전형 안에서 해마다 어떻게'
      + ' 움직였는지를 봐 주세요. 입결 쪽 전형 이름이 즐겨찾기와 다를 수 있습니다.'));
  }
  return wrap;
}

/**
 * 어림해 본 것 — **잰 값과 갈라 둔다.**
 *
 * 위쪽(견준 해·움직인 폭·모집인원·두 컷 사이 위치)은 자료를 그대로 센 값이고,
 * 여기는 두 분위점으로 분포를 **가정해서** 낸 값이다. 같은 표에 섞어 놓으면 어디까지가
 * 자료이고 어디부터가 어림인지 구별이 안 된다. 상담에서 그 차이가 제일 중요하다.
 *
 * 「합격 확률」이라 적지 않는다. 이건 **작년 합격자들 사이에서 내가 어디쯤인가**다.
 * 올해 붙을 확률과는 다른 값이고, 그걸 낼 자료는 이 도구에 없다.
 */
function estimate(c) {
  const wrap = el('div', 'est');
  if (!c.est) return wrap;

  wrap.appendChild(el('h4', '', '어림해 보면'));

  const head = el('p', 'est-head');
  if (c.call) {
    head.appendChild(el('span', `call call-${c.call.key}`, c.call.label));
    if (c.call.shaky) head.appendChild(el('span', 'call call-shaky', '변동 큼'));
  }
  head.appendChild(el('span', 'lv', pctText(c.est.pct)));
  wrap.appendChild(head);
  // 위의 「내 위치」와 잣대가 다르다. 다르다는 것을 적어 둔다.
  wrap.appendChild(el('p', 'hint',
    `${c.est.years.join(' · ')} 두 해를 평균 내서 봤습니다.`
    + ' 맨 위 「내 위치」는 가장 최근 한 해만 본 값이라 서로 다를 수 있습니다.'));

  const list = [];
  list.push(['작년 합격자 중 내 자리', `상위 ${Math.round(c.est.pct)}%`,
    `${c.est.years.join(' · ')} 두 해 평균 · 정규근사`]);
  if (c.pred) {
    list.push(['올해 컷은 이쯤일까', `${g2(c.pred.lo)} ~ ${g2(c.pred.hi)}`,
      `가운데 ${g2(c.pred.center)} · 변동 ${c.pred.vola} · ${c.pred.n}개 해`]);
    if (c.pred.rebound) {
      list.push(['되돌림을 봤습니다',
        `작년에 ${Math.abs(c.pred.rebound.jump).toFixed(2)}등급 움직였습니다`,
        '크게 뛴 다음 해는 절반쯤 되돌아옵니다']);
    }
  }
  wrap.appendChild(rowsBare(list));

  const note = el('p', 'hint');
  note.appendChild(el('b', null, '이건 출발점이지 결론이 아닙니다. '));
  note.appendChild(document.createTextNode(
    '등급50(가운데)과 등급70(상위 70% 지점) 두 점으로 합격자 분포를 정규분포라 치고'
    + ' 잰 값입니다. ① 최종등록자 기준이라 추가합격 막차는 더 낮습니다'
    + ' ② 정규분포는 어디까지나 근사라 적게 뽑는 학과는 오차가 큽니다'
    + ' ③ 대학마다 반영교과가 달라 그 차이는 안 들어 있습니다.'
    + (c.est.weak ? ' 이 학과는 50%컷이 없어 전체 중앙값으로 때웠습니다 — 더 성깁니다.' : '')));
  wrap.appendChild(note);
  return wrap;
}

/**
 * 이 컷을 얼마나 믿을 수 있나.
 *
 * **p값이나 신뢰구간은 적지 않는다.** 입결은 대학이 공개한 요약값(70%컷 하나,
 * 50%컷 하나)이라 합격자 개개인의 점수가 없다. 개별 값이 없으면 분산을 모르고,
 * 분산을 모르면 검정도 신뢰구간도 만들 수 없다. 그 자리에 숫자를 놓으면 계산이
 * 아니라 지어내기다.
 *
 * 대신 정말 셀 수 있는 것을 적는다 — 해마다 얼마나 움직였나, 몇 명을 뽑나,
 * 어느 쪽으로 가고 있나, 내 점수가 어디쯤인가.
 */
function howSure(s, mine) {
  const wrap = el('div', 'detail-block');
  const c = confidence(s, mine, normType);
  if (!c) return wrap;

  wrap.appendChild(el('h3', '', '이 컷을 어떻게 읽나'));

  /*
   * **내 위치를 맨 위에 둔다.** 상담에서 처음 묻는 것이 그것이다 — 「이 학생이
   * 어디쯤인가」. 예전에는 표 맨 아랫줄에 있어서, 위의 흔들림 이야기를 다 읽고
   * 나서야 나왔다.
   *
   * 다만 **「상향」·「적정」이라 적지 않는다.** 그 말은 합격 가능성을 숫자로 말하는
   * 셈인데, 입결은 요약값(70%컷 하나, 50%컷 하나)이라 그걸 낼 자료가 없다.
   * 두 컷 사이일 때만 「상위 몇 % 언저리」를 말하고, 밖이면 밖이라고만 적는다.
   * 상향인지 적정인지는 이 값들을 보고 사람이 정한다.
   */
  if (c.spot) {
    const where = c.spot.where === 'above' ? 'in' : c.spot.where === 'below' ? 'out' : 'mid';
    const p = el('p', `spot spot-${where}`);
    p.appendChild(el('span', 'lv', c.spot.text));
    /*
     * **어느 해를 보고 한 말인지 적는다.** 이건 가장 최근 한 해의 두 컷만 보고
     * 잰 값이고, 아래 「어림해 보면」은 최근 두 해를 평균 낸 값이다. 그래서 한쪽이
     * 「70%컷 밖」인데 다른 쪽이 「상위 61%」로 나오는 일이 생긴다. 어긋난 게 아니라
     * 잣대가 다른 것인데, 안 적어 두면 둘 다 못 믿게 된다.
     */
    if (c.swing && c.swing.years.length) {
      p.appendChild(el('span', 'tr', `${c.swing.years[c.swing.years.length - 1]} 한 해만 보고 잰 값`));
    }
    wrap.appendChild(p);
  }



  const tone = c.evidence === 'one-year' && c.level !== 'thin' ? 'unknown' : c.level;
  const badge = el('p', `sure sure-${tone}`);
  badge.appendChild(el('span', 'lv', c.label));
  if (c.lack) badge.appendChild(el('span', 'tr', c.lack));
  if (c.trend) badge.appendChild(el('span', 'tr', c.trend));
  wrap.appendChild(badge);

  const sw = c.swing;
  const rows2 = [];
  if (sw) {
    rows2.push(['견준 해', `${sw.years.join(' · ')} (${sw.n}개)`, '입결']);
    rows2.push(['70%컷 범위', `${g2(sw.lo)} ~ ${g2(sw.hi)}`,
      `가장 최근 ${g2(sw.latest)}`]);
    if (sw.span != null) rows2.push(['움직인 폭', `${sw.span.toFixed(2)}등급`, '']);
    if (sw.sd != null) rows2.push(['표준편차', sw.sd.toFixed(2), `${sw.n}개 표본`]);
  }
  if (c.thin && c.thin.quota != null) {
    rows2.push(['모집 인원', `${c.thin.quota}명`, `70%컷은 대략 ${c.thin.at}번째 사람`]);
  }
  // 내 위치는 맨 위 띠에 이미 있다. 잣대만 여기 한 줄로 남긴다.
  if (c.spot && c.spot.where === 'between') {
    rows2.push(['위치를 잰 법', '50%컷과 70%컷 사이를 나눠 봤습니다', '두 컷 사이일 때만']);
  }
  wrap.appendChild(rowsBare(rows2));

  if (c.why.length) {
    const ul = el('ul', 'sure-why');
    for (const w of c.why) {
      const li = document.createElement('li');
      li.textContent = w;
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }

  // **근거를 먼저, 어림을 나중에.** 판정을 먼저 보면 그 아래 숫자를 판정의
  // 뒷받침으로 읽게 된다. 순서를 뒤집으면 숫자를 보고 판정을 의심할 수 있다.
  wrap.appendChild(estimate(c));

  wrap.appendChild(el('p', 'hint',
    '유의확률(p값)이나 신뢰구간은 내지 않습니다. 입결은 대학이 공개한 요약값이라'
    + ' 합격자 한 사람 한 사람의 점수가 없고, 그것 없이는 계산할 수 없는 값입니다.'));
  return wrap;
}

const STAGE1 = ['', '합격', '불합격'];
/*
 * **「미등록」은 최종 칸에 두지 않는다.** 붙고 나서 안 간 것이라 합격은 합격이고,
 * 안 간 것은 옆 「등록」 칸이 말한다. 최종 칸에 넣으면 stats.js 가 합격으로도
 * 불합격으로도 못 세어 통계에서 통째로 빠지고, 보고서에는 「알아보지 못한 표기」로 뜬다.
 *
 * 1단계도 여기 두지 않는다. 왼쪽에 「1단계」 칸이 따로 있다.
 */
const FINAL = ['', '최초합격', '충원합격', '불합격'];

/**
 * 결과 — **주로 학생이 적고 선생님은 확인한다.**
 *
 * 121명 × 여섯 칸이면 700건이라 담임이 다 칠 수 없고, 합격자 발표는 학생이 대학
 * 홈페이지에서 먼저 본다. 예비번호는 더 그렇다 — 학생은 하루에도 몇 번씩 본다.
 *
 * 그래서 이 화면의 주된 단추는 「맞습니다」다. 고칠 일이 있을 때만 칸을 만진다.
 * 학생이 못 적는 것(불합격 사유 같은)은 여기서만 적는다.
 *
 * 적은 값은 즐겨찾기 값 **위에** 덮인다. 칸을 비우고 저장하면 도로 즐겨찾기 값이 된다.
 */
function result(app) {
  const wrap = el('div', 'detail-block');
  wrap.appendChild(el('h3', '', '결과'));

  const r = store.resultOf(app);
  const alertBox = el('p', 'note error');
  alertBox.hidden = true;
  wrap.appendChild(alertBox);

  const form = el('div', 'res');
  const fields = {};

  const pick = (key, label, options) => {
    const box = el('label', 'res-f');
    box.appendChild(el('span', 'k', label));
    const sel = document.createElement('select');
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o || '—';
      if ((r[key] || '') === o) opt.selected = true;
      sel.appendChild(opt);
    }
    // 즐겨찾기가 준 표기가 목록에 없으면 그것도 넣어 준다. 버리면 안 된다.
    if (r[key] && !options.includes(r[key])) {
      const opt = document.createElement('option');
      opt.value = r[key];
      opt.textContent = r[key];
      opt.selected = true;
      sel.appendChild(opt);
    }
    box.appendChild(sel);
    fields[key] = sel;
    form.appendChild(box);
  };

  const text = (key, label, placeholder) => {
    const box = el('label', 'res-f');
    box.appendChild(el('span', 'k', label));
    const input = document.createElement('input');
    input.type = 'text';
    input.value = r[key] || '';
    input.placeholder = placeholder || '';
    box.appendChild(input);
    fields[key] = input;
    form.appendChild(box);
  };

  pick('stage1', '1단계', STAGE1);
  pick('final', '최종', FINAL);
  text('waitNo', '예비번호', '예) 7');
  pick('enrolled', '등록', ['', '등록', '미등록']);
  text('reason', '불합격 사유', '예) 수능최저 미충족');
  wrap.appendChild(form);

  const bar = el('div', 'res-bar');
  const from = el('span', 'hint', r.pending
    ? `학생이 적었습니다${r.at ? ` · ${String(r.at).slice(0, 10)}` : ''} — 확인해 주세요`
    : (r.edited
      ? `확인된 값입니다${r.at ? ` · ${String(r.at).slice(0, 10)}` : ''}`
      : (r.final || r.stage1 ? '즐겨찾기에서 온 값입니다' : '아직 결과가 없습니다')));
  bar.appendChild(from);

  // 학생이 적은 것은 대개 맞다. 고치는 것보다 확인하는 쪽이 훨씬 잦으니 한 번에 되게 둔다.
  if (r.pending) {
    const ok = el('button', 'btn', '맞습니다');
    ok.type = 'button';
    ok.onclick = async () => {
      ok.disabled = true;
      try {
        await store.approveResult(app);
      } catch (err) {
        alertBox.textContent = `확인하지 못했습니다 — ${err.message}`;
        alertBox.hidden = false;
        ok.disabled = false;
      }
    };
    bar.insertBefore(ok, bar.firstChild);
    bar.classList.add('three');
  }

  const save = el('button', 'btn btn-primary', '결과 저장');
  save.type = 'button';
  save.onclick = async () => {
    save.disabled = true;
    alertBox.hidden = true;
    try {
      await store.setResult(app, {
        stage1: fields.stage1.value, final: fields.final.value,
        waitNo: fields.waitNo.value.trim(), enrolled: fields.enrolled.value,
        reason: fields.reason.value.trim(),
      });
    } catch (err) {
      alertBox.textContent = `결과를 저장하지 못했습니다 — ${err.message}`;
      alertBox.hidden = false;
    } finally {
      save.disabled = false;
    }
  };
  bar.appendChild(save);
  wrap.appendChild(bar);
  return wrap;
}

/**
 * 상담 메모. 여기서 적어 두어야 나중에 진학 대장을 뽑을 때 쓸 것이 남는다.
 * 「학생도 보게」에 표시하면 그 학생 링크에도 같은 메모가 뜬다. 기본은 선생님만 본다.
 */
function memo(app, student) {
  const wrap = el('div', 'detail-block memo');
  wrap.appendChild(el('h3', '', '상담 메모'));

  // 실패를 조용히 넘기지 않는다. 창을 띄우는 대신 이 자리에 남긴다.
  const alertBox = el('p', 'note error');
  alertBox.hidden = true;
  const say = (text) => { alertBox.textContent = text; alertBox.hidden = false; };
  wrap.appendChild(alertBox);

  const list = store.notesOf(app.hak, app.id);
  if (list.length) {
    const ul = el('ul', 'memo-list');
    for (const n of list) {
      const li = document.createElement('li');
      li.appendChild(el('p', 'memo-text', n.text));
      const foot = el('p', 'memo-foot');
      foot.appendChild(el('span', '', [
        String(n.at || '').slice(0, 10),
        n.by || '',
        String(n.visible) === 'Y' ? '학생도 봄' : '선생님만',
      ].filter(Boolean).join(` ${MID} `)));
      const del = el('button', 'btn', '지우기');
      del.type = 'button';
      del.onclick = async () => {
        del.disabled = true;
        try {
          await store.removeNote(n.noteId);
        } catch (err) {
          say(`메모를 지우지 못했습니다 — ${err.message}`);
          del.disabled = false;
        }
      };
      foot.appendChild(del);
      li.appendChild(foot);
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  } else {
    wrap.appendChild(el('p', 'hint', '아직 적어 둔 메모가 없습니다.'));
  }

  const form = el('div', 'memo-new');
  const ta = document.createElement('textarea');
  ta.rows = 2;
  ta.placeholder = `${student ? student.name + ' 학생과' : ''} 이 전형에 대해 나눈 이야기`.trim();
  ta.setAttribute('aria-label', '상담 메모');
  form.appendChild(ta);

  const bar = el('div', 'memo-bar');
  const share = document.createElement('label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  share.appendChild(cb);
  share.appendChild(el('span', '', '학생도 보게'));
  bar.appendChild(share);

  const save = el('button', 'btn btn-primary', '메모 저장');
  save.type = 'button';
  save.onclick = async () => {
    if (!ta.value.trim()) { ta.focus(); return; }
    save.disabled = true;
    try {
      await store.addNote(app.hak, app.id, ta.value, cb.checked);
      ta.value = '';
    } catch (err) {
      say(`메모를 저장하지 못했습니다 — ${err.message}`);
    } finally {
      save.disabled = false;
    }
  };
  bar.appendChild(save);
  form.appendChild(bar);
  wrap.appendChild(form);
  return wrap;
}
