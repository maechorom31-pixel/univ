/**
 * 반 보드 — 6칸 (P2)
 * =====================================================================
 * 왼쪽에 반과 학생, 오른쪽에 그 학생의 6칸. 한 학생을 끝내고 다음으로 넘어간다.
 *
 * 자리를 옮기는 방법을 둘 둔다.
 *   - 카드마다 놓인 선택 상자: 어느 기기에서나 되고 키보드로도 된다
 *   - 끌어다 놓기: 마우스가 있을 때 더 빠르다
 * 끌어다 놓기만 두면 터치 기기에서 손이 묶인다.
 *
 * 6칸이 찬 상태에서 그 자리에 다른 걸 놓으면 **원래 있던 것을 후보로 밀어낸다.**
 * 조용히 사라지지 않도록 무엇이 밀려났는지 화면에 남긴다.
 *
 * 카드에는 견줄 숫자 셋만 둔다. 나머지(50컷·실질경쟁률·연도별 추이·일정·최저·메모)는
 * 카드를 눌러 여는 상세(card.js)에서 본다. 상세는 자리를 옮기지 않으므로
 * 보드 본문과 따로 그린다 — 순위를 바꿔도 열어 둔 상세가 닫히지 않는다.
 */
import * as store from './store.js';
import { detailPanel } from './card.js';
import { normType, outsideLimit, isGuessedFit } from './match.js';
import { josa, rate1, minReqShort, methodLine, interviewShare } from './text.js';

const RANKS = [1, 2, 3, 4, 5, 6];
const SLOT_LABEL = { rank: '순위', pool: '후보', archive: '보관', tray: '전문대' };

const MY_CLASS_KEY = 'board.myClass';

let myClass = '';    // 이 컴퓨터의 기본 반 (이 컴퓨터만의 취향이라 store에 두지 않는다)
let notice = '';
let busy = false;

try { myClass = localStorage.getItem(MY_CLASS_KEY) || ''; } catch (err) { myClass = ''; }

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls2, text) => {
  const node = document.createElement(tag);
  if (cls2) node.className = cls2;
  if (text != null) node.textContent = text;
  return node;
};

/** 마지막 어절이 짧으면 앞 어절에 붙여 혼자 한 줄로 떨어지지 않게 한다. */
const tidy = (s) => String(s || '').replace(/ (?=[^ ]{1,4}$)/, ' ');

/** 받침을 보고 조사를 고른다. 화면에 `학부을(를)` 같은 표기를 내지 않기 위해서다. */

/** 알림에 쓸 짧은 이름 — 캠퍼스 괄호를 떼고 학과를 붙인다. */
const shortName = (app) => `${app.univ.replace(/\(.*/, '')} ${app.dept}`;

export function start() {
  store.on('change', (what) => {
    if (what === 'data') {
      const list = store.classes();
      if (!store.selection.cls) store.select({ cls: list.includes(myClass) ? myClass : (list[0] || '') });
    }
    // 명단은 자료가 바뀔 때만이 아니라 **쓰기가 일어날 때도** 다시 그린다.
    // 6칸 숫자와 확인 대기 배지가 거기 붙어 있어서, 결과를 확인해도 배지가
    // 그대로 남아 있으면 담임이 같은 것을 두 번 연다.
    if (what === 'data' || what === 'state') renderRoster();
    render();
    renderDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && store.selection.appId) closeDetail();
  });
  /*
   * **탭에 돌아오면 스스로 다시 불러온다.**
   *
   * 학생이 밤에 순위·결과·면접일을 바꿔도 보드는 몰랐다 — 새로고침 단추를
   * 눌러야 보였고, 안 누르면 지난 화면으로 상담을 시작한다. 담임의 아침은
   * 대개 「어제 열어 둔 탭으로 돌아오기」라서, 그 순간이 다시 불러올 때다.
   *
   * 1분 안에 두 번은 안 부른다 — 탭을 오가며 일하는 동안 호출이 쌓이면
   * Apps Script 하루 한도를 갉아먹는다. 보기용 자료로 열었을 때는 안 부른다.
   */
  let lastPull = Date.now();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    if (!store.live() || !store.state.ready || busy) return;
    if (Date.now() - lastPull < 60000) return;
    lastPull = Date.now();
    try {
      await store.load();
    } catch (err) {
      // 잠깐 끊긴 것일 수 있다. 다음에 돌아올 때 다시 시도한다 — 화면은 그대로 둔다.
    }
  });
  /*
   * 단계(고민 ↔ 확정)가 바뀌면 카드를 다시 그린다. 예전에는 `body[data-stage]` 를
   * 적어 두기만 하고 아무도 안 읽어서, 단추가 탭만 바꾸고 화면은 그대로였다.
   */
  new MutationObserver(() => { render(); renderDetail(); })
    .observe(document.body, { attributes: true, attributeFilter: ['data-stage'] });
  render();
  renderDetail();
}

/* ── 반 · 학생 ────────────────────────────────────────────────── */

function renderRoster() {
  const tabs = $('#tabs');
  tabs.textContent = '';
  const { cls } = store.selection;
  const list = store.classes();
  for (const c of list) {
    const b = el('button', 'btn', c === myClass ? `${c}반 · 기본` : `${c}반`);
    b.setAttribute('aria-pressed', String(c === cls));
    b.onclick = () => { store.select({ cls: c, hak: '', appId: '' }); notice = ''; renderRoster(); render(); };
    tabs.appendChild(b);
  }
  if (list.length > 1) {
    const all = el('button', 'btn', '학년 전체');
    all.setAttribute('aria-pressed', String(cls === ''));
    all.onclick = () => { store.select({ cls: '', hak: '', appId: '' }); notice = ''; renderRoster(); render(); };
    tabs.appendChild(all);
  }

  // 학교 컴퓨터를 여럿이 나눠 쓰므로 이 컴퓨터가 늘 여는 반을 기억해 둔다.
  const scope = $('#scope');
  scope.textContent = '';
  if (cls && cls !== myClass) {
    scope.appendChild(el('span', '', myClass ? `기본은 ${myClass}반입니다.` : '기본 반이 정해져 있지 않습니다.'));
    const set = el('button', 'btn', `${cls}반을 기본으로`);
    set.onclick = () => {
      myClass = cls;
      try { localStorage.setItem(MY_CLASS_KEY, myClass); } catch (err) { /* 저장이 막혀도 이번엔 쓴다 */ }
      renderRoster();
    };
    scope.appendChild(set);
  } else if (!cls) {
    scope.appendChild(el('span', '', '학년 전체를 보는 중입니다.'));
  }

  const roster = $('#roster');
  roster.textContent = '';
  const students = store.studentsOf(cls);
  if (!students.length) {
    roster.appendChild(el('li', '', '이 반에 학생이 없습니다.'));
    return;
  }
  for (const s of students) {
    const apps = store.appsOf(s.hak);
    const ranked = apps.filter((a) => store.placementOf(a.id).slot === 'rank').length;
    const li = el('li');
    const b = el('button');
    b.setAttribute('aria-current', String(s.hak === store.selection.hak));
    b.onclick = () => { store.select({ hak: s.hak, appId: '' }); notice = ''; renderRoster(); render(); };
    b.appendChild(el('span', 'hak num', s.hak));
    b.appendChild(el('span', 'nm', tidy(s.name)));
    const cnt = el('span', `cnt${ranked >= 6 ? ' full' : ''}`, `${ranked}/6`);
    cnt.title = `확정 ${ranked}건 · 지원 ${apps.length}건`;
    b.appendChild(cnt);

    // 12월에는 6칸 숫자보다 「확인할 게 있나」가 급하다.
    // 학생이 밤사이 적어 둔 것을 담임이 명단에서 바로 알아야 한다 —
    // 121명을 한 명씩 열어 볼 수는 없다.
    const waiting = apps.filter((a) => store.resultOf(a).pending).length;
    if (waiting) {
      const dot = el('span', 'todo num', String(waiting));
      dot.title = `학생이 적은 결과 ${waiting}건 — 확인해 주세요`;
      b.appendChild(dot);
    }
    li.appendChild(b);
    roster.appendChild(li);
  }
  $('#roster-count').textContent = `${students.length}명`;
}

/* ── 보드 ─────────────────────────────────────────────────────── */

