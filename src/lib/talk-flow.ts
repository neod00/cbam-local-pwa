import { getAppScopeExclusion, APP_SCOPE_EXCLUSION_TEXT, getCbamCoverage } from './cbam-product-rules';
import { productWithCn } from './product-label';
import type { Installation, Product, ProductOutputLine, ProductionProcess, PurchasedPrecursor, ReportingPeriod, SourceStream } from './local-db';

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
    /** 지금 질문이 붙은 제품 */
    focusProductId?: string;
    /** 모든 신고 제품과 제품별 남은 질문(S6 — 제품이 여럿일 때 어디가 비었는지 보이게) */
    products: TalkProductSummary[];
}

/**
 * 이 화면이 질문을 붙이는 공정. 지금 보는 제품(첫 신고 제품)을 만드는 공정을 먼저 고른다 — 같은 기간에 비CBAM 제품의 공정이 앞에 있어도
 * 구매 강재·연료·전력 질문이 엉뚱한 공정에 붙지 않게(대일기업처럼 탄소강 공정이 함께 있는 사업장). 없으면 첫 공정.
 */
export function pickTalkProcess<T extends Pick<ProductionProcess, 'product_id'>>(processes: T[], product: Pick<Product, 'id'> | undefined): T | undefined {
    return (product ? processes.find((process) => process.product_id === product.id) : undefined) ?? processes[0];
}

/**
 * 제품이 둘 이상일 때(S6) 「지금 묻는 제품」의 공정. 첫 제품은 예전 규칙 그대로(자기 공정, 없으면 첫 공정 — 이미 있는 공정이 생산량 질문을 대신한다),
 * 둘째 이후 제품은 **자기 공정만** — 없으면 공정이 없는 것이다(다른 제품의 공정에 질문이 붙으면 안 된다).
 */
export function pickFocusProcess<T extends Pick<ProductionProcess, 'id' | 'product_id'>>(
    processes: T[],
    products: Pick<Product, 'id'>[],
    product: Pick<Product, 'id'> | undefined,
    /** 제품 → 그 제품의 생산 라인이 든 공정 id들. 한 공정에서 제품을 여럿 만들면 공정 자체는 대표 제품 하나만 가리킨다(run35 P1-06). */
    linkedProcessIds?: ReadonlyMap<string, ReadonlySet<string>>,
): T | undefined {
    if (!product) return undefined;
    const own = processes.find((process) => process.product_id === product.id);
    if (own) return own;
    const linked = linkedProcessIds?.get(product.id);
    const viaLine = linked ? processes.find((process) => linked.has(process.id)) : undefined;
    if (viaLine) return viaLine;
    return product.id === products[0]?.id ? processes[0] : undefined;
}

/**
 * 제품별로 「그 제품을 실제로 만드는(생산량이 있는 합격품 라인이 든) 공정」을 모은다.
 * 한 공정에서 제품을 여럿 만들면(같은 원료의 여러 CN, 수출분·내수분) 공정의 product_id는 대표 제품 하나뿐이고 나머지는 생산 라인으로만 이어진다 —
 * 이것을 보지 않으면 이미 생산량을 넣은 제품의 생산량을 다시 묻는다.
 */
export function linkProcessesByOutputLines(lines: Pick<ProductOutputLine, 'process_id' | 'product_id' | 'output_mass_t' | 'activity_level_role'>[] | undefined): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const line of lines ?? []) {
        if (!line.product_id || line.activity_level_role === 'EXCLUDED' || !(line.output_mass_t > 0)) continue;
        const set = map.get(line.product_id) ?? new Set<string>();
        set.add(line.process_id);
        map.set(line.product_id, set);
    }
    return map;
}

/** 「나중에 입력」으로 건너뛴 질문을 제품별로 기억하는 열쇠 — 한 제품의 건너뛰기가 다른 제품의 같은 질문을 가리지 않게 */
export const talkSkipKey = (productId: string | undefined, id: TalkQuestionId) => `${productId ?? ''}:${id}`;

export interface TalkProductSummary {
    id: string;
    name: string;
    cnCode: string;
    /** 이 제품에 아직 답하지 않은 질문 차례대로(사업장·보고기간이 없으면 빈 목록) */
    pending: TalkQuestionId[];
}

