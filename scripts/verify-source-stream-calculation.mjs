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

const { calculateSourceStreamEmissions } = loadSourceStreamCalculationModule();

assert.equal(calculateSourceStreamEmissions(createSourceStream()), 821.25);
assert.equal(calculateSourceStreamEmissions(createSourceStream({ fossil_fraction: 0.8 })), 657);
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

console.log('Source-stream calculation verification passed.');
