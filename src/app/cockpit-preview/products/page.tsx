import type { Metadata } from 'next';
import Link from 'next/link';
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    BarChart3,
    Boxes,
    CheckCircle2,
    CircleDot,
    Factory,
    FileCheck2,
    Filter,
    Gauge,
    Layers3,
    Link2,
    PackagePlus,
    Search,
    ShieldCheck,
    Tag,
} from 'lucide-react';

export const metadata: Metadata = {
    title: 'Product Management Preview',
    description: 'A refined product management preview for CBAM Local.',
};

const products = [
    {
        name: 'Cold Rolled Steel Sheet',
        cn: '7209 16 90',
        group: '철강',
        output: '4,820 t',
        see: '2.41',
        readiness: 84,
        risk: '검증 필요',
        tone: 'bg-slate-950',
    },
    {
        name: 'Aluminium Billet',
        cn: '7601 20 20',
        group: '알루미늄',
        output: '1,360 t',
        see: '7.86',
        readiness: 68,
        risk: '계수 확인',
        tone: 'bg-teal-700',
    },
    {
        name: 'Fertilizer Mix A',
        cn: '3105 20 10',
        group: '비료',
        output: '920 t',
        see: '1.94',
        readiness: 91,
        risk: '증빙 완료',
        tone: 'bg-emerald-700',
    },
    {
        name: 'Hydrogen Feedstock',
        cn: '2804 10 00',
        group: '수소',
        output: '220 t',
        see: '11.32',
        readiness: 52,
        risk: '누락 있음',
        tone: 'bg-amber-600',
    },
];

const portfolio = [
    { label: '철강', value: '43%', amount: '1,067.8', tone: 'bg-slate-950' },
    { label: '알루미늄', value: '28%', amount: '696.3', tone: 'bg-teal-700' },
    { label: '비료', value: '16%', amount: '397.5', tone: 'bg-emerald-700' },
    { label: '수소', value: '9%', amount: '223.6', tone: 'bg-amber-600' },
    { label: '시멘트', value: '4%', amount: '99.4', tone: 'bg-slate-400' },
];

const steps = [
    { label: 'CN 코드 확인', detail: 'Annex I 대상 여부 자동 표시', done: true },
    { label: '생산공정 연결', detail: '품목별 공정/라인 매핑', done: true },
    { label: '전구물질 매핑', detail: '구매 원료와 SEE 출처 연결', done: false },
    { label: '보고 검토', detail: 'EU Communication 필드 확인', done: false },
];

const mappings = [
    ['열연 코일', '전구물질', '공급사 SEE 연결', '완료'],
    ['전력 사용량', '간접 배출', '2026 계수 적용', '자동'],
    ['도시가스', '직접 배출', '고지서 증빙 연결', '검토'],
    ['스크랩 투입량', '원료', '단위 확인 필요', '주의'],
];

function riskClass(risk: string) {
    if (risk === '증빙 완료') {
        return 'bg-emerald-50 text-emerald-800 ring-emerald-500/20';
    }

    if (risk === '누락 있음') {
        return 'bg-red-50 text-red-800 ring-red-500/20';
    }

    return 'bg-amber-50 text-amber-800 ring-amber-500/20';
}

function statusClass(status: string) {
    if (status === '완료' || status === '자동') {
        return 'bg-emerald-50 text-emerald-800 ring-emerald-500/20';
    }

    if (status === '주의') {
        return 'bg-red-50 text-red-800 ring-red-500/20';
    }

    return 'bg-amber-50 text-amber-800 ring-amber-500/20';
}

function Header() {
    return (
        <header className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-[0_20px_70px_rgba(15,23,42,0.07)] sm:px-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href="/cockpit-preview"
                            className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                            Cockpit
                        </Link>
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                            <Boxes className="mr-1.5 h-3.5 w-3.5" />
                            Product Portfolio
                        </span>
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                            Local-first preview
                        </span>
                    </div>
                    <h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                        품목 관리 Cockpit
                    </h1>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                        CBAM 대상 품목, CN 코드, 생산공정, 전구물질, SEE 리스크를 한 화면에서 정리하는 세련된 품목관리 시안입니다.
                    </p>
                </div>
                <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4 xl:w-[560px]">
                    {[
                        ['대상 품목', '8개'],
                        ['Annex I 후보', '6개'],
                        ['평균 준비율', '74%'],
                        ['검토 필요', '5건'],
                    ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <div className="text-[11px] font-semibold text-slate-500">{label}</div>
                            <div className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{value}</div>
                        </div>
                    ))}
                </div>
            </div>
        </header>
    );
}

function SummaryCards() {
    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
                ['총 품목', '8', 'CBAM 대상 후보', Boxes, 'bg-slate-950'],
                ['평균 SEE', '3.72', 'tCO2e/t', BarChart3, 'bg-teal-700'],
                ['매핑 완료', '74%', '공정/전구물질 연결', FileCheck2, 'bg-emerald-700'],
                ['리스크', '5건', '검증 필요', AlertTriangle, 'bg-amber-600'],
            ].map(([label, value, helper, Icon, accent]) => (
                <article key={label as string} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.06)]">
                    <div className={`absolute left-0 top-0 h-full w-1 ${accent as string}`} />
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-sm font-medium text-slate-500">{label as string}</div>
                            <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value as string}</div>
                            <div className="mt-2 text-xs font-semibold text-slate-500">{helper as string}</div>
                        </div>
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100">
                            <Icon className="h-5 w-5 text-slate-700" />
                        </div>
                    </div>
                </article>
            ))}
        </div>
    );
}

