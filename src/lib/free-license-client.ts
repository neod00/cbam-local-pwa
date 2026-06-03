import { CBAM_LOCAL_APP_VERSION } from '@/lib/local-db';

export const FREE_LICENSE_SETTING_KEY = 'license:free-registration';
export const FREE_LICENSE_TERMS_VERSION = '2026.06-beta';

export type FreeLicenseStatus = 'UNREGISTERED' | 'FREE_ACTIVE' | 'OFFLINE_ALLOWED' | 'RECHECK_REQUIRED' | 'BLOCKED';

export interface FreeLicenseRegistration {
    email: string;
    company_name: string;
    contact_name: string;
    contact_phone: string;
    country: string;
    industry: string;
    license_key: string;
    status: FreeLicenseStatus;
    accepted_terms_version: string;
    last_checked_at?: string;
    next_check_after?: string;
    message?: string;
}

export interface RegisterFreeLicenseInput {
    email: string;
    company_name: string;
    contact_name: string;
    contact_phone: string;
    country: string;
    industry: string;
}

export const LICENSE_GATE_OPEN_ROUTES = [
    '/guide',
    '/license',
    '/settings',
    '/terms',
    '/privacy',
    '/announcement',
    '/release-notes',
] as const;

export function isLicenseGateOpenRoute(pathname: string) {
    return LICENSE_GATE_OPEN_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function canUseCoreApp(status?: FreeLicenseStatus) {
    return status === 'FREE_ACTIVE' || status === 'OFFLINE_ALLOWED' || status === 'RECHECK_REQUIRED';
}

export function isLicenseBlocked(status?: FreeLicenseStatus) {
    return status === 'BLOCKED';
}

function getLicenseApiBaseUrl() {
    return process.env.NEXT_PUBLIC_LICENSE_API_URL?.replace(/\/$/, '') ?? '';
}

async function parseJsonResponse(response: Response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

export async function registerFreeLicense(input: RegisterFreeLicenseInput): Promise<FreeLicenseRegistration> {
    const endpoint = `${getLicenseApiBaseUrl()}/api/license/register`;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            email: input.email.trim(),
            company_name: input.company_name.trim(),
            contact_name: input.contact_name.trim(),
            contact_phone: input.contact_phone.trim(),
            country: input.country.trim(),
            industry: input.industry.trim(),
            accepted_terms_version: FREE_LICENSE_TERMS_VERSION,
            app_version: CBAM_LOCAL_APP_VERSION,
        }),
    });
    const data = await parseJsonResponse(response);

    if (!response.ok) {
        throw new Error(typeof data.message === 'string' ? data.message : '무료 라이선스 등록에 실패했습니다.');
    }

    return {
        email: input.email.trim().toLowerCase(),
        company_name: input.company_name.trim(),
        contact_name: input.contact_name.trim(),
        contact_phone: input.contact_phone.trim(),
        country: input.country.trim(),
        industry: input.industry.trim(),
        license_key: String(data.license_key ?? ''),
        status: (data.license_status as FreeLicenseStatus) ?? 'FREE_ACTIVE',
        accepted_terms_version: String(data.accepted_terms_version ?? FREE_LICENSE_TERMS_VERSION),
        last_checked_at: new Date().toISOString(),
        next_check_after: typeof data.next_check_after === 'string' ? data.next_check_after : undefined,
        message: typeof data.message === 'string' ? data.message : undefined,
    };
}

export async function checkFreeLicenseStatus(current: FreeLicenseRegistration): Promise<FreeLicenseRegistration> {
    if (!current.license_key) {
        throw new Error('라이선스 키가 없어 상태를 확인할 수 없습니다.');
    }

    const params = new URLSearchParams({
        license_key: current.license_key,
        app_version: CBAM_LOCAL_APP_VERSION,
    });
    const endpoint = `${getLicenseApiBaseUrl()}/api/license/status?${params.toString()}`;
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            accept: 'application/json',
        },
    });
    const data = await parseJsonResponse(response);

    if (!response.ok) {
        throw new Error(typeof data.message === 'string' ? data.message : '무료 라이선스 상태 확인에 실패했습니다.');
    }

    return {
        ...current,
        status: (data.license_status as FreeLicenseStatus) ?? current.status,
        accepted_terms_version: typeof data.terms_version === 'string' ? data.terms_version : current.accepted_terms_version,
        last_checked_at: new Date().toISOString(),
        next_check_after: typeof data.next_check_after === 'string' ? data.next_check_after : current.next_check_after,
        message: '무료 라이선스 상태를 확인했습니다.',
    };
}

export function createOfflineAllowedRegistration(input: RegisterFreeLicenseInput, previous?: FreeLicenseRegistration): FreeLicenseRegistration {
    return {
        email: input.email.trim().toLowerCase(),
        company_name: input.company_name.trim(),
        contact_name: input.contact_name.trim(),
        contact_phone: input.contact_phone.trim(),
        country: input.country.trim(),
        industry: input.industry.trim(),
        license_key: previous?.license_key ?? '',
        status: previous?.license_key ? 'OFFLINE_ALLOWED' : 'UNREGISTERED',
        accepted_terms_version: previous?.accepted_terms_version ?? FREE_LICENSE_TERMS_VERSION,
        last_checked_at: previous?.last_checked_at,
        next_check_after: previous?.next_check_after,
        message: '라이선스 서버 연결에 실패했습니다. 기존 로컬 데이터와 .cbam 백업 기능은 계속 사용할 수 있습니다.',
    };
}
