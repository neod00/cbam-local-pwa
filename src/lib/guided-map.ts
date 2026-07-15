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
    const resultsDone = calculationReady && input.exportErrorCount === 0;
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
            status: precursorsDone ? 'done' : 'optional',
            summary: precursorsDone
                ? `직접 ${fmt(binding.precursorDirectEmissions)} · 간접 ${fmt(binding.precursorIndirectEmissions)}`
                : '구매한 CBAM 강재가 있으면',
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
                    ? '생성할 수 있습니다'
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
    const required = steps.filter((step) => step.id !== 'precursors' && step.id !== 'export');
    const done = required.filter((step) => step.status === 'done').length;
    return { done, total: required.length };
}
