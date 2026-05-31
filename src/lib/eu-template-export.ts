import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { BackupStatus, Installation, Product, ProductOutputLine, ProductionProcess, PurchasedPrecursor, ReportingPeriod, SourceStream } from './local-db';
import type { CnCodeOption } from './cn-code-options';
import type { ScenarioRiskSummary } from './scenario-calculation';
import { summarizeProductOutputLines } from './calculation-engine';
import { calculateSourceStreamEmissions } from './source-stream-calculation';
import { getIndirectEmissionsApplicability } from './cbam-product-rules';

export const REQUIRED_EU_TEMPLATE_SHEETS = [
    '0_Versions',
    'a_Contents',
    'b_Guidelines&Conditions',
    'c_CodeLists',
    'A_InstData',
    'B_EmInst',
    'C_Emissions&Energy',
    'D_Processes',
    'E_PurchPrec',
    'F_Tools',
    'G_FurtherGuidance',
    'Summary_Processes',
    'Summary_Products',
    'Summary_Communication',
    'InputOutput',
    'Parameters_Constants',
    'Parameters_CNCodes',
    'Translations',
    'VersionDocumentation',
];

export interface EuTemplateValidationResult {
    sheetNames: string[];
    missingSheets: string[];
    cnCodeCount: number;
    cnCodeMap: Map<string, string>;
    isValid: boolean;
}

export interface EuTemplateExportData {
    installations?: Installation[];
    periods?: ReportingPeriod[];
    processes: ProductionProcess[];
    productOutputLines?: ProductOutputLine[];
    sourceStreams?: SourceStream[];
    precursors: PurchasedPrecursor[];
    products: Product[];
}

type EuCnCodeMap = Map<string, string>;
type EuExportSheetName =
    | 'A_InstData'
    | 'B_EmInst'
    | 'C_Emissions&Energy'
    | 'D_Processes'
    | 'E_PurchPrec'
    | 'Summary_Products';

export interface EuTemplateExportCellWrite {
    sheetName: EuExportSheetName;
    cell: string;
    label: string;
    value: string | number;
    sourceId: string;
}

export interface EuTemplateExportVerificationResult {
    checkedCellCount: number;
    mismatches: Array<{
        sheetName: EuExportSheetName;
        cell: string;
        expected: string;
        actual: string;
        label: string;
    }>;
    isValid: boolean;
}

export interface EuTemplateExportCopyResult {
    blob: Blob;
    verification: EuTemplateExportVerificationResult;
    writtenCellCount: number;
}

export type EuExportIssueTarget =
    | { type: 'product'; id: string }
    | { type: 'process'; id: string }
    | { type: 'sourceStream'; id: string }
    | { type: 'precursor'; id: string };

export interface EuExportReadinessIssue {
    severity: 'error' | 'warning';
    area: '제품' | '생산공정' | '구매 전구물질' | '템플릿 한계';
    message: string;
    target?: EuExportIssueTarget;
}

export interface EuExportReadinessResult {
    issues: EuExportReadinessIssue[];
    errorCount: number;
    warningCount: number;
    canExportDraft: boolean;
    isSubmissionReady: boolean;
}

export function getEuExportIssueEditHref(issue: EuExportReadinessIssue): string | undefined {
    if (!issue.target) {
        return undefined;
    }

    const encodedId = encodeURIComponent(issue.target.id);

    if (issue.target.type === 'product') {
        return `/products?edit=${encodedId}`;
    }

    if (issue.target.type === 'process') {
        return `/processes?edit=${encodedId}`;
    }

    if (issue.target.type === 'sourceStream') {
        return `/source-streams?edit=${encodedId}`;
    }

    return `/precursors?edit=${encodedId}`;
}

export interface ExportChecklistItem {
    label: string;
    description: string;
    status: string;
    tone: 'success' | 'warning' | 'danger' | 'pending';
    complete: boolean;
    actionHref?: string;
    actionLabel?: string;
}

export interface ExportChecklistSummary {
    items: ExportChecklistItem[];
    reviewCount: number;
    isComplete: boolean;
}

export interface ExportChecklistInput {
    backupStatus: BackupStatus;
    lastExportResult?: { checkedCellCount: number };
    plannedCellWriteCount: number;
    readiness: EuExportReadinessResult;
    resultCount: number;
    scenarioAction: { href: string; label: string };
    scenarioRiskSummary: ScenarioRiskSummary;
    templateFileName?: string;
    validation?: EuTemplateValidationResult;
}

export interface EuExportDownloadStatusInput {
    backupStatus: BackupStatus;
    hasTemplateFile: boolean;
    readiness: EuExportReadinessResult;
    validation?: Pick<EuTemplateValidationResult, 'isValid'>;
}

const EU_GOODS = [
    'Cement',
    'Cement clinker',
    'Calcined clays ',
    'Aluminous cement',
    'Iron or steel products',
    'Crude steel',
    'Direct reduced iron',
    'Pig iron',
    'Alloys (FeMn, FeCr, FeNi)',
    'Sintered Ore',
    'Hydrogen',
    'Ammonia',
    'Nitric acid',
    'Urea',
    'Mixed fertilisers',
    'Aluminium products',
    'Unwrought aluminium',
    'Electricity (export to EU)',
];

const EU_GOODS_SET = new Set(EU_GOODS);
const EU_SOURCE_STREAM_METHODS = new Set(['Combustion', 'Process Emissions', 'Mass balance']);
const EU_SOURCE_STREAM_ACTIVITY_UNITS = new Set(['t', 'Nm3']);
const STEEL_FINISHED_GOODS_PREFIXES = ['7208', '7209', '7210', '7211', '7212', '7213', '7214', '7215', '7216', '7217', '7218', '7219', '7220', '7221', '7222', '7223', '7224', '7225', '7226', '7227', '7228', '7229', '73'];
const CRUDE_STEEL_PREFIXES = ['7206', '7207'];
const PIG_IRON_PREFIXES = ['7201'];
const DIRECT_REDUCED_IRON_PREFIXES = ['7203'];

function normalizeHsCode(hsCode: string): string {
    return hsCode.replace(/\D/g, '');
}

function getProductCnOrHsCode(product: Product): string {
    return normalizeHsCode(product.cn_code?.trim() || product.hs_code);
}

function mapProductToEuGood(product: Product | undefined, cnCodeMap?: EuCnCodeMap): string | undefined {
    if (!product) {
        return undefined;
    }

    const hsCode = getProductCnOrHsCode(product);
    const templateGood = cnCodeMap?.get(hsCode);

    if (templateGood) {
        return templateGood;
    }

    if (EU_GOODS_SET.has(product.product_type_enum)) {
        return product.product_type_enum;
    }

    if (PIG_IRON_PREFIXES.some((prefix) => hsCode.startsWith(prefix))) {
        return 'Pig iron';
    }

    if (DIRECT_REDUCED_IRON_PREFIXES.some((prefix) => hsCode.startsWith(prefix))) {
        return 'Direct reduced iron';
    }

    if (CRUDE_STEEL_PREFIXES.some((prefix) => hsCode.startsWith(prefix))) {
        return 'Crude steel';
    }

    if (STEEL_FINISHED_GOODS_PREFIXES.some((prefix) => hsCode.startsWith(prefix))) {
        return 'Iron or steel products';
    }

    return undefined;
}

