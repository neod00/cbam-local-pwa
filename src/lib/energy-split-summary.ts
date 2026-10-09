import { checkElectricitySharedMeters, reconcileSourceStreams } from './allocation-rules';
import { isProvisionalHeatNote, resolveSharedHeatSystems } from './measurable-heat';
import type { ProductionProcess, SourceStream } from './local-db';
import { calculateSourceStreamEmissions } from './source-stream-calculation';

/**
 * 에너지 나누기 현황 — 전력 나누기 · 연료 나누기 · 열 공급원(보일러·스팀)을 한곳에서 본다.
 *
 * 세 기능은 같은 일을 한다: 한 고지서·전표의 에너지를 여러 공정이 나눠 쓸 때 공정별 몫을 정한다. 다만 규정이 다르다 —
 * 전기·일반 연료는 생산량(기능단위) 비율이 기본이고, 열(스팀·온수)은 쓴 열량 비율이다(2025/2547 부속서 III A.2·A.3).
 * 담당자는 규정 차이를 모르므로 「어느 버튼을 눌러야 하나」가 첫 장벽이다. 이 함수는 지금 어떤 나누기가 있는지, 무엇이 어긋났는지,
 * 아직 안 나눈 듯한 곳이 어디인지를 계산만 한다 — 저장하거나 값을 바꾸지 않는다.
 */

export type EnergySplitKind = 'ELECTRICITY' | 'FUEL' | 'HEAT';

export interface EnergySplitItem {
    kind: EnergySplitKind;
    key: string;
    title: string;
    detail: string;
    /** 있으면 확인이 필요하다(합계 불일치·귀속 불가 등). */
    problem?: string;
    /** 열 사용량이 임시 값이다 — 계산은 했지만 근거가 없다. */
    provisional?: boolean;
    /** 고칠 곳으로 바로 가는 링크 — 문제가 가리키는 공정·배출원 행이 있을 때만 있다(없으면 호출부가 지도로 보낸다). */
    href?: string;
}

export interface EnergySplitHint {
    kind: EnergySplitKind;
    text: string;
}

export interface EnergySplitSummary {
    items: EnergySplitItem[];
    hints: EnergySplitHint[];
    /** 확인이 필요한 항목 수(문제 + 임시) */
    attentionCount: number;
}

const fmt = (value: number, digits = 4) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);
const HEAT_NAME = /보일러|스팀|온수|증기|열매|boiler|steam/i;

/** 같은 연료인가: 단위·순발열량·배출계수가 같다(이름은 사용자가 바꿀 수 있어 보지 않는다). */
function isSameFuel(a: SourceStream, b: SourceStream): boolean {
    const near = (x: number, y: number) => Math.abs(x - y) <= Math.max(1e-9, Math.abs(y) * 1e-6);
    return a.stream_type === 'FUEL' && b.stream_type === 'FUEL'
        && (a.activity_unit ?? '').trim().toLowerCase() === (b.activity_unit ?? '').trim().toLowerCase()
        && near(a.ncv_gj_per_unit, b.ncv_gj_per_unit)
        && near(a.emission_factor_tco2e_per_unit, b.emission_factor_tco2e_per_unit);
}

/**
 * 공용 계량기로 나눈 연료와 **같은 연료**가, 그 계량기를 같이 쓰는 공정에 나누지 않은 행으로 또 들어 있는가(run30).
 * 제품 하나를 먼저 넣으며 공장 전체 고지서를 그 공정에 적고, 나중에 제품을 더해 「연료 나누기」를 하면 옛 행이 남아 두 번 계산된다.
 *  · duplicate: 그 행의 양이 계량기의 공장 전체 값과 같다(0.5% 이내) — 나누기 전의 값이 남은 것이 확실하다.
 *  · sameFuel: 양은 다르지만 같은 연료가 따로 있다 — 다른 계량기일 수 있어 알리기만 한다.
 * 지우지 않는다 — 알릴 뿐이다.
 */
