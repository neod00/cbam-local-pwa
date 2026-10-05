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

export function summarizeEnergySplits(input: {
    /** 지금 보고 있는 보고기간의 공정 */
    processes: Array<Pick<ProductionProcess, 'id' | 'name' | 'period_id' | 'electricity_mwh' | 'electricity_shared_meter' | 'heat_consumption'>>;
    sourceStreams: SourceStream[];
}): EnergySplitSummary {
    const items: EnergySplitItem[] = [];
    const hints: EnergySplitHint[] = [];

    const electricityGroups = checkElectricitySharedMeters(input.processes);
    for (const group of electricityGroups) {
        items.push({
            kind: 'ELECTRICITY',
            key: `E|${group.period_id ?? ''}|${group.group}`,
            title: `전력 「${group.group}」`,
            detail: `${fmt(group.installation_total_mwh)} MWh · 공정 ${group.process_ids.length}개`,
            problem: group.reason || undefined,
        });
    }

    const meterRows = input.sourceStreams.filter((stream) => stream.shared_meter?.group?.trim() && !stream.heat_system?.name?.trim());
    for (const group of reconcileSourceStreams(meterRows).groups) {
        items.push({
            kind: 'FUEL',
            key: `F|${group.period_id ?? ''}|${group.group}`,
            title: `연료 「${group.group}」`,
            detail: `${fmt(group.installation_total)} ${group.unit} · 행 ${group.stream_ids.length}개`,
            problem: group.reason || undefined,
        });
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
