import { open } from './lib.mjs';
const { browser, page } = await open();
const out = 'D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/runs/2026-09-19_run15-ledger2/downloads/';
await page.goto('http://127.0.0.1:3000/settings', { waitUntil: 'load', timeout: 180000 });
await page.waitForTimeout(3000);
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByRole('button', { name: '백업 내보내기' }).first().click()]);
await dl.saveAs(out + 'ledger2-2025-only.cbam');
console.log('saved', dl.suggestedFilename());
await browser.close();