function mapPrecursorToEuGood(
    precursor: PurchasedPrecursor,
    product: Product | undefined,
    cnCodeMap?: EuCnCodeMap
): string | undefined {
    if (EU_GOODS_SET.has(precursor.aggregated_goods_category)) {
        return precursor.aggregated_goods_category;
    }

    return mapProductToEuGood(product, cnCodeMap);
}

function validateSourceStreamForEuExport(sourceStream: SourceStream): EuExportReadinessIssue[] {
    const issues: EuExportReadinessIssue[] = [];
    const target: EuExportIssueTarget = { type: 'sourceStream', id: sourceStream.id };

    if (!sourceStream.process_id) {
        issues.push({
            severity: 'error',
            area: '생산공정',
            message: `${sourceStream.name}: 연결된 생산공정이 없어 B_EmInst 행을 공정과 대조할 수 없습니다.`,
            target,
        });
    }

    if (!EU_SOURCE_STREAM_METHODS.has(sourceStream.method)) {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `${sourceStream.name}: EU 템플릿에서 지원하지 않는 산정방법입니다. Combustion, Process Emissions, Mass balance 중 하나를 선택하세요.`,
            target,
        });
    }

    if (sourceStream.stream_type === 'FUEL' && sourceStream.method !== 'Combustion') {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `${sourceStream.name}: 연료 배출원은 Combustion 방식으로 입력해야 합니다.`,
            target,
        });
    }

    if (sourceStream.stream_type === 'PROCESS_MATERIAL' && sourceStream.method === 'Combustion') {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `${sourceStream.name}: 공정 원료는 Process Emissions 또는 Mass balance 방식으로 입력하세요.`,
            target,
        });
    }

    if (sourceStream.stream_type === 'OTHER') {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `${sourceStream.name}: 기타 배출원 유형은 아직 EU Export 대상이 아닙니다. 연료 또는 공정 원료로 분류하세요.`,
            target,
        });
    }

    if (!EU_SOURCE_STREAM_ACTIVITY_UNITS.has(sourceStream.activity_unit)) {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `${sourceStream.name}: EU 템플릿에서 검증한 활동자료 단위는 t 또는 Nm3입니다. 현재 값은 ${sourceStream.activity_unit || '비어 있음'}입니다.`,
            target,
        });
    }

    if (sourceStream.stream_type === 'FUEL' && sourceStream.ncv_gj_per_unit <= 0) {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `${sourceStream.name}: 연료 배출원은 순발열량을 0보다 크게 입력해야 합니다.`,
            target,
        });
    }

    if (sourceStream.stream_type !== 'FUEL' && sourceStream.emission_factor_tco2e_per_unit <= 0) {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `${sourceStream.name}: 공정 원료 배출원은 배출계수를 0보다 크게 입력해야 합니다.`,
            target,
        });
    }

    if (!sourceStream.source) {
        issues.push({
            severity: 'warning',
            area: '생산공정',
            message: `${sourceStream.name}: 활동자료 또는 배출계수 출처가 비어 있습니다.`,
            target,
        });
    }

    return issues;
}

