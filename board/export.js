/**
 * 내보내기 — 진학 대장 · 지원 결과 보고서 (P7)
 * =====================================================================
 * 해마다 만드시는 두 문서가 이 화면의 목적이다. **학교가 쓰던 서식이 이미 있다.**
 * 그 서식대로 나와야 결재로 올라가고 다음 해 자료로 쌓인다. 그래서 이 화면은
 * 보기 좋은 표를 새로 짓지 않고 예년 문서의 생김새를 그대로 따른다.
 *
 *   진학 대장       A4 **가로**. 반 단위로 이어 싣는다. 학생 한 명이 네 줄짜리
 *                   덩어리이고, 지원 한 건이 세로 한 칸이다 (대학 / 학과(모집인원)
 *                   / 전형 / 결과). 왼쪽에 반·번호·성명·내신·수능등급, 오른쪽에
 *                   등록 대학과 특이사항이 그 덩어리에 걸쳐 붙는다.
 *   지원 결과 보고서 A4 세로. 1부는 올해와 지난 3개년을 나란히 놓은 통계,
 *                   2부는 대학 묶음별 지원 명단이다.
 *
 * 지난 연도 숫자는 보드에 없다 — 보드는 올해 지원만 든다. 그래서 작년 보고서에서
 * 떠 온 `data/report_history.json` 을 얹는다 (scripts/build_report_history.py).
 *
 * 둘 다 화면에 먼저 그리고 그대로 인쇄한다. 화면과 종이가 다른 것을 보여 주면
 * 어느 쪽이 맞는지 확인하느라 시간이 든다.
 *
 * 한글(HWPX)로 바로 뽑지는 못한다 — 브라우저가 만들 수 있는 형식이 아니다.
 * 대신 세 갈래를 둔다.
 *   인쇄        →  A4 PDF. 그대로 결재 올리거나 나눠 준다
 *   표 복사     →  탭으로 나뉜 글. 한글·엑셀에 붙이면 **표로** 들어간다
 *   CSV 내려받기 →  다른 도구로 넘길 원자료
 */
import * as store from './store.js';
import * as stats from './stats.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const tidy = (s) => String(s || '').replace(/ (?=[^ ]{1,4}$)/, ' ');
const g2 = (n) => (n == null || n === '' ? '—' : Number(n).toFixed(2));
const p1 = (n) => (n == null ? '—' : `${Number(n).toFixed(1)}%`);
const shortUniv = (s) => String(s || '').replace(/\s*[-–—]\s*.*$/, '');
/**
 * 줄이 갈려야 한다면 괄호 앞에서 갈리게 한다.
 *
 * 칸이 좁아 두 줄이 되는 것 자체는 어쩔 수 없지만, 「한국외국어대 / 대학교(서울)」
 * 처럼 낱말 한가운데서 갈리면 대학 이름으로 안 읽힌다. 폭이 없는 공백을 괄호
 * 앞에 끼워 그 자리를 먼저 쓰게 한다.
 */
