import type { CnCodeOption } from './cn-code-options';
import type { Product } from './local-db';

export type ProductCnCandidateStatus = 'covered' | 'not-covered' | 'check';

export interface ProductCnCandidate {
    code: string;
    label: string;
    status: ProductCnCandidateStatus;
    note: string;
}

export interface ProductFamilyDetailPreset {
    id: string;
    label: string;
    description: string;
    productTypeEnum: Product['product_type_enum'];
    hsGroup: Product['hs_group'];
    cnCandidates: ProductCnCandidate[];
    requiredData: string[];
}

export interface ProductFamilyPreset {
    id: string;
    label: string;
    description: string;
    examples: string[];
    details: ProductFamilyDetailPreset[];
}

export interface ProductPrecursorCandidate {
    name: string;
    precursorCnCode: string;
    productionRoute: string;
}

export interface ProductDataRequest {
    item: string;
    owner: string;
    description: string;
}

export interface ProductCalculationSetup {
    processName: string;
    productionRoute: string;
    precursorCandidates: ProductPrecursorCandidate[];
    dataRequests: ProductDataRequest[];
}

export const PRODUCT_FAMILY_PRESETS: ProductFamilyPreset[] = [
    {
        id: 'wire',
        label: '강선·와이어',
        description: '철선, 도금선, STS 와이어, 합금강 와이어처럼 강재를 구매해 선재·와이어로 가공하는 제품군입니다.',
        examples: ['만호제강', '영흥철강', 'DSR제강', '홍덕산업', '청우제강'],
        details: [
            {
                id: 'plain-steel-wire',
                label: '철강 와이어·맨 강선',
                description: '비도금 또는 도금 철강 와이어, 솔리드 용접와이어 후보입니다.',
                productTypeEnum: 'HS72_WIRE',
                hsGroup: '72',
                cnCandidates: [
                    { code: '7217', label: '철 또는 비합금강 와이어', status: 'covered', note: '맨 강선·도금선 계열의 1차 후보입니다.' },
                    { code: '7223', label: '스테인리스강 와이어', status: 'covered', note: 'STS 와이어일 때 확인합니다.' },
                    { code: '7229', label: '기타 합금강 와이어', status: 'covered', note: '합금강 와이어일 때 확인합니다.' },
                ],
                requiredData: ['생산량', '선재·강선재 매입량', '전력 사용량', '연료 사용량', '스크랩·수율'],
            },
        ],
    },
    {
        id: 'welding-consumables',
        label: '용접재료',
        description: '맨 강선은 CBAM 대상 후보이고, 피복봉·코어드 와이어는 CN 8311 비대상 가능성이 큽니다.',
        examples: ['현대종합금속', '키스웰', '조선선재', '세아에삽'],
        details: [
            {
                id: 'solid-welding-wire',
                label: '솔리드·SAW·TIG 와이어',
                description: '피복이나 플럭스가 없는 맨 강철 와이어 계열입니다.',
                productTypeEnum: 'HS72_WIRE',
                hsGroup: '72',
                cnCandidates: [
                    { code: '7217', label: '철 또는 비합금강 용접와이어', status: 'covered', note: '맨 강철 와이어의 대표 후보입니다.' },
                    { code: '7223', label: '스테인리스 용접와이어', status: 'covered', note: 'STS 용접와이어일 때 확인합니다.' },
                    { code: '7229', label: '합금강 용접와이어', status: 'covered', note: '합금강 용접와이어일 때 확인합니다.' },
                ],
                requiredData: ['제품별 생산량', '강선재·심선 매입량', '전력 사용량', '연료 사용량', '공급사 SEE 자료'],
            },
            {
                id: 'coated-welding-rod',
                label: '피복봉·플럭스코어드·메탈코어드',
                description: 'HS 83류로 분류될 수 있어 CBAM 철강 대상과 구분이 필요합니다.',
                productTypeEnum: 'HS73_OTHER',
                hsGroup: '73',
                cnCandidates: [
                    { code: '8311', label: '피복·코어드 용접봉 후보', status: 'not-covered', note: 'CBAM 철강 대상이 아닐 가능성이 높습니다. 수출 인보이스와 관세 분류를 확인하세요.' },
                ],
                requiredData: ['수출 인보이스 HS/CN 코드', '대상/비대상 제품 구분표', '수입자 요청 범위'],
            },
        ],
    },
    {
        id: 'pipe-tube',
        label: '강관·튜브',
        description: 'HRC, 후판, 코일을 구매해 제관하는 무계목·용접 강관 제품군입니다.',
        examples: ['휴스틸', '넥스틸', '하이스틸', '한진철관', '동양철관', '미주제강'],
        details: [
            {
                id: 'steel-pipe',
                label: '무계목·용접 강관',
                description: '원형관, 각관, 구조관, 일반 강관을 포함합니다.',
                productTypeEnum: 'HS73_PIPE_TUBE',
                hsGroup: '73',
                cnCandidates: [
                    { code: '7304', label: '무계목 강관', status: 'covered', note: '무계목관일 때 확인합니다.' },
                    { code: '7305', label: '대구경 용접강관', status: 'covered', note: '대구경 용접관일 때 확인합니다.' },
                    { code: '7306', label: '기타 용접강관·각관', status: 'covered', note: '중소·중견 제관사의 대표 후보입니다.' },
                ],
                requiredData: ['제품별 생산량', 'HRC·후판·코일 매입량', '전력 사용량', '연료 사용량', '스크랩·수율'],
            },
        ],
    },
    {
        id: 'stainless-flat',
        label: 'STS 냉연·평판',
        description: '스테인리스 열연코일을 구매해 냉연·소둔·절단하는 평판 제품군입니다.',
        examples: ['비앤지스틸', '대양금속', '황금에스티'],
        details: [
            {
                id: 'stainless-cold-rolled',
                label: 'STS 냉연강판·코일',
                description: '폭 600mm 이상/미만 여부에 따라 후보가 갈립니다.',
                productTypeEnum: 'HS72_PLATE_SHEET',
                hsGroup: '72',
                cnCandidates: [
                    { code: '7219', label: '폭 600mm 이상 STS 평판', status: 'covered', note: 'STS 냉연강판·코일의 대표 후보입니다.' },
                    { code: '7220', label: '폭 600mm 미만 STS 평판', status: 'covered', note: '협폭재·스트립류일 때 확인합니다.' },
                ],
                requiredData: ['제품별 생산량', 'STS 열연코일 매입량', '전력 사용량', '소둔·산세 연료 사용량', '스크랩·수율'],
            },
        ],
    },
    {
        id: 'flat-coil',
        label: '판재·코일',
        description: '열연, 냉연, 도금, 컬러강판 등 판재·코일류입니다.',
        examples: ['열연코일 가공사', '도금강판 가공사', '컬러강판 가공사'],
        details: [
            {
                id: 'carbon-flat',
                label: '열연·냉연·도금 판재',
                description: '폭, 압연 방식, 도금 여부에 따라 CN 후보가 갈립니다.',
                productTypeEnum: 'HS72_PLATE_SHEET',
                hsGroup: '72',
                cnCandidates: [
                    { code: '7208', label: '열연 평판', status: 'covered', note: '열연 코일·시트 후보입니다.' },
                    { code: '7209', label: '냉연 평판', status: 'covered', note: '냉연 코일·시트 후보입니다.' },
                    { code: '7210', label: '도금·클래드 평판', status: 'covered', note: '도금강판 후보입니다.' },
                    { code: '7212', label: '협폭 도금·클래드 평판', status: 'covered', note: '폭 600mm 미만 제품일 때 확인합니다.' },
                ],
                requiredData: ['제품별 생산량', '매입 코일·강판 사용량', '전력 사용량', '연료 사용량', '스크랩·수율'],
            },
        ],
    },
    {
        id: 'bar-section-rod',
        label: '봉강·형강·선재',
        description: '봉, 철근, 앵글, 채널, 선재 등 압연재·형강류입니다.',
        examples: ['봉강 가공사', '형강 가공사', '선재 가공사'],
        details: [
            {
                id: 'bar-section',
                label: '봉강·형강·선재',
                description: '형상과 합금 여부에 따라 후보가 갈립니다.',
                productTypeEnum: 'HS72_BAR_SECTION',
                hsGroup: '72',
                cnCandidates: [
                    { code: '7213', label: '열연 선재', status: 'covered', note: '코일상 선재 후보입니다.' },
                    { code: '7214', label: '봉강', status: 'covered', note: '봉·철근류 후보입니다.' },
                    { code: '7216', label: '형강', status: 'covered', note: '앵글·채널·형강 후보입니다.' },
                    { code: '7228', label: '기타 합금강 봉·형강', status: 'covered', note: '합금강 제품일 때 확인합니다.' },
                ],
                requiredData: ['제품별 생산량', '빌렛·봉강·선재 매입량', '전력 사용량', '연료 사용량', '스크랩·수율'],
            },
        ],
    },
    {
        id: 'fastener',
        label: '파스너·볼트·너트',
        description: '볼트, 너트, 스크류, 와셔, 리벳처럼 SKU가 많은 체결류 제품군입니다.',
        examples: ['서울금속', '풍강'],
        details: [
            {
                id: 'fastener',
                label: '볼트·너트·스크류·와셔',
                description: '품목 수가 많으면 대표 제품 입력 후 치수·규격 복제가 적합합니다.',
                productTypeEnum: 'HS73_FASTENER',
                hsGroup: '73',
                cnCandidates: [
                    { code: '7318', label: '철강제 파스너', status: 'covered', note: '볼트·너트·스크류·와셔·리벳의 대표 후보입니다.' },
                ],
                requiredData: ['제품별 생산량', '매입 선재·봉강 사용량', '전력 사용량', '열처리·표면처리 연료 사용량', '스크랩·수율'],
            },
        ],
    },
    {
        id: 'fittings',
        label: '관 이음쇠·플랜지',
        description: '엘보, 티, 소켓, 플랜지 등 배관 연결 부품입니다.',
        examples: ['피팅류 가공사', '플랜지 가공사'],
        details: [
            {
                id: 'pipe-fitting',
                label: '관 이음쇠·플랜지',
                description: '강관·단조재를 가공한 배관 부품 후보입니다.',
                productTypeEnum: 'HS73_OTHER',
                hsGroup: '73',
                cnCandidates: [
                    { code: '7307', label: '철강제 관 이음쇠', status: 'covered', note: '엘보·티·플랜지 등 배관 부품 후보입니다.' },
                ],
                requiredData: ['제품별 생산량', '강관·단조재 매입량', '전력 사용량', '연료 사용량', '스크랩·수율'],
            },
        ],
    },
    {
        id: 'structure',
        label: '철강 구조물',
        description: '철골, 구조물 부품, 프레임, 타워 부품 등입니다.',
        examples: ['철골 제작사', '구조물 부품 가공사'],
        details: [
            {
                id: 'steel-structure',
                label: '철골·구조물 부품',
                description: '절단·용접·조립 제품은 프로젝트별 경계 확인이 중요합니다.',
                productTypeEnum: 'HS73_STRUCTURE',
                hsGroup: '73',
                cnCandidates: [
                    { code: '7308', label: '철강 구조물', status: 'covered', note: '철골·구조물 부품 후보입니다.' },
                ],
                requiredData: ['제품 또는 프로젝트별 생산량', '강판·형강 매입량', '전력 사용량', '용접·절단 연료 사용량', '스크랩·수율'],
            },
        ],
    },
    {
        id: 'tank-container',
        label: '탱크·용기·드럼',
        description: '저장탱크, 드럼, 캔, 압축가스 용기 등입니다.',
        examples: ['탱크 제작사', '금속 용기 제작사'],
        details: [
            {
                id: 'tank-container',
                label: '저장탱크·드럼·용기',
                description: '용도와 용량에 따라 후보가 갈립니다.',
                productTypeEnum: 'HS73_TANK',
                hsGroup: '73',
                cnCandidates: [
                    { code: '7309', label: '대형 저장용 탱크', status: 'covered', note: '300L 초과 저장용기 후보입니다.' },
                    { code: '7310', label: '탱크·드럼·캔', status: 'covered', note: '300L 이하 탱크·드럼 후보입니다.' },
                    { code: '7311', label: '압축·액화가스 용기', status: 'covered', note: '가스용기일 때 확인합니다.' },
                ],
                requiredData: ['제품별 생산량', '강판·부품 매입량', '전력 사용량', '용접·도장 연료 사용량', '스크랩·수율'],
            },
        ],
    },
    {
        id: 'railway',
        label: '철도용품',
        description: '레일, 궤도 부품, 철도용 철강 부품입니다.',
        examples: ['철도 부품 가공사'],
        details: [
            {
                id: 'railway-parts',
                label: '레일·궤도 부품',
                description: '철도용 철강 제품 후보입니다.',
                productTypeEnum: 'HS73_OTHER',
                hsGroup: '73',
                cnCandidates: [
                    { code: '7302', label: '철도·궤도용 철강 제품', status: 'covered', note: '레일·궤도 부품 후보입니다.' },
                ],
                requiredData: ['제품별 생산량', '매입 철강재 사용량', '전력 사용량', '연료 사용량', '스크랩·수율'],
            },
        ],
    },
    {
        id: 'other',
        label: '기타 철강 가공품',
        description: '위 제품군에 바로 맞지 않는 철강 가공품입니다.',
        examples: ['기타 가공품', '분류 확인 필요 품목'],
        details: [
            {
                id: 'other-steel-article',
                label: '기타 철강 가공품',
                description: '제품명만으로 확정하기 어렵기 때문에 EU 템플릿 CN 목록과 관세 분류 확인이 필요합니다.',
                productTypeEnum: 'HS73_OTHER',
                hsGroup: '73',
                cnCandidates: [
                    { code: '7326', label: '기타 철강 제품', status: 'check', note: '포괄 후보입니다. 수출 인보이스와 EU 템플릿 CN 목록을 반드시 대조하세요.' },
                ],
                requiredData: ['수출 인보이스 HS/CN 코드', '제품별 생산량', '매입 철강재 사용량', '전력·연료 사용량', '스크랩·수율'],
            },
        ],
    },
];

