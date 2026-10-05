'use client';

import { Button } from '@/components/ui';
import { DEFAULT_EU_TEMPLATE_PATH, DEFAULT_EU_TEMPLATE_FILENAME, downloadBlob } from '@/lib/eu-template-export';
import type { Installation, PurchasedPrecursor, ReportingPeriod } from '@/lib/local-db';
import { updateLocalItem } from '@/lib/local-db';
import { readWorkbookSheetRows } from '@/lib/reference-workbooks';
import { buildReplyUpdate, matchReplyToPrecursors, parseSupplierReply, type ReplyProposal, type SupplierReply } from '@/lib/supplier-reply';
import { buildSupplierRequestDocx, groupPrecursorsBySupplier, supplierRequestFilename } from '@/lib/supplier-request';
import { AlertTriangle, CheckCircle2, Download, FileUp } from 'lucide-react';
import { useMemo, useState } from 'react';

const fmt = (value: number | undefined, digits = 3) =>
    value === undefined ? '—' : new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);

const MODE_LABEL: Record<PurchasedPrecursor['data_mode'], string> = { ACTUAL: '실측', SEMI_ACTUAL: '일부 실측', DEFAULT: 'EU 기본값' };

type Choice = { on: boolean; sheetRow?: number };

/**
 * 공급사 요청서 내보내기 + 회신 파일 가져오기(6단계). 구매 원료의 EU 기본값을 공급사 실측값으로 바꾸는 한 바퀴.
 * 요청서는 EU 표준 양식을 채워 달라는 것이고, 회신은 그 양식의 Summary_Products를 읽는다. 읽은 값은 미리 보여주고 사람이 고른 것만 바꾼다.
 */
