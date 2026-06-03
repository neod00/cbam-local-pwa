import { auth } from '@/auth';
import { isAllowedAdminEmail } from '@/lib/admin-auth';

async function ensureAdmin() {
    const session = await auth();

    return isAllowedAdminEmail(session?.user?.email);
}

async function handler() {
    if (!(await ensureAdmin())) {
        return Response.json({ message: 'Not authenticated' }, { status: 401 });
    }

    return Response.json({ message: 'Admin API route is not implemented yet' }, { status: 501 });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
