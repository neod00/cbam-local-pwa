import { loadTodoData } from '@/components/todo/todo-data';
import { calculateLocalResults } from '@/lib/calculation-engine';
import {
    createEuTemplateExportCellWrites,
    createExportChecklist,
    evaluateEuExportReadiness,
    getEuExportIssueEditHref,
    loadDefaultEuTemplateFile,
    scopeRecordsToExportPeriod,
    validateEuTemplateFile,
    type EuTemplateValidationResult,
} from '@/lib/eu-template-export';
import {
    CBAM_LAST_BACKUP_AT_KEY,
    EXPORT_PERIOD_SETTING_KEY,
    getBackupStatus,
    getLocalSetting,
    listLocalItems,
    REPORT_INPUTS_SETTING_KEY,
    type Installation,
    type InternalTransfer,
    type Product,
    type ProductOutputLine,
    type ProductionProcess,
    type PurchasedPrecursor,
    type ReportInputs,
    type ReportingPeriod,
    type SourceStream,
} from '@/lib/local-db';
import type { ImportedBenchmarkReference, ImportedDefaultValueReference } from '@/lib/reference-workbooks';
import {
    calculateProductScenarios,
    getScenarioReviewAction,
    normalizeScenarioAssumptions,
    SCENARIO_ASSUMPTIONS_SETTING_KEY,
    summarizeScenarioRisks,
    type ScenarioAssumptions,
} from '@/lib/scenario-calculation';
import { buildSubmissionSummary, type SubmissionSummary } from '@/lib/submission-status';

/**
 * 제출 화면의 자료 읽기 — **읽기만 한다**. 상세 Export 화면(`/export`)이 파일을 만들 때 쓰는 것과 같은 자료·같은 함수로 모은다
 * (보고기간 범위 맞추기, 준비도 검사, 점검표). 쓰기는 submit-actions.ts 한 곳이다.
 */
export interface SubmitData {
    installations: Installation[];
    periods: ReportingPeriod[];
    reportingPeriodId?: string;
    internalTransfers: InternalTransfer[];
    processes: ProductionProcess[];
    productOutputLines: ProductOutputLine[];
    sourceStreams: SourceStream[];
    precursors: PurchasedPrecursor[];
    products: Product[];
    defaultValueReference?: ImportedDefaultValueReference;
    benchmarkReference?: ImportedBenchmarkReference;
    reportInputs?: ReportInputs;
    scenarioAssumptions?: ScenarioAssumptions;
    template?: { file: File; validation: EuTemplateValidationResult };
    lastBackupAt?: string;
    summary: SubmissionSummary;
    /** 신고 대상 결과(제품 라인) 수 */
    reportableCount: number;
    readinessErrorCount: number;
    readinessWarningCount: number;
    headline: { see: number | null; totalSee: number } | null;
}

