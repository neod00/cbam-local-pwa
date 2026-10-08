'use client';

import { CumulativeBar } from '@/components/guided/CumulativeBar';
import { ElectricitySplit } from '@/components/guided/ElectricitySplit';
import { FuelSplit } from '@/components/guided/FuelSplit';
import { SharedHeat } from '@/components/guided/SharedHeat';
import { Button } from '@/components/ui';
import { calculateLocalResults } from '@/lib/calculation-engine';
import { summarizeEnergySplits } from '@/lib/energy-split-summary';
import { evaluateEuExportReadiness, getEuExportIssueEditHref } from '@/lib/eu-template-export';
import { describeFuelEditBlock, ELECTRICITY_DEFAULT_EF_SOURCE, ELECTRICITY_EF_SOURCE_OPTIONS, ELECTRICITY_PLACEHOLDER_EF, TALK_FUEL_KINDS } from '@/lib/conversation-energy';
import { describePrecursorEditBlock, fillEuDefault, precursorAnswerFromExisting, type DefaultFill } from '@/lib/conversation-precursor';
import { defaultProcessName, describeOutputEditBlock } from '@/lib/conversation-process';
import { EXPORT_PERIOD_SETTING_KEY, getLocalSetting, listLocalItems, type Installation, type InternalTransfer, type Product, type ProductionProcess, type ProductOutputLine, type PurchasedPrecursor, type ReportingPeriod, type SourceStream } from '@/lib/local-db';
import { FACTOR_SOURCE_TYPE_OPTIONS, matchGuidedStreamKind } from '@/lib/source-stream-input';
import type { ImportedDefaultValueReference } from '@/lib/reference-workbooks';
import { getProductReportingScope, isCbamReportingScope } from '@/lib/reporting-scope';
import { buildSeeFlowBinding } from '@/lib/see-flow';
import { PRODUCT_FAMILY_PRESETS, findDetailPreset, findDetailPresetForProduct, findFamilyPreset, getCalculationSetupForDetail } from '@/lib/product-family-presets';
import { deriveTalkState, describeCnInput, describeDuplicateCn, describeTalkPartial, pickFocusProcess, pickFocusProductId, talkSkipKey, yearlyPeriodDraft, type TalkQuestionId } from '@/lib/talk-flow';
import { summarizeTalkResult, type TalkIssue } from '@/lib/talk-summary';
import { AlertTriangle, ArrowRight, CheckCircle2, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmNoImportedHeat, confirmNoPrecursors, saveCompany, saveElectricity, saveFuel, saveFuelEdit, saveOutput, saveOutputEdit, savePeriod, savePrecursor, savePrecursorEdit, saveProduct } from './talk-writes';

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

interface TalkData {
    loaded: boolean;
    installations: Installation[];
    periods: ReportingPeriod[];
    products: Product[];
    processes: ProductionProcess[];
    precursors: PurchasedPrecursor[];
    sourceStreams: SourceStream[];
    /** 생산량 고치기가 단순한 경우인지 보려고(제품 라인·사내 이송) */
    productOutputLines: ProductOutputLine[];
    internalTransfers: InternalTransfer[];
    /** EU 문서를 만들기 전에 막거나 알릴 항목 — 지도 7단계와 같은 준비도 검사 */
    issues: TalkIssue[];
    /** 막대용 — 지도 화면과 같은 엔진으로 계산한 결과(첫 보고기간 것만) */
    results: ReturnType<typeof calculateLocalResults>;
}

const EDIT_EXISTING = 'edit-existing';
const SKIPPED_NOTE: Record<TalkQuestionId, string> = {
    company: '회사·공장은 질문 1에서 입력할 수 있습니다',
    period: '보고기간은 질문 2에서 입력할 수 있습니다',
    product: '제품은 질문 3에서 입력할 수 있습니다',
    output: '생산량은 지도 3단계에서 입력할 수 있습니다',
    precursor: '구매 강재는 지도 6단계에서 입력할 수 있습니다',
    fuel: '연료는 지도 4단계에서 입력할 수 있습니다',
    electricity: '전력은 지도 5단계에서 입력할 수 있습니다',
    heat: '밖에서 산 스팀·온수는 지도 4단계 아래쪽에서 답할 수 있습니다',
};
const MAP_STEP_OF: Partial<Record<TalkQuestionId, string>> = { output: '3', precursor: '6', fuel: '4', electricity: '5', heat: '4' };
const EMPTY: TalkData = { loaded: false, installations: [], periods: [], products: [], processes: [], precursors: [], sourceStreams: [], productOutputLines: [], internalTransfers: [], issues: [], results: [] };

/**
 * 저장소는 제품·공정을 만든 순서가 아니라 id(무작위) 순으로 돌려준다. 이 화면은 「첫 제품」과 「나중에 만든 제품」을 구분해야 하므로(S6)
 * 만든 순서(created_at, 같으면 id)로 고정한다 — 안 하면 방금 만든 둘째 제품이 첫 제품으로 보여 질문이 끝난 것처럼 된다.
 */
