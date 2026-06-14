import { strToU8, zipSync } from 'fflate';
import type { LocalCalculationResult } from './calculation-engine';
import type { ExportChecklistSummary, EuExportReadinessResult, EuTemplateExportVerificationResult } from './eu-template-export';
import type {
    CbamBackupFile,
    Installation,
    Product,
    ProductionProcess,
    PurchasedPrecursor,
    ReportingPeriod,
    SourceStream,
} from './local-db';

type EvidenceTone = 'ready' | 'review' | 'missing' | 'optional';

interface EvidenceChecklistRow {
    area: string;
    evidence: string;
    appRecord: string;
    status: string;
    tone: EvidenceTone;
    note: string;
}

export interface DeliveryPackageInput {
    backup: CbamBackupFile;
    exportChecklist: ExportChecklistSummary;
    exportVerification: EuTemplateExportVerificationResult;
    exportWorkbookBlob: Blob;
    exportWorkbookFilename: string;
    generatedAt: Date;
    installations: Installation[];
    periods: ReportingPeriod[];
    precursors: PurchasedPrecursor[];
    processes: ProductionProcess[];
    products: Product[];
    readiness: EuExportReadinessResult;
    results: LocalCalculationResult[];
    sourceStreams: SourceStream[];
    templateFilename: string;
    writtenCellCount: number;
}

export interface DeliveryPackageResult {
    blob: Blob;
    filename: string;
    files: string[];
}

function formatStamp(date: Date) {
    return date.toISOString().slice(0, 19).replace(/[-:T]/g, '');
}

function formatDateTime(date: Date | string | undefined) {
    if (!date) {
        return '-';
    }

    const parsed = typeof date === 'string' ? new Date(date) : date;

    if (Number.isNaN(parsed.getTime())) {
        return typeof date === 'string' ? date : '-';
    }

    return parsed.toISOString().replace('T', ' ').slice(0, 19);
}

function formatNumber(value: number | undefined, maximumFractionDigits = 4) {
    if (value === undefined || !Number.isFinite(value)) {
        return '-';
    }

    return new Intl.NumberFormat('ko-KR', { maximumFractionDigits }).format(value);
}

function formatPercent(value: number | undefined) {
    if (value === undefined || !Number.isFinite(value)) {
        return '-';
    }

    return new Intl.NumberFormat('ko-KR', {
        maximumFractionDigits: 1,
        style: 'percent',
    }).format(value);
}

function xmlEscape(value: string | number | undefined) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function paragraph(text: string, style?: 'Title' | 'Heading1' | 'Heading2' | 'Note') {
    const pStyle = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
    const runs = text.split('\n').map((line, index) => {
        const breakXml = index === 0 ? '' : '<w:br/>';
        return `<w:r>${breakXml}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`;
    }).join('');

    return `<w:p>${pStyle}${runs}</w:p>`;
}

function cell(text: string | number | undefined) {
    const paragraphs = String(text ?? '-')
        .split('\n')
        .map((line) => paragraph(line))
        .join('');

    return `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${paragraphs}</w:tc>`;
}

function table(headers: string[], rows: Array<Array<string | number | undefined>>) {
    const border = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/></w:tblBorders>';
    const headerRow = `<w:tr>${headers.map((header) => cell(header)).join('')}</w:tr>`;
    const bodyRows = rows.map((row) => `<w:tr>${row.map((value) => cell(value)).join('')}</w:tr>`).join('');

    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${border}</w:tblPr>${headerRow}${bodyRows}</w:tbl>`;
}

function docxStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Malgun Gothic"/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Malgun Gothic"/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="280" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="475569"/><w:sz w:val="18"/></w:rPr></w:style>
</w:styles>`;
}

function docxContentTypesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function docxRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function documentRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function corePropsXml(title: string, generatedAt: Date) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(title)}</dc:title>
  <dc:creator>CBAM Local</dc:creator>
  <cp:lastModifiedBy>CBAM Local</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${generatedAt.toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${generatedAt.toISOString()}</dcterms:modified>
</cp:coreProperties>`;
}

function appPropsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>CBAM Local</Application>
</Properties>`;
}

