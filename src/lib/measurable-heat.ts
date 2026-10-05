import type { HeatConsumption, HeatQuantityBasis, ProductionProcess, SourceStream } from './local-db';

/**
 * 사업장 밖에서 산 측정가능열(스팀·온수) — 2025/2547 부속서 III A.2.2 「Measurable heat produced outside
 * the installation」, A.3 식 52·55의 EmH,imp.
 *
 * 산업단지에서 스팀을 받아 산세·세척·가열에 쓰는 공장은 사업장 안에 연료가 없으니 배출원에 넣을 것이 없다.
 * 종전에는 이 배출을 넣을 곳도, 묻는 곳도 없어 직접배출이 **적게** 나왔다. 규정은 그 열이 CBAM 재화
 * 공정에서 나왔든 아니든 넣으라고 한다.
 *
 * 열 배출계수는 두 가지만 규정에 있다.
 *  (1) 열을 만든 사업장이 이 규정대로 모니터링하고 검증받은 자료 → 공급사가 준 계수(tCO₂/TJ)
 *  (2) 그렇지 않으면 표준값 — 그 나라 산업부문에서 가장 흔히 쓰는 연료의 표준 배출계수, 보일러 효율 90%
 * 「가장 흔히 쓰는 연료」가 무엇인지는 앱이 정하지 않는다. 사용자가 고르고 근거를 남긴다.
 */

/** A.2.2 (2) — 표준값의 보일러 효율 */
export const HEAT_STANDARD_BOILER_EFFICIENCY = 0.9;

/** 2025/2547 부속서 II G 표 1 (tCO₂/TJ, IPCC 2006 GL). 산업용 열에 쓰일 만한 연료만 옮겼다. */
export const HEAT_STANDARD_FUELS = [
    { key: 'NATURAL_GAS', label: '천연가스(LNG·도시가스)', ef: 56.1 },
    { key: 'RESIDUAL_FUEL_OIL', label: '중유(B-C유)', ef: 77.4 },
    { key: 'GAS_DIESEL_OIL', label: '경유', ef: 74.1 },
    { key: 'LPG', label: 'LPG', ef: 63.1 },
    { key: 'OTHER_BITUMINOUS_COAL', label: '유연탄(기타 역청탄)', ef: 94.6 },
    { key: 'ANTHRACITE', label: '무연탄', ef: 98.3 },
] as const;

export type HeatStandardFuelKey = typeof HEAT_STANDARD_FUELS[number]['key'];

/** 입력 단위 → TJ. 고지서·명세서는 대개 Gcal나 GJ로 온다. */
export const HEAT_UNIT_TO_TJ = {
    Gcal: 0.0041868,
    GJ: 0.001,
    MWh: 0.0036,
    TJ: 1,
} as const;

export type ImportedHeatUnit = keyof typeof HEAT_UNIT_TO_TJ;

/** SUPPLIER = A.2.2 (1) 공급사의 검증된 자료 · STANDARD_FUEL_BOILER = A.2.2 (2) 표준값 */
export type ImportedHeatEfBasis = 'SUPPLIER' | 'STANDARD_FUEL_BOILER';

export const IMPORTED_HEAT_RULE = {
    anchor: '2025/2547 ANNEX III, point A.2.2 · point A.3 (Equations 52, 55)',
    text: 'Where a production process consumes measurable heat produced outside the installation, the heat-related emissions are to be included independently on whether the heat stems from the production process of a good listed in Annex I … (2) Where the method pursuant to point 1 is not available, a standard value is used, based on the standard emission factor of the fuel most commonly used in the industrial sector of the country, assuming a boiler efficiency of 90 %.',
} as const;

export type ImportedHeatFields = Pick<
    ProductionProcess,
    | 'measurable_heat_import'
    | 'imported_heat_amount'
    | 'imported_heat_unit'
    | 'imported_heat_ef_basis'
    | 'imported_heat_supplier_ef_tco2_per_tj'
    | 'imported_heat_standard_fuel'
>;

