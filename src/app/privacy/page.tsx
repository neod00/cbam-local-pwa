import { PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import { AlertTriangle, Database, Mail, ServerOff, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

const currentScope = [
    '현재 무료 베타는 로그인, 회원가입, 결제, 서버 계정 기능을 제공하지 않습니다.',
    '사업장, 품목, 생산공정, 배출원 자료, 전구물질, 산정 결과는 브라우저 로컬 저장소에 저장됩니다.',
    '사용자가 선택한 EU 원본 템플릿, 기준자료, .cbam 백업 파일은 브라우저 안에서 처리되며 운영 서버로 업로드하지 않는 것을 원칙으로 합니다.',
    '업데이트 확인은 정적 update manifest를 읽는 방식이며 CBAM 계산 데이터나 회사 자료를 수집하기 위한 기능이 아닙니다.',
];

const localRisks = [
    '브라우저 데이터 삭제, 프로필 초기화, PC 교체, 보안 프로그램 정리 시 로컬 데이터가 사라질 수 있습니다.',
    '동일 PC를 여러 사용자가 공유하는 경우 브라우저 프로필 접근 권한에 따라 로컬 데이터가 노출될 수 있습니다.',
    '.cbam 백업 파일에는 업무 입력자료가 포함될 수 있으므로 회사 보안정책에 맞는 위치에 보관해야 합니다.',
    '문의 시 실제 회사 자료, EU Communication Template 작성본, .cbam 백업 파일은 첨부하지 않는 것을 원칙으로 합니다.',
];

const futureNotice = [
    '향후 무료 라이선스 등록 또는 관리자 콘솔이 연결되면 이메일, 회사명, 담당자명, 국가, 업종, 앱 버전, 라이선스 상태 같은 배포 관리 정보만 최소 수집 대상으로 검토합니다.',
    '무료 라이선스 또는 업데이트 확인 기능은 생산량, 배출량, 전구물질, 공급업체 자료, 산정 결과, EU 템플릿, .cbam 백업 파일을 수집하기 위한 기능이 아닙니다.',
    '서버로 개인정보를 받는 기능을 시작하기 전에는 별도 개인정보 처리 안내와 약관 문구를 확정해야 합니다.',
];

export default function PrivacyPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="데이터 처리 안내"
                title="개인정보 및 로컬 데이터 처리 안내"
                description="CBAM Local 무료 베타에서 어떤 데이터가 브라우저에 남고, 어떤 데이터가 운영 서버로 전송되지 않는지 정리한 공개 안내입니다."
                actions={<StatusBadge tone="warning">검토 필요</StatusBadge>}
            />

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <SectionCard className="lg:col-span-2">
                    <div className="flex gap-3">
                        <ServerOff className="mt-1 h-5 w-5 flex-none text-teal-700" />
                        <div>
                            <h2 className="text-lg font-semibold text-slate-950">현재 베타의 기본 원칙</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                현재 공개된 무료 베타는 사용자의 CBAM 업무 입력자료를 운영 서버로 모으는 SaaS가 아니라,
                                브라우저 로컬 저장을 기본으로 하는 PWA입니다. 실제 회사 자료를 서버에 저장하지 않는 구조를 기본 원칙으로 둡니다.
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Link
                                    href="/terms"
                                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                                >
                                    약관/고지 보기
                                </Link>
                                <Link
                                    href="/announcement"
                                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                                >
                                    베타 배포 안내
                                </Link>
                            </div>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard>
                    <div className="flex gap-3">
                        <Mail className="mt-1 h-5 w-5 flex-none text-blue-700" />
                        <div>
                            <h2 className="text-lg font-semibold text-slate-950">문의</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                기능 문의, 오류 제보, 보안 제보는 아래 이메일로 보내주세요. 민감한 회사자료는 첨부하지 않는 것을 원칙으로 합니다.
                            </p>
                            <p className="mt-3 break-words text-sm font-semibold text-slate-950">openbrain.main@gmail.com</p>
                        </div>
                    </div>
                </SectionCard>
            </section>

            <SectionCard title="현재 처리 범위">
                <ul className="space-y-2 text-sm leading-6 text-slate-700">
                    {currentScope.map((item) => (
                        <li key={item} className="flex gap-2">
                            <ShieldCheck className="mt-1 h-4 w-4 flex-none text-teal-700" />
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            </SectionCard>

            <SectionCard title="사용자가 관리해야 할 로컬 데이터 위험">
                <ul className="space-y-2 text-sm leading-6 text-slate-700">
                    {localRisks.map((item) => (
                        <li key={item} className="flex gap-2">
                            <AlertTriangle className="mt-1 h-4 w-4 flex-none text-amber-700" />
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            </SectionCard>

            <SectionCard title="향후 무료 라이선스 또는 관리자 콘솔 연결 시">
                <div className="flex gap-3">
                    <Database className="mt-1 h-5 w-5 flex-none text-blue-700" />
                    <ul className="space-y-2 text-sm leading-6 text-slate-700">
                        {futureNotice.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </div>
            </SectionCard>
        </div>
    );
}
