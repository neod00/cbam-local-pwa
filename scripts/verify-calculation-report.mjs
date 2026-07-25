// 산정보고서 기반 유틸 검증 (P1): docx-builder(OOXML) + report-format(반올림·표시값 정합).
// 설계: docs/calculation-report-design.md §5·§6
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const fflate = require('fflate');

function loadModule(path, exportsList, extraPrelude = '') {
  const source = readFileSync(path, 'utf8')
    .replace("import { strToU8, zipSync } from 'fflate';", 'const { strToU8, zipSync } = fflate;')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  const compiled = ts.transpileModule(
    `${extraPrelude}${source}\nglobalThis.__mod = { ${exportsList.join(', ')} };`,
    { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const context = { fflate, console, Intl, Math, Number, String, Array, Object };
  vm.runInNewContext(compiled, context);
  return context.__mod;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}
function assertTrue(value, label) {
  if (!value) {
    throw new Error(`${label}: expected true`);
  }
}

// ---------------- report-format ----------------
const fmt = loadModule('src/lib/report-format.ts', [
  'roundForReport', 'formatForReport', 'formatIntegerForReport', 'formatPercentForReport', 'checkDisplaySum',
]);

// 음수 사사오입 — Math.round는 -0.795 → -0.79로 절댓값이 줄어든다. 절댓값 기준이어야 한다.
assertEqual(fmt.roundForReport(-0.795, 2), -0.8, 'roundForReport 음수 half-away-from-zero');
assertEqual(fmt.roundForReport(0.795, 2), 0.8, 'roundForReport 양수 half-up');
// 부동소수점 이진오차 — 1.025×1.95 = 1.9987499999999998. 순진하게 자르면 1.9987(샘플 v0.1 결함).
assertEqual(fmt.roundForReport(1.025 * 1.95, 4), 1.9988, 'roundForReport 이진오차 제거 (1.9988)');
assertEqual(fmt.roundForReport(240.009264 / 8000, 4), 0.03, 'roundForReport 자체 직접 SEE');
assertEqual(fmt.roundForReport(0.39904375, 4), 0.399, 'roundForReport 간접 소계');
assertEqual(fmt.formatForReport(1.025 * 1.95, 4), '1.9988', 'formatForReport 4자리');
assertEqual(fmt.formatForReport(0.55 * 0.545, 5), '0.29975', 'formatForReport 원천 자릿수 5자리');
assertEqual(fmt.formatForReport(undefined), '-', 'formatForReport undefined');
assertEqual(fmt.formatIntegerForReport(8000), '8,000', 'formatIntegerForReport');
assertEqual(fmt.formatPercentForReport(-0.163205), '-16.32%', 'formatPercentForReport 음수');
assertEqual(fmt.formatPercentForReport(0.1922), '+19.22%', 'formatPercentForReport 양수 부호');

// 게이트 G1 — 데이터 정합(isMathValid)과 표기 정합(isDisplayValid)을 구분해야 한다.
const okSum = fmt.checkDisplaySum({
  label: 'SEE 직접 소계',
  parts: [240.009264 / 8000, 1.025 * 1.95],
  total: 240.009264 / 8000 + 1.025 * 1.95,
});
assertTrue(okSum.isMathValid, 'checkDisplaySum 데이터 정합');
assertTrue(okSum.isDisplayValid, 'checkDisplaySum 표기 정합');
assertEqual(okSum.displayedPartsSum, 2.0288, 'checkDisplaySum 구성합');
assertEqual(okSum.displayedTotal, 2.0288, 'checkDisplaySum 소계');

// 산정 오류(원천값 불일치)는 반드시 잡아야 한다 — 게이트가 무력하면 안 된다.
const badSum = fmt.checkDisplaySum({ label: '인위적 불일치', parts: [0.03, 1.0], total: 1.5 });
assertEqual(String(badSum.isMathValid), 'false', 'checkDisplaySum 산정 오류 검출');

// 반올림 누적 — 데이터는 맞고 표기만 어긋나는 경우. 이걸 산정 오류로 오판하면 안 된다.
// 0.20655 → 0.2066, 0.01755 → 0.0176 (둘 다 올림) → 표시 합 0.2242 vs 소계 표시 0.2241
const roundingSum = fmt.checkDisplaySum({ label: '반올림 누적', parts: [0.20655, 0.01755], total: 0.20655 + 0.01755 });
assertTrue(roundingSum.isMathValid, 'checkDisplaySum 반올림 누적은 데이터 정합');
assertEqual(String(roundingSum.isDisplayValid), 'false', 'checkDisplaySum 반올림 누적은 표기 불일치');
assertEqual(roundingSum.displayedPartsSum, 0.2242, 'checkDisplaySum 반올림 구성합');
assertEqual(roundingSum.displayedTotal, 0.2241, 'checkDisplaySum 반올림 소계');

// ---------------- docx-builder ----------------
const docx = loadModule('src/lib/docx-builder.ts', ['paragraph', 'cell', 'table', 'createDocx', 'xmlEscape']);

// 기존 호출부 호환 — 옵션 없이 부르면 종전 산출물과 동일해야 한다(delivery-package 회귀 방지)
assertEqual(
  docx.cell('x'),
  '<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">x</w:t></w:r></w:p></w:tc>',
  'cell() 기본 출력 하위호환'
);
assertEqual(
  docx.paragraph('x'),
  '<w:p><w:r><w:t xml:space="preserve">x</w:t></w:r></w:p>',
  'paragraph() 기본 출력 하위호환'
);
assertTrue(!docx.table(['h'], [['v']]).includes('w:shd'), 'table() 기본은 음영 없음 (하위호환)');
assertTrue(!docx.table(['h'], [['v']]).includes('tblHeader'), 'table() 기본은 헤더반복 없음 (하위호환)');
assertTrue(docx.table(['h'], [['v']]).includes('<w:tblW w:w="0" w:type="auto"/>'), 'table() 기본 auto 폭');

// 신규 — 표 음영은 반드시 clear (solid는 Word에서 검게 렌더된다)
const shaded = docx.table(['h'], [['v']], { headerShade: 'F5F5F7', headerBold: true, repeatHeader: true });
assertTrue(shaded.includes('<w:shd w:val="clear" w:color="auto" w:fill="F5F5F7"/>'), 'table() 헤더 음영 clear');
assertTrue(!shaded.includes('w:val="solid"'), 'table() solid 음영 미사용');
assertTrue(shaded.includes('<w:tblHeader/>'), 'table() 헤더행 반복');
assertTrue(shaded.includes('<w:b/>'), 'table() 헤더 굵게');

// 신규 — 가변 셀 너비 + tblGrid, 폭 합계가 tblW와 일치
const sized = docx.table(['a', 'b'], [['1', '2']], { widths: [2700, 6300] });
assertTrue(sized.includes('<w:tblGrid><w:gridCol w:w="2700"/><w:gridCol w:w="6300"/></w:tblGrid>'), 'table() tblGrid');
assertTrue(sized.includes('<w:tblW w:w="9000" w:type="dxa"/>'), 'table() 폭 합계 = tblW');
assertTrue(sized.includes('<w:tcW w:w="2700" w:type="dxa"/>'), 'table() 셀 개별 폭');

// 신규 — 글자색/크기
assertTrue(docx.paragraph('x', undefined, { color: '1D1D1F', size: 21, bold: true })
  .includes('<w:rPr><w:b/><w:color w:val="1D1D1F"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr>'), 'paragraph() rPr');

// XML 이스케이프 — 보고서 문안에 &, < 가 들어가도 깨지면 안 된다
assertTrue(docx.paragraph('a & b < c').includes('a &amp; b &lt; c'), 'paragraph() XML 이스케이프');

// 신규 — 머리글/바닥글 + 페이지번호가 실제 패키지에 들어가는지
const bytes = docx.createDocx('T', docx.paragraph('body'), new Date('2026-01-01T00:00:00.000Z'), {
  header: { text: '검토용 샘플', align: 'right', color: '6E6E73', size: 14 },
  footer: { text: 'CBAM-RPT-2026-001', pageNumber: true, align: 'center', size: 14 },
});
const zip = fflate.unzipSync(bytes);
const read = (p) => fflate.strFromU8(zip[p]);

assertTrue(Boolean(zip['word/header1.xml']), 'header1.xml 존재');
assertTrue(Boolean(zip['word/footer1.xml']), 'footer1.xml 존재');
assertTrue(read('word/header1.xml').includes('검토용 샘플'), 'header 텍스트');
assertTrue(read('word/footer1.xml').includes('<w:fldSimple w:instr=" PAGE ">'), 'footer PAGE 필드');
assertTrue(read('word/footer1.xml').includes('<w:fldSimple w:instr=" NUMPAGES ">'), 'footer NUMPAGES 필드');
// r:id 참조를 쓰므로 relationships 네임스페이스 선언이 없으면 Word가 파일을 못 연다
assertTrue(read('word/document.xml').includes('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'), 'document.xml xmlns:r 선언');
assertTrue(read('word/document.xml').includes('<w:headerReference w:type="default" r:id="rId2"/>'), 'sectPr headerReference');
assertTrue(read('word/document.xml').includes('<w:footerReference w:type="default" r:id="rId3"/>'), 'sectPr footerReference');
assertTrue(read('word/_rels/document.xml.rels').includes('Target="header1.xml"'), 'rels header');
assertTrue(read('word/_rels/document.xml.rels').includes('Target="footer1.xml"'), 'rels footer');
assertTrue(read('[Content_Types].xml').includes('/word/header1.xml'), 'content-types header override');
assertTrue(read('[Content_Types].xml').includes('/word/footer1.xml'), 'content-types footer override');

// 머리글/바닥글이 없으면 관련 파트·참조가 전부 없어야 한다(기존 산출물 회귀 방지)
const plain = fflate.unzipSync(docx.createDocx('T', docx.paragraph('b'), new Date('2026-01-01T00:00:00.000Z')));
assertTrue(!plain['word/header1.xml'], '옵션 없으면 header1.xml 없음');
assertTrue(!plain['word/footer1.xml'], '옵션 없으면 footer1.xml 없음');
assertTrue(!fflate.strFromU8(plain['word/document.xml']).includes('headerReference'), '옵션 없으면 headerReference 없음');
assertTrue(!fflate.strFromU8(plain['[Content_Types].xml']).includes('header1.xml'), '옵션 없으면 header override 없음');

// ---------------- calculation-report (P2) ----------------
// 게이트가 실제로 차단/라벨하는지가 핵심. 통과 케이스만 보면 게이트가 죽어 있어도 모른다.
const prelude = ['const { strToU8, zipSync, strFromU8, unzipSync } = fflate;'].concat([
    'src/lib/report-format.ts',
    'src/lib/docx-builder.ts',
    // cbam-product-rules 가 import 하므로 반드시 그 앞에 온다.
    'src/lib/cn-master.generated.ts',
    'src/lib/cbam-product-rules.ts',
    'src/lib/reporting-scope.ts',
    'src/lib/reference-workbooks.ts',
    'src/lib/source-stream-calculation.ts',
    'src/lib/calculation-engine.ts',
]
    .map((path) => readFileSync(path, 'utf8')
        .replace(/^import .*;\r?\n/gm, '')
        .replace(/^export /gm, '')))
    .join('\n');

const reportModule = (() => {
    const source = readFileSync('src/lib/calculation-report.ts', 'utf8')
        .replace(/^import .*;\r?\n/gm, '')
        .replace(/^import type[\s\S]*?;\r?\n/gm, '')
        .replace(/^export /gm, '');
    const compiled = ts.transpileModule(
        `${prelude}\n${source}\nglobalThis.__report = { createCalculationReport, createCalculationReportFilename, calculateLocalResults, parseDefaultValueWorkbook, hasAmbiguousDefaultValueRoutes };`,
        { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }
    ).outputText;
    const context = { fflate, console, Intl, Math, Number, String, Array, Object, Blob, Date, RegExp, Set, Map, Error, Uint8Array, Promise };
    vm.runInNewContext(compiled, context);
    return context.__report;
})();

const at = (o) => ({ id: o.id, created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', ...o });
const baseProduct = at({ id: 'p1', name: '용접강관', hs_code: '7306', cn_code: '73063077', hs_group: '73', product_type_enum: 'HS73_PIPE_TUBE', unit: 'tonne', reporting_scope: 'CBAM_GOOD' });
const baseProcess = at({ id: 'proc1', product_id: 'p1', name: 'ERW 용접', production_route: 'All production routes', output_mass_t: 8000, market_output_mass_t: 7600, internal_consumption_mass_t: 400, direct_attributable_emissions_tco2e: 240.009264, electricity_mwh: 1600, electricity_ef_tco2e_per_mwh: 0.459 });
const baseStream = at({ id: 's1', process_id: 'proc1', name: '천연가스', stream_type: 'FUEL', method: 'Combustion', activity_data: 89.13, activity_unit: 't', ncv_gj_per_unit: 48, emission_factor_tco2e_per_unit: 56.1, emission_factor_basis: 'PER_TJ', oxidation_factor: 1, conversion_factor: 1, fossil_fraction: 1, biomass_fraction: 0, source: '요금청구서' });
const basePrecursor = at({ id: 'pr1', product_id: 'p1', process_id: 'proc1', name: 'HRC', precursor_cn_code: '72083900', aggregated_goods_category: 'Iron or steel products', production_route: 'External precursor', supplier_country: 'KR', supplier_installation: 'POSCO', supplier_reporting_period: '2025', data_mode: 'ACTUAL', verification_status: 'SUPPLIER_CONFIRMED', default_value_year: '2026', purchased_mass_t: 8400, consumed_mass_t: 8200, consumed_for_non_cbam_mass_t: 0, direct_see_tco2e_per_t: 1.95, indirect_see_tco2e_per_t: 0.29975, source: '공급사', default_value_justification: '' });
const baseResult = {
    id: 'r1', process_id: 'proc1', process_name: 'ERW 용접', product_id: 'p1', product_name: '용접강관',
    reporting_scope: 'CBAM_GOOD', is_cbam_reportable: true, cn_code: '73063077', production_route: 'All production routes',
    allocation_basis: 'MASS', allocation_share: 1, output_mass_t: 8000,
    direct_emissions_tco2e: 240.009264, indirect_emissions_relevance: 'NOT_RELEVANT', indirect_emissions_rule: 'GOODS_INDIRECT_NOT_RELEVANT',
    indirect_emissions_excluded_tco2e: 734.4, indirect_emissions_gross_tco2e: 734.4,
    source_stream_count: 1, source_stream_emissions_tco2e: 240.009264, source_stream_energy_tj: 4.27824, source_stream_delta_tco2e: 0,
    direct_see: 240.009264 / 8000, own_indirect_see: 734.4 / 8000, indirect_see: 0, indirect_see_excluded: 734.4 / 8000,
    precursor_see: 1.025 * (1.95 + 0.29975), precursor_direct_see: 1.025 * 1.95, precursor_indirect_see: 1.025 * 0.29975,
    see_direct_incl_precursor: 240.009264 / 8000 + 1.025 * 1.95,
    see_indirect_incl_precursor: 734.4 / 8000 + 1.025 * 0.29975,
    see_cbam_basis: 240.009264 / 8000 + 1.025 * 1.95,
    see_informational_total: 240.009264 / 8000 + 1.025 * 1.95 + 734.4 / 8000 + 1.025 * 0.29975,
    total_see: 0, warnings: [], warningDetails: [],
};
const baseInput = () => ({
    installations: [at({ id: 'i1', name: 'Hanbit Steel', local_name: '한빛스틸', country: 'KR', city: 'Incheon', economic_activity: 'Tubes', authorized_representative_name: 'Park', email: 'a@b.c' })],
    periods: [at({ id: 'per1', name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'CALCULATED' })],
    products: [baseProduct], processes: [baseProcess], productOutputLines: [],
    sourceStreams: [baseStream], precursors: [basePrecursor], results: [baseResult],
    generatedAt: new Date('2027-01-15T00:00:00.000Z'),
});

// 정상 생성
const ok = reportModule.createCalculationReport(baseInput());
assertTrue(ok.blob instanceof Blob, 'createCalculationReport blob 반환');
assertEqual(ok.filename, 'CBAM_Calculation_Report_20270115.docx', '파일명');
assertEqual(String(ok.isInterim), 'false', '기간 종료 후 발행 → interim 아님');
assertTrue(!ok.issues.some((issue) => issue.severity === 'block'), '정상 케이스에 차단 이슈 없음');

// 게이트 G2 — 발행일이 기간 종료 전이면 interim 라벨 (차단은 아님)
const interim = reportModule.createCalculationReport({ ...baseInput(), generatedAt: new Date('2026-07-16T00:00:00.000Z') });
assertEqual(String(interim.isInterim), 'true', 'G2 기중 발행 → interim');
assertTrue(interim.issues.some((issue) => issue.gate === 'G2' && issue.severity === 'label'), 'G2 라벨 이슈');

// 게이트 G3 — 내부 소비가 있는데 CBAM 공정 1개 → 경고
assertTrue(baseInput().processes[0].internal_consumption_mass_t > 0, 'G3 전제: 내부소비 존재');
assertTrue(ok.issues.some((issue) => issue.gate === 'G3' && issue.severity === 'warn'), 'G3 경계 경고');

// 게이트 G1 — 원천값이 어긋나면(산정 오류) 반드시 차단
let g1Blocked = false;
try {
    reportModule.createCalculationReport({
        ...baseInput(),
        results: [{ ...baseResult, see_direct_incl_precursor: baseResult.see_direct_incl_precursor + 0.01 }],
    });
} catch (error) {
    g1Blocked = /G1/.test(String(error.message));
}
assertTrue(g1Blocked, 'G1 원천값 불일치(산정 오류) → 발행 차단');

// G1 — 반올림 누적으로 표시값만 어긋나는 건 정상 데이터에서도 발생한다. 차단하면 안 되고 각주로 처리.
// 조강 시나리오 실측: 자체간접 0.20655 → 0.2066, 전구물질간접 0.01755 → 0.0176 (둘 다 올림)
//   → 표시 합 0.2242 vs 소계 표시 0.2241
const ownInd = 0.20655;
const precInd = 0.01755;
const roundingCase = reportModule.createCalculationReport({
    ...baseInput(),
    results: [{
        ...baseResult,
        own_indirect_see: ownInd,
        precursor_indirect_see: precInd,
        see_indirect_incl_precursor: ownInd + precInd,
        see_informational_total: baseResult.see_direct_incl_precursor + ownInd + precInd,
    }],
});
const roundingXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await roundingCase.blob.arrayBuffer()))['word/document.xml']);
const g1Warns = roundingCase.issues.filter((issue) => issue.gate === 'G1' && issue.severity === 'warn');

assertTrue(g1Warns.length > 0, 'G1 반올림 누적 → 차단이 아니라 경고');
assertTrue(!roundingCase.issues.some((issue) => issue.gate === 'G1' && issue.severity === 'block'), 'G1 반올림 누적은 차단하지 않음');
assertTrue(roundingXml.includes('마지막 자리에서 다를 수 있다'), 'G1 반올림 시 각주 자동 삽입');
assertTrue(/산정값 자체는 정확하다/.test(roundingXml), '반올림 각주가 산정값 정확성을 명시');

// 대상 결과가 없으면 생성 불가
let noResultBlocked = false;
try {
    reportModule.createCalculationReport({ ...baseInput(), results: [] });
} catch (error) {
    noResultBlocked = /산정 결과가 없어/.test(String(error.message));
}
assertTrue(noResultBlocked, '신고 대상 결과 없음 → 생성 차단');

// 3.1장 조건 분기 — 고정 문안이면 안 된다.
// 철강 전구물질만 있을 때와, 비직접전용 전구물질이 섞였을 때 문안이 달라져야 한다.
const steelOnlyXml = fflate.strFromU8(
    fflate.unzipSync(new Uint8Array(await ok.blob.arrayBuffer()))['word/document.xml']
);
// 정합하는 표에는 반올림 각주가 붙지 않아야 한다(각주 남발 방지)
assertTrue(!steelOnlyXml.includes('마지막 자리에서 다를 수 있다'), '정합하는 표에는 반올림 각주 없음');
assertTrue(steelOnlyXml.includes('소비 전구물질 역시 모두 동일하게 직접배출만 고려되는 품목'), '3.1 철강 전구물질 문안');
assertTrue(!steelOnlyXml.includes('최종재로 전가될 수 있다'), '3.1 철강만일 땐 전가 경고 없음');

const mixed = reportModule.createCalculationReport({
    ...baseInput(),
    precursors: [basePrecursor, { ...basePrecursor, id: 'pr2', name: '알루미늄 전구물질', precursor_cn_code: '76011000' }],
});
const mixedXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await mixed.blob.arrayBuffer()))['word/document.xml']);
assertTrue(mixedXml.includes('최종재로 전가될 수 있다'), '3.1 비직접전용 전구물질 → 전가 경고로 문안 분기');
assertTrue(mixedXml.includes('알루미늄 전구물질'), '3.1 해당 전구물질 명시');

