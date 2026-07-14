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
import {
    calculateSourceStreamEmissions,
    calculateSourceStreamEnergyBreakdown,
    getSourceStreamEmissionFactorBasis,
    getSourceStreamUnitWarnings,
} from '@/lib/source-stream-calculation';
import { Term } from '@/components/ux/Term';
import { FieldHelp } from '@/components/ux/FieldHelp';
import { AlertTriangle, ArrowRight, Flame, Gauge, Pencil, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type SourceStreamDraft = Omit<SourceStream, 'id' | 'created_at' | 'updated_at'>;
type SourceStreamErrors = Partial<Record<keyof SourceStreamDraft, string>>;
type SourceStreamPreset = {
    key: string;
    title: string;
    description: string;
    values: Partial<SourceStreamDraft>;
};

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
    emission_factor_basis: 'PER_TJ',
    oxidation_factor: 1,
    conversion_factor: 1,
    fossil_fraction: 1,
    biomass_fraction: 0,
    factor_source_type: 'UNCLASSIFIED',
    source: '',
};

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

const sourceStreamMethods = ['Combustion', 'Process Emissions', 'Mass balance'] as const;
const activityUnits = ['t', 'Nm3'] as const;
const emissionFactorBasisOptions = [
    { value: 'PER_TJ', label: '에너지 기준 (tCO2e/TJ)' },
    { value: 'PER_ACTIVITY_UNIT', label: '활동자료 단위 기준 (tCO2e/단위)' },
] as const;
const factorSourceTypeOptions = [
    { value: 'UNCLASSIFIED', label: '분류 전' },
    { value: 'EU_OR_IPCC_DEFAULT', label: 'EU/IPCC 기본계수' },
    { value: 'NATIONAL_INVENTORY', label: '국가 인벤토리·공공 통계' },
    { value: 'SUPPLIER_OR_LAB', label: '공급사 보증값·시험분석' },
] as const;

const sourceStreamPresets: SourceStreamPreset[] = [
    {
        key: 'city-gas',
        title: '도시가스 고지서',
        description: '월별 사용량이 Nm3로 정리된 경우',
        values: {
            name: '도시가스 연소',
            stream_type: 'FUEL',
            method: 'Combustion',
            activity_unit: 'Nm3',
            ncv_gj_per_unit: 0.037,
            emission_factor_tco2e_per_unit: 56.1,
            emission_factor_basis: 'PER_TJ',
            factor_source_type: 'NATIONAL_INVENTORY',
            source: '도시가스 고지서, 월별 사용량 집계표',
        },
    },
    {
        key: 'fuel-purchase',
        title: '연료 구매대장',
        description: 'LNG/LPG/유류 사용량을 t 기준으로 모은 경우',
        values: {
            name: '연료 연소',
            stream_type: 'FUEL',
            method: 'Combustion',
            activity_unit: 't',
            ncv_gj_per_unit: 48,
            emission_factor_tco2e_per_unit: 73,
            emission_factor_basis: 'PER_TJ',
            factor_source_type: 'EU_OR_IPCC_DEFAULT',
            source: '연료 구매대장, 계량기 검침표',
        },
    },
    {
        key: 'process-material',
        title: '원료 투입대장',
        description: '탄소 함유 원료 투입량으로 공정배출을 산정하는 경우',
        values: {
            name: '공정 원료 투입',
            stream_type: 'PROCESS_MATERIAL',
            method: 'Process Emissions',
            activity_unit: 't',
            ncv_gj_per_unit: 0,
            emission_factor_tco2e_per_unit: 0,
            emission_factor_basis: 'PER_ACTIVITY_UNIT',
            factor_source_type: 'SUPPLIER_OR_LAB',
            source: '원료 투입대장, 성분분석표',
        },
    },
    {
        key: 'mass-balance',
        title: '물질수지 차감',
        description: '슬래그/부산물/출고물 탄소량을 차감해야 하는 경우',
        values: {
            name: '물질수지 조정',
            stream_type: 'PROCESS_MATERIAL',
            method: 'Mass balance',
            activity_unit: 't',
            ncv_gj_per_unit: 0,
            emission_factor_tco2e_per_unit: 3.667,
            emission_factor_basis: 'PER_ACTIVITY_UNIT',
            factor_source_type: 'SUPPLIER_OR_LAB',
            source: '물질수지표, 성분분석표',
        },
    },
];

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

