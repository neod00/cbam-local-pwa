import { neon } from '@neondatabase/serverless';

type AdminSql = ReturnType<typeof neon>;

let cachedSql: AdminSql | undefined;

export class AdminDbUnavailableError extends Error {
    constructor() {
        super('Admin database is not configured');
        this.name = 'AdminDbUnavailableError';
    }
}

export function isAdminDbConfigured() {
    return Boolean(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
}

export function getAdminSql() {
    const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

    if (!connectionString) {
        throw new AdminDbUnavailableError();
    }

    cachedSql ??= neon(connectionString);
    return cachedSql;
}

export function isAdminDbUnavailable(error: unknown) {
    return error instanceof AdminDbUnavailableError;
}
