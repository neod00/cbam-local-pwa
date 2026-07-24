// 길잡이 지도 패널의 수정·삭제 로직 검증.
//
// 왜 이 파일이 있는가: 지도 패널의 저장 로직은 .tsx 안에 있어 어떤 검사도 닿지 않았다.
// 신규 경로만 있을 때는 그럭저럭 버텼지만, **수정 경로는 같은 필드를 두 번째로 적는 자리**라
// 한쪽만 고쳐지면 조용히 어긋난다. 이번 저장소에서 반복해 난 결함이 정확히 그 모양이었다.
//
// 그래서 여기서 강제하는 것은 셋이다:
//   1) 신규와 수정이 **같은 값**을 쓴다(payload 빌더 공유).
//   2) 수정이 패널에 칸이 없는 필드를 **지우지 않는다**(펼치기 보존).
//   3) 삭제가 **참조를 남기지 않는다**(차단 규칙).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadGuidedEditModule() {
  const source = readFileSync('src/lib/guided-edit.ts', 'utf8')
    .replace(/^import type [\s\S]*?from '.*';$/gm, '')
    .replace(/^export /gm, '');
  const exported = [
    'getProductDeleteBlockers', 'validateProductDraft', 'buildProductPayload', 'buildProductUpdate',
    'validateInstallationDraft', 'buildInstallationPayload', 'buildInstallationUpdate',
    'validatePeriodDraft', 'buildPeriodPayload', 'buildPeriodUpdate', 'getPeriodDeleteBlockers',
    'validateSourceStreamDraft', 'buildSourceStreamUpdate',
    'validateElectricityDraft', 'buildElectricityUpdate',
    'validatePrecursorDraft', 'validatePrecursorAllocation',
    'buildPrecursorPayload', 'buildPrecursorCreate', 'buildPrecursorUpdate',
  ];
  const compiled = ts.transpileModule(
    `${source}\nglobalThis.guidedEdit = { ${exported.join(', ')} };`,
    { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const context = vm.createContext({ Intl, Math, Number });
  vm.runInContext(compiled, context);
  return context.guidedEdit;
}

const G = loadGuidedEditModule();

/** LocalEntity 3필드 — 어떤 수정도 이걸 바꾸면 안 된다. */
const entity = (id) => ({ id, created_at: '2026-01-02T03:04:05.000Z', updated_at: '2026-01-02T03:04:05.000Z' });

// vm 안에서 만든 배열은 프로토타입이 다른 realm의 것이라 deepEqual이 거부한다. 호스트 배열로 옮겨 비교한다.
const hostArray = (value) => [...value];

// ══ 제품 ══════════════════════════════════════════════════════════════

const product = {
  ...entity('product_1'),
  installation_id: 'installation_1',
  name: '아연도금 강선',
  hs_code: '7217',
  cn_code: '72172010',
  hs_group: '72',
  // 백스테이지에서 제품군 템플릿을 골라 정교하게 맞춰둔 값. 이름만 고칠 때 되돌아가면 안 된다.
  product_type_enum: 'HS72_WIRE_GALVANISED',
  unit: 'tonne',
  reporting_scope: 'CBAM_GOOD',
};

// [핵심] 이름만 고치면 CN 파생 필드를 건드리지 않는다.
const renamed = G.buildProductUpdate(product, { name: '  아연도금 강선 2종  ', cnDigits: '72172010' });
assert.equal(renamed.name, '아연도금 강선 2종', '이름은 trim해 저장한다');
assert.equal(renamed.product_type_enum, 'HS72_WIRE_GALVANISED', 'CN이 그대로면 제품군을 되돌리면 안 된다');
assert.equal(renamed.hs_code, '7217');
assert.equal(renamed.hs_group, '72');

// CN을 실제로 바꾸면 파생 필드가 전부 따라간다 — 하나만 따라가면 hs_group과 cn이 어긋난다.
const recoded = G.buildProductUpdate(product, { name: '열연강판', cnDigits: '73063077' });
assert.equal(recoded.cn_code, '73063077');
assert.equal(recoded.hs_code, '7306', 'CN이 바뀌면 hs_code도 바뀐다');
assert.equal(recoded.hs_group, '73', 'CN이 바뀌면 hs_group도 바뀐다');
assert.equal(recoded.product_type_enum, 'HS73_OTHER', 'CN이 바뀌면 제품군도 다시 파생한다');

// 펼치기 보존 — 패널에 칸이 없는 필드가 살아남는다.
for (const field of ['id', 'created_at', 'installation_id', 'unit', 'reporting_scope']) {
  assert.equal(renamed[field], product[field], `제품 수정이 ${field}를 지우면 안 된다`);
  assert.equal(recoded[field], product[field], `CN 변경도 ${field}를 지우면 안 된다`);
}

// 신규와 수정이 같은 파생 규칙을 쓴다 — 두 곳에 두면 한쪽만 고쳐진다.
const createdProduct = G.buildProductPayload({ name: '열연강판', cnDigits: '73063077' }, 'installation_1');
for (const field of ['cn_code', 'hs_code', 'hs_group', 'product_type_enum']) {
  assert.equal(createdProduct[field], recoded[field], `신규와 수정의 ${field} 파생이 달라지면 안 된다`);
}

// ── 제품 삭제 차단 ──
// [핵심] 공정의 product_id는 **대표 제품 하나**만 가리킨다. 다제품 공정의 두 번째 제품은
// 공정 참조에 안 걸리므로, 생산라인을 보지 않으면 참조가 남은 채 지워진다.
const secondaryOnly = G.getProductDeleteBlockers('product_2', {
  processes: [{ product_id: 'product_1' }],
  precursors: [],
  productOutputLines: [{ product_id: 'product_1' }, { product_id: 'product_2' }],
});
assert.equal(secondaryOnly.total, 1, '생산라인만 가리키는 제품도 삭제를 막아야 한다');
assert.deepEqual(hostArray(secondaryOnly.reasons), ['생산라인 1건']);

const noRef = G.getProductDeleteBlockers('product_9', { processes: [], precursors: [], productOutputLines: [] });
assert.equal(noRef.total, 0, '참조가 없으면 삭제할 수 있다');
assert.deepEqual(hostArray(noRef.reasons), [], '0건짜리 항목을 문구에 넣으면 안 된다');

const everyRef = G.getProductDeleteBlockers('product_1', {
  processes: [{ product_id: 'product_1' }],
  precursors: [{ product_id: 'product_1' }, { product_id: 'product_1' }],
  productOutputLines: [{ product_id: 'product_1' }],
});
assert.equal(everyRef.total, 4);
assert.deepEqual(hostArray(everyRef.reasons), ['생산공정 1건', '생산라인 1건', '전구물질 2건']);

// ── 제품 검증 ──
assert.match(G.validateProductDraft({ name: '  ', cnDigits: '72172010' }), /제품 이름/);
assert.match(G.validateProductDraft({ name: '강선', cnDigits: '7217' }), /8자리/, 'CN 8자리 미만은 막는다');
assert.match(G.validateProductDraft({ name: '강선', cnDigits: '721720101' }), /8자리/, 'CN 9자리도 막는다');
assert.equal(G.validateProductDraft({ name: '강선', cnDigits: '72172010' }), null);

// ══ 사업장 ════════════════════════════════════════════════════════════

// 이 패널에는 주소·좌표·담당자 칸이 없다. 백스테이지에서 넣은 값이 패널 저장 한 번에
// 사라지면, 사용자는 EU Export 단계에서야 주소가 빈 걸 발견한다.
const installation = {
  ...entity('installation_1'),
  name: 'Husteel Dangjin',
  local_name: '휴스틸 당진공장',
  country: 'KR',
  street: 'Bugok-ro',
  city: 'Dangjin',
  postcode: '31700',
  unlocode: 'KRDJN',
  latitude: '36.9',
  longitude: '126.6',
  email: 'esg@example.com',
  boundary_json: { note: '공정 경계 메모' },
};

const updatedInstallation = G.buildInstallationUpdate(installation, { name: '  Husteel Dangjin ERW  ', country: 'kr' });
assert.equal(updatedInstallation.name, 'Husteel Dangjin ERW');
assert.equal(updatedInstallation.country, 'KR', '국가 코드는 대문자로 정규화한다');
for (const field of ['id', 'created_at', 'local_name', 'street', 'city', 'postcode', 'unlocode', 'latitude', 'longitude', 'email']) {
  assert.equal(updatedInstallation[field], installation[field], `사업장 수정이 ${field}를 지우면 안 된다`);
}
assert.deepEqual(updatedInstallation.boundary_json, installation.boundary_json, '공정 경계 메모가 사라지면 안 된다');

assert.match(G.validateInstallationDraft({ name: '', country: 'KR' }), /이름/);
assert.match(G.validateInstallationDraft({ name: '공장', country: 'KOR' }), /2자리/);
assert.match(G.validateInstallationDraft({ name: '공장', country: '82' }), /2자리/, '숫자 국가코드는 막는다');
assert.equal(G.validateInstallationDraft({ name: '공장', country: 'kr' }), null, '소문자 입력은 허용하고 정규화한다');

// ══ 보고기간 ══════════════════════════════════════════════════════════

const period = {
  ...entity('period_1'),
  installation_id: 'installation_1',
  name: '2026 Annual',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  // 이 패널에는 상태 칸이 없다. 산정 완료로 올려둔 기간이 저장 한 번에 DRAFT로 떨어지면 안 된다.
  status: 'CALCULATED',
};

const updatedPeriod = G.buildPeriodUpdate(period, { name: '2026 연간', startDate: '2026-01-01', endDate: '2026-06-30' });
assert.equal(updatedPeriod.name, '2026 연간');
assert.equal(updatedPeriod.end_date, '2026-06-30');
assert.equal(updatedPeriod.status, 'CALCULATED', '기간 수정이 상태를 되돌리면 안 된다');
assert.equal(updatedPeriod.installation_id, 'installation_1');
assert.equal(updatedPeriod.id, period.id);
assert.equal(updatedPeriod.created_at, period.created_at);

assert.match(G.validatePeriodDraft({ name: '', startDate: '2026-01-01', endDate: '2026-12-31' }), /이름/);
assert.match(G.validatePeriodDraft({ name: '연간', startDate: '', endDate: '2026-12-31' }), /시작·종료일/);
assert.match(G.validatePeriodDraft({ name: '연간', startDate: '2026-12-31', endDate: '2026-01-01' }), /빠릅니다/);
assert.equal(G.validatePeriodDraft({ name: '하루', startDate: '2026-01-01', endDate: '2026-01-01' }), null, '같은 날은 허용');

// ── 보고기간 삭제 차단 ──
// 기간은 셋이 가리킨다. 하나라도 빠뜨리면 그 참조가 dangling id가 되는데, 엔진의 기간 누락
// 경고는 period_id가 **비었을 때만** 울리므로 조용히 사라진다.
const periodRefs = G.getPeriodDeleteBlockers('period_1', {
  processes: [{ period_id: 'period_1' }],
  sourceStreams: [{ period_id: 'period_1' }, { period_id: 'period_2' }],
  precursors: [{ period_id: 'period_1' }],
});
assert.equal(periodRefs.total, 3);
assert.deepEqual(hostArray(periodRefs.reasons), ['생산공정 1건', '배출원 자료 1건', '전구물질 1건']);
assert.equal(
  G.getPeriodDeleteBlockers('period_9', { processes: [], sourceStreams: [], precursors: [] }).total,
  0
);
// 배출원만 가리켜도 막아야 한다 — 공정만 보면 배출원이 고아가 된다.
assert.equal(
  G.getPeriodDeleteBlockers('period_3', {
    processes: [], sourceStreams: [{ period_id: 'period_3' }], precursors: [],
  }).total,
  1,
  '배출원만 참조해도 기간 삭제를 막아야 한다'
);

// ══ 배출원(연료) ══════════════════════════════════════════════════════

// 이 패널은 프리셋으로만 만들지만, 백스테이지에서 자가 측정 발열량·배출계수를 넣은 배출원도
// 같은 목록에 뜬다. 수정이 프리셋 값을 덮어쓰면 그 측정값이 조용히 표준값이 된다.
const measuredStream = {
  ...entity('source_stream_1'),
  period_id: 'period_1',
  process_id: 'process_1',
  name: '도시가스 (LNG)',
  stream_type: 'FUEL',
  method: 'Combustion',
  activity_data: 128400,
  activity_unit: 'Nm3',
  ncv_gj_per_unit: 0.0412,                    // 자가 측정값 (표준 0.037이 아니다)
  emission_factor_tco2e_per_unit: 55.3,       // 자가 측정값 (표준 56.1이 아니다)
  emission_factor_basis: 'PER_TJ',
  oxidation_factor: 0.995,
  conversion_factor: 1,
  fossil_fraction: 0.98,
  biomass_fraction: 0.02,
  factor_source_type: 'SUPPLIER_OR_LAB',
  source: '자가 측정 성적서 2026-03',
};

const updatedStream = G.buildSourceStreamUpdate(measuredStream, { name: '  도시가스(당진)  ', activityData: 131000 });
assert.equal(updatedStream.name, '도시가스(당진)');
assert.equal(updatedStream.activity_data, 131000);
for (const field of [
  'id', 'created_at', 'ncv_gj_per_unit', 'emission_factor_tco2e_per_unit', 'emission_factor_basis',
  'oxidation_factor', 'conversion_factor', 'fossil_fraction', 'biomass_fraction',
  'factor_source_type', 'source', 'activity_unit', 'method', 'stream_type', 'period_id', 'process_id',
]) {
  assert.equal(updatedStream[field], measuredStream[field], `배출원 수정이 ${field}를 덮어쓰면 안 된다`);
}

assert.match(G.validateSourceStreamDraft({ name: '', activityData: 100 }), /이름/);
assert.match(G.validateSourceStreamDraft({ name: '도시가스', activityData: 0 }), /사용량/);
assert.match(G.validateSourceStreamDraft({ name: '도시가스', activityData: -5 }), /사용량/, '음수 사용량은 막는다');
assert.equal(G.validateSourceStreamDraft({ name: '도시가스', activityData: 1 }), null);

// ══ 전력 ══════════════════════════════════════════════════════════════

const process = {
  ...entity('process_1'),
  period_id: 'period_1',
  product_id: 'product_1',
  name: 'ERW 조관 라인',
  production_route: '가공(압연·신선·열처리)',
  output_mass_t: 11200,
  market_output_mass_t: 11000,
  internal_consumption_mass_t: 200,
  direct_attributable_emissions_tco2e: 431788.8,
  electricity_mwh: 0,
  electricity_ef_tco2e_per_mwh: 0.47,
};

const withElectricity = G.buildElectricityUpdate(process, { mwh: 831, ef: 0.4696, efSource: 'COUNTRY_GRID_DEFAULT' });
assert.equal(withElectricity.electricity_mwh, 831);
assert.equal(withElectricity.electricity_ef_tco2e_per_mwh, 0.4696);
assert.equal(withElectricity.electricity_ef_source, 'COUNTRY_GRID_DEFAULT');
// 전력 저장이 생산량·직접배출을 건드리면 지도의 ①과 생산량이 함께 틀어진다.
for (const field of ['id', 'created_at', 'name', 'output_mass_t', 'market_output_mass_t', 'internal_consumption_mass_t', 'direct_attributable_emissions_tco2e', 'production_route', 'period_id', 'product_id']) {
  assert.equal(withElectricity[field], process[field], `전력 저장이 ${field}를 건드리면 안 된다`);
}
assert.equal(
  G.buildElectricityUpdate(process, { mwh: 1, ef: 1, efSource: '' }).electricity_ef_source,
  undefined,
  '출처를 비우면 undefined로 저장한다(빈 문자열을 출처로 남기지 않는다)'
);

assert.match(G.validateElectricityDraft({ mwh: 0, ef: 0.47, efSource: '' }), /사용량/);
assert.match(G.validateElectricityDraft({ mwh: 500, ef: 0, efSource: '' }), /배출계수/);
assert.equal(G.validateElectricityDraft({ mwh: 500, ef: 0.47, efSource: '' }), null);

// ══ 전구물질 ══════════════════════════════════════════════════════════

const precursorDraft = {
  name: '  선재(와이어로드)  ',
  cnDigits: '72131000',
  consumedMass: 1050,
  purchasedMass: 1100,
  directSee: 1.8,
  indirectSee: 0.3,
  bridgeUsage: 0.346,
  bridgeFactor: 0.59,
  source: '  공급사 회신 메일 2026-05-02  ',
  dataMode: 'ACTUAL',
  justification: '',
  supplierInstallation: '  OO제철 △△공장  ',
  supplierRoute: '  EAF  ',
  supplierPeriod: '  2026-01-01 ~ 2026-12-31  ',
  outputAllocations: [{ product_output_line_id: 'line_1', allocated_mass_t: 1050 }],
};
const link = { period_id: 'period_1', process_id: 'process_1', product_id: 'product_1' };

// [핵심] 신규와 수정이 같은 값을 쓴다. 이 검사가 없으면 한쪽 필드만 고친 게 통과한다 —
// 이 저장소에서 반복해 난 결함의 정확한 모양이다.
const created = G.buildPrecursorCreate(precursorDraft, link);
const existingPrecursor = {
  ...entity('precursor_1'),
  ...created,
  // 백스테이지에서 올려둔 값들. 패널 저장이 이걸 되돌리면 안 된다.
  verification_status: 'VERIFIED',
  supplier_country: 'South Korea',
  consumed_for_non_cbam_mass_t: 120,
  default_value_year: '2026',
};
const updated = G.buildPrecursorUpdate(existingPrecursor, precursorDraft, link);
const payload = G.buildPrecursorPayload(precursorDraft, link);

for (const key of Object.keys(payload)) {
  assert.deepEqual(updated[key], created[key], `신규와 수정의 ${key}가 달라지면 안 된다`);
}
assert.ok(Object.keys(payload).length >= 18, `공유 payload가 너무 적다(${Object.keys(payload).length}) — 필드가 빠졌는지 확인할 것`);

// 문자열은 전부 trim한다.
assert.equal(created.name, '선재(와이어로드)');
assert.equal(created.source, '공급사 회신 메일 2026-05-02');
assert.equal(created.supplier_installation, 'OO제철 △△공장');
assert.equal(created.production_route, 'EAF');
assert.equal(created.supplier_reporting_period, '2026-01-01 ~ 2026-12-31');

// 신규 전용 기본값은 공유 payload에 없다 — 있으면 수정이 검증상태를 되돌린다.
for (const key of ['verification_status', 'supplier_country', 'consumed_for_non_cbam_mass_t', 'default_value_year', 'aggregated_goods_category']) {
  assert.ok(!(key in payload), `${key}는 공유 payload에 없어야 한다(수정이 덮어쓰면 안 되는 값)`);
}
assert.equal(updated.verification_status, 'VERIFIED', '수정이 검증 완료 상태를 UNVERIFIED로 되돌리면 안 된다');
assert.equal(updated.consumed_for_non_cbam_mass_t, 120, '수정이 비CBAM 소비량을 0으로 만들면 안 된다');
assert.equal(updated.id, 'precursor_1');
assert.equal(updated.created_at, existingPrecursor.created_at);

// [핵심] 선택 필드는 undefined라도 **키가 항상 있어야** 한다.
// 조건부로 키를 빼면 수정 시 펼치기가 옛 값을 남겨, 사용자가 화면에서 지운 전력 분해값과
// 제품별 배분이 저장소에는 살아남는다.
const clearedDraft = { ...precursorDraft, bridgeUsage: 0, bridgeFactor: 0, outputAllocations: undefined, supplierPeriod: '' };
const clearedPayload = G.buildPrecursorPayload(clearedDraft, link);
for (const key of ['indirect_electricity_mwh_per_t', 'indirect_electricity_factor_tco2e_per_mwh', 'output_allocations', 'supplier_reporting_period']) {
  assert.ok(key in clearedPayload, `${key} 키가 빠지면 수정으로 값을 지울 수 없다`);
  assert.equal(clearedPayload[key], undefined);
}
const clearedUpdate = G.buildPrecursorUpdate(existingPrecursor, clearedDraft, link);
assert.equal(clearedUpdate.indirect_electricity_mwh_per_t, undefined, '전력 분해를 지우면 저장소에서도 지워져야 한다');
assert.equal(clearedUpdate.output_allocations, undefined, '자동 배분으로 되돌리면 수동 배분이 지워져야 한다');

// 전력 분해는 둘 다 있을 때만 보존한다 — 한쪽만 있으면 곱이 성립하지 않는다.
assert.equal(
  G.buildPrecursorPayload({ ...precursorDraft, bridgeFactor: 0 }, link).indirect_electricity_mwh_per_t,
  undefined,
  '계수가 없으면 사용량만 남기지 않는다'
);

// ── 전구물질 검증 ──
const validDraft = { ...precursorDraft, name: '선재', source: '공급사 회신' };
assert.equal(G.validatePrecursorDraft(validDraft), null);
assert.match(G.validatePrecursorDraft({ ...validDraft, name: ' ' }), /원료 이름/);
assert.match(G.validatePrecursorDraft({ ...validDraft, cnDigits: '721' }), /CN/);
assert.match(G.validatePrecursorDraft({ ...validDraft, consumedMass: 0 }), /소비량/);
assert.match(G.validatePrecursorDraft({ ...validDraft, source: '  ' }), /출처/);
assert.match(G.validatePrecursorDraft({ ...validDraft, dataMode: 'DEFAULT', justification: '' }), /사유/);
assert.equal(G.validatePrecursorDraft({ ...validDraft, dataMode: 'DEFAULT', justification: 'DV 적용' }), null);

// 배분 합계 — 1% 또는 0.01t 중 큰 값을 허용오차로 쓴다.
assert.equal(G.validatePrecursorAllocation(1050, 1050), null);
assert.equal(G.validatePrecursorAllocation(1055, 1050), null, '1% 이내는 허용');
assert.match(G.validatePrecursorAllocation(900, 1050), /배분 합계/);
assert.equal(G.validatePrecursorAllocation(0.5, 0.5), null, '소량도 통과해야 한다');
assert.match(G.validatePrecursorAllocation(0.6, 0.5), /배분 합계/, '소량에서는 0.01t 절대오차를 쓴다');

// ══ 구조 검사 ═════════════════════════════════════════════════════════
// 모든 수정 빌더는 기존 엔티티를 펼쳐야 한다. 새 객체를 만들면 id·created_at이 사라지고,
// updateLocalItem은 put이라 그 순간 **새 행이 생기고 옛 행이 남는다**(오류 없이).
const UPDATE_BUILDERS = [
  ['buildProductUpdate', () => G.buildProductUpdate(product, { name: 'x', cnDigits: '72172010' }), product],
  ['buildInstallationUpdate', () => G.buildInstallationUpdate(installation, { name: 'x', country: 'KR' }), installation],
  ['buildPeriodUpdate', () => G.buildPeriodUpdate(period, { name: 'x', startDate: '2026-01-01', endDate: '2026-12-31' }), period],
  ['buildSourceStreamUpdate', () => G.buildSourceStreamUpdate(measuredStream, { name: 'x', activityData: 1 }), measuredStream],
  ['buildElectricityUpdate', () => G.buildElectricityUpdate(process, { mwh: 1, ef: 1, efSource: '' }), process],
  ['buildPrecursorUpdate', () => G.buildPrecursorUpdate(existingPrecursor, precursorDraft, link), existingPrecursor],
];
for (const [name, run, source] of UPDATE_BUILDERS) {
  const result = run();
  assert.equal(result.id, source.id, `${name}가 id를 잃으면 새 행이 생긴다`);
  assert.equal(result.created_at, source.created_at, `${name}가 created_at을 잃으면 안 된다`);
}
assert.equal(UPDATE_BUILDERS.length, 6, '수정 빌더가 늘면 이 구조 검사도 확장할 것');

console.log('Guided edit verification passed (신규·수정 payload 일치 · 펼치기 보존 · 삭제 참조 차단 · 검증 규칙).');
