'use client';

import { CumulativeBar } from '@/components/guided/CumulativeBar';
import { Button } from '@/components/ui';
import { defaultProcessName } from '@/lib/conversation-process';
import { listLocalItems, type Installation, type Product, type ProductionProcess, type ReportingPeriod } from '@/lib/local-db';
import { getProductReportingScope, isCbamReportingScope } from '@/lib/reporting-scope';
import { buildSeeFlowBinding } from '@/lib/see-flow';
import { PRODUCT_FAMILY_PRESETS, findDetailPreset, findFamilyPreset } from '@/lib/product-family-presets';
import { deriveTalkState, describeCnInput, yearlyPeriodDraft, type TalkQuestionId } from '@/lib/talk-flow';
import { AlertTriangle, ArrowRight, CheckCircle2, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { saveCompany, saveOutput, savePeriod, saveProduct } from './talk-writes';

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

interface TalkData {
    loaded: boolean;
    installations: Installation[];
    periods: ReportingPeriod[];
    products: Product[];
    processes: ProductionProcess[];
}

const EDIT_EXISTING = 'edit-existing';
const EMPTY: TalkData = { loaded: false, installations: [], periods: [], products: [], processes: [] };
// 이번 단계에는 계산 결과가 없다 — 막대는 제품 CN만으로 서는 EU 기본값 기둥만 낸다(내 값 기둥은 입력이 생기는 다음 단계부터).
const NO_RESULTS_BINDING = buildSeeFlowBinding([]);

async function loadTalkData(): Promise<TalkData> {
    const [installations, periods, products, processes] = await Promise.all([
        listLocalItems('installations'),
        listLocalItems('periods'),
        listLocalItems('products'),
        listLocalItems('processes'),
    ]);
    return { loaded: true, installations, periods, processes, products: products.filter((product) => isCbamReportingScope(getProductReportingScope(product))) };
}

/**
 * 질문으로 입력 — S1·S2: 사업장 → 보고기간 → 무엇을 만드시나요(제품군 → CN) → 생산량.
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
    const [skippedOutput, setSkippedOutput] = useState(false);

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

    const state = useMemo(() => deriveTalkState(data), [data]);
    // 「나중에 입력」으로 넘긴 생산량 질문은 이번 화면에서만 건너뛴다(저장하지 않는다 — 다시 열면 다시 묻는다).
    const current = state.current === 'output' && skippedOutput ? undefined : state.current;
    const question: TalkQuestionId | undefined = editing ?? current;
    const firstProduct = data.products[0];
    const massNumber = Number(mass.replace(/,/g, ''));
    const scrapNumber = scrap.trim() === '' ? 0 : Number(scrap.replace(/,/g, ''));
    const family = findFamilyPreset(familyId);
    const detail = findDetailPreset(familyId, detailId);
    const cnDigits = cn.replace(/\D/g, '');
    const cnHint = describeCnInput(cnDigits, detail?.cnCandidates.map((candidate) => candidate.code) ?? []);

    function openEditor(id: TalkQuestionId) {
        setMessage('');
        setEditing(id);
        if (id === 'company') {
            setCompanyName(data.installations[0]?.name ?? '');
            setCountry(data.installations[0]?.country ?? '');
        } else if (id === 'period') {
            setPeriodName(data.periods[0]?.name ?? '');
            setStartDate(data.periods[0]?.start_date ?? '');
            setEndDate(data.periods[0]?.end_date ?? '');
        } else {
            // 이미 답한 제품은 이름·CN 칸을 바로 연다(제품군 고르기를 다시 시키지 않는다). 처음이면 제품군부터 묻는다.
            setFamilyId(data.products[0] ? EDIT_EXISTING : '');
            setDetailId('');
            setProductName(data.products[0]?.name ?? '');
            setCn(data.products[0]?.cn_code ?? '');
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
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">시험 버전 · 사업장·기간·제품·생산량까지</span>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                    한 번에 질문 하나씩 묻습니다. 답은 지도 화면과 <span className="font-semibold">같은 곳</span>에 저장되어서, 언제든 지도 화면으로 넘어가도 입력한 내용은 그대로입니다.
                    구매 강재·연료·전력은 아직 지도 화면에서 이어서 입력하세요.
                </p>
            </header>

            {!data.loaded && <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">저장된 자료를 읽는 중입니다…</p>}

            {data.loaded && state.chips.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="지금까지의 답">
                    {state.chips.map((chip) => chip.id === 'output' ? (
                        <li key={chip.id}>
                            <Link
                                href="/"
                                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:border-emerald-400"
                                aria-label="생산량은 지도 3단계에서 고칩니다"
                                title="생산량 고치기는 지도 화면 3단계에서 합니다"
                            >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span className="text-emerald-700">{chip.title}</span> {chip.answer}
                                <span className="text-[10px] font-bold text-emerald-600">고치기: 지도 3단계</span>
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

            {data.loaded && (state.more.installations > 0 || state.more.periods > 0 || state.more.products > 0 || state.more.processes > 0) && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                    사업장·보고기간·제품·공정이 더 있습니다. 이 화면은 첫 번째만 다룹니다 — 나머지는 지도 화면에서 보고 고칠 수 있습니다.
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
                    <h2 className="mt-1 text-base font-bold text-slate-950">무엇을 만드시나요?</h2>

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
                            <Footer
                                busy={busy}
                                message={message}
                                onSave={() => void submit(() => saveProduct(data.products[0], { name: productName, cnDigits }, data.installations[0]?.id))}
                                onCancel={editing ? () => setEditing(null) : undefined}
                                label="답하기"
                            />
                        </>
                    )}
                </section>
            )}

            {data.loaded && question === 'output' && firstProduct && (
                <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm" aria-label="질문 생산량">
                    <p className="text-xs font-bold text-teal-800">질문 4</p>
                    <h2 className="mt-1 text-base font-bold text-slate-950">「{firstProduct.name}」을 {data.periods[0]?.name ?? '이 기간'}에 몇 톤 만드셨나요?</h2>
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
                        <input className={fieldClass} value={processName} onChange={(event) => setProcessName(event.target.value)} placeholder={defaultProcessName(firstProduct.name)} />
                    </label>
                    <Footer
                        busy={busy}
                        message={message}
                        onSave={() => void submit(() => saveOutput({
                            name: processName.trim() || defaultProcessName(firstProduct.name),
                            route: '',
                            periodId: data.periods[0]?.id,
                            product: firstProduct,
                            massT: massNumber,
                            excludedMassT: scrapNumber,
                        }))}
                        label="답하기"
                    />
                    <button type="button" onClick={() => setSkippedOutput(true)} className="mt-2 text-xs font-semibold text-slate-500 hover:underline">
                        지금은 모릅니다 — 나중에 입력 (생산량은 추정할 수 없어서 비워 둡니다)
                    </button>
                </section>
            )}

            {data.loaded && !question && (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5" aria-label="이번 단계 완료">
                    <p className="flex items-center gap-2 text-sm font-bold text-emerald-900"><CheckCircle2 className="h-4 w-4" />여기까지가 이번 시험 버전의 질문입니다.</p>
                    <p className="mt-1 text-sm leading-6 text-emerald-900">
                        다음 질문(구매한 강재)은 아직 준비 중입니다. 지도 화면에서 이어서 입력하면 지금까지의 답이 그대로 보입니다.
                        {skippedOutput && ' 생산량은 지도 3단계에서 입력할 수 있습니다.'}
                    </p>
                    <Link href="/" className="mt-3 inline-flex">
                        <Button type="button">지도 화면에서 이어서 입력하기<ArrowRight className="ml-2 h-4 w-4" /></Button>
                    </Link>
                </section>
            )}

            {data.loaded && (
                <CumulativeBar binding={NO_RESULTS_BINDING} results={[]} precursors={[]} products={data.products} />
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
