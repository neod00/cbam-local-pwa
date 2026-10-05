import { getAppScopeExclusion, APP_SCOPE_EXCLUSION_TEXT, getCbamCoverage } from './cbam-product-rules';
import type { Installation, Product, ProductionProcess, PurchasedPrecursor, ReportingPeriod, SourceStream } from './local-db';

/**
 * 질문으로 입력(대화형 모드 S1) — 어느 질문이 지금 차례인지와 답을 칩으로 보여 주는 순수 규칙.
 *
 * 원칙(docs/harness/conversation-mode-design.md): 자체 저장 코드가 없다. 이 파일은 읽고 판단만 하고, 쓰기는 guided-edit.ts의 빌더를 거친다.
 * 값의 원본은 지도 화면과 같은 IndexedDB 하나라서, 질문으로 넣은 값을 지도 화면에서 고치고 돌아와도 칩이 따라간다 — 상태를 따로 두지 않는다.
 */

export type TalkQuestionId = 'company' | 'period' | 'product' | 'output' | 'precursor' | 'fuel' | 'electricity' | 'heat';

export interface TalkChip {
    id: TalkQuestionId;
    /** 질문 이름 */
    title: string;
    /** 담당자가 한 답 */
    answer: string;
}

export interface TalkState {
    /** 지금 물을 질문(= pending의 첫째). 모든 질문에 답했으면 undefined */
    current?: TalkQuestionId;
    /**
     * 아직 답하지 않은 질문을 차례대로. 공정이 생기기 전에는 앞 질문 하나만(사업장이 없으면 제품을 저장할 곳이 없다),
     * 공정이 생긴 뒤에는 구매 강재·연료·전력·열 중 남은 것 전부 — 화면이 「나중에 입력」으로 건너뛴 질문을 빼고 다음을 고를 수 있게.
     */
    pending: TalkQuestionId[];
    chips: TalkChip[];
    /** 첫 번째 말고 더 있는 것들 — 질문 화면은 첫 번째만 다루므로 나머지는 지도 화면으로 안내한다 */
    more: { installations: number; periods: number; products: number; processes: number };
    /** 첫 공정에 연결된 구매 전구물질 수 */
    precursorCount: number;
}

export function deriveTalkState(input: {
    installations: Installation[];
    periods: ReportingPeriod[];
    /** 신고 대상 제품(reporting scope)만 */
    products: Product[];
    /** 모든 기간의 공정 — 이 파일이 지금 보는 기간(첫 기간)의 것만 골라 쓴다 */
    processes?: ProductionProcess[];
    /** 모든 전구물질 — 첫 공정의 것만 센다 */
    precursors?: PurchasedPrecursor[];
    /** 모든 배출원 — 첫 공정의 것만 센다 */
    sourceStreams?: SourceStream[];
}): TalkState {
    const [installation] = input.installations;
    const [period] = input.periods;
    const [product] = input.products;
    const chips: TalkChip[] = [];

    if (installation) {
        chips.push({ id: 'company', title: '회사·공장', answer: `${installation.local_name || installation.name} · ${installation.country}` });
    }
    if (period) {
        chips.push({ id: 'period', title: '보고기간', answer: `${period.name} (${period.start_date} ~ ${period.end_date})` });
    }
    if (product) {
        chips.push({ id: 'product', title: '만드는 제품', answer: `${product.name} · CN ${product.cn_code ?? '—'}` });
    }

    // 지금 보는 기간(첫 기간)의 공정. 공정이 하나라도 있으면 「생산량」 질문에는 이미 답한 것으로 본다 —
    // 이 화면은 새 공정 하나만 만들고, 이미 있는 공정(여러 개·이송·고치기)은 지도 화면의 몫이다.
    const periodProcesses = (input.processes ?? []).filter((process) => period && process.period_id === period.id);
    if (periodProcesses.length > 0) {
        const total = periodProcesses.reduce((sum, process) => sum + process.output_mass_t, 0);
        chips.push({
            id: 'output',
            title: '생산량',
            answer: periodProcesses.length === 1 ? `${periodProcesses[0].name} · ${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(total)} t` : `공정 ${periodProcesses.length}개 · ${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(total)} t`,
        });
    }

    // 구매 강재: 첫 공정에 전구물질이 있거나 「구매 강재를 쓰지 않음」을 확인했으면 답한 것이다.
    const firstProcess = periodProcesses[0];
    const processPrecursors = firstProcess ? (input.precursors ?? []).filter((precursor) => precursor.process_id === firstProcess.id) : [];
    const noPrecursorsConfirmed = Boolean(firstProcess?.no_purchased_precursors);
    if (processPrecursors.length > 0) {
        chips.push({ id: 'precursor', title: '구매 강재', answer: `${processPrecursors.length}건 · ${processPrecursors.map((precursor) => precursor.name).join(', ')}` });
    } else if (noPrecursorsConfirmed) {
        chips.push({ id: 'precursor', title: '구매 강재', answer: '없음 (확인함)' });
    }

    // 연료: 첫 공정에 배출원이 있으면 답한 것이다(연료를 안 쓰는 공정은 저장할 값이 없어 「나중에」로 건너뛴다 — 지도도 같다).
    const processStreams = firstProcess ? (input.sourceStreams ?? []).filter((stream) => stream.process_id === firstProcess.id) : [];
    if (processStreams.length > 0) {
        chips.push({ id: 'fuel', title: '연료', answer: `${processStreams.length}건 · ${processStreams.map((stream) => stream.name).join(', ')}` });
    }
    // 전력: 사용량이 있으면 답한 것이다.
    const electricityAnswered = Boolean(firstProcess && firstProcess.electricity_mwh > 0);
    if (firstProcess && electricityAnswered) {
        chips.push({ id: 'electricity', title: '전력', answer: `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(firstProcess.electricity_mwh)} MWh × ${firstProcess.electricity_ef_tco2e_per_mwh}` });
    }
    // 밖에서 산 스팀·온수: 답(NO/YES)이 있으면 답한 것이다. 「예」는 지도 4단계의 열 폼에서 입력한다.
    const heatAnswer = firstProcess?.measurable_heat_import;
    if (heatAnswer) {
        chips.push({ id: 'heat', title: '산 스팀·온수', answer: heatAnswer === 'NO' ? '없음' : '있음 (지도 4단계에서 입력)' });
    }

    const pending: TalkQuestionId[] = [];
    if (!installation) {
        pending.push('company');
    } else if (!period) {
        pending.push('period');
    } else if (!product) {
        pending.push('product');
    } else if (periodProcesses.length === 0) {
        pending.push('output');
    } else {
        if (processPrecursors.length === 0 && !noPrecursorsConfirmed) pending.push('precursor');
        if (processStreams.length === 0) pending.push('fuel');
        if (!electricityAnswered) pending.push('electricity');
        if (!heatAnswer) pending.push('heat');
    }
    const current: TalkQuestionId | undefined = pending[0];

    return {
        current,
        pending,
        chips,
        more: {
            installations: Math.max(0, input.installations.length - 1),
            periods: Math.max(0, input.periods.length - 1),
            products: Math.max(0, input.products.length - 1),
            processes: Math.max(0, periodProcesses.length - 1),
        },
        precursorCount: processPrecursors.length,
    };
}

