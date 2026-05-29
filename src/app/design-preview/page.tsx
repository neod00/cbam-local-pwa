import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    Database,
    Download,
    Factory,
    FileSpreadsheet,
    Gauge,
    HardDrive,
    LockKeyhole,
    PackageCheck,
    ShieldCheck,
    TrendingDown,
    Workflow,
} from 'lucide-react';

const kpis = [
    { label: '보고기간', value: '2026 Q1', detail: '작성 중', icon: Gauge },
    { label: '대상 제품', value: '12', detail: 'HS 72/73', icon: PackageCheck },
    { label: '생산공정', value: '18', detail: '연결 완료 15', icon: Workflow },
    { label: '평균 SEE', value: '1.842', detail: 'tCO2e/t', icon: TrendingDown },
];

const workflow = [
    { label: '사업장', state: '완료', tone: 'emerald' },
    { label: '제품', state: '완료', tone: 'emerald' },
    { label: '공정', state: '검토', tone: 'amber' },
    { label: '전구물질', state: '검토', tone: 'amber' },
    { label: '산정', state: '대기', tone: 'gray' },
    { label: 'EU Export', state: '대기', tone: 'gray' },
];

const rows = [
    {
        process: '전기로 제강 공정',
        product: '철강 반제품',
        route: 'Electric arc furnace',
        output: '4,280.0',
        direct: '0.912',
        indirect: '0.184',
        precursor: '0.426',
        total: '1.522',
        status: '정상',
    },
    {
        process: '압연 및 열처리',
        product: '열연 코일',
        route: 'Rolling and finishing',
        output: '3,940.0',
        direct: '0.486',
        indirect: '0.231',
        precursor: '0.794',
        total: '1.511',
        status: '검토',
    },
    {
        process: '체결부품 가공',
        product: '나사 및 너트',
        route: 'Downstream processing',
        output: '820.0',
        direct: '0.144',
        indirect: '0.108',
        precursor: '1.382',
        total: '1.634',
        status: '검토',
    },
];

const warnings = [
    '압연 및 열처리: 전구물질 SEE 출처 확인 필요',
    '체결부품 가공: 구매 전구물질 소비량과 생산량 비율 검토',
    '2026 Q1: 전력 배출계수 적용 근거 첨부 필요',
];

