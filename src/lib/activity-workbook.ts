import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { columnName, escapeXml, getColumnName, parseAttributes, parseSharedStrings, parseWorkbookSheets, readCellValue } from './activity-data-template';

/**
 * 활동자료 서식 v2 — **컨설턴트가 업체에서 채워 오는 엑셀**(2026-10-10).
 *
 * 목적: 한 번 받아 올리면 지도 1~6단계가 채워져, 되묻지 않고 8단계(EU 문서)까지 갈 수 있게 한다.
 * 종전 서식(activity-data-template.ts, 영어 머리글 4시트)은 사업장·보고기간이 없고, 연료 시트가 계산에 들어가지 않았다(run33).
 *
 * 이 파일은 **서식의 모양과 읽기**만 맡는다: 시트·칸 정의, 엑셀 만들기(머리글 색·설명 줄·선택 목록), 엑셀 읽기(글자 그대로).
 * 읽은 값을 레코드로 바꿔 저장하는 일은 activity-import.ts가 지도·질문 화면과 같은 빌더로 한다.
 * 종전 서식 파일도 계속 읽힌다 — 올리는 화면이 시트 이름으로 구분한다(isActivityWorkbookV2).
 */

export const ACTIVITY_WORKBOOK_FILENAME = 'CBAM_활동자료_서식.xlsx';
export const ACTIVITY_WORKBOOK_SAMPLE_FILENAME = 'CBAM_활동자료_서식_작성예시.xlsx';

export const SHEET_GUIDE = '안내';
export const SHEET_INSTALLATION = '1_사업장';
export const SHEET_PRODUCTS = '2_제품';
export const SHEET_PROCESSES = '3_공정';
export const SHEET_FUELS = '4_연료';
export const SHEET_PRECURSORS = '5_구매강재';
export const SHEET_LISTS = '선택목록';

/** 예시 행의 표시 — 이 글자로 시작하는 행은 가져올 때 건너뛴다(지우지 않아도 된다). */
export const EXAMPLE_PREFIX = '(예시)';
/** 여러 공정이 같이 쓰는 연료를 뜻하는 「쓰는 공정」 값 */
export const SHARED_PROCESS_LABEL = '공장 전체(공용)';
/** 한 칸에 이름을 여럿 적을 때의 구분자(공정·제품) */
export const LIST_SEPARATOR = ';';

export const YES = '예';
export const NO = '아니오';

/** 연료 종류 — 값은 source-stream-input.ts의 입력 유형 키(같은 자리값·같은 단위 환산을 쓴다). */
export const FUEL_KIND_CHOICES = [
    { label: '도시가스 (Nm³)', key: 'fuel-gas' },
    { label: '천연가스·LNG (t)', key: 'fuel-natural-gas-t' },
    { label: '경유 (L)', key: 'fuel-diesel-l' },
    { label: '등유 (L)', key: 'fuel-kerosene-l' },
    { label: '유류·기타 (t)', key: 'fuel-mass' },
] as const;

export const FUEL_FACTOR_SOURCE_CHOICES = [
    { label: 'IPCC·EU 기본값', value: 'EU_OR_IPCC_DEFAULT' },
    { label: '국가 고유값 (국가 인벤토리)', value: 'NATIONAL_INVENTORY' },
    { label: '공급사·분석 성적서', value: 'SUPPLIER_OR_LAB' },
] as const;

/** 전력 배출계수 출처 — 값은 지도 5단계의 선택지와 같다. */
export const ELECTRICITY_SOURCE_CHOICES = [
    { label: '국가 전력망 평균', value: 'COUNTRY_GRID_DEFAULT' },
    { label: '발전설비 직접 연결 (실측)', value: 'DIRECT_TECHNICAL_LINK' },
    { label: '전력구매계약 PPA (실측)', value: 'PPA' },
    { label: '설비 내 자가발전', value: 'INSTALLATION_OWN' },
    { label: '혼합', value: 'MIX' },
] as const;

export const SUPPLIER_VALUE_CHOICES = [
    { label: '있음 (공급사가 준 값)', value: 'ACTUAL' },
    { label: '없음 (EU 기본값 사용)', value: 'DEFAULT' },
] as const;

export const VERIFICATION_CHOICES = [
    { label: '미검증', value: 'UNVERIFIED' },
    { label: '공급사 확인', value: 'SUPPLIER_CONFIRMED' },
    { label: '제3자 검증 완료', value: 'VERIFIED' },
] as const;

type ListName = 'yesNo' | 'fuelKind' | 'fuelFactorSource' | 'electricitySource' | 'supplierValue' | 'verification' | 'country' | 'processOrShared' | 'process' | 'product';

export interface ActivityField {
    key: string;
    label: string;
    hint: string;
    required?: boolean;
    list?: ListName;
    /** 글자로 저장할 칸(날짜·코드) — 엑셀이 날짜·숫자로 바꾸지 않게 한다 */
    text?: boolean;
    width?: number;
    example?: string | number;
}

type FormRow = ActivityField | { section: string };