function render() {
  const main = $('#board');
  if (main.hidden) return;         // 일정 화면을 보는 중이면 손대지 않는다
  main.textContent = '';

  if (!store.state.ready) {
    main.appendChild(skeleton());
    return;
  }
  if (store.state.error) main.appendChild(banner(store.state.error, true));

  /*
   * **학생이 바꾼 순위를 담임이 알아채게 한다.**
   *
   * 바뀐 것 자체는 시트 기록에 남지만 아무도 기록 탭을 열어 보지 않는다.
   * 최근 사흘 안에 학생이 바꾼 배치가 있으면 보드 맨 위에 한 줄로 말한다 —
   * 사흘인 이유는 주말을 건너 월요일 아침에도 보여야 해서다.
   */
  const cut = (() => {
    const t = new Date(Date.now() - 3 * 24 * 3600 * 1000 + 9 * 3600 * 1000);
    return t.toISOString().slice(0, 19);
  })();
  const moved = (store.state.studentMoves || []).filter((m) => m.at && m.at.slice(0, 19) >= cut);
  if (moved.length) {
    /*
     * **닫을 수 있다 — 새 변경이 오면 다시 뜬다.** 닫기는 「여기까지 봤다」라서
     * 마지막으로 본 변경 시각을 이 컴퓨터에 기억해 두고, 그보다 늦은 변경이
     * 생겼을 때만 다시 세운다. 이름을 누르면 그 학생 보드로 간다.
     */
    const latest = moved.map((m) => String(m.at)).sort().pop();
    let seenAt = '';
    try { seenAt = localStorage.getItem('board.movesSeen') || ''; } catch (err) { seenAt = ''; }
    if (latest > seenAt) {
      const who = [...new Set(moved.map((m) => m.hak))].sort();
      const name = (h) => {
        const st = store.state.students.get(h);
        return st ? `${h} ${st.name}` : h;
      };
      const box = el('p', 'note moves-note');
      box.appendChild(document.createTextNode('최근 사흘 안에 학생이 순위를 바꿨습니다 — '));
      who.slice(0, 5).forEach((h, i) => {
        if (i) box.appendChild(document.createTextNode(', '));
        const b = el('button', 'linkish', name(h));
        b.type = 'button';
        b.onclick = () => { store.select({ hak: h, appId: '' }); };
        box.appendChild(b);
      });
      box.appendChild(document.createTextNode(
        `${who.length > 5 ? ` 외 ${who.length - 5}명` : ''} (${moved.length}건)`));
      const close = el('button', 'btn dismiss', '닫기');
      close.type = 'button';
      close.onclick = () => {
        try { localStorage.setItem('board.movesSeen', latest); } catch (err) { /* 이번 화면에서만 닫힌다 */ }
        render();
      };
      box.appendChild(close);
      main.appendChild(box);
    }
  }

  // 원본 탭 이름이 아는 것과 다르면 알린다. 조용히 첫 탭을 읽고 「0명」만 뜨면
  // 왜 비었는지 알 길이 없다.
  const src = store.state.source || {};
  /*
   * 딴 파일의 원본을 열지 못했으면 **이 시트의 옛 원본을 읽고 있는 것**이다.
   * 그걸 안 알리면 지난주 자료를 이번 주 자료로 읽는다. 제일 조용히 틀리는 길이다.
   */
  if (src.warn) main.appendChild(banner(`${src.warn} 이 시트의 원본 탭을 대신 읽었습니다.`, true));
  else if (src.book) {
    main.appendChild(banner(`즐겨찾기 원본을 「${src.book}」에서 읽었습니다.`));
  }
  /*
   * 예전에는 탭 이름이 「다운로드 원본」·「원본」·「즐겨찾기」가 아니면 붉은 줄로
   * 알렸다. 이제 파서가 **머리글을 직접 찾아** 아는 칸이 넷보다 적으면 사유를
   * 돌려주므로(`parseProblem`), 이름으로 짐작하던 이 줄은 겹치는 말이다.
   * 탭 이름이 `Sheet1` 이어도 제대로 읽히면 아무 문제가 없다.
   */
  /*
   * **머리글을 못 찾았으면 그 사실이 먼저다.** 조용히 「0명」이 되면 선생님은
   * 자료가 없는 것인지 파일을 잘못 짚은 것인지 알 수 없다.
   */
  if (store.state.parseProblem) {
    main.appendChild(banner(store.state.parseProblem, true));
  }
  /*
   * **열쇠를 안 걸어 뒀으면 그 사실을 말한다.**
   * 학생 링크에 배포 주소가 들어 있어서, 열쇠가 없으면 학생이 주소만 떼어
   * 전교생 이름·내신·지원 목록과 교사 비공개 메모까지 가져갈 수 있다.
   */
  if (store.state.openToAll) {
    main.appendChild(banner(
      '기본 교사 열쇠를 쓰는 중입니다. 학생이 제 링크에서 주소만 떼어 전교생 자료를'
      + ' 불러 가는 것은 막지만, 이 열쇠는 저장소에 적혀 있어 찾아본 사람은 읽을 수'
      + ' 있습니다. 더 단단히 잠그시려면 시트 「설정」 탭 C2 에 아무 글자나 적고'
      + ' 보드 설정 화면에 같은 글자를 넣어 주세요.',
    ));
  }
  /*
   * **버린 줄이 있으면 말한다.** 여태 세기만 하고 안 냈다.
   * 대학이나 학과 칸이 빈 줄은 지원으로 못 세는데, 그 학생은 명단에 이미 올라가
   * 있어서 보드만 텅 빈다 — 자료가 없는 건지 샌 건지 알 수 없는 상태가 된다.
   */
  if (store.state.skipped) {
    const who = (store.state.dropped || []).slice(0, 4)
      .map((d) => `${d.hak}(${d.n}줄)`).join(' · ');
    main.appendChild(banner(
      `대학이나 학과 칸이 비어 ${store.state.skipped}줄을 못 읽었습니다`
      + `${who ? ` — ${who}` : ''}. 시트에서 그 줄을 확인해 주세요.`,
      true,
    ));
  }
  if (store.state.unknownCols.length) {
    main.appendChild(banner(
      `엑셀에서 알아보지 못한 칸이 ${store.state.unknownCols.length}개 있습니다 — `
      + store.state.unknownCols.slice(0, 4).join(', '),
    ));
  }
  if (notice) main.appendChild(banner(notice));
  main.appendChild(waitingPanel());

  const student = store.state.students.get(store.selection.hak);
  if (!student) {
    main.appendChild(hint('왼쪽에서 학생을 고르면 지원 현황이 나옵니다.'));
    return;
  }

  main.appendChild(header(student));

  const apps = store.appsOf(student.hak);
  /*
   * **지원이 하나도 없으면 빈 화면 대신 사유를 적는다.**
   * 명단에는 있는데 보드가 텅 비면 무엇이 잘못된 건지 알 수 없다.
   */
  if (!apps.length) {
    const lost = (store.state.dropped || [])
      .find((d) => String(d.hak) === String(student.hak));
    main.appendChild(hint(lost
      ? `즐겨찾기에 이 학생 줄이 ${lost.n}개 있는데 ${lost.why}.`
        + ' 그래서 지원으로 세지 못했습니다 — 시트에서 그 줄을 확인해 주세요.'
      : '즐겨찾기에 이 학생의 지원 줄이 없습니다.'
        + ' 원본을 새로 받으셨다면 다시 불러와 주세요.'));
    return;
  }
  const general = apps.filter((a) => !outsideLimit(a));
  const others = apps.filter((a) => outsideLimit(a));
  const at = (r) => general.find((a) => {
    const p = store.placementOf(a.id);
    return p.slot === 'rank' && p.rank === r;
  });

  /*
   * **여섯 칸은 늘 그린다 — 비어 있어도.**
   *
   * 한때 한 칸도 안 정했으면 격자를 감췄다. 화면을 아낀다는 뜻이었는데, 정작
   * 상담을 시작할 때 **채울 자리가 안 보였다.** 여섯 칸은 수시가 여섯 장이라는
   * 사실 그 자체고, 빈 칸 여섯은 「아직 아무것도 안 정했다」를 한눈에 말한다.
   * 놓을 자리가 먼저 있고, 카드를 거기에 옮기는 것이 순서다.
   *
   * 대신 비었을 때는 칸을 낮게 그려(`slots thin`) 아래 후보 목록을 가리지 않는다.
   */
  const placed = RANKS.map(at).filter(Boolean);
  main.appendChild(label('지원 6칸'));
  const slots = el('div', placed.length ? 'slots' : 'slots thin');
  for (const r of RANKS) {
    const app = at(r);
    /*
     * 6칸 카드도 후보 목록(cardRow)과 같이 한 장씩 감싼다. 목록만 감싸 놓으면
     * 순위에 올라간 카드가 터지는 순간 render() 가 멈춰 보드가 통째로 빈다 —
     * 막으려던 바로 그 실패가 제일 눈에 띄는 자리에서 다시 난다.
     */
    try {
      slots.appendChild(app ? card(app, r, student) : emptySlot(r));
    } catch (err) {
      const box = el('div', 'card broken');
      box.appendChild(el('div', 'rank', `${r}순위`));
      box.appendChild(el('div', 'univ', tidy((app && app.univ) || '대학 없음')));
      box.appendChild(el('p', 'warn', '이 카드를 그리지 못했습니다. 선생님께 알려 주세요.'));
      box.title = String((err && err.message) || err);
      slots.appendChild(box);
    }
  }
  main.appendChild(slots);

  /*
   * **지원한 전문대는 6칸 바로 아래 카드로 붙는다.** 전문대·과기원은 순위가
   * 없지만 「지원했다」는 사실은 6칸과 같은 무게다 — 후보 무리에 섞여 있으면
   * 원서를 냈는지 훑어서는 안 보인다. 기본은 후보고, 「지원」으로 올린 것만
   * 여기 선다.
   */
  const trayApps = others.filter((a) => store.placementOf(a.id).slot === 'tray');
  if (trayApps.length) {
    main.appendChild(label('전문대 지원 — 6회 밖'));
    const trayRow = el('div', 'slots');
    for (const app of trayApps) {
      try {
        trayRow.appendChild(card(app, 'tray', student));
      } catch (err) {
        const box = el('div', 'card broken');
        box.appendChild(el('div', 'univ', tidy(app.univ || '대학 없음')));
        box.appendChild(el('p', 'warn', '이 카드를 그리지 못했습니다.'));
        trayRow.appendChild(box);
      }
    }
    main.appendChild(trayRow);
  }

  if (!placed.length) {
    main.appendChild(el('p', 'hint',
      '아래 지원을 카드째 끌어다 놓거나, 카드의 순위 고르개로 칸을 채웁니다.'));
  }

  // 보관도 순위도 아닌 것은 전부 후보로 본다.
  // 시트에 예전 칸 이름이 남아 있거나 전문대로 잡혔던 지원이 일반대로 바뀌면
  // 어느 무리에도 안 걸려 카드가 조용히 사라진다. 상담 도구에서 가장 나쁜 실패다.
  const archive = general.filter((a) => store.placementOf(a.id).slot === 'archive');
  const pool = general.filter((a) => {
    const slot = store.placementOf(a.id).slot;
    return slot !== 'archive' && slot !== 'rank';
  });

  /*
   * **원서를 내고 나면 후보·보관은 지나간 이야기다.**
   * 9월 전에는 여섯 칸을 정하려고 후보를 계속 오르내리지만, 원서를 낸 뒤에는 그 칸이
   * 화면 절반을 차지한 채 아무 일도 안 한다. 12월에 봐야 하는 것은 여섯 칸의 결과다.
   *
   * 다만 **지우지는 않는다.** 접어 둘 뿐이라 눌러서 펼 수 있고, 접힌 채로도 끌어다
   * 놓을 수 있어야 한다(전문대 추가 지원처럼 뒤늦게 움직이는 일이 있다).
   */
  const fold = document.body.dataset.stage === 'fixed';
  const put = (title, apps, help, slot) => {
    const panel = group(title, apps, help, student, slot);
    if (!fold) { main.appendChild(panel); return; }
    const d = document.createElement('details');
    d.className = 'folded';
    const sum = document.createElement('summary');
    sum.textContent = `${title} ${apps.length}건`;
    d.appendChild(sum);
    d.appendChild(panel);
    // 접힌 채로 끌어다 놓으면 펴 준다 — 안 그러면 놓을 자리가 안 보인다
    d.addEventListener('dragover', () => { d.open = true; });
    main.appendChild(d);
  };

  put('후보', pool,
    '아직 순위를 정하지 않은 지원입니다. 6칸에서 끌어다 놓으면 여기로 옵니다.', 'pool');
  if (others.length) {
    const keptPool = others.filter((a) => {
      const slot = store.placementOf(a.id).slot;
      return slot !== 'archive' && slot !== 'tray';   // 지원(tray)은 6칸 아래 카드로 올라갔다
    });
    const stored = others.filter((a) => store.placementOf(a.id).slot === 'archive');
    // 전문대는 6회 제한 밖이라 12월에도 살아 있는 이야기다. 접지 않는다.
    if (keptPool.length) {
      main.appendChild(group('전문대 · 특수대 후보 — 6회 밖', keptPool,
        '아직 지원을 확정하지 않은 6회 밖 후보입니다. 원서를 냈으면 「지원」으로 올리세요 — 위 6칸 아래에 카드로 붙습니다.',
        student, 'tray'));
    }
    if (stored.length) put('전문대 보관', stored, '', 'archive');
  }
  put('보관', archive,
    '올해 넣지 않기로 한 지원입니다. 끌어다 놓으면 여기로 옵니다.', 'archive');
}

