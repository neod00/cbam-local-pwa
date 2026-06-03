export const ADMIN_UPDATE_POLICIES = ['none', 'optional', 'recommended', 'required'] as const;

export type AdminUpdatePolicyMode = (typeof ADMIN_UPDATE_POLICIES)[number];

export function isAdminUpdatePolicyMode(value: unknown): value is AdminUpdatePolicyMode {
    return typeof value === 'string' && ADMIN_UPDATE_POLICIES.includes(value as AdminUpdatePolicyMode);
}
