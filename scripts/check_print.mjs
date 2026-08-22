/**
 * 내보내기 문서를 **종이 폭에서** 잰다.
 * =====================================================================
 * 화면(1280px)에서 멀쩡하던 칸이 A4 세로 186mm 에서 두 줄로 갈린다. 그래서
 * 브라우저에 `print` 매체를 씌우고 `.sheet` 폭을 A4 로 박은 뒤에 잰다.
 *
 *   갈렸나   칸 안의 줄 상자를 센다 (Range.getClientRects)
 *   넘쳤나   scrollWidth 가 clientWidth 보다 큰가
 *
 * 일부러 여러 줄로 짠 칸은 뺀다 — 등록 대학(대학/학과), 메모 목록, 머리글의
 * `<br>`, 접어 둔 대학 이름 줄(`tr.rest`), 설명 칸(`td.lead`).
 *
 * 쓰는 법
 *   python3 -m http.server 8899 &
 *   node scripts/check_print.mjs [주소]
 *
 * 갈리거나 넘친 칸이 하나라도 있으면 1 을 돌려준다.
 */
import { createRequire } from 'node:module';

const URL_ = process.argv[2] || 'http://localhost:8899/board.html?demo=1';
const MM = 96 / 25.4;
const PORT = Math.round(186 * MM);   // A4 세로 210 − 좌우 12mm (@page doc)
const LAND = Math.round(286 * MM);   // A4 가로 297 − 좌우 6+5mm (@page land)
const VIEWS = ['진학 대장', '지원 결과 보고서', '합격자 발표 현황', '최종 결과 보고서'];

/* playwright 는 이 저장소의 의존성이 아니라 전역에 깔려 있을 수 있다 */
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
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

await page.goto(URL_, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1800);
await page.click('#view-export');
await page.waitForTimeout(1200);

let bad = 0;
for (const view of VIEWS) {
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate((label) => {
    const b = [...document.querySelectorAll('#export .tabs button')]
      .find((x) => x.textContent.trim() === label);
    if (b) b.click();
  }, view);
  await page.waitForTimeout(600);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(300);

  const found = await page.evaluate(({ p, l }) => {
    for (const sheet of document.querySelectorAll('#export .sheet')) {
      sheet.style.width = `${sheet.classList.contains('sheet-land') ? l : p}px`;
      sheet.style.maxWidth = 'none';
    }
    document.body.offsetHeight;
    const out = [];
    for (const sheet of document.querySelectorAll('#export .sheet')) {
      const land = sheet.classList.contains('sheet-land');
      for (const td of sheet.querySelectorAll('td, th')) {
        const text = td.textContent.trim();
        if (!text || text === '—') continue;
        if (td.querySelector('div, ul, br, small')) continue;
        if (td.closest('tr.rest') || td.classList.contains('memo')
            || td.classList.contains('lead')) continue;
        const range = document.createRange();
        range.selectNodeContents(td);
        const lines = range.getClientRects().length;
        const over = td.scrollWidth > td.clientWidth + 1;
        if (lines > 1 || over) {
          out.push(`${over ? '넘침' : `${lines}줄`} ${land ? '가로' : '세로'} | ${text.slice(0, 46)}`);
        }
      }
    }
    return [...new Set(out)];
  }, { p: PORT, l: LAND });

  bad += found.length;
  console.log(`${view.padEnd(14)} ${found.length === 0 ? '이상 없음' : `${found.length}건`}`);
  found.forEach((x) => console.log(`   ${x}`));
}

if (errors.length) {
  bad += errors.length;
  console.log(`\n스크립트 오류 ${errors.length}건`);
  errors.slice(0, 5).forEach((e) => console.log(`   ${e}`));
}
await browser.close();
console.log(bad ? `\n갈리거나 넘친 칸 ${bad}건` : '\n네 문서 모두 한 칸 한 줄');
process.exit(bad ? 1 : 0);
