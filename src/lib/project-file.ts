/**
 * 프로젝트 파일(.cbam) — 워드·엑셀처럼 「저장 / 다른 이름으로 저장 / 열기」를 한다.
 *
 * 파일의 내용은 종전의 백업 파일과 같다(`exportLocalBackup` → .cbam). 새 형식도 새 저장 데이터도 없다.
 * 이 모듈은 브라우저 기능(파일 선택창·내려받기·저장소)을 **주입받는다** — 점검 스크립트가 같은 코드를 가짜 파일 핸들로 돌린다.
 *
 * 동작:
 *  · 저장: 지금 연결된 파일이 있으면 그 파일에 덮어쓴다(Chrome·Edge의 파일 접근 기능). 없으면 이름·위치를 고른다.
 *  · 다른 이름으로 저장: 항상 이름·위치를 고르고, 이후 저장은 그 파일에 이어진다.
 *  · 파일 접근 기능이 없는 브라우저(Firefox·Safari)에서는 「저장」이 같은 이름으로 내려받기다(덮어쓰기는 못 한다).
 *  · 브라우저 안의 자동 저장은 그대로다 — 파일 저장은 그 위에 얹는 안전망이고 내보내기다.
 */

export const PROJECT_FILE_EXTENSION = '.cbam';

/**
 * 백업 파일 이름 — 날짜와 시각(분)까지 넣는다. 날짜만 있으면 같은 날 두 번째 백업부터 이름이 겹쳐
 * 어느 것이 먼저의 것인지 알 수 없다(run37 P2-03). 시각은 이 컴퓨터의 시각이다. 파일 이름에 쓸 수 없는 「:」는 쓰지 않는다.
 */
export function backupFilename(exportedAtIso: string): string {
    const at = new Date(exportedAtIso);
    const date = Number.isNaN(at.getTime()) ? new Date() : at;
    const pad = (value: number) => String(value).padStart(2, '0');
    return `cbam-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${PROJECT_FILE_EXTENSION}`;
}
export const PROJECT_FILE_DESCRIPTION = 'CBAM 프로젝트 파일';

export interface WritableLike {
    write(data: string | Blob): Promise<void>;
    close(): Promise<void>;
}

export interface FileHandleLike {
    name: string;
    createWritable(): Promise<WritableLike>;
    getFile(): Promise<File>;
    queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
    requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
}

/** 최근에 저장하거나 연 파일 한 건 — 핸들을 보관하므로 다시 열 때 선택창 없이 권한만 묻는다(Chrome·Edge). */
export interface RecentFile {
    name: string;
    handle: FileHandleLike;
    /** 마지막으로 저장하거나 연 시각(ISO) */
    at: string;
}

export const MAX_RECENT_FILES = 5;

/** 최근 목록에 한 건을 맨 앞으로 올린다. 같은 이름은 하나로 합친다(폴더가 달라도 이름이 같으면 가장 최근 것만 남는다). */
export function addRecent(list: RecentFile[], handle: FileHandleLike, at: string): RecentFile[] {
    return [{ name: handle.name, handle, at }, ...list.filter((item) => item.name !== handle.name)].slice(0, MAX_RECENT_FILES);
}

/**
 * 파일에 저장되지 않은 변경이 있는가 — 마지막 변경이 마지막 저장보다 늦으면 true. 변경 표시가 없으면(아직 아무것도 안 바꿈) false,
 * 저장한 적이 없으면(저장 시각이 없거나 읽을 수 없으면) 변경이 있는 즉시 true.
 */
export function isProjectDirty(lastChangeAt: string | null | undefined, lastSavedAt: string | null | undefined): boolean {
    const changed = lastChangeAt ? Date.parse(lastChangeAt) : NaN;
    if (!Number.isFinite(changed)) return false;
    const saved = lastSavedAt ? Date.parse(lastSavedAt) : NaN;
    return !Number.isFinite(saved) || changed > saved;
}

export interface FilePickerOptions {
    suggestedName?: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
    multiple?: boolean;
}

