'use client';

import { Button, PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import { FileText, Upload as UploadIcon } from 'lucide-react';

const uploadSteps = [
    { name: '내부 활동자료 정리', status: '준비 중', tone: 'pending' as const },
    { name: '파일 구조 확인', status: '미연결', tone: 'neutral' as const },
    { name: '로컬 DB 반영', status: '향후 기능', tone: 'info' as const },
];

export default function UploadPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="자료 수집"
                title="자료 업로드"
                description="표준 엑셀 템플릿을 사용해 활동자료를 정리합니다. EU 제출용 원본 템플릿은 Export 단계에서 별도로 업로드합니다."
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <SectionCard title="1. 내부 템플릿 다운로드" description="사내 담당자에게 받을 생산량, 연료, 전력, 전구물질 자료를 정리하기 위한 내부 수집용 템플릿입니다.">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <div className="flex items-start gap-3">
                            <div className="rounded-xl bg-white p-3 text-teal-700 ring-1 ring-slate-200">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="font-semibold text-slate-950">활동자료 수집 템플릿</h2>
                                <p className="mt-1 text-sm leading-6 text-slate-600">
                                    현재는 화면 구조만 준비되어 있습니다. 실제 다운로드 파일 생성은 이후 단계에서 연결합니다.
                                </p>
                                <Button type="button" variant="secondary" className="mt-4">
                                    <FileText className="mr-2 h-4 w-4" />
                                    엑셀 템플릿 다운로드
                                </Button>
                            </div>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard title="업로드 상태" description="파일 업로드 기능은 로컬 파싱 방식으로 확장할 예정입니다.">
                    <div className="space-y-3">
                        {uploadSteps.map((step) => (
                            <div key={step.name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                                <span className="text-sm font-semibold text-slate-800">{step.name}</span>
                                <StatusBadge tone={step.tone}>{step.status}</StatusBadge>
                            </div>
                        ))}
                    </div>
                </SectionCard>
            </div>

            <SectionCard title="2. 자료 업로드" description="파일은 서버로 전송하지 않고 브라우저에서 읽어 로컬 데이터로 변환하는 방향으로 구현합니다.">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:bg-teal-50">
                    <UploadIcon className="h-12 w-12 text-teal-700" />
                    <span className="mt-4 text-sm font-semibold text-teal-800">파일 선택</span>
                    <span className="mt-1 text-sm text-slate-600">또는 이 영역으로 끌어다 놓기</span>
                    <span className="mt-2 text-xs text-slate-500">XLSX, CSV 최대 10MB</span>
                    <input id="file-upload" name="file-upload" type="file" className="sr-only" />
                </label>
            </SectionCard>
        </div>
    );
}
