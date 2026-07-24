// 배출원 입력 검증 — 지도 패널과 상세 화면이 **같은 규칙**을 쓰는가.
//
// 씨밤이 run08(P1-run08-02)이 찾은 것: 길잡이 지도의 4단계가 「연료 연소 프리셋 두 개」만
// 제공해서, 전기로 사업장은 지도만으로 직접배출을 산정할 수 없었다. 고철·흑연전극
// (물질수지)과 부원료(공정배출)를 넣을 자리가 없는데, **그 상태로도 8단계에서 EU 문서가
// 생성됐다.** 「지도를 따라가면 문서가 완성됩니다」라고 적힌 화면이 그렇게 동작했다.
//
// 지도에 세 방법을 다 넣으면서 검증을 source-stream-input.ts로 모았다.
// 여기서 못 박는 것:
//   1) 검증 규칙이 **한 곳**에만 있다(상세 화면에 사본이 남아 있으면 실패).
//   2) 세 산정방법(연소·공정배출·물질수지)이 지도에서 모두 선택 가능하다.
//   3) 각 유형의 자리값이 실제로 저장 가능한 값이다(자기 규칙에 걸리지 않는다).
//   4) 물질수지 차감(음수)은 허용되고, 다른 방법의 음수는 막힌다.
//   5) 유형 되짚기(matchGuidedStreamKind)가 저장된 배출원을 제 유형으로 되돌린다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadModule() {
  const calc = readFileSync('src/lib/source-stream-calculation.ts', 'utf8')
    .replace(/^import type [\s\S]*?from '.*';$/gm, '')
    .replace(/^import [\s\S]*?from '.*';$/gm, '')
    .replace(/^export /gm, '');
  const input = readFileSync('src/lib/source-stream-input.ts', 'utf8')
    .replace(/^import type [\s\S]*?from '.*';$/gm, '')
    .replace(/^import [\s\S]*?from '.*';$/gm, '')
    .replace(/^export /gm, '');
  const exported = [
    'createSourceStreamValidationErrors', 'firstSourceStreamError', 'resolveUiEmissionFactorBasis',
    'GUIDED_STREAM_KINDS', 'matchGuidedStreamKind', 'SOURCE_STREAM_METHODS', 'ACTIVITY_UNITS',
    'calculateSourceStreamEmissions',
  ];
  const compiled = ts.transpileModule(
    `${calc}\n${input}\nglobalThis.mod = { ${exported.join(', ')} };`,
    { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const context = vm.createContext({ Intl, Math, Number, JSON, Object, Array });
  vm.runInContext(compiled, context);
  return context.mod;
}

const M = loadModule();
const host = (v) => JSON.parse(JSON.stringify(v));

// ── 1) 규칙이 한 곳에만 있는가 ────────────────────────────────────────
const legacyPage = readFileSync('src/app/source-streams/page.tsx', 'utf8');
assert.ok(
  !/^function createSourceStreamValidationErrors/m.test(legacyPage),
  '상세 화면에 검증 사본이 남아 있다 — 두 곳에 두면 한쪽만 고쳐진다(이 저장소가 아홉 번 반복한 실패)'
);
assert.match(legacyPage, /from '@\/lib\/source-stream-input'/, '상세 화면이 공유 모듈을 쓰지 않는다');

const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
assert.match(panels, /createSourceStreamValidationErrors/, '지도 패널이 공유 검증을 쓰지 않는다');
assert.ok(
  !/const FUEL_PRESETS = \[/.test(panels),
  '지도 패널에 자체 프리셋 배열이 남아 있다 — 유형 정의가 두 곳이 된다'
);

// ── 2) 세 산정방법이 지도에서 모두 선택 가능한가 ──────────────────────
const methods = new Set([...M.GUIDED_STREAM_KINDS].map((k) => k.defaults.method));
assert.deepEqual(
  [...methods].sort(),
  ['Combustion', 'Mass balance', 'Process Emissions'],
  '지도에서 고를 수 있는 산정방법이 EU 템플릿의 셋을 다 덮지 않는다 — '
  + '전기로 사업장은 물질수지·공정배출 없이는 직접배출을 산정할 수 없다'
);
assert.ok([...M.GUIDED_STREAM_KINDS].length >= 5, '입력 유형이 너무 적다 — 물질수지 투입/차감이 나뉘어 있는지 확인할 것');

// 물질수지 차감 유형이 있고, 그것만 음수를 허용한다.
const negativeKinds = [...M.GUIDED_STREAM_KINDS].filter((k) => k.allowsNegative);
assert.equal(negativeKinds.length, 1, '음수를 허용하는 유형은 물질수지 차감 하나여야 한다');
assert.equal(negativeKinds[0].defaults.method, 'Mass balance');

// ── 3) 각 유형의 자리값이 실제로 저장 가능한가 ────────────────────────
// 자리값이 자기 규칙에 걸리면, 사용자는 유형을 고르자마자 오류를 본다.
for (const kind of [...M.GUIDED_STREAM_KINDS]) {
  const draft = {
    ...kind.defaults,
    period_id: 'period_1',
    process_id: 'process_1',
    name: kind.label,
    activity_data: kind.allowsNegative ? -1000 : 1000,
    source: '테스트 출처',
  };
  const errors = M.createSourceStreamValidationErrors(draft);
  assert.equal(
    M.firstSourceStreamError(errors), null,
    `유형 「${kind.label}」의 자리값이 자기 검증에 걸린다: ${JSON.stringify(host(errors))}`
  );
  // 배출량이 실제로 계산되는가(0이면 화면에 넣어도 지도가 안 움직인다).
  const emissions = M.calculateSourceStreamEmissions(draft);
  assert.ok(Number.isFinite(emissions), `${kind.label}: 배출량이 숫자가 아니다`);
  assert.ok(
    kind.allowsNegative ? emissions < 0 : emissions > 0,
    `${kind.label}: 배출량 부호가 유형과 맞지 않는다 (${emissions})`
  );
}

// ── 4) 음수 규칙 ──────────────────────────────────────────────────────
const base = {
  period_id: 'period_1', process_id: 'process_1', name: '배출원', source: '출처',
  activity_unit: 't', ncv_gj_per_unit: 0, emission_factor_tco2e_per_unit: 1,
  emission_factor_basis: 'PER_ACTIVITY_UNIT', oxidation_factor: 1, conversion_factor: 1,
  fossil_fraction: 1, biomass_fraction: 0, factor_source_type: 'SUPPLIER_OR_LAB',
  stream_type: 'PROCESS_MATERIAL',
};
assert.equal(
  M.createSourceStreamValidationErrors({ ...base, method: 'Mass balance', activity_data: -500 }).activity_data,
  undefined,
  '물질수지 차감은 음수여야 한다 — 조강·슬래그가 갖고 나가는 탄소를 뺄 방법이 없어진다'
);
assert.match(
  M.createSourceStreamValidationErrors({ ...base, method: 'Process Emissions', activity_data: -500 }).activity_data ?? '',
  /0 이상/,
  '공정배출에서 음수는 입력 실수다'
);

// ── 규칙 표본 (상세 화면에서 옮겨온 것이 살아 있는가) ─────────────────
const fuel = { ...base, stream_type: 'FUEL', method: 'Combustion', activity_data: 100, ncv_gj_per_unit: 48, emission_factor_tco2e_per_unit: 73, emission_factor_basis: 'PER_TJ' };
assert.equal(M.firstSourceStreamError(M.createSourceStreamValidationErrors(fuel)), null);
assert.match(M.createSourceStreamValidationErrors({ ...fuel, ncv_gj_per_unit: 0 }).ncv_gj_per_unit ?? '', /순발열량/, '연료는 발열량이 필요하다');
assert.match(M.createSourceStreamValidationErrors({ ...fuel, method: 'Mass balance' }).method ?? '', /Combustion/, '연료를 물질수지로 넣으면 안 된다');
assert.match(M.createSourceStreamValidationErrors({ ...base, method: 'Combustion', activity_data: 1 }).method ?? '', /Process Emissions/, '공정 원료를 연소로 넣으면 안 된다');
assert.match(M.createSourceStreamValidationErrors({ ...fuel, fossil_fraction: 0.8, biomass_fraction: 0.5 }).fossil_fraction ?? '', /1을 넘을 수 없습니다/, '화석+바이오 합 규칙이 사라졌다');
assert.match(M.createSourceStreamValidationErrors({ ...fuel, source: '  ' }).source ?? '', /출처/, '출처 규칙이 사라졌다');
assert.match(M.createSourceStreamValidationErrors({ ...base, method: 'Process Emissions', activity_data: 1, emission_factor_tco2e_per_unit: 0 }).emission_factor_tco2e_per_unit ?? '', /0보다 크게/, '공정 원료 배출계수 규칙이 사라졌다');
assert.match(M.createSourceStreamValidationErrors({ ...base, stream_type: 'OTHER', method: 'Process Emissions', activity_data: 1 }).stream_type ?? '', /기타 배출원/, '기타 배출원 차단이 사라졌다');

// firstSourceStreamError는 오류가 있으면 반드시 문구를 돌려준다(조용히 통과 금지).
assert.equal(M.firstSourceStreamError({}), null);
assert.equal(M.firstSourceStreamError({ name: '이름을 입력하세요.' }), '이름을 입력하세요.');

// ── 5) 유형 되짚기 ────────────────────────────────────────────────────
// 되짚지 못하면 물질수지 배출원을 수정할 때 연료 칸(순발열량)이 뜨고 계수 의미가 어긋난다.
const cases = [
  [{ stream_type: 'FUEL', method: 'Combustion', activity_unit: 'Nm3', activity_data: 100 }, 'Combustion', 'Nm3'],
  [{ stream_type: 'FUEL', method: 'Combustion', activity_unit: 't', activity_data: 100 }, 'Combustion', 't'],
  [{ stream_type: 'PROCESS_MATERIAL', method: 'Process Emissions', activity_unit: 't', activity_data: 100 }, 'Process Emissions', null],
  [{ stream_type: 'PROCESS_MATERIAL', method: 'Mass balance', activity_unit: 't', activity_data: 100 }, 'Mass balance', null],
  [{ stream_type: 'PROCESS_MATERIAL', method: 'Mass balance', activity_unit: 't', activity_data: -100 }, 'Mass balance', null],
];
for (const [stream, expectedMethod, expectedUnit] of cases) {
  const kind = M.matchGuidedStreamKind(stream);
  assert.equal(kind.defaults.method, expectedMethod, `${JSON.stringify(stream)} → 산정방법이 어긋난다`);
  if (expectedUnit) {
    assert.equal(kind.defaults.activity_unit, expectedUnit, `${JSON.stringify(stream)} → 단위가 어긋난다`);
  }
}
// 음수 물질수지는 **차감 유형**으로 되짚어야 한다(음수 안내가 뜨도록).
assert.equal(
  M.matchGuidedStreamKind({ stream_type: 'PROCESS_MATERIAL', method: 'Mass balance', activity_unit: 't', activity_data: -100 }).allowsNegative,
  true,
  '음수 물질수지를 차감 유형으로 되짚지 않으면, 수정 화면이 음수를 오류로 취급하게 된다'
);
assert.equal(
  M.matchGuidedStreamKind({ stream_type: 'PROCESS_MATERIAL', method: 'Mass balance', activity_unit: 't', activity_data: 100 }).allowsNegative,
  false
);

console.log('Source stream input verification passed (규칙 단일화 · 세 산정방법 · 자리값 유효성 · 음수 규칙 · 유형 되짚기).');
