import { auth } from '@/auth';
import { isAllowedAdminEmail } from '@/lib/admin-auth';

export const proxy = auth((request) => {
    const pathname = request.nextUrl.pathname;
    const adminEmail = request.auth?.user?.email;
    const isAllowed = isAllowedAdminEmail(adminEmail);

    if (pathname === '/admin/login') {
        if (isAllowed) {
            return Response.redirect(new URL('/admin', request.nextUrl.origin));
        }

        return;
    }

    if (pathname.startsWith('/api/admin')) {
        if (!isAllowed) {
            return Response.json({ message: 'Not authenticated' }, { status: 401 });
        }

        return;
    }

    if (pathname.startsWith('/admin') && !isAllowed) {
        const loginUrl = new URL('/admin/login', request.nextUrl.origin);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return Response.redirect(loginUrl);
    }
});

export const config = {
    matcher: ['/admin/:path*', '/api/admin/:path*'],
};