// 산출물이 실제 docx 구조인지
const okZip = fflate.unzipSync(new Uint8Array(await ok.blob.arrayBuffer()));
assertTrue(Boolean(okZip['word/document.xml']), '산출물 document.xml');
assertTrue(Boolean(okZip['word/header1.xml']), '산출물 머리글');
assertTrue(Boolean(okZip['word/footer1.xml']), '산출물 바닥글');
assertTrue(steelOnlyXml.includes('CBAM 내재배출량 산정보고서'), '표지 제목');
assertTrue(steelOnlyXml.includes('10. 산정 결과'), '10장 존재');
assertTrue(steelOnlyXml.includes('1.9988'), '전구물질 직접 SEE 반올림 1.9988');
assertTrue(steelOnlyXml.includes('2.0288'), 'CBAM 기준 SEE 2.0288');

// ---------------- P3: DV 대조 (9장) ----------------
// 실제 공식 DV와 같은 형태의 기준자료를 넣어 대조·민감도가 자동 생성되는지 확인한다.
// (수치는 EU 공식 워크북의 South Korea × CN 7208 행과 동일한 구조)
const dvReference = {
    summary: {
        kind: 'DEFAULT_VALUES',
        filename: 'DVs as adopted_v20260204.xlsx',
        imported_at: '2026-03-01T00:00:00.000Z',
        sheet_names: ['DV'],
        row_count: 131,
        cn_code_count: 120,
        sample_rows: [],
    },
    rows: [{
        country: 'South Korea',
        cn_code: '7208',
        description: 'Flat-rolled products of iron or non-alloy steel',
        direct_default: 2.11847619,
        indirect_default: null,
        total_default: 2.11847619,
        markup_2026: 2.330323809,
        markup_2027: 2.542171428,
        markup_2028_onwards: 2.754019047,
        production_route: '(C)',
    }],
};

