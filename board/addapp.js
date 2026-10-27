/**
 * 지원 더하기 — 즐겨찾기에 없는 지원을 손으로 넣는다 (선생님 보드 · 학생 화면 같이)
 * =====================================================================
 * 전문대는 즐겨찾기(관심대학 리스트)를 안 거치고 원서를 내는 일이 많다. 그러면 보드에
 * 카드가 없어서 결과도 일정도 적을 데가 없었다. 여기서 더한 지원은 시트 「추가지원」
 * 탭에 남고(Code.gs addApp_), 즐겨찾기 지원과 **같은 카드**가 된다 — 자리(전문대는 「지원」),
 * 일정, 결과, 메모가 다 그대로 붙는다.
 *
 * **일정은 더하기 전에 미리 보여 준다**(match.js recommendSchedule). 카드가 실제로 쓰는
 * 것과 같은 함수라, 미리 본 날이 그대로 카드에 「예정」으로 붙는다. 전문대는 차수
 * (수시1차·2차)를 골라야 날이 정해지고, 면접은 「있음」을 골라야 일정에 들어간다 —
 * 대학 전체의 면접 기간을 면접 없는 학과에 붙이면 있지도 않은 겹침이 뜬다.
 *
 * 화면마다 자료를 갖고 있는 곳이 달라(store · student state) 목록과 미리보기, 저장은
 * 부르는 쪽이 넘긴다. 이 파일은 모양과 규칙만 갖는다.
 */
import { key, resolveUniv } from './match.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** 유형 → 즐겨찾기의 전형유형 표기. 화면들의 catOf 가 이 말로 교과·종합·논술·실기를 가른다. */
export const CATS = [
  ['교과', '학생부위주(교과)'], ['종합', '학생부위주(종합)'], ['논술', '논술위주'], ['실기', '실기위주'],
];
export const ROUNDS = ['수시1차', '수시2차'];

/**
 * 고른 값 → 지원 레코드 모양(서버 extraApp_ 와 같다). 미리보기와 보기용 자료(서버 없이)에 쓴다.
 * 전문대는 차수를 전형 이름 뒤에 붙인다 — 「일반전형(수시2차)」. 일정 고르기가 그 말을 읽는다.
 */
export function draftApp(hak, d) {
  const college = d.univType === '전문대';
  const name = String(d.typeName || '').trim() || (college ? '일반전형' : '');
  const typeSub = college && d.round ? `${name}(${d.round})` : name;
  const cat = (CATS.find(([k]) => k === d.cat) || [])[1] || '';
  return {
    id: '', hak, univType: d.univType || '일반대', region: '', univ: String(d.univ || '').trim(),
    period: '수시', typeCat: cat, typeName: typeSub, typeSub, track: '', dept: String(d.dept || '').trim(),
    quotaText: '', quota: null, selectType: '', minReqText: '', minReq: null, stage1Rule: '',
    myScore: null, dates: {},
    result: { stage1: null, final: null, reason: null, waitNo: null, enrolled: null },
    unknown: {}, manual: true, interview: d.interview || '',
  };
}

/* ── 고를 목록 — 공개 자료의 대학·학과·전형 이름 ─────────────────── */

const deptMemo = new WeakMap();
function deptsOf(idx) {
  // 색인은 (대학|학과) 열쇠라 대학 → 학과 목록을 한 번 만들어 둔다
  if (deptMemo.has(idx)) return deptMemo.get(idx);
  const m = new Map();
  for (const rows of idx.byKey.values()) {
    for (const r of rows) {
      const name = r.dept;   // 전문대(indexCollege)·모집요강(indexMojip) 줄 다 dept 를 갖는다
      if (!name) continue;
      if (!m.has(r.univ)) m.set(r.univ, new Set());
      m.get(r.univ).add(name);
    }
  }
  deptMemo.set(idx, m);
  return m;
}

/**
 * @param src {college, mojip}  match.js 색인(indexCollege · indexMojip). 아직 없으면 빈 목록.
 */
export function lists(src) {
  const of = (type) => (type === '전문대' ? src.college : src.mojip);
  return {
    univs(type) {
      const idx = of(type);
      return idx ? [...idx.univNames].sort((a, b) => a.localeCompare(b, 'ko')) : [];
    },
    /**
     * 적은 대학 이름을 자료의 이름으로 — 「광주보건대학교」→「광주보건대」.
     * 자료를 아직 못 받았으면 undefined(모름), 받았는데 없으면 null(없음) — 화면이 가려 말한다.
     */
    resolve(type, univ) {
      const idx = of(type);
      if (!idx) return undefined;
      return univ ? resolveUniv(univ, idx.index) : null;
    },
    depts(type, univ) {
      const idx = of(type);
      const name = idx && univ ? resolveUniv(univ, idx.index) : null;
      if (!name) return [];
      return [...(deptsOf(idx).get(name) || [])].sort((a, b) => a.localeCompare(b, 'ko'));
    },
    /** 일반대 — 그 대학·학과의 2027 모집요강 전형 이름 */
    types(univ, dept) {
      const idx = src.mojip;
      const name = idx && univ ? resolveUniv(univ, idx.index) : null;
      if (!name || !dept) return [];
      const rows = idx.byKey.get(key(name, dept)) || [];
      return [...new Set(rows.map((r) => r.type).filter(Boolean))];
    },
  };
}

