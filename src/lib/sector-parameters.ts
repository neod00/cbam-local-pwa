// 부문특정 파라미터 — Commission Implementing Regulation (EU) 2025/2547, ANNEX IV point 2.
//
// 왜 이 파일이 필요한가:
//   씨밤이 검증심사(2547 대조)에서 드러난 단일 최대 결함 — ERW 강관 같은 철강제품에 규정이
//   요구하는 부문특정 파라미터(주 환원제·합금원소 함량·스크랩 등)가 보고서에 통째로 없었고,
//   14.1 미해소 등록부에도 안 잡혀 앱이 「빠졌다는 사실 자체를 몰랐다」. 정직성 그물을 빠져나갔다.
//
// 이 파일이 하는 일:
//   품목군(aggregated goods category)마다 규정이 요구하는 파라미터 목록을 내장한다. 어떤 제품에
//   무엇이 필요한지는 제품 CN → 품목군 조회로 정해진다(cbam-product-rules.ts). 값 자체는 앱이
//   추정하지 않는다 — 사용자가 채우고, 미입력이면 보고서가 「기재 필요」로 표기해 등록부에 집계한다.
//
// ⚠️ 규정 표(원문 84~85쪽)를 그대로 옮긴 것이다. 품목군 이름은 앱의 CN 마스터 품목군 문자열
//    (GOODS_INDIRECT_RELEVANCE 키)에 맞췄다. 표에 없는 품목군은 「해당 없음(N.a.)」이다.

/** 2025/2547 ANNEX IV point 2를 근거로 인용할 때 쓰는 문자열. */
export const SECTOR_PARAM_CITATION = 'Commission Implementing Regulation (EU) 2025/2547 ANNEX IV point 2';

export interface SectorParameter {
    /** 저장·조회용 안정 키. 절대 바꾸지 않는다(바꾸면 사용자 입력이 고아가 된다). */
    key: string;
    /** 화면·보고서 라벨(국문 + 영문 용어). */
    label: string;
    /** 단위. 없으면 서술형. */
    unit?: string;
    /** 규정 원문 근거(발췌). 검증인이 대조할 수 있게. */
    source: string;
}

