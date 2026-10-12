// run36 3차 — 2차 결과를 손으로 검산해 보니 원료가 제품에 「생산량 비율」로 퍼져 제품 1 t당 원료 투입이 0.85~1.69 t로 어긋났다.
// 품번 목록(재질·CN·생산량·스크랩)에서 강종→CN별 투입량을 직접 계산해 구매 강재 줄을 CN별로 쪼갠다. 같은 CN의 수출·비수출 줄은 함께 적는다(제4조 2항).
//   node cbamy/runs/2026-10-12_run36-pungkang-workbook/make-pass3.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fill = JSON.parse(readFileSync(path.join(dir, 'fill-pass2.json'), 'utf8'));
fill._note = 'run36 3차 — 구매 강재를 강종→CN별 투입량(품번 목록의 생산량+스크랩 비율)으로 쪼개고 「쓰는 제품」에 그 CN의 수출·비수출 줄을 함께 적음. 모두 가상 수치.';

const PRODUCTS = {
  '73181692': 'SWCH35K·SWCH10A · CN 73181692;SWCH35K·SWCH10A · CN 73181692 (비수출)',
  '73181660': 'SWCH35K·SWCH45K · CN 73181660;SWCH45K · CN 73181660 (비수출)',
  '73181699': 'SWCH45K·S45C · CN 73181699;SWCH45K·S45C · CN 73181699 (비수출)',
  '73181595': 'SWCH35K · CN 73181595',
};
const tonnes = (part) => (part.mass ? Number(part.mass) : (Number(part.qty) * Number(part.unitWeight)) / 1e6) + Number(part.scrap ?? 0);
const inputByGradeCn = {};
for (const part of fill.parts) ((inputByGradeCn[part.grade] ??= {})[part.cn] = (inputByGradeCn[part.grade][part.cn] ?? 0) + tonnes(part));

const rows = [];
for (const precursor of fill.precursors) {
  const split = inputByGradeCn[precursor.where] ?? {};
  const cns = Object.keys(split).filter((cn) => PRODUCTS[cn]);
  if (precursor.name.startsWith('STS430') || cns.length === 0) { rows.push(precursor.name.startsWith('STS430') ? { ...precursor, products: PRODUCTS['73181692'] } : precursor); continue; }
  const total = cns.reduce((sum, cn) => sum + split[cn], 0);
  let left = Number(precursor.consumed);
  cns.forEach((cn, index) => {
    const amount = index === cns.length - 1 ? Math.round(left * 10) / 10 : Math.round((Number(precursor.consumed) * split[cn] / total) * 10) / 10;
    left -= amount;
    const rest = { ...precursor }; delete rest.purchased;
    rows.push({ ...rest, name: cns.length > 1 ? `${precursor.name} → CN ${cn}` : precursor.name, consumed: String(amount), products: PRODUCTS[cn] });
  });
}
fill.precursors = rows;
writeFileSync(path.join(dir, 'fill-pass3.json'), JSON.stringify(fill, null, 2));
for (const row of rows) console.log(row.consumed.padStart(8), row.name);
