export const SUPPORT_EMAIL = 'openbrain.main@gmail.com';

export const CONTACT_DATA_WARNING = '문의 시 생산량, 배출량, EU 템플릿 작성본, .cbam 백업 파일 등 민감한 회사자료는 첨부하지 마세요.';

export const CONTACT_MESSAGE_MAX_LENGTH = 2000;

export const CONTACT_INQUIRY_TYPES = [
    '사용 문의',
    '무료 라이선스 승인/복구',
    'CBAM 산정 검토',
    'EU Communication Export 검토',
    '컨설팅 지원',
    '기업 내부 설치',
    '유료 도입',
    '사업 제휴',
    '오류 제보',
] as const;

type ContactMailtoOptions = {
    subject: string;
    inquiryType: string;
    detailsPrompt?: string;
};

function encodeMailtoValue(value: string) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function createContactMailto({ detailsPrompt = '문의 내용:', inquiryType, subject }: ContactMailtoOptions) {
    const body = [
        `문의 유형: ${inquiryType}`,
        '',
        detailsPrompt,
        '',
        CONTACT_DATA_WARNING,
    ].join('\r\n');

    return `mailto:${SUPPORT_EMAIL}?subject=${encodeMailtoValue(subject)}&body=${encodeMailtoValue(body)}`;
}
