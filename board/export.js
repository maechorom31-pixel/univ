/**
 * 내보내기 — 진학 대장 · 지원 결과 보고서 (P7)
 * =====================================================================
 * 해마다 만드시는 두 문서가 이 화면의 목적이다.
 *
 *   진학 대장       반 단위. 학생 한 명이 한 쪽. 누가 어디에 넣었는지의 기록
 *   지원 결과 보고서 학년 단위. 결과가 다 들어온 뒤의 통계
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

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** 2026-09-04 → 9/4(금). 대장은 종이라 자리를 아껴야 한다. */
function day(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return String(iso || '');
  return `${m}/${d}(${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

let view = 'ledger';        // 'ledger' | 'report'
let notice = '';

export function start() {
  store.on('change', render);
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
  main.appendChild(view === 'ledger' ? ledger() : report());
}

function chooser() {
  const box = el('div', 'tabs');
  for (const [key, label] of [['ledger', '진학 대장'], ['report', '지원 결과 보고서']]) {
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

const SLOT_NAME = { rank: '', pool: '후보', archive: '보관', tray: '전문대' };

/** 이 학생의 지원을 대장에 실을 차례로 — 6칸 먼저, 그다음 후보, 전문대, 보관. */
function ordered(hak) {
  const apps = store.appsOf(hak);
  const weight = (a) => {
    const p = store.placementOf(a.id);
    if (p.slot === 'rank') return p.rank;
    if (p.slot === 'archive') return 90;
    if (a.univType === '전문대' || a.univType === '특수대') return 80;
    return 70;
  };
  return apps.slice().sort((a, b) => weight(a) - weight(b)
    || String(a.univ).localeCompare(String(b.univ), 'ko'));
}

const LEDGER_COLS = ['순위', '대학', '전형', '모집단위', '모집', '내 환산', '작년 70%컷',
  '작년 경쟁률', '수능최저', '면접', '결과'];
/** 열 너비. 합이 100%다. 이름이 긴 칸(대학·전형·모집단위)에 자리를 몰아 준다. */
const LEDGER_WIDTH = ['5%', '15%', '14%', '15%', '5%', '7%', '7%', '8%', '5%', '8%', '11%'];

function ledgerRow(app) {
  const s = store.summary(app);
  const p = store.placementOf(app.id);
  const go = ['면접', '실기', '논술'].map((k) => store.dateOf(app, k)).find(Boolean);
  const r = store.resultOf(app);
  const mine = app.myScore || {};
  return [
    p.slot === 'rank' ? `${p.rank}` : (SLOT_NAME[p.slot] || '후보'),
    shortUniv(app.univ),
    app.typeSub || app.typeName || '',
    app.dept,
    app.quota == null ? '' : app.quota,
    mine.grade != null ? Number(mine.grade).toFixed(2) : '',
    s.linked && s.cut != null ? Number(s.cut).toFixed(2) : '',
    s.rate != null ? `${s.rate}:1` : '',
    app.minReqText ? '있음' : '',
    go ? (go.fixed ? day(go.from) : `${day(go.from)}~${day(go.to)}`) : '',
    resultText(r),
  ];
}

/**
 * 결과 한 줄.
 *
 * 1단계는 **떨어졌을 때만** 적는다. 통과한 것까지 적으면 「합격 · 불합격」이 되어
 * 무엇이 합격이고 무엇이 불합격인지 종이에서 읽히지 않는다.
 */
function resultText(r) {
  const bits = [];
  const s1 = String((r && r.stage1) || '');
  if (/불합격|탈락/.test(s1)) bits.push('1단계 탈락');
  if (r && r.final) bits.push(String(r.final));
  if (r && r.reason) bits.push(String(r.reason));
  if (r && r.waitNo) bits.push(`예비 ${r.waitNo}`);
  if (r && r.enrolled) bits.push(String(r.enrolled));
  return bits.join(' · ');
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
    '인쇄하면 학생 한 명이 한 쪽씩 나옵니다. 왼쪽에서 반을 고르면 그 반만 나옵니다.'));

  box.appendChild(tools(cls ? `${cls}반_진학대장` : '진학대장', () => {
    const rows = [['반', '학번', '이름', '전교과', ...LEDGER_COLS]];
    for (const s of students) {
      const total = (s.naesin || {})['전교과'] ?? (s.naesin || {})['전교과(100)'] ?? '';
      for (const app of ordered(s.hak)) {
        rows.push([s.cls, s.hak, s.name, total, ...ledgerRow(app)]);
      }
    }
    return rows;
  }));

  if (!students.length) {
    box.appendChild(el('p', 'empty-state', '이 반에 학생이 없습니다.'));
    return box;
  }

  const sheets = el('div', 'sheets');
  for (const s of students) sheets.appendChild(ledgerPage(s));
  box.appendChild(sheets);
  return box;
}

/** 학생 한 명의 한 쪽. 인쇄에서 쪽이 갈린다. */
function ledgerPage(student) {
  const page = el('section', 'sheet');

  const head = el('div', 'sheet-head');
  head.appendChild(el('div', 'name', `${student.hak} ${tidy(student.name)}`));

  const bits = [];
  const n = student.naesin || {};
  const total = n['전교과'] ?? n['전교과(100)'];
  if (total != null) bits.push(`전교과 ${total}`);
  const sn = student.suneung || {};
  const grades = ['국어', '수학', '영어', '탐구1', '탐구2']
    .map((k) => (sn[k] && sn[k].grade != null ? sn[k].grade : null));
  if (grades.some((g) => g != null)) {
    bits.push(`수능 ${grades.map((g) => (g == null ? '–' : g)).join('/')}`);
  }
  head.appendChild(el('div', 'meta', bits.join('  ·  ')));
  page.appendChild(head);

  const apps = ordered(student.hak);
  if (!apps.length) {
    page.appendChild(el('p', 'empty-state', '지원 내역이 없습니다.'));
    return page;
  }

  const tw = el('div', 'tw');
  const table = document.createElement('table');
  table.className = 'ledger';

  // 열 너비를 미리 정한다. 안 정하면 A4 세로에서 열한 칸이 제멋대로 나뉘어
  // 「건국대학 / 교(서울)」처럼 대학 이름이 가운데서 끊긴다.
  const cg = document.createElement('colgroup');
  for (const w of LEDGER_WIDTH) {
    const col = document.createElement('col');
    col.style.width = w;
    cg.appendChild(col);
  }
  table.appendChild(cg);

  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of LEDGER_COLS) tr.appendChild(el('th', null, c));
  thead.appendChild(tr);
  const tbody = document.createElement('tbody');
  const NUMS = new Set([0, 4, 5, 6, 7]);
  for (const app of apps) {
    const line = document.createElement('tr');
    ledgerRow(app).forEach((v, i) => {
      line.appendChild(el('td', NUMS.has(i) ? 'num' : null, v === '' ? '—' : String(v)));
    });
    tbody.appendChild(line);
  }
  table.appendChild(thead);
  table.appendChild(tbody);
  tw.appendChild(table);
  page.appendChild(tw);

  // 상담 메모는 이 학생에 관한 기록이라 대장에 함께 남는다
  const notes = store.notesOf(student.hak);
  if (notes.length) {
    page.appendChild(el('h3', 'sheet-sub', '상담 메모'));
    const ul = el('ul', 'sheet-notes');
    for (const note of notes) {
      const li = document.createElement('li');
      li.appendChild(el('span', 'when', String(note.at || '').slice(0, 10)));
      li.appendChild(el('span', '', note.text));
      ul.appendChild(li);
    }
    page.appendChild(ul);
  }
  return page;
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

function report() {
  const box = el('div');
  const rows = rowsForReport();
  const r = stats.report(rows);
  const o = r.overall;

  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '지원 결과 보고서'));
  head.appendChild(el('span', 'count num', `${o.applied}건`));
  box.appendChild(head);

  if (!o.decided) {
    box.appendChild(el('p', 'empty-state',
      '아직 결과가 들어오지 않았습니다. 즐겨찾기에 합격·불합격이 채워지면 이 자리에 통계가 나옵니다.'));
    return box;
  }
  if (o.decided < o.applied) {
    box.appendChild(el('p', 'note',
      `${o.applied}건 가운데 ${o.decided}건만 결과가 들어왔습니다.`
      + ' 아래 숫자는 지금까지 들어온 것만 센 값입니다.'));
  }
  if (o.unknown.length) {
    box.appendChild(el('p', 'note error',
      `결과 칸에서 알아보지 못한 표기가 있습니다 — ${o.unknown.join(', ')}.`
      + ' 이 건들은 합격으로도 불합격으로도 세지 않았습니다.'));
  }
  /*
   * 결재에 올라가는 문서다. **학생이 적고 아직 담임이 확인 안 한 건이 섞여 있으면**
   * 그렇다고 적어 둔다. 빼지는 않는다 — 확인을 기다리다 대장이 비는 것보다 낫다는
   * 것이 이 도구의 결정이다(CONTRACT §5.6b). 다만 말없이 섞는 것과는 다르다.
   */
  const waiting = rows.filter((x) => x.app.result && x.app.result.pending).length;
  if (waiting) {
    box.appendChild(el('p', 'note',
      `학생이 적고 아직 확인하지 않은 결과 ${waiting}건이 포함되어 있습니다.`
      + ' 보드 첫 화면에서 확인하실 수 있습니다.'));
  }

  box.appendChild(tools('지원결과보고서', () => reportTable(r)));

  const sheet = el('section', 'sheet');

  /* 1. 전체 현황 */
  sheet.appendChild(block('전체 현황', simple([
    ['총 지원', `${o.applied}건`, `지원한 학생 ${o.students}명 · ${o.univs}개 대학`],
    ['결과 나온 지원', `${o.decided}건`, ''],
    ['최초 합격', `${o.first}건`, o.passed ? `합격의 ${p1(o.firstShare)}` : ''],
    ['충원 합격', `${o.extra}건`, o.passed ? `합격의 ${p1(o.extraShare)}` : ''],
    ['총 합격', `${o.passed}건`,
      `${o.passPeople}명 합격${o.perPerson ? ` (1인당 ${o.perPerson.toFixed(1)}건)` : ''}`],
    ['최종 등록', `${o.enrolled}명`, ''],
  ])));

  /* 2. 같은 대학 안에서 교과 대 종합 */
  if (r.gyoVsJong.length) {
    const t = grid(
      ['대학', '교과 평균', '종합 평균', '차이', '유리한 전형', '교과 합격률', '종합 합격률'],
      r.gyoVsJong.map((x) => [
        x.univ, g2(x.gyoAvg), g2(x.jongAvg),
        `${x.gap > 0 ? '+' : ''}${x.gap.toFixed(2)}`,
        `${x.better} 유리`, p1(x.gyoRate), p1(x.jongRate),
      ]),
      [1, 2, 3, 5, 6],
    );
    const wrap = block('같은 대학 안에서 — 교과와 종합', t);
    wrap.insertBefore(el('p', 'hint',
      '전체 평균으로 견주면 「종합이 더 높은 성적을 요구한다」는 잘못된 결론이 나옵니다.'
      + ' 종합으로 상위권에 더 많이 넣기 때문입니다. 그래서 같은 대학 안에서만 견줍니다.'
      + ' 등급은 작을수록 좋으므로, 종합 평균이 더 크면 낮은 성적으로도 붙었다는 뜻입니다.'),
    wrap.querySelector('.tw'));
    sheet.appendChild(wrap);
  }

  /* 3. 전형별 */
  sheet.appendChild(block('전형별', grid(
    ['전형', '지원', '합격', '합격률', '충원 합격', '충원 비중', '1단계 탈락', '충원-최초 등급차'],
    r.byType.map((x) => [
      x.type, x.applied, x.passed, p1(x.rate), x.extra, p1(x.extraShare),
      x.stage1Out ? `${x.stage1Out}건 (불합격의 ${p1(x.stage1Share)})` : '—',
      x.extraGap == null ? '—' : `${x.extraGap > 0 ? '+' : ''}${x.extraGap.toFixed(2)}`,
    ]),
    [1, 2, 3, 4, 5],
  )));

  /* 4. 수능최저 */
  const mf = r.minFails;
  if (mf.count) {
    const wrap = block('수능 최저학력 기준', simple([
      ['최저 미충족 불합격', `${mf.count}건`, `전체 지원의 ${p1(mf.share)}`],
      ['가장 많은 대학', mf.byUniv.slice(0, 3).map((x) => `${x.univ} ${x.n}건`).join(' · '), ''],
      ['성적이 가장 좋았던 경우',
        mf.worst ? `${g2(mf.worst.grade)} · ${mf.worst.univ} ${mf.worst.dept}` : '—',
        '내신이 좋아도 최저에서 떨어집니다'],
    ]));
    sheet.appendChild(wrap);
  }

  /* 5. 대학별 커트라인 */
  // 지원 한 건에 합격 없음이면 표가 통째로 「—」다. 그런 대학은 싣지 않고 몇 곳을
  // 뺐는지만 적는다. 빈 표를 여덟 개 늘어놓으면 정작 볼 것이 묻힌다.
  const worth = r.byUniv.filter((u) => u.passed > 0 || u.applied >= 2);
  const dropped = r.byUniv.length - worth.length;

  const uni = el('div', 'detail-block');
  uni.appendChild(el('h3', '', `대학별 합격선 (지원 많은 순 ${worth.length}곳)`));
  uni.appendChild(el('p', 'hint',
    '「최고」는 합격자 중 가장 좋은 등급, 「커트」는 가장 낮은 등급입니다.'
    + ' 커트는 그 해 그 대학의 마지막 자리이지, 다음 해에도 그 성적이면 된다는 뜻은 아닙니다.'
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
    const depts = u.byType.flatMap((t) => t.depts).sort((a, b) => a.grade - b.grade).slice(0, 6);
    if (depts.length) {
      sub.appendChild(el('p', 'hint',
        `합격 학과 — ${depts.map((d) => `${d.dept} (${g2(d.grade)})`).join(', ')}`));
    }
    uni.appendChild(sub);
  }
  sheet.appendChild(uni);

  /* 6. 등급대별 */
  if (r.byBand.length) {
    const wrap = block('등급대별로 실제 어디에 붙었나', grid(
      ['등급대', '합격 학생', '합격한 대학'],
      r.byBand.map((b) => [
        b.label, `${b.people}명`,
        b.univs.slice(0, 8).map((x) => `${x.univ} ${x.n}`).join(' · '),
      ]),
      [1],
    ));
    wrap.insertBefore(el('p', 'hint',
      '남이 만든 배치표가 아니라 우리 학생들이 실제로 합격한 곳입니다.'),
    wrap.querySelector('.tw'));
    sheet.appendChild(wrap);
  }

  box.appendChild(sheet);
  return box;
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
  const tbody = document.createElement('tbody');
  for (const [k, v, note] of list) {
    const tr = document.createElement('tr');
    tr.appendChild(el('th', 'rowhead', k));
    tr.appendChild(el('td', 'num', String(v)));
    tr.appendChild(el('td', 'src', note || ''));
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
