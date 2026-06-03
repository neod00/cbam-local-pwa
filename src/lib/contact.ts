export const SUPPORT_EMAIL = 'openbrain.main@gmail.com';

export const CONTACT_DATA_WARNING = '문의 시 생산량, 배출량, EU 템플릿 작성본, .cbam 백업 파일 등 민감한 회사자료는 첨부하지 마세요.';

type ContactMailtoOptions = {
    subject: string;
    inquiryType: string;
    detailsPrompt?: string;
};

export function createContactMailto({ detailsPrompt = '문의 내용:', inquiryType, subject }: ContactMailtoOptions) {
    const body = [
        '회사명:',
        '담당자:',
        '연락처:',
        `문의 유형: ${inquiryType}`,
        '',
        detailsPrompt,
        '',
        CONTACT_DATA_WARNING,
    ].join('\r\n');

    const params = new URLSearchParams({
        subject,
        body,
    });

    return `mailto:${SUPPORT_EMAIL}?${params.toString()}`;
}
