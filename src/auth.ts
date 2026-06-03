import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

import { isAllowedAdminEmail } from '@/lib/admin-auth';

export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [Google],
    pages: {
        signIn: '/admin/login',
        error: '/admin/login',
    },
    callbacks: {
        signIn({ profile, user }) {
            return isAllowedAdminEmail(user.email ?? profile?.email);
        },
    },
});