export function evaluateEuExportReadiness(
    data: EuTemplateExportData,
    cnCodeMap?: EuCnCodeMap
): EuExportReadinessResult {
    const issues: EuExportReadinessIssue[] = [];
    const productById = new Map(data.products.map((product) => [product.id, product]));
    const sourceStreamsByProcess = new Map<string, SourceStream[]>();
    const outputLinesByProcess = new Map<string, ProductOutputLine[]>();

    for (const sourceStream of data.sourceStreams ?? []) {
        if (!sourceStream.process_id) {
            continue;
        }

        const group = sourceStreamsByProcess.get(sourceStream.process_id) ?? [];
        group.push(sourceStream);
        sourceStreamsByProcess.set(sourceStream.process_id, group);
    }

    for (const outputLine of data.productOutputLines ?? []) {
        if (!outputLine.process_id) {
            continue;
        }

        const group = outputLinesByProcess.get(outputLine.process_id) ?? [];
        group.push(outputLine);
        outputLinesByProcess.set(outputLine.process_id, group);
    }

    if (data.processes.length > 10) {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `현재 Export MVP는 생산공정 10개까지 지원합니다. 현재 ${data.processes.length}개입니다.`,
        });
    }

    if (data.precursors.length > 20) {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `현재 Export MVP는 구매 전구물질 20개까지 지원합니다. 현재 ${data.precursors.length}개입니다.`,
        });
    }

    if ((data.sourceStreams?.length ?? 0) > 75) {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `현재 Export MVP는 배출원 자료 75개까지 지원합니다. 현재 ${data.sourceStreams?.length ?? 0}개입니다.`,
        });
    }

    const summaryProductLineCount = createSummaryProductRows(data).length;

    if (summaryProductLineCount > 100) {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `현재 Export MVP는 Summary_Products 제품 행을 100개까지 지원합니다. 현재 ${summaryProductLineCount}개입니다.`,
        });
    }

    for (const product of data.products) {
        const hsCode = getProductCnOrHsCode(product);

        if (hsCode.length < 8) {
            issues.push({
                severity: 'warning',
                area: '제품',
                message: `${product.name}: EU 템플릿 제출에는 CN 8자리 코드가 필요합니다. 현재 값은 ${product.cn_code || product.hs_code}입니다.`,
                target: { type: 'product', id: product.id },
            });
        }

        if (cnCodeMap && hsCode.length >= 8 && !cnCodeMap.has(hsCode)) {
            issues.push({
                severity: 'error',
                area: '제품',
                message: `${product.name}: 업로드한 EU 템플릿의 Parameters_CNCodes에서 CN ${hsCode}를 찾을 수 없습니다.`,
                target: { type: 'product', id: product.id },
            });
        }

        if (!mapProductToEuGood(product, cnCodeMap)) {
            issues.push({
                severity: 'error',
                area: '제품',
                message: `${product.name}: EU CBAM goods category로 매핑할 수 없습니다.`,
                target: { type: 'product', id: product.id },
            });
        }
    }

    for (const process of data.processes) {
        const product = process.product_id ? productById.get(process.product_id) : undefined;
        const processSourceStreams = sourceStreamsByProcess.get(process.id) ?? [];
        const outputLineSummary = summarizeProductOutputLines(process.output_mass_t, outputLinesByProcess.get(process.id) ?? []);

        if (!product) {
            issues.push({
                severity: 'error',
                area: '생산공정',
                message: `${process.name}: 연결된 제품이 없어 EU goods category를 확정할 수 없습니다.`,
                target: { type: 'process', id: process.id },
            });
            continue;
        }

        const euGood = mapProductToEuGood(product, cnCodeMap);

        if (!euGood) {
            issues.push({
                severity: 'error',
                area: '생산공정',
                message: `${process.name}: 제품 ${product.name}의 EU goods category 매핑이 필요합니다.`,
                target: { type: 'process', id: process.id },
            });
        }

        if (!process.production_route || process.production_route.trim().length === 0) {
            issues.push({
                severity: 'warning',
                area: '생산공정',
                message: `${process.name}: 생산경로가 비어 있습니다. EU 템플릿 드롭다운 값과 대조가 필요합니다.`,
                target: { type: 'process', id: process.id },
            });
        }

        if (outputLineSummary.needsOutputReview) {
            issues.push({
                severity: 'warning',
                area: '생산공정',
                message: `${process.name}: 제품 생산라인 합계 ${outputLineSummary.totalOutput.toFixed(4)} t와 공정 총 생산량 ${process.output_mass_t.toFixed(4)} t가 ${outputLineSummary.delta.toFixed(4)} t 차이납니다.`,
                target: { type: 'process', id: process.id },
            });
        }

        if (outputLineSummary.hasMixedAllocationBasis) {
            issues.push({
                severity: 'warning',
                area: '생산공정',
                message: `${process.name}: 제품 생산라인의 배분기준이 섞여 있습니다. Export 전에 산정 근거를 확인하세요.`,
                target: { type: 'process', id: process.id },
            });
        }

        if (outputLineSummary.needsAllocationReview && outputLineSummary.manualPercentTotal <= 0) {
            issues.push({
                severity: 'warning',
                area: '생산공정',
                message: `${process.name}: 수동 비율 배분을 선택했지만 유효한 수동비율 합계가 0입니다.`,
                target: { type: 'process', id: process.id },
            });
        }

        if (process.direct_attributable_emissions_tco2e > 0 && processSourceStreams.length === 0) {
            issues.push({
                severity: 'warning',
                area: '생산공정',
                message: `${process.name}: 직접배출량은 입력되어 있지만 연결된 배출원 자료가 없습니다. B_EmInst 근거 자료를 확인하세요.`,
                target: { type: 'process', id: process.id },
            });
        }

        if (processSourceStreams.length > 0) {
            const sourceStreamEmissions = processSourceStreams.reduce(
                (sum, sourceStream) => sum + calculateSourceStreamEmissions(sourceStream),
                0
            );
            const delta = sourceStreamEmissions - process.direct_attributable_emissions_tco2e;
            const tolerance = Math.max(0.01, Math.abs(process.direct_attributable_emissions_tco2e) * 0.01);

            if (Math.abs(delta) > tolerance) {
                issues.push({
                    severity: 'warning',
                    area: '생산공정',
                    message: `${process.name}: B_EmInst 배출원 합계 ${sourceStreamEmissions.toFixed(4)} tCO2e와 D_Processes 직접배출량 ${process.direct_attributable_emissions_tco2e.toFixed(4)} tCO2e가 ${delta.toFixed(4)} tCO2e 차이납니다.`,
                    target: { type: 'process', id: process.id },
                });
            }
        }
    }

    for (const sourceStream of data.sourceStreams ?? []) {
        issues.push(...validateSourceStreamForEuExport(sourceStream));
    }

    for (const precursor of data.precursors) {
        const product = precursor.product_id ? productById.get(precursor.product_id) : undefined;

        if (!mapPrecursorToEuGood(precursor, product, cnCodeMap)) {
            issues.push({
                severity: 'error',
                area: '구매 전구물질',
                message: `${precursor.name}: EU goods category로 매핑할 수 없습니다.`,
                target: { type: 'precursor', id: precursor.id },
            });
        }

        if (!precursor.source) {
            issues.push({
                severity: 'warning',
                area: '구매 전구물질',
                message: `${precursor.name}: SEE 출처가 비어 있습니다.`,
                target: { type: 'precursor', id: precursor.id },
            });
        }

        if (precursor.data_mode === 'DEFAULT' && !precursor.default_value_justification?.trim()) {
            issues.push({
                severity: 'warning',
                area: '구매 전구물질',
                message: `${precursor.name}: 기본값을 사용하는 사유가 비어 있습니다. 제출 전 기본값 사용 근거를 남기세요.`,
                target: { type: 'precursor', id: precursor.id },
            });
        }

        if (precursor.data_mode !== 'DEFAULT' && precursor.verification_status === 'UNVERIFIED') {
            issues.push({
                severity: 'warning',
                area: '구매 전구물질',
                message: `${precursor.name}: 실측 또는 혼합 전구물질 자료가 아직 미검증 상태입니다.`,
                target: { type: 'precursor', id: precursor.id },
            });
        }
    }

    const errorCount = issues.filter((issue) => issue.severity === 'error').length;
    const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

    return {
        issues,
        errorCount,
        warningCount,
        canExportDraft: errorCount === 0,
        isSubmissionReady: issues.length === 0,
    };
}

