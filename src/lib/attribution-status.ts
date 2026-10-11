import type { AttributionCheckId, LocalCalculationResult, LocalCalculationWarning } from './calculation-engine';
import { summarizeEnergySplits } from './energy-split-summary';
import type { Installation, ProductionProcess, ProductOutputLine, SourceStream } from './local-db';

/**
 * 귀속·할당 점검 — 「공장 전체 배출·에너지가 공정과 상품까지 빠짐없이, 겹치지 않게 연결됐는가」를 한 표로 모은다.
 *
 * 새 점검이 아니다. 엔진·에너지 나누기 현황이 이미 내는 점검(경고마다 붙은 `check` 종류, 나누기 현황의 문제 항목)을 모으고,
 * **통과한 것도 보이게** 한다 — 지금까지는 문제가 있을 때만 경고가 떠서 「무엇이 확인됐는지」를 알 수 없었다.
 * 규정 판단·산술은 하지 않는다. 상태는 세 가지다(+ 해당 없음):
 *   ok = 규정 충족 · review = 확인 필요 · fix = 수정 필요 · na = 이 프로젝트에는 해당하지 않음.
 */

export type AttributionStatus = 'ok' | 'review' | 'fix' | 'na';

export interface AttributionRow {
    id: string;
    /** 제안서의 점검 번호(V01…) — 보고에서 서로 가리키기 위한 이름표 */
    code: string;
    title: string;
    status: AttributionStatus;
    /** 사람에게 보일 한 줄(무엇을 확인했고 무엇이 걸렸는가) */
    detail: string;
    /** 걸린 항목들(최대 3줄) */
    items: string[];
    /** 고치러 갈 곳 */
    href?: string;
}

/** 경고 문장 머리말 약속(엔진): 「차단:」·「확인 필요(자료):」는 값이 빠지거나 어긋난 것 → 수정 필요, 그 밖(규정·권고)은 확인 필요. */
export function attributionSeverityOf(message: string, check?: AttributionCheckId): Exclude<AttributionStatus, 'ok' | 'na'> {
    // 배분 합계가 100%가 아니거나 귀속이 지워진 것은 배출 누락·이중계상이다 — 문장 머리말과 상관없이 수정 필요.
    if (check === 'ALLOCATION_SUM' || check === 'PRECURSOR_COMPLETENESS') return 'fix';
    return message.startsWith('차단:') || message.startsWith('확인 필요(자료):') ? 'fix' : 'review';
}

const stripPrefix = (message: string) => message.replace(/^(차단|확인 필요\((?:자료|규정)\)|권고):\s*/, '');
const clip = (text: string, length = 110) => (text.length > length ? `${text.slice(0, length)}…` : text);
const worst = (statuses: Array<Exclude<AttributionStatus, 'na'>>): Exclude<AttributionStatus, 'na'> => (statuses.includes('fix') ? 'fix' : statuses.includes('review') ? 'review' : 'ok');

interface CheckSpec {
    id: AttributionCheckId;
    code: string;
    title: string;
    okText: string;
    /** 이 점검이 이 프로젝트에 해당하는가 */
    applicable: (ctx: Ctx) => boolean;
}

interface Ctx {
    processes: ProductionProcess[];
    lines: ProductOutputLine[];
    precursorCount: number;
    sharedEnergyItems: number;
    heatItems: number;
}

