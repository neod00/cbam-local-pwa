'use client';

import { Button } from '@/components/ui';
import { getBackupStatus } from '@/lib/local-db';
import type { SubmissionRow } from '@/lib/submission-status';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { downloadBackupOnly, downloadEuCopy, downloadPackage, downloadReport } from './submit-actions';
import { loadSubmitData, type SubmitData } from './submit-data';

type FileKey = 'eu' | 'report' | 'package' | 'backup';

const fmt = (value: number, digits = 3) => new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);
const when = (iso: string) => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

const ROW_MARK: Record<SubmissionRow['status'], { mark: string; label: string; className: string }> = {
    ok: { mark: '✓', label: '충족', className: 'bg-teal-700 text-white' },
    notice: { mark: '!', label: '확인', className: 'bg-amber-600 text-white' },
    blocked: { mark: '✕', label: '막힘', className: 'bg-red-600 text-white' },
};

export function SubmitWorkspace() {
    const [data, setData] = useState<SubmitData | null>(null);
    const [busy, setBusy] = useState<FileKey | ''>('');
    const [messages, setMessages] = useState<Partial<Record<FileKey, { ok: boolean; text: string; notices?: string[] }>>>({});
    const [loadMessage, setLoadMessage] = useState('');

    const reload = useCallback(async () => {
        setData(await loadSubmitData());
    }, []);

    useEffect(() => {
        let active = true;
        loadSubmitData()
            .then((loaded) => {
                if (active) setData(loaded);
            })
            .catch((error) => {
                console.error('[CBAM] 제출 화면이 저장된 자료를 읽지 못했습니다', error);
                if (active) setLoadMessage('저장된 자료를 읽지 못했습니다. 브라우저를 완전히 닫았다가 다시 열어 보세요. 새로 입력하지 마세요.');
            });
        return () => {
            active = false;
        };
    }, []);

    async function run(key: FileKey, action: () => Promise<{ text: string; notices?: string[] }>) {
        setBusy(key);
        setMessages((current) => ({ ...current, [key]: undefined }));
        try {
            const result = await action();
            setMessages((current) => ({ ...current, [key]: { ok: true, ...result } }));
            await reload();
        } catch (error) {
            setMessages((current) => ({ ...current, [key]: { ok: false, text: error instanceof Error ? error.message : '파일을 만들지 못했습니다.' } }));
        } finally {
            setBusy('');
        }
    }

    if (!data) {
        return <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">{loadMessage || '저장된 자료를 읽는 중입니다…'}</p>;
    }

    const { summary } = data;
    const blocked = summary.verdict.kind === 'blocked' || summary.verdict.kind === 'empty';
    const templateReady = Boolean(data.template?.validation.isValid);
    const disabledReason = blocked
        ? '먼저 막힌 항목을 해결하세요.'
        : !templateReady
            ? '내장 EU 템플릿을 불러오지 못했습니다. 상세 Export 화면에서 직접 올려 주세요.'
            : '';
    const backupStatus = getBackupStatus(data.lastBackupAt);
    const verdictClass = summary.verdict.kind === 'ready' ? 'border-teal-200 bg-teal-50' : summary.verdict.kind === 'notice' ? 'border-teal-200 bg-teal-50' : 'border-red-200 bg-red-50';

    const fileCard = (key: FileKey, title: string, description: string, buttonLabel: string, action: () => Promise<{ text: string; notices?: string[] }>, primary: boolean) => {
        const message = messages[key];
        return (
            <div className={`space-y-2 rounded-2xl border bg-white p-4 shadow-sm ${primary ? 'border-teal-600' : 'border-slate-200'}`} data-testid={`submit-file-${key}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-base font-bold text-slate-950">{title}</p>
                        <p className="mt-0.5 text-xs leading-5 text-slate-600">{description}</p>
                    </div>
                    <Button type="button" variant={primary ? 'primary' : 'secondary'} disabled={Boolean(disabledReason) || busy !== ''} onClick={() => void run(key, action)}>
                        {busy === key ? '만드는 중…' : buttonLabel}
                    </Button>
                </div>
                {disabledReason && <p className="text-xs text-slate-500">{disabledReason}</p>}
                {message && (
                    <div className={`text-sm leading-6 ${message.ok ? 'text-teal-900' : 'text-amber-800'}`} role={message.ok ? 'status' : 'alert'}>
                        <p>{message.text}</p>
                        {message.notices && message.notices.length > 0 && (
                            <details className="mt-1 text-xs text-slate-600">
                                <summary className="cursor-pointer font-semibold">산정보고서 점검 알림 {message.notices.length}건</summary>
                                <ul className="mt-1 list-disc space-y-0.5 pl-4">{message.notices.map((notice) => <li key={notice}>{notice}</li>)}</ul>
                            </details>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="mx-auto max-w-6xl space-y-4">
            <header className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight text-slate-950">제출</h1>
                <p className="text-sm leading-6 text-slate-600" data-testid="submit-subtitle">
                    {data.headline
                        ? <>{summary.rows.find((row) => row.id === 'products')?.detail} · 1톤당 <b className="tabular-nums text-slate-950">{data.headline.see === null ? '—' : fmt(data.headline.see)} tCO₂e</b> (CBAM 산정 기준 SEE) · 총 SEE(검토용) <span className="tabular-nums">{fmt(data.headline.totalSee)}</span></>
                        : '제품과 생산량을 입력하면 여기에 결과가 나옵니다.'}
                </p>
            </header>

            <div className={`rounded-xl border px-5 py-4 text-sm leading-6 ${verdictClass}`} data-testid="submit-verdict" data-kind={summary.verdict.kind}>
                <p className="flex items-start gap-2">
                    {blocked ? <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-red-700" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-teal-700" />}
                    <span><b>{summary.verdict.headline}</b> {summary.verdict.detail}</span>
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="점검표" data-testid="submit-checklist">
                    <h2 className="mb-1 text-base font-bold text-slate-950">점검표</h2>
                    <ul className="divide-y divide-slate-100">
                        {summary.rows.map((row) => (
                            <li key={row.id} className="flex items-start gap-3 py-3" data-testid="submit-row" data-status={row.status}>
                                <span className={`mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold ${ROW_MARK[row.status].className}`} aria-label={ROW_MARK[row.status].label}>{ROW_MARK[row.status].mark}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-900">{row.title}</p>
                                    <p className="text-xs leading-5 text-slate-600">{row.detail}</p>
                                </div>
                                {row.href && row.status !== 'ok' && <Link href={row.href} className="inline-flex flex-none items-center gap-1 text-sm font-bold text-teal-700 hover:underline">{row.hrefLabel ?? '열기'}<ArrowRight className="h-3.5 w-3.5" /></Link>}
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="space-y-3" aria-label="받을 파일">
                    <h2 className="text-base font-bold text-slate-950">받을 파일</h2>
                    {fileCard('eu', 'EU Communication 엑셀', '수입업자에게 보냅니다. 엑셀에서 한 번 열어 공식 수식이 다시 계산됐는지 보세요. 앱은 입력 셀에만 값을 넣고 공식 수식은 건드리지 않습니다.', '내려받기', async () => {
                        const result = await downloadEuCopy(data);
                        return { text: `${result.filename} — 입력 셀 ${result.writtenCellCount}개를 반영했습니다. Excel에서 열어 공식 수식 결과를 확인하세요.` };
                    }, true)}
                    {fileCard('report', '산정 보고서 (Word)', '검증인·사내 보관용. 값의 출처(실측·기본값)가 그대로 적힙니다.', '내려받기', async () => {
                        const result = await downloadReport(data);
                        return { text: `${result.filename} 을(를) 내려받았습니다.`, notices: result.notices };
                    }, false)}
                    {fileCard('package', '전달 패키지 (zip)', '위 두 파일 + 점검표 + 백업을 한 번에.', '내려받기', async () => {
                        const result = await downloadPackage(data);
                        return { text: `${result.filename} — 파일 ${result.files.length}개를 담았습니다. 백업도 함께 만들어 기록했습니다.`, notices: result.notices };
                    }, false)}

                    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm leading-6 ${backupStatus.tone === 'success' ? 'bg-slate-50 text-slate-700' : 'bg-amber-50 text-amber-950'}`} data-testid="submit-backup">
                        <span>
                            {data.lastBackupAt ? `마지막 백업: ${when(data.lastBackupAt)}. ` : ''}{backupStatus.helper}
                            {backupStatus.tone !== 'success' ? ' 제출 전에 새로 받아 두세요.' : ''}
                            {messages.backup && <span className="block text-teal-900">{messages.backup.text}</span>}
                        </span>
                        <Button type="button" variant="secondary" disabled={busy !== ''} onClick={() => void run('backup', async () => {
                            const result = await downloadBackupOnly();
                            return { text: `${result.filename} 을(를) 내려받았습니다. 회사의 안전한 폴더에 보관하세요.` };
                        })}>{busy === 'backup' ? '만드는 중…' : '백업 받기'}</Button>
                    </div>

                    <p className="text-xs leading-5 text-slate-500">
                        다른 EU 템플릿을 쓰거나 파일마다 더 자세히 점검하려면 <Link href="/export" className="font-semibold text-teal-700 hover:underline">상세 Export 화면</Link>을 이용하세요. 이 화면의 파일은 같은 자료·같은 방법으로 만듭니다.
                    </p>
                </section>
            </div>
        </div>
    );
}
