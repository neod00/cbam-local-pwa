import type { ProductionProcess } from './local-db';

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
