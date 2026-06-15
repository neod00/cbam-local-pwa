import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadSourceStreamCalculationModule() {
  const source = readFileSync('src/lib/source-stream-calculation.ts', 'utf8')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  const compiled = ts.transpileModule(
    `${source}
globalThis.sourceStreamCalculation = {
  calculateSourceStreamEmissions,
  calculateSourceStreamEnergyBreakdown,
  calculateSourceStreamEnergyContent,
  getSourceStreamEmissionFactorBasis,
  getSourceStreamUnitWarnings,
};`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2020,
      },
    }
  ).outputText;
  const context = vm.createContext({});
  vm.runInContext(compiled, context);
  return context.sourceStreamCalculation;
}

function createSourceStream(overrides = {}) {
  return {
    stream_type: 'FUEL',
    method: 'Combustion',
    activity_data: 250,
    ncv_gj_per_unit: 45,
    emission_factor_tco2e_per_unit: 73,
    oxidation_factor: 1,
    conversion_factor: 1,
    fossil_fraction: 1,
    ...overrides,
  };
}

const {
  calculateSourceStreamEmissions,
  calculateSourceStreamEnergyBreakdown,
  calculateSourceStreamEnergyContent,
  getSourceStreamEmissionFactorBasis,
  getSourceStreamUnitWarnings,
} = loadSourceStreamCalculationModule();

assert.equal(calculateSourceStreamEmissions(createSourceStream()), 821.25);
assert.equal(getSourceStreamEmissionFactorBasis(createSourceStream()), 'PER_TJ');
assert.equal(calculateSourceStreamEmissions(createSourceStream({ fossil_fraction: 0.8 })), 657);
assert.equal(
  calculateSourceStreamEmissions(createSourceStream({ emission_factor_basis: 'PER_ACTIVITY_UNIT', emission_factor_tco2e_per_unit: 2 })),
  500
);
assert.equal(calculateSourceStreamEnergyContent(createSourceStream()), 11.25);
const energyBreakdown = calculateSourceStreamEnergyBreakdown(createSourceStream({ fossil_fraction: 0.8, biomass_fraction: 0.2 }));
assert.equal(energyBreakdown.total, 11.25);
assert.equal(energyBreakdown.fossil, 9);
assert.equal(energyBreakdown.biomass, 2.25);
assert.equal(
  calculateSourceStreamEmissions(
    createSourceStream({
      stream_type: 'PROCESS_MATERIAL',
      method: 'Process Emissions',
      activity_data: 100,
      emission_factor_tco2e_per_unit: 0.5,
    })
  ),
  50
);

// #7 물질수지(Mass balance) 음수 활동량(산출물 차감) 허용
assert.equal(
  calculateSourceStreamEmissions(
    createSourceStream({ stream_type: 'PROCESS_MATERIAL', method: 'Mass balance', activity_data: -200, ncv_gj_per_unit: 0, emission_factor_tco2e_per_unit: 3.667 })
  ),
  -733.4
);
assert.equal(
  calculateSourceStreamEmissions(
    createSourceStream({ stream_type: 'PROCESS_MATERIAL', method: 'Mass balance', activity_data: 1000, ncv_gj_per_unit: 0, emission_factor_tco2e_per_unit: 0.0029336 })
  ),
  2.9336
);
// 물질수지가 아닌 공정배출은 음수가 0으로 클램프되어야 함(음수 입력 무의미)
assert.equal(
  calculateSourceStreamEmissions(
    createSourceStream({ stream_type: 'PROCESS_MATERIAL', method: 'Process Emissions', activity_data: -100, emission_factor_tco2e_per_unit: 0.5 })
  ),
  0
);
// 연소 연료는 음수 활동량을 0으로 클램프(기존 동작 유지)
assert.equal(calculateSourceStreamEmissions(createSourceStream({ activity_data: -250 })), 0);

// #6 단위/NCV 정합성 경고
assert.equal(getSourceStreamUnitWarnings(createSourceStream({ activity_unit: 't', ncv_gj_per_unit: 45 })).length, 0);
assert.equal(getSourceStreamUnitWarnings(createSourceStream({ activity_unit: 'Nm3', ncv_gj_per_unit: 0.037 })).length, 0);
// 시나리오 트랩: Nm³ 활동량 + t 기준 NCV(48) → 경고
assert.ok(
  getSourceStreamUnitWarnings(createSourceStream({ activity_unit: 'Nm3', ncv_gj_per_unit: 48 })).some((w) => w.includes('Nm³')),
  'Nm³ 단위에 t 기준 NCV를 입력하면 경고해야 합니다.'
);
// t 활동량 + Nm³ 기준 NCV → 경고
assert.ok(getSourceStreamUnitWarnings(createSourceStream({ activity_unit: 't', ncv_gj_per_unit: 0.037 })).length > 0);
// 연소가 아니면 경고 없음
assert.equal(
  getSourceStreamUnitWarnings(createSourceStream({ stream_type: 'PROCESS_MATERIAL', method: 'Process Emissions', activity_unit: 'Nm3', ncv_gj_per_unit: 48 })).length,
  0
);
// NCV 누락
assert.ok(getSourceStreamUnitWarnings(createSourceStream({ activity_unit: 't', ncv_gj_per_unit: 0 })).length > 0);

console.log('Source-stream calculation verification passed.');
