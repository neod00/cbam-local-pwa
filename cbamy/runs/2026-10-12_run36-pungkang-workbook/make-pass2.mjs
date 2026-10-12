// run36 2차 — 1차를 올리고 받은 「확인할 것」만 보고 고친 것(앱 화면에서 직접 고치지 않고 서식을 고쳐 다시 올린다).
//   node cbamy/runs/2026-10-12_run36-pungkang-workbook/make-pass2.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fill = JSON.parse(readFileSync(path.join(dir, 'fill-pass1.json'), 'utf8'));
fill._note = 'run36 2차 — 「확인할 것」을 보고 고침: 공정 밖 열량, STS 스트립 CN 8자리, 구매 강재의 「쓰는 제품」, 공급사 값 기준 기간. 모두 가상 수치.';

// (1) 공정 밖(사무동·식당) 열: 연료 에너지 100,200 Nm³ × 0.037 GJ = 3,707 GJ의 15% × 보일러 효율 90% ≈ 500 GJ
Object.assign(fill.boilerHeat[0], { quantity: '500', unit: 'GJ' });

// (2) 「쓰는 제품」 — 제품 이름은 1차 「확인할 것」의 참고 줄에 나온 그대로
const N692 = 'SWCH35K·SWCH10A · CN 73181692';
const N660 = 'SWCH35K·SWCH45K · CN 73181660';
const N660D = 'SWCH45K · CN 73181660 (비수출)';
const N699 = 'SWCH45K·S45C · CN 73181699';
const N595 = 'SWCH35K · CN 73181595';
const dom = (name) => `${name} (비수출)`;
const uses = {
  'SWCH35K': [N692, dom(N692), N660, N595],
  'SWCH10A': [N692, dom(N692)],
  'SWCH45K': [N660, N660D, N699, dom(N699)],
  'S45C': [N699, dom(N699)],
};
for (const precursor of fill.precursors) {
  if (precursor.name.startsWith('STS430')) Object.assign(precursor, { cn: '72202049', products: N692 });
  else if (uses[precursor.where]) precursor.products = uses[precursor.where].join(';');
  if (precursor.name.startsWith('SWCH45K')) precursor.period = '2025-01-01 ~ 2025-12-31';
}
writeFileSync(path.join(dir, 'fill-pass2.json'), JSON.stringify(fill, null, 2));
console.log('fill-pass2.json');
