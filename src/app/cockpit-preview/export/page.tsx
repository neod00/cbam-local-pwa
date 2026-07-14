import type { Metadata } from 'next';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileText, Send, ShieldCheck } from 'lucide-react';
import { PreviewPanel, PreviewShell, PrimaryButton, SecondaryButton, StatusPill } from '../preview-shell';

export const metadata: Metadata = {
    title: 'Report Export Preview',
    description: 'Beginner-friendly report and EU Communication export preview for CBAM Local.',
};

const reportCards = [
    ['보고 준비율', '78%', '필수 항목 122개 중 95개 준비', 'info'],
    ['Export 오류', '2건', '생성 전 해결 필요', 'danger'],
    ['증빙 연결', '74%', '고지서/계수 파일 연결률', 'warning'],
    ['로컬 백업', '완료', '내보내기 전 백업 가능', 'success'],
];

const templateRows = [
    ['Installations', '사업장/공정 정보', '완료'],
    ['Products', 'CN 코드/생산량/SEE', '검토'],
    ['Emissions', 'Scope 1/2 배출량', '완료'],
    ['Precursors', '구매 전구물질', '보완'],
    ['Summary', '수입자 전달 요약', '대기'],
];

const timeline = [
    ['데이터 검증', '2건 보완 필요', '진행 중'],
    ['EU 템플릿 매핑', '필드 95개 연결', '완료'],
    ['Excel 복사본 생성', '로컬 파일로 생성', '대기'],
    ['내보내기', '수입자 전달용 파일', '대기'],
];

export default function ExportPreviewPage() {
    return (
        <PreviewShell
            activeHref="/cockpit-preview/export"
            title="보고서 / EU Communication"
            subtitle="제출 가능한 상태인지 보고, 필요한 파일을 로컬에서 생성하는 화면입니다."
            actions={
                <>
                    <SecondaryButton>
                        <FileText className="mr-2 h-4 w-4" />
                        미리보기
                    </SecondaryButton>
                    <PrimaryButton>
                        <Download className="mr-2 h-4 w-4" />
                        내보내기
                    </PrimaryButton>
                </>
            }
        >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {reportCards.map(([label, value, helper, tone]) => (
                    <article key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="text-sm font-bold text-slate-500">{label}</div>
                                <div className="mt-3 text-4xl font-semibold text-slate-950">{value}</div>
                                <p className="mt-2 text-xs font-semibold text-slate-500">{helper}</p>
                            </div>
                            {tone === 'success' ? <CheckCircle2 className="h-7 w-7 text-emerald-700" /> : tone === 'danger' ? <AlertTriangle className="h-7 w-7 text-red-700" /> : <FileSpreadsheet className="h-7 w-7 text-teal-700" />}
                        </div>
                    </article>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
                <PreviewPanel title="EU Communication 매핑 상태" subtitle="복잡한 템플릿 시트를 쉬운 이름으로 보여줍니다.">
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">템플릿 영역</th>
                                    <th className="px-4 py-3">앱 데이터</th>
                                    <th className="px-4 py-3">상태</th>
                                    <th className="px-4 py-3">다음 행동</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {templateRows.map(([sheet, data, status]) => (
                                    <tr key={sheet}>
                                        <td className="px-4 py-3 font-bold text-slate-900">{sheet}</td>
                                        <td className="px-4 py-3 text-slate-700">{data}</td>
                                        <td className="px-4 py-3">
                                            <StatusPill tone={status === '완료' ? 'success' : status === '보완' ? 'warning' : status === '검토' ? 'info' : 'neutral'}>{status}</StatusPill>
                                        </td>
                                        <td className="px-4 py-3 text-xs font-bold text-teal-800">{status === '완료' ? '확인 완료' : '상세 보기'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </PreviewPanel>

                <PreviewPanel title="생성 단계" subtitle="초보자는 위에서 아래로 따라가면 됩니다.">
                    <div className="space-y-3">
                        {timeline.map(([title, detail, status], index) => (
                            <div key={title} className={`rounded-xl border p-4 ${index === 0 ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${status === '완료' ? 'bg-emerald-600 text-white' : index === 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                        {status === '완료' ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-950">{title}</div>
                                        <div className="mt-1 text-xs font-semibold text-slate-500">{detail}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </PreviewPanel>
            </div>

            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
                <PreviewPanel title="수입자 전달용 요약" subtitle="담당자가 파일을 열기 전에 핵심만 확인합니다.">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {[
                            ['총 CBAM 배출량', '2,216.7', 'tCO₂e'],
                            ['평균 SEE', '2.41', 'tCO₂e/t'],
                            ['보고 품목', '8', 'CN 코드'],
                        ].map(([label, value, unit]) => (
                            <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <div className="text-xs font-bold text-slate-500">{label}</div>
                                <div className="mt-2 text-3xl font-semibold text-slate-950">{value}</div>
                                <div className="mt-1 text-xs font-bold text-slate-500">{unit}</div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                        Export 오류 2건을 해결하면 수입자 전달용 Excel 파일을 생성할 수 있습니다.
                    </div>
                </PreviewPanel>

                <PreviewPanel title="내보내기 옵션" subtitle="민감 데이터는 로컬에서만 처리합니다.">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {[
                            ['EU Communication Excel', '공식 템플릿 복사본 생성', FileSpreadsheet],
                            ['검증 리포트 PDF', '내부 검토용 요약 생성', ShieldCheck],
                            ['수입자 전달 패키지', 'Excel + 증빙 목록 압축', Send],
                        ].map(([title, detail, Icon]) => (
                            <button key={title as string} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:bg-white">
                                <Icon className="h-6 w-6 text-teal-700" />
                                <div className="mt-3 font-bold text-slate-950">{title as string}</div>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{detail as string}</p>
                            </button>
                        ))}
                    </div>
                </PreviewPanel>
            </div>
        </PreviewShell>
    );
}
