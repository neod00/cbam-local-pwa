import { getAdminSql, isAdminDbUnavailable } from '@/lib/admin-db';
import {
    hasOnlyAllowedKeys,
    hashVerificationCode,
    jsonResponse,
    makeVerificationCode,
    normalizeEmail,
    sendLicenseVerificationEmail,
    serviceUnavailable,
    verificationCodeExpiresAt,
} from '@/lib/license-api';

export const runtime = 'nodejs';

const allowedKeys = ['email'] as const;

export async function POST(request: Request) {
    let payload: Record<string, unknown>;

    try {
        const body = await request.json();
        payload = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    } catch {
        return jsonResponse({ message: 'Invalid JSON body' }, { status: 400 });
    }

    if (!hasOnlyAllowedKeys(payload, allowedKeys)) {
        return jsonResponse({ message: 'Unsupported verification field' }, { status: 400 });
    }

    const email = normalizeEmail(payload.email);
    if (!email || !email.includes('@')) {
        return jsonResponse({ message: 'Valid email is required' }, { status: 400 });
    }

    try {
        const sql = getAdminSql();
        const users = await sql`
            select id
            from license_users
            where email = ${email}
            limit 1
        ` as Array<{ id: string }>;

        if (!users[0]) {
            return jsonResponse({
                message: '등록된 이메일이면 인증코드를 발송합니다. 메일이 오지 않으면 무료 사용 등록을 먼저 진행하세요.',
            });
        }

        const code = makeVerificationCode();
        const codeHash = await hashVerificationCode(email, code);

        await sql`
            update license_email_verifications
            set consumed_at = now()
            where email = ${email}
              and purpose = 'license_recovery'
              and consumed_at is null
        `;

        await sql`
            insert into license_email_verifications (
                email,
                code_hash,
                purpose,
                expires_at
            )
            values (
                ${email},
                ${codeHash},
                'license_recovery',
                ${verificationCodeExpiresAt()}
            )
        `;

        await sendLicenseVerificationEmail(email, code);

        return jsonResponse({
            message: '인증코드를 이메일로 보냈습니다. 10분 안에 입력하세요.',
        });
    } catch (error) {
        if (isAdminDbUnavailable(error)) {
            return serviceUnavailable();
        }

        console.error('license verification code request failed', error);
        return jsonResponse({ message: '인증코드 발송에 실패했습니다. 관리자에게 메일 발송 설정을 확인해 달라고 요청하세요.' }, { status: 500 });
    }
}
