import { ensureBundledReferences } from './bundled-references';
import { FREE_LICENSE_SETTING_KEY } from './free-license-client';
import {
    CBAM_LAST_BACKUP_AT_KEY,
    exportLocalBackup,
    getLocalSetting,
    importLocalBackup,
    parseBackupFile,
    setLocalSetting,
    startNewProject,
    type CbamBackupFile,
} from './local-db';
import { backupFilename, PROJECT_FILE_EXTENSION, type FileHandleLike, type FilePickerOptions, type ProjectFileDeps } from './project-file';

/**
 * 프로젝트 파일 기능의 브라우저 쪽 연결 — 파일 선택창·내려받기·핸들 보관.
 * 핸들은 **별도의 작은 저장소**(cbam-file-handles)에 둔다. 프로젝트 저장소(cbam-local)에 두면 백업 파일에 섞여 들어가고
 * 「새 프로젝트」가 지울 때 함께 사라진다.
 */

const HANDLE_DB = 'cbam-file-handles';
const HANDLE_STORE = 'handles';
const HANDLE_KEY = 'current';

function openHandleDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(HANDLE_DB, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(HANDLE_STORE)) request.result.createObjectStore(HANDLE_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
    try {
        const db = await openHandleDb();
        return await new Promise<T | undefined>((resolve, reject) => {
            const request = run(db.transaction(HANDLE_STORE, mode).objectStore(HANDLE_STORE));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch {
        // 핸들을 보관하지 못해도 저장 자체는 된다 — 다음 번에 이름을 다시 고르게 될 뿐이다(시크릿 창 등).
        return undefined;
    }
}

interface PickerWindow {
    showSaveFilePicker?: (options: FilePickerOptions) => Promise<FileHandleLike>;
    showOpenFilePicker?: (options: FilePickerOptions) => Promise<FileHandleLike[]>;
}

export function supportsFileSystemAccess(): boolean {
    return typeof window !== 'undefined' && typeof (window as unknown as PickerWindow).showSaveFilePicker === 'function';
}

export function createBrowserProjectFileDeps(): ProjectFileDeps<CbamBackupFile> {
    const picker = typeof window !== 'undefined' ? (window as unknown as PickerWindow) : {};
    return {
        exportBackup: () => exportLocalBackup(),
        showSaveFilePicker: picker.showSaveFilePicker ? (options) => picker.showSaveFilePicker!.call(window, options) : undefined,
        showOpenFilePicker: picker.showOpenFilePicker ? (options) => picker.showOpenFilePicker!.call(window, options) : undefined,
        download(blob, filename) {
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
        },
        pickFileFallback: () => new Promise<File | undefined>((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = `${PROJECT_FILE_EXTENSION},application/json`;
            input.onchange = () => resolve(input.files?.[0]);
            input.addEventListener('cancel', () => resolve(undefined));
            input.click();
        }),
        handles: {
            get: async () => (await withStore<FileHandleLike>('readonly', (store) => store.get(HANDLE_KEY))) ?? undefined,
            set: async (handle) => { await withStore('readwrite', (store) => store.put(handle, HANDLE_KEY)); },
            clear: async () => { await withStore('readwrite', (store) => store.delete(HANDLE_KEY)); },
        },
        markSaved: (isoTime) => window.localStorage.setItem(CBAM_LAST_BACKUP_AT_KEY, isoTime),
    };
}

export const parseProjectFile = parseBackupFile;

/**
 * 고른 .cbam 파일의 내용으로 현재 프로젝트를 **바꾼다**. 설정 화면의 백업 복원과 같은 순서다:
 * 복원 → 내장 EU 기준값을 다시 넣음 → 백업에 라이선스가 없으면 지금 브라우저의 등록 상태를 유지.
 */
export async function restoreProjectFromBackup(parsed: CbamBackupFile): Promise<void> {
    const currentLicense = await getLocalSetting<unknown>(FREE_LICENSE_SETTING_KEY);
    await importLocalBackup(parsed);
    await ensureBundledReferences(true);
    const restoredLicense = parsed.data.settings.find((item) => item.key === FREE_LICENSE_SETTING_KEY);
    if (!restoredLicense?.value && currentLicense) {
        await setLocalSetting(FREE_LICENSE_SETTING_KEY, currentLicense);
    }
    window.localStorage.setItem(CBAM_LAST_BACKUP_AT_KEY, parsed.manifest.exported_at);
}

/**
 * 지금 프로젝트를 .cbam 파일로 내려받은 **뒤에** 비우고 새 프로젝트로 시작한다 — 고친 서식을 같은 프로젝트에 다시 올릴 때(바꿔 넣기) 쓴다.
 * 백업을 만들지 못하면(exportBackup이 던지면) 아무것도 지우지 않는다. 내려받은 파일 이름을 돌려준다.
 */
export async function backupAndStartNewProject(deps: ProjectFileDeps<CbamBackupFile> = createBrowserProjectFileDeps()): Promise<string> {
    const backup = await deps.exportBackup();
    const filename = backupFilename(backup.manifest.exported_at);
    deps.download(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), filename);
    await startNewProjectAndDetach(deps);
    return filename;
}

/** 새 프로젝트를 시작한다(입력 자료만 비움 — 라이선스·EU 기본값·벤치마크·비용 가정은 유지). 연결된 파일도 끊는다. */
export async function startNewProjectAndDetach(deps: ProjectFileDeps<CbamBackupFile>): Promise<void> {
    await startNewProject();
    window.localStorage.removeItem(CBAM_LAST_BACKUP_AT_KEY);
    await deps.handles.clear();
}