/** 1_사업장 — 세로 양식(항목 | 입력 | 설명). 사업장·보고기간·전력처럼 **공장에 하나뿐인 값**을 모았다. */
export const INSTALLATION_FORM: FormRow[] = [
    { section: '■ 사업장(공장)' },
    { key: 'name', label: '사업장 영문명', required: true, hint: 'EU 문서에 이 이름이 그대로 나갑니다. 예: Daeil Industrial Co., Ltd. Ansan Plant' },
    { key: 'local_name', label: '사업장 한글명', hint: '예: 대일기업 안산공장' },
    { key: 'country', label: '국가 코드 (2자리)', required: true, text: true, hint: '공장이 있는 나라. 한국은 KR' },
    { key: 'street', label: '주소 (영문 도로명)', hint: '예: 000 Byeolmang-ro, Danwon-gu' },
    { key: 'city', label: '도시 (영문)', hint: '예: Ansan-si, Gyeonggi-do' },
    { key: 'postcode', label: '우편번호', text: true, hint: '예: 15600' },
    { key: 'unlocode', label: 'UN/LOCODE (5자리)', text: true, hint: 'UNECE가 도시·항만에 붙인 코드. 예: 부산 KRPUS, 인천 KRINC. 모르면 비우고 아래 위도·경도를 적으세요' },
    { key: 'latitude', label: '위도', text: true, hint: '예: 37.31 (지도 앱에서 공장을 길게 누르면 나옵니다)' },
    { key: 'longitude', label: '경도', text: true, hint: '예: 126.78' },
    { key: 'economic_activity', label: '주요 사업 (영문)', hint: '예: Manufacture of steel screws and bolts' },
    { section: '■ 운영자(법인) — 검증인이 반드시 확인합니다' },
    { key: 'operator_name', label: '운영자(법인)명 (영문)', hint: '공장을 운영하는 법인. 예: Daeil Industrial Co., Ltd.' },
    { key: 'operator_reg_number', label: '법인/사업자 등록번호', text: true, hint: '법인등록번호 또는 사업자등록번호' },
    { key: 'operator_address', label: '운영자 주소 (영문)', hint: '법인의 주소(공장 주소와 다를 수 있습니다)' },
    { section: '■ 담당자' },
    { key: 'authorized_representative_name', label: '담당자 이름', hint: '예: Kim Do-hyun' },
    { key: 'email', label: '담당자 이메일', hint: '' },
    { key: 'telephone', label: '담당자 전화', text: true, hint: '예: +82-31-000-0000' },
    { section: '■ 보고기간 — 이 서식에 적는 모든 양은 이 기간의 합계입니다' },
    { key: 'period_start', label: '보고기간 시작일', required: true, text: true, hint: 'YYYY-MM-DD 로 적으세요. 예: 2025-01-01' },
    { key: 'period_end', label: '보고기간 종료일', required: true, text: true, hint: '예: 2025-12-31' },
    { key: 'period_name', label: '보고기간 이름', hint: '비우면 자동으로 붙입니다(예: 2025년 연간)' },
    { section: '■ 전력 — 한전 고지서' },
    { key: 'electricity_total_mwh', label: '공장 전체 전력 사용량 (MWh)', hint: '고지서 12개월 합계(kWh) ÷ 1,000. 공정별 계량기가 없으면 이 값만 적으세요 — 앱이 생산량 비율로 나눕니다' },
    { key: 'electricity_ef', label: '전력 배출계수 (tCO₂e/MWh)', hint: '모르면 비워 두세요(임시값으로 들어가고 「확인할 것」에 남습니다). 적는다면 출처·연도를 확인하세요' },
    { key: 'electricity_ef_source', label: '전력 배출계수 출처', list: 'electricitySource', hint: '칸을 눌러 목록에서 고르세요' },
    { section: '■ 그 밖의 확인' },
    { key: 'imported_heat', label: '밖에서 사 오는 스팀·온수가 있나요?', list: 'yesNo', hint: '다른 회사에서 스팀·온수를 사 온다면 「예」. 자체 보일러만 쓰면 「아니오」' },
    { key: 'waste_gases', label: '폐가스(고로가스 등)가 발생하나요?', list: 'yesNo', hint: '강재를 사다 가공하는 공장은 보통 「아니오」' },
];

export const PRODUCT_COLUMNS: ActivityField[] = [
    { key: 'name', label: '제품 이름', required: true, width: 36, hint: '이 공장에서 만드는 제품. EU로 안 나가는 제품도 같은 설비·연료를 쓰면 적으세요', example: `${EXAMPLE_PREFIX} STS 십자홈 나사` },
    { key: 'cn', label: 'CN 코드 (8자리)', required: true, text: true, width: 18, hint: '수출신고필증·인보이스의 HS 코드 앞 8자리', example: '73181552' },
    { key: 'exported', label: 'EU로 수출하나요?', list: 'yesNo', width: 18, hint: '비우면 「예」. 「아니오」면 신고 대상이 아니고, 같이 쓴 연료·전력의 몫만 나눠 갖습니다', example: YES },
];

export const PROCESS_COLUMNS: ActivityField[] = [
    { key: 'name', label: '공정 이름', required: true, width: 30, hint: '제품을 만드는 생산 라인. 한 공정에서 제품을 여럿 만들면 같은 공정 이름으로 줄을 더 쓰세요', example: `${EXAMPLE_PREFIX} STS 나사 공정` },
    { key: 'product', label: '만드는 제품', required: true, list: 'product', width: 36, hint: '2_제품 시트에 적은 이름 그대로(칸을 누르면 목록이 나옵니다)', example: 'STS 십자홈 나사' },
    { key: 'mass', label: '생산량 (t)', required: true, width: 18, hint: '보고기간에 만든 합격품의 무게. 생산일지·ERP 합계', example: 3240 },
    { key: 'scrap', label: '불량·스크랩 (t)', width: 16, hint: '불량·절단 스크랩으로 나간 양(있으면). 생산량에 넣지 마세요', example: 265 },
    { key: 'route', label: '생산 방식', width: 34, hint: '비워도 됩니다. 예: 와이어 → 냉간압조 → 전조 → 세척', example: '와이어 → 냉간압조 → 전조 → 세척' },
    { key: 'electricity', label: '이 공정의 전력 (MWh)', width: 20, hint: '공정별 전력 계량기가 있을 때만. 없으면 비우고 1_사업장에 공장 전체 값을 적으세요', example: '' },
];

