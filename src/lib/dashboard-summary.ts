import type { LocalCalculationResult } from './calculation-engine';
import { getLocalCalculationWarningHref } from './calculation-engine';
import type { ScenarioRiskSummary } from './scenario-calculation';
import { getScenarioReviewAction } from './scenario-calculation';

export type DashboardTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'pending';

export interface DashboardTask {
    label: string;
    href: string;
    tone: DashboardTone;
}

export interface DashboardStep {
    name: string;
    status: string;
    tone: DashboardTone;
}

export interface DashboardSummaryInput {
    results: LocalCalculationResult[];
    productCount: number;
    processCount: number;
    precursorCount: number;
    scenarioRiskSummary: ScenarioRiskSummary;
    exportIssueCount: number;
    exportErrorCount: number;
    hasBenchmarkReference: boolean;
    hasDefaultValueReference: boolean;
}

export interface DashboardSummary {
    totalOutput: number;
    warningCount: number;
    readinessRate: number;
    steps: DashboardStep[];
    recentTasks: DashboardTask[];
}

function getWarningTasks(results: LocalCalculationResult[]): DashboardTask[] {
    return results.flatMap((result) =>
        result.warningDetails.map((warning) => ({
            label: `${result.process_name}: ${warning.message}`,
            href: getLocalCalculationWarningHref(warning),
            tone: 'warning',
        }))
    );
}

function getScenarioActionTasks(input: DashboardSummaryInput): DashboardTask[] {
    const tasks: DashboardTask[] = [];
    const { exportErrorCount, hasBenchmarkReference, hasDefaultValueReference, scenarioRiskSummary } = input;
    const scenarioAction = getScenarioReviewAction(
        scenarioRiskSummary,
        hasBenchmarkReference,
        hasDefaultValueReference
    );

    if (scenarioAction.href === '/products') {
        tasks.push({
            label: `CN 코드가 없는 품목 ${scenarioRiskSummary.missing_cn_count}건을 먼저 확인하세요.`,
            href: scenarioAction.href,
            tone: 'danger',
        });
    }

    if (scenarioRiskSummary.missing_official_reference_count > 0 || !hasBenchmarkReference || !hasDefaultValueReference) {
        tasks.push({
            label: '벤치마크와 국가/CN 기본값 기준자료를 가져오세요.',
            href: scenarioAction.href === '/upload' ? scenarioAction.href : '/upload',
            tone: 'warning',
        });
    }

    if (scenarioRiskSummary.above_default_count > 0) {
        tasks.push({
            label: `기본값보다 SEE가 높은 품목 ${scenarioRiskSummary.above_default_count}건의 대응 시나리오를 검토하세요.`,
            href: '/scenarios',
            tone: 'warning',
        });
    }

    if (exportErrorCount > 0) {
        tasks.push({
            label: `EU Export를 막는 오류 ${exportErrorCount}건을 해결하세요.`,
            href: '/export',
            tone: 'danger',
        });
    }

    return tasks;
}

export function createDashboardSummary(input: DashboardSummaryInput): DashboardSummary {
    const {
        exportErrorCount,
        exportIssueCount,
        hasBenchmarkReference,
        hasDefaultValueReference,
        precursorCount,
        processCount,
        productCount,
        results,
        scenarioRiskSummary,
    } = input;
    const totalOutput = results.reduce((sum, result) => sum + result.output_mass_t, 0);
    const warningTasks = getWarningTasks(results);
    const scenarioActionTasks = getScenarioActionTasks(input);
    const warningCount = warningTasks.length
        + scenarioRiskSummary.missing_reference_count
        + scenarioRiskSummary.above_default_count
        + exportIssueCount;
    const sourceStreamWarningCount = results.filter(
        (result) => result.source_stream_count > 0 && Math.abs(result.source_stream_delta_tco2e) > 0.01
    ).length;
    const indirectApplicableCount = results.filter((result) => result.indirect_emissions_applicable).length;
    const indirectCompleted = results.some((result) => result.indirect_emissions_applicable && result.indirect_see > 0);
    const indirectNotRequired = results.length > 0 && indirectApplicableCount === 0;
    const hasOfficialReferences = hasBenchmarkReference && hasDefaultValueReference;
    const completedSteps = [
        productCount > 0,
        processCount > 0,
        sourceStreamWarningCount === 0 && results.some((result) => result.source_stream_count > 0),
        indirectCompleted || indirectNotRequired,
        precursorCount > 0,
        hasOfficialReferences,
        scenarioRiskSummary.is_ready_for_review,
        exportErrorCount === 0,
    ].filter(Boolean).length;
    const readinessRate = Math.round((completedSteps / 8) * 100);

    const steps: DashboardStep[] = [
        { name: '품목 식별', status: productCount > 0 ? '완료' : '미완료', tone: productCount > 0 ? 'success' : 'neutral' },
        { name: '생산공정 설정', status: processCount > 0 ? '완료' : '미완료', tone: processCount > 0 ? 'success' : 'neutral' },
        {
            name: '직접배출량 입력',
            status: sourceStreamWarningCount > 0 ? '확인필요' : results.some((result) => result.source_stream_count > 0) ? '완료' : '진행중',
            tone: sourceStreamWarningCount > 0 ? 'warning' : results.some((result) => result.source_stream_count > 0) ? 'success' : 'info',
        },
        {
            name: '간접배출량 입력',
            status: indirectNotRequired ? '해당없음' : indirectCompleted ? '완료' : '미완료',
            tone: indirectNotRequired || indirectCompleted ? 'success' : 'neutral',
        },
        { name: '전구물질 입력', status: precursorCount > 0 ? '완료' : '미완료', tone: precursorCount > 0 ? 'success' : 'neutral' },
        {
            name: '공식 기준자료 연결',
            status: hasOfficialReferences ? '완료' : '확인필요',
            tone: hasOfficialReferences ? 'success' : 'warning',
        },
        {
            name: 'SEFA·인증서 검토',
            status: scenarioRiskSummary.is_ready_for_review ? '검토가능' : '확인필요',
            tone: scenarioRiskSummary.is_ready_for_review ? 'success' : 'warning',
        },
        {
            name: 'EU Export',
            status: exportErrorCount > 0 ? '오류' : exportIssueCount > 0 ? '검토중' : '대기',
            tone: exportErrorCount > 0 ? 'danger' : exportIssueCount > 0 ? 'warning' : 'pending',
        },
    ];

    const priorityTasks = [...scenarioActionTasks, ...warningTasks];
    const recentTasks: DashboardTask[] = priorityTasks.length > 0
        ? priorityTasks.slice(0, 4)
        : [
            { label: 'EU 템플릿 Parameters_CNCodes 기준으로 제품 CN 코드 확인', href: '/products', tone: 'success' },
            { label: '공식 기준자료를 가져와 SEFA·인증서 시나리오를 확인', href: '/scenarios', tone: 'success' },
            { label: indirectNotRequired ? 'CN 코드별 간접배출 제외 여부 확인' : '생산공정별 전력 사용량 입력', href: '/processes', tone: 'success' },
            { label: 'EU 원본 템플릿 복사본 Export 준비', href: '/export', tone: 'success' },
        ];

    return {
        totalOutput,
        warningCount,
        readinessRate,
        steps,
        recentTasks,
    };
}