export interface ImportedHeatResolution {
    /** 「밖에서 산 열을 쓰나요?」에 답했는가 */
    answered: boolean;
    applicable: boolean;
    tj: number;
    /** 적용한 열 배출계수 (tCO₂/TJ) */
    efTco2PerTj: number;
    emissionsTco2e: number;
    /** 산식 한 줄(보고서·화면용) */
    formula?: string;
    /** 「쓴다」고 했는데 값이 모자라면 무엇이 모자란지. 이때 배출은 0으로 두고 알린다. */
    problem?: string;
}

const positive = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

export function getHeatStandardFuel(key: string | undefined) {
    return HEAT_STANDARD_FUELS.find((fuel) => fuel.key === key);
}

/** 화면 입력 한 벌. 빈 문자열 = 아직 고르지 않음. */
export interface ImportedHeatDraft {
    answer: '' | 'YES' | 'NO';
    amount: number;
    unit: ImportedHeatUnit;
    basis: '' | ImportedHeatEfBasis;
    supplierEf: number;
    fuel: string;
    source: string;
}

/** 저장을 막을 문제. 없으면 undefined. */
export function validateImportedHeatDraft(draft: ImportedHeatDraft): string | undefined {
    if (draft.answer === '') return '밖에서 산 스팀·온수를 쓰는지 먼저 고르세요.';
    if (draft.answer === 'NO') return undefined;
    if (!(draft.amount > 0)) return '사서 쓴 열의 양을 0보다 크게 넣으세요.';
    if (draft.basis === '') return '열 배출계수를 어떻게 정할지 고르세요.';
    if (draft.basis === 'SUPPLIER' && !(draft.supplierEf > 0)) return '공급사가 준 열 배출계수(tCO₂/TJ)를 넣으세요.';
    if (draft.basis === 'STANDARD_FUEL_BOILER' && !getHeatStandardFuel(draft.fuel)) return '표준값에 쓸 연료를 고르세요.';
    return undefined;
}

/** 공정 레코드에 입력을 얹는다. 「아니요」면 옛 값을 지워, 숨은 값이 다시 살아나지 않게 한다. */
export function buildImportedHeatUpdate<T extends ProductionProcess>(process: T, draft: ImportedHeatDraft): T {
    if (draft.answer !== 'YES') {
        return {
            ...process,
            measurable_heat_import: draft.answer === 'NO' ? 'NO' : undefined,
            imported_heat_amount: undefined,
            imported_heat_unit: undefined,
            imported_heat_ef_basis: undefined,
            imported_heat_supplier_ef_tco2_per_tj: undefined,
            imported_heat_standard_fuel: undefined,
            imported_heat_source: undefined,
        };
    }
    return {
        ...process,
        measurable_heat_import: 'YES',
        imported_heat_amount: draft.amount,
        imported_heat_unit: draft.unit,
        imported_heat_ef_basis: draft.basis || undefined,
        imported_heat_supplier_ef_tco2_per_tj: draft.basis === 'SUPPLIER' ? draft.supplierEf : undefined,
        imported_heat_standard_fuel: draft.basis === 'STANDARD_FUEL_BOILER' ? draft.fuel : undefined,
        imported_heat_source: draft.source.trim() || undefined,
    };
}

