import { CBAM_LOCAL_APP_VERSION } from './local-db';

export type UpdatePolicyMode = 'none' | 'optional' | 'recommended' | 'required';

export interface UpdateManifest {
    latest_version: string;
    minimum_supported_version: string;
    update_policy: UpdatePolicyMode;
    notice_title: string;
    notice_body: string;
    release_notes_url?: string;
    effective_from?: string;
    target_audience?: string;
}

export interface UpdateStatus {
    mode: UpdatePolicyMode;
    latestVersion: string;
    currentVersion: string;
    title: string;
    body: string;
    releaseNotesUrl?: string;
    tone: 'info' | 'warning' | 'danger';
    canDismiss: boolean;
    shouldShow: boolean;
}

export const DEFAULT_UPDATE_MANIFEST: UpdateManifest = {
    latest_version: CBAM_LOCAL_APP_VERSION,
    minimum_supported_version: CBAM_LOCAL_APP_VERSION,
    update_policy: 'none',
    notice_title: 'CBAM Local 최신 버전입니다',
    notice_body: '현재 배포된 무료 PWA 버전은 계속 사용할 수 있습니다.',
    target_audience: 'free-pwa',
};

function parseVersion(value: string): number[] {
    return value
        .split(/[.-]/)
        .map((part) => Number.parseInt(part, 10))
        .map((part) => (Number.isFinite(part) ? part : 0));
}

export function compareVersions(left: string, right: string): number {
    const leftParts = parseVersion(left);
    const rightParts = parseVersion(right);
    const length = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < length; index += 1) {
        const leftPart = leftParts[index] ?? 0;
        const rightPart = rightParts[index] ?? 0;

        if (leftPart > rightPart) {
            return 1;
        }

        if (leftPart < rightPart) {
            return -1;
        }
    }

    return 0;
}

export function evaluateUpdateStatus(
    manifest: UpdateManifest = DEFAULT_UPDATE_MANIFEST,
    currentVersion = CBAM_LOCAL_APP_VERSION
): UpdateStatus {
    const isBelowMinimum = compareVersions(currentVersion, manifest.minimum_supported_version) < 0;
    const hasNewVersion = compareVersions(currentVersion, manifest.latest_version) < 0;
    const mode: UpdatePolicyMode = isBelowMinimum
        ? 'required'
        : hasNewVersion
            ? manifest.update_policy
            : 'none';

    return {
        mode,
        latestVersion: manifest.latest_version,
        currentVersion,
        title: mode === 'required' ? '필수 업데이트가 필요합니다' : manifest.notice_title,
        body: mode === 'required'
            ? '현재 버전은 더 이상 지원되지 않습니다. 계산과 Export를 계속하기 전에 최신 버전으로 새로고침하세요.'
            : manifest.notice_body,
        releaseNotesUrl: manifest.release_notes_url,
        tone: mode === 'required' ? 'danger' : mode === 'recommended' ? 'warning' : 'info',
        canDismiss: mode === 'optional' || mode === 'recommended',
        shouldShow: mode !== 'none',
    };
}

export async function fetchUpdateManifest(): Promise<UpdateManifest | undefined> {
    const response = await fetch('/update-manifest.json', {
        cache: 'no-store',
    });

    if (!response.ok) {
        return undefined;
    }

    return response.json() as Promise<UpdateManifest>;
}