/**
 * 학생이 적어 두고 확인을 기다리는 결과.
 *
 * 12월에는 이게 담임이 보드를 여는 이유다. 학생 121명이 밤사이 대학 홈페이지를 보고
 * 결과를 적어 두면, 아침에 열었을 때 **누구를 봐야 하는지가 첫 화면에 있어야** 한다.
 * 명단의 배지만으로는 반 전체를 훑어야 하고, 다른 반 것은 아예 안 보인다.
 */
/**
 * 학생이 넣고 아직 확인 안 된 **날짜**.
 *
 * 확인 전에는 겹침을 「겹칠 수 있음」까지만 말한다. 그래서 확인이 밀리면 진짜 겹침이
 * 눈에 안 띈다. 결과와 같은 자리에 같은 꼴로 둔다 — 담임이 아침에 보는 곳이 여기다.
 */
function waitingDates() {
  const wrap = el('div');
  const list = store.pendingDates(store.selection.cls);
  if (!list.length) return wrap;

  const box = el('section', 'panel todo-panel');
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '학생이 넣은 날짜'));
  head.appendChild(el('span', 'count num', `${list.length}건`));
  box.appendChild(head);
  box.appendChild(el('p', 'section-label',
    '확인해야 겹침 판정에 쓰입니다. 확인 전에는 「겹칠 수 있음」까지만 봅니다.'));

  const stack = el('div', 'stack');
  for (const x of list) {
    const row = el('div', 'row todo-row');
    const txt = el('div', 'txt');
    txt.appendChild(el('div', 'univ',
      `${x.student.hak} ${tidy(x.student.name)} — ${shortName(x.app)}`));
    txt.appendChild(el('div', 'dept', `${x.kind} ${x.date.from}`
      + (x.date.to && x.date.to !== x.date.from ? `~${x.date.to}` : '')));
    row.appendChild(txt);

    const ok = el('button', 'btn', '맞습니다');
    ok.type = 'button';
    ok.onclick = async () => {
      ok.disabled = true;
      try {
        await store.approveDate(x.app, x.kind);
        notice = `${x.student.hak} ${tidy(x.student.name)} ${x.kind}일을 확정했습니다.`;
      } catch (err) {
        ok.disabled = false;
        notice = `확정하지 못했습니다 — ${err.message}`;
      }
      render();
    };
    row.appendChild(ok);
    stack.appendChild(row);
  }
  box.appendChild(stack);
  wrap.appendChild(box);
  return wrap;
}