// 게이트 G6 — 기준자료 미연결이면 경고하고, 9장은 「기재 필요」로 출력해야 한다(장을 통째로 빼면 안 됨)
assertTrue(ok.issues.some((issue) => issue.gate === 'G6' && issue.severity === 'warn'), 'G6 기준자료 미연결 경고');
assertTrue(steelOnlyXml.includes('기본값 기준자료가 연결되지 않아'), 'G6 미연결 시 9장 안내 문구');
assertTrue(steelOnlyXml.includes('9. 공식 기본값(DV) 대조'), 'G6 미연결이어도 9장 자체는 존재');

// 기준자료를 연결하면 대조표·민감도가 자동 생성된다
const withDv = reportModule.createCalculationReport({
    ...baseInput(),
    precursors: [{ ...basePrecursor, supplier_country: 'South Korea' }],
    defaultValues: dvReference,
});
const dvXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await withDv.blob.arrayBuffer()))['word/document.xml']);

assertTrue(!withDv.issues.some((issue) => issue.gate === 'G6'), '기준자료 연결 시 G6 경고 없음');
assertTrue(dvXml.includes('9.1 DV 조회 메타데이터'), '9.1 조회 메타데이터');
assertTrue(dvXml.includes('DVs as adopted_v20260204.xlsx'), '워크북 판본 기재 (v0.2 P1 지적)');
assertTrue(dvXml.includes('2.11847619'), 'DV raw 원천 자릿수');
assertTrue(dvXml.includes('2.330323809'), 'DV 2026 적용값 원천 자릿수 (반올림 금지)');
assertTrue(dvXml.includes('N/A (미공표)'), '간접 DV 미공표 명시');
// heading 상속(CN 72083900 실측 → CN 7208 DV) 고지
assertTrue(dvXml.includes('상위 heading'), 'heading 상속 조회 고지 (v0.2 P1 지적)');
// 생산경로 대응 미확인 고지 — DV 행 "(C)" vs 실측 "External precursor"
assertTrue(dvXml.includes('(C)'), 'DV 행 생산경로 표기 노출');
assertTrue(dvXml.includes('개연성 참고로만'), '경로 대응 미확인 시 개연성 참고 한정 (v0.2 P1 지적)');

// 절대차 — 실측 1.95 − DV raw 2.11847619 = -0.16847619
assertTrue(dvXml.includes('-0.16847619'), '절대차(raw) 재계산 일치');
// 실측 1.95 − DV 2026 2.330323809 = -0.380323809
assertTrue(dvXml.includes('-0.380323809'), '절대차(2026) 재계산 일치');
assertTrue(dvXml.includes('-16.32%'), '상대차 -16.32%');

// 9.2 민감도 — 전구물질을 DV로 대체하면 CBAM 기준 SEE가 2.0288 → 2.4186 (+19.22%)
assertTrue(dvXml.includes('9.2 민감도'), '9.2 민감도 절');
assertTrue(dvXml.includes('2.4186'), '민감도 DV 대체 시 기준 SEE');
assertTrue(dvXml.includes('+19.22%'), '민감도 상대 증가율');

// 조합을 못 찾으면 조용히 넘기지 말고 G6 경고 + 「확인 필요(자료)」
const dvMiss = reportModule.createCalculationReport({
    ...baseInput(),
    precursors: [{ ...basePrecursor, supplier_country: 'Japan' }],
    defaultValues: dvReference,
});
assertTrue(dvMiss.issues.some((issue) => issue.gate === 'G6' && /찾지 못했습니다/.test(issue.message)), 'DV 조합 미발견 → G6 경고');

// ---------------- P4: 사용자 입력 (11·12·15·16장) + 게이트 G5 ----------------
// 미입력이 조용히 넘어가면 "빈칸인 채로 검증인에게 제출"이 된다. 반드시 경고 + 「기재 필요」 표기.
const g5Gates = ok.issues.filter((issue) => issue.gate === 'G5');
assertTrue(g5Gates.length > 0, 'G5 사용자 입력 미기재 → 경고');
assertTrue(g5Gates.some((issue) => /제11장/.test(issue.message)), 'G5 기지불 탄소가격 미입력 경고');
assertTrue(g5Gates.some((issue) => /제12장/.test(issue.message)), 'G5 모니터링 계획 미입력 경고');
assertTrue(g5Gates.some((issue) => /제15장/.test(issue.message)), 'G5 증빙 목록 미입력 경고');
assertTrue(g5Gates.some((issue) => /제16장/.test(issue.message)), 'G5 운영자 선언 성명 미입력 경고');
assertTrue(g5Gates.some((issue) => /제7장/.test(issue.message)), 'G5 전력 EF 출처 미입력 경고');
assertTrue(steelOnlyXml.includes('기재 필요'), '미입력 시 본문에 「기재 필요」 표기');

// 입력을 채우면 실제 내용으로 채워지고 해당 G5 경고가 사라진다
const filled = reportModule.createCalculationReport({
    ...baseInput(),
    reportInputs: {
        monitoring_plan: { doc_no: 'HB-CBAM-MP-001', version: 'v1.0', approved_at: '2026-01-05' },
        rnr: [{ data: '천연가스 사용량', collector: '경영지원팀', transposer: '환경안전팀', approver: '공장장', system: '앱 · 배출원 자료' }],
        carbon_price: [{ target: '본 사업장', applicable: 'TO_CONFIRM', note: '법인 단위 확인 필요', evidence_status: 'pending' }],
        evidence: [{ item: '도시가스 요금청구서', proves: '활동자료 89.13 t', custodian: '경영지원팀', status: '확보' }],
        transpositions: [{ source_stream_id: 's1', source_unit: 'MJ', source_quantity: '4,278,240', conversion_note: '÷ 48,000 MJ/t', measurement_method: '정산용 계량기', data_quality: '상업 거래용 계량', ncv_source: 'IPCC 2006 Guidelines Vol.2 Table 1.2', ef_source: 'IPCC 2006 Guidelines Vol.2 Table 1.4' }],
        electricity_ef_meta: [{ process_id: 'proc1', publisher: '집행위', document: 'Country EF list', vintage: '2026' }],
        declaration: { name: '박지훈', position: 'CBAM 담당', date: '2027-01-15' },
    },
});
const filledXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await filled.blob.arrayBuffer()))['word/document.xml']);
const filledG5 = filled.issues.filter((issue) => issue.gate === 'G5');

assertEqual(String(filledG5.length), '0', '입력을 채우면 G5 경고 없음');
assertTrue(filledXml.includes('HB-CBAM-MP-001'), '12장 모니터링 계획 문서번호 반영');
assertTrue(filledXml.includes('환경안전팀'), '12.1 R&R 반영');
assertTrue(filledXml.includes('확인 필요(자료)'), '11장 탄소가격 TO_CONFIRM 라벨');
assertTrue(filledXml.includes('미수령(pending)'), '11장 증빙 상태 라벨');
assertTrue(filledXml.includes('도시가스 요금청구서'), '15장 증빙 목록 반영');
assertTrue(filledXml.includes('박지훈'), '16장 선언 성명 반영');
assertTrue(filledXml.includes('4,278,240'), '6.1 원천자료 수치 반영');
assertTrue(filledXml.includes('÷ 48,000 MJ/t'), '6.1 환산 근거 반영');
assertTrue(filledXml.includes('정산용 계량기'), '6.3 측정 방식 반영');
assertTrue(filledXml.includes('Country EF list'), '7장 전력 EF 출처 메타 반영');
// 국문 선언에 「본인이 아는 범위에서」 한정이 있어야 영문과 보증 수준이 맞는다 (씨밤이 P1)
assertTrue(filledXml.includes('본인이 아는 범위에서'), '16장 국문 선언 한정 문구');

// 모니터링 계획 승인일이 보고기간 시작 이후면 경고
const latePlan = reportModule.createCalculationReport({
    ...baseInput(),
    reportInputs: { monitoring_plan: { doc_no: 'X', approved_at: '2026-06-01' } },
});
assertTrue(latePlan.issues.some((issue) => issue.gate === 'G2' && /승인일/.test(issue.message)), '모니터링 계획 승인일 지연 경고');

// ---------------- 씨밤이 재감사(앱 산출물) 회귀 — 해피패스 밖 좌표 ----------------
// 기존 픽스처는 제품1·공정1·기간1·간접제외 하나뿐이었다. 그 좌표를 벗어나면 보고서가 차단도 경고도
// 없이 틀린 숫자를 인쇄한다는 것이 재감사에서 드러났다. 아래는 그 좌표들을 고정한다.

// [P0] 간접 포함 품목의 9.2 민감도 — 기준 행과 DV 대체 행이 같은 정의(see_cbam_basis)로 계산돼야 한다.
// 과거: dvBasis = direct_see + dvPrecursorDirect 로 간접을 빠뜨려 리스크를 +15.27% → +1.44%로 축소 표기.
const ironOreProduct = at({ id: 'p9', name: '응결 철광석', hs_code: '2601', cn_code: '26011200', hs_group: '26', product_type_enum: 'OTHER', unit: 'tonne', reporting_scope: 'CBAM_GOOD' });
const ironOreProcess = at({ id: 'proc9', product_id: 'p9', period_id: 'per1', name: '소결', production_route: 'All production routes', output_mass_t: 8000, market_output_mass_t: 8000, internal_consumption_mass_t: 0, direct_attributable_emissions_tco2e: 240.009264, electricity_mwh: 1600, electricity_ef_tco2e_per_mwh: 0.459 });
const ironOreStream = at({ ...baseStream, id: 's9', process_id: 'proc9' });
const ironOrePrecursor = at({ ...basePrecursor, id: 'pr9', product_id: 'p9', process_id: 'proc9', supplier_country: 'South Korea' });
const ironOreEngine = reportModule.calculateLocalResults({
    processes: [ironOreProcess], precursors: [ironOrePrecursor], products: [ironOreProduct],
    periods: [at({ id: 'per1', name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'CALCULATED' })],
    sourceStreams: [ironOreStream], productOutputLines: [],
});
assertEqual(ironOreEngine[0].indirect_emissions_relevance, 'INCLUDED', '전제: CN 2601 12 00은 간접 포함 품목');

const ironOreReport = reportModule.createCalculationReport({
    ...baseInput(),
    products: [ironOreProduct], processes: [ironOreProcess], sourceStreams: [ironOreStream],
    precursors: [ironOrePrecursor], results: ironOreEngine, defaultValues: dvReference,
});
const ironOreXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await ironOreReport.blob.arrayBuffer()))['word/document.xml']);

