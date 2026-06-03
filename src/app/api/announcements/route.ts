import { getAdminSql, isAdminDbUnavailable } from '@/lib/admin-db';
import { jsonResponse } from '@/lib/license-api';

export const runtime = 'nodejs';

export async function GET() {
    try {
        const sql = getAdminSql();
        const rows = await sql`
            select id, title, body, severity, starts_at, ends_at
            from announcements
            where (starts_at is null or starts_at <= now())
              and (ends_at is null or ends_at >= now())
            order by starts_at desc nulls last, created_at desc
        ` as Array<{
            id: string;
            title: string;
            body: string;
            severity: 'info' | 'warning' | 'critical';
            starts_at: string | null;
            ends_at: string | null;
        }>;

        return jsonResponse({ announcements: rows });
    } catch (error) {
        if (isAdminDbUnavailable(error)) {
            return jsonResponse({ announcements: [] });
        }

        console.error('announcements failed', error);
        return jsonResponse({ announcements: [] }, { status: 200 });
    }
}
