'use client';

import { BeginnerStepHeader, EntryChoice, InlineNotice, beginnerFieldClass } from '@/components/BeginnerFlow';
import {
    createLocalItem,
    getLocalSetting,
    listLocalItems,
    setLocalSetting,
    type Product,
    type ProductOutputLine,
    type ProductionProcess,
    type PurchasedPrecursor,
} from '@/lib/local-db';
import { ArrowRight, Boxes, Check, CircleSlash2, PackagePlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

const PRECURSOR_SETTING_KEY = 'beginner:precursors-applicable';

type Applicability = 'YES' | 'NO' | '';

type Draft = {
    processId: string;
    outputLineId: string;
    periodId: string;
    name: string;
    cnCode: string;
    consumedMass: string;
    directSee: string;
    indirectSee: string;
    source: string;
    productionRoute: string;
    supplierCountry: string;
};

const EMPTY_DRAFT: Draft = {
    processId: '',
    outputLineId: '',
    periodId: '',
    name: '',
    cnCode: '',
    consumedMass: '',
    directSee: '',
    indirectSee: '',
    source: '공급업체 회신자료',
    productionRoute: 'Electric arc furnace',
    supplierCountry: 'South Korea',
};
const PRECURSOR_ROUTES = [
    { value: 'Electric arc furnace', label: '전기로(EAF) 경로' },
    { value: 'Blast furnace-basic oxygen furnace', label: '고로·전로(BF-BOF) 경로' },
    { value: 'Direct reduced iron', label: '직접환원철(DRI) 경로' },
    { value: 'Other', label: '기타 경로' },
] as const;

function toNumber(value: string) {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function BeginnerPrecursors() {
    const router = useRouter();
    const [applicability, setApplicability] = useState<Applicability>('');
    const [products, setProducts] = useState<Product[]>([]);
    const [processes, setProcesses] = useState<ProductionProcess[]>([]);
    const [productOutputLines, setProductOutputLines] = useState<ProductOutputLine[]>([]);
    const [precursors, setPrecursors] = useState<PurchasedPrecursor[]>([]);
    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    async function load() {
        const [productData, processData, periodData, outputLineData, precursorData, savedApplicability] = await Promise.all([
            listLocalItems('products'),
            listLocalItems('processes'),
            listLocalItems('periods'),
            listLocalItems('product_output_lines'),
            listLocalItems('precursors'),
            getLocalSetting<boolean>(PRECURSOR_SETTING_KEY),
        ]);
        setProducts(productData);
        setProcesses(processData);
        setProductOutputLines(outputLineData);
        setPrecursors(precursorData);
        if (savedApplicability !== undefined) setApplicability(savedApplicability ? 'YES' : 'NO');
        setDraft((current) => {
            const processId = current.processId || processData[0]?.id || '';
            const outputLineId = current.outputLineId
                && outputLineData.some((line) => line.id === current.outputLineId && line.process_id === processId)
                ? current.outputLineId
                : outputLineData.find((line) => line.process_id === processId)?.id ?? '';
            return {
                ...current,
                processId,
                outputLineId,
                periodId: current.periodId || periodData[0]?.id || '',
            };
        });
    }

    useEffect(() => {
        void load().catch(() => setError('전구물질 정보를 불러오지 못했습니다.'));
    }, []);

    async function confirmNo() {
        setSaving(true);
        setError('');
        try {
            await setLocalSetting(PRECURSOR_SETTING_KEY, false);
            setMessage('전구물질 없음으로 저장했습니다.');
            router.push('/results');
        } catch {
            setError('선택을 저장하지 못했습니다.');
        } finally {
            setSaving(false);
        }
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const process = processes.find((item) => item.id === draft.processId);
        const outputLine = productOutputLines.find((item) => item.id === draft.outputLineId && item.process_id === process?.id);
        const product = products.find((item) => item.id === (outputLine?.product_id ?? process?.product_id));
        const consumedMass = toNumber(draft.consumedMass);
        const cnCode = draft.cnCode.replace(/\D/g, '').slice(0, 10);

        if (!process || !draft.periodId) {
            setError('사용 공정과 보고기간을 선택하세요.');
            return;
        }
        if (!outputLine || !product) {
            setError('전구물질이 투입되는 산출물을 선택하세요.');
            return;
        }
        if (!draft.productionRoute.trim()) {
            setError('전구물질 생산경로를 선택하세요.');
            return;
        }
        if (!draft.name.trim() || cnCode.length < 4) {
            setError('전구물질명과 CN/HS 코드 4자리 이상을 입력하세요.');
            return;
        }
        if (consumedMass <= 0) {
            setError('공정 투입량은 0보다 커야 합니다.');
            return;
        }
        if (toNumber(draft.directSee) < 0 || toNumber(draft.indirectSee) < 0) {
            setError('배출량은 0 이상이어야 합니다.');
            return;
        }

        setSaving(true);
        setError('');
        try {
            await createLocalItem('precursors', {
                period_id: draft.periodId,
                process_id: process.id,
                product_id: product.id,
                name: draft.name.trim(),
                precursor_cn_code: cnCode,
                aggregated_goods_category: 'Iron or steel products',
                production_route: draft.productionRoute.trim(),
                supplier_country: draft.supplierCountry.trim() || 'South Korea',
                supplier_installation: '',
                data_mode: 'ACTUAL',
                verification_status: 'UNVERIFIED',
                default_value_year: '2026',
                purchased_mass_t: consumedMass,
                consumed_mass_t: consumedMass,
                consumed_for_non_cbam_mass_t: 0,
                direct_see_tco2e_per_t: toNumber(draft.directSee),
                indirect_see_tco2e_per_t: toNumber(draft.indirectSee),
                source: draft.source.trim() || '공급업체 회신자료',
                default_value_justification: '',
                output_allocations: [{
                    product_output_line_id: outputLine.id,
                    product_id: product.id,
                    allocated_mass_t: consumedMass,
                    allocation_percent: 100,
                    note: '초보자 화면에서 지정한 산출물 귀속',
                }],
            });
            await setLocalSetting(PRECURSOR_SETTING_KEY, true);
            setMessage('전구물질을 저장했습니다.');
            setDraft({ ...EMPTY_DRAFT, processId: process.id, periodId: draft.periodId, outputLineId: outputLine.id, productionRoute: draft.productionRoute, supplierCountry: draft.supplierCountry });
            await load();
        } catch {
            setError('전구물질을 저장하지 못했습니다.');
        } finally {
            setSaving(false);
        }
    }

    const availableOutputLines = productOutputLines.filter((line) => line.process_id === draft.processId);
    return (
        <div className="space-y-6">
            <BeginnerStepHeader current={5} title="전구물질 확인" description="구매한 CBAM 대상 원재료를 생산에 사용했는지만 먼저 확인하세요." advancedHref="/precursors?advanced=1" />

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-xl font-bold text-slate-950">구매 전구물질이 있나요?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">예: 외부에서 구매한 선철, 조강, 슬래브, 빌릿 등 CBAM 대상 중간재</p>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <EntryChoice icon={PackagePlus} title="예, 사용했습니다" description="공급업체가 제공한 배출량과 투입량을 입력합니다." selected={applicability === 'YES'} onClick={() => { setApplicability('YES'); setError(''); }} />
                    <EntryChoice icon={CircleSlash2} title="아니요, 없습니다" description="이 단계는 건너뛰고 산정 결과로 이동합니다." selected={applicability === 'NO'} onClick={() => { setApplicability('NO'); setError(''); }} />
                </div>
            </section>

            {applicability === 'NO' && (
                <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                        <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-white text-emerald-800"><Check className="h-5 w-5" /></span>
                        <div>
                            <h2 className="text-lg font-bold text-emerald-950">추가 입력이 필요하지 않습니다</h2>
                            <p className="mt-1 text-sm leading-6 text-emerald-900">선택을 저장하면 검증 및 산정 결과로 이동합니다.</p>
                        </div>
                    </div>
                    <button type="button" onClick={() => void confirmNo()} disabled={saving} className="mt-5 inline-flex min-h-11 items-center rounded-md bg-[#123D32] px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? '저장 중...' : '없음으로 저장하고 결과 보기'}<ArrowRight className="ml-2 h-4 w-4" /></button>
                </section>
            )}

            {applicability === 'YES' && (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 p-5 sm:p-6">
                            <h2 className="text-xl font-bold text-slate-950">전구물질 1개 입력</h2>
                            <p className="mt-1 text-sm text-slate-600">공급업체 회신자료를 보면서 입력하세요.</p>
                        </div>
                        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
                            <label className="block sm:col-span-2">
                                <span className="text-sm font-semibold text-slate-700">사용 공정 <span className="text-red-600">*</span></span>
                                <select
                                    value={draft.processId}
                                    onChange={(event) => { const process = processes.find((item) => item.id === event.target.value); const outputLine = productOutputLines.find((line) => line.process_id === event.target.value); setDraft((current) => ({ ...current, processId: event.target.value, outputLineId: outputLine?.id ?? '', periodId: process?.period_id || current.periodId })); }}
                                    className={beginnerFieldClass}
                                >
                                    <option value="">선택하세요</option>
                                    {processes.map((process) => <option key={process.id} value={process.id}>{process.name}</option>)}
                                </select>
                            </label>
                            <label className="block sm:col-span-2">
                                <span className="text-sm font-semibold text-slate-700">귀속 산출물 <span className="text-red-600">*</span></span>
                                <select value={draft.outputLineId} onChange={(event) => setDraft((current) => ({ ...current, outputLineId: event.target.value }))} className={beginnerFieldClass}>
                                    <option value="">이 전구물질이 투입되는 산출물을 선택하세요</option>
                                    {availableOutputLines.map((line) => <option key={line.id} value={line.id}>{line.name} · {line.output_mass_t.toLocaleString('ko-KR')} tonne</option>)}
                                </select>
                                <span className="mt-2 block text-xs leading-5 text-slate-500">공동산출물이 있어도 선택한 산출물에만 전구물질 배출량이 귀속됩니다.</span>
                            </label>
                            <label className="block"><span className="text-sm font-semibold text-slate-700">전구물질명 <span className="text-red-600">*</span></span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="예: 철강 슬래브" className={beginnerFieldClass} /></label>
                            <label className="block"><span className="text-sm font-semibold text-slate-700">CN/HS 코드 <span className="text-red-600">*</span></span><input value={draft.cnCode} onChange={(event) => setDraft((current) => ({ ...current, cnCode: event.target.value.replace(/\D/g, '').slice(0, 10) }))} inputMode="numeric" placeholder="예: 720712" className={beginnerFieldClass} /></label>
                            <label className="block"><span className="text-sm font-semibold text-slate-700">전구물질 생산경로 <span className="text-red-600">*</span></span><select value={draft.productionRoute} onChange={(event) => setDraft((current) => ({ ...current, productionRoute: event.target.value }))} className={beginnerFieldClass}>{PRECURSOR_ROUTES.map((route) => <option key={route.value} value={route.value}>{route.label}</option>)}</select></label>
                            <label className="block"><span className="text-sm font-semibold text-slate-700">공급국가</span><input value={draft.supplierCountry} onChange={(event) => setDraft((current) => ({ ...current, supplierCountry: event.target.value }))} placeholder="예: South Korea" className={beginnerFieldClass} /></label>
                            <label className="block"><span className="text-sm font-semibold text-slate-700">공정 투입량 <span className="text-red-600">*</span></span><div className="relative"><input value={draft.consumedMass} onChange={(event) => setDraft((current) => ({ ...current, consumedMass: event.target.value }))} inputMode="decimal" className={`${beginnerFieldClass} pr-20`} /><span className="absolute right-3 top-5 text-sm text-slate-500">tonne</span></div></label>
                            <label className="block"><span className="text-sm font-semibold text-slate-700">근거 자료명</span><input value={draft.source} onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))} className={beginnerFieldClass} /></label>
                            <label className="block"><span className="text-sm font-semibold text-slate-700">직접 SEE</span><div className="relative"><input value={draft.directSee} onChange={(event) => setDraft((current) => ({ ...current, directSee: event.target.value }))} inputMode="decimal" className={`${beginnerFieldClass} pr-24`} /><span className="absolute right-3 top-5 text-xs text-slate-500">tCO2e/t</span></div></label>
                            <label className="block"><span className="text-sm font-semibold text-slate-700">간접 SEE</span><div className="relative"><input value={draft.indirectSee} onChange={(event) => setDraft((current) => ({ ...current, indirectSee: event.target.value }))} inputMode="decimal" className={`${beginnerFieldClass} pr-24`} /><span className="absolute right-3 top-5 text-xs text-slate-500">tCO2e/t</span></div></label>
                        </div>
                        <div className="space-y-3 border-t border-slate-200 p-5 sm:p-6">
                            {error && <InlineNotice tone="danger">{error}</InlineNotice>}
                            {message && <InlineNotice tone="success">{message}</InlineNotice>}
                            <div className="flex justify-end"><button type="submit" disabled={saving || processes.length === 0} className="min-h-11 rounded-md bg-[#123D32] px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? '저장 중...' : '전구물질 저장'}</button></div>
                        </div>
                    </form>

                    <aside className="h-fit rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-24">
                        <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-950">등록 현황</h2><Boxes className="h-5 w-5 text-emerald-800" /></div>
                        <p className="mt-4 text-3xl font-bold text-slate-950">{precursors.length}<span className="ml-1 text-base text-slate-500">개</span></p>
                        <div className="mt-4 space-y-2">{precursors.slice(0, 4).map((precursor) => <div key={precursor.id} className="rounded-md border border-slate-200 p-3"><p className="font-semibold text-slate-800">{precursor.name}</p><p className="mt-1 text-xs text-slate-500">{precursor.consumed_mass_t.toLocaleString('ko-KR')} tonne · {precursor.production_route || '경로 미입력'}</p></div>)}</div>
                        <Link href="/results" className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[#123D32] px-4 text-sm font-bold text-white">산정 결과 보기 <ArrowRight className="ml-2 h-4 w-4" /></Link>
                    </aside>
                </div>
            )}

            {applicability === '' && error && <InlineNotice tone="danger">{error}</InlineNotice>}
        </div>
    );
}
