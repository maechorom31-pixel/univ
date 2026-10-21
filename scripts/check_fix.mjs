/**
 * **선생님 고침이 저장되고 화면마다 같은 값을 말하는가**를 잰다 (board/fix.js).
 *
 * 가짜 백엔드를 띄워 setField 를 받아 두고, 카드 상세에서
 *   1. 수능최저를 고쳐 적으면 서버에 전형 단위(hak `*`)로 가는가
 *   2. 카드 상세가 그 글을 「선생님 고침」으로 보여 주는가
 *   3. 보드 꼬리표가 고친 기준으로 바뀌는가
 *   4. 70% 컷을 고치면 요약(store.summary)이 바뀌는가 — 보드·종이가 그걸 본다
 *   5. 비우고 저장하면 지워지는가
 *   6. 점검 화면이 오류 없이 그려지는가
 * 를 본다.
 *
 * 쓰는 법
 *   python3 -m http.server 8899 &
 *   node scripts/check_fix.mjs [주소]
 */
import http from 'node:http';
import { createRequire } from 'node:module';

const URL_ = process.argv[2] || 'http://localhost:8899/board.html';
const PORT = 8902;
const { demo } = await import('../board/demo.js');
const writes = [];

const server = http.createServer((req, res) => {
  const q = new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams;
  const cb = q.get('callback') || 'cb';
  const action = q.get('action') || '';
  const send = (body) => {
    const out = `${cb}(${JSON.stringify(body)})`;
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(out);
  };
  if (action === 'students') send({ ...demo, ok: true });
  else {
    if (action === 'setField') writes.push(Object.fromEntries(q));
    send({ ok: true });
  }
});
await new Promise((done) => server.listen(PORT, '127.0.0.1', done));

const require_ = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require_('playwright'));
} catch {
  ({ chromium } = require_('/opt/node22/lib/node_modules/playwright/index.js'));
}
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
// 전문대 자료(../College)는 이 저장소 밖이라 여기서는 404 가 난다 — 세지 않는다
page.on('response', (r) => { if (r.status() === 404) console.log(`  (404 ${new URL(r.url()).pathname})`); });
await page.addInitScript((port) => {
  localStorage.setItem('board.apiUrl', `http://127.0.0.1:${port}/exec`);
}, PORT);
await page.goto(URL_, { waitUntil: 'networkidle' });
await page.waitForFunction(async () => (await import('/board/store.js')).state.enriched, null, { timeout: 30000 });

let bad = 0;
const ok = (cond, label, got) => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${cond ? '' : `\n      받음 ${got}`}`);
  if (!cond) bad += 1;
};

// 순위에 든 일반대 카드 하나
const target = await page.evaluate(async () => {
  const s = await import('/board/store.js');
  for (const st of s.studentsOf('')) {
    for (const a of s.appsOf(st.hak)) {
      if (s.placementOf(a.id).slot === 'rank' && a.univType === '일반대') {
        s.select({ cls: st.cls, hak: st.hak, appId: a.id });
        return { id: a.id, hak: a.hak, cls: st.cls, univ: a.univ, dept: a.dept };
      }
    }
  }
  return null;
});
ok(!!target, '순위에 든 카드를 찾았다', target);
await page.waitForSelector('#detail .fix-panel');

const MIN = '국어, 수학, 영어, 탐구(1과목) 중 2개 영역 등급 합 5 이내';
// 최저 칸의 고치기를 펴고 적는다
const panel = page.locator('#detail .detail-block .fix-panel').first();
await panel.locator('summary').click();
await panel.locator('textarea').fill(MIN);
await panel.locator('button', { hasText: '저장' }).click();
await page.waitForTimeout(600);

const w = writes.find((x) => x.field === '고침:수능최저');
ok(w && w.hak === '*' && /^전형\|/.test(w.id) && w.value === MIN, '수능최저가 전형 단위로 저장된다', JSON.stringify(w));
const detailText = await page.locator('#detail').innerText();
ok(detailText.includes(MIN) && detailText.includes('선생님 고침'), '카드 상세가 고친 기준을 「선생님 고침」으로 보인다', detailText.slice(0, 300));
ok(await page.locator('#detail .fix-panel[open]').count() >= 1, '저장 뒤에도 고치기 칸이 펴져 있다', '');

const pill = await page.evaluate(async (id) => {
  const s = await import('/board/store.js');
  const app = s.state.apps.get(id);
  return { m: s.minReqOf(app), boardText: document.querySelector('#board').innerText };
}, target.id);
ok(pill.m.fixed && pill.boardText.includes('최저 2합 5'), '보드 꼬리표가 「최저 2합 5」로 바뀐다', JSON.stringify(pill.m));

// 70컷 — 요약이 바뀌는가
const cut = await page.evaluate(async (id) => {
  const s = await import('/board/store.js');
  const app = s.state.apps.get(id);
  await s.setFix(app, '70컷', '2.95');
  return s.summary(app).cut;
}, target.id);
ok(cut === 2.95, '70% 컷을 고치면 요약이 그 값을 쓴다', cut);
const wrong = await page.evaluate(async (id) => {
  const s = await import('/board/store.js');
  try { await s.setFix(s.state.apps.get(id), '70컷', '모름'); return 'saved'; } catch (e) { return e.message; }
}, target.id);
ok(/숫자/.test(wrong), '숫자 칸에 글자를 넣으면 막는다', wrong);

// 지우기
await page.evaluate(async (id) => {
  const s = await import('/board/store.js');
  await s.setFix(s.state.apps.get(id), '수능최저', '');
}, target.id);
await page.waitForTimeout(300);
const gone = writes.filter((x) => x.field === '고침:수능최저').pop();
ok(gone && gone.value === '', '비우고 저장하면 지운다', JSON.stringify(gone));

// 점검 화면
await page.evaluate(() => { document.getElementById('detail').hidden = true; });
await page.evaluate(async () => (await import('/board/store.js')).select({ appId: '' }));
await page.click('#view-verify');
await page.waitForTimeout(500);
ok(errors.length === 0, '콘솔 오류가 없다', errors.join(' | '));

// 좁은 폭에서 고치기 칸
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(async (t) => (await import('/board/store.js')).select({ appId: t.id }), target);
await page.waitForSelector('#detail .fix-panel');
const all = page.locator('#detail .fix-panel').last();
await all.locator('summary').click();
await all.scrollIntoViewIfNeeded();
const overflow = await page.evaluate(() => {
  const d = document.querySelector('#detail .detail');
  return d.scrollWidth - d.clientWidth;
});
ok(overflow <= 1, '좁은 폭에서 가로로 넘치지 않는다', overflow);
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: false });

await browser.close();
server.close();
console.log(bad ? `\n${bad}개 실패` : '\n모두 통과');
process.exit(bad ? 1 : 0);