export async function loadSubmitData(): Promise<SubmitData> {
    const [
        installations,
        periods,
        processes,
        productOutputLines,
        sourceStreams,
        precursors,
        products,
        internalTransfers,
        benchmarkReference,
        defaultValueReference,
        scenarioAssumptions,
        reportInputs,
        reportingPeriodId,
        todo,
    ] = await Promise.all([
        listLocalItems('installations'),
        listLocalItems('periods'),
        listLocalItems('processes'),
        listLocalItems('product_output_lines'),
        listLocalItems('source_streams'),
        listLocalItems('precursors'),
        listLocalItems('products'),
        listLocalItems('internal_transfers'),
        getLocalSetting<ImportedBenchmarkReference>('reference:benchmarks'),
        getLocalSetting<ImportedDefaultValueReference>('reference:default-values'),
        getLocalSetting<ScenarioAssumptions>(SCENARIO_ASSUMPTIONS_SETTING_KEY),
        getLocalSetting<ReportInputs>(REPORT_INPUTS_SETTING_KEY),
        getLocalSetting<string>(EXPORT_PERIOD_SETTING_KEY),
        loadTodoData(),
    ]);

    // 내장 템플릿: 있으면 검증해 둔다(없거나 실패하면 상세 Export 화면에서 직접 올리게 한다).
    let template: SubmitData['template'];
    try {
        const file = await loadDefaultEuTemplateFile();
        template = { file, validation: await validateEuTemplateFile(file) };
    } catch {
        template = undefined;
    }

    const results = calculateLocalResults({ internalTransfers, processes, precursors, products, periods, sourceStreams, productOutputLines });
    const reportableResults = results.filter((result) => result.is_cbam_reportable && result.see_cbam_basis !== null);
    const docScope = scopeRecordsToExportPeriod({ periods, reportingPeriodId, processes, productOutputLines, sourceStreams, precursors, results: reportableResults });
    const readiness = evaluateEuExportReadiness({ installations, periods, reportingPeriodId, internalTransfers, processes, productOutputLines, sourceStreams, precursors, products }, template?.validation?.cnCodeMap);
    const scopedResults = docScope.results;

    const exportPeriod = periods.length === 1 ? periods[0] : periods.find((period) => period.id === reportingPeriodId);
    const lastBackupAt = typeof window === 'undefined' ? undefined : window.localStorage.getItem(CBAM_LAST_BACKUP_AT_KEY) ?? undefined;
    const summary = buildSubmissionSummary({
        installation: installations[0],
        exportPeriod,
        periodCount: periods.length,
        products: scopedResults.map((result) => ({ name: result.product_name, cnCode: result.cn_code, outputMassT: result.output_mass_t })),
        precursors: docScope.precursors,
        fuelOrElectricityEntered: docScope.sourceStreams.length > 0 || docScope.processes.some((process) => process.electricity_mwh > 0 || process.direct_attributable_emissions_tco2e > 0),
        readiness,
        blockingIssues: readiness.issues.filter((issue) => issue.severity === 'error').map((issue) => ({ message: issue.message, href: getEuExportIssueEditHref(issue) })),
        todoItems: todo.result.items,
        attribution: todo.attribution,
    });

    const headlineResults = scopedResults;
    const output = headlineResults.reduce((sum, result) => sum + result.output_mass_t, 0);
    const headline = headlineResults.length > 0 && output > 0
        ? {
            see: headlineResults.every((result) => result.see_cbam_basis !== null)
                ? headlineResults.reduce((sum, result) => sum + (result.see_cbam_basis ?? 0) * result.output_mass_t, 0) / output
                : null,
            totalSee: headlineResults.reduce((sum, result) => sum + result.total_see * result.output_mass_t, 0) / output,
        }
        : null;

    return {
        installations,
        periods,
        reportingPeriodId,
        internalTransfers,
        processes,
        productOutputLines,
        sourceStreams,
        precursors,
        products,
        defaultValueReference,
        benchmarkReference,
        reportInputs,
        scenarioAssumptions,
        template,
        lastBackupAt,
        summary,
        reportableCount: reportableResults.length,
        readinessErrorCount: readiness.errorCount,
        readinessWarningCount: readiness.warningCount,
        headline,
    };
}

/** 패키지에 담는 점검표 — 상세 Export 화면과 같은 입력으로 만든다. `lastExportResult`는 사본을 방금 만든 뒤에 넘긴다. */
export function buildSubmitChecklist(data: SubmitData, lastExportResult?: { checkedCellCount: number }) {
    const reportableResults = calculateLocalResults({
        internalTransfers: data.internalTransfers,
        processes: data.processes,
        precursors: data.precursors,
        products: data.products,
        periods: data.periods,
        sourceStreams: data.sourceStreams,
        productOutputLines: data.productOutputLines,
    }).filter((result) => result.is_cbam_reportable && result.see_cbam_basis !== null);
    const readiness = evaluateEuExportReadiness(
        { installations: data.installations, periods: data.periods, reportingPeriodId: data.reportingPeriodId, internalTransfers: data.internalTransfers, processes: data.processes, productOutputLines: data.productOutputLines, sourceStreams: data.sourceStreams, precursors: data.precursors, products: data.products },
        data.template?.validation?.cnCodeMap
    );
    const plannedCellWrites = createEuTemplateExportCellWrites(
        { installations: data.installations, periods: data.periods, reportingPeriodId: data.reportingPeriodId, internalTransfers: data.internalTransfers, processes: data.processes, productOutputLines: data.productOutputLines, sourceStreams: data.sourceStreams, precursors: data.precursors, products: data.products },
        data.template?.validation?.cnCodeMap
    );
    const scenarioRiskSummary = summarizeScenarioRisks(calculateProductScenarios(reportableResults, normalizeScenarioAssumptions(data.scenarioAssumptions), {
        benchmarks: data.benchmarkReference,
        defaultValues: data.defaultValueReference,
    }));
    const scenarioChecklistAction = getScenarioReviewAction(scenarioRiskSummary, Boolean(data.benchmarkReference), Boolean(data.defaultValueReference));
    const checklist = createExportChecklist({
        backupStatus: getBackupStatus(data.lastBackupAt),
        lastExportResult,
        plannedCellWriteCount: plannedCellWrites.length,
        readiness,
        resultCount: reportableResults.length,
        scenarioAction: scenarioChecklistAction,
        scenarioRiskSummary,
        templateFileName: data.template?.file.name,
        validation: data.template?.validation,
    });
    return { checklist, readiness, reportableResults };
}