function createDocx(title: string, bodyXml: string, generatedAt: Date) {
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1080" w:bottom="1440" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`;
    const files: Record<string, Uint8Array> = {
        '[Content_Types].xml': strToU8(docxContentTypesXml()),
        '_rels/.rels': strToU8(docxRelsXml()),
        'docProps/app.xml': strToU8(appPropsXml()),
        'docProps/core.xml': strToU8(corePropsXml(title, generatedAt)),
        'word/_rels/document.xml.rels': strToU8(documentRelsXml()),
        'word/document.xml': strToU8(documentXml),
        'word/styles.xml': strToU8(docxStylesXml()),
    };

    return zipSync(files);
}

function displayPeriod(periods: ReportingPeriod[]) {
    if (periods.length === 0) {
        return '-';
    }

    return periods.map((period) => `${period.name} (${period.start_date} - ${period.end_date})`).join('\n');
}

function statusFromTone(tone: EvidenceTone) {
    if (tone === 'ready') {
        return 'Ready / 준비';
    }

    if (tone === 'missing') {
        return 'Missing / 누락';
    }

    if (tone === 'optional') {
        return 'Optional / 선택';
    }

    return 'Review / 검토';
}

function createCalculationBasisSummaryDocx(input: DeliveryPackageInput) {
    const installationNames = input.installations.map((installation) =>
        [installation.local_name, installation.name, installation.country].filter(Boolean).join(' / ')
    );
    const overviewRows = [
        ['Generated at / 생성 시각', formatDateTime(input.generatedAt)],
        ['Source EU template / EU 원본 템플릿', input.templateFilename],
        ['Export workbook / Export Excel', input.exportWorkbookFilename],
        ['Installations / 사업장', installationNames.join('\n') || '-'],
        ['Reporting period / 보고기간', displayPeriod(input.periods)],
        ['Products / 제품 수', formatNumber(input.products.length, 0)],
        ['Processes / 생산공정 수', formatNumber(input.processes.length, 0)],
        ['Source streams / 배출원 자료 수', formatNumber(input.sourceStreams.length, 0)],
        ['Purchased precursors / 구매 전구물질 수', formatNumber(input.precursors.length, 0)],
        ['Export readiness / Export 준비상태', `${input.readiness.errorCount} error(s), ${input.readiness.warningCount} warning(s)`],
    ];
    const productRows = input.results.map((result) => [
        result.product_name,
        result.cn_code || result.hs_code || '-',
        result.process_name,
        `${formatNumber(result.output_mass_t)} t`,
        formatPercent(result.allocation_share),
        formatNumber(result.see_direct_incl_precursor),
        formatNumber(result.see_indirect_incl_precursor),
        formatNumber(result.see_cbam_basis),
        formatNumber(result.see_informational_total),
        result.warnings.length > 0 ? result.warnings.join('\n') : 'None / 없음',
    ]);
    const processRows = input.processes.map((process) => [
        process.name,
        process.production_route || '-',
        `${formatNumber(process.output_mass_t)} t`,
        `${formatNumber(process.direct_attributable_emissions_tco2e)} tCO2e`,
        `${formatNumber(process.electricity_mwh)} MWh`,
        `${formatNumber(process.electricity_ef_tco2e_per_mwh)} tCO2e/MWh`,
        process.electricity_ef_source || 'Not classified / 미분류',
    ]);
    const precursorRows = input.precursors.map((precursor) => [
        precursor.name,
        precursor.precursor_cn_code || '-',
        precursor.supplier_country || '-',
        precursor.supplier_installation || '-',
        precursor.data_mode,
        precursor.verification_status,
        `${formatNumber(precursor.consumed_mass_t)} t`,
        formatNumber(precursor.direct_see_tco2e_per_t),
        formatNumber(precursor.indirect_see_tco2e_per_t),
        precursor.source || '-',
    ]);
    const issueRows = input.readiness.issues.map((issue) => [
        issue.severity.toUpperCase(),
        issue.area,
        issue.message,
    ]);

    const body = [
        paragraph('CBAM Calculation Basis Summary / CBAM 산정근거 요약 보고서', 'Title'),
        paragraph('This document is a bilingual working summary generated by CBAM Local. It supports importer communication and internal review; it is not an official verification report or legal opinion.\n이 문서는 CBAM Local이 생성한 국영문 실무 요약입니다. 수입자 커뮤니케이션과 내부 검토를 지원하지만 공식 검증보고서 또는 법률 자문을 대체하지 않습니다.', 'Note'),
        paragraph('1. Package Overview / 패키지 개요', 'Heading1'),
        table(['Field / 항목', 'Value / 값'], overviewRows),
        paragraph('2. Product SEE Summary / 제품별 SEE 요약', 'Heading1'),
        productRows.length > 0
            ? table(
                ['Product / 제품', 'CN/HS', 'Process / 공정', 'Output / 생산량', 'Allocation / 배분율', 'Direct SEE / 직접 SEE', 'Indirect SEE / 간접 SEE', 'CBAM basis SEE / CBAM 산정 기준 SEE', 'Total SEE / 내부검토 총 SEE', 'Warnings / 경고'],
                productRows
            )
            : paragraph('No calculation results are available. / 산정 결과가 없습니다.'),
        paragraph('3. Process Basis / 생산공정 산정 근거', 'Heading1'),
        processRows.length > 0
            ? table(['Process / 공정', 'Route / 생산경로', 'Output / 생산량', 'Direct emissions / 직접배출량', 'Electricity / 전력', 'Electricity EF / 전력계수', 'EF source / 계수 출처'], processRows)
            : paragraph('No production processes are available. / 생산공정이 없습니다.'),
        paragraph('4. Purchased Precursors / 구매 전구물질', 'Heading1'),
        precursorRows.length > 0
            ? table(['Precursor / 전구물질', 'CN', 'Country / 국가', 'Supplier installation / 공급 사업장', 'Data mode / 자료모드', 'Verification / 검증상태', 'Consumed / 투입량', 'Direct SEE', 'Indirect SEE', 'Source / 출처'], precursorRows)
            : paragraph('No purchased precursors are recorded. / 등록된 구매 전구물질이 없습니다.'),
        paragraph('5. Export Review Issues / Export 검토 항목', 'Heading1'),
        issueRows.length > 0
            ? table(['Severity / 구분', 'Area / 영역', 'Message / 메시지'], issueRows)
            : paragraph('No blocking issues or warnings are recorded by the export gate. / Export 게이트에서 오류 또는 경고가 없습니다.'),
        paragraph('6. Final Review Notes / 최종 검토 메모', 'Heading1'),
        paragraph('- Open the generated Communication Template in Microsoft Excel and recalculate official formulas.\n- Compare Summary_Products formula results with this working summary.\n- Keep the .cbam backup under company security policy.\n- Share the .cbam backup only with an authorised importer, consultant, or verifier when explicitly intended.\n- 생성된 Communication Template을 Microsoft Excel에서 열고 공식 수식을 재계산하세요.\n- Summary_Products 공식 결과와 이 요약값의 차이를 검토하세요.\n- .cbam 백업은 회사 보안정책에 맞게 보관하세요.\n- .cbam 백업은 명시적으로 의도한 경우에만 수입자, 컨설턴트, 검증기관에 공유하세요.'),
    ].join('');

    return createDocx('CBAM Calculation Basis Summary', body, input.generatedAt);
}