export function createExportChecklist(input: ExportChecklistInput): ExportChecklistSummary {
    const {
        backupStatus,
        lastExportResult,
        plannedCellWriteCount,
        readiness,
        resultCount,
        scenarioAction,
        scenarioRiskSummary,
        templateFileName,
        validation,
    } = input;
    const firstErrorHref = readiness.issues
        .filter((issue) => issue.severity === 'error')
        .map((issue) => getEuExportIssueEditHref(issue))
        .find(Boolean);
    const firstWarningHref = readiness.issues
        .filter((issue) => issue.severity === 'warning')
        .map((issue) => getEuExportIssueEditHref(issue))
        .find(Boolean);
    const items: ExportChecklistItem[] = [
        {
            label: '산정 데이터 준비',
            description:
                resultCount > 0
                    ? `${resultCount}개 공정의 산정 미리보기를 확인했습니다.`
                    : '제품과 생산공정 데이터를 입력하면 산정 미리보기가 생성됩니다.',
            status: resultCount > 0 ? '완료' : '확인 필요',
            tone: resultCount > 0 ? 'success' : 'warning',
            complete: resultCount > 0,
            actionHref: resultCount > 0 ? '/results' : '/products',
            actionLabel: resultCount > 0 ? '산정 결과 보기' : '품목 입력',
        },
        {
            label: '로컬 백업 확인',
            description: backupStatus.helper,
            status: backupStatus.label,
            tone: backupStatus.tone,
            complete: backupStatus.tone === 'success',
            actionHref: '/settings',
            actionLabel: '백업 관리',
        },
        {
            label: 'EU 원본 템플릿 선택',
            description: templateFileName ?? '최신 EU Communication template 파일을 선택하세요.',
            status: templateFileName ? '완료' : '대기',
            tone: templateFileName ? 'success' : 'pending',
            complete: Boolean(templateFileName),
        },
        {
            label: '템플릿 구조 검증',
            description: validation?.isValid
                ? `필수 시트 ${REQUIRED_EU_TEMPLATE_SHEETS.length}개와 CN 코드 ${validation.cnCodeCount}개를 확인했습니다.`
                : validation
                    ? `${validation.missingSheets.length}개 필수 시트가 누락되었습니다.`
                    : '템플릿을 선택하면 공식 시트와 CN 코드 목록을 확인합니다.',
            status: validation?.isValid ? '완료' : validation ? '오류' : '대기',
            tone: validation?.isValid ? 'success' : validation ? 'danger' : 'pending',
            complete: Boolean(validation?.isValid),
        },
        {
            label: 'Export 오류 해결',
            description:
                readiness.errorCount === 0
                    ? '다운로드를 막는 오류 항목이 없습니다.'
                    : `${readiness.errorCount}개 오류를 먼저 수정해야 합니다.`,
            status: readiness.errorCount === 0 ? '완료' : '오류',
            tone: readiness.errorCount === 0 ? 'success' : 'danger',
            complete: readiness.errorCount === 0,
            actionHref: firstErrorHref,
            actionLabel: firstErrorHref ? '첫 오류 수정' : undefined,
        },
        {
            label: 'SEFA·인증서 시나리오 검토',
            description: scenarioRiskSummary.is_ready_for_review
                ? scenarioRiskSummary.above_default_count > 0 || scenarioRiskSummary.certificate_exposure_count > 0 || scenarioRiskSummary.default_lower_certificate_count > 0
                    ? `기준자료는 연결됐지만 기본값 우위 ${scenarioRiskSummary.default_lower_certificate_count}건, 기본값 대비 차이 ${scenarioRiskSummary.above_default_count}건을 검토해야 합니다.`
                    : 'CN 코드와 공식 기준자료가 연결되어 시나리오 검토가 가능합니다.'
                : `${scenarioRiskSummary.missing_reference_count}개 품목은 CN 코드 또는 공식 기준자료 연결이 필요합니다.`,
            status: scenarioRiskSummary.is_ready_for_review ? '검토 가능' : '확인 필요',
            tone: scenarioRiskSummary.is_ready_for_review ? 'success' : 'warning',
            complete: scenarioRiskSummary.is_ready_for_review,
            actionHref: scenarioAction.href,
            actionLabel: scenarioAction.label,
        },
        {
            label: '경고 항목 검토',
            description:
                readiness.warningCount === 0
                    ? '추가 검토 경고가 없습니다.'
                    : `${readiness.warningCount}개 경고가 있습니다. 제출 전 검토가 필요합니다.`,
            status: readiness.warningCount === 0 ? '완료' : '확인 필요',
            tone: readiness.warningCount === 0 ? 'success' : 'warning',
            complete: readiness.warningCount === 0,
            actionHref: firstWarningHref,
            actionLabel: firstWarningHref ? '첫 경고 검토' : undefined,
        },
        {
            label: '반영 셀 검증',
            description: lastExportResult
                ? `복사본 생성 중 ${lastExportResult.checkedCellCount}개 셀을 검증했습니다.`
                : plannedCellWriteCount > 0
                    ? `A_InstData, B_EmInst, C_Emissions&Energy, D_Processes, E_PurchPrec, Summary_Products에 반영할 셀 ${plannedCellWriteCount}개를 생성 후 검증합니다.`
                    : '반영할 공정 또는 전구물질 데이터가 없습니다.',
            status: lastExportResult ? '완료' : plannedCellWriteCount > 0 ? '대기' : '확인 필요',
            tone: lastExportResult ? 'success' : plannedCellWriteCount > 0 ? 'pending' : 'warning',
            complete: Boolean(lastExportResult),
        },
    ];
    const reviewCount = items.filter((item) => !item.complete).length;

    return {
        items,
        reviewCount,
        isComplete: reviewCount === 0,
    };
}

export function getEuExportDownloadStatusMessage(input: EuExportDownloadStatusInput): string {
    const { backupStatus, hasTemplateFile, readiness, validation } = input;

    if (!hasTemplateFile) {
        return 'EU 원본 템플릿을 먼저 선택하세요.';
    }

    if (!validation?.isValid) {
        return '선택한 템플릿의 공식 시트 구조를 확인해야 합니다.';
    }

    if (!readiness.canExportDraft) {
        return '오류 항목을 수정해야 복사본을 다운로드할 수 있습니다.';
    }

    if (!readiness.isSubmissionReady) {
        return '다운로드는 가능하지만 경고 항목은 제출 전 검토하세요.';
    }

    if (backupStatus.tone !== 'success') {
        return '다운로드는 가능하지만 제출용 복사본 생성 전 .cbam 백업을 권장합니다.';
    }

    return '제출용 복사본을 생성할 수 있습니다.';
}

function parseWorkbookSheetNames(workbookXml: string): string[] {
    const document = new DOMParser().parseFromString(workbookXml, 'application/xml');
    const parseError = document.getElementsByTagName('parsererror')[0];

    if (parseError) {
        throw new Error('EU 템플릿의 workbook.xml을 읽을 수 없습니다.');
    }

    return Array.from(document.getElementsByTagName('sheet'))
        .map((sheet) => sheet.getAttribute('name'))
        .filter((name): name is string => Boolean(name));
}

function parseSharedStrings(zip: Record<string, Uint8Array>): string[] {
    const sharedStringsXml = zip['xl/sharedStrings.xml'];

    if (!sharedStringsXml) {
        return [];
    }

    const document = new DOMParser().parseFromString(strFromU8(sharedStringsXml), 'application/xml');
    return Array.from(document.getElementsByTagName('si')).map((item) =>
        Array.from(item.getElementsByTagName('t'))
            .map((text) => text.textContent ?? '')
            .join('')
    );
}

function getColumnName(cellReference: string): string {
    return splitCellReference(cellReference).column;
}

function readCellText(cell: Element, sharedStrings: string[]): string {
    const type = cell.getAttribute('t');

    if (type === 's') {
        const sharedStringIndex = Number(cell.getElementsByTagName('v')[0]?.textContent ?? -1);
        return sharedStrings[sharedStringIndex] ?? '';
    }

    if (type === 'inlineStr') {
        return Array.from(cell.getElementsByTagName('t'))
            .map((text) => text.textContent ?? '')
            .join('');
    }

    return cell.getElementsByTagName('v')[0]?.textContent ?? '';
}

function parseCnCodeOptions(zip: Record<string, Uint8Array>): CnCodeOption[] {
    const sheetTargetByName = parseWorkbookSheetTargets(zip);
    const cnCodeSheetPath = sheetTargetByName.get('Parameters_CNCodes');
    const cnCodeSheetXml = cnCodeSheetPath ? zip[cnCodeSheetPath] : undefined;

    if (!cnCodeSheetXml) {
        return [];
    }

    const sharedStrings = parseSharedStrings(zip);
    const document = new DOMParser().parseFromString(strFromU8(cnCodeSheetXml), 'application/xml');
    const options: CnCodeOption[] = [];

    for (const row of Array.from(document.getElementsByTagName('row'))) {
        const rowNumber = Number(row.getAttribute('r') ?? 0);

        if (rowNumber < 4) {
            continue;
        }

        const valuesByColumn = new Map<string, string>();

        for (const cell of Array.from(row.getElementsByTagName('c'))) {
            const reference = cell.getAttribute('r');

            if (!reference) {
                continue;
            }

            valuesByColumn.set(getColumnName(reference), readCellText(cell, sharedStrings));
        }

        const cnCode = normalizeHsCode(valuesByColumn.get('D') ?? '');
        const description = valuesByColumn.get('C') ?? '';
        const cbamGood = valuesByColumn.get('E') ?? '';

        if (cnCode.length === 8 && EU_GOODS_SET.has(cbamGood)) {
            options.push({
                code: cnCode,
                goodsCategory: cbamGood,
                labelKo: cbamGood,
                description,
                source: 'EU template Parameters_CNCodes',
            });
        }
    }

    return options;
}