export interface ProjectFileDeps<TBackup = unknown> {
    /** 지금 브라우저에 든 프로젝트를 백업 형식으로 꺼낸다 */
    exportBackup(): Promise<{ manifest: { exported_at: string } } & TBackup>;
    /** 있으면 같은 파일에 덮어쓰고 이름·위치를 고를 수 있는 브라우저 */
    showSaveFilePicker?: (options: FilePickerOptions) => Promise<FileHandleLike>;
    showOpenFilePicker?: (options: FilePickerOptions) => Promise<FileHandleLike[]>;
    /** 파일 접근 기능이 없을 때 쓰는 내려받기 */
    download(blob: Blob, filename: string): void;
    /** 파일 접근 기능이 없을 때 쓰는 파일 고르기. 취소하면 undefined */
    pickFileFallback?: () => Promise<File | undefined>;
    /** 지금 연결된 파일의 핸들(브라우저를 닫았다 열어도 남는다) */
    handles: {
        get(): Promise<FileHandleLike | undefined>;
        set(handle: FileHandleLike): Promise<void>;
        clear(): Promise<void>;
    };
    /** 저장한 시각을 「마지막 백업」으로 기록한다 */
    markSaved(isoTime: string): void;
    /** 최근 파일 목록(파일 접근 기능이 있는 브라우저만). 없으면 목록을 만들지 않는다. */
    recent?: {
        list(): Promise<RecentFile[]>;
        add(handle: FileHandleLike, at: string): Promise<void>;
        remove(name: string): Promise<void>;
    };
}

export type SaveResult =
    | { status: 'saved'; name: string; how: 'overwrite' | 'picked' | 'download'; savedAt: string }
    | { status: 'cancelled' };

const TYPES: FilePickerOptions['types'] = [{ description: PROJECT_FILE_DESCRIPTION, accept: { 'application/json': [PROJECT_FILE_EXTENSION] } }];

const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError';