function buildEvidenceRows(input: DeliveryPackageInput): EvidenceChecklistRow[] {
    const rows: EvidenceChecklistRow[] = [
        {
            area: 'Installation information / 사업장 정보',
            evidence: 'Legal name, country, address, contact person / 법인명, 국가, 주소, 담당자',
            appRecord: input.installations.length > 0 ? input.installations.map((item) => item.name).join(', ') : '-',
            status: statusFromTone(input.installations.length > 0 ? 'ready' : 'missing'),
            tone: input.installations.length > 0 ? 'ready' : 'missing',
            note: 'Mapped to A_InstData. / A_InstData에 반영됩니다.',
        },
        {
            area: 'Reporting period / 보고기간',
            evidence: 'Start and end dates / 시작일과 종료일',
            appRecord: displayPeriod(input.periods),
            status: statusFromTone(input.periods.length > 0 ? 'ready' : 'missing'),
            tone: input.periods.length > 0 ? 'ready' : 'missing',
            note: 'Confirm it matches importer reporting needs. / 수입자 보고 기준 기간과 일치하는지 확인하세요.',
        },
        {
            area: 'Excel formula recalculation / Excel 공식 수식 재계산',
            evidence: 'Microsoft Excel recalculation record / Microsoft Excel 재계산 확인 기록',
            appRecord: `${input.exportVerification.checkedCellCount} cell(s) checked by CBAM Local / 앱 검증 셀 ${input.exportVerification.checkedCellCount}개`,
            status: statusFromTone('review'),
            tone: 'review',
            note: 'Manual Excel recalculation is still required after download. / 다운로드 후 Excel 재계산 확인이 필요합니다.',
        },
        {
            area: 'Internal approval / 내부 승인',
            evidence: 'Approver, review date, comments / 승인자, 검토일, 의견',
            appRecord: 'Not stored in CBAM Local / 앱에 저장하지 않음',
            status: statusFromTone('optional'),
            tone: 'optional',
            note: 'Add company approval record before external sharing. / 외부 공유 전 사내 승인 기록을 추가하세요.',
        },
    ];

    for (const product of input.products) {
        const cnCode = product.cn_code || product.hs_code;
        rows.push({
            area: `Product CN code / 제품 CN 코드: ${product.name}`,
            evidence: 'CN 8-digit classification basis / CN 8자리 분류 근거',
            appRecord: cnCode || '-',
            status: statusFromTone(cnCode && cnCode.replace(/\D/g, '').length >= 8 ? 'ready' : 'review'),
            tone: cnCode && cnCode.replace(/\D/g, '').length >= 8 ? 'ready' : 'review',
            note: 'Keep customs classification evidence when available. / 품목분류 근거가 있으면 함께 보관하세요.',
        });
    }

    for (const process of input.processes) {
        rows.push({
            area: `Production output / 생산량: ${process.name}`,
            evidence: 'ERP, MES, production report, sales/internal consumption record / ERP, MES, 생산실적, 출하·내부소비 자료',
            appRecord: `${formatNumber(process.output_mass_t)} t total, ${formatNumber(process.market_output_mass_t)} t market, ${formatNumber(process.internal_consumption_mass_t)} t internal`,
            status: statusFromTone(process.output_mass_t > 0 ? 'ready' : 'missing'),
            tone: process.output_mass_t > 0 ? 'ready' : 'missing',
            note: 'Review allocation basis if multiple products share a process. / 복수 제품 공정이면 배분 기준을 검토하세요.',
        });
        rows.push({
            area: `Electricity and EF / 전력 및 계수: ${process.name}`,
            evidence: 'Electricity meter, bill, eligible emission factor source / 전력 계량자료, 고지서, 인정 가능한 배출계수 출처',
            appRecord: `${formatNumber(process.electricity_mwh)} MWh, EF ${formatNumber(process.electricity_ef_tco2e_per_mwh)}, source ${process.electricity_ef_source || '-'}`,
            status: statusFromTone(process.electricity_mwh > 0 && process.electricity_ef_source ? 'ready' : 'review'),
            tone: process.electricity_mwh > 0 && process.electricity_ef_source ? 'ready' : 'review',
            note: 'CBAM electricity EF hierarchy should be checked. / CBAM 전력계수 위계를 확인하세요.',
        });
    }

    for (const sourceStream of input.sourceStreams) {
        rows.push({
            area: `Direct emissions source stream / 직접배출 배출원: ${sourceStream.name}`,
            evidence: 'Activity data, NCV, emission factor, oxidation/conversion factor / 활동자료, 순발열량, 배출계수, 산화·전환계수',
            appRecord: `${formatNumber(sourceStream.activity_data)} ${sourceStream.activity_unit}, EF ${formatNumber(sourceStream.emission_factor_tco2e_per_unit)}, source ${sourceStream.source || '-'}`,
            status: statusFromTone(sourceStream.source ? 'ready' : 'missing'),
            tone: sourceStream.source ? 'ready' : 'missing',
            note: 'Keep invoices, meter readings, lab data, or factor references. / 고지서, 검침표, 시험성적서, 계수 근거를 보관하세요.',
        });
    }

    for (const precursor of input.precursors) {
        const needsReview = !precursor.source || (precursor.data_mode !== 'DEFAULT' && precursor.verification_status === 'UNVERIFIED');
        rows.push({
            area: `Purchased precursor SEE / 구매 전구물질 SEE: ${precursor.name}`,
            evidence: 'Supplier Communication Template, verified SEE, or official default value basis / 공급사 Communication Template, 검증된 SEE 또는 공식 기본값 근거',
            appRecord: `${precursor.data_mode}, ${precursor.verification_status}, direct ${formatNumber(precursor.direct_see_tco2e_per_t)}, indirect ${formatNumber(precursor.indirect_see_tco2e_per_t)}, source ${precursor.source || '-'}`,
            status: statusFromTone(needsReview ? 'review' : 'ready'),
            tone: needsReview ? 'review' : 'ready',
            note: precursor.data_mode === 'DEFAULT'
                ? `Default value justification / 기본값 사유: ${precursor.default_value_justification || '-'}`
                : 'Supplier confirmation or verifier evidence should be retained. / 공급사 확인 또는 검증 근거를 보관하세요.',
        });
    }

    return rows;
}