export function findFamilyPreset(familyId: string) {
    return PRODUCT_FAMILY_PRESETS.find((preset) => preset.id === familyId);
}

export function findDetailPreset(familyId: string, detailId: string) {
    return findFamilyPreset(familyId)?.details.find((detail) => detail.id === detailId);
}

export function findMatchingCnOptions(candidate: ProductCnCandidate, cnOptions: CnCodeOption[]) {
    const prefix = candidate.code.replace(/\D/g, '');

    return cnOptions
        .filter((option) => option.code.startsWith(prefix))
        .slice(0, 6);
}

export function getProductFamilyDetails() {
    return PRODUCT_FAMILY_PRESETS.flatMap((family) =>
        family.details.map((detail) => ({
            family,
            detail,
        }))
    );
}

export function findDetailPresetForProduct(product: Pick<Product, 'cn_code' | 'hs_code' | 'product_type_enum'>) {
    const code = (product.cn_code || product.hs_code || '').replace(/\D/g, '');
    const details = getProductFamilyDetails();

    const codeMatch = details.find(({ detail }) =>
        detail.cnCandidates.some((candidate) => {
            const candidateCode = candidate.code.replace(/\D/g, '');
            return candidateCode.length > 0 && code.startsWith(candidateCode);
        })
    );

    if (codeMatch) {
        return codeMatch.detail;
    }

    return details.find(({ detail }) => detail.productTypeEnum === product.product_type_enum)?.detail;
}