/** 학생이 적고 아직 확인 안 된 칸 — 수험번호·최종경쟁률·생년월일. */
function waitingFields() {
  const wrap = el('div');
  const list = store.pendingFields(store.selection.cls);
  if (!list.length) return wrap;

  const box = el('section', 'panel todo-panel');
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '학생이 적은 칸'));
  head.appendChild(el('span', 'count num', `${list.length}건`));
  box.appendChild(head);
  box.appendChild(el('p', 'section-label',
    '원서를 내고 나서야 알 수 있는 값입니다. 맞으면 눌러 확인해 주세요.'));

  const stack = el('div', 'stack');
  for (const x of list) {
    const row = el('div', 'row todo-row');
    const txt = el('div', 'txt');
    txt.appendChild(el('div', 'univ', `${x.student.hak} ${tidy(x.student.name)}`
      + (x.app ? ` — ${shortName(x.app)}` : '')));
    txt.appendChild(el('div', 'dept', `${x.field} ${x.value}`));
    row.appendChild(txt);
    const ok = el('button', 'btn', '맞습니다');
    ok.type = 'button';
    ok.onclick = async () => {
      ok.disabled = true;
      try {
        await store.approveField(x.app || x.student.hak, x.field);
        notice = `${x.student.hak} ${tidy(x.student.name)} ${x.field}을(를) 확인했습니다.`;
      } catch (err) {
        ok.disabled = false;
        notice = `확인하지 못했습니다 — ${err.message}`;
      }
      render();
    };
    row.appendChild(ok);
    stack.appendChild(row);
  }
  box.appendChild(stack);
  wrap.appendChild(box);
  return wrap;
}

/**
 * **학생이 적어 놓고 아직 답을 못 받은 메모.**
 *
 * 날짜·칸·결과와 달리 메모에는 「맞습니다」로 누를 것이 없다. 그렇다고 그냥
 * 두면 학생이 적은 것을 카드를 열기 전까지 모른다.
 *
 * 「안 읽음」을 따로 기록하는 대신 **대화로 읽는다** — 그 지원의 메모 가운데
 * 마지막 말이 학생 것이면 아직 답이 안 간 것이다(`store.unansweredNotes`).
 * 선생님이 메모를 하나 달면 저절로 빠진다. 그래서 단추가 「열기」 하나다.
 */
function waitingNotes() {
  const wrap = el('div');
  const list = store.unansweredNotes(store.selection.cls);
  if (!list.length) return wrap;

  const box = el('section', 'panel todo-panel');
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '학생이 적은 메모'));
  head.appendChild(el('span', 'count num', `${list.length}건`));
  box.appendChild(head);
  box.appendChild(el('p', 'section-label',
    '학생이 마지막으로 적은 것입니다. 카드를 열어 메모를 하나 달면 목록에서 빠집니다.'));

  const stack = el('div', 'stack');
  for (const x of list) {
    const row = el('div', 'row todo-row');
    const txt = el('div', 'txt');
    txt.appendChild(el('div', 'univ', `${x.student.hak} ${tidy(x.student.name)}`
      + (x.app ? ` — ${shortName(x.app)}` : '')));
    txt.appendChild(el('div', 'dept', [
      x.note.text,
      x.n > 1 ? `외 ${x.n - 1}건` : '',
      String(x.note.at || '').slice(0, 10),
    ].filter(Boolean).join(' · ')));
    row.appendChild(txt);

    const go = el('button', 'btn', '열기');
    go.type = 'button';
    go.onclick = () => {
      store.select({ hak: x.student.hak });
      renderRoster();
      if (x.app) openDetail(x.app, go);
    };
    row.appendChild(go);
    stack.appendChild(row);
  }
  box.appendChild(stack);
  wrap.appendChild(box);
  return wrap;
}

function waitingPanel() {
  const wrap = el('div');
  wrap.appendChild(waitingDates());
  wrap.appendChild(waitingFields());
  wrap.appendChild(waitingNotes());
  const list = store.pendingResults(store.selection.cls);
  if (!list.length) return wrap;

  const box = el('section', 'panel todo-panel');
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '학생이 적은 결과'));
  head.appendChild(el('span', 'count num', `${list.length}건`));
  box.appendChild(head);
  box.appendChild(el('p', 'section-label',
    '학생이 발표를 보고 적어 둔 것입니다. 카드를 열어 「맞습니다」를 누르면 확인됩니다.'));

  const stack = el('div', 'stack');
  for (const x of list) {
    const row = el('div', 'row todo-row');
    const txt = el('div', 'txt');
    txt.appendChild(el('div', 'univ',
      `${x.student.hak} ${tidy(x.student.name)} — ${shortName(x.app)}`));
    /*
     * 최종이 비어 있고 1단계만 적힌 건이 있다(1단계 발표만 난 자리).
     * `final` 만 찍으면 그 줄이 빈칸으로 보여서 무엇을 확인하라는 건지 알 수 없다.
     */
    const said = x.result.final
      || (x.result.stage1 ? `1단계 ${x.result.stage1}` : '')
      || '결과 지움';
    txt.appendChild(el('div', 'dept', [
      said,
      x.result.waitNo ? `예비 ${x.result.waitNo}번` : '',
      String(x.result.at || '').slice(0, 10),
    ].filter(Boolean).join(' · ')));
    row.appendChild(txt);

    const go = el('button', 'btn', '열기');
    go.type = 'button';
    go.onclick = () => {
      store.select({ hak: x.student.hak });
      renderRoster();
      openDetail(x.app, go);
    };
    row.appendChild(go);
    stack.appendChild(row);
  }
  box.appendChild(stack);
  wrap.appendChild(box);
  return wrap;
}

function header(s) {
  const box = el('div', 'who');
  box.appendChild(el('div', 'name', `${s.hak} ${tidy(s.name)}`));
  const meta = el('div', 'meta');
  const bits = [];
  const all = s.naesin || {};
  const total = all['전교과'] ?? all['전교과(100)'];
  if (total != null) bits.push(`전교과 ${total}`);
  const sn = s.suneung || {};
  const order = ['국어', '수학', '영어', '탐구1', '탐구2'];
  const grades = order.map((k) => (sn[k] && sn[k].grade != null ? sn[k].grade : null));
  if (grades.some((g) => g != null)) {
    bits.push(`수능 ${grades.map((g) => (g == null ? '–' : g)).join('/')}`);
  }
  meta.textContent = bits.join('  ·  ') || '성적 정보가 없습니다';
  box.appendChild(meta);
  return box;
}

/* ── 카드 ─────────────────────────────────────────────────────── */

/* ── 끌어다 놓기 ──────────────────────────────────────────────────
 * 6칸만 끌 수 있고 후보·보관은 못 끄는 상태였다. 그런데 상담에서 제일 잦은 손짓이
 * 「후보에 있던 걸 6칸으로」와 「6칸에 있던 걸 후보로」다. 정작 그 둘이 안 됐다.
 *
 * 끄는 쪽과 받는 쪽을 도우미 둘로 갈라, 카드·목록 줄·빈 칸·묶음 패널에 다 붙인다.
 */

/** 끌 수 있게 만든다. */
function dragSource(box, app) {
  box.draggable = true;
  box.dataset.id = app.id;
  box.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', app.id);
    e.dataTransfer.effectAllowed = 'move';
    box.classList.add('dragging');
  });
  box.addEventListener('dragend', () => box.classList.remove('dragging'));
}

/**
 * 받을 수 있게 만든다.
 * @param {Function} where  놓인 지원 → 'rank:3' 같은 자리 문자열. null 이면 안 받는다
 */
function dropTarget(box, where) {
  const leave = () => box.classList.remove('over');
  box.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    box.classList.add('over');
  });
  box.addEventListener('dragleave', leave);
  box.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();          // 묶음 패널이 카드의 놓기를 가로채지 않게
    leave();
    const app = store.state.apps.get(e.dataTransfer.getData('text/plain'));
    if (!app) return;
    const slot = where(app);
    if (slot) move(app, slot);
  });
}

/**
 * 이 지원에 상담 메모가 있으면 표시를 단다.
 *
 * **꼬리표로 달지 않는다.** 「메모 있음」이라 적으면 「30명」·「면접 9/4」 옆에서
 * 자리를 뺏는데, 메모는 판단을 바꾸는 값이 아니라 「여기 이야기가 있었다」는 자국이다.
 * 카드 왼쪽에 얇은 띠 하나로 둔다 — 여섯 칸을 훑을 때 어디를 이미 상담했는지가
 * 한눈에 보이고, 안 훑을 때는 눈에 안 걸린다.
 */
