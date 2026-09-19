import { open, mapText } from './lib.mjs';
const { browser, page } = await open();
page.on('dialog', (d) => d.accept());
const out = 'D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/runs/2026-09-19_run15-ledger2/downloads/';
await page.goto('http://127.0.0.1:3000/export', { waitUntil: 'load', timeout: 180000 });
await page.waitForTimeout(4000);
const sel = page.locator('#export-period');
await sel.selectOption({ index: (await sel.locator('option').allInnerTexts()).findIndex((o) => o.startsWith('2026')) });
await page.waitForTimeout(3000);
const txt = await page.locator('main').innerText();
console.log('EXPORT issues:'); txt.split('\n').filter((l) => /보고기간|기간 밖|제외됩니다|오류 \d|경고 \d/.test(l)).slice(0, 8).forEach((l) => console.log('  -', l.slice(0, 190)));
for (const [name, file] of [['수입자 전달용 복사본 다운로드', 'ledger2-2026-eu-copy.xlsx'], ['산정보고서(Word) 다운로드', 'ledger2-2026-report.docx']]) {
  const btn = page.getByRole('button', { name });
  if (await btn.isDisabled()) { console.log(name, 'DISABLED'); continue; }
  const dlp = page.waitForEvent('download', { timeout: 120000 }).catch(() => null);
  await btn.click({ noWaitAfter: true });
  const dl = await dlp;
  if (dl) { await dl.saveAs(out + file); console.log('saved', file); }
  else console.log(name, 'NO DOWNLOAD:', (await page.locator('main').innerText()).split('\n').filter((l) => /차단|오류|실패/.test(l)).slice(0, 3).join(' | ').slice(0, 300));
}
let t = await mapText(page);
console.log('MAP:', t.match(/· 20\d\d년 연간/)?.[0], '|', t.match(/3 생산공정 \| [^|]+/)?.[0], '|', t.match(/7 검증 · 결과 SEE \| [^|]+/)?.[0], '|', t.match(/8 EU 문서 생성 \| [^|]+/)?.[0]);
await browser.close();
