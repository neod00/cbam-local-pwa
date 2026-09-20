/**
 * 배포 전에 사람이 채워야 하는 운영자·서비스 식별 정보.
 *
 * 약관과 개인정보 처리방침은 「누가 운영하는가」를 적지 않으면 법적으로 의미가 없다. 그 빈칸이 화면 곳곳에
 * 흩어져 있으면 배포 직전에 하나씩 찾아다녀야 하고, 하나를 빠뜨린 채 공개될 수 있다. 여기 한곳에 모으고,
 * 비어 있으면 약관·개인정보 화면이 스스로 「배포 전 확정 필요」라고 말한다(getOperatorInfoGaps).
 *
 * 채우는 법은 docs/pre-release-checklist.md 참조.
 */
export interface OperatorInfo {
    /** 사용자에게 보이는 서비스 이름 */
    service_name: string;
    /** 운영 주체 — 개인사업자면 상호, 법인이면 법인명 */
    operator_name: string;
    /** 사업자등록번호. 사업자가 아니면 '해당 없음'이라고 적는다(빈칸으로 두지 않는다). */
    business_registration_no: string;
    /** 주소. 공개하기 어려우면 '요청 시 제공'이라고 적는다. */
    address: string;
    /** 문의·개인정보 관련 연락처 */
    contact_email: string;
    /** 개인정보 보호책임자 이름 또는 직위 (개인정보 보호법 제31조) */
    privacy_officer: string;
    /** 약관·분쟁의 준거법 */
    governing_law: string;
    /** 전속 관할 법원 */
    jurisdiction: string;
    /** 약관 시행일 (YYYY-MM-DD) */
    terms_effective_date: string;
    /** 개인정보 처리방침 시행일 (YYYY-MM-DD) */
    privacy_effective_date: string;
}

/**
 * ⚠️ 배포 전에 빈 문자열을 모두 채우세요. 채우면 약관·개인정보 화면의 「배포 전 확정 필요」 배너가 사라집니다.
 * 값을 지어내지 않습니다 — 잘못된 운영자 정보는 빈칸보다 나쁩니다.
 */
export const OPERATOR_INFO: OperatorInfo = {
    service_name: 'CBAM Local',
    operator_name: '',
    business_registration_no: '',
    address: '',
    contact_email: 'openbrain.main@gmail.com',
    privacy_officer: '',
    governing_law: '대한민국 법',
    jurisdiction: '',
    terms_effective_date: '',
    privacy_effective_date: '',
};

const FIELD_LABELS: Record<keyof OperatorInfo, string> = {
    service_name: '서비스명',
    operator_name: '운영자(개인 또는 법인)명',
    business_registration_no: '사업자등록번호',
    address: '주소',
    contact_email: '문의 이메일',
    privacy_officer: '개인정보 보호책임자',
    governing_law: '준거법',
    jurisdiction: '관할 법원',
    terms_effective_date: '약관 시행일',
    privacy_effective_date: '개인정보 처리방침 시행일',
};

/** 아직 비어 있는 항목의 이름. 빈 배열이면 공개할 준비가 된 것이다. */
export function getOperatorInfoGaps(info: OperatorInfo = OPERATOR_INFO): string[] {
    return (Object.keys(FIELD_LABELS) as Array<keyof OperatorInfo>)
        .filter((field) => info[field].trim().length === 0)
        .map((field) => FIELD_LABELS[field]);
}

export function isOperatorInfoComplete(info: OperatorInfo = OPERATOR_INFO): boolean {
    return getOperatorInfoGaps(info).length === 0;
}

/** 화면에 쓸 값. 비어 있으면 빈칸으로 두지 않고 채워야 한다는 것을 드러낸다. */
export function operatorField(field: keyof OperatorInfo, info: OperatorInfo = OPERATOR_INFO): string {
    const value = info[field].trim();
    return value.length > 0 ? value : `(${FIELD_LABELS[field]} — 배포 전 확정 필요)`;
}

/**
 * 무료 라이선스 등록이 실제로 수집하는 개인정보. `/api/license/register`가 받는 항목과 **같아야 한다** —
 * 수집 항목이 늘었는데 여기를 고치지 않으면 처리방침이 사실과 달라진다(scripts/verify-pre-release.mjs가 잠근다).
 */
export const COLLECTED_PERSONAL_DATA = [
    { field: '이메일', purpose: '무료 라이선스 발급·확인, 라이선스 키 전달' },
    { field: '회사명', purpose: '중복 등록 확인, 배포 현황 파악' },
    { field: '담당자명', purpose: '문의 응대' },
    { field: '연락처', purpose: '문의 응대' },
    { field: '국가', purpose: '배포 현황 파악' },
    { field: '업종', purpose: '배포 현황 파악' },
] as const;

/** 개인정보 처리를 맡기는 곳(처리 위탁). 계약이 바뀌면 여기도 바뀌어야 한다. */
export const PERSONAL_DATA_PROCESSORS = [
    { name: 'Vercel Inc.', role: '웹 호스팅·서버 실행', location: '해외(미국 등)' },
    { name: 'Neon Inc.', role: '라이선스 정보 데이터베이스', location: '해외(미국 등)' },
    { name: 'Resend Inc.', role: '라이선스 키 이메일 발송', location: '해외(미국 등)' },
] as const;
