import Link from 'next/link';
import { SectionCard } from './ui';
import type { ScenarioAssumptions } from '@/lib/scenario-calculation';

function formatNumber(value: number) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
}

function SummaryGrid({ assumptions }: { assumptions?: ScenarioAssumptions }) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">기본값 연도</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{assumptions?.default_value_year ?? '-'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">CBAM factor</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{assumptions?.cbam_factor ?? '-'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">인증서 가격</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">
                    {assumptions ? `EUR ${formatNumber(assumptions.certificate_price_eur)}` : '-'}
                </p>
            </div>
        </div>
    );
}

function AssumptionLink({ label = '가정값 조정' }: { label?: string }) {
    return (
        <Link
            href="/scenarios"
            className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
            {label}
        </Link>
    );
}

export function ScenarioAssumptionSummary({
    assumptions,
    description = 'Dashboard와 Export 체크리스트는 이 가정값을 기준으로 SEFA·인증서 리스크를 계산합니다.',
    mode = 'section',
}: {
    assumptions?: ScenarioAssumptions;
    description?: string;
    mode?: 'section' | 'panel';
}) {
    if (mode === 'panel') {
        return (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-950">시나리오 기준</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
                    </div>
                    <AssumptionLink label="조정" />
                </div>
                <div className="mt-3">
                    <SummaryGrid assumptions={assumptions} />
                </div>
            </div>
        );
    }

    return (
        <SectionCard
            title="시나리오 가정"
            description={description}
            actions={<AssumptionLink />}
        >
            <SummaryGrid assumptions={assumptions} />
        </SectionCard>
    );
}
