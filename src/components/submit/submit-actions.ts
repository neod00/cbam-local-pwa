import { createCalculationReport } from '@/lib/calculation-report';
import { createDeliveryPackage } from '@/lib/delivery-package';
import { createEuExportFilename, createEuTemplateExportCopyResult, downloadBlob, scopeRecordsToExportPeriod } from '@/lib/eu-template-export';
import { CBAM_LAST_BACKUP_AT_KEY, exportLocalBackup } from '@/lib/local-db';
import { buildSubmitChecklist, type SubmitData } from './submit-data';

/**
 * 제출 화면의 **유일한 쓰기·내려받기 자리** — 파일을 만들어 내려받고, 백업을 만들었으면 「마지막 백업」 시각만 기록한다(저장소 레코드는 건드리지 않는다).
 * 파일을 만드는 호출은 상세 Export 화면(`/export`)과 같은 자료·같은 순서다(scripts/verify-submit.mjs가 호출 모양을 대조한다).
 * 오류는 던진다 — 화면이 사람이 읽을 문장으로 보인다.
 */

function requireTemplate(data: SubmitData) {
    if (!data.template || !data.template.validation.isValid) {
        throw new Error('내장 EU 템플릿을 불러오지 못했습니다. 상세 Export 화면에서 EU 원본 템플릿(.xlsx)을 직접 올리세요.');
    }
    return data.template;
}

function exportRecords(data: SubmitData) {
    return {
        installations: data.installations,
        periods: data.periods,
        reportingPeriodId: data.reportingPeriodId,
        internalTransfers: data.internalTransfers,
        processes: data.processes,
        productOutputLines: data.productOutputLines,
        sourceStreams: data.sourceStreams,
        precursors: data.precursors,
        products: data.products,
    };
}

export async function downloadEuCopy(data: SubmitData) {
    const template = requireTemplate(data);
    const result = await createEuTemplateExportCopyResult(template.file, { ...exportRecords(data), internalTransfers: data.internalTransfers });
    const filename = createEuExportFilename(template.file.name);
    downloadBlob(result.blob, filename);
    return { filename, writtenCellCount: result.writtenCellCount };
}

function buildReport(data: SubmitData, generatedAt: Date) {
    const { reportableResults } = buildSubmitChecklist(data);
    const docScope = scopeRecordsToExportPeriod({
        periods: data.periods,
        reportingPeriodId: data.reportingPeriodId,
        processes: data.processes,
        productOutputLines: data.productOutputLines,
        sourceStreams: data.sourceStreams,
        precursors: data.precursors,
        results: reportableResults,
    });
    // 기간이 둘 이상인데 고르지 않았으면 앱이 대신 고르지 않는다 — 어느 해의 보고서인지 모른 채 나간다.
    if (data.periods.length > 1 && !data.periods.some((period) => period.id === data.reportingPeriodId)) {
        throw new Error(`보고기간이 ${data.periods.length}개입니다. 지도 화면 1단계에서 문서에 넣을 기간을 먼저 고르세요.`);
    }
    const report = createCalculationReport({
        installations: data.installations,
        periods: docScope.periods,
        products: data.products,
        processes: docScope.processes,
        productOutputLines: docScope.productOutputLines,
        sourceStreams: docScope.sourceStreams,
        precursors: docScope.precursors,
        results: docScope.results,
        internalTransfers: data.internalTransfers,
        generatedAt,
        defaultValues: data.defaultValueReference,
        reportInputs: data.reportInputs,
    });
    return { report, docScope };
}

export async function downloadReport(data: SubmitData) {
    const { report } = buildReport(data, new Date());
    downloadBlob(report.blob, report.filename);
    return { filename: report.filename, notices: report.issues.map((issue) => `[${issue.gate}] ${issue.message}`) };
}

export async function downloadPackage(data: SubmitData) {
    const template = requireTemplate(data);
    const generatedAt = new Date();
    const exportResult = await createEuTemplateExportCopyResult(template.file, { ...exportRecords(data), internalTransfers: data.internalTransfers });
    const exportWorkbookFilename = createEuExportFilename(template.file.name);
    const backup = await exportLocalBackup();
    // 산정보고서는 여기서 만들어 패키지에 넣는다. 발행 게이트가 막으면 예외로 올라와 패키지 생성이 중단된다 — 미완성 보고서를 담아 내보내지 않기 위함.
    const { report: calculationReport, docScope } = buildReport(data, generatedAt);
    const { checklist, readiness } = buildSubmitChecklist(data, { checkedCellCount: exportResult.verification.checkedCellCount });
    const packageResult = await createDeliveryPackage({
        backup,
        calculationReportBlob: calculationReport.blob,
        exportChecklist: checklist,
        exportVerification: exportResult.verification,
        exportWorkbookBlob: exportResult.blob,
        exportWorkbookFilename,
        generatedAt,
        installations: data.installations,
        periods: docScope.periods,
        precursors: docScope.precursors,
        processes: docScope.processes,
        products: data.products,
        readiness,
        results: docScope.results,
        sourceStreams: docScope.sourceStreams,
        templateFilename: template.file.name,
        writtenCellCount: exportResult.writtenCellCount,
    });
    downloadBlob(packageResult.blob, packageResult.filename);
    window.localStorage.setItem(CBAM_LAST_BACKUP_AT_KEY, backup.manifest.exported_at);
    return { filename: packageResult.filename, files: packageResult.files, backupAt: backup.manifest.exported_at, notices: calculationReport.issues.map((issue) => `[${issue.gate}] ${issue.message}`) };
}

/** 백업(.cbam)만 받는다 — 설정 화면의 「백업 내보내기」와 같은 파일 형식·이름 규칙. */
export async function downloadBackupOnly() {
    const backup = await exportLocalBackup();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    const filename = `cbam-local-backup-${stamp}.cbam`;
    downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), filename);
    window.localStorage.setItem(CBAM_LAST_BACKUP_AT_KEY, backup.manifest.exported_at);
    return { filename, backupAt: backup.manifest.exported_at };
}
