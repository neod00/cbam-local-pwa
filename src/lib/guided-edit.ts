import type {
    Installation,
    Product,
    ProductionProcess,
    ProductOutputLine,
    PurchasedPrecursor,
    ReportingPeriod,
    SourceStream,
} from './local-db';

/**
 * 길잡이 지도 패널의 **수정·삭제 로직**. 화면(.tsx)이 아니라 여기 있다.
 *
 * 왜 분리하는가: 이 저장소에서 반복해 난 결함은 전부 「로직이 .tsx 안에 있어 어떤 검사도
 * 닿지 않는」 자리에서 났다. 수정 경로는 특히 위험한데, 신규 경로와 **같은 필드를 두 번**
 * 적게 되고 한쪽만 고쳐지면 조용히 어긋나기 때문이다.
 *
 * 그래서 규칙을 둘 둔다.
 *   1) 신규와 수정은 같은 payload 빌더를 쓴다 — 필드 매핑을 두 곳에 두지 않는다.
 *   2) 수정은 반드시 기존 엔티티를 펼친 뒤 payload를 덮는다 — 패널에 없는 필드
 *      (주소·검증상태·비고 등 백스테이지에서 입력된 값)를 지우지 않기 위해서다.
 */

const fmtNum = (value: number, digits = 1) =>
    new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);

/** 삭제를 막는 참조. total > 0이면 삭제할 수 없다. */
export interface DeleteBlockers {
    total: number;
    /** 사용자에게 보여줄 「무엇이 몇 건」 목록 */
    reasons: string[];
}

function blockers(entries: Array<[string, number]>): DeleteBlockers {
    const hit = entries.filter(([, count]) => count > 0);
    return {
        total: hit.reduce((sum, [, count]) => sum + count, 0),
        reasons: hit.map(([label, count]) => `${label} ${count}건`),
    };
}

// ── 제품 ──────────────────────────────────────────────────────────────

/**
 * 제품 삭제를 막는 참조.
 *
 * 생산라인(product_output_lines)까지 본다. 공정의 product_id는 **대표 제품 하나**만
 * 가리키므로, 다제품 공정의 두 번째 제품은 공정 참조에 걸리지 않는다. 그 상태로 지우면
 * 생산라인이 사라진 제품을 계속 가리키며 질량을 만들어낸다.
 */
export function getProductDeleteBlockers(
    productId: string,
    data: {
        processes: ProductionProcess[];
        precursors: PurchasedPrecursor[];
        productOutputLines: ProductOutputLine[];
    }
): DeleteBlockers {
    return blockers([
        ['생산공정', data.processes.filter((process) => process.product_id === productId).length],
        ['생산라인', data.productOutputLines.filter((line) => line.product_id === productId).length],
        ['전구물질', data.precursors.filter((precursor) => precursor.product_id === productId).length],
    ]);
}

/**
 * 생산라인 삭제를 막는 참조.
 *
 * 전구물질의 제품별 배분(output_allocations)이 이 라인을 가리키면 막는다. 그냥 지우면
 * 배분이 없는 라인을 가리킨 채 남는데, 엔진은 못 찾은 배분을 **조용히 건너뛴다** —
 * 즉 그 전구물질의 배분 질량이 경고 하나 없이 계산에서 사라진다.
 *
 * 이 경로는 삭제 버튼이 아니라 3단계 공정 수정에서 열린다. 제품 생산량을 0이나 공란으로
 * 두면 그 제품의 생산라인이 지워지기 때문이다.
 */
export function getOutputLineDeleteBlockers(
    lineId: string,
    data: { precursors: PurchasedPrecursor[] }
): DeleteBlockers {
    return blockers([
        [
            '전구물질 제품별 배분',
            data.precursors.filter((precursor) =>
                (precursor.output_allocations ?? []).some(
                    (allocation) => allocation.product_output_line_id === lineId
                )
            ).length,
        ],
    ]);
}

export interface ProductDraft {
    name: string;
    /** 숫자만 남긴 CN — 호출부에서 replace(/\D/g, '') 후 넘긴다 */
    cnDigits: string;
}

