import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { BackupStatus, Installation, Product, ProductOutputLine, ProductionProcess, PurchasedPrecursor, ReportingPeriod, SourceStream } from './local-db';
import type { CnCodeOption } from './cn-code-options';
import type { ScenarioRiskSummary } from './scenario-calculation';
import { summarizeProductOutputLines } from './calculation-engine';
import { calculateSourceStreamEmissions, getSourceStreamEmissionFactorBasis } from './source-stream-calculation';
import { getIndirectEmissionsApplicability } from './cbam-product-rules';
import { getProductReportingScope, isCbamReportingScope } from './reporting-scope';
import { CN_MASTER } from './cn-master.generated';

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
    /**
     * 이 사본이 다루는 보고기간. 지정하지 않으면 정렬상 **첫 기간**을 쓴다.
     * 기간이 둘 이상인데 지정이 없으면 readiness가 오류를 낸다 — 앱이 대신 고르지 않는다.
     */
    reportingPeriodId?: string;
    processes: ProductionProcess[];
    productOutputLines?: ProductOutputLine[];
    sourceStreams?: SourceStream[];
    precursors: PurchasedPrecursor[];
    products: Product[];
}
type ReportableExportScope = {
    products: Product[];
    processes: ProductionProcess[];
    productOutputLines: ProductOutputLine[];
    sourceStreams: SourceStream[];
    precursors: PurchasedPrecursor[];
    /** 이 사본이 다룬다고 선언한 기간. 기간이 없으면 undefined. */
    period?: ReportingPeriod;
    /** 다른 기간에 속해 제외된 행 수 — 화면에 알려야 한다. */
    excludedByPeriod: { processes: number; sourceStreams: number; precursors: number };
    /** 기간이 지정되지 않은 행 — 기간이 여럿일 때는 어디 속하는지 알 수 없다. */
    unassignedPeriod: { processes: number; sourceStreams: number; precursors: number };
};

/**
 * 이 사본이 다루는 보고기간을 정한다.
 *
 * EU Communication Template은 **한 보고기간**을 다루는 문서다. 종전에는 periods[0]을
 * 말없이 A_InstData에 찍었는데, 저장소가 UUID 순으로 돌려주므로 그 「[0]」이 무작위였다.
 * 이제 정렬은 local-db가 확정하고, 여러 기간이 있으면 호출부가 **명시적으로 고른다**.
 */
export function resolveExportPeriod(
    periods: ReportingPeriod[] = [],
    reportingPeriodId?: string
): ReportingPeriod | undefined {
    if (reportingPeriodId) {
        return periods.find((period) => period.id === reportingPeriodId);
    }
    return periods[0];
}