// 엔진을 다시 돌려 얻은 참값과 보고서 인쇄값이 같아야 한다.
const ironOreDvEngine = reportModule.calculateLocalResults({
    processes: [ironOreProcess],
    precursors: [{ ...ironOrePrecursor, direct_see_tco2e_per_t: 2.330323809 }],
    products: [ironOreProduct],
    periods: [at({ id: 'per1', name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'CALCULATED' })],
    sourceStreams: [ironOreStream], productOutputLines: [],
});
const expectedIronOreDv = ironOreDvEngine[0].see_cbam_basis.toFixed(4);
assertEqual(expectedIronOreDv, '2.8176', '전제: 간접 포함 품목의 DV 대체 참값');
assertTrue(ironOreXml.includes(expectedIronOreDv), `간접 포함 품목 민감도가 엔진 참값(${expectedIronOreDv})과 일치`);
// 옛 산식(direct_see + dvPrecursorDirect)은 간접을 빠뜨려 2.4186(-0.38%)을 인쇄했다.
// 부호가 뒤집혀 "실측이 불인정돼도 손해가 없다"고 말하게 된다 — 가장 위험한 형태의 오답이다.
assertTrue(!ironOreXml.includes('2.4186'), '간접 누락 산식의 과거 오답(2.4186)이 나오지 않음');
assertTrue(ironOreXml.includes('+16.06%'), '민감도 증가율이 참값(+16.06%)으로 인쇄');

// [P0] 같은 제품·공정 2개 — 남의 공정 전구물질을 끌어와 나누면 안 된다(엔진은 공정 단위 귀속).
const proc2 = at({ ...baseProcess, id: 'proc2', period_id: 'per1', output_mass_t: 2000, direct_attributable_emissions_tco2e: 60, electricity_mwh: 400 });
const proc1WithPeriod = at({ ...baseProcess, period_id: 'per1' });
const twoProcPrecursors = [
    at({ ...basePrecursor, id: 'prA', process_id: 'proc1', supplier_country: 'South Korea' }),
    at({ ...basePrecursor, id: 'prB', process_id: 'proc2', consumed_mass_t: 2050, purchased_mass_t: 2100, supplier_country: 'South Korea' }),
];
const twoProcEngine = reportModule.calculateLocalResults({
    processes: [proc1WithPeriod, proc2], precursors: twoProcPrecursors, products: [baseProduct],
    periods: [at({ id: 'per1', name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'CALCULATED' })],
    sourceStreams: [baseStream, at({ ...baseStream, id: 's2', process_id: 'proc2', activity_data: 22.28 })], productOutputLines: [],
});
const twoProcReport = reportModule.createCalculationReport({
    ...baseInput(),
    processes: [proc1WithPeriod, proc2], precursors: twoProcPrecursors,
    sourceStreams: [baseStream, at({ ...baseStream, id: 's2', process_id: 'proc2', activity_data: 22.28 })],
    results: twoProcEngine, defaultValues: dvReference,
});
const twoProcXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await twoProcReport.blob.arrayBuffer()))['word/document.xml']);
assertTrue(!twoProcXml.includes('3.0157'), '공정 2개일 때 남의 전구물질을 합산한 과거 오답(3.0157)이 나오지 않음');
assertTrue(!twoProcXml.includes('+48.65%'), '공정 2개 민감도 과대 증가율(+48.65%)이 나오지 않음');

// [P0] 생산량 0 → SEE 0.0000을 발행하면 안 된다. 차단해야 한다.
const zeroOutputProcess = at({ ...baseProcess, output_mass_t: 0, period_id: 'per1' });
const zeroEngine = reportModule.calculateLocalResults({
    processes: [zeroOutputProcess], precursors: [basePrecursor], products: [baseProduct],
    periods: [at({ id: 'per1', name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'CALCULATED' })],
    sourceStreams: [baseStream], productOutputLines: [],
});
let zeroBlocked = false;
try {
    reportModule.createCalculationReport({ ...baseInput(), processes: [zeroOutputProcess], results: zeroEngine });
} catch (error) {
    zeroBlocked = /생산량/.test(error.message);
}
assertTrue(zeroBlocked, '생산량 0 → 발행 차단 (SEE 0.0000 인쇄 금지)');

// [P0] 다중 제품에서 간접배출 취급이 갈리면 표지가 하나로 단정하면 안 된다.
const mixedProductsReport = reportModule.createCalculationReport({
    ...baseInput(),
    products: [baseProduct, ironOreProduct],
    processes: [baseProcess, ironOreProcess],
    sourceStreams: [baseStream, ironOreStream],
    precursors: [basePrecursor, ironOrePrecursor],
    results: [baseResult, ...ironOreEngine],
});
const mixedProductsXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await mixedProductsReport.blob.arrayBuffer()))['word/document.xml']);
assertTrue(mixedProductsXml.includes('제품별 상이'), '간접 취급이 갈리면 표지가 「제품별 상이」로 표기');
assertTrue(mixedProductsXml.includes('응결 철광석') && mixedProductsXml.includes('용접강관'), '3.1장이 제품별로 판정');
// 「CN 접두 규칙」 부분문자열 검사는 공허하다 — 새 문안 「CN 접두 규칙을 사용하지 않았다」도
// 통과시켜 정반대 진술을 승인한다. 실제로 이 통로로 13·14장의 접두 규칙 잔존이 빠져나갔다(씨밤이 P2).
// 문서 전체에서 「접두 규칙으로 판정했다」는 진술이 없어야 한다.
const claimsPrefixRule = /접두 규칙 기반|접두 규칙으로 판정|접두 규칙에 따른/;
assertTrue(!claimsPrefixRule.test(mixedProductsXml.replace(/<[^>]+>/g, ' ')), '다중 제품 문서가 「접두 규칙으로 판정했다」고 진술하지 않음');
// 대신 조회 사실과 미확인 사항을 밝혀야 한다.
assertTrue(mixedProductsXml.includes('CN 접두 규칙을 사용하지 않았다'), '3.1장이 접두 규칙 미사용을 명시');
assertTrue(mixedProductsXml.includes('Annex II 등재 목록 원본을 조회한 결과가 아니다'), '3.1장이 Annex II 대조 미완을 유지');
assertTrue(mixedProductsXml.includes('Communication Template'), '3.1장이 조회한 출처를 인용');

// [P1] 기간이 여러 개면 periods[0]이 아니라 결과가 가리키는 기간을 써야 한다.
const twoPeriods = reportModule.createCalculationReport({
    ...baseInput(),
    periods: [
        at({ id: 'per0', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'CALCULATED' }),
        at({ id: 'per1', name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'CALCULATED' }),
    ],
    results: [{ ...baseResult, period_id: 'per1' }],
});
const twoPeriodsXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await twoPeriods.blob.arrayBuffer()))['word/document.xml']);
assertTrue(twoPeriodsXml.includes('2026-01-01'), '결과의 period_id가 가리키는 기간을 표지에 인쇄');
assertTrue(!twoPeriodsXml.includes('2025-12-31'), 'periods[0](2025)을 임의 채택하지 않음');

// 결과가 여러 기간에 걸치면 차단
let mixedPeriodBlocked = false;
try {
    reportModule.createCalculationReport({
        ...baseInput(),
        periods: [
            at({ id: 'per0', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'CALCULATED' }),
            at({ id: 'per1', name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'CALCULATED' }),
        ],
        results: [{ ...baseResult, period_id: 'per0' }, { ...baseResult, id: 'r2', period_id: 'per1' }],
    });
} catch (error) {
    mixedPeriodBlocked = /보고기간/.test(error.message);
}
assertTrue(mixedPeriodBlocked, '결과가 여러 보고기간에 걸치면 차단');

// [P1] 엔진 경고를 건수만이 아니라 내용으로 끌어올린다.
const warnedResult = { ...baseResult, warnings: ['소비량이 구매량을 초과합니다.'] };
const warned = reportModule.createCalculationReport({ ...baseInput(), results: [warnedResult] });
assertTrue(
    warned.issues.some((issue) => issue.gate === 'G1' && /소비량이 구매량을 초과/.test(issue.message)),
    '엔진 경고가 보고서 게이트 이슈로 노출'
);

// [P1] 공란 셀이 "공표된 0.0"이 되면 안 된다 — Number('') === 0 함정.
const emptyCellDv = {
    ...dvReference,
    rows: [{ ...dvReference.rows[0], direct_default: undefined, total_default: undefined, markup_2026: undefined }],
};
const emptyCellReport = reportModule.createCalculationReport({
    ...baseInput(),
    precursors: [{ ...basePrecursor, supplier_country: 'South Korea' }],
    defaultValues: emptyCellDv,
});
const emptyCellXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await emptyCellReport.blob.arrayBuffer()))['word/document.xml']);
assertTrue(!emptyCellXml.includes('0.00000000'), '미공표 DV가 0.00000000으로 인쇄되지 않음');

// ---------------- 재감사 R2 회귀 — 문서가 하지 않은 일을 했다고 말하지 않는지 ----------------

// [P0] 13장 자체평가는 실제 게이트 결과에서 파생돼야 한다. G3 경고가 떠 있는데 「경고 0건」은 거짓이다.
const okXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await ok.blob.arrayBuffer()))['word/document.xml']);
// [P1] 13·14장이 3.1장과 정반대를 말하면 안 된다 — 문서가 자기 판정 방법을 거짓 진술한다.
// 3.1장만 고치고 13·14장을 놓쳤던 것이 실제 결함이었다(씨밤이 P1).
assertTrue(!claimsPrefixRule.test(okXml.replace(/<[^>]+>/g, ' ')), '문서 전체가 「접두 규칙으로 판정했다」고 진술하지 않음');

assertTrue(ok.issues.some((issue) => issue.gate === 'G3'), '전제: 기본 시나리오는 G3 경고가 있다');
assertTrue(!okXml.includes('경고 0건'), '경고가 있는데 「경고 0건」이라 말하지 않음');
assertTrue(/경고 \d+건\(G/.test(okXml.replace(/<[^>]+>/g, '')), '13장이 실제 경고 건수·게이트를 서술');

// [P1] 13장이 하지 않은 export 검증을 했다고 주장하지 않는다.
assertTrue(!okXml.includes('템플릿 기재 셀 전수 자동 대조 검증'), '수행하지 않은 export 검증을 근거로 올리지 않음');
// 6.4의 단일 배출원 한계 고지가 13장 정확성 근거에도 전재된다.
assertTrue(okXml.includes('전기(轉記) 오류 검출에 한정'), '13장 정확성이 6.4의 한계를 함께 전재');

// [P1] 산식 피연산자는 반올림하지 않는다 — 문서가 스스로 선언한 규칙.
assertTrue(okXml.includes('0.030001158'), '5.4 산식이 피연산자를 원천값으로 인쇄');
assertTrue(okXml.includes('1.99875'), '5.4 전구물질 피연산자 원천값');

// [P1] 7장에 전력 EF 출처를 채우면 14장이 「미기재」라고 우기면 안 된다.
const filledXml2 = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await filled.blob.arrayBuffer()))['word/document.xml']);
assertTrue(filledXml2.includes('Country EF list'), '전제: 7장에 전력 EF 출처가 기재됨');
assertTrue(!filledXml2.includes('공표 메타데이터 미기재'), '7장에 기재되면 14장이 「미기재」를 주장하지 않음');
// 반대로 비어 있으면 개선 항목으로 올라온다.
assertTrue(okXml.includes('공표 메타데이터 미기재'), '7장이 비면 14장에 개선 항목으로 등재');

