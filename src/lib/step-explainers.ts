import { ALLOCATION_RULES } from './allocation-rules';
import type { GuidedStepId } from './guided-map';

/**
 * 설명 수준 축(UX 컨셉 v4 §9) — 같은 단계, 다른 포장. **질문 개수·산정 로직은 같고 설명량만 달라진다.**
 *
 *  · 실무자: 규정 근거(조항)가 보이고 쉬운 설명은 접혀 있다.
 *  · 입문자: 일상어 설명·어디서 구하는지·예시가 펼쳐져 있고 규정 근거는 「왜 필요한가요?」 뒤에 있다.
 *
 * 자동 감지는 하지 않는다 — 담당자가 고르거나 유지한다. 규정 근거는 앱의 규칙 표(allocation-rules.ts)에서 가져와 문구를 두 곳에 두지 않는다.
 */

export type ExplainLevel = 'EXPERT' | 'BEGINNER';

export const EXPLAIN_LEVEL_STORAGE_KEY = 'cbam-local-explain-level';
export const DEFAULT_EXPLAIN_LEVEL: ExplainLevel = 'EXPERT';

export const EXPLAIN_LEVEL_LABEL: Record<ExplainLevel, string> = {
    EXPERT: '실무자',
    BEGINNER: '입문자',
};

export function parseExplainLevel(value: string | null | undefined): ExplainLevel {
    return value === 'BEGINNER' || value === 'EXPERT' ? value : DEFAULT_EXPLAIN_LEVEL;
}

export interface StepExplainer {
    /** 일상어 설명 — 이 단계가 무엇이고 왜 필요한가 */
    plain: string;
    /** 값을 어디서 구하는가 */
    where: string;
    /** 예시(가상 수치·서류 이름) */
    example?: string;
    /** 규정·양식 근거. 앱의 규칙 표에서 오거나, 양식 시트 이름이다. */
    basis: string[];
}

const rule = (key: keyof typeof ALLOCATION_RULES) => `${ALLOCATION_RULES[key].id} — ${ALLOCATION_RULES[key].anchor}`;

export const STEP_EXPLAINERS: Record<GuidedStepId, StepExplainer> = {
    setup: {
        plain: '우리 회사·공장 정보와, 신고할 기간(보통 1년)을 한 번만 적습니다. EU에 낼 파일의 첫 장(설비 정보)에 그대로 들어갑니다.',
        where: '사업자등록증, 공장 주소, 담당자 연락처',
        example: '영문 사업장명 「Daeil Fastener Co.」, 국가 코드 KR, 기간 2025-01-01 ~ 2025-12-31',
        basis: ['EU Communication Template — A_InstData(설비 식별정보·보고기간)'],
    },
    products: {
        plain: 'EU로 수출하는 제품이 CBAM 대상인지는 8자리 CN 코드로 정해집니다. 관세 HS 코드 앞 6자리와 같고 뒤 2자리가 더 붙습니다. 이 코드가 이후 모든 계산의 열쇠입니다.',
        where: '수출 신고서(수출면장), 거래명세서, EU 수입자가 알려 준 품목 코드',
        example: '스테인리스 십자홈 나사 → CN 73181552',
        basis: ['CN 코드 8자리 — EU 공식 CN 목록(앱에 내장)'],
    },
    process: {
        plain: '제품을 만드는 공정 묶음과, 기간 동안 시장에 내보낸 생산량(t)을 적습니다. 생산량이 SEE(제품 1톤당 배출량)를 나누는 분모입니다. 불량·스크랩·부산물은 세지 않습니다. 같은 원료로 크기·모양만 다른 제품(나사와 볼트 등)은 공정을 나누지 말고 한 공정에 제품을 추가하세요.',
        where: '생산일지, ERP 출하·생산 실적',
        example: '가공 공정 · 연간 3,240 t',
        basis: [rule('ACTIVITY_LEVEL'), rule('SINGLE_MULTIFUNCTIONAL')],
    },
    fuel: {
        plain: '공장 안에서 태운 연료(도시가스·LPG·경유 등)를 고지서·구매 전표의 사용량 그대로 적습니다. 앱이 배출계수를 곱해 직접배출을 계산합니다. 한 고지서를 여러 공정이 같이 쓰면 「연료 나누기」로 공정 몫을 나눕니다(보일러·스팀은 쓴 열량 비율).',
        where: '가스·유류 고지서, 연료 구매 전표',
        example: '도시가스 12,000 Nm³ → 공정별 몫은 앱이 나눠 줍니다',
        basis: [rule('RECONCILIATION'), rule('KEY_SPLIT')],
    },
    electricity: {
        plain: '구매해 쓴 전기(MWh)를 한전 고지서 사용량 그대로 적습니다. 제품이 「간접배출 비관련」 품목이면 이 값은 인증서 계산 기준에는 들어가지 않지만 EU 파일에는 반드시 적어야 합니다(보고용). 해당 여부는 결과 단계에서 앱이 판정해 알려 줍니다. 한 고지서를 여러 공정이 같이 쓰면 「전력 나누기」를 씁니다.',
        where: '한전 전기요금 고지서(연간 사용량)',
        example: '연간 500 MWh',
        basis: [rule('ELECTRICITY_SHARED_METER')],
    },
    precursors: {
        plain: '구매한 CBAM 대상 강재(선재·코일 등)가 지니고 온 배출을 더합니다. 가공업체는 SEE의 대부분이 여기서 나옵니다. 공급사의 실제 값이 없으면 EU 기본값으로 먼저 계산을 끝내고, 나중에 공급사 회신으로 바꾸면 됩니다.',
        where: '자재 명세서, 구매 내역, 공급사 회신(EU 양식)',
        example: '대만산 선재 610 t → 공급사 값이 없으면 EU 기본값(연도별 mark-up 포함)',
        basis: ['EU 국가·CN 기본값(DV)과 연도별 mark-up — 앱에 내장', '공급사 실측값을 신고에 쓰려면 제3자 검증이 필요합니다'],
    },
    results: {
        plain: '입력이 맞게 들어갔는지 결과를 확인하고, 막는 항목을 해결합니다. 「CBAM 산정 기준」이 인증서 계산에 쓰는 숫자이고, 「총 SEE」는 내부 검토용입니다.',
        where: '앱이 계산합니다 — 입력할 것은 없습니다',
        basis: ['CBAM 산정 기준 SEE와 총 SEE의 구분 — 간접배출 관련성 판정에 따름'],
    },
    export: {
        plain: 'EU 수입업자에게 줄 커뮤니케이션 파일(엑셀)과 산정보고서를 만듭니다. 담당자에게 이 앱의 결과물은 숫자가 아니라 보낼 수 있는 파일입니다.',
        where: '앱이 EU 원본 양식을 채워 줍니다',
        basis: ['EU Communication Template for installations — 원본 양식 그대로 기입'],
    },
};
