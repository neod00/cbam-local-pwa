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
            label: '공식 기준자료를 가져오세요. 인증서 비용 시나리오 검토에 필요한 파일입니다.',
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

    if (scenarioRiskSummary.default_lower_certificate_count > 0) {
        tasks.push({
            label: `기본값 시나리오가 비용 지표상 유리한 품목 ${scenarioRiskSummary.default_lower_certificate_count}건을 검토하세요.`,
            href: '/scenarios',
            tone: 'warning',
        });
    }

    if (scenarioRiskSummary.actual_lower_certificate_count > 0) {
        tasks.push({
            label: `실측자료 시나리오가 비용 지표상 유리한 품목 ${scenarioRiskSummary.actual_lower_certificate_count}건의 증빙을 확인하세요.`,
            href: '/scenarios',
            tone: 'success',
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

function getBeginnerActionTasks(input: DashboardSummaryInput): DashboardTask[] {
    const tasks: DashboardTask[] = [];
    const { precursorCount, processCount, productCount, results } = input;
    const hasSourceStreamEvidence = results.some((result) => result.source_stream_count > 0);

    if (productCount === 0) {
        tasks.push({
            label: '품목을 먼저 추가하세요. EU에 수출하는 제품명과 CN 8자리 코드부터 입력합니다.',
            href: '/products',
            tone: 'warning',
        });
    }

    if (processCount === 0) {
        tasks.push({
            label: '생산공정을 등록하세요. 제품 생산량과 공정 경계를 연결해야 배출량을 계산할 수 있습니다.',
            href: '/processes',
            tone: productCount === 0 ? 'neutral' : 'warning',
        });
    }

    if (processCount > 0 && !hasSourceStreamEvidence) {
        tasks.push({
            label: '배출원 자료를 입력하세요. 연료, 전력, 생산량 근거를 생산공정에 연결합니다.',
            href: '/source-streams',
            tone: 'warning',
        });
    }

    if (processCount > 0 && precursorCount === 0) {
        tasks.push({
            label: '전구물질이 있다면 구매 전구물질 자료를 연결하세요. 해당 없으면 산정 결과에서 제외 상태를 확인합니다.',
            href: '/precursors',
            tone: 'neutral',
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
        + scenarioRiskSummary.default_lower_certificate_count
        + exportIssueCount;
    const sourceStreamIssueProcessIds = new Set(
        results
            .filter((result) =>
                (result.direct_emissions_tco2e > 0 && result.source_stream_count === 0)
                || (result.source_stream_count > 0 && Math.abs(result.source_stream_delta_tco2e) > 0.01)
            )
            .map((result) => result.process_id)
    );
    const sourceStreamIssueCount = sourceStreamIssueProcessIds.size;
    // 3상태로 센다. boolean으로 세면 「판정 불가」가 「해당 없음」이 되어 준비도를 올린다 —
    // 판정하지 못한 제품이 「완료」로 표시되는 것은 사용자를 속이는 것이다(씨밤이 P1).
    const indirectIncludedCount = results.filter((result) => result.indirect_emissions_relevance === 'INCLUDED').length;
    const indirectUndetermined = results.some((result) => result.indirect_emissions_relevance === 'UNDETERMINED');
    const indirectCompleted = results.some(
        (result) => result.indirect_emissions_relevance === 'INCLUDED' && result.indirect_see > 0
    );
    const indirectNotRequired = results.length > 0 && indirectIncludedCount === 0 && !indirectUndetermined;
    const hasOfficialReferences = hasBenchmarkReference && hasDefaultValueReference;
    const completedSteps = [
        productCount > 0,
        processCount > 0,
        sourceStreamIssueCount === 0 && results.some((result) => result.source_stream_count > 0),
        indirectCompleted || indirectNotRequired,
        precursorCount > 0,
        hasOfficialReferences,
        scenarioRiskSummary.is_ready_for_review,
        exportErrorCount === 0,
    ].filter(Boolean).length;
    const readinessRate = Math.round((completedSteps / 8) * 100);

    const steps: DashboardStep[] = [
        { name: '품목 등록', status: productCount > 0 ? '완료' : '입력 필요', tone: productCount > 0 ? 'success' : 'neutral' },
        { name: '생산공정 설정', status: processCount > 0 ? '완료' : '입력 필요', tone: processCount > 0 ? 'success' : 'neutral' },
        {
            name: '배출원 자료',
            status: sourceStreamIssueCount > 0 ? '확인 필요' : results.some((result) => result.source_stream_count > 0) ? '완료' : '진행중',
            tone: sourceStreamIssueCount > 0 ? 'warning' : results.some((result) => result.source_stream_count > 0) ? 'success' : 'info',
        },
        {
            name: '간접배출량',
            status: indirectUndetermined ? '판정 불가' : indirectNotRequired ? '해당 없음' : indirectCompleted ? '완료' : '입력 필요',
            tone: indirectUndetermined ? 'danger' : indirectNotRequired || indirectCompleted ? 'success' : 'neutral',
        },
        { name: '전구물질', status: precursorCount > 0 ? '완료' : '입력 필요', tone: precursorCount > 0 ? 'success' : 'neutral' },
        {
            name: '공식 기준자료',
            status: hasOfficialReferences ? '완료' : '확인 필요',
            tone: hasOfficialReferences ? 'success' : 'warning',
        },
        {
            name: '인증서 비용',
            status: scenarioRiskSummary.is_ready_for_review ? '검토 가능' : '확인 필요',
            tone: scenarioRiskSummary.is_ready_for_review ? 'success' : 'warning',
        },
        {
            name: 'EU Export',
            status: exportErrorCount > 0 ? '오류' : exportIssueCount > 0 ? '검토중' : '대기',
            tone: exportErrorCount > 0 ? 'danger' : exportIssueCount > 0 ? 'warning' : 'pending',
        },
    ];

    const beginnerActionTasks = getBeginnerActionTasks(input);
    const priorityTasks = [...beginnerActionTasks, ...scenarioActionTasks, ...warningTasks];
    const recentTasks: DashboardTask[] = priorityTasks.length > 0
        ? priorityTasks.slice(0, 4)
        : [
            { label: 'EU 템플릿 Parameters_CNCodes 기준으로 제품 CN 코드를 확인하세요.', href: '/products', tone: 'success' },
            { label: '공식 기준자료를 가져와 인증서 비용 시나리오를 확인하세요.', href: '/scenarios', tone: 'success' },
            { label: indirectNotRequired ? 'CN 코드별 간접배출 제외 여부를 확인하세요.' : '생산공정별 전력 사용량을 입력하세요.', href: '/processes', tone: 'success' },
            { label: 'EU 원본 템플릿 복사본 Export를 준비하세요.', href: '/export', tone: 'success' },
        ];

    return {
        totalOutput,
        warningCount,
        readinessRate,
        steps,
        recentTasks,
    };
}
