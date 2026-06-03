import { signIn } from '@/auth';
import { DEFAULT_ADMIN_EMAIL } from '@/lib/admin-auth';
import { Button, SectionCard, StatusBadge } from '@/components/ui';
import { KeyRound, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

type AdminLoginPageProps = {
    searchParams?: Promise<{
        callbackUrl?: string;
        error?: string;
    }>;
};

function normalizeCallbackUrl(callbackUrl?: string) {
    if (!callbackUrl?.startsWith('/admin')) {
        return '/admin';
    }

    if (callbackUrl.startsWith('/admin/login')) {
        return '/admin';
    }

    return callbackUrl;
}

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
    const params = await searchParams;
    const callbackUrl = normalizeCallbackUrl(params?.callbackUrl);
    const hasAuthError = Boolean(params?.error);

    async function signInWithGoogle() {
        'use server';
        await signIn('google', { redirectTo: callbackUrl });
    }

    return (
        <div className="mx-auto grid min-h-[70vh] w-full max-w-5xl items-center gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.75fr)]">
            <div className="min-w-0">
                <StatusBadge tone="pending">관리자 전용</StatusBadge>
                <h1 className="mt-4 break-words text-3xl font-semibold tracking-tight text-slate-950">
                    CBAM Local 관리자 로그인
                </h1>
                <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-slate-600">
                    무료 라이선스, 공지, 업데이트 정책을 관리하는 운영자 콘솔입니다. Google 계정이 관리자 허용 목록에
                    등록되어 있어야 접근할 수 있습니다.
                </p>

                <div className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm leading-6 text-teal-950">
                    <div className="flex gap-3">
                        <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-teal-700" />
                        <p>
                            무료 라이선스와 업데이트 확인에는 이메일, 회사명, 담당자명, 연락처, 앱 버전 같은 배포 관리
                            정보만 사용합니다. 생산량, 배출량, 전구물질, EU 템플릿, .cbam 백업 파일은 서버로 전송하지
                            않습니다.
                        </p>
                    </div>
                </div>
            </div>

            <SectionCard>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <KeyRound className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-slate-950">Google OAuth로 로그인</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                    현재 기본 관리자 계정은 <span className="font-semibold text-slate-950">{DEFAULT_ADMIN_EMAIL}</span> 입니다.
                    운영 배포 전 Vercel 환경변수에 Google OAuth와 관리자 허용 이메일을 등록해야 합니다.
                </p>

                {hasAuthError && (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">
                        로그인에 실패했거나 허용된 관리자 계정이 아닙니다. Google 계정과 관리자 허용 목록을 확인하세요.
                    </div>
                )}

                <form action={signInWithGoogle} className="mt-5">
                    <Button type="submit" className="w-full">
                        Google 계정으로 로그인
                    </Button>
                </form>

                <dl className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
                    <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">필수 환경변수</dt>
                        <dd className="text-right font-semibold text-slate-950">AUTH_SECRET</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Google OAuth</dt>
                        <dd className="text-right font-semibold text-slate-950">AUTH_GOOGLE_ID / SECRET</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Vercel 신뢰 호스트</dt>
                        <dd className="text-right font-semibold text-slate-950">AUTH_TRUST_HOST=true</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">관리자 허용 목록</dt>
                        <dd className="text-right font-semibold text-slate-950">ADMIN_ALLOWED_EMAILS</dd>
                    </div>
                </dl>
            </SectionCard>
        </div>
    );
}
