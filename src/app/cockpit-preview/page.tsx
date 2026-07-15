import type { Metadata } from 'next';
import Link from 'next/link';
import {
    BarChart3,
    Bell,
    Boxes,
    Building2,
    CalendarDays,
    CheckCircle2,
    ChevronDown,
    CircleHelp,
    ClipboardCheck,
    CloudOff,
    Database,
    Download,
    Factory,
    FileInput,
    FileSpreadsheet,
    FileText,
    Gauge,
    Home,
    Leaf,
    LockKeyhole,
    Package,
    RefreshCw,
    Settings,
    ShieldCheck,
    Upload,
    Zap,
} from 'lucide-react';

export const metadata: Metadata = {
    title: 'CBAM Local Dashboard Preview',
    description: 'Visual dashboard and guided bill-entry preview for CBAM Local.',
};

const navItems = [
    { label: '대시보드', href: '/cockpit-preview', icon: Home },
    { label: '품목 관리', href: '/cockpit-preview/products', icon: Package },
    { label: '배출량 관리', href: '/cockpit-preview/source-streams', icon: BarChart3 },
    { label: '고지서 관리', href: '/cockpit-preview/bills', icon: FileText },
    { label: '데이터 입력', href: '/cockpit-preview/bills', icon: FileInput },
    { label: '검증 및 품질', href: '/cockpit-preview/validation', icon: ShieldCheck },
    { label: '보고서', href: '/cockpit-preview/export', icon: FileSpreadsheet },
    { label: 'EU Communication', href: '/cockpit-preview/export', icon: Database },
    { label: '기준/계수 관리', href: '/cockpit-preview/source-streams', icon: Boxes },
    { label: '사업장 관리', href: '/cockpit-preview', icon: Building2 },
    { label: '설정', href: '/cockpit-preview', icon: Settings },
] as const;

const kpis = [
    {
        label: '총 배출량',
        value: '2,216.7',
        unit: 'tCO₂e',
        delta: '전년 대비 6.3% 감소',
        status: '검증 필요',
        icon: Leaf,
        card: 'bg-white',
        accent: 'text-emerald-800',
        chip: 'bg-amber-50 text-amber-800 ring-amber-500/20',
        line: '#2f6f58',
        path: 'M4 36 C13 31 18 33 27 25 S44 17 52 22 S66 34 78 14',
    },
    {
        label: '직접 배출량',
        value: '1,284.6',
        unit: 'Scope 1',
        delta: '증빙 완료 91%',
        status: '증빙 완료',
        icon: Factory,
        card: 'bg-white',
        accent: 'text-teal-800',
        chip: 'bg-emerald-50 text-emerald-800 ring-emerald-500/20',
        line: '#237c6a',
        path: 'M4 32 C16 20 25 27 36 18 S61 13 78 21',
    },
    {
        label: '간접 배출량',
        value: '932.1',
        unit: 'Scope 2',
        delta: '계수 확인 2건',
        status: '계수 확인',
        icon: Zap,
        card: 'bg-white',
        accent: 'text-blue-800',
        chip: 'bg-blue-50 text-blue-800 ring-blue-500/20',
        line: '#376ac6',
        path: 'M4 34 C13 34 21 29 30 31 S50 16 59 20 S69 28 78 14',
    },
    {
        label: 'SEE',
        value: '2.41',
        unit: 'tCO₂e/t',
        delta: '제품 8개 기준',
        status: '계속 확인',
        icon: Package,
        card: 'bg-white',
        accent: 'text-violet-800',
        chip: 'bg-violet-50 text-violet-800 ring-violet-500/20',
        line: '#6b55b6',
        path: 'M4 35 C17 35 20 22 31 28 S48 21 55 29 S68 31 78 16',
    },
];

const emissionSources = [
    { name: '전기', value: '1,012.4', share: '45.7%', className: 'col-span-2 row-span-2 bg-[#3f7f35]' },
    { name: '도시가스', value: '612.3', share: '27.6%', className: 'bg-[#3b8a82]' },
    { name: '공정', value: '341.2', share: '15.4%', className: 'bg-[#3d72b8]' },
    { name: '원료', value: '178.6', share: '8.1%', className: 'bg-[#6557b4]' },
    { name: '수송', value: '72.2', share: '3.3%', className: 'bg-[#d78a1f]' },
];