function parseCnCodeMap(zip: Record<string, Uint8Array>): EuCnCodeMap {
    const cnCodeMap: EuCnCodeMap = new Map();

    for (const option of parseCnCodeOptions(zip)) {
        cnCodeMap.set(option.code, option.goodsCategory);
    }

    return cnCodeMap;
}

export async function parseEuTemplateCnCodeOptions(file: File): Promise<CnCodeOption[]> {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
        throw new Error('EU 원본 템플릿은 .xlsx 파일이어야 합니다.');
    }

    const workbookBytes = new Uint8Array(await file.arrayBuffer());
    const zip = unzipSync(workbookBytes);
    const options = parseCnCodeOptions(zip);

    if (options.length === 0) {
        throw new Error('EU 템플릿의 Parameters_CNCodes에서 CN 코드 목록을 찾을 수 없습니다.');
    }

    return options;
}

export async function validateEuTemplateFile(file: File): Promise<EuTemplateValidationResult> {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
        throw new Error('EU 원본 템플릿은 .xlsx 파일이어야 합니다.');
    }

    const workbookBytes = new Uint8Array(await file.arrayBuffer());
    const zip = unzipSync(workbookBytes);
    const workbookXml = zip['xl/workbook.xml'];

    if (!workbookXml) {
        throw new Error('유효한 XLSX 파일이 아니거나 workbook.xml이 없습니다.');
    }

    const sheetNames = parseWorkbookSheetNames(strFromU8(workbookXml));
    const missingSheets = REQUIRED_EU_TEMPLATE_SHEETS.filter((sheetName) => !sheetNames.includes(sheetName));
    const cnCodeMap = parseCnCodeMap(zip);

    return {
        sheetNames,
        missingSheets,
        cnCodeCount: cnCodeMap.size,
        cnCodeMap,
        isValid: missingSheets.length === 0,
    };
}

