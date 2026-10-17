'use client';

import { listLocalItems, type CbamBackupFile } from '@/lib/local-db';
import { CBAM_LAST_BACKUP_AT_KEY, CBAM_LAST_CHANGE_AT_KEY, CBAM_PROJECT_CHANGED_EVENT } from '@/lib/local-db';
import {
    describeBackupContent,
    isProjectDirty,
    openRecentFile,
    readProjectFile,
    remember,
    saveProject,
    suggestProjectFilename,
    type FileHandleLike,
    type RecentFile,
} from '@/lib/project-file';
import {
    createBrowserProjectFileDeps,
    parseProjectFile,
    restoreProjectFromBackup,
    startNewProjectAndDetach,
    supportsFileSystemAccess,
} from '@/lib/project-file-browser';
import { ChevronDown, Clock, FileDown, FilePlus2, FileUp, Save, SaveAll } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * 파일 메뉴 — 새로 만들기 · 열기 · 저장(Ctrl+S) · 다른 이름으로 저장. 워드·엑셀처럼 파일 하나가 프로젝트다.
 * 파일 내용은 종전 백업(.cbam)과 같다. 브라우저 안의 자동 저장은 그대로 두고, 이 메뉴는 그 위에 파일로 내보내고 불러온다.
 *
 * 2단계: 「저장 안 된 변경 있음」 표시(마지막 변경 시각 > 마지막 저장 시각) · 연결된 파일이 있는데 저장 안 한 변경이 있을 때 창을 닫으면 경고 ·
 * 최근 파일 목록(핸들을 보관해 선택창 없이 연다 — 파일 접근 기능이 있는 브라우저).
 */

type Pending =
    | { kind: 'new' }
    | { kind: 'open'; parsed: CbamBackupFile; name: string; handle?: FileHandleLike };

const timeLabel = (iso: string | null) => {
    if (!iso) return null;
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return null;
    return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
};

