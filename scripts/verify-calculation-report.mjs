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

// 게이트 G1 — 구성 표시값 합 = 소계 표시값
const okSum = fmt.checkDisplaySum({
  label: 'SEE 직접 소계',
  parts: [240.009264 / 8000, 1.025 * 1.95],
  total: 240.009264 / 8000 + 1.025 * 1.95,
});
assertTrue(okSum.isValid, 'checkDisplaySum 정합 케이스');
assertEqual(okSum.displayedPartsSum, 2.0288, 'checkDisplaySum 구성합');
assertEqual(okSum.displayedTotal, 2.0288, 'checkDisplaySum 소계');
// 불일치 케이스는 반드시 잡아내야 한다(게이트가 무력하면 안 됨)
const badSum = fmt.checkDisplaySum({ label: '인위적 불일치', parts: [0.03, 1.0], total: 1.5 });
assertEqual(String(badSum.isValid), 'false', 'checkDisplaySum 불일치 검출');

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
const prelude = [
    'src/lib/report-format.ts',
    'src/lib/docx-builder.ts',
    'src/lib/cbam-product-rules.ts',
    'src/lib/reporting-scope.ts',
    'src/lib/reference-workbooks.ts',
]
    .map((path) => readFileSync(path, 'utf8')
        .replace("import { strToU8, zipSync } from 'fflate';", 'const { strToU8, zipSync } = fflate;')
        .replace(/^import .*;\r?\n/gm, '')
        .replace(/^export /gm, ''))
    .join('\n');

const reportModule = (() => {
    const source = readFileSync('src/lib/calculation-report.ts', 'utf8')
        .replace(/^import .*;\r?\n/gm, '')
        .replace(/^import type[\s\S]*?;\r?\n/gm, '')
        .replace(/^export /gm, '');
    const compiled = ts.transpileModule(
        `${prelude}\n${source}\nglobalThis.__report = { createCalculationReport, createCalculationReportFilename };`,
        { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }
    ).outputText;
    const context = { fflate, console, Intl, Math, Number, String, Array, Object, Blob, Date, RegExp, Set, Error };
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
    direct_emissions_tco2e: 240.009264, indirect_emissions_applicable: false, indirect_emissions_rule: 'IRON_STEEL_CERTIFICATE_BASIS_EXCLUDED',
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

// 게이트 G1 — 소계가 구성 합과 어긋나면 반드시 차단해야 한다
let g1Blocked = false;
try {
    reportModule.createCalculationReport({
        ...baseInput(),
        results: [{ ...baseResult, see_direct_incl_precursor: baseResult.see_direct_incl_precursor + 0.01 }],
    });
} catch (error) {
    g1Blocked = /G1/.test(String(error.message));
}
assertTrue(g1Blocked, 'G1 표시값 불일치 → 발행 차단');

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
assertTrue(steelOnlyXml.includes('소비 전구물질 역시 모두 동일하게 직접배출만 고려되는 품목'), '3.1 철강 전구물질 문안');
assertTrue(!steelOnlyXml.includes('최종재로 전가될 수 있습니다'), '3.1 철강만일 땐 전가 경고 없음');

const mixed = reportModule.createCalculationReport({
    ...baseInput(),
    precursors: [basePrecursor, { ...basePrecursor, id: 'pr2', name: '알루미늄 전구물질', precursor_cn_code: '76011000' }],
});
const mixedXml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await mixed.blob.arrayBuffer()))['word/document.xml']);
assertTrue(mixedXml.includes('최종재로 전가될 수 있습니다'), '3.1 비직접전용 전구물질 → 전가 경고로 문안 분기');
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

console.log('Calculation report verification passed (docx-builder + report-format + P2 gates + P3 DV 대조).');
