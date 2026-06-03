import { getAdminSql, isAdminDbUnavailable } from '@/lib/admin-db';
import { defaultUpdateManifest, jsonResponse } from '@/lib/license-api';

export const runtime = 'nodejs';

export async function GET() {
    try {
        const sql = getAdminSql();
        const rows = await sql`
            select
                latest_version,
                minimum_supported_version,
                update_policy,
                notice_title,
                notice_body,
                release_notes_url,
                effective_from
            from update_manifests
            where effective_from is null or effective_from <= now()
            order by effective_from desc nulls last, created_at desc
            limit 1
        ` as Array<ReturnType<typeof defaultUpdateManifest>>;

        return jsonResponse(rows[0] ?? defaultUpdateManifest());
    } catch (error) {
        if (isAdminDbUnavailable(error)) {
            return jsonResponse(defaultUpdateManifest());
        }

        console.error('update manifest failed', error);
        return jsonResponse(defaultUpdateManifest(), { status: 200 });
    }
}