export const FUEL_COLUMNS: ActivityField[] = [
    { key: 'name', label: '연료 이름', required: true, width: 32, hint: '어느 설비의 연료인지 알 수 있게(예: 열처리로 도시가스). 고지서·전표 하나에 한 줄', example: `${EXAMPLE_PREFIX} 지게차 경유` },
    { key: 'kind', label: '연료 종류', required: true, list: 'fuelKind', width: 20, hint: '칸을 눌러 고르세요. 괄호 안이 사용량의 단위입니다', example: '경유 (L)' },
    { key: 'amount', label: '연간 사용량', required: true, width: 18, hint: '고른 종류의 단위로(Nm³·t·L). 보고기간 합계', example: 12400 },
    { key: 'where', label: '쓰는 공정', required: true, list: 'processOrShared', width: 30, hint: `한 공정만 쓰면 그 공정 이름. 모든 공정이 같이 쓰면 「${SHARED_PROCESS_LABEL}」. 일부 공정만 같이 쓰면(예: 열처리로) 그 공정 이름들을 ; 로 이어 적으세요 — 앱이 생산량 비율로 나눕니다`, example: SHARED_PROCESS_LABEL },
    { key: 'evidence', label: '근거 자료', width: 34, hint: '어디서 본 숫자인지. 예: 삼천리 고지서 2025 12장, 주유 전표 합계', example: '지게차 주유 전표 2025 합계' },
    { key: 'ncv', label: '순발열량', width: 24, hint: '비우면 기본값. 공급사 성적서 값이 있을 때만 적으세요(도시가스 GJ/Nm³, 그 밖은 GJ/t)', example: '' },
    { key: 'factor', label: '배출계수 (tCO₂e/TJ)', width: 24, hint: '비우면 기본값. 직접 적으면 옆 칸의 출처도 고르세요', example: '' },
    { key: 'factorSource', label: '계수 출처', list: 'fuelFactorSource', width: 26, hint: '순발열량·배출계수를 직접 적었을 때만', example: '' },
];

export const PRECURSOR_COLUMNS: ActivityField[] = [
    { key: 'name', label: '원료 이름', required: true, width: 34, hint: '사 온 강재(선재·와이어·코일 등). 공급사마다 한 줄', example: `${EXAMPLE_PREFIX} STS 304 와이어 (A사)` },
    { key: 'cn', label: 'CN 코드', required: true, text: true, width: 16, hint: '원료의 HS 코드 4~8자리', example: '72230019' },
    { key: 'consumed', label: '투입량 (t)', required: true, width: 20, hint: '보고기간에 이 공정에 실제로 넣은 양(구매량이 아닙니다)', example: 2910 },
    { key: 'purchased', label: '구매량 (t)', width: 16, hint: '비우면 투입량과 같게 봅니다', example: 2980 },
    { key: 'country', label: '원료를 만든 나라', required: true, list: 'country', width: 20, hint: '파는 회사의 나라가 아니라 **만든 공장**의 나라. 목록에서 고르세요', example: 'South Korea' },
    { key: 'where', label: '쓰는 공정', required: true, list: 'process', width: 30, hint: '3_공정 시트의 공정 이름', example: 'STS 나사 공정' },
    { key: 'products', label: '쓰는 제품', list: 'product', width: 34, hint: '이 원료로 만드는 제품(2_제품의 이름). 비우면 그 공정의 모든 제품이 생산량 비율로 나눠 쓴 것으로 봅니다. 제품마다 강종이 다르면 꼭 적으세요 — 여러 개면 ; 로 이어 적습니다', example: '' },
    { key: 'hasValue', label: '공급사 배출량 값이 있나요?', required: true, list: 'supplierValue', width: 28, hint: '없으면 앱이 EU 기본값을 찾아 넣습니다(직접·간접 칸은 비워 두세요)', example: SUPPLIER_VALUE_CHOICES[0].label },
    { key: 'direct', label: '직접 SEE (tCO₂e/t)', width: 18, hint: '공급사가 준 값. 「있음」일 때만', example: 1.86 },
    { key: 'indirect', label: '간접 SEE (tCO₂e/t)', width: 18, hint: '공급사가 준 값. 「있음」일 때만', example: 0.94 },
    { key: 'supplier', label: '공급사·공장 이름', width: 30, hint: '원료를 만든 회사와 공장', example: '(주)대한스테인리스선재 포항공장' },
    { key: 'verification', label: '검증 여부', list: 'verification', width: 18, hint: '비우면 「미검증」', example: VERIFICATION_CHOICES[1].label },
    { key: 'evidence', label: '근거 자료', width: 34, hint: '예: 공급사 회신 메일 2026-09-05, CBAM 데이터 시트 PDF', example: '공급사 CBAM 데이터 시트 PDF, 2026-09-05 회신' },
];

