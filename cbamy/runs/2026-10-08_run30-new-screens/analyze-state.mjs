// run30 — 화면에서 넣은 상태(JSON)를 앱의 순수 함수로 다시 돌려 본다(엔진·귀속 점검·SEE 추적). 저장소 루트에서 실행: node cbamy/runs/2026-10-08_run30-new-screens/analyze-state.mjs <state.json>
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file = (path) => readFileSync(path, 'utf8');
const strip = (text, all = true) => text.replace(all ? /^import [\s\S]*?;\r?\n/gm : /^import type [\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
const rename = (text, name) => text.split('fmt').join(name);
const load = (parts, exported) => {
  const context = vm.createContext({ Intl });
  vm.runInContext(ts.transpileModule([...parts, `globalThis.app = { ${exported} };`].join('\n'), { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.app;
};
const base = [
  strip(file('src/lib/source-stream-calculation.ts'), false),
  file('src/lib/cn-master.generated.ts').replace(/^export /gm, ''),
  strip(file('src/lib/cbam-product-rules.ts')),
  strip(file('src/lib/reporting-scope.ts'), false),
  strip(file('src/lib/allocation-rules.ts')),
  strip(file('src/lib/measurable-heat.ts')),
  strip(file('src/lib/precursor-verification.ts')),
  strip(file('src/lib/calculation-engine.ts')),
];
const A = load([...base, rename(strip(file('src/lib/fuel-allocation.ts')), 'fmtFuel'), rename(strip(file('src/lib/energy-split-summary.ts')), 'fmtEnergy'), strip(file('src/lib/attribution-status.ts'))],
  'calculateLocalResults, getLocalCalculationWarningHref, buildAttributionStatus, summarizeEnergySplits');
const B = load([...base, strip(file('src/lib/fuel-allocation.ts')), strip(file('src/lib/source-stream-input.ts')), strip(file('src/lib/conversation-energy.ts')), strip(file('src/lib/emission-trace.ts'))],
  'calculateLocalResults, buildEmissionTrace');

const state = JSON.parse(file(process.argv[2]));
const engineInput = { internalTransfers: state.internal_transfers, products: state.products, periods: state.periods, processes: state.processes, productOutputLines: state.product_output_lines, sourceStreams: state.source_streams, precursors: state.precursors };
const results = A.calculateLocalResults(engineInput);
const f = (n) => (n === null ? 'null' : Number(n).toFixed(4));
console.log('== 엔진 결과');
for (const r of results) console.log(` ${r.product_name} (CN ${r.cn_code}) 직접 ${f(r.see_direct_incl_precursor)} · 간접 ${f(r.see_indirect_incl_precursor)} · 기준 ${f(r.see_cbam_basis)} · 총 ${f(r.total_see)} | 직접귀속 ${f(r.direct_emissions_tco2e)} tCO2e`);
console.log('== 엔진 경고');
for (const r of results) for (const w of r.warningDetails) console.log(` [${r.product_name.slice(0, 12)}]${w.check ? ` <${w.check}>` : ''} ${w.message.slice(0, 150)}`);
const energy = A.summarizeEnergySplits({ processes: state.processes, sourceStreams: state.source_streams });
console.log('== 에너지 나누기 현황', JSON.stringify(energy.items.map((i) => [i.title, i.detail, i.problem ?? null])), '힌트', energy.hints.map((h) => h.text.slice(0, 60)));
const attribution = A.buildAttributionStatus({ processes: state.processes, productOutputLines: state.product_output_lines, sourceStreams: state.source_streams, precursorCount: state.precursors.length, results, installation: state.installations[0], hrefOf: A.getLocalCalculationWarningHref });
console.log('== 귀속·할당 점검');
for (const row of attribution.rows) console.log(` ${row.status.padEnd(6)} ${row.code} ${row.title} — ${row.detail}`);
console.log('== SEE 추적');
const resultsB = B.calculateLocalResults(engineInput);
for (const r of resultsB.filter((x) => x.is_cbam_reportable)) {
  const trace = B.buildEmissionTrace({ result: r, process: state.processes.find((p) => p.id === r.process_id), sourceStreams: state.source_streams, precursors: state.precursors });
  console.log(` ${trace.productName}: SEE ${f(trace.see)} 자체 대조 ${trace.check.ok ? 'ok' : '불일치'}`);
  for (const node of trace.root.children) {
    console.log(`   ${node.label} ${f(node.value)}`);
    for (const child of node.children ?? []) console.log(`     - ${child.label.slice(0, 60)} ${f(child.value)} | ${child.method ?? ''}`);
  }
}