export function validateProductDraft(draft: ProductDraft): string | null {
    if (!draft.name.trim()) {
        return '제품 이름을 입력하세요.';
    }
    if (draft.cnDigits.length !== 8) {
        return 'CN 코드는 8자리 숫자입니다. 목록에서 골라도 됩니다.';
    }
    return null;
}

/** CN에서 파생되는 필드. CN이 바뀔 때만 다시 계산한다. */
function deriveFromCn(cnDigits: string) {
    return {
        hs_code: cnDigits.slice(0, 4),
        cn_code: cnDigits,
        hs_group: cnDigits.slice(0, 2),
        product_type_enum: `HS${cnDigits.slice(0, 2)}_OTHER`,
    };
}

/** 신규 제품. 수정과 같은 파생 규칙을 쓴다. */
export function buildProductPayload(draft: ProductDraft, installationId?: string) {
    return {
        installation_id: installationId,
        name: draft.name.trim(),
        ...deriveFromCn(draft.cnDigits),
        unit: 'tonne',
        reporting_scope: 'CBAM_GOOD' as const,
    };
}

/**
 * 제품 수정.
 *
 * CN이 그대로면 파생 필드를 **건드리지 않는다**. 백스테이지(/products)에서 제품군 템플릿을
 * 골라 product_type_enum을 정교하게 맞춰둔 사용자가 이름 오타만 고쳤을 때, 그 값이
 * 「HS72_OTHER」로 조용히 되돌아가면 안 되기 때문이다.
 */
export function buildProductUpdate(existing: Product, draft: ProductDraft): Product {
    // 저장된 CN도 정규화해서 비교한다. 다른 화면에서 「7217 2010」처럼 구분자를 넣어 저장했다면
    // 사용자가 CN을 건드리지 않았는데도 「바뀜」으로 보여 제품군이 되돌아간다 —
    // 화면에 「CN을 그대로 두면 제품군 설정이 유지됩니다」라고 적어놓고 어기는 셈이다.
    const cnChanged = (existing.cn_code ?? '').replace(/\D/g, '') !== draft.cnDigits;
    return {
        ...existing,
        name: draft.name.trim(),
        ...(cnChanged ? deriveFromCn(draft.cnDigits) : {}),
    };
}

// ── 사업장 ────────────────────────────────────────────────────────────

export interface InstallationDraft {
    name: string;
    country: string;
}

export function validateInstallationDraft(draft: InstallationDraft): string | null {
    if (!draft.name.trim()) {
        return '회사·공장 이름을 입력하세요.';
    }
    if (!/^[A-Za-z]{2}$/.test(draft.country.trim())) {
        return '국가는 2자리 코드로 입력하세요 (예: KR).';
    }
    return null;
}

export function buildInstallationPayload(draft: InstallationDraft) {
    return {
        name: draft.name.trim(),
        country: draft.country.trim().toUpperCase(),
    };
}

/**
 * 사업장 수정. 반드시 기존을 펼친다 — 주소·좌표·담당자·boundary_json은 이 패널에 칸이 없고
 * 백스테이지(/installations)에서만 입력된다. 펼치지 않으면 그 값들이 전부 사라진다.
 */
export function buildInstallationUpdate(existing: Installation, draft: InstallationDraft): Installation {
    return { ...existing, ...buildInstallationPayload(draft) };
}

// ── 보고기간 ──────────────────────────────────────────────────────────

export interface PeriodDraft {
    name: string;
    startDate: string;
    endDate: string;
}

export function validatePeriodDraft(draft: PeriodDraft): string | null {
    if (!draft.name.trim() || !draft.startDate || !draft.endDate) {
        return '보고기간 이름과 시작·종료일을 입력하세요.';
    }
    if (draft.endDate < draft.startDate) {
        return '종료일이 시작일보다 빠릅니다.';
    }
    return null;
}

export function buildPeriodPayload(draft: PeriodDraft) {
    return {
        name: draft.name.trim(),
        start_date: draft.startDate,
        end_date: draft.endDate,
    };
}

/** 보고기간 수정. status는 펼치기로 보존한다 — 이 패널에는 칸이 없다. */
export function buildPeriodUpdate(existing: ReportingPeriod, draft: PeriodDraft): ReportingPeriod {
    return { ...existing, ...buildPeriodPayload(draft) };
}

