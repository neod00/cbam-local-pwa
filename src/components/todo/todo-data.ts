import { calculateLocalResults, getLocalCalculationWarningHref } from '@/lib/calculation-engine';
import { computeDefaultSubstitutionImpact } from '@/lib/default-substitution';
import { evaluateEuExportReadiness, getEuExportIssueEditHref } from '@/lib/eu-template-export';
import { EXPORT_PERIOD_SETTING_KEY, getLocalSetting, listLocalItems, type Installation, type ProductionProcess, type PurchasedPrecursor, type SourceStream } from '@/lib/local-db';
import type { ImportedDefaultValueReference } from '@/lib/reference-workbooks';
import { getProductReportingScope, isCbamReportingScope } from '@/lib/reporting-scope';
import { buildTodoItems, type TodoEngineWarning, type TodoReadinessIssue, type TodoResult } from '@/lib/todo-items';

/**
 * 할 일 화면의 자료 읽기 — **읽기만 한다**(저장소에 쓰지 않는다. 쓰기는 화면이 질문 화면의 쓰기 함수를 그대로 부른다).
 * 지도 7단계·질문 화면과 같은 검사·같은 엔진을 한 번씩 돌려, 할 일 규칙(`buildTodoItems`)에 넘긴다.
 */

export interface TodoData {
    result: TodoResult;
    processes: ProductionProcess[];
    /** 입력칸이 고칠 레코드(저장 때 기존 값을 펼쳐 칸 없는 값을 지킨다) */
    installations: Installation[];
    sourceStreams: SourceStream[];
    precursors: PurchasedPrecursor[];
}

/** 저장소는 만든 순서가 아니라 id 순으로 돌려준다 — 「첫 제품」을 만든 순서로 고정한다(질문 화면과 같은 규칙). */
const byCreation = <T extends { created_at: string; id: string }>(rows: T[]): T[] => [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

export async function loadTodoData(): Promise<TodoData> {
    const [installations, periods, rawProducts, rawProcesses, productOutputLines, sourceStreams, precursors, internalTransfers] = await Promise.all([
        listLocalItems('installations'),
        listLocalItems('periods'),
        listLocalItems('products'),
        listLocalItems('processes'),
        listLocalItems('product_output_lines'),
        listLocalItems('source_streams'),
        listLocalItems('precursors'),
        listLocalItems('internal_transfers'),
    ]);
    const allProducts = byCreation(rawProducts);
    const processes = byCreation(rawProcesses);
    const products = allProducts.filter((product) => isCbamReportingScope(getProductReportingScope(product)));
    const reportingPeriodId = await getLocalSetting<string>(EXPORT_PERIOD_SETTING_KEY);
    const defaultValues = await getLocalSetting<ImportedDefaultValueReference>('reference:default-values');

    const engine = { internalTransfers, products: allProducts, periods, processes, productOutputLines, sourceStreams, precursors };
    // 지도·막대와 같은 기간만 본다(질문 화면과 같은 규칙: 기간이 하나면 전부, 둘 이상이면 첫 기간).
    const periodId = periods.length <= 1 ? undefined : periods[0]?.id;
    const results = calculateLocalResults(engine).filter((result) => !periodId || result.period_id === periodId);

    const readiness = evaluateEuExportReadiness({ internalTransfers, periods, reportingPeriodId, products: allProducts, processes, productOutputLines, sourceStreams, precursors, installations });
    const readinessIssues: TodoReadinessIssue[] = readiness.issues.map((issue) => ({
        severity: issue.severity,
        area: issue.area,
        message: issue.message,
        href: getEuExportIssueEditHref(issue),
        precursorId: issue.target?.type === 'precursor' ? issue.target.id : undefined,
        targetId: issue.target?.id,
        fix: issue.fix,
    }));

    // 엔진 경고는 출력 라인마다 같은 문장이 되풀이될 수 있어 (대상, 문장)으로 한 번만 센다.
    const seen = new Set<string>();
    const engineWarnings: TodoEngineWarning[] = [];
    for (const result of results) {
        for (const warning of result.warningDetails) {
            const key = `${warning.target.id}|${warning.message}`;
            if (seen.has(key)) continue;
            seen.add(key);
            engineWarnings.push({ message: warning.message, targetType: warning.target.type, targetId: warning.target.id, href: getLocalCalculationWarningHref(warning) });
        }
    }

    const result = buildTodoItems({
        installations,
        periods,
        products,
        processes,
        precursors,
        sourceStreams,
        internalTransfers,
        readinessIssues,
        engineWarnings,
        impactOf: (precursorId) => computeDefaultSubstitutionImpact({ engine, periodId, precursorId, defaultValues }),
    });
    return { result, processes, installations, sourceStreams, precursors };
}
