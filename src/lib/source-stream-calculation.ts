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
>;

function clampFraction(value: number) {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.min(Math.max(value, 0), 1);
}

export function calculateSourceStreamEmissions(sourceStream: SourceStreamCalculationInput) {
    const activityData = Math.max(sourceStream.activity_data, 0);
    const emissionFactor = Math.max(sourceStream.emission_factor_tco2e_per_unit, 0);
    const oxidationFactor = clampFraction(sourceStream.oxidation_factor);
    const conversionFactor = clampFraction(sourceStream.conversion_factor);
    const fossilFraction = clampFraction(sourceStream.fossil_fraction);

    if (sourceStream.stream_type === 'FUEL' || sourceStream.method === 'Combustion') {
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

    return activityData * emissionFactor * oxidationFactor * conversionFactor * fossilFraction;
}