export function resolveImportedHeat(process: ImportedHeatFields): ImportedHeatResolution {
    const answered = process.measurable_heat_import === 'YES' || process.measurable_heat_import === 'NO';
    if (process.measurable_heat_import !== 'YES') {
        return { answered, applicable: false, tj: 0, efTco2PerTj: 0, emissionsTco2e: 0 };
    }

    const unit = process.imported_heat_unit ?? 'Gcal';
    const amount = positive(process.imported_heat_amount);
    const tj = amount * HEAT_UNIT_TO_TJ[unit];
    let efTco2PerTj = 0;
    let efText = '';
    let problem: string | undefined;

    if (process.imported_heat_ef_basis === 'SUPPLIER') {
        efTco2PerTj = positive(process.imported_heat_supplier_ef_tco2_per_tj);
        efText = `${efTco2PerTj} tCO₂/TJ(공급사 검증 자료)`;
        if (efTco2PerTj <= 0) problem = '공급사가 준 열 배출계수(tCO₂/TJ)가 비어 있습니다.';
    } else if (process.imported_heat_ef_basis === 'STANDARD_FUEL_BOILER') {
        const fuel = getHeatStandardFuel(process.imported_heat_standard_fuel);
        if (fuel) {
            efTco2PerTj = fuel.ef / HEAT_STANDARD_BOILER_EFFICIENCY;
            efText = `${fuel.ef} ÷ ${HEAT_STANDARD_BOILER_EFFICIENCY} (${fuel.label}, 보일러 효율 90%)`;
        } else {
            problem = '표준값에 쓸 연료를 고르지 않았습니다.';
        }
    } else {
        problem = '열 배출계수를 어떻게 정할지(공급사 자료 / 표준값) 고르지 않았습니다.';
    }

    if (amount <= 0) {
        problem = '사서 쓴 열의 양이 비어 있습니다.';
    }

    if (problem) {
        return { answered, applicable: true, tj, efTco2PerTj, emissionsTco2e: 0, problem };
    }

    return {
        answered,
        applicable: true,
        tj,
        efTco2PerTj,
        emissionsTco2e: tj * efTco2PerTj,
        formula: `${amount} ${unit} = ${tj.toPrecision(6)} TJ × ${efText}`,
    };
}

// ── 사내 공용 열 — 보일러·스팀 헤더가 둘 이상의 공정에 열을 보낼 때 ─────────────────────────────
//
// 2025/2547 부속서 III A.3, DirEm* 정의: 측정가능열을 만드는 연료가 둘 이상의 생산공정에 쓰이면(또는 공정 밖에서 쓰이면)
// 그 연료 배출은 공정의 직접귀속배출에 넣지 않고 EmH,import로 귀속한다 — 이중계상을 막기 위해서다.
// EmH,imp의 정의는 「사업장 안의 기술 설비(중앙 보일러·여러 열 생산 설비가 있는 증기망)가 둘 이상의 공정에 열을 공급하는
// 경우」를 명시한다. 귀속은 쓴 열량 기준이다(A.2.2 식 44·52). 열 손실은 열을 쓰는 공정에 비례로 얹어 100%를 귀속한다.
//
// 앱은 이렇게 한다: 열 공급원 연료의 배출 E를 모아, 공정별 열 사용량 Qi와 공정 밖 사용량 Qout의 합 Qtot로 나눈 비율로 귀속한다.
//   EmH,imp,i = E × Qi / Qtot ,  공정 밖 몫 = E × Qout / Qtot (CBAM 산정에서 빠진다)
// 손실을 따로 재지 않으면 E 전체가 소비처에 비례로 얹히므로 「손실을 비례 귀속」하는 규정과 같은 결과다.
// EU 문서에는 D_Processes 측정가능열 수입 칸(L+46·L+47)에 Qi(TJ)와 E ÷ Qtot(tCO₂/TJ)를 적는다 — 템플릿이 곱해 같은 값을 낸다.

export const SHARED_HEAT_RULE = {
    id: 'CBAM-ALLOC-HEAT-02',
    anchor: '2025/2547 ANNEX III, point A.3 (DirEm*, EmH,imp) · point A.2.2 (Equations 44, 52) · ANNEX II, point C.1.2 · A.3(2)',
    text: "Measurable heat: Where fuels are consumed for the production of measurable heat which is consumed outside the production process under consideration, or which is used in more than one production process …, the fuels' emissions are not included in the directly attributable emissions of the production process, but added under the parameter EmH,import in order to avoid double counting. — Emissions related to measurable heat imported to the production process include … heat received from a technical unit (e.g. a central power house at the installation, or a more complex steam network with several heat producing units) that supplies heat to more than one production process. — Where losses of measurable heat are determined separately from the amounts used in production processes, emissions related to these heat losses shall be added proportionally to the emissions of all production processes in which measurable heat produced in the installation is used, in order to ensure that 100 % of the quantity of net measurable heat … is attributed to production processes without any omission or double counting.",
} as const;