export async function createEuTemplateCopy(file: File): Promise<Blob> {
    return new Blob([await file.arrayBuffer()], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

function escapeXml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function columnNameToIndex(columnName: string): number {
    return columnName.split('').reduce((sum, character) => sum * 26 + character.charCodeAt(0) - 64, 0);
}

function splitCellReference(cellReference: string): { column: string; row: number } {
    const match = /^([A-Z]+)(\d+)$/.exec(cellReference);

    if (!match) {
        throw new Error(`잘못된 셀 주소입니다: ${cellReference}`);
    }

    return {
        column: match[1],
        row: Number(match[2]),
    };
}

function buildPreservedCellAttributes(rawAttributes: string): string {
    const attributes = new Map<string, string>();

    for (const match of rawAttributes.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
        attributes.set(match[1], match[2]);
    }

    const preservedAttributes = ['s']
        .map((attributeName) => {
            const value = attributes.get(attributeName);
            return value === undefined ? '' : ` ${attributeName}="${escapeXml(value)}"`;
        })
        .join('');

    return preservedAttributes;
}

function createCellXml(cellReference: string, value: string | number, rawAttributes = ''): string {
    const preservedAttributes = buildPreservedCellAttributes(rawAttributes);

    if (typeof value === 'number') {
        return `<c r="${cellReference}"${preservedAttributes}><v>${Number.isFinite(value) ? value : 0}</v></c>`;
    }

    return `<c r="${cellReference}"${preservedAttributes} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function setCellValue(sheetXml: string, cellReference: string, value: string | number): string {
    const cellPattern = new RegExp(`<c\\b(?=[^>]*\\br="${cellReference}")(.*?)>[\\s\\S]*?<\\/c>`);
    const selfClosingCellPattern = new RegExp(`<c\\b(?=[^>]*\\br="${cellReference}")(.*?)\\/>`);
    const selfClosingCellMatch = sheetXml.match(selfClosingCellPattern);

    if (selfClosingCellMatch) {
        return sheetXml.replace(selfClosingCellPattern, createCellXml(cellReference, value, selfClosingCellMatch[1]));
    }

    const existingCellMatch = sheetXml.match(cellPattern);

    if (existingCellMatch) {
        return sheetXml.replace(cellPattern, createCellXml(cellReference, value, existingCellMatch[1]));
    }

    const cellXml = createCellXml(cellReference, value);
    const { column, row } = splitCellReference(cellReference);
    const rowPattern = new RegExp(`(<row\\s+[^>]*r="${row}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);
    const rowMatch = sheetXml.match(rowPattern);

    if (rowMatch) {
        const existingCells = Array.from(rowMatch[2].matchAll(/<c\s+[^>]*r="([A-Z]+)\d+"[^>]*(?:>[\s\S]*?<\/c>|\/>)/g));
        let insertIndex = rowMatch[2].length;

        for (const match of existingCells) {
            if (columnNameToIndex(match[1]) > columnNameToIndex(column)) {
                insertIndex = match.index ?? rowMatch[2].length;
                break;
            }
        }

        const rowContents = `${rowMatch[2].slice(0, insertIndex)}${cellXml}${rowMatch[2].slice(insertIndex)}`;
        return sheetXml.replace(rowPattern, `${rowMatch[1]}${rowContents}${rowMatch[3]}`);
    }

    const sheetDataPattern = /(<sheetData>)([\s\S]*?)(<\/sheetData>)/;
    const newRowXml = `<row r="${row}">${cellXml}</row>`;
    return sheetXml.replace(sheetDataPattern, `$1$2${newRowXml}$3`);
}

function normalizeExportCellValue(value: string | number): string {
    if (typeof value === 'number') {
        return String(Number.isFinite(value) ? value : 0);
    }

    return value;
}

function getCellValue(sheetXml: string, cellReference: string, sharedStrings: string[]): string {
    const document = new DOMParser().parseFromString(sheetXml, 'application/xml');
    const cells = Array.from(document.getElementsByTagName('c'));
    const cell = cells.find((item) => item.getAttribute('r') === cellReference);

    if (!cell) {
        return '';
    }

    return readCellText(cell, sharedStrings);
}

function applyCellWrites(sheetXml: string, writes: EuTemplateExportCellWrite[]): string {
    return writes.reduce((output, write) => setCellValue(output, write.cell, write.value), sheetXml);
}

function dateStringToExcelSerial(dateString: string): number {
    const [year, month, day] = dateString.split('-').map(Number);

    if (!year || !month || !day) {
        return 0;
    }

    const utcDate = Date.UTC(year, month - 1, day);
    const excelEpoch = Date.UTC(1899, 11, 30);
    return Math.round((utcDate - excelEpoch) / 86400000);
}

function parseWorkbookSheetTargets(zip: Record<string, Uint8Array>): Map<string, string> {
    const workbookXml = zip['xl/workbook.xml'];
    const relsXml = zip['xl/_rels/workbook.xml.rels'];

    if (!workbookXml || !relsXml) {
        throw new Error('EU 템플릿의 workbook 관계 정보를 찾을 수 없습니다.');
    }

    const workbookDocument = new DOMParser().parseFromString(strFromU8(workbookXml), 'application/xml');
    const relsDocument = new DOMParser().parseFromString(strFromU8(relsXml), 'application/xml');
    const relTargetById = new Map<string, string>();

    for (const relationship of Array.from(relsDocument.getElementsByTagName('Relationship'))) {
        const id = relationship.getAttribute('Id');
        const target = relationship.getAttribute('Target');

        if (id && target) {
            relTargetById.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
        }
    }

    const namespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const sheetTargetByName = new Map<string, string>();

    for (const sheet of Array.from(workbookDocument.getElementsByTagName('sheet'))) {
        const name = sheet.getAttribute('name');
        const relId = sheet.getAttributeNS(namespace, 'id') ?? sheet.getAttribute('r:id');
        const target = relId ? relTargetById.get(relId) : undefined;

        if (name && target) {
            sheetTargetByName.set(name, target.replaceAll('\\', '/'));
        }
    }

    return sheetTargetByName;
}

function createProcessCellWrites(processes: ProductionProcess[]): EuTemplateExportCellWrite[] {
    const writes: EuTemplateExportCellWrite[] = [];

    processes.slice(0, 10).forEach((process, index) => {
        const startRow = 11 + index * 65;

        writes.push(
            { sheetName: 'D_Processes', cell: `L${startRow + 5}`, label: '총 생산량', value: process.output_mass_t, sourceId: process.id },
            { sheetName: 'D_Processes', cell: `L${startRow + 16}`, label: '시장 출하량', value: process.market_output_mass_t, sourceId: process.id },
            { sheetName: 'D_Processes', cell: `L${startRow + 21}`, label: '내부 소비량', value: process.internal_consumption_mass_t, sourceId: process.id },
            {
                sheetName: 'D_Processes',
                cell: `L${startRow + 43}`,
                label: '직접귀속배출량',
                value: process.direct_attributable_emissions_tco2e,
                sourceId: process.id,
            },
            { sheetName: 'D_Processes', cell: `L${startRow + 54}`, label: '전력 사용량', value: process.electricity_mwh, sourceId: process.id },
            {
                sheetName: 'D_Processes',
                cell: `L${startRow + 55}`,
                label: '전력 배출계수',
                value: process.electricity_ef_tco2e_per_mwh,
                sourceId: process.id,
            }
        );
    });

    return writes;
}

const EU_MONITORING_APPROACHES = new Set(['Combustion', 'Process Emissions', 'Mass balance']);

function getSourceStreamMonitoringApproach(sourceStream: SourceStream): string {
    if (EU_MONITORING_APPROACHES.has(sourceStream.method)) {
        return sourceStream.method;
    }

    if (sourceStream.stream_type === 'PROCESS_MATERIAL') {
        return 'Process Emissions';
    }

    return 'Combustion';
}

function toEuPercent(value: number): number {
    return value <= 1 ? value * 100 : value;
}

function getEmissionFactorUnit(sourceStream: SourceStream): string {
    if (sourceStream.stream_type === 'FUEL') {
        return 'tCO2/TJ';
    }

    return `tCO2/${sourceStream.activity_unit}`;
}

function createSourceStreamCellWrites(sourceStreams: SourceStream[] = []): EuTemplateExportCellWrite[] {
    const writes: EuTemplateExportCellWrite[] = [];

    sourceStreams.slice(0, 75).forEach((sourceStream, index) => {
        const row = 17 + index;

        writes.push(
            { sheetName: 'B_EmInst', cell: `D${row}`, label: 'Monitoring approach', value: getSourceStreamMonitoringApproach(sourceStream), sourceId: sourceStream.id },
            { sheetName: 'B_EmInst', cell: `E${row}`, label: 'Source stream name', value: sourceStream.name, sourceId: sourceStream.id },
            { sheetName: 'B_EmInst', cell: `F${row}`, label: 'Activity data', value: sourceStream.activity_data, sourceId: sourceStream.id },
            { sheetName: 'B_EmInst', cell: `G${row}`, label: 'Activity data unit', value: sourceStream.activity_unit, sourceId: sourceStream.id },
            { sheetName: 'B_EmInst', cell: `H${row}`, label: 'Net calorific value', value: sourceStream.ncv_gj_per_unit, sourceId: sourceStream.id },
            { sheetName: 'B_EmInst', cell: `J${row}`, label: 'Emission factor', value: sourceStream.emission_factor_tco2e_per_unit, sourceId: sourceStream.id },
            { sheetName: 'B_EmInst', cell: `K${row}`, label: 'Emission factor unit', value: getEmissionFactorUnit(sourceStream), sourceId: sourceStream.id },
            { sheetName: 'B_EmInst', cell: `N${row}`, label: 'Oxidation factor', value: toEuPercent(sourceStream.oxidation_factor), sourceId: sourceStream.id },
            { sheetName: 'B_EmInst', cell: `P${row}`, label: 'Conversion factor', value: toEuPercent(sourceStream.conversion_factor), sourceId: sourceStream.id },
            { sheetName: 'B_EmInst', cell: `R${row}`, label: 'Biomass content', value: toEuPercent(sourceStream.biomass_fraction), sourceId: sourceStream.id }
        );
    });

    return writes;
}

function createEmissionsEnergyCellWrites(processes: ProductionProcess[], products: Product[]): EuTemplateExportCellWrite[] {
    const productById = new Map(products.map((product) => [product.id, product]));
    const indirectEmissions = processes.reduce(
        (sum, process) => {
            const product = process.product_id ? productById.get(process.product_id) : undefined;
            const applicability = getIndirectEmissionsApplicability(product);
            return applicability.applicable
                ? sum + process.electricity_mwh * process.electricity_ef_tco2e_per_mwh
                : sum;
        },
        0
    );

    if (indirectEmissions <= 0) {
        return [];
    }

    return [
        {
            sheetName: 'C_Emissions&Energy',
            cell: 'M26',
            label: 'Total indirect emissions',
            value: indirectEmissions,
            sourceId: processes[0]?.id ?? 'processes',
        },
    ];
}

function createInstallationCellWrites(
    installations: Installation[] = [],
    periods: ReportingPeriod[] = []
): EuTemplateExportCellWrite[] {
    const installation = installations[0];
    const period = periods[0];
    const writes: EuTemplateExportCellWrite[] = [];

    if (period) {
        writes.push(
            {
                sheetName: 'A_InstData',
                cell: 'I9',
                label: '보고기간 시작일',
                value: dateStringToExcelSerial(period.start_date),
                sourceId: period.id,
            },
            {
                sheetName: 'A_InstData',
                cell: 'L9',
                label: '보고기간 종료일',
                value: dateStringToExcelSerial(period.end_date),
                sourceId: period.id,
            }
        );
    }

    if (installation) {
        addOptionalInstallationWrite(writes, installation, 'local_name', 'I19', '사업장명');
        writes.push(
            {
                sheetName: 'A_InstData',
                cell: 'I20',
                label: '사업장 영문명',
                value: installation.name,
                sourceId: installation.id,
            },
            {
                sheetName: 'A_InstData',
                cell: 'I26',
                label: '사업장 국가',
                value: installation.country,
                sourceId: installation.id,
            }
        );
        addOptionalInstallationWrite(writes, installation, 'street', 'I21', '사업장 주소');
        addOptionalInstallationWrite(writes, installation, 'economic_activity', 'I22', '경제활동');
        addOptionalInstallationWrite(writes, installation, 'postcode', 'I23', '우편번호');
        addOptionalInstallationWrite(writes, installation, 'po_box', 'I24', 'P.O. Box');
        addOptionalInstallationWrite(writes, installation, 'city', 'I25', '도시');
        addOptionalInstallationWrite(writes, installation, 'unlocode', 'I27', 'UN/LOCODE');
        addOptionalInstallationWrite(writes, installation, 'latitude', 'I28', '위도');
        addOptionalInstallationWrite(writes, installation, 'longitude', 'I29', '경도');
        addOptionalInstallationWrite(writes, installation, 'authorized_representative_name', 'I30', '담당자명');
        addOptionalInstallationWrite(writes, installation, 'email', 'I31', '담당자 이메일');
        addOptionalInstallationWrite(writes, installation, 'telephone', 'I32', '담당자 전화번호');
    }

    return writes;
}

interface EuAggregatedGoodExportRow {
    good: string;
    sourceId: string;
    routes: string[];
}

interface EuSummaryProductExportRow {
    process: ProductionProcess;
    product: Product;
    sourceId: string;
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
    return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function createSummaryProductRows(data: EuTemplateExportData): EuSummaryProductExportRow[] {
    const productById = new Map(data.products.map((product) => [product.id, product]));
    const processById = new Map(data.processes.map((process) => [process.id, process]));
    const rows: EuSummaryProductExportRow[] = [];

    for (const outputLine of data.productOutputLines ?? []) {
        const process = processById.get(outputLine.process_id);
        const product = outputLine.product_id ? productById.get(outputLine.product_id) : undefined;

        if (!process || !product) {
            continue;
        }

        rows.push({ process, product, sourceId: outputLine.id });
    }

    if (rows.length > 0) {
        return rows;
    }

    for (const process of data.processes) {
        const product = process.product_id ? productById.get(process.product_id) : undefined;

        if (!product) {
            continue;
        }

        rows.push({ process, product, sourceId: process.id });
    }

    return rows;
}

function createAggregatedGoodsAndBoundaryCellWrites(
    data: EuTemplateExportData,
    cnCodeMap?: EuCnCodeMap
): EuTemplateExportCellWrite[] {
    const productById = new Map(data.products.map((product) => [product.id, product]));
    const outputLinesByProcess = new Map<string, ProductOutputLine[]>();
    const rowByGood = new Map<string, EuAggregatedGoodExportRow>();

    for (const outputLine of data.productOutputLines ?? []) {
        if (!outputLine.process_id) {
            continue;
        }

        const group = outputLinesByProcess.get(outputLine.process_id) ?? [];
        group.push(outputLine);
        outputLinesByProcess.set(outputLine.process_id, group);
    }

    for (const product of data.products) {
        const euGood = mapProductToEuGood(product, cnCodeMap);

        if (!euGood) {
            continue;
        }

        const routes = data.processes
            .filter((process) => process.product_id === product.id)
            .map((process) => process.production_route);
        const existing = rowByGood.get(euGood);

        rowByGood.set(euGood, {
            good: euGood,
            sourceId: existing?.sourceId ?? product.id,
            routes: uniqueNonEmpty([...(existing?.routes ?? []), ...routes]),
        });
    }

    const writes: EuTemplateExportCellWrite[] = [];
    const aggregatedGoods = Array.from(rowByGood.values()).slice(0, 10);

    aggregatedGoods.forEach((row, index) => {
        const sheetRow = 62 + index;

        writes.push({
            sheetName: 'A_InstData',
            cell: `E${sheetRow}`,
            label: 'Aggregated goods category',
            value: row.good,
            sourceId: row.sourceId,
        });

        row.routes.slice(0, 6).forEach((route, routeIndex) => {
            writes.push({
                sheetName: 'A_InstData',
                cell: `${String.fromCharCode('I'.charCodeAt(0) + routeIndex)}${sheetRow}`,
                label: 'Production route',
                value: route,
                sourceId: row.sourceId,
            });
        });
    });

    data.processes.slice(0, 10).forEach((process, index) => {
        const product = process.product_id ? productById.get(process.product_id) : undefined;
        const euGood = mapProductToEuGood(product, cnCodeMap);

        if (!euGood) {
            return;
        }

        const sheetRow = 83 + index;
        const outputLines = outputLinesByProcess.get(process.id) ?? [];
        const includedGoods = uniqueNonEmpty(
            outputLines
                .map((line) => (line.product_id ? productById.get(line.product_id) : undefined))
                .map((lineProduct) => mapProductToEuGood(lineProduct, cnCodeMap))
        );
        const boundaryValues = includedGoods.length > 1 || (includedGoods.length === 1 && includedGoods[0] !== euGood)
            ? includedGoods.slice(0, 6)
            : ['Only direct production'];

        writes.push(
            {
                sheetName: 'A_InstData',
                cell: `E${sheetRow}`,
                label: 'Production process aggregated goods category',
                value: euGood,
                sourceId: process.id,
            },
            {
                sheetName: 'A_InstData',
                cell: `L${sheetRow}`,
                label: 'Production process name',
                value: process.name,
                sourceId: process.id,
            }
        );

        boundaryValues.forEach((value, boundaryIndex) => {
            writes.push({
                sheetName: 'A_InstData',
                cell: `${String.fromCharCode('F'.charCodeAt(0) + boundaryIndex)}${sheetRow}`,
                label: 'Included goods category',
                value,
                sourceId: process.id,
            });
        });
    });

    return writes;
}

function addOptionalInstallationWrite(
    writes: EuTemplateExportCellWrite[],
    installation: Installation,
    field: keyof Pick<
        Installation,
        | 'local_name'
        | 'street'
        | 'economic_activity'
        | 'postcode'
        | 'po_box'
        | 'city'
        | 'unlocode'
        | 'latitude'
        | 'longitude'
        | 'authorized_representative_name'
        | 'email'
        | 'telephone'
    >,
    cell: string,
    label: string
): void {
    const value = installation[field];

    if (value === undefined || value === '') {
        return;
    }

    writes.push({
        sheetName: 'A_InstData',
        cell,
        label,
        value,
        sourceId: installation.id,
    });
}

function createPrecursorCellWrites(precursors: PurchasedPrecursor[]): EuTemplateExportCellWrite[] {
    const writes: EuTemplateExportCellWrite[] = [];

    precursors.slice(0, 20).forEach((precursor, index) => {
        const startRow = 14 + index * 44;

        writes.push(
            { sheetName: 'E_PurchPrec', cell: `L${startRow + 3}`, label: '구매량', value: precursor.purchased_mass_t, sourceId: precursor.id },
            { sheetName: 'E_PurchPrec', cell: `L${startRow + 14}`, label: '소비량', value: precursor.consumed_mass_t, sourceId: precursor.id },
            {
                sheetName: 'E_PurchPrec',
                cell: `L${startRow + 24}`,
                label: '비CBAM 용도 소비량',
                value: precursor.consumed_for_non_cbam_mass_t,
                sourceId: precursor.id,
            },
            { sheetName: 'E_PurchPrec', cell: `L${startRow + 35}`, label: '직접 SEE', value: precursor.direct_see_tco2e_per_t, sourceId: precursor.id },
            { sheetName: 'E_PurchPrec', cell: `M${startRow + 35}`, label: '직접 SEE 출처', value: precursor.source, sourceId: precursor.id },
            {
                sheetName: 'E_PurchPrec',
                cell: `L${startRow + 40}`,
                label: '기본값 사용 근거',
                value: precursor.default_value_justification,
                sourceId: precursor.id,
            }
        );
    });

    return writes;
}

function createSummaryProductCellWrites(data: EuTemplateExportData): EuTemplateExportCellWrite[] {
    const writes: EuTemplateExportCellWrite[] = [];
    const rows = createSummaryProductRows(data).slice(0, 100);

    rows.forEach((row, index) => {
        const sheetRow = 10 + index;
        const productCode = getProductCnOrHsCode(row.product);

        writes.push(
            {
                sheetName: 'Summary_Products',
                cell: `D${sheetRow}`,
                label: 'Summary product production process',
                value: row.process.name,
                sourceId: row.sourceId,
            },
            {
                sheetName: 'Summary_Products',
                cell: `F${sheetRow}`,
                label: 'Summary product CN code',
                value: productCode,
                sourceId: row.sourceId,
            },
            {
                sheetName: 'Summary_Products',
                cell: `H${sheetRow}`,
                label: 'Summary product name',
                value: row.product.name,
                sourceId: row.sourceId,
            }
        );
    });

    return writes;
}

export function createEuTemplateExportCellWrites(
    data: EuTemplateExportData,
    cnCodeMap?: EuCnCodeMap
): EuTemplateExportCellWrite[] {
    return [
        ...createInstallationCellWrites(data.installations, data.periods),
        ...createAggregatedGoodsAndBoundaryCellWrites(data, cnCodeMap),
        ...createSourceStreamCellWrites(data.sourceStreams),
        ...createEmissionsEnergyCellWrites(data.processes, data.products),
        ...createProcessCellWrites(data.processes),
        ...createPrecursorCellWrites(data.precursors),
        ...createSummaryProductCellWrites(data),
    ];
}

function verifyExportCellWrites(
    zip: Record<string, Uint8Array>,
    sheetTargetByName: Map<string, string>,
    writes: EuTemplateExportCellWrite[]
): EuTemplateExportVerificationResult {
    const sharedStrings = parseSharedStrings(zip);
    const mismatches: EuTemplateExportVerificationResult['mismatches'] = [];

    for (const write of writes) {
        const sheetPath = sheetTargetByName.get(write.sheetName);
        const sheetXml = sheetPath ? zip[sheetPath] : undefined;
        const actual = sheetXml ? getCellValue(strFromU8(sheetXml), write.cell, sharedStrings) : '';
        const expected = normalizeExportCellValue(write.value);

        if (actual !== expected) {
            mismatches.push({
                sheetName: write.sheetName,
                cell: write.cell,
                expected,
                actual,
                label: write.label,
            });
        }
    }

    return {
        checkedCellCount: writes.length,
        mismatches,
        isValid: mismatches.length === 0,
    };
}

export async function createEuTemplateExportCopyResult(file: File, data: EuTemplateExportData): Promise<EuTemplateExportCopyResult> {
    const workbookBytes = new Uint8Array(await file.arrayBuffer());
    const zip = unzipSync(workbookBytes);
    const cnCodeMap = parseCnCodeMap(zip);
    const readiness = evaluateEuExportReadiness(data, cnCodeMap);

    if (!readiness.canExportDraft) {
        throw new Error('EU 템플릿 Export 전에 오류 항목을 먼저 해결해야 합니다.');
    }

    const sheetTargetByName = parseWorkbookSheetTargets(zip);
    const installationSheetPath = sheetTargetByName.get('A_InstData');
    const sourceStreamSheetPath = sheetTargetByName.get('B_EmInst');
    const emissionsEnergySheetPath = sheetTargetByName.get('C_Emissions&Energy');
    const processSheetPath = sheetTargetByName.get('D_Processes');
    const precursorSheetPath = sheetTargetByName.get('E_PurchPrec');
    const summaryProductsSheetPath = sheetTargetByName.get('Summary_Products');

    if (
        !installationSheetPath ||
        !sourceStreamSheetPath ||
        !emissionsEnergySheetPath ||
        !processSheetPath ||
        !precursorSheetPath ||
        !summaryProductsSheetPath ||
        !zip[installationSheetPath] ||
        !zip[sourceStreamSheetPath] ||
        !zip[emissionsEnergySheetPath] ||
        !zip[processSheetPath] ||
        !zip[precursorSheetPath] ||
        !zip[summaryProductsSheetPath]
    ) {
        throw new Error('EU 템플릿에서 A_InstData, D_Processes 또는 E_PurchPrec 시트를 찾을 수 없습니다.');
    }

    const cellWrites = createEuTemplateExportCellWrites(data, cnCodeMap);
    const installationCellWrites = cellWrites.filter((write) => write.sheetName === 'A_InstData');
    const sourceStreamCellWrites = cellWrites.filter((write) => write.sheetName === 'B_EmInst');
    const emissionsEnergyCellWrites = cellWrites.filter((write) => write.sheetName === 'C_Emissions&Energy');
    const processCellWrites = cellWrites.filter((write) => write.sheetName === 'D_Processes');
    const precursorCellWrites = cellWrites.filter((write) => write.sheetName === 'E_PurchPrec');
    const summaryProductCellWrites = cellWrites.filter((write) => write.sheetName === 'Summary_Products');

    zip[installationSheetPath] = strToU8(applyCellWrites(strFromU8(zip[installationSheetPath]), installationCellWrites));
    zip[sourceStreamSheetPath] = strToU8(applyCellWrites(strFromU8(zip[sourceStreamSheetPath]), sourceStreamCellWrites));
    zip[emissionsEnergySheetPath] = strToU8(applyCellWrites(strFromU8(zip[emissionsEnergySheetPath]), emissionsEnergyCellWrites));
    zip[processSheetPath] = strToU8(applyCellWrites(strFromU8(zip[processSheetPath]), processCellWrites));
    zip[precursorSheetPath] = strToU8(applyCellWrites(strFromU8(zip[precursorSheetPath]), precursorCellWrites));
    zip[summaryProductsSheetPath] = strToU8(applyCellWrites(strFromU8(zip[summaryProductsSheetPath]), summaryProductCellWrites));

    const verification = verifyExportCellWrites(zip, sheetTargetByName, cellWrites);

    if (!verification.isValid) {
        const firstMismatch = verification.mismatches[0];
        throw new Error(
            `EU 템플릿 Export 검증에 실패했습니다. ${firstMismatch.sheetName}!${firstMismatch.cell} ${firstMismatch.label} 값이 예상과 다릅니다. expected=${firstMismatch.expected}, actual=${firstMismatch.actual}`
        );
    }

    return {
        blob: new Blob([zipSync(zip)], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        verification,
        writtenCellCount: cellWrites.length,
    };
}

export async function createEuTemplateExportCopy(file: File, data: EuTemplateExportData): Promise<Blob> {
    return (await createEuTemplateExportCopyResult(file, data)).blob;
}

export function createEuExportFilename(originalFilename: string): string {
    const baseName = originalFilename.replace(/\.xlsx$/i, '');
    const timestamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `${baseName}_cbam-local-copy_${timestamp}.xlsx`;
}

export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
