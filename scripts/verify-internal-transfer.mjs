// 사내 이송(공정 간 전가) — 공식 예제를 정답지로 잠근다.
//
// 정답지: EU 공식 예제 「3 CBAM SEE V2.1_Example Steel 2 EAF alloys_final.xlsx」
//   입력  D_Processes  P1 DirEm 171,005.30885696854 · 전력 1,563,800 MWh × 0.833 · 총 생산 2,234,000 t · (c)1 → P2 1,227,000 t
//                      P2 DirEm 402,245.415 · 전력 324,660 MWh × 0.833 · 총 생산 1,133,000 t
//         E_PurchPrec  강괴 80,540 t (1.48 / 0.204) · FeNi 346,773.02393 t (3 / 2.49983) · FeCr 331,213 t (2.5 / 2.34989) · FeMn 60,595 t (1.3 / 1.90007)
//   결과  Summary_Products  조강 직접 1.0015 · 간접 1.3784 / 압연재 직접 1.4396 · 간접 1.7315
// 설계: docs/internal-precursor-design.md · 규정: Implementing Regulation (EU) 2025/2547 부속서 III
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const strip = (path, all = true) => readFileSync(path, 'utf8')
  .replace(all ? /^import .*;\r?\n/gm : /^import type .*;\r?\n/gm, '')
  .replace(/^export /gm, '');
const source = [
  strip('src/lib/source-stream-calculation.ts', false),
  readFileSync('src/lib/cn-master.generated.ts', 'utf8').replace(/^export /gm, ''),
  strip('src/lib/cbam-product-rules.ts'),
  strip('src/lib/reporting-scope.ts', false),
  strip('src/lib/allocation-rules.ts'),
  strip('src/lib/calculation-engine.ts'),
  'globalThis.engine = { calculateLocalResults, applyInternalTransfers };',
].join('\n');
const context = vm.createContext({});
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { calculateLocalResults } = context.engine;