function findUnsplitTwin(group: { period_id?: string; stream_ids: string[]; installation_total: number }, streams: SourceStream[]): { duplicate?: SourceStream; sameFuel?: SourceStream } {
    const members = streams.filter((stream) => group.stream_ids.includes(stream.id));
    const processIds = new Set(members.map((stream) => stream.process_id).filter(Boolean));
    const sample = members[0];
    if (!sample) return {};
    const twins = streams.filter((stream) =>
        !stream.shared_meter?.group?.trim() && !stream.heat_system?.name?.trim()
        && stream.process_id && processIds.has(stream.process_id)
        && (stream.period_id ?? '') === (group.period_id ?? '')
        && isSameFuel(stream, sample));
    const duplicate = twins.find((stream) => Math.abs(stream.activity_data - group.installation_total) <= group.installation_total * 0.005);
    return { duplicate, sameFuel: duplicate ? undefined : twins[0] };
}

/**
 * 공용 계량기로 나눈 연료마다, 나누기 전의 공장 전체 값이 한 공정에 그대로 남은 행(= 확실한 이중계상, run30).
 * 양이 계량기의 공장 전체 값과 같은 것만 센다(findUnsplitTwin의 duplicate). 내보내기 준비도가 이것을 오류로 올려 파일 만들기를 막는다.
 */
export function findDuplicateUnsplitFuel(streams: SourceStream[]): Array<{ group: string; stream: SourceStream; unit: string; total: number }> {
    const meterRows = streams.filter((stream) => stream.shared_meter?.group?.trim() && !stream.heat_system?.name?.trim());
    const found: Array<{ group: string; stream: SourceStream; unit: string; total: number }> = [];
    for (const group of reconcileSourceStreams(meterRows).groups) {
        if (group.reason) continue;
        const { duplicate } = findUnsplitTwin(group, streams);
        if (duplicate) found.push({ group: group.group, stream: duplicate, unit: group.unit, total: group.installation_total });
    }
    return found;
}

/**
 * 한 계량기(= 한 공급)인데 공정마다 전력 배출계수가 다르고, 그중 계수 출처가 비어 있는 공정이 있는가(run30).
 * 「전력 나누기」는 사용량만 나누므로, 나중에 더한 공정에는 임시 자리값(0.47)이 출처 없이 남는다 — 간접배출이 틀리게 보고된다.
 */
function describeMeterFactorGap(members: Array<Pick<ProductionProcess, 'name'> & Partial<Pick<ProductionProcess, 'electricity_ef_tco2e_per_mwh' | 'electricity_ef_source'>>>): string | undefined {
    const factors = new Set(members.map((process) => process.electricity_ef_tco2e_per_mwh).filter((value): value is number => typeof value === 'number'));
    const unsourced = members.filter((process) => !process.electricity_ef_source?.trim());
    if (factors.size <= 1 || unsourced.length === 0) return undefined;
    return `같은 계량기인데 공정마다 전력 배출계수가 다릅니다(${[...factors].join(' / ')}). ${unsourced.map((process) => `「${process.name}」`).join(', ')}은(는) 계수 출처가 비어 있어 임시 자리값일 수 있습니다 — 5단계에서 같은 계수와 출처를 넣으세요.`;
}

