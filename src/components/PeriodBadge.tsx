import { CURRENT_CBAM_PERIOD } from '@/lib/cbam-period';
import { CalendarDays } from 'lucide-react';

export default function PeriodBadge() {
    return (
        <div className="hidden items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 md:flex">
            <CalendarDays className="h-4 w-4 text-emerald-700" />
            <span className="font-semibold">{CURRENT_CBAM_PERIOD.label}</span>
            <span className="hidden text-emerald-700 xl:inline">
                Reporting year: {CURRENT_CBAM_PERIOD.reportingYear} · Declaration due: {CURRENT_CBAM_PERIOD.declarationDue}
            </span>
        </div>
    );
}

