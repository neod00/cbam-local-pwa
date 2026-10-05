// 에너지 나누기 통합(현황·길 안내)과 「열 사용량을 모르겠어요」 임시 채우기를 잠근다 (2026-10-05).
//
// 전력 나누기 · 연료 나누기 · 열 공급원은 같은 일(한 고지서를 여러 공정이 나눠 쓴다)인데 규정이 달라 화면이 셋이다.
// 담당자는 어느 것을 눌러야 하는지부터 헤맨다 → 4·5단계 맨 위에 현황과 안내를 모은다. 이 패널은 계산하거나 저장하지 않는다.
// 열은 공정별 사용량을 모르는 사업장이 많다 → 연료 투입 에너지 × 기준효율 70%(부속서 II C.1.2.3)를 생산량 비율로 임시로 채우되,
// 규정이 정한 귀속이 아니므로 [임시] 표시를 남기고 엔진·EU 문서 준비도가 계속 확인을 요구한다.
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
  strip('src/lib/measurable-heat.ts'),
  strip('src/lib/energy-split-summary.ts'),
  strip('src/lib/precursor-verification.ts'),
  strip('src/lib/calculation-engine.ts'),
  'globalThis.app = { calculateLocalResults, calculateSourceStreamEmissions, calculateSourceStreamEnergyBreakdown, buildProvisionalHeatQuantities, isProvisionalHeatNote, summarizeEnergySplits, HEAT_REFERENCE_EFFICIENCY, PROVISIONAL_HEAT_NOTE_PREFIX };',
].join('\n');
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { calculateLocalResults, calculateSourceStreamEmissions, calculateSourceStreamEnergyBreakdown, buildProvisionalHeatQuantities, isProvisionalHeatNote, summarizeEnergySplits, HEAT_REFERENCE_EFFICIENCY, PROVISIONAL_HEAT_NOTE_PREFIX } = context.app;