/** 파일 이름에 쓸 수 없는 글자를 걸러 낸다(윈도우 기준). */
function sanitizeFilePart(value: string) {
    return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** `대일기업_2025.cbam`처럼 사업장 이름과 보고연도를 붙여 제안한다. 둘 다 모르면 「CBAM_프로젝트」. */
export function suggestProjectFilename(
    installation: { local_name?: string; name?: string } | undefined,
    period: { start_date?: string } | undefined,
): string {
    const base = sanitizeFilePart(installation?.local_name || installation?.name || '') || 'CBAM_프로젝트';
    const year = (period?.start_date ?? '').slice(0, 4);
    const withYear = /^\d{4}$/.test(year) ? `${base}_${year}` : base;
    return `${withYear.slice(0, 80)}${PROJECT_FILE_EXTENSION}`;
}

export function withProjectExtension(name: string): string {
    return name.toLowerCase().endsWith(PROJECT_FILE_EXTENSION) ? name : `${name}${PROJECT_FILE_EXTENSION}`;
}

async function writeTo(handle: FileHandleLike, text: string) {
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
}

/** 덮어쓰기 전에 쓰기 권한을 확인한다. 브라우저를 다시 열면 권한이 풀려 있어 한 번 더 묻는다(사용자 동작 안에서 불러야 한다). */
async function hasWritePermission(handle: FileHandleLike): Promise<boolean> {
    if (!handle.queryPermission) return true;
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    if (!handle.requestPermission) return false;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/** 최근 목록에 올린다. 목록을 못 써도 저장은 이미 끝났다 — 조용히 넘어간다. */
export async function remember(deps: Pick<ProjectFileDeps, 'recent'>, handle: FileHandleLike, at: string): Promise<void> {
    try { await deps.recent?.add(handle, at); } catch { /* 최근 목록은 편의 기능이다 */ }
}

export async function saveProject<TBackup>(deps: ProjectFileDeps<TBackup>, options: { saveAs?: boolean; suggestedName: string }): Promise<SaveResult> {
    const backup = await deps.exportBackup();
    const text = JSON.stringify(backup, null, 2);
    const savedAt = backup.manifest.exported_at;

    if (deps.showSaveFilePicker) {
        // 연결된 파일에 덮어쓴다 — 파일이 지워졌거나 권한을 못 받으면 아래에서 이름을 다시 고르게 한다.
        if (!options.saveAs) {
            const current = await deps.handles.get();
            if (current) {
                try {
                    if (await hasWritePermission(current)) {
                        await writeTo(current, text);
                        deps.markSaved(savedAt);
                        await remember(deps, current, savedAt);
                        return { status: 'saved', name: current.name, how: 'overwrite', savedAt };
                    }
                } catch (error) {
                    if (isAbort(error)) return { status: 'cancelled' };
                    // 파일을 쓸 수 없다 — 이름을 다시 고르게 한다.
                }
            }
        }
        try {
            const handle = await deps.showSaveFilePicker({ suggestedName: options.suggestedName, types: TYPES });
            await writeTo(handle, text);
            await deps.handles.set(handle);
            deps.markSaved(savedAt);
            await remember(deps, handle, savedAt);
            return { status: 'saved', name: handle.name, how: 'picked', savedAt };
        } catch (error) {
            if (isAbort(error)) return { status: 'cancelled' };
            throw error;
        }
    }

    // 파일 접근 기능이 없는 브라우저: 같은 이름으로 내려받는다.
    const name = withProjectExtension(options.suggestedName);
    deps.download(new Blob([text], { type: 'application/json' }), name);
    deps.markSaved(savedAt);
    return { status: 'saved', name, how: 'download', savedAt };
}

export type OpenResult<TParsed> =
    | { status: 'opened'; parsed: TParsed; name: string; handle?: FileHandleLike }
    | { status: 'cancelled' };

/** .cbam 파일을 골라 읽는다. 아직 아무것도 바꾸지 않는다 — 고른 파일의 내용을 보여 주고 사용자가 확인한 뒤에 복원한다. */
export async function readProjectFile<TParsed>(
    deps: Pick<ProjectFileDeps, 'showOpenFilePicker' | 'pickFileFallback'>,
    parse: (content: string) => TParsed,
): Promise<OpenResult<TParsed>> {
    let file: File | undefined;
    let handle: FileHandleLike | undefined;
    if (deps.showOpenFilePicker) {
        try {
            const [picked] = await deps.showOpenFilePicker({ types: TYPES, multiple: false });
            if (!picked) return { status: 'cancelled' };
            handle = picked;
            file = await picked.getFile();
        } catch (error) {
            if (isAbort(error)) return { status: 'cancelled' };
            throw error;
        }
    } else if (deps.pickFileFallback) {
        file = await deps.pickFileFallback();
    }
    if (!file) return { status: 'cancelled' };
    const parsed = parse(await file.text());
    return { status: 'opened', parsed, name: file.name, handle };
}

export type OpenRecentResult<TParsed> = OpenResult<TParsed> | { status: 'denied' } | { status: 'missing' };

/**
 * 최근 파일 한 건을 다시 연다 — 선택창 없이 보관한 핸들로 읽는다. 읽기 권한이 풀려 있으면 한 번 묻는다(사용자 동작 안에서 불러야 한다).
 * 권한을 거절하면 denied, 파일이 지워졌거나 옮겨졌으면 missing(목록에서 뺄 수 있다). 아직 아무것도 바꾸지 않는다 — 열기 확인 창은 호출한 쪽이 띄운다.
 */
export async function openRecentFile<TParsed>(entry: RecentFile, parse: (content: string) => TParsed): Promise<OpenRecentResult<TParsed>> {
    const handle = entry.handle;
    try {
        if (handle.queryPermission && (await handle.queryPermission({ mode: 'read' })) !== 'granted') {
            if (!handle.requestPermission || (await handle.requestPermission({ mode: 'read' })) !== 'granted') return { status: 'denied' };
        }
        const file = await handle.getFile();
        const parsed = parse(await file.text());
        return { status: 'opened', parsed, name: file.name, handle };
    } catch (error) {
        if (isAbort(error)) return { status: 'cancelled' };
        if (error instanceof Error && error.name === 'NotFoundError') return { status: 'missing' };
        throw error;
    }
}

/** 확인 창에 보일 한 줄 — 열려는 파일에 무엇이 들었는지. */
export function describeBackupContent(manifest: { exported_at?: string; counts?: Record<string, number> } | undefined): string {
    const counts = manifest?.counts ?? {};
    const parts = [
        ['products', '제품'],
        ['processes', '공정'],
        ['source_streams', '배출원'],
        ['precursors', '구매 강재'],
    ].map(([key, label]) => `${label} ${counts[key] ?? 0}개`);
    const at = manifest?.exported_at ? new Date(manifest.exported_at) : undefined;
    const when = at && !Number.isNaN(at.getTime()) ? `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')} 저장` : '저장 시각 모름';
    return `${parts.join(' · ')} · ${when}`;
}
