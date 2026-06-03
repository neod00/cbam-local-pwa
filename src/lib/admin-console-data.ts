import { getAdminSql, isAdminDbUnavailable } from '@/lib/admin-db';

export type AdminLicenseUser = {
    id: string;
    status: string;
    email: string;
    company: string;
    contact: string;
    phone: string;
    country: string;
    industry: string;
    appVersion: string;
    lastCheck: string;
    terms: string;
};

export type AdminAnnouncement = {
    title: string;
    severity: 'info' | 'warning' | 'critical';
    period: string;
    target: string;
};

export type AdminUpdatePolicy = {
    latestVersion: string;
    minimumSupportedVersion: string;
    updatePolicy: string;
    effectiveFrom: string;
    targetAudience: string;
};

export type AdminTermsVersion = {
    version: string;
    title: string;
};

export type AdminConsoleData = {
    source: 'live' | 'sample';
    stats: {
        registeredUsers: number;
        activeFreeLicenses: number;
        recheckRequired: number;
        blocked: number;
    };
    licenseUsers: AdminLicenseUser[];
    announcements: AdminAnnouncement[];
    updatePolicy: AdminUpdatePolicy;
    termsVersion: AdminTermsVersion;
};

const sampleData: AdminConsoleData = {
    source: 'sample',
    stats: {
        registeredUsers: 128,
        activeFreeLicenses: 112,
        recheckRequired: 9,
        blocked: 2,
    },
    licenseUsers: [
        {
            id: 'sample-free-active',
            status: 'FREE_ACTIVE',
            email: 'manager@example.co.kr',
            company: '대한철강 주식회사',
            contact: '김지연',
            phone: '010-0000-1001',
            country: 'South Korea',
            industry: 'Iron and steel',
            appVersion: '0.1.0-beta',
            lastCheck: '2026-06-03 09:12',
            terms: '2026.06-beta',
        },
        {
            id: 'sample-recheck-required',
            status: 'RECHECK_REQUIRED',
            email: 'esg-team@example.com',
            company: '한빛소재',
            contact: '박민수',
            phone: '010-0000-1002',
            country: 'South Korea',
            industry: 'Aluminium',
            appVersion: '0.1.0-beta',
            lastCheck: '2026-05-24 16:40',
            terms: '2026.06-beta',
        },
        {
            id: 'sample-offline-allowed',
            status: 'OFFLINE_ALLOWED',
            email: 'cbam@example.net',
            company: '동아케미칼',
            contact: '이서현',
            phone: '010-0000-1003',
            country: 'South Korea',
            industry: 'Fertiliser',
            appVersion: '0.1.0-beta',
            lastCheck: '2026-05-31 11:05',
            terms: '2026.06-beta',
        },
    ],
    announcements: [
        {
            title: 'v0.1.0-beta 배포 안내',
            severity: 'info',
            period: '2026-06-03 - 2026-06-30',
            target: '전체 사용자',
        },
        {
            title: 'EU 원본 템플릿 최신본 확인 요청',
            severity: 'warning',
            period: '2026-06-10 - 2026-07-10',
            target: '철강 품목 사용자',
        },
    ],
    updatePolicy: {
        latestVersion: '0.1.0-beta',
        minimumSupportedVersion: '0.1.0-beta',
        updatePolicy: 'recommended',
        effectiveFrom: '2026-06-03',
        targetAudience: 'all',
    },
    termsVersion: {
        version: '2026.06-beta',
        title: '현재 무료 베타 약관',
    },
};

function formatDateTime(value: unknown) {
    if (!value) {
        return '-';
    }

    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toISOString().slice(0, 16).replace('T', ' ');
}

function formatDate(value: unknown) {
    if (!value) {
        return '-';
    }

    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toISOString().slice(0, 10);
}

function formatPeriod(startsAt: unknown, endsAt: unknown) {
    return `${formatDate(startsAt)} - ${formatDate(endsAt)}`;
}

