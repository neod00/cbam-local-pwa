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
export const LICENSE_CODE_TTL_MINUTES = 10;
export const LICENSE_CODE_MAX_ATTEMPTS = 5;

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

export function makeVerificationCode() {
    return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
}

export async function hashVerificationCode(email: string, code: string) {
    const secret = process.env.LICENSE_CODE_SECRET ?? process.env.AUTH_SECRET ?? 'cbam-local-dev-secret';
    const payload = `${normalizeEmail(email)}:${code.trim()}:${secret}`;
    const bytes = new TextEncoder().encode(payload);
    const digest = await crypto.subtle.digest('SHA-256', bytes);

    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

export function verificationCodeExpiresAt(minutes = LICENSE_CODE_TTL_MINUTES) {
    const date = new Date();
    date.setMinutes(date.getMinutes() + minutes);
    return date.toISOString();
}

function createLicenseVerificationEmailText(code: string) {
    return [
        'CBAM Local 무료 라이선스 복구 인증코드입니다.',
        '',
        `인증코드: ${code}`,
        '',
        `이 코드는 ${LICENSE_CODE_TTL_MINUTES}분 동안만 사용할 수 있습니다.`,
        '생산량, 배출량, EU 템플릿, .cbam 백업 파일은 서버로 전송되지 않습니다.',
    ].join('\n');
}

function encodeBase64Url(value: string) {
    return Buffer.from(value, 'utf8')
        .toString('base64')
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
}

function encodeEmailHeader(value: string) {
    return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

async function sendLicenseVerificationEmailWithGmail(email: string, code: string) {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
    const fromEmail = process.env.GMAIL_FROM_EMAIL ?? process.env.SMTP_FROM ?? process.env.SMTP_USER;
    const fromName = process.env.GMAIL_FROM_NAME ?? 'CBAM Local';

    if (!clientId || !clientSecret || !refreshToken || !fromEmail) {
        throw new Error('Gmail API email settings are not configured');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }),
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));

    if (!tokenResponse.ok || typeof tokenData.access_token !== 'string') {
        throw new Error(`Gmail OAuth token request failed: ${tokenResponse.status}`);
    }

    const subject = '[CBAM Local] 무료 라이선스 인증코드';
    const rawMessage = [
        `From: ${encodeEmailHeader(fromName)} <${fromEmail}>`,
        `To: ${email}`,
        `Subject: ${encodeEmailHeader(subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        createLicenseVerificationEmailText(code),
    ].join('\r\n');

    const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${tokenData.access_token}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            raw: encodeBase64Url(rawMessage),
        }),
    });

    if (!sendResponse.ok) {
        throw new Error(`Gmail send request failed: ${sendResponse.status}`);
    }
}

async function sendLicenseVerificationEmailWithResend(email: string, code: string) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL ?? 'CBAM Local <onboarding@resend.dev>';

    if (!apiKey) {
        throw new Error('RESEND_API_KEY is not configured');
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            from,
            to: email,
            subject: '[CBAM Local] 무료 라이선스 인증코드',
            text: createLicenseVerificationEmailText(code),
        }),
    });

    if (!response.ok) {
        throw new Error(`Resend email request failed: ${response.status}`);
    }
}

export async function sendLicenseVerificationEmail(email: string, code: string) {
    if (process.env.GMAIL_REFRESH_TOKEN) {
        await sendLicenseVerificationEmailWithGmail(email, code);
        return;
    }

    await sendLicenseVerificationEmailWithResend(email, code);
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