const TABLE_SHEETS = [
    { name: SHEET_PRODUCTS, title: '2. 제품 — 이 공장에서 만드는 제품을 한 줄에 하나씩', columns: PRODUCT_COLUMNS },
    { name: SHEET_PROCESSES, title: '3. 공정 — 제품을 만드는 생산 라인과 생산량', columns: PROCESS_COLUMNS },
    { name: SHEET_FUELS, title: '4. 연료 — 공장에서 태우는 연료(가스·경유·등유 등). 전기는 1_사업장에. 도금·절단·용접·마무리 설비 전용 연료는 적지 않습니다', columns: FUEL_COLUMNS },
    { name: SHEET_PRECURSORS, title: '5. 구매 강재 — 사 와서 가공하는 철강 원료와 그 원료의 배출량', columns: PRECURSOR_COLUMNS },
] as const;

/** 표 시트의 줄 배치: 1 제목 · 2 머리글 · 3 설명 · 4 예시 · 5~ 입력 */
const FIRST_INPUT_ROW = 5;
/** 입력 칸으로 꾸미고 선택 목록을 거는 줄 수 */
export const INPUT_ROWS = 60;
const LAST_INPUT_ROW = FIRST_INPUT_ROW + INPUT_ROWS - 1;

/** 엑셀이 흔히 쓰는 국가를 목록 앞에 둔다. 나머지는 기본값표의 이름 그대로 가나다(ABC) 순. */
const COMMON_COUNTRIES = ['South Korea', 'China', 'Japan', 'Taiwan', 'India', 'Vietnam', 'Indonesia', 'Türkiye', 'Thailand', 'Malaysia'];

export function orderCountries(countries: string[]): string[] {
    const known = countries.filter((name) => name && !name.startsWith('_'));
    const head = COMMON_COUNTRIES.filter((name) => known.includes(name));
    return [...head, ...known.filter((name) => !head.includes(name)).sort((a, b) => a.localeCompare(b))];
}

// ── 채워 넣을 값(작성 예시·시험용) ─────────────────────────────────────

export type ActivityRowValues = Record<string, string | number>;

export interface ActivityWorkbookFill {
    installation?: ActivityRowValues;
    products?: ActivityRowValues[];
    processes?: ActivityRowValues[];
    fuels?: ActivityRowValues[];
    precursors?: ActivityRowValues[];
}

/** 작성 예시 — 가상의 나사 공장(대일기업). 공용 가스·경유·전력은 공장 전체 값만 적어 앱이 나누게 한 모습이다. */
export const ACTIVITY_WORKBOOK_SAMPLE: ActivityWorkbookFill = {
    installation: {
        name: 'Daeil Industrial Co., Ltd. Ansan Plant',
        local_name: '대일기업 안산공장',
        country: 'KR',
        street: '000 Byeolmang-ro, Danwon-gu (Banwol National Industrial Complex)',
        city: 'Ansan-si, Gyeonggi-do',
        postcode: '15600',
        latitude: '37.31',
        longitude: '126.78',
        economic_activity: 'Manufacture of stainless and carbon steel screws and bolts (cold heading)',
        operator_name: 'Daeil Industrial Co., Ltd.',
        operator_reg_number: '000-00-00000',
        operator_address: '000 Byeolmang-ro, Danwon-gu, Ansan-si, Gyeonggi-do 15600, Republic of Korea',
        authorized_representative_name: 'Kim Do-hyun',
        email: 'cbam@daeil-ind.example',
        telephone: '+82-31-000-0000',
        period_start: '2025-01-01',
        period_end: '2025-12-31',
        electricity_total_mwh: 5412,
        electricity_ef: 0.4747,
        electricity_ef_source: ELECTRICITY_SOURCE_CHOICES[0].label,
        imported_heat: NO,
        waste_gases: NO,
    },
    products: [
        { name: 'STS 십자홈 나사 (stainless 304/316)', cn: '73181552', exported: YES },
        { name: '탄소강 십자홈 나사 (아연도금)', cn: '73181558', exported: NO },
    ],
    processes: [
        { name: 'STS 나사 공정', product: 'STS 십자홈 나사 (stainless 304/316)', mass: 3240, scrap: 265, route: 'STS 와이어 → 냉간압조 → 전조 → 세척·산세·부동태 → 검사·포장' },
        { name: '탄소강 나사 공정', product: '탄소강 십자홈 나사 (아연도금)', mass: 1860, scrap: 90, route: '탄소강 와이어 → 냉간압조 → 전조 → 열처리(QT) → 외주 도금 → 검사·포장' },
    ],
    fuels: [
        { name: '세척수 온수 보일러 도시가스', kind: FUEL_KIND_CHOICES[0].label, amount: 38500, where: SHARED_PROCESS_LABEL, evidence: '삼천리 고지서 2025 공장 전체 524,500 Nm³ − 열처리로 서브미터 486,000' },
        { name: '열처리로(QT) 도시가스', kind: FUEL_KIND_CHOICES[0].label, amount: 486000, where: '탄소강 나사 공정', evidence: '삼천리 고지서 2025 중 열처리로 서브미터 검침' },
        { name: '지게차 경유', kind: FUEL_KIND_CHOICES[2].label, amount: 12400, where: SHARED_PROCESS_LABEL, evidence: '지게차 주유 전표 2025 합계' },
    ],
    precursors: [
        { name: 'STS 304/316 냉간압조용 와이어 (국내)', cn: '72230019', consumed: 2910, purchased: 2980, country: 'South Korea', where: 'STS 나사 공정', hasValue: SUPPLIER_VALUE_CHOICES[0].label, direct: 1.86, indirect: 0.94, supplier: '(주)대한스테인리스선재 포항공장', verification: VERIFICATION_CHOICES[1].label, evidence: '공급사 CBAM 데이터 시트 PDF, 2026-09-05 회신' },
        { name: 'STS 304 CHQ 와이어 (대만, 자료 미회신)', cn: '72230019', consumed: 610, purchased: 620, country: 'Taiwan', where: 'STS 나사 공정', hasValue: SUPPLIER_VALUE_CHOICES[1].label, supplier: 'Feng-Yuan Stainless Wire Co.', evidence: '3회 요청했으나 미회신' },
    ],
};

