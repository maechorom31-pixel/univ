/**
 * 점검 — 못 붙인 학과 잇기
 * =====================================================================
 * 즐겨찾기가 부르는 이름과 입결·전문대 자료가 부르는 이름이 달라서 값이 안 붙는
 * 지원이 매년 생긴다. 학과가 통합되거나 이름이 바뀌기 때문이다.
 *
 * 이 화면이 하는 일은 셋이다.
 *   1. 못 붙인 것을 **같은 (대학·학과)끼리 묶어** 보여 준다 — 한 번 이으면 다 붙는다
 *   2. 같은 대학에서 이름이 닮은 학과를 후보로 내놓는다. **고르지는 않는다**
 *   3. 목록을 글로 복사해 준다 — 그대로 Claude 에게 붙여 넣고 물어볼 수 있게
 *
 * 자동으로 잇지 않는 이유 — 「화학공학과」와 「화공생명공학과」는 글자가 거의 안 겹치는데
 * 같은 학과일 수 있고, 「영어영문학과」와 「영어교육과」는 닮았는데 전혀 다른 학과다.
 * 기계가 고르면 반드시 몇 개를 틀리고, 틀린 값은 화면 어디에도 「틀렸다」고 안 적힌다.
 */
import * as store from './store.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const tidy = (s) => String(s || '').replace(/ (?=[^ ]{1,4}$)/, ' ');
const shortUniv = (s) => String(s || '').replace(/\s*[-–—]\s*.*$/, '');

let notice = '';
let busy = '';
/* 묶음마다 「여럿 고르는 중」인 학과들. 저장하면 비운다. */
const picked = new Map();               // 지금 저장 중인 묶음의 key

export function start() {
  store.on('change', render);
  render();
}

function render() {
  const main = $('#verify');
  if (!main || main.hidden) return;
  main.textContent = '';

  if (!store.state.ready) {
    main.appendChild(el('p', 'empty-state', '자료를 불러오는 중입니다.'));
    return;
  }
  if (!store.state.enriched) {
    main.appendChild(el('p', 'empty-state', '입결·모집요강을 불러오는 중입니다.'));
    return;
  }

  const { cls } = store.selection;
  const groups = store.unmatched(cls);
  const linked = store.state.aliases.size;

  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', cls ? `${cls}반 점검` : '학년 전체 점검'));
  const left = groups.filter((g) => !g.skipped && !g.isNew).length;
  head.appendChild(el('span', 'count num', `못 붙인 학과 ${left}종`));
  main.appendChild(head);

  if (notice) main.appendChild(el('p', 'note', notice));

  if (!groups.length) {
    main.appendChild(el('p', 'empty-state',
      linked ? `못 붙인 학과가 없습니다. 손으로 이어 둔 것 ${linked}건이 쓰이고 있습니다.`
        : '못 붙인 학과가 없습니다.'));
    if (linked) main.appendChild(aliasList());
    main.appendChild(gradePanel());     // 이 길로 나가도 성적 탭 경고는 보인다
    return;
  }

  const todo = groups.filter((g) => !g.skipped && !g.isNew);
  const fresh = groups.filter((g) => !g.skipped && g.isNew);
  const done = groups.filter((g) => g.skipped);

  main.appendChild(el('p', 'section-html section-label',
    '이름이 달라 작년 자료가 안 붙은 지원입니다.'
    + ' 같은 학과끼리 묶여 있어서 한 번 이으면 그 학과의 모든 학생에게 붙습니다.'));

  main.appendChild(tools(todo));

  const list = el('div', 'stack');
  if (!todo.length) {
    list.appendChild(el('p', 'empty-state', '남은 것이 없습니다.'));
  }
  for (const g of todo) list.appendChild(groupRow(g));
  main.appendChild(list);

  /*
   * **올해 신설인 학과는 접어 둔다.**
   * 모집요강이 「작년에 이 학과로 아무도 안 뽑았다」고 말한 것들이다. 이을 자료가
   * 애초에 없으니 목록에 세워 두면 선생님이 있지도 않은 것을 찾아 나선다.
   * 그래도 지우지는 않는다 — 판정이 틀렸으면 여기서 직접 이을 수 있어야 한다.
   */
  if (fresh.length) {
    const fold = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = `올해 신설이라 작년 자료가 없는 학과 ${fresh.length}종`;
    fold.appendChild(sum);
    const inner = el('div', 'stack');
    inner.appendChild(el('p', 'section-label',
      '모집요강이 작년 모집인원·경쟁률을 비워 둔 학과입니다.'
      + ' 이을 작년 자료가 없는 것이 맞습니다 — 다만 판정이 틀렸다 싶으면 여기서 이어 주세요.'));
    for (const g of fresh) inner.appendChild(groupRow(g));
    fold.appendChild(inner);
    main.appendChild(fold);
  }

  /*
   * 「없음으로 표시」한 것은 접어 둔다. 지우면 잘못 눌렀을 때 되돌릴 길이 없고,
   * 목록에 그대로 두면 121명 규모에서 목록이 영영 안 줄어든다.
   */
  if (done.length) {
    const fold = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = `작년 자료 없음으로 표시한 것 ${done.length}종`;
    fold.appendChild(sum);
    const inner = el('div', 'stack');
    for (const g of done) inner.appendChild(groupRow(g));
    fold.appendChild(inner);
    main.appendChild(fold);
  }

  if (linked) main.appendChild(aliasList());
  main.appendChild(gradePanel());
}