function createEvidenceChecklistDocx(input: DeliveryPackageInput) {
    const rows = buildEvidenceRows(input);
    const checklistRows = rows.map((row) => [
        row.area,
        row.evidence,
        row.appRecord,
        row.status,
        row.note,
    ]);
    const readinessRows = input.exportChecklist.items.map((item) => [
        item.label,
        item.description,
        item.status,
        item.complete ? 'Complete / 완료' : 'Review / 검토',
    ]);

    const body = [
        paragraph('CBAM Evidence Checklist / CBAM 증빙 체크리스트', 'Title'),
        paragraph('This checklist is a bilingual working checklist for importer communication, internal approval, and verification preparation. It does not replace a verifier report or company document retention policy.\n이 체크리스트는 수입자 커뮤니케이션, 내부 승인, 검증 준비를 위한 국영문 실무 체크리스트입니다. 검증보고서 또는 회사 문서보존 정책을 대체하지 않습니다.', 'Note'),
        paragraph('1. Evidence Items / 증빙 항목', 'Heading1'),
        table(['Area / 영역', 'Evidence / 증빙', 'App record / 앱 기록', 'Status / 상태', 'Notes / 비고'], checklistRows),
        paragraph('2. Export Gate Checklist / Export 게이트 체크리스트', 'Heading1'),
        readinessRows.length > 0
            ? table(['Item / 항목', 'Description / 설명', 'Status / 상태', 'Completion / 완료 여부'], readinessRows)
            : paragraph('No export checklist items are available. / Export 체크리스트 항목이 없습니다.'),
        paragraph('3. Sharing Caution / 공유 주의', 'Heading1'),
        paragraph('The .cbam backup in this package can contain business-sensitive production, emissions, precursor, scenario, and local setting data. Do not share it with an importer, consultant, or verifier unless the company has explicitly approved that transfer.\n이 패키지의 .cbam 백업에는 생산량, 배출량, 전구물질, 시나리오, 로컬 설정 등 민감한 업무자료가 포함될 수 있습니다. 회사가 명시적으로 승인하지 않은 경우 수입자, 컨설턴트, 검증기관에 공유하지 마세요.'),
    ].join('');

    return createDocx('CBAM Evidence Checklist', body, input.generatedAt);
}