// [P0] 결과의 대부분이 미검증 값에서 온다는 사실이 표지·요약을 통과해야 한다.
assertTrue(okXml.includes('주요 한계'), '표지에 「주요 한계」 행');
assertTrue(okXml.includes('98.5%'), '미검증 전구물질 기여 집중도(98.5%)를 정량 노출');
assertTrue(okXml.includes('주요 잔여 리스크'), '1장 요약에 잔여 리스크 노출');
assertTrue(okXml.includes('참고 총 SEE'), '1장에 참고 총 SEE');

// [P1] 앱 버전이 표지에 있어야 재현이 성립한다.
assertTrue(okXml.includes('CBAM Local v0.1.0'), '표지에 산정 엔진 버전');

// [P1] 전구물질 자료 기간이 보고기간과 다르면 불일치를 말해야 한다.
assertTrue(okXml.includes('본 보고기간(2026)과 불일치'), '8장 vintage 불일치 고지');
assertTrue(okXml.includes('전구물질 자료 기간'), '14장에 vintage 불일치 개선 항목');

// [P0] 선언은 확보하지 않은 근거로 준거를 말하지 않는다. 국·영문 보증 수준이 같아야 한다.
assertTrue(!okXml.includes('and its implementing regulations'), '영문 선언이 미확정 이행규정 준거를 주장하지 않음');
assertTrue(okXml.includes('Items marked'), '영문 선언에도 「확인 필요」 유보 문구');
assertTrue(okXml.includes('outstanding items are listed in Chapter 14'), '영문 선언이 미해소 항목 등록부를 가리킴');
assertTrue(okXml.includes('본인이 아는 범위에서'), '국문 선언 한정 유지');

// [P1] 미해소 항목 등록부 — 열거하지 않은 것은 유보할 수 없다.
assertTrue(okXml.includes('14.1 미해소 항목 등록부'), '14.1 등록부 존재');
assertTrue(okXml.includes('미해소 표기는 총'), '등록부가 총 건수를 집계');

// [P1] 8.x 자리표시자가 실제 채번으로 바뀌었는지 (전구물질 2건)
const twoPrecursors = reportModule.createCalculationReport({
    ...baseInput(),
    precursors: [basePrecursor, { ...basePrecursor, id: 'pr2', name: '선재' }],
});
const twoPrecXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await twoPrecursors.blob.arrayBuffer()))['word/document.xml']);
assertTrue(!twoPrecXml.includes('8.x'), '8.x 자리표시자 미치환 없음');
assertTrue(twoPrecXml.includes('8.1 HRC') && twoPrecXml.includes('8.2 선재'), '전구물질 절 번호 채번');

// [P1] 경계 밖 공정·배출원이 6·7장에 유입되면 안 된다.
const nonCbamProduct = at({ id: 'pX', name: '비CBAM 제품', hs_code: '9999', cn_code: '99999999', hs_group: '99', product_type_enum: 'OTHER', unit: 'tonne', reporting_scope: 'NON_CBAM' });
const nonCbamProcess = at({ ...baseProcess, id: 'procX', product_id: 'pX', name: '비CBAM 도장', electricity_mwh: 900 });
const nonCbamStream = at({ ...baseStream, id: 'sX', process_id: 'procX', name: '경유' });
const scoped = reportModule.createCalculationReport({
    ...baseInput(),
    products: [baseProduct, nonCbamProduct],
    processes: [baseProcess, nonCbamProcess],
    sourceStreams: [baseStream, nonCbamStream],
});
const scopedXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await scoped.blob.arrayBuffer()))['word/document.xml']);
assertTrue(!scopedXml.includes('비CBAM 도장'), '7장에 경계 밖 공정이 실리지 않음');
assertTrue(!scopedXml.includes('경유'), '6장에 경계 밖 배출원이 실리지 않음');
assertTrue(scopedXml.includes('CBAM 대상 생산공정 1개'), '13장이 경계 안 공정 수만 집계');

// [P2] formatPercentForReport가 `+-0.00%`를 내지 않는다.
assertEqual(fmt.formatPercentForReport(-0.00001), '0.00%', 'formatPercentForReport -0 정규화');

// [P1] 배분기준을 "도구가 검사한다"가 아니라 "무엇을 썼는가"로 서술
assertTrue(okXml.includes('제품 배분 기준: 질량 기준(MASS) 단일 적용'), '13장 일관성이 실제 배분기준을 진술');
assertTrue(!okXml.includes('배분기준 혼용 여부는 도구가 자동 경고'), '「도구가 검사한다」를 방법 진술로 쓰지 않음');
// 미기재가 있으면 완전성 잔여 한계가 그 사실을 말해야 한다(G3도 「기재 필요」를 남긴다)
assertTrue(okXml.includes('미기재 항목이 남아 있다'), '미기재가 있으면 13장 완전성이 이를 잔여 한계로 서술');
// 내부 enum이 그대로 새어나가면 안 된다
assertTrue(!okXml.includes('PROCESS_TOTAL 단일'), '배분기준 내부 enum 노출 없음');

// ---------------- 재감사 R3 회귀 — 근거 복원(추적성) ----------------

// [P0] 계수 출처와 활동자료 증빙은 다른 문서다. 청구서에는 배출계수가 실리지 않는다.
assertTrue(filledXml2.includes('6.2.2 계수 출처'), '6.2.2 계수 출처 절 분리');
assertTrue(filledXml2.includes('IPCC 2006 Guidelines Vol.2 Table 1.4'), '계수 출처가 사용자 입력에서 렌더');
assertTrue(filledXml2.includes('6.3 측정 방식 및 데이터 품질'), '6.3 원천 증빙은 별도 절');
// 계수 출처가 비면 조용히 「기재 필요」로 나가지 말고 경고해야 한다.
assertTrue(
    ok.issues.some((issue) => issue.gate === 'G5' && /계수 출처/.test(issue.message)),
    '계수 출처 미기재 → G5 경고'
);

// [P1] 산식에 등장하는 계수는 표에 값이 있어야 재현된다. 종전엔 산화계수가 산식에만 있었다.
assertTrue(filledXml2.includes('6.2.1 산식 적용 계수'), '6.2.1 산식 적용 계수 표');
assertTrue(filledXml2.includes('산화계수 (OxF)'), '산화계수 열');
assertTrue(filledXml2.includes('바이오매스 분율'), '바이오매스 분율 열');

// [P1] 단위 없는 헤더는 G7이 검사할 대상이 없어 공허하게 통과한다.
assertTrue(filledXml2.includes('NCV (GJ/단위)'), 'NCV 헤더에 단위');
assertTrue(filledXml2.includes('EF 기준'), 'EF 기준(basis) 열');
assertTrue(filledXml2.includes('tCO2/TJ'), 'EF 단위 명시');

// PER_ACTIVITY_UNIT 배출원은 NCV를 쓰지 않으므로 그렇게 표기해야 한다.
const perUnit = reportModule.createCalculationReport({
    ...baseInput(),
    sourceStreams: [{ ...baseStream, emission_factor_basis: 'PER_ACTIVITY_UNIT', emission_factor_tco2e_per_unit: 2.69 }],
});
const perUnitXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await perUnit.blob.arrayBuffer()))['word/document.xml']);
assertTrue(perUnitXml.includes('tCO2/t'), 'PER_ACTIVITY_UNIT은 활동자료 단위 기준 EF로 표기');

// [P1] 원천자료가 에너지 단위면 NCV가 상쇄된다는 사실을 말해야 한다.
assertTrue(filledXml2.includes('NCV 상쇄 고지'), '6.1 NCV 상쇄 고지');
// 질량 단위 원천자료에는 상쇄 고지가 붙으면 안 된다(남발 방지).
const massSource = reportModule.createCalculationReport({
    ...baseInput(),
    reportInputs: { transpositions: [{ source_stream_id: 's1', source_unit: 't', source_quantity: '89.13', ncv_source: 'X', ef_source: 'Y', measurement_method: '계량기' }] },
});
const massSourceXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await massSource.blob.arrayBuffer()))['word/document.xml']);
assertTrue(!massSourceXml.includes('NCV 상쇄 고지'), '질량 원천자료엔 상쇄 고지 없음');

// [P1] 15장 자동 초안 — 본문이 인용한 문서가 증빙 목록에 있어야 한다.
assertTrue(filledXml2.includes('모니터링 계획서 HB-CBAM-MP-001'), '15장에 모니터링 계획 자동 등재');
assertTrue(filledXml2.includes('자동 초안'), '자동 초안 표시');
const withDvXml2 = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await withDv.blob.arrayBuffer()))['word/document.xml']);
assertTrue(withDvXml2.includes('DVs as adopted_v20260204.xlsx'), '15장에 DV 워크북 자동 등재');

// [P1] 11장 전구물질 탄소가격 행 — 공급사로부터 별도 수령해야 한다.
assertTrue(filledXml2.includes('전구물질 (HRC)'), '11장 전구물질 행 자동 시딩');

// [P2] 9.1 raw 행에도 상대차를 준다.
assertTrue(dvXml.includes('-7.95%'), '9.1 raw 상대차(%)');

// [P1] 9.2가 9.1의 유보를 전재하고 markup 채택을 밝힌다.
assertTrue(dvXml.includes('markup을 포함한'), '9.2 markup 채택 명시');
assertTrue(dvXml.includes('본 수치는 개연성 참고이다'), '9.2에 9.1 조회 전제 유보 전재');

// [P1] 5.1 산식이 엔진 산식과 같아야 한다(전환계수·화석분율·PER_ACTIVITY_UNIT 분기).
assertTrue(filledXml2.includes('전환계수 CF × 화석 분율'), '5.1 산식에 CF·화석분율');
assertTrue(filledXml2.includes('NCV와 ÷1,000을 적용하지 않는다'), '5.1 PER_ACTIVITY_UNIT 분기 명시');
assertTrue(filledXml2.includes('CH4·N2O는 본 산정의 대상 GHG에 포함되지 않는다'), '5.1 GHG 범위 진술');

// [P1] DV 조회가 생산경로를 무시하면 워크북 행 순서로 아무 행이나 집는다.
const routeDv = {
    ...dvReference,
    rows: [
        { ...dvReference.rows[0], cn_code: '2523', production_route: '(B)', direct_default: 1.29, total_default: 1.29, markup_2026: 1.42 },
        { ...dvReference.rows[0], cn_code: '2523', production_route: '(A)', direct_default: 1.24, total_default: 1.24, markup_2026: 1.36 },
    ],
};
const routed = reportModule.createCalculationReport({
    ...baseInput(),
    precursors: [{ ...basePrecursor, precursor_cn_code: '25231000', supplier_country: 'South Korea', production_route: '(A)' }],
    defaultValues: routeDv,
});
const routedXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await routed.blob.arrayBuffer()))['word/document.xml']);
assertTrue(routedXml.includes('1.24'), '생산경로가 같은 DV 행을 우선 조회');
assertTrue(routedXml.includes('생산경로가 다른 공식 기본값 행이 둘 이상'), '경로 분화 조합임을 고지');
assertTrue(routed.issues.some((issue) => issue.gate === 'G6' && /생산경로가 다른 DV 행/.test(issue.message)), '경로 모호 → G6 경고');