export const HEAT_QUANTITY_BASIS_LABEL: Record<HeatQuantityBasis, string> = {
    METERED: '열량계 계측 (부속서 II C.1.2.1 방법 1)',
    EFFICIENCY_PROXY: '연료 투입 × 측정 효율 (C.1.2.2 방법 2)',
    INDIRECT_ESTIMATE: '간접결정 — 설계자료·가동시간으로 추정 (A.3(2))',
};

export interface SharedHeatConsumer {
    processId: string;
    processName: string;
    system: string;
    quantity: number;
    unit: HeatConsumption['unit'];
    tj: number;
    /** 0~1 — 전체 열량(공정 밖 포함) 중 이 공정 몫 */
    share: number;
    emissionsTco2e: number;
    basis: HeatQuantityBasis;
    note?: string;
}

export interface SharedHeatSystem {
    key: string;
    name: string;
    periodId?: string;
    streamIds: string[];
    /** 열 공급원 연료의 배출 합계 (tCO₂e) — 연료 배출원 계산값 */
    fuelEmissionsTco2e: number;
    outsideTj: number;
    outsideShare: number;
    /** 공정 밖 몫의 배출 — CBAM 산정에서 빠진다 */
    outsideEmissionsTco2e: number;
    consumersTj: number;
    /** 공정 + 공정 밖 */
    totalTj: number;
    /** 연료 배출 ÷ 전체 열량 (tCO₂/TJ) — 열 손실을 포함한 유효 계수. EU 문서 L+47에 적는다. */
    efTco2PerTj: number;
    consumers: SharedHeatConsumer[];
    /** 있으면 이 공급원은 귀속하지 못한다(소비처 배출 0). */
    problem?: string;
}

/** 열 사용량을 모를 때 임시로 채운 값의 표시. 엔진·EU 문서 준비도가 이 표시를 보고 확인을 요구한다(조용히 넘어가지 않게). */
export const PROVISIONAL_HEAT_NOTE_PREFIX = '[임시]';
export const isProvisionalHeatNote = (note: string | undefined) => (note ?? '').trim().startsWith(PROVISIONAL_HEAT_NOTE_PREFIX);

/** 2025/2547 부속서 II C.1.2.3 방법 3 — 열 생산·전달 효율을 모를 때 쓰는 기준효율 70%(Ref,H = 0,7). */
export const HEAT_REFERENCE_EFFICIENCY = 0.7;

export interface ProvisionalHeatQuantity {
    processId: string;
    quantityTj: number;
    note: string;
}

/**
 * 공정별 열 사용 자료가 없을 때 임시로 채울 값. 전체 열량은 연료 투입 에너지 × 기준효율 70%(부속서 II C.1.2.3 방법 3)로 어림하고,
 * 공정에는 가중치(생산량)에 비례해 나눈다. 열을 쓴 양이 아니라 생산량으로 나눈 것이므로 규정이 정한 귀속이 아니다 —
 * 그래서 근거 문구에 [임시]를 붙이고, 엔진과 EU 문서 준비도가 계속 확인을 요구한다. 숫자는 종전(생산량 비율)과 같다.
 */
export function buildProvisionalHeatQuantities(input: {
    fuelEnergyTj: number;
    rows: Array<{ processId: string; weight: number }>;
}): ProvisionalHeatQuantity[] {
    const weightSum = input.rows.reduce((sum, row) => sum + positive(row.weight), 0);
    const totalTj = positive(input.fuelEnergyTj) * HEAT_REFERENCE_EFFICIENCY;
    if (!(weightSum > 0) || !(totalTj > 0)) return [];
    return input.rows.map((row) => ({
        processId: row.processId,
        quantityTj: Math.round(totalTj * (positive(row.weight) / weightSum) * 1e6) / 1e6,
        note: `${PROVISIONAL_HEAT_NOTE_PREFIX} 공정별 열 사용 자료 없음 — 연료 투입 에너지 × 기준효율 70%(부속서 II C.1.2.3)를 생산량 비율로 나눈 임시 값. 열량계나 설비 자료로 바꾸세요.`,
    }));
}

