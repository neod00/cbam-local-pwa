import type { DefaultSubstitutionImpact } from './default-substitution';
import type { InternalTransfer, Installation, Product, ProductionProcess, PurchasedPrecursor, ReportingPeriod, SourceStream } from './local-db';
import { isUnverifiedActualPrecursor, PRECURSOR_ACTUAL_VALUE_RULE } from './precursor-verification';
import { groupPrecursorsBySupplier } from './supplier-request';
import { deriveTalkState, pickFocusProcess, type TalkQuestionId } from './talk-flow';

/**
 * 할 일 화면 — 지금 앱이 알고 있는 「남은 일」을 **누가 할 일인지**로 모은다(UX 목업 4번).
 *   우리 회사가 답할 것 · 공급사에게 받을 것 · 규정상 확인 필요
 *
 * 이 파일은 읽고 가르기만 한다. 새로 판단하는 규칙도, 산술도 없다 —
 *   · 안 한 질문은 질문 화면의 차례 규칙(`deriveTalkState`)에서,
 *   · 막거나 알릴 항목은 EU 문서 준비도 검사(`evaluateEuExportReadiness`)와 엔진의 「확인 필요(규정)」 경고에서,
 *   · 공급사에게 받을 것은 요청서와 같은 묶음 규칙(`groupPrecursorsBySupplier`)에서,
 *   · 「잠정」 실측값은 엔진과 같은 판정(`isUnverifiedActualPrecursor`)에서 가져온다.
 * 숫자(영향 상자)는 호출부가 `computeDefaultSubstitutionImpact`(엔진 재계산)로 넘긴다.
 * 어조 원칙(목업): 막는 것이 없으면 「막는 것은 없습니다 — 지금도 파일을 만들 수 있습니다」. 오류만 「막는다」고 말한다.
 */

export type TodoOwner = 'company' | 'supplier' | 'regulation';

export interface TodoItem {
    id: string;
    owner: TodoOwner;
    /** error = EU 문서를 만들기 전에 해결해야 함, notice = 정리하면 서류가 탄탄해지는 것 */
    severity: 'error' | 'notice';
    /** 「화면별로 보기」의 묶음 이름 */
    area: string;
    title: string;
    detail: string;
    href?: string;
    hrefLabel?: string;
    /** 이 자리에서 바로 답할 수 있는 것 */
    action?: { kind: 'heat-none'; processId: string; processName: string };
    supplier?: { name: string; country: string; items: Array<{ name: string; cnCode: string; massT: number }> };
    /** 「기본값으로 바꾸면」 영향(기준 SEE 전·후) */
    impact?: DefaultSubstitutionImpact;
    /** 근거(규정 조항·문장) */
    evidence?: string;
}

export interface TodoReadinessIssue {
    severity: 'error' | 'warning';
    area: string;
    message: string;
    href?: string;
    /** 이 항목이 가리키는 전구물질(있을 때) */
    precursorId?: string;
}

export interface TodoEngineWarning {
    message: string;
    targetType: 'process' | 'precursor';
    targetId: string;
    href?: string;
}

export interface TodoInput {
    installations: Installation[];
    periods: ReportingPeriod[];
    /** 신고 대상 제품(reporting scope)만 */
    products: Product[];
    processes: ProductionProcess[];
    precursors: PurchasedPrecursor[];
    sourceStreams: SourceStream[];
    internalTransfers?: InternalTransfer[];
    readinessIssues: TodoReadinessIssue[];
    engineWarnings: TodoEngineWarning[];
    /** 구매 강재 하나를 EU 기본값으로 바꿨을 때의 영향(엔진 재계산) */
    impactOf?: (precursorId: string) => DefaultSubstitutionImpact | undefined;
}

export interface TodoResult {
    items: TodoItem[];
    counts: { company: number; supplier: number; regulation: number; total: number; errors: number };
    /** 계산할 자료(공정)가 있는가 — 없으면 화면은 「작업실에서 시작」을 안내한다 */
    hasData: boolean;
}

/** 준비도 검사의 이 문장들은 질문(안 한 질문)과 같은 일이라 질문 쪽만 남긴다. 게이트가 원문에 이 조각이 있는지 대조한다. */
export const TODO_DUPLICATE_OF_QUESTION_FRAGMENTS = ['답하지 않았습니다', '구매 전구물질이 없습니다'] as const;
/** 전구물질의 간접 SEE를 전력사용량·계수로 나눠 받아야 한다는 경고(공급사에게 받을 것) */
export const TODO_SUPPLIER_SPLIT_FRAGMENT = '전력사용량(MWh/t)';
const REGULATION_MARK = '확인 필요(규정)';

const QUESTION_AREA: Record<TalkQuestionId, string> = {
    company: '사업장',
    period: '보고기간',
    product: '제품',
    output: '생산공정',
    precursor: '구매 전구물질',
    fuel: '배출원 자료',
    electricity: '생산공정',
    heat: '생산공정',
};

