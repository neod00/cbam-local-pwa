import { getAdminSql, isAdminDbUnavailable } from '@/lib/admin-db';
import {
    DEFAULT_TERMS_VERSION,
    hasOnlyAllowedKeys,
    hashVerificationCode,
    jsonResponse,
    LICENSE_CODE_MAX_ATTEMPTS,
    nextCheckAfter,
    normalizeEmail,
    normalizeText,
    serviceUnavailable,
} from '@/lib/license-api';

export const runtime = 'nodejs';

const allowedKeys = ['email', 'code', 'app_version'] as const;

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
    const code = normalizeText(payload.code);

    if (!email || !email.includes('@')) {
        return jsonResponse({ message: 'Valid email is required' }, { status: 400 });
    }

    if (!/^\d{6}$/.test(code)) {
        return jsonResponse({ message: '6자리 인증코드를 입력하세요.' }, { status: 400 });
    }

    try {
        const sql = getAdminSql();
        const verificationRows = await sql`
            select id, code_hash, attempt_count
            from license_email_verifications
            where email = ${email}
              and purpose = 'license_recovery'
              and consumed_at is null
              and expires_at > now()
            order by created_at desc
            limit 1
        ` as Array<{ id: string; code_hash: string; attempt_count: number }>;

        const verification = verificationRows[0];
        if (!verification) {
            return jsonResponse({ message: '인증코드가 없거나 만료되었습니다. 새 코드를 요청하세요.' }, { status: 400 });
        }

        if (verification.attempt_count >= LICENSE_CODE_MAX_ATTEMPTS) {
            return jsonResponse({ message: '인증 시도 횟수를 초과했습니다. 새 코드를 요청하세요.' }, { status: 429 });
        }

        const codeHash = await hashVerificationCode(email, code);
        if (codeHash !== verification.code_hash) {
            await sql`
                update license_email_verifications
                set attempt_count = attempt_count + 1
                where id = ${verification.id}
            `;

            return jsonResponse({ message: '인증코드가 일치하지 않습니다.' }, { status: 400 });
        }

        const users = await sql`
            update license_users
            set last_license_check_at = now(),
                last_app_version = coalesce(${normalizeText(payload.app_version) || null}, last_app_version),
                updated_at = now()
            where email = ${email}
            returning
                email,
                company_name,
                contact_name,
                contact_phone,
                country,
                industry,
                license_status,
                license_key,
                accepted_terms_version,
                expires_at
        ` as Array<{
            email: string;
            company_name: string;
            contact_name: string | null;
            contact_phone: string | null;
            country: string | null;
            industry: string | null;
            license_status: string;
            license_key: string;
            accepted_terms_version: string | null;
            expires_at: string | null;
        }>;

        const user = users[0];
        if (!user) {
            return jsonResponse({ message: '등록된 무료 라이선스를 찾을 수 없습니다.' }, { status: 404 });
        }

        await sql`
            update license_email_verifications
            set consumed_at = now()
            where id = ${verification.id}
        `;

        return jsonResponse({
            email: user.email,
            company_name: user.company_name,
            contact_name: user.contact_name ?? '',
            contact_phone: user.contact_phone ?? '',
            country: user.country ?? 'South Korea',
            industry: user.industry ?? '',
            license_status: user.license_status,
            license_key: user.license_key,
            accepted_terms_version: user.accepted_terms_version ?? DEFAULT_TERMS_VERSION,
            expires_at: user.expires_at,
            next_check_after: nextCheckAfter(),
            message: user.license_status === 'UNREGISTERED'
                ? '이메일 인증은 완료되었습니다. 아직 관리자 승인 대기 상태입니다.'
                : '이메일 인증으로 무료 라이선스를 복구했습니다.',
        });
    } catch (error) {
        if (isAdminDbUnavailable(error)) {
            return serviceUnavailable();
        }

        console.error('license verification code check failed', error);
        return jsonResponse({ message: '인증코드 확인에 실패했습니다.' }, { status: 500 });
    }
}