const heatRows = [
    ['고지서', [100, 100, 75, 75, 50, 50, 0]],
    ['사용량', [75, 100, 100, 75, 50, 25, 0]],
    ['계수', [100, 75, 75, 50, 50, 25, 0]],
    ['배출량', [75, 75, 50, 25, 75, 75, 0]],
    ['증빙', [100, 100, 75, 75, 75, 50, 0]],
] as const;

const complianceRows = [
    ['총 배출량 (Scope 1+2)', 'EU CBAM Annex I', '검증 필요', '2025-05-20'],
    ['내재배출량 (SEE)', 'EU CBAM Annex I', '계수 확인', '2025-05-22'],
    ['배출계수 출처', 'EU Guidance', '증빙 완료', '2025-05-22'],
    ['측정/계산 방법론', 'EU Guidance', '증빙 완료', '2025-05-22'],
    ['검증 계획', 'EU Guidance', '검증 필요', '2025-05-30'],
] as const;

const recentRows = [
    ['고지서 입력', '전기 2025-04 청구분', '09:35', '완료'],
    ['고지서 입력', '도시가스 2025-04 청구분', '09:28', '완료'],
    ['배출계수 변경', '전기 배출계수', '09:10', '적용'],
] as const;

function MiniLine({ color, path }: { color: string; path: string }) {
    return (
        <svg viewBox="0 0 82 46" aria-hidden="true" className="h-14 w-28">
            <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeWidth="3" />
            <path d={`${path} L78 46 L4 46 Z`} fill={color} opacity="0.08" />
            {[8, 22, 36, 52, 66, 78].map((x, index) => (
                <circle key={x} cx={x} cy={[34, 29, 25, 22, 29, 15][index]} r="2.5" fill={color} opacity="0.85" />
            ))}
        </svg>
    );
}