// [P1] direct_default가 null이면 actual - null = actual이 되면 안 된다.
const nullDirectDv = { ...dvReference, rows: [{ ...dvReference.rows[0], direct_default: null, markup_2026: null }] };
const nullDirect = reportModule.createCalculationReport({
    ...baseInput(),
    precursors: [{ ...basePrecursor, supplier_country: 'South Korea' }],
    defaultValues: nullDirectDv,
});
const nullDirectXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await nullDirect.blob.arrayBuffer()))['word/document.xml']);
assertTrue(!nullDirectXml.includes('차이: 실측 − DV(raw)'), 'direct_default가 null이면 raw 차이 행을 만들지 않음');
assertTrue(nullDirectXml.includes('직접 기본값이 공표되지 않아'), 'direct_default 미공표 고지');

assertTrue(reportModule.hasAmbiguousDefaultValueRoutes(routeDv, 'South Korea', '25231000'), 'hasAmbiguousDefaultValueRoutes 검출');
assertTrue(!reportModule.hasAmbiguousDefaultValueRoutes(dvReference, 'South Korea', '72083900'), '경로 단일이면 모호하지 않음');

// ---------------- 재감사 R4 회귀 — 「고치면서 새로 만든 결함」 ----------------
// 두 건 다 같은 형태였다: 새 추상화를 만들고 일부 호출부에만 적용.

// [P0-A] 경계는 문서 전체에서 하나여야 한다.
// 6·7·8·13장은 결과 기반 필터로 갈아탔는데 4장·G3는 옛 product-scope 필터를 유지해,
// 4장에 보이는 공정의 배출원이 6장에 없고 13장은 그 공정이 없다고 선언했다.
// 재현: CBAM 품목 공정이지만 신고 대상 결과가 0건인 공정(산출라인이 전부 비CBAM인 경우 등).
const orphanProcess = at({
    id: 'procOrphan', product_id: 'p1', period_id: 'per1', name: '부산물 회수공정',
    production_route: 'All production routes', output_mass_t: 500, market_output_mass_t: 500,
    internal_consumption_mass_t: 0, direct_attributable_emissions_tco2e: 12, electricity_mwh: 30,
    electricity_ef_tco2e_per_mwh: 0.459,
});
const orphanStream = at({ ...baseStream, id: 'sOrphan', process_id: 'procOrphan', name: '회수로 경유' });
// 결과는 proc1 것만 있다 — procOrphan은 신고 대상 결과가 없다.
const orphan = reportModule.createCalculationReport({
    ...baseInput(),
    processes: [baseProcess, orphanProcess],
    sourceStreams: [baseStream, orphanStream],
});
const orphanXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await orphan.blob.arrayBuffer()))['word/document.xml']);

assertTrue(!orphanXml.includes('회수로 경유'), '결과 없는 공정의 배출원은 6장에 실리지 않음');
assertTrue(!orphanXml.includes('부산물 회수공정'), '4장도 같은 경계를 쓴다 — 결과 없는 공정을 싣지 않음');
assertTrue(orphanXml.includes('CBAM 대상 생산공정 1개'), '13장 공정 수가 4장·6장과 일치');
// 조용히 사라지면 완전성이 훼손된다. 반드시 경고로 드러나야 한다.
assertTrue(
    orphan.issues.some((issue) => issue.gate === 'G3' && /부산물 회수공정/.test(issue.message)),
    'CBAM 품목 공정인데 결과가 없으면 G3 경고로 명시'
);

// [P1-B] 등록부는 자기 장(14장)도 세야 한다. 16장 선언이 이 등록부를 유보 대상으로 가리키므로,
// 열거가 불완전하면 선언이 거짓이 된다.
assertTrue(okXml.includes('14. 데이터 한계 및 개선계획'), '전제: 14장 존재');
// 등록부 표만 자른다. 문서 끝까지 자르면 뒤따르는 실제 장 제목(15·16·부속서)까지 섞인다.
// 표 뒤에는 범례(Legend 문단)가 오므로 그 지점을 끝으로 삼는다.
const registryStart = okXml.indexOf('14.1 미해소 항목 등록부');
const registrySlice = okXml.slice(registryStart, okXml.indexOf('<w:pStyle w:val="Legend"/>', registryStart));
assertTrue(registrySlice.length > 0 && registrySlice.length < okXml.length, '등록부 표 구간 추출');
assertTrue(/14\. 데이터 한계 및 개선계획/.test(registrySlice.replace(/<[^>]+>/g, ' ')), '등록부에 「14.」 행이 존재');

const printedTotalMatch = okXml.replace(/<[^>]+>/g, ' ').match(/미해소 표기는 총 (\d+)건/);
assertTrue(Boolean(printedTotalMatch), '등록부가 총 건수를 인쇄');

// 등록부 총계가 실제 본문의 표기 수와 일치해야 한다.
// 집계 대상: 표지 + 1~16장 + 부속서. 집계 제외: 등록부 표 자신, 표기 뜻을 설명하는 범례.
const bodyWithoutRegistry = okXml.slice(0, okXml.indexOf('14.1 미해소 항목 등록부')) +
    okXml.slice(okXml.indexOf('15. 증빙 목록'));
const legendStripped = bodyWithoutRegistry
    .split('</w:p>')
    .filter((paragraph) => !paragraph.includes('규정 원문 대조 미완'))
    .join('</w:p>')
    .replace(/<[^>]+>/g, ' ');
const actualTotal = [/확인 필요\(규정\)/g, /확인 필요\(자료\)/g, /기재 필요/g]
    .reduce((sum, pattern) => sum + (legendStripped.match(pattern) ?? []).length, 0);
assertEqual(Number(printedTotalMatch[1]), actualTotal, '등록부 총계가 실제 본문 표기 수와 일치(표지·14장 포함, 등록부·범례 제외)');

// 표지에도 실제 미해소 항목이 있다(대상 온실가스 — 확인 필요(규정)). 건너뛰면 안 된다.
assertTrue(/표지/.test(registrySlice.replace(/<[^>]+>/g, ' ')), '등록부에 「표지」 행이 존재');
// 범례를 미해소 항목으로 세면 안 된다 — 표지 범례는 규정·자료·기재 각 1건씩을 허위 계상한다.
const coverRow = registrySlice
    .replace(/<[^>]+>/g, '|')
    .replace(/\|+/g, '|')
    .match(/표지\|([^|]+)\|([^|]+)\|([^|]+)\|/);
assertTrue(Boolean(coverRow), '표지 행 파싱');
assertEqual(coverRow[1], '1건', '표지 확인 필요(규정) 1건 (범례 미계상)');
assertEqual(coverRow[2], '-', '표지 확인 필요(자료) 없음 (범례 미계상)');
assertEqual(coverRow[3], '-', '표지 기재 필요 없음 (범례 미계상)');

// ---------------- 재감사 R5 회귀 — 등록부 순서·범례 구조화·자기언급 ----------------

// [P2-1] 등록부 행은 문서 순서(표지 → 1~16장 → 부속서)를 따라야 한다.
// R4에서 14장을 스캔 끝에 붙여 세게 만들었더니 행 위치까지 끝으로 갔다.
const registryText = registrySlice.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
const orderKeys = [...registryText.matchAll(/\|(표지|(\d{1,2})\. |([A-C])\. )/g)].map((match) => match[1].trim());
const orderIndex = orderKeys.map((key) => {
    if (key === '표지') return -1;
    if (/^\d/.test(key)) return Number.parseInt(key, 10);
    return 100 + key.charCodeAt(0);
});
assertTrue(orderIndex.length >= 3, '등록부 행 파싱');
assertEqual(
    JSON.stringify(orderIndex),
    JSON.stringify([...orderIndex].sort((a, b) => a - b)),
    '등록부 행이 문서 순서(표지 → 장번호 → 부속서)로 정렬'
);
// R4가 만든 역순의 직접 회귀 — 14장 행이 뒤따르는 장·부속서보다 앞에 와야 한다.
// (미해소 표기가 없는 장은 행 자체가 없으므로 15장 존재를 전제하면 안 된다.)
const idx14 = orderIndex.indexOf(14);
const idxAfter14 = orderIndex.findIndex((value) => value > 14);
assertTrue(idx14 !== -1, '등록부에 14장 행 존재');
assertTrue(idxAfter14 === -1 || idx14 < idxAfter14, '14장 행이 이후 장·부속서 행보다 앞');

// [P2-2] 범례를 문자열이 아니라 스타일로 식별해야 한다.
// 문자열 매칭이면 본문 문안에 그 문구가 섞이는 순간 그 문단의 진짜 표기가 조용히 사라진다.
assertTrue(docx.paragraph('x', 'Legend').includes('<w:pStyle w:val="Legend"/>'), 'Legend 스타일 지원');
assertTrue(read('word/styles.xml').includes('w:styleId="Legend"'), 'styles.xml에 Legend 정의');
// 씨밤이가 재현한 시나리오: 본문 문단에 범례 문구가 섞여도 그 문단의 표기는 살아 있어야 한다.
const legendCollision = reportModule.createCalculationReport({
    ...baseInput(),
    installations: [at({
        id: 'i1', name: 'X', local_name: 'X', country: 'KR',
        // 사업장 서술에 범례와 같은 문구를 넣는다 — 옛 로직이면 이 문단의 표기 3건이 통째로 사라진다.
        economic_activity: '본 계수는 규정 원문 대조 미완 상태다 — 확인 필요(규정). 증빙 미수령 — 확인 필요(자료).',
    })],
});
const collisionXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await legendCollision.blob.arrayBuffer()))['word/document.xml']);
const collisionTotal = Number((collisionXml.replace(/<[^>]+>/g, ' ').match(/미해소 표기는 총 (\d+)건/) ?? [])[1]);
const okTotal = Number(printedTotalMatch[1]);
assertTrue(collisionTotal > okTotal, '본문에 범례 문구가 섞여도 그 문단의 표기가 집계에서 사라지지 않음');

// [P2-3] 표기 규칙을 서술하는 자기언급은 미해소 항목이 아니다.
assertTrue(!okXml.includes('미기재 항목은 「기재 필요」로 표기된다'), '12장 자기언급 제거');
assertTrue(!okXml.includes('「기재 필요」로 남은 항목이 있다'), '13장 자기언급 제거');
// 다만 의미는 남아야 한다 — 미기재가 있다는 사실 자체는 계속 말해야 한다.
assertTrue(okXml.includes('미기재 항목이 남아 있다'), '13장이 미기재 잔존 사실은 계속 진술');

