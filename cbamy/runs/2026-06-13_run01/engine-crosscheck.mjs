// 씨밤이 run01 — CBAM_Platform 계산엔진 ↔ EU 공식 EAF alloys 예제 교차검증
// 실제 src/lib 엔진(TS)을 transpile해 VM에서 실행, EU 예제 정답과 대조.
// 사용: node cbamy/runs/2026-06-13_run01/engine-crosscheck.mjs  (CBAM_Platform 루트에서)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const ROOT = process.cwd().endsWith('CBAM_Platform')
  ? process.cwd()
  : 'D:/OneDrive/Business/ai automation/CBAM_Platform';
const L = (p) => path.join(ROOT, p);

function loadEngine() {
  const ss = readFileSync(L('src/lib/source-stream-calculation.ts'), 'utf8')
    .replace(/^import type .*;\r?\n/gm, '').replace(/^export /gm, '');
  const pr = readFileSync(L('src/lib/cbam-product-rules.ts'), 'utf8')
    .replace(/^import type .*;\r?\n/gm, '').replace(/^export /gm, '');
  const ce = readFileSync(L('src/lib/calculation-engine.ts'), 'utf8')
    .replace(/^import type .* from '\.\/local-db';\r?\n/gm, '')
    .replace("import { calculateSourceStreamEmissions, calculateSourceStreamEnergyBreakdown } from './source-stream-calculation';", '')
    .replace("import { getIndirectEmissionsApplicability } from './cbam-product-rules';", '')
    .replace(/^export /gm, '');
  const compiled = ts.transpileModule(
    `${ss}\n${pr}\n${ce}\nglobalThis.E={calculateLocalResults,getIndirectEmissionsApplicability};`,
    { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const ctx = vm.createContext({});
  vm.runInContext(compiled, ctx);
  return ctx.E;
}
const { calculateLocalResults } = loadEngine();

const EF = 0.833; // EU 예제 'Mix' 전력 배출계수 tCO2e/MWh

// ---- 제품 (CN 코드로 Annex II direct-only 판정) ----
const products = [
  { id: 'pr-p1', name: '합금강 슬래브 V2A', hs_code: '7218', cn_code: '72189911', unit: 'tonne' },
  { id: 'pr-p2', name: '스테인리스 시트 V2A', hs_code: '7219', cn_code: '72191310', unit: 'tonne' },
];
const period = { id: 'per-2025', name: '2025 Annual', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT' };

// ---- P1: EAF 제강+연주 (EU 예제값) ----
const P1 = {
  id: 'proc-p1', period_id: period.id, product_id: 'pr-p1', name: 'EAF incl. continuous casting',
  production_route: 'Electric arc furnace', output_mass_t: 2234000,
  direct_attributable_emissions_tco2e: 171005.31, // SE(direct) own
  electricity_mwh: 2234000 * 0.7, electricity_ef_tco2e_per_mwh: EF, // 0.7 MWh/t
};
// ---- P2: 압연+정정 ----
const P2 = {
  id: 'proc-p2', period_id: period.id, product_id: 'pr-p2', name: 'Rolling mill and finishing',
  production_route: 'Flat steel processing', output_mass_t: 1133000,
  direct_attributable_emissions_tco2e: 402245.42,
  electricity_mwh: 324700, electricity_ef_tco2e_per_mwh: EF, // ≈0.28655 MWh/t
};

// ---- 전구물질 ----
// P1 매입 전구물질 (EU 예제 SEE 값 그대로; indirect는 이미 tCO2e/t로 환산된 값)
const precP1 = [
  { id: 'pp1', process_id: 'proc-p1', product_id: 'pr-p1', name: '탄소강 강괴', consumed_mass_t: 80500,
    direct_see_tco2e_per_t: 1.48, indirect_see_tco2e_per_t: 0.20400, source: 'supplier' },
  { id: 'pp2', process_id: 'proc-p1', product_id: 'pr-p1', name: 'FeNi 28%Ni', consumed_mass_t: 347000,
    direct_see_tco2e_per_t: 3.0, indirect_see_tco2e_per_t: 2.49983, source: 'supplier' },
  { id: 'pp3', process_id: 'proc-p1', product_id: 'pr-p1', name: 'FeCr 52%Cr', consumed_mass_t: 331000,
    direct_see_tco2e_per_t: 2.5, indirect_see_tco2e_per_t: 2.34989, source: 'supplier' },
  { id: 'pp4', process_id: 'proc-p1', product_id: 'pr-p1', name: 'FeMn 31%Mn', consumed_mass_t: 60600,
    direct_see_tco2e_per_t: 1.3, indirect_see_tco2e_per_t: 1.90007, source: 'default' },
];
// P2 사내 전구물질: P1 조강 (consumed 1,227,000; SEE = P1 결과 direct/indirect)
const precP2 = [
  { id: 'pp-int', process_id: 'proc-p2', product_id: 'pr-p2', name: 'P1 조강(사내)', consumed_mass_t: 1227000,
    direct_see_tco2e_per_t: 1.00149, indirect_see_tco2e_per_t: 1.37842, source: 'internal P1' },
];

const r = calculateLocalResults({
  processes: [P1, P2], precursors: [...precP1, ...precP2], products, periods: [period],
});

// EU 정답
const EU = {
  'proc-p1': { see_direct: 1.00149, see_indirect: 1.37842, see_total: 2.37991, se_direct_own: 0.07655, se_indirect_own: 0.5831 },
  'proc-p2': { see_direct: 1.43961, see_indirect: 1.73148, see_total: 3.17109, se_direct_own: 0.35503, se_indirect_own: 0.23870 },
};

const f = (x) => Number(x).toFixed(5);
console.log('================ 씨밤이 엔진 교차검증 (EU EAF alloys 예제) ================\n');
for (const res of r) {
  const eu = EU[res.process_id];
  // 규정상 인증서 기준(direct-only) = SE(direct,own) + 전구물질 DIRECT 기여만
  const precSrc = res.process_id === 'proc-p1' ? precP1 : precP2;
  const precDirectContrib = precSrc.reduce((s, p) => s + p.consumed_mass_t * p.direct_see_tco2e_per_t, 0) / res.output_mass_t;
  const correctCertBasis = res.direct_see + precDirectContrib; // SEE(direct) = own direct + precursor direct
  console.log(`■ ${res.process_name}  (CN ${res.cn_code})  output=${res.output_mass_t} t`);
  console.log(`  indirect 적용여부: ${res.indirect_emissions_applicable} (rule=${res.indirect_emissions_rule})`);
  console.log(`  [앱] direct_see(자체)      = ${f(res.direct_see)}   | EU SE(direct,own)   = ${f(eu.se_direct_own)}`);
  console.log(`  [앱] own_indirect_see      = ${f(res.own_indirect_see)}   | EU SE(indirect,own) = ${f(eu.se_indirect_own)}`);
  console.log(`  [앱] precursor_see(d+i)    = ${f(res.precursor_see)}`);
  console.log(`  [앱] see_informational_tot = ${f(res.see_informational_total)}   | EU SEE(total)       = ${f(eu.see_total)}   ${Math.abs(res.see_informational_total-eu.see_total)<0.01?'✅ 일치':'❌ 불일치'}`);
  console.log(`  [앱] see_cbam_basis        = ${f(res.see_cbam_basis)}`);
  console.log(`  [규정] 인증서 direct-only  = ${f(correctCertBasis)}   | EU SEE(direct)      = ${f(eu.see_direct)}   ${Math.abs(correctCertBasis-eu.see_direct)<0.01?'✅':'❌'}`);
  const over = res.see_cbam_basis - correctCertBasis;
  console.log(`  → see_cbam_basis − 규정 direct-only 기준 = ${f(over)}  ${Math.abs(over)>0.01?`⚠️ 차이 ${(over/correctCertBasis*100).toFixed(1)}% (전구물질 indirect 포함 의심)`:'OK'}`);
  console.log('');
}
console.log('warnings(P1):', JSON.stringify(r.find(x=>x.process_id==='proc-p1').warnings));
console.log('warnings(P2):', JSON.stringify(r.find(x=>x.process_id==='proc-p2').warnings));