const heatUnitToTj = (quantity: number | undefined, unit: HeatConsumption['unit'] | undefined) => positive(quantity) * HEAT_UNIT_TO_TJ[unit ?? 'Gcal'];

export function heatSystemKey(periodId: string | undefined, name: string): string {
    return `${periodId ?? ''}|${name.trim()}`;
}

/** 같은 보고기간·같은 이름의 열 공급원 연료 배출원을 모으고, 그 공급원에서 열을 받는 공정에 귀속한다. */
export function resolveSharedHeatSystems(input: {
    processes: Array<Pick<ProductionProcess, 'id' | 'name' | 'period_id' | 'heat_consumption'>>;
    sourceStreams: SourceStream[];
    emissionsOf: (stream: SourceStream) => number;
}): SharedHeatSystem[] {
    const byKey = new Map<string, SourceStream[]>();
    for (const stream of input.sourceStreams) {
        const name = stream.heat_system?.name?.trim();
        if (!name) continue;
        const key = heatSystemKey(stream.period_id, name);
        byKey.set(key, [...(byKey.get(key) ?? []), stream]);
    }

    const systems: SharedHeatSystem[] = [];
    for (const [key, streams] of byKey) {
        const first = streams[0];
        const name = first.heat_system?.name?.trim() ?? '';
        const fuelEmissions = streams.reduce((sum, stream) => sum + input.emissionsOf(stream), 0);

        const outsideValues = new Set(streams.map((stream) => `${positive(stream.heat_system?.outside_quantity)}|${stream.heat_system?.outside_unit ?? ''}`));
        let problem: string | undefined;
        if (outsideValues.size > 1) {
            problem = `열 공급원 「${name}」의 연료 행마다 적힌 공정 밖 사용량이 서로 다릅니다 — 같은 값으로 맞추세요.`;
        }
        const outsideTj = heatUnitToTj(first.heat_system?.outside_quantity, first.heat_system?.outside_unit);

        const consumers: SharedHeatConsumer[] = [];
        for (const process of input.processes) {
            if ((process.period_id ?? '') !== (first.period_id ?? '')) continue;
            for (const entry of process.heat_consumption ?? []) {
                if (entry.system.trim() !== name) continue;
                consumers.push({
                    processId: process.id,
                    processName: process.name,
                    system: name,
                    quantity: entry.quantity,
                    unit: entry.unit,
                    tj: heatUnitToTj(entry.quantity, entry.unit),
                    share: 0,
                    emissionsTco2e: 0,
                    basis: entry.basis,
                    note: entry.note,
                });
            }
        }

        const consumersTj = consumers.reduce((sum, consumer) => sum + consumer.tj, 0);
        const totalTj = consumersTj + outsideTj;
        if (!problem && consumers.length === 0) {
            problem = `열 공급원 「${name}」에서 열을 받는 공정이 없습니다 — 공정별 열 사용량을 넣으세요.`;
        } else if (!problem && consumers.some((consumer) => !(consumer.tj > 0))) {
            const bad = consumers.find((consumer) => !(consumer.tj > 0));
            problem = `「${bad?.processName}」의 「${name}」 열 사용량이 비어 있거나 0입니다.`;
        } else if (!problem && !(totalTj > 0)) {
            problem = `열 공급원 「${name}」의 전체 열 사용량이 0입니다.`;
        }

        if (!problem) {
            for (const consumer of consumers) {
                consumer.share = consumer.tj / totalTj;
                consumer.emissionsTco2e = fuelEmissions * consumer.share;
            }
        }

        systems.push({
            key,
            name,
            periodId: first.period_id,
            streamIds: streams.map((stream) => stream.id),
            fuelEmissionsTco2e: fuelEmissions,
            outsideTj,
            outsideShare: !problem && totalTj > 0 ? outsideTj / totalTj : 0,
            outsideEmissionsTco2e: !problem && totalTj > 0 ? fuelEmissions * (outsideTj / totalTj) : 0,
            consumersTj,
            totalTj,
            efTco2PerTj: totalTj > 0 ? fuelEmissions / totalTj : 0,
            consumers,
            problem,
        });
    }

    return systems.sort((a, b) => a.key.localeCompare(b.key));
}

