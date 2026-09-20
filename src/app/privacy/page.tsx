import { PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import { COLLECTED_PERSONAL_DATA, getOperatorInfoGaps, isOperatorInfoComplete, operatorField, PERSONAL_DATA_PROCESSORS } from '@/lib/operator-info';
import { AlertTriangle, Database, Mail, ServerOff, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

const currentScope = [
    '결제와 서버 계정(로그인) 기능은 없습니다. 다만 무료 라이선스 등록은 필수이며, 그때 아래 「수집하는 개인정보」의 항목이 서버로 전송됩니다.',
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

// 무료 라이선스 등록은 **이미 동작 중**이다(/api/license/register). 종전 문구는 「향후 … 검토합니다」라는
// 미래 시제였는데, 실제로는 앱을 쓰려면 등록해야 하고 그때 개인정보가 서버로 간다. 사실대로 적는다.
const collectionNotice = [
    '무료 라이선스 등록은 앱을 쓰기 위한 필수 절차이며, 이때 아래 항목이 운영 서버로 전송·보관됩니다.',
    '보유 기간: 라이선스가 유효한 동안 보관하고, 등록을 철회하거나 라이선스가 종료되면 지체 없이 파기합니다.',
    '동의를 거부할 수 있으나, 등록이 없으면 앱의 산정 기능을 쓸 수 없습니다(약관·개인정보·가이드 화면은 등록 없이 볼 수 있습니다).',
    '만 14세 미만의 개인정보는 수집하지 않습니다. 이 서비스는 기업 담당자용 업무 도구입니다.',
];

const rightsNotice = [
    '정보주체는 언제든지 자신의 개인정보에 대한 열람, 정정, 삭제, 처리정지를 요구할 수 있습니다(개인정보 보호법 제35조~제37조).',
    '요구는 아래 문의 이메일로 접수하며, 접수 후 10일 이내에 처리 결과를 알려드립니다.',
    '개인정보 침해로 인한 신고·상담은 개인정보침해신고센터(privacy.kisa.or.kr, 국번없이 118), 개인정보 분쟁조정위원회(kopico.go.kr, 1833-6972)에 할 수 있습니다.',
];

const notCollected = [
    '생산량, 배출량, 전구물질, 공급업체 자료, 산정 결과, EU Communication Template 작성본, .cbam 백업 파일은 운영 서버로 보내지 않습니다.',
    '업데이트 확인은 정적 update manifest를 읽는 방식이며 회사 자료를 수집하기 위한 기능이 아닙니다.',
];

/** 운영자 정보가 비어 있으면 그 사실을 화면이 말한다(src/lib/operator-info.ts에서 채우면 사라진다). */
function OperatorInfoGapNotice() {
    const gaps = getOperatorInfoGaps();

    if (gaps.length === 0) {
        return null;
    }

    return (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
            <p className="font-semibold">배포 전 확정 필요 — 아직 채우지 않은 항목 {gaps.length}건</p>
            <p className="mt-1">{gaps.join(' · ')}</p>
            <p className="mt-1 text-xs text-red-800">
                <code className="rounded bg-red-100 px-1">src/lib/operator-info.ts</code>에서 채우면 이 안내가 사라집니다.
                절차는 <code className="rounded bg-red-100 px-1">docs/pre-release-checklist.md</code>를 보세요.
            </p>
        </div>
    );
}

export default function PrivacyPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="데이터 처리 안내"
                title="개인정보 및 로컬 데이터 처리 안내"
                description={`${operatorField('service_name')}이(가) 어떤 개인정보를 수집·처리하고, 어떤 업무 자료를 서버로 보내지 않는지 안내합니다.`}
                actions={<StatusBadge tone={isOperatorInfoComplete() ? 'success' : 'warning'}>{isOperatorInfoComplete() ? '공개본' : '검토 필요'}</StatusBadge>}
            />

            <OperatorInfoGapNotice />

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

            <SectionCard title="수집하는 개인정보 — 무료 라이선스 등록">
                <div className="flex gap-3">
                    <Database className="mt-1 h-5 w-5 flex-none text-blue-700" />
                    <div className="min-w-0 flex-1">
                        <ul className="space-y-2 text-sm leading-6 text-slate-700">
                            {collectionNotice.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full min-w-[22rem] text-left text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                                        <th className="py-2 pr-4">수집 항목</th>
                                        <th className="py-2">이용 목적</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-700">
                                    {COLLECTED_PERSONAL_DATA.map((row) => (
                                        <tr key={row.field} className="border-b border-slate-100">
                                            <td className="py-2 pr-4 font-medium text-slate-900">{row.field}</td>
                                            <td className="py-2 leading-6">{row.purpose}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-slate-500">
                            이 밖에 앱 버전과 라이선스 상태를 함께 저장합니다(개인을 식별하는 정보가 아닙니다).
                        </p>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="서버로 보내지 않는 것">
                <ul className="space-y-2 text-sm leading-6 text-slate-700">
                    {notCollected.map((item) => (
                        <li key={item} className="flex gap-2">
                            <ServerOff className="mt-1 h-4 w-4 flex-none text-teal-700" />
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            </SectionCard>

            <SectionCard title="처리 위탁">
                <p className="text-sm leading-6 text-slate-600">
                    아래 사업자에게 개인정보 처리를 맡기고 있습니다. 모두 해외에 서버를 두고 있어 개인정보가 국외로 이전됩니다.
                </p>
                <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[26rem] text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                                <th className="py-2 pr-4">수탁자</th>
                                <th className="py-2 pr-4">위탁 업무</th>
                                <th className="py-2">보관 위치</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-700">
                            {PERSONAL_DATA_PROCESSORS.map((row) => (
                                <tr key={row.name} className="border-b border-slate-100">
                                    <td className="py-2 pr-4 font-medium text-slate-900">{row.name}</td>
                                    <td className="py-2 pr-4">{row.role}</td>
                                    <td className="py-2">{row.location}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700">
                    이전 항목은 위 「수집하는 개인정보」와 같고, 이전 목적과 보유 기간도 같습니다. 국외 이전을 원하지 않으면 등록하지 않을 수 있으나, 그 경우 앱의 산정 기능을 쓸 수 없습니다.
                </p>
            </SectionCard>

            <SectionCard title="정보주체의 권리와 행사 방법">
                <ul className="space-y-2 text-sm leading-6 text-slate-700">
                    {rightsNotice.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </SectionCard>

            <SectionCard title="개인정보 보호책임자와 시행일">
                <dl className="grid grid-cols-1 gap-3 text-sm leading-6 text-slate-700 sm:grid-cols-2">
                    {([
                        ['운영자', 'operator_name'],
                        ['개인정보 보호책임자', 'privacy_officer'],
                        ['문의', 'contact_email'],
                        ['시행일', 'privacy_effective_date'],
                    ] as const).map(([label, field]) => (
                        <div key={field}>
                            <dt className="text-xs font-semibold text-slate-500">{label}</dt>
                            <dd className="mt-0.5 break-words text-slate-900">{operatorField(field)}</dd>
                        </div>
                    ))}
                </dl>
            </SectionCard>
        </div>
    );
}
