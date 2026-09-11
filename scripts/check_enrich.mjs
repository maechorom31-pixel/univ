/**
 * 공개 자료를 **못 받았을 때 다시 받는가**를 잰다.
 * =====================================================================
 * 학교 망이 한 번 끊기면 입결·모집요강이 통째로 안 붙는다. 예전에는 그 상태가
 * 창을 닫을 때까지 굳었고, 「새로고침」은 시트만 다시 받았다. 더 나쁜 것은
 * 새로고침이 경고만 지우고 자료는 없는 상태로 두는 것이었다.
 *
 * 여기서 재는 것은 셋이다.
 *   1. 못 받으면 그 자리에서 한 번 더 시도하는가 (요청이 2회 나가는가)
 *   2. 못 받은 것이 경고에 이름으로 남는가
 *   3. 다시 부르면 **못 받은 것만** 받아서 지표가 붙는가
 *
 * 쓰는 법
 *   python3 -m http.server 8899 &
 *   node scripts/check_enrich.mjs [주소]
 */
import { createRequire } from 'node:module';

const URL_ = process.argv[2] || 'http://localhost:8899/board.html?demo=1';
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let hits = 0;
await page.route('**/data/ipgyeol.json', (route) => { hits += 1; route.abort(); });
await page.goto(URL_, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const read = () => page.evaluate(async () => {
  const store = await import('/board/store.js');
  return { err: store.state.error, enriched: store.state.enriched };
});

let bad = 0;
const ok = (cond, label, got) => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${cond ? '' : `\n      받음 ${got}`}`);
  if (!cond) bad += 1;
};

const down = await read();
ok(hits === 2, '못 받으면 그 자리에서 한 번 더 시도한다', `요청 ${hits}회`);
ok(/입결/.test(down.err), '못 받은 것이 경고에 이름으로 남는다', down.err);
ok(down.enriched, '나머지 자료로 화면은 그린다', String(down.enriched));

await page.unroute('**/data/ipgyeol.json');
await page.evaluate(async () => { const store = await import('/board/store.js'); await store.enrich(); });
await page.waitForTimeout(1500);

const up = await read();
ok(!/입결/.test(up.err), '다시 부르면 못 받은 것만 받아 경고에서 빠진다', up.err);
const got = await page.evaluate(async () => {
  const store = await import('/board/store.js');
  const app = store.appsOf('3201')[0];
  return app ? store.summary(app).cut : null;
});
ok(got != null, '지표가 실제로 붙는다', String(got));

await browser.close();
console.log(bad ? `\n${bad}건 실패` : '\n모두 통과');
process.exit(bad ? 1 : 0);
