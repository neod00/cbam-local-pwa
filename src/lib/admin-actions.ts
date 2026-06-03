'use server';

import { auth } from '@/auth';
import { isAdminLicenseStatus } from '@/lib/admin-license-status';
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