/**
 * 지금 물을 제품: 사용자가 고른 제품 → 건너뛰지 않은 남은 질문이 있는 첫 제품 → 첫 제품.
 * 제품을 새로 만들면 그 제품에 생산량 질문이 남으므로 따로 고르게 하지 않아도 새 제품으로 넘어간다.
 */
export function pickFocusProductId(products: TalkProductSummary[], skipped: string[], preferredId?: string): string | undefined {
    if (preferredId && products.some((product) => product.id === preferredId)) return preferredId;
    const needing = products.find((product) => product.pending.some((id) => !skipped.includes(talkSkipKey(product.id, id))));
    return (needing ?? products[0])?.id;
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
    /** 모든 생산 라인 — 한 공정에서 만드는 둘째 이후 제품이 자기 공정을 찾는 데 쓴다(없으면 공정의 대표 제품만 본다) */
    productOutputLines?: ProductOutputLine[];
    /** 지금 물을 제품(없거나 모르면 첫 제품). 질문 5~8은 이 제품의 공정에 붙는다 */
    focusProductId?: string;
}): TalkState {
    const [installation] = input.installations;
    const [period] = input.periods;
    const product = (input.focusProductId ? input.products.find((item) => item.id === input.focusProductId) : undefined) ?? input.products[0];
    const isFirstProduct = !product || product.id === input.products[0]?.id;
    const chips: TalkChip[] = [];

    if (installation) {
        chips.push({ id: 'company', title: '회사·공장', answer: `${installation.local_name || installation.name} · ${installation.country}` });
    }
    if (period) {
        chips.push({ id: 'period', title: '보고기간', answer: `${period.name} (${period.start_date} ~ ${period.end_date})` });
    }
    if (product) {
        chips.push({ id: 'product', title: '만드는 제품', answer: productWithCn(product.name, product.cn_code, '—') });
    }

    // 지금 보는 기간(첫 기간)의 공정. 공정이 하나라도 있으면 「생산량」 질문에는 이미 답한 것으로 본다 —
    // 이 화면은 새 공정 하나만 만들고, 이미 있는 공정(여러 개·이송·고치기)은 지도 화면의 몫이다.
    const periodProcesses = (input.processes ?? []).filter((process) => period && process.period_id === period.id);
    const linked = linkProcessesByOutputLines(input.productOutputLines);
    const firstProcess = pickFocusProcess(periodProcesses, input.products, product, linked);
    if (!isFirstProduct) {
        // 둘째 이후 제품: 자기 공정이 있을 때만 칩이 선다(첫 제품의 생산량을 이 제품의 답으로 보이지 않는다).
        if (firstProcess) {
            chips.push({
                id: 'output',
                title: '생산량',
                answer: `${firstProcess.name} · ${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(firstProcess.output_mass_t)} t`,
            });
        }
    } else if (firstProcess && firstProcess.product_id === product?.id && periodProcesses.length > 1) {
        // 첫 제품도 자기 공정이 있고 공정이 여럿이면 자기 공정만 말한다(전체 합계는 제품 고르기 줄과 결과 요약이 보여 준다).
        chips.push({
            id: 'output',
            title: '생산량',
            answer: `${firstProcess.name} · ${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(firstProcess.output_mass_t)} t`,
        });
    } else if (periodProcesses.length > 0) {
        const total = periodProcesses.reduce((sum, process) => sum + process.output_mass_t, 0);
        chips.push({
            id: 'output',
            title: '생산량',
            answer: periodProcesses.length === 1 ? `${periodProcesses[0].name} · ${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(total)} t` : `공정 ${periodProcesses.length}개 · ${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(total)} t`,
        });
    }

    // 구매 강재: 첫 공정에 전구물질이 있거나 「구매 강재를 쓰지 않음」을 확인했으면 답한 것이다.
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

    // 제품 하나의 남은 질문(공정이 생긴 뒤의 것). 첫 제품은 이미 있는 공정이 생산량 질문을 대신하고, 둘째 이후 제품은 자기 공정이 있어야 한다.
    const pendingOf = (target: Product, first: boolean): TalkQuestionId[] => {
        const process = pickFocusProcess(periodProcesses, input.products, target, linked);
        if (first ? periodProcesses.length === 0 : !process) return ['output'];
        if (!process) return [];
        const list: TalkQuestionId[] = [];
        if (!(input.precursors ?? []).some((precursor) => precursor.process_id === process.id) && !process.no_purchased_precursors) list.push('precursor');
        if (!(input.sourceStreams ?? []).some((stream) => stream.process_id === process.id)) list.push('fuel');
        if (!(process.electricity_mwh > 0)) list.push('electricity');
        if (!process.measurable_heat_import) list.push('heat');
        return list;
    };
    const pending: TalkQuestionId[] = [];
    if (!installation) {
        pending.push('company');
    } else if (!period) {
        pending.push('period');
    } else if (!product) {
        pending.push('product');
    } else {
        pending.push(...pendingOf(product, isFirstProduct));
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
        focusProductId: product?.id,
        products: input.products.map((item) => ({
            id: item.id,
            name: item.name,
            cnCode: item.cn_code ?? '',
            pending: installation && period ? pendingOf(item, item.id === input.products[0]?.id) : [],
        })),
    };
}

