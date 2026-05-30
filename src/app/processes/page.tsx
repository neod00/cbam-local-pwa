'use client';

import { Button, DataTable, PageHeader, SectionCard, StatCard } from '@/components/ui';
import {
    createLocalItem,
    deleteLocalItem,
    listLocalItems,
    Product,
    ProductOutputLine,
    ProductionProcess,
    PurchasedPrecursor,
    ReportingPeriod,
    seedLocalData,
    SourceStream,
    updateLocalItem,
} from '@/lib/local-db';
import { calculateSourceStreamEmissions, calculateSourceStreamEnergyBreakdown } from '@/lib/source-stream-calculation';
import { getIndirectEmissionsApplicability } from '@/lib/cbam-product-rules';
import { Factory, Gauge, Pencil, Plus, Trash2, X, Zap } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type ProcessDraft = Omit<ProductionProcess, 'id' | 'created_at' | 'updated_at'>;
type OutputLineDraft = Omit<ProductOutputLine, 'id' | 'created_at' | 'updated_at' | 'process_id'>;
type ProcessErrors = Partial<Record<keyof ProcessDraft, string>>;

const emptyDraft: ProcessDraft = {
    period_id: '',
    product_id: '',
    name: '',
    production_route: '',
    output_mass_t: 0,
    market_output_mass_t: 0,
    internal_consumption_mass_t: 0,
    direct_attributable_emissions_tco2e: 0,
    electricity_mwh: 0,
    electricity_ef_tco2e_per_mwh: 0.47,
};

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

function createOutputLineDraft(productId = '', outputMass = 0): OutputLineDraft {
    return {
        product_id: productId,
        name: '',
        output_mass_t: outputMass,
        allocation_basis: 'MASS',
        manual_allocation_percent: 100,
        note: '',
    };
}

function toNumber(value: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
}

function calculateProcessSourceStreamSummary(process: ProductionProcess, sourceStreams: SourceStream[]) {
    const linkedSourceStreams = sourceStreams.filter((sourceStream) => sourceStream.process_id === process.id);
    const emissions = linkedSourceStreams.reduce(
        (sum, sourceStream) => sum + calculateSourceStreamEmissions(sourceStream),
        0
    );
    const energy = linkedSourceStreams.reduce(
        (sum, sourceStream) => sum + calculateSourceStreamEnergyBreakdown(sourceStream).total,
        0
    );
    const delta = emissions - process.direct_attributable_emissions_tco2e;
    const tolerance = Math.max(0.01, Math.abs(process.direct_attributable_emissions_tco2e) * 0.01);

    return {
        count: linkedSourceStreams.length,
        emissions,
        energy,
        delta,
        needsReview: linkedSourceStreams.length > 0 && Math.abs(delta) > tolerance,
    };
}