function createReadmeText(input: DeliveryPackageInput, files: string[]) {
    return [
        'CBAM Delivery Package / CBAM 전달 패키지',
        '',
        `Generated at / 생성 시각: ${formatDateTime(input.generatedAt)}`,
        `Source EU template / EU 원본 템플릿: ${input.templateFilename}`,
        '',
        'Included files / 포함 파일:',
        ...files.map((file) => `- ${file}`),
        '',
        'Important / 중요:',
        '- The filled Communication Template should be opened in Microsoft Excel and recalculated before external sharing.',
        '- The DOCX files are editable working summaries/checklists, not official verification reports.',
        '- The .cbam backup can contain sensitive local project data. Share it only when explicitly intended.',
        '- 작성된 Communication Template은 외부 공유 전 Microsoft Excel에서 열고 재계산해야 합니다.',
        '- DOCX 파일은 수정 가능한 실무 요약/체크리스트이며 공식 검증보고서가 아닙니다.',
        '- .cbam 백업에는 민감한 로컬 프로젝트 자료가 포함될 수 있으므로 명시적으로 의도한 경우에만 공유하세요.',
    ].join('\n');
}

export function createCbamBackupFilename(exportedAt?: string) {
    const date = exportedAt ? new Date(exportedAt) : new Date();
    const stamp = Number.isNaN(date.getTime()) ? formatStamp(new Date()) : formatStamp(date);

    return `cbam-local-backup-${stamp}.cbam`;
}