function markMemo(box, app) {
  const list = store.notesOf(app.hak, app.id);
  if (!list.length) return;
  box.classList.add('memoed');
  // 학생이 적은 것이 섞여 있으면 몇 건인지 같이 적는다 — 열기 전에 알 수 있게
  const mine = list.filter(store.byStudent).length;
  box.title = `상담 메모 ${list.length}건${mine ? ` (학생이 적은 것 ${mine}건)` : ''}`;
}

/**
 * **등록한 곳은 테두리로 표시한다.**
 *
 * 12월에 여섯 칸을 보면 첫 물음이 「어디로 갔나」다. 합격이 여럿이어도 가는 곳은
 * 하나고, 그 하나가 한눈에 보여야 한다. 꼬리표 「등록」을 다는 것보다 카드 자체를
 * 둘러 두는 편이 훑을 때 빨리 걸린다.
 */
function markEnrolled(box, app) {
  const r = store.resultOf(app);
  if (!r || !r.enrolled) return;
  // 「미등록」도 「등록」을 품고 있다. stats.js verdict 과 같은 규칙으로 가른다.
  if (/미등록|포기|취소|안\s*함|^N$/.test(String(r.enrolled))) return;
  box.classList.add('enrolled');
  box.title = [box.title, '이 학교에 등록했습니다'].filter(Boolean).join(' · ');
}

function card(app, rank, student) {
  const box = el('div', 'card');
  markMemo(box, app);
  markEnrolled(box, app);
  dragSource(box, app);
  // 찬 칸에 놓으면 자리를 맞바꾼다. move() 가 밀려난 것을 알아서 옮긴다.
  dropTarget(box, (dropped) => (dropped.id === app.id ? null : (rank === 'tray' ? 'tray' : `rank:${rank}`)));
  openable(box, app);

  if (rank === 'tray') box.appendChild(el('div', 'rank', '전문대 지원'));
  else if (rank) box.appendChild(el('div', 'rank', `${rank}순위`));
  box.appendChild(el('div', 'univ', tidy(app.univ.replace(/\s*[-–—]\s*.*$/, ''))));
  box.appendChild(el('div', 'dept', `${tidy(app.dept)} · ${app.typeSub || app.typeName || ''}`));
  box.appendChild(figures(app, student));
  box.appendChild(pills(app));
  box.appendChild(mover(app));
  return box;
}

/**
 * 카드를 눌러 상세를 연다.
 *
 * 선택 상자와 단추까지 삼키면 자리를 못 옮기므로, 그 안에서 시작된 누름은 흘려보낸다.
 * 마우스로 끌어다 놓기를 하다 손이 살짝 움직여도 상세가 열리지 않도록,
 * 끌기가 시작됐으면 이번 누름은 없던 것으로 친다.
 */
const PASS = 'select, button, a, input, label, textarea, option';
function openable(box, app) {
  let dragging = false;
  box.addEventListener('dragstart', () => { dragging = true; });
  box.addEventListener('dragend', () => { dragging = false; });
  box.addEventListener('click', (e) => {
    if (dragging) { dragging = false; return; }
    if (e.target.closest(PASS)) return;
    openDetail(app, box);
  });
}

const g2 = (n) => (n == null ? null : Number(n).toFixed(2));
const one = (n) => (n == null ? null : Number(n).toFixed(1));

/**
 * 카드의 숫자 — **대학 쪽과 학생 쪽을 갈라 놓는다.**
 *
 *     작년(26입결)  │  내 성적
 *     70%컷  3.58   │  환산   2.94
 *     실질   2.4:1  │  전교과 3.20
 *
 * 셋을 한 줄에 늘어놓으면 70%컷·전교과·환산이 같은 종류의 숫자로 읽힌다.
 * 왼쪽은 **대학이 작년에 어땠나**, 오른쪽은 **내가 어디에 있나**로 서로 다른 것이다.
 * 가운데 줄 하나가 그 경계다.
 *
 * 윗줄끼리 붙여 놓은 이유 — 70%컷과 대학 환산등급은 **같은 잣대**다. 눈이 가로로
 * 한 번 움직이면 되는 자리에 둔다. 전교과는 잣대가 달라 아랫줄에 참고로 둔다.
 * 차이값은 여전히 계산하지 않는다. 빼는 순간 자료가 말하지 않는 것을 말하게 된다.
 */
function figures(app, student) {
  const s = store.summary(app);
  const naesin = (student && student.naesin) || {};
  const total = g2(naesin['전교과'] ?? naesin['전교과(100)']);
  const mine = app.myScore || {};

  const wrap = el('div', 'figs');
  const group = (title, list) => {
    const rows = list.filter((x) => x && x[1] != null);
    if (!rows.length) return null;
    const box = el('div', 'fig-g');
    box.appendChild(el('div', 'fig-h', title));
    for (const [k, v, note] of rows) {
      const line = el('div', 'fig');
      line.appendChild(el('span', 'k', k));
      line.appendChild(el('span', 'v num', v));
      if (note) line.title = note;
      box.appendChild(line);
    }
    return box;
  };

  let left = null;
  if (s.kind === 'college') {
    // 전문대는 환산점수가 없다. 최종등록자 평균등급과 최저등급이 그 자리에 온다.
    left = group(s.year ? `작년 ${String(s.year).slice(2)}` : '작년', [
      ['평균등급', g2(s.avg)],
      ['최저등급', g2(s.cut)],
    ]);
  } else if (s.linked) {
    // 실질경쟁률이 나오면 그걸 쓴다. 명목만으로는 추합이 얼마나 돌았는지 안 보인다.
    const comp = s.real.value != null
      ? ['실질', `${rate1(s.real.value)}:1`, `명목 ${s.rate != null ? `${rate1(s.rate)}:1` : '?'} · 모집과 추합을 반영한 값`]
      : (s.rate != null ? ['경쟁률', `${rate1(s.rate)}:1`, s.real.why || '추가합격 자료가 없어 명목값입니다'] : null);
    // 어느 전형의 컷인지 제목에 달아 둔다. 학과의 73% 는 입결에 전형이 여럿이라
    // 「작년 26입결」만으로는 옆 전형의 컷과 구별이 안 된다.
    /*
     * **「작년」은 정말 작년일 때만 단다.** 카드 상세(card.js)는 이미 그렇게 하는데
     * 6칸 카드만 어느 해든 「작년 N입결」이라 적고 있었다. 전형이 한 해 쉬었거나
     * 그해 컷 칸이 비어 앞 해를 쓴 카드가 7.3% 인데, 상담에서 3년 묵은 숫자를
     * 작년 것으로 읽으면 안 된다.
     */
    const dataHi = s.rows && s.rows.length ? Math.max(...s.rows.map((r) => r.year)) : null;
    const off = s.year != null && dataHi != null && s.year < dataHi;
    const headName = s.year
      ? (off ? `${s.year}년 입결` : `작년 ${String(s.year).slice(2)}입결`)
      : '작년';
    const head = group(headName, [
      ['70%컷', g2(s.cut)],
      comp,
    ]);
    /*
     * **묶음이 통째로 비어 있을 수 있다.** 입결에는 이어졌는데 70%컷도 경쟁률도
     * 안 적힌 전형이 있다(올해 새로 묶인 광역모집·자유전공에서 나온다).
     * 그러면 group() 이 null 을 주는데, 여기서 곧장 title 을 달면 카드 하나가
     * 터지면서 render() 가 멈춘다. 그 학생의 보드가 **통째로 빈다.**
     * 명단에는 이름이 있는데 보드만 텅 빈 학생이 그래서 나왔다.
     */
    if (head) {
      if (s.type) head.title = `입결 전형 ${s.type}`;
      /*
       * 이름으로 맞춘 게 아니라 유형만 보고(cat) 또는 전형이 하나뿐이라(only) 고른 것이면
       * 마우스를 올려야 보이는 곳에 숨기지 않는다. 전체의 3% 라 시끄럽지도 않다.
       */
      if (isGuessedFit(s.typeFit)) {
        head.appendChild(el('div', 'fig-note', `${s.type} · 전형을 이름으로 맞추지 못했습니다`));
      }
    }
    left = head;
  } else if (s.before && s.before.line.g70) {
    // 올해 새로 묶여 제 입결이 없는 자유전공. 묶이기 전 학과들의 선을 참고로 둔다.
    const g = s.before.line.g70;
    left = group('묶이기 전 참고', [
      ['가운데', g2(g.mid), `${s.before.line.year} 70%컷 · ${g.n}개 학과의 가운데값`],
      ['범위', `${g2(g.lo)}~${g2(g.hi)}`,
        `${s.before.parts.length}개 학과 중 ${g.n}곳에서 값을 찾았습니다`],
    ]);
    if (left) left.classList.add('approx');
  }

  const right = group('내 성적', [
    ['환산', g2(mine.grade) || (mine.score != null ? String(mine.score) : null),
      mine.grade != null ? '대학이 제 방식으로 환산한 등급' : '대학 환산 점수'],
    ['전교과', total, '학교 전 과목 등급. 대학 환산과는 잣대가 다릅니다'],
  ]);

  if (left) wrap.appendChild(left);
  if (right) wrap.appendChild(right);
  if (left && right) wrap.classList.add('two');
  return wrap;
}