export default function ProcessesPage() {
    const [processes, setProcesses] = useState<ProductionProcess[]>([]);
    const [productOutputLines, setProductOutputLines] = useState<ProductOutputLine[]>([]);
    const [precursors, setPrecursors] = useState<PurchasedPrecursor[]>([]);
    const [sourceStreams, setSourceStreams] = useState<SourceStream[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingProcessId, setEditingProcessId] = useState<string | null>(null);
    const [newItem, setNewItem] = useState<ProcessDraft>(emptyDraft);
    const [outputLineDrafts, setOutputLineDrafts] = useState<OutputLineDraft[]>([createOutputLineDraft()]);
    const [errors, setErrors] = useState<ProcessErrors>({});

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            await seedLocalData();
            const [processData, productData, periodData, precursorData, sourceStreamData, outputLineData] = await Promise.all([
                listLocalItems('processes'),
                listLocalItems('products'),
                listLocalItems('periods'),
                listLocalItems('precursors'),
                listLocalItems('source_streams'),
                listLocalItems('product_output_lines'),
            ]);
            const sortedProcesses = processData.sort((a, b) => b.created_at.localeCompare(a.created_at));
            const editProcessId = new URLSearchParams(window.location.search).get('edit');
            const editProcess = editProcessId ? sortedProcesses.find((item) => item.id === editProcessId) : undefined;

            setProcesses(sortedProcesses);
            setProductOutputLines(outputLineData);
            setPrecursors(precursorData);
            setSourceStreams(sourceStreamData);
            setProducts(productData.sort((a, b) => a.name.localeCompare(b.name)));
            setPeriods(periodData.sort((a, b) => b.start_date.localeCompare(a.start_date)));
            if (editProcess) {
                setNewItem({
                    period_id: editProcess.period_id ?? '',
                    product_id: editProcess.product_id ?? '',
                    name: editProcess.name,
                    production_route: editProcess.production_route,
                    output_mass_t: editProcess.output_mass_t,
                    market_output_mass_t: editProcess.market_output_mass_t,
                    internal_consumption_mass_t: editProcess.internal_consumption_mass_t,
                    direct_attributable_emissions_tco2e: editProcess.direct_attributable_emissions_tco2e,
                    electricity_mwh: editProcess.electricity_mwh,
                    electricity_ef_tco2e_per_mwh: editProcess.electricity_ef_tco2e_per_mwh,
                });
                const existingLines = outputLineData.filter((line) => line.process_id === editProcess.id);
                setOutputLineDrafts(existingLines.length > 0
                    ? existingLines.map((line) => ({
                        product_id: line.product_id ?? '',
                        name: line.name,
                        output_mass_t: line.output_mass_t,
                        allocation_basis: line.allocation_basis,
                        manual_allocation_percent: line.manual_allocation_percent,
                        note: line.note,
                    }))
                    : [createOutputLineDraft(editProcess.product_id ?? '', editProcess.output_mass_t)]
                );
                setEditingProcessId(editProcess.id);
                setShowForm(true);
            } else {
                setNewItem({
                    ...emptyDraft,
                    product_id: productData[0]?.id ?? '',
                    period_id: periodData[0]?.id ?? '',
                });
                setOutputLineDrafts([createOutputLineDraft(productData[0]?.id ?? '', emptyDraft.output_mass_t)]);
            }
            setLoading(false);
        }

        loadData();
    }, []);

    const productNames = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products]);
    const periodNames = useMemo(() => new Map(periods.map((period) => [period.id, period.name])), [periods]);

    const summary = useMemo(() => {
        const totalOutput = processes.reduce((sum, process) => sum + process.output_mass_t, 0);
        const totalElectricity = processes.reduce((sum, process) => sum + process.electricity_mwh, 0);
        const sourceStreamReviewCount = processes.filter((process) => calculateProcessSourceStreamSummary(process, sourceStreams).needsReview).length;
        const outputLineReviewCount = processes.filter((process) => {
            const lines = productOutputLines.filter((line) => line.process_id === process.id);
            const lineTotal = lines.reduce((sum, line) => sum + line.output_mass_t, 0);
            return lines.length > 0 && Math.abs(lineTotal - process.output_mass_t) > Math.max(0.01, process.output_mass_t * 0.01);
        }).length;
        return { totalOutput, totalElectricity, sourceStreamReviewCount, outputLineCount: productOutputLines.length, outputLineReviewCount };
    }, [processes, sourceStreams, productOutputLines]);

    const editingSourceStreamSummary = useMemo(() => {
        if (!editingProcessId) {
            return undefined;
        }

        const linkedSourceStreams = sourceStreams.filter((sourceStream) => sourceStream.process_id === editingProcessId);
        const emissions = linkedSourceStreams.reduce(
            (sum, sourceStream) => sum + calculateSourceStreamEmissions(sourceStream),
            0
        );
        const energy = linkedSourceStreams.reduce(
            (sum, sourceStream) => sum + calculateSourceStreamEnergyBreakdown(sourceStream).total,
            0
        );
        const delta = emissions - newItem.direct_attributable_emissions_tco2e;

        return {
            count: linkedSourceStreams.length,
            emissions,
            energy,
            delta,
        };
    }, [editingProcessId, newItem.direct_attributable_emissions_tco2e, sourceStreams]);

    function createDefaultDraft(): ProcessDraft {
        return {
            ...emptyDraft,
            product_id: products[0]?.id ?? '',
            period_id: periods[0]?.id ?? '',
        };
    }

    function createDefaultOutputLineDrafts(processDraft = createDefaultDraft()) {
        return [createOutputLineDraft(processDraft.product_id ?? '', processDraft.output_mass_t)];
    }

    function resetForm() {
        const defaultDraft = createDefaultDraft();
        setNewItem(defaultDraft);
        setOutputLineDrafts(createDefaultOutputLineDrafts(defaultDraft));
        setErrors({});
        setEditingProcessId(null);
        setShowForm(false);
    }

    function startNewProcess() {
        if (showForm && !editingProcessId) {
            resetForm();
            return;
        }

        const defaultDraft = createDefaultDraft();
        setNewItem(defaultDraft);
        setOutputLineDrafts(createDefaultOutputLineDrafts(defaultDraft));
        setEditingProcessId(null);
        setShowForm(true);
    }

    function startEditProcess(process: ProductionProcess) {
        setNewItem({
            period_id: process.period_id ?? '',
            product_id: process.product_id ?? '',
            name: process.name,
            production_route: process.production_route,
            output_mass_t: process.output_mass_t,
            market_output_mass_t: process.market_output_mass_t,
            internal_consumption_mass_t: process.internal_consumption_mass_t,
            direct_attributable_emissions_tco2e: process.direct_attributable_emissions_tco2e,
            electricity_mwh: process.electricity_mwh,
            electricity_ef_tco2e_per_mwh: process.electricity_ef_tco2e_per_mwh,
        });
        setErrors({});
        const existingLines = productOutputLines.filter((line) => line.process_id === process.id);
        setOutputLineDrafts(existingLines.length > 0
            ? existingLines.map((line) => ({
                product_id: line.product_id ?? '',
                name: line.name,
                output_mass_t: line.output_mass_t,
                allocation_basis: line.allocation_basis,
                manual_allocation_percent: line.manual_allocation_percent,
                note: line.note,
            }))
            : [createOutputLineDraft(process.product_id ?? '', process.output_mass_t)]
        );
        setEditingProcessId(process.id);
        setShowForm(true);
    }

    async function saveOutputLines(processId: string) {
        const existingLines = productOutputLines.filter((line) => line.process_id === processId);
        const validDrafts = outputLineDrafts.filter((line) => line.output_mass_t > 0);

        await Promise.all(existingLines.map((line) => deleteLocalItem('product_output_lines', line.id)));
        const savedLines = await Promise.all(
            validDrafts.map((line, index) =>
                createLocalItem('product_output_lines', {
                    process_id: processId,
                    product_id: line.product_id || undefined,
                    name: line.name.trim() || `Output line ${index + 1}`,
                    output_mass_t: line.output_mass_t,
                    allocation_basis: line.allocation_basis,
                    manual_allocation_percent: line.manual_allocation_percent,
                    note: line.note.trim(),
                })
            )
        );

        setProductOutputLines([
            ...productOutputLines.filter((line) => line.process_id !== processId),
            ...savedLines,
        ]);
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        const nextErrors: ProcessErrors = {};

        if (!newItem.name.trim()) {
            nextErrors.name = '공정명을 입력하세요.';
        }

        if (!newItem.production_route.trim()) {
            nextErrors.production_route = '생산경로를 입력하세요.';
        }

        if (!newItem.period_id) {
            nextErrors.period_id = '보고기간을 선택하세요.';
        }

        if (!newItem.product_id) {
            nextErrors.product_id = '연결 제품을 선택하세요.';
        }

        if (newItem.output_mass_t <= 0) {
            nextErrors.output_mass_t = '총 생산량은 0보다 커야 합니다.';
        }

        const validOutputLines = outputLineDrafts.filter((line) => line.output_mass_t > 0);
        if (validOutputLines.length === 0) {
            nextErrors.output_mass_t = nextErrors.output_mass_t ?? '제품 생산라인을 1개 이상 입력하세요.';
        }

        if (newItem.market_output_mass_t < 0) {
            nextErrors.market_output_mass_t = '시장 출하량은 0 이상이어야 합니다.';
        }

        if (newItem.internal_consumption_mass_t < 0) {
            nextErrors.internal_consumption_mass_t = '내부 소비량은 0 이상이어야 합니다.';
        }

        if (newItem.direct_attributable_emissions_tco2e < 0) {
            nextErrors.direct_attributable_emissions_tco2e = '직접귀속배출량은 0 이상이어야 합니다.';
        }

        if (newItem.electricity_mwh < 0) {
            nextErrors.electricity_mwh = '전력 사용량은 0 이상이어야 합니다.';
        }

        if (newItem.electricity_ef_tco2e_per_mwh < 0) {
            nextErrors.electricity_ef_tco2e_per_mwh = '전력 배출계수는 0 이상이어야 합니다.';
        }

        setErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) {
            return;
        }

        if (editingProcessId) {
            const existingProcess = processes.find((process) => process.id === editingProcessId);

            if (!existingProcess) {
                return;
            }

            const updatedProcess = await updateLocalItem('processes', {
                ...existingProcess,
                ...newItem,
                name: newItem.name.trim(),
                production_route: newItem.production_route.trim(),
                period_id: newItem.period_id || undefined,
                product_id: newItem.product_id || undefined,
            });
            await saveOutputLines(updatedProcess.id);
            setProcesses(processes.map((process) => (process.id === updatedProcess.id ? updatedProcess : process)));
            resetForm();
            return;
        }

        const process = await createLocalItem('processes', {
            ...newItem,
            name: newItem.name.trim(),
            production_route: newItem.production_route.trim(),
            period_id: newItem.period_id || undefined,
            product_id: newItem.product_id || undefined,
        });

        await saveOutputLines(process.id);
        setProcesses([process, ...processes]);
        resetForm();
    }

    function getSee(process: ProductionProcess) {
        const product = process.product_id ? products.find((item) => item.id === process.product_id) : undefined;
        const indirectApplicability = getIndirectEmissionsApplicability(product);
        const directSee =
            process.output_mass_t > 0 ? process.direct_attributable_emissions_tco2e / process.output_mass_t : 0;
        const indirectSee =
            process.output_mass_t > 0 && indirectApplicability.applicable
                ? (process.electricity_mwh * process.electricity_ef_tco2e_per_mwh) / process.output_mass_t
                : 0;
        return { directSee, indirectSee, indirectApplicability };
    }

    function getProcessSourceStreamSummary(process: ProductionProcess) {
        return calculateProcessSourceStreamSummary(process, sourceStreams);
    }

    function getOutputLineSummary(process: ProductionProcess) {
        const lines = productOutputLines.filter((line) => line.process_id === process.id);
        const totalOutput = lines.reduce((sum, line) => sum + line.output_mass_t, 0);
        const delta = totalOutput - process.output_mass_t;
        const tolerance = Math.max(0.01, process.output_mass_t * 0.01);

        return {
            count: lines.length,
            totalOutput,
            delta,
            needsReview: lines.length > 0 && Math.abs(delta) > tolerance,
        };
    }

    async function handleDeleteProcess(process: ProductionProcess) {
        const linkedPrecursors = precursors.filter((precursor) => precursor.process_id === process.id);
        const linkedSourceStreams = sourceStreams.filter((sourceStream) => sourceStream.process_id === process.id);
        const linkedOutputLines = productOutputLines.filter((line) => line.process_id === process.id);

        if (linkedPrecursors.length > 0 || linkedSourceStreams.length > 0) {
            window.alert(
                [
                    '이 생산공정은 하위 데이터에 연결되어 있어 삭제할 수 없습니다.',
                    '',
                    `연결된 전구물질: ${linkedPrecursors.length}건`,
                    `연결된 배출원 자료: ${linkedSourceStreams.length}건`,
                    '',
                    '먼저 연결된 전구물질 또는 배출원 자료를 수정하거나 삭제한 뒤 다시 시도하세요.',
                ].join('\n')
            );
            return;
        }

        const confirmed = window.confirm(`'${process.name}' 생산공정을 삭제할까요? 산정결과와 Export 미리보기에서도 제외됩니다.`);

        if (!confirmed) {
            return;
        }

        await deleteLocalItem('processes', process.id);
        await Promise.all(linkedOutputLines.map((line) => deleteLocalItem('product_output_lines', line.id)));
        setProductOutputLines(productOutputLines.filter((line) => line.process_id !== process.id));
        setProcesses(processes.filter((item) => item.id !== process.id));
        if (editingProcessId === process.id) {
            resetForm();
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="D_Processes"
                title="생산공정"
                description="EU 템플릿의 D_Processes 입력 구조에 맞춰 공정별 생산량, 직접귀속배출, 전력 사용량을 관리합니다."
                actions={
                    <Button type="button" onClick={startNewProcess}>
                        <Plus className="mr-2 h-4 w-4" />
                        공정 추가
                    </Button>
                }
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <StatCard label="등록 공정" value={processes.length} helper="D_Processes 후보" icon={Factory} tone="info" />
                <StatCard label="제품 생산라인" value={summary.outputLineCount} helper={`${summary.outputLineReviewCount}건 확인 필요`} icon={Gauge} tone="pending" />
                <StatCard label="전력 사용량" value={formatNumber(summary.totalElectricity)} helper="MWh" icon={Zap} tone="warning" />
                <StatCard label="배출원 검토" value={summary.sourceStreamReviewCount} helper="직접배출량 차이" icon={Gauge} tone="warning" />
            </div>

            {showForm && (
                <SectionCard
                    title={editingProcessId ? '생산공정 정보 수정' : '신규 생산공정'}
                    description="공정별 생산량과 배출량 데이터를 입력하면 산정결과와 EU Export에 반영됩니다."
                    actions={
                        <Button type="button" variant="secondary" onClick={resetForm}>
                            <X className="mr-2 h-4 w-4" />
                            취소
                        </Button>
                    }
                >
                    <form noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                            <label htmlFor="process-name" className="text-sm font-semibold text-slate-700">공정명</label>
                            <input id="process-name" required className={fieldClass} value={newItem.name} onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} />
                            {errors.name && <p className="mt-1 text-xs font-medium text-red-600">{errors.name}</p>}
                        </div>
                        <div>
                            <label htmlFor="process-route" className="text-sm font-semibold text-slate-700">생산경로(Route)</label>
                            <input id="process-route" required className={fieldClass} value={newItem.production_route} onChange={(event) => setNewItem({ ...newItem, production_route: event.target.value })} />
                            {errors.production_route && <p className="mt-1 text-xs font-medium text-red-600">{errors.production_route}</p>}
                        </div>
                        <div>
                            <label htmlFor="process-period" className="text-sm font-semibold text-slate-700">보고기간</label>
                            <select id="process-period" className={fieldClass} value={newItem.period_id} onChange={(event) => setNewItem({ ...newItem, period_id: event.target.value })}>
                                <option value="">미지정</option>
                                {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
                            </select>
                            {errors.period_id && <p className="mt-1 text-xs font-medium text-red-600">{errors.period_id}</p>}
                        </div>
                        <div>
                            <label htmlFor="process-product" className="text-sm font-semibold text-slate-700">연결 제품</label>
                            <select id="process-product" className={fieldClass} value={newItem.product_id} onChange={(event) => setNewItem({ ...newItem, product_id: event.target.value })}>
                                <option value="">미지정</option>
                                {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.hs_code})</option>)}
                            </select>
                            {errors.product_id && <p className="mt-1 text-xs font-medium text-red-600">{errors.product_id}</p>}
                        </div>
                        <div>
                            <label htmlFor="process-output-mass" className="text-sm font-semibold text-slate-700">총 생산량(t)</label>
                            <input id="process-output-mass" required type="number" min="0" step="0.0001" className={fieldClass} value={newItem.output_mass_t} onChange={(event) => setNewItem({ ...newItem, output_mass_t: toNumber(event.target.value) })} />
                            {errors.output_mass_t && <p className="mt-1 text-xs font-medium text-red-600">{errors.output_mass_t}</p>}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-950">제품 생산라인</h3>
                                    <p className="mt-1 text-xs leading-5 text-slate-600">한 공정에서 여러 제품이 생산되면 제품별 생산량과 배분기준을 입력합니다.</p>
                                </div>
                                <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => setOutputLineDrafts([...outputLineDrafts, createOutputLineDraft(newItem.product_id, 0)])}>
                                    <Plus className="mr-1.5 h-4 w-4" />
                                    라인 추가
                                </Button>
                            </div>
                            <div className="mt-4 space-y-3">
                                {outputLineDrafts.map((line, index) => (
                                    <div key={index} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-3 lg:grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_auto]">
                                        <div>
                                            <label className="text-xs font-semibold text-slate-600">라인명</label>
                                            <input className={fieldClass} value={line.name} placeholder={`제품라인 ${index + 1}`} onChange={(event) => {
                                                const next = [...outputLineDrafts];
                                                next[index] = { ...line, name: event.target.value };
                                                setOutputLineDrafts(next);
                                            }} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-600">제품</label>
                                            <select className={fieldClass} value={line.product_id ?? ''} onChange={(event) => {
                                                const next = [...outputLineDrafts];
                                                next[index] = { ...line, product_id: event.target.value };
                                                setOutputLineDrafts(next);
                                            }}>
                                                <option value="">미지정</option>
                                                {products.map((product) => (
                                                    <option key={product.id} value={product.id}>{product.name} ({product.hs_code})</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-600">생산량(t)</label>
                                            <input type="number" min="0" step="0.0001" className={fieldClass} value={line.output_mass_t} onChange={(event) => {
                                                const next = [...outputLineDrafts];
                                                next[index] = { ...line, output_mass_t: toNumber(event.target.value) };
                                                setOutputLineDrafts(next);
                                            }} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-600">배분기준</label>
                                            <select className={fieldClass} value={line.allocation_basis} onChange={(event) => {
                                                const next = [...outputLineDrafts];
                                                next[index] = { ...line, allocation_basis: event.target.value as OutputLineDraft['allocation_basis'] };
                                                setOutputLineDrafts(next);
                                            }}>
                                                <option value="MASS">질량 기준</option>
                                                <option value="MANUAL">수동 비율</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-600">수동비율(%)</label>
                                            <input type="number" min="0" step="0.0001" className={fieldClass} value={line.manual_allocation_percent} disabled={line.allocation_basis !== 'MANUAL'} onChange={(event) => {
                                                const next = [...outputLineDrafts];
                                                next[index] = { ...line, manual_allocation_percent: toNumber(event.target.value) };
                                                setOutputLineDrafts(next);
                                            }} />
                                        </div>
                                        <div className="flex items-end">
                                            <Button type="button" variant="danger" className="min-h-11 px-3" disabled={outputLineDrafts.length === 1} onClick={() => setOutputLineDrafts(outputLineDrafts.filter((_, itemIndex) => itemIndex !== index))}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">시장 출하량(t)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.market_output_mass_t} onChange={(event) => setNewItem({ ...newItem, market_output_mass_t: toNumber(event.target.value) })} />
                            {errors.market_output_mass_t && <p className="mt-1 text-xs font-medium text-red-600">{errors.market_output_mass_t}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">내부 소비량(t)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.internal_consumption_mass_t} onChange={(event) => setNewItem({ ...newItem, internal_consumption_mass_t: toNumber(event.target.value) })} />
                            {errors.internal_consumption_mass_t && <p className="mt-1 text-xs font-medium text-red-600">{errors.internal_consumption_mass_t}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">직접귀속배출량(tCO2e)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.direct_attributable_emissions_tco2e} onChange={(event) => setNewItem({ ...newItem, direct_attributable_emissions_tco2e: toNumber(event.target.value) })} />
                            {errors.direct_attributable_emissions_tco2e && <p className="mt-1 text-xs font-medium text-red-600">{errors.direct_attributable_emissions_tco2e}</p>}
                        </div>
                        {editingSourceStreamSummary && editingSourceStreamSummary.count > 0 && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 md:col-span-2">
                                <p className="font-semibold">연결된 배출원 자료 합계</p>
                                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                    <div>
                                        <p className="text-xs text-amber-800">배출량</p>
                                        <p className="font-semibold">{formatNumber(editingSourceStreamSummary.emissions)} tCO2e</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-amber-800">에너지</p>
                                        <p className="font-semibold">{formatNumber(editingSourceStreamSummary.energy)} TJ</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-amber-800">현재 차이</p>
                                        <p className="font-semibold">{formatNumber(editingSourceStreamSummary.delta)} tCO2e</p>
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="mt-3"
                                    onClick={() =>
                                        setNewItem({
                                            ...newItem,
                                            direct_attributable_emissions_tco2e: editingSourceStreamSummary.emissions,
                                        })
                                    }
                                >
                                    배출원 합계를 직접배출량에 적용
                                </Button>
                            </div>
                        )}
                        <div>
                            <label className="text-sm font-semibold text-slate-700">전력 사용량(MWh)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.electricity_mwh} onChange={(event) => setNewItem({ ...newItem, electricity_mwh: toNumber(event.target.value) })} />
                            {errors.electricity_mwh && <p className="mt-1 text-xs font-medium text-red-600">{errors.electricity_mwh}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">전력 배출계수(tCO2e/MWh)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.electricity_ef_tco2e_per_mwh} onChange={(event) => setNewItem({ ...newItem, electricity_ef_tco2e_per_mwh: toNumber(event.target.value) })} />
                            {errors.electricity_ef_tco2e_per_mwh && <p className="mt-1 text-xs font-medium text-red-600">{errors.electricity_ef_tco2e_per_mwh}</p>}
                        </div>
                        <div className="md:col-span-3">
                            <Button type="submit">{editingProcessId ? '수정 저장' : '공정 저장'}</Button>
                        </div>
                    </form>
                </SectionCard>
            )}

            <div className="grid grid-cols-1 gap-3 md:hidden">
                {processes.map((process) => {
                    const see = getSee(process);
                    const sourceStreamSummary = getProcessSourceStreamSummary(process);
                    const outputLineSummary = getOutputLineSummary(process);
                    return (
                        <SectionCard key={process.id} className="p-4">
                            <h2 className="text-base font-semibold text-slate-950">{process.name}</h2>
                            <p className="mt-1 text-sm text-slate-500">{process.production_route}</p>
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">제품</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{process.product_id ? productNames.get(process.product_id) ?? '알 수 없음' : '-'}</dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">생산량</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatNumber(process.output_mass_t)}t</dd>
                                </div>
                                <div className={outputLineSummary.needsReview ? 'rounded-xl bg-amber-50 p-3' : 'rounded-xl bg-slate-50 p-3'}>
                                    <dt className={outputLineSummary.needsReview ? 'text-xs text-amber-700' : 'text-xs text-slate-500'}>제품라인</dt>
                                    <dd className={outputLineSummary.needsReview ? 'mt-1 font-semibold text-amber-800' : 'mt-1 font-medium text-slate-900'}>
                                        {outputLineSummary.count}개 / {formatNumber(outputLineSummary.totalOutput)}t
                                    </dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">직접 SEE</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatNumber(see.directSee)}</dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">간접 SEE</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatNumber(see.indirectSee)}</dd>
                                    <dd className={see.indirectApplicability.applicable ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs font-semibold text-amber-700'}>
                                        {see.indirectApplicability.label}
                                    </dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">배출원 합계</dt>
                                    <dd className="mt-1 font-medium text-slate-900">
                                        {sourceStreamSummary.count > 0 ? `${formatNumber(sourceStreamSummary.emissions)} tCO2e` : '-'}
                                    </dd>
                                </div>
                                <div className={sourceStreamSummary.needsReview ? 'rounded-xl bg-amber-50 p-3' : 'rounded-xl bg-slate-50 p-3'}>
                                    <dt className={sourceStreamSummary.needsReview ? 'text-xs text-amber-700' : 'text-xs text-slate-500'}>직접 차이</dt>
                                    <dd className={sourceStreamSummary.needsReview ? 'mt-1 font-semibold text-amber-800' : 'mt-1 font-medium text-slate-900'}>
                                        {sourceStreamSummary.count > 0 ? `${formatNumber(sourceStreamSummary.delta)} tCO2e` : '-'}
                                    </dd>
                                </div>
                            </dl>
                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <Button type="button" variant="secondary" onClick={() => startEditProcess(process)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    수정
                                </Button>
                                <Button type="button" variant="danger" onClick={() => handleDeleteProcess(process)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    삭제
                                </Button>
                            </div>
                        </SectionCard>
                    );
                })}
            </div>

            <DataTable className="hidden md:block">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">공정</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">경로</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">보고기간</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">제품</th>
                            <th className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-slate-900">제품라인</th>
                            <th className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-slate-900">생산량</th>
                            <th className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-slate-900">직접</th>
                            <th className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-slate-900">배출원</th>
                            <th className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-slate-900">간접</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">작업</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {loading ? (
                            <tr><td colSpan={10} className="p-6 text-center text-sm text-slate-500">불러오는 중...</td></tr>
                        ) : processes.length === 0 ? (
                            <tr><td colSpan={10} className="p-6 text-center text-sm text-slate-500">등록된 생산공정이 없습니다.</td></tr>
                        ) : (
                            processes.map((process) => {
                                const see = getSee(process);
                                const sourceStreamSummary = getProcessSourceStreamSummary(process);
                                const outputLineSummary = getOutputLineSummary(process);
                                return (
                                    <tr key={process.id} className="transition hover:bg-slate-50">
                                        <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-950">{process.name}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{process.production_route}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{process.period_id ? periodNames.get(process.period_id) ?? '알 수 없음' : '-'}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{process.product_id ? productNames.get(process.product_id) ?? '알 수 없음' : '-'}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                            <span>{outputLineSummary.count}개</span>
                                            <div className={outputLineSummary.needsReview ? 'text-xs font-semibold text-amber-700' : 'text-xs text-slate-400'}>
                                                {formatNumber(outputLineSummary.totalOutput)}t
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(process.output_mass_t)}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(see.directSee)}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                            {sourceStreamSummary.count > 0 ? (
                                                <>
                                                    <span>{formatNumber(sourceStreamSummary.emissions)} tCO2e</span>
                                                    <div className={sourceStreamSummary.needsReview ? 'text-xs font-semibold text-amber-700' : 'text-xs text-slate-400'}>
                                                        차이 {formatNumber(sourceStreamSummary.delta)}
                                                    </div>
                                                </>
                                            ) : (
                                                '-'
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                            {formatNumber(see.indirectSee)}
                                            <div className={see.indirectApplicability.applicable ? 'text-xs text-slate-400' : 'text-xs font-semibold text-amber-700'}>
                                                {see.indirectApplicability.label}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                                            <div className="flex justify-end gap-2">
                                                <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => startEditProcess(process)}>
                                                    <Pencil className="mr-1.5 h-4 w-4" />
                                                    수정
                                                </Button>
                                                <Button type="button" variant="danger" className="min-h-9 px-3 py-1.5" onClick={() => handleDeleteProcess(process)}>
                                                    <Trash2 className="mr-1.5 h-4 w-4" />
                                                    삭제
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </DataTable>
        </div>
    );
}
