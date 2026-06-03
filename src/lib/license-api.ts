export const LICENSE_STATUS = {
    unregistered: 'UNREGISTERED',
    freeActive: 'FREE_ACTIVE',
    offlineAllowed: 'OFFLINE_ALLOWED',
    recheckRequired: 'RECHECK_REQUIRED',
    blocked: 'BLOCKED',
} as const;

export type LicenseStatus = typeof LICENSE_STATUS[keyof typeof LICENSE_STATUS];

export const DEFAULT_TERMS_VERSION = '2026.06-beta';
export const DEFAULT_NEXT_CHECK_DAYS = 7;

export function jsonResponse(body: unknown, init?: ResponseInit) {
    return Response.json(body, {
        ...init,
        headers: {
            'Cache-Control': 'no-store',
            ...(init?.headers ?? {}),
        },
    });
}

export function serviceUnavailable() {
    return jsonResponse(
        {
            message: 'License service is not configured yet. The local-first PWA can continue to run without sending CBAM data.',
        },
        { status: 503 }
    );
}

export function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

export function normalizeOptionalText(value: unknown) {
    const text = normalizeText(value);
    return text.length > 0 ? text : null;
}

export function normalizeEmail(value: unknown) {
    return normalizeText(value).toLowerCase();
}

export function hasOnlyAllowedKeys(payload: Record<string, unknown>, allowedKeys: readonly string[]) {
    const allowed = new Set(allowedKeys);
    return Object.keys(payload).every((key) => allowed.has(key));
}

export function nextCheckAfter(days = DEFAULT_NEXT_CHECK_DAYS) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
}

export function makeLicenseKey() {
    return `free_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function defaultUpdateManifest() {
    return {
        latest_version: '0.1.0',
        minimum_supported_version: '0.1.0',
        update_policy: 'none',
        notice_title: 'CBAM Local 최신 버전입니다',
        notice_body: '현재 배포된 무료 PWA 버전은 계속 사용할 수 있습니다.',
        release_notes_url: '/release-notes',
        effective_from: '2026-05-31',
    };
}
