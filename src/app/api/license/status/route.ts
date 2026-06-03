import { getAdminSql, isAdminDbUnavailable } from '@/lib/admin-db';
import { DEFAULT_TERMS_VERSION, jsonResponse, nextCheckAfter, normalizeOptionalText, serviceUnavailable } from '@/lib/license-api';

export const runtime = 'nodejs';

async function getLatestTermsVersion() {
    const sql = getAdminSql();
    const rows = await sql`
        select version
        from terms_versions
        where effective_from is null or effective_from <= now()
        order by effective_from desc nulls last, created_at desc
        limit 1
    ` as Array<{ version?: string }>;

    return rows[0]?.version ?? DEFAULT_TERMS_VERSION;
}

async function getMinimumSupportedVersion() {
    const sql = getAdminSql();
    const rows = await sql`
        select minimum_supported_version
        from update_manifests
        where effective_from is null or effective_from <= now()
        order by effective_from desc nulls last, created_at desc
        limit 1
    ` as Array<{ minimum_supported_version?: string }>;

    return rows[0]?.minimum_supported_version ?? '0.1.0';
}

async function getNoticeCount() {
    const sql = getAdminSql();
    const rows = await sql`
        select count(*)::int as count
        from announcements
        where (starts_at is null or starts_at <= now())
          and (ends_at is null or ends_at >= now())
    ` as Array<{ count?: number }>;

    return rows[0]?.count ?? 0;
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const licenseKey = url.searchParams.get('license_key')?.trim();
    const appVersion = normalizeOptionalText(url.searchParams.get('app_version'));

    if (!licenseKey) {
        return jsonResponse({ message: 'license_key is required' }, { status: 400 });
    }

    try {
        const sql = getAdminSql();
        const rows = await sql`
            update license_users
            set last_license_check_at = now(),
                last_app_version = coalesce(${appVersion}, last_app_version),
                updated_at = now()
            where license_key = ${licenseKey}
            returning license_status, expires_at
        ` as Array<{ license_status?: string; expires_at?: string | null }>;

        const user = rows[0];

        if (!user?.license_status) {
            return jsonResponse({ message: 'License key was not found' }, { status: 404 });
        }

        const [minimumSupportedVersion, termsVersion, noticeCount] = await Promise.all([
            getMinimumSupportedVersion(),
            getLatestTermsVersion(),
            getNoticeCount(),
        ]);

        return jsonResponse({
            license_status: user.license_status,
            expires_at: user.expires_at ?? null,
            minimum_supported_version: minimumSupportedVersion,
            terms_version: termsVersion,
            notice_count: noticeCount,
            next_check_after: nextCheckAfter(),
        });
    } catch (error) {
        if (isAdminDbUnavailable(error)) {
            return serviceUnavailable();
        }

        console.error('license status failed', error);
        return jsonResponse({ message: 'License status check failed' }, { status: 500 });
    }
}