export async function getAdminConsoleData(): Promise<AdminConsoleData> {
    try {
        const sql = getAdminSql();
        const statsRows = (await sql`
            select
                count(*)::int as registered_users,
                count(*) filter (where license_status = 'FREE_ACTIVE')::int as active_free_licenses,
                count(*) filter (where license_status = 'RECHECK_REQUIRED')::int as recheck_required,
                count(*) filter (where license_status = 'BLOCKED')::int as blocked
            from license_users
        `) as Array<{
            registered_users: number;
            active_free_licenses: number;
            recheck_required: number;
            blocked: number;
        }>;

        const userRows = (await sql`
            select
                license_status,
                id,
                email,
                company_name,
                contact_name,
                contact_phone,
                country,
                industry,
                last_app_version,
                last_license_check_at,
                accepted_terms_version
            from license_users
            order by updated_at desc
            limit 25
        `) as Array<{
            license_status: string;
            id: string;
            email: string;
            company_name: string;
            contact_name: string | null;
            contact_phone: string | null;
            country: string | null;
            industry: string | null;
            last_app_version: string | null;
            last_license_check_at: string | null;
            accepted_terms_version: string | null;
        }>;

        const announcementRows = (await sql`
            select title, severity, target_audience, starts_at, ends_at
            from announcements
            order by starts_at desc nulls last, created_at desc
            limit 10
        `) as Array<{
            title: string;
            severity: 'info' | 'warning' | 'critical';
            target_audience: string;
            starts_at: string | null;
            ends_at: string | null;
        }>;

        const updateRows = (await sql`
            select latest_version, minimum_supported_version, update_policy, effective_from, target_audience
            from update_manifests
            order by effective_from desc nulls last, created_at desc
            limit 1
        `) as Array<{
            latest_version: string;
            minimum_supported_version: string;
            update_policy: string;
            effective_from: string | null;
            target_audience: string;
        }>;

        const termsRows = (await sql`
            select version, title
            from terms_versions
            order by effective_from desc nulls last, created_at desc
            limit 1
        `) as Array<{
            version: string;
            title: string;
        }>;

        const stats = statsRows[0] ?? {
            registered_users: 0,
            active_free_licenses: 0,
            recheck_required: 0,
            blocked: 0,
        };

        return {
            source: 'live',
            stats: {
                registeredUsers: stats.registered_users,
                activeFreeLicenses: stats.active_free_licenses,
                recheckRequired: stats.recheck_required,
                blocked: stats.blocked,
            },
            licenseUsers: userRows.map((user) => ({
                id: user.id,
                status: user.license_status,
                email: user.email,
                company: user.company_name,
                contact: user.contact_name ?? '-',
                phone: user.contact_phone ?? '-',
                country: user.country ?? '-',
                industry: user.industry ?? '-',
                appVersion: user.last_app_version ?? '-',
                lastCheck: formatDateTime(user.last_license_check_at),
                terms: user.accepted_terms_version ?? '-',
            })),
            announcements: announcementRows.map((item) => ({
                title: item.title,
                severity: item.severity,
                period: formatPeriod(item.starts_at, item.ends_at),
                target: item.target_audience,
            })),
            updatePolicy: updateRows[0]
                ? {
                    latestVersion: updateRows[0].latest_version,
                    minimumSupportedVersion: updateRows[0].minimum_supported_version,
                    updatePolicy: updateRows[0].update_policy,
                    effectiveFrom: formatDate(updateRows[0].effective_from),
                    targetAudience: updateRows[0].target_audience,
                }
                : sampleData.updatePolicy,
            termsVersion: termsRows[0] ?? sampleData.termsVersion,
        };
    } catch (error) {
        if (isAdminDbUnavailable(error)) {
            return sampleData;
        }

        console.error('admin console data failed', error);
        return sampleData;
    }
}