// ---------------- 재감사 R6 회귀 — 「문서가 자기 자신을 부정하지 않는지」 ----------------
// run09 산출물(소결광 + 강관 혼재)을 4렌즈로 감사한 결과 확인된 것들. 공통 모양은 하나다:
// **고정 문안이 데이터와 무관하게 인쇄돼, 같은 문서의 다른 곳과 정면으로 어긋난다.**
// 숫자는 전부 맞았는데도 검증인이 첫 문장에서 신뢰를 잃는 종류다.

// [P0] 13장 자체평가는 실제 게이트 결과에서 파생돼야 한다.
// 출처 칸이 전부 「기재 필요」인 발행본에서 「모든 수치에 출처를 병기」라고 쓰면,
// 문서가 자기 표기를 부정한다. 검증인이 이 한 줄을 잡으면 자동 생성 장 전체를 못 믿는다.
assertTrue(
    ok.issues.some((issue) => issue.gate === 'G5' && /제6\.2\.2장:/.test(issue.message)),
    'R6 전제: 출처 미기재 케이스에 G5 경고가 실제로 뜬다'
);
assertTrue(!okXml.includes('모든 수치에 출처를 병기'), '13장 투명성이 미기재 상태에서 「모든 수치에 출처를 병기」를 인쇄하지 않음');
assertTrue(okXml.includes('아직 채워지지 않았다'), '13장 투명성이 출처 공백을 진술');
// 반대 방향도 잠근다 — 다 채운 보고서에서까지 공백을 말하면 그것도 거짓이다.
assertTrue(filledXml2.includes('모든 수치에 출처를 병기'), '출처가 모두 채워지면 13장 투명성이 원래 문안으로 돌아옴');
assertTrue(!filledXml2.includes('아직 채워지지 않았다'), '채워진 보고서에 출처 공백 문구가 남지 않음');

// [P1] 13장 정확성도 같다 — 6.1 전치가 비었는데 「제6.1장에 기재」를 근거로 들면 안 된다.
assertTrue(!okXml.includes('원천자료→활동자료 전치 경로를 제6.1장에 기재.'), '13장 정확성이 빈 6.1을 근거로 들지 않음');
assertTrue(okXml.includes('역추적할 수 없다'), '13장 정확성이 전치 경로 공백을 진술');
assertTrue(filledXml2.includes('원천자료→활동자료 전치 경로를 제6.1장에 기재.'), '전치가 채워지면 원래 문안으로 복귀');
// 6.2.2·6.3에는 게이트가 있는데 6.1만 없어 통째로 비어도 아무도 이의를 제기하지 않았다.
assertTrue(ok.issues.some((issue) => issue.gate === 'G5' && /제6\.1장:/.test(issue.message)), '6.1 전치 공백에 G5 경고');

// [P1] 간접 포함 품목(소결광)의 인증서 기준값을 「정보 목적」으로 라벨하지 않는다.
// 0.2066은 그 품목에서 참고값이 아니라 기준 그 자체다. 1장 표의 「CBAM 기준 SEE」 열과 정면 모순이었다.
assertTrue(!ironOreXml.includes('참고 총 SEE(직접+간접, 정보 목적)'), '1장 각주가 일괄 「정보 목적」 라벨을 쓰지 않음');
assertTrue(ironOreXml.includes('= CBAM 인증서 산정 기준)'), '간접 포함 품목의 총 SEE에 기준 라벨');
assertTrue(okXml.includes('정보 목적 — 인증서 기준 제외)'), '간접 비관련 품목의 총 SEE는 정보 목적으로 라벨');
// 10장 — 간접 포함 품목에서는 이 행이 기준값을 담은 유일한 행이다(직접 소계의 기준 표기는 일부러 비운다).
assertTrue(ironOreXml.includes('직접 + 간접 = CBAM 인증서 산정 기준'), '10장 총 SEE 행이 간접 포함 품목의 기준값임을 표기');
assertTrue(okXml.includes('참고 총 SEE'), '간접 비관련 품목은 10장에서 「참고 총 SEE」 유지');
// 5.4 — 장 제목이 「제품 SEE 및 인증서 기준」인데 기준값이 없었다.
assertTrue(ironOreXml.includes('CBAM 인증서 산정 기준 SEE = SEE(직접) + SEE(간접)'), '5.4가 간접 포함 품목의 기준 산식을 제시');
assertTrue(okXml.includes('CBAM 인증서 산정 기준 SEE = SEE(직접) ='), '5.4가 간접 비관련 품목의 기준 산식을 제시');
// 3.1 포함 분기가 「무엇에 포함되는지」를 말해야 한다(제외 분기는 이미 말한다).
assertTrue(ironOreXml.includes('CBAM 인증서 산정 기준 SEE에 포함해 산정한다'), '3.1 포함 분기가 귀결을 명시');

// [P1] 고철(CN 7204)을 규정 사실로 단정하지 않는다.
// 앱의 규칙 엔진은 「공식 목록에 없다」는 조회 사실만 말하고 확정기간 근거를 유보하는데,
// 보고서가 그 유보를 벗겨 「제외되어」로 인쇄했다.
assertTrue(!okXml.includes('CBAM 전구물질 범위에서 제외되어'), '고철 제외를 규정 사실로 단정하지 않음');
// 고철이 **실제로 입력됐을 때만** 쓴다. 없는 프로젝트에서 「가산하지 않았다」고 쓰면 하지 않은 판정을
// 서술하는 것이고, 「확인 필요(규정)」까지 붙어 존재하지 않는 규정 공백이 14.1 등록부를 부풀린다.
// 첫 판이 이 조건을 빠뜨려, 제9장에서 고친 실패를 제5장에서 되풀이했다(R6 자체 결함).
assertTrue(!okXml.includes('CN 목록에 없어 본 산정에서 전구물질로 가산하지 않았다'), '고철이 없으면 고철 문단도 없음');
const scrapPrecursor = at({ ...basePrecursor, id: 'prScrap', name: '고철', precursor_cn_code: '72044100' });
const scrapXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await reportModule.createCalculationReport({
    ...baseInput(), precursors: [basePrecursor, scrapPrecursor],
}).blob.arrayBuffer()))['word/document.xml']);
assertTrue(scrapXml.includes('CN 목록에 없어 본 산정에서 전구물질로 가산하지 않았다'), '고철이 있으면 조회 사실을 진술');
assertTrue(scrapXml.includes('부재가 곧 명시적 배제는 아니며'), '고철 서술이 목록 부재의 한계를 유지');

// 제8장도 헤더만 있는 빈 표로 두지 않는다 — 제9장에만 이 처리를 넣고 바로 위 장은 빠뜨렸었다.
assertTrue(scrapXml.includes('전구물질 (CN)'), '전구물질이 있으면 제8장 표는 그대로');

// 13장 「N건」은 **빈 칸 수**여야 한다. G5 경고를 세면 6.2.2가 배출원당 1건만 내므로
// 「4건」이라 말하고 표에는 6칸이 비어 있다 — 등록부를 가리키는 문장이 대조되지 않는다.
const gapMatch = okXml.replace(/<[^>]+>/g, '').match(/전력 배출계수 출처\(제7장\) (\d+)건이 아직/);
assertTrue(Boolean(gapMatch), '13장 투명성이 출처 공백 건수를 인쇄');
assertEqual(gapMatch[1], '3', '13장 출처 공백 건수가 빈 칸 수(배출원 2칸 + 전력 1칸)와 일치');

// 12.2 「증빙 보관」 행의 표기는 12.1이 채워지면 닫혀야 한다. 무조건이면 앱 어디에도 그것을
// 지울 입력이 없어, 세 줄 위의 「제12.1장 입력으로 확인한다」가 거짓이 된다.
assertTrue(okXml.includes('본 사업장의 보관 실태는 확인되지 않았다'), '12.1 미기재면 증빙 보관도 미확인 표기');
assertTrue(!filledXml2.includes('본 사업장의 보관 실태는 확인되지 않았다'), '12.1이 채워지면 증빙 보관 표기도 닫힘');
// 12.2가 「실제 실행하는 검사」로 소개하는 정합 검사의 한계를 6.4로 넘긴다(두 장이 어긋나지 않게).
assertTrue(okXml.includes('직접배출량 대조의 한계는 제6.4장을 따른다'), '12.2가 6.4의 한계를 참조');

// 11장의 해법은 원문 대조가 아니라 사업장 기재다 — 범례상 「확인 필요(규정)」이 아니다.
assertTrue(!okXml.includes('사업장이 직접 확인해 기재해야 한다 — 확인 필요(규정)'), '11장이 기재 항목을 규정 칸에 올리지 않음');
assertTrue(okXml.includes('할당대상 판정 기준을 보유하지 않으므로'), '11장 근거는 앱 사실로 유지');

// 부속서 A가 5.4의 기준 SEE 산식을 담는다 — 없으면 「인쇄된 산식으로 기준값이 안 나온다」가 그대로 남는다.
assertTrue(okXml.includes('제품 SEE(간접) = 자체 간접배출'), '부속서 A에 간접 SEE 산식');
assertTrue(okXml.includes('CBAM 인증서 산정 기준 SEE = SEE(직접) [간접 비관련]'), '부속서 A에 기준 SEE 유도');

// 1장 마무리 문장이 라벨 3종을 모두 덮는다(UNDETERMINED 누락 방지).
assertTrue(okXml.includes('비관련·판정 불가 품목에서만 정보 목적 값이다'), '1장 문장이 판정 불가 분기까지 설명');

// [P1] 12.2 QA/QC — 도구가 실행하는 검사와, 도구가 확인한 적 없는 사업장 절차를 구분한다.
assertTrue(okXml.includes('사업장 (권고)'), '12.2가 사업장 절차를 권고로 구분');
assertTrue(okXml.includes('본 사업장의 실제 적용 여부는 확인되지 않았다'), '12.2가 실사하지 않은 사실을 밝힘');
assertTrue(okXml.includes('도구 내부 검사 + 권고 절차'), '부속서 C가 12.2를 고정 문안으로 분류');
assertTrue(!okXml.includes('12 모니터링 / 15 증빙'), '부속서 C가 12.2를 「사용자 입력」에 묶지 않음');