const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} (기대 ${expected})`);
const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const period = { ...stamp, id: 'period_2025', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'OPEN' };
const steelProduct = (id, name, cn) => ({ ...stamp, id, name, cn_code: cn, hs_code: cn.slice(0, 4), hs_group: cn.slice(0, 2), product_type_enum: 'Iron or steel products', unit: 't', reporting_scope: 'CBAM_GOOD' });
const slab = steelProduct('product_slab', 'Alloy steel slabs V2A', '72189911');
const sheet = steelProduct('product_sheet', "Stainless sheets", '72191310');
const processOf = (id, name, product, output, market, internal, direct, mwh) => ({
  ...stamp, id, period_id: period.id, product_id: product.id, name, production_route: '',
  output_mass_t: output, market_output_mass_t: market, internal_consumption_mass_t: internal,
  direct_attributable_emissions_tco2e: direct, electricity_mwh: mwh, electricity_ef_tco2e_per_mwh: 0.833,
});
const p1 = processOf('process_eaf', 'EAF incl. continuous casting', slab, 2234000, 1007000, 1227000, 171005.30885696854, 1563800);
const p2 = processOf('process_rolling', 'Rolling mill and finishing', sheet, 1133000, 1133000, 0, 402245.41500000004, 324660);
const precursorOf = (id, name, cn, mass, direct, indirect) => ({
  ...stamp, id, period_id: period.id, process_id: p1.id, product_id: slab.id, name, precursor_cn_code: cn,
  aggregated_goods_category: '', production_route: '', supplier_country: 'Example', supplier_installation: '',
  data_mode: 'ACTUAL', verification_status: 'VERIFIED', default_value_year: '2026',
  purchased_mass_t: mass, consumed_mass_t: mass, consumed_for_non_cbam_mass_t: 0,
  direct_see_tco2e_per_t: direct, indirect_see_tco2e_per_t: indirect, source: 'official example', default_value_justification: '',
});
const precursors = [
  precursorOf('pp1', 'Carbon steel ingots', '72061000', 80540, 1.48, 0.2449 * 0.833),
  precursorOf('pp2', 'FeNi (28% Ni)', '72026000', 346773.02393, 3, 3.001 * 0.833),
  precursorOf('pp3', 'FeCr (52% Cr)', '72024110', 331213, 2.5, 2.821 * 0.833),
  precursorOf('pp4', 'FeMn (31% Mn)', '72021120', 60595, 1.3, 2.281 * 0.833),
];
const base = { processes: [p1, p2], precursors, products: [slab, sheet], periods: [period] };
const transfer = { id: 'transfer_1', period_id: period.id, source_process_id: p1.id, target_process_id: p2.id, mass_t: 1227000 };
const pick = (results, processId) => results.find((result) => result.process_id === processId);

// ── 이송이 없으면 종전과 같다: 하류 공정은 상류를 모른다 ──────────────────
const without = calculateLocalResults(base);
near(pick(without, p1.id).see_direct_incl_precursor, 1.0015, 0.00005, '조강 직접 (이송 없음)');
near(pick(without, p2.id).see_direct_incl_precursor, 402245.415 / 1133000, 1e-9, '압연재 직접 (이송 없음 — 자체 몫뿐)');
assert.equal(pick(without, p2.id).internal_precursor_direct_see, undefined);
assert.deepEqual(
  JSON.parse(JSON.stringify(calculateLocalResults({ ...base, internalTransfers: [] }))),
  JSON.parse(JSON.stringify(without)),
  '이송이 비어 있으면 결과가 한 글자도 달라지면 안 된다'
);

// ── 정답지: 공식 예제의 Summary_Products ─────────────────────────────────
const chained = calculateLocalResults({ ...base, internalTransfers: [transfer] });
const crude = pick(chained, p1.id);
const rolled = pick(chained, p2.id);
near(crude.see_direct_incl_precursor, 1.0015, 0.00005, '조강 직접');
near(crude.see_indirect_incl_precursor, 1.3784, 0.00005, '조강 간접');
near(rolled.see_direct_incl_precursor, 1.4396, 0.00005, '압연재 직접');
near(rolled.see_indirect_incl_precursor, 1.7315, 0.00005, '압연재 간접');
// 철강은 간접이 인증서 기준에서 빠진다 — 사내 전가분도 같은 규칙.
near(rolled.see_cbam_basis, rolled.see_direct_incl_precursor, 1e-12, '압연재 기준 SEE = 직접(자체 + 사내)');
near(rolled.see_informational_total, rolled.see_direct_incl_precursor + rolled.see_indirect_incl_precursor, 1e-9, '압연재 검토용 총 SEE');
// 구매 전구물질 몫과 섞지 않는다.
assert.equal(rolled.precursor_direct_see, 0, '사내 전가분이 구매 전구물질 칸에 들어가면 EU 문서에서 두 번 계산된다');
near(rolled.internal_precursor_direct_see, 1227000 * crude.see_direct_incl_precursor / 1133000, 1e-9, '사내 전구물질 직접 몫');
assert.equal(rolled.internal_precursor_inputs.length, 1);
assert.equal(rolled.internal_precursor_inputs[0].source_process_name, p1.name);
near(rolled.internal_precursor_inputs[0].mass_t, 1227000, 1e-9, '받은 양');
// 보내는 공정은 바뀌지 않는다 — 분모는 총 생산량 그대로.
near(crude.see_direct_incl_precursor, pick(without, p1.id).see_direct_incl_precursor, 1e-12, '보내는 공정의 SEE는 이송과 무관');

// ── 세 단계 사슬: 하류의 하류는 「최종」 SEE를 받는다 ─────────────────────
const tube = steelProduct('product_tube', 'Tubes', '73041100');
const p3 = processOf('process_tube', 'Tube mill', tube, 500000, 500000, 0, 0, 0);
const threeStage = calculateLocalResults({
  ...base, processes: [p3, p2, p1], products: [slab, sheet, tube],   // 순서를 뒤집어 넣어도 상류부터 계산해야 한다
  internalTransfers: [{ id: 't2', period_id: period.id, source_process_id: p2.id, target_process_id: p3.id, mass_t: 550000 }, transfer],
});
near(pick(threeStage, p3.id).see_direct_incl_precursor, 550000 * rolled.see_direct_incl_precursor / 500000, 1e-9, '3단계 제품은 2단계의 최종 SEE(사내 전가 포함)를 받는다');

// ── 순환은 전가하지 않고 차단 수준으로 알린다 ─────────────────────────────
const cyclic = calculateLocalResults({ ...base, internalTransfers: [transfer, { id: 'back', period_id: period.id, source_process_id: p2.id, target_process_id: p1.id, mass_t: 10 }] });
assert.ok(pick(cyclic, p2.id).warnings.some((message) => message.startsWith('차단:') && message.includes('순환')), '순환 이송을 알리지 않는다');
near(pick(cyclic, p2.id).see_direct_incl_precursor, 402245.415 / 1133000, 1e-9, '순환이면 전가하지 않는다(값을 지어내지 않는다)');

// ── 다제품 공정이 보내는데 라인을 지정하지 않으면 어느 SEE인지 모른다 ─────
const lineA = { ...stamp, id: 'line_a', process_id: p1.id, product_id: slab.id, name: 'A', output_mass_t: 1234000, allocation_basis: 'MASS', manual_allocation_percent: 0, note: '' };
const lineB = { ...lineA, id: 'line_b', name: 'B', output_mass_t: 1000000 };
const twoLines = calculateLocalResults({ ...base, productOutputLines: [lineA, lineB], internalTransfers: [transfer] });
assert.ok(pick(twoLines, p2.id).warnings.some((message) => message.startsWith('차단:') && message.includes('라인')), '보내는 라인이 모호한데 알리지 않는다');
const twoLinesNamed = calculateLocalResults({ ...base, productOutputLines: [lineA, lineB], internalTransfers: [{ ...transfer, source_output_line_id: lineA.id }] });
near(pick(twoLinesNamed, p2.id).see_direct_incl_precursor, 1.4396, 0.00005, '질량 배분이면 두 라인의 SEE가 같으므로 정답지와 같아야 한다');

// ── 기간이 다른 공정끼리는 이송할 수 없다 ────────────────────────────────
const otherPeriod = { ...period, id: 'period_2026', name: '2026' };
const crossPeriod = calculateLocalResults({ ...base, periods: [period, otherPeriod], processes: [p1, { ...p2, period_id: otherPeriod.id }], internalTransfers: [transfer] });
assert.ok(pick(crossPeriod, p2.id).warnings.some((message) => message.startsWith('차단:') && message.includes('보고기간')), '다른 기간 공정 간 이송을 알리지 않는다');

// ── 화면 연결: 엔진·준비도·EU 사본을 부르는 모든 곳이 이송을 함께 넘긴다 ─────
// 한 곳이라도 빠지면 그 화면만 받는 제품의 SEE가 낮게 나온다(화면마다 다른 숫자).
import { readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
});
const CALLS = ['calculateLocalResults(', 'evaluateEuExportReadiness(', 'createEuTemplateExportCellWrites(', 'createEuTemplateExportCopyResult('];
// 산정보고서의 내부 재계산(기본값 대입 비교)은 4단계에서 연결한다.
const EXEMPT = new Set(['calculation-engine.ts', 'eu-template-export.ts', 'calculation-report.ts']);
const missing = [];
for (const file of walk('src')) {
  if (EXEMPT.has(basename(file))) continue;
  const text = readFileSync(file, 'utf8');
  for (const call of CALLS) {
    let from = 0;
    while ((from = text.indexOf(call, from)) >= 0) {
      const lineStart = text.lastIndexOf('\n', from) + 1;
      const isImport = /^\s*(import|\/\/|\*)/.test(text.slice(lineStart, from)) || text.slice(lineStart, from).trim() === '';
      const argument = text.slice(from, from + 700);
      const end = argument.indexOf('});') >= 0 ? argument.indexOf('});') : argument.indexOf('})');
      if (!isImport && !argument.slice(0, end >= 0 ? end : 700).includes('internalTransfers')) {
        missing.push(`${file}:${text.slice(0, from).split('\n').length} ${call}`);
      }
      from += call.length;
    }
  }
}
assert.deepEqual(missing, [], `이송을 넘기지 않는 호출부가 있다:\n${missing.join('\n')}`);

// ── 4단계: 산정보고서 자가검사는 사내 전가분을 소계의 구성 항목으로 센다 ─────
// 빼먹으면 「원천값 불일치」로 발행이 막힌다(직접 소계 ≠ 자체 + 구매 전구물질).
const reportSource = readFileSync('src/lib/calculation-report.ts', 'utf8');
assert.match(reportSource, /parts: \[result\.direct_see, result\.precursor_direct_see, result\.internal_precursor_direct_see \?\? 0\]/, '보고서 직접 소계 검산에 사내 전가분이 없다');
assert.match(reportSource, /parts: \[result\.own_indirect_see, result\.precursor_indirect_see, result\.internal_precursor_indirect_see \?\? 0\]/, '보고서 간접 소계 검산에 사내 전가분이 없다');
assert.match(reportSource, /internalTransfers\?: InternalTransferInput\[\]/, '보고서 안의 재계산이 이송을 받지 못한다');
assert.equal((readFileSync('src/app/export/page.tsx', 'utf8').match(/results: docScope\.results,\n\s+internalTransfers,/g) ?? []).length, 2, '/export가 산정보고서에 이송을 넘기지 않는다');
// 엔진 결과에서 직접 검산: 소계 = 자체 + 구매 + 사내
near(rolled.see_direct_incl_precursor, rolled.direct_see + rolled.precursor_direct_see + rolled.internal_precursor_direct_see, 1e-12, '직접 소계의 세 구성 항목');
near(rolled.see_indirect_incl_precursor, rolled.own_indirect_see + rolled.precursor_indirect_see + rolled.internal_precursor_indirect_see, 1e-12, '간접 소계의 세 구성 항목');

console.log('Internal transfer verification passed (공식 EAF 예제 정답지 1.0015/1.3784 → 1.4396/1.7315 · 3단계 사슬 · 순환·라인 모호·기간 불일치 차단).');

// ── /processes 상세 화면도 받는 공정별로 받는다 ──────────────────────────
// 종전에는 합계 한 칸(읽기 전용)이라, 지도를 쓰지 않는 사용자는 이송을 만들 수 없었다.
const processesPage = readFileSync('src/app/processes/page.tsx', 'utf8');
assert.match(processesPage, /const transferReceivers = processes\.filter\(/, '/processes가 받는 공정별 입력을 만들지 않는다');
assert.match(processesPage, /\(process\.period_id \?\? ''\) === \(newItem\.period_id/, '/processes가 다른 보고기간의 공정까지 이송 상대로 제시한다');
assert.match(processesPage, /internal_consumption_mass_t: internalTransferTotal/, '/processes의 내부 소비량이 받는 공정별 합계가 아니다');
assert.equal((processesPage.match(/await syncTransfers\(/g) ?? []).length, 2, '신규·수정 저장이 모두 이송을 저장해야 한다');
assert.match(processesPage, /넘기는 것이 어느 라인의 산출물인지 고르세요/, '다제품 공정에서 보내는 라인을 묻지 않는다');
console.log('processes transfer input gate passed.');
assert.match(processesPage, /const marketOutputIsDerived = transferReceivers\.length > 0;/, '/processes에서 이송을 넣어도 시장 출하량이 줄지 않는다 — EU 문서 검산이 깨진다');
assert.equal((processesPage.match(/market_output_mass_t: effectiveMarketOutput/g) ?? []).length, 2, '신규·수정 저장이 모두 파생된 시장 출하량을 써야 한다');
assert.match(readFileSync('src/lib/eu-template-export.ts', 'utf8'), /\(e\) Control\)이 0이 아닌 채로 나갑니다/, '시장+내부≠총량이 경고에 머문다 — 자기모순인 문서가 제출된다');