/*
 * 「성적」 탭 점검 — 이름이 다르면 성적을 붙이지 않았다는 것을 **보여 준다.**
 *
 * 성적 탭과 즐겨찾기는 학번(학년·반·번호)으로 잇는데, 반이 바뀌었거나 번호가
 * 밀렸으면 같은 학번에 다른 사람이 선다. 그때 조용히 붙이면 남의 성적으로
 * 위치를 재는 것이라, 붙이지 않고 여기서 학번을 보여 준다. 시트에서 학번이나
 * 이름을 고치면 다음 불러오기에 붙는다. 아무 문제 없으면 아무것도 안 그린다.
 */
function gradePanel() {
  const frag = document.createDocumentFragment();
  if (store.state.gradeProblem) {
    const box = el('section', 'panel miss');
    box.appendChild(el('h2', '', '성적 탭'));
    box.appendChild(el('p', 'hint', store.state.gradeProblem));
    frag.appendChild(box);
  }
  const warn = store.state.gradeWarn || [];
  if (!warn.length) return frag;
  const box = el('section', 'panel miss');
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '성적 탭과 이름이 다른 학번'));
  head.appendChild(el('span', 'count num', `${warn.length}명`));
  box.appendChild(head);
  box.appendChild(el('p', 'hint',
    '학번은 같은데 이름이 달라 성적을 붙이지 않았습니다 —'
    + ' 남의 성적이 붙는 것이 빈 것보다 나쁩니다.'
    + ' 성적 탭이나 즐겨찾기의 학번·이름을 맞춰 주세요.'));
  const tw = el('div', 'tw');
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const t of ['학번', '즐겨찾기 이름', '성적 탭 이름']) hr.appendChild(el('th', '', t));
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const w of warn) {
    const tr = document.createElement('tr');
    tr.appendChild(el('th', 'rowhead num', w.hak));
    tr.appendChild(el('td', '', w.fav));
    tr.appendChild(el('td', '', w.sheet));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tw.appendChild(table);
  box.appendChild(tw);
  frag.appendChild(box);
  return frag;
}

/* ── 한 묶음 ────────────────────────────────────────────────────── */

