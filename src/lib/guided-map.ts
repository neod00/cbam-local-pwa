import type { LocalCalculationResult } from './calculation-engine';
import type { SeeFlowBinding } from './see-flow';

// 지도형 작업 공간(GuidedWorkspace)의 8단계 상태 모델.
// 지도(GuidedMap)와 단계 패널이 같은 상태 정의를 공유한다.
export type GuidedStepId =
    | 'setup'
    | 'products'
    | 'process'
    | 'fuel'
    | 'electricity'
    | 'precursors'
    | 'results'
    | 'export';

export type GuidedStepStatus = 'done' | 'current' | 'todo' | 'optional' | 'locked';

export interface GuidedStepState {
    id: GuidedStepId;
    order: number;
    title: string;
    status: GuidedStepStatus;
    summary: string;
}

export interface GuidedMapInput {
    loaded: boolean;
    installationCount: number;
    periodCount: number;
    reportingProductCount: number;
    cnReadyCount: number;
    processCount: number;
    hasProcessOutput: boolean;
    sourceStreamCount: number;
    hasDirectEmissions: boolean;
    hasElectricity: boolean;
    precursorCount: number;
    /**
     * 구매 전구물질이 있어야 할 것으로 보이는데(철강 가공품) 아직 없고, 사람이 「없음」을 확인하지도 않았다.
     * true면 6단계는 선택이 아니라 할 일이다 — 전구물질 없이 「6 / 6 완료 · 생성할 수 있습니다」가 뜨던 것을 막는다(run11 P1-12).
     */
    precursorsExpected?: boolean;
    /** 사람이 「구매한 CBAM 강재 없음」을 확인했다(전구물질 0건일 때만 의미가 있다). */
    noPrecursorsConfirmed?: boolean;
    results: LocalCalculationResult[];
    exportErrorCount: number;
    exportWarningCount: number;
}

const fmt = (value: number, digits = 1) =>
    new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);

// 입력 현황 → 8단계 상태. current는 "잠기지 않은 첫 미완료 필수 단계" 하나만 부여한다.
export function deriveGuidedSteps(input: GuidedMapInput, binding: SeeFlowBinding): GuidedStepState[] {
    const setupDone = input.installationCount > 0 && input.periodCount > 0;
    const productsDone = input.reportingProductCount > 0 && input.cnReadyCount === input.reportingProductCount;
    const processDone = input.processCount > 0 && input.hasProcessOutput;
    const fuelDone = input.sourceStreamCount > 0 || input.hasDirectEmissions;
    const electricityDone = input.hasElectricity;
    const precursorsDone = input.precursorCount > 0;
    const reportable = input.results.filter((result) => result.is_cbam_reportable && result.see_cbam_basis !== null);
    const calculationReady = reportable.length > 0 && (fuelDone || electricityDone);
    const resultsUnlocked = processDone && (fuelDone || electricityDone);
    const precursorsPending = !precursorsDone && Boolean(input.precursorsExpected);
    // 전구물질이 있어야 하는데 없으면 결과는 아직 「끝난 것」이 아니다 — 6단계가 할 일인데 7단계에 ✓가 붙던 것(run12 P2-07).
    const resultsDone = calculationReady && input.exportErrorCount === 0 && !precursorsPending;
    const exportUnlocked = resultsDone;
    const exportReady = resultsDone && input.exportWarningCount === 0;

    const statusOf = (done: boolean, locked = false): GuidedStepStatus => (done ? 'done' : locked ? 'locked' : 'todo');

    const steps: GuidedStepState[] = [
        {
            id: 'setup',
            order: 1,
            title: '사업장·보고기간',
            status: statusOf(setupDone),
            summary: setupDone
                ? '완료'
                : input.installationCount > 0
                    ? '보고기간을 등록하세요'
                    : '회사·공장 정보부터',
        },
        {
            id: 'products',
            order: 2,
            title: '제품·CN 코드',
            status: statusOf(productsDone),
            summary: input.reportingProductCount === 0
                ? '수출 제품을 등록하세요'
                : productsDone
                    ? `제품 ${input.reportingProductCount}개 · CN 확인`
                    : `CN 확인 ${input.cnReadyCount}/${input.reportingProductCount}`,
        },
        {
            id: 'process',
            order: 3,
            title: '생산공정',
            status: statusOf(processDone),
            summary: processDone
                ? `공정 ${input.processCount}개 · ${fmt(binding.outputMassT)} t`
                : '공정과 생산량을 연결',
        },
        {
            id: 'fuel',
            order: 4,
            title: '① 연료 연소',
            status: statusOf(fuelDone),
            summary: fuelDone ? `${fmt(binding.directEmissions)} tCO₂e` : '고지서에서 옮겨 적기',
        },
        {
            id: 'electricity',
            order: 5,
            title: '② 전력',
            status: statusOf(electricityDone),
            summary: electricityDone ? `${fmt(binding.ownIndirectEmissions)} tCO₂e` : '전기요금 고지서 기준',
        },
        {
            id: 'precursors',
            order: 6,
            title: '③ 전구물질',
            status: precursorsDone ? 'done' : input.precursorsExpected ? 'todo' : 'optional',
            summary: precursorsDone
                ? `직접 ${fmt(binding.precursorDirectEmissions)} · 간접 ${fmt(binding.precursorIndirectEmissions)}`
                : input.precursorsExpected
                    ? '구매 강재 등록 — SEE의 대부분'
                    : input.noPrecursorsConfirmed ? '구매 강재 없음 (확인함)' : '구매한 CBAM 강재가 있으면',
        },
        {
            id: 'results',
            order: 7,
            title: '검증 · 결과 SEE',
            status: resultsDone ? 'done' : resultsUnlocked ? 'todo' : 'locked',
            summary: !resultsUnlocked
                ? '잠김 — ①② 입력 후 열림'
                : resultsDone
                    ? binding.seeCbamBasis === null
                        ? '신고 대상 확인 필요'
                        : `기준 ${fmt(binding.seeCbamBasis, 3)} tCO₂e/t`
                    : input.exportErrorCount > 0
                        ? `해결할 오류 ${input.exportErrorCount}건`
                        : '결과를 확인하세요',
        },
        {
            id: 'export',
            order: 8,
            title: 'EU 문서 생성',
            status: !exportUnlocked ? 'locked' : exportReady ? 'todo' : 'todo',
            summary: !exportUnlocked
                ? '잠김 — 검증 통과 후 열림'
                : exportReady
                    ? '파일을 만들 수 있습니다'
                    : `확인 항목 ${input.exportWarningCount}건 검토`,
        },
    ];

    if (input.loaded) {
        const current = steps.find((step) => step.status === 'todo');
        if (current) {
            current.status = 'current';
        }
    }

    return steps;
}

export function getGuidedProgress(steps: GuidedStepState[]) {
    // 분모는 늘 6이다(전구물질·문서 생성 제외). 전구물질이 기대되는데 없으면 7단계가 끝나지 않으므로
    // 「6 / 6 완료」가 뜨지 않는다 — 분모를 6↔7로 바꾸지 않고 같은 효과를 낸다(run12 P2-07).
    const required = steps.filter((step) => step.id !== 'precursors' && step.id !== 'export');
    const done = required.filter((step) => step.status === 'done').length;
    return { done, total: required.length };
}