function createReportableExportScope(data: EuTemplateExportData): ReportableExportScope {
    const periods = data.periods ?? [];
    const period = resolveExportPeriod(periods, data.reportingPeriodId);
    // 기간이 하나뿐이면 period_id가 비어 있어도 모호하지 않다(속할 곳이 하나다).
    // 둘 이상이면 비어 있는 행을 어느 쪽에도 넣을 수 없다 — 세어서 오류로 올린다.
    const singlePeriod = periods.length <= 1;
    const inPeriod = (row: { period_id?: string }) =>
        !period || row.period_id === period.id || (singlePeriod && !row.period_id);
    const unassigned = (row: { period_id?: string }) => !singlePeriod && !row.period_id;

    const productById = new Map(data.products.map((product) => [product.id, product]));
    const products = data.products.filter((product) => isCbamReportingScope(getProductReportingScope(product)));
    const productIds = new Set(products.map((product) => product.id));
    const productOutputLines = (data.productOutputLines ?? []).filter((line) =>
        isCbamReportingScope(getProductReportingScope(line.product_id ? productById.get(line.product_id) : undefined, line))
    );
    const outputLineIds = new Set(productOutputLines.map((line) => line.id));
    const processIds = new Set(productOutputLines.map((line) => line.process_id));

    for (const process of data.processes) {
        if (process.product_id && productIds.has(process.product_id)) {
            processIds.add(process.id);
        }
    }

    // 보고범위(CBAM 대상인가)와 보고기간(이 문서가 다루는 기간인가)은 **다른 조건**이다.
    // 종전에는 앞의 것만 걸러서, 기간이 둘이면 2025·2026 자료가 섞인 문서에 한쪽 날짜만
    // 찍혔다. 문서가 스스로에 대해 거짓을 말하는 상태였다.
    const scopedProcesses = data.processes.filter((process) => processIds.has(process.id));
    const processes = scopedProcesses.filter(inPeriod);
    const inPeriodProcessIds = new Set(processes.map((process) => process.id));

    const scopedSourceStreams = (data.sourceStreams ?? []).filter((sourceStream) =>
        Boolean(sourceStream.process_id && processIds.has(sourceStream.process_id))
    );
    // 배출원·전구물질은 자기 period_id와 **소속 공정**이 둘 다 이 기간이어야 한다.
    // 공정이 빠졌는데 그 자식만 남으면 EU 시트에서 갈 곳 없는 행이 된다.
    const sourceStreams = scopedSourceStreams.filter(
        (sourceStream) => inPeriod(sourceStream) && inPeriodProcessIds.has(sourceStream.process_id ?? '')
    );

    const isReportablePrecursor = (precursor: PurchasedPrecursor) => {
        const allocations = precursor.output_allocations ?? [];

        if (allocations.length > 0) {
            return allocations.some((allocation) => {
                if (allocation.product_output_line_id) return outputLineIds.has(allocation.product_output_line_id);
                if (allocation.product_id) return productIds.has(allocation.product_id);
                return Boolean(precursor.process_id && processIds.has(precursor.process_id));
            });
        }

        return Boolean(
            (precursor.product_id && productIds.has(precursor.product_id))
            || (precursor.process_id && processIds.has(precursor.process_id))
        );
    };
    const scopedPrecursors = data.precursors.filter(isReportablePrecursor);
    const precursors = scopedPrecursors.filter(
        (precursor) => inPeriod(precursor) && (!precursor.process_id || inPeriodProcessIds.has(precursor.process_id))
    );

    return {
        products,
        processes,
        productOutputLines,
        sourceStreams,
        precursors,
        period,
        excludedByPeriod: {
            processes: scopedProcesses.length - processes.length,
            sourceStreams: scopedSourceStreams.length - sourceStreams.length,
            precursors: scopedPrecursors.length - precursors.length,
        },
        unassignedPeriod: {
            processes: scopedProcesses.filter(unassigned).length,
            sourceStreams: scopedSourceStreams.filter(unassigned).length,
            precursors: scopedPrecursors.filter(unassigned).length,
        },
    };
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
    area: '제품' | '생산공정' | '구매 전구물질' | '템플릿 한계' | '보고기간';
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
/**
 * **Export 시트가 실제로 다룰 수 있는 품목군.** 이름은 「STEEL」이지만 의미는
 * 「지금 이 앱이 EU 문서를 만들어 줄 수 있는 범위」다 — 시멘트·비료·알루미늄·수소는
 * CN 마스터에 있고 2단계에서 「CBAM 대상」으로 조회되지만 여기 없으면 문서가 안 나온다.
 * 그 사실을 화면이 **2단계에서** 말해야 한다(7단계에서 「매핑할 수 없습니다」로 만나면
 * 원인도 해법도 알 수 없다 — 씨밤이 P1-run09-01).
 */
const STEEL_EU_GOODS_SET = new Set([
    'Iron or steel products',
    'Crude steel',
    'Direct reduced iron',
    'Pig iron',
    'Alloys (FeMn, FeCr, FeNi)',
    'Sintered Ore',
]);
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

/**
 * CN → EU 품목군. **조회가 먼저, 접두 규칙은 최후 수단.**
 *
 * 종전엔 접두 사슬(7201·7203·7206·72xx·73)만 있었다. 그래서 소결광(CN 2601 12 00)이
 * 어디에도 안 걸려 「EU goods category로 매핑할 수 없습니다」로 Export가 막혔다 —
 * 2단계는 같은 CN을 「Sintered Ore로 조회됨」이라 말하고 있었는데도(씨밤이 P1-run09-01).
 *
 * CN 마스터는 공식 템플릿 숨김시트에서 뽑은 569개 CN의 권위 자료다. 워크북 업로드
 * 여부와 무관하게 답을 안다. 앱의 나머지가 이미 이걸로 판정하는데 Export 경로만
 * 접두 규칙에 남아 있었다.
 */
export function lookupEuGoodForCn(cnDigits: string, cnCodeMap?: EuCnCodeMap): string | undefined {
    // 1) 사용자가 올린 워크북의 맵 — 그 판본이 가장 정확하다.
    const fromTemplate = cnCodeMap?.get(cnDigits);
    if (fromTemplate) {
        return fromTemplate;
    }
    // 2) 내장 CN 마스터 — 업로드가 없어도(=화면 준비도 계산 시) 같은 답을 낸다.
    return CN_MASTER[cnDigits];
}

/** 이 CN으로 EU 문서를 만들 수 있는가. 없으면 품목군 이름과 함께 이유를 돌려준다. */
export function getEuExportGoodsSupport(
    cnDigits: string,
    cnCodeMap?: EuCnCodeMap
): { good?: string; supported: boolean } {
    const good = lookupEuGoodForCn(cnDigits, cnCodeMap);
    return { good, supported: Boolean(good && STEEL_EU_GOODS_SET.has(good)) };
}

function mapProductToEuGood(product: Product | undefined, cnCodeMap?: EuCnCodeMap): string | undefined {
    if (!product) {
        return undefined;
    }

    const hsCode = getProductCnOrHsCode(product);
    const looked = lookupEuGoodForCn(hsCode, cnCodeMap);

    if (looked && STEEL_EU_GOODS_SET.has(looked)) {
        return looked;
    }

    if (EU_GOODS_SET.has(product.product_type_enum) && STEEL_EU_GOODS_SET.has(product.product_type_enum)) {
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

    // 여기까지 왔다면 CN이 마스터에도, 업로드 워크북에도, 접두 사슬에도 없다.
    // 매핑을 지어내지 않는다 — readiness가 오류로 올리고 사용자가 CN을 확인한다.
    return undefined;
}

function mapPrecursorToEuGood(
    precursor: PurchasedPrecursor,
    product: Product | undefined,
    cnCodeMap?: EuCnCodeMap
): string | undefined {
    if (EU_GOODS_SET.has(precursor.aggregated_goods_category) && STEEL_EU_GOODS_SET.has(precursor.aggregated_goods_category)) {
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

    if (sourceStream.stream_type !== 'FUEL' && sourceStream.emission_factor_basis === 'PER_TJ') {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `${sourceStream.name}: tCO2/TJ 배출계수 기준은 연료 연소 배출원에만 사용하세요. 공정 원료는 활동자료 단위 기준으로 수정하세요.`,
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

    if ((sourceStream.factor_source_type ?? 'UNCLASSIFIED') === 'UNCLASSIFIED') {
        issues.push({
            severity: 'warning',
            area: '생산공정',
            message: `${sourceStream.name}: 배출계수 출처 유형이 분류되지 않았습니다. EU/IPCC 기본계수, 국가 인벤토리, 공급사 보증값·시험분석 중 하나로 근거를 정리하세요.`,
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
    const exportScope = createReportableExportScope(data);
    const productById = new Map(data.products.map((product) => [product.id, product]));
    const sourceStreamsByProcess = new Map<string, SourceStream[]>();
    const outputLinesByProcess = new Map<string, ProductOutputLine[]>();

    // ── 보고기간 ──────────────────────────────────────────────────────
    // EU Communication Template은 **한 보고기간**을 다루는 문서다. 앱이 대신 고르면
    // 사용자는 어느 기간이 나갔는지 모른 채 제출한다 — 종전엔 UUID 순서로 정해졌다.
    //
    // periods를 **넘기지 않은** 호출부(대시보드 요약 등)는 기간을 판단할 재료가 없다.
    // 그런 곳에 「보고기간이 없습니다」를 띄우면 자료가 멀쩡한데도 오류로 보인다.
    // 그래서 「안 넘김(undefined)」과 「없음([])」을 구분한다.
    const allPeriods = data.periods;

    if (allPeriods && allPeriods.length > 1 && !data.reportingPeriodId) {
        issues.push({
            severity: 'error',
            area: '보고기간',
            message: `보고기간이 ${allPeriods.length}개입니다. 이 사본이 다룰 기간을 먼저 고르세요 — 문서에는 한 기간만 기재됩니다.`,
        });
    } else if (data.reportingPeriodId && !exportScope.period) {
        issues.push({
            severity: 'error',
            area: '보고기간',
            message: '고른 보고기간을 찾지 못했습니다. 1단계에서 보고기간을 다시 확인하세요.',
        });
    } else if (allPeriods && allPeriods.length === 0) {
        issues.push({
            severity: 'error',
            area: '보고기간',
            message: '보고기간이 없습니다. 1단계에서 보고기간을 등록하세요 — A_InstData의 신고 범위가 비어 나갑니다.',
        });
    }

    // 기간이 여럿인데 소속이 비어 있는 자료는 어느 쪽에도 넣을 수 없다.
    // 넣으면 다른 기간의 배출이 이 문서에 섞이고, 빼면 이 기간의 배출이 빠진다.
    const unassignedTotal = exportScope.unassignedPeriod.processes
        + exportScope.unassignedPeriod.sourceStreams
        + exportScope.unassignedPeriod.precursors;

    if (unassignedTotal > 0) {
        issues.push({
            severity: 'error',
            area: '보고기간',
            message: `보고기간이 지정되지 않은 자료가 ${unassignedTotal}건 있습니다`
                + ` (공정 ${exportScope.unassignedPeriod.processes} · 배출원 ${exportScope.unassignedPeriod.sourceStreams} · 전구물질 ${exportScope.unassignedPeriod.precursors}).`
                + ' 기간이 둘 이상이라 어느 기간에 속하는지 앱이 판단할 수 없습니다 — 상세 입력에서 지정하세요.',
        });
    }

    const excludedTotal = exportScope.excludedByPeriod.processes
        + exportScope.excludedByPeriod.sourceStreams
        + exportScope.excludedByPeriod.precursors;

    if (exportScope.period && excludedTotal > unassignedTotal) {
        issues.push({
            severity: 'warning',
            area: '보고기간',
            message: `'${exportScope.period.name}' 밖의 자료 ${excludedTotal - unassignedTotal}건은 이 사본에서 제외됩니다`
                + ` (공정 ${exportScope.excludedByPeriod.processes} · 배출원 ${exportScope.excludedByPeriod.sourceStreams} · 전구물질 ${exportScope.excludedByPeriod.precursors} 중 기간 밖 분).`
                + ' 의도한 것인지 확인하세요.',
        });
    }

    for (const sourceStream of exportScope.sourceStreams) {
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

    if (exportScope.processes.length > 10) {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `현재 Export MVP는 생산공정 10개까지 지원합니다. 현재 ${exportScope.processes.length}개입니다.`,
        });
    }

    if (exportScope.precursors.length > 20) {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `현재 Export MVP는 구매 전구물질 20개까지 지원합니다. 현재 ${exportScope.precursors.length}개입니다.`,
        });
    }

    if (exportScope.sourceStreams.length > 75) {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `현재 Export MVP는 배출원 자료 75개까지 지원합니다. 현재 ${exportScope.sourceStreams.length}개입니다.`,
        });
    }

    const summaryProductLineCount = createSummaryProductRows({ ...data, ...exportScope }).length;

    if (summaryProductLineCount > 100) {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `현재 Export MVP는 Summary_Products 제품 행을 100개까지 지원합니다. 현재 ${summaryProductLineCount}개입니다.`,
        });
    }

    for (const product of exportScope.products) {
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
                message: `${product.name}: EU 문서를 만들 수 없는 품목입니다`
                    + (lookupEuGoodForCn(getProductCnOrHsCode(product), cnCodeMap)
                        ? ` — 품목군 「${lookupEuGoodForCn(getProductCnOrHsCode(product), cnCodeMap)}」은 아직 EU 문서 생성이 지원되지 않습니다(현재 철강 계열만).`
                        : ' — CN 코드가 EU 공식 목록에서 조회되지 않습니다. 2단계에서 CN을 확인하세요.'),
                target: { type: 'product', id: product.id },
            });
        }
    }

    for (const process of exportScope.processes) {
        const processOutputLines = outputLinesByProcess.get(process.id) ?? [];
        const reportableOutputLine = processOutputLines.find((line) =>
            isCbamReportingScope(getProductReportingScope(line.product_id ? productById.get(line.product_id) : undefined, line))
        );
        const processProduct = process.product_id ? productById.get(process.product_id) : undefined;
        const product = reportableOutputLine?.product_id ? productById.get(reportableOutputLine.product_id) : processProduct;
        const processSourceStreams = sourceStreamsByProcess.get(process.id) ?? [];
        const outputLineSummary = summarizeProductOutputLines(process.output_mass_t, processOutputLines);

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

        // D_Processes는 시장 출하량(L+16)과 내부 소비량(L+21)을 따로 묻는다.
        // 둘의 합이 총 생산량과 맞지 않으면, 문서가 스스로 앞뒤가 안 맞는 말을 하게 된다.
        // (지도가 만든 옛 공정은 둘 다 0이었다 — 총 생산량이 있는데도.)
        const splitTotal = process.market_output_mass_t + process.internal_consumption_mass_t;
        const splitDelta = Math.abs(splitTotal - process.output_mass_t);
        if (process.output_mass_t > 0 && splitDelta > Math.max(0.01, process.output_mass_t * 0.001)) {
            issues.push({
                severity: 'warning',
                area: '생산공정',
                message: `${process.name}: 시장 출하량(${process.market_output_mass_t.toFixed(1)} t) + 내부 소비량(${process.internal_consumption_mass_t.toFixed(1)} t)이`
                    + ` 총 생산량(${process.output_mass_t.toFixed(1)} t)과 ${splitDelta.toFixed(1)} t 차이납니다.`
                    + ' EU 문서에 두 값이 그대로 기재되므로 3단계에서 사내 이송량을 확인하세요.',
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
                severity: 'error',
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
                    severity: 'error',
                    area: '생산공정',
                    message: `${process.name}: B_EmInst 배출원 합계 ${sourceStreamEmissions.toFixed(4)} tCO2e와 D_Processes 직접배출량 ${process.direct_attributable_emissions_tco2e.toFixed(4)} tCO2e가 ${delta.toFixed(4)} tCO2e 차이납니다.`,
                    target: { type: 'process', id: process.id },
                });
            }
        }
    }

    for (const sourceStream of exportScope.sourceStreams) {
        issues.push(...validateSourceStreamForEuExport(sourceStream));
    }

    for (const precursor of exportScope.precursors) {
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
                message: `${precursor.name}: 기본값을 사용하는 사유가 비어 있습니다. 전달 전 기본값 사용 근거를 남기세요.`,
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
            label: '인증서 비용 시나리오 검토',
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
                    : `${readiness.warningCount}개 경고가 있습니다. 전달 전 검토가 필요합니다.`,
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
        return '다운로드는 가능하지만 경고 항목은 전달 전 검토하세요.';
    }

    if (backupStatus.tone !== 'success') {
        return '다운로드는 가능하지만 Communication Template 복사본 생성 전 .cbam 백업을 권장합니다.';
    }

    return '수입자 전달용 복사본을 생성할 수 있습니다.';
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