function groupRow(g) {
  const box = el('section', 'panel miss');

  const head = el('div', 'miss-head');
  const title = el('div');
  title.appendChild(el('div', 'univ', tidy(shortUniv(g.univ))));
  title.appendChild(el('div', 'dept', tidy(g.dept)));
  head.appendChild(title);
  head.appendChild(el('span', 'count num', `${g.apps.length}명`));
  box.appendChild(head);

  box.appendChild(el('p', 'hint', g.why));
  box.appendChild(el('p', 'hint', `해당 학생 — ${g.who.join(', ')}`));

  const cands = store.candidatesFor(g.apps[0], 8);
  /*
   * **닮은 이름이 없다고 빈손으로 내밀지 않는다.**
   *
   * 예전에는 「닮은 이름을 찾지 못했습니다」 한 줄과 빈 글상자가 전부였다.
   * 선생님은 자료에 어떤 학과가 있는지 모르는 채로 타자를 쳐야 했고, 「루마」라고
   * 쳐 봐야 아무 일도 안 일어난다. **추천이 없으면 이을 수가 없다.**
   *
   * 글자가 안 닮았다고 학과가 없는 것은 아니다 — 단국대 「퇴계혁신칼리지(사회계열
   * 광역)」의 작년 자리가 「사회과학대학」인 식이다. 목록을 내주고 고르게 한다.
   */
  const all = cands.length ? [] : store.deptsForUniv(g.apps[0]);
  if (!cands.length && all.length) {
    box.appendChild(el('p', 'section-label',
      `닮은 이름은 없습니다 — 자료에 있는 ${shortUniv(g.univ)} 학과 ${all.length}개`));
    box.appendChild(el('p', 'hint',
      '이름이 아주 달라져도 같은 자리일 수 있습니다. 하나를 누르면 그 학과로 잇습니다.'));
    const list = el('div', 'cands all-depts');
    for (const c of all) {
      const b = el('button', 'cand');
      b.type = 'button';
      b.disabled = busy === g.key;
      b.appendChild(el('span', 'nm', tidy(c.dept)));
      if (c.years.length) {
        b.appendChild(el('span', 'mt', `${c.years[c.years.length - 1]}까지`));
      }
      b.onclick = () => join(g, c.dept);
      list.appendChild(b);
    }
    box.appendChild(list);
  } else if (!cands.length) {
    /*
     * 학과가 하나도 안 나오면 **대학부터 못 찾은 것**이다. 학과를 아무리 보여 줘도
     * 소용없으니 가까운 대학 이름을 대신 내민다 — 표기가 다른 경우가 대부분이다.
     */
    const near = store.univCandidatesFor(g.apps[0], 6);
    box.appendChild(el('p', 'empty-state', near.length
      ? `자료에서 「${shortUniv(g.univ)}」를 찾지 못했습니다. 대학 이름부터 다릅니다.`
      : '이 대학에서 닮은 이름을 찾지 못했습니다. 대학 이름부터 다를 수 있습니다.'));
    if (near.length) {
      box.appendChild(el('p', 'hint',
        `자료에는 이런 이름이 있습니다 — ${near.map((u) => u.univ).join(' · ')}.`
        + ' 아래 칸에 「대학 이름 / 학과 이름」처럼 적으면 대학도 함께 바꿉니다.'));
    }
  } else {
    box.appendChild(el('p', 'section-label', '이 대학의 닮은 학과'));
    box.appendChild(el('p', 'hint',
      '하나를 누르면 그 학과로 잇습니다. 여럿 고르면 참고선으로 봅니다 —'
      + ' 자유전공·통합모집처럼 작년의 한 학과에 대응하지 않는 자리에 씁니다.'));

    /*
     * **여럿 고를 수 있어야 한다.**
     * 「자유전공학부」의 작년 자리를 물으면 답이 「경영 · 경제 · 행정」 셋인 식이다.
     * 하나만 고르게 하면 셋 중 아무거나 골라 그 값을 이 학과의 값인 양 달게 된다.
     * 여럿이면 이름을 바꾸지 않고 범위·가운데값·학과별 값을 보여 준다.
     */
    const opts = el('div', 'cands');
    const chosen = picked.get(g.key) || new Set();
    for (const c of cands) {
      const b = el('button', `cand${chosen.has(c.dept) ? ' on' : ''}`);
      b.type = 'button';
      b.disabled = busy === g.key;
      b.setAttribute('aria-pressed', String(chosen.has(c.dept)));
      b.appendChild(el('span', 'nm', tidy(c.dept)));
      const meta = [];
      if (c.years.length) meta.push(`${c.years[c.years.length - 1]}까지`);
      meta.push(`닮음 ${Math.round(c.score * 100)}%`);
      b.appendChild(el('span', 'mt', meta.join(' · ')));
      b.onclick = () => {
        // 처음 누른 하나는 바로 잇는다. 대부분이 그 경우다.
        if (!chosen.size) { join(g, c.dept); return; }
        if (chosen.has(c.dept)) chosen.delete(c.dept); else chosen.add(c.dept);
        picked.set(g.key, chosen);
        render();
      };
      // 길게 눌러 고르지 않아도 되게, 두 번째부터는 「더 고르기」로 들어간다
      opts.appendChild(b);
    }
    box.appendChild(opts);

    if (chosen.size) {
      const bar = el('div', 'field-in');
      bar.appendChild(el('p', 'hint',
        `고른 학과 ${chosen.size}개 — ${[...chosen].join(' · ')}`));
      const go = el('button', 'btn btn-primary', `${chosen.size}개를 참고선으로 잇기`);
      go.type = 'button';
      go.disabled = busy === g.key;
      go.onclick = () => { picked.delete(g.key); join(g, [...chosen].join(', ')); };
      bar.appendChild(go);
      const clear = el('button', 'btn', '고른 것 지우기');
      clear.type = 'button';
      clear.onclick = () => { picked.delete(g.key); render(); };
      bar.appendChild(clear);
      box.appendChild(bar);
    } else {
      const more = el('button', 'btn', '여러 학과를 골라 참고선으로 잇기');
      more.type = 'button';
      more.disabled = busy === g.key;
      more.onclick = () => { picked.set(g.key, new Set([cands[0].dept])); render(); };
      box.appendChild(more);
    }
  }

  // 이름을 직접 넣는 길도 둔다. 후보에 없는 경우가 있다.
  const field = el('div', 'field');
  const label = document.createElement('label');
  const id = `to-${g.key.replace(/[^\w]/g, '')}`;
  label.htmlFor = id;
  label.textContent = '자료 쪽 학과 이름을 직접 넣기';
  field.appendChild(label);
  const line = el('div', 'field-in');
  const input = document.createElement('input');
  input.id = id;
  input.type = 'text';
  input.placeholder = '예) 자유전공학부';
  input.disabled = busy === g.key;
  /*
   * 자료에 있는 학과 이름을 글상자에 붙여 둔다. 「루마」까지만 쳐도 브라우저가
   * 「루마니아어과」를 골라 준다 — 타자로 정확히 맞히라고 하면 못 맞힌다.
   */
  const bank = cands.length ? store.deptsForUniv(g.apps[0]) : all;
  if (bank.length) {
    const dl = document.createElement('datalist');
    dl.id = `${id}-list`;
    for (const c of bank) {
      const o = document.createElement('option');
      o.value = c.dept;
      dl.appendChild(o);
    }
    input.setAttribute('list', dl.id);
    field.appendChild(dl);
  }
  line.appendChild(input);
  const save = el('button', 'btn', busy === g.key ? '잇는 중' : '잇기');
  save.type = 'button';
  save.disabled = busy === g.key;
  save.onclick = () => {
    if (!input.value.trim()) { input.focus(); return; }
    join(g, input.value.trim());
  };
  line.appendChild(save);
  field.appendChild(line);
  field.appendChild(el('p', 'hint',
    '이 학과에는 붙일 자료가 없다고 표시하려면 빈 채로 두고 「없음으로 표시」를 누르세요.'));
  box.appendChild(field);

  if (g.skipped) {
    // 되돌리는 길. 잘못 누른 것을 되살릴 데가 없으면 「없음으로 표시」를 못 누른다.
    const undo = el('button', 'btn', '다시 목록으로');
    undo.type = 'button';
    undo.disabled = busy === g.key;
    undo.onclick = async () => {
      busy = g.key; notice = ''; render();
      try {
        await store.removeAlias(g.univ, g.dept);
        notice = `${tidy(shortUniv(g.univ))} ${tidy(g.dept)} 를 다시 목록에 올렸습니다.`;
      } catch (err) {
        notice = `되돌리지 못했습니다 — ${err.message}`;
      }
      busy = ''; render();
    };
    box.appendChild(undo);
  } else {
    const skip = el('button', 'btn', '없음으로 표시');
    skip.type = 'button';
    skip.disabled = busy === g.key;
    skip.onclick = () => join(g, '', '작년 자료 없음');
    box.appendChild(skip);
  }

  return box;
}

