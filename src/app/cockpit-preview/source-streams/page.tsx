import type { Metadata } from 'next';
import { AlertTriangle, CheckCircle2, Factory, FileInput, Flame, Gauge, Link2, Zap } from 'lucide-react';
import { PreviewPanel, PreviewShell, PrimaryButton, SecondaryButton, StatusPill } from '../preview-shell';

export const metadata: Metadata = {
    title: 'Emission Sources Preview',
    description: 'Beginner-friendly emission source management preview for CBAM Local.',
};

const sourceCards = [
    ['전기', '1,012.4', '45.7%', 'Scope 2', '증빙 완료', 'bg-[#276752]'],
    ['도시가스', '612.3', '27.6%', 'Scope 1', '검토 필요', 'bg-[#3B8A82]'],
    ['공정 배출', '341.2', '15.4%', 'Scope 1', '계산 완료', 'bg-[#426A8C]'],
    ['원료 투입', '178.6', '8.1%', '전구물질', '매핑 필요', 'bg-[#80633C]'],
];

const factorRows = [
    ['전기', '0.000466', 'tCO₂e/kWh', '한국전력 2026', '적용'],
    ['도시가스', '0.002176', 'tCO₂e/Nm³', 'ISO 14064-1', '확인 필요'],
    ['LNG', '2.750000', 'tCO₂e/t', 'EU Guidance', '적용'],
    ['스크랩', '-', '-', '공급사 자료', '매핑 필요'],
];

const months = ['11', '12', '01', '02', '03', '04', '05'];
const monthly = [68, 76, 84, 72, 88, 63, 79];

export default function SourceStreamsPreviewPage() {
    return (
        <PreviewShell
            activeHref="/cockpit-preview/source-streams"
            title="배출량 관리"
            subtitle="고지서, 연료, 공정, 전구물질 데이터를 배출원별로 한눈에 정리합니다."
            actions={
                <>
                    <SecondaryButton>
                        <FileInput className="mr-2 h-4 w-4" />
                        원자료 가져오기
                    </SecondaryButton>
                    <PrimaryButton>
                        <Gauge className="mr-2 h-4 w-4" />
                        배출량 계산
                    </PrimaryButton>
                </>
            }
        >
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
                {sourceCards.map(([name, value, share, scope, status, color]) => (
                    <article key={name} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                        <div className={`${color} p-4 text-white`}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-lg font-bold">{name}</div>
                                    <div className="mt-3 text-3xl font-semibold">{value}</div>
                                    <div className="mt-1 text-sm font-bold opacity-85">tCO₂e · {share}</div>
                                </div>
                                {name === '전기' ? <Zap className="h-8 w-8 opacity-80" /> : name === '도시가스' ? <Flame className="h-8 w-8 opacity-80" /> : <Factory className="h-8 w-8 opacity-80" />}
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-4">
                            <span className="text-sm font-bold text-slate-600">{scope}</span>
                            <StatusPill tone={status === '검토 필요' || status === '매핑 필요' ? 'warning' : 'success'}>{status}</StatusPill>
                        </div>
                    </article>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
                <PreviewPanel title="월별 배출량 추이" subtitle="초보자는 튀는 달만 확인하면 됩니다.">
                    <div className="flex h-[260px] items-end gap-5 border-b border-l border-slate-200 px-5 pb-8">
                        {monthly.map((value, index) => (
                            <div key={months[index]} className="flex flex-1 flex-col items-center justify-end">
                                <div className="w-full max-w-12 rounded-t-lg bg-[#276752]" style={{ height: `${value * 2}px` }} />
                                <div className="mt-3 text-xs font-bold text-slate-500">2025-{months[index]}</div>
                            </div>
                        ))}
                    </div>
                </PreviewPanel>

                <PreviewPanel title="검토가 필요한 항목" subtitle="우선순위 높은 순서">
                    <div className="space-y-3">
                        {[
                            ['도시가스 배출계수', '출처 확인 필요', 'warning'],
                            ['스크랩 전구물질', '공급사 SEE 누락', 'danger'],
                            ['4월 전기 고지서', '증빙 연결 완료', 'success'],
                        ].map(([title, detail, tone]) => (
                            <div key={title} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                {tone === 'success' ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <AlertTriangle className="h-5 w-5 text-amber-700" />}
                                <div className="min-w-0 flex-1">
                                    <div className="font-bold text-slate-950">{title}</div>
                                    <div className="mt-1 text-xs font-semibold text-slate-500">{detail}</div>
                                </div>
                                <StatusPill tone={tone as 'success' | 'warning' | 'danger'}>{tone === 'success' ? '완료' : '확인'}</StatusPill>
                            </div>
                        ))}
                    </div>
                </PreviewPanel>
            </div>

            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
                <PreviewPanel title="배출계수 적용 테이블" subtitle="계수와 단위를 한 줄에서 확인합니다.">
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">배출원</th>
                                    <th className="px-4 py-3">계수</th>
                                    <th className="px-4 py-3">단위</th>
                                    <th className="px-4 py-3">출처</th>
                                    <th className="px-4 py-3">상태</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {factorRows.map(([source, factor, unit, basis, status]) => (
                                    <tr key={source}>
                                        <td className="px-4 py-3 font-bold text-slate-900">{source}</td>
                                        <td className="px-4 py-3 font-mono text-slate-700">{factor}</td>
                                        <td className="px-4 py-3 text-slate-700">{unit}</td>
                                        <td className="px-4 py-3 text-slate-700">{basis}</td>
                                        <td className="px-4 py-3"><StatusPill tone={status === '적용' ? 'success' : 'warning'}>{status}</StatusPill></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </PreviewPanel>

                <PreviewPanel title="데이터 연결 지도" subtitle="입력값이 어디에 쓰이는지 보여줍니다.">
                    <div className="space-y-3">
                        {[
                            ['고지서', '사용량', '배출량 계산'],
                            ['계수 라이브러리', '배출계수', 'SEE 산정'],
                            ['공급사 자료', '전구물질 SEE', 'EU Communication'],
                        ].map(([from, mid, to]) => (
                            <div key={from} className="grid grid-cols-[1fr_32px_1fr_32px_1fr] items-center gap-2 text-center text-xs font-bold text-slate-600">
                                <div className="rounded-xl bg-slate-50 px-2 py-3">{from}</div>
                                <Link2 className="h-4 w-4 justify-self-center text-teal-700" />
                                <div className="rounded-xl bg-teal-50 px-2 py-3 text-teal-900">{mid}</div>
                                <Link2 className="h-4 w-4 justify-self-center text-teal-700" />
                                <div className="rounded-xl bg-slate-50 px-2 py-3">{to}</div>
                            </div>
                        ))}
                    </div>
                </PreviewPanel>
            </div>
        </PreviewShell>
    );
}
