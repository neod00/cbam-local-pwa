export type ActivityData = Record<string, number>;

export interface CalcInput {
    output_mass_t: number;
    electricity_mwh: number;
    electricity_ef: number; // tCO2e/MWh
    fuel_usage: {
        amount: number;
        unit: string;
        ef: number; // tCO2e/unit
    }[];
    precursors: {
        see: number;
        share: number;
    }[];
    input_mass_t?: number;
}

export interface CalcResult {
    direct_see: number;
    indirect_see: number;
    precursor_see: number;
    total_see: number;
    yield_ratio?: number;
}

export function calculateEmission(input: CalcInput): CalcResult {
    const { output_mass_t, electricity_mwh, electricity_ef, fuel_usage, precursors, input_mass_t } = input;

    if (output_mass_t <= 0) {
        throw new Error('Output mass must be greater than 0');
    }

    // 1. Indirect (Electricity)
    // Emission = (MWh * EF)
    // SEE = Emission / Output
    const indirect_emission = electricity_mwh * electricity_ef;
    const indirect_see = indirect_emission / output_mass_t;

    // 2. Direct (Fuel)
    let direct_emission = 0;
    for (const fuel of fuel_usage) {
        direct_emission += fuel.amount * fuel.ef;
    }
    const direct_see = direct_emission / output_mass_t;

    // 3. Precursors
    // SEE = Sum(PrecursorSEE * Share)
    // Note: Share is usually mass_of_precursor / mass_of_product ?? 
    // Wait, PRD says: "precursor SEE x 질량비" 
    // If share_by_mass is defined as (Mass Precursor / Mass Product), then simply sum them.
    let precursor_see = 0;
    for (const p of precursors) {
        precursor_see += p.see * p.share;
    }

    // 4. Yield (Optional)
    let yield_ratio = undefined;
    if (input_mass_t && input_mass_t > 0) {
        yield_ratio = output_mass_t / input_mass_t;
    }

    const total_see = direct_see + indirect_see + precursor_see;

    return {
        direct_see,
        indirect_see,
        precursor_see,
        total_see,
        yield_ratio
    };
}