async function join(g, toDept, note) {
  busy = g.key;
  notice = '';
  render();
  try {
    await store.setAlias(g.univ, g.dept, '', toDept, note || '');
    notice = toDept
      ? `${shortUniv(g.univ)} ${g.dept} → ${toDept} 로 이었습니다. ${g.apps.length}명에게 적용됩니다.`
      : `${shortUniv(g.univ)} ${g.dept} 는 붙일 자료가 없는 것으로 표시했습니다.`;
  } catch (err) {
    notice = `오류: ${err.message}`;
  } finally {
    busy = '';
    render();
  }
}

/* ── 이어 둔 것 ─────────────────────────────────────────────────── */

function aliasList() {
  const box = el('section', 'panel');
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', '손으로 이어 둔 학과'));
  head.appendChild(el('span', 'count num', `${store.state.aliases.size}건`));
  box.appendChild(head);
  box.appendChild(el('p', 'section-label',
    '학생이 아니라 학과에 붙습니다. 엑셀을 갈아끼워도, 다음 해가 와도 그대로 남습니다.'));

  const tw = el('div', 'tw');
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.appendChild((() => {
    const tr = document.createElement('tr');
    for (const t of ['즐겨찾기 표기', '자료 쪽 표기', '메모', '']) tr.appendChild(el('th', null, t));
    return tr;
  })());
  const tbody = document.createElement('tbody');
  for (const [key, a] of store.state.aliases) {
    const [univ, dept] = key.split('|');
    const tr = document.createElement('tr');
    tr.appendChild(el('td', null, `${shortUniv(univ)} ${dept}`));
    tr.appendChild(el('td', a.toDept ? null : 'muted', a.toDept || '없음으로 표시'));
    tr.appendChild(el('td', 'src', a.note || ''));
    const act = el('td');
    const b = el('button', 'btn', '되돌리기');
    b.type = 'button';
    b.onclick = async () => {
      b.disabled = true;
      try {
        await store.removeAlias(univ, dept);
        notice = `${shortUniv(univ)} ${dept} 를 되돌렸습니다.`;
      } catch (err) {
        notice = `오류: ${err.message}`;
      }
      render();
    };
    act.appendChild(b);
    tr.appendChild(act);
    tbody.appendChild(tr);
  }
  table.appendChild(thead);
  table.appendChild(tbody);
  tw.appendChild(table);
  box.appendChild(tw);
  return box;
}