const brk = (s) => String(s || '').replace(/(?=[（(])/g, '\u200B');

/** 문서에 찍는 날짜는 뽑은 날이다. 결재 문서라 언제 기준인지가 곧 근거다. */
function today() {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(),
    dow: ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] };
}
const stampDot = () => { const t = today(); return `${t.y}. ${t.m}. ${t.d}.`; };
const stampFull = () => { const t = today(); return `${t.y}.${String(t.m).padStart(2, '0')}.${String(t.d).padStart(2, '0')}.(${t.dow})`; };

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** 2026-09-04 → 9/4(금). 대장은 종이라 자리를 아껴야 한다. */
function day(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return String(iso || '');
  return `${m}/${d}(${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

let view = 'ledger';        // 'ledger' | 'report'
let notice = '';

/**
 * 지난 3개년 숫자. 보드에는 올해 지원만 들어 있어서 예년 칸을 채울 수가 없다.
 * 작년 보고서에서 떠 온 정적 자료를 얹는다. 없으면 올해 칸만 나온다.
 */
let history = null;      // 지난해 지원 결과 보고서에서 뽑은 집계
const YEAR = () => (history && history.years && history.years.length
  ? history.years[0] + 1 : 2027);

async function loadJson(path) {
  try {
    const res = await fetch(path);
    return res.ok ? await res.json() : null;
  } catch {
    return null;          // 없으면 올해 것만 그린다
  }
}

async function loadHistory() {
  history = await loadJson('data/report_history.json');
  _index = null;
}

export function start() {
  store.on('change', render);
  loadHistory().then(render);
  render();
}

function render() {
  const main = $('#export');
  if (!main || main.hidden) return;
  main.textContent = '';

  if (!store.state.ready) {
    main.appendChild(el('p', 'empty-state', '자료를 불러오는 중입니다.'));
    return;
  }

  main.appendChild(chooser());
  if (notice) main.appendChild(el('p', 'note', notice));
  const VIEW = { ledger, report, status, final: finalReport };
  main.appendChild((VIEW[view] || ledger)());
  // 그려 놓고 나서 대장의 지원 칸이 실제로 들어갔는지 재고, 넘치면 줄인다
  fitLedger(main);
}

function chooser() {
  const box = el('div', 'tabs');
  for (const [key, label] of [['ledger', '진학 대장'], ['report', '지원 결과 보고서'],
    ['status', '합격자 발표 현황'], ['final', '최종 결과 보고서']]) {
    const b = el('button', 'btn', label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(view === key));
    b.onclick = () => { view = key; notice = ''; render(); };
    box.appendChild(b);
  }
  return box;
}

/* ── 나가는 길 ─────────────────────────────────────────────────── */

/**
 * 인쇄 · 표 복사 · CSV.
 *
 * 표 복사는 탭으로 나눈다. 한글과 엑셀 모두 탭을 칸 구분으로 읽어서, 붙여 넣으면
 * 문자열이 아니라 **표**가 된다. 한글 파일을 직접 만들지 못하는 것을 이걸로 메운다.
 */
function tools(name, table) {
  const box = el('div', 'tabs');

  const print = el('button', 'btn btn-primary', '인쇄 (A4)');
  print.type = 'button';
  print.onclick = () => window.print();
  box.appendChild(print);

  if (table) {
    const copy = el('button', 'btn', '표 복사 (한글·엑셀)');
    copy.type = 'button';
    copy.onclick = async () => {
      const text = table().map((r) => r.join('\t')).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        notice = '복사했습니다. 한글이나 엑셀에 붙여 넣으면 표로 들어갑니다.';
      } catch (err) {
        notice = '복사가 막혀 있습니다. CSV로 내려받아 주세요.';
      }
      render();
    };
    box.appendChild(copy);

    const csv = el('button', 'btn', 'CSV 내려받기');
    csv.type = 'button';
    csv.onclick = () => download(`${name}.csv`, toCsv(table()));
    box.appendChild(csv);
  }
  return box;
}

/** 엑셀이 한글을 깨뜨리지 않도록 BOM 을 앞에 붙인다. */
function toCsv(rows) {
  const cell = (v) => {
    const s = String(v == null ? '' : v);
    return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── 진학 대장 ──────────────────────────────────────────────────── */

/**
 * 대장에 실을 지원 — **6칸에 넣은 것만.**
 *
 * 대장은 실제로 원서를 낸 기록이다. 후보로 올려 두었거나 보관해 둔 것은
 * 상담 중에 견주던 것이지 지원한 것이 아니라, 함께 실으면 대장이 지원
 * 내역이 아니라 고민 목록이 된다. 차례는 6칸에 넣은 순서 그대로다.
 */
function ordered(hak) {
  return store.appsOf(hak)
    .map((a) => ({ a, p: store.placementOf(a.id) }))
    .filter(({ p }) => p.slot === 'rank')
    .sort((x, y) => (x.p.rank || 99) - (y.p.rank || 99)
      || String(x.a.univ).localeCompare(String(y.a.univ), 'ko'))
    .map(({ a }) => a);
}

/** 예년 서식의 지원 칸 수. 수시는 여섯 장이라 여섯이다. */
const LEDGER_SLOTS = 6;

/** 한 학생의 네 줄. 위에서부터 대학 / 학과(모집인원) / 전형 / 결과. */
const LEDGER_LINES = ['univ', 'dept', 'type', 'result'];

function ledgerCell(app, line) {
  if (!app) return '';
  if (line === 'univ') return brk(shortUniv(app.univ));
  if (line === 'dept') {
    // 예년 서식은 학과 뒤에 괄호로 모집인원을 적는다. 원문에 괄호가 이미
    // 있으면(정원 외를 뜻한다) 그대로 두고, 숫자만 있으면 괄호를 씌운다.
    const raw = String(app.quotaText || '').trim();
    const q = raw ? (/^\(.*\)$/.test(raw) ? raw : `(${raw})`)
      : (app.quota != null ? `(${app.quota})` : '');
    return brk(`${app.dept || ''}${q}`);
  }
  if (line === 'type') return app.typeSub || app.typeName || '';
  return resultText(store.resultOf(app));
}

/*
 * **긴 것만 글자를 줄인다 — 세어 보지 말고 재 본다.**
 *
 * 지원 칸은 예년 대장 실측으로 한 칸 30mm 다. 9pt 한글은 한 자 3.2mm 쯤이라
 * 아홉 자면 찬다. 「한국외국어대학교(서울)」·「종합(KU자기추천)」은 그걸 넘어
 * 괄호 앞에서 두 줄로 갈렸다 — 낱말이 깨지진 않지만 줄 높이가 칸마다 달라져
 * 표가 들쭉날쭉해진다.
 *
 * 표 전체를 8pt 로 낮추면 짧은 칸까지 다 작아져 종이가 읽기 힘들어진다.
 * **넘치는 칸만** 낮춘다. 특이사항 칸을 21.4% → 15.4% 로 줄여 그 몫을 지원
 * 여섯 칸에 나눠 주고(9.6% → 10.5%), 그러고도 넘치는 칸만 한 단계씩 줄인다.
 *
 * 글자 수로 어림하다가 그만뒀다. 「종합(SSU미래인재)」는 여덟 자 반이라 세어
 * 보면 넉넉한데 실제로는 2px 남기고 겨우 들어갔다 — 로마자·괄호 폭이 글꼴마다
 * 다르기 때문이다. 선생님 컴퓨터의 글꼴이 조금만 넓어도 어긋난다.
 * **그려 놓고 실제 폭을 재서** 넘치는 것만 줄인다. 그러면 글꼴이 무엇이든 맞는다.
 */
const FIT_SLACK = 2;                       // 이만큼은 남아야 「들어갔다」고 본다
const FIT_STEPS = ['tight', 'tighter'];    // 한 단계씩 줄여 본다

/**
 * 넘치는 칸을 골라낸다 — **읽기만 하고 쓰지 않는다.**
 *
 * 칸마다 `white-space` 를 넣었다 뺐다 하면 칸 하나에 배치 계산이 두 번씩 돈다.
 * 한 반이 30명, 한 명이 여섯 장이면 지원 칸만 700개가 넘고 한 학년이면 그 여섯
 * 배다. 표에 `measuring` 을 한 번 걸어 모든 칸을 한 줄로 붙잡아 놓고 재면
 * 배치 계산이 한 번으로 끝난다.
 */
function overflowing(table, cells) {
  table.classList.add('measuring');
  const range = document.createRange();
  const out = cells.filter((td) => {
    const cs = getComputedStyle(td);
    const room = td.clientWidth
      - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - FIT_SLACK;
    range.selectNodeContents(td);
    return range.getBoundingClientRect().width > room;
  });
  table.classList.remove('measuring');
  return out;
}

/**
 * 그린 뒤에 부른다. 배치가 잡혀 있어야 폭을 잴 수 있다.
 * 넘치는 칸만 한 단계 줄이고, 그러고도 넘치면 한 단계 더 줄인다.
 */
function fitLedger(root) {
  for (const table of root.querySelectorAll('table.ledger')) {
    let cells = [...table.querySelectorAll('td.slot')]
      .filter((td) => td.textContent.trim());
    for (const td of cells) td.classList.remove(...FIT_STEPS);
    for (const step of FIT_STEPS) {
      cells = overflowing(table, cells);
      if (!cells.length) break;
      for (const td of cells) td.classList.add(step);
    }
  }
}

/**
 * 결과 한 줄.
 *
 * 1단계는 **떨어졌을 때만** 적는다. 통과한 것까지 적으면 「합격 · 불합격」이 되어
 * 무엇이 합격이고 무엇이 불합격인지 종이에서 읽히지 않는다.
 */
function resultText(r) {
  const s1 = String((r && r.stage1) || '');
  /*
   * 1단계에서 떨어졌으면 최종은 당연히 불합격이다. 「1단계 탈락 · 불합격」은
   * 같은 말을 두 번 하면서 칸만 두 줄로 만든다.
   */
  if (/불합격|탈락/.test(s1)) return '1단계 탈락';

  /*
   * **곁가지는 괄호에 넣는다.** 「충원합격 · 예비 7」은 좁은 칸에서
   * 「충원합격 · 예비」 / 「7」로 갈려 숫자만 아랫줄에 떨어졌다. 괄호로 묶고
   * 공백을 빼면 갈릴 자리가 없어진다 — 「충원합격(예비7)」.
   */
  const head = r && r.final ? String(r.final) : '';
  const notes = [];
  if (r && r.reason) notes.push(String(r.reason).replace(/^수능/, ''));
  if (r && r.waitNo) notes.push(`예비${r.waitNo}`);
  if (r && r.enrolled) notes.push(String(r.enrolled));
  if (!head) return notes.join(' · ');
  return notes.length ? `${head}(${notes.join(' · ')})` : head;
}

/** 합격했나 — 결과 칸을 굵게 할지 정한다. */
function isPass(app) {
  const v = stats.verdict(app ? { ...app, result: store.resultOf(app) } : {});
  return !!(v && v.passed);
}

/** 등록한 대학. 예년 서식의 「등록 대학」 칸은 대학과 학과를 두 줄로 적는다. */
function enrolledOf(hak) {
  for (const app of ordered(hak)) {
    const r = store.resultOf(app);
    if (r && r.enrolled) return { univ: shortUniv(app.univ), dept: app.dept || '' };
  }
  return null;
}

const gradeOfClass = (list) => (list[0] && list[0].grade) || 3;

function naesinOf(student) {
  const n = student.naesin || {};
  const v = n['전교과'] ?? n['전교과(100)'];
  return v == null ? '' : Number(v).toFixed(2);
}

function ledger() {
  const box = el('div');
  const { cls } = store.selection;
  const students = store.studentsOf(cls);

  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', cls ? `${cls}반 진학 대장` : '학년 전체 진학 대장'));
  head.appendChild(el('span', 'count num', `${students.length}명`));
  box.appendChild(head);

  box.appendChild(el('p', 'section-label',
    '예년 서식대로 A4 가로로 나옵니다. 반이 바뀌면 쪽이 갈립니다.'
    + ' 왼쪽에서 반을 고르면 그 반만 나옵니다.'));

  box.appendChild(tools(cls ? `${cls}반_진학대장` : '진학대장', () => {
    const rows = [['반', '번호', '성명', '내신성적(전과목)',
      '대학', '학과(모집인원)', '전형', '결과', '등록 대학', '특이사항']];
    for (const s of students) {
      const enr = enrolledOf(s.hak);
      const memo = store.notesOf(s.hak).map((n) => n.text).join(' / ');
      for (const app of ordered(s.hak)) {
        rows.push([s.cls, s.no, s.name, naesinOf(s),
          ledgerCell(app, 'univ'), ledgerCell(app, 'dept'),
          ledgerCell(app, 'type'), ledgerCell(app, 'result'),
          enr ? `${enr.univ} ${enr.dept}` : '', memo]);
      }
    }
    return rows;
  }));

  if (!students.length) {
    box.appendChild(el('p', 'empty-state', '이 반에 학생이 없습니다.'));
    return box;
  }

  // 반이 섞여 있으면 반마다 쪽을 가른다. 예년 대장이 그렇게 묶여 있다.
  const byCls = new Map();
  for (const s of students) {
    if (!byCls.has(s.cls)) byCls.set(s.cls, []);
    byCls.get(s.cls).push(s);
  }
  const sheets = el('div', 'sheets');
  for (const [name, list] of byCls) sheets.appendChild(ledgerSheet(name, list));
  box.appendChild(sheets);
  return box;
}

/** 반 하나. 인쇄에서 A4 가로 한 장 이상이 된다. */
function ledgerSheet(cls, students) {
  const page = el('section', 'sheet sheet-land');
  page.appendChild(el('h2', 'sheet-title',
    `${YEAR()}학년도 대학 진학 대장(수시) ${gradeOfClass(students)}-${cls}`));
  page.appendChild(el('p', 'sheet-stamp', `${stampDot()} 기준`));

  const tw = el('div', 'tw');
  const table = document.createElement('table');
  table.className = 'ledger';

  // 예년 대장의 칸 너비를 mm 로 실측해 옮겼다 (표 전체 286mm).
  // 이걸 안 정하면 대학 이름이 「건국대학 / 교(서울)」처럼 가운데서 끊긴다.
  const cg = document.createElement('colgroup');
  // 예년 대장 실측 비율(반 2.1 · 번호 2.1 · 성명 3.8 · 내신 3.1 · 지원 9.6×6 ·
  // 등록 7.0 · 특이사항 21.3). 수능 등급 칸은 빼고 그 몫을 성명과 등록 대학에
  // 돌렸다 — 성명은 예년 문서의 글꼴(경기천년바탕)보다 폭이 넓은 글꼴로 나올 때
  // 이름이 잘렸고, 등록 대학은 대학과 학과를 두 줄로 적어 자리가 필요하다.
  const W = ['2.2%', '2.2%', '5.0%', '3.6%',
    ...Array(LEDGER_SLOTS).fill('10.5%'), '8.0%', '15.4%'];
  for (const w of W) {
    const col = document.createElement('col');
    col.style.width = w;
    cg.appendChild(col);
  }
  table.appendChild(cg);

  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  // 칸이 좁아 머리글은 예년 문서처럼 여러 줄로 끊어 넣는다. 한 줄로 두면
  // 「내신성적」과 「등급」이 서로 겹쳐 읽히지 않는다.
  [['반', 1], ['번<br>호', 1], ['성명', 1], ['내신<br>성적<br><small>(전과목)</small>', 1],
    ['대학 지원 현황 및 합불 현황(지원대학 및 학과, 전형명, 합불)', LEDGER_SLOTS],
    ['등록 대학', 1], ['특이사항', 1],
  ].forEach(([label, span]) => {
    const th = document.createElement('th');
    th.innerHTML = label;
    if (span > 1) th.colSpan = span;
    tr.appendChild(th);
  });
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const s of students) tbody.append(...ledgerBlock(s));
  table.appendChild(tbody);
  tw.appendChild(table);
  page.appendChild(tw);
  return page;
}

/**
 * 학생 한 명 = 네 줄. 지원이 여섯을 넘으면 같은 학생 아래로 네 줄을 더 잇고,
 * 왼쪽·오른쪽 칸은 그 전체에 걸쳐 하나로 둔다.
 */
function ledgerBlock(student) {
  const apps = ordered(student.hak);
  const bands = Math.max(1, Math.ceil(apps.length / LEDGER_SLOTS));
  const span = bands * LEDGER_LINES.length;
  const out = [];

  for (let b = 0; b < bands; b += 1) {
    const slice = apps.slice(b * LEDGER_SLOTS, (b + 1) * LEDGER_SLOTS);
    LEDGER_LINES.forEach((line, li) => {
      const tr = document.createElement('tr');
      if (li === 0) tr.className = 'band-top';
      if (b === 0 && li === 0) {
        tr.classList.add('stu-top');
        const left = [
          ['num', student.cls],
          ['num', student.no],
          ['nm', tidy(student.name)],
          ['num', naesinOf(student)],
        ];
        for (const [cl, v] of left) {
          const td = el('td', `fix ${cl}`, v === '' ? '' : String(v));
          td.rowSpan = span;
          tr.appendChild(td);
        }
      }
      for (let i = 0; i < LEDGER_SLOTS; i += 1) {
        const app = slice[i];
        const td = el('td', `slot slot-${line}`, ledgerCell(app, line));
        if (!app) td.classList.add('empty');
        if (line === 'result' && app && isPass(app)) td.classList.add('pass');
        tr.appendChild(td);
      }
      if (b === 0 && li === 0) {
        const enr = enrolledOf(student.hak);
        const reg = el('td', 'fix reg');
        if (enr) {
          reg.appendChild(el('div', 'u', brk(enr.univ)));
          reg.appendChild(el('div', 'd', brk(tidy(enr.dept))));
        }
        reg.rowSpan = span;
        tr.appendChild(reg);

        const memo = el('td', 'fix memo');
        const notes = store.notesOf(student.hak);
        if (notes.length) {
          const ul = el('ul');
          for (const n of notes) ul.appendChild(el('li', null, tidy(n.text)));
          memo.appendChild(ul);
        }
        memo.rowSpan = span;
        tr.appendChild(memo);
      }
      out.push(tr);
    });
  }
  out[0].classList.add('stu-top');
  return out;
}

/* ── 지원 결과 보고서 ───────────────────────────────────────────── */

function rowsForReport() {
  const out = [];
  for (const student of store.studentsOf('')) {          // 보고서는 늘 학년 전체다
    for (const app of store.appsOf(student.hak)) {
      // 선생님이 시트에 적은 결과를 얹어서 넘긴다. 통계는 그걸 봐야 한다 —
      // 예비번호와 등록 여부는 즐겨찾기에 없거나 늦다.
      out.push({ app: { ...app, result: store.resultOf(app) }, student });
    }
  }
  return out;
}

/* ── 1부. 수시 전형 지원 결과 ─────────────────────────────────────
 *
 * 예년 보고서의 1부는 올해와 지난 3개년을 나란히 놓는다. 지난 연도 칸은
 * `data/report_history.json` 이 준다. 올해 칸만 여기서 센다.
 */

const CAPITAL = new Set(['서울', '경기', '인천']);
const TYPE_ORDER = ['교과', '학종', '실기', '논술'];
const LINE_ORDER = ['인문', '자연·공학', '예체능'];

/** 예년 보고서가 쓰는 전형 이름으로. 보드는 「종합」, 문서는 「학종」이다. */
function typeLabel(app) {
  const t = stats.typeOf(app);
  return t === '종합' ? '학종' : t;
}

/**
 * 전형 칸 한 줄 — **유형을 두 번 적지 않는다.**
 *
 * 유형(`학종`)과 세부 이름(`종합(서류형)`)을 그냥 이으면 「학종 종합(서류형)」이
 * 되고, 「교과 교과(교과전형)」처럼 같은 말이 두 번 찍힌다. 세부 이름의 앞머리가
 * 유형 이름이면 떼고 괄호만 남긴다 — 「학종(서류형)」·「교과(교과전형)」.
 *
 * 짧아지면 칸이 두 줄로 안 갈린다. 그게 이 표에서 제일 크게 달라지는 점이다.
 */
function typeText(app) {
  const head = typeLabel(app);
  const sub = String((app && (app.typeSub || app.typeName)) || '').trim();
  if (!sub) return head;
  const tail = sub.replace(/^(학생부)?\s*(교과|종합|논술|실기)\s*/, '');
  return tail && tail !== sub ? `${head}${tail}` : `${head} ${sub}`;
}

/** 계열 세 줄. 보드의 계열 값이 예년 문서의 세 줄과 이름이 다르다. */
function lineOf(app) {
  const t = `${(app && app.track) || ''}`;
  if (/예체능|예능|체육|미술|음악|실기/.test(t)) return '예체능';
  if (/자연|공학|이학|의학|보건/.test(t)) return '자연·공학';
  if (/인문|사회|상경|교육|어문/.test(t)) return '인문';
  return '기타';
}

/** 올해 지원을 (계열 × 전형) 격자로 센다. */
function crossOf(rows) {
  const g = {};
  for (const line of [...LINE_ORDER, '기타']) {
    g[line] = { 계: 0 };
    for (const t of TYPE_ORDER) g[line][t] = 0;
  }
  for (const { app } of rows) {
    const line = lineOf(app);
    const t = typeLabel(app);
    if (!g[line]) continue;
    if (g[line][t] != null) g[line][t] += 1;
    g[line]['계'] += 1;
  }
  const total = { 계: 0 };
  for (const t of TYPE_ORDER) {
    total[t] = Object.keys(g).reduce((a, k) => a + g[k][t], 0);
    total['계'] += total[t];
  }
  g['합계'] = total;
  return g;
}

/** 예년 서식의 4개년 교차표 한 장. */
function crossTable(key, thisYear, subsetLabel, subsetRows) {
  const hist = (history && history.cross && history.cross[key]) || null;
  const years = [YEAR(), ...(history ? history.years : [])];
  const lines = [...LINE_ORDER];
  const rows = subsetRows || thisYear.rows;
  const grid = crossOf(rows);
  if (grid['기타'] && grid['기타']['계']) lines.push('기타');

  const tw = el('div', 'tw');
  const table = document.createElement('table');
  table.className = 'gov';

  const thead = document.createElement('thead');
  const r1 = document.createElement('tr');
  const corner = el('th', null, '');
  corner.colSpan = 2;
  r1.appendChild(corner);
  for (const y of years) {
    const th = el('th', 'num', String(y));
    th.colSpan = TYPE_ORDER.length + 1;
    r1.appendChild(th);
  }
  thead.appendChild(r1);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const wide = (label, pick) => {
    const tr = document.createElement('tr');
    const th = el('th', 'rowhead', label);
    th.colSpan = 2;
    tr.appendChild(th);
    for (const y of years) {
      const td = el('td', 'num', pick(y));
      td.colSpan = TYPE_ORDER.length + 1;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  };
  const hy = (y) => (hist && hist.by ? hist.by[String(y)] : null) || {};

  if (key === '가') {
    wide('3학년 전체 학생 수',
      (y) => (y === YEAR() ? String(thisYear.students) : String(hy(y).students ?? '')));
  }
  wide('수시 전체 지원 수',
    (y) => (y === YEAR() ? String(thisYear.apps) : String(hy(y).apps ?? '')));
  if (subsetLabel) {
    const share = (n, d) => (d ? ` (${((n / d) * 100).toFixed(1)}%)` : '');
    wide(subsetLabel, (y) => (y === YEAR()
      ? `${rows.length}${share(rows.length, thisYear.apps)}`
      : String(hy(y).subsetText ?? '')));
  }

  const head2 = document.createElement('tr');
  const th2 = el('th', 'rowhead', '전형 유형');
  th2.colSpan = 2;
  head2.appendChild(th2);
  for (let i = 0; i < years.length; i += 1) {
    for (const t of [...TYPE_ORDER, '계']) head2.appendChild(el('th', 'num sub', t));
  }
  tbody.appendChild(head2);

  lines.concat('합계').forEach((line, i) => {
    const tr = document.createElement('tr');
    if (i === 0) {
      const th = el('th', 'rowhead', '수시 지원 수');
      th.rowSpan = lines.length + 1;
      tr.appendChild(th);
    }
    tr.appendChild(el('th', 'rowhead sub', line));
    for (const y of years) {
      const cells = y === YEAR() ? grid[line]
        : ((hy(y).byLine || {})[line] || {});
      for (const t of [...TYPE_ORDER, '계']) {
        const v = cells[t];
        tr.appendChild(el('td', 'num', v == null || v === 0 ? (v === 0 ? '' : '') : String(v)));
      }
    }
    if (line === '합계') tr.className = 'sum';
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tw.appendChild(table);
  return tw;
}

/** 라~자 — 대학 묶음별 4개년 지원 수. 묶음과 순서는 예년 보고서를 따른다. */
function rankTable(key, rows) {
  const hist = (history && history.ranking && history.ranking[key]) || null;
  const years = [YEAR(), ...(history ? history.years : [])];
  const names = hist ? hist.rows.map((r) => r.name) : [];

  // 올해 지원을 대학 이름으로 센다. 예년 명단에 없는 대학은 뒤에 붙인다.
  const mine = new Map();
  const bump = (k) => mine.set(k, (mine.get(k) || 0) + 1);
  const known = new Map(names.map((n) => [stats.univKey(n), stats.univKey(n)]));
  for (const { app } of rows) {
    const full = stats.univKey(app.univ);
    bump(known.has(full) ? full : (known.has(bare(app.univ)) ? bare(app.univ) : full));
  }
  const extra = [...mine.keys()].filter((k) => !known.has(k)).sort((a, b) => a.localeCompare(b, 'ko'));

  const list = [...names, ...extra];
  const tw = el('div', 'tw');
  const table = document.createElement('table');
  table.className = 'gov';
  const thead = document.createElement('tr');
  ['연번', '대학명'].forEach((c) => thead.appendChild(el('th', null, c)));
  years.forEach((y) => thead.appendChild(el('th', 'num', String(y))));
  const head = document.createElement('thead');
  head.appendChild(thead);
  table.appendChild(head);

  const tbody = document.createElement('tbody');
  const totals = {};
  list.forEach((name, i) => {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', 'num', String(i + 1)));
    tr.appendChild(el('td', null, name));
    for (const y of years) {
      let v;
      if (y === YEAR()) v = mine.get(stats.univKey(name)) || 0;
      else {
        const h = hist && hist.rows.find((r) => stats.univKey(r.name) === stats.univKey(name));
        v = h ? (h.by[String(y)] ?? 0) : 0;
      }
      totals[y] = (totals[y] || 0) + v;
      tr.appendChild(el('td', 'num', String(v)));
    }
    tbody.appendChild(tr);
  });
  const sum = document.createElement('tr');
  sum.className = 'sum';
  sum.appendChild(el('td', null, ''));
  sum.appendChild(el('td', null, '합계'));
  years.forEach((y) => sum.appendChild(el('td', 'num', String(totals[y] || 0))));
  tbody.appendChild(sum);
  table.appendChild(tbody);
  tw.appendChild(table);
  return tw;
}

/**
 * 예년 보고서의 묶음 정의. 대학 이름 목록은 이력에서 온다.
 *
 * 수도권은 `region` 으로 가르는 것이 옳지만, 즐겨찾기 export 에 지역이 안 실려
 * 오는 일이 있다. 그때 지역만 보면 수도권 칸이 통째로 0 이 되므로 예년 명단에
 * 이름이 있으면 그것도 수도권으로 친다.
 */
/**
 * 캠퍼스 표기를 뗀 이름. 「연세대학교(서울)」 → 「연세대학교」.
 *
 * 즐겨찾기와 예년 문서가 같은 대학을 다르게 적을 때 이걸로 맞춘다.
 * **이름 그대로 맞춰 본 다음에만** 쓴다 — 먼저 쓰면 「한양대학교(ERICA)」가
 * 「한양대학교」에 딸려 들어간다. 둘은 예년 명단에 따로 있는 다른 대학이다.
 */
const bare = (n) => stats.univKey(n).replace(/\s*[（(][^)）]*[)）]\s*$/, '').trim();

/**
 * 대학 이름 → 묶음. 예년 명단을 한 번만 훑어 만든다.
 *
 * 괄호를 무턱대고 떼면 안 된다 — 예년 명단에 「건국대학교」와
 * 「건국대학교(글로컬)」이 **서로 다른 묶음으로** 들어 있다. 그래서 괄호까지
 * 맞는 이름을 먼저 찾고, 없을 때만 괄호를 뗀 이름으로 찾는다.
 * 즐겨찾기의 「전남대학교(광주)」가 명단의 「전남대학교」에 붙는 길이 이쪽이다.
 */
let _index = null;
function groupIndex() {
  if (_index) return _index;
  const exact = new Map();
  const loose = new Map();
  for (const [key, sec] of Object.entries(((history || {}).ranking) || {})) {
    for (const r of sec.rows) {
      const full = stats.univKey(r.name);
      if (!exact.has(full)) exact.set(full, key);
      const b = bare(r.name);
      if (b !== full) continue;              // 괄호가 붙은 이름은 느슨한 쪽에 넣지 않는다
      if (!loose.has(b)) loose.set(b, key);
    }
  }
  _index = { exact, loose };
  return _index;
}

/** 이 지원이 속한 묶음. 어디에도 없으면 null. */
function groupOf(app) {
  const { exact, loose } = groupIndex();
  const full = stats.univKey(app.univ);
  return exact.get(full) || loose.get(bare(app.univ)) || null;
}

function isCapital(app) {
  return CAPITAL.has(app.region) || groupOf(app) === '라';
}

function groupRows(key, rows) {
  if (key === '나' || key === '라') return rows.filter(({ app }) => isCapital(app));
  return rows.filter(({ app }) => groupOf(app) === key);
}

const PART1 = [
  ['가', '전체 대학 수시 전형 지원 결과', null],
  ['나', '수도권 대학 수시 전형 지원 결과', '수도권 대학 지원 수'],
  ['다', '지역 거점 국립대학 수시 전형 지원 결과', '지역 거점 국립대학 지원 수'],
];

function report() {
  const box = el('div');
  const rows = rowsForReport();
  const r = stats.report(rows);
  const o = r.overall;

  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '지원 결과 보고서'));
  head.appendChild(el('span', 'count num', `${o.applied}건`));
  box.appendChild(head);

  if (!rows.length) {
    box.appendChild(el('p', 'empty-state', '아직 지원 내역이 없습니다.'));
    return box;
  }
  if (!history) {
    box.appendChild(el('p', 'note',
      '지난 3개년 자료(data/report_history.json)를 찾지 못했습니다.'
      + ' 올해 칸만 채워서 그립니다.'));
  }
  if (o.decided < o.applied) {
    box.appendChild(el('p', 'note',
      `${o.applied}건 가운데 ${o.decided}건만 결과가 들어왔습니다.`
      + ' 2부 명단은 결과와 무관하게 지원한 것을 모두 싣습니다.'));
  }
  if (o.unknown && o.unknown.length) {
    box.appendChild(el('p', 'note error',
      `결과 칸에서 알아보지 못한 표기가 있습니다 — ${o.unknown.join(', ')}.`));
  }
  const waiting = rows.filter((x) => x.app.result && x.app.result.pending).length;
  if (waiting) {
    box.appendChild(el('p', 'note',
      `학생이 적고 아직 확인하지 않은 결과 ${waiting}건이 포함되어 있습니다.`));
  }

  box.appendChild(tools('지원결과보고서', () => reportTable(r)));

  const sheet = el('section', 'sheet sheet-doc');
  sheet.appendChild(el('h1', 'doc-title', `${YEAR()}학년도 대입 수시 전형 지원 결과`));
  sheet.appendChild(el('p', 'doc-date', stampDot()));

  const thisYear = {
    students: new Set(rows.map((x) => x.student.hak)).size,
    apps: rows.length,
    rows,
  };

  sheet.appendChild(el('h2', 'doc-h1', '1. 수시 전형 지원 결과'));
  for (const [key, title, label] of PART1) {
    sheet.appendChild(el('h3', 'doc-h2', `${key}. ${title}`));
    const subset = key === '가' ? null : groupRows(key === '나' ? '나' : '마', rows);
    sheet.appendChild(crossTable(key, thisYear, label, subset));
  }
  for (const key of ['라', '마', '바', '사', '아', '자']) {
    const hist = history && history.ranking && history.ranking[key];
    if (!hist) continue;
    sheet.appendChild(el('h3', 'doc-h2', `${key}. ${hist.title}`));
    sheet.appendChild(rankTable(key, groupRows(key, rows)));
  }

  box.appendChild(sheet);

  // 명단도 세로다 — 대학 이름이 묶음 머리줄로 빠져 A4 세로에 들어간다
  const part2 = el('section', 'sheet sheet-doc');
  part2.appendChild(el('h2', 'doc-h1', '2. 대학별 수시 지원 세부 현황'));
  for (const key of ['라', '마', '바', '사', '아', '자']) {
    const hist = history && history.ranking && history.ranking[key];
    if (!hist) continue;
    const list = groupRows(key, rows);
    if (!list.length) continue;
    part2.appendChild(el('h3', 'doc-h2', `${key}. ${hist.title.replace(/ 수시 전형 지원 결과.*$/, '')}`));
    part2.appendChild(detailTable(key, list));
  }
  box.appendChild(part2);

  // 예년 문서에 없던 분석. 결재 문서에서 빼려면 이 한 덩이만 지우면 된다.
  const extra = el('section', 'sheet sheet-doc');
  extra.appendChild(el('h2', 'doc-h1', '붙임. 분석 참고자료'));
  analysisBlocks(r).forEach((b) => extra.appendChild(b));
  box.appendChild(extra);
  return box;
}

/**
 * 2부 명단. 예년 서식의 칸 이름을 그대로 쓴다.
 *
 * **대학별로 묶고, 차례는 1부 통계표와 같다**(`univOrder`). 학번순으로만
 * 늘어놓으면 한 학생의 여섯 장이 여섯 대학에 흩어져 「이 대학에 누가 넣었나」를
 * 종이에서 훑을 수 없다. 대학 이름은 묶음 머리줄이 지고 칸에서는 뺀다.
 */
const DETAIL_COLS = ['연번', '학번', '이름', '모집단위', '전형 유형',
  '모집', '경쟁률', '환산', '모집', '경쟁률', '70%컷'];

function detailTable(key, rows) {
  const { names, byName } = univOrder(key, rows);
  const tw = el('div', 'tw');
  const table = document.createElement('table');
  table.className = 'gov';
  widths(table, ['4%', '6%', '7%', '20%', '20%', '5%', '7%', '7%', '6%', '7%', '7%']);

  const thead = document.createElement('thead');
  const r1 = document.createElement('tr');
  DETAIL_COLS.slice(0, 8).forEach((c) => {
    const th = el('th', null, c);
    th.rowSpan = 2;
    r1.appendChild(th);
  });
  const prev = el('th', null, `${YEAR() - 1} 입시 결과`);
  prev.colSpan = 3;
  r1.appendChild(prev);
  const r2 = document.createElement('tr');
  DETAIL_COLS.slice(8).forEach((c) => r2.appendChild(el('th', 'sub', c)));
  thead.appendChild(r1);
  thead.appendChild(r2);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  let n = 0;
  let g = 0;
  for (const name of names) {
    const mine = appsOf(byName, name);
    if (!mine.length) continue;
    g += 1;
    const grp = document.createElement('tr');
    grp.className = 'grp';
    const head = el('td', 'lead', `${g}) ${name}`);
    head.colSpan = DETAIL_COLS.length;
    grp.appendChild(head);
    tbody.appendChild(grp);

    const sorted = mine.slice().sort((a, b) =>
      String(a.student.hak).localeCompare(String(b.student.hak)));
    for (const { app, student } of sorted) {
      const sm = store.summary(app);
      const score = app.myScore || {};
      n += 1;
      const tr = document.createElement('tr');
      [
        ['num', n],
        ['num', student.hak],
        ['nm', tidy(student.name)],
        [null, brk(app.dept || '')],
        ['type', brk(typeText(app))],
        ['num', app.quota ?? ''],
        ['num', rateText(app, sm)],
        ['num', score.grade != null ? Number(score.grade).toFixed(2) : ''],
        ['num', sm.quotaPrev ?? ''],
        ['num', sm.linked && sm.rate != null ? Number(sm.rate).toFixed(2) : ''],
        ['num', sm.linked && sm.cut != null ? Number(sm.cut).toFixed(2) : ''],
      ].forEach(([cl, v]) => tr.appendChild(
        el('td', cl, v === '' || v == null ? '—' : String(v)),
      ));
      tbody.appendChild(tr);
    }
  }
  table.appendChild(tbody);
  tw.appendChild(table);
  return tw;
}

/** 예년 문서에 없던 분석 표들. 붙임으로 뒤에 붙는다. */
function analysisBlocks(r) {
  const out = [];
  const o = r.overall;
  out.push(block('전체 현황', simple([
    ['총 지원', `${o.applied}건`, `지원한 학생 ${o.students}명 · ${o.univs}개 대학`],
    ['결과 나온 지원', `${o.decided}건`, ''],
    ['최초 합격', `${o.first}건`, o.passed ? `합격의 ${p1(o.firstShare)}` : ''],
    ['충원 합격', `${o.extra}건`, o.passed ? `합격의 ${p1(o.extraShare)}` : ''],
    ['총 합격', `${o.passed}건`,
      `${o.passPeople}명 합격${o.perPerson ? ` (1인당 ${o.perPerson.toFixed(1)}건)` : ''}`],
    ['최종 등록', `${o.enrolled}명`, ''],
  ])));

  if (r.gyoVsJong.length) {
    const wrap = block('같은 대학 안에서 — 교과와 종합', grid(
      ['대학', '교과 평균', '종합 평균', '차이', '유리한 전형', '교과 합격률', '종합 합격률'],
      r.gyoVsJong.map((x) => [
        x.univ, g2(x.gyoAvg), g2(x.jongAvg),
        `${x.gap > 0 ? '+' : ''}${x.gap.toFixed(2)}`,
        `${x.better} 유리`, p1(x.gyoRate), p1(x.jongRate),
      ]),
      [1, 2, 3, 5, 6],
    ));
    wrap.insertBefore(el('p', 'hint',
      '전체 평균으로 견주면 「종합이 더 높은 성적을 요구한다」는 잘못된 결론이 나옵니다.'
      + ' 종합으로 상위권에 더 많이 넣기 때문입니다. 그래서 같은 대학 안에서만 견줍니다.'),
    wrap.querySelector('.tw'));
    out.push(wrap);
  }

  out.push(block('전형별', grid(
    ['전형', '지원', '합격', '합격률', '충원 합격', '충원 비중', '1단계 탈락', '충원-최초 등급차'],
    r.byType.map((x) => [
      x.type, x.applied, x.passed, p1(x.rate), x.extra, p1(x.extraShare),
      x.stage1Out ? `${x.stage1Out}건 (불합격의 ${p1(x.stage1Share)})` : '—',
      x.extraGap == null ? '—' : `${x.extraGap > 0 ? '+' : ''}${x.extraGap.toFixed(2)}`,
    ]),
    [1, 2, 3, 4, 5],
  )));

  const mf = r.minFails;
  if (mf.count) {
    out.push(block('수능 최저학력 기준', simple([
      ['최저 미충족 불합격', `${mf.count}건`, `전체 지원의 ${p1(mf.share)}`],
      ['가장 많은 대학', `${mf.byUniv.length}곳`,
        mf.byUniv.slice(0, 3).map((x) => `${x.univ} ${x.n}건`).join(' · ')],
      ['성적이 가장 좋았던 경우', mf.worst ? g2(mf.worst.grade) : '—',
        mf.worst ? `${mf.worst.univ} ${mf.worst.dept} — 내신이 좋아도 최저에서 떨어집니다`
          : '내신이 좋아도 최저에서 떨어집니다'],
    ])));
  }

  const worth = r.byUniv.filter((u) => u.passed > 0 || u.applied >= 2);
  const dropped = r.byUniv.length - worth.length;
  const uni = el('div', 'detail-block');
  uni.appendChild(el('h3', '', `대학별 합격선 (지원 많은 순 ${worth.length}곳)`));
  uni.appendChild(el('p', 'hint',
    '「최고」는 합격자 중 가장 좋은 등급, 「커트」는 가장 낮은 등급입니다.'
    + (dropped ? ` 지원이 한 건뿐이고 합격이 없는 ${dropped}곳은 뺐습니다.` : '')));
  for (const u of worth) {
    const sub = el('div', 'uni-block');
    const h = el('div', 'uni-head');
    h.appendChild(el('span', 'nm', u.univ));
    h.appendChild(el('span', 'fig num', `${u.applied}건 지원 → ${u.passed}건 합격 (${p1(u.rate)})`));
    sub.appendChild(h);
    sub.appendChild(grid(
      ['전형', '지원', '합격', '평균', '최고', '커트'],
      u.byType.map((t) => [t.type, t.applied, t.passed, g2(t.avg), g2(t.best), g2(t.cut)]),
      [1, 2, 3, 4, 5],
    ));
    uni.appendChild(sub);
  }
  out.push(uni);

  if (r.byBand.length) {
    out.push(block('등급대별로 실제 어디에 붙었나', grid(
      ['등급대', '합격 학생', '합격한 대학'],
      r.byBand.map((b) => [
        b.label, `${b.people}명`,
        b.univs.slice(0, 8).map((x) => `${x.univ} ${x.n}`).join(' · '),
      ]),
      [1],
    )));
  }
  return out;
}

/* ── 합격자 발표 현황 ────────────────────────────────────────────
 *
 * 발표가 한창일 때 그날그날 뽑는 문서다. 최종 결과 보고서는 다 끝난 뒤에
 * 쓰지만 이건 진행 중의 스냅샷이라, 1단계 결과와 최초 결과를 나란히 놓고
 * 아직 안 끝난 것은 「면접 예정 11.28.」 처럼 다음 일정을 적는다.
 * 대학 단위로 끊어 1) 2) 3) 으로 번호를 매긴다.
 */

/** 아직 결과가 안 나온 지원의 다음 일정. 면접·실기·논술 중 먼저 오는 것. */
function nextStep(app) {
  for (const kind of ['면접', '실기', '논술']) {
    const d = store.dateOf(app, kind);
    if (!d || !d.from) continue;
    const [, m, day] = String(d.from).split('-');
    if (m && day) return `${kind} 예정 ${Number(m)}.${Number(day)}.`;
  }
  return '';
}

/** 이 지원이 발표 현황에 실릴 만한가 — 결과나 일정 중 하나라도 있어야 한다. */
function announced(app) {
  const r = store.resultOf(app) || {};
  return !!(r.stage1 || r.final || r.waitNo || r.enrolled || nextStep(app));
}

/** 최초 결과 칸. 발표 전이면 다음 일정을 대신 적는다. */
function statusText(app) {
  const r = store.resultOf(app) || {};
  // 곁가지는 괄호에 — 「충원합격 · 예비 7」이 좁은 칸에서 숫자만 아랫줄로 떨어졌다
  const notes = [];
  if (r.waitNo) notes.push(`예비${r.waitNo}`);
  if (r.enrolled) notes.push(String(r.enrolled));
  if (r.final) {
    return notes.length ? `${r.final}(${notes.join(' · ')})` : String(r.final);
  }
  if (notes.length) return notes.join(' · ');
  return nextStep(app);
}

const STATUS_COLS = ['연번', '학번', '이름', '모집단위', '전형 유형', '모집', '경쟁률',
  '환산', '1단계', '최초 결과'];

/**
 * 발표 현황 표 — **대학마다 표를 새로 만들지 않는다.**
 *
 * 예전에는 대학 하나에 표 하나였다. 지원이 한 건인 대학이 대부분이라
 * 머리글 두 줄 + 내용 한 줄짜리 표가 줄줄이 이어졌고, 13건에 표가 11개였다.
 * 실제 규모(한 학년 여섯 장씩이면 600건 남짓)로 가면 표가 백 개가 넘는다.
 * 종이도 두꺼워지지만 무엇보다 **눈이 표를 건너뛰느라 내용을 못 따라간다.**
 *
 * 표는 하나로 두고 대학은 **칸을 가로지르는 머리줄**로 끊는다. 머리글은 한 번만
 * 나오고, 연번이 문서 전체에서 이어져 몇 건인지 바로 읽힌다.
 */
function statusTable(names, byUniv) {
  const tw = el('div', 'tw');
  const table = document.createElement('table');
  table.className = 'gov';
  widths(table, ['3.5%', '5.5%', '6.5%', '16%', '17%', '4.5%', '6%', '5.5%',
    '7%', '13.5%', '4.5%', '5.5%', '5%']);

  const thead = document.createElement('thead');
  const r1 = document.createElement('tr');
  // 칸이 좁아 머리글을 줄인다. 「모집 인원」을 그대로 두면 옆 칸을 덮는다.
  STATUS_COLS.forEach((c) => {
    const th = el('th', null, c);
    th.rowSpan = 2;
    r1.appendChild(th);
  });
  const prev = el('th', null, `${YEAR() - 1} 입시 결과`);
  prev.colSpan = 3;
  r1.appendChild(prev);
  const r2 = document.createElement('tr');
  ['모집', '경쟁률', '70%컷'].forEach((c) => r2.appendChild(el('th', 'sub', c)));
  thead.appendChild(r1);
  thead.appendChild(r2);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  let n = 0;
  names.forEach((name, gi) => {
    const grp = document.createElement('tr');
    grp.className = 'grp';
    const head = el('td', 'lead', `${gi + 1}) ${name}`);
    head.colSpan = STATUS_COLS.length + 3;
    grp.appendChild(head);
    tbody.appendChild(grp);

    const sorted = byUniv.get(name).slice().sort((a, b) =>
      String(a.student.hak).localeCompare(String(b.student.hak)));
    for (const { app, student } of sorted) {
      const sm = store.summary(app);
      const mine = app.myScore || {};
      const r = store.resultOf(app) || {};
      const txt = statusText(app);
      const won = /합격/.test(txt) && !/불합격/.test(txt);
      n += 1;
      const tr = document.createElement('tr');
      [
        ['num', n],
        ['num', student.hak],
        ['nm', tidy(student.name)],
        [null, brk(app.dept || '')],
        ['type', brk(typeText(app))],
        ['num', app.quota ?? ''],
        ['num', rateText(app, sm)],
        ['num', mine.grade != null ? Number(mine.grade).toFixed(2) : ''],
        ['nm', r.stage1 || ''],
        [won ? 'won verdict' : 'verdict', txt],
        ['num', sm.quotaPrev ?? ''],
        // 머리글이 이미 「경쟁률」이라 「:1」은 겹치는 말이고, 그 세 글자 때문에
        // 「14.13:1」이 칸을 넘쳐 테두리를 덮었다.
        ['num', sm.linked && sm.rate != null ? Number(sm.rate).toFixed(2) : ''],
        ['num', sm.linked && sm.cut != null ? Number(sm.cut).toFixed(2) : ''],
      ].forEach(([cl, v]) => tr.appendChild(el('td', cl, v === '' || v == null ? '—' : String(v))));
      tbody.appendChild(tr);
    }
  });
  table.appendChild(tbody);
  tw.appendChild(table);
  return tw;
}

function status() {
  const box = el('div');
  const all = rowsForReport().filter(({ app }) => announced(app));

  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '합격자 발표 현황'));
  head.appendChild(el('span', 'count num', `${all.length}건`));
  box.appendChild(head);

  box.appendChild(el('p', 'section-label',
    '오늘까지 발표가 났거나 앞으로 일정이 잡힌 지원만 싣습니다.'
    + ' 문서의 날짜는 뽑는 날로 찍힙니다.'));

  if (!all.length) {
    box.appendChild(el('p', 'empty-state',
      '아직 발표된 결과도, 잡힌 일정도 없습니다.'));
    return box;
  }

  // 대학 단위로 묶고, 다른 문서와 같은 차례(수도권 주요 → 거점국립 → …)로 늘어놓는다
  const order = FINAL_GROUPS.map(([key]) => key);
  const byUniv = new Map();
  for (const r of all) {
    const k = shortUniv(r.app.univ);
    if (!byUniv.has(k)) byUniv.set(k, []);
    byUniv.get(k).push(r);
  }
  const rank = (name) => {
    const g = groupOf({ univ: name, region: '' });
    const i = order.indexOf(g);
    return i < 0 ? order.length : i;
  };
  const names = [...byUniv.keys()].sort((a, b) =>
    rank(a) - rank(b) || a.localeCompare(b, 'ko'));

  box.appendChild(tools('합격자발표현황', () => {
    const rows = [['대학', '학번', '이름', '모집단위', '전형 유형',
      '1단계 결과', '최초 결과']];
    for (const name of names) {
      for (const { app, student } of byUniv.get(name)) {
        const r = store.resultOf(app) || {};
        rows.push([name, student.hak, student.name, app.dept || '',
          typeText(app), r.stage1 || '', statusText(app)]);
      }
    }
    return rows;
  }));

  const sheet = el('section', 'sheet sheet-doc');
  sheet.appendChild(el('h1', 'doc-title',
    `주요 대학 합격자 발표 현황(${stampDot()} 현재)`));
  sheet.appendChild(statusTable(names, byUniv));
  box.appendChild(sheet);
  return box;
}

/* ── 수시 최종 결과 보고서 ───────────────────────────────────────
 *
 * 지원 결과 보고서가 「어디에 넣었나」라면 이쪽은 「어떻게 됐나」다. 12월
 * 발표가 끝난 뒤 결재로 올라간다. 예년 문서는 대학마다 지원·합격·등록을
 * 나란히 놓고, 2부 명단에 1단계 결과와 최종 결과를 더 싣는다.
 */

const MED_DEPTS = ['의예과', '치의예과', '약학과', '한의예과', '수의예과'];
const OUT_FIELDS = ['지원', '합격', '등록'];

/** 이 지원의 결말. 화면과 종이가 같은 값을 보도록 stats 를 그대로 쓴다. */
const vOf = (app) => stats.verdict({ ...app, result: store.resultOf(app) });

/**
 * 경쟁률 칸 — **학생이 적어 둔 최종 경쟁률을 먼저 쓴다.**
 *
 * 여태 실질경쟁률(명목 × 모집 ÷ (모집+추합))만 봤는데, 그건 모집요강에 작년
 * 추가합격이 적혀 있어야 나온다. 안 나오는 지원이 많아 칸이 통째로 「—」였다.
 * 마감 뒤 대학이 내는 최종 경쟁률은 학생이 카드에서 적어 두는 값이라, 그게
 * 있으면 그게 이 전형의 올해 값이고 가장 정확하다.
 *
 * 어느 쪽을 썼는지 헷갈릴 일은 없다 — 최종 경쟁률은 올해 것이고 실질경쟁률은
 * 작년 것인데, 표에 둘이 같이 나오는 자리가 없다.
 */
function rateText(app, sm) {
  const f = store.fieldOf(app, '최종경쟁률');
  if (f && f.value) {
    const n = Number(String(f.value).replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n) && n > 0) return n.toFixed(2);
  }
  return sm && sm.real && sm.real.rate != null ? Number(sm.real.rate).toFixed(2) : '';
}

function tally(rows) {
  const t = { 지원: rows.length, 합격: 0, 등록: 0 };
  for (const { app } of rows) {
    const v = vOf(app);
    if (v.passed) t['합격'] += 1;
    if (v.enrolled) t['등록'] += 1;
  }
  return t;
}

/** 가. 의치약한수 — 학과별 합격 수와 합격한 대학. */
function medTable(rows) {
  const tw = el('div', 'tw');
  const table = document.createElement('table');
  table.className = 'gov';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  ['연번', '학과', '지원', '합격', '합격 대학'].forEach((c) => tr.appendChild(el('th', null, c)));
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  let ap = 0;
  let ps = 0;
  MED_DEPTS.forEach((dept, i) => {
    const list = rows.filter(({ app }) => String(app.dept || '').includes(dept.replace('과', '')));
    const won = list.filter(({ app }) => vOf(app).passed);
    ap += list.length;
    ps += won.length;
    const line = document.createElement('tr');
    [['num', i + 1], [null, dept], ['num', list.length], ['num', won.length],
      [null, [...new Set(won.map(({ app }) => shortUniv(app.univ)))].join(', ')],
    ].forEach(([cl, v]) => line.appendChild(el('td', cl, v === '' ? '—' : String(v))));
    tbody.appendChild(line);
  });
  const sum = document.createElement('tr');
  sum.className = 'sum';
  [['', ''], [null, '합계'], ['num', ap], ['num', ps], [null, '']]
    .forEach(([cl, v]) => sum.appendChild(el('td', cl, String(v))));
  tbody.appendChild(sum);
  table.appendChild(tbody);
  tw.appendChild(table);
  return tw;
}

/** 대학 묶음 하나 — 대학마다 지원·합격·등록. */
/**
 * 이 묶음의 대학을 **예년 문서의 차례대로** 세운다.
 *
 * 통계표(1부)와 명단(2부)이 같은 차례를 봐야 종이에서 오르내리며 찾을 수 있다.
 * 예년 문서의 명단에 없는 대학은 뒤에 가나다순으로 붙인다 — 빠뜨리지 않으려고.
 *
 * 돌려주는 것은 `{ names, byName }` 다. `names` 는 차례대로 세운 이름이고
 * `byName` 은 그 이름(정규화한 키)으로 찾는 지원들이다.
 */
function univOrder(key, rows) {
  const hist = (history && history.ranking && history.ranking[key]) || null;
  const listed = hist ? hist.rows.map((r) => r.name) : [];

  /*
   * **캠퍼스 표기가 달라도 예년 명단의 그 대학이다.**
   *
   * 즐겨찾기는 「연세대학교(서울)」로 주는데 예년 명단은 「연세대학교」다. 이름이
   * 안 맞으니 예년 명단의 그 줄은 0으로 남고, 옆에 「연세대학교(서울)」이라는
   * 줄이 따로 생겼다. 지원이 없어 접는 줄을 넣고 나서야 드러났다 —
   * 지원 1건이 있는데도 「지원 없음」 목록에 연세대학교·고려대학교가 들어 있었다.
   *
   * 그래서 두 번 훑는다. **먼저 이름 그대로** 맞춰 보고, 그 다음 괄호를 뗀
   * 이름으로 맞춘다. 차례가 중요하다 — 「한양대학교(ERICA)」는 예년 명단에
   * 제 이름으로 있으니 첫 번째에서 잡히고, 괄호를 뗀 「한양대학교」에 딸려
   * 들어가지 않는다. 분교(세종·글로컬·미래)도 마찬가지다.
   *
   * 괄호를 떼는 것이 위험하지 않은 까닭 — `groupRows` 가 이미 묶음을 갈라 놨다.
   * 「고려대학교(세종)」은 「자. 호남권 이외」로 가 있고, 거기 명단에는 제 이름이
   * 그대로 있어 첫 번째에서 잡힌다.
   */
  const slot = new Map();
  for (const name of listed) slot.set(stats.univKey(name), name);
  for (const name of listed) {
    const b = bare(name);
    if (!slot.has(b)) slot.set(b, name);
  }

  const byName = new Map();
  for (const r of rows) {
    const k = stats.univKey(r.app.univ);
    const to = slot.get(k) || slot.get(bare(r.app.univ)) || shortUniv(r.app.univ);
    if (!byName.has(to)) byName.set(to, []);
    byName.get(to).push(r);
  }
  const known = new Set(listed);
  const extra = [...byName.keys()].filter((n) => !known.has(n))
    .sort((a, b) => a.localeCompare(b, 'ko'));
  return { names: [...listed, ...extra], byName };
}

/** 그 대학의 지원들. 없으면 빈 배열. */
const appsOf = (byName, name) => byName.get(name) || [];

function outcomeTable(key, rows) {
  const { names: list, byName } = univOrder(key, rows);

  const tw = el('div', 'tw');
  const table = document.createElement('table');
  table.className = 'gov';
  widths(table, ['8%', '46%', '15%', '15%', '16%']);
  const thead = document.createElement('thead');
  const tr0 = document.createElement('tr');
  ['연번', '대학명', ...OUT_FIELDS].forEach((c, i) =>
    tr0.appendChild(el('th', i >= 2 ? 'num' : null, c)));
  thead.appendChild(tr0);
  table.appendChild(thead);

  /*
   * **아무도 안 간 대학은 줄을 안 만든다.**
   *
   * 예년 서식은 지켜보는 대학을 통째로 늘어놓는다 — 수도권만 41곳이다. 그런데
   * 한 학년이 실제로 원서를 내는 곳은 그중 열 곳 남짓이라, 「0 0 0」이 서른 줄
   * 넘게 이어지고 그것만으로 A4 한 장을 먹는다. 여섯 묶음을 합치면 85줄인데
   * 숫자가 들어가는 줄은 열 몇 줄뿐이다.
   *
   * 지원이 있는 곳만 줄로 세우고, **나머지는 이름을 한 줄에 몰아 적는다.**
   * 「이 대학들도 봤는데 아무도 안 갔다」는 사실은 그대로 남고, 종이는
   * 서너 줄로 줄어든다.
   */
  const filled = [];
  const none = [];
  for (const name of list) {
    const mine = tally(appsOf(byName, name));
    (OUT_FIELDS.some((f) => mine[f]) ? filled : none).push({ name, mine });
  }

  /*
   * 이 묶음에 지원이 하나도 없으면 표를 안 만든다. 머리글 한 줄 · 「없습니다」
   * 한 줄 · 0으로 채운 합계 한 줄, 세 줄이 아무 말도 안 한다. 한 줄로 족하다.
   */
  if (!filled.length) {
    const p = el('p', 'rest-line',
      `지원한 학생이 없습니다. (지켜본 ${none.length}곳 — ${none.map((x) => x.name).join(' · ')})`);
    tw.appendChild(p);
    return tw;
  }

  const tbody = document.createElement('tbody');
  const totals = { 지원: 0, 합격: 0, 등록: 0 };
  filled.forEach(({ name, mine }, i) => {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', 'num', String(i + 1)));
    tr.appendChild(el('td', null, name));
    OUT_FIELDS.forEach((f) => {
      totals[f] += mine[f];
      tr.appendChild(el('td', 'num', String(mine[f])));
    });
    tbody.appendChild(tr);
  });
  const sum = document.createElement('tr');
  sum.className = 'sum';
  sum.appendChild(el('td', null, ''));
  sum.appendChild(el('td', null, '합계'));
  OUT_FIELDS.forEach((f) => sum.appendChild(el('td', 'num', String(totals[f]))));
  tbody.appendChild(sum);
  if (none.length) {
    const tr = document.createElement('tr');
    tr.className = 'rest';
    const td = el('td', 'lead',
      `지원 없음 ${none.length}곳 — ${none.map((x) => x.name).join(' · ')}`);
    td.colSpan = 5;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tw.appendChild(table);
  return tw;
}

/**
 * 2부 명단 — 지원 보고서의 명단에 1단계·최종 결과를 더한다.
 *
 * **대학별로 묶는다.** 학번순으로만 늘어놓으면 한 학생의 여섯 장이 여섯 대학에
 * 흩어져 「이 대학에 누가 넣었나」를 종이에서 훑을 수 없다. 결재로 올라가는
 * 문서에서 묻는 것은 대개 그쪽이다. 차례는 1부 통계표와 **같다**(`univOrder`) —
 * 예년 문서의 주요 대학 차례. 그래야 오르내리며 찾을 수 있다.
 *
 * 대학 이름은 묶음 머리줄이 지고 있으므로 칸에서는 뺀다. 그 폭이 모집단위와
 * 전형 이름으로 가서, 열이 하나 줄고 칸은 더 넉넉해진다.
 */
const FINAL_COLS = ['연번', '학번', '이름', '모집단위', '전형 유형', '모집', '경쟁률',
  '환산', '최종 결과'];

function finalDetail(key, rows) {
  const { names, byName } = univOrder(key, rows);
  const tw = el('div', 'tw');
  const table = document.createElement('table');
  table.className = 'gov';
  widths(table, ['5%', '7%', '8%', '21%', '21%', '6%', '7%', '7%', '18%']);

  const thead = document.createElement('thead');
  const r1 = document.createElement('tr');
  FINAL_COLS.forEach((c) => r1.appendChild(el('th', null, c)));
  thead.appendChild(r1);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  let n = 0;
  let g = 0;
  for (const name of names) {
    const mine = appsOf(byName, name);
    if (!mine.length) continue;
    g += 1;
    const grp = document.createElement('tr');
    grp.className = 'grp';
    const head = el('td', 'lead', `${g}) ${name}`);
    head.colSpan = FINAL_COLS.length;
    grp.appendChild(head);
    tbody.appendChild(grp);

    const sorted = mine.slice().sort((a, b) =>
      String(a.student.hak).localeCompare(String(b.student.hak)));
    for (const { app, student } of sorted) {
      const sm = store.summary(app);
      const score = app.myScore || {};
      const r = store.resultOf(app);
      const v = vOf(app);
      n += 1;
      const tr = document.createElement('tr');
      [
        ['num', n],
        ['num', student.hak],
        ['nm', tidy(student.name)],
        [null, brk(app.dept || '')],
        ['type', brk(typeText(app))],
        ['num', app.quota ?? ''],
        ['num', rateText(app, sm)],
        ['num', score.grade != null ? Number(score.grade).toFixed(2) : ''],
        [v.passed ? 'won verdict' : 'verdict', resultText(r)],
      ].forEach(([cl, val]) => tr.appendChild(
        el('td', cl, val === '' || val == null ? '—' : String(val)),
      ));
      tbody.appendChild(tr);
    }
  }
  table.appendChild(tbody);
  tw.appendChild(table);
  return tw;
}

/**
 * 결과 요약 — 지원에서 등록까지 어디서 얼마나 줄었나.
 *
 * 합격률만 적으면 「왜 이만큼만 붙었나」가 안 보인다. 종합은 1단계에서
 * 한 번 걸리고, 교과는 최저에서 걸린다. 관문을 나눠 세야 다음 해에 쓸 수 있다.
 */
function funnel(rows) {
  const kinds = ['교과', '학종', '논술', '실기', '기타'];
  const box = {};
  for (const k of kinds) {
    box[k] = { 지원: 0, 결과: 0, 단계1: 0, 단계1탈락: 0, 합격: 0, 충원: 0, 최저: 0, 등록: 0 };
  }
  for (const { app } of rows) {
    const k = typeLabel(app);
    const b = box[k] || box['기타'];
    const v = vOf(app);
    const r = store.resultOf(app) || {};
    b['지원'] += 1;
    if (v.decided) b['결과'] += 1;
    if (r.stage1) {
      b['단계1'] += 1;
      if (/불합격|탈락/.test(String(r.stage1))) b['단계1탈락'] += 1;
    }
    if (v.passed) b['합격'] += 1;
    if (v.extra) b['충원'] += 1;
    if (v.minFail) b['최저'] += 1;
    if (v.enrolled) b['등록'] += 1;
  }
  const list = kinds.filter((k) => box[k]['지원']);
  const all = { 지원: 0, 결과: 0, 단계1: 0, 단계1탈락: 0, 합격: 0, 충원: 0, 최저: 0, 등록: 0 };
  for (const k of list) for (const f of Object.keys(all)) all[f] += box[k][f];

  const line = (label, b) => [
    label, b['지원'], b['합격'], p1(pctOf(b['합격'], b['지원'])),
    b['충원'] ? `${b['충원']}건 (합격의 ${p1(pctOf(b['충원'], b['합격']))})` : '—',
    b['단계1'] ? `${b['단계1탈락']}/${b['단계1']} (${p1(pctOf(b['단계1탈락'], b['단계1']))})` : '—',
    b['최저'] || '—',
    b['등록'], p1(pctOf(b['등록'], b['합격'])),
  ];
  const tw = grid(
    ['전형', '지원', '합격', '합격률', '충원 합격', '1단계 탈락', '최저 미충족', '등록', '등록률'],
    [...list.map((k) => line(k, box[k])), line('전체', all)],
    [1, 2, 3, 7],
  );
  widths(tw.querySelector('table'),
    ['10%', '7%', '7%', '9%', '22%', '16%', '11%', '7%', '11%']);
  const last = tw.querySelector('tbody tr:last-child');
  if (last) last.className = 'sum';
  return tw;
}

const pctOf = (a, b) => (b ? (a / b) * 100 : null);

/** 예년 최종 결과 보고서의 묶음 차례. 지원 보고서와 같은 명단을 쓴다. */
const FINAL_GROUPS = [['라', '수도권 주요 대학'], ['마', '지역 거점 국립대학'],
  ['바', '과학기술특성화대학교'], ['사', '교육대학교'],
  ['아', '호남권 대학'], ['자', '호남권 이외 대학']];

const LETTERS = '가나다라마바사아자차';

function finalReport() {
  const box = el('div');
  const rows = rowsForReport();

  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '수시 최종 결과 보고서'));
  head.appendChild(el('span', 'count num', `${rows.length}건`));
  box.appendChild(head);

  if (!rows.length) {
    box.appendChild(el('p', 'empty-state', '아직 지원 내역이 없습니다.'));
    return box;
  }
  const t = tally(rows);
  const decided = rows.filter(({ app }) => vOf(app).decided).length;
  if (decided < rows.length) {
    box.appendChild(el('p', 'note',
      `${rows.length}건 가운데 ${decided}건만 결과가 들어왔습니다.`
      + ' 결과가 다 들어오기 전에 뽑으면 합격·등록 수가 실제보다 적게 나옵니다.'));
  }

  box.appendChild(tools('수시최종결과보고서', () => finalTable(rows)));

  const sheet = el('section', 'sheet sheet-doc');
  sheet.appendChild(el('h1', 'doc-title',
    `${YEAR()}학년도 대입 수시전형 주요 대학 합격자 발표 결과`));
  sheet.appendChild(el('p', 'doc-date', `${stampFull()} 기준`));

  sheet.appendChild(el('h2', 'doc-h1', '1. 주요 대학 통계'));
  let n = 0;
  sheet.appendChild(el('h3', 'doc-h2', `${LETTERS[n++]}. 결과 요약`));
  sheet.appendChild(funnel(rows));
  sheet.appendChild(el('h3', 'doc-h2', `${LETTERS[n++]}. 의치약한수`));
  sheet.appendChild(medTable(rows));

  for (const [key, title] of FINAL_GROUPS) {
    if (!(history && history.ranking && history.ranking[key])) continue;
    sheet.appendChild(el('h3', 'doc-h2', `${LETTERS[n++]}. ${title}`));
    sheet.appendChild(outcomeTable(key, groupRows(key, rows)));
  }

  box.appendChild(sheet);

  /*
   * 명단도 **세로**다. 대학 이름이 묶음 머리줄로 빠지면서 칸에서 가장 긴 것이
   * 사라져 A4 세로 186mm 에 들어간다. 한 문서 안에서 방향이 바뀌면 인쇄해 놓고
   * 넘길 때 손이 걸리니, 들어가면 안 바꾸는 게 낫다.
   * (`scripts/check_print.mjs` 가 정말 들어가는지 잰다.)
   */
  const list2 = el('section', 'sheet sheet-doc');
  list2.appendChild(el('h2', 'doc-h1', '2. 대학별 세부 현황'));
  let m = 0;
  for (const [key, title] of FINAL_GROUPS) {
    const list = groupRows(key, rows);
    if (!list.length) continue;
    list2.appendChild(el('h3', 'doc-h2', `${LETTERS[m++]}. ${title}`));
    list2.appendChild(finalDetail(key, list));
  }
  box.appendChild(list2);
  return box;
}

/** 표 복사·CSV — 화면의 두 부를 줄로 편다. */
function finalTable(rows) {
  const out = [['구분', '대학', '지원', '합격', '등록']];
  for (const [key, title] of FINAL_GROUPS) {
    const list = groupRows(key, rows);
    if (!list.length) continue;
    const byName = new Map();
    for (const r of list) {
      const k = stats.univKey(r.app.univ);
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(r);
    }
    for (const [name, group] of byName) {
      const t = tally(group);
      out.push([title, name, t['지원'], t['합격'], t['등록']]);
    }
  }
  out.push([]);
  /*
   * 붙여 넣는 표에는 대학 칸을 남긴다. 화면·종이는 대학별로 묶어 머리줄이
   * 대학을 지고 있지만, 엑셀로 가는 것은 평평한 표라 줄마다 제 대학이 있어야
   * 거르고 정렬할 수 있다.
   */
  out.push(['학번', '이름', '대학', '모집단위', '전형 유형', '모집 인원', '경쟁률',
    '환산 성적', '1단계 결과', '최종 결과']);
  for (const { app, student } of rows) {
    const mine = app.myScore || {};
    const r = store.resultOf(app);
    out.push([student.hak, student.name, shortUniv(app.univ), app.dept || '',
      typeText(app),
      app.quota ?? '', '', mine.grade != null ? Number(mine.grade).toFixed(2) : '',
      (r && r.stage1) || '', resultText(r)]);
  }
  return out;
}

/**
 * 열 너비를 못박는다.
 *
 * 열이 열셋이나 되는 표를 브라우저가 알아서 나누면 숫자 칸이 필요 이상으로
 * 넓어지고 대학 이름이 세 줄로 갈린다. 좁아도 되는 칸을 눌러
 * 이름이 들어갈 자리를 만든다.
 */
function widths(table, list) {
  const cg = document.createElement('colgroup');
  for (const w of list) {
    const col = document.createElement('col');
    col.style.width = w;
    cg.appendChild(col);
  }
  table.insertBefore(cg, table.firstChild);
  table.classList.add('fixed');
}

/** 표 복사·CSV 로 나가는 한 판. 화면에 있는 것을 그대로 줄로 편다. */
function reportTable(r) {
  const o = r.overall;
  const rows = [
    ['구분', '값', '비고'],
    ['총 지원', `${o.applied}건`, `${o.students}명 · ${o.univs}개 대학`],
    ['최초 합격', `${o.first}건`, p1(o.firstShare)],
    ['충원 합격', `${o.extra}건`, p1(o.extraShare)],
    ['총 합격', `${o.passed}건`, `${o.passPeople}명`],
    ['최종 등록', `${o.enrolled}명`, ''],
    [],
    ['전형', '지원', '합격', '합격률', '충원', '1단계 탈락'],
    ...r.byType.map((x) => [x.type, x.applied, x.passed, p1(x.rate), x.extra, x.stage1Out]),
    [],
    ['대학', '전형', '지원', '합격', '평균', '최고', '커트'],
  ];
  for (const u of r.byUniv) {
    for (const t of u.byType) {
      rows.push([u.univ, t.type, t.applied, t.passed, g2(t.avg), g2(t.best), g2(t.cut)]);
    }
  }
  return rows;
}

/* ── 조각 ───────────────────────────────────────────────────────── */

function block(title, body) {
  const wrap = el('div', 'detail-block');
  wrap.appendChild(el('h3', '', title));
  wrap.appendChild(body);
  return wrap;
}

/** 이름·값·비고 세 칸짜리 작은 표 */
function simple(list) {
  const tw = el('div', 'tw');
  const table = document.createElement('table');
  table.className = 'gov';
  widths(table, ['24%', '16%', '60%']);
  const tbody = document.createElement('tbody');
  /*
   * 가운데 칸은 대개 숫자라 줄바꿈을 막아 뒀는데(`num`), 「1.42 · 고려대학교(서울)
   * 경제학과」처럼 문장이 들어오는 줄이 섞여 있다. 그 줄에서 칸을 넘쳐 테두리를
   * 덮었다. **숫자꼴일 때만** 막는다.
   */
  const numeric = (v) => /^[0-9.,%:명건 -]*$/.test(String(v));
  for (const [k, v, note] of list) {
    const tr = document.createElement('tr');
    tr.appendChild(el('th', 'rowhead', k));
    tr.appendChild(el('td', numeric(v) ? 'num' : null, String(v)));
    tr.appendChild(el('td', 'lead', note || ''));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tw.appendChild(table);
  return tw;
}

/** 머리가 있는 표. `nums` 에 든 칸은 숫자로 정렬한다. */
function grid(cols, rows, nums = []) {
  const set = new Set(nums);
  const tw = el('div', 'tw');
  const table = document.createElement('table');
  table.className = 'gov';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  cols.forEach((c, i) => tr.appendChild(el('th', set.has(i) ? 'num' : null, c)));
  thead.appendChild(tr);
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const line = document.createElement('tr');
    row.forEach((v, i) => line.appendChild(
      el('td', set.has(i) ? 'num' : null, v == null || v === '' ? '—' : String(v)),
    ));
    tbody.appendChild(line);
  }
  table.appendChild(thead);
  table.appendChild(tbody);
  tw.appendChild(table);
  return tw;
}
