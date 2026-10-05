// 전구물질 고리 (UX 컨셉 v4 §12, 2026-10-05) — 공급사 요청서 내보내기 + EU 표준 양식 회신 가져오기.
//
// 잠그는 것:
//  1) 회신 읽기: Summary_Products를 머리글 글자로 찾고(열 번호에 기대지 않음), 예시 행·빈 값·다른 단위는 적용 불가로 걸러낸다.
//     공식 예시 파일(이 컴퓨터에 있을 때)을 실제로 열어 읽는다.
//  2) 대조: 같은 CN이 둘 이상이면 앱이 고르지 않는다. 보고기간이 겹치지 않으면 기본 선택을 끈다. CN이 없거나 없는 제품은 적용하지 않는다.
//  3) 적용: 파일의 숫자 그대로, 공급사 확인(SUPPLIER_CONFIRMED)까지만. 검증됨으로 올리지 않는다. 엔진 결과가 그 값으로 바뀐다.
//  4) 요청서: 공급사별로 묶고, 원료·CN·구매량·보고기간만 담는다(우리 배출 자료는 넣지 않는다).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const fflate = require('fflate');
const strip = (path, all = true) => readFileSync(path, 'utf8')
  .replace(all ? /^import [\s\S]*?;\r?\n/gm : /^import type [\s\S]*?;\r?\n/gm, '')
  .replace(/^export /gm, '');
const withFflate = (path) => readFileSync(path, 'utf8')
  .replace(/^import \{[^}]*\} from 'fflate';\r?\n/m, '')
  .replace(/^export /gm, '');
const compile = (parts, expose, extra = {}) => {
  const code = ['const { strFromU8, unzipSync, strToU8, zipSync } = fflate;', ...parts,`globalThis.app = { ${expose.join(', ')} };`].join('\n');
  const context = vm.createContext({ Intl, fflate, console, Date, Map, Number, Set, Uint8Array, ...extra });
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.app;
};
const plain = (value) => JSON.parse(JSON.stringify(value));

const lib = compile(
  [withFflate('src/lib/reference-workbooks.ts'), strip('src/lib/supplier-reply.ts'), withFflate('src/lib/docx-builder.ts'), strip('src/lib/supplier-request.ts')],
  ['readWorkbookSheetRows', 'parseSupplierReply', 'matchReplyToPrecursors', 'buildReplyUpdate', 'excelDateToIso', 'groupPrecursorsBySupplier', 'buildSupplierRequestDocx', 'supplierRequestFilename']
);

// ── 합성 회신(공식 양식과 같은 머리글, 열 위치는 일부러 밀어 둔다) ─────────────
const row = (rowNumber, cells) => ({ rowNumber, valuesByColumn: new Map(Object.entries(cells)) });
const header = row(8, { D: 'Production process from which the products arise', E: 'Type of aggregated good or precursor', F: 'CN Codes', G: 'CN Name', H: 'Product name \n(used for communication)', I: 'SEE (direct)', J: 'SEE (indirect)', K: 'SEE (total)', L: 'Unit', M: 'Share of emissions by default value', N: 'Source for electricity EF', O: 'Embedded electricity (MWh/t)' });
const summary = [
  header,
  row(9, { C: 'Ex.', F: '72071919', I: '0.915', J: '0.396', K: '1.311' }),
  row(10, { C: '1', D: '선재 공정', F: '72139120', H: 'Wire rod', I: '1.5', J: '0.2', K: '1.7', L: 'tCO2e/t', M: '0', O: '0.4' }),
  row(11, { C: '2', D: '봉강', F: '72139120', H: 'Bar', I: '1.8', J: '0.25', K: '2.05', L: 'tCO2e/t', M: '0.3' }),
  row(12, { C: '3', F: '72081000', H: 'Coil', I: '1.4', J: '', K: '1.4', L: 'tCO2e/t' }),
  row(13, { C: '4', F: '73021028', H: 'Rail', I: '', J: '0.1', L: 'tCO2e/t' }),
  row(14, { C: '5', F: '72122000', H: 'Strip', I: '9', J: '1', L: 'kg' }),
  row(15, { C: '6' }),
];
const inst = [
  row(9, { D: 'Reporting period', H: 'Start:', I: '44927', K: 'End:', L: '45291' }),
  row(20, { E: 'Name of the installation (English name):', I: 'Example Steelworks' }),
  row(26, { E: 'Country:', I: 'China' }),
  row(36, { D: '(a)', E: 'Name and address of the verifier of this report:' }),
  row(37, { E: 'Company Name:', I: 'Verifier Co' }),
  row(41, { E: 'Country:', I: 'Germany' }),
];
const reply = lib.parseSupplierReply({ filename: 'reply.xlsx', summaryProducts: summary, instData: inst });
assert.equal(reply.fileProblem, undefined);
assert.equal(reply.rows.length, 5, '예시 행(Ex.)과 CN 없는 행은 건너뛴다');
assert.equal(reply.installationName, 'Example Steelworks');
assert.equal(reply.country, 'China', '국가는 설비 정보의 첫 「Country:」(검증인 국가가 아니다)');
assert.equal(reply.periodStart, '2023-01-01', '엑셀 일련번호 날짜');
assert.equal(reply.periodEnd, '2023-12-31');
assert.equal(reply.verifierName, 'Verifier Co');
assert.equal(lib.excelDateToIso('2023-06-30 00:00:00'), '2023-06-30');
const [wire, bar, coil, rail, strip2] = reply.rows;
assert.equal(wire.directSee, 1.5);
assert.equal(wire.problem, undefined);
assert.equal(coil.indirectSee, undefined, '간접 칸이 비어 있으면 값 없음(0으로 지어내지 않는다)');
assert.match(rail.problem, /SEE\(직접\) 계산값이 비어/, '계산값이 비어 있으면 적용 불가');
assert.match(strip2.problem, /단위가 tCO2e\/t가 아닙니다/, '다른 단위는 옮기지 않는다');
assert.match(lib.parseSupplierReply({ filename: 'x.xlsx', summaryProducts: undefined }).fileProblem, /Summary_Products 시트가 없습니다/);
assert.match(lib.parseSupplierReply({ filename: 'x.xlsx', summaryProducts: [row(1, { A: 'hello' })] }).fileProblem, /머리글을 찾지 못했습니다/);

