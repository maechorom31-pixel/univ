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
import { realRate } from './match.js';

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

const DATE_KINDS = ['면접', '실기', '논술', '적성', '1단계발표', '최종발표', '모의면접'];

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

  /* 2. 인원과 경쟁률 */
  const quotaNow = s.quotaNow;
  const quotaPrev = s.quotaPrev;
  const diff = quotaNow != null && quotaPrev != null ? quotaNow - quotaPrev : null;
  const real = s.real;

  body.appendChild(rows('인원과 경쟁률', [
    ['올해 모집 인원', quotaNow != null
      ? `${quotaNow}명${diff ? ` (작년 ${quotaPrev}명, ${diff > 0 ? '+' : ''}${diff})` : ''}`
      : app.quotaText || null, '즐겨찾기 + 모집요강'],
    ['작년 모집 인원', !diff && quotaPrev != null ? `${quotaPrev}명` : null, '모집요강'],
    ['작년 경쟁률', s && s.rate != null ? `${s.rate}:1` : null, isCollege ? '전문대 자료' : '입결'],
    ['작년 실질 경쟁률', real.value != null ? `${one(real.value)}:1` : null,
      real.why || '명목 × 모집 ÷ (모집 + 추합)'],
    ['작년 추가 합격', mo && mo.filled26 != null ? `${mo.filled26}명` : null, '모집요강'],
    ['충원율', isCollege && s.linked && s.rows[0] && s.rows[0].fill != null
      ? `${Math.round(s.rows[0].fill)}%` : null, '전문대 자료'],
  ]));

  /* 3. 성적 — 내 성적과 작년 결과를 나란히. 빼지 않고 그대로 둔다. */
  const naesin = (student && student.naesin) || {};
  const mine = app.myScore || {};
  body.appendChild(rows('성적', [
    ['내 전교과', g2(naesin['전교과'] ?? naesin['전교과(100)']), '즐겨찾기'],
    ['내 환산 등급', g2(mine.grade), '즐겨찾기'],
    ['내 환산 점수', mine.score != null ? String(mine.score) : null, '즐겨찾기'],
    isCollege
      ? ['작년 평균 등급', g2(s.avg), '전문대 자료']
      : ['작년 70% 컷', g2(s && s.cut), '입결'],
    isCollege
      ? ['작년 최저 등급', g2(s.cut), '전문대 자료']
      : ['작년 50% 컷', g2(s && s.cut50), '입결'],
  ]));

  /* 4. 일정 — 없는 항목도 「모집요강 확인」으로 남긴다. 빠뜨리는 것이 더 위험하다. */
  const sched = [];
  for (const kind of DATE_KINDS) {
    const d = store.dateOf(app, kind);
    if (!d) continue;
    const from = d.status === 'pending' ? '학생 입력 · 확인 대기'
      : d.status === 'confirmed' ? '선생님 확정'
        : d.fixed ? '즐겨찾기' : '즐겨찾기 · 기간';
    sched.push([kind, span(d), from]);
  }
  if (mo && mo.exam) {
    sched.push(['대학별 고사', mo.exam + (mo.examWhen ? ` ${MID} ${mo.examWhen}` : ''), '모집요강']);
  }
  sched.push(['등록 마감', null, '모집요강 확인']);
  sched.push(['미등록 충원 발표', null, '모집요강 확인']);
  body.appendChild(rows('일정', sched));

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

  /* 9. 연도별 추이 */
  body.appendChild(trend(s));

  /* 10. 결과 — 발표가 나기 시작하면 채워진다 */
  const r = app.result || {};
  if (r.final || r.stage1 || r.waitNo || r.enrolled) {
    body.appendChild(rows('결과', [
      ['1단계', r.stage1, '즐겨찾기'],
      ['최종', r.final, '즐겨찾기'],
      ['사유', r.reason, '즐겨찾기'],
      ['최초 후보 순위', r.waitNo, '즐겨찾기'],
      ['등록 여부', r.enrolled, '즐겨찾기'],
    ]));
  }

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
    wrap.appendChild(el('h3', '', '연도별 추이'));
    th(['연도', '전형', '모집', '경쟁률', '70%컷', '50%컷']);
    for (const row of s.rows) {
      const tr = document.createElement('tr');
      tr.appendChild(el('td', 'num', String(row.year)));
      tr.appendChild(el('td', null, row.type || '—'));
      tr.appendChild(el('td', 'num', row.quota != null ? String(row.quota) : '—'));
      tr.appendChild(el('td', 'num', row.rate != null ? `${row.rate}:1` : '—'));
      tr.appendChild(el('td', 'num', g2(row.g70) || '—'));
      tr.appendChild(el('td', 'num', g2(row.g50) || '—'));
      tbody.appendChild(tr);
    }
  }
  table.appendChild(thead);
  table.appendChild(tbody);
  tw.appendChild(table);
  wrap.appendChild(tw);

  if (s.kind !== 'college') {
    wrap.appendChild(el('p', 'hint',
      '같은 학과의 여러 전형이 함께 나옵니다. 내가 넣은 전형과 이름이 다를 수 있습니다.'));
  }
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
