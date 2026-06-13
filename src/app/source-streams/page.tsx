'use client';

import { ActionItemCard, Button, DataTable, EmptyState, FormSection, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import {
    createLocalItem,
    deleteLocalItem,
    listLocalItems,
    ProductionProcess,
    ReportingPeriod,
    SourceStream,
    updateLocalItem,
} from '@/lib/local-db';
import { calculateSourceStreamEmissions, calculateSourceStreamEnergyBreakdown, getSourceStreamUnitWarnings } from '@/lib/source-stream-calculation';
import { AlertTriangle, ArrowRight, Flame, Gauge, Pencil, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type SourceStreamDraft = Omit<SourceStream, 'id' | 'created_at' | 'updated_at'>;
type SourceStreamErrors = Partial<Record<keyof SourceStreamDraft, string>>;

const emptyDraft: SourceStreamDraft = {
    period_id: '',
    process_id: '',
    name: '',
    stream_type: 'FUEL',
    method: 'Combustion',
    activity_data: 0,
    activity_unit: 't',
    ncv_gj_per_unit: 0,
    emission_factor_tco2e_per_unit: 0,
    oxidation_factor: 1,
    conversion_factor: 1,
    fossil_fraction: 1,
    biomass_fraction: 0,
    source: '',
};

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

const sourceStreamMethods = ['Combustion', 'Process Emissions', 'Mass balance'] as const;
const activityUnits = ['t', 'Nm3'] as const;

function toNumber(value: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
}

function streamTypeLabel(streamType: SourceStream['stream_type']) {
    if (streamType === 'FUEL') {
        return '연료';
    }

    if (streamType === 'PROCESS_MATERIAL') {
        return '공정 원료';
    }

    return '기타';
}

function createSourceStreamValidationErrors(sourceStream: SourceStreamDraft): SourceStreamErrors {
    const nextErrors: SourceStreamErrors = {};

    if (!sourceStream.name.trim()) {
        nextErrors.name = '배출원 이름을 입력하세요.';
    }

    if (!sourceStream.period_id) {
        nextErrors.period_id = '보고기간을 선택하세요.';
    }

    if (!sourceStream.process_id) {
        nextErrors.process_id = '연결할 생산공정을 선택하세요.';
    }

    if (!sourceStreamMethods.includes(sourceStream.method as (typeof sourceStreamMethods)[number])) {
        nextErrors.method = 'EU 템플릿에서 지원하는 산정방법을 선택하세요.';
    }

    if (sourceStream.stream_type === 'FUEL' && sourceStream.method !== 'Combustion') {
        nextErrors.method = '연료 배출원은 Combustion 방식으로 입력하세요.';
    }

    if (sourceStream.stream_type === 'PROCESS_MATERIAL' && sourceStream.method === 'Combustion') {
        nextErrors.method = '공정 원료는 Process Emissions 또는 Mass balance로 입력하세요.';
    }

    if (sourceStream.stream_type === 'OTHER') {
        nextErrors.stream_type = '기타 배출원은 아직 EU Export 대상이 아닙니다. 연료 또는 공정 원료로 분류할 수 있는지 확인하세요.';
    }

    if (sourceStream.activity_data < 0) {
        nextErrors.activity_data = '활동자료는 0 이상이어야 합니다.';
    }

    if (!activityUnits.includes(sourceStream.activity_unit as (typeof activityUnits)[number])) {
        nextErrors.activity_unit = 'EU 템플릿에서 지원하는 활동자료 단위를 선택하세요.';
    }

    if (sourceStream.ncv_gj_per_unit < 0) {
        nextErrors.ncv_gj_per_unit = '순발열량은 0 이상이어야 합니다.';
    }

    if (sourceStream.stream_type === 'FUEL' && sourceStream.ncv_gj_per_unit <= 0) {
        nextErrors.ncv_gj_per_unit = '연료 배출원은 순발열량을 0보다 크게 입력하세요.';
    }

    if (sourceStream.emission_factor_tco2e_per_unit < 0) {
        nextErrors.emission_factor_tco2e_per_unit = '배출계수는 0 이상이어야 합니다.';
    }

    if (sourceStream.stream_type !== 'FUEL' && sourceStream.emission_factor_tco2e_per_unit <= 0) {
        nextErrors.emission_factor_tco2e_per_unit = '공정 원료 배출원은 배출계수를 0보다 크게 입력하세요.';
    }

    if (sourceStream.oxidation_factor < 0 || sourceStream.oxidation_factor > 1) {
        nextErrors.oxidation_factor = '산화계수는 0부터 1 사이로 입력하세요.';
    }

    if (sourceStream.conversion_factor < 0 || sourceStream.conversion_factor > 1) {
        nextErrors.conversion_factor = '전환계수는 0부터 1 사이로 입력하세요.';
    }

    if (sourceStream.fossil_fraction < 0 || sourceStream.fossil_fraction > 1) {
        nextErrors.fossil_fraction = '화석탄소 비율은 0부터 1 사이로 입력하세요.';
    }

    if (sourceStream.biomass_fraction < 0 || sourceStream.biomass_fraction > 1) {
        nextErrors.biomass_fraction = '바이오매스 비율은 0부터 1 사이로 입력하세요.';
    }

    if (sourceStream.fossil_fraction + sourceStream.biomass_fraction > 1) {
        nextErrors.fossil_fraction = '화석탄소 비율과 바이오매스 비율의 합은 1을 넘을 수 없습니다.';
        nextErrors.biomass_fraction = '화석탄소 비율과 바이오매스 비율의 합은 1을 넘을 수 없습니다.';
    }

    if (!sourceStream.source.trim()) {
        nextErrors.source = '출처를 입력하세요. 예: 연료 청구서, 계측기 검침표, 배출계수 근거자료';
    }

    return nextErrors;
}

export default function SourceStreamsPage() {
    const [sourceStreams, setSourceStreams] = useState<SourceStream[]>([]);
    const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
    const [processes, setProcesses] = useState<ProductionProcess[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingSourceStreamId, setEditingSourceStreamId] = useState<string | null>(null);
    const [newItem, setNewItem] = useState<SourceStreamDraft>(emptyDraft);
    const [errors, setErrors] = useState<SourceStreamErrors>({});

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            const [sourceStreamData, periodData, processData] = await Promise.all([
                listLocalItems('source_streams'),
                listLocalItems('periods'),
                listLocalItems('processes'),
            ]);
            const sortedSourceStreams = sourceStreamData.sort((a, b) => b.created_at.localeCompare(a.created_at));
            const editSourceStreamId = new URLSearchParams(window.location.search).get('edit');
            const editSourceStream = editSourceStreamId
                ? sortedSourceStreams.find((item) => item.id === editSourceStreamId)
                : undefined;

            setSourceStreams(sortedSourceStreams);
            setPeriods(periodData.sort((a, b) => b.start_date.localeCompare(a.start_date)));
            setProcesses(processData.sort((a, b) => a.name.localeCompare(b.name)));
            if (editSourceStream) {
                setNewItem({
                    period_id: editSourceStream.period_id ?? '',
                    process_id: editSourceStream.process_id ?? '',
                    name: editSourceStream.name,
                    stream_type: editSourceStream.stream_type,
                    method: editSourceStream.method,
                    activity_data: editSourceStream.activity_data,
                    activity_unit: editSourceStream.activity_unit,
                    ncv_gj_per_unit: editSourceStream.ncv_gj_per_unit,
                    emission_factor_tco2e_per_unit: editSourceStream.emission_factor_tco2e_per_unit,
                    oxidation_factor: editSourceStream.oxidation_factor,
                    conversion_factor: editSourceStream.conversion_factor,
                    fossil_fraction: editSourceStream.fossil_fraction,
                    biomass_fraction: editSourceStream.biomass_fraction,
                    source: editSourceStream.source,
                });
                setEditingSourceStreamId(editSourceStream.id);
                setShowForm(true);
            } else {
                setNewItem({
                    ...emptyDraft,
                    period_id: periodData[0]?.id ?? '',
                    process_id: processData[0]?.id ?? '',
                });
            }
            setLoading(false);
        }

        loadData();
    }, []);

    const periodNames = useMemo(() => new Map(periods.map((period) => [period.id, period.name])), [periods]);
    const processNames = useMemo(() => new Map(processes.map((process) => [process.id, process.name])), [processes]);

    const summary = useMemo(() => {
        const totalEmissions = sourceStreams.reduce((sum, sourceStream) => sum + calculateSourceStreamEmissions(sourceStream), 0);
        const totalEnergy = sourceStreams.reduce((sum, sourceStream) => sum + calculateSourceStreamEnergyBreakdown(sourceStream).total, 0);
        const fuelCount = sourceStreams.filter((sourceStream) => sourceStream.stream_type === 'FUEL').length;
        const unlinkedCount = sourceStreams.filter((sourceStream) => !sourceStream.process_id).length;
        const missingSourceCount = sourceStreams.filter((sourceStream) => !sourceStream.source.trim()).length;
        const unsupportedTypeCount = sourceStreams.filter((sourceStream) => sourceStream.stream_type === 'OTHER').length;
        return { totalEmissions, totalEnergy, fuelCount, missingSourceCount, unlinkedCount, unsupportedTypeCount };
    }, [sourceStreams]);

    function createDefaultDraft(): SourceStreamDraft {
        return {
            ...emptyDraft,
            period_id: periods[0]?.id ?? '',
            process_id: processes[0]?.id ?? '',
        };
    }

    function resetForm() {
        setNewItem(createDefaultDraft());
        setErrors({});
        setEditingSourceStreamId(null);
        setShowForm(false);
    }

    function startNewSourceStream() {
        if (showForm && !editingSourceStreamId) {
            resetForm();
            return;
        }

        setNewItem(createDefaultDraft());
        setEditingSourceStreamId(null);
        setShowForm(true);
    }

    function startEditSourceStream(sourceStream: SourceStream) {
        setNewItem({
            period_id: sourceStream.period_id ?? '',
            process_id: sourceStream.process_id ?? '',
            name: sourceStream.name,
            stream_type: sourceStream.stream_type,
            method: sourceStream.method,
            activity_data: sourceStream.activity_data,
            activity_unit: sourceStream.activity_unit,
            ncv_gj_per_unit: sourceStream.ncv_gj_per_unit,
            emission_factor_tco2e_per_unit: sourceStream.emission_factor_tco2e_per_unit,
            oxidation_factor: sourceStream.oxidation_factor,
            conversion_factor: sourceStream.conversion_factor,
            fossil_fraction: sourceStream.fossil_fraction,
            biomass_fraction: sourceStream.biomass_fraction,
            source: sourceStream.source,
        });
        setErrors({});
        setEditingSourceStreamId(sourceStream.id);
        setShowForm(true);
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        const nextErrors = createSourceStreamValidationErrors(newItem);

        setErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) {
            return;
        }

        const normalizedItem = {
            ...newItem,
            period_id: newItem.period_id || undefined,
            process_id: newItem.process_id || undefined,
            name: newItem.name.trim(),
            method: newItem.method.trim(),
            activity_unit: newItem.activity_unit.trim(),
            source: newItem.source.trim(),
        };

        if (editingSourceStreamId) {
            const existingSourceStream = sourceStreams.find((sourceStream) => sourceStream.id === editingSourceStreamId);

            if (!existingSourceStream) {
                return;
            }

            const updatedSourceStream = await updateLocalItem('source_streams', {
                ...existingSourceStream,
                ...normalizedItem,
            });
            setSourceStreams(
                sourceStreams.map((sourceStream) =>
                    sourceStream.id === updatedSourceStream.id ? updatedSourceStream : sourceStream
                )
            );
            resetForm();
            return;
        }

        const sourceStream = await createLocalItem('source_streams', normalizedItem);
        setSourceStreams([sourceStream, ...sourceStreams]);
        resetForm();
    }

    async function handleDeleteSourceStream(sourceStream: SourceStream) {
        const confirmed = window.confirm(
            `'${sourceStream.name}' 배출원 자료를 삭제할까요? 이 항목은 B_EmInst/C_Emissions&Energy 준비 데이터에서 제외됩니다.`
        );

        if (!confirmed) {
            return;
        }

        await deleteLocalItem('source_streams', sourceStream.id);
        setSourceStreams(sourceStreams.filter((item) => item.id !== sourceStream.id));
        if (editingSourceStreamId === sourceStream.id) {
            resetForm();
        }
    }

    const draftEnergyBreakdown = calculateSourceStreamEnergyBreakdown(newItem);
    const draftUnitWarnings = getSourceStreamUnitWarnings(newItem);

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="B_EmInst / C_Emissions&Energy"
                title="배출원 자료"
                description="연료, 공정 원료, 기타 배출원별 활동자료와 배출계수를 관리합니다. 이 데이터는 EU 원본 템플릿의 B/C 시트 Export 근거로 사용됩니다."
                actions={
                    <Button type="button" onClick={startNewSourceStream}>
                        <Plus className="mr-2 h-4 w-4" />
                        배출원 추가
                    </Button>
                }
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <StatCard label="등록 배출원" value={sourceStreams.length} helper="B_EmInst 후보" icon={Flame} tone="info" />
                <StatCard label="연료 항목" value={summary.fuelCount} helper="연료/에너지 집계 대상" icon={Gauge} tone="warning" />
                <StatCard label="연료 에너지" value={formatNumber(summary.totalEnergy)} helper="TJ" icon={Gauge} tone="info" />
                <StatCard label="추정 배출량" value={formatNumber(summary.totalEmissions)} helper="tCO2e" icon={Flame} tone="success" />
            </div>

            <SectionCard
                title="배출원 자료 다음 작업"
                description="배출원 자료는 직접배출량의 근거입니다. 공정 연결, 출처, EU 템플릿 지원 유형을 먼저 확인하세요."
            >
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <ActionItemCard
                        title="생산공정 연결"
                        description="배출원은 어떤 생산공정의 직접배출 근거인지 연결되어야 Results와 Export에서 함께 검토됩니다."
                        badge={
                            <StatusBadge tone={summary.unlinkedCount > 0 ? 'warning' : 'success'}>
                                {summary.unlinkedCount > 0 ? `${summary.unlinkedCount}건 필요` : '완료'}
                            </StatusBadge>
                        }
                    />
                    <ActionItemCard
                        title="증빙 출처"
                        description="연료 청구서, 계측기 검침표, 배출계수 출처처럼 검증자가 추적할 수 있는 근거를 남겨두세요."
                        badge={
                            <StatusBadge tone={summary.missingSourceCount > 0 ? 'warning' : 'success'}>
                                {summary.missingSourceCount > 0 ? `${summary.missingSourceCount}건 필요` : '입력 완료'}
                            </StatusBadge>
                        }
                    />
                    <ActionItemCard
                        title={summary.unsupportedTypeCount > 0 ? '기타 유형을 재분류하세요' : '공정 직접배출량과 비교하세요'}
                        description={
                            summary.unsupportedTypeCount > 0
                                ? '기타 배출원 유형은 현재 Export 대상이 아닙니다. 연료 또는 공정 원료로 재분류 가능한지 확인하세요.'
                                : '배출원 합계와 생산공정의 직접배출량 차이가 크면 Export 전에 조정이 필요합니다.'
                        }
                        className="border-teal-100 bg-teal-50"
                        badge={<AlertTriangle className="h-5 w-5 text-teal-700" />}
                        action={
                            <Link href="/processes">
                                <Button type="button">
                                    생산공정과 비교
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                        }
                    />
                </div>
            </SectionCard>

            {showForm && (
                <SectionCard
                    title={editingSourceStreamId ? '배출원 정보 수정' : '신규 배출원'}
                    description="배출계수 단위는 현재 활동자료 단위 기준입니다. 예를 들어 활동자료가 MWh이면 tCO2e/MWh 계수를 입력합니다."
                    actions={
                        <Button type="button" variant="secondary" onClick={resetForm}>
                            <X className="mr-2 h-4 w-4" />
                            취소
                        </Button>
                    }
                >
                    <form noValidate onSubmit={handleSubmit} className="space-y-5">
                        <FormSection
                            title="1. 배출원 기본정보"
                            description="연료 또는 공정 원료 배출원을 만들고, 어떤 보고기간과 생산공정의 직접배출 근거인지 연결합니다."
                            badge={<StatusBadge tone="warning">필수</StatusBadge>}
                        >
                        <div>
                            <label htmlFor="source-stream-name" className="text-sm font-semibold text-slate-700">배출원명</label>
                            <input id="source-stream-name" required className={fieldClass} value={newItem.name} onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} />
                            {errors.name && <p className="mt-1 text-xs font-medium text-red-600">{errors.name}</p>}
                        </div>
                        <div>
                            <label htmlFor="source-stream-type" className="text-sm font-semibold text-slate-700">유형</label>
                            <select id="source-stream-type" className={fieldClass} value={newItem.stream_type} onChange={(event) => setNewItem({ ...newItem, stream_type: event.target.value as SourceStream['stream_type'] })}>
                                <option value="FUEL">연료</option>
                                <option value="PROCESS_MATERIAL">공정 원료</option>
                                <option value="OTHER">기타</option>
                            </select>
                            {errors.stream_type && <p className="mt-1 text-xs font-medium text-red-600">{errors.stream_type}</p>}
                        </div>
                        <div>
                            <label htmlFor="source-stream-method" className="text-sm font-semibold text-slate-700">산정방법</label>
                            <select id="source-stream-method" required className={fieldClass} value={newItem.method} onChange={(event) => setNewItem({ ...newItem, method: event.target.value })}>
                                {sourceStreamMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                            </select>
                            {errors.method && <p className="mt-1 text-xs font-medium text-red-600">{errors.method}</p>}
                        </div>
                        <div>
                            <label htmlFor="source-stream-period" className="text-sm font-semibold text-slate-700">보고기간</label>
                            <select id="source-stream-period" className={fieldClass} value={newItem.period_id} onChange={(event) => setNewItem({ ...newItem, period_id: event.target.value })}>
                                <option value="">미지정</option>
                                {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
                            </select>
                            {errors.period_id && <p className="mt-1 text-xs font-medium text-red-600">{errors.period_id}</p>}
                        </div>
                        <div>
                            <label htmlFor="source-stream-process" className="text-sm font-semibold text-slate-700">연결 생산공정</label>
                            <select id="source-stream-process" className={fieldClass} value={newItem.process_id} onChange={(event) => setNewItem({ ...newItem, process_id: event.target.value })}>
                                <option value="">미지정</option>
                                {processes.map((process) => <option key={process.id} value={process.id}>{process.name}</option>)}
                            </select>
                            {errors.process_id && <p className="mt-1 text-xs font-medium text-red-600">{errors.process_id}</p>}
                        </div>
                        </FormSection>

                        <FormSection
                            title="2. 활동자료와 배출계수"
                            description="활동자료 단위와 배출계수 단위가 같은 기준인지 확인하세요. 연료 배출원은 순발열량도 필요합니다."
                            badge={<StatusBadge tone="warning">필수</StatusBadge>}
                        >
                        <div>
                            <label htmlFor="source-stream-activity" className="text-sm font-semibold text-slate-700">활동자료</label>
                            <input id="source-stream-activity" type="number" min="0" step="0.0001" className={fieldClass} value={newItem.activity_data} onChange={(event) => setNewItem({ ...newItem, activity_data: toNumber(event.target.value) })} />
                            {errors.activity_data && <p className="mt-1 text-xs font-medium text-red-600">{errors.activity_data}</p>}
                        </div>
                        <div>
                            <label htmlFor="source-stream-unit" className="text-sm font-semibold text-slate-700">활동자료 단위</label>
                            <select id="source-stream-unit" required className={fieldClass} value={newItem.activity_unit} onChange={(event) => setNewItem({ ...newItem, activity_unit: event.target.value })}>
                                {activityUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                            </select>
                            {errors.activity_unit && <p className="mt-1 text-xs font-medium text-red-600">{errors.activity_unit}</p>}
                        </div>
                        <div>
                            <label htmlFor="source-stream-ncv" className="text-sm font-semibold text-slate-700">순발열량(GJ/단위)</label>
                            <input id="source-stream-ncv" type="number" min="0" step="0.0001" className={fieldClass} value={newItem.ncv_gj_per_unit} onChange={(event) => setNewItem({ ...newItem, ncv_gj_per_unit: toNumber(event.target.value) })} />
                            {errors.ncv_gj_per_unit && <p className="mt-1 text-xs font-medium text-red-600">{errors.ncv_gj_per_unit}</p>}
                        </div>
                        <div>
                            <label htmlFor="source-stream-ef" className="text-sm font-semibold text-slate-700">배출계수(tCO2e/단위)</label>
                            <input id="source-stream-ef" type="number" min="0" step="0.0001" className={fieldClass} value={newItem.emission_factor_tco2e_per_unit} onChange={(event) => setNewItem({ ...newItem, emission_factor_tco2e_per_unit: toNumber(event.target.value) })} />
                            {errors.emission_factor_tco2e_per_unit && <p className="mt-1 text-xs font-medium text-red-600">{errors.emission_factor_tco2e_per_unit}</p>}
                        </div>
                        </FormSection>

                        <FormSection
                            title="3. 계수와 근거"
                            description="산화계수, 전환계수, 화석탄소/바이오매스 비율과 자료 출처를 남깁니다. 출처는 검증 대응의 핵심 증빙입니다."
                            badge={<StatusBadge tone="pending">검토용</StatusBadge>}
                        >
                        <div>
                            <label htmlFor="source-stream-oxidation" className="text-sm font-semibold text-slate-700">산화계수</label>
                            <input id="source-stream-oxidation" type="number" min="0" max="1" step="0.0001" className={fieldClass} value={newItem.oxidation_factor} onChange={(event) => setNewItem({ ...newItem, oxidation_factor: toNumber(event.target.value) })} />
                            {errors.oxidation_factor && <p className="mt-1 text-xs font-medium text-red-600">{errors.oxidation_factor}</p>}
                        </div>
                        <div>
                            <label htmlFor="source-stream-conversion" className="text-sm font-semibold text-slate-700">전환계수</label>
                            <input id="source-stream-conversion" type="number" min="0" max="1" step="0.0001" className={fieldClass} value={newItem.conversion_factor} onChange={(event) => setNewItem({ ...newItem, conversion_factor: toNumber(event.target.value) })} />
                            {errors.conversion_factor && <p className="mt-1 text-xs font-medium text-red-600">{errors.conversion_factor}</p>}
                        </div>
                        <div>
                            <label htmlFor="source-stream-fossil" className="text-sm font-semibold text-slate-700">화석탄소 비율</label>
                            <input id="source-stream-fossil" type="number" min="0" max="1" step="0.0001" className={fieldClass} value={newItem.fossil_fraction} onChange={(event) => setNewItem({ ...newItem, fossil_fraction: toNumber(event.target.value) })} />
                            {errors.fossil_fraction && <p className="mt-1 text-xs font-medium text-red-600">{errors.fossil_fraction}</p>}
                        </div>
                        <div>
                            <label htmlFor="source-stream-biomass" className="text-sm font-semibold text-slate-700">바이오매스 비율</label>
                            <input id="source-stream-biomass" type="number" min="0" max="1" step="0.0001" className={fieldClass} value={newItem.biomass_fraction} onChange={(event) => setNewItem({ ...newItem, biomass_fraction: toNumber(event.target.value) })} />
                            {errors.biomass_fraction && <p className="mt-1 text-xs font-medium text-red-600">{errors.biomass_fraction}</p>}
                        </div>
                        <div className="md:col-span-2">
                            <label htmlFor="source-stream-source" className="text-sm font-semibold text-slate-700">출처</label>
                            <input id="source-stream-source" required className={fieldClass} value={newItem.source} onChange={(event) => setNewItem({ ...newItem, source: event.target.value })} placeholder="예: 연료 청구서, 계측기 검침표" />
                            {errors.source && <p className="mt-1 text-xs font-medium text-red-600">{errors.source}</p>}
                        </div>
                        <div className="rounded-xl bg-teal-50 p-4 text-sm text-teal-900 md:col-span-1">
                            <p className="font-semibold">추정 배출량</p>
                            <p className="mt-2 text-2xl font-semibold">{formatNumber(calculateSourceStreamEmissions(newItem))}</p>
                            <p className="mt-1 text-xs">tCO2e</p>
                            <div className="mt-4 border-t border-teal-100 pt-3 text-xs">
                                <p className="font-semibold">연료 에너지 함량</p>
                                <p className="mt-1">총 {formatNumber(draftEnergyBreakdown.total)} TJ</p>
                                <p className="mt-1 text-teal-800">
                                    화석 {formatNumber(draftEnergyBreakdown.fossil)} TJ / 바이오매스 {formatNumber(draftEnergyBreakdown.biomass)} TJ
                                </p>
                            </div>
                        </div>
                        {draftUnitWarnings.length > 0 && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 md:col-span-2">
                                <p className="flex items-center gap-2 font-semibold">
                                    <AlertTriangle className="h-4 w-4" />
                                    단위·순발열량(NCV) 정합성 확인 필요
                                </p>
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                                    {draftUnitWarnings.map((warning, index) => (
                                        <li key={index}>{warning}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        </FormSection>

                        <div className="flex flex-wrap gap-2">
                            <Button type="submit">{editingSourceStreamId ? '수정 저장' : '배출원 저장'}</Button>
                        </div>
                    </form>
                </SectionCard>
            )}

            <div className="grid grid-cols-1 gap-3 md:hidden">
                {loading ? (
                    <SectionCard>
                        <p className="text-center text-sm text-slate-500">불러오는 중...</p>
                    </SectionCard>
                ) : sourceStreams.length === 0 ? (
                    <SectionCard>
                        <EmptyState
                            title="등록된 배출원 자료가 없습니다"
                            description="연료, 공정 원료, 배출계수 근거를 등록하면 직접배출량의 B_EmInst 증빙 흐름을 만들 수 있습니다."
                            action={
                                <Button type="button" onClick={startNewSourceStream}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    배출원 추가
                                </Button>
                            }
                        />
                    </SectionCard>
                ) : sourceStreams.map((sourceStream) => (
                    <SectionCard key={sourceStream.id} className="p-4">
                        <h2 className="text-base font-semibold text-slate-950">{sourceStream.name}</h2>
                        <p className="mt-1 text-sm text-slate-500">{streamTypeLabel(sourceStream.stream_type)} / {sourceStream.method}</p>
                        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-xl bg-slate-50 p-3">
                                <dt className="text-xs text-slate-500">공정</dt>
                                <dd className="mt-1 font-medium text-slate-900">{sourceStream.process_id ? processNames.get(sourceStream.process_id) ?? '연결 없음' : '-'}</dd>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                                <dt className="text-xs text-slate-500">활동자료</dt>
                                <dd className="mt-1 font-medium text-slate-900">{formatNumber(sourceStream.activity_data)} {sourceStream.activity_unit}</dd>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                                <dt className="text-xs text-slate-500">배출계수</dt>
                                <dd className="mt-1 font-medium text-slate-900">{formatNumber(sourceStream.emission_factor_tco2e_per_unit)}</dd>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                                <dt className="text-xs text-slate-500">에너지 함량</dt>
                                <dd className="mt-1 font-medium text-slate-900">{formatNumber(calculateSourceStreamEnergyBreakdown(sourceStream).total)} TJ</dd>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                                <dt className="text-xs text-slate-500">추정 배출량</dt>
                                <dd className="mt-1 font-medium text-slate-900">{formatNumber(calculateSourceStreamEmissions(sourceStream))}</dd>
                            </div>
                        </dl>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <Button type="button" variant="secondary" onClick={() => startEditSourceStream(sourceStream)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                수정
                            </Button>
                            <Button type="button" variant="danger" onClick={() => handleDeleteSourceStream(sourceStream)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                삭제
                            </Button>
                        </div>
                    </SectionCard>
                ))}
            </div>

            <DataTable className="hidden md:block">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="whitespace-nowrap px-4 py-4 text-left text-sm font-semibold text-slate-900">배출원</th>
                            <th className="whitespace-nowrap px-4 py-4 text-left text-sm font-semibold text-slate-900">유형</th>
                            <th className="whitespace-nowrap px-4 py-4 text-left text-sm font-semibold text-slate-900">보고기간</th>
                            <th className="whitespace-nowrap px-4 py-4 text-left text-sm font-semibold text-slate-900">공정</th>
                            <th className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-slate-900">활동</th>
                            <th className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-slate-900">계수</th>
                            <th className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-slate-900">에너지</th>
                            <th className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-slate-900">배출량</th>
                            <th className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-slate-900">작업</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {loading ? (
                            <tr><td colSpan={9} className="p-6 text-center text-sm text-slate-500">불러오는 중...</td></tr>
                        ) : sourceStreams.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="p-6">
                                    <EmptyState
                                        title="등록된 배출원 자료가 없습니다"
                                        description="직접배출량이 있는 공정은 연료 또는 공정 원료 자료와 연결되어야 Results와 Export에서 검토됩니다."
                                        action={
                                            <Button type="button" onClick={startNewSourceStream}>
                                                <Plus className="mr-2 h-4 w-4" />
                                                배출원 추가
                                            </Button>
                                        }
                                    />
                                </td>
                            </tr>
                        ) : (
                            sourceStreams.map((sourceStream) => (
                                <tr key={sourceStream.id} className="transition hover:bg-slate-50">
                                    <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-950">{sourceStream.name}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{streamTypeLabel(sourceStream.stream_type)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{sourceStream.period_id ? periodNames.get(sourceStream.period_id) ?? '연결 없음' : '-'}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{sourceStream.process_id ? processNames.get(sourceStream.process_id) ?? '연결 없음' : '-'}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(sourceStream.activity_data)} {sourceStream.activity_unit}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(sourceStream.emission_factor_tco2e_per_unit)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(calculateSourceStreamEnergyBreakdown(sourceStream).total)} TJ</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(calculateSourceStreamEmissions(sourceStream))} tCO2e</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                                        <div className="flex justify-end gap-2">
                                            <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => startEditSourceStream(sourceStream)}>
                                                <Pencil className="mr-1.5 h-4 w-4" />
                                                수정
                                            </Button>
                                            <Button type="button" variant="danger" className="min-h-9 px-3 py-1.5" onClick={() => handleDeleteSourceStream(sourceStream)}>
                                                <Trash2 className="mr-1.5 h-4 w-4" />
                                                삭제
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </DataTable>
        </div>
    );
}