function StatusPill({ status }: { status: string }) {
    const className =
        status === '정상'
            ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
            : 'bg-amber-50 text-amber-700 ring-amber-600/20';

    return (
        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${className}`}>
            {status}
        </span>
    );
}

function WorkflowStep({ label, state, tone }: { label: string; state: string; tone: string }) {
    const toneClass =
        tone === 'emerald'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : tone === 'amber'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-gray-200 bg-gray-50 text-gray-600';

    return (
        <div className={`min-w-0 rounded-md border px-3 py-2 ${toneClass}`}>
            <div className="truncate text-sm font-semibold">{label}</div>
            <div className="mt-1 text-xs">{state}</div>
        </div>
    );
}

export default function DesignPreviewPage() {
    return (
        <div className="mx-auto max-w-7xl">
            <div className="flex flex-col gap-4 border-b border-gray-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-sm font-semibold text-blue-700">완성 화면 시안</p>
                    <h1 className="mt-1 text-2xl font-bold text-gray-950">CBAM 산정 업무보드</h1>
                    <p className="mt-2 max-w-3xl text-sm text-gray-600">
                        국내 중소·중견기업 담당자가 보고기간별 입력, 검증, 산정, EU 템플릿 Export 상태를
                        한 화면에서 확인하는 운영형 화면입니다.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
                        <HardDrive className="mr-2 h-4 w-4" />
                        로컬 백업
                    </button>
                    <button className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500">
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        EU Export
                    </button>
                </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {kpis.map((item) => (
                    <div key={item.label} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                            <dt className="text-sm font-medium text-gray-500">{item.label}</dt>
                            <item.icon className="h-5 w-5 text-gray-400" />
                        </div>
                        <dd className="mt-3 text-3xl font-semibold text-gray-950">{item.value}</dd>
                        <p className="mt-1 text-xs text-gray-500">{item.detail}</p>
                    </div>
                ))}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                        <div>
                            <h2 className="text-base font-semibold text-gray-950">업무 진행 상태</h2>
                            <p className="mt-1 text-xs text-gray-500">2026 Q1 / 인천 제1공장</p>
                        </div>
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3 xl:grid-cols-6">
                        {workflow.map((step, index) => (
                            <div key={step.label} className="flex min-w-0 items-center gap-3">
                                <WorkflowStep {...step} />
                                {index < workflow.length - 1 && (
                                    <ArrowRight className="hidden h-4 w-4 flex-shrink-0 text-gray-300 xl:block" />
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                        <ShieldCheck className="mt-1 h-5 w-5 text-emerald-600" />
                        <div>
                            <h2 className="text-base font-semibold text-gray-950">데이터 보관 상태</h2>
                            <div className="mt-4 space-y-3 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600">저장 위치</span>
                                    <span className="font-medium text-gray-950">브라우저 로컬 DB</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600">서버 전송</span>
                                    <span className="font-medium text-emerald-700">없음</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600">마지막 백업</span>
                                    <span className="font-medium text-gray-950">2026-05-29</span>
                                </div>
                            </div>
                            <div className="mt-5 grid grid-cols-3 gap-2">
                                <div className="rounded-md bg-gray-50 p-3 text-center">
                                    <Database className="mx-auto h-4 w-4 text-gray-500" />
                                    <div className="mt-1 text-xs text-gray-600">IndexedDB</div>
                                </div>
                                <div className="rounded-md bg-gray-50 p-3 text-center">
                                    <LockKeyhole className="mx-auto h-4 w-4 text-gray-500" />
                                    <div className="mt-1 text-xs text-gray-600">로컬 처리</div>
                                </div>
                                <div className="rounded-md bg-gray-50 p-3 text-center">
                                    <Download className="mx-auto h-4 w-4 text-gray-500" />
                                    <div className="mt-1 text-xs text-gray-600">.cbam</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-gray-950">공정별 산정 결과</h2>
                        <p className="mt-1 text-xs text-gray-500">직접 SEE, 간접 SEE, 전구물질 SEE 분리 표시</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-amber-700">
                        <AlertTriangle className="h-4 w-4" />
                        검토 3건
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">공정</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">제품</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">생산경로</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">생산량(t)</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">직접</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">간접</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">전구물질</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">총 SEE</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">상태</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {rows.map((row) => (
                                <tr key={row.process} className="hover:bg-gray-50">
                                    <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-gray-950">
                                        {row.process}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-600">{row.product}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-600">{row.route}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-gray-600">
                                        {row.output}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-gray-600">
                                        {row.direct}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-gray-600">
                                        {row.indirect}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-gray-600">
                                        {row.precursor}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-gray-950">
                                        {row.total}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-center">
                                        <StatusPill status={row.status} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        <h2 className="text-base font-semibold text-gray-950">검증 큐</h2>
                    </div>
                    <ul className="mt-4 divide-y divide-gray-100">
                        {warnings.map((warning) => (
                            <li key={warning} className="py-3 text-sm text-gray-700">
                                {warning}
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2">
                        <Factory className="h-5 w-5 text-blue-600" />
                        <h2 className="text-base font-semibold text-gray-950">EU 템플릿 Export 상태</h2>
                    </div>
                    <div className="mt-4 space-y-3 text-sm">
                        <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                            <span className="text-gray-600">원본 템플릿 검증</span>
                            <span className="font-medium text-emerald-700">필수 시트 확인</span>
                        </div>
                        <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                            <span className="text-gray-600">데이터 주입 범위</span>
                            <span className="font-medium text-gray-950">D_Processes, E_PurchPrec</span>
                        </div>
                        <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                            <span className="text-gray-600">공식 라벨/수식</span>
                            <span className="font-medium text-emerald-700">유지</span>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
