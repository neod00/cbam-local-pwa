import type { Metadata } from 'next';
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, FileWarning, ShieldCheck } from 'lucide-react';
import { PreviewPanel, PreviewShell, PrimaryButton, SecondaryButton, StatusPill } from '../preview-shell';

export const metadata: Metadata = {
    title: 'Validation Preview',
    description: 'Beginner-friendly validation and quality preview for CBAM Local.',
};

const issueCards = [
    ['긴급', '2건', '보고서 생성 전 반드시 해결', 'danger'],
    ['검토 필요', '5건', '계수/증빙 확인 필요', 'warning'],
    ['자동 통과', '28건', '규칙 검사를 통과함', 'success'],
    ['대기', '3건', '입력 완료 후 검사 가능', 'neutral'],
];

const issues = [
    ['전기 사용량 2025-01', 'EU CBAM Annex I', '고지서 증빙 누락', '긴급'],
    ['천연가스 배출계수', 'ISO 14064-1', '계수 출처 확인 필요', '검토'],
    ['스크랩 원료 중량', 'EU Guidance', '단위 보완 필요', '검토'],
    ['데이터 품질 지표', 'EU Guidance', '자동 검사 통과', '완료'],
    ['검증 계획 제출', 'EU Guidance', '마감일 임박', '긴급'],
];

const heatmap = [
    ['품목', [100, 100, 100, 75, 75]],
    ['공정', [100, 75, 75, 75, 50]],
    ['고지서', [100, 100, 50, 50, 25]],
    ['계수', [75, 75, 50, 50, 25]],
    ['증빙', [100, 75, 75, 50, 0]],
] as const;

function cellClass(value: number) {
    if (value >= 100) return 'bg-[#276752]';
    if (value >= 75) return 'bg-[#70B59D]';
    if (value >= 50) return 'bg-[#F2D46A]';
    if (value >= 25) return 'bg-[#E89A64]';
    return 'bg-slate-100';
}

export default function ValidationPreviewPage() {
    return (
        <PreviewShell
            activeHref="/cockpit-preview/validation"
            title="검증 및 품질"
            subtitle="초보자가 막히지 않도록 문제 항목을 우선순위와 다음 행동으로 정리합니다."
            actions={
                <>
                    <SecondaryButton>
                        <ClipboardCheck className="mr-2 h-4 w-4" />
                        자동 검사 실행
                    </SecondaryButton>
                    <PrimaryButton>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        해결 항목 검토
                    </PrimaryButton>
                </>
            }
        >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {issueCards.map(([label, value, helper, tone]) => (
                    <article key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="text-sm font-bold text-slate-500">{label}</div>
                                <div className="mt-3 text-4xl font-semibold text-slate-950">{value}</div>
                                <p className="mt-2 text-xs font-semibold text-slate-500">{helper}</p>
                            </div>
                            {tone === 'success' ? <CheckCircle2 className="h-7 w-7 text-emerald-700" /> : <AlertTriangle className="h-7 w-7 text-amber-700" />}
                        </div>
                    </article>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
                <PreviewPanel title="검증 큐" subtitle="가장 먼저 처리할 항목부터 보여줍니다.">
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">항목</th>
                                    <th className="px-4 py-3">기준</th>
                                    <th className="px-4 py-3">문제</th>
                                    <th className="px-4 py-3">상태</th>
                                    <th className="px-4 py-3">다음 행동</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {issues.map(([item, basis, problem, status]) => (
                                    <tr key={item}>
                                        <td className="px-4 py-3 font-bold text-slate-900">{item}</td>
                                        <td className="px-4 py-3 text-slate-600">{basis}</td>
                                        <td className="px-4 py-3 text-slate-700">{problem}</td>
                                        <td className="px-4 py-3">
                                            <StatusPill tone={status === '완료' ? 'success' : status === '긴급' ? 'danger' : 'warning'}>{status}</StatusPill>
                                        </td>
                                        <td className="px-4 py-3">
                                            <button className="inline-flex items-center text-xs font-bold text-teal-800">
                                                수정하기
                                                <ArrowRight className="ml-1 h-3.5 w-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </PreviewPanel>

                <PreviewPanel title="오늘 해결하면 좋은 일" subtitle="초보자용 짧은 할 일">
                    <div className="space-y-3">
                        {[
                            ['증빙 누락 2건 해결', '고지서 파일만 연결하면 됩니다.', 'danger'],
                            ['계수 출처 확인', '자동 추천 계수의 출처를 선택하세요.', 'warning'],
                            ['검증 계획 저장', '제출 전 내부 검토 계획을 남기세요.', 'info'],
                        ].map(([title, detail, tone]) => (
                            <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex items-start gap-3">
                                    <FileWarning className={`mt-0.5 h-5 w-5 ${tone === 'danger' ? 'text-red-700' : 'text-amber-700'}`} />
                                    <div>
                                        <div className="font-bold text-slate-950">{title}</div>
                                        <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </PreviewPanel>
            </div>

            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
                <PreviewPanel title="데이터 품질 히트맵" subtitle="어느 데이터 영역이 부족한지 색으로 확인합니다.">
                    <div className="mb-3 grid grid-cols-[90px_repeat(5,1fr)] gap-1 text-center text-xs font-bold text-slate-500">
                        <span />
                        {['품목', '공정', '고지서', '계수', '증빙'].map((label) => <span key={label}>{label}</span>)}
                    </div>
                    <div className="space-y-1">
                        {heatmap.map(([label, values]) => (
                            <div key={label} className="grid grid-cols-[90px_repeat(5,1fr)] gap-1">
                                <div className="py-2 text-xs font-bold text-slate-600">{label}</div>
                                {values.map((value, index) => <div key={`${label}-${index}`} className={`h-10 rounded-sm ${cellClass(value)}`} />)}
                            </div>
                        ))}
                    </div>
                </PreviewPanel>

                <PreviewPanel title="검증 흐름" subtitle="앱이 사용자를 다음 단계로 안내합니다.">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                        {[
                            ['1', '자동 검사', '누락/단위/계수 검사'],
                            ['2', '문제 큐', '긴급도별 정렬'],
                            ['3', '사용자 수정', '해당 입력 화면으로 이동'],
                            ['4', '보고 준비', 'Export 가능 상태 확인'],
                        ].map(([number, title, text]) => (
                            <div key={number} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-sm font-bold text-teal-800 ring-1 ring-teal-200">{number}</div>
                                <div className="mt-4 font-bold text-slate-950">{title}</div>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
                            </div>
                        ))}
                    </div>
                </PreviewPanel>
            </div>
        </PreviewShell>
    );
}
