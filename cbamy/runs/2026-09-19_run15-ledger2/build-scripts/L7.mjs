import { open, mapText, openStep, dumpForm } from './lib.mjs';
const { browser, page } = await open();
page.on('dialog', (d) => d.accept());
const proc = page.locator('main select').nth(0);
const opts = await proc.locator('option').evaluateAll((els) => els.map((e) => [e.value, e.textContent]));
for (const [key, mwh] of [['P1', '1563800'], ['P2', '324700']]) {
  await proc.selectOption(opts.find((o) => o[1].startsWith(key))[0]);
  await page.waitForTimeout(700);
  const i = page.locator('main input:visible');
  await i.nth(0).fill(mwh); await i.nth(1).fill('0.4594');
  await page.getByRole('button', { name: '전력 저장' }).click();
  await page.waitForTimeout(2000);
  console.log(key, 'saved');
}
let t = await mapText(page);
console.log('map:', t.match(/\d \/ 6 완료/)?.[0], '|', t.match(/5 ② 전력 \| [^|]+/)?.[0]);
await openStep(page, 6);
await dumpForm(page, 'step6');
await browser.close();