function Sidebar() {
    return (
        <aside className="hidden w-[258px] shrink-0 flex-col bg-[#0B3328] text-white shadow-[14px_0_40px_rgba(15,23,42,0.16)] lg:flex">
            <div className="border-b border-white/10 px-5 py-5">
                <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/12">
                        <Database className="h-5 w-5 text-emerald-100" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                            CBAM Local
                            <span className="rounded-md bg-white/12 px-1.5 py-0.5 text-[10px] font-bold text-emerald-100">PWA</span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-emerald-100/70">로컬 우선 · 데이터 보호</p>
                    </div>
                </div>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                {navItems.map((item, index) => {
                    const Icon = item.icon;
                    const active = index === 0;
                    return (
                        <Link
                            key={`${item.href}-${item.label}`}
                            href={item.href}
                            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
                                active ? 'bg-white/15 text-white ring-1 ring-white/12' : 'text-emerald-50/75 hover:bg-white/8 hover:text-white'
                            }`}
                        >
                            <Icon className="h-4.5 w-4.5" />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4">
                <div className="rounded-2xl border border-white/12 bg-white/[0.07] p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <LockKeyhole className="h-4 w-4 text-emerald-200" />
                            로컬 저장
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-300/15 px-2 py-0.5 text-xs font-semibold text-emerald-100">
                            <span className="h-2 w-2 rounded-full bg-emerald-300" />
                            정상
                        </span>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-emerald-50/70">모든 데이터는 이 기기에 로컬 저장됩니다.</p>
                    <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-xs text-emerald-50/78">
                        <div className="flex items-center gap-2">
                            <CloudOff className="h-3.5 w-3.5" />
                            오프라인 모드
                        </div>
                        <div>마지막 동기화 2025-05-16 09:42</div>
                    </div>
                </div>
            </div>
        </aside>
    );
}

function TopBar() {
    return (
        <header className="flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
                <button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm">
                    <CalendarDays className="h-4 w-4 text-slate-500" />
                    2026 보고기간
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
                <button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm">
                    <Building2 className="h-4 w-4 text-slate-500" />
                    한빛제철(주) 포항사업장
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
            </div>
            <div className="flex items-center gap-3">
                <span className="hidden items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 md:inline-flex">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    로컬 저장 · 오프라인 모드
                </span>
                <button className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100">
                    <Bell className="h-5 w-5" />
                </button>
                <button className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100">
                    <CircleHelp className="h-5 w-5" />
                </button>
                <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 sm:flex">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">ESG</div>
                    <div className="text-sm">
                        <div className="font-semibold text-slate-900">ESG 담당자</div>
                        <div className="text-xs text-slate-500">관리자</div>
                    </div>
                </div>
            </div>
        </header>
    );
}

function KpiCard({ item }: { item: (typeof kpis)[number] }) {
    const Icon = item.icon;

    return (
        <article className={`rounded-xl border border-slate-200 ${item.card} p-5 shadow-[0_10px_30px_rgba(15,23,42,0.07)]`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-bold text-slate-800">{item.label}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{item.unit}</p>
                </div>
                <div className="grid h-11 w-11 place-items-center rounded-full bg-slate-100">
                    <Icon className={`h-5 w-5 ${item.accent}`} />
                </div>
            </div>
            <div className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">{item.value}</div>
            <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold text-emerald-700">{item.delta}</p>
                    <span className={`mt-3 inline-flex rounded-md px-2.5 py-1 text-xs font-bold ring-1 ${item.chip}`}>
                        {item.status}
                    </span>
                </div>
                <MiniLine color={item.line} path={item.path} />
            </div>
        </article>
    );
}

function ReadinessKpi() {
    return (
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.07)]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-bold text-slate-800">보고 준비율</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">목표 100%</p>
                    <div className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">78%</div>
                    <p className="mt-3 text-xs font-semibold text-emerald-700">전년 대비 9%p 상승</p>
                    <span className="mt-3 inline-flex rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 ring-1 ring-blue-500/20">
                        진행 중
                    </span>
                </div>
                <div className="grid h-28 w-28 place-items-center rounded-full bg-[conic-gradient(#276752_0_281deg,#E8ECEA_281deg_360deg)]">
                    <div className="h-20 w-20 rounded-full bg-white" />
                </div>
            </div>
        </article>
    );
}

function Panel({
    title,
    subtitle,
    action,
    children,
    className = '',
}: {
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ${className}`}>
            <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-base font-bold text-slate-900">{title}</h2>
                    {subtitle && <p className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</p>}
                </div>
                {action}
            </div>
            {children}
        </section>
    );
}

function BarChart() {
    const bars = [
        [70, 32, 15],
        [74, 30, 14],
        [72, 31, 16],
        [66, 30, 15],
        [63, 29, 16],
    ];

    return (
        <div className="flex h-[230px] items-end justify-around gap-4 border-b border-l border-slate-200 px-4 pb-8">
            {bars.map(([scope1, scope2, other], index) => (
                <div key={index} className="flex h-full flex-1 flex-col items-center justify-end">
                    <div className="flex w-12 flex-col overflow-hidden rounded-t-md">
                        <div className="bg-slate-300" style={{ height: `${other}px` }} />
                        <div className="bg-[#68A9A8]" style={{ height: `${scope2}px` }} />
                        <div className="bg-[#245C46]" style={{ height: `${scope1}px` }} />
                    </div>
                    <div className="mt-3 text-xs font-semibold text-slate-500">{['2024 Q2', '2024 Q3', '2024 Q4', '2025 Q1', '2025 Q2'][index]}</div>
                </div>
            ))}
        </div>
    );
}

function TrendChart() {
    return (
        <svg viewBox="0 0 620 240" className="h-[230px] w-full" role="img" aria-label="연도별 배출량 추이">
            {[0, 1, 2, 3, 4].map((line) => (
                <line key={line} x1="40" x2="600" y1={35 + line * 42} y2={35 + line * 42} stroke="#E2E8F0" />
            ))}
            <path d="M40 178 C135 145 170 137 240 115 C315 90 370 76 450 98 C520 118 560 78 600 54" fill="none" stroke="#275F4A" strokeWidth="4" />
            <path d="M40 178 C135 145 170 137 240 115 C315 90 370 76 450 98 C520 118 560 78 600 54 L600 210 L40 210 Z" fill="#2D8C7B" opacity="0.18" />
            <path d="M40 146 C130 126 190 118 248 98 C330 74 390 62 450 82 C525 102 562 68 600 36" fill="none" stroke="#79B9B0" strokeWidth="3" />
            {['2021', '2022', '2023', '2024', '2025'].map((year, index) => (
                <text key={year} x={40 + index * 140} y="232" textAnchor="middle" className="fill-slate-500 text-[12px] font-semibold">
                    {year}
                </text>
            ))}
        </svg>
    );
}

function ReadinessDonut() {
    const rows = [
        ['완료', '62 (51%)', 'bg-[#276752]'],
        ['진행 중', '24 (20%)', 'bg-[#68A9A8]'],
        ['검증 필요', '18 (15%)', 'bg-[#E9A93A]'],
        ['미착수', '14 (11%)', 'bg-slate-300'],
        ['해당 없음', '4 (3%)', 'bg-slate-200'],
    ];

    return (
        <div className="grid items-center gap-5 md:grid-cols-[190px_minmax(0,1fr)]">
            <div className="grid h-44 w-44 place-items-center rounded-full bg-[conic-gradient(#276752_0_184deg,#68A9A8_184deg_256deg,#E9A93A_256deg_310deg,#CBD5E1_310deg_348deg,#E2E8F0_348deg_360deg)]">
                <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-center shadow-inner">
                    <div>
                        <div className="text-3xl font-semibold text-slate-950">78%</div>
                        <div className="text-xs font-bold text-slate-500">준비율</div>
                    </div>
                </div>
            </div>
            <div className="space-y-3">
                {rows.map(([label, value, color]) => (
                    <div key={label} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 font-semibold text-slate-700">
                            <span className={`h-3 w-3 rounded-full ${color}`} />
                            {label}
                        </span>
                        <span className="font-bold text-slate-700">{value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Heatmap() {
    function cellClass(value: number) {
        if (value >= 100) return 'bg-[#276752]';
        if (value >= 75) return 'bg-[#70B59D]';
        if (value >= 50) return 'bg-[#F2D46A]';
        if (value >= 25) return 'bg-[#E89A64]';
        return 'bg-slate-100';
    }

    return (
        <div>
            <div className="mb-3 grid grid-cols-[80px_repeat(7,1fr)] gap-1 text-center text-xs font-semibold text-slate-500">
                <span />
                {['2024-11', '12', '2025-01', '02', '03', '04', '05'].map((month) => <span key={month}>{month}</span>)}
            </div>
            <div className="space-y-1">
                {heatRows.map(([label, values]) => (
                    <div key={label} className="grid grid-cols-[80px_repeat(7,1fr)] gap-1">
                        <div className="py-2 text-xs font-bold text-slate-600">{label}</div>
                        {values.map((value, index) => (
                            <div key={`${label}-${index}`} className={`h-9 rounded-sm ${cellClass(value)}`} />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

function FlowChart() {
    return (
        <div className="grid h-[210px] grid-cols-[130px_minmax(0,1fr)_140px] items-center gap-4">
            <div className="space-y-3">
                {[
                    ['전기', '1,245.6 (56%)', 'bg-[#276752]'],
                    ['가스', '785.2 (35%)', 'bg-[#519A97]'],
                    ['공정', '186.0 (8%)', 'bg-[#6659A8]'],
                ].map(([label, value, color]) => (
                    <div key={label} className={`rounded-lg ${color} p-3 text-white shadow-sm`}>
                        <div className="font-bold">{label}</div>
                        <div className="text-xs font-semibold opacity-90">{value}</div>
                    </div>
                ))}
            </div>
            <svg viewBox="0 0 360 170" className="h-full w-full" aria-hidden="true">
                <path d="M0 38 C110 28 170 72 360 78" fill="none" stroke="#D8E2DC" strokeWidth="34" strokeLinecap="round" />
                <path d="M0 86 C112 84 182 92 360 92" fill="none" stroke="#E5EBE7" strokeWidth="28" strokeLinecap="round" />
                <path d="M0 126 C120 126 190 107 360 103" fill="none" stroke="#EEF2EF" strokeWidth="22" strokeLinecap="round" />
            </svg>
            <div className="rounded-xl bg-[#0F3D2E] p-5 text-center text-white shadow-lg">
                <div className="text-sm font-semibold opacity-80">CBAM 보고</div>
                <div className="mt-1 text-2xl font-semibold">2,216.7</div>
                <div className="text-xs font-semibold opacity-75">tCO₂e</div>
            </div>
        </div>
    );
}

function ComplianceTable() {
    return (
        <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                    <tr>
                        <th className="px-3 py-2">항목</th>
                        <th className="px-3 py-2">기준</th>
                        <th className="px-3 py-2">상태</th>
                        <th className="px-3 py-2">마감일</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-xs">
                    {complianceRows.map(([item, basis, status, due]) => (
                        <tr key={item}>
                            <td className="px-3 py-2 font-semibold text-slate-800">{item}</td>
                            <td className="px-3 py-2 text-slate-500">{basis}</td>
                            <td className={`px-3 py-2 font-bold ${status === '증빙 완료' ? 'text-emerald-700' : status === '계수 확인' ? 'text-amber-700' : 'text-red-600'}`}>{status}</td>
                            <td className="px-3 py-2 text-slate-500">{due}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function WorkPanel() {
    const steps = [
        ['증빙 업로드', '완료'],
        ['자동 추출', '완료'],
        ['데이터 확인', '진행 중'],
        ['배출계수 적용', '대기'],
        ['저장 및 검증', '대기'],
    ];

    return (
        <aside className="border-l border-slate-200 bg-white p-5 xl:min-h-[calc(100vh-64px)]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-950">오늘의 입력 작업</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">필수 항목 8개 중 6개 완료</p>
                </div>
                <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full w-[75%] rounded-full bg-[#4B9B3B]" />
                </div>
            </div>

            <div className="mt-6 space-y-3">
                {steps.map(([label, status], index) => {
                    const active = index === 2;
                    const done = index < 2;
                    return (
                        <div key={label} className={`relative rounded-xl border p-4 ${active ? 'border-blue-300 bg-blue-50/30 shadow-[0_0_0_3px_rgba(59,130,246,0.08)]' : 'border-slate-200 bg-white'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${done ? 'bg-[#4B9B3B] text-white' : active ? 'bg-white text-blue-700 ring-4 ring-blue-100' : 'bg-slate-100 text-slate-500'}`}>
                                    {done ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="font-bold text-slate-900">{label}</p>
                                        <span className={`text-xs font-bold ${done ? 'text-emerald-700' : active ? 'text-blue-700' : 'text-slate-400'}`}>{status}</span>
                                    </div>
                                </div>
                            </div>
                            {active && (
                                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="col-span-2 block">
                                            <span className="text-xs font-bold text-slate-600">에너지 유형</span>
                                            <select className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800">
                                                <option>전기</option>
                                            </select>
                                        </label>
                                        <label className="col-span-2 block">
                                            <span className="text-xs font-bold text-slate-600">청구 기간</span>
                                            <div className="mt-1 grid grid-cols-[1fr_24px_1fr] items-center gap-2">
                                                <input className="h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold" defaultValue="2025-04-01" />
                                                <span className="text-center text-slate-400">~</span>
                                                <input className="h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold" defaultValue="2025-04-30" />
                                            </div>
                                        </label>
                                        <label>
                                            <span className="text-xs font-bold text-slate-600">사용량</span>
                                            <input className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold" defaultValue="1,245,600" />
                                        </label>
                                        <label>
                                            <span className="text-xs font-bold text-slate-600">단위</span>
                                            <select className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold">
                                                <option>kWh</option>
                                            </select>
                                        </label>
                                        <label>
                                            <span className="text-xs font-bold text-slate-600">배출계수</span>
                                            <input className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold" defaultValue="0.000466" />
                                        </label>
                                        <label>
                                            <span className="text-xs font-bold text-slate-600">계수 단위</span>
                                            <select className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold">
                                                <option>tCO₂e/kWh</option>
                                            </select>
                                        </label>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                                        <span className="font-semibold text-blue-700">전기_202504.pdf</span>
                                        <span className="text-xs font-semibold text-slate-500">256 KB</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-xs font-bold text-slate-500">예상 배출량</p>
                        <div className="mt-1 text-3xl font-semibold text-slate-950">572.3 <span className="text-base">tCO₂e</span></div>
                    </div>
                    <div className="grid h-20 w-20 place-items-center rounded-full bg-[conic-gradient(#2D8C7B_0_360deg,#E2E8F0_0)]">
                        <div className="grid h-14 w-14 place-items-center rounded-full bg-white text-xs font-bold text-teal-800">572.3</div>
                    </div>
                </div>
            </div>

            <div className="mt-5 grid grid-cols-[0.9fr_1.2fr] gap-3">
                <button className="inline-flex min-h-14 items-center justify-center rounded-xl border border-slate-300 bg-white text-base font-bold text-slate-800 shadow-sm">
                    <BarChart3 className="mr-2 h-5 w-5" />
                    계산 미리보기
                </button>
                <button className="inline-flex min-h-14 items-center justify-center rounded-xl bg-[#0F3D2E] text-base font-bold text-white shadow-lg shadow-emerald-900/20">
                    <LockKeyhole className="mr-2 h-5 w-5" />
                    로컬 저장
                </button>
            </div>
        </aside>
    );
}

export default function CockpitPreviewPage() {
    return (
        <main className="min-h-screen bg-[#F5F7F4] text-slate-950">
            <div className="flex min-h-screen">
                <Sidebar />
                <div className="min-w-0 flex-1">
                    <TopBar />
                    <div className="grid min-h-[calc(100vh-64px)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_560px]">
                        <section className="min-w-0 space-y-5 p-5">
                            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-3xl font-bold tracking-tight text-slate-950">대시보드</h1>
                                        <span className="text-sm font-semibold text-slate-500">기준일: 2025-05-16 09:42</span>
                                        <RefreshCw className="h-4 w-4 text-slate-400" />
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm">
                                        <Upload className="mr-2 h-4 w-4" />
                                        데이터 가져오기
                                    </button>
                                    <button className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm">
                                        <FileText className="mr-2 h-4 w-4" />
                                        보고서 생성
                                    </button>
                                    <button className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm">
                                        <Download className="mr-2 h-4 w-4" />
                                        내보내기
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-5">
                                {kpis.map((item) => (
                                    <KpiCard key={item.label} item={item} />
                                ))}
                                <ReadinessKpi />
                            </div>

                            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)_minmax(380px,0.8fr)]">
                                <Panel
                                    title="Scope 1/2 배출량 (분기별)"
                                    subtitle="tCO₂e"
                                    action={<span className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500">최근 5분기</span>}
                                >
                                    <BarChart />
                                </Panel>

                                <Panel
                                    title="배출량 추이 (연도별)"
                                    subtitle="tCO₂e"
                                    action={<span className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500">최근 5개년</span>}
                                >
                                    <TrendChart />
                                </Panel>

                                <Panel title="CBAM 보고 준비율" subtitle="전체 항목 122개">
                                    <ReadinessDonut />
                                </Panel>
                            </div>

                            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.85fr)_minmax(420px,0.9fr)]">
                                <Panel title="배출원 구성" subtitle="tCO₂e">
                                    <div className="grid h-[270px] grid-cols-4 grid-rows-2 gap-2">
                                        {emissionSources.map((source) => (
                                            <div key={source.name} className={`rounded-xl p-4 text-white ${source.className}`}>
                                                <div className="text-lg font-bold">{source.name}</div>
                                                <div className="mt-3 text-3xl font-semibold">{source.value}</div>
                                                <div className="mt-1 text-sm font-bold opacity-85">{source.share}</div>
                                            </div>
                                        ))}
                                    </div>
                                </Panel>

                                <Panel title="배출원 흐름 (Sankey)" subtitle="tCO₂e (2025 YTD)">
                                    <FlowChart />
                                </Panel>

                                <Panel title="검증 및 컴플라이언스 현황" subtitle="마감일 기준">
                                    <ComplianceTable />
                                </Panel>
                            </div>

                            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.8fr)_minmax(420px,0.75fr)]">
                                <Panel title="데이터 완성도 (월별)" subtitle="월별 누락 항목 확인">
                                    <Heatmap />
                                </Panel>
                                <Panel title="최근 입력/변경 내역" subtitle="마지막 작업 기록">
                                    <div className="overflow-hidden rounded-lg border border-slate-200">
                                        <table className="min-w-full text-sm">
                                            <tbody className="divide-y divide-slate-100">
                                                {recentRows.map(([type, detail, time, status]) => (
                                                    <tr key={`${type}-${detail}`}>
                                                        <td className="px-3 py-3 font-bold text-slate-800">{type}</td>
                                                        <td className="px-3 py-3 text-slate-600">{detail}</td>
                                                        <td className="px-3 py-3 text-slate-500">{time}</td>
                                                        <td className="px-3 py-3 font-bold text-emerald-700">{status}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </Panel>
                                <Panel title="빠른 작업" subtitle="초보자용 주요 행동">
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            ['고지서 입력', FileInput],
                                            ['배출량 계산', Gauge],
                                            ['보고서 생성', FileSpreadsheet],
                                            ['데이터 검증', ClipboardCheck],
                                        ].map(([label, Icon]) => (
                                            <button key={label as string} className="flex min-h-24 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 transition hover:bg-white">
                                                <Icon className="mb-2 h-6 w-6 text-teal-700" />
                                                {label as string}
                                            </button>
                                        ))}
                                    </div>
                                </Panel>
                            </div>
                        </section>

                        <WorkPanel />
                    </div>
                </div>
            </div>
        </main>
    );
}