export interface ProcessSharedHeat {
    /** 이 공정이 받은 열 (TJ) — 문제가 없는 공급원 몫만 */
    tj: number;
    /** EmH,imp 중 사내 공용 열 몫 (tCO₂e) */
    emissionsTco2e: number;
    /** 보고서·화면용 산식 한 줄씩 */
    formulas: string[];
    /** 귀속하지 못한 이유 — 그 몫은 0으로 계산됐다 */
    problems: string[];
    /** 계산은 했지만 확인이 필요한 것 */
    notes: string[];
    systems: SharedHeatConsumer[];
}

const formatHeatNumber = (value: number, digits = 4) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);

/** 한 공정이 받는 사내 공용 열. 공급원이 없거나 귀속하지 못하면 problems에 남기고 그 몫은 0이다. */
export function resolveProcessSharedHeat(
    process: Pick<ProductionProcess, 'id' | 'name' | 'period_id' | 'heat_consumption'>,
    systems: SharedHeatSystem[]
): ProcessSharedHeat {
    const out: ProcessSharedHeat = { tj: 0, emissionsTco2e: 0, formulas: [], problems: [], notes: [], systems: [] };
    const seen = new Set<string>();

    for (const entry of process.heat_consumption ?? []) {
        const name = entry.system.trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const system = systems.find((item) => item.name === name && (item.periodId ?? '') === (process.period_id ?? ''));
        if (!system) {
            out.problems.push(`열 공급원 「${name}」의 연료 배출원이 없습니다(같은 보고기간에 연료를 연결해야 합니다). 그 몫의 배출을 0으로 계산했습니다.`);
            continue;
        }
        if (system.problem) {
            out.problems.push(`${system.problem} 그 몫의 배출을 0으로 계산했습니다.`);
            continue;
        }
        for (const consumer of system.consumers.filter((item) => item.processId === process.id)) {
            out.tj += consumer.tj;
            out.emissionsTco2e += consumer.emissionsTco2e;
            out.systems.push(consumer);
            out.formulas.push(
                `「${name}」: 열 사용 ${formatHeatNumber(consumer.tj, 6)} TJ ÷ 전체 ${formatHeatNumber(system.totalTj, 6)} TJ = ${(consumer.share * 100).toFixed(2)}% × 연료 배출 ${formatHeatNumber(system.fuelEmissionsTco2e)} tCO₂e = ${formatHeatNumber(consumer.emissionsTco2e)} tCO₂e`
            );
            if (isProvisionalHeatNote(consumer.note)) {
                out.notes.push(`「${name}」 열 사용량이 임시 값입니다 — 공정별 열 사용 자료 없이 생산량 비율로 채웠으므로 규정이 정한 열량 기준 귀속이 아닙니다. 열량계 값이나 설비 자료(정격 × 가동시간)로 바꾸세요.`);
            }
            if (consumer.basis === 'INDIRECT_ESTIMATE' && !consumer.note?.trim()) {
                out.notes.push(`「${name}」 열 사용량을 추정(간접결정)으로 정했는데 근거가 비어 있습니다 — 직접 계량이 불가능하거나 비용이 과다한 사유와 추정 근거를 남겨야 합니다(ANNEX II A.3(2)·(7)·(8)).`);
            }
        }
    }

    return out;
}

// ── 사내 공용 열 입력 — 화면이 쓰는 검사와 저장 빌더 ─────────────────────────────────────────
// 화면은 필드 매핑을 직접 적지 않는다. 같은 매핑이 두 곳에 살면 한쪽만 고쳐진다(이 저장소가 반복한 실패 모양).

export interface SharedHeatDraftConsumer {
    processId: string;
    quantity: number;
    unit: HeatConsumption['unit'];
    basis: HeatQuantityBasis;
    note: string;
}