/**
 * 꼬리표 — 숫자 둘로는 안 되는, 그러나 판단을 바꾸는 것들.
 *
 * 고른 기준은 「이걸 모르면 상담에서 틀린 말을 하게 되는가」다.
 *   모집인원 증감   30명이 3명이 되면 작년 컷은 더 이상 쓸 수 없다
 *   단계별 전형     1단계를 따로 통과해야 한다. 최종 컷만 보면 안 된다
 *   수능최저        내신이 닿아도 최저에서 떨어진다
 *   가야 하는 날    면접·실기·논술은 겹치면 하나를 버려야 한다
 *   연결 상태       값이 왜 비었는지 감추지 않는다
 *   올해 신설       작년 컷이 아예 없는 자리다. 「자료 못 찾음」과는 전혀 다른 말이다
 *   손으로 이음     다른 학과의 숫자를 보고 있다는 뜻이다
 *
 * 지역·계열·모집시기·50%컷·취업률 같은 것은 여기 두지 않는다. 상세에서 본다.
 */
/*
 * 꼬리표 색이 뜻하는 것 — 네 가지뿐이다. 늘어나면 아무 뜻도 없어진다.
 *
 *   mark  노란 칠   **성적 말고 따로 걸리는 조건.** 놓치면 지원이 통째로 헛일이 된다
 *                  수능최저 · 단계별전형 · 가야 하는 날(면접·실기·논술)
 *   warn  붉은 글씨 진짜 문제. 모집 반토막 · 자료 없음 · 올해 신설 · 전형 못 가림
 *   wait  점선     아직 확정이 아님. 기간만 나온 날짜 · 불러오는 중
 *   (없음) 그냥     참고 사실. 모집인원 · 취업률 · 연계편입 · 결과
 *
 * 「연계편입」은 혜택이지 걸리는 조건이 아니라 노란 칠에서 뺐다.
 */
function pills(app) {
  const wrap = el('div', 'pills');
  const add = (text, kind) => wrap.appendChild(el('span', `pill${kind ? ' ' + kind : ''}`, text));

  const s = store.summary(app);
  // 지금이 지원을 고민하는 때인가, 원서를 내고 난 뒤인가 (board.html 이 body 에 적어 둔다)
  const planning = document.body.dataset.stage !== 'fixed';

  // 모집인원 — 줄었으면 그게 올해 이 전형의 가장 큰 변수다
  const now = s.quotaNow;
  const prev = s.quotaPrev;
  if (now != null) {
    const d = prev != null ? now - prev : null;
    if (d) {
      // 붉은색은 진짜 문제에만 쓴다. 두어 명 줄어든 것까지 붉게 칠하면
      // 정작 반 토막 난 전형이 눈에 안 들어온다.
      const heavy = d < 0 && Math.abs(d) >= 3 && Math.abs(d) / prev >= 0.2;
      const p = add(`${now}명 (작년 ${prev})`, heavy ? 'warn' : '');
      p.title = `작년보다 ${Math.abs(d)}명 ${d > 0 ? '늘었습니다' : '줄었습니다'}`;
    } else {
      add(`${now}명`);
    }
  } else if (app.quotaText) {
    add(app.quotaText);
  }

  // 셋 다 **성적 말고 따로 걸리는 것**이다. 같은 무게로 칠한다.
  /*
   * 단계 꼬리표에 **면접이 몇 %인지** 같이 적는다 — 「2단계」만으로는 면접이
   * 당락에 얼마나 걸리는지 안 보인다. 일괄인데 면접이 든 전형(학생부60+면접40,
   * 실제 지원 500건에 18건)은 단계 수만 보면 면접이 아예 안 보이던 자리라
   * 따로 세운다. 전형 방법 전문은 제목(title)에 붙는다.
   */
  // 과기원·사관학교처럼 학교유형은 일반대인데 6회 제한 밖인 지원 — 왜 순위 칸에
  // 없는지 꼬리표가 말해 준다. 걸리는 조건이 아니라 혜택이므로 노란 칠은 안 한다.
  if (outsideLimit(app) && app.univType !== '전문대' && app.univType !== '특수대') {
    add('수시 6회에 안 셈');
  }

  const share = interviewShare(s.mojip);
  if (s.stages > 1) {
    const p = add(share != null ? `${s.stages}단계 면접${share}%` : `${s.stages}단계`, 'mark');
    const line = methodLine(s.mojip);
    if (line) p.title = line;
  } else if (share != null) {
    const p = add(`면접 ${share}%`, 'mark');
    const line = methodLine(s.mojip);
    if (line) p.title = line;
  }
  // 관심대학 리스트는 기준 글 없이 Y/N 만 준다 — 그때도 표시가 나와야 한다
  if (app.minReqText || app.minReq === true) {
    /*
     * 기준을 줄일 수 있으면 숫자로 말한다 — 「최저 있음」보다 「최저 3합 12」가
     * 훑는 눈에 훨씬 많이 말해 준다. 못 줄이면(의대 분기·특수형) 예전 그대로.
     * 원문은 카드 상세에 있고, 여기서는 제목(title)에도 붙여 둔다.
     */
    const txt = app.minReqText || (s.mojip && s.mojip.minReq) || '';
    const short = minReqShort(txt);
    const pill = add(short ? `최저 ${short}` : '최저 있음', 'mark');
    if (txt) pill.title = String(txt);
  }

  /*
   * 가야 하는 날. 「최저 있음」과 같은 종류다 — 내신이 닿아도 그날 못 가면 끝난다.
   * 게다가 여섯 칸을 고르는 동안 **겹치는지 눈으로 세는** 값이라 제일 눈에 띄어야 한다.
   * 기간으로만 나온 것은 점선을 겹쳐 둔다 (노란 칠 + 점선 = 가야 하는데 아직 미정).
   */
  const go = ['면접', '실기', '논술', '적성']
    .map((kind) => [kind, store.dateOf(app, kind)])
    .filter(([, d]) => d)[0];
  if (go) {
    const [kind, d] = go;
    const [, m, day] = d.from.split('-');
    add(`${kind} ${+m}/${+day}${d.fixed ? '' : '~'}`, d.fixed ? 'mark' : 'mark wait');
  }

  if (s.kind === 'college' && s.linked) {
    if (s.employ != null) add(`취업 ${Math.round(s.employ)}%`);
    if (s.transfer) add('연계편입');
  }

  /*
   * **결과는 「지원 확정」 때만 낸다.**
   * 9월에 여섯 칸을 고르는 동안 합불이 카드에 떠 있을 까닭이 없다. 작년 값이 남아
   * 있거나 1단계만 난 것이 섞여서, 고민해야 할 자리에 이미 끝난 것 같은 인상만 준다.
   * 확인이 밀린 것은 명단 배지와 첫 화면 목록이 따로 챙기므로 여기서 빠져도 안 놓친다.
   */
  if (!planning) {
    const res = store.resultOf(app);
    if (res.pending) add(`${res.final || '결과'} · 확인 필요`, 'mark');
    else if (res.final) add(res.final);
  }

  /*
   * **「많이 흔들림」은 여기 두지 않는다.**
   *
   * 판단을 한 낱말로 줄인 꼬리표라, 옆의 「30명」·「면접 9/4」 같은 사실과 나란히
   * 붙으면 같은 무게로 읽힌다. 그런데 이건 사실이 아니라 **읽는 법**이다 —
   * 「최근 5년 사이 2.99~4.50 으로 1.51등급 움직였습니다」를 줄인 말이고,
   * 줄인 채로는 무엇 때문인지도 얼마나인지도 알 수 없다.
   *
   * 그래서 상세 카드의 「이 컷을 어떻게 읽나」로 옮겼다. 견준 해·범위·움직인 폭·
   * 표준편차·모집인원·내 위치를 함께 놓고 그 옆에서 말한다. 근거와 붙어 있어야
   * 「그래서 상향인가」를 선생님이 판단할 수 있다.
   */

  // 값이 왜 비었는지 감추지 않는다
  if (!store.state.enriched) {
    add('자료 불러오는 중', 'wait');
  } else if (!s.linked && s.before) {
    const p = add(`묶이기 전 ${s.before.line.found.length}곳 참고`, 'wait');
    p.title = s.why;
  } else if (!s.linked) {
    const p = add('작년 자료 없음', 'warn');
    if (s.why) p.title = s.why;
  }

  /*
   * **「올해 신설」을 상세에만 두면 안 된다.** 여섯 칸을 훑는 동안 이 카드만 숫자가
   * 비어 있는데, 그게 자료를 못 찾은 것인지 작년에 없던 전형인지가 안 보인다.
   * 상담에서 완전히 다른 말이 나오는 자리다.
   */
  if (s.isNew) {
    const p = add('올해 신설', 'warn');
    p.title = '작년 모집인원도 경쟁률도 모집요강에 없습니다. 작년 컷으로 가늠할 수 없습니다.';
  }
  if (s.alias && (s.alias.toUniv || s.alias.toDept)) {
    const to = [s.alias.toUniv || app.univ, s.alias.toDept || app.dept].join(' ');
    const p = add('손으로 이음');
    p.title = `작년 숫자는 「${to}」의 것입니다. 점검 화면에서 이어 둔 것입니다.`;
  }

  /*
   * **신설이면 「전형 못 가림」을 겹쳐 달지 않는다.** 작년에 없던 전형이니 작년
   * 자료에서 못 가리는 게 당연하다. 둘을 나란히 붙이면 자료가 잘못된 것처럼 읽힌다.
   */
  if (s.catMissing) {
    // 가려낼 것이 애초에 없다. 「못 가렸다」와 다른 말이다.
    const p = add(`${s.catMissing} 입결 없음`);
    p.title = s.catMissing === '논술'
      ? '논술은 결과를 공개하는 대학이 적어 자료가 성깁니다. 대학 홈페이지의 선행학습영향평가 보고서를 봐 주세요.'
      : `이 학과 입결에 ${s.catMissing} 전형이 없습니다.`;
  } else if (s.nearby && s.nearby.reason === 'unsure') {
    // 못 가렸지만 같은 유형을 범위로 곁들였다. 빈손이 아니다.
    const p = add(`관련 전형 ${s.nearby.groups.length}개 참고`, 'wait');
    p.title = '지원한 전형을 가려내지 못해 같은 유형의 전형을 범위로 곁들였습니다.'
      + ' 카드를 열어 봐 주세요.';
  } else if (s.typeFit === 'none' && !s.isNew) {
    const p = add('전형 못 가림', 'warn');
    p.title = '이 학과 입결에 전형이 여럿인데 지원한 전형을 가려내지 못했습니다.'
      + ' 카드를 열어 연도별 추이에서 봐 주세요.';
  } else if (s.cutMissing) {
    // 줄은 붙었는데 컷 칸만 비어 있다. 대학이 공개를 안 한 것이라 더 찾아도 안 나온다.
    const p = add('컷 미공개');
    p.title = `「${s.type}」은 입결에 줄은 있는데 70%컷 칸이 비어 있습니다.`
      + ' 대학이 공개하지 않은 것이라 다른 데서도 나오지 않습니다.';
  } else if (s.cut == null && s.avg == null && !s.isNew) {
    // 신설이면 「올해 신설」이 이미 말했다. 겹쳐 달면 둘 다 흐려진다.
    add('작년 컷 없음');
  }

  return wrap;
}

