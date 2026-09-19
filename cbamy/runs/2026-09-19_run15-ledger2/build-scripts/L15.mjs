import { open } from './lib.mjs';
const { browser, page } = await open();
await page.goto('http://127.0.0.1:3000/scenarios', { waitUntil: 'load', timeout: 180000 });
await page.waitForTimeout(4500);
await page.getByRole('button', { name: /상세 분석 표/ }).click();
await page.waitForTimeout(1500);
const rows = await page.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.replace(/\n+/g, ' / '))));
rows.forEach((r) => { console.log('ROW', r[0].slice(0, 22), '| out', r[1].slice(0, 22), '| SEE', r[2], '| A', r[6], '| B', r[7].slice(0, 60)); console.log('    SEFA:', r[8].slice(0, 640)); });
await browser.close();
