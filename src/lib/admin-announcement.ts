export const ADMIN_ANNOUNCEMENT_SEVERITIES = ['info', 'warning', 'critical'] as const;

export type AdminAnnouncementSeverity = (typeof ADMIN_ANNOUNCEMENT_SEVERITIES)[number];

export function isAdminAnnouncementSeverity(value: unknown): value is AdminAnnouncementSeverity {
    return typeof value === 'string' && ADMIN_ANNOUNCEMENT_SEVERITIES.includes(value as AdminAnnouncementSeverity);
}