/** 문장 하나를 「제목 + 나머지」로 자른다(첫 문장이 제목). */
export function splitTodoMessage(message: string): { title: string; detail: string } {
    // 문장 끝은 한글이나 닫는 괄호·따옴표 뒤의 마침표다 — 「Co., Ltd. 」 같은 영문 약어의 마침표에서 자르지 않는다.
    const match = message.match(/^([\s\S]{6,}?[가-힣)」\]])\.\s+([\s\S]+)$/);
    if (!match) return { title: message.replace(/\.$/, ''), detail: '' };
    return { title: match[1], detail: match[2] };
}

function questionItem(id: TalkQuestionId, productName: string | undefined, process: ProductionProcess | undefined): Pick<TodoItem, 'title' | 'detail' | 'action'> {
    const name = productName ? `「${productName}」` : '이 제품';
    switch (id) {
        case 'company':
            return { title: '사업장(회사·공장) 정보를 입력하세요', detail: '회사 이름과 국가가 EU 문서에 그대로 나갑니다.' };
        case 'period':
            return { title: '보고기간을 입력하세요', detail: '어느 해의 자료인지 정해야 합니다(보통 1년).' };
        case 'product':
            return { title: '만드는 제품을 입력하세요', detail: '제품과 CN 코드를 넣으면 EU 기본값과의 비교가 시작됩니다.' };
        case 'output':
            return { title: `${name}의 생산량을 알려 주세요`, detail: '시장에 내보낸 양(t)입니다. 앱이 추정하지 않습니다.' };
        case 'precursor':
            return { title: `${name}을 만들려고 구매한 강재가 있나요?`, detail: '철강 가공품은 SEE의 대부분이 구매한 강재에서 나옵니다. 공급사 값을 모르면 EU 기본값으로 먼저 채울 수 있습니다.' };
        case 'fuel':
            return { title: `${name} 공정에서 태운 연료가 있나요?`, detail: '고지서의 12개월 사용량을 넣으면 앱이 배출량을 계산합니다. 안 쓰면 쓰지 않는다고 답하세요.' };
        case 'electricity':
            return { title: `${name} 공정의 전력 사용량을 알려 주세요`, detail: '12개월 사용량(MWh)입니다. 고지서를 여러 공정이 같이 쓰면 나누기 도구를 쓰세요.' };
        case 'heat':
            return {
                title: '공장 밖에서 스팀·온수를 사다 쓰나요?',
                detail: `${process ? `${process.name}. ` : ''}답하면 연료 항목에 반영됩니다. 쓰면 그 배출을 직접배출에 더해야 합니다.`,
                action: process ? { kind: 'heat-none', processId: process.id, processName: process.name } : undefined,
            };
    }
}

/** 엔진이 제3자 검증이 없는 실측 전구물질마다 내는 경고(문장 조각은 precursor-verification.ts의 원문과 같다). */
const PROVISIONAL_FRAGMENT = '제3자 검증보고서가 없습니다';