const byCreation = <T extends { created_at: string; id: string }>(rows: T[]): T[] => [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

async function loadTalkData(): Promise<TalkData> {
    const [installations, periods, rawProducts, rawProcesses, productOutputLines, sourceStreams, precursors, internalTransfers] = await Promise.all([
        listLocalItems('installations'),
        listLocalItems('periods'),
        listLocalItems('products'),
        listLocalItems('processes'),
        listLocalItems('product_output_lines'),
        listLocalItems('source_streams'),
        listLocalItems('precursors'),
        listLocalItems('internal_transfers'),
    ]);
    const allProducts = byCreation(rawProducts);
    const processes = byCreation(rawProcesses);
    // 막대는 지도 화면과 같은 엔진·같은 집계로 그린다(자체 산술 없음). 이 화면은 첫 보고기간만 다룬다.
    const results = calculateLocalResults({ internalTransfers, products: allProducts, periods, processes, productOutputLines, sourceStreams, precursors })
        .filter((result) => periods.length <= 1 || result.period_id === periods[0]?.id);
    // 지도 7단계와 같은 준비도 검사(고른 보고기간을 넘긴다 — 안 넘기면 어느 기간이 나가는지 아무도 검사하지 않는다).
    const reportingPeriodId = await getLocalSetting<string>(EXPORT_PERIOD_SETTING_KEY);
    const readiness = evaluateEuExportReadiness({ internalTransfers, periods, reportingPeriodId, products: allProducts, processes, productOutputLines, sourceStreams, precursors, installations });
    const issues: TalkIssue[] = readiness.issues.map((issue) => ({ severity: issue.severity === 'error' ? 'error' : 'warning', area: issue.area, message: issue.message, href: getEuExportIssueEditHref(issue) }));
    return {
        loaded: true,
        installations,
        periods,
        processes,
        precursors,
        sourceStreams,
        productOutputLines,
        internalTransfers,
        issues,
        results,
        products: allProducts.filter((product) => isCbamReportingScope(getProductReportingScope(product))),
    };
}

/**
 * 질문으로 입력 — S1~S5: 사업장 → 보고기간 → 무엇을 만드시나요(제품군 → CN) → 생산량 → 구매한 강재 → 연료 → 전력 → 밖에서 산 열.
 * 한 번에 질문 하나. 답은 칩으로 남고, 칩의 「고치기」로 그 질문만 다시 연다. 저장은 talk-writes.ts 하나를 거친다.
 */
export function TalkWorkspace() {
    const [data, setData] = useState<TalkData>(EMPTY);
    const [editing, setEditing] = useState<TalkQuestionId | null>(null);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    // 입력칸
    const [companyName, setCompanyName] = useState('');
    const [country, setCountry] = useState('');
    const [periodName, setPeriodName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [familyId, setFamilyId] = useState('');
    const [detailId, setDetailId] = useState('');
    const [productName, setProductName] = useState('');
    const [cn, setCn] = useState('');
    const [mass, setMass] = useState('');
    const [scrap, setScrap] = useState('');
    const [processName, setProcessName] = useState('');
    // 「나중에 입력」으로 건너뛴 질문 — 저장하지 않는다(다시 열면 다시 묻는다). 제품마다 따로 기억한다(talkSkipKey).
    const [skipped, setSkipped] = useState<string[]>([]);
    // 지금 묻는 제품을 사용자가 고른 것(없으면 남은 질문이 있는 첫 제품) / 「다른 제품도」 입력 중
    const [focusId, setFocusId] = useState<string>();
    const [addingProduct, setAddingProduct] = useState(false);
    // 구매 강재(S3)
    const [reference, setReference] = useState<ImportedDefaultValueReference>();
    const [addingPrecursor, setAddingPrecursor] = useState(false);
    const [hasPrecursors, setHasPrecursors] = useState<boolean | null>(null);
    const [pName, setPName] = useState('');
    const [pCn, setPCn] = useState('');
    const [pConsumed, setPConsumed] = useState('');
    const [pPurchased, setPPurchased] = useState('');
    const [pCountry, setPCountry] = useState('');
    const [pMode, setPMode] = useState<'' | 'ACTUAL' | 'DEFAULT'>('');
    const [pDirect, setPDirect] = useState('');
    const [pIndirect, setPIndirect] = useState('');
    const [pSource, setPSource] = useState('');
    const [pFill, setPFill] = useState<DefaultFill | null>(null);
    // 연료(S4)
    const [fuelKindKey, setFuelKindKey] = useState(TALK_FUEL_KINDS[0].key);
    const [fuelAmount, setFuelAmount] = useState('');
    const [fuelName, setFuelName] = useState('');
    const [fuelNcv, setFuelNcv] = useState(String(TALK_FUEL_KINDS[0].defaults.ncv_gj_per_unit));
    const [fuelFactor, setFuelFactor] = useState(String(TALK_FUEL_KINDS[0].defaults.emission_factor_tco2e_per_unit));
    // 지도 4단계와 같다 — 처음엔 「분류 전」이고 유형을 바꿀 때 그 유형의 기본 분류가 들어간다(숨겨 두면 앱이 근거를 대신 주장하게 된다).
    const [fuelFactorSource, setFuelFactorSource] = useState<SourceStream['factor_source_type']>('UNCLASSIFIED');
    const [fuelSource, setFuelSource] = useState('');
    const [addingFuel, setAddingFuel] = useState(false);
    // 고치는 중인 연료·구매 강재 하나(고르기 전에는 빈 값)
    const [editItemId, setEditItemId] = useState('');
    // 전력(S4)
    const [elecMwh, setElecMwh] = useState('');
    const [elecEf, setElecEf] = useState(String(ELECTRICITY_PLACEHOLDER_EF));
    const [elecSource, setElecSource] = useState<string>(ELECTRICITY_DEFAULT_EF_SOURCE);

    const reload = useCallback(async () => {
        setData(await loadTalkData());
    }, []);

    useEffect(() => {
        let active = true;
        loadTalkData()
            .then((loaded) => {
                if (active) {
                    setData(loaded);
                }
            })
            .catch((error) => {
                console.error('[CBAM] 질문 화면이 저장된 자료를 읽지 못했습니다', error);
                if (active) {
                    setData({ ...EMPTY, loaded: true });
                    setMessage('저장된 자료를 읽지 못했습니다. 브라우저를 완전히 닫았다가 다시 열어 보세요. 새로 입력하지 마세요.');
                }
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let active = true;
        getLocalSetting<ImportedDefaultValueReference>('reference:default-values').then((value) => {
            if (active) setReference(value);
        });
        return () => {
            active = false;
        };
    }, []);

    // 제품이 여럿일 수 있다(S6): 질문 5~8은 「지금 묻는 제품」의 공정에 붙는다. 전체 현황(overview)으로 어느 제품에 남은 질문이 있는지 보고 고른다.
    const overview = useMemo(() => deriveTalkState(data), [data]);
    const focusProductId = pickFocusProductId(overview.products, skipped, focusId);
    const state = useMemo(() => deriveTalkState({ ...data, focusProductId }), [data, focusProductId]);
    const focusProduct = data.products.find((product) => product.id === focusProductId) ?? data.products[0];
    const skip = (id: TalkQuestionId) => setSkipped((list) => [...list, talkSkipKey(focusProductId, id)]);
    const binding = useMemo(() => buildSeeFlowBinding(data.results), [data.results]);
    // 「나중에 입력」으로 넘긴 질문은 이번 화면에서만 건너뛴다(저장하지 않는다 — 다시 열면 다시 묻는다).
    const current = state.pending.find((id) => !skipped.includes(talkSkipKey(focusProductId, id)));
    const question: TalkQuestionId | undefined = editing ?? (addingProduct ? 'product' : addingPrecursor ? 'precursor' : addingFuel ? 'fuel' : current);
    const periodProcesses = data.processes.filter((process) => process.period_id === data.periods[0]?.id);
    const focusProcess = pickFocusProcess(periodProcesses, data.products, focusProduct);
    // 칩으로 고칠 수 있는 단순한 경우(S7). 아니면 칩은 지도 화면 링크로 남는다(이유는 칩 설명에).
    const focusLines = data.productOutputLines.filter((line) => line.process_id === focusProcess?.id);
    const outputBlock = focusProcess ? describeOutputEditBlock({ process: focusProcess, lines: data.productOutputLines, transfers: data.internalTransfers }) : '공정이 없습니다.';
    const productLine = focusLines.find((line) => line.activity_level_role !== 'EXCLUDED');
    const excludedLine = focusLines.find((line) => line.activity_level_role === 'EXCLUDED');
    const fuelEditables = data.sourceStreams.filter((stream) => stream.process_id === focusProcess?.id && !describeFuelEditBlock(stream));
    const precursorEditables = data.precursors.filter((precursor) => precursor.process_id === focusProcess?.id && !describePrecursorEditBlock(precursor));
    const editingStream = data.sourceStreams.find((stream) => stream.id === editItemId);
    const editingPrecursor = data.precursors.find((precursor) => precursor.id === editItemId);
    // 한 제품이라도 생산량·구매 강재·연료/전력이 비었으면 막대의 숫자는 일부일 뿐이다(제품이 하나일 때와 같은 문안).
    const barPartial = describeTalkPartial({ products: data.products, processes: periodProcesses, precursors: data.precursors, sourceStreams: data.sourceStreams });
    const summary = useMemo(() => summarizeTalkResult({ binding, issues: data.issues, partialNote: barPartial }), [binding, data.issues, barPartial]);
    const energySplit = useMemo(() => summarizeEnergySplits({ processes: periodProcesses, sourceStreams: data.sourceStreams }), [periodProcesses, data.sourceStreams]);
    const countries = useMemo(() => Array.from(new Set((reference?.rows ?? []).map((row) => row.country))).filter((name) => !name.startsWith('_')).sort((a, b) => a.localeCompare(b)), [reference]);
    const fuelKind = TALK_FUEL_KINDS.find((item) => item.key === fuelKindKey) ?? TALK_FUEL_KINDS[0];
    const precursorSetup = getCalculationSetupForDetail(focusProduct ? findDetailPresetForProduct(focusProduct) : undefined);
    const massNumber = Number(mass.replace(/,/g, ''));
    const scrapNumber = scrap.trim() === '' ? 0 : Number(scrap.replace(/,/g, ''));
    const family = findFamilyPreset(familyId);
    const detail = findDetailPreset(familyId, detailId);
    const cnDigits = cn.replace(/\D/g, '');
    const cnHint = describeCnInput(cnDigits, detail?.cnCandidates.map((candidate) => candidate.code) ?? []);
    // 둘째 제품이 이미 입력한 제품과 CN이 같으면 알린다(막지 않는다). 고치는 중이면 자기 자신은 뺀다.
    const duplicateCn = describeDuplicateCn(cnDigits, overview.products.filter((item) => addingProduct || item.id !== focusProductId));

    function startAddingProduct() {
        setMessage('');
        setFamilyId('');
        setDetailId('');
        setProductName('');
        setCn('');
        setAddingProduct(true);
    }

    function cancelProductForm() {
        setEditing(null);
        setAddingProduct(false);
        setFamilyId('');
        setDetailId('');
        setProductName('');
        setCn('');
    }

    function resetPrecursorForm() {
        setPName('');
        setPCn('');
        setPConsumed('');
        setPPurchased('');
        setPCountry('');
        setPMode('');
        setPDirect('');
        setPIndirect('');
        setPSource('');
        setPFill(null);
        setHasPrecursors(null);
        setAddingPrecursor(false);
        setEditItemId('');
        setEditing(null);
    }

    function submitPrecursor() {
        if (!focusProcess) return;
        if (pMode === '') {
            setMessage('SEE 값을 어떻게 하시겠어요? 「공급사가 준 값이 있어요」나 「모르겠어요」를 고르세요.');
            return;
        }
        // 고치는 중이고 기본값 그대로(CN·공급국가도 안 바꿈)면 저장된 SEE 값을 그대로 쓴다. 바뀌었으면 새 기본값을 채워야 한다.
        const defaultKeyChanged = !editingPrecursor || editingPrecursor.data_mode !== 'DEFAULT'
            || pCn.replace(/\D/g, '') !== (editingPrecursor.precursor_cn_code ?? '') || pCountry !== (editingPrecursor.supplier_country ?? '');
        if (pMode === 'DEFAULT' && !pFill?.ok && defaultKeyChanged) {
            setMessage('먼저 「EU 기본값 채우기」를 누르세요.');
            return;
        }
        const fill = pFill?.ok ? pFill : null;
        void submit(async () => {
            const answer = {
                name: pName,
                cn: pCn,
                consumed: pConsumed,
                purchased: pPurchased,
                country: pCountry,
                mode: pMode,
                directSee: pMode === 'DEFAULT' && fill ? String(fill.direct) : pDirect,
                indirectSee: pMode === 'DEFAULT' && fill ? String(fill.indirect) : pIndirect,
                source: pMode === 'DEFAULT' && fill ? fill.source : pSource,
                justification: pMode === 'DEFAULT' && fill ? fill.justification : (editingPrecursor ? precursorAnswerFromExisting(editingPrecursor).justification : ''),
            };
            if (editingPrecursor) {
                const editError = await savePrecursorEdit(editingPrecursor, answer);
                if (!editError) resetPrecursorForm();
                return editError;
            }
            const error = await savePrecursor(focusProcess, {
                name: pName,
                cn: pCn,
                consumed: pConsumed,
                purchased: pPurchased,
                country: pCountry,
                mode: pMode,
                directSee: pMode === 'DEFAULT' && fill ? String(fill.direct) : pDirect,
                indirectSee: pMode === 'DEFAULT' && fill ? String(fill.indirect) : pIndirect,
                source: pMode === 'DEFAULT' && fill ? fill.source : pSource,
                justification: pMode === 'DEFAULT' && fill ? fill.justification : '',
            });
            if (!error) resetPrecursorForm();
            return error;
        });
    }

    /** 저장이 끝나면 입력칸을 비운다 — 다음 제품의 같은 질문에 앞 제품의 값이 미리 채워져 보이면 그대로 답하기 쉽다 */
    function resetOutputForm() {
        setMass('');
        setScrap('');
        setProcessName('');
    }

    function resetElectricityForm() {
        setElecMwh('');
        setElecEf(String(ELECTRICITY_PLACEHOLDER_EF));
        setElecSource(ELECTRICITY_DEFAULT_EF_SOURCE);
    }

    function resetFuelForm() {
        setFuelAmount('');
        setFuelName('');
        setFuelSource('');
        setAddingFuel(false);
        setEditItemId('');
        setEditing(null);
    }

    function chooseFuelKind(key: string) {
        const next = TALK_FUEL_KINDS.find((item) => item.key === key) ?? TALK_FUEL_KINDS[0];
        setFuelKindKey(next.key);
        setFuelNcv(String(next.defaults.ncv_gj_per_unit));
        setFuelFactor(String(next.defaults.emission_factor_tco2e_per_unit));
        setFuelFactorSource(next.defaults.factor_source_type);
        setMessage('');
    }

    /** 저장된 연료를 고치기 칸에 채운다 — 지도 4단계 startEdit과 같은 값(유형은 저장된 것에서 되짚는다) */
    function loadFuelEdit(stream: SourceStream) {
        const kind = matchGuidedStreamKind(stream);
        setFuelKindKey(TALK_FUEL_KINDS.some((item) => item.key === kind.key) ? kind.key : TALK_FUEL_KINDS[0].key);
        setFuelAmount(String(stream.activity_data));
        setFuelName(stream.name);
        setFuelNcv(String(stream.ncv_gj_per_unit));
        setFuelFactor(String(stream.emission_factor_tco2e_per_unit));
        setFuelFactorSource(stream.factor_source_type ?? 'UNCLASSIFIED');
        setFuelSource(stream.source);
        setEditItemId(stream.id);
        setMessage('');
    }

    function loadPrecursorEdit(precursor: PurchasedPrecursor) {
        const answer = precursorAnswerFromExisting(precursor);
        setPName(answer.name);
        setPCn(answer.cn);
        setPConsumed(answer.consumed);
        setPPurchased(answer.purchased);
        setPCountry(answer.country);
        setPMode(answer.mode);
        setPDirect(answer.directSee);
        setPIndirect(answer.indirectSee);
        setPSource(answer.source);
        setPFill(null);
        setHasPrecursors(true);
        setEditItemId(precursor.id);
        setMessage('');
    }

    function openEditor(id: TalkQuestionId) {
        setMessage('');
        setEditing(id);
        if (id === 'company') {
            setCompanyName(data.installations[0]?.name ?? '');
            setCountry(data.installations[0]?.country ?? '');
        } else if (id === 'output') {
            setMass(focusProcess ? String(focusProcess.output_mass_t) : '');
            setScrap(excludedLine ? String(excludedLine.output_mass_t) : '');
            setProcessName(focusProcess?.name ?? '');
        } else if (id === 'fuel') {
            setEditItemId('');
            if (fuelEditables.length === 1) loadFuelEdit(fuelEditables[0]);
        } else if (id === 'precursor') {
            setEditItemId('');
            if (precursorEditables.length === 1) loadPrecursorEdit(precursorEditables[0]);
        } else if (id === 'electricity') {
            // 지도 5단계의 수정과 같은 저장(buildElectricityUpdate)을 쓴다. 공용 계량기에서 나눈 값은 여기서 고치지 않는다(칩이 지도로 안내).
            setElecMwh(focusProcess && focusProcess.electricity_mwh > 0 ? String(focusProcess.electricity_mwh) : '');
            setElecEf(String(focusProcess?.electricity_ef_tco2e_per_mwh || ELECTRICITY_PLACEHOLDER_EF));
            setElecSource(focusProcess?.electricity_ef_source ?? ELECTRICITY_DEFAULT_EF_SOURCE);
        } else if (id === 'period') {
            setPeriodName(data.periods[0]?.name ?? '');
            setStartDate(data.periods[0]?.start_date ?? '');
            setEndDate(data.periods[0]?.end_date ?? '');
        } else {
            // 이미 답한 제품은 이름·CN 칸을 바로 연다(제품군 고르기를 다시 시키지 않는다). 처음이면 제품군부터 묻는다.
            setFamilyId(focusProduct ? EDIT_EXISTING : '');
            setDetailId('');
            setProductName(focusProduct?.name ?? '');
            setCn(focusProduct?.cn_code ?? '');
        }
    }

    async function submit(action: () => Promise<string | null>) {
        setBusy(true);
        setMessage('');
        try {
            const error = await action();
            if (error) {
                setMessage(error);
                return;
            }
            setEditing(null);
            await reload();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '저장하지 못했습니다.');
        } finally {
            setBusy(false);
        }
    }

    const editingExisting = familyId === EDIT_EXISTING;
    const showFamilyStep = question === 'product' && !family && !editingExisting;
    const showDetailStep = question === 'product' && family && family.details.length > 1 && !detail;

    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-lg font-bold tracking-tight text-slate-950">질문에 답만 하면 됩니다</h1>
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">시험 버전 · 사업장·기간·제품(여러 개 가능)·생산량·구매 강재·연료·전력까지</span>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                    한 번에 질문 하나씩 묻습니다. 답은 지도 화면과 <span className="font-semibold">같은 곳</span>에 저장되어서, 언제든 지도 화면으로 넘어가도 입력한 내용은 그대로입니다.
                    질문이 끝나면 아래에 지금까지의 결과가 나오고, 공정이 둘 이상이면 같이 쓴 에너지 나누기도 여기서 할 수 있습니다. 남은 일은 「할 일」에서, 파일은 「제출」에서 받습니다.
                </p>
            </header>

            {!data.loaded && <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">저장된 자료를 읽는 중입니다…</p>}

            {data.loaded && state.chips.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="지금까지의 답">
                    {state.chips.map((chip) => (chip.id === 'output' && Boolean(outputBlock)) || (chip.id === 'precursor' && precursorEditables.length === 0) || (chip.id === 'fuel' && fuelEditables.length === 0) || chip.id === 'heat' || (chip.id === 'electricity' && Boolean(focusProcess?.electricity_shared_meter)) ? (
                        <li key={chip.id}>
                            <Link
                                href="/"
                                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:border-emerald-400"
                                aria-label={`${chip.title}은(는) 지도 화면에서 고칩니다`}
                                title={`${chip.title} 고치기는 지도 화면 ${MAP_STEP_OF[chip.id] ?? ''}단계에서 합니다`}
                            >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span className="text-emerald-700">{chip.title}</span> {chip.answer}
                                <span className="text-[10px] font-bold text-emerald-600">고치기: 지도 {MAP_STEP_OF[chip.id]}단계</span>
                            </Link>
                        </li>
                    ) : (
                        <li key={chip.id}>
                            <button
                                type="button"
                                onClick={() => openEditor(chip.id)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:border-emerald-400"
                                aria-label={`${chip.title} 고치기`}
                            >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span className="text-emerald-700">{chip.title}</span> {chip.answer}
                                <Pencil className="h-3 w-3 text-emerald-600" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {data.loaded && data.products.length >= 2 && (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="제품 고르기" data-testid="talk-products">
                    <span className="text-xs font-semibold text-slate-500">제품</span>
                    {state.products.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            aria-pressed={item.id === focusProductId && !addingProduct}
                            onClick={() => { setFocusId(item.id); setEditing(null); setAddingProduct(false); setAddingFuel(false); setAddingPrecursor(false); setMessage(''); }}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${item.id === focusProductId && !addingProduct ? 'border-teal-500 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-400'}`}
                        >
                            {item.name} · CN {item.cnCode || '—'}{item.pending.length > 0 ? ` · 남은 질문 ${item.pending.length}개` : ' · 완료'}
                        </button>
                    ))}
                </div>
            )}

            {data.loaded && (state.more.installations > 0 || state.more.periods > 0) && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                    사업장이나 보고기간이 더 있습니다. 이 화면은 첫 번째만 다룹니다 — 나머지는 지도 화면에서 보고 고칠 수 있습니다.
                </p>
            )}

            {data.loaded && question === 'company' && (
                <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm" aria-label="질문 회사·공장">
                    <p className="text-xs font-bold text-teal-800">질문 1</p>
                    <h2 className="mt-1 text-base font-bold text-slate-950">어느 회사(공장)의 자료인가요?</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">EU 문서에 이 이름이 그대로 나갑니다. 영문명이 있으면 영문으로 적으세요 (예: Hankuk Steel Gimpo Plant).</p>
                    <label className="mt-3 block text-sm font-semibold text-slate-700">
                        회사·공장 이름
                        <input className={fieldClass} value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Daeil Fastener Co." />
                    </label>
                    <label className="mt-3 block text-sm font-semibold text-slate-700">
                        국가 (2자리 코드)
                        <div className="mt-1 flex items-center gap-2">
                            <input className={`${fieldClass} !mt-0 max-w-28`} value={country} onChange={(event) => setCountry(event.target.value)} placeholder="KR" maxLength={2} />
                            <button type="button" onClick={() => setCountry('KR')} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-teal-300">KR 대한민국</button>
                        </div>
                    </label>
                    <Footer busy={busy} message={message} onSave={() => void submit(() => saveCompany(data.installations[0], { name: companyName, country }))} onCancel={editing ? () => setEditing(null) : undefined} label="답하기" />
                </section>
            )}

            {data.loaded && question === 'period' && (
                <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm" aria-label="질문 보고기간">
                    <p className="text-xs font-bold text-teal-800">질문 2</p>
                    <h2 className="mt-1 text-base font-bold text-slate-950">어느 기간의 자료를 신고하나요?</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">보통 한 해(연간)입니다. 이 기간의 생산량과 고지서를 이후 질문에서 묻습니다.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {[2025, 2026].map((year) => (
                            <button
                                key={year}
                                type="button"
                                onClick={() => {
                                    const draft = yearlyPeriodDraft(year);
                                    setPeriodName(draft.name);
                                    setStartDate(draft.startDate);
                                    setEndDate(draft.endDate);
                                }}
                                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-teal-400"
                            >
                                {year}년 연간
                            </button>
                        ))}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <label className="block text-sm font-semibold text-slate-700">기간 이름<input className={fieldClass} value={periodName} onChange={(event) => setPeriodName(event.target.value)} placeholder="2025년 연간" /></label>
                        <label className="block text-sm font-semibold text-slate-700">시작일<input type="date" className={fieldClass} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
                        <label className="block text-sm font-semibold text-slate-700">종료일<input type="date" className={fieldClass} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
                    </div>
                    <Footer busy={busy} message={message} onSave={() => void submit(() => savePeriod(data.periods[0], { name: periodName, startDate, endDate }))} onCancel={editing ? () => setEditing(null) : undefined} label="답하기" />
                </section>
            )}

            {data.loaded && question === 'product' && (
                <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm" aria-label="질문 만드는 제품">
                    <p className="text-xs font-bold text-teal-800">질문 3</p>
                    <h2 className="mt-1 text-base font-bold text-slate-950">{addingProduct ? '다른 제품도 만드시나요? 어떤 제품인가요?' : '무엇을 만드시나요?'}</h2>
                    {addingProduct && (
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                            CN 코드가 다른 제품은 제품마다 공정을 따로 둡니다. 이 제품에도 구매 강재·연료·전력을 같은 순서로 묻습니다.
                            한 제품이 다른 제품의 재료로 들어가는 사내 이송은 지도 화면 3단계에서 연결하세요.
                        </p>
                    )}

                    {showFamilyStep && (
                        <>
                            <p className="mt-1 text-xs leading-5 text-slate-500">가장 가까운 것을 고르세요. 정확한 코드는 다음에 적습니다.</p>
                            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {PRODUCT_FAMILY_PRESETS.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => {
                                            setFamilyId(item.id);
                                            if (item.details.length === 1) {
                                                setDetailId(item.details[0].id);
                                                setProductName(item.details[0].label);
                                            }
                                        }}
                                        className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-teal-400 hover:bg-teal-50/40"
                                        data-family={item.id}
                                    >
                                        <span className="block text-sm font-bold text-slate-900">{item.label}</span>
                                        <span className="mt-0.5 block text-xs leading-5 text-slate-600">{item.description}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {showDetailStep && family && (
                        <>
                            <p className="mt-1 text-xs leading-5 text-slate-500">「{family.label}」 중 어느 쪽에 가깝나요?</p>
                            <div className="mt-3 grid grid-cols-1 gap-2">
                                {family.details.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => { setDetailId(item.id); setProductName(item.label); }}
                                        className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-teal-400 hover:bg-teal-50/40"
                                        data-detail={item.id}
                                    >
                                        <span className="block text-sm font-bold text-slate-900">{item.label}</span>
                                        <span className="mt-0.5 block text-xs leading-5 text-slate-600">{item.description}</span>
                                    </button>
                                ))}
                            </div>
                            <button type="button" onClick={() => { setFamilyId(''); setDetailId(''); }} className="mt-3 text-xs font-semibold text-slate-500 hover:underline">← 제품군 다시 고르기</button>
                        </>
                    )}

                    {(detail || editingExisting) && (
                        <>
                            {editingExisting && (
                                <button type="button" onClick={() => setFamilyId('')} className="mt-1 text-xs font-semibold text-teal-700 hover:underline">제품군 후보에서 다시 고르기</button>
                            )}
                            {detail && (
                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                    「{detail.label}」 — 후보 코드를 눌러 앞자리를 채울 수 있습니다. 정확한 8자리는 수출 신고필증이나 인보이스의 HS 코드입니다.
                                </p>
                            )}
                            {detail && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {detail.cnCandidates.map((candidate) => (
                                        <button
                                            key={candidate.code}
                                            type="button"
                                            onClick={() => setCn(candidate.code.replace(/\D/g, ''))}
                                            title={candidate.note}
                                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${candidate.status === 'not-covered' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-400'}`}
                                        >
                                            {candidate.code} · {candidate.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <label className="mt-3 block text-sm font-semibold text-slate-700">
                                제품 이름
                                <input className={fieldClass} value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="예: STS 십자홈붙이 나사" />
                            </label>
                            <label className="mt-3 block text-sm font-semibold text-slate-700">
                                CN 코드 (8자리)
                                <input className={fieldClass} value={cn} onChange={(event) => setCn(event.target.value)} placeholder="73181552" inputMode="numeric" />
                            </label>
                            <p className={`mt-1.5 flex items-start gap-1.5 text-xs leading-5 ${cnHint.level === 'ok' ? 'text-emerald-800' : cnHint.level === 'idle' ? 'text-slate-500' : 'text-amber-800'}`} data-testid="talk-cn-hint" data-level={cnHint.level}>
                                {(cnHint.level === 'warn' || cnHint.level === 'blocked') && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />}
                                {cnHint.text}
                            </p>
                            {duplicateCn && (
                                <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-amber-800" data-testid="talk-duplicate-cn">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                                    {duplicateCn}
                                </p>
                            )}
                            <Footer
                                busy={busy}
                                message={message}
                                onSave={() => void submit(async () => {
                                    // 새 제품(addingProduct)은 만들고, 아니면 지금 묻는 제품을 고친다. 새 제품을 만들면 그 제품에 생산량 질문이 남아 자동으로 그쪽으로 넘어간다.
                                    const error = await saveProduct(addingProduct ? undefined : focusProduct, { name: productName, cnDigits }, data.installations[0]?.id);
                                    if (!error && addingProduct) {
                                        setFocusId(undefined);
                                        cancelProductForm();
                                    }
                                    return error;
                                })}
                                onCancel={editing || addingProduct ? cancelProductForm : undefined}
                                label="답하기"
                            />
                        </>
                    )}
                </section>
            )}

            {data.loaded && question === 'output' && focusProduct && (
                <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm" aria-label="질문 생산량">
                    <p className="text-xs font-bold text-teal-800">질문 4{editing === 'output' ? ' · 고치기' : ''}</p>
                    <h2 className="mt-1 text-base font-bold text-slate-950">「{focusProduct.name}」을 {data.periods[0]?.name ?? '이 기간'}에 몇 톤 만드셨나요?</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                        시장에 내보낸(판매했거나 다른 공정에 넣은) 양만 적으세요. 생산일지나 ERP의 완제품 입고 기준, 포장재를 뺀 순중량입니다.
                        이 양이 SEE(제품 1톤당 배출량)를 나누는 분모가 됩니다.
                    </p>
                    <label className="mt-3 block text-sm font-semibold text-slate-700">
                        생산량 (t)
                        <input className={fieldClass} value={mass} onChange={(event) => setMass(event.target.value)} placeholder="3240" inputMode="decimal" />
                    </label>
                    <label className="mt-3 block text-sm font-semibold text-slate-700">
                        불량·부산물·스크랩으로 나간 양 (t, 선택)
                        <input className={fieldClass} value={scrap} onChange={(event) => setScrap(event.target.value)} placeholder="0" inputMode="decimal" />
                        <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">판매하거나 다른 공정에 넣을 수 없는 양입니다. 위 생산량에는 넣지 마세요 — 규정(부속서 II 점 F)에 따라 SEE 분모에서 빠지고 그 몫의 배출은 0으로 둡니다.</span>
                    </label>
                    <label className="mt-3 block text-sm font-semibold text-slate-700">
                        공정 이름 <span className="font-normal text-slate-500">(바꾸지 않아도 됩니다)</span>
                        <input className={fieldClass} value={processName} onChange={(event) => setProcessName(event.target.value)} placeholder={defaultProcessName(focusProduct.name)} />
                    </label>
                    <Footer
                        busy={busy}
                        message={message}
                        onSave={() => void submit(() => (editing === 'output' && focusProcess && productLine
                            ? saveOutputEdit({ process: focusProcess, productLine, excludedLine, product: focusProduct, name: processName.trim() || defaultProcessName(focusProduct.name), massT: massNumber, excludedMassT: scrapNumber, precursors: data.precursors }).then((error) => {
                                if (!error) resetOutputForm();
                                return error;
                            })
                            : saveOutput({
                                name: processName.trim() || defaultProcessName(focusProduct.name),
                                route: '',
                                periodId: data.periods[0]?.id,
                                product: focusProduct,
                                massT: massNumber,
                                excludedMassT: scrapNumber,
                            }).then((error) => {
                                if (!error) resetOutputForm();
                                return error;
                            })))}
                        onCancel={editing === 'output' ? () => { resetOutputForm(); setEditing(null); } : undefined}
                        label={editing === 'output' ? '고쳐 저장' : '답하기'}
                    />
                    {editing !== 'output' && (
                        <button type="button" onClick={() => skip('output')} className="mt-2 text-xs font-semibold text-slate-500 hover:underline">
                            지금은 모릅니다 — 나중에 입력 (생산량은 추정할 수 없어서 비워 둡니다)
                        </button>
                    )}
                </section>
            )}

            {data.loaded && question === 'precursor' && focusProcess && (
                <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm" aria-label="질문 구매 강재">
                    <p className="text-xs font-bold text-teal-800">질문 5{editing === 'precursor' ? ' · 고치기' : ''}</p>
                    <h2 className="mt-1 text-base font-bold text-slate-950">
                        {editing === 'precursor' ? '어느 구매 강재를 고칠까요?' : addingPrecursor ? '구매한 강재를 하나 더 넣어 주세요.' : `「${focusProduct?.name ?? '제품'}」을 만들려고 구매한 강재(선재·코일 등)가 있나요?`}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">철강 가공업체는 SEE의 대부분이 구매한 강재가 지니고 온 배출에서 나옵니다. 공급사의 실제 값을 모르면 EU 기본값으로 먼저 계산을 끝내고 나중에 바꾸면 됩니다.</p>

                    {editing === 'precursor' && !editItemId && (
                        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="고칠 구매 강재 고르기">
                            {precursorEditables.map((item) => (
                                <button key={item.id} type="button" onClick={() => loadPrecursorEdit(item)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-400">{item.name} · {item.consumed_mass_t} t</button>
                            ))}
                            <button type="button" onClick={() => setEditing(null)} className="text-sm font-semibold text-slate-500 hover:underline">취소</button>
                        </div>
                    )}
                    {hasPrecursors === null && !addingPrecursor && !editing && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button type="button" onClick={() => setHasPrecursors(true)}>네, 구매한 강재가 있어요</Button>
                            <Button type="button" variant="secondary" disabled={busy} onClick={() => void submit(() => confirmNoPrecursors(focusProcess))}>아니요, 강재를 사다 쓰지 않아요</Button>
                            <button type="button" onClick={() => skip('precursor')} className="text-xs font-semibold text-slate-500 hover:underline">지금은 모릅니다 — 나중에 입력</button>
                        </div>
                    )}
                    {hasPrecursors === null && !addingPrecursor && !editing && message && <p className="mt-3 text-sm text-amber-700" role="alert">{message}</p>}

                    {(hasPrecursors === true || addingPrecursor || Boolean(editingPrecursor)) && (editing !== 'precursor' || Boolean(editingPrecursor)) && (
                        <div className="mt-3 space-y-3">
                            {precursorSetup.precursorCandidates.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs text-slate-500">자주 쓰는 원료:</span>
                                    {precursorSetup.precursorCandidates.map((candidate) => (
                                        <button
                                            key={`${candidate.name}-${candidate.precursorCnCode}`}
                                            type="button"
                                            onClick={() => { setPName(candidate.name); setPCn(candidate.precursorCnCode); setPFill(null); }}
                                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-teal-400"
                                        >
                                            {candidate.name} · {candidate.precursorCnCode}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <label className="block text-sm font-semibold text-slate-700">원료 이름<input className={fieldClass} value={pName} onChange={(event) => setPName(event.target.value)} placeholder="선재(와이어로드)" /></label>
                            <label className="block text-sm font-semibold text-slate-700">
                                원료 CN 코드 (4자리 이상, 보통 8자리)
                                <input className={fieldClass} value={pCn} onChange={(event) => { setPCn(event.target.value); setPFill(null); }} placeholder="72131000" inputMode="numeric" />
                            </label>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <label className="block text-sm font-semibold text-slate-700">소비량 (t)<span className="block text-xs font-normal text-slate-500">이 공정에 투입한 양 — 만든 양이 아닙니다</span><input className={fieldClass} value={pConsumed} onChange={(event) => setPConsumed(event.target.value)} placeholder="1050" inputMode="decimal" /></label>
                                <label className="block text-sm font-semibold text-slate-700">구매량 (t, 선택)<span className="block text-xs font-normal text-slate-500">기간 중 사 온 양</span><input className={fieldClass} value={pPurchased} onChange={(event) => setPPurchased(event.target.value)} placeholder="1100" inputMode="decimal" /></label>
                            </div>
                            <label className="block text-sm font-semibold text-slate-700">
                                공급국가 — 이 원료를 만든 나라
                                {countries.length > 0 ? (
                                    <select className={fieldClass} value={pCountry} onChange={(event) => { setPCountry(event.target.value); setPFill(null); }}>
                                        <option value="">— 고르세요 —</option>
                                        {countries.map((country) => <option key={country} value={country}>{country}</option>)}
                                    </select>
                                ) : (
                                    <input className={fieldClass} value={pCountry} onChange={(event) => { setPCountry(event.target.value); setPFill(null); }} placeholder="영문 국가명 (예: South Korea, Taiwan)" />
                                )}
                                <span className="block text-xs font-normal text-slate-500">앱이 대신 고르지 않습니다 — EU 기본값은 나라마다 다릅니다(같은 STS 와이어가 한국 4.015 · 대만 11).</span>
                            </label>

                            <div>
                                <p className="text-sm font-semibold text-slate-700">이 원료의 SEE(제품 1톤당 배출량)는 어떻게 하시겠어요?</p>
                                <div className="mt-1.5 flex flex-wrap gap-2">
                                    <button type="button" onClick={() => setPMode('ACTUAL')} aria-pressed={pMode === 'ACTUAL'} className={`rounded-full border px-4 py-2 text-sm font-semibold ${pMode === 'ACTUAL' ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-400'}`}>공급사가 준 값이 있어요</button>
                                    <button type="button" onClick={() => setPMode('DEFAULT')} aria-pressed={pMode === 'DEFAULT'} className={`rounded-full border px-4 py-2 text-sm font-semibold ${pMode === 'DEFAULT' ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-400'}`}>모르겠어요 (EU 기본값으로 채웁니다)</button>
                                </div>
                            </div>

                            {pMode === 'ACTUAL' && (
                                <div className="space-y-3 rounded-xl bg-slate-50 p-3">
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <label className="block text-sm font-semibold text-slate-700">SEE 직접분 (tCO₂e/t)<input className={fieldClass} value={pDirect} onChange={(event) => setPDirect(event.target.value)} placeholder="1.80" inputMode="decimal" /></label>
                                        <label className="block text-sm font-semibold text-slate-700">SEE 간접분 (tCO₂e/t)<input className={fieldClass} value={pIndirect} onChange={(event) => setPIndirect(event.target.value)} placeholder="0.30" inputMode="decimal" /></label>
                                    </div>
                                    <label className="block text-sm font-semibold text-slate-700">값의 출처<input className={fieldClass} value={pSource} onChange={(event) => setPSource(event.target.value)} placeholder="공급사 회신 메일 2026-05-02" /></label>
                                    <p className="text-xs leading-5 text-slate-500">제3자 검증보고서가 없는 공급사 값은 신고에 쓰려면 검증이 필요합니다 — 앱이 결과 화면에서 확인 필요로 알려 줍니다.</p>
                                </div>
                            )}

                            {pMode === 'DEFAULT' && (
                                <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                                    <Button type="button" variant="secondary" onClick={() => setPFill(fillEuDefault({ reference, country: pCountry, cnDigits: pCn.replace(/\D/g, '') }))}>EU 기본값 채우기</Button>
                                    {pFill?.ok === false && <p className="text-sm text-amber-700" role="alert">{pFill.reason}</p>}
                                    {pFill?.ok && (
                                        <p className="text-sm leading-6 text-emerald-900" data-testid="talk-default-fill">
                                            직접 <span className="font-semibold">{pFill.direct}</span> · 간접 <span className="font-semibold">{pFill.indirect}</span> tCO₂e/t — {pFill.message}
                                            <span className="block text-xs text-slate-500">출처: {pFill.source}</span>
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-2">
                                <Button type="button" onClick={submitPrecursor} disabled={busy}>{busy ? '저장 중…' : '답하기'}</Button>
                                <button type="button" onClick={resetPrecursorForm} className="text-sm font-semibold text-slate-500 hover:underline">취소</button>
                            </div>
                            {message && <p className="text-sm text-amber-700" role="alert">{message}</p>}
                        </div>
                    )}
                </section>
            )}

            {data.loaded && question === 'fuel' && focusProcess && editing === 'fuel' && !editingStream && (
                <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm" aria-label="질문 연료 고르기">
                    <p className="text-xs font-bold text-teal-800">질문 6 · 고치기</p>
                    <h2 className="mt-1 text-base font-bold text-slate-950">어느 연료를 고칠까요?</h2>
                    <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="고칠 연료 고르기">
                        {fuelEditables.map((item) => (
                            <button key={item.id} type="button" onClick={() => loadFuelEdit(item)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-400">{item.name} · {item.activity_data}</button>
                        ))}
                        <button type="button" onClick={() => setEditing(null)} className="text-sm font-semibold text-slate-500 hover:underline">취소</button>
                    </div>
                </section>
            )}

            {data.loaded && question === 'fuel' && focusProcess && !(editing === 'fuel' && !editingStream) && (
                <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm" aria-label="질문 연료">
                    <p className="text-xs font-bold text-teal-800">질문 6{editing === 'fuel' ? ' · 고치기' : ''}</p>
                    <h2 className="mt-1 text-base font-bold text-slate-950">{editing === 'fuel' ? '연료 값을 고칩니다.' : addingFuel ? '연료를 하나 더 넣어 주세요.' : '공장 안에서 태운 연료(도시가스·유류 등)가 있나요?'}</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">고지서·구매 전표의 12개월 사용량을 그대로 적으면 앱이 배출량을 계산합니다. 연료를 전혀 안 쓰는 공정이면 「쓰지 않아요」를 누르세요.</p>
                    {periodProcesses.length >= 2 && (
                        <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900" data-testid="talk-shared-fuel-note">
                            이 기간에 공정이 {periodProcesses.length}개입니다. 연료 고지서 한 장을 여러 공정이 같이 쓴다면 여기에 한 공정 몫을 추정해 적지 말고 「지금은 모릅니다」로 넘긴 뒤, 아래 「같이 쓴 에너지 나누기」에서 나누세요 — 나누는 기준이 규정에 있습니다.
                        </p>
                    )}
                    <label className="mt-3 block text-sm font-semibold text-slate-700">
                        어떤 연료인가요?
                        <select className={fieldClass} value={fuelKindKey} onChange={(event) => chooseFuelKind(event.target.value)}>
                            {TALK_FUEL_KINDS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                        </select>
                        <span className="block text-xs font-normal text-slate-500">{fuelKind.hint}. 공정배출·물질수지(전기로의 고철·전극 등)는 지도 4단계에서 입력합니다.</span>
                    </label>
                    <label className="mt-3 block text-sm font-semibold text-slate-700">
                        {fuelKind.activityLabel}
                        <input className={fieldClass} value={fuelAmount} onChange={(event) => setFuelAmount(event.target.value)} placeholder={fuelKind.litres ? '2000' : '128400'} inputMode="decimal" />
                        <span className="block text-xs font-normal text-slate-500">{fuelKind.activityHint}</span>
                    </label>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-semibold text-slate-700">
                            순발열량 (GJ/{fuelKind.defaults.activity_unit === 'Nm3' ? 'Nm³' : 't'})
                            <input className={fieldClass} value={fuelNcv} onChange={(event) => setFuelNcv(event.target.value)} inputMode="decimal" />
                        </label>
                        <label className="block text-sm font-semibold text-slate-700">
                            {fuelKind.factorLabel}
                            <input className={fieldClass} value={fuelFactor} onChange={(event) => setFuelFactor(event.target.value)} inputMode="decimal" />
                        </label>
                    </div>
                    <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                        미리 채운 순발열량·배출계수는 <span className="font-semibold">임시 자리값</span>입니다. {fuelKind.ncvHint} {fuelKind.factorHint}
                        {fuelKind.ncvGrossThreshold !== undefined && Number(fuelNcv) > fuelKind.ncvGrossThreshold && (
                            <span className="mt-1 block font-semibold text-red-800">순발열량이 {fuelKind.ncvGrossThreshold}보다 큽니다 — 고지서의 총발열량을 적은 것은 아닌지 확인하세요.</span>
                        )}
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-semibold text-slate-700">
                            계수의 출처 유형
                            <select className={fieldClass} value={fuelFactorSource ?? 'UNCLASSIFIED'} onChange={(event) => setFuelFactorSource(event.target.value as SourceStream['factor_source_type'])}>
                                {FACTOR_SOURCE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </label>
                        <label className="block text-sm font-semibold text-slate-700">
                            값의 출처
                            <input className={fieldClass} value={fuelSource} onChange={(event) => setFuelSource(event.target.value)} placeholder="도시가스 고지서 2025" />
                        </label>
                    </div>
                    <label className="mt-3 block text-sm font-semibold text-slate-700">
                        이름 <span className="font-normal text-slate-500">(비우면 연료 이름)</span>
                        <input className={fieldClass} value={fuelName} onChange={(event) => setFuelName(event.target.value)} placeholder={fuelKind.label} />
                    </label>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            disabled={busy}
                            onClick={() => focusProcess && void submit(async () => {
                                const fuelAnswer = { kind: fuelKind, amount: fuelAmount, name: fuelName, ncv: fuelNcv, factor: fuelFactor, factorSource: fuelFactorSource, source: fuelSource };
                                const error = editingStream
                                    ? await saveFuelEdit(focusProcess, editingStream, data.sourceStreams, fuelAnswer)
                                    : await saveFuel(focusProcess, data.sourceStreams, fuelAnswer);
                                if (!error) resetFuelForm();
                                return error;
                            })}
                        >
                            {busy ? '저장 중…' : '답하기'}
                        </Button>
                        {addingFuel || editing === 'fuel'
                            ? <button type="button" onClick={resetFuelForm} className="text-sm font-semibold text-slate-500 hover:underline">취소</button>
                            : <button type="button" onClick={() => skip('fuel')} className="text-sm font-semibold text-slate-500 hover:underline">연료를 쓰지 않아요 / 지금은 모릅니다 — 나중에 입력</button>}
                    </div>
                    {message && <p className="mt-2 text-sm text-amber-700" role="alert">{message}</p>}
                </section>
            )}

            {data.loaded && question === 'electricity' && focusProcess && (
                <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm" aria-label="질문 전력">
                    <p className="text-xs font-bold text-teal-800">질문 7</p>
                    <h2 className="mt-1 text-base font-bold text-slate-950">작년 한 해 공장에서 쓴 전기는 얼마인가요?</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">한전 전기요금 고지서의 12개월 사용량(kWh) 합계 ÷ 1,000 = MWh 입니다. 한 고지서를 여러 공정이 같이 쓰면 지도 화면의 「전력 나누기」를 쓰세요.</p>
                    {periodProcesses.length >= 2 && (
                        <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900" data-testid="talk-shared-electricity-note">
                            이 기간에 공정이 {periodProcesses.length}개입니다. 전기 고지서 한 장을 여러 공정이 같이 쓴다면 여기에 한 공정 몫을 추정해 적지 말고 「지금은 모릅니다」로 넘긴 뒤, 아래 「같이 쓴 에너지 나누기」에서 나누세요 — 나누기 도구가 합계와 기준을 받아 공정별로 저장합니다.
                        </p>
                    )}
                    <label className="mt-3 block text-sm font-semibold text-slate-700">
                        연간 전력 사용량 (MWh)
                        <input className={fieldClass} value={elecMwh} onChange={(event) => setElecMwh(event.target.value)} placeholder="500" inputMode="decimal" />
                    </label>
                    <label className="mt-3 block text-sm font-semibold text-slate-700">
                        전력 배출계수 (tCO₂e/MWh)
                        <input className={fieldClass} value={elecEf} onChange={(event) => setElecEf(event.target.value)} inputMode="decimal" />
                        <span className="block text-xs font-normal text-slate-500">국가 기본계수 또는 PPA·직접연결 실측만 인정됩니다. 녹색프리미엄으로 낮출 수 없습니다.</span>
                    </label>
                    <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                        {Number(elecEf) === ELECTRICITY_PLACEHOLDER_EF ? '미리 채워진 0.47은 임시 자리값입니다. ' : ''}<span className="font-semibold">앱은 한국 계통 평균값을 갖고 있지 않습니다</span> — 근거가 되는 값을 직접 확인해 넣으세요. EU가 인정하는 값인지는 수입자·검증인에게 확인이 필요합니다.
                    </p>
                    <label className="mt-3 block text-sm font-semibold text-slate-700">
                        계수 출처
                        <select className={fieldClass} value={elecSource} onChange={(event) => setElecSource(event.target.value)}>
                            {ELECTRICITY_EF_SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                    </label>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button type="button" disabled={busy} onClick={() => focusProcess && void submit(() => saveElectricity(focusProcess, { mwh: Number(elecMwh.replace(/,/g, '')) || 0, ef: Number(elecEf.replace(/,/g, '')) || 0, efSource: elecSource }).then((error) => { if (!error) resetElectricityForm(); return error; }))}>{busy ? '저장 중…' : '답하기'}</Button>
                        {editing === 'electricity'
                            ? <button type="button" onClick={() => { resetElectricityForm(); setEditing(null); }} className="text-sm font-semibold text-slate-500 hover:underline">취소</button>
                            : <button type="button" onClick={() => skip('electricity')} className="text-sm font-semibold text-slate-500 hover:underline">지금은 모릅니다 — 나중에 입력</button>}
                    </div>
                    {message && <p className="mt-2 text-sm text-amber-700" role="alert">{message}</p>}
                </section>
            )}

            {data.loaded && question === 'heat' && focusProcess && (
                <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm" aria-label="질문 산 스팀·온수">
                    <p className="text-xs font-bold text-teal-800">질문 8</p>
                    <h2 className="mt-1 text-base font-bold text-slate-950">산업단지나 다른 회사에서 스팀·온수를 사서 쓰나요?</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">사업장 안 보일러로 만든 스팀은 위 연료로 넣었습니다. 밖에서 사 온 열은 사업장에 연료가 없어 연료 목록에 잡히지 않아 따로 묻습니다.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Button type="button" disabled={busy} onClick={() => void submit(() => confirmNoImportedHeat(focusProcess))}>아니요, 사서 쓰는 열이 없어요</Button>
                        <Link href="/" className="inline-flex"><Button type="button" variant="secondary">예 — 지도 화면 4단계에서 입력하기</Button></Link>
                        <button type="button" onClick={() => skip('heat')} className="text-sm font-semibold text-slate-500 hover:underline">지금은 모릅니다 — 나중에 입력</button>
                    </div>
                    {message && <p className="mt-2 text-sm text-amber-700" role="alert">{message}</p>}
                </section>
            )}

            {data.loaded && !question && (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5" aria-label="이번 단계 완료">
                    <p className="flex items-center gap-2 text-sm font-bold text-emerald-900"><CheckCircle2 className="h-4 w-4" />여기까지가 이번 시험 버전의 질문입니다.</p>
                    <p className="mt-1 text-sm leading-6 text-emerald-900">
                        지금까지의 결과는 아래에 있습니다. 남은 일은 「할 일」에서 정리하고, EU 문서는 「제출」에서 받으세요. 더 자세히 입력하거나 고치려면 지도 화면으로 이어가면 됩니다 — 입력한 답이 그대로 보입니다.
                        {data.products.map((item) => {
                            const notes = overview.products.find((entry) => entry.id === item.id)?.pending.filter((id) => skipped.includes(talkSkipKey(item.id, id))) ?? [];
                            return notes.length > 0 ? ` 「${item.name}」: ${notes.map((id) => SKIPPED_NOTE[id]).join(' · ')}.` : '';
                        })}
                    </p>
                    <button type="button" onClick={startAddingProduct} className="mt-3 mr-3 block text-sm font-semibold text-teal-700 hover:underline" data-testid="talk-add-product">다른 제품도 만드시나요? — 제품 하나 더 입력</button>
                    {focusProcess && data.sourceStreams.some((stream) => stream.process_id === focusProcess.id) && (
                        <button type="button" onClick={() => { setMessage(''); setAddingFuel(true); }} className="mt-3 mr-3 text-sm font-semibold text-teal-700 hover:underline">연료 하나 더 넣기</button>
                    )}
                    {focusProcess && state.precursorCount > 0 && (
                        <button type="button" onClick={() => { setMessage(''); setAddingPrecursor(true); }} className="mt-3 mr-3 text-sm font-semibold text-teal-700 hover:underline">구매 강재 하나 더 넣기</button>
                    )}
                    <Link href="/todo" className="mt-3 mr-2 inline-flex" data-testid="talk-to-todo">
                        <Button type="button">할 일 보기<ArrowRight className="ml-2 h-4 w-4" /></Button>
                    </Link>
                    <Link href="/submit" className="mt-3 mr-2 inline-flex" data-testid="talk-to-submit">
                        <Button type="button" variant="secondary">제출 화면으로</Button>
                    </Link>
                    <Link href="/" className="mt-3 inline-flex">
                        <Button type="button" variant="secondary">지도 화면에서 이어서 입력하기<ArrowRight className="ml-2 h-4 w-4" /></Button>
                    </Link>
                </section>
            )}

            {data.loaded && periodProcesses.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="지금까지의 결과" data-testid="talk-summary">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="text-base font-bold text-slate-950">지금까지의 답으로 나온 결과</h2>
                        {summary.partialNote && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">중간 값 · 아직 최종이 아닙니다</span>}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-emerald-50 p-3 text-center">
                            <p className="text-xs font-semibold text-emerald-800">CBAM 산정 기준 SEE</p>
                            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-900" data-testid="talk-summary-headline">{summary.headline === null ? '—' : summary.headline.toFixed(3)}</p>
                            <p className="text-[11px] text-emerald-700">tCO₂e/t</p>
                        </div>
                        <div className="rounded-xl bg-slate-100 p-3 text-center">
                            <p className="text-xs font-semibold text-slate-600">총 SEE (검토용)</p>
                            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{summary.empty ? '—' : summary.seeTotal.toFixed(3)}</p>
                            <p className="text-[11px] text-slate-500">tCO₂e/t</p>
                        </div>
                    </div>
                    {!summary.empty && <p className="mt-2 text-[11px] leading-4 text-slate-500">{summary.relationNote}</p>}
                    <p className="mt-2 text-sm leading-6 text-slate-700" data-testid="talk-summary-message">{summary.message}</p>
                    {summary.partialNote && <p className="mt-1 text-xs leading-5 text-amber-800">{summary.partialNote}</p>}
                    {summary.issues.length > 0 && (
                        <ul className="mt-3 space-y-1.5" aria-label="해결하면 좋은 항목">
                            {summary.issues.map((issue, index) => (
                                <li key={`${issue.area}-${index}`} className="flex items-start gap-2 text-sm leading-5">
                                    <AlertTriangle className={`mt-0.5 h-4 w-4 flex-none ${issue.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`} />
                                    <span>
                                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">{issue.area}</span>{' '}
                                        {issue.href ? <Link href={issue.href} className="text-slate-800 underline decoration-slate-300 hover:decoration-teal-600">{issue.message}</Link> : <span className="text-slate-800">{issue.message}</span>}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {(summary.errorCount + summary.warningCount) > summary.issues.length && <p className="mt-1 text-xs text-slate-500">그 밖에 {summary.errorCount + summary.warningCount - summary.issues.length}건은 지도 화면 7단계에서 볼 수 있습니다.</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Link href="/" className="inline-flex"><Button type="button" variant="secondary">지도 화면 7단계 — 결과 자세히</Button></Link>
                        {summary.nextStep === 'EXPORT' || summary.nextStep === 'REVIEW' ? <Link href="/" className="inline-flex"><Button type="button">지도 화면 8단계 — EU 문서 만들기<ArrowRight className="ml-2 h-4 w-4" /></Button></Link> : null}
                    </div>
                </section>
            )}

            {data.loaded && periodProcesses.length >= 2 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="같이 쓴 에너지 나누기" data-testid="talk-energy-split">
                    <h2 className="text-base font-bold text-slate-950">한 고지서를 여러 공정이 같이 쓰나요?</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                        이 기간에 공정이 {periodProcesses.length}개입니다. 전기·연료·보일러가 공장 전체 한 장의 고지서라면 공정별 몫으로 나눠야 합니다 — 규정이 정한 기준이 다릅니다(전기·일반 연료는 생산량 비율이 기본, 열은 쓴 열량 비율).
                        아래 도구는 지도 화면 4·5단계의 것과 같은 것이고, 나눈 결과는 같은 곳에 저장됩니다.
                    </p>
                    {energySplit.items.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-sm">
                            {energySplit.items.map((item) => (
                                <li key={item.key} className="flex items-start gap-2">
                                    {item.problem || item.provisional ? <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />}
                                    <span><span className="font-semibold text-slate-900">{item.title}</span> <span className="text-xs text-slate-500">{item.detail}</span>{item.problem && <span className="block text-xs text-amber-800">{item.problem}</span>}</span>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="mt-2 text-xs text-slate-500">아직 나눈 것이 없습니다. 공정 하나만 쓰는 에너지는 나눌 필요가 없습니다.</p>}
                    {energySplit.hints.map((hint) => <p key={hint.text} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">{hint.text}</p>)}
                    <div className="mt-3 space-y-3">
                        <ElectricitySplit processes={periodProcesses} results={data.results} onApplied={reload} />
                        <FuelSplit processes={periodProcesses} sourceStreams={data.sourceStreams} results={data.results} onApplied={reload} />
                        <SharedHeat processes={periodProcesses} sourceStreams={data.sourceStreams} onApplied={reload} />
                    </div>
                </section>
            )}

            {data.loaded && (
                <CumulativeBar binding={binding} results={data.results} precursors={data.precursors} products={data.products} partialReason={barPartial} />
            )}
        </div>
    );
}

function Footer({ busy, message, onSave, onCancel, label }: { busy: boolean; message: string; onSave: () => void; onCancel?: () => void; label: string }) {
    return (
        <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={onSave} disabled={busy}>{busy ? '저장 중…' : label}</Button>
                {onCancel && <button type="button" onClick={onCancel} className="text-sm font-semibold text-slate-500 hover:underline">취소</button>}
            </div>
            {message && <p className="text-sm text-amber-700" role="alert">{message}</p>}
        </div>
    );
}
