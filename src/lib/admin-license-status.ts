export const ADMIN_LICENSE_STATUSES = [
    'FREE_ACTIVE',
    'RECHECK_REQUIRED',
    'OFFLINE_ALLOWED',
    'BLOCKED',
    'UNREGISTERED',
] as const;

export type AdminLicenseStatus = (typeof ADMIN_LICENSE_STATUSES)[number];

export function isAdminLicenseStatus(value: unknown): value is AdminLicenseStatus {
    return typeof value === 'string' && ADMIN_LICENSE_STATUSES.includes(value as AdminLicenseStatus);
}
