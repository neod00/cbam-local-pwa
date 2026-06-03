'use client';

import { Button } from '@/components/ui';
import {
    CONTACT_DATA_WARNING,
    CONTACT_INQUIRY_TYPES,
    CONTACT_MESSAGE_MAX_LENGTH,
    createContactMailto,
    SUPPORT_EMAIL,
} from '@/lib/contact';
import { FREE_LICENSE_SETTING_KEY, type FreeLicenseRegistration } from '@/lib/free-license-client';
import { CBAM_LOCAL_APP_VERSION, getLocalSetting } from '@/lib/local-db';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ExternalLink, Mail, MessageSquare, X } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';

type ContactDialogProps = {
    buttonClassName?: string;
    buttonVariant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    description?: string;
    inquiryType?: string;
    subject?: string;
    triggerIcon?: ReactNode;
    triggerLabel: string;
};

type ContactSubmitState = 'idle' | 'submitting' | 'success' | 'error';

function hasContactProfile(registration?: FreeLicenseRegistration) {
    return Boolean(
        registration?.email &&
        registration.company_name &&
        registration.contact_name &&
        registration.contact_phone
    );
}

function getProfileRows(registration?: FreeLicenseRegistration) {
    return [
        { label: '이메일', value: registration?.email },
        { label: '회사명', value: registration?.company_name },
        { label: '담당자', value: registration?.contact_name },
        { label: '연락처', value: registration?.contact_phone },
        { label: '국가', value: registration?.country },
        { label: '업종', value: registration?.industry },
    ].filter((item) => item.value);
}

async function parseContactResponse(response: Response) {
    try {
        return await response.json() as { message?: string };
    } catch {
        return {};
    }
}