function mover(app) {
  const box = el('div', 'move');
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', `${app.univ} 자리 옮기기`);
  const isOther = outsideLimit(app);
  const options = isOther
    ? [['tray', '지원'], ['pool', '후보'], ['archive', '보관']]
    : [...RANKS.map((r) => [`rank:${r}`, `${r}순위`]), ['pool', '후보'], ['archive', '보관']];

  const now = store.placementOf(app.id);
  const current = now.slot === 'rank' ? `rank:${now.rank}` : now.slot;
  for (const [value, text] of options) {
    const o = document.createElement('option');
    /*
     * **차 있는 칸은 「맞바꿈」이라고 적는다.**
     *
     * 고르면 실제로 둘이 자리를 바꾼다 — 예전부터 그랬다. 그런데 목록에는
     * 「2순위」라고만 적혀 있어서, 누르면 거기 있던 카드가 밀려날 것처럼 보인다.
     * 「교체 기능이 없는 것 같다」는 이야기를 들었다. 있는데 안 보였던 것이다.
     */
    let label = text;
    if (value.indexOf('rank:') === 0 && value !== current) {
      const taken = store.occupant(app.hak, Number(value.slice(5)));
      if (taken) label = `${text} ⇄ ${shortName(taken)}`;
    }
    o.value = value; o.textContent = label;
    if (value === current) o.selected = true;
    sel.appendChild(o);
  }
  sel.disabled = busy;
  sel.onchange = () => move(app, sel.value);
  box.appendChild(sel);

  // 카드를 눌러도 열리지만, 눌러야 열린다는 걸 알 수 있게 단추를 함께 둔다.
  // 키보드만 쓰는 경우에도 이 단추가 유일한 길이다.
  const more = el('button', 'btn', '자세히');
  more.type = 'button';
  more.setAttribute('aria-label', `${app.univ} ${app.dept} 자세히`);
  more.onclick = (e) => openDetail(app, e.currentTarget);
  box.appendChild(more);
  return box;
}

function emptySlot(rank) {
  const box = el('div', 'card empty', `${rank}순위 — 비어 있음`);
  dropTarget(box, () => `rank:${rank}`);
  return box;
}

/**
 * 후보 · 보관 · 전문대 묶음.
 *
 * @param {?string} slot  이 묶음에 끌어다 놓으면 가는 자리. null 이면 안 받는다
 */
function group(title, apps, help, student, slot) {
  const box = el('section', 'panel');
  // 묶음 자체가 받는 쪽이다. 비어 있어도 받아야 「후보로 빼기」가 된다.
  if (slot) {
    dropTarget(box, (dropped) => {
      const other = outsideLimit(dropped);
      // 전문대를 6칸 쪽 묶음에, 일반대를 전문대 묶음에 놓는 것은 막는다
      if (slot === 'tray' && !other) return null;
      if (slot !== 'tray' && slot !== 'archive' && other) return null;
      return slot;
    });
    box.classList.add('drops');
  }
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', title));
  head.appendChild(el('span', 'count num', `${apps.length}건`));
  box.appendChild(head);
  if (!apps.length) {
    box.appendChild(hint(help || '없습니다.'));
    return box;
  }
  if (help) box.appendChild(el('p', 'section-label', help));
  const stack = el('div', 'stack');
  for (const app of apps) {
    /*
     * **카드 하나가 터져도 보드는 살아 있어야 한다.**
     *
     * 예전에는 숫자 한 칸을 그리다 난 오류가 render() 를 통째로 멈춰서, 명단에는
     * 이름이 있는데 보드는 텅 빈 학생이 생겼다. 선생님 쪽에서는 그 학생만 자료가
     * 없는 것처럼 보인다 — **상담 도구에서 가장 나쁜 실패다.** 못 그린 카드는
     * 못 그렸다고 적어 두고 나머지 여덟 장은 그대로 낸다.
     */
    try {
      stack.appendChild(cardRow(app, student));
    } catch (err) {
      const row = el('div', 'row broken');
      row.appendChild(el('div', 'univ', tidy(app.univ || '대학 없음')));
      row.appendChild(el('div', 'dept', tidy(app.dept || '학과 없음')));
      row.appendChild(el('p', 'warn', '이 카드를 그리지 못했습니다. 선생님께 알려 주세요.'));
      row.title = String((err && err.message) || err);
      stack.appendChild(row);
    }
  }
  box.appendChild(stack);
  return box;
}