// ── 공식 예시 파일(있을 때) — 실제 엑셀을 열어 읽는다 ──────────────────────
const official = 'CBAM_documents/2 CBAM SEE V2.1_Example Steel 1 Blast furnace_final.xlsx';
if (existsSync(official)) {
  const bytes = readFileSync(official);
  const file = { name: basename(official), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  const parsed = lib.parseSupplierReply({
    filename: file.name,
    summaryProducts: await lib.readWorkbookSheetRows(file, 'Summary_Products'),
    instData: await lib.readWorkbookSheetRows(file, 'A_InstData'),
  });
  assert.equal(parsed.fileProblem, undefined);
  assert.deepEqual(plain(parsed.rows.map((item) => item.cnCode)), ['72081000', '72122000', '72139120', '73021028'], '공식 예시의 제품 4개(예시 행 제외)');
  assert.ok(Math.abs(parsed.rows[0].directSee - 1.5389760645578654) < 1e-12 && Math.abs(parsed.rows[0].indirectSee - 0.20355398249999998) < 1e-12, '엑셀에 저장된 계산값을 그대로 읽는다');
  assert.equal(parsed.installationName, 'Example Blast Steelworks');
  assert.equal(parsed.country, 'China');
  assert.equal(parsed.periodStart, '2023-01-01');
  assert.equal(parsed.periodEnd, '2023-12-31');
  assert.ok(parsed.rows.every((item) => (item.unit === 'tCO2e/t' || item.unit === '') && !item.problem), '단위 칸은 첫 행에만 적힌 파일도 있다 — 비어 있는 것은 문제로 보지 않는다');
} else {
  console.log('(공식 예시 엑셀이 이 컴퓨터에 없어 실제 파일 읽기는 건너뜀 — 합성 회신만 검사)');
}

// ── 대조 ─────────────────────────────────────────────────────────────
const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const precursor = (id, cn, extra = {}) => ({
  id, process_id: 'P', period_id: 'per', name: `원료 ${id}`, precursor_cn_code: cn, aggregated_goods_category: 'Iron or steel products', production_route: '', supplier_country: 'China', supplier_installation: 'Example Steelworks', data_mode: 'DEFAULT',
  verification_status: 'UNVERIFIED', default_value_year: '2026', purchased_mass_t: 1000, consumed_mass_t: 1000, consumed_for_non_cbam_mass_t: 0, direct_see_tco2e_per_t: 2, indirect_see_tco2e_per_t: 0,
  source: 'EU default', default_value_justification: '미회신', ...stamp, ...extra,
});
const ours = new Map([['per', { start: '2025-01-01', end: '2025-12-31' }], ['per23', { start: '2023-01-01', end: '2023-12-31' }]]);
const match = (precursors, periods = ours) => lib.matchReplyToPrecursors({ reply, precursors, periods });

const one = match([precursor('coil', '72081000', { period_id: 'per23' })]).proposals[0];
assert.equal(one.status, 'READY');
assert.equal(one.defaultSelected, true, '기간이 겹치고 후보가 하나이면 기본으로 체크');
const mismatch = match([precursor('coil', '72081000')]).proposals[0];
assert.equal(mismatch.status, 'READY');
assert.equal(mismatch.defaultSelected, false, '보고기간이 안 겹치면 기본 선택을 끈다');
assert.match(mismatch.warnings.join(' '), /보고기간.*겹치지 않습니다/);
const choose = match([precursor('wire', '72139120', { period_id: 'per23' })]).proposals[0];
assert.equal(choose.status, 'CHOOSE', '같은 CN이 둘이면 앱이 고르지 않는다');
assert.equal(choose.candidates.length, 2);
assert.equal(choose.defaultSelected, false);
const partial = match([precursor('p', '721391', { period_id: 'per23' })]).proposals[0];
assert.equal(partial.candidates[0].cnMatch, 'PARTIAL');
assert.match(partial.warnings.join(' '), /앞자리만 일치/);
assert.equal(match([precursor('x', '99999999')]).proposals[0].status, 'NO_MATCH');
assert.equal(match([precursor('x', '')]).proposals[0].status, 'NO_CN');
const withProblem = match([precursor('rail', '73021028', { period_id: 'per23' })]).proposals[0];
assert.equal(withProblem.defaultSelected, false, '값이 비어 있는 행은 기본 선택이 아니다');
assert.equal(match([precursor('coil', '72081000', { period_id: 'per23' })]).unmatchedRows.length, 4, '안 쓰인 회신 행을 알려 준다');

// ── run19 회귀에서 나온 결함: 같은 CN의 국산·수입 원료가 한 회신에 함께 「적용」으로 잡혔다 ──
const domestic = match([precursor('dom', '72081000', { period_id: 'per23', supplier_country: 'South Korea', supplier_installation: '(주)국내선재' })]).proposals[0];
assert.equal(domestic.status, 'READY', '후보 행은 있다');
assert.equal(domestic.defaultSelected, false, '회신 설비 국가(China)와 공급국가(South Korea)가 다르면 자동 선택하지 않는다');
assert.match(domestic.warnings.join(' '), /회신 설비의 국가\(China\)가 .* 공급국가\(South Korea\)와 다릅니다/);
const sameCountryAlias = match([precursor('tw', '72081000', { period_id: 'per23', supplier_country: 'Taiwan' })], ours).proposals[0];
const aliasReply = { ...reply, country: 'Chinese Taipei' };
const aliasMatch = lib.matchReplyToPrecursors({ reply: aliasReply, precursors: [precursor('tw', '72081000', { period_id: 'per23', supplier_country: 'Taiwan' })], periods: ours }).proposals[0];
assert.equal(aliasMatch.defaultSelected, true, '같은 나라의 다른 표기(Chinese Taipei = Taiwan)는 다른 국가로 보지 않는다');
assert.ok(sameCountryAlias.warnings.some((warning) => /공급국가\(Taiwan\)/.test(warning)), '반대로 China 회신에 Taiwan 원료는 걸린다');
const measured = match([precursor('m', '72081000', { period_id: 'per23', data_mode: 'ACTUAL', verification_status: 'SUPPLIER_CONFIRMED' })]).proposals[0];
assert.equal(measured.defaultSelected, false, '이미 실측인 값을 바꾸는 것은 사람이 켠다');
assert.match(measured.warnings.join(' '), /이미 공급사 실측값이 들어 있습니다/);

// ── 적용 값 ──────────────────────────────────────────────────────────
const upd = lib.buildReplyUpdate(wire, reply);
assert.equal(upd.data_mode, 'ACTUAL');
assert.equal(upd.verification_status, 'SUPPLIER_CONFIRMED', '공급사 확인까지만 — 검증됨으로 올리지 않는다');
assert.equal(upd.direct_see_tco2e_per_t, 1.5);
assert.equal(upd.indirect_see_tco2e_per_t, 0.2);
assert.match(upd.source, /공급사 회신: reply\.xlsx \(Example Steelworks\) · Summary_Products 10행/);
assert.equal(upd.supplier_reporting_period, '2023-01-01 ~ 2023-12-31');
assert.equal(upd.default_value_justification, '', '기본값 근거 문구는 비운다');
assert.equal(upd.indirect_electricity_mwh_per_t, 0.4);
assert.ok(Math.abs(upd.indirect_electricity_factor_tco2e_per_mwh * 0.4 - 0.2) < 1e-12, '전력량×계수 = 간접 SEE');
assert.equal(lib.buildReplyUpdate(bar, reply).data_mode, 'SEMI_ACTUAL', '기본값이 섞였으면 일부 실측');
assert.equal(lib.buildReplyUpdate(coil, reply).indirect_see_tco2e_per_t, 0, '간접 칸이 비었으면 0으로 저장(간접 N/A)');
assert.throws(() => lib.buildReplyUpdate(rail, reply), /적용할 수 없습니다/);
assert.throws(() => lib.buildReplyUpdate(strip2, reply), /단위가/);

// ── 엔진 결과가 회신 값으로 바뀐다(원료 기본값 2.0 → 회신 1.5) ──────────────
const engine = compile(
  [strip('src/lib/source-stream-calculation.ts', false), readFileSync('src/lib/cn-master.generated.ts', 'utf8').replace(/^export /gm, ''), strip('src/lib/cbam-product-rules.ts'), strip('src/lib/reporting-scope.ts', false), strip('src/lib/allocation-rules.ts'), strip('src/lib/measurable-heat.ts'), strip('src/lib/precursor-verification.ts'), strip('src/lib/calculation-engine.ts')],
  ['calculateLocalResults']
);
const period = { id: 'per', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT', ...stamp };
const product = { id: 'screw', name: '나사', cn_code: '73181552', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'CBAM_GOOD', ...stamp };
const proc = { id: 'P', product_id: 'screw', period_id: 'per', name: '가공', production_route: '가공', output_mass_t: 1000, market_output_mass_t: 1000, internal_consumption_mass_t: 0, direct_attributable_emissions_tco2e: 100, direct_emissions_input_mode: 'MANUAL_TOTAL', electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0, ...stamp };
const seeOf = (precursors) => engine.calculateLocalResults({ products: [product], periods: [period], processes: [proc], precursors, productOutputLines: [] })[0].see_cbam_basis;
const before = precursor('coil', '72081000');
assert.ok(Math.abs(seeOf([before]) - 2.1) < 1e-9);
assert.ok(Math.abs(seeOf([{ ...before, ...lib.buildReplyUpdate(coil, reply) }]) - (0.1 + 1.4)) < 1e-9, '회신 값(1.4)이 기준 SEE에 반영된다');

// ── 요청서 ───────────────────────────────────────────────────────────
const mixed = [
  precursor('a', '72139120', { supplier_installation: 'Alpha Steel', purchased_mass_t: 500 }),
  precursor('b', '72081000', { supplier_installation: 'alpha steel', purchased_mass_t: 300 }),
  precursor('c', '72122000', { supplier_installation: '', supplier_country: 'Taiwan' }),
];
const groups = lib.groupPrecursorsBySupplier(mixed, (id) => (id === 'per' ? '2025' : ''));
assert.equal(groups.length, 2, '이름이 같은 공급사(대소문자 무시)는 한 장');
assert.equal(groups[0].items.length, 2);
const generatedAt = new Date('2026-10-05T00:00:00Z');
assert.equal(lib.supplierRequestFilename(groups[1], generatedAt), 'CBAM_data_request_Taiwan_2026-10-05.docx', '이름이 없으면 국가로 구분');
const docx = lib.buildSupplierRequestDocx({ group: groups[0], requester: { companyName: '대일기업', contactName: '홍길동', email: 'cbam@example.com' }, generatedAt });
const documentXml = fflate.strFromU8(fflate.unzipSync(docx)['word/document.xml']);
for (const text of ['Alpha Steel', '72139120', '72081000', '500', '300', '2025', '대일기업', 'cbam@example.com', 'Communication template for installations', 'Summary_Products', 'Share of emissions by default value']) {
  assert.ok(documentXml.includes(text), `요청서에 「${text}」`);
}
assert.ok(!/SEE \(direct\)|배출량 합계|생산량/.test(documentXml.replace(/SEE \(direct\)/, '')), '우리 회사의 생산·배출 자료는 요청서에 넣지 않는다');

// ── 배선 ─────────────────────────────────────────────────────────────
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
assert.match(panels, /<SupplierLoop precursors=\{data\.precursors\} periods=\{data\.periods\} installations=\{data\.installations\} onApplied=\{onSaved\} \/>/, '6단계에 붙는다');
const component = readFileSync('src/components/guided/SupplierLoop.tsx', 'utf8');
assert.match(component, /buildReplyUpdate\(row, reply\)/, '적용은 파일 값 그대로(buildReplyUpdate)');
assert.match(component, /selectedProposals/, '사람이 고른 것만 적용한다');
assert.match(component, /recipientNames\[original\.key\] \?\? original\.supplierName/, '요청서 수신 이름은 보내기 전에 고칠 수 있다(저장된 값에 내부 메모가 섞여 있을 수 있다)');
assert.match(component, /요청서 수신\(공급사 이름\) — 보내기 전에 확인하세요/);
assert.ok(!/VERIFIED'/.test(component.replace(/UNVERIFIED/g, '')), '화면이 검증됨으로 올리지 않는다');

console.log('Supplier loop verified (회신 읽기 · 대조 · 공급사 확인까지만 · 엔진 반영 · 요청서에 우리 자료 없음).');