const SPECS: CheckSpec[] = [
    { id: 'SHARED_METER', code: 'V01', title: '사업장 전체 사용량 = 공정별 합계 (전력·연료 공용 계량기)', okText: '공용 계량기로 나눈 값의 합계가 사업장 계량값과 맞습니다.', applicable: (ctx) => ctx.sharedEnergyItems > 0 },
    { id: 'HEAT', code: 'V05', title: '공용 열(보일러·스팀)이 쓴 열량 기준으로 귀속됨', okText: '열 공급원의 배출이 누락·중복 없이 쓴 공정에 귀속됐습니다.', applicable: (ctx) => ctx.heatItems > 0 },
    { id: 'DUP_FUNCTIONAL_UNIT', code: 'V02·V03', title: '같은 재화(CN)가 여러 생산공정으로 나뉘지 않음 (복수 생산경로 포함)', okText: '같은 CN 재화가 공정 하나로 산정되고 있습니다.', applicable: (ctx) => ctx.processes.length >= 2 },
    { id: 'MULTIFUNCTIONAL', code: 'V04', title: '크기·형상만 다른 철강제품이 같은 원료면 한 다기능 공정', okText: '같은 종류의 원료를 쓰는 철강 공정이 따로 갈라져 있지 않습니다.', applicable: (ctx) => ctx.processes.length >= 2 },
    { id: 'ACTIVITY_LEVEL', code: 'V07', title: '불량·부산물·스크랩이 활동수준(SEE 분모)에서 제외됨', okText: '활동수준에 들어간 라인 중 확인이 필요한 것이 없습니다.', applicable: (ctx) => ctx.lines.length > 0 },
    { id: 'ALLOCATION_SUM', code: 'V08', title: '배분 합계 = 100% (사용자 지정 배분·구매 강재의 제품별 귀속)', okText: '배분 합계가 100%(소비량)와 맞습니다.', applicable: (ctx) => ctx.processes.length > 0 },
    { id: 'MANUAL_ALLOCATION', code: '예외', title: '사용자 지정 배분은 규정 예외 — 사유·증빙이 있음', okText: '사용자 지정 배분이 없거나, 사유·증빙이 적혀 있습니다.', applicable: (ctx) => ctx.lines.some((line) => line.allocation_basis === 'MANUAL') },
    { id: 'PRECURSOR_COMPLETENESS', code: 'V06', title: '구매 강재의 제품별 귀속이 배출에서 빠지지 않음', okText: '구매 강재의 귀속이 지워진 생산라인·활동수준 제외 라인을 가리키지 않습니다.', applicable: (ctx) => ctx.precursorCount > 0 },
];

export interface AttributionStatusResult {
    rows: AttributionRow[];
    counts: { ok: number; review: number; fix: number; na: number };
    /** 해당 없는 점검의 이름(화면이 한 줄로 접어 보인다) */
    notApplicable: string[];
}