/** 카드 한 장. group() 이 이걸 try 로 감싸 부른다. */
function cardRow(app, student) {
  const row = el('div', 'row');
  row.dataset.id = app.id;        // 자리를 옮길 때 어느 카드가 어디서 왔는지 짚는다
  markMemo(row, app);
  markEnrolled(row, app);
  dragSource(row, app);
  openable(row, app);
  const txt = el('div', 'txt');
  txt.appendChild(el('div', 'univ', tidy(app.univ.replace(/\s*[-–—]\s*.*$/, ''))));
  txt.appendChild(el('div', 'dept', `${tidy(app.dept)} · ${app.typeSub || app.typeName || ''}`));
  txt.appendChild(figures(app, student));
  txt.appendChild(pills(app));
  row.appendChild(txt);
  row.appendChild(mover(app));
  return row;
}

/* ── 상세 ─────────────────────────────────────────────────────── */

/**
 * 상세는 보드 본문 밖(#detail)에 그린다. 본문은 순위를 옮길 때마다 통째로 다시
 * 그려지는데, 상세까지 함께 지워지면 메모를 적다 말고 창이 닫힌다.
 *
 * 다시 그릴 일이 있어도 적던 메모와 스크롤 위치는 그대로 둔다.
 */
let detailReturn = null;      // 상세를 연 자리. 닫을 때 초점을 여기로 되돌린다
let detailShown = '';         // 지금 화면에 그려져 있는 지원. 처음 열 때만 초점을 옮긴다

function openDetail(app, from) {
  detailReturn = from || null;
  store.select({ appId: app.id });
}

function closeDetail() {
  const back = detailReturn;
  detailReturn = null;
  store.select({ appId: '' });
  if (back && document.contains(back)) back.focus();
}

function renderDetail() {
  const host = $('#detail');
  if (!host) return;

  const id = store.selection.appId;
  const app = id ? store.state.apps.get(id) : null;
  if (!app) {
    host.textContent = '';
    host.hidden = true;
    detailShown = '';
    delete document.body.dataset.detail;
    return;
  }

  // 다시 그리기 전에 적던 것과 본 자리를 챙겨 둔다
  const draftBox = host.querySelector('.memo-new textarea');
  const draft = draftBox ? draftBox.value : '';
  const top = host.scrollTop;          // 스크롤은 덮개가 한다
  const first = detailShown !== id;

  host.textContent = '';
  host.hidden = false;
  document.body.dataset.detail = '1';

  const panel = detailPanel(app, store.state.students.get(app.hak), closeDetail);
  host.appendChild(panel);

  const back = host.querySelector('.memo-new textarea');
  if (back && draft) back.value = draft;
  host.scrollTop = first ? 0 : top;
  if (first) panel.focus();
  detailShown = id;
}

/* ── 옮기기 ───────────────────────────────────────────────────── */

/*
 * **움직임을 보여 준다 (FLIP).**
 *
 * 순위를 바꾸면 화면을 새로 그린다. 새로 그리기만 하면 카드가 순간이동해서,
 * 두 장이 맞바뀐 건지 한 장이 사라지고 다른 게 나타난 건지 눈이 못 따라간다.
 * 「부드럽지 않다」의 정체가 이것이다.
 *
 * 그래서 그리기 **전에** 카드가 있던 자리를 재 두고, 그린 **뒤에** 그 차이만큼
 * 되돌려 놓았다가 제자리로 미끄러뜨린다. 자리를 계산하는 것은 브라우저고
 * 우리는 `transform` 만 건드린다 — 레이아웃을 다시 잡지 않으니 끊기지 않는다.
 *
 * 집에서 정한 것을 지킨다. 200ms · `transform` 만 · 움직임을 줄여 달라고
 * 해 둔 기기에서는 아예 안 움직인다. `el.animate` 가 없는 브라우저에서도
 * 그냥 조용히 건너뛴다 — 애니메이션은 있으면 좋은 것이지 없으면 안 되는 게 아니다.
 */
const MOTION_MS = 200;

function cardRects() {
  const seen = new Map();
  for (const node of document.querySelectorAll('#board [data-id]')) {
    seen.set(node.dataset.id, node.getBoundingClientRect());
  }
  return seen;
}

function glide(before) {
  if (!before || !before.size) return;
  if (typeof document.body.animate !== 'function') return;
  let still = false;
  try {
    still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (err) { still = false; }
  if (still) return;

  for (const node of document.querySelectorAll('#board [data-id]')) {
    const was = before.get(node.dataset.id);
    if (!was) continue;
    const now = node.getBoundingClientRect();
    const dx = was.left - now.left;
    const dy = was.top - now.top;
    // 1px 미만은 눈에 안 보이는데 애니메이션만 걸린다. 안 움직인 것으로 친다.
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    node.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      { duration: MOTION_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
  }
}

async function move(app, value) {
  if (busy) return;
  const [slot, rankText] = value.split(':');
  const rank = rankText ? Number(rankText) : null;
  const before = store.placementOf(app.id);

  // 그 순위를 이미 쓰고 있으면 자리를 맞바꾼다.
  const taken = slot === 'rank' ? store.occupant(app.hak, rank) : null;
  const pushed = taken && taken.id !== app.id ? taken : null;

  /*
   * **한 번에 옮기고 한 번만 그린다.**
   *
   * 예전에는 `place` 를 두 번 불렀다. 밀려난 카드가 먼저 움직이고, 서버 왕복을
   * 기다린 뒤에 누른 카드가 움직였다 — 그 사이에 두 카드가 같은 칸에 겹치거나
   * 한 칸이 잠깐 비는 화면이 보였다. 게다가 화면을 네 번 다시 그렸다.
   * 이제 자리를 한꺼번에 바꾸고(`placeMany`) 그 움직임만 애니메이션한다.
   */
  const moves = [{ id: app.id, slot, rank }];
  if (pushed) {
    moves.push(before.slot === 'rank'
      ? { id: pushed.id, slot: 'rank', rank: before.rank }
      : { id: pushed.id, slot: 'pool', rank: null });
  }

  busy = true;
  let failed = null;
  // 그리기 전에 자리를 재 둔다. `placeMany` 는 서버를 기다리기 전에 먼저
  // 자리를 바꾸고 알리므로, 이 줄이 끝나면 화면은 이미 새로 그려져 있다.
  const was = cardRects();
  const write = store.placeMany(moves).catch((err) => { failed = err; });
  glide(was);

  /*
   * 자리는 이미 바뀌었다(`placeMany` 가 먼저 바꾸고 알린다). 서버 응답을 기다리지
   * 않고 바로 그려서, 누른 순간 카드가 움직이게 한다. 실패하면 되돌아온다.
   */
  if (pushed) {
    const name = shortName(pushed);
    const eul = josa(pushed.dept, '을', '를');
    notice = before.slot === 'rank'
      ? `${name}${eul} ${before.rank}순위로 맞바꿨습니다.`
      : `${name}${eul} 후보로 옮겼습니다.`;
  } else {
    notice = '';
  }

  await write;
  busy = false;
  if (failed) {
    /*
     * 「그 사이에 바뀌었다」(stale)면 **스스로 다시 불러온다.** 학생 화면과 같은
     * 처리다 — 안 그러면 seen 이 낡은 채 남아 다음 옮기기도 전부 거절되고,
     * 선생님은 새로고침 단추를 찾아야 한다.
     */
    if (failed.stale) {
      notice = '학생이 방금 순위를 바꿨습니다. 새로 불러왔습니다 — 다시 해 주세요.';
      try { await store.load(); } catch (e2) { notice = `오류: ${e2.message}`; }
    } else {
      notice = `오류: ${failed.message}`;
    }
  }
  renderRoster();
  render();
}

/* ── 조각 ─────────────────────────────────────────────────────── */

function banner(text, isError) {
  return el('p', `note${isError ? ' error' : ''}`, text);
}
function hint(text) {
  return el('p', 'empty-state', text);
}
function label(text) {
  return el('h2', 'section-label', text);
}
function skeleton() {
  const box = el('div', 'slots');
  for (let i = 0; i < 6; i += 1) {
    const c = el('div', 'card');
    for (const w of ['70%', '90%', '50%']) {
      const line = el('div', 'skeleton');
      line.style.width = w;
      c.appendChild(line);
    }
    box.appendChild(c);
  }
  return box;
}
