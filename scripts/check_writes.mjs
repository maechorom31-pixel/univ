/**
 * **쓰기를 기다리느라 보드가 잠기지 않는가**를 잰다.
 * =====================================================================
 * 자리를 옮기면 화면은 곧바로 바뀌지만 서버 왕복은 Apps Script 라 1~6초가 걸린다.
 * 예전에는 그 왕복이 끝날 때까지 순위 고르개와 ★ 가 전부 `disabled` 였다 —
 * 후보 넷을 올리려면 넷을 하나씩 기다려야 했다.
 *
 * 일부러 3초 걸리는 가짜 백엔드를 띄워 놓고 카드를 하나 올린 뒤,
 *   1. 다른 카드의 고르개가 잠기지 않는가
 *   2. 「저장 중」이 화면에 뜨는가 (잠그는 대신 말해 준다)
 *   3. 쓰기가 끝나면 그 줄이 사라지는가
 * 를 본다.
 *
 * 쓰는 법
 *   python3 -m http.server 8899 &
 *   node scripts/check_writes.mjs [주소]
 */
import http from 'node:http';
import { createRequire } from 'node:module';

const URL_ = process.argv[2] || 'http://localhost:8899/board.html';
const PORT = 8901;
const DELAY = 3000;                       // 느린 서버 흉내

const { demo } = await import('../board/demo.js');

const server = http.createServer((req, res) => {
  const q = new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams;
  const cb = q.get('callback') || 'cb';
  const action = q.get('action') || '';
  const send = (body) => {
    const out = `${cb}(${JSON.stringify(body)})`;
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Content-Length': Buffer.byteLength(out),
    });
    res.end(out);
  };
  if (action === 'students') send({ ...demo, ok: true });
  else if (action === 'setRank' || action === 'setLock') {
    setTimeout(() => send({ ok: true, at: new Date().toISOString() }), DELAY);
  } else send({ ok: true });
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
await page.addInitScript((port) => {
  localStorage.setItem('board.apiUrl', `http://127.0.0.1:${port}/exec`);
}, PORT);
await page.goto(URL_, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

let bad = 0;
const ok = (cond, label, got) => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${cond ? '' : `\n      받음 ${got}`}`);
  if (!cond) bad += 1;
};

// 후보 카드와 빈 순위가 함께 있는 학생을 고른다
const target = await page.evaluate(async () => {
  const s = await import('/board/store.js');
  for (const st of s.studentsOf('')) {
    const apps = s.appsOf(st.hak);
    const pool = apps.filter((a) => s.placementOf(a.id).slot === 'pool' && !s.lockOf(a));
    const used = new Set(apps.map((a) => s.placementOf(a.id))
      .filter((p) => p.slot === 'rank').map((p) => p.rank));
    const free = [1, 2, 3, 4, 5, 6].filter((r) => !used.has(r));
    if (pool.length && free.length) {
      s.select({ hak: st.hak });
      return { id: pool[0].id, rank: free[0] };
    }
  }
  return null;
});
if (!target) {
  console.log('  보기용 자료에 올릴 후보가 없습니다 — 잴 것이 없습니다.');
  await browser.close();
  server.close();
  process.exit(0);
}
await page.waitForTimeout(600);

const snap = () => page.evaluate(() => {
  const all = [...document.querySelectorAll('#board .card select')];
  return {
    locked: all.filter((x) => x.disabled).length,
    total: all.length,
    saving: [...document.querySelectorAll('#board .note')].some((p) => /저장 중/.test(p.textContent)),
  };
});
const before = await snap();

await page.evaluate(([id, rank]) => {
  const box = document.querySelector(`#board [data-id="${CSS.escape(id)}"]`);
  const sel = box && box.querySelector('select');
  if (!sel) throw new Error('카드를 못 찾았습니다');
  sel.value = `rank:${rank}`;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}, [target.id, target.rank]);
await page.waitForTimeout(200);

const during = await snap();
ok(during.locked <= before.locked,
  '옮기는 동안 다른 카드의 고르개가 잠기지 않는다',
  `${during.locked}/${during.total} 잠김 (옮기기 전 ${before.locked})`);
ok(during.saving, '「저장 중」이라고 말해 준다', JSON.stringify(during));

await page.waitForTimeout(DELAY + 1500);
const after = await snap();
ok(!after.saving, '쓰기가 끝나면 그 줄이 사라진다', JSON.stringify(after));
const placed = await page.evaluate(async (id) => {
  const s = await import('/board/store.js');
  return JSON.stringify(s.placementOf(id));
}, target.id);
ok(/"slot":"rank"/.test(placed), '자리는 그대로 남는다', placed);

await browser.close();
server.close();
console.log(bad ? `\n${bad}건 실패` : '\n모두 통과');
process.exit(bad ? 1 : 0);