export function summarizeEnergySplits(input: {
    /** 지금 보고 있는 보고기간의 공정 */
    processes: Array<Pick<ProductionProcess, 'id' | 'name' | 'period_id' | 'electricity_mwh' | 'electricity_shared_meter' | 'heat_consumption'> & Partial<Pick<ProductionProcess, 'electricity_ef_tco2e_per_mwh' | 'electricity_ef_source'>>>;
    sourceStreams: SourceStream[];
}): EnergySplitSummary {
    const items: EnergySplitItem[] = [];
    const hints: EnergySplitHint[] = [];

    const electricityGroups = checkElectricitySharedMeters(input.processes);
    for (const group of electricityGroups) {
        const members = input.processes.filter((process) => group.process_ids.includes(process.id));
        const fixTarget = members.find((process) => !process.electricity_ef_source?.trim()) ?? members[0];
        items.push({
            kind: 'ELECTRICITY',
            key: `E|${group.period_id ?? ''}|${group.group}`,
            title: `전력 「${group.group}」`,
            detail: `${fmt(group.installation_total_mwh)} MWh · 공정 ${group.process_ids.length}개`,
            problem: group.reason || describeMeterFactorGap(members),
            href: fixTarget ? `/processes?edit=${encodeURIComponent(fixTarget.id)}` : undefined,
        });
    }

    const meterRows = input.sourceStreams.filter((stream) => stream.shared_meter?.group?.trim() && !stream.heat_system?.name?.trim());
    for (const group of reconcileSourceStreams(meterRows).groups) {
        const leftover = findUnsplitTwin(group, input.sourceStreams);
        items.push({
            kind: 'FUEL',
            key: `F|${group.period_id ?? ''}|${group.group}`,
            title: `연료 「${group.group}」`,
            detail: `${fmt(group.installation_total)} ${group.unit} · 행 ${group.stream_ids.length}개`,
            problem: group.reason || (leftover.duplicate
                ? `「${leftover.duplicate.name}」(${fmt(leftover.duplicate.activity_data)} ${leftover.duplicate.activity_unit})가 나누기 전의 공장 전체 값으로 한 공정에 그대로 남아 있습니다 — 같은 연료가 두 번 계산되고 있습니다. 4단계에서 그 행을 지우세요(나눈 행은 그대로 두세요).`
                : undefined),
            href: leftover.duplicate ? `/source-streams?edit=${encodeURIComponent(leftover.duplicate.id)}` : group.stream_ids[0] ? `/source-streams?edit=${encodeURIComponent(group.stream_ids[0])}` : undefined,
        });
        if (!leftover.duplicate && leftover.sameFuel) {
            hints.push({
                kind: 'FUEL',
                text: `「${group.group}」로 나눈 연료와 같은 종류의 연료 「${leftover.sameFuel.name}」(${fmt(leftover.sameFuel.activity_data)} ${leftover.sameFuel.activity_unit})가 한 공정에 따로 들어 있습니다. 다른 계량기·전표의 것이 맞는지 확인하세요 — 같은 고지서라면 두 번 계산됩니다.`,
            });
        }
    }

    const heatSystems = resolveSharedHeatSystems({ processes: input.processes, sourceStreams: input.sourceStreams, emissionsOf: calculateSourceStreamEmissions });
    for (const system of heatSystems) {
        items.push({
            kind: 'HEAT',
            key: `H|${system.key}`,
            title: `열 「${system.name}」`,
            detail: `연료 배출 ${fmt(system.fuelEmissionsTco2e)} tCO₂e · 공정 ${system.consumers.length}개`,
            problem: system.problem,
            provisional: system.consumers.some((consumer) => isProvisionalHeatNote(consumer.note)),
        });
    }

    // ── 아직 안 나눈 듯한 곳 — 추측이므로 알림일 뿐이다 ──
    if (input.processes.length >= 2) {
        const electricityUsers = input.processes.filter((process) => process.electricity_mwh > 0);
        if (electricityUsers.length >= 2 && electricityUsers.some((process) => !process.electricity_shared_meter?.group?.trim())) {
            hints.push({
                kind: 'ELECTRICITY',
                text: '전력을 공정별로 직접 적어 두셨습니다. 한 고지서(한전 계량기)를 나눈 값이라면 5단계의 「전력 나누기」로 넣으세요 — 합계가 고지서와 맞는지 계속 검사하고 보고서 근거 문장을 만들어 줍니다.',
            });
        }
        const heatLooking = input.sourceStreams.filter((stream) => stream.stream_type === 'FUEL' && !stream.heat_system?.name?.trim() && HEAT_NAME.test(stream.name));
        if (heatLooking.length > 0 && heatSystems.length === 0) {
            hints.push({
                kind: 'HEAT',
                text: `「${heatLooking[0].name}」처럼 보일러·스팀 연료를 공정에 직접 넣어 두셨습니다. 여러 공정이 같이 쓰는 열이라면 아래 「보일러·스팀」으로 넣으세요 — 규정은 이 연료를 생산량이 아니라 쓴 열량 비율로 귀속하라고 합니다.`,
            });
        }
    }

    return { items, hints, attentionCount: items.filter((item) => item.problem || item.provisional).length };
}