const PRODUCT_DETAIL_KEYWORDS: Array<{ detailId: string; keywords: string[] }> = [
    { detailId: 'coated-welding-rod', keywords: ['피복봉', '플럭스', '코어드', 'flux', 'cored', 'metal cored', 'fcw', 'fcaw', '8311'] },
    { detailId: 'solid-welding-wire', keywords: ['용접와이어', '솔리드', 'saw', 'tig', 'mig', 'solid wire', 'welding wire'] },
    { detailId: 'plain-steel-wire', keywords: ['강선', '철선', '와이어', 'wire', '도금선'] },
    { detailId: 'steel-pipe', keywords: ['강관', '튜브', '각관', '원형관', '파이프', 'pipe', 'tube', 'hollow'] },
    { detailId: 'stainless-cold-rolled', keywords: ['sts', '스테인리스', '스텐', '냉연', 'cold rolled', 'stainless'] },
    { detailId: 'carbon-flat', keywords: ['열연', '냉연', '도금강판', '컬러강판', '코일', '강판', 'plate', 'sheet', 'coil'] },
    { detailId: 'bar-section', keywords: ['봉강', '형강', '철근', '앵글', '채널', '선재', 'bar', 'section', 'rod'] },
    { detailId: 'fastener', keywords: ['볼트', '너트', '스크류', '와셔', '리벳', '파스너', 'bolt', 'nut', 'screw', 'washer', 'rivet'] },
    { detailId: 'pipe-fitting', keywords: ['피팅', '이음쇠', '플랜지', '엘보', '티', '소켓', 'fitting', 'flange', 'elbow'] },
    { detailId: 'steel-structure', keywords: ['철골', '구조물', '프레임', '타워', 'structure', 'frame'] },
    { detailId: 'tank-container', keywords: ['탱크', '드럼', '용기', '캔', '가스용기', 'tank', 'drum', 'container', 'cylinder'] },
    { detailId: 'railway-parts', keywords: ['레일', '궤도', '철도', 'rail', 'railway', 'track'] },
    { detailId: 'other-steel-article', keywords: ['기타', '가공품', '7326'] },
];