// ── 엑셀 만들기 ───────────────────────────────────────────────────────

/** 셀 꾸밈 번호(styles.xml의 cellXfs 순서) */
const STYLE = { plain: 0, title: 1, required: 2, optional: 3, hint: 4, example: 5, input: 6, inputText: 7, label: 8, section: 9, wrap: 10 } as const;

const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="5">'
    + '<font><sz val="10"/><name val="맑은 고딕"/></font>'
    + '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font>'
    + '<font><i/><sz val="9"/><color rgb="FF64748B"/><name val="맑은 고딕"/></font>'
    + '<font><b/><sz val="12"/><color rgb="FF0F172A"/><name val="맑은 고딕"/></font>'
    + '<font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="맑은 고딕"/></font>'
    + '</fonts>'
    + '<fills count="7">'
    + '<fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF64748B"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFEFCE8"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFCCFBF1"/><bgColor indexed="64"/></patternFill></fill>'
    + '</fills>'
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="11">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'
    + '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
    + '<xf numFmtId="49" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>'
    + '<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="4" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
    + '</cellXfs>'
    + '</styleSheet>';

interface Cell {
    value?: string | number;
    formula?: string;
    style?: number;
}

interface Validation {
    sqref: string;
    formula: string;
    /** 목록에 없는 값을 막을지. 공정·제품 이름처럼 사람이 적는 값은 막지 않고 제안만 한다. */
    strict: boolean;
}

interface SheetSpec {
    name: string;
    rows: Array<{ cells: Cell[]; height?: number }>;
    widths: number[];
    /** 이 줄까지 고정(스크롤해도 머리글이 보인다) */
    freezeRows?: number;
    validations?: Validation[];
}

function cellXml(cell: Cell, ref: string): string {
    const style = cell.style ? ` s="${cell.style}"` : '';
    if (cell.formula) return `<c r="${ref}"${style}><f>${escapeXml(cell.formula)}</f></c>`;
    if (cell.value === undefined || cell.value === '') return style ? `<c r="${ref}"${style}/>` : '';
    if (typeof cell.value === 'number') return `<c r="${ref}"${style}><v>${cell.value}</v></c>`;
    return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
}