function PortfolioPanel() {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.06)] xl:col-span-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-base font-semibold text-slate-950">품목별 배출 포트폴리오</h2>
                    <p className="mt-1 text-sm text-slate-500">품목군별 내재배출 비중과 관리 우선순위</p>
                </div>
                <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    SEE 기준
                </span>
            </div>
            <div className="mt-6 space-y-4">
                {portfolio.map((item) => (
                    <div key={item.label} className="grid grid-cols-[92px_minmax(0,1fr)_96px] items-center gap-3">
                        <div className="text-sm font-semibold text-slate-700">{item.label}</div>
                        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${item.tone}`} style={{ width: item.value }} />
                        </div>
                        <div className="text-right">
                            <div className="text-sm font-semibold text-slate-950">{item.value}</div>
                            <div className="text-[11px] font-medium text-slate-500">{item.amount}</div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function RiskMatrix() {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold text-slate-950">SEE / 리스크 매트릭스</h2>
                    <p className="mt-1 text-sm text-slate-500">고배출 품목과 누락 리스크를 동시에 탐색</p>
                </div>
                <Gauge className="h-5 w-5 text-teal-700" />
            </div>
            <div className="relative mt-5 h-72 rounded-2xl border border-slate-200 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:25%_25%]">
                {[
                    ['철강', 'left-[64%] top-[43%] h-20 w-20 bg-slate-950'],
                    ['알루미늄', 'left-[52%] top-[18%] h-16 w-16 bg-teal-700'],
                    ['비료', 'left-[28%] top-[55%] h-14 w-14 bg-emerald-700'],
                    ['수소', 'left-[74%] top-[16%] h-12 w-12 bg-amber-600'],
                ].map(([label, className]) => (
                    <div key={label} className={`absolute grid place-items-center rounded-full text-xs font-semibold text-white shadow-lg ring-4 ring-white ${className}`}>
                        {label}
                    </div>
                ))}
                <div className="absolute bottom-3 left-4 text-xs font-semibold text-slate-500">낮은 SEE</div>
                <div className="absolute bottom-3 right-4 text-xs font-semibold text-slate-500">높은 SEE</div>
                <div className="absolute left-4 top-3 text-xs font-semibold text-slate-500">높은 리스크</div>
            </div>
        </section>
    );
}

function ProductTable() {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.06)] xl:col-span-2">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-base font-semibold text-slate-950">품목 리스트</h2>
                    <p className="mt-1 text-sm text-slate-500">CN 코드, 생산량, SEE, 검토 상태를 테이블에서 비교</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <label className="flex min-h-10 min-w-[240px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                        <Search className="mr-2 h-4 w-4 text-slate-400" />
                        <input className="w-full bg-transparent outline-none placeholder:text-slate-400" placeholder="품목명 또는 CN 코드 검색" />
                    </label>
                    <button className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
                        <Filter className="mr-2 h-4 w-4" />
                        필터
                    </button>
                    <button className="inline-flex min-h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
                        <PackagePlus className="mr-2 h-4 w-4" />
                        품목 추가
                    </button>
                </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                            <th className="px-4 py-3">품목</th>
                            <th className="px-4 py-3">CN 코드</th>
                            <th className="px-4 py-3">생산량</th>
                            <th className="px-4 py-3">SEE</th>
                            <th className="px-4 py-3">준비율</th>
                            <th className="px-4 py-3">상태</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {products.map((product) => (
                            <tr key={product.cn} className="transition hover:bg-slate-50">
                                <td className="px-4 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-10 w-1.5 rounded-full ${product.tone}`} />
                                        <div className="min-w-0">
                                            <div className="font-semibold text-slate-950">{product.name}</div>
                                            <div className="mt-1 text-xs text-slate-500">{product.group}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-4 font-mono text-sm text-slate-700">{product.cn}</td>
                                <td className="px-4 py-4 text-slate-700">{product.output}</td>
                                <td className="px-4 py-4 font-semibold text-slate-950">{product.see} tCO2e/t</td>
                                <td className="px-4 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                                            <div className="h-full rounded-full bg-teal-700" style={{ width: `${product.readiness}%` }} />
                                        </div>
                                        <span className="text-xs font-semibold text-slate-600">{product.readiness}%</span>
                                    </div>
                                </td>
                                <td className="px-4 py-4">
                                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${riskClass(product.risk)}`}>
                                        {product.risk}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function SetupRail() {
    return (
        <aside className="rounded-[28px] border border-slate-800 bg-slate-950 p-4 text-white shadow-[0_28px_80px_rgba(15,23,42,0.24)] xl:sticky xl:top-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-200">Guided setup</p>
                <h2 className="mt-1 text-xl font-semibold">품목 등록 흐름</h2>
                <div className="mt-4 rounded-2xl bg-white p-4 text-slate-950">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold">Cold Rolled Steel Sheet</div>
                            <div className="mt-1 font-mono text-xs text-slate-500">CN 7209 16 90</div>
                        </div>
                        <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800">84%</span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full w-[84%] rounded-full bg-teal-700" />
                    </div>
                </div>
            </div>

            <div className="mt-4 space-y-3">
                {steps.map((step, index) => {
                    const active = index === 2;

                    return (
                        <div
                            key={step.label}
                            className={`rounded-2xl p-3 ring-1 ${
                                step.done
                                    ? 'bg-white/[0.08] text-white ring-white/10'
                                    : active
                                      ? 'bg-white text-slate-950 ring-white'
                                      : 'bg-white/[0.04] text-slate-300 ring-white/10'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${step.done ? 'bg-teal-300 text-slate-950' : active ? 'bg-slate-950 text-white' : 'bg-white/10 text-slate-300'}`}>
                                    {step.done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                                </div>
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold">{step.label}</div>
                                    <div className={active ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs opacity-70'}>{step.detail}</div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-4 rounded-2xl bg-white p-4 text-slate-950">
                <div className="text-sm font-semibold">빠른 입력</div>
                <div className="mt-3 space-y-3">
                    <label className="block">
                        <span className="text-[11px] font-semibold text-slate-500">품목군</span>
                        <select className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none" defaultValue="steel">
                            <option value="steel">철강</option>
                            <option value="aluminium">알루미늄</option>
                            <option value="fertilizer">비료</option>
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-[11px] font-semibold text-slate-500">생산공정</span>
                        <div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
                            <Factory className="mr-2 h-4 w-4 text-slate-500" />
                            Rolling Line A
                        </div>
                    </label>
                    <label className="block">
                        <span className="text-[11px] font-semibold text-slate-500">전구물질</span>
                        <div className="mt-1 flex items-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                            <Link2 className="mr-2 h-4 w-4 text-amber-700" />
                            열연 코일 연결 필요
                        </div>
                    </label>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] px-3 text-sm font-semibold text-white transition hover:bg-white/[0.1]">
                    미리보기
                </button>
                <button className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-300 px-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-200">
                    로컬 저장
                </button>
            </div>
        </aside>
    );
}

function MappingTable() {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold text-slate-950">품목 데이터 매핑</h2>
                    <p className="mt-1 text-sm text-slate-500">생산공정, 전구물질, 고지서 데이터 연결 상태</p>
                </div>
                <Layers3 className="h-5 w-5 text-teal-700" />
            </div>
            <div className="mt-5 space-y-2">
                {mappings.map(([name, type, detail, status]) => (
                    <div key={name} className="grid grid-cols-[minmax(0,1fr)_82px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-slate-950">{name}</span>
                                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">{type}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{detail}</div>
                        </div>
                        <span className={`justify-self-end rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${statusClass(status)}`}>{status}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

function CnRecommendations() {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold text-slate-950">CN 코드 추천</h2>
                    <p className="mt-1 text-sm text-slate-500">품목명과 업종 기준으로 후보 코드를 좁혀 보여주는 입력 UX</p>
                </div>
                <Tag className="h-5 w-5 text-slate-700" />
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                {[
                    ['7209 16 90', '철/비합금강 평판압연', '일치도 94%'],
                    ['7210 49 00', '도금 강판', '일치도 81%'],
                    ['7225 50 80', '기타 합금강', '검토 필요'],
                ].map(([cn, label, confidence]) => (
                    <div key={cn} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="font-mono text-sm font-semibold text-slate-950">{cn}</div>
                        <div className="mt-2 text-sm font-semibold text-slate-700">{label}</div>
                        <div className="mt-3 inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                            {confidence}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

export default function ProductPreviewPage() {
    return (
        <main className="min-h-screen bg-[#F5F7F4] p-4 text-slate-950 sm:p-6">
            <div className="mx-auto max-w-[1780px] space-y-5">
                <Header />

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
                    <div className="min-w-0 space-y-4">
                        <SummaryCards />

                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                            <PortfolioPanel />
                            <RiskMatrix />
                        </div>

                        <ProductTable />

                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                            <MappingTable />
                            <CnRecommendations />
                        </div>
                    </div>

                    <SetupRail />
                </section>

                <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                                <CircleDot className="h-4 w-4 text-teal-700" />
                                품목관리 프리뷰 전용 화면
                            </div>
                            <p className="mt-1 break-words text-sm leading-6 text-slate-600">
                                실제 `/products` 저장 로직과 분리된 디자인 검토용 화면입니다. 확정되면 현재 품목 관리 페이지의 테이블/폼/검토 UX에 나누어 적용할 수 있습니다.
                            </p>
                        </div>
                        <Link
                            href="/cockpit-preview"
                            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                        >
                            Cockpit으로 돌아가기
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </div>
                </section>
            </div>
        </main>
    );
}
