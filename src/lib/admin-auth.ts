export const DEFAULT_ADMIN_EMAIL = 'openbrain.main@gmail.com';

export function getAllowedAdminEmails() {
    const configured = process.env.ADMIN_ALLOWED_EMAILS ?? DEFAULT_ADMIN_EMAIL;

    return configured
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
}

export function isAllowedAdminEmail(email?: string | null) {
    if (!email) {
        return false;
    }

    return getAllowedAdminEmails().includes(email.trim().toLowerCase());
}
