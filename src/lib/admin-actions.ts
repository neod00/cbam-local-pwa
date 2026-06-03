'use server';

import { auth } from '@/auth';
import { isAdminLicenseStatus } from '@/lib/admin-license-status';
import { isAdminUpdatePolicyMode } from '@/lib/admin-update-policy';
import { isAllowedAdminEmail } from '@/lib/admin-auth';
import { getAdminSql } from '@/lib/admin-db';
import { revalidatePath } from 'next/cache';

function normalizeFormValue(value: FormDataEntryValue | null) {
    return typeof value === 'string' ? value.trim() : '';
}

async function ensureAdmin() {
    const session = await auth();
    if (!isAllowedAdminEmail(session?.user?.email)) {
        throw new Error('관리자 권한이 필요합니다.');
    }
}

export async function updateLicenseUserStatus(formData: FormData) {
    await ensureAdmin();

    const userId = normalizeFormValue(formData.get('user_id'));
    const status = normalizeFormValue(formData.get('license_status'));

    if (!userId || !isAdminLicenseStatus(status)) {
        throw new Error('유효한 사용자와 라이선스 상태를 선택하세요.');
    }

    const sql = getAdminSql();
    await sql`
        update license_users
        set license_status = ${status},
            updated_at = now()
        where id = ${userId}
    `;

    revalidatePath('/admin');
}

export async function createUpdateManifest(formData: FormData) {
    await ensureAdmin();

    const latestVersion = normalizeFormValue(formData.get('latest_version'));
    const minimumSupportedVersion = normalizeFormValue(formData.get('minimum_supported_version'));
    const updatePolicy = normalizeFormValue(formData.get('update_policy'));
    const noticeTitle = normalizeFormValue(formData.get('notice_title'));
    const noticeBody = normalizeFormValue(formData.get('notice_body'));
    const releaseNotesUrl = normalizeFormValue(formData.get('release_notes_url'));
    const effectiveFrom = normalizeFormValue(formData.get('effective_from'));
    const targetAudience = normalizeFormValue(formData.get('target_audience')) || 'all';

    if (!latestVersion || !minimumSupportedVersion || !isAdminUpdatePolicyMode(updatePolicy)) {
        throw new Error('최신 버전, 최소 지원 버전, 업데이트 정책을 확인하세요.');
    }

    const sql = getAdminSql();
    await sql`
        insert into update_manifests (
            latest_version,
            minimum_supported_version,
            update_policy,
            notice_title,
            notice_body,
            release_notes_url,
            effective_from,
            target_audience
        )
        values (
            ${latestVersion},
            ${minimumSupportedVersion},
            ${updatePolicy},
            ${noticeTitle || null},
            ${noticeBody || null},
            ${releaseNotesUrl || null},
            ${effectiveFrom || new Date().toISOString()},
            ${targetAudience}
        )
    `;

    revalidatePath('/admin');
}
