// run33 — 지금의 활동자료 서식(/upload)에 대일기업 기준선 자료를 채운 엑셀을 만든다(컨설턴트가 채워 준 파일을 흉내 낸다).
// 저장소 루트에서: node cbamy/runs/2026-10-10_run33-template-upload/build-filled-template.mjs <baseline-state.json> <out.xlsx>
// 서식에 칸이 없는 것(사업장·보고기간·생산라인·공용 계량기 정보)은 넣을 곳이 없어 빠진다 — 그것이 이 시험이 보려는 것이다.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const fflate = require('fflate');
const source = readFileSync('src/lib/activity-data-template.ts', 'utf8')
  .replace("import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';", 'const { strFromU8, strToU8, unzipSync, zipSync } = fflate;')
  .replace(/^import type [\s\S]*?;\r?\n/gm, '')
  .replace(/^export /gm, '')
  + '\nglobalThis.app = { templateSheets, createActivityDataTemplateWorkbook };';
const context = vm.createContext({ fflate, Blob, Uint8Array, Map, Number, String, Array, Boolean, Error });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { templateSheets, createActivityDataTemplateWorkbook } = context.app;

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const productName = (id) => state.products.find((item) => item.id === id)?.name ?? '';
const processName = (id) => state.processes.find((item) => item.id === id)?.name ?? '';
const sheet = (name) => templateSheets.find((item) => item.name === name);
const fill = (name, rows) => { const target = sheet(name); target.rows.splice(1, target.rows.length - 1, ...rows); };

fill('Products', state.products.map((p) => [p.name, p.hs_code ?? '', p.cn_code ?? '', p.hs_group ?? '', p.product_type_enum ?? '', p.unit ?? 'tonne', p.reporting_scope ?? 'CBAM_GOOD']));
// 직접배출은 배출원 시트로 넣으므로 공정 시트의 직접배출 칸은 0으로 둔다(컨설턴트가 고지서 자료를 SourceStreams에 적는 경우).
fill('Processes', state.processes.map((p) => [p.name, productName(p.product_id), p.production_route ?? '', p.output_mass_t, p.market_output_mass_t, p.internal_consumption_mass_t, 0, p.electricity_mwh, p.electricity_ef_tco2e_per_mwh, p.electricity_ef_source ?? '']));
fill('SourceStreams', state.source_streams.map((s) => [s.name, processName(s.process_id), s.stream_type, s.method, s.activity_data, s.activity_unit, s.ncv_gj_per_unit, s.emission_factor_tco2e_per_unit, s.emission_factor_basis, s.oxidation_factor, s.conversion_factor, s.fossil_fraction, s.biomass_fraction, s.factor_source_type, s.source ?? '']));
fill('Precursors', state.precursors.map((p) => [p.name, productName(p.product_id), processName(p.process_id), p.precursor_cn_code ?? '', p.aggregated_goods_category ?? '', p.production_route ?? '', p.supplier_country ?? '', p.supplier_installation ?? '', p.data_mode, p.verification_status, p.default_value_year ?? '2026', p.purchased_mass_t, p.consumed_mass_t, p.consumed_for_non_cbam_mass_t ?? 0, p.direct_see_tco2e_per_t, p.indirect_see_tco2e_per_t, p.source ?? '', p.default_value_justification ?? '']));

writeFileSync(process.argv[3], Buffer.from(await createActivityDataTemplateWorkbook().arrayBuffer()));
console.log('rows', templateSheets.map((item) => `${item.name}:${item.rows.length - 1}`).join(' '));