/** 보고기간 삭제를 막는 참조. 기간은 공정·배출원·전구물질 셋 모두가 가리킨다. */
export function getPeriodDeleteBlockers(
    periodId: string,
    data: {
        processes: ProductionProcess[];
        sourceStreams: SourceStream[];
        precursors: PurchasedPrecursor[];
    }
): DeleteBlockers {
    return blockers([
        ['생산공정', data.processes.filter((process) => process.period_id === periodId).length],
        ['배출원 자료', data.sourceStreams.filter((stream) => stream.period_id === periodId).length],
        ['전구물질', data.precursors.filter((precursor) => precursor.period_id === periodId).length],
    ]);
}

// ── 배출원(연료) ──────────────────────────────────────────────────────

export interface SourceStreamDraft {
    name: string;
    activityData: number;
}

export function validateSourceStreamDraft(draft: SourceStreamDraft): string | null {
    if (!draft.name.trim()) {
        return '배출원 이름을 입력하세요.';
    }
    if (draft.activityData <= 0) {
        return '사용량을 입력하세요. 고지서의 연간 합계를 그대로 적으면 됩니다.';
    }
    return null;
}

/**
 * 배출원 수정 — **이름과 사용량만** 바꾼다.
 *
 * 발열량·배출계수·산화계수·화석/바이오 비율은 손대지 않는다. 이 패널은 프리셋으로만
 * 만들지만 백스테이지(/source-streams)에서 자가 측정값을 넣은 배출원도 같은 목록에 뜨는데,
 * 프리셋 값을 덮어쓰면 그 측정값이 조용히 표준값으로 바뀐다. 연료 종류를 바꾸려면
 * 지우고 다시 등록하는 편이 안전하다(계수 세트가 통째로 달라지므로).
 */
export function buildSourceStreamUpdate(existing: SourceStream, draft: SourceStreamDraft): SourceStream {
    return {
        ...existing,
        name: draft.name.trim(),
        activity_data: draft.activityData,
    };
}

// ── 전력 ──────────────────────────────────────────────────────────────

export interface ElectricityDraft {
    mwh: number;
    ef: number;
    efSource: string;
}

export function validateElectricityDraft(draft: ElectricityDraft): string | null {
    if (draft.mwh <= 0) {
        return '전력 사용량(MWh)을 입력하세요. 전기요금 고지서의 연간 kWh ÷ 1,000 입니다.';
    }
    if (draft.ef <= 0) {
        return '전력 배출계수를 입력하세요. 모르면 국가 기본계수를 쓰되 출처·연도를 확인하세요(임의로 낮추지 마세요).';
    }
    return null;
}

export function buildElectricityUpdate(existing: ProductionProcess, draft: ElectricityDraft): ProductionProcess {
    return {
        ...existing,
        electricity_mwh: draft.mwh,
        electricity_ef_tco2e_per_mwh: draft.ef,
        electricity_ef_source: draft.efSource || undefined,
    };
}

// ── 전구물질 ──────────────────────────────────────────────────────────

export interface PrecursorDraft {
    name: string;
    cnDigits: string;
    consumedMass: number;
    purchasedMass: number;
    directSee: number;
    indirectSee: number;
    /** 간접분을 전력사용량×계수로 입력했을 때의 분해값. 둘 다 >0일 때만 보존한다. */
    bridgeUsage: number;
    bridgeFactor: number;
    source: string;
    dataMode: PurchasedPrecursor['data_mode'];
    justification: string;
    supplierInstallation: string;
    supplierRoute: string;
    supplierPeriod: string;
    /** 제품별 직접 배분. '생산량 비율로 자동'이면 undefined. */
    outputAllocations: PurchasedPrecursor['output_allocations'];
}

export function validatePrecursorDraft(draft: PrecursorDraft): string | null {
    if (!draft.name.trim()) {
        return '원료 이름을 입력하세요. 예: 선재(와이어로드)';
    }
    if (draft.cnDigits.length < 4) {
        return '원료의 CN 코드(4자리 이상)를 입력하세요.';
    }
    if (draft.consumedMass <= 0) {
        return '소비량(t)을 입력하세요. 만든 양이 아니라 이 공정에 투입한 양입니다.';
    }
    if (!draft.source.trim()) {
        return 'SEE 값의 출처를 적어주세요. 예: 공급사 회신 메일, EU 기본값 파일';
    }
    if (draft.dataMode === 'DEFAULT' && !draft.justification.trim()) {
        return '기본값 사용 사유를 적어주세요.';
    }
    return null;
}