export function createDeliveryPackageFilename(generatedAt = new Date()) {
    return `CBAM_delivery_package_${formatStamp(generatedAt)}.zip`;
}

export async function createDeliveryPackage(input: DeliveryPackageInput): Promise<DeliveryPackageResult> {
    const exportWorkbookPath = `01_${input.exportWorkbookFilename}`;
    const summaryDocxPath = '02_Calculation_Basis_Summary_KO-EN.docx';
    const checklistDocxPath = '03_Evidence_Checklist_KO-EN.docx';
    const backupPath = `internal_archive/04_${createCbamBackupFilename(input.backup.manifest.exported_at)}`;
    const logPath = 'internal_archive/05_export-log.json';
    const readmePath = 'README_KO-EN.txt';
    const files = [exportWorkbookPath, summaryDocxPath, checklistDocxPath, backupPath, logPath, readmePath];
    const exportWorkbookBytes = new Uint8Array(await input.exportWorkbookBlob.arrayBuffer());
    const log = {
        generated_at: input.generatedAt.toISOString(),
        source_template_filename: input.templateFilename,
        export_workbook_filename: input.exportWorkbookFilename,
        written_cell_count: input.writtenCellCount,
        checked_cell_count: input.exportVerification.checkedCellCount,
        export_verification_valid: input.exportVerification.isValid,
        export_readiness: {
            error_count: input.readiness.errorCount,
            warning_count: input.readiness.warningCount,
            is_submission_ready: input.readiness.isSubmissionReady,
        },
        counts: {
            installations: input.installations.length,
            periods: input.periods.length,
            products: input.products.length,
            processes: input.processes.length,
            source_streams: input.sourceStreams.length,
            precursors: input.precursors.length,
            calculation_results: input.results.length,
        },
        caution:
            '.cbam backup can contain sensitive local project data. Share only when explicitly intended.',
    };
    const zipFiles: Record<string, Uint8Array> = {
        [exportWorkbookPath]: exportWorkbookBytes,
        [summaryDocxPath]: createCalculationBasisSummaryDocx(input),
        [checklistDocxPath]: createEvidenceChecklistDocx(input),
        [backupPath]: strToU8(JSON.stringify(input.backup, null, 2)),
        [logPath]: strToU8(JSON.stringify(log, null, 2)),
        [readmePath]: strToU8(createReadmeText(input, files)),
    };

    return {
        blob: new Blob([zipSync(zipFiles)], { type: 'application/zip' }),
        filename: createDeliveryPackageFilename(input.generatedAt),
        files,
    };
}
