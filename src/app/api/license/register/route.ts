import { getAdminSql, isAdminDbUnavailable } from '@/lib/admin-db';
import {
    DEFAULT_TERMS_VERSION,
    hasOnlyAllowedKeys,
    jsonResponse,
    makeLicenseKey,
    nextCheckAfter,
    normalizeEmail,
    normalizeOptionalText,
    normalizeText,
    serviceUnavailable,
} from '@/lib/license-api';

export const runtime = 'nodejs';

const allowedKeys = [
    'email',
    'company_name',
    'contact_name',
    'contact_phone',
    'country',
    'industry',
    'accepted_terms_version',
    'app_version',
] as const;

export async function POST(request: Request) {
    let payload: Record<string, unknown>;

    try {
        const body = await request.json();
        payload = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    } catch {
        return jsonResponse({ message: 'Invalid JSON body' }, { status: 400 });
    }

    if (!hasOnlyAllowedKeys(payload, allowedKeys)) {
        return jsonResponse({ message: 'Unsupported registration field' }, { status: 400 });
    }

    const email = normalizeEmail(payload.email);
    const companyName = normalizeText(payload.company_name);
    const acceptedTermsVersion = normalizeText(payload.accepted_terms_version) || DEFAULT_TERMS_VERSION;

    if (!email || !email.includes('@')) {
        return jsonResponse({ message: 'Valid email is required' }, { status: 400 });
    }

    if (!companyName) {
        return jsonResponse({ message: 'company_name is required' }, { status: 400 });
    }

    try {
        const sql = getAdminSql();
        const rows = await sql`
            insert into license_users (
                email,
                company_name,
                contact_name,
                contact_phone,
                country,
                industry,
                license_key,
                license_status,
                accepted_terms_version,
                accepted_terms_at,
                last_app_version,
                last_license_check_at,
                updated_at
            ) values (
                ${email},
                ${companyName},
                ${normalizeOptionalText(payload.contact_name)},
                ${normalizeOptionalText(payload.contact_phone)},
                ${normalizeOptionalText(payload.country)},
                ${normalizeOptionalText(payload.industry)},
                ${makeLicenseKey()},
                'FREE_ACTIVE',
                ${acceptedTermsVersion},
                now(),
                ${normalizeOptionalText(payload.app_version)},
                now(),
                now()
            )
            on conflict (email) do update set
                company_name = excluded.company_name,
                contact_name = excluded.contact_name,
                contact_phone = excluded.contact_phone,
                country = excluded.country,
                industry = excluded.industry,
                accepted_terms_version = excluded.accepted_terms_version,
                accepted_terms_at = excluded.accepted_terms_at,
                last_app_version = excluded.last_app_version,
                last_license_check_at = now(),
                updated_at = now()
            returning license_status, license_key, accepted_terms_version
        ` as Array<{
            license_status: string;
            license_key: string;
            accepted_terms_version: string;
        }>;

        const user = rows[0];

        return jsonResponse({
            license_status: user.license_status,
            license_key: user.license_key,
            accepted_terms_version: user.accepted_terms_version,
            next_check_after: nextCheckAfter(),
            message: '무료 라이선스가 등록되었습니다. CBAM 계산 데이터는 서버로 전송되지 않았습니다.',
        });
    } catch (error) {
        if (isAdminDbUnavailable(error)) {
            return serviceUnavailable();
        }

        console.error('license register failed', error);
        return jsonResponse({ message: 'License registration failed' }, { status: 500 });
    }
}