/**
 * 둘째 제품의 CN이 이미 입력한 제품과 같으면 알린다 — 같은 CN은 한 사업장·기간에 생산공정 하나로 묶는 것이 규정이다(2025/2547 제4조 6항, 지도 7단계 검사와 같은 근거).
 * 크기·모양만 다른 같은 CN 제품은 공정을 새로 만들지 말고 지도 3단계에서 제품 라인으로 더한다. 막지 않는다 — 알릴 뿐이다.
 */
export function describeDuplicateCn(cnDigits: string, others: Array<{ name: string; cnCode: string }>): string | undefined {
    if (cnDigits.length !== 8) return undefined;
    const same = others.find((other) => other.cnCode.replace(/\D/g, '') === cnDigits);
    if (!same) return undefined;
    return `「${same.name}」과 CN 코드가 같습니다. 같은 CN은 한 보고기간에 공정 하나로 묶는 것이 규정(2025/2547 제4조 6항)입니다 — 크기·모양만 다른 같은 제품이면 여기서 새로 만들지 말고 지도 화면 3단계에서 제품 라인으로 더하세요.`;
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
        : '연료·전기는 아직 넣지 않았습니다 — 위 질문에 답하거나(여러 공정이 같이 쓰는 고지서는 아래 나누기 도구로) 넣으면 기본값과의 비교를 보여 드립니다. 지금 값은 일부일 뿐입니다.';
}

/**
 * 제품이 둘 이상일 때의 「일부일 뿐」 안내. 한 제품이라도 생산량·구매 강재·연료/전력이 비었으면 막대가 말하는 숫자는 일부만 반영한 중간 값이다.
 * 공정이 하나도 없으면(CN만 있는 시작 막대) 말하지 않는다 — 그때는 막대 자체가 기본값 기둥 하나다.
 */
export function describeTalkPartial(input: {
    products: Pick<Product, 'id' | 'name'>[];
    /** 지금 보는 기간의 공정 */
    processes: ProductionProcess[];
    precursors: PurchasedPrecursor[];
    sourceStreams: SourceStream[];
    /** 생산 라인 — 한 공정에서 만드는 제품을 「생산량 없음」으로 세지 않게 한다 */
    productOutputLines?: ProductOutputLine[];
}): string | undefined {
    if (input.processes.length === 0) return undefined;
    const missingOutput: string[] = [];
    let precursorsPending = false;
    let energyMissing = false;
    for (const product of input.products) {
        const process = pickFocusProcess(input.processes, input.products, product, linkProcessesByOutputLines(input.productOutputLines));
        if (!process) {
            missingOutput.push(product.name);
            continue;
        }
        if (!input.precursors.some((precursor) => precursor.process_id === process.id) && !process.no_purchased_precursors) precursorsPending = true;
        const hasEnergy = input.sourceStreams.some((stream) => stream.process_id === process.id) || process.electricity_mwh > 0 || process.direct_attributable_emissions_tco2e > 0;
        if (!hasEnergy) energyMissing = true;
    }
    if (missingOutput.length > 0) {
        return `${missingOutput.map((name) => `「${name}」`).join(', ')}의 생산량을 아직 넣지 않았습니다 — 지금 값은 일부 제품만 반영한 중간 값입니다.`;
    }
    return describeTalkBarPartial({ hasFuelOrElectricity: !energyMissing, precursorsPending });
}