/** 제품별 직접 배분 합계가 소비량과 맞는지. 엔진도 불일치 시 경고하므로 저장 전에 막는다. */
export function validatePrecursorAllocation(allocSum: number, consumedMass: number): string | null {
    const tolerance = Math.max(0.01, consumedMass * 0.01);
    if (Math.abs(allocSum - consumedMass) > tolerance) {
        return `제품별 배분 합계(${fmtNum(allocSum)} t)가 소비량(${fmtNum(consumedMass)} t)과 다릅니다. 합계를 맞춰주세요.`;
    }
    return null;
}

export interface PrecursorLink {
    period_id?: string;
    process_id?: string;
    product_id?: string;
}

/**
 * 신규·수정이 **함께 쓰는** 필드 매핑.
 *
 * 모든 선택 필드를 undefined로라도 항상 포함한다. 키를 조건부로 빼면 수정 시 펼치기가
 * 옛 값을 남겨, 사용자가 지운 전력 분해값·제품별 배분이 화면에서만 사라지고 저장소에는
 * 살아남는다.
 */
export function buildPrecursorPayload(draft: PrecursorDraft, link: PrecursorLink) {
    const hasBridge = draft.bridgeUsage > 0 && draft.bridgeFactor > 0;
    return {
        period_id: link.period_id,
        process_id: link.process_id,
        product_id: link.product_id,
        name: draft.name.trim(),
        precursor_cn_code: draft.cnDigits,
        production_route: draft.supplierRoute.trim(),
        supplier_installation: draft.supplierInstallation.trim(),
        supplier_reporting_period: draft.supplierPeriod.trim() || undefined,
        data_mode: draft.dataMode,
        purchased_mass_t: draft.purchasedMass,
        consumed_mass_t: draft.consumedMass,
        direct_see_tco2e_per_t: draft.directSee,
        indirect_see_tco2e_per_t: draft.indirectSee,
        indirect_electricity_mwh_per_t: hasBridge ? draft.bridgeUsage : undefined,
        indirect_electricity_factor_tco2e_per_mwh: hasBridge ? draft.bridgeFactor : undefined,
        source: draft.source.trim(),
        default_value_justification: draft.justification.trim(),
        output_allocations: draft.outputAllocations,
    };
}

/** 신규 전구물질. payload에 없는 필드는 이 패널이 정하는 기본값이다. */
export function buildPrecursorCreate(draft: PrecursorDraft, link: PrecursorLink) {
    return {
        ...buildPrecursorPayload(draft, link),
        aggregated_goods_category: 'Iron or steel products',
        supplier_country: 'South Korea',
        verification_status: 'UNVERIFIED' as const,
        default_value_year: '2026' as const,
        consumed_for_non_cbam_mass_t: 0,
    };
}

/**
 * 전구물질 수정. 펼치기로 verification_status·supplier_country·비CBAM 소비량을 보존한다 —
 * 백스테이지에서 「검증됨」으로 올려둔 값이 패널 저장 한 번에 UNVERIFIED로 떨어지면 안 된다.
 *
 * 링크(기간·공정·제품)는 **기존 값을 쓴다.** 호출부가 넘기지 못하도록 인자에서 뺐다.
 * 이 패널에는 제품·기간 선택 칸이 없으므로 수정이 그걸 정해선 안 된다 — 상세 입력에서
 * 부제품에 붙여둔 전구물질을 공정의 대표 제품으로 옮기면 EU goods category 매핑이 바뀐다
 * (eu-template-export가 precursor.product_id로 품목을 찾아 매핑 근거로 쓴다).
 */
export function buildPrecursorUpdate(existing: PurchasedPrecursor, draft: PrecursorDraft): PurchasedPrecursor {
    return {
        ...existing,
        ...buildPrecursorPayload(draft, {
            period_id: existing.period_id,
            process_id: existing.process_id,
            product_id: existing.product_id,
        }),
    };
}
