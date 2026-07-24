// 길잡이 지도 패널의 수정·삭제 로직 검증.
//
// 왜 이 파일이 있는가: 지도 패널의 저장 로직은 .tsx 안에 있어 어떤 검사도 닿지 않았다.
// 신규 경로만 있을 때는 그럭저럭 버텼지만, **수정 경로는 같은 필드를 두 번째로 적는 자리**라
// 한쪽만 고쳐지면 조용히 어긋난다. 이번 저장소에서 반복해 난 결함이 정확히 그 모양이었다.
//
// ■ 이 파일의 첫 판은 스스로를 속였다 — 반드시 읽을 것
//
// 처음엔 「신규와 수정이 같은 값을 쓰는가」를 이렇게 검사했다:
//     const created = buildPrecursorCreate(draft, link);
//     const updated = buildPrecursorUpdate(existing, draft, link);
//     for (const key of Object.keys(payload)) assert.deepEqual(updated[key], created[key]);
// 양쪽이 **같은 함수**를 부르므로 이 루프는 항상 통과한다. 항진명제였다.
// 실제로 다음 네 변형이 전부 통과했다:
//     · direct_see_tco2e_per_t에 draft.indirectSee를 넣기 (모든 전구물질 SEE 붕괴)
//     · buildPeriodPayload에서 start_date 빼기
//     · buildProductPayload에서 reporting_scope 빼기 (신규 제품이 지도에서 사라짐)
//     · buildPrecursorCreate가 verification_status를 'VERIFIED'로 (공급사 자료를 허위로 검증됨 표시)
//
// 그래서 방식을 바꿨다. **매핑은 기대값 리터럴과 통째로 비교한다.** 필드를 바꾸든 빼든
// 더하든 전부 실패한다 — 더할 때 실패하는 것도 옳다. 매핑은 의도적으로만 늘어야 한다.
//
// 「신규와 수정이 어긋나지 않는다」는 보장은 이 파일이 아니라 **구조**에서 온다:
// panels.tsx가 매핑을 다시 인라인하지 못하게 verify-guided-panels.mjs가 막는다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const SOURCE_PATH = 'src/lib/guided-edit.ts';
const rawSource = readFileSync(SOURCE_PATH, 'utf8');

/** 모듈이 실제로 내보내는 함수 이름. 손으로 적은 목록과 대조해 새 export가 무검사로 새는 걸 막는다. */
const declaredExports = [...rawSource.matchAll(/^export function ([A-Za-z0-9_]+)/gm)].map((match) => match[1]);

const EXPECTED_EXPORTS = [
  'getOutputLineDeleteBlockers',
  'getProductDeleteBlockers', 'validateProductDraft', 'buildProductPayload', 'buildProductUpdate',
  'validateInstallationDraft', 'buildInstallationPayload', 'buildInstallationUpdate',
  'validatePeriodDraft', 'buildPeriodPayload', 'buildPeriodUpdate', 'getPeriodDeleteBlockers',
  'validateSourceStreamDraft', 'buildSourceStreamUpdate',
  'validateElectricityDraft', 'buildElectricityUpdate',
  'validatePrecursorDraft', 'validatePrecursorAllocation',
  'buildPrecursorPayload', 'buildPrecursorCreate', 'buildPrecursorUpdate',
];

assert.deepEqual(
  [...declaredExports].sort(),
  [...EXPECTED_EXPORTS].sort(),
  'guided-edit.ts의 export가 바뀌었다. 새 함수는 여기 목록에 넣고 **단언도 함께** 쓸 것 — '
  + '목록에만 넣으면 무검사 함수가 하나 늘 뿐이다'
);