export function FileMenu() {
    const deps = useMemo(() => createBrowserProjectFileDeps(), []);
    const direct = useMemo(() => supportsFileSystemAccess(), []);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [fileName, setFileName] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const [pending, setPending] = useState<Pending | null>(null);
    const [dirty, setDirty] = useState(false);
    const [recent, setRecent] = useState<RecentFile[]>([]);
    const rootRef = useRef<HTMLDivElement>(null);

    // 지금 연결된 파일 이름과 마지막 저장 시각
    useEffect(() => {
        let active = true;
        deps.handles.get().then((handle) => { if (active) setFileName(handle?.name ?? null); }).catch(() => undefined);
        try { setSavedAt(window.localStorage.getItem(CBAM_LAST_BACKUP_AT_KEY)); } catch { /* 저장소를 못 읽어도 메뉴는 쓴다 */ }
        return () => { active = false; };
    }, [deps]);

    // 저장 안 된 변경 — 입력이 바뀌면(같은 창은 이벤트, 다른 창은 storage) 다시 계산한다.
    const refreshDirty = useCallback(() => {
        try {
            setSavedAt(window.localStorage.getItem(CBAM_LAST_BACKUP_AT_KEY));
            setDirty(isProjectDirty(window.localStorage.getItem(CBAM_LAST_CHANGE_AT_KEY), window.localStorage.getItem(CBAM_LAST_BACKUP_AT_KEY)));
        } catch { /* 저장소를 못 읽으면 표시만 못 한다 */ }
    }, []);
    useEffect(() => {
        refreshDirty();
        window.addEventListener(CBAM_PROJECT_CHANGED_EVENT, refreshDirty);
        window.addEventListener('storage', refreshDirty);
        return () => {
            window.removeEventListener(CBAM_PROJECT_CHANGED_EVENT, refreshDirty);
            window.removeEventListener('storage', refreshDirty);
        };
    }, [refreshDirty]);

    // 창을 닫을 때 경고 — 연결된 파일이 있는데 그 파일에 없는 변경이 있을 때만. 입력은 브라우저에 자동 저장되므로 파일 없이 쓰는 사람에게는 묻지 않는다.
    useEffect(() => {
        if (!dirty || !fileName) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty, fileName]);

    // 메뉴를 열 때마다 최근 파일 목록을 읽는다.
    useEffect(() => {
        if (!open || !deps.recent) return;
        let active = true;
        deps.recent.list().then((list) => { if (active) setRecent(list); }).catch(() => undefined);
        return () => { active = false; };
    }, [open, deps]);

    useEffect(() => {
        if (!open) return;
        const close = (event: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const suggestedName = useCallback(async () => {
        const [installations, periods] = await Promise.all([listLocalItems('installations'), listLocalItems('periods')]);
        return suggestProjectFilename(installations[0], periods[0]);
    }, []);

    /** 저장. 취소했으면 false. */
    const save = useCallback(async (saveAs: boolean): Promise<boolean> => {
        setBusy(true);
        setMessage('');
        try {
            const result = await saveProject(deps, { saveAs, suggestedName: await suggestedName() });
            if (result.status === 'cancelled') return false;
            setFileName(result.how === 'download' ? null : result.name);
            setSavedAt(result.savedAt);
            refreshDirty();
            setMessage(result.how === 'download'
                ? `「${result.name}」을(를) 내려받았습니다. 이 브라우저는 같은 파일에 덮어쓰기를 지원하지 않아 저장할 때마다 내려받습니다.`
                : `「${result.name}」에 저장했습니다.`);
            return true;
        } catch (error) {
            setMessage(error instanceof Error ? `저장하지 못했습니다: ${error.message}` : '저장하지 못했습니다.');
            return false;
        } finally {
            setBusy(false);
        }
    }, [deps, suggestedName, refreshDirty]);

    // Ctrl+S / ⌘S
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 's') {
                event.preventDefault();
                void save(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [save]);

    async function handleOpen() {
        setOpen(false);
        setBusy(true);
        setMessage('');
        try {
            const result = await readProjectFile(deps, parseProjectFile);
            if (result.status === 'opened') setPending({ kind: 'open', parsed: result.parsed, name: result.name, handle: result.handle });
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '파일을 읽지 못했습니다.');
        } finally {
            setBusy(false);
        }
    }

    async function handleOpenRecent(entry: RecentFile) {
        setOpen(false);
        setBusy(true);
        setMessage('');
        try {
            const result = await openRecentFile(entry, parseProjectFile);
            if (result.status === 'opened') {
                setPending({ kind: 'open', parsed: result.parsed, name: result.name, handle: result.handle });
            } else if (result.status === 'denied') {
                setMessage(`「${entry.name}」을(를) 읽을 권한을 받지 못했습니다. 「열기…」로 다시 고르세요.`);
            } else if (result.status === 'missing') {
                await deps.recent?.remove(entry.name);
                setMessage(`「${entry.name}」을(를) 찾을 수 없습니다(지웠거나 옮겼습니다). 최근 목록에서 뺐습니다.`);
            }
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '파일을 읽지 못했습니다.');
        } finally {
            setBusy(false);
        }
    }

    async function proceed(saveFirst: boolean) {
        const target = pending;
        if (!target) return;
        if (saveFirst && !(await save(false))) return; // 저장을 취소하면 그대로 둔다
        setBusy(true);
        try {
            if (target.kind === 'new') {
                await startNewProjectAndDetach(deps);
            } else {
                await restoreProjectFromBackup(target.parsed);
                if (target.handle) {
                    await deps.handles.set(target.handle);
                    await remember(deps, target.handle, new Date().toISOString());
                } else {
                    await deps.handles.clear();
                }
            }
            // 화면들이 저장소를 새로 읽도록 지도로 돌아가 다시 시작한다.
            window.location.assign('/');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '작업을 마치지 못했습니다.');
            setBusy(false);
        } finally {
            setPending(null);
        }
    }

    const itemClass = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50';
    const base = fileName ? `${fileName}${savedAt ? ` · ${timeLabel(savedAt)} 저장` : ''}` : savedAt ? `파일 이름 없음 · ${timeLabel(savedAt)} 저장` : '아직 파일로 저장하지 않음';
    const status = dirty ? `${base} · 저장 안 된 변경 있음` : base;

    return (
        <div ref={rootRef} className="relative" data-testid="file-menu">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                aria-haspopup="menu"
                disabled={busy}
                data-testid="file-menu-button"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
            >
                파일
                {dirty && <span className="h-2 w-2 rounded-full bg-amber-500" title="파일에 저장 안 된 변경이 있습니다" data-testid="file-dirty-dot" />}
                {dirty && <span className="sr-only">저장 안 된 변경 있음</span>}
                <ChevronDown className="h-4 w-4" />
            </button>
            {open && (
                <div role="menu" className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                    <p className="px-3 pb-2 pt-1 text-xs leading-5 text-slate-500" data-testid="file-menu-status">{status}</p>
                    <button type="button" role="menuitem" className={itemClass} onClick={() => { setOpen(false); setPending({ kind: 'new' }); }} data-testid="file-new"><FilePlus2 className="h-4 w-4" />새로 만들기</button>
                    <button type="button" role="menuitem" className={itemClass} onClick={() => void handleOpen()} data-testid="file-open"><FileUp className="h-4 w-4" />열기…</button>
                    <button type="button" role="menuitem" className={itemClass} onClick={() => { setOpen(false); void save(false); }} data-testid="file-save"><Save className="h-4 w-4" />저장 <span className="ml-auto text-xs font-normal text-slate-400">Ctrl+S</span></button>
                    <button type="button" role="menuitem" className={itemClass} onClick={() => { setOpen(false); void save(true); }} data-testid="file-save-as"><SaveAll className="h-4 w-4" />다른 이름으로 저장…</button>
                    {recent.length > 0 && (
                        <div className="mt-1 border-t border-slate-100 pt-1" data-testid="file-recent">
                            <p className="px-3 pb-1 pt-1 text-xs font-semibold text-slate-500">최근 파일</p>
                            {recent.map((entry) => (
                                <button key={entry.name} type="button" role="menuitem" className={itemClass} onClick={() => void handleOpenRecent(entry)} data-testid="file-recent-item" title={`${entry.name} · ${entry.at.slice(0, 16).replace('T', ' ')} 저장·열기`}>
                                    <Clock className="h-4 w-4 flex-none text-slate-400" />
                                    <span className="min-w-0 truncate">{entry.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <p className="px-3 pt-2 text-xs leading-5 text-slate-500">
                        {direct ? '입력한 내용은 이 브라우저에 자동으로 저장됩니다. 파일로 저장하면 다른 컴퓨터로 옮기거나 보관할 수 있습니다.' : '이 브라우저에서는 저장할 때마다 .cbam 파일을 내려받습니다(같은 파일에 덮어쓰지 못합니다). Chrome·Edge에서는 덮어쓰기가 됩니다.'}
                    </p>
                </div>
            )}
            {message && !pending && (
                <div role="status" className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-900 shadow" data-testid="file-menu-message">
                    {message}
                    <button type="button" className="ml-2 font-bold underline" onClick={() => setMessage('')}>닫기</button>
                </div>
            )}
            {pending && (
                <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 px-4" role="dialog" aria-modal="true" data-testid="file-dialog">
                    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
                        <h2 className="flex items-center gap-2 text-base font-bold text-slate-950">
                            {pending.kind === 'new' ? <FilePlus2 className="h-5 w-5 text-teal-700" /> : <FileDown className="h-5 w-5 text-teal-700" />}
                            {pending.kind === 'new' ? '새 프로젝트를 시작할까요?' : `「${pending.name}」을(를) 열까요?`}
                        </h2>
                        {pending.kind === 'open' && (
                            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">{describeBackupContent(pending.parsed.manifest)}</p>
                        )}
                        <p className="mt-3 text-sm leading-6 text-slate-700">
                            {pending.kind === 'new'
                                ? '지금 작업을 비우고 빈 프로젝트로 시작합니다. 라이선스·EU 기본값 파일·비용 가정은 그대로 남습니다.'
                                : '지금 작업이 이 파일의 내용으로 바뀝니다.'}
                            {' '}먼저 지금 작업을 파일로 저장해 두시겠어요?
                        </p>
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button type="button" className="min-h-9 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setPending(null)} data-testid="file-dialog-cancel">취소</button>
                            <button type="button" className="min-h-9 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60" disabled={busy} onClick={() => void proceed(false)} data-testid="file-dialog-discard">저장 안 하고 {pending.kind === 'new' ? '새로 만들기' : '열기'}</button>
                            <button type="button" className="min-h-9 rounded-xl bg-teal-700 px-3 text-sm font-bold text-white hover:bg-teal-600 disabled:opacity-60" disabled={busy} onClick={() => void proceed(true)} data-testid="file-dialog-save">저장하고 {pending.kind === 'new' ? '새로 만들기' : '열기'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