export interface SharedHeatDraft {
    name: string;
    /** 이 열 공급원의 연료 배출원 id */
    streamIds: string[];
    consumers: SharedHeatDraftConsumer[];
    /** 공정 밖 사용량(사무동 난방·비대상 용도). 0이면 없다. */
    outsideQuantity: number;
    outsideUnit: HeatConsumption['unit'];
    outsideNote: string;
}

/** 저장을 막을 문제. 없으면 undefined. */
export function validateSharedHeatDraft(
    draft: SharedHeatDraft,
    context: {
        processes: Array<Pick<ProductionProcess, 'id' | 'name' | 'period_id'>>;
        sourceStreams: Array<Pick<SourceStream, 'id' | 'name' | 'period_id' | 'stream_type' | 'heat_system'>>;
    }
): string | undefined {
    const name = draft.name.trim();
    if (!name) return '열 공급원 이름을 적으세요. 예: 온수 보일러';
    if (draft.streamIds.length === 0) return '이 열을 만드는 연료를 하나 이상 고르세요. 연료는 4단계의 연료 연소에서 먼저 넣습니다.';
    if (draft.consumers.length === 0) return '열을 받는 공정을 하나 이상 고르세요.';

    const streams = draft.streamIds.map((id) => context.sourceStreams.find((stream) => stream.id === id));
    if (streams.some((stream) => !stream)) return '고른 연료 배출원을 찾을 수 없습니다. 화면을 새로 고친 뒤 다시 시도하세요.';
    const notFuel = streams.find((stream) => stream && stream.stream_type !== 'FUEL');
    if (notFuel) return `「${notFuel.name}」은 연료가 아닙니다 — 열 공급원에는 연료 연소 배출원만 넣을 수 있습니다.`;
    const elsewhere = streams.find((stream) => stream?.heat_system?.name?.trim() && stream.heat_system.name.trim() !== name);
    if (elsewhere) return `「${elsewhere.name}」은 이미 열 공급원 「${elsewhere.heat_system?.name}」에 들어 있습니다. 한 연료는 한 열 공급원에만 넣을 수 있습니다.`;

    const processIds = draft.consumers.map((consumer) => consumer.processId);
    if (new Set(processIds).size !== processIds.length) return '같은 공정이 두 번 들어 있습니다.';
    for (const consumer of draft.consumers) {
        const process = context.processes.find((item) => item.id === consumer.processId);
        if (!process) return '고른 공정을 찾을 수 없습니다. 화면을 새로 고친 뒤 다시 시도하세요.';
        if (!(consumer.quantity > 0)) return `「${process.name}」의 열 사용량을 0보다 크게 넣으세요.`;
        if (consumer.basis === 'INDIRECT_ESTIMATE' && !consumer.note.trim()) {
            return `「${process.name}」의 열 사용량을 추정으로 정했습니다 — 직접 계량이 불가능하거나 비용이 과다한 사유와 추정 근거(설비 정격 × 가동시간 등)를 적으세요. 검증인이 묻습니다.`;
        }
    }
    if (draft.outsideQuantity < 0) return '공정 밖 사용량은 0 이상이어야 합니다.';

    const periodIds = new Set([
        ...streams.map((stream) => stream?.period_id ?? ''),
        ...draft.consumers.map((consumer) => context.processes.find((item) => item.id === consumer.processId)?.period_id ?? ''),
    ]);
    if (periodIds.size > 1) return '연료와 공정의 보고기간이 서로 다릅니다 — 같은 보고기간의 것만 한 열 공급원으로 묶을 수 있습니다.';

    // 한 공정만 쓰고 공정 밖 사용도 없으면 이 열은 「둘 이상의 공정」이 쓰는 열이 아니다 — 연료는 그 공정의 직접배출이다.
    if (draft.consumers.length + (draft.outsideQuantity > 0 ? 1 : 0) < 2) {
        return '한 공정만 쓰는 열이면 열 공급원으로 나눌 필요가 없습니다 — 보일러 연료를 그 공정의 연료로 넣으세요. 규정은 열이 둘 이상의 공정(또는 공정 밖)에 쓰일 때 연료 배출을 열량 비율로 귀속하라고 합니다(ANNEX III A.3).';
    }
    return undefined;
}

