import { CONTACT_DATA_WARNING, CONTACT_MESSAGE_MAX_LENGTH, SUPPORT_EMAIL } from '@/lib/contact';
import {
    hasOnlyAllowedKeys,
    jsonResponse,
    normalizeEmail,
    normalizeOptionalText,
    normalizeText,
    sendOperationalTextEmail,
} from '@/lib/license-api';

export const runtime = 'nodejs';

const allowedKeys = [
    'email',
    'company_name',
    'contact_name',
    'contact_phone',
    'country',
    'industry',
    'inquiry_type',
    'message',
    'source_path',
    'app_version',
] as const;

function createContactEmailText({
    appVersion,
    companyName,
    contactName,
    contactPhone,
    country,
    email,
    industry,
    inquiryType,
    message,
    sourcePath,
}: {
    appVersion: string | null;
    companyName: string;
    contactName: string;
    contactPhone: string;
    country: string | null;
    email: string;
    industry: string | null;
    inquiryType: string;
    message: string;
    sourcePath: string | null;
}) {
    return [
        'CBAM Local 문의가 접수되었습니다.',
        '',
        `[문의 유형] ${inquiryType}`,
        `[회사명] ${companyName}`,
        `[담당자] ${contactName}`,
        `[연락처] ${contactPhone}`,
        `[이메일] ${email}`,
        `[국가] ${country ?? '-'}`,
        `[업종] ${industry ?? '-'}`,
        `[앱 버전] ${appVersion ?? '-'}`,
        `[문의 화면] ${sourcePath ?? '-'}`,
        '',
        '[문의 내용]',
        message,
        '',
        '[데이터 경계]',
        '이 문의 API는 문의 내용을 DB에 저장하지 않고 운영 메일 발송에만 사용합니다.',
        CONTACT_DATA_WARNING,
    ].join('\n');
}

export async function POST(request: Request) {
    let payload: Record<string, unknown>;

    try {
        const body = await request.json();
        payload = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    } catch {
        return jsonResponse({ message: 'Invalid JSON body' }, { status: 400 });
    }

    if (!hasOnlyAllowedKeys(payload, allowedKeys)) {
        return jsonResponse({ message: '지원하지 않는 문의 필드가 포함되어 있습니다.' }, { status: 400 });
    }

    const email = normalizeEmail(payload.email);
    const companyName = normalizeText(payload.company_name);
    const contactName = normalizeText(payload.contact_name);
    const contactPhone = normalizeText(payload.contact_phone);
    const inquiryType = normalizeText(payload.inquiry_type) || '사용 문의';
    const message = normalizeText(payload.message);

    if (!email || !email.includes('@') || !companyName || !contactName || !contactPhone) {
        return jsonResponse({ message: '무료 사용 등록 정보가 있어야 문의폼을 보낼 수 있습니다. 먼저 무료 사용 등록을 완료하세요.' }, { status: 400 });
    }

    if (!message) {
        return jsonResponse({ message: '문의 내용을 입력하세요.' }, { status: 400 });
    }

    if (message.length > CONTACT_MESSAGE_MAX_LENGTH) {
        return jsonResponse({ message: `문의 내용은 ${CONTACT_MESSAGE_MAX_LENGTH}자 이내로 입력하세요.` }, { status: 400 });
    }

    if (inquiryType.length > 80) {
        return jsonResponse({ message: '문의 유형이 너무 깁니다.' }, { status: 400 });
    }

    try {
        await sendOperationalTextEmail({
            to: SUPPORT_EMAIL,
            subject: `[CBAM Local] ${inquiryType}`,
            replyTo: email,
            text: createContactEmailText({
                appVersion: normalizeOptionalText(payload.app_version),
                companyName,
                contactName,
                contactPhone,
                country: normalizeOptionalText(payload.country),
                email,
                industry: normalizeOptionalText(payload.industry),
                inquiryType,
                message,
                sourcePath: normalizeOptionalText(payload.source_path),
            }),
        });

        return jsonResponse({ message: '문의가 접수되었습니다. 확인 후 이메일로 회신하겠습니다.' });
    } catch (error) {
        console.error('contact inquiry failed', error);
        return jsonResponse({ message: '문의 전송에 실패했습니다. 직접 이메일 문의 버튼을 사용해 주세요.' }, { status: 500 });
    }
}