export function findDetailPresetById(detailId: string) {
    return getProductFamilyDetails().find(({ detail }) => detail.id === detailId)?.detail;
}

export function suggestDetailPresetFromText(value: string) {
    const normalized = value.toLowerCase();
    const matchedKeyword = PRODUCT_DETAIL_KEYWORDS.find(({ keywords }) =>
        keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
    );

    return matchedKeyword ? findDetailPresetById(matchedKeyword.detailId) : undefined;
}

const COMMON_DATA_REQUESTS: ProductDataRequest[] = [
    { item: '제품 생산량', owner: '생산관리팀', description: '보고기간 제품별 총 생산량과 출하량' },
    { item: '전력 사용량', owner: '설비/공무팀', description: '제품 또는 공정 단위 전력 사용량' },
    { item: '연료 사용량', owner: '설비/에너지 담당', description: 'LNG, LPG 등 연료와 공정 직접배출 자료' },
    { item: '스크랩·수율', owner: '생산기술/품질팀', description: '투입량 대비 제품 산출량과 스크랩 처리량' },
];

const DETAIL_CALCULATION_SETUPS: Record<string, ProductCalculationSetup> = {
    'plain-steel-wire': {
        processName: '신선·와이어 가공 공정',
        productionRoute: 'Steel wire drawing / converter route',
        precursorCandidates: [
            { name: '선재·강선재', precursorCnCode: '7213', productionRoute: 'Purchased wire rod' },
        ],
        dataRequests: [
            ...COMMON_DATA_REQUESTS,
            { item: '선재·강선재 매입량', owner: '구매팀', description: '제품에 투입된 매입 선재 또는 강선재 사용량' },
            { item: '공급사 SEE 자료', owner: '구매/ESG 담당', description: '공급사가 제공한 매입 소재 배출량 자료 또는 기본값 사용 사유' },
        ],
    },
    'solid-welding-wire': {
        processName: '용접와이어 신선·권취 공정',
        productionRoute: 'Welding wire drawing / converter route',
        precursorCandidates: [
            { name: '강선재·심선', precursorCnCode: '7213', productionRoute: 'Purchased wire rod / core wire' },
        ],
        dataRequests: [
            ...COMMON_DATA_REQUESTS,
            { item: '강선재·심선 매입량', owner: '구매팀', description: '솔리드 와이어에 투입된 선재, 심선, 강대 사용량' },
            { item: '공급사 SEE 자료', owner: '구매/ESG 담당', description: '공급사 제공 SEE 또는 EU 기본값 사용 근거' },
        ],
    },
    'coated-welding-rod': {
        processName: '용접재료 대상/비대상 확인',
        productionRoute: 'CN classification check before CBAM calculation',
        precursorCandidates: [],
        dataRequests: [
            { item: '수출 인보이스 HS/CN 코드', owner: '영업/관세 담당', description: '피복봉·코어드 와이어가 8311인지 먼저 확인' },
            { item: '대상/비대상 제품 구분표', owner: '영업/품질팀', description: '맨 강선과 피복·코어드 제품을 분리한 목록' },
            { item: '수입자 요청 범위', owner: '영업 담당', description: '수입자가 실제로 요청한 CBAM 대상 품목 범위' },
        ],
    },
    'steel-pipe': {
        processName: '제관·용접·절단 공정',
        productionRoute: 'Pipe forming / converter route',
        precursorCandidates: [
            { name: 'HRC·후판·코일', precursorCnCode: '7208', productionRoute: 'Purchased hot rolled coil / plate' },
        ],
        dataRequests: [
            ...COMMON_DATA_REQUESTS,
            { item: 'HRC·후판·코일 매입량', owner: '구매팀', description: '강관 생산에 투입된 매입 강재량' },
            { item: '용접·절단 자료', owner: '생산기술/공무팀', description: '용접, 절단, 열처리 관련 전력·연료 자료' },
        ],
    },
    'stainless-cold-rolled': {
        processName: 'STS 냉연·소둔·산세 공정',
        productionRoute: 'Stainless cold rolling / converter route',
        precursorCandidates: [
            { name: 'STS 열연코일', precursorCnCode: '7219', productionRoute: 'Purchased stainless hot rolled coil' },
        ],
        dataRequests: [
            ...COMMON_DATA_REQUESTS,
            { item: 'STS 열연코일 매입량', owner: '구매팀', description: '냉연 제품에 투입된 STS 열연코일 사용량' },
            { item: '소둔·산세 에너지', owner: '설비/공무팀', description: '소둔로 연료, 산세/세척 관련 전력 사용량' },
        ],
    },
    'carbon-flat': {
        processName: '판재·코일 가공 공정',
        productionRoute: 'Flat steel processing / converter route',
        precursorCandidates: [
            { name: '매입 코일·강판', precursorCnCode: '7208', productionRoute: 'Purchased flat steel' },
        ],
        dataRequests: [
            ...COMMON_DATA_REQUESTS,
            { item: '매입 코일·강판 사용량', owner: '구매팀', description: '제품별 투입 코일, 강판, 도금 원판 사용량' },
        ],
    },
    'bar-section': {
        processName: '봉강·형강·선재 가공 공정',
        productionRoute: 'Bar / section processing / converter route',
        precursorCandidates: [
            { name: '빌렛·봉강·선재', precursorCnCode: '7213', productionRoute: 'Purchased billet / bar / rod' },
        ],
        dataRequests: [
            ...COMMON_DATA_REQUESTS,
            { item: '빌렛·봉강·선재 매입량', owner: '구매팀', description: '제품별 투입 철강 반제품 사용량' },
        ],
    },
    fastener: {
        processName: '냉간단조·열처리·표면처리 공정',
        productionRoute: 'Fastener forming / converter route',
        precursorCandidates: [
            { name: '선재·봉강', precursorCnCode: '7213', productionRoute: 'Purchased wire rod / bar' },
        ],
        dataRequests: [
            ...COMMON_DATA_REQUESTS,
            { item: '선재·봉강 매입량', owner: '구매팀', description: '볼트·너트·스크류에 투입된 소재 사용량' },
            { item: '열처리·표면처리 에너지', owner: '설비/공무팀', description: '열처리로, 도금, 세척 등 에너지 사용량' },
        ],
    },
    'pipe-fitting': {
        processName: '피팅·플랜지 가공 공정',
        productionRoute: 'Pipe fitting processing / converter route',
        precursorCandidates: [
            { name: '강관·단조재', precursorCnCode: '7306', productionRoute: 'Purchased pipe / forged material' },
        ],
        dataRequests: [
            ...COMMON_DATA_REQUESTS,
            { item: '강관·단조재 매입량', owner: '구매팀', description: '피팅 또는 플랜지에 투입된 소재 사용량' },
        ],
    },
    'steel-structure': {
        processName: '절단·용접·조립 공정',
        productionRoute: 'Steel structure fabrication / converter route',
        precursorCandidates: [
            { name: '강판·형강', precursorCnCode: '7208', productionRoute: 'Purchased plate / section steel' },
        ],
        dataRequests: [
            ...COMMON_DATA_REQUESTS,
            { item: '강판·형강 매입량', owner: '구매팀', description: '구조물 제작에 투입된 철강재 사용량' },
            { item: '용접·절단 자료', owner: '생산기술/공무팀', description: '절단기, 용접기, 도장 등 전력·연료 자료' },
        ],
    },
    'tank-container': {
        processName: '용접·조립·도장 공정',
        productionRoute: 'Tank / container fabrication / converter route',
        precursorCandidates: [
            { name: '강판·부품', precursorCnCode: '7208', productionRoute: 'Purchased plate / components' },
        ],
        dataRequests: [
            ...COMMON_DATA_REQUESTS,
            { item: '강판·부품 매입량', owner: '구매팀', description: '탱크, 드럼, 용기에 투입된 소재 사용량' },
            { item: '용접·도장 에너지', owner: '설비/공무팀', description: '용접, 도장, 건조 공정 전력·연료 자료' },
        ],
    },
    'railway-parts': {
        processName: '철도부품 가공 공정',
        productionRoute: 'Railway part processing / converter route',
        precursorCandidates: [
            { name: '매입 철강재', precursorCnCode: '7208', productionRoute: 'Purchased steel material' },
        ],
        dataRequests: [
            ...COMMON_DATA_REQUESTS,
            { item: '매입 철강재 사용량', owner: '구매팀', description: '철도부품에 투입된 소재 사용량' },
        ],
    },
    'other-steel-article': {
        processName: '철강 가공 공정',
        productionRoute: 'Steel article processing / converter route',
        precursorCandidates: [
            { name: '매입 철강재', precursorCnCode: '7208', productionRoute: 'Purchased steel material' },
        ],
        dataRequests: [
            ...COMMON_DATA_REQUESTS,
            { item: '수출 인보이스 HS/CN 코드', owner: '영업/관세 담당', description: '기타 품목은 CN 분류를 먼저 확정' },
            { item: '매입 철강재 사용량', owner: '구매팀', description: '제품에 투입된 소재 사용량' },
        ],
    },
};

export function getCalculationSetupForDetail(detail?: ProductFamilyDetailPreset): ProductCalculationSetup {
    if (detail && DETAIL_CALCULATION_SETUPS[detail.id]) {
        return DETAIL_CALCULATION_SETUPS[detail.id];
    }

    return DETAIL_CALCULATION_SETUPS['other-steel-article'];
}