function sheetXml(spec: SheetSpec): string {
    const view = spec.freezeRows
        ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${spec.freezeRows}" topLeftCell="A${spec.freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
        : '';
    const cols = `<cols>${spec.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`;
    const rows = spec.rows.map((row, rowIndex) => {
        const cells = row.cells.map((cell, columnIndex) => cellXml(cell, `${columnName(columnIndex)}${rowIndex + 1}`)).join('');
        return `<row r="${rowIndex + 1}"${row.height ? ` ht="${row.height}" customHeight="1"` : ''}>${cells}</row>`;
    }).join('');
    const validations = spec.validations?.length
        ? `<dataValidations count="${spec.validations.length}">${spec.validations.map((item) =>
            `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="${item.strict ? 1 : 0}" errorTitle="목록에서 고르세요" error="칸 오른쪽의 화살표를 눌러 목록에서 고르세요." sqref="${item.sqref}"><formula1>${escapeXml(item.formula)}</formula1></dataValidation>`
        ).join('')}</dataValidations>`
        : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${view}${cols}<sheetData>${rows}</sheetData>${validations}</worksheet>`;
}

const headerLabel = (field: ActivityField) => (field.required ? `${field.label} *` : field.label);

/** 선택목록 시트의 열 배치 — 목록 이름 → 열 글자와 줄 범위 */
function buildLists(countries: string[]) {
    const fixed: Array<[ListName, string[]]> = [
        ['yesNo', [YES, NO]],
        ['fuelKind', FUEL_KIND_CHOICES.map((item) => item.label)],
        ['fuelFactorSource', FUEL_FACTOR_SOURCE_CHOICES.map((item) => item.label)],
        ['electricitySource', ELECTRICITY_SOURCE_CHOICES.map((item) => item.label)],
        ['supplierValue', SUPPLIER_VALUE_CHOICES.map((item) => item.label)],
        ['verification', VERIFICATION_CHOICES.map((item) => item.label)],
        ['country', countries],
    ];
    const titles: Record<ListName, string> = {
        yesNo: '예/아니오', fuelKind: '연료 종류', fuelFactorSource: '계수 출처', electricitySource: '전력 계수 출처', supplierValue: '공급사 값', verification: '검증 여부',
        country: '국가', processOrShared: '쓰는 공정(연료)', process: '쓰는 공정(구매 강재)', product: '제품',
    };
    const sheetRef = (name: string, cell: string) => `'${name}'!${cell}`;
    // 공정·제품 이름은 다른 시트에 적은 값을 수식으로 비춘다 — 적는 대로 목록에 나타난다.
    const mirror = (sheet: string) => Array.from({ length: INPUT_ROWS }, (_, index) => {
        const source = sheetRef(sheet, `A${FIRST_INPUT_ROW + index}`);
        return { formula: `IF(${source}="","",${source})` } as Cell;
    });
    const columns: Array<{ list: ListName; cells: Cell[] }> = [
        ...fixed.map(([list, values]) => ({ list, cells: values.map((value) => ({ value }) as Cell) })),
        { list: 'processOrShared' as const, cells: [{ value: SHARED_PROCESS_LABEL }, ...mirror(SHEET_PROCESSES)] },
        { list: 'process' as const, cells: mirror(SHEET_PROCESSES) },
        { list: 'product' as const, cells: mirror(SHEET_PRODUCTS) },
    ];
    const height = Math.max(...columns.map((column) => column.cells.length));
    const rows: SheetSpec['rows'] = [{ cells: columns.map((column) => ({ value: titles[column.list], style: STYLE.label })) }];
    for (let index = 0; index < height; index += 1) {
        rows.push({ cells: columns.map((column) => column.cells[index] ?? {}) });
    }
    const range = {} as Record<ListName, string>;
    columns.forEach((column, index) => {
        const letter = columnName(index);
        range[column.list] = `'${SHEET_LISTS}'!$${letter}$2:$${letter}$${column.cells.length + 1}`;
    });
    return { spec: { name: SHEET_LISTS, rows, widths: columns.map(() => 26) } as SheetSpec, range };
}

function guideSheet(): SheetSpec {
    const lines: Array<[string, number]> = [
        ['CBAM 활동자료 서식 — 업체에서 받은 자료를 여기에 적어 주세요', STYLE.title],
        ['', STYLE.plain],
        ['이 파일은 무엇인가요', STYLE.section],
        ['업체의 한 해 자료(생산량·연료·전기·사 온 강재)를 적는 파일입니다. 다 적어서 보내 주시면 CBAM 앱에 그대로 올려 배출량을 계산하고 EU 제출 문서를 만듭니다.', STYLE.wrap],
        ['', STYLE.plain],
        ['적는 순서 (아래 탭을 왼쪽부터)', STYLE.section],
        ['1_사업장 — 공장·법인·담당자, 보고기간, 한전 전기 사용량', STYLE.wrap],
        ['2_제품 — 공장에서 만드는 제품과 CN 코드', STYLE.wrap],
        ['3_공정 — 제품을 만드는 라인과 생산량', STYLE.wrap],
        ['4_연료 — 가스·경유·등유 등 공장에서 태우는 연료', STYLE.wrap],
        ['5_구매강재 — 사 와서 가공하는 철강 원료와 공급사가 준 배출량 값', STYLE.wrap],
        ['', STYLE.plain],
        ['적는 방법', STYLE.section],
        ['· 노란 칸에만 적습니다. 머리글과 설명 줄은 고치지 마세요.', STYLE.wrap],
        ['· 진한 초록 머리글(* 표시)은 꼭 적어야 하는 칸, 회색 머리글은 아는 경우에만 적는 칸입니다.', STYLE.wrap],
        ['· 「(예시)」로 시작하는 줄은 보기입니다. 지우지 않아도 됩니다 — 올릴 때 건너뜁니다.', STYLE.wrap],
        ['· 칸을 눌렀을 때 오른쪽에 화살표가 나오면 목록에서 고르세요. 제품·공정 이름은 앞 시트에 적은 것이 목록에 나옵니다.', STYLE.wrap],
        ['· 모든 양은 보고기간(보통 1년) 합계입니다. 단위는 머리글과 설명 줄에 있습니다.', STYLE.wrap],
        ['· 모르는 칸은 비워 두세요. 올리면 앱이 「확인할 것」 목록으로 알려 줍니다.', STYLE.wrap],
        ['', STYLE.plain],
        ['자주 헷갈리는 것', STYLE.section],
        [`· 한 고지서·전표의 연료를 여러 공정이 같이 쓰면 줄을 나누지 말고 공장 전체 값을 한 줄로 적고, 「쓰는 공정」에 「${SHARED_PROCESS_LABEL}」을 고르세요. 앱이 생산량 비율로 나눕니다.`, STYLE.wrap],
        ['· 전기도 같습니다. 공정별 계량기가 없으면 1_사업장에 공장 전체 값만 적으세요.', STYLE.wrap],
        ['· 제품은 품번이 아니라 CN 코드별로 묶어 적습니다(같은 CN이면 크기·모양이 달라도 한 줄). 강종이 다르면 줄을 나누세요.', STYLE.wrap],
        ['· 공정은 「같은 원료로 만드는 제품끼리」 묶습니다. 합금강 볼트와 탄소강 너트처럼 원료가 다른 제품을 한 공정에 적었다면, 5_구매강재의 「쓰는 제품」에 어느 제품의 원료인지 적어야 합니다 — 안 적으면 원료 배출이 모든 제품에 섞입니다.', STYLE.wrap],
        ['· 열처리로·가열로처럼 일부 제품만 거치는 설비의 연료는 「공장 전체(공용)」가 아니라 그 공정 이름을 적습니다(여러 공정이면 ; 로 이어서).', STYLE.wrap],
        ['· 도금(전기도금)·절단·태핑·용접·선별·포장 같은 마무리 설비 전용 연료는 적지 않습니다 — 규정이 철강 제품의 배출에서 빼는 공정입니다. 단조·열처리·소둔·산세·신선·코팅·용융아연도금의 연료는 적습니다. 열처리나 코팅을 다른 회사에 맡긴다면 알려 주세요(그 회사의 배출 자료가 필요할 수 있습니다).', STYLE.wrap],
        ['· 생산량에는 합격품만. 불량·스크랩은 옆 칸에 따로 적습니다.', STYLE.wrap],
        ['· 구매 강재의 「투입량」은 사 온 양이 아니라 그 기간에 실제로 쓴 양입니다.', STYLE.wrap],
        ['· 공급사 배출량 값이 없으면 「없음」을 고르세요. EU가 정한 기본값이 들어갑니다(보통 실제보다 큽니다).', STYLE.wrap],
        ['· EU로 수출하지 않는 제품도 같은 설비·연료를 쓰면 적어야 합니다. 그래야 연료·전기가 제품별로 바르게 나뉩니다.', STYLE.wrap],
        ['', STYLE.plain],
        ['이 서식이 받지 않는 것', STYLE.section],
        ['석회석 등 공정배출, 물질수지, 자체 보일러 스팀을 여러 공정에 열량으로 나누기, 공정 사이의 사내 이송은 이 서식에 칸이 없습니다. 해당하면 알려 주세요 — 앱에서 직접 입력합니다.', STYLE.wrap],
        ['', STYLE.plain],
        ['이 파일의 내용은 올리는 사람의 컴퓨터(브라우저) 안에서만 읽습니다. 서버로 보내지 않습니다.', STYLE.hint],
    ];
    return { name: SHEET_GUIDE, widths: [118], rows: lines.map(([value, style]) => ({ cells: [{ value, style }] })) };
}

function installationSheet(range: Record<ListName, string>, fill?: ActivityRowValues): SheetSpec {
    const rows: SheetSpec['rows'] = [
        { cells: [{ value: '1. 사업장 — 공장에 하나뿐인 값을 적습니다 (노란 칸)', style: STYLE.title }] },
        { cells: [{ value: '항목', style: STYLE.required }, { value: '여기에 적으세요', style: STYLE.required }, { value: '설명', style: STYLE.optional }] },
    ];
    const validations: Validation[] = [];
    for (const item of INSTALLATION_FORM) {
        if ('section' in item) {
            rows.push({ cells: [{ value: item.section, style: STYLE.section }, { style: STYLE.section }, { style: STYLE.section }] });
            continue;
        }
        const rowNumber = rows.length + 1;
        rows.push({
            cells: [
                { value: headerLabel(item), style: STYLE.label },
                { value: fill?.[item.key] ?? '', style: item.text ? STYLE.inputText : STYLE.input },
                { value: item.hint, style: STYLE.hint },
            ],
        });
        if (item.list) validations.push({ sqref: `B${rowNumber}`, formula: range[item.list], strict: true });
    }
    return { name: SHEET_INSTALLATION, rows, widths: [38, 44, 90], freezeRows: 2, validations };
}

function tableSheet(sheet: typeof TABLE_SHEETS[number], range: Record<ListName, string>, fill?: ActivityRowValues[]): SheetSpec {
    const columns = sheet.columns;
    const rows: SheetSpec['rows'] = [
        { cells: [{ value: `${sheet.title} — 5번째 줄부터 적으세요`, style: STYLE.title }] },
        { cells: columns.map((field) => ({ value: headerLabel(field), style: field.required ? STYLE.required : STYLE.optional })), height: 32 },
        { cells: columns.map((field) => ({ value: field.hint, style: STYLE.hint })), height: 100 },
        { cells: columns.map((field) => ({ value: field.example ?? '', style: STYLE.example })) },
    ];
    for (let index = 0; index < INPUT_ROWS; index += 1) {
        const values = fill?.[index];
        rows.push({ cells: columns.map((field) => ({ value: values?.[field.key] ?? '', style: field.text ? STYLE.inputText : STYLE.input })) });
    }
    const validations = columns.flatMap((field, index) => (field.list
        ? [{
            sqref: `${columnName(index)}${FIRST_INPUT_ROW}:${columnName(index)}${LAST_INPUT_ROW}`,
            formula: range[field.list],
            strict: !['process', 'processOrShared', 'product'].includes(field.list),
        }]
        : []));
    return { name: sheet.name, rows, widths: columns.map((field) => field.width ?? 18), freezeRows: 3, validations };
}

/**
 * 서식 엑셀을 만든다. countries: 「원료를 만든 나라」 목록(EU 기본값표의 국가 이름 — 올리는 화면이 넘긴다).
 * fill을 주면 그 값으로 채운 파일(작성 예시)을 만든다.
 */
export function createActivityWorkbook(options: { countries: string[]; fill?: ActivityWorkbookFill }) {
    // 기본값표를 아직 못 읽었으면 자주 쓰는 나라만이라도 목록에 넣는다(빈 목록은 엑셀이 파일 오류로 본다).
    const ordered = orderCountries(options.countries);
    const lists = buildLists(ordered.length > 0 ? ordered : COMMON_COUNTRIES);
    const fill = options.fill;
    const fillOf: Record<string, ActivityRowValues[] | undefined> = {
        [SHEET_PRODUCTS]: fill?.products, [SHEET_PROCESSES]: fill?.processes, [SHEET_FUELS]: fill?.fuels, [SHEET_PRECURSORS]: fill?.precursors,
    };
    const sheets: SheetSpec[] = [
        guideSheet(),
        installationSheet(lists.range, fill?.installation),
        ...TABLE_SHEETS.map((sheet) => tableSheet(sheet, lists.range, fillOf[sheet.name])),
        lists.spec,
    ];
    const files: Record<string, Uint8Array> = {
        '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            + sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>'),
        '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
        // fullCalcOnLoad: 선택목록의 수식(공정·제품 이름 비추기)을 엑셀이 열 때 계산한다.
        'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets><calcPr fullCalcOnLoad="1"/></workbook>`),
        'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
        'xl/styles.xml': strToU8(STYLES_XML),
    };
    sheets.forEach((sheet, index) => {
        files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet));
    });
    return new Blob([zipSync(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ── 엑셀 읽기 ─────────────────────────────────────────────────────────

/** 표 시트의 한 줄 — 값은 글자 그대로, row는 엑셀의 줄 번호(「확인할 것」이 가리킨다). */
export interface ActivityRow {
    row: number;
    values: Record<string, string>;
}

export interface ActivityWorkbookData {
    installation: Record<string, string>;
    products: ActivityRow[];
    processes: ActivityRow[];
    fuels: ActivityRow[];
    precursors: ActivityRow[];
    /** 읽으면서 알게 된 문제(머리글을 못 찾은 시트 등) */
    notes: string[];
}

/** 머리글 비교용 — 필수 표시(*)와 공백 차이를 지운다. */
const normalizeLabel = (value: string) => value.replace(/\*/g, '').replace(/\s+/g, ' ').trim();

function readSheetRows(xml: string, sharedStrings: string[]): Array<{ row: number; cells: Map<string, string> }> {
    const rows: Array<{ row: number; cells: Map<string, string> }> = [];
    let fallback = 0;
    for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
        fallback += 1;
        const rowNumber = Number(parseAttributes(rowMatch[1]).get('r')) || fallback;
        fallback = rowNumber;
        const cells = new Map<string, string>();
        for (const cellMatch of rowMatch[2].matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) {
            const cellText = cellMatch[0];
            const reference = parseAttributes(cellText.match(/^<c\b([^>]*)/)?.[1] ?? '').get('r');
            if (!reference) continue;
            const value = readCellValue(cellText, sharedStrings).trim();
            if (value) cells.set(getColumnName(reference), value);
        }
        rows.push({ row: rowNumber, cells });
    }
    return rows;
}

function readTable(rows: ReturnType<typeof readSheetRows>, columns: ActivityField[], sheetName: string, notes: string[]): ActivityRow[] {
    const firstLabel = normalizeLabel(columns[0].label);
    const header = rows.find((row) => Array.from(row.cells.values()).some((value) => normalizeLabel(value) === firstLabel));
    if (!header) {
        notes.push(`${sheetName} 시트에서 머리글 「${columns[0].label}」을 찾지 못해 이 시트를 읽지 못했습니다. 머리글 줄을 지우거나 바꾸지 않았는지 확인하세요.`);
        return [];
    }
    const keyByColumn = new Map<string, string>();
    for (const [column, value] of header.cells) {
        const field = columns.find((item) => normalizeLabel(item.label) === normalizeLabel(value));
        if (field) keyByColumn.set(column, field.key);
    }
    const hints = new Set(columns.map((field) => field.hint).filter(Boolean));
    const result: ActivityRow[] = [];
    for (const row of rows) {
        if (row.row <= header.row) continue;
        const values: Record<string, string> = {};
        for (const [column, value] of row.cells) {
            const key = keyByColumn.get(column);
            if (key) values[key] = value;
        }
        const filled = Object.values(values);
        if (filled.length === 0) continue;
        // 설명 줄과 예시 줄은 자료가 아니다.
        if (filled.every((value) => hints.has(value))) continue;
        if ((values[columns[0].key] ?? '').startsWith(EXAMPLE_PREFIX)) continue;
        result.push({ row: row.row, values });
    }
    return result;
}

export function isActivityWorkbookV2(sheetNames: string[]): boolean {
    return sheetNames.includes(SHEET_INSTALLATION);
}

/** 올린 파일의 시트 이름만 본다 — 어느 서식인지 가리는 데 쓴다. */
export function readActivityWorkbookSheetNames(bytes: Uint8Array): string[] {
    return parseWorkbookSheets(unzipSync(bytes)).map((sheet) => sheet.name);
}

/** 서식 v2를 글자 그대로 읽는다. 값의 해석(숫자·날짜·이름 맞추기)은 activity-import.ts가 한다. */
export function parseActivityWorkbook(bytes: Uint8Array): ActivityWorkbookData {
    const zip = unzipSync(bytes);
    const sheets = parseWorkbookSheets(zip);
    const sharedStrings = parseSharedStrings(zip);
    const notes: string[] = [];
    const rowsOf = (name: string) => {
        const sheet = sheets.find((item) => item.name === name);
        const part = sheet ? zip[sheet.path] : undefined;
        if (!part) {
            notes.push(`${name} 시트가 없습니다. 시트 이름을 바꾸거나 지우지 않았는지 확인하세요.`);
            return [];
        }
        return readSheetRows(strFromU8(part), sharedStrings);
    };

    const installation: Record<string, string> = {};
    const fields = INSTALLATION_FORM.filter((item): item is ActivityField => !('section' in item));
    for (const row of rowsOf(SHEET_INSTALLATION)) {
        const label = normalizeLabel(row.cells.get('A') ?? '');
        const field = fields.find((item) => normalizeLabel(item.label) === label);
        const value = row.cells.get('B');
        if (field && value) installation[field.key] = value;
    }

    return {
        installation,
        products: readTable(rowsOf(SHEET_PRODUCTS), PRODUCT_COLUMNS, SHEET_PRODUCTS, notes),
        processes: readTable(rowsOf(SHEET_PROCESSES), PROCESS_COLUMNS, SHEET_PROCESSES, notes),
        fuels: readTable(rowsOf(SHEET_FUELS), FUEL_COLUMNS, SHEET_FUELS, notes),
        precursors: readTable(rowsOf(SHEET_PRECURSORS), PRECURSOR_COLUMNS, SHEET_PRECURSORS, notes),
        notes,
    };
}
