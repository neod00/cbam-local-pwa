'use client';

import { Button, StatusBadge } from '@/components/ui';
import { CBAM_LOCAL_APP_VERSION } from '@/lib/local-db';
import { evaluateUpdateStatus, fetchUpdateManifest, type UpdateStatus } from '@/lib/update-policy';
import { ExternalLink, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

function getDismissKey(latestVersion: string) {
    return `cbam-local:update-dismissed:${latestVersion}`;
}

export default function UpdateNotice() {
    const [status, setStatus] = useState<UpdateStatus>();
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        let active = true;

        async function loadStatus() {
            try {
                const manifest = await fetchUpdateManifest();
                const nextStatus = evaluateUpdateStatus(manifest, CBAM_LOCAL_APP_VERSION);
                const dismissed = nextStatus.canDismiss
                    ? window.localStorage.getItem(getDismissKey(nextStatus.latestVersion)) === 'true'
                    : false;

                if (active) {
                    setStatus(nextStatus);
                    setHidden(dismissed);
                }
            } catch {
                if (active) {
                    setStatus(undefined);
                }
            }
        }

        void loadStatus();

        return () => {
            active = false;
        };
    }, []);

    const badgeTone = useMemo(() => {
        if (status?.tone === 'danger') {
            return 'danger';
        }

        if (status?.tone === 'warning') {
            return 'warning';
        }

        return 'info';
    }, [status?.tone]);

    async function refreshForUpdate() {
        const registration = await navigator.serviceWorker?.getRegistration();
        await registration?.update();
        window.location.reload();
    }

    function dismiss() {
        if (!status?.canDismiss) {
            return;
        }

        window.localStorage.setItem(getDismissKey(status.latestVersion), 'true');
        setHidden(true);
    }

    if (!status?.shouldShow || hidden) {
        return null;
    }

    return (
        <div className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
                <div className="flex gap-3">
                    <div className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                        <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge tone={badgeTone}>
                                {status.mode === 'required' ? '강제 업데이트' : '업데이트 안내'}
                            </StatusBadge>
                            <p className="text-sm font-semibold text-slate-950">{status.title}</p>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                            {status.body} 현재 v{status.currentVersion}, 최신 v{status.latestVersion}. 업데이트 확인은 버전 정보만 확인하며 CBAM 입력자료, EU 템플릿, .cbam 백업 파일은 전송하지 않습니다.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:flex-none">
                    {status.releaseNotesUrl && (
                        <a
                            href={status.releaseNotesUrl}
                            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            릴리스 노트
                        </a>
                    )}
                    <Button type="button" onClick={() => void refreshForUpdate()}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        업데이트 확인
                    </Button>
                    {status.canDismiss && (
                        <Button type="button" variant="secondary" onClick={dismiss}>
                            <X className="mr-2 h-4 w-4" />
                            나중에
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