export function buildAttributionStatus(input: {
    /** 지금 보는 보고기간의 공정·라인·배출원·결과 */
    processes: ProductionProcess[];
    productOutputLines: ProductOutputLine[];
    sourceStreams: SourceStream[];
    precursorCount: number;
    results: LocalCalculationResult[];
    installation?: Pick<Installation, 'waste_gases'>;
    /** 경고 → 고칠 화면 링크(엔진의 getLocalCalculationWarningHref) */
    hrefOf: (warning: LocalCalculationWarning) => string;
}): AttributionStatusResult {
    const energy = summarizeEnergySplits({ processes: input.processes, sourceStreams: input.sourceStreams });
    const ctx: Ctx = {
        processes: input.processes,
        lines: input.productOutputLines.filter((line) => input.processes.some((process) => process.id === line.process_id)),
        precursorCount: input.precursorCount,
        sharedEnergyItems: energy.items.filter((item) => item.kind !== 'HEAT').length,
        heatItems: energy.items.filter((item) => item.kind === 'HEAT').length,
    };

    // 엔진 경고를 점검 종류별로 모은다(같은 문장·대상은 한 번만).
    const byCheck = new Map<AttributionCheckId, LocalCalculationWarning[]>();
    const seen = new Set<string>();
    for (const result of input.results) {
        for (const warning of result.warningDetails) {
            if (!warning.check) continue;
            const key = `${warning.check}|${warning.target.id}|${warning.message}`;
            if (seen.has(key)) continue;
            seen.add(key);
            byCheck.set(warning.check, [...(byCheck.get(warning.check) ?? []), warning]);
        }
    }

    const rows: AttributionRow[] = [];
    const notApplicable: string[] = [];

    for (const spec of SPECS) {
        let warnings = byCheck.get(spec.id) ?? [];
        // 같은 열 공급원의 「열 사용량이 임시 값」은 공정마다 한 건씩 오지만 한 가지 일이다 — 열 공급원당 한 건으로 센다(run35 P2-02).
        const provisionalSystems = new Set<string>();
        if (spec.id === 'HEAT') {
            const heatMessage = /「(.+?)」 열 사용량이 임시 값입니다/;
            const merged: typeof warnings = [];
            const bySystem = new Map<string, { first: (typeof warnings)[number]; count: number }>();
            for (const warning of warnings) {
                const system = warning.message.match(heatMessage)?.[1];
                if (!system) { merged.push(warning); continue; }
                const entry = bySystem.get(system);
                if (entry) { entry.count += 1; continue; }
                const created = { first: warning, count: 1 };
                bySystem.set(system, created);
                merged.push(warning);
            }
            for (const [system, entry] of bySystem) {
                provisionalSystems.add(system);
                if (entry.count > 1) merged[merged.indexOf(entry.first)] = { ...entry.first, message: `열 공급원 「${system}」의 열 사용량이 임시 값입니다 — 공정 ${entry.count}개에 공정별 열 사용 자료 없이 생산량 비율로 채웠습니다 (2025/2547 ANNEX III A.3 · A.2.2)` };
            }
            warnings = merged;
        }
        // 에너지 나누기 현황이 이미 가진 문제 항목(합계 불일치·귀속 불가·임시값)도 같은 점검으로 센다.
        // 같은 열 공급원의 임시값은 위 경고가 이미 말하므로 중복해서 세지 않는다.
        const energyItems = spec.id === 'SHARED_METER'
            ? energy.items.filter((item) => item.kind !== 'HEAT' && item.problem)
            : spec.id === 'HEAT'
                ? energy.items.filter((item) => item.kind === 'HEAT' && (item.problem || (item.provisional && !provisionalSystems.has(item.title.match(/「(.+?)」/)?.[1] ?? ''))))
                : [];
        if (!spec.applicable(ctx) && warnings.length === 0 && energyItems.length === 0) {
            notApplicable.push(`${spec.code} ${spec.title.split(' (')[0]}`);
            continue;
        }
        const statuses: Array<Exclude<AttributionStatus, 'na'>> = [
            ...warnings.map((warning) => attributionSeverityOf(warning.message, warning.check)),
            ...energyItems.map((item) => (item.problem ? 'fix' as const : 'review' as const)),
        ];
        const status = worst(statuses);
        const items = [
            ...energyItems.map((item) => clip(`${item.title}: ${item.problem ?? '열 사용량이 임시 값입니다'}`)),
            ...warnings.map((warning) => clip(stripPrefix(warning.message))),
        ].slice(0, 3);
        rows.push({
            id: spec.id,
            code: spec.code,
            title: spec.title,
            status,
            detail: status === 'ok' ? spec.okText : `${statuses.length}건 — ${status === 'fix' ? '값이 빠지거나 어긋났습니다. 고쳐야 합니다.' : '규정상 확인이 필요합니다.'}`,
            items,
            href: warnings[0] ? input.hrefOf(warnings[0]) : energyItems.length > 0 ? energyItems.find((item) => item.problem && item.href)?.href ?? '/' : undefined,
        });
    }

    // 폐가스: 공정 간 이전 보정을 계산하지 않는다 — 조용히 0으로 두지 않고 말한다(내보내기 점검과 같은 조건).
    if (input.installation?.waste_gases === 'YES' && input.processes.length >= 2) {
        rows.push({
            id: 'WASTE_GAS',
            code: 'V05',
            title: '폐가스 공정 간 이전 보정',
            status: 'review',
            detail: '이 사업장은 폐가스가 있고 공정이 둘 이상입니다. 현재 버전은 이 보정을 계산하지 않습니다 — 검증인과 따로 확인하세요.',
            items: [],
            href: '/installations',
        });
    }

    const counts = { ok: 0, review: 0, fix: 0, na: notApplicable.length };
    for (const row of rows) {
        if (row.status !== 'na') counts[row.status] += 1;
    }
    return { rows, counts, notApplicable };
}