/* ── 창 ──────────────────────────────────────────────────────────── */

const md = (iso) => {
  const [, m, d] = String(iso).split('-');
  return `${+m}/${+d}`;
};
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const dayText = (iso) => `${md(iso)}(${DOW[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;

/**
 * 지원 더하기 창을 띄운다.
 * @param opt.title     「3101 가상학생 — 지원 더하기」
 * @param opt.list      lists() 결과
 * @param opt.preview   (draftApp) → recommendSchedule 결과
 * @param opt.submit    async (draft 값) → 실패면 throw
 * @param opt.forStudent 학생 화면이면 안내 글이 조금 다르다
 */
export function openAddApp(opt) {
  const old = document.querySelector('.overlay.add-app-wrap');
  if (old) old.remove();
  const back = el('div', 'overlay add-app-wrap');
  const box = el('section', 'panel add-app');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', '지원 더하기');
  const prevFocus = document.activeElement;
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
    if (prevFocus && prevFocus.isConnected) prevFocus.focus();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });

  const head = el('div', 'panel-head');
  const title = el('div');
  title.appendChild(el('div', 'univ', '지원 더하기'));
  title.appendChild(el('div', 'dept', opt.title || ''));
  head.appendChild(title);
  const x = el('button', 'btn', '닫기');
  x.type = 'button';
  x.onclick = close;
  head.appendChild(x);
  box.appendChild(head);
  box.appendChild(el('p', 'hint', opt.forStudent
    ? '관심대학 목록에 없는 지원(전문대 등)을 더합니다. 더한 지원은 선생님도 봅니다.'
    : '즐겨찾기에 없는 지원(전문대 등)을 더합니다. 나중에 즐겨찾기에 같은 지원이 들어오면 한 장으로 합쳐집니다.'));

  const uid = `aa${Date.now()}`;
  const form = el('div', 'add-form');
  const row = (label, node, help) => {
    const w = el('div', 'add-row');
    const l = el('label', '', label);
    if (node.id) l.htmlFor = node.id;
    w.appendChild(l);
    w.appendChild(node);
    if (help) w.appendChild(el('p', 'hint', help));
    form.appendChild(w);
    return w;
  };
  const select = (id, pairs, value) => {
    const s = document.createElement('select');
    s.id = `${uid}-${id}`;
    for (const [v, t] of pairs) {
      const o = document.createElement('option');
      o.value = v; o.textContent = t;
      if (v === value) o.selected = true;
      s.appendChild(o);
    }
    return s;
  };
  const input = (id, ph) => {
    const i = document.createElement('input');
    i.type = 'text';
    i.id = `${uid}-${id}`;
    i.placeholder = ph || '';
    i.autocomplete = 'off';
    return i;
  };
  const datalist = (id) => {
    const d = document.createElement('datalist');
    d.id = `${uid}-${id}-list`;
    form.appendChild(d);
    return d;
  };
  const fill = (dl, names) => {
    dl.textContent = '';
    for (const n of names.slice(0, 400)) {
      const o = document.createElement('option');
      o.value = n;
      dl.appendChild(o);
    }
  };

  const type = select('type', [['전문대', '전문대'], ['일반대', '일반대(4년제)'], ['특수대', '특수대(사관·과기원 등)']], '전문대');
  row('학교 유형', type);
  const univ = input('univ', '예) 조선이공대');
  const univList = datalist('univ');
  univ.setAttribute('list', univList.id);
  const univRow = row('대학', univ);
  const dept = input('dept', '예) 간호학과');
  const deptList = datalist('dept');
  dept.setAttribute('list', deptList.id);
  row('학과(모집단위)', dept);

  // 전문대 — 차수가 일정을 정한다
  const round = select('round', [['', '고르세요'], ...ROUNDS.map((r) => [r, r])], '');
  const roundRow = row('차수', round, '수시1차와 2차는 접수·면접·발표가 다 다릅니다.');
  // 일반대 — 유형과 전형 이름
  const cat = select('cat', [['', '고르세요'], ...CATS.map(([k]) => [k, k])], '');
  const catRow = row('전형 유형', cat);
  const typeName = input('typename', '예) 일반전형');
  const typeList = datalist('type');
  typeName.setAttribute('list', typeList.id);
  const typeRow = row('전형 이름', typeName);
  const interview = select('iv', [['', '모름'], ['있음', '있음'], ['없음', '없음']], '');
  row('면접', interview, '「있음」이면 면접 일정이 카드에 붙고, 결과에 「면접 미응시」를 고를 수 있습니다.');

  const univHint = el('p', 'hint');
  univRow.appendChild(univHint);

  const rec = el('div', 'add-rec');
  const say = el('p', 'note error');
  say.hidden = true;

  const val = () => ({
    univType: type.value, univ: univ.value, dept: dept.value, round: round.value,
    cat: cat.value, typeName: typeName.value, interview: interview.value,
  });

  const refresh = () => {
    const t = type.value;
    const college = t === '전문대';
    roundRow.hidden = !college;
    catRow.hidden = college;
    typeName.placeholder = college ? '비우면 「일반전형」' : '예) 학생부교과(일반학생)';
    fill(univList, opt.list.univs(t === '특수대' ? '일반대' : t));
    const known = opt.list.resolve(t === '특수대' ? '일반대' : t, univ.value.trim());
    // 자료를 아직 못 받았으면(undefined) 아무 말도 안 한다 — 「없다」고 하면 틀린 말이다
    univHint.textContent = !univ.value.trim() || known === undefined ? ''
      : known ? (known !== univ.value.trim() ? `자료의 「${known}」로 봅니다.` : '')
        : '입결 자료에 없는 이름입니다 — 목록에서 고르면 작년 숫자가 붙습니다. 그대로 더할 수도 있습니다.';
    fill(deptList, opt.list.depts(t === '특수대' ? '일반대' : t, univ.value.trim()));
    fill(typeList, college ? ['일반전형', '특별전형'] : opt.list.types(univ.value.trim(), dept.value.trim()));
    drawRec();
  };

  /* 일정 추천 — 고르는 동안 바로 바뀐다 */
  const drawRec = () => {
    rec.textContent = '';
    const v = val();
    rec.appendChild(el('div', 'add-rec-h', '추천 일정'));
    if (!v.univ.trim() || !v.dept.trim()) {
      rec.appendChild(el('p', 'hint', '대학과 학과를 적으면 일정 자료에서 이 지원의 일정을 찾아 보여 줍니다.'));
      return;
    }
    let list = [];
    try { list = opt.preview(draftApp('', v)) || []; } catch (err) { list = []; }
    if (!list.length) {
      rec.appendChild(el('p', 'hint', '일정 자료에서 이 지원의 날을 찾지 못했습니다. 더한 뒤 카드에서 날짜를 넣을 수 있습니다.'));
      return;
    }
    const ul = el('ul', 'add-rec-list');
    for (const r of list) {
      const li = el('li', r.maybe ? 'maybe' : '');
      if (!r.from) {
        li.appendChild(el('span', 'hint', `${r.label} — ${r.why}`));
      } else {
        li.appendChild(el('b', 'num', r.from === r.to ? dayText(r.from) : `${dayText(r.from)}~${dayText(r.to)}`));
        li.appendChild(document.createTextNode(` ${r.label}`));
        if (r.maybe) li.appendChild(el('span', 'tag', '면접이 있다면'));
        if (r.why) li.title = r.why;
      }
      ul.appendChild(li);
    }
    rec.appendChild(ul);
    rec.appendChild(el('p', 'hint', '이 날들은 카드에 「예정」(점선)으로 붙습니다. 대학에서 받은 날이 다르면 카드에서 고치세요.'));
  };

  for (const n of [type, round, cat, interview]) n.addEventListener('change', refresh);
  for (const n of [univ, dept, typeName]) n.addEventListener('input', refresh);

  box.appendChild(form);
  box.appendChild(rec);
  box.appendChild(say);

  const bar = el('div', 'cal-edit-bar');
  const go = el('button', 'btn btn-primary', '더하기');
  go.type = 'button';
  go.onclick = async () => {
    const v = val();
    say.hidden = true;
    const miss = !v.univ.trim() ? '대학을 적어 주세요.'
      : !v.dept.trim() ? '학과(모집단위)를 적어 주세요.'
        : v.univType === '전문대' && !v.round ? '수시1차인지 2차인지 골라 주세요 — 일정이 차수마다 다릅니다.'
          : v.univType !== '전문대' && !v.typeName.trim() ? '전형 이름을 적어 주세요.' : '';
    if (miss) { say.textContent = miss; say.hidden = false; return; }
    // 자료에 있는 이름이면 그 이름으로 저장한다 — 카드에 작년 숫자·일정이 붙는다
    const kind = v.univType === '특수대' ? '일반대' : v.univType;
    const known = opt.list.resolve(kind, v.univ.trim()) || null;
    const app = draftApp('', { ...v, univ: known || v.univ });
    go.disabled = true;
    try {
      await opt.submit({
        univType: app.univType, univ: app.univ, dept: app.dept, typeCat: app.typeCat,
        typeSub: app.typeSub, interview: app.interview,
      });
      close();
    } catch (err) {
      say.textContent = `더하지 못했습니다 — ${err.message}`;
      say.hidden = false;
      go.disabled = false;
    }
  };
  bar.appendChild(go);
  const cancel = el('button', 'btn', '닫기');
  cancel.type = 'button';
  cancel.onclick = close;
  bar.appendChild(cancel);
  box.appendChild(bar);

  back.appendChild(box);
  document.body.appendChild(back);
  refresh();
  univ.focus();
}