function resolveUiEmissionFactorBasis(sourceStream: Pick<SourceStream, 'stream_type' | 'emission_factor_basis'>) {
    return sourceStream.stream_type === 'FUEL'
        ? getSourceStreamEmissionFactorBasis(sourceStream)
        : 'PER_ACTIVITY_UNIT';
}

function emissionFactorBasisLabel(sourceStream: Pick<SourceStream, 'stream_type' | 'emission_factor_basis'>) {
    const basis = resolveUiEmissionFactorBasis(sourceStream);
    return emissionFactorBasisOptions.find((option) => option.value === basis)?.label ?? '에너지 기준 (tCO2e/TJ)';
}

function factorSourceTypeLabel(sourceStream: Pick<SourceStream, 'factor_source_type'>) {
    return factorSourceTypeOptions.find((option) => option.value === sourceStream.factor_source_type)?.label ?? '분류 전';
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

    if (sourceStream.activity_data < 0 && sourceStream.method !== 'Mass balance') {
        nextErrors.activity_data = '활동자료는 0 이상이어야 합니다. (산출물 차감은 물질수지 방법에서만 음수로 입력)';
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

    const emissionFactorBasis = resolveUiEmissionFactorBasis(sourceStream);
    if (!emissionFactorBasisOptions.some((option) => option.value === emissionFactorBasis)) {
        nextErrors.emission_factor_basis = '배출계수 기준을 선택하세요.';
    }

    if (sourceStream.stream_type !== 'FUEL' && emissionFactorBasis === 'PER_TJ') {
        nextErrors.emission_factor_basis = 'tCO2e/TJ 기준은 연료 연소 배출원에만 사용하세요. 공정 원료는 활동자료 단위 기준으로 입력하세요.';
    }

    if (
        sourceStream.factor_source_type
        && !factorSourceTypeOptions.some((option) => option.value === sourceStream.factor_source_type)
    ) {
        nextErrors.factor_source_type = '배출계수 출처 유형을 선택하세요.';
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
                    emission_factor_basis: editSourceStream.stream_type === 'FUEL'
                        ? getSourceStreamEmissionFactorBasis(editSourceStream)
                        : 'PER_ACTIVITY_UNIT',
                    oxidation_factor: editSourceStream.oxidation_factor,
                    conversion_factor: editSourceStream.conversion_factor,
                    fossil_fraction: editSourceStream.fossil_fraction,
                    biomass_fraction: editSourceStream.biomass_fraction,
                    factor_source_type: editSourceStream.factor_source_type ?? 'UNCLASSIFIED',
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
        const unclassifiedFactorSourceCount = sourceStreams.filter((sourceStream) => (sourceStream.factor_source_type ?? 'UNCLASSIFIED') === 'UNCLASSIFIED').length;
        const unsupportedTypeCount = sourceStreams.filter((sourceStream) => sourceStream.stream_type === 'OTHER').length;
        const unitWarningCount = sourceStreams.reduce((sum, sourceStream) => sum + getSourceStreamUnitWarnings(sourceStream).length, 0);
        return { totalEmissions, totalEnergy, fuelCount, missingSourceCount, unclassifiedFactorSourceCount, unlinkedCount, unsupportedTypeCount, unitWarningCount };
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

    function applySourceStreamPreset(preset: SourceStreamPreset) {
        setNewItem({
            ...newItem,
            ...preset.values,
            period_id: newItem.period_id || periods[0]?.id || '',
            process_id: newItem.process_id || processes[0]?.id || '',
            activity_data: newItem.activity_data,
            oxidation_factor: 1,
            conversion_factor: 1,
            fossil_fraction: preset.values.stream_type === 'FUEL' ? 1 : newItem.fossil_fraction,
            biomass_fraction: 0,
        });
        setErrors({});
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
            emission_factor_basis: sourceStream.stream_type === 'FUEL'
                ? getSourceStreamEmissionFactorBasis(sourceStream)
                : 'PER_ACTIVITY_UNIT',
            oxidation_factor: sourceStream.oxidation_factor,
            conversion_factor: sourceStream.conversion_factor,
            fossil_fraction: sourceStream.fossil_fraction,
            biomass_fraction: sourceStream.biomass_fraction,
            factor_source_type: sourceStream.factor_source_type ?? 'UNCLASSIFIED',
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
            emission_factor_basis: newItem.stream_type === 'FUEL'
                ? getSourceStreamEmissionFactorBasis(newItem)
                : 'PER_ACTIVITY_UNIT',
            factor_source_type: newItem.factor_source_type ?? 'UNCLASSIFIED',
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
    const draftEmissionFactorBasis = resolveUiEmissionFactorBasis(newItem);
    const draftEmissionFactorUnit = draftEmissionFactorBasis === 'PER_TJ'
        ? 'tCO2e/TJ'
        : `tCO2e/${newItem.activity_unit || '단위'}`;

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
                title="MRV 원칙 체크"
                description="CBAM 배출량 자료는 완전성, 일관성, 정확성, 투명성, 비교가능성을 기준으로 설명할 수 있어야 합니다. 아래 카드는 입력값이 그 원칙을 어느 정도 받쳐주는지 보는 작업용 점검입니다."
            >
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                    <ActionItemCard
                        title="완전성"
                        description="산정 경계(우리 공장) 안의 주요 배출원과 공정 투입물이 빠지지 않았는지 확인합니다. 직접배출이 있는 공정은 배출원 자료와 연결되어야 합니다."
                        badge={<StatusBadge tone={summary.unlinkedCount > 0 || summary.unsupportedTypeCount > 0 ? 'warning' : 'success'}>{summary.unlinkedCount + summary.unsupportedTypeCount > 0 ? '확인 필요' : '양호'}</StatusBadge>}
                    />
                    <ActionItemCard
                        title="일관성"
                        description="보고기간, 공정, 활동자료 단위가 같은 기준으로 반복 적용되어야 합니다. 같은 연료는 같은 단위와 방법으로 관리하세요."
                        badge={<StatusBadge tone={summary.unitWarningCount > 0 ? 'warning' : 'success'}>{summary.unitWarningCount > 0 ? `${summary.unitWarningCount}건` : '양호'}</StatusBadge>}
                    />
                    <ActionItemCard
                        title="정확성"
                        description="활동자료, 순발열량, 배출계수, 산화계수, 전환계수는 실제 계량값 또는 출처 있는 계수를 사용해야 합니다."
                        badge={<StatusBadge tone={summary.unclassifiedFactorSourceCount > 0 ? 'warning' : sourceStreams.length > 0 ? 'success' : 'warning'}>{summary.unclassifiedFactorSourceCount > 0 ? `${summary.unclassifiedFactorSourceCount}건 분류 전` : sourceStreams.length > 0 ? '분류됨' : '입력 전'}</StatusBadge>}
                    />
                    <ActionItemCard
                        title="투명성"
                        description="사용한 방법론, 가정, 데이터 출처, 산정 오류 가능성을 나중에 설명할 수 있도록 출처 칸에 근거를 남깁니다."
                        badge={<StatusBadge tone={summary.missingSourceCount > 0 ? 'warning' : 'success'}>{summary.missingSourceCount > 0 ? `${summary.missingSourceCount}건` : '출처 있음'}</StatusBadge>}
                    />
                    <ActionItemCard
                        title="비교가능성"
                        description="공통 기준으로 다른 기간·제품·공정과 비교할 수 있게 활동수준과 배출량을 제품 생산공정에 연결합니다."
                        badge={<StatusBadge tone={summary.unlinkedCount > 0 ? 'warning' : 'success'}>{summary.unlinkedCount > 0 ? '연결 필요' : '연결됨'}</StatusBadge>}
                    />
                </div>
            </SectionCard>

            <SectionCard
                title="활동자료 산정요소"
                description="배출량 산정에는 산정 경계, 배출원, 활동자료, 배출계수, 활동수준이 함께 필요합니다. 이 화면은 그중 배출원별 활동자료와 계수를 모아 생산공정에 연결하는 곳입니다."
            >
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                    <ActionItemCard
                        title="산정 경계·배출원"
                        description="같은 품목군 제품의 내재배출량 산정에 포함되는 물리적·화학적 공정과 온실가스 배출 영역을 정합니다."
                        badge={<StatusBadge tone="info">경계 확인</StatusBadge>}
                    />
                    <ActionItemCard
                        title="활동자료·계수"
                        description="연료 사용량, 원료 투입량, 순발열량, 배출계수, 산화계수, 전환계수, 탄소함유량 등을 출처와 함께 입력합니다."
                        badge={<StatusBadge tone="pending">자료 입력</StatusBadge>}
                    />
                    <ActionItemCard
                        title="활동수준"
                        description="시스템 경계 안에서 생산된 제품 수량과 연결해야 제품 1톤당 고유 내재배출량 계산으로 이어집니다."
                        badge={<StatusBadge tone="success">공정 연결</StatusBadge>}
                        action={
                            <Link href="/processes">
                                <Button type="button" variant="secondary">
                                    생산공정 보기
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                        }
                    />
                    <ActionItemCard
                        title="공용 배출원 배분"
                        description="보일러·집진설비처럼 여러 공정이 함께 쓰는 배출원은 운전시간, 정격용량, 생산량 등 기준으로 공정별 행을 나누어 입력하세요."
                        badge={<StatusBadge tone="pending">배분 기준</StatusBadge>}
                    />
                </div>
            </SectionCard>

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
                    description="연료는 배출계수 기준을 먼저 고르세요. tCO2e/TJ 계수는 활동자료 × NCV로 계산하고, tCO2e/단위 계수는 활동자료에 바로 곱합니다."
                    actions={
                        <Button type="button" variant="secondary" onClick={resetForm}>
                            <X className="mr-2 h-4 w-4" />
                            취소
                        </Button>
                    }
                >
                    <form noValidate onSubmit={handleSubmit} className="space-y-5">
                        <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
                            <div className="flex flex-col gap-1">
                                <h3 className="text-sm font-semibold text-slate-950">업무자료 프리셋</h3>
                                <p className="text-xs leading-5 text-slate-600">
                                    가지고 있는 원자료 유형을 고르면 입력틀을 먼저 채웁니다. 실제 사용량, NCV, 배출계수는 회사 자료와 공식 근거로 다시 확인하세요.
                                </p>
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
                                {sourceStreamPresets.map((preset) => (
                                    <button
                                        key={preset.key}
                                        type="button"
                                        className="rounded-xl border border-teal-100 bg-white p-3 text-left transition hover:border-teal-300 hover:bg-teal-50"
                                        onClick={() => applySourceStreamPreset(preset)}
                                    >
                                        <span className="block text-sm font-semibold text-teal-900">{preset.title}</span>
                                        <span className="mt-1 block text-xs leading-5 text-slate-600">{preset.description}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

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
                            <select
                                id="source-stream-type"
                                className={fieldClass}
                                value={newItem.stream_type}
                                onChange={(event) => {
                                    const streamType = event.target.value as SourceStream['stream_type'];
                                    setNewItem({
                                        ...newItem,
                                        stream_type: streamType,
                                        emission_factor_basis: streamType === 'FUEL'
                                            ? getSourceStreamEmissionFactorBasis(newItem)
                                            : 'PER_ACTIVITY_UNIT',
                                    });
                                }}
                            >
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
                            <input id="source-stream-activity" type="number" min={newItem.method === 'Mass balance' ? undefined : '0'} step="0.0001" className={fieldClass} value={newItem.activity_data} onChange={(event) => setNewItem({ ...newItem, activity_data: toNumber(event.target.value) })} />
                            {newItem.method === 'Mass balance' && (
                                <p className="mt-1 text-xs text-slate-500">물질수지: 투입은 양수(+), 산출물(조강·슬래그 등) 차감은 <span className="font-semibold">음수(−)</span>로 입력. 배출계수는 탄소함량을 CO₂ 기준(tCO₂/t = tC/t × 3.667)으로 입력하세요.</p>
                            )}
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
                            <label htmlFor="source-stream-ncv" className="text-sm font-semibold text-slate-700"><Term term="NCV">순발열량</Term>(GJ/단위)</label>{' '}
                            <FieldHelp
                                title="순발열량(NCV)은 어디서?"
                                sources={[
                                    '연료 공급사 사양서·고지서의 발열량',
                                    '⚠️ 활동량 단위와 같은 기준이어야 함 (예: 활동량 Nm³면 NCV도 GJ/Nm³)',
                                    '표준값 예: LNG ≈ 48 GJ/t (= 약 0.037 GJ/Nm³)',
                                ]}
                                exampleLabel="예시값 채우기 (48 GJ/t)"
                                onExample={() => setNewItem({ ...newItem, ncv_gj_per_unit: 48 })}
                            />
                            <input id="source-stream-ncv" type="number" min="0" step="0.0001" className={fieldClass} value={newItem.ncv_gj_per_unit} onChange={(event) => setNewItem({ ...newItem, ncv_gj_per_unit: toNumber(event.target.value) })} />
                            {errors.ncv_gj_per_unit && <p className="mt-1 text-xs font-medium text-red-600">{errors.ncv_gj_per_unit}</p>}
                        </div>
                        <div>
                            <label htmlFor="source-stream-ef-basis" className="text-sm font-semibold text-slate-700">배출계수 기준</label>
                            <select
                                id="source-stream-ef-basis"
                                className={fieldClass}
                                value={draftEmissionFactorBasis}
                                onChange={(event) => setNewItem({
                                    ...newItem,
                                    emission_factor_basis: event.target.value as SourceStream['emission_factor_basis'],
                                })}
                            >
                                {emissionFactorBasisOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            {errors.emission_factor_basis && <p className="mt-1 text-xs font-medium text-red-600">{errors.emission_factor_basis}</p>}
                            <p className="mt-1 text-xs text-slate-500">
                                PDF 산정식 기준: 에너지 기준은 활동자료 × NCV × 배출계수 / 1000, 활동단위 기준은 활동자료 × 배출계수로 계산합니다.
                            </p>
                        </div>
                        <div>
                            <label htmlFor="source-stream-ef" className="text-sm font-semibold text-slate-700">배출계수({draftEmissionFactorUnit})</label>{' '}
                            <FieldHelp
                                title="배출계수는 어디서?"
                                sources={[
                                    '연소 에너지 기준: IPCC/국가 연료별 기본 배출계수(tCO₂/TJ)',
                                    '연소 활동단위 기준: 활동자료 단위당 배출계수(tCO₂/t 또는 tCO₂/Nm³)',
                                    '공정·물질수지: 탄소함량을 CO₂ 기준으로 환산(tCO₂/t = tC/t × 3.667)',
                                ]}
                            />
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
                            <label htmlFor="source-stream-oxidation" className="text-sm font-semibold text-slate-700"><Term term="산화계수">산화계수</Term></label>
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
                        <div>
                            <label htmlFor="source-stream-factor-source-type" className="text-sm font-semibold text-slate-700">배출계수 출처 유형</label>
                            <select
                                id="source-stream-factor-source-type"
                                className={fieldClass}
                                value={newItem.factor_source_type ?? 'UNCLASSIFIED'}
                                onChange={(event) => setNewItem({
                                    ...newItem,
                                    factor_source_type: event.target.value as SourceStream['factor_source_type'],
                                })}
                            >
                                {factorSourceTypeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            <p className="mt-1 text-xs text-slate-500">
                                검증 대응을 위해 EU/IPCC 기본계수, 국가 인벤토리, 공급사 보증값·시험분석 중 어느 근거인지 분류하세요.
                            </p>
                            {errors.factor_source_type && <p className="mt-1 text-xs font-medium text-red-600">{errors.factor_source_type}</p>}
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
                            <p className="mt-2 text-xs text-teal-800">{emissionFactorBasisLabel(newItem)}</p>
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
                                <dd className="mt-1 text-xs text-slate-500">{emissionFactorBasisLabel(sourceStream)}</dd>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                                <dt className="text-xs text-slate-500">계수 출처</dt>
                                <dd className="mt-1 font-medium text-slate-900">{factorSourceTypeLabel(sourceStream)}</dd>
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
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                        <span>{formatNumber(sourceStream.emission_factor_tco2e_per_unit)}</span>
                                        <div className="text-xs text-slate-400">{emissionFactorBasisLabel(sourceStream)}</div>
                                        <div className={(sourceStream.factor_source_type ?? 'UNCLASSIFIED') === 'UNCLASSIFIED' ? 'text-xs font-semibold text-amber-700' : 'text-xs text-slate-400'}>
                                            {factorSourceTypeLabel(sourceStream)}
                                        </div>
                                    </td>
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
