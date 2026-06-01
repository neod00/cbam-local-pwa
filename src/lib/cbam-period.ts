export type CbamPeriodMode = 'TRANSITIONAL' | 'DEFINITIVE' | 'MIGRATION_FROM_TRANSITIONAL';

export const CURRENT_CBAM_PERIOD = {
    mode: 'DEFINITIVE' as CbamPeriodMode,
    label: '2026 Definitive Period',
    reportingYear: '2026',
    declarationDue: '2027-09-30',
};

