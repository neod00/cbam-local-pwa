import type { Metadata } from 'next';
import { BarChart3, CheckCircle2, Paperclip, Save, ScanLine, Upload } from 'lucide-react';
import { PreviewPanel, PreviewShell, PrimaryButton, SecondaryButton, StatusPill } from '../preview-shell';

export const metadata: Metadata = {
    title: 'Bill Entry Preview',
    description: 'Beginner-friendly bill entry preview for CBAM Local.',
};

const extractedFields = [
    ['청구 기간', '2025-04-01 ~ 2025-04-30', '완료'],
    ['사용량', '1,245,600 kWh', '완료'],
    ['고객번호', 'POH-24091', '완료'],
    ['배출계수', '0.000466 tCO₂e/kWh', '확인 필요'],
];

const rows = [
    ['전기 사용량', '1,245,600', 'kWh', '0.000466', '자동 인식'],
    ['기본 요금', '12,540,000', 'KRW', '-', '참고'],
    ['피크 사용량', '3,420', 'kW', '-', '참고'],
];

function BillPreview() {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="rounded-xl bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                    <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Electricity Bill</div>
                        <div className="mt-1 text-2xl font-bold text-slate-950">전기요금 고지서</div>
                    </div>
                    <StatusPill tone="info">자동 인식 92%</StatusPill>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    {extractedFields.map(([label, value, status]) => (
                        <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="text-xs font-bold text-slate-500">{label}</div>
                            <div className="mt-2 font-bold text-slate-950">{value}</div>
                            <div className="mt-3">
                                <StatusPill tone={status === '완료' ? 'success' : 'warning'}>{status}</StatusPill>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-5 space-y-2">
                    {['청구 기간', '사용량', '단위', '계약전력'].map((label, index) => (
                        <div key={label} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                            <span className={`h-3 w-3 rounded-full ${index < 3 ? 'bg-emerald-600' : 'bg-amber-500'}`} />
                            <span className="text-xs font-bold text-slate-500">{label}</span>
                            <span className="ml-auto text-xs font-semibold text-slate-400">문서 위치 #{index + 1}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function EntryStepper() {
    const steps = [
        ['1', '파일 확인', '완료'],
        ['2', '항목 매핑', '완료'],
        ['3', '데이터 확인', '진행 중'],
        ['4', '저장 및 검증', '대기'],
    ];

    return (
        <div className="space-y-3">
            {steps.map(([number, label, status], index) => (
                <div key={label} className={`rounded-xl border p-4 ${index === 2 ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${index < 2 ? 'bg-emerald-600 text-white' : index === 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            {index < 2 ? <CheckCircle2 className="h-5 w-5" /> : number}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-950">{label}</div>
                            <div className="mt-1 text-xs font-semibold text-slate-500">{status}</div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function BillsPreviewPage() {
    return (
        <PreviewShell
            activeHref="/cockpit-preview/bills"
            title="고지서 입력"
            subtitle="고지서를 보면서 필요한 탄소 데이터만 확인하고 저장하는 단계형 입력 화면입니다."
            actions={
                <>
                    <SecondaryButton>
                        <Upload className="mr-2 h-4 w-4" />
                        고지서 업로드
                    </SecondaryButton>
                    <PrimaryButton>
                        <Save className="mr-2 h-4 w-4" />
                        로컬 저장
                    </PrimaryButton>
                </>
            }
        >
            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.8fr)]">
                <PreviewPanel title="고지서 미리보기" subtitle="문서에서 자동 추출한 값만 강조해서 보여줍니다." action={<StatusPill tone="info">PDF 1개</StatusPill>}>
                    <BillPreview />
                </PreviewPanel>

                <PreviewPanel title="입력 진행" subtitle="초보자는 현재 단계만 보면 됩니다.">
                    <EntryStepper />
                    <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                        <div className="text-xs font-bold text-blue-700">현재 단계</div>
                        <div className="mt-1 text-lg font-bold text-slate-950">데이터 확인</div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">사용량과 배출계수만 확인하면 예상 배출량이 자동 계산됩니다.</p>
                    </div>
                </PreviewPanel>
            </div>

            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
                <PreviewPanel title="추출 데이터 테이블" subtitle="긴 폼 대신 표에서 필요한 값만 수정합니다.">
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">항목</th>
                                    <th className="px-4 py-3">값</th>
                                    <th className="px-4 py-3">단위</th>
                                    <th className="px-4 py-3">배출계수</th>
                                    <th className="px-4 py-3">상태</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rows.map(([item, value, unit, factor, status]) => (
                                    <tr key={item}>
                                        <td className="px-4 py-3 font-bold text-slate-900">{item}</td>
                                        <td className="px-4 py-3 text-slate-700">{value}</td>
                                        <td className="px-4 py-3 text-slate-700">{unit}</td>
                                        <td className="px-4 py-3 text-slate-700">{factor}</td>
                                        <td className="px-4 py-3"><StatusPill tone={status === '자동 인식' ? 'success' : 'neutral'}>{status}</StatusPill></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </PreviewPanel>

                <PreviewPanel title="계산 미리보기" subtitle="저장 전 바로 확인">
                    <div className="rounded-2xl bg-[#0F3D2E] p-5 text-white">
                        <div className="text-sm font-semibold opacity-80">예상 배출량</div>
                        <div className="mt-2 text-4xl font-bold">572.3</div>
                        <div className="mt-1 text-sm font-semibold opacity-75">tCO₂e</div>
                    </div>
                    <div className="mt-4 space-y-3 text-sm">
                        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
                            <span className="flex items-center gap-2 font-semibold text-slate-700"><BarChart3 className="h-4 w-4 text-teal-700" />Scope 2</span>
                            <span className="font-bold text-slate-950">100%</span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
                            <span className="flex items-center gap-2 font-semibold text-slate-700"><Paperclip className="h-4 w-4 text-teal-700" />증빙 연결</span>
                            <span className="font-bold text-emerald-700">완료</span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
                            <span className="flex items-center gap-2 font-semibold text-slate-700"><ScanLine className="h-4 w-4 text-teal-700" />추출 신뢰도</span>
                            <span className="font-bold text-slate-950">92%</span>
                        </div>
                    </div>
                </PreviewPanel>
            </div>

            <PreviewPanel title="초보자용 다음 행동" subtitle="다음에 무엇을 해야 하는지 명확히 보여줍니다.">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {[
                        ['1', '계수 출처 확인', '자동 추천된 배출계수가 맞는지 확인합니다.'],
                        ['2', '예상 배출량 확인', '계산 결과가 고지서와 연결되었는지 봅니다.'],
                        ['3', '로컬 저장', '검증 대기열로 보내고 다음 고지서로 이동합니다.'],
                    ].map(([number, title, text]) => (
                        <div key={number} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-sm font-bold text-teal-800 ring-1 ring-teal-200">{number}</div>
                            <div className="mt-4 font-bold text-slate-950">{title}</div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
                        </div>
                    ))}
                </div>
            </PreviewPanel>
        </PreviewShell>
    );
}
