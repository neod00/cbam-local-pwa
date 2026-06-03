'use server';

import { auth } from '@/auth';
import { isAdminAnnouncementSeverity } from '@/lib/admin-announcement';
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

export async function createAnnouncement(formData: FormData) {
    await ensureAdmin();

    const title = normalizeFormValue(formData.get('title'));
    const body = normalizeFormValue(formData.get('body'));
    const severity = normalizeFormValue(formData.get('severity')) || 'info';
    const targetAudience = normalizeFormValue(formData.get('target_audience')) || 'all';
    const startsAt = normalizeFormValue(formData.get('starts_at'));
    const endsAt = normalizeFormValue(formData.get('ends_at'));

    if (!title || !body || !isAdminAnnouncementSeverity(severity)) {
        throw new Error('공지 제목, 본문, 심각도를 확인하세요.');
    }

    const sql = getAdminSql();
    await sql`
        insert into announcements (
            title,
            body,
            severity,
            target_audience,
            starts_at,
            ends_at
        )
        values (
            ${title},
            ${body},
            ${severity},
            ${targetAudience},
            ${startsAt || new Date().toISOString()},
            ${endsAt || null}
        )
    `;

    revalidatePath('/admin');
}

export async function createTermsVersion(formData: FormData) {
    await ensureAdmin();

    const version = normalizeFormValue(formData.get('version'));
    const title = normalizeFormValue(formData.get('title'));
    const bodyUrl = normalizeFormValue(formData.get('body_url'));
    const effectiveFrom = normalizeFormValue(formData.get('effective_from'));
    const isRequired = normalizeFormValue(formData.get('is_required')) !== 'false';

    if (!version || !title) {
        throw new Error('약관 버전과 제목을 입력하세요.');
    }

    const sql = getAdminSql();
    await sql`
        insert into terms_versions (
            version,
            title,
            body_url,
            effective_from,
            is_required
        )
        values (
            ${version},
            ${title},
            ${bodyUrl || null},
            ${effectiveFrom || new Date().toISOString()},
            ${isRequired}
        )
        on conflict (version) do update
        set title = excluded.title,
            body_url = excluded.body_url,
            effective_from = excluded.effective_from,
            is_required = excluded.is_required
    `;

    revalidatePath('/admin');
}
