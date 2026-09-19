import { open, mapText } from './lib.mjs';
const { browser, page } = await open();
page.on('dialog', (d) => d.accept());
const msg = async () => (await page.locator('main').innerText()).split('\n').filter((l) => /저장했습니다|입력하세요|고르세요|찾지 못|채웠습니다|기본값/.test(l) && l.length < 140).slice(-2).join(' ; ').slice(0, 170);
const byLabel = (text) => page.locator('main label, main div').filter({ hasText: new RegExp('^' + text) }).locator('input').first();
const fillBase = async (name, cn, consumed, country) => {
  const i = page.locator('main input[type="text"]:visible, main input:not([type]):visible');
  await i.nth(0).fill(name); await i.nth(1).fill(cn); await i.nth(2).fill(String(consumed)); await i.nth(3).fill(String(consumed));
  const sel = page.locator('main select').nth(1);
  await sel.selectOption({ label: country });
  await page.waitForTimeout(500);
  return i;
};
const actual = async (name, cn, consumed, country, direct, mwh, factor, source) => {
  const i = await fillBase(name, cn, consumed, country);
  if (!(await page.getByRole('button', { name: '간접분 칸에 채우기' }).count())) { await page.getByRole('button', { name: /간접분을 전력사용량×계수로 입력/ }).click(); await page.waitForTimeout(600); }
  await i.nth(4).fill(String(direct));
  await i.nth(6).fill(String(mwh)); await i.nth(7).fill(String(factor));
  await page.getByRole('button', { name: '간접분 칸에 채우기' }).click();
  await page.waitForTimeout(500);
  console.log('   indirect filled =', await i.nth(5).inputValue());
  await page.locator('main input:visible').last().fill(source).catch(() => {});
  await page.getByRole('button', { name: '원료 저장' }).click();
  await page.waitForTimeout(2200);
  console.log(name.slice(0, 16).padEnd(16), '|', await msg());
};
const dflt = async (name, cn, consumed, country) => {
  const i = await fillBase(name, cn, consumed, country);
  await page.getByRole('button', { name: /EU 기본값 채우기/ }).click();
  await page.waitForTimeout(1500);
  console.log('   default filled: direct', await i.nth(4).inputValue(), 'indirect', await i.nth(5).inputValue(), '|', await msg());
  await page.getByRole('button', { name: '원료 저장' }).click();
  await page.waitForTimeout(2200);
  console.log(name.slice(0, 16).padEnd(16), '|', await msg());
};
// done: PP1
// await actual('PP1 탄소강 강괴 (BOF) — 인도네시아', '72061000', 80500, 'Indonesia', 1.48, 0.245, 0.7, '공급사 탄소데이터 시트 2025 · 전력계수 0.7은 시험 원장용 가정');
await actual('PP2 페로니켈 FeNi 28% — 일본', '72026000', 347000, 'Japan', 3.0, 3.001, 0.45, '공급사 탄소데이터 시트 2025 · 전력계수 0.45는 시험 원장용 가정');
await actual('PP3 페로크롬 FeCr 52% — 인도', '72024110', 331000, 'India', 2.5, 2.821, 0.7, '공급사 탄소데이터 시트 2025 · 전력계수 0.7은 시험 원장용 가정');
await dflt('PP4 페로망간 FeMn 31% — 중국 (미회신)', '72021120', 60600, 'China');
await dflt('TEST 강괴 (EAF) — 태국', '72061000', 5000, 'Thailand');
await dflt('TEST 강괴 — 북마케도니아 (경로 없음)', '72061000', 1000, 'North Macedonia');
const t = await mapText(page);
console.log('map:', t.match(/\d \/ 6 완료/)?.[0], '|', t.match(/6 ③ 전구물질 \| [^|]+/)?.[0], '|', t.match(/7 검증 · 결과 SEE \| [^|]+/)?.[0], '|', t.match(/8 EU 문서 생성 \| [^|]+/)?.[0]);
await browser.close();