// 파라미터가 **요구되는** 품목군만 담는다. 여기 없는 품목군은 규정상 「해당 없음」이다.
// 근거 문구는 원문 verbatim(영문)을 옮긴다 — 심사에서 인용을 지어내지 않는다는 원칙.
export const SECTOR_PARAMETERS: Record<string, SectorParameter[]> = {
    Cement: [
        { key: 'clinker_to_cement_ratio', label: '클링커/시멘트 질량비 (clinker to cement ratio)', unit: '%',
            source: 'Mass ratio of tonnes cement clinker consumed per produced tonne of cement (clinker to cement ratio expressed in per cent).' },
    ],
    Urea: [
        { key: 'urea_purity', label: '순도 (purity — mass % urea)', unit: '%', source: 'Purity (mass % urea contained, % N contained).' },
        { key: 'urea_n_content', label: '질소(N) 함량', unit: '%', source: 'Purity (mass % urea contained, % N contained). / Content of N' },
    ],
    'Nitric acid': [
        { key: 'nitric_concentration', label: '농도 (concentration)', unit: 'mass %', source: 'Concentration (mass %).' },
        { key: 'nitric_n_content', label: '질소(N) 함량', unit: '%', source: 'Content of N' },
    ],
    Ammonia: [
        { key: 'ammonia_concentration', label: '농도 (수용액인 경우, concentration if hydrous solution)', unit: 'mass %', source: 'Concentration, if hydrous solution.' },
        { key: 'ammonia_n_content', label: '질소(N) 함량', unit: '%', source: 'Content of N' },
    ],
    'Mixed fertilisers': [
        { key: 'mf_n_ammonium', label: '암모늄(NH4+) 형태 질소', unit: '%', source: 'content of N as ammonium (NH4+); (Regulation (EU) 2019/1009)' },
        { key: 'mf_n_nitrate', label: '질산염(NO3-) 형태 질소', unit: '%', source: 'content of N as nitrate (NO3–);' },
        { key: 'mf_n_urea', label: '요소 형태 질소', unit: '%', source: 'content of N as urea;' },
        { key: 'mf_n_other', label: '기타(유기) 형태 질소', unit: '%', source: 'content of N in other (organic) forms.' },
        { key: 'mf_n_total', label: '총 질소(N)', unit: '%', source: 'Content of N total' },
    ],
    'Pig iron': [
        { key: 'reducing_agent', label: '주 환원제 (main reducing agent used)', source: 'The main reducing agent used.' },
        { key: 'alloy_mn_cr_ni', label: 'Mn·Cr·Ni 및 기타 합금원소 합계 질량비', unit: '%', source: 'Mass % of Mn, Cr, Ni, total of other alloy elements.' },
    ],
    'Direct reduced iron': [
        { key: 'reducing_agent', label: '주 환원제 (main reducing agent used)', source: 'The main reducing agent used.' },
        { key: 'alloy_mn_cr_ni', label: 'Mn·Cr·Ni 및 기타 합금원소 합계 질량비', unit: '%', source: 'Mass % of Mn, Cr, Ni, total of other alloy elements.' },
    ],
    // 앱은 FeMn·FeCr·FeNi를 한 품목군으로 묶는다. 규정은 셋을 나눠 각각 Mn+C / Cr+C / Ni+C를 요구한다.
    // 어느 합금인지는 사업장이 안다 — 해당 합금원소 함량과 탄소를 사용자가 채우도록 한다.
    'Alloys (FeMn, FeCr, FeNi)': [
        { key: 'alloy_element', label: '해당 합금원소 함량 (FeMn→Mn / FeCr→Cr / FeNi→Ni)', unit: 'mass %', source: 'FeMn: Mass % of Mn and carbon. / FeCr: Mass % of Cr and carbon. / FeNi: Mass % of [Ni] and carbon.' },
        { key: 'alloy_carbon', label: '탄소(carbon) 함량', unit: 'mass %', source: 'Mass % of … and carbon.' },
    ],
    'Crude steel': [
        { key: 'reducing_agent', label: '전구물질의 주 환원제 (알면, main reducing agent of the precursor, if known)', source: 'The main reducing agent of the precursor, if known.' },
        { key: 'alloy_mn_cr_ni', label: 'Mn·Cr·Ni 및 기타 합금원소 합계 질량비', unit: '%', source: 'Mass % of Mn, Cr, Ni, total of other alloy elements.' },
        { key: 'scrap_per_t', label: '조강 1t 생산당 사용 스크랩', unit: 't', source: 'Tonnes scrap used for producing 1 t crude steel.' },
        { key: 'preconsumer_scrap_pct', label: 'pre-consumer 스크랩 비율', unit: '%', source: '% of scrap that is pre-consumer scrap.' },
    ],
    'Iron or steel products': [
        { key: 'reducing_agent', label: '전구물질 생산의 주 환원제 (알면, main reducing agent used in precursor production, if known)', source: 'The main reducing agent used in precursor production, if known.' },
        { key: 'alloy_mn_cr_ni', label: 'Mn·Cr·Ni 및 기타 합금원소 합계 질량비', unit: '%', source: 'Mass % of Mn, Cr, Ni, total of other alloy elements.' },
        { key: 'scrap_per_t', label: '제품 1t 생산당 사용 스크랩', unit: 't', source: 'Tonnes scrap used for producing 1 t of the product.' },
        { key: 'preconsumer_scrap_pct', label: 'pre-consumer 스크랩 비율', unit: '%', source: '% of scrap that is pre-consumer scrap.' },
    ],
    'Unwrought aluminium': [
        { key: 'scrap_per_t', label: '제품 1t 생산당 사용 스크랩', unit: 't', source: 'Tonnes scrap used for producing 1 t of the product.' },
        { key: 'preconsumer_scrap_pct', label: 'pre-consumer 스크랩 비율', unit: '%', source: '% of scrap that is pre-consumer scrap.' },
        { key: 'non_al_pct', label: '알루미늄 외 원소 합계(총량 1% 초과 시)', unit: '%', source: 'If the total content of elements other than aluminium exceeds 1 %, the total percentage of such elements.' },
    ],
    'Aluminium products': [
        { key: 'scrap_per_t', label: '제품 1t 생산당 사용 스크랩', unit: 't', source: 'Tonnes scrap used for producing 1 t of the product.' },
        { key: 'preconsumer_scrap_pct', label: 'pre-consumer 스크랩 비율', unit: '%', source: '% of scrap that is pre-consumer scrap.' },
        { key: 'non_al_pct', label: '알루미늄 외 원소 합계(총량 1% 초과 시)', unit: '%', source: 'If the total content of elements other than aluminium exceeds 1 %, the total percentage of such elements.' },
    ],
};

/**
 * 이 품목군에 규정이 요구하는 부문특정 파라미터. 요구가 없으면 빈 배열(= 「해당 없음」).
 * good이 undefined(하위 품목군이 여럿이라 대표를 못 고름)면 빈 배열을 돌려주되, 호출부는
 * 그 경우를 「판정 불가」로 다뤄야 한다 — 여기서 임의로 하나를 고르지 않는다.
 */
export function getSectorParameters(good?: string): SectorParameter[] {
    if (!good) {
        return [];
    }

    return SECTOR_PARAMETERS[good] ?? [];
}