export function SupplierLoop({
    precursors,
    periods,
    installations,
    onApplied,
}: {
    precursors: PurchasedPrecursor[];
    periods: ReportingPeriod[];
    installations: Installation[];
    onApplied: () => Promise<void> | void;
}) {
    const [reply, setReply] = useState<SupplierReply>();
    const [choices, setChoices] = useState<Record<string, Choice>>({});
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [applied, setApplied] = useState(0);
    // 요청서 맨 위 「수신」에 나갈 공급사 이름 — 저장된 값을 그대로 쓰면 내부 메모(「3회 요청 미회신」 등)가 섞여 나갈 수 있어 보내기 전에 고칠 수 있게 한다.
    const [recipientNames, setRecipientNames] = useState<Record<string, string>>({});

    const periodName = (id: string | undefined) => periods.find((period) => period.id === id)?.name ?? '';
    const periodRange = useMemo(
        () => new Map(periods.map((period) => [period.id, { start: period.start_date, end: period.end_date }])),
        [periods]
    );
    const requester = {
        companyName: installations[0]?.local_name || installations[0]?.name || '',
        contactName: installations[0]?.authorized_representative_name || '',
        email: installations[0]?.email || '',
    };

    // 요청서는 아직 공급사 실측값이 없는(기본값·일부 실측) 원료만 대상으로 한다.
    const requestable = precursors.filter((precursor) => precursor.data_mode !== 'ACTUAL');
    const groups = useMemo(() => groupPrecursorsBySupplier(requestable, periodName), [requestable, periods]); // eslint-disable-line react-hooks/exhaustive-deps

    const matched = useMemo(
        () => (reply && !reply.fileProblem ? matchReplyToPrecursors({ reply, precursors, periods: periodRange }) : undefined),
        [reply, precursors, periodRange]
    );

    function downloadRequest(index: number) {
        const original = groups[index];
        const group = { ...original, supplierName: (recipientNames[original.key] ?? original.supplierName).trim() };
        const generatedAt = new Date();
        const bytes = buildSupplierRequestDocx({ group, requester, generatedAt });
        downloadBlob(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), supplierRequestFilename(group, generatedAt));
    }

    async function handleFile(file: File | undefined) {
        setMessage('');
        setApplied(0);
        if (!file) return;
        try {
            const [summaryProducts, instData] = await Promise.all([readWorkbookSheetRows(file, 'Summary_Products'), readWorkbookSheetRows(file, 'A_InstData')]);
            const parsed = parseSupplierReply({ filename: file.name, summaryProducts, instData });
            setReply(parsed);
            const result = parsed.fileProblem ? undefined : matchReplyToPrecursors({ reply: parsed, precursors, periods: periodRange });
            setChoices(Object.fromEntries((result?.proposals ?? []).map((proposal) => [
                proposal.precursorId,
                { on: proposal.defaultSelected, sheetRow: proposal.candidates.length === 1 ? proposal.candidates[0].row.sheetRow : undefined },
            ])));
        } catch (error) {
            setReply(undefined);
            setMessage(error instanceof Error ? error.message : '회신 파일을 읽지 못했습니다.');
        }
    }

    const selectedProposals = (matched?.proposals ?? []).filter((proposal) => {
        const choice = choices[proposal.precursorId];
        const row = proposal.candidates.find((candidate) => candidate.row.sheetRow === choice?.sheetRow)?.row;
        return choice?.on && row && !row.problem;
    });

    async function apply() {
        if (!reply || selectedProposals.length === 0) return;
        setBusy(true);
        setMessage('');
        try {
            for (const proposal of selectedProposals) {
                const row = proposal.candidates.find((candidate) => candidate.row.sheetRow === choices[proposal.precursorId]?.sheetRow)!.row;
                const precursor = precursors.find((item) => item.id === proposal.precursorId)!;
                await updateLocalItem('precursors', { ...precursor, ...buildReplyUpdate(row, reply) });
            }
            setApplied(selectedProposals.length);
            setReply(undefined);
            setChoices({});
            await onApplied();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '저장하지 못했습니다.');
        } finally {
            setBusy(false);
        }
    }

    function currentOf(proposal: ReplyProposal) {
        return precursors.find((item) => item.id === proposal.precursorId);
    }

    if (precursors.length === 0) {
        return null;
    }

    return (
        <details className="rounded-xl border border-slate-200 bg-white p-4" open={requestable.length > 0 || Boolean(reply) || applied > 0}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                공급사에게 실측값 받기 — 요청서 내보내기 · 회신 가져오기
                {requestable.length > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">기본값 {requestable.length}건</span>}
            </summary>

            <div className="mt-3 space-y-4">
                <section className="space-y-2" aria-label="요청서 만들기">
                    <p className="text-sm font-semibold text-slate-800">① 요청서 보내기</p>
                    <p className="text-xs leading-5 text-slate-600">
                        EU 기본값으로 둔 구매 원료의 실제 배출량을 공급사에 요청합니다. 요청서(한·영)는 원료·CN·구매량·보고기간만 담고 우리 회사 자료는 넣지 않습니다.
                        공급사가 EU 표준 양식을 채워 보내면 아래 ②에서 읽습니다.
                    </p>
                    {groups.length === 0 ? (
                        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">기본값으로 쓰는 구매 원료가 없습니다 — 모두 실측입니다.</p>
                    ) : (
                        <ul className="space-y-2">
                            {groups.map((group, index) => (
                                <li key={group.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                                    <span className="min-w-0 flex-1 space-y-1">
                                        <label className="block text-xs font-semibold text-slate-600">
                                            요청서 수신(공급사 이름) — 보내기 전에 확인하세요
                                            <input
                                                type="text"
                                                value={recipientNames[group.key] ?? group.supplierName}
                                                onChange={(event) => setRecipientNames({ ...recipientNames, [group.key]: event.target.value })}
                                                placeholder="공급사 이름"
                                                className="mt-0.5 block h-9 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal text-slate-900"
                                            />
                                        </label>
                                        <span className="block text-xs text-slate-500">{group.country || '국가 미입력'} · 원료 {group.items.length}개 ({group.items.map((item) => item.name).join(', ')}) — 원료 이름도 그대로 요청서에 나가니 내부 메모가 섞여 있으면 먼저 고치세요.</span>
                                    </span>
                                    <Button type="button" variant="secondary" onClick={() => downloadRequest(index)}>
                                        <Download className="mr-1.5 h-4 w-4" />
                                        요청서 받기(.docx)
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <a href={DEFAULT_EU_TEMPLATE_PATH} download={DEFAULT_EU_TEMPLATE_FILENAME} className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline">
                        <Download className="h-3.5 w-3.5" />
                        빈 EU 표준 양식(엑셀) 받기 — 요청서와 함께 보내세요
                    </a>
                </section>

                <section className="space-y-2 border-t border-slate-100 pt-3" aria-label="회신 가져오기">
                    <p className="text-sm font-semibold text-slate-800">② 회신 가져오기</p>
                    <label className="inline-flex min-h-10 cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-teal-300">
                        <FileUp className="mr-2 h-4 w-4" />
                        공급사가 채운 EU 양식(.xlsx) 선택
                        <input type="file" accept=".xlsx" className="sr-only" disabled={busy} onChange={(event) => { void handleFile(event.target.files?.[0]); event.target.value = ''; }} />
                    </label>

                    {message && <p className="text-sm text-amber-700">{message}</p>}
                    {applied > 0 && (
                        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                            <CheckCircle2 className="h-4 w-4" />
                            {applied}건을 공급사 실측값으로 바꿨습니다. 지도 상자의 빗금과 막대의 실측 비율이 바뀌었는지 확인하세요.
                        </p>
                    )}

                    {reply?.fileProblem && (
                        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-900">
                            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                            {reply.fileProblem}
                        </p>
                    )}

                    {reply && matched && (
                        <div className="space-y-3">
                            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                                <span className="font-semibold">{reply.filename}</span> · 설비 {reply.installationName || '(이름 없음)'}{reply.country ? ` · ${reply.country}` : ''}
                                {reply.periodStart && reply.periodEnd ? ` · 보고기간 ${reply.periodStart} ~ ${reply.periodEnd}` : ' · 보고기간 없음'}
                                {reply.verifierName ? ` · 검증기관 「${reply.verifierName}」 기재` : ''}
                            </p>
                            {reply.verifierName && (
                                <p className="text-xs leading-5 text-slate-600">검증기관이 적혀 있습니다. 검증보고서를 받으셨다면 적용 후 전구물질 수정에서 「검증됨」으로 올리세요 — 파일만으로는 검증됐다고 보지 않습니다.</p>
                            )}

                            <ul className="space-y-2">
                                {matched.proposals.map((proposal) => {
                                    const current = currentOf(proposal);
                                    const choice = choices[proposal.precursorId] ?? { on: false };
                                    const chosen = proposal.candidates.find((candidate) => candidate.row.sheetRow === choice.sheetRow)?.row;
                                    const blocked = proposal.candidates.length > 0 && (!chosen || Boolean(chosen.problem));
                                    return (
                                        <li key={proposal.precursorId} className="space-y-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                                            <label className="flex items-start gap-2">
                                                <input
                                                    type="checkbox"
                                                    className="mt-1 h-4 w-4"
                                                    checked={choice.on && !blocked}
                                                    disabled={blocked || proposal.candidates.length === 0}
                                                    onChange={(event) => setChoices({ ...choices, [proposal.precursorId]: { ...choice, on: event.target.checked } })}
                                                />
                                                <span className="min-w-0">
                                                    <span className="font-semibold text-slate-900">{proposal.precursorName}</span>
                                                    {current && <span className="ml-1.5 text-xs text-slate-500">지금 {MODE_LABEL[current.data_mode]} · 직접 {fmt(current.direct_see_tco2e_per_t)} / 간접 {fmt(current.indirect_see_tco2e_per_t)}</span>}
                                                </span>
                                            </label>

                                            {proposal.candidates.length > 1 && (
                                                <select
                                                    className="ml-6 h-9 rounded-lg border border-slate-200 px-2 text-xs"
                                                    value={choice.sheetRow ?? ''}
                                                    onChange={(event) => setChoices({ ...choices, [proposal.precursorId]: { on: Boolean(event.target.value), sheetRow: event.target.value ? Number(event.target.value) : undefined } })}
                                                >
                                                    <option value="">어느 행인지 고르세요</option>
                                                    {proposal.candidates.map((candidate) => (
                                                        <option key={candidate.row.sheetRow} value={candidate.row.sheetRow}>
                                                            {candidate.row.sheetRow}행 · CN {candidate.row.cnCode} · {candidate.row.productName || candidate.row.processName || '이름 없음'} · 직접 {fmt(candidate.row.directSee)} / 간접 {fmt(candidate.row.indirectSee ?? 0)}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                            {chosen && !chosen.problem && (
                                                <p className="ml-6 text-xs text-teal-800">
                                                    → 회신 {chosen.sheetRow}행: 직접 {fmt(chosen.directSee)} / 간접 {fmt(chosen.indirectSee ?? 0)} tCO₂e/t
                                                    {(chosen.defaultShare ?? 0) > 0 ? ` · 기본값 비율 ${fmt((chosen.defaultShare ?? 0) * 100, 0)}% 포함(일부 실측으로 저장)` : ' · 실측으로 저장(공급사 확인)'}
                                                </p>
                                            )}
                                            {proposal.warnings.map((warning) => (
                                                <p key={warning} className="ml-6 flex items-start gap-1.5 text-xs leading-5 text-amber-800">
                                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                                                    {warning}
                                                </p>
                                            ))}
                                        </li>
                                    );
                                })}
                            </ul>

                            {matched.unmatchedRows.length > 0 && (
                                <p className="text-xs leading-5 text-slate-500">
                                    우리 원료와 맞지 않은 회신 행 {matched.unmatchedRows.length}개: {matched.unmatchedRows.slice(0, 6).map((row) => `${row.sheetRow}행 CN ${row.cnCode}`).join(', ')}{matched.unmatchedRows.length > 6 ? ' …' : ''}
                                </p>
                            )}

                            <div className="flex flex-wrap items-center gap-3">
                                <Button type="button" onClick={() => void apply()} disabled={busy || selectedProposals.length === 0}>
                                    {busy ? '저장 중…' : `선택한 ${selectedProposals.length}건 적용`}
                                </Button>
                                <span className="text-xs leading-5 text-slate-500">값은 파일의 숫자 그대로 옮기고 「공급사 확인」까지만 올립니다. 보고기간이 다른 항목은 직접 체크해야 적용됩니다.</span>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </details>
    );
}
