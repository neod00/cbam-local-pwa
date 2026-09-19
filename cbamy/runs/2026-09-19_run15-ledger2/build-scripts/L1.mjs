import { open, mapText, openStep, dumpForm } from './lib.mjs';
const { browser, page } = await open();
page.on('dialog', (d) => { console.log('  DIALOG:', d.message().replace(/\n/g, ' ').slice(0, 60)); d.message().includes('백업할까요') ? d.dismiss() : d.accept(); });
let t = await mapText(page);
console.log('start:', t.match(/\d \/ 6 완료/)?.[0], t.match(/기준 [\d.]+/)?.[0]);
if (!/기준 3\.764/.test(t)) { console.log('NOT BASELINE - abort'); await browser.close(); process.exit(1); }
await page.getByRole('button', { name: '새 프로젝트' }).click();
await page.waitForTimeout(4000);
t = await mapText(page);
console.log('after new project:', t.match(/\d \/ 6 완료/)?.[0]);
await openStep(page, 1);
await dumpForm(page, 'step1');
await browser.close();