const near = (actual, expected, label, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} (기대 ${expected})`);
const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const period = { id: 'period', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT', ...stamp };
const sts = { id: 'sts', name: 'STS 나사', cn_code: '73181552', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'CBAM_GOOD', ...stamp };
const carbon = { id: 'carbon', name: '탄소강 나사', cn_code: '73181558', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'NON_CBAM_COPRODUCT', ...stamp };
const makeProcess = (overrides) => ({
  period_id: period.id, production_route: '가공', market_output_mass_t: 0, internal_consumption_mass_t: 0,
  direct_attributable_emissions_tco2e: 50, direct_emissions_input_mode: 'MANUAL_TOTAL', electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0, ...stamp, ...overrides,
});
const processA = makeProcess({ id: 'A', product_id: sts.id, name: 'STS 나사 공정', output_mass_t: 3240 });
const processB = makeProcess({ id: 'B', product_id: carbon.id, name: '탄소강 나사 공정', output_mass_t: 1860 });
const fuel = (overrides = {}) => ({
  id: 'boiler', period_id: period.id, name: '도시가스 — 온수 보일러', stream_type: 'FUEL', method: 'Combustion',
  activity_data: 38500, activity_unit: 'Nm3', ncv_gj_per_unit: 0.037, emission_factor_tco2e_per_unit: 56.1, emission_factor_basis: 'PER_TJ',
  oxidation_factor: 1, conversion_factor: 1, fossil_fraction: 1, biomass_fraction: 0, factor_source_type: 'NATIONAL_INVENTORY', source: '삼천리 고지서', ...stamp, ...overrides,
});
const E = calculateSourceStreamEmissions(fuel());
const energyTj = calculateSourceStreamEnergyBreakdown(fuel()).total;
near(energyTj, 1.4245, '보일러 연료 투입 에너지 = 38,500 Nm³ × 0.037 GJ ÷ 1,000 (TJ)');

// ── 1) 임시 채우기 — 연료 투입 에너지 × 70%를 생산량 비율로 ───────────────
assert.equal(HEAT_REFERENCE_EFFICIENCY, 0.7, '부속서 II C.1.2.3 방법 3의 기준효율');
const filled = buildProvisionalHeatQuantities({ fuelEnergyTj: energyTj, rows: [{ processId: 'A', weight: 3240 }, { processId: 'B', weight: 1860 }] });
assert.equal(filled.length, 2);
near(filled[0].quantityTj + filled[1].quantityTj, energyTj * 0.7, '합계 = 연료 투입 에너지 × 70%', 2e-6);
near(filled[0].quantityTj / (filled[0].quantityTj + filled[1].quantityTj), 3240 / 5100, '생산량 비율', 1e-6);
assert.ok(filled.every((item) => item.note.startsWith(PROVISIONAL_HEAT_NOTE_PREFIX)), '모든 행에 [임시] 표시');
assert.match(filled[0].note, /부속서 II C\.1\.2\.3/);
assert.equal(PROVISIONAL_HEAT_NOTE_PREFIX, '[임시]');
assert.equal(isProvisionalHeatNote('[임시] 자료 없음'), true);
assert.equal(isProvisionalHeatNote('  [임시] 앞공백도 같다'), true);
assert.equal(isProvisionalHeatNote('열량계 HM-01'), false);
assert.equal(isProvisionalHeatNote(undefined), false);
assert.equal(buildProvisionalHeatQuantities({ fuelEnergyTj: 0, rows: [{ processId: 'A', weight: 1 }] }).length, 0, '연료가 0이면 채우지 않는다');
assert.equal(buildProvisionalHeatQuantities({ fuelEnergyTj: 1, rows: [{ processId: 'A', weight: 0 }, { processId: 'B', weight: 0 }] }).length, 0, '생산량이 없으면 채우지 않는다');
assert.equal(buildProvisionalHeatQuantities({ fuelEnergyTj: 1, rows: [] }).length, 0);

// 엔진: 임시 값으로 계산하면 종전(생산량 비율) 숫자와 같고, 규정 기준 귀속이 아니라는 알림이 남는다.
const consumption = (item) => [{ system: '온수 보일러', quantity: item.quantityTj, unit: 'TJ', basis: 'EFFICIENCY_PROXY', note: item.note }];
const heatFuel = fuel({ heat_system: { name: '온수 보일러' } });
const run = (processes) => calculateLocalResults({ products: [sts, carbon], periods: [period], processes, precursors: [], sourceStreams: [heatFuel] });
const provisional = run([{ ...processA, heat_consumption: consumption(filled[0]) }, { ...processB, heat_consumption: consumption(filled[1]) }]);
near(provisional[0].shared_heat_emissions_tco2e, E * 3240 / 5100, '임시 값 = 생산량 비율 귀속(종전과 같은 숫자)', 1e-4);
near(provisional[0].shared_heat_emissions_tco2e + provisional[1].shared_heat_emissions_tco2e, E, '합계 = 연료 배출 전체', 1e-4);
assert.match(provisional[0].warnings.join('\n'), /확인 필요\(규정\): STS 나사 공정: 「온수 보일러」 열 사용량이 임시 값입니다/);
assert.match(provisional[0].warnings.join('\n'), /규정이 정한 열량 기준 귀속이 아닙니다/);
const measured = run([{ ...processA, heat_consumption: [{ system: '온수 보일러', quantity: 4, unit: 'TJ', basis: 'METERED', note: '열량계 HM-01' }] }, { ...processB, heat_consumption: [{ system: '온수 보일러', quantity: 1, unit: 'TJ', basis: 'METERED' }] }]);
assert.doesNotMatch(measured[0].warnings.join('\n'), /임시 값/, '계측값은 조용하다');

// ── 2) 현황 — 무엇이 있고, 무엇이 어긋났고, 어디가 안 나눈 듯한가 ──────────────
const elec = (id, mwh, group) => makeProcess({ id, name: `공정 ${id}`, output_mass_t: 100, electricity_mwh: mwh, electricity_shared_meter: group ? { group, installation_total_mwh: 300, basis: 'OUTPUT_MASS', basis_value: 100 } : undefined });
const empty = summarizeEnergySplits({ processes: [processA, processB], sourceStreams: [] });
assert.equal(empty.items.length, 0);
assert.equal(empty.hints.length, 0);
assert.equal(empty.attentionCount, 0);

const healthy = summarizeEnergySplits({ processes: [elec('A', 150, '한전'), elec('B', 150, '한전')], sourceStreams: [] });
assert.equal(healthy.items.length, 1);
assert.equal(healthy.items[0].kind, 'ELECTRICITY');
assert.equal(healthy.items[0].title, '전력 「한전」');
assert.equal(healthy.items[0].problem, undefined, '합계가 고지서와 같으면 문제가 없다');
assert.equal(healthy.attentionCount, 0);
assert.equal(healthy.hints.length, 0, '이미 나눴으면 안내하지 않는다');

const broken = summarizeEnergySplits({ processes: [elec('A', 100, '한전'), elec('B', 150, '한전')], sourceStreams: [] });
assert.match(broken.items[0].problem, /합계 250 MWh가 사업장 계량값 300 MWh와 다릅니다/);
assert.equal(broken.attentionCount, 1);

const fuelRow = (id, processId, amount, group) => ({ ...fuel({ id, activity_data: amount, name: '경유 지게차', heat_system: undefined }), process_id: processId, shared_meter: { group, installation_total_activity_data: 10, basis: 'OUTPUT_MASS' } });
const fuelOk = summarizeEnergySplits({ processes: [processA, processB], sourceStreams: [fuelRow('f1', 'A', 6, '공용 경유'), fuelRow('f2', 'B', 4, '공용 경유')] });
assert.equal(fuelOk.items.length, 1);
assert.equal(fuelOk.items[0].kind, 'FUEL');
assert.equal(fuelOk.items[0].problem, undefined);
const fuelBad = summarizeEnergySplits({ processes: [processA, processB], sourceStreams: [fuelRow('f1', 'A', 6, '공용 경유'), fuelRow('f2', 'B', 3, '공용 경유')] });
assert.match(fuelBad.items[0].problem, /합계/);

const heatItems = summarizeEnergySplits({
  processes: [{ ...processA, heat_consumption: consumption(filled[0]) }, { ...processB, heat_consumption: consumption(filled[1]) }],
  sourceStreams: [heatFuel],
});
const heat = heatItems.items.find((item) => item.kind === 'HEAT');
assert.equal(heat.title, '열 「온수 보일러」');
assert.equal(heat.provisional, true, '임시 값이면 표시한다');
assert.equal(heat.problem, undefined);
assert.equal(heatItems.attentionCount, 1, '임시도 확인 항목으로 센다');
const heatMeasured = summarizeEnergySplits({ processes: [{ ...processA, heat_consumption: [{ system: '온수 보일러', quantity: 4, unit: 'TJ', basis: 'METERED' }] }, { ...processB, heat_consumption: [{ system: '온수 보일러', quantity: 1, unit: 'TJ', basis: 'METERED' }] }], sourceStreams: [heatFuel] });
assert.equal(heatMeasured.items[0].provisional, false);
assert.equal(heatMeasured.attentionCount, 0);
const heatNoConsumer = summarizeEnergySplits({ processes: [processA, processB], sourceStreams: [heatFuel] });
assert.match(heatNoConsumer.items[0].problem, /열을 받는 공정이 없습니다/, '귀속하지 못하면 문제로 보인다');

// ── 3) 안 나눈 듯한 곳 — 추측이므로 알림일 뿐 ───────────────────────────
const manualElec = summarizeEnergySplits({ processes: [elec('A', 150), elec('B', 150)], sourceStreams: [] });
assert.equal(manualElec.hints.length, 1);
assert.equal(manualElec.hints[0].kind, 'ELECTRICITY');
assert.match(manualElec.hints[0].text, /5단계의 「전력 나누기」/);
assert.equal(summarizeEnergySplits({ processes: [elec('A', 150)], sourceStreams: [] }).hints.length, 0, '공정이 하나면 나눌 일이 없다');
assert.equal(summarizeEnergySplits({ processes: [elec('A', 150), elec('B', 0)], sourceStreams: [] }).hints.length, 0, '전기를 쓰는 공정이 하나면 안내하지 않는다');

const boilerOnProcess = { ...fuel({ heat_system: undefined }), process_id: 'A' };
const heatHint = summarizeEnergySplits({ processes: [processA, processB], sourceStreams: [boilerOnProcess] });
assert.equal(heatHint.hints.length, 1);
assert.equal(heatHint.hints[0].kind, 'HEAT');
assert.match(heatHint.hints[0].text, /도시가스 — 온수 보일러.*쓴 열량 비율/);
assert.equal(summarizeEnergySplits({ processes: [processA, processB], sourceStreams: [heatFuel] }).hints.filter((hint) => hint.kind === 'HEAT').length, 0, '열 공급원이 이미 있으면 안내하지 않는다');
assert.equal(summarizeEnergySplits({ processes: [processA, processB], sourceStreams: [{ ...fuel({ name: '경유 지게차', heat_system: undefined }), process_id: 'A' }] }).hints.length, 0, '이름에 열 표시가 없는 연료는 추측하지 않는다');
assert.equal(summarizeEnergySplits({ processes: [processA], sourceStreams: [boilerOnProcess] }).hints.length, 0, '공정이 하나면 안내하지 않는다');

// ── 4) 배선 — 패널은 계산·저장을 하지 않고, 임시 채우기는 한 함수를 거친다 ──
const hub = readFileSync('src/components/guided/EnergySplitHub.tsx', 'utf8');
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
const sharedHeat = readFileSync('src/components/guided/SharedHeat.tsx', 'utf8');
assert.match(panels, /<EnergySplitHub step="fuel" processes=\{data\.processes\} sourceStreams=\{data\.sourceStreams\} onSelectStep=\{onSelectStep\} \/>/, '4단계에 현황 패널이 없다');
assert.match(panels, /<EnergySplitHub step="electricity" processes=\{data\.processes\} sourceStreams=\{data\.sourceStreams\} onSelectStep=\{onSelectStep\} \/>/, '5단계에 현황 패널이 없다');
assert.ok(!/updateLocalItem|createLocalItem|deleteLocalItem/.test(hub), '현황 패널이 저장한다 — 안내만 해야 한다');
assert.match(hub, /summarizeEnergySplits\(\{ processes, sourceStreams \}\)/, '현황을 공유 함수로 계산하지 않는다');
assert.match(sharedHeat, /buildProvisionalHeatQuantities\(\{ fuelEnergyTj, rows \}\)/, '임시 채우기가 공유 함수를 거치지 않는다');
assert.match(sharedHeat, /basis: 'EFFICIENCY_PROXY' as const, note: item\.note/, '임시 값은 기준효율 방식과 [임시] 근거로 저장된다');
assert.match(sharedHeat, /열 사용량을 모르겠어요 — 임시로 채우기/);
const exportSource = readFileSync('src/lib/eu-template-export.ts', 'utf8');
assert.match(exportSource, /isProvisionalHeatNote\(consumer\.note\)/, 'EU 문서 준비도가 임시 값을 알리지 않는다');

console.log('Energy split hub verification passed (임시 채우기 = 70% × 생산량 비율 · [임시] 확인 요구 · 현황·안내 · 패널은 저장하지 않음).');
