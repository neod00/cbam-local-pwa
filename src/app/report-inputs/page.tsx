'use client';

import { Button, PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import {
    getLocalSetting,
    listLocalItems,
    REPORT_INPUTS_SETTING_KEY,
    setLocalSetting,
} from '@/lib/local-db';
import type {
    ProductionProcess,
    ReportCarbonPriceRow,
    ReportEvidenceRow,
    ReportInputs,
    ReportRnrRow,
    SourceStream,
} from '@/lib/local-db';
import { Plus, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// 산정보고서(Word)의 11·12·15·16장과 6.1·6.3·7 메타는 산정 데이터로는 알 수 없다.
// 이 화면이 그 값을 받는다. 설계: docs/calculation-report-design.md §8

const inputClass = 'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-500';
const labelClass = 'block text-xs font-semibold text-slate-600';

function emptyInputs(): ReportInputs {
    return { rnr: [], carbon_price: [], evidence: [], transpositions: [], electricity_ef_meta: [] };
}

export default function ReportInputsPage() {
    const [inputs, setInputs] = useState<ReportInputs>(emptyInputs);
    const [sourceStreams, setSourceStreams] = useState<SourceStream[]>([]);
    const [processes, setProcesses] = useState<ProductionProcess[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const [stored, streams, processList] = await Promise.all([
                    getLocalSetting<ReportInputs>(REPORT_INPUTS_SETTING_KEY),
                    listLocalItems('source_streams'),
                    listLocalItems('processes'),
                ]);

                if (cancelled) {
                    return;
                }

                setInputs({ ...emptyInputs(), ...(stored ?? {}) });
                setSourceStreams(streams);
                setProcesses(processList);
            } catch {
                if (!cancelled) {
                    setError('보고서 입력을 불러오지 못했습니다.');
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, []);

    async function handleSave() {
        setError(null);

        try {
            await setLocalSetting(REPORT_INPUTS_SETTING_KEY, inputs);
            setSavedAt(new Date().toLocaleString('ko-KR'));
        } catch {
            setError('저장하지 못했습니다. 브라우저 저장소 상태를 확인하세요.');
        }
    }

    function patch(next: Partial<ReportInputs>) {
        setInputs((current) => ({ ...current, ...next }));
    }

    if (isLoading) {
        return <p className="text-sm text-slate-500">불러오는 중…</p>;
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="산정보고서 입력"
                title="보고서에만 필요한 정보"
                description="산정 데이터로는 알 수 없는 항목입니다. 기지불 탄소가격 해당 여부, 모니터링 관리체계, 증빙 보관처, 원천자료 단위처럼 사람만 아는 정보를 여기서 받아 산정보고서(Word)의 해당 장을 채웁니다."
                actions={
                    <>
                        <Button type="button" onClick={handleSave}>
                            <Save className="mr-2 h-4 w-4" />
                            저장
                        </Button>
                        <Link href="/export">
                            <Button type="button" variant="secondary">Export로 이동</Button>
                        </Link>
                    </>
                }
            />

            {savedAt && <StatusBadge tone="success">저장됨 · {savedAt}</StatusBadge>}
            {error && <StatusBadge tone="danger">{error}</StatusBadge>}

            <SectionCard title="모니터링 계획 (제12장)" description="본 산정을 지배하는 사내 모니터링 방법론 문서입니다. 검증인은 수치보다 이 통제 체계를 먼저 확인합니다.">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <label className="min-w-0">
                        <span className={labelClass}>문서번호</span>
                        <input
                            className={`mt-1 ${inputClass}`}
                            value={inputs.monitoring_plan?.doc_no ?? ''}
                            placeholder="예: HB-CBAM-MP-001"
                            onChange={(event) => patch({ monitoring_plan: { ...inputs.monitoring_plan, doc_no: event.target.value } })}
                        />
                    </label>
                    <label className="min-w-0">
                        <span className={labelClass}>버전</span>
                        <input
                            className={`mt-1 ${inputClass}`}
                            value={inputs.monitoring_plan?.version ?? ''}
                            placeholder="예: v1.0"
                            onChange={(event) => patch({ monitoring_plan: { ...inputs.monitoring_plan, version: event.target.value } })}
                        />
                    </label>
                    <label className="min-w-0">
                        <span className={labelClass}>승인일</span>
                        <input
                            type="date"
                            className={`mt-1 ${inputClass}`}
                            value={inputs.monitoring_plan?.approved_at ?? ''}
                            onChange={(event) => patch({ monitoring_plan: { ...inputs.monitoring_plan, approved_at: event.target.value } })}
                        />
                    </label>
                </div>
                <p className="mt-2 text-xs text-slate-500">승인일이 보고기간 시작일보다 늦으면 보고서 생성 시 경고가 표시됩니다.</p>
            </SectionCard>

            <SectionCard
                title="역할·책임 R&R (제12.1장)"
                description="데이터별로 누가 모으고, 누가 환산하고, 누가 검토·승인하는지 기재합니다."
                actions={
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => patch({ rnr: [...(inputs.rnr ?? []), { data: '', collector: '', transposer: '', approver: '', system: '' }] })}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        행 추가
                    </Button>
                }
            >
                {(inputs.rnr ?? []).length === 0 && <p className="text-sm text-slate-500">아직 입력이 없습니다. 「행 추가」로 시작하세요.</p>}
                <div className="space-y-3">
                    {(inputs.rnr ?? []).map((row, index) => (
                        <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
                            {(['data', 'collector', 'transposer', 'approver', 'system'] as Array<keyof ReportRnrRow>).map((field, fieldIndex) => (
                                <input
                                    key={field}
                                    className={inputClass}
                                    value={row[field]}
                                    placeholder={['데이터', '수집(1차)', '전치·집계', '검토·승인', '시스템'][fieldIndex]}
                                    onChange={(event) => {
                                        const next = [...(inputs.rnr ?? [])];
                                        next[index] = { ...row, [field]: event.target.value };
                                        patch({ rnr: next });
                                    }}
                                />
                            ))}
                            <Button
                                type="button"
                                variant="danger"
                                onClick={() => patch({ rnr: (inputs.rnr ?? []).filter((_, i) => i !== index) })}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </div>
            </SectionCard>

            <SectionCard
                title="기지불 탄소가격 (제11장)"
                description="원산지국에서 이미 낸 탄소가격입니다. 신고인(수입자)이 인증서 차감을 위해 반드시 요구합니다. 배출권거래제 할당대상 여부는 법인 단위로 판단되므로, 사업장 자료만으로 단정하지 말고 확인 후 확정하세요."
                actions={
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => patch({ carbon_price: [...(inputs.carbon_price ?? []), { target: '', applicable: 'TO_CONFIRM', note: '', evidence_status: 'pending' }] })}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        행 추가
                    </Button>
                }
            >
                {(inputs.carbon_price ?? []).length === 0 && <p className="text-sm text-slate-500">비어 있으면 보고서에 「기재 필요」로 표시되고 경고가 뜹니다. 「해당 없음」이라도 사유와 함께 기재하세요.</p>}
                <div className="space-y-3">
                    {(inputs.carbon_price ?? []).map((row, index) => {
                        function update(next: Partial<ReportCarbonPriceRow>) {
                            const rows = [...(inputs.carbon_price ?? [])];
                            rows[index] = { ...row, ...next };
                            patch({ carbon_price: rows });
                        }

                        return (
                            <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,2fr)_minmax(0,0.9fr)_auto]">
                                <input className={inputClass} value={row.target} placeholder="대상 (예: 본 사업장)" onChange={(event) => update({ target: event.target.value })} />
                                <select className={inputClass} value={row.applicable} onChange={(event) => update({ applicable: event.target.value as ReportCarbonPriceRow['applicable'] })}>
                                    <option value="TO_CONFIRM">확인 필요</option>
                                    <option value="YES">해당</option>
                                    <option value="NO">해당 없음</option>
                                </select>
                                <input className={inputClass} value={row.note} placeholder="내용·사유" onChange={(event) => update({ note: event.target.value })} />
                                <select className={inputClass} value={row.evidence_status} onChange={(event) => update({ evidence_status: event.target.value as ReportCarbonPriceRow['evidence_status'] })}>
                                    <option value="pending">미수령</option>
                                    <option value="estimated">추정</option>
                                    <option value="confirmed">확정</option>
                                </select>
                                <Button type="button" variant="danger" onClick={() => patch({ carbon_price: (inputs.carbon_price ?? []).filter((_, i) => i !== index) })}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        );
                    })}
                </div>
            </SectionCard>

            <SectionCard title="원천자료 전치 및 측정 방식 (제6.1·6.3장)" description="청구서 단위(MJ·m³ 등)가 산정 활동자료 단위와 다르면, 검증인이 원천 증빙으로 역추적할 수 있도록 환산 경로를 남겨야 합니다.">
                {sourceStreams.length === 0 && <p className="text-sm text-slate-500">등록된 배출원 자료가 없습니다.</p>}
                <div className="space-y-4">
                    {sourceStreams.map((stream) => {
                        const entry = inputs.transpositions?.find((item) => item.source_stream_id === stream.id) ?? { source_stream_id: stream.id };

                        function update(next: Partial<typeof entry>) {
                            const rows = (inputs.transpositions ?? []).filter((item) => item.source_stream_id !== stream.id);
                            patch({ transpositions: [...rows, { ...entry, ...next }] });
                        }

                        return (
                            <div key={stream.id} className="rounded-xl border border-slate-200 p-3">
                                <p className="text-sm font-semibold text-slate-900">{stream.name}</p>
                                <p className="text-xs text-slate-500">산정 활동자료: {stream.activity_data} {stream.activity_unit}</p>
                                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                                    <input className={inputClass} value={entry.source_quantity ?? ''} placeholder="원천 수치 (예: 4,278,240)" onChange={(event) => update({ source_quantity: event.target.value })} />
                                    <input className={inputClass} value={entry.source_unit ?? ''} placeholder="원천 단위 (예: MJ)" onChange={(event) => update({ source_unit: event.target.value })} />
                                    <input className={inputClass} value={entry.conversion_note ?? ''} placeholder="환산 근거 (예: ÷ 48,000 MJ/t)" onChange={(event) => update({ conversion_note: event.target.value })} />
                                    <input className={inputClass} value={entry.measurement_method ?? ''} placeholder="측정 방식 (예: 정산용 계량기)" onChange={(event) => update({ measurement_method: event.target.value })} />
                                    <input className={inputClass} value={entry.data_quality ?? ''} placeholder="데이터 품질·불확도" onChange={(event) => update({ data_quality: event.target.value })} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </SectionCard>

            <SectionCard title="전력 배출계수 출처 (제7장)" description="공표기관·문서명·공표연도가 없으면 검증인이 계수를 대조할 수 없습니다.">
                {processes.length === 0 && <p className="text-sm text-slate-500">등록된 생산공정이 없습니다.</p>}
                <div className="space-y-4">
                    {processes.map((process) => {
                        const entry = inputs.electricity_ef_meta?.find((item) => item.process_id === process.id) ?? { process_id: process.id };

                        function update(next: Partial<typeof entry>) {
                            const rows = (inputs.electricity_ef_meta ?? []).filter((item) => item.process_id !== process.id);
                            patch({ electricity_ef_meta: [...rows, { ...entry, ...next }] });
                        }

                        return (
                            <div key={process.id} className="rounded-xl border border-slate-200 p-3">
                                <p className="text-sm font-semibold text-slate-900">{process.name}</p>
                                <p className="text-xs text-slate-500">전력 {process.electricity_mwh} MWh · EF {process.electricity_ef_tco2e_per_mwh} tCO2e/MWh</p>
                                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                                    <input className={inputClass} value={entry.publisher ?? ''} placeholder="공표기관" onChange={(event) => update({ publisher: event.target.value })} />
                                    <input className={inputClass} value={entry.document ?? ''} placeholder="문서명" onChange={(event) => update({ document: event.target.value })} />
                                    <input className={inputClass} value={entry.vintage ?? ''} placeholder="공표연도" onChange={(event) => update({ vintage: event.target.value })} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </SectionCard>

            <SectionCard
                title="증빙 목록 (제15장)"
                description="검증인은 이 목록으로 원천자료를 요청합니다."
                actions={
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => patch({ evidence: [...(inputs.evidence ?? []), { item: '', proves: '', custodian: '', status: '확보' }] })}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        행 추가
                    </Button>
                }
            >
                {(inputs.evidence ?? []).length === 0 && <p className="text-sm text-slate-500">아직 입력이 없습니다.</p>}
                <div className="space-y-3">
                    {(inputs.evidence ?? []).map((row, index) => (
                        <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
                            {(['item', 'proves', 'custodian', 'status'] as Array<keyof ReportEvidenceRow>).map((field, fieldIndex) => (
                                <input
                                    key={field}
                                    className={inputClass}
                                    value={row[field]}
                                    placeholder={['증빙', '입증 대상', '보관', '상태'][fieldIndex]}
                                    onChange={(event) => {
                                        const next = [...(inputs.evidence ?? [])];
                                        next[index] = { ...row, [field]: event.target.value };
                                        patch({ evidence: next });
                                    }}
                                />
                            ))}
                            <Button type="button" variant="danger" onClick={() => patch({ evidence: (inputs.evidence ?? []).filter((_, i) => i !== index) })}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </div>
            </SectionCard>

            <SectionCard title="운영자 선언 (제16장)" description="서명은 출력된 문서에 직접 합니다. 선언 문안은 「본인이 아는 범위에서」로 한정되어 있습니다.">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <label className="min-w-0">
                        <span className={labelClass}>성명</span>
                        <input className={`mt-1 ${inputClass}`} value={inputs.declaration?.name ?? ''} onChange={(event) => patch({ declaration: { ...inputs.declaration, name: event.target.value } })} />
                    </label>
                    <label className="min-w-0">
                        <span className={labelClass}>직책</span>
                        <input className={`mt-1 ${inputClass}`} value={inputs.declaration?.position ?? ''} onChange={(event) => patch({ declaration: { ...inputs.declaration, position: event.target.value } })} />
                    </label>
                    <label className="min-w-0">
                        <span className={labelClass}>일자</span>
                        <input type="date" className={`mt-1 ${inputClass}`} value={inputs.declaration?.date ?? ''} onChange={(event) => patch({ declaration: { ...inputs.declaration, date: event.target.value } })} />
                    </label>
                </div>
            </SectionCard>

            <p className="text-xs text-slate-500">입력은 이 기기에만 저장됩니다(로컬). 새 프로젝트를 시작하면 산정 데이터와 함께 지워집니다.</p>
        </div>
    );
}