/* ── 내보내기 ───────────────────────────────────────────────────── */

/**
 * 목록을 글로 복사한다.
 *
 * 학생 이름은 넣지 않는다. 이 글은 밖으로 나가는 것이고, 학과 이름을 맞추는 데
 * 학생이 누구인지는 필요 없다. 대신 몇 명인지만 적는다.
 */
function asText(groups) {
  const lines = ['# 못 붙인 학과 목록', ''];
  lines.push('즐겨찾기 표기 / 인원 / 못 붙인 까닭 / 이 대학의 닮은 학과');
  lines.push('');
  for (const g of groups) {
    const cands = store.candidatesFor(g.apps[0], 5)
      .map((c) => `${c.dept}(${Math.round(c.score * 100)}%)`).join(', ');
    lines.push(`- ${shortUniv(g.univ)} | ${g.dept} | ${g.apps.length}명 | ${g.why}`);
    lines.push(`    닮은 학과: ${cands || '없음'}`);
  }
  lines.push('');
  lines.push('이 학과들이 자료 쪽의 어느 학과와 같은 것인지 봐 주세요.');
  lines.push('통합된 학과라면 어떤 학과들이 묶인 것인지도 알려 주시면 좋겠습니다.');
  return lines.join('\n');
}

function tools(groups) {
  const box = el('div', 'tabs');
  const copy = el('button', 'btn btn-primary', '목록 복사 (Claude에게 물어보기)');
  copy.type = 'button';
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(asText(groups));
      notice = '복사했습니다. Claude 에게 그대로 붙여 넣고 물어보시면 됩니다.'
        + ' 학생 이름은 들어가지 않습니다.';
    } catch (err) {
      notice = '복사가 막혀 있습니다. 아래 목록을 직접 옮겨 주세요.';
    }
    render();
  };
  box.appendChild(copy);
  return box;
}