export function ContactDialog({
    buttonClassName,
    buttonVariant = 'primary',
    description = '앱 사용, 무료 라이선스, 컨설팅 지원, 기업 내부 설치, 유료 도입, 사업 제휴 관련 문의를 보낼 수 있습니다.',
    inquiryType = '사용 문의',
    subject = '[CBAM Local] 사용/사업 문의',
    triggerIcon,
    triggerLabel,
}: ContactDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [registration, setRegistration] = useState<FreeLicenseRegistration>();
    const [selectedInquiryType, setSelectedInquiryType] = useState(inquiryType);
    const [message, setMessage] = useState('');
    const [feedback, setFeedback] = useState('');
    const [submitState, setSubmitState] = useState<ContactSubmitState>('idle');
    const profileReady = hasContactProfile(registration);
    const profileRows = useMemo(() => getProfileRows(registration), [registration]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        getLocalSetting<FreeLicenseRegistration>(FREE_LICENSE_SETTING_KEY)
            .then((savedRegistration) => setRegistration(savedRegistration))
            .catch(() => setRegistration(undefined));
    }, [isOpen]);

    const directMailHref = useMemo(
        () => createContactMailto({
            subject,
            inquiryType: selectedInquiryType,
            detailsPrompt: '회사 메일 시스템에서 직접 문의 내용을 작성하세요:',
        }),
        [selectedInquiryType, subject]
    );

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFeedback('');

        if (!registration || !profileReady) {
            setSubmitState('error');
            setFeedback('무료 사용 등록 정보가 있어야 문의폼을 보낼 수 있습니다. 먼저 무료 사용 등록을 완료하세요.');
            return;
        }

        const trimmedMessage = message.trim();

        if (!trimmedMessage) {
            setSubmitState('error');
            setFeedback('문의 내용을 입력하세요.');
            return;
        }

        setSubmitState('submitting');

        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                email: registration.email,
                company_name: registration.company_name,
                contact_name: registration.contact_name,
                contact_phone: registration.contact_phone,
                country: registration.country,
                industry: registration.industry,
                inquiry_type: selectedInquiryType,
                message: trimmedMessage,
                source_path: window.location.pathname,
                app_version: CBAM_LOCAL_APP_VERSION,
            }),
        });
        const data = await parseContactResponse(response);

        if (!response.ok) {
            setSubmitState('error');
            setFeedback(data.message ?? '문의 전송에 실패했습니다. 직접 이메일 문의 버튼을 사용해 주세요.');
            return;
        }

        setSubmitState('success');
        setMessage('');
        setFeedback(data.message ?? '문의가 접수되었습니다. 확인 후 이메일로 회신하겠습니다.');
    }

    const trigger = buttonClassName ? (
        <button type="button" className={buttonClassName} onClick={() => setIsOpen(true)}>
            {triggerIcon ?? <MessageSquare className="mr-2 h-4 w-4" />}
            {triggerLabel}
        </button>
    ) : (
        <Button type="button" variant={buttonVariant} onClick={() => setIsOpen(true)}>
            {triggerIcon ?? <MessageSquare className="mr-2 h-4 w-4" />}
            {triggerLabel}
        </Button>
    );

    return (
        <>
            {trigger}
            {isOpen && (
                <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
                    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl">
                        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">CONTACT</p>
                                <h2 className="mt-1 text-lg font-semibold text-slate-950">{triggerLabel}</h2>
                                <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
                            </div>
                            <button
                                type="button"
                                className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                                aria-label="문의 모달 닫기"
                                onClick={() => setIsOpen(false)}
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
                            <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
                                <div className="flex items-start gap-3">
                                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-teal-700" />
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-semibold text-teal-950">무료 라이선스 등록 정보로 문의합니다</h3>
                                        <p className="mt-1 text-sm leading-6 text-teal-900">
                                            이메일, 회사명, 담당자명, 연락처는 무료 사용 등록 때 입력한 정보를 사용합니다.
                                        </p>
                                    </div>
                                </div>
                                {profileRows.length > 0 ? (
                                    <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                                        {profileRows.map((item) => (
                                            <div key={item.label} className="rounded-xl bg-white/70 px-3 py-2">
                                                <dt className="text-xs font-semibold text-teal-700">{item.label}</dt>
                                                <dd className="mt-1 break-words font-medium text-slate-950">{item.value}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                ) : (
                                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                                        <p className="font-semibold">무료 사용 등록 정보가 없습니다.</p>
                                        <p className="mt-1">문의폼 전송에는 등록 이메일과 회사 정보가 필요합니다. 먼저 무료 사용 등록을 진행하세요.</p>
                                        <Link
                                            href="/license"
                                            className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm transition hover:bg-amber-50"
                                            onClick={() => setIsOpen(false)}
                                        >
                                            무료 사용 등록으로 이동
                                            <ExternalLink className="ml-2 h-3.5 w-3.5" />
                                        </Link>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <label className="space-y-1 text-sm font-semibold text-slate-700">
                                    <span>문의 유형</span>
                                    <select
                                        value={selectedInquiryType}
                                        onChange={(event) => setSelectedInquiryType(event.target.value)}
                                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                                    >
                                        {CONTACT_INQUIRY_TYPES.map((type) => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                </label>

                                <label className="space-y-1 text-sm font-semibold text-slate-700">
                                    <span>문의 내용</span>
                                    <textarea
                                        required
                                        maxLength={CONTACT_MESSAGE_MAX_LENGTH}
                                        value={message}
                                        onChange={(event) => setMessage(event.target.value)}
                                        className="min-h-36 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                                        placeholder="문의 내용을 적어주세요. 생산량, 배출량, EU 템플릿 작성본, .cbam 백업 파일 내용은 포함하지 마세요."
                                    />
                                    <span className="block text-right text-xs font-medium text-slate-500">
                                        {message.length}/{CONTACT_MESSAGE_MAX_LENGTH}
                                    </span>
                                </label>
                            </div>

                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                                <div className="flex gap-3">
                                    <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
                                    <p>{CONTACT_DATA_WARNING}</p>
                                </div>
                            </div>

                            {feedback && (
                                <div
                                    className={clsx(
                                        'rounded-2xl border px-4 py-3 text-sm leading-6',
                                        submitState === 'success'
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                            : 'border-red-200 bg-red-50 text-red-800'
                                    )}
                                >
                                    {feedback}
                                </div>
                            )}

                            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                                <a
                                    href={directMailHref}
                                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                                >
                                    <Mail className="mr-2 h-4 w-4" />
                                    {SUPPORT_EMAIL}로 이메일로 직접 문의하기
                                </a>
                                <Button type="submit" disabled={!profileReady || submitState === 'submitting'}>
                                    <MessageSquare className="mr-2 h-4 w-4" />
                                    {submitState === 'submitting' ? '전송 중' : '문의 보내기'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