export function buildTodoItems(input: TodoInput): TodoResult {
    const items: TodoItem[] = [];
    const seen = new Set<string>();
    const add = (item: TodoItem) => {
        if (seen.has(item.id)) return;
        seen.add(item.id);
        items.push(item);
    };
    const precursorById = new Map(input.precursors.map((precursor) => [precursor.id, precursor]));
    const unverified = input.precursors.filter((precursor) => isUnverifiedActualPrecursor(precursor));
    // 「잠정 실측값」은 아래 4)가 영향 상자와 함께 한 장으로 보인다 — 준비도 검사·엔진 경고에서 같은 것이 또 오지 않게 한다.
    const isProvisionalMessage = (message: string) => message.includes(PROVISIONAL_FRAGMENT) && unverified.some((precursor) => message.includes(precursor.name));
    const period = input.periods[0];
    const periodProcesses = input.processes.filter((process) => period && process.period_id === period.id);
    const periodNameOf = (id: string | undefined) => input.periods.find((item) => item.id === id)?.name ?? '';

    // ── 1) 안 한 질문 → 우리 회사가 답할 것 ─────────────────────────────
    const overview = deriveTalkState({ installations: input.installations, periods: input.periods, products: input.products, processes: input.processes, precursors: input.precursors, sourceStreams: input.sourceStreams });
    if (!input.installations[0] || !period || input.products.length === 0) {
        const first = overview.pending[0];
        if (first) {
            add({ id: `q:${first}`, owner: 'company', severity: 'notice', area: QUESTION_AREA[first], ...questionItem(first, undefined, undefined), href: '/talk', hrefLabel: '질문으로 답하기' });
        }
    } else {
        for (const entry of overview.products) {
            const product = input.products.find((item) => item.id === entry.id);
            const process = pickFocusProcess(periodProcesses, input.products, product);
            for (const id of entry.pending) {
                add({
                    id: `q:${entry.id}:${id}`,
                    owner: 'company',
                    severity: 'notice',
                    area: QUESTION_AREA[id],
                    ...questionItem(id, entry.name, process),
                    href: id === 'heat' ? '/' : '/talk',
                    hrefLabel: id === 'heat' ? '쓴다면 지도 4단계에서 입력' : '질문으로 답하기',
                });
            }
        }
    }

    // ── 2) 준비도 검사(EU 문서 점검) → 누가 할 일인지로 가른다 ────────────────
    // 공정이 하나도 없으면(막 시작한 프로젝트) EU 문서 점검은 아직 말할 때가 아니다 — 안 한 질문만 보인다.
    const started = periodProcesses.length > 0;
    const regulationMessages = new Set<string>();
    (started ? input.readinessIssues : []).forEach((issue, index) => {
        if (TODO_DUPLICATE_OF_QUESTION_FRAGMENTS.some((fragment) => issue.message.includes(fragment))) return;
        if (isProvisionalMessage(issue.message)) return;
        const { title, detail } = splitTodoMessage(issue.message.replace(`${REGULATION_MARK}: `, ''));
        const severity: TodoItem['severity'] = issue.severity === 'error' ? 'error' : 'notice';
        const base = { id: `r:${index}`, severity, area: issue.area, title, detail, href: issue.href, hrefLabel: issue.href ? '고치러 가기' : undefined };
        if (issue.message.includes(REGULATION_MARK)) {
            regulationMessages.add(issue.message);
            add({ ...base, owner: 'regulation' });
        } else if (issue.area === '구매 전구물질' && issue.message.includes(TODO_SUPPLIER_SPLIT_FRAGMENT)) {
            const precursor = issue.precursorId ? precursorById.get(issue.precursorId) : undefined;
            add({
                ...base,
                owner: 'supplier',
                supplier: precursor ? { name: precursor.supplier_installation.trim(), country: precursor.supplier_country.trim(), items: [{ name: precursor.name, cnCode: (precursor.precursor_cn_code ?? '').replace(/\D/g, ''), massT: precursor.purchased_mass_t }] } : undefined,
                hrefLabel: '지도 6단계에서 확인',
                href: base.href ?? '/',
            });
        } else {
            add({ ...base, owner: 'company' });
        }
    });

    // ── 3) 엔진의 「확인 필요(규정)」 경고 → 규정상 확인 필요 ─────────────────
    (started ? input.engineWarnings : []).forEach((warning, index) => {
        if (!warning.message.includes(REGULATION_MARK) || regulationMessages.has(warning.message)) return;
        if (isProvisionalMessage(warning.message)) return;
        regulationMessages.add(warning.message);
        const { title, detail } = splitTodoMessage(warning.message.replace(`${REGULATION_MARK}: `, ''));
        add({ id: `w:${index}`, owner: 'regulation', severity: 'notice', area: warning.targetType === 'precursor' ? '구매 전구물질' : '생산공정', title, detail, href: warning.href, hrefLabel: warning.href ? '고치러 가기' : undefined });
    });

    // ── 4) 제3자 검증이 없는 실측 전구물질 → 규정상 확인 필요(영향 상자) ─────────
    for (const precursor of unverified) {
        const status = precursor.verification_status === 'SUPPLIER_CONFIRMED' ? '공급사가 확인한 값이지만 제3자 검증보고서가 없습니다.' : '검증이 되지 않은 값입니다.';
        add({
            id: `p:${precursor.id}`,
            owner: 'regulation',
            severity: 'notice',
            area: '구매 전구물질',
            title: `「${precursor.name}」의 실측값은 아직 「잠정」입니다`,
            detail: `${status} 검증보고서가 없으면 EU 기본값을 써야 합니다.`,
            href: '/',
            hrefLabel: '지도 6단계에서 확인',
            impact: input.impactOf?.(precursor.id),
            evidence: `${PRECURSOR_ACTUAL_VALUE_RULE.anchor} — 제3국 전구물질의 실측값은 그 생산기간을 다룬 공인 검증기관의 검증보고서가 있을 때만 쓸 수 있습니다.`,
        });
    }

    // ── 5) EU 기본값을 쓰는(실측이 아닌) 구매 강재 → 공급사에게 받을 것 ──────────
    const requestable = input.precursors.filter((precursor) => precursor.data_mode !== 'ACTUAL');
    for (const group of groupPrecursorsBySupplier(requestable, periodNameOf)) {
        add({
            id: `s:${group.key}`,
            owner: 'supplier',
            severity: 'notice',
            area: '구매 전구물질',
            title: `실측값 받기 — 원료 ${group.items.length}개`,
            detail: `EU 기본값(또는 일부만 실측)을 쓰는 원료가 ${group.items.length}개입니다. 실측값을 받으면 값이 실측으로 바뀌고 기본값 할증이 빠집니다.`,
            supplier: { name: group.supplierName, country: group.country, items: group.items.map((item) => ({ name: item.name, cnCode: item.cnCode, massT: item.purchasedMassT })) },
            href: '/',
            hrefLabel: '지도 6단계에서 요청서 만들기',
        });
    }

    const rank = (item: TodoItem) => (item.severity === 'error' ? 0 : 1);
    items.sort((a, b) => rank(a) - rank(b));
    const count = (owner: TodoOwner) => items.filter((item) => item.owner === owner).length;
    return {
        items,
        counts: { company: count('company'), supplier: count('supplier'), regulation: count('regulation'), total: items.length, errors: items.filter((item) => item.severity === 'error').length },
        hasData: periodProcesses.length > 0,
    };
}