// 템플릿 c_CodeLists(F열=ISO 2자리 코드, G열=국가명)에서 코드↔이름 맵을 만든다.
// 사업장 국가(이름 필드)·전구물질 공급국(코드 필드)을 드롭다운에 맞게 정규화하는 데 쓴다.
function parseCountryMaps(zip: Record<string, Uint8Array>): EuCountryMaps {
    const codeToName = new Map<string, string>();
    const nameToCode = new Map<string, string>();
    const sheetTargetByName = parseWorkbookSheetTargets(zip);
    const cCodeListsPath = sheetTargetByName.get('c_CodeLists');
    const cCodeListsXml = cCodeListsPath ? zip[cCodeListsPath] : undefined;

    if (!cCodeListsXml) {
        return { codeToName, nameToCode };
    }

    const sharedStrings = parseSharedStrings(zip);
    const document = new DOMParser().parseFromString(strFromU8(cCodeListsXml), 'application/xml');

    for (const row of Array.from(document.getElementsByTagName('row'))) {
        const valuesByColumn = new Map<string, string>();

        for (const cell of Array.from(row.getElementsByTagName('c'))) {
            const reference = cell.getAttribute('r');

            if (!reference) {
                continue;
            }

            valuesByColumn.set(getColumnName(reference), readCellText(cell, sharedStrings));
        }

        const code = (valuesByColumn.get('F') ?? '').trim().toUpperCase();
        const name = (valuesByColumn.get('G') ?? '').trim();

        if (/^[A-Z]{2}$/.test(code) && name) {
            if (!codeToName.has(code)) {
                codeToName.set(code, name);
            }

            if (!nameToCode.has(name.toLowerCase())) {
                nameToCode.set(name.toLowerCase(), code);
            }
        }
    }

    return { codeToName, nameToCode };
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

// 앱에 내장한 공식 EU Communication Template(편의용 기본 사본). 사용자가 직접 업로드하면 덮어쓴다.
// 버전이 고정되어 있으므로 UI에 날짜를 표기하고 최신 공식본 확인을 안내한다.
export const DEFAULT_EU_TEMPLATE_PATH = '/templates/CBAM_Communication_template_for_installations_en_20241213.xlsx';
export const DEFAULT_EU_TEMPLATE_FILENAME = 'CBAM Communication template for installations_en_20241213.xlsx';
export const DEFAULT_EU_TEMPLATE_VERSION = '2024-12-13';

// 내장 기본 템플릿을 File로 불러온다. validateEuTemplateFile와 파일명 생성이 .name(.xlsx)에 의존하므로
// bare Blob이 아니라 공식 파일명을 가진 File로 감싼다.
export async function loadDefaultEuTemplateFile(): Promise<File> {
    const response = await fetch(DEFAULT_EU_TEMPLATE_PATH);
    if (!response.ok) {
        throw new Error('내장 EU 템플릿을 불러오지 못했습니다. 최신 공식 템플릿을 직접 업로드하세요.');
    }
    const blob = await response.blob();
    return new File([blob], DEFAULT_EU_TEMPLATE_FILENAME, {
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

// 앱 전력 EF 출처 enum → EU 템플릿 D_Processes EF 출처 드롭다운 코드(CONST_ElecSource).
// 허용값: D.4(a) IEA/Commission, D.4(b) 기타 공개자료, D.4.1 설비내(비열병합),
// D.4.2 설비내 열병합, D.4.3.1 직접 기술적 연결, D.4.3.2 PPA, Mix.
const ELECTRICITY_EF_SOURCE_TO_TEMPLATE: Record<string, string> = {
    COUNTRY_GRID_DEFAULT: 'D.4(a)',
    DIRECT_TECHNICAL_LINK: 'D.4.3.1',
    PPA: 'D.4.3.2',
    INSTALLATION_OWN: 'D.4.1',
    MIX: 'Mix',
};

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

        // 전력 EF 출처 유형(분류된 경우만) → D_Processes "Source of the emission factor" 셀(L+56, 예: L67)
        const efSourceCode = process.electricity_ef_source
            ? ELECTRICITY_EF_SOURCE_TO_TEMPLATE[process.electricity_ef_source]
            : undefined;
        if (efSourceCode) {
            writes.push({
                sheetName: 'D_Processes',
                cell: `L${startRow + 56}`,
                label: '전력 EF 출처',
                value: efSourceCode,
                sourceId: process.id,
            });
        }
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
    if (sourceStream.stream_type === 'FUEL' && getSourceStreamEmissionFactorBasis(sourceStream) === 'PER_TJ') {
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
            return applicability.relevance === 'INCLUDED'
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

// EU 템플릿 국가 필드는 두 가지 표기를 요구한다: 사업장 국가(A_InstData!I26)는 국가"명" 드롭다운,
// 전구물질 공급국(A_InstData!F102)은 2자리 ISO"코드" 드롭다운. 앱은 국가를 코드 또는 자유텍스트로
// 저장하므로 템플릿 c_CodeLists의 코드↔이름 목록으로 정규화해 드롭다운에 맞는 값을 기재한다.
interface EuCountryMaps {
    codeToName: Map<string, string>;
    nameToCode: Map<string, string>;
}

// 자유텍스트 국가명 → ISO 코드 별칭(템플릿 정식명과 다르게 입력된 흔한 표기 보정).
const COUNTRY_NAME_ALIASES: Record<string, string> = {
    'south korea': 'KR',
    'korea': 'KR',
    'republic of korea': 'KR',
    'korea, south': 'KR',
    'north korea': 'KP',
    'china': 'CN',
    'p.r. china': 'CN',
    "people's republic of china": 'CN',
    'japan': 'JP',
    'taiwan': 'TW',
    'chinese taipei': 'TW',
    'vietnam': 'VN',
    'viet nam': 'VN',
    'united states': 'US',
    'united states of america': 'US',
    'usa': 'US',
    'u.s.a.': 'US',
    'united kingdom': 'GB',
    'uk': 'GB',
    'russia': 'RU',
    'india': 'IN',
    'germany': 'DE',
    'turkey': 'TR',
    'türkiye': 'TR',
};

// 입력(코드/국가명/별칭)을 ISO 2자리 코드로 정규화. 매핑 실패 시 undefined(호출부에서 원본 유지).
function resolveCountryCode(input: string | undefined, maps?: EuCountryMaps): string | undefined {
    const raw = (input ?? '').trim();
    if (!raw) {
        return undefined;
    }

    const upper = raw.toUpperCase();

    if (/^[A-Z]{2}$/.test(upper) && (!maps || maps.codeToName.has(upper))) {
        return upper;
    }

    const byName = maps?.nameToCode.get(raw.toLowerCase());
    if (byName) {
        return byName;
    }

    const alias = COUNTRY_NAME_ALIASES[raw.toLowerCase()];
    if (alias) {
        return alias;
    }

    return /^[A-Z]{2}$/.test(upper) ? upper : undefined;
}

// 입력(코드/국가명/별칭)을 템플릿 정식 국가명으로 정규화. 매핑 실패 시 undefined(호출부에서 원본 유지).
function resolveCountryName(input: string | undefined, maps?: EuCountryMaps): string | undefined {
    const raw = (input ?? '').trim();
    if (!raw) {
        return undefined;
    }

    if (maps?.nameToCode.has(raw.toLowerCase())) {
        return raw;
    }

    const code = resolveCountryCode(raw, maps);
    if (code && maps?.codeToName.has(code)) {
        return maps.codeToName.get(code);
    }

    return undefined;
}

function createInstallationCellWrites(
    installations: Installation[] = [],
    // 이 사본이 다룬다고 선언한 기간을 **그대로** 받는다. 여기서 periods[0]을 다시 고르면
    // 자료를 거른 기준(createReportableExportScope)과 문서에 찍히는 날짜가 갈라질 수 있다.
    period: ReportingPeriod | undefined,
    countryMaps?: EuCountryMaps
): EuTemplateExportCellWrite[] {
    const installation = installations[0];
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
                label: '사업장 국가(국가명)',
                value: resolveCountryName(installation.country, countryMaps) ?? installation.country,
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

function getPrecursorRoutesForEuExport(precursor: PurchasedPrecursor): string[] {
    const route = precursor.production_route.trim();

    if (!route || route.toLowerCase() === 'external precursor') {
        return [];
    }

    return [route];
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

// EU 템플릿은 집계품목별로 허용 생산경로 드롭다운이 다르다(A_InstData 라우트 셀 = INDIRECT($T)).
// 철강 최종제품·조강·선철·소결광은 'All production routes'만 허용, DRI·합금철은 세부 경로만 허용.
// 앱의 자유텍스트 경로가 목록에 없으면 템플릿 검증을 위반하므로 허용값으로 정규화한다.
const EU_GOOD_ALLOWED_ROUTES: Record<string, string[]> = {
    'Iron or steel products': ['All production routes'],
    'Crude steel': ['All production routes'],
    'Pig iron': ['All production routes'],
    'Sintered Ore': ['All production routes'],
    'Direct reduced iron': ['Basic oxygen steelmaking', 'Electric arc furnace', 'Other production routes', 'Unknown production routes'],
    'Alloys (FeMn, FeCr, FeNi)': ['Blast furnace route', 'Smelting reduction', 'Other production routes', 'Unknown production routes'],
};

// 자유텍스트 경로 하나를 해당 품목의 허용 드롭다운 값으로 정규화. 이미 유효하면 그대로,
// 단일 허용값이면 그 값, 매칭 실패 시 'Other production routes'(있으면)로 폴백.
function normalizeEuRoute(good: string, route: string): string {
    const allowed = EU_GOOD_ALLOWED_ROUTES[good];

    if (!allowed || allowed.length === 0 || allowed.includes(route)) {
        return route;
    }

    if (allowed.length === 1) {
        return allowed[0];
    }

    return allowed.includes('Other production routes') ? 'Other production routes' : allowed[0];
}

function getEuAggregatedGoodRoutes(good: string, routes: string[]): string[] {
    const allowed = EU_GOOD_ALLOWED_ROUTES[good];

    if (!allowed) {
        return routes;
    }

    // 단일 허용값(대부분의 철강 품목) → 그 값 하나로 축약. 세부 경로 품목 → 각 경로를 허용값으로 정규화·중복 제거.
    if (allowed.length === 1) {
        return [allowed[0]];
    }

    return Array.from(new Set(routes.map((route) => normalizeEuRoute(good, route))));
}

function createAggregatedGoodsAndBoundaryCellWrites(
    data: EuTemplateExportData,
    cnCodeMap?: EuCnCodeMap,
    countryMaps?: EuCountryMaps
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
        const routes = getEuAggregatedGoodRoutes(row.good, row.routes);

        writes.push({
            sheetName: 'A_InstData',
            cell: `E${sheetRow}`,
            label: 'Aggregated goods category',
            value: row.good,
            sourceId: row.sourceId,
        });

        routes.slice(0, 6).forEach((route, routeIndex) => {
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
        const outputLines = outputLinesByProcess.get(process.id) ?? [];
        const outputProduct = outputLines[0]?.product_id ? productById.get(outputLines[0].product_id) : undefined;
        const product = (process.product_id ? productById.get(process.product_id) : undefined) ?? outputProduct;
        const euGood = mapProductToEuGood(product, cnCodeMap);

        if (!euGood) {
            return;
        }

        const sheetRow = 83 + index;
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

    data.precursors.slice(0, 20).forEach((precursor, index) => {
        const product = precursor.product_id ? productById.get(precursor.product_id) : undefined;
        const euGood = mapPrecursorToEuGood(precursor, product, cnCodeMap);

        if (!euGood) {
            return;
        }

        const sheetRow = 102 + index;

        writes.push(
            {
                sheetName: 'A_InstData',
                cell: `E${sheetRow}`,
                label: 'Purchased precursor goods category',
                value: euGood,
                sourceId: precursor.id,
            },
            {
                sheetName: 'A_InstData',
                cell: `F${sheetRow}`,
                label: 'Purchased precursor country code',
                value: resolveCountryCode(precursor.supplier_country, countryMaps) ?? precursor.supplier_country,
                sourceId: precursor.id,
            },
            {
                sheetName: 'A_InstData',
                cell: `L${sheetRow}`,
                label: 'Purchased precursor name',
                value: precursor.name,
                sourceId: precursor.id,
            }
        );

        getPrecursorRoutesForEuExport(precursor).slice(0, 5).forEach((route, routeIndex) => {
            writes.push({
                sheetName: 'A_InstData',
                cell: `${String.fromCharCode('G'.charCodeAt(0) + routeIndex)}${sheetRow}`,
                label: 'Purchased precursor production route',
                value: route,
                sourceId: precursor.id,
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

// E_PurchPrec의 SEE 'Source' 셀은 Measured/Default/Unknown 드롭다운이다(자유텍스트 출처가 아님).
// 데이터 모드를 매핑한다: 기본값 사용=Default, 실측/혼합(측정 기반)=Measured.
function getEuPrecursorSeeSourceType(precursor: PurchasedPrecursor): string {
    return precursor.data_mode === 'DEFAULT' ? 'Default' : 'Measured';
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
            { sheetName: 'E_PurchPrec', cell: `M${startRow + 35}`, label: '직접 SEE 데이터 출처유형(Measured/Default/Unknown)', value: getEuPrecursorSeeSourceType(precursor), sourceId: precursor.id },
            // 간접 SEE = 전력사용량(MWh/t) × 전력계수(tCO₂e/MWh). 공급사가 두 값을 따로 줬으면
            // 그대로 기재해 검증 추적성을 살린다. 없으면 사용량 1로 두고 간접값 전량을 계수로 우겨넣는다(bridge).
            ...(() => {
                const hasBridge =
                    precursor.indirect_electricity_mwh_per_t != null &&
                    precursor.indirect_electricity_mwh_per_t > 0 &&
                    precursor.indirect_electricity_factor_tco2e_per_mwh != null &&
                    precursor.indirect_electricity_factor_tco2e_per_mwh > 0;
                return [
                    {
                        sheetName: 'E_PurchPrec' as const,
                        cell: `L${startRow + 36}`,
                        label: '전구물질 간접 SEE 환산 전력사용량',
                        value: hasBridge
                            ? precursor.indirect_electricity_mwh_per_t!
                            : precursor.indirect_see_tco2e_per_t > 0 ? 1 : 0,
                        sourceId: precursor.id,
                    },
                    {
                        sheetName: 'E_PurchPrec' as const,
                        cell: `L${startRow + 37}`,
                        label: '전구물질 간접 SEE 환산 전력계수',
                        value: hasBridge
                            ? precursor.indirect_electricity_factor_tco2e_per_mwh!
                            : precursor.indirect_see_tco2e_per_t,
                        sourceId: precursor.id,
                    },
                ];
            })(),
            {
                sheetName: 'E_PurchPrec',
                // 이 justification 입력은 병합셀 K:M이고 앵커가 K열이므로 K에 기재한다(L은 병합 내부 셀).
                cell: `K${startRow + 40}`,
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
    cnCodeMap?: EuCnCodeMap,
    countryMaps?: EuCountryMaps
): EuTemplateExportCellWrite[] {
    const exportScope = createReportableExportScope(data);
    const exportData: EuTemplateExportData = { ...data, ...exportScope };
    return [
        ...createInstallationCellWrites(data.installations, exportScope.period, countryMaps),
        ...createAggregatedGoodsAndBoundaryCellWrites(exportData, cnCodeMap, countryMaps),
        ...createSourceStreamCellWrites(exportScope.sourceStreams),
        ...createEmissionsEnergyCellWrites(exportScope.processes, exportScope.products),
        ...createProcessCellWrites(exportScope.processes),
        ...createPrecursorCellWrites(exportScope.precursors),
        ...createSummaryProductCellWrites(exportData),
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
    const countryMaps = parseCountryMaps(zip);
    const readiness = evaluateEuExportReadiness(data, cnCodeMap);

    if (!readiness.canExportDraft) {
        throw new Error('EU Communication Template Export 전에 오류 항목을 먼저 해결해야 합니다.');
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

    const cellWrites = createEuTemplateExportCellWrites(data, cnCodeMap, countryMaps);
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
            `EU Communication Template Export 검증에 실패했습니다. ${firstMismatch.sheetName}!${firstMismatch.cell} ${firstMismatch.label} 값이 예상과 다릅니다. expected=${firstMismatch.expected}, actual=${firstMismatch.actual}`
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