function loadGuidedEditModule() {
  const source = rawSource
    .replace(/^import type [\s\S]*?from '.*';$/gm, '')
    .replace(/^export /gm, '');
  const compiled = ts.transpileModule(
    `${source}\nglobalThis.guidedEdit = { ${EXPECTED_EXPORTS.join(', ')} };`,
    { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  assert.ok(!/^\s*import\s/m.test(compiled), '컴파일 결과에 import가 남았다 — vm에서 조용히 실패한다');
  const context = vm.createContext({ Intl, Math, Number });
  vm.runInContext(compiled, context);
  return context.guidedEdit;
}

const G = loadGuidedEditModule();

/** LocalEntity 3필드 — 어떤 수정도 이걸 바꾸면 안 된다. */
const entity = (id) => ({ id, created_at: '2026-01-02T03:04:05.000Z', updated_at: '2026-01-02T03:04:05.000Z' });

// vm 안에서 만든 값은 프로토타입이 다른 realm의 것이라 deepEqual이 거부한다. 호스트로 옮겨 비교한다.
const host = (value) => JSON.parse(JSON.stringify(value));
/** undefined 값을 가진 키까지 보존하며 호스트로 옮긴다(JSON은 그 키를 지워버린다). */
const hostKeys = (value) => Object.keys(value).sort();
const pick = (value, keys) => Object.fromEntries(keys.map((key) => [key, value[key]]));

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

// ── 신규 매핑 전체를 리터럴과 비교 ──
// 자기비교(신규 vs 수정)로는 매핑이 통째로 틀려도 통과한다. 기대값을 적어둔다.
const productPayload = G.buildProductPayload({ name: '  열연강판  ', cnDigits: '73063077' }, 'installation_1');
assert.deepEqual(host(productPayload), {
  installation_id: 'installation_1',
  name: '열연강판',
  hs_code: '7306',
  cn_code: '73063077',
  hs_group: '73',
  product_type_enum: 'HS73_OTHER',
  unit: 'tonne',
  reporting_scope: 'CBAM_GOOD',
}, '신규 제품 매핑이 바뀌었다. reporting_scope가 빠지면 신규 제품이 지도에서 사라진다');
assert.deepEqual(
  hostKeys(productPayload),
  ['cn_code', 'hs_code', 'hs_group', 'installation_id', 'name', 'product_type_enum', 'reporting_scope', 'unit'],
  '신규 제품 payload의 키 집합이 바뀌었다'
);
// 사업장이 아직 없을 때도 저장은 되어야 한다(1단계를 건너뛴 사용자).
assert.equal(G.buildProductPayload({ name: '강선', cnDigits: '72172010' }, undefined).installation_id, undefined);

// ── [핵심] 이름만 고치면 CN 파생 필드를 건드리지 않는다 ──
const renamed = G.buildProductUpdate(product, { name: '  아연도금 강선 2종  ', cnDigits: '72172010' });
assert.equal(renamed.name, '아연도금 강선 2종', '이름은 trim해 저장한다');
assert.equal(renamed.product_type_enum, 'HS72_WIRE_GALVANISED', 'CN이 그대로면 제품군을 되돌리면 안 된다');
assert.equal(renamed.hs_code, '7217');
assert.equal(renamed.hs_group, '72');
assert.equal(renamed.cn_code, '72172010');

// CN을 실제로 바꾸면 파생 필드가 전부 따라간다 — 하나만 따라가면 hs_group과 cn이 어긋난다.
// 픽스처와 비교하지 않고 **리터럴**로 적는다. 픽스처 비교는 파생 규칙이 통째로 틀려도 통과한다.
const recoded = G.buildProductUpdate(product, { name: '열연강판', cnDigits: '73063077' });
assert.equal(recoded.cn_code, '73063077');
assert.equal(recoded.hs_code, '7306', 'CN이 바뀌면 hs_code는 앞 4자리');
assert.equal(recoded.hs_group, '73', 'CN이 바뀌면 hs_group은 앞 2자리');
assert.equal(recoded.product_type_enum, 'HS73_OTHER', 'CN이 바뀌면 제품군도 다시 파생한다');

// [핵심] 저장된 CN에 구분자가 있어도 표기만 다른 것은 변경이 아니다.
// /upload의 활동자료 템플릿은 CN을 정규화 없이 그대로 저장한다(activity-data-template.ts가
// 값을 trim만 한다). EU가 공표하는 표기는 「7217 20 10」이므로 그런 행이 실제로 들어온다.
// 이걸 변경으로 보면, 사용자가 CN을 건드리지도 않았는데 제품군이 되돌아가고 —
// 화면은 바로 그 순간 「CN을 그대로 두면 제품군 설정이 유지됩니다」라고 말하고 있다.
const spacedRenamed = G.buildProductUpdate(
  { ...product, cn_code: '7217 20 10' },
  { name: '아연도금 강선 2종', cnDigits: '72172010' }
);
assert.equal(
  spacedRenamed.product_type_enum, 'HS72_WIRE_GALVANISED',
  '구분자만 다른 CN은 변경이 아니다 — 제품군을 되돌리면 패널 문안이 거짓이 된다'
);
assert.equal(spacedRenamed.hs_code, '7217');
assert.equal(spacedRenamed.hs_group, '72');
// 표기가 달랐던 CN은 이 기회에 정규화해 저장한다(값은 같고 형식만 정리).
assert.equal(spacedRenamed.cn_code, '7217 20 10', '변경이 아니면 저장된 표기를 그대로 둔다');

// cn_code가 비어 있던 제품(옛 자료)에 CN을 넣으면 파생이 돌아야 한다.
const backfilled = G.buildProductUpdate({ ...product, cn_code: undefined }, { name: '강선', cnDigits: '72172010' });
assert.equal(backfilled.cn_code, '72172010');
assert.equal(backfilled.product_type_enum, 'HS72_OTHER', 'CN이 없던 제품에 CN을 넣으면 파생한다');

// 펼치기 보존 — 패널에 칸이 없는 필드가 살아남는다.
for (const field of ['id', 'created_at', 'installation_id', 'unit', 'reporting_scope']) {
  assert.equal(renamed[field], product[field], `제품 수정이 ${field}를 지우면 안 된다`);
  assert.equal(recoded[field], product[field], `CN 변경도 ${field}를 지우면 안 된다`);
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
assert.deepEqual(host(secondaryOnly.reasons), ['생산라인 1건']);

const noRef = G.getProductDeleteBlockers('product_9', { processes: [], precursors: [], productOutputLines: [] });
assert.equal(noRef.total, 0, '참조가 없으면 삭제할 수 있다');
assert.deepEqual(host(noRef.reasons), [], '0건짜리 항목을 문구에 넣으면 안 된다');

const everyRef = G.getProductDeleteBlockers('product_1', {
  processes: [{ product_id: 'product_1' }],
  precursors: [{ product_id: 'product_1' }, { product_id: 'product_1' }],
  productOutputLines: [{ product_id: 'product_1' }],
});
assert.equal(everyRef.total, 4);
assert.deepEqual(host(everyRef.reasons), ['생산공정 1건', '생산라인 1건', '전구물질 2건']);

// 세 참조원을 **각각** 확인한다 — 하나만 빠뜨려도 위 합계 검사는 통과할 수 있다.
for (const [key, label] of [['processes', '생산공정 1건'], ['productOutputLines', '생산라인 1건'], ['precursors', '전구물질 1건']]) {
  const empty = { processes: [], precursors: [], productOutputLines: [] };
  const only = G.getProductDeleteBlockers('product_x', { ...empty, [key]: [{ product_id: 'product_x' }] });
  assert.equal(only.total, 1, `${key}만 참조해도 제품 삭제를 막아야 한다`);
  assert.deepEqual(host(only.reasons), [label]);
}

// ── 생산라인 삭제 차단 (전구물질 제품별 배분) ──
// 이 경로는 삭제 버튼이 아니라 3단계 공정 수정에서 열린다 — 제품 생산량을 0/공란으로 두면
// 그 생산라인이 지워진다. 배분이 그 라인을 가리키면 엔진이 조용히 건너뛰어 질량이 사라진다.
const allocatedPrecursor = {
  id: 'precursor_a',
  output_allocations: [
    { product_output_line_id: 'line_1', allocated_mass_t: 600 },
    { product_output_line_id: 'line_2', allocated_mass_t: 450 },
  ],
};
const lineBlocked = G.getOutputLineDeleteBlockers('line_2', { precursors: [allocatedPrecursor] });
assert.equal(lineBlocked.total, 1, '배분이 가리키는 생산라인은 삭제를 막아야 한다');
assert.deepEqual(host(lineBlocked.reasons), ['전구물질 제품별 배분 1건']);
assert.equal(
  G.getOutputLineDeleteBlockers('line_9', { precursors: [allocatedPrecursor] }).total,
  0,
  '아무도 안 가리키는 생산라인은 지울 수 있다'
);
// 배분이 아예 없는 전구물질(생산량 비율 자동 배분)은 아무 라인도 막지 않는다.
assert.equal(G.getOutputLineDeleteBlockers('line_1', { precursors: [{ id: 'p', output_allocations: undefined }] }).total, 0);
assert.equal(G.getOutputLineDeleteBlockers('line_1', { precursors: [{ id: 'p', output_allocations: [] }] }).total, 0);
// 같은 라인을 여러 전구물질이 가리키면 전부 센다.
assert.equal(
  G.getOutputLineDeleteBlockers('line_1', {
    precursors: [allocatedPrecursor, { id: 'precursor_b', output_allocations: [{ product_output_line_id: 'line_1', allocated_mass_t: 10 }] }],
  }).total,
  2
);

// ── 제품 검증 ──
assert.match(G.validateProductDraft({ name: '  ', cnDigits: '72172010' }), /제품 이름/);
assert.match(G.validateProductDraft({ name: '강선', cnDigits: '7217' }), /8자리/, 'CN 8자리 미만은 막는다');
assert.match(G.validateProductDraft({ name: '강선', cnDigits: '721720101' }), /8자리/, 'CN 9자리도 막는다');
assert.equal(G.validateProductDraft({ name: '강선', cnDigits: '72172010' }), null);

// ══ 사업장 ════════════════════════════════════════════════════════════

const installationPayload = G.buildInstallationPayload({ name: '  Husteel Dangjin ERW  ', country: ' kr ' });
assert.deepEqual(host(installationPayload), { name: 'Husteel Dangjin ERW', country: 'KR' }, '사업장 매핑이 바뀌었다');

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
assert.deepEqual(host(updatedInstallation.boundary_json), { note: '공정 경계 메모' }, '공정 경계 메모가 사라지면 안 된다');
// 수정이 새 키를 만들어내면 안 된다 — 스키마에 없는 필드가 저장소에 쌓인다.
assert.deepEqual(hostKeys(updatedInstallation), hostKeys(installation), '사업장 수정이 키 집합을 바꾸면 안 된다');

assert.match(G.validateInstallationDraft({ name: '', country: 'KR' }), /이름/);
assert.match(G.validateInstallationDraft({ name: '공장', country: 'KOR' }), /2자리/);
assert.match(G.validateInstallationDraft({ name: '공장', country: '82' }), /2자리/, '숫자 국가코드는 막는다');
assert.equal(G.validateInstallationDraft({ name: '공장', country: 'kr' }), null, '소문자 입력은 허용하고 정규화한다');

// ══ 보고기간 ══════════════════════════════════════════════════════════

// [변형 B 차단] 자기비교로는 start_date가 통째로 빠져도 통과했다.
const periodPayload = G.buildPeriodPayload({ name: '  2026 연간  ', startDate: '2026-01-01', endDate: '2026-12-31' });
assert.deepEqual(host(periodPayload), {
  name: '2026 연간',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
}, '보고기간 매핑이 바뀌었다. start_date가 빠지면 기간 시작일이 사라진다');

const period = {
  ...entity('period_1'),
  installation_id: 'installation_1',
  name: '2026 Annual',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  // 이 패널에는 상태 칸이 없다. 산정 완료로 올려둔 기간이 저장 한 번에 DRAFT로 떨어지면 안 된다.
  status: 'CALCULATED',
};

// 픽스처와 **다른** 날짜를 넣는다. 같은 값을 쓰면 펼치기가 매핑 누락을 가려버린다.
const updatedPeriod = G.buildPeriodUpdate(period, { name: '2026 상반기', startDate: '2026-02-01', endDate: '2026-06-30' });
assert.equal(updatedPeriod.name, '2026 상반기');
assert.equal(updatedPeriod.start_date, '2026-02-01', '시작일 수정이 반영되어야 한다');
assert.equal(updatedPeriod.end_date, '2026-06-30');
assert.equal(updatedPeriod.status, 'CALCULATED', '기간 수정이 상태를 되돌리면 안 된다');
assert.equal(updatedPeriod.installation_id, 'installation_1');
assert.equal(updatedPeriod.id, period.id);
assert.equal(updatedPeriod.created_at, period.created_at);
assert.deepEqual(hostKeys(updatedPeriod), hostKeys(period), '기간 수정이 키 집합을 바꾸면 안 된다');

assert.match(G.validatePeriodDraft({ name: '', startDate: '2026-01-01', endDate: '2026-12-31' }), /이름/);
assert.match(G.validatePeriodDraft({ name: '연간', startDate: '', endDate: '2026-12-31' }), /시작·종료일/);
assert.match(G.validatePeriodDraft({ name: '연간', startDate: '2026-01-01', endDate: '' }), /시작·종료일/);
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
assert.deepEqual(host(periodRefs.reasons), ['생산공정 1건', '배출원 자료 1건', '전구물질 1건']);
assert.equal(
  G.getPeriodDeleteBlockers('period_9', { processes: [], sourceStreams: [], precursors: [] }).total,
  0
);
for (const [key, label] of [['processes', '생산공정 1건'], ['sourceStreams', '배출원 자료 1건'], ['precursors', '전구물질 1건']]) {
  const empty = { processes: [], sourceStreams: [], precursors: [] };
  const only = G.getPeriodDeleteBlockers('period_x', { ...empty, [key]: [{ period_id: 'period_x' }] });
  assert.equal(only.total, 1, `${key}만 참조해도 기간 삭제를 막아야 한다`);
  assert.deepEqual(host(only.reasons), [label]);
}

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
assert.deepEqual(hostKeys(updatedStream), hostKeys(measuredStream), '배출원 수정이 키 집합을 바꾸면 안 된다');

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
// mwh와 ef가 서로 뒤바뀌어 저장되면 배출량이 통째로 틀린다 — 값이 실제로 각 자리에 갔는지 본다.
assert.notEqual(withElectricity.electricity_mwh, withElectricity.electricity_ef_tco2e_per_mwh);
assert.equal(
  G.buildElectricityUpdate(process, { mwh: 1, ef: 1, efSource: '' }).electricity_ef_source,
  undefined,
  '출처를 비우면 undefined로 저장한다(빈 문자열을 출처로 남기지 않는다)'
);

assert.match(G.validateElectricityDraft({ mwh: 0, ef: 0.47, efSource: '' }), /사용량/);
assert.match(G.validateElectricityDraft({ mwh: -1, ef: 0.47, efSource: '' }), /사용량/);
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

// ── [변형 A 차단] 매핑 전체를 리터럴과 비교 ──
// 값이 서로 다른 draft 필드를 쓴다(directSee 1.8 ≠ indirectSee 0.3, purchased 1100 ≠ consumed 1050).
// 같은 값을 쓰면 자리를 뒤바꿔도 통과한다.
const payload = G.buildPrecursorPayload(precursorDraft, link);
assert.deepEqual(host(payload), {
  period_id: 'period_1',
  process_id: 'process_1',
  product_id: 'product_1',
  name: '선재(와이어로드)',
  precursor_cn_code: '72131000',
  production_route: 'EAF',
  supplier_installation: 'OO제철 △△공장',
  supplier_reporting_period: '2026-01-01 ~ 2026-12-31',
  data_mode: 'ACTUAL',
  purchased_mass_t: 1100,
  consumed_mass_t: 1050,
  direct_see_tco2e_per_t: 1.8,
  indirect_see_tco2e_per_t: 0.3,
  indirect_electricity_mwh_per_t: 0.346,
  indirect_electricity_factor_tco2e_per_mwh: 0.59,
  source: '공급사 회신 메일 2026-05-02',
  default_value_justification: '',
  output_allocations: [{ product_output_line_id: 'line_1', allocated_mass_t: 1050 }],
}, '전구물질 매핑이 바뀌었다. 직접/간접 SEE가 뒤바뀌면 모든 전구물질 배출이 틀린다');

// undefined 값 키까지 포함한 키 집합(JSON은 그 키를 지우므로 따로 본다).
assert.deepEqual(hostKeys(payload), [
  'consumed_mass_t', 'data_mode', 'default_value_justification', 'direct_see_tco2e_per_t',
  'indirect_electricity_factor_tco2e_per_mwh', 'indirect_electricity_mwh_per_t', 'indirect_see_tco2e_per_t',
  'name', 'output_allocations', 'period_id', 'precursor_cn_code', 'process_id', 'product_id',
  'production_route', 'purchased_mass_t', 'source', 'supplier_installation', 'supplier_reporting_period',
], '전구물질 공유 payload의 키 집합이 바뀌었다');

// ── [변형 D 차단] 신규 전용 기본값을 리터럴로 못 박는다 ──
const created = G.buildPrecursorCreate(precursorDraft, link);
assert.deepEqual(
  host(pick(created, ['aggregated_goods_category', 'supplier_country', 'verification_status', 'default_value_year', 'consumed_for_non_cbam_mass_t'])),
  {
    aggregated_goods_category: 'Iron or steel products',
    supplier_country: 'South Korea',
    // 앱이 공급사 자료를 대신 검증할 수는 없다. 신규는 언제나 미검증이다 —
    // 여기서 VERIFIED가 새면 검증하지 않은 자료가 검증됨으로 EU 문서에 나간다.
    verification_status: 'UNVERIFIED',
    default_value_year: '2026',
    consumed_for_non_cbam_mass_t: 0,
  },
  '신규 전구물질의 기본값이 바뀌었다'
);
// 신규는 공유 payload + 기본값 5개, 그 이상도 이하도 아니다.
assert.deepEqual(
  hostKeys(created).filter((key) => !hostKeys(payload).includes(key)).sort(),
  ['aggregated_goods_category', 'consumed_for_non_cbam_mass_t', 'default_value_year', 'supplier_country', 'verification_status'],
  '신규 전용 키가 바뀌었다'
);

// ── 수정: 펼치기 보존 ──
const existingPrecursor = {
  ...entity('precursor_1'),
  ...created,
  // 백스테이지에서 올려둔 값들. 패널 저장이 이걸 되돌리면 안 된다.
  verification_status: 'VERIFIED',
  consumed_for_non_cbam_mass_t: 120,
};
const updated = G.buildPrecursorUpdate(existingPrecursor, precursorDraft);
assert.equal(updated.verification_status, 'VERIFIED', '수정이 검증 완료 상태를 UNVERIFIED로 되돌리면 안 된다');
assert.equal(updated.consumed_for_non_cbam_mass_t, 120, '수정이 비CBAM 소비량을 0으로 만들면 안 된다');
assert.equal(updated.aggregated_goods_category, 'Iron or steel products');
assert.equal(updated.id, 'precursor_1');
assert.equal(updated.created_at, existingPrecursor.created_at);
// 수정도 공유 매핑을 그대로 쓴다(값은 리터럴로 이미 확인했으므로 여기선 적용 여부만).
for (const key of hostKeys(payload)) {
  assert.deepEqual(host(updated[key] ?? null), host(payload[key] ?? null), `수정이 ${key}에 공유 매핑을 적용하지 않는다`);
}

// ── [링크 보존] 수정은 전구물질을 다른 제품·공정으로 옮기지 않는다 ──
// 이 패널에는 제품·기간 선택 칸이 없다. 상세 입력에서 부제품에 붙여둔 전구물질이
// 이름 한 글자 고쳤다고 공정의 대표 제품으로 옮겨가면, EU goods category 매핑이 바뀐다
// (eu-template-export가 precursor.product_id로 품목을 찾아 매핑에 쓴다).
const secondaryLinked = { ...existingPrecursor, product_id: 'product_secondary', process_id: 'process_9', period_id: 'period_9' };
const keptLink = G.buildPrecursorUpdate(secondaryLinked, precursorDraft);
assert.equal(keptLink.product_id, 'product_secondary', '수정이 전구물질을 대표 제품으로 옮기면 안 된다');
assert.equal(keptLink.process_id, 'process_9', '수정이 소속 공정을 바꾸면 안 된다');
assert.equal(keptLink.period_id, 'period_9', '수정이 보고기간을 바꾸면 안 된다');
assert.equal(G.buildPrecursorUpdate.length, 2, 'buildPrecursorUpdate가 link를 다시 받으면 호출부가 링크를 덮어쓸 수 있다');

// ── 선택 필드는 undefined라도 키가 항상 있어야 한다 ──
// 조건부로 키를 빼면 수정 시 펼치기가 옛 값을 남겨, 사용자가 화면에서 지운 전력 분해값과
// 제품별 배분이 저장소에는 살아남는다.
const clearedDraft = { ...precursorDraft, bridgeUsage: 0, bridgeFactor: 0, outputAllocations: undefined, supplierPeriod: '' };
const clearedPayload = G.buildPrecursorPayload(clearedDraft, link);
for (const key of ['indirect_electricity_mwh_per_t', 'indirect_electricity_factor_tco2e_per_mwh', 'output_allocations', 'supplier_reporting_period']) {
  assert.ok(key in clearedPayload, `${key} 키가 빠지면 수정으로 값을 지울 수 없다`);
  assert.equal(clearedPayload[key], undefined);
}
const clearedUpdate = G.buildPrecursorUpdate(existingPrecursor, clearedDraft);
assert.equal(clearedUpdate.indirect_electricity_mwh_per_t, undefined, '전력 분해를 지우면 저장소에서도 지워져야 한다');
assert.equal(clearedUpdate.output_allocations, undefined, '자동 배분으로 되돌리면 수동 배분이 지워져야 한다');

// 전력 분해는 둘 다 있을 때만 보존한다 — 한쪽만 있으면 곱이 성립하지 않는다.
assert.equal(
  G.buildPrecursorPayload({ ...precursorDraft, bridgeFactor: 0 }, link).indirect_electricity_mwh_per_t,
  undefined,
  '계수가 없으면 사용량만 남기지 않는다'
);
assert.equal(
  G.buildPrecursorPayload({ ...precursorDraft, bridgeUsage: 0 }, link).indirect_electricity_factor_tco2e_per_mwh,
  undefined,
  '사용량이 없으면 계수만 남기지 않는다'
);

// ── 전구물질 검증 ──
const validDraft = { ...precursorDraft, name: '선재', source: '공급사 회신' };
assert.equal(G.validatePrecursorDraft(validDraft), null);
assert.match(G.validatePrecursorDraft({ ...validDraft, name: ' ' }), /원료 이름/);
assert.match(G.validatePrecursorDraft({ ...validDraft, cnDigits: '721' }), /CN/);
assert.match(G.validatePrecursorDraft({ ...validDraft, consumedMass: 0 }), /소비량/);
assert.match(G.validatePrecursorDraft({ ...validDraft, consumedMass: -1 }), /소비량/);
assert.match(G.validatePrecursorDraft({ ...validDraft, source: '  ' }), /출처/);
assert.match(G.validatePrecursorDraft({ ...validDraft, dataMode: 'DEFAULT', justification: '' }), /사유/);
assert.equal(G.validatePrecursorDraft({ ...validDraft, dataMode: 'DEFAULT', justification: 'DV 적용' }), null);
assert.equal(G.validatePrecursorDraft({ ...validDraft, dataMode: 'SEMI_ACTUAL', justification: '' }), null, '혼합은 사유를 강제하지 않는다');

// 배분 합계 — 1% 또는 0.01t 중 큰 값을 허용오차로 쓴다.
assert.equal(G.validatePrecursorAllocation(1050, 1050), null);
assert.equal(G.validatePrecursorAllocation(1055, 1050), null, '1% 이내는 허용');
assert.match(G.validatePrecursorAllocation(900, 1050), /배분 합계/);
assert.match(G.validatePrecursorAllocation(1200, 1050), /배분 합계/, '초과도 막는다');
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
  ['buildPrecursorUpdate', () => G.buildPrecursorUpdate(existingPrecursor, precursorDraft), existingPrecursor],
];
for (const [name, run, source] of UPDATE_BUILDERS) {
  const result = run();
  assert.equal(result.id, source.id, `${name}가 id를 잃으면 새 행이 생긴다`);
  assert.equal(result.created_at, source.created_at, `${name}가 created_at을 잃으면 안 된다`);
}
assert.equal(UPDATE_BUILDERS.length, 6, '수정 빌더가 늘면 이 구조 검사도 확장할 것');

console.log('Guided edit verification passed (매핑 리터럴 대조 · 펼치기 보존 · 링크 보존 · 삭제 참조 차단 · 검증 규칙 · export 목록 동기).');
