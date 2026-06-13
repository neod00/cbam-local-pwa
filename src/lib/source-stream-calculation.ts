import type { SourceStream } from './local-db';

type SourceStreamCalculationInput = Pick<
    SourceStream,
    | 'stream_type'
    | 'method'
    | 'activity_data'
    | 'ncv_gj_per_unit'
    | 'emission_factor_tco2e_per_unit'
    | 'oxidation_factor'
    | 'conversion_factor'
    | 'fossil_fraction'
    | 'biomass_fraction'
>;

function clampFraction(value: number) {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.min(Math.max(value, 0), 1);
}

export function calculateSourceStreamEmissions(sourceStream: SourceStreamCalculationInput) {
    const emissionFactor = Math.max(sourceStream.emission_factor_tco2e_per_unit, 0);
    const oxidationFactor = clampFraction(sourceStream.oxidation_factor);
    const conversionFactor = clampFraction(sourceStream.conversion_factor);
    const fossilFraction = clampFraction(sourceStream.fossil_fraction);

    if (sourceStream.stream_type === 'FUEL' || sourceStream.method === 'Combustion') {
        const activityData = Math.max(sourceStream.activity_data, 0);
        const netCalorificValue = Math.max(sourceStream.ncv_gj_per_unit, 0);

        return (
            activityData *
            netCalorificValue *
            emissionFactor *
            oxidationFactor *
            conversionFactor *
            fossilFraction /
            1000
        );
    }

    // 물질수지(Mass balance)는 산출물(조강·슬래그 등) 탄소를 차감해야 하므로 음수 활동량을 허용한다
    // (투입 +, 산출 −). 그 외 공정배출 등은 음수가 의미 없으므로 0으로 클램프한다.
    const activityData = sourceStream.method === 'Mass balance'
        ? sourceStream.activity_data
        : Math.max(sourceStream.activity_data, 0);

    return activityData * emissionFactor * oxidationFactor * conversionFactor * fossilFraction;
}

export function calculateSourceStreamEnergyContent(sourceStream: SourceStreamCalculationInput) {
    if (sourceStream.stream_type !== 'FUEL' && sourceStream.method !== 'Combustion') {
        return 0;
    }

    const activityData = Math.max(sourceStream.activity_data, 0);
    const netCalorificValue = Math.max(sourceStream.ncv_gj_per_unit, 0);

    return activityData * netCalorificValue / 1000;
}

export function calculateSourceStreamEnergyBreakdown(sourceStream: SourceStreamCalculationInput) {
    const total = calculateSourceStreamEnergyContent(sourceStream);
    const fossil = total * clampFraction(sourceStream.fossil_fraction);
    const biomass = total * clampFraction(sourceStream.biomass_fraction);

    return {
        total,
        fossil,
        biomass,
    };
}

type SourceStreamUnitCheckInput = Pick<
    SourceStream,
    'stream_type' | 'method' | 'activity_unit' | 'ncv_gj_per_unit'
>;

// 연소 연료의 활동량 단위(t/Nm³)와 순발열량(NCV, GJ/단위) 기준 불일치를 잡는다.
// 배출량 = 활동량 × NCV × EF / 1000 이므로, 단위와 NCV 기준이 어긋나면 수백 배 오차가 조용히 발생한다.
// (예: Nm³ 활동량에 t 기준 NCV 48을 입력) — 앱은 '참값'을 모르므로 일반 물성 범위로 정합성을 점검한다.
export function getSourceStreamUnitWarnings(sourceStream: SourceStreamUnitCheckInput): string[] {
    const warnings: string[] = [];
    const isCombustion = sourceStream.stream_type === 'FUEL' || sourceStream.method === 'Combustion';
    if (!isCombustion) {
        return warnings;
    }

    const unit = (sourceStream.activity_unit ?? '').trim().toLowerCase();
    const ncv = sourceStream.ncv_gj_per_unit;

    if (!(ncv > 0)) {
        warnings.push('연소 연료는 순발열량(NCV)이 0보다 커야 합니다. 활동량과 같은 단위 기준의 NCV(GJ/단위)를 입력하세요.');
        return warnings;
    }

    // 기체 연료(Nm³)는 통상 NCV < 1 GJ/Nm³(예: LNG ≈ 0.037), 고체·액체(t)는 통상 10~50 GJ/t.
    if (unit === 'nm3' && ncv > 1) {
        warnings.push('활동량 단위가 Nm³인데 순발열량(NCV)이 1 GJ/Nm³를 초과합니다. t 기준 NCV(예: 48 GJ/t)를 Nm³ 활동량에 입력하면 배출량이 수백 배 과대산정됩니다. 단위와 NCV 기준을 일치시키세요.');
    } else if ((unit === 't' || unit === 'tonne') && ncv < 1) {
        warnings.push('활동량 단위가 t인데 순발열량(NCV)이 1 GJ/t 미만입니다. Nm³ 기준 NCV를 t 활동량에 입력했는지 확인하세요.');
    } else if ((unit === 't' || unit === 'tonne') && ncv > 100) {
        warnings.push('순발열량(NCV)이 t 기준 일반 범위(보통 10~50 GJ/t)를 크게 벗어납니다. 단위·NCV 기준을 확인하세요.');
    }

    return warnings;
}