/** 연간 보고기간 한 칸 — 지도 1단계의 「2025년 연간」 버튼과 같은 값 */
export function yearlyPeriodDraft(year: number) {
    return { name: `${year}년 연간`, startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

export type CnHintLevel = 'ok' | 'warn' | 'blocked' | 'idle';

export interface CnHint {
    level: CnHintLevel;
    text: string;
}

/**
 * 담당자가 입력한 CN 8자리에 대한 한 줄 안내. 막지 않는다(저장 검증은 validateProductDraft) — 알릴 뿐이다.
 *  · 고른 제품군의 후보 코드(앞 4자리)와 다르면 알린다 — 수출 신고필증의 코드가 정답이므로 앱이 바꾸지 않는다.
 *  · 대상이 아니거나 앱 범위 밖(철강 외·고로 일관제철)이면 그 사실을 말한다.
 */
export function describeCnInput(cnDigits: string, candidateCodes: string[]): CnHint {
    if (cnDigits.length === 0) {
        return { level: 'idle', text: '수출 신고필증이나 인보이스의 HS 코드 8자리를 적으세요.' };
    }
    if (cnDigits.length < 8) {
        return { level: 'idle', text: `${cnDigits.length}자리 입력됨 — 8자리가 필요합니다.` };
    }
    if (cnDigits.length > 8) {
        return { level: 'warn', text: 'CN 코드는 8자리입니다.' };
    }

    const product = { cn_code: cnDigits, hs_code: cnDigits.slice(0, 4) };
    const exclusion = getAppScopeExclusion(product);
    if (exclusion) {
        return { level: 'blocked', text: APP_SCOPE_EXCLUSION_TEXT[exclusion] };
    }
    const coverage = getCbamCoverage(product);
    if (coverage.status === 'NOT_COVERED') {
        return { level: 'blocked', text: coverage.reason };
    }
    const candidates = candidateCodes.map((code) => code.replace(/\D/g, '')).filter(Boolean);
    if (candidates.length > 0 && !candidates.some((code) => cnDigits.startsWith(code))) {
        return {
            level: 'warn',
            text: `고른 제품군의 후보 코드(${candidates.join(', ')})와 앞자리가 다릅니다. 수출 신고필증의 코드가 맞다면 그대로 쓰세요 — 앱이 코드를 바꾸지 않습니다.`,
        };
    }
    if (coverage.status === 'CHECK_NEEDED') {
        return { level: 'warn', text: `${coverage.reason || 'CBAM 대상 여부를 확인하세요.'}` };
    }
    return { level: 'ok', text: 'CBAM 대상 품목으로 보입니다.' };
}

/**
 * 막대 아래에 붙일 「아직 일부일 뿐」 안내. 값이 일부만 들어온 상태에서 「기본값보다 N% 낮다」를 그리면 거짓이다(run19 결함 02와 같은 원리).
 *  · 구매 강재가 필요한데 아직 없으면 — 가공업체는 SEE의 대부분이 여기서 나온다.
 *  · 질문으로 연료·전력을 아직 묻지 않는 동안(S3)에는 연료·전력 입력이 없으면.
 */
export function describeTalkBarPartial(input: { hasFuelOrElectricity: boolean; precursorsPending: boolean }): string | undefined {
    if (input.precursorsPending) {
        return '구매한 강재(전구물질)를 아직 넣지 않았습니다. 철강 가공품은 SEE의 대부분이 여기서 나오므로 지금 값은 일부일 뿐입니다 — 위 질문에 답하거나 「없음」을 확인하세요.';
    }
    return input.hasFuelOrElectricity
        ? undefined
        : '연료·전기는 아직 넣지 않았습니다 — 지도 화면 4·5단계에서 넣으면 기본값과의 비교를 보여 드립니다. 지금 값은 일부일 뿐입니다.';
}
