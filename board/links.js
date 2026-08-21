/**
 * 학생 링크 내보내기 (P5)
 * =====================================================================
 * 같이 보면서 상담하는 도구라, 링크를 나눠 주는 일이 가장 자주 하는 내보내기가 된다.
 * 반을 고르고 누르면 학생 수만큼의 개인 주소가 한 번에 나온다.
 *
 * 주소에는 Apps Script 배포 주소가 함께 실린다. 학생 쪽에서 따로 설정할 것이 없어야
 * 하기 때문이다. 대신 그 주소가 곧 열쇠이므로 **링크는 본인에게만** 보낸다.
 *
 * 세 가지 모양으로 뽑는다
 *   표      — 화면에서 하나씩 복사
 *   CSV     — 반 명단에 붙여 문자로 발송
 *   문자 문구 — 이름과 주소가 들어간 완성 문장. 그대로 붙여 넣으면 된다
 */
import * as api from './api.js';
import * as store from './store.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

let issued = [];        // [{hak, name, token}]
let busy = false;
let notice = '';

/** 학생이 열 주소. board.html 과 같은 폴더의 student.html 을 가리킨다. */
function linkOf(token) {
  const base = location.href.replace(/board\.html.*$/, 'student.html');
  const q = new URLSearchParams({ s: token });
  if (api.url()) q.set('api', api.url());
  return `${base}?${q}`;
}

export function start() {
  store.on('change', render);
  render();
}

function render() {
  const main = $('#links');
  if (!main || main.hidden) return;
  main.textContent = '';

  if (!store.state.ready) {
    main.appendChild(el('p', 'empty-state', '자료를 불러오는 중입니다.'));
    return;
  }

  const { cls } = store.selection;
  const box = el('section', 'panel');
  const head = el('div', 'panel-head');
  head.appendChild(el('h2', '', cls ? `${cls}반 학생 링크` : '학년 전체 학생 링크'));
  head.appendChild(el('span', 'count num', `${store.studentsOf(cls).length}명`));
  box.appendChild(head);

  box.appendChild(el('p', 'section-label',
    '링크 하나는 그 학생의 지원만 엽니다. 본인에게만 보내 주세요.'));

  if (!api.configured()) {
    box.appendChild(el('p', 'empty-state',
      '보기용 자료에서는 링크를 만들 수 없습니다. 설정에서 Apps Script 주소를 넣은 뒤 다시 열어 주세요.'));
    main.appendChild(box);
    return;
  }

  const tools = el('div', 'tabs');
  const make = el('button', 'btn btn-primary', busy ? '만드는 중' : '링크 만들기');
  make.type = 'button';
  make.disabled = busy;
  make.onclick = () => issueAll(cls);
  tools.appendChild(make);

  if (issued.length) {
    for (const [text, fn] of [['CSV 복사', csv], ['문자 문구 복사', sms]]) {
      const b = el('button', 'btn', text);
      b.type = 'button';
      b.onclick = () => copy(fn());
      tools.appendChild(b);
    }
  }
  box.appendChild(tools);

  if (notice) box.appendChild(el('p', 'note', notice));

  if (!issued.length) {
    box.appendChild(el('p', 'empty-state',
      '아직 만들지 않았습니다. 「링크 만들기」를 누르면 이미 있는 학생은 그대로 두고 없는 학생만 새로 만듭니다.'));
    main.appendChild(box);
    return;
  }

  const tw = el('div', 'tw');
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>학번</th><th>이름</th><th>링크</th><th></th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const s of issued) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', 'm', s.hak));
    tr.appendChild(el('td', null, s.name));
    const td = el('td');
    const a = el('a', null, '학생 화면 열기');
    a.href = linkOf(s.token);
    a.target = '_blank';
    a.rel = 'noopener';
    td.appendChild(a);
    tr.appendChild(td);
    const act = el('td');
    const b = el('button', 'btn', '복사');
    b.type = 'button';
    b.onclick = () => copy(linkOf(s.token), `${s.name} 링크를 복사했습니다.`);
    act.appendChild(b);
    tr.appendChild(act);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tw.appendChild(table);
  box.appendChild(tw);
  main.appendChild(box);
}

async function issueAll(cls) {
  busy = true; notice = ''; render();
  try {
    const data = await api.call('issueAll', { cls: cls || '' }, { timeout: 45000 });
    issued = data.items || [];
    notice = `${issued.length}명 링크를 준비했습니다.`;
  } catch (err) {
    notice = `오류: ${err.message}`;
  } finally {
    busy = false; render();
  }
}

function csv() {
  return ['학번,이름,링크', ...issued.map((s) => `${s.hak},${s.name},${linkOf(s.token)}`)].join('\n');
}

function sms() {
  return issued
    .map((s) => `${s.name} 학생, 수시 지원 현황을 여기서 볼 수 있습니다. ${linkOf(s.token)}`)
    .join('\n');
}

/** 클립보드가 막힌 환경이 있어 실패하면 조용히 넘기지 않고 알린다. */
async function copy(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    notice = done || '복사했습니다.';
  } catch (err) {
    notice = '복사가 막혀 있습니다. 표에서 링크를 눌러 주소창에서 복사해 주세요.';
  }
  render();
}