// [P1] 9장 — 전구물질 0건은 「찾지 못했다」가 아니다. 수행하지 않은 조회를 실패한 조회로 쓰면
// 닫을 수 없는 「확인 필요(자료)」가 등록부에 등재된다.
const noPrecursorDv = reportModule.createCalculationReport({
    ...baseInput(), precursors: [],
    results: [{ ...baseResult, precursor_see: 0, precursor_direct_see: 0, precursor_indirect_see: 0,
        see_direct_incl_precursor: 240.009264 / 8000, see_indirect_incl_precursor: 734.4 / 8000,
        see_cbam_basis: 240.009264 / 8000, see_informational_total: 240.009264 / 8000 + 734.4 / 8000 }],
    defaultValues: dvReference,
});
const noPrecursorXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await noPrecursorDv.blob.arrayBuffer()))['word/document.xml']);
assertTrue(!noPrecursorXml.includes('대체 가능한 공식 기본값을 찾지 못해'), '전구물질 0건에서 조회 실패를 진술하지 않음');
assertTrue(noPrecursorXml.includes('DV 대체 민감도의 대상이 없다'), '전구물질 0건은 해당 없음으로 진술');
assertTrue(noPrecursorXml.includes('구매 전구물질이 없어 공식 기본값(DV) 대조 대상이 없다'), '9장 서문이 하지 않은 대조를 서술하지 않음');
assertTrue(!noPrecursorXml.includes('markup 적용 여부·방식은 확인 필요(규정)'), '적용하지 않은 DV의 규정 공백을 등록부에 올리지 않음');
// 제8장도 헤더만 있는 빈 표로 두지 않는다 — 제9장에만 이 처리를 넣고 바로 위 장은 빠뜨렸었다.
assertTrue(noPrecursorXml.includes('구매 전구물질이 없다 — 해당 없음'), '제8장이 전구물질 0건을 명시');
// 같은 사실을 장 안에서 되풀이하지 않는다(서문 + 9.2로 충분).
assertEqual(
    (noPrecursorXml.replace(/<[^>]+>/g, '').match(/구매 전구물질이 없어/g) ?? []).length,
    2,
    '제9장이 「전구물질 없음」을 서문·9.2 두 번만 말함'
);
// 반대 방향 — 전구물질이 있는데 DV 행을 못 찾은 경우는 **진짜** 조회 실패이므로 그 문장이 남아야 한다.
assertTrue(dvXml.includes('markup을 포함한'), 'R6 전제: 전구물질이 있으면 9.2 민감도가 정상 산출');
// 대조 대상이 0건이면 워크북 미연결도 결손이 아니다. 채울 수 없는 항목을 등록부에 남기지 않는다.
const noPrecursorNoDv = reportModule.createCalculationReport({
    ...baseInput(), precursors: [],
    results: [{ ...baseResult, precursor_see: 0, precursor_direct_see: 0, precursor_indirect_see: 0,
        see_direct_incl_precursor: 240.009264 / 8000, see_indirect_incl_precursor: 734.4 / 8000,
        see_cbam_basis: 240.009264 / 8000, see_informational_total: 240.009264 / 8000 + 734.4 / 8000 }],
});
const noPrecursorNoDvXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await noPrecursorNoDv.blob.arrayBuffer()))['word/document.xml']);
assertTrue(!noPrecursorNoDvXml.includes('공식 기본값 워크북을 연결한 뒤 보고서를 다시 생성하세요'), '전구물질 0건에서 워크북 미연결을 결손으로 세지 않음');
// 워크북 미연결 분기에서도 「전구물질 없음」을 되풀이하지 않는다 — 서문이 이미 말했다.
assertEqual(
    (noPrecursorNoDvXml.replace(/<[^>]+>/g, '').match(/구매 전구물질이 없어/g) ?? []).length,
    1,
    '워크북 미연결 + 전구물질 0건에서 제9장이 같은 사실을 한 번만 말함'
);
assertTrue(!noPrecursorNoDv.issues.some((issue) => issue.gate === 'G6'), '전구물질 0건에서 G6 경고를 띄우지 않음');
// 전구물질이 있는데 워크북이 없으면 그건 **진짜** 결손이다 — 반대 방향도 잠근다.
const withPrecursorNoDv = reportModule.createCalculationReport(baseInput());
assertTrue(withPrecursorNoDv.issues.some((issue) => issue.gate === 'G6'), '전구물질이 있으면 워크북 미연결에 G6 경고');

// [P2] 6.4 정합성 점검의 한계 고지 — 지도 흐름에서 직접배출량은 배출원 합계의 캐시라 이 대조는 항등식이다.
assertTrue(okXml.includes('이 점검은 항등식이며 어떤 오류도 검출하지 않는다'), '6.4가 항등식 가능성을 고지');
assertTrue(!okXml.includes('배출원이 1건인 공정에서는 이 점검이 전기(轉記) 오류 검출에 한정된다(제6.4장). '), '13장 정확성도 같은 한계로 갱신');

// [P2] 부속서 A의 연소 산식은 제5.1장과 **같은 상수**여야 한다. 따로 적으면 CF·화석 분율이 또 빠진다.
assertTrue(okXml.includes('연소 배출: E직접 = 활동자료 AD'), '부속서 A 연소식이 5.1과 같은 문안');
assertTrue(okXml.includes('전환계수 CF × 화석 분율'), '부속서 A 연소식에 CF·화석 분율 포함');
assertTrue(!okXml.includes('E = AD × NCV × EF ÷ 1,000 × OxF'), '부속서 A의 옛 축약식 제거');
const combustionCount = (okXml.match(/전환계수 CF × 화석 분율 ÷ 1,000/g) ?? []).length;
assertEqual(combustionCount, 2, '연소식이 5.1과 부속서 A 두 곳에 같은 문자열로 인쇄');

// [P2] 1장이 제공하지 않는 추적 경로를 제공한다고 선언하지 않는다.
assertTrue(!okXml.includes('증빙의 추적 경로를 제공한다'), '1장이 추적 경로 제공을 완료형으로 선언하지 않음');
assertTrue(okXml.includes('등록부가 해소되기 전에는 추적 경로가 완결되지 않는다'), '1장이 등록부를 가리킴');

// [P3] 7장 배출량 자릿수 — 표지가 선언한 4자리 규칙을 같은 문서가 어기고 있었다.
assertTrue(okXml.includes('734.4000 tCO2e'), '7장 간접배출량이 소수 4자리');
assertTrue(okXml.includes('1,600.0000 MWh'), '7장 전력 사용량이 소수 4자리');

// [P3] 표지·5.1의 대상 GHG는 조회된 품목군 분야에서 파생돼야 한다.
// 문서 전체에서 문자열만 찾으면 **한 곳만 되돌려도 다른 곳이 대신 통과시킨다** — 실제로
// 이 게이트의 첫 판이 표지 전용 변형을 놓쳤다. 두 자리를 각각 잘라서 본다.
const coverSlice = okXml.slice(0, okXml.indexOf('1. 요약'));
const methodSlice = okXml.slice(okXml.indexOf('5.1 직접배출'), okXml.indexOf('5.2 간접배출'));
assertTrue(coverSlice.length > 0 && methodSlice.length > 0, 'R6 전제: 표지·5.1 구간 파싱');
assertTrue(coverSlice.includes('조회된 품목군이 모두 Iron and steel 분야'), '표지 GHG 범위가 품목군 조회에서 파생');
assertTrue(methodSlice.includes('조회된 품목군이 모두 Iron and steel 분야'), '5.1 GHG 범위도 품목군 조회에서 파생');
assertTrue(!okXml.includes('철강 품목의 CBAM 대상 GHG'), '표지가 「철강 품목」 고정 리터럴을 쓰지 않음');
assertTrue(!okXml.includes('철강 품목의 CBAM 대상 온실가스는 CO2'), '5.1도 같은 고정 리터럴을 쓰지 않음');
// 비철강 품목이 섞이면 두 곳 모두 단정을 거둬야 한다(CH4·N2O 배제까지 인쇄하면 그 자체가 근거 없는 단정).
const nonSteelProduct = at({ id: 'p7', name: '요소', hs_code: '3102', cn_code: '31021010', hs_group: '31', product_type_enum: 'OTHER', unit: 'tonne', reporting_scope: 'CBAM_GOOD' });
const nonSteelXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await reportModule.createCalculationReport({
    ...baseInput(), precursors: [],
    products: [baseProduct, nonSteelProduct],
    processes: [baseProcess, at({ ...baseProcess, id: 'proc7', product_id: 'p7' })],
    sourceStreams: [baseStream, at({ ...baseStream, id: 's7', process_id: 'proc7' })],
    results: [
        { ...baseResult, precursor_see: 0, precursor_direct_see: 0, precursor_indirect_see: 0,
            see_direct_incl_precursor: 240.009264 / 8000, see_indirect_incl_precursor: 734.4 / 8000,
            see_cbam_basis: 240.009264 / 8000, see_informational_total: 240.009264 / 8000 + 734.4 / 8000 },
        { ...baseResult, id: 'r7', process_id: 'proc7', product_id: 'p7', product_name: '요소', cn_code: '31021010',
            precursor_see: 0, precursor_direct_see: 0, precursor_indirect_see: 0,
            see_direct_incl_precursor: 240.009264 / 8000, see_indirect_incl_precursor: 734.4 / 8000,
            see_cbam_basis: 240.009264 / 8000, see_informational_total: 240.009264 / 8000 + 734.4 / 8000 },
    ],
}).blob.arrayBuffer()))['word/document.xml']);
assertTrue(!nonSteelXml.includes('조회된 품목군이 모두 Iron and steel 분야'), '비철강 품목이 섞이면 철강 단정을 거둠');
assertTrue(!nonSteelXml.includes('CH4·N2O는 본 산정의 대상 GHG에 포함되지 않는다'), '분야 미확정에서 CH4·N2O 배제를 단정하지 않음');
assertTrue(nonSteelXml.includes('N2O·PFC 등 다른 대상 GHG가 요구되는지 확인해야 한다'), '분야 미확정 시 다른 GHG 확인을 요구');

// [P3] 11장 — 원산지국 ETS 할당대상 판정 기준은 앱이 보유하지 않는 규정 사실이다.
assertTrue(!okXml.includes('법인 단위 배출량으로 판단되므로'), '11장이 원산지국 규정을 단정하지 않음');
assertTrue(okXml.includes('할당대상 판정 기준을 보유하지 않으므로'), '11장이 앱이 아는 사실로 근거를 바꿈');

// [P3] 3.1 — 「하드코딩이 아니다」를 하드코딩 문안으로 주장하지 않는다(조회하지 않은 6종 landscape).
assertTrue(!okXml.includes('철강계 품목군 6종 중'), '3.1이 조회하지 않은 품목군 landscape를 주장하지 않음');
assertTrue(okXml.includes('품목군 이름으로 일반화한 고정 규칙이 아니다'), '3.1이 개별 판정 사실은 계속 진술');

// [P3] 1장 요약표 반올림 각주 — 구성 항목 합과 기준값이 어긋나 보이는데 설명이 없었다.
// 각주 판단만 가져오고 issues는 합치지 않는다(10장이 이미 밀어 넣어 13장 경고 건수가 두 번 세진다).
const summaryRoundingXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await roundingCase.blob.arrayBuffer()))['word/document.xml']);
assertTrue(summaryRoundingXml.includes('소계·총계 표시값과 마지막 자리에서 다를 수 있다'), '1장 요약표에 반올림 각주');
assertTrue(!okXml.includes('소계·총계 표시값과 마지막 자리에서 다를 수 있다'), '반올림 차이가 없으면 요약 각주도 없음(남발 방지)');
const summaryRoundingWarns = roundingCase.issues.filter((issue) => issue.gate === 'G1' && /반올림 표기/.test(issue.message)).length;
assertEqual(summaryRoundingWarns, 1, '반올림 경고가 요약장 추가로 중복 계상되지 않음(10장이 이미 밀어 넣는다)');

console.log('Calculation report verification passed (docx-builder + report-format + P2 gates + P3 DV + P4 사용자 입력/G5 + 재감사 R1·R2·R3·R4·R5·R6 회귀).');
