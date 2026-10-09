// run32 — 기준선(.cbam)에 새 「이중계상 차단」이 오탐하지 않는지. 저장소 루트에서: node cbamy/runs/2026-10-09_run32-baseline-recheck/check-duplicate.mjs <state.json>
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const file = (p) => readFileSync(p, 'utf8');
const strip = (t, all = true) => t.replace(all ? /^import [\s\S]*?;\r?\n/gm : /^import type [\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
const rename = (t, n) => t.split('fmt').join(n);
const parts = [
  strip(file('src/lib/source-stream-calculation.ts'), false), strip(file('src/lib/allocation-rules.ts')), strip(file('src/lib/measurable-heat.ts')), strip(file('src/lib/fuel-allocation.ts')).split('fmt').join('fmtFuel'),
  rename(strip(file('src/lib/energy-split-summary.ts')), 'fmtEnergy'), 'globalThis.app = { findDuplicateUnsplitFuel };',
];
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(parts.join('\n'), { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const state = JSON.parse(file(process.argv[2]));
console.log('이중계상 후보', JSON.stringify(context.app.findDuplicateUnsplitFuel(state.source_streams)));