const sameHeatSystem = (stream: SourceStream, name: string, periodId: string | undefined) =>
    stream.heat_system?.name?.trim() === name && (stream.period_id ?? '') === (periodId ?? '');

/**
 * 입력을 저장 레코드로 옮긴다. **바뀐 것만** 돌려준다(기존 레코드를 펼쳐 id·다른 필드를 지킨다).
 * - 고른 연료: heat_system을 달고 process_id를 뗀다 — 열 공급원 연료는 어느 공정의 직접배출에도 들어가지 않는다.
 * - 열을 받는 공정: 이 공급원의 heat_consumption을 새로 쓴다(다른 공급원의 항목은 그대로).
 * - 이번에 빠진 연료·공정: 이 공급원 표시를 지운다. 빠진 연료는 process_id가 없으므로 다시 연결해야 한다.
 */
export function buildSharedHeatUpdates<P extends ProductionProcess, S extends SourceStream>(
    processes: P[],
    sourceStreams: S[],
    draft: SharedHeatDraft
): { processes: P[]; sourceStreams: S[] } {
    const name = draft.name.trim();
    const periodId = processes.find((process) => draft.consumers.some((consumer) => consumer.processId === process.id))?.period_id;
    const chosenStreams = new Set(draft.streamIds);
    const consumerById = new Map(draft.consumers.map((consumer) => [consumer.processId, consumer]));
    const outside = draft.outsideQuantity > 0
        ? { outside_quantity: draft.outsideQuantity, outside_unit: draft.outsideUnit, outside_note: draft.outsideNote.trim() || undefined }
        : {};

    const changedStreams: S[] = [];
    for (const stream of sourceStreams) {
        if (chosenStreams.has(stream.id)) {
            changedStreams.push({ ...stream, process_id: undefined, heat_system: { name, ...outside } });
        } else if (sameHeatSystem(stream, name, periodId)) {
            changedStreams.push({ ...stream, heat_system: undefined });
        }
    }

    const changedProcesses: P[] = [];
    for (const process of processes) {
        const consumer = consumerById.get(process.id);
        const others = (process.heat_consumption ?? []).filter((item) => item.system.trim() !== name);
        const hadThis = others.length !== (process.heat_consumption ?? []).length;
        if (consumer) {
            const next: HeatConsumption = {
                system: name,
                quantity: consumer.quantity,
                unit: consumer.unit,
                basis: consumer.basis,
                note: consumer.note.trim() || undefined,
            };
            changedProcesses.push({ ...process, heat_consumption: [...others, next] });
        } else if (hadThis) {
            changedProcesses.push({ ...process, heat_consumption: others.length > 0 ? others : undefined });
        }
    }

    return { processes: changedProcesses, sourceStreams: changedStreams };
}

/** 열 공급원 해제 — 연료의 열 공급원 표시와 공정의 열 사용량을 지운다. 연료는 process_id가 없는 채로 남으므로 다시 연결해야 한다. */
export function buildSharedHeatRelease<P extends ProductionProcess, S extends SourceStream>(
    processes: P[],
    sourceStreams: S[],
    name: string,
    periodId: string | undefined
): { processes: P[]; sourceStreams: S[] } {
    const target = name.trim();
    const changedProcesses: P[] = [];
    for (const process of processes) {
        if ((process.period_id ?? '') !== (periodId ?? '')) continue;
        const rest = (process.heat_consumption ?? []).filter((item) => item.system.trim() !== target);
        if (rest.length !== (process.heat_consumption ?? []).length) {
            changedProcesses.push({ ...process, heat_consumption: rest.length > 0 ? rest : undefined });
        }
    }
    return {
        processes: changedProcesses,
        sourceStreams: sourceStreams.filter((stream) => sameHeatSystem(stream, target, periodId)).map((stream) => ({ ...stream, heat_system: undefined })),
    };
}
