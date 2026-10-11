import {
    CARBON_PRICE_CHOICES,
    expandPartList,
    FUEL_USE_CHOICES,
    HEAT_BASIS_CHOICES,
    HEAT_UNIT_CHOICES,
    IMPORTED_HEAT_EF_CHOICES,
    OUTSIDE_PROCESS_LABEL,
    PART_ROW_BASE,
    PROCESS_EMISSION_KIND_CHOICES,
    SHEET_BOILER_HEAT,
    SHEET_IMPORTED_HEAT,
    SHEET_PARTS,
    SHEET_PROCESS_EMISSIONS,
    SHEET_TRANSFERS,
    SPLIT_BASIS_CHOICES,
    ELECTRICITY_SOURCE_CHOICES,
    FUEL_FACTOR_SOURCE_CHOICES,
    FUEL_KIND_CHOICES,
    LIST_SEPARATOR,
    NO,
    SHARED_PROCESS_LABEL,
    SHEET_FUELS,
    SHEET_INSTALLATION,
    SHEET_PRECURSORS,
    SHEET_PROCESSES,
    SHEET_PRODUCTS,
    SHEET_RNR,
    SUPPLIER_VALUE_CHOICES,
    VERIFICATION_CHOICES,
    YES,
    type ActivityRow,
    type ActivityWorkbookData,
} from './activity-workbook';
import { isImplausibleElectricityIntensity, sumReconciledSourceStreamEmissions } from './allocation-rules';
import { buildFuelStreamDraft, noImportedHeatDraft, type FuelAnswer } from './conversation-energy';
import { buildPrecursorDraft, fillEuDefault } from './conversation-precursor';
import { buildProcessCreation, PROCESS_PLACEHOLDER_EF, validateProcessAnswer, type ProcessAnswerDraft } from './conversation-process';
import { buildElectricitySplitUpdates, computeElectricitySplit, validateElectricitySplitDraft, type ElectricitySplitDraft } from './electricity-allocation';
import { buildFuelSplitStreams, computeFuelSplit, litresToTonnes, validateFuelSplitDraft, type FuelSplitDraft } from './fuel-allocation';
import {
    buildElectricityUpdate,
    buildInstallationPayload,
    buildPeriodPayload,
    buildPrecursorCreate,
    buildProductPayload,
    validateElectricityDraft,
    validateInstallationDraft,
    validatePeriodDraft,
    validatePrecursorAllocation,
    validatePrecursorDraft,
    validateProductDraft,
} from './guided-edit';
import { getIndirectEmissionsApplicability } from './cbam-product-rules';
import type { LocalEntity, Product, ProductionProcess, ProductOutputLine, PurchasedPrecursor, ReportInputs, ReportTranspositionRow, SourceStream, StoreEntityMap, StoreName } from './local-db';
import {
    buildImportedHeatUpdate,
    buildProvisionalHeatQuantities,
    buildSharedHeatUpdates,
    HEAT_STANDARD_FUELS,
    validateImportedHeatDraft,
    validateSharedHeatDraft,
    type ImportedHeatDraft,
    type SharedHeatDraft,
    type SharedHeatDraftConsumer,
} from './measurable-heat';
import { calculateSourceStreamEnergyBreakdown } from './source-stream-calculation';
import type { ElectricitySplitBasis } from './allocation-rules';
import type { ImportedDefaultValueReference } from './reference-workbooks';
import { getSectorParameters } from './sector-parameters';
import { createSourceStreamValidationErrors, firstSourceStreamError, GUIDED_STREAM_KINDS } from './source-stream-input';
import { looksLikeExcludedStepFuel, STEEL_BOUNDARY_ANCHOR } from './steel-boundary';

export { STEEL_BOUNDARY_ANCHOR };

/**
 * 활동자료 서식 v2를 프로젝트에 넣는다(2026-10-10).
 *
 * 규칙: **자체 필드 매핑을 두지 않는다.** 지도·질문 화면이 쓰는 검증·빌더(guided-edit, conversation-*, fuel-allocation,
 * electricity-allocation)를 그대로 거친다 — 그래서 서식으로 넣든 화면에서 넣든 저장되는 레코드가 같고,
 * 공용 계량기 나누기·배출원 합계 방식·생산라인이 화면에서 한 것과 같은 모양으로 들어온다.
 * 저장소는 호출부가 넘긴다(store) — 화면은 IndexedDB를, 검사 스크립트는 메모리 저장소를 넘긴다.
 *
 * 끝나면 「확인할 것」(issues)을 돌려준다: 넣지 못한 것(error), 넣었지만 확인이 필요한 것(warning), 참고(info).
 * 서식의 시트·줄 번호를 붙여, 서식을 채운 사람에게 그대로 돌려보낼 수 있다.
 */

export interface ActivityImportStore {
    list<K extends StoreName>(store: K): Promise<StoreEntityMap[K][]>;
    create<K extends StoreName>(store: K, item: Omit<StoreEntityMap[K], keyof LocalEntity>): Promise<StoreEntityMap[K]>;
    update<K extends StoreName>(store: K, item: StoreEntityMap[K]): Promise<StoreEntityMap[K]>;
}

/**
 * 보고서 입력(`/report-inputs`이 쓰는 설정 한 덩어리)을 읽고 쓰는 자리. 화면은 설정 저장소를, 검사 스크립트는 메모리를 넘긴다.
 * 넘기지 않으면 서식의 보고서 항목(부문특정 파라미터·전력 계수 근거·역할책임·증빙·탄소가격·서명)은 저장하지 않는다.
 */
export interface ActivityImportReportInputs {
    get(): Promise<ReportInputs | undefined>;
    set(value: ReportInputs): Promise<void>;
}

export interface ActivityImportIssue {
    level: 'error' | 'warning' | 'info';
    sheet: string;
    /** 엑셀의 줄 번호(표 시트) */
    row?: number;
    message: string;
}

export interface ActivityImportResult {
    created: { installation: number; period: number; products: number; processes: number; fuels: number; precursors: number; transfers: number };
    issues: ActivityImportIssue[];
}

export const ISSUE_LEVEL_LABEL: Record<ActivityImportIssue['level'], string> = {
    error: '넣지 못함',
    warning: '확인 필요',
    info: '참고',
};

/** 근거 자료 칸이 비었을 때 들어가는 글 — 비어 있으면 배출원·전구물질 검증이 저장을 막는다. */
export const MISSING_EVIDENCE_TEXT = '활동자료 서식 — 근거 자료 미기재';
export const ELECTRICITY_METER_GROUP = '한전 계량기';

const key = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** 빈 칸은 undefined, 숫자가 아니면 NaN. 쉼표와 단위 글자 없는 숫자만 받는다. */
function numberOf(value: string | undefined): number | undefined {
    const text = (value ?? '').replace(/,/g, '').trim();
    if (!text) return undefined;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** 날짜 → YYYY-MM-DD. 글자(2025-01-01, 2025.1.1, 2025/01/01)와 엑셀 날짜 일련번호를 받는다. */
export function parseWorkbookDate(value: string | undefined): string | undefined {
    const text = (value ?? '').trim();
    if (!text) return undefined;
    const match = text.match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?$/);
    if (match) {
        const [month, day] = [Number(match[2]), Number(match[3])];
        if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
        return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    const serial = Number(text);
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
        // 엑셀 날짜 일련번호: 1899-12-30이 0이다.
        return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000).toISOString().slice(0, 10);
    }
    return undefined;
}

const COUNTRY_CODE_ALIASES: Record<string, string> = {
    '한국': 'KR', '대한민국': 'KR', 'south korea': 'KR', 'korea': 'KR', 'republic of korea': 'KR',
    '중국': 'CN', 'china': 'CN', '일본': 'JP', 'japan': 'JP', '대만': 'TW', 'taiwan': 'TW', '베트남': 'VN', 'vietnam': 'VN',
    '인도': 'IN', 'india': 'IN', '미국': 'US', 'united states': 'US', 'usa': 'US',
};

/** 원료를 만든 나라 — 서식 목록은 EU 기본값표의 영문 이름이다. 한글로 적은 흔한 나라만 바꿔 준다. */
const COUNTRY_NAME_ALIASES: Record<string, string> = {
    '한국': 'South Korea', '대한민국': 'South Korea', 'korea': 'South Korea', 'kr': 'South Korea',
    '중국': 'China', 'cn': 'China', '일본': 'Japan', 'jp': 'Japan', '대만': 'Taiwan', 'tw': 'Taiwan', '베트남': 'Vietnam', 'vn': 'Vietnam',
    '인도': 'India', 'in': 'India', '인도네시아': 'Indonesia', 'id': 'Indonesia', '태국': 'Thailand', 'th': 'Thailand', '말레이시아': 'Malaysia', 'my': 'Malaysia',
    '튀르키예': 'Türkiye', '터키': 'Türkiye', 'turkey': 'Türkiye', 'tr': 'Türkiye', '미국': 'United States', 'us': 'United States', 'usa': 'United States',
    '러시아': 'Russia', 'ru': 'Russia', '우크라이나': 'Ukraine', 'ua': 'Ukraine', '브라질': 'Brazil', 'br': 'Brazil',
};

function resolveSupplierCountry(input: string, known: string[]): string {
    const wanted = key(input);
    return known.find((name) => key(name) === wanted) ?? COUNTRY_NAME_ALIASES[wanted] ?? input.trim();
}

const labelValue = <T extends string>(choices: ReadonlyArray<{ label: string; value: T }>, input: string | undefined): T | undefined => {
    const wanted = key(input);
    if (!wanted) return undefined;
    // 목록의 글자를 그대로 고른 경우와, 괄호 앞부분만 적은 경우(「있음」·「없음」)를 받는다.
    return choices.find((choice) => key(choice.label) === wanted || key(choice.label.split(' (')[0]) === wanted)?.value;
};

const yesNo = (input: string | undefined): 'YES' | 'NO' | undefined => {
    const wanted = key(input);
    if ([key(YES), 'y', 'yes', '네', 'o'].includes(wanted)) return 'YES';
    if ([key(NO), 'n', 'no', '아니요', 'x'].includes(wanted)) return 'NO';
    return undefined;
};

/** 한 칸에 ; 로 이어 적은 이름들 */
const namesOf = (value: string | undefined) => (value ?? '').split(LIST_SEPARATOR).map((item) => item.trim()).filter(Boolean);
/** 일부 제품만 거치는 설비의 연료로 보이는 이름 — 「공장 전체」로 적혀 있으면 되묻는다. */
const PARTIAL_ROUTE_FUEL = /열처리|가열로|소둔|침탄|단조|소입|템퍼|QT/i;
const headingOf = (cn: string | undefined) => (cn ?? '').replace(/\D/g, '').slice(0, 4);

const fmt = (value: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 }).format(value);

export async function importActivityWorkbook(
    data: ActivityWorkbookData,
    deps: { store: ActivityImportStore; defaultValues?: ImportedDefaultValueReference; reportInputs?: ActivityImportReportInputs },
): Promise<ActivityImportResult> {
    const { store } = deps;
    const issues: ActivityImportIssue[] = [];
    // 품번 목록이 있으면 제품·공정 줄로 합쳐 2_제품·3_공정의 줄과 함께 쓴다(품번 줄의 번호는 1000부터 — 끝에서 품번 목록의 줄로 되돌린다).
    const expansion = expandPartList(data.parts ?? []);
    const plan = { products: [...data.products, ...expansion.products], processes: [...data.processes, ...expansion.processes] };
    const created: ActivityImportResult['created'] = { installation: 0, period: 0, products: 0, processes: 0, fuels: 0, precursors: 0, transfers: 0 };
    const note = (level: ActivityImportIssue['level'], sheet: string, message: string, row?: number) => issues.push({ level, sheet, row, message });
    for (const message of data.notes) note('error', '파일', message);
    for (const problem of expansion.problems) note('error', SHEET_PARTS, problem.message, problem.row);
    if (expansion.summary) note('info', SHEET_PARTS, expansion.summary);
    for (const message of expansion.notes) note('info', SHEET_PARTS, message);

    const [installations, periods, products, existingProcesses, existingStreams, existingPrecursors] = await Promise.all([
        store.list('installations'), store.list('periods'), store.list('products'), store.list('processes'), store.list('source_streams'), store.list('precursors'),
    ]);
    if (existingProcesses.length > 0) {
        note('warning', '파일', `이 프로젝트에는 이미 공정이 ${existingProcesses.length}개 있습니다. 같은 이름의 제품·공정은 건너뛰고 새 것만 더했습니다 — 한 업체의 자료를 처음 넣을 때는 「새 프로젝트」에서 올리세요.`);
    }

    // ── 1) 사업장 ────────────────────────────────────────────────────
    const form = data.installation;
    const text = (name: string) => (form[name] ?? '').trim();
    let installation = installations[0];
    if (installation) {
        note('info', SHEET_INSTALLATION, `사업장 「${installation.name}」이(가) 이미 있어 서식의 사업장 정보로 바꾸지 않았습니다.`);
    } else {
        const rawCountry = text('country');
        const draft = { name: text('name'), country: COUNTRY_CODE_ALIASES[key(rawCountry)] ?? rawCountry };
        const error = validateInstallationDraft(draft);
        if (error) {
            note('error', SHEET_INSTALLATION, `사업장을 만들지 못했습니다: ${error}`);
        } else {
            const optional = (name: string) => text(name) || undefined;
            installation = await store.create('installations', {
                ...buildInstallationPayload(draft),
                local_name: optional('local_name'),
                street: optional('street'),
                city: optional('city'),
                postcode: optional('postcode'),
                unlocode: optional('unlocode')?.toUpperCase(),
                latitude: optional('latitude'),
                longitude: optional('longitude'),
                economic_activity: optional('economic_activity'),
                operator_name: optional('operator_name'),
                operator_reg_number: optional('operator_reg_number'),
                operator_address: optional('operator_address'),
                cbam_registry_id: optional('cbam_registry_id'),
                authorized_representative_name: optional('authorized_representative_name'),
                email: optional('email'),
                telephone: optional('telephone'),
                waste_gases: yesNo(text('waste_gases')),
                waste_gases_note: optional('waste_gases_note'),
            });
            created.installation += 1;
            const missing = [['operator_name', '운영자(법인)명'], ['operator_reg_number', '법인/사업자 등록번호'], ['operator_address', '운영자 주소']]
                .filter(([name]) => !text(name)).map(([, label]) => label);
            if (missing.length > 0) {
                note('warning', SHEET_INSTALLATION, `비어 있습니다: ${missing.join(' · ')} — 검증인이 반드시 확인하는 항목입니다. 받아서 채워 주세요.`);
            }
            if (!text('unlocode') && !(text('latitude') && text('longitude'))) {
                note('warning', SHEET_INSTALLATION, 'UN/LOCODE와 위도·경도가 모두 비어 있습니다. 둘 중 하나는 EU 문서에 필요합니다.');
            }
            if (text('waste_gases') && !yesNo(text('waste_gases'))) {
                note('warning', SHEET_INSTALLATION, `폐가스 칸의 「${text('waste_gases')}」을(를) 읽지 못했습니다. 「${YES}」 또는 「${NO}」로 적어 주세요.`);
            }
        }
    }

    // ── 2) 보고기간 ──────────────────────────────────────────────────
    let periodId: string | undefined;
    {
        const start = parseWorkbookDate(text('period_start'));
        const end = parseWorkbookDate(text('period_end'));
        if (!start || !end) {
            const bad = [!start && `시작일 「${text('period_start') || '빈 칸'}」`, !end && `종료일 「${text('period_end') || '빈 칸'}」`].filter(Boolean).join(' · ');
            if (periods.length === 1) {
                periodId = periods[0].id;
                note('warning', SHEET_INSTALLATION, `보고기간 ${bad}을(를) 읽지 못해, 이미 있는 보고기간 「${periods[0].name}」에 넣었습니다. 날짜는 2025-01-01처럼 적어 주세요.`);
            } else {
                note('error', SHEET_INSTALLATION, `보고기간 ${bad}을(를) 읽지 못했습니다. 2025-01-01처럼 적어 주세요 — 보고기간이 없으면 공정·연료·구매 강재를 넣을 수 없습니다.`);
            }
        } else {
            const same = periods.find((period) => period.start_date === start && period.end_date === end);
            if (same) {
                periodId = same.id;
            } else {
                const wholeYear = start.endsWith('-01-01') && end.endsWith('-12-31') && start.slice(0, 4) === end.slice(0, 4);
                const draft = { name: text('period_name') || (wholeYear ? `${start.slice(0, 4)}년 연간` : `${start} ~ ${end}`), startDate: start, endDate: end };
                const error = validatePeriodDraft(draft);
                if (error) {
                    note('error', SHEET_INSTALLATION, `보고기간을 만들지 못했습니다: ${error}`);
                } else {
                    periodId = (await store.create('periods', { ...buildPeriodPayload(draft), status: 'DRAFT' as const })).id;
                    created.period += 1;
                }
            }
        }
    }

    // ── 3) 제품 ──────────────────────────────────────────────────────
    const productByName = new Map<string, Product>(products.map((product) => [key(product.name), product]));
    /** 보고서 입력으로 갈 것들 — 끝에서 한 번에 저장한다 */
    const sectorRows: NonNullable<ReportInputs['sector_parameters']> = [];
    const transpositionRows: ReportTranspositionRow[] = [];
    for (const row of plan.products) {
        const name = (row.values.name ?? '').trim();
        if (productByName.has(key(name))) {
            note('info', SHEET_PRODUCTS, `제품 「${name}」은(는) 이미 있어 건너뛰었습니다.`, row.row);
            continue;
        }
        const draft = { name, cnDigits: (row.values.cn ?? '').replace(/\D/g, '') };
        const error = validateProductDraft(draft);
        if (error) {
            note('error', SHEET_PRODUCTS, `${name || '(이름 없음)'}: ${error}`, row.row);
            continue;
        }
        const exported = row.values.exported ? yesNo(row.values.exported) : 'YES';
        if (!exported) note('warning', SHEET_PRODUCTS, `${name}: 「EU로 수출하나요?」의 「${row.values.exported}」을(를) 읽지 못해 「${YES}」로 넣었습니다.`, row.row);
        // 「아니오」 = 신고 대상은 아니지만 같은 설비의 연료·전력을 나눠 갖는 제품(지도 2단계의 보고범위와 같은 값).
        const product = await store.create('products', { ...buildProductPayload(draft, installation?.id), reporting_scope: exported === 'NO' ? 'NON_CBAM_COPRODUCT' as const : 'CBAM_GOOD' as const });
        productByName.set(key(name), product);
        created.products += 1;
        // 부문특정 파라미터(2025/2547 부속서 IV 2): 이 제품의 품목군이 요구하는 것만 받는다. 값은 적힌 그대로 — 앱이 추정하지 않는다.
        const applicability = getIndirectEmissionsApplicability(product);
        const required = getSectorParameters(applicability.good ?? ((applicability.goods?.length ?? 0) === 1 ? applicability.goods?.[0] : undefined));
        for (const parameter of required) {
            const value = (row.values[parameter.key] ?? '').trim();
            if (value) sectorRows.push({ product_id: product.id, param_key: parameter.key, value });
        }
        const missingParameters = required.filter((parameter) => !(row.values[parameter.key] ?? '').trim());
        if (exported !== 'NO' && missingParameters.length > 0) {
            note('warning', SHEET_PRODUCTS, `${name}: 부문특정 파라미터가 비어 있습니다 — ${missingParameters.map((parameter) => parameter.label.split(' (')[0]).join(' · ')}. EU로 수출하는 철강 제품의 법정 기재 항목이라 산정보고서에 「기재 필요」로 남습니다.`, row.row);
        }
    }

    // ── 4) 공정과 생산라인 — 같은 공정 이름의 줄을 한 공정으로 묶는다 ──
    const processByName = new Map<string, ProductionProcess>(existingProcesses.map((process) => [key(process.name), process]));
    /** 이번에 만든 공정(최신 상태). 전력·연료는 이 공정들에만 넣는다. */
    const fresh = new Map<string, ProductionProcess>();
    const saveProcess = async (next: ProductionProcess) => {
        const saved = await store.update('processes', next);
        fresh.set(saved.id, saved);
        processByName.set(key(saved.name), saved);
        return saved;
    };
    const meteredMwh = new Map<string, number>();
    /** 공정별 전력 계량기 정보(이름·그 계량기의 합계·나누는 기준·추정 근거) */
    const meterOf = new Map<string, { name: string; total?: number; basis?: 'OUTPUT_MASS' | 'SUB_METER' | 'ESTIMATE'; note: string }>();
    /** 이번에 만든 공정의 제품 라인(활동수준 제외 라인은 빼고) */
    const goodLines = new Map<string, ProductOutputLine[]>();
    /** 공정에 든 제품 수 — 같은 CN의 수출분·비수출분은 한 제품이다(기능단위는 CN별 톤, 2025/2547 제4조 2항). 섞임 경고는 이 수로 본다. */
    const distinctGoods = (lines: ProductOutputLine[] | undefined) => {
        const cnById = new Map(Array.from(productByName.values()).map((product) => [product.id, (product.cn_code ?? '').replace(/\D/g, '')]));
        return new Set((lines ?? []).map((line) => cnById.get(line.product_id ?? '') || line.product_id || line.name)).size;
    };
    const groups = new Map<string, ActivityRow[]>();
    for (const row of plan.processes) {
        const name = key(row.values.name);
        if (!name) {
            note('error', SHEET_PROCESSES, '공정 이름이 비어 있어 이 줄을 넣지 못했습니다.', row.row);
            continue;
        }
        groups.set(name, [...(groups.get(name) ?? []), row]);
    }
    for (const rows of groups.values()) {
        const name = rows[0].values.name.trim();
        if (processByName.has(key(name))) {
            note('info', SHEET_PROCESSES, `공정 「${name}」은(는) 이미 있어 건너뛰었습니다(전력·연료·구매 강재도 그 공정에는 새로 넣지 않습니다).`, rows[0].row);
            continue;
        }
        const lines: Array<{ product: Product; mass: number; pct?: number; reason: string; evidence: string }> = [];
        let scrap = 0;
        let broken = false;
        for (const row of rows) {
            const product = productByName.get(key(row.values.product));
            const mass = numberOf(row.values.mass);
            const rowScrap = numberOf(row.values.scrap) ?? 0;
            if (!product) {
                note('error', SHEET_PROCESSES, `${name}: 만드는 제품 「${row.values.product ?? '빈 칸'}」을(를) ${SHEET_PRODUCTS} 시트에서 찾지 못했습니다. 이름을 똑같이 적어 주세요.`, row.row);
                broken = true;
            } else if (!(mass !== undefined && mass > 0)) {
                note('error', SHEET_PROCESSES, `${name}: 생산량 「${row.values.mass ?? '빈 칸'}」을(를) 0보다 큰 숫자로 적어 주세요.`, row.row);
                broken = true;
            } else if (Number.isNaN(rowScrap) || rowScrap < 0) {
                note('error', SHEET_PROCESSES, `${name}: 불량·스크랩 「${row.values.scrap}」을(를) 0 이상의 숫자로 적어 주세요.`, row.row);
                broken = true;
            } else {
                lines.push({ product, mass, pct: numberOf(row.values.manualPct), reason: (row.values.manualReason ?? '').trim(), evidence: (row.values.manualEvidence ?? '').trim() });
                scrap += rowScrap;
            }
        }
        if (broken || lines.length === 0) {
            note('error', SHEET_PROCESSES, `공정 「${name}」을(를) 만들지 못했습니다 — 위 줄을 고쳐 다시 올려 주세요. 이 공정의 연료·구매 강재도 들어가지 않습니다.`, rows[0].row);
            continue;
        }
        // 사용자 지정 배분(부속서 III A.2의 예외): 한 줄이라도 적었으면 모든 줄이 적혀 있고 합이 100이어야 한다 — 아니면 조용히 생산량 비율로 두지 않고 막는다.
        const manual = lines.some((line) => line.pct !== undefined);
        if (manual) {
            const bad = lines.filter((line) => line.pct === undefined || Number.isNaN(line.pct) || line.pct < 0);
            const sum = lines.reduce((total, line) => total + (line.pct ?? 0), 0);
            if (bad.length > 0) {
                note('error', SHEET_PROCESSES, `공정 「${name}」: 제품 배분 %를 직접 적으려면 이 공정의 모든 제품 줄에 0 이상의 숫자로 적어야 합니다(${bad.map((line) => `「${line.product.name}」`).join(', ')}이(가) 비었거나 숫자가 아닙니다). 공정을 만들지 못했습니다.`, rows[0].row);
                continue;
            }
            if (Math.abs(sum - 100) > 0.01) {
                note('error', SHEET_PROCESSES, `공정 「${name}」: 제품 배분 %의 합이 ${Math.round(sum * 1e4) / 1e4}입니다. 100이어야 합니다. 공정을 만들지 못했습니다.`, rows[0].row);
                continue;
            }
            if (lines.some((line) => !line.reason || !line.evidence)) {
                note('warning', SHEET_PROCESSES, `공정 「${name}」: 제품 배분을 직접 지정했는데 사유나 증빙이 비어 있습니다. 규정은 물리적 관계로 설명되는 사유와 증빙이 있을 때만 이 방법을 인정합니다(부속서 III A.2) — 산정보고서에 「확인 필요」로 남습니다.`, rows[0].row);
            }
        }
        const draftOf = (product: Product, massT: number, excludedMassT: number): ProcessAnswerDraft => ({
            name, route: rows.map((row) => (row.values.route ?? '').trim()).find(Boolean) ?? '', periodId, product, massT, excludedMassT,
        });
        const draft = draftOf(lines[0].product, lines.reduce((sum, line) => sum + line.mass, 0), scrap);
        const error = validateProcessAnswer(draft);
        if (error) {
            note('error', SHEET_PROCESSES, `공정 「${name}」을(를) 만들지 못했습니다: ${error}`, rows[0].row);
            continue;
        }
        // 지도 3단계·질문 화면과 같은 순서: 공정 → 제품 라인(제품마다) → 활동수준 제외 라인.
        const creation = buildProcessCreation(draft);
        const process = await store.create('processes', creation.process);
        for (const line of lines) {
            // 서식의 「제품」 줄은 합격품이다 — EU로 안 나가는 제품의 라인도 활동수준에 들어간다고 적어 둔다(불량·스크랩은 옆 칸으로 따로 받는다).
            // 적어 두지 않으면 엔진이 「이 라인이 스크랩은 아닌지」 확인을 요구한다.
            const role = line.product.reporting_scope === 'NON_CBAM_COPRODUCT' ? { activity_level_role: 'GOOD' as const } : {};
            const manualFields = manual ? { allocation_basis: 'MANUAL' as const, manual_allocation_percent: line.pct ?? 0, manual_allocation_reason: line.reason || undefined, manual_allocation_evidence: line.evidence || undefined } : {};
            const saved = await store.create('product_output_lines', { process_id: process.id, ...buildProcessCreation(draftOf(line.product, line.mass, 0)).productLine, ...role, ...manualFields });
            goodLines.set(process.id, [...(goodLines.get(process.id) ?? []), saved]);
        }
        if (creation.excludedLine) await store.create('product_output_lines', { process_id: process.id, ...creation.excludedLine });
        fresh.set(process.id, process);
        processByName.set(key(name), process);
        created.processes += 1;

        const metered = rows.map((row) => numberOf(row.values.electricity)).find((value) => value !== undefined);
        if (metered !== undefined) {
            if (metered > 0) meteredMwh.set(process.id, metered);
            else note('error', SHEET_PROCESSES, `${name}: 공정의 전력 「${rows.map((row) => row.values.electricity).find(Boolean)}」을(를) 0보다 큰 숫자로 적어 주세요.`, rows[0].row);
        }
    }
    // 「SCM435 공정」을 「SCM435」로만 적어도 알아듣는다 — 품번 목록으로 채우면 공정 이름을 앱이 「<재질> 공정」으로 짓는데
    // 채우는 사람은 그 이름을 모르고 재질만 안다(run35: 구매 강재 7줄이 통째로 빠졌다). 줄인 이름이 둘 이상의 공정과 겹치면 받지 않는다.
    const aliasOwners = new Map<string, ProductionProcess[]>();
    for (const process of fresh.values()) {
        const short = process.name.replace(/\s*공정$/, '').trim();
        if (short && short !== process.name) aliasOwners.set(key(short), [...(aliasOwners.get(key(short)) ?? []), process]);
    }
    for (const [alias, owners] of aliasOwners) if (owners.length === 1 && !processByName.has(alias)) processByName.set(alias, owners[0]);
    // 품번 목록의 재질 이름(적힌 모양 그대로)도 그 재질이 들어간 공정을 가리킨다 — 공정이 여러 재질을 묶은 것이어도(「SCM435·SWCH35K 공정」).
    for (const [grade, processName] of expansion.aliases) {
        const owner = processByName.get(key(processName));
        if (owner && fresh.has(owner.id) && !processByName.has(key(grade))) processByName.set(key(grade), owner);
    }
    /** 공정을 못 찾았을 때 덧붙이는 말 — 이번 파일로 만든 공정 이름을 그대로 보여 준다. */
    const processHint = () => {
        const names = [...fresh.values()].map((process) => `「${process.name}」`);
        return names.length > 0 ? ` 이 파일의 공정: ${names.join(', ')}.` : ' 이 파일로 만든 공정이 없습니다 — 3_공정이나 2b_품번목록을 먼저 확인하세요.';
    };
    const freshList = () => Array.from(fresh.values());
    // 전력 계량기 이름·합계·기준은 그 공정의 줄들 중 처음 적힌 것을 쓴다.
    for (const rows of groups.values()) {
        const process = processByName.get(key(rows[0].values.name));
        if (!process || !fresh.has(process.id)) continue;
        const firstOf = (field: string) => rows.map((row) => (row.values[field] ?? '').trim()).find(Boolean) ?? '';
        const basisValue = labelValue(SPLIT_BASIS_CHOICES, firstOf('elecBasis'));
        meterOf.set(process.id, { name: firstOf('meter'), total: numberOf(firstOf('meterTotal')), basis: basisValue, note: firstOf('elecNote') });
    }

    // ── 5) 밖에서 산 스팀·온수 ───────────────────────────────────────
    const heatAnswer = yesNo(text('imported_heat'));
    const importedRows = data.importedHeat ?? [];
    if (heatAnswer === 'NO') {
        for (const process of freshList()) {
            const draft = noImportedHeatDraft(process);
            if (!validateImportedHeatDraft(draft)) await saveProcess(buildImportedHeatUpdate(process, draft));
        }
        if (importedRows.length > 0) note('warning', SHEET_IMPORTED_HEAT, '1_사업장에서 사 온 열이 「아니오」인데 이 시트에 적힌 줄이 있습니다. 쓰지 않았습니다 — 사 오는 열이 있으면 1_사업장을 「예」로 바꿔 다시 올려 주세요.');
    } else if (heatAnswer === 'YES' && fresh.size > 0) {
        const withHeat = new Set<string>();
        for (const row of importedRows) {
            const tell = (message: string) => note('error', SHEET_IMPORTED_HEAT, message, row.row);
            const found = processByName.get(key(row.values.process));
            if (!found || !fresh.has(found.id)) { tell(`열을 쓴 공정 「${row.values.process ?? '빈 칸'}」을(를) ${SHEET_PROCESSES} 시트에서 찾지 못했습니다.`); continue; }
            const efBasis = labelValue(IMPORTED_HEAT_EF_CHOICES, row.values.efBasis);
            const fuelKey = HEAT_STANDARD_FUELS.find((fuel) => key(fuel.label) === key(row.values.fuel))?.key ?? '';
            const draft: ImportedHeatDraft = {
                answer: 'YES',
                amount: numberOf(row.values.quantity) ?? 0,
                unit: labelValue(HEAT_UNIT_CHOICES, row.values.unit) ?? 'Gcal',
                basis: efBasis ?? '',
                supplierEf: numberOf(row.values.supplierEf) ?? 0,
                fuel: fuelKey,
                source: (row.values.source ?? '').trim(),
            };
            const error = validateImportedHeatDraft(draft);
            if (error) { tell(`${found.name}: ${error}`); continue; }
            await saveProcess(buildImportedHeatUpdate(fresh.get(found.id) ?? found, draft));
            withHeat.add(found.id);
        }
        if (importedRows.length === 0) {
            note('warning', SHEET_INSTALLATION, `밖에서 사 오는 스팀·온수가 있다고 적혀 있는데 ${SHEET_IMPORTED_HEAT} 시트가 비어 있습니다. 열을 쓴 공정과 양·계수를 적어 주세요 — 안 적으면 그 열의 배출이 빠집니다.`);
        } else {
            const bare = freshList().filter((process) => !withHeat.has(process.id));
            if (bare.length > 0) note('info', SHEET_IMPORTED_HEAT, `사 온 열을 적지 않은 공정: ${bare.map((process) => `「${process.name}」`).join(', ')}. 열을 쓰지 않는 공정이면 그대로 두세요 — 지도 4단계가 이 공정에는 다시 묻습니다.`);
        }
    } else if (fresh.size > 0) {
        note('info', SHEET_INSTALLATION, '「밖에서 사 오는 스팀·온수가 있나요?」가 비어 있습니다. 없으면 「아니오」로 적어 주세요 — 비워 두면 앱이 다시 묻습니다.');
    }

    // ── 6) 전력 ──────────────────────────────────────────────────────
    if (fresh.size > 0) {
        const plantTotal = numberOf(text('electricity_total_mwh'));
        // 단위 실수(kWh를 MWh 칸에) — 생산량 1 t당 전력이 상식 밖이면 알린다. 값은 그대로 넣고, 엔진도 같은 기준으로 경고를 남긴다.
        const plantOutput = freshList().reduce((sum, process) => sum + process.output_mass_t, 0);
        if (plantTotal !== undefined && plantOutput > 0 && isImplausibleElectricityIntensity(plantTotal, plantOutput)) {
            note('warning', SHEET_INSTALLATION, `공장 전체 전력 ${fmt(plantTotal)} MWh는 생산량 1 t당 ${fmt(plantTotal / plantOutput)} MWh입니다 — 철강 가공 공장으로는 지나치게 큽니다. 고지서의 kWh를 그대로 적지 않았나요? MWh는 kWh ÷ 1,000입니다(${fmt(plantTotal / 1000)} MWh). 고쳐서 다시 올리거나 지도 5단계에서 바꾸세요.`);
        }
        for (const [processId, mwh] of meteredMwh) {
            const process = fresh.get(processId);
            if (process && process.output_mass_t > 0 && isImplausibleElectricityIntensity(mwh, process.output_mass_t)) {
                note('warning', SHEET_PROCESSES, `${process.name}: 공정의 전력 ${fmt(mwh)} MWh는 생산량 1 t당 ${fmt(mwh / process.output_mass_t)} MWh입니다 — 지나치게 큽니다. kWh를 그대로 적지 않았나요? MWh는 kWh ÷ 1,000입니다.`);
            }
        }
        const factor = numberOf(text('electricity_ef'));
        const source = labelValue(ELECTRICITY_SOURCE_CHOICES, text('electricity_ef_source'));
        const factorOk = factor !== undefined && factor > 0;
        if (text('electricity_ef') && !factorOk) note('error', SHEET_INSTALLATION, `전력 배출계수 「${text('electricity_ef')}」을(를) 0보다 큰 숫자로 적어 주세요.`);
        if (text('electricity_ef_source') && !source) note('warning', SHEET_INSTALLATION, `전력 배출계수 출처 「${text('electricity_ef_source')}」을(를) 목록에서 찾지 못했습니다. 목록에서 골라 주세요.`);
        /** 사용량을 넣은 공정에 계수·출처를 붙인다(지도 5단계와 같은 빌더). 계수가 없으면 임시 자리값을 출처 없이 둔다. */
        const applyFactor = async (process: ProductionProcess, mwh: number) => {
            const draft = { mwh, ef: factorOk ? factor : PROCESS_PLACEHOLDER_EF, efSource: factorOk ? source ?? '' : '', allocationNote: process.electricity_allocation_note ?? '' };
            if (!validateElectricityDraft(draft)) await saveProcess(buildElectricityUpdate(process, draft));
        };
        /** 계량기 하나(= 고지서 하나)에 속한 공정들의 전력을 정한다. 반환: 넣었는가. */
        const runMeter = async (procs: ProductionProcess[], total: number | undefined, groupName: string, chosen: 'OUTPUT_MASS' | 'SUB_METER' | 'ESTIMATE' | undefined, noteText: string, sheet: string, label: string): Promise<boolean> => {
            if (procs.length === 0) return false;
            const metered = procs.filter((process) => meteredMwh.has(process.id));
            if (total !== undefined && !(total > 0)) {
                note('error', sheet, `${label}의 전력 사용량 「${total}」을(를) 0보다 큰 숫자로 적어 주세요.`);
                return false;
            }
            if (total !== undefined && procs.length === 1) {
                await applyFactor(procs[0], total);
                return true;
            }
            if (total !== undefined && chosen === undefined && metered.length > 0 && metered.length < procs.length) {
                note('error', SHEET_PROCESSES, `전력을 넣지 못했습니다: ${label}의 전력(${fmt(total)} MWh)이 있는데 공정별 전력은 ${metered.length}/${procs.length}개 공정에만 적혀 있습니다. 모든 공정에 적거나 모두 비워 주세요(비우면 생산량 비율로 나눕니다).`);
                return false;
            }
            if (total !== undefined) {
                // 공정별 값이 없으면 생산량 비율로, 모두 있으면 그 값을 고지서 합계에 맞춘다 — 지도 5단계 「전력 나누기」와 같은 계산·같은 기록.
                const bySubMeter = chosen ? chosen !== 'OUTPUT_MASS' : metered.length === procs.length;
                if (bySubMeter && metered.length < procs.length) {
                    note('error', SHEET_PROCESSES, `전력을 넣지 못했습니다: ${label}을(를) ${chosen === 'ESTIMATE' ? '추정' : '계량기 값'}으로 나누려면 모든 공정의 「이 공정의 전력」(${chosen === 'ESTIMATE' ? '추정 사용량' : '계량값'})을 적어야 합니다.`);
                    return false;
                }
                const basis: ElectricitySplitBasis = chosen === 'ESTIMATE' ? 'INDIRECT_ESTIMATE' : bySubMeter ? 'SUB_METER' : 'OUTPUT_MASS';
                const draft: ElectricitySplitDraft = {
                    group: groupName,
                    totalMwh: total,
                    basis,
                    rows: procs.map((process) => ({ processId: process.id, processName: process.name, value: basis === 'OUTPUT_MASS' ? process.output_mass_t : meteredMwh.get(process.id) ?? 0 })),
                    note: noteText,
                };
                const error = validateElectricitySplitDraft(draft);
                if (error) {
                    note('error', sheet, `전력을 나누지 못했습니다(${label}): ${error}`);
                    return false;
                }
                const splitPlan = computeElectricitySplit(draft);
                if (splitPlan.caution) note('warning', SHEET_PROCESSES, splitPlan.caution);
                for (const updated of buildElectricitySplitUpdates(procs, splitPlan)) await applyFactor(await saveProcess(updated), updated.electricity_mwh);
                return true;
            }
            if (metered.length > 0) {
                for (const process of metered) await applyFactor(process, meteredMwh.get(process.id) ?? 0);
                const without = procs.filter((process) => !meteredMwh.has(process.id));
                if (without.length > 0) note('warning', SHEET_PROCESSES, `전력이 비어 있는 공정: ${without.map((process) => `「${process.name}」`).join(', ')}. 전기를 쓰지 않는 공정이 아니라면 적어 주세요.`);
                return true;
            }
            return false;
        };
        const everyone = freshList();
        const plantProcesses = everyone.filter((process) => !meterOf.get(process.id)?.name);
        const namedMeters = new Map<string, ProductionProcess[]>();
        for (const process of everyone) {
            const name = meterOf.get(process.id)?.name;
            if (name) namedMeters.set(name, [...(namedMeters.get(name) ?? []), process]);
        }
        let applied = false;
        const plantInfo = plantProcesses.map((process) => meterOf.get(process.id)).find((item) => item?.basis || item?.note);
        if (plantProcesses.length > 0) {
            const ok = await runMeter(plantProcesses, plantTotal, ELECTRICITY_METER_GROUP, plantInfo?.basis, plantInfo?.note ?? '', SHEET_INSTALLATION, '공장 전체 전력');
            applied = applied || ok;
            if (!ok && plantTotal === undefined && plantProcesses.every((process) => !meteredMwh.has(process.id)) && namedMeters.size === 0) {
                note('warning', SHEET_INSTALLATION, '전력 사용량이 없습니다. 한전 고지서 12개월 합계(kWh ÷ 1,000)를 「공장 전체 전력 사용량」에 적어 주세요.');
            }
        }
        for (const [meterName, procs] of namedMeters) {
            const info = procs.map((process) => meterOf.get(process.id)).find((item) => item?.total !== undefined || item?.basis || item?.note);
            const total = procs.map((process) => meterOf.get(process.id)?.total).find((value) => value !== undefined);
            const ok = await runMeter(procs, total, meterName, info?.basis, info?.note ?? '', SHEET_PROCESSES, `전력 계량기 「${meterName}」`);
            if (!ok && total === undefined && procs.every((process) => !meteredMwh.has(process.id))) {
                note('warning', SHEET_PROCESSES, `전력 계량기 「${meterName}」의 전력이 없습니다. 「그 계량기의 전력 (MWh)」을 적어 주세요.`);
            }
            applied = applied || ok;
        }
        if (applied && !factorOk) {
            note('warning', SHEET_INSTALLATION, `전력 배출계수가 비어 있어 임시값 ${PROCESS_PLACEHOLDER_EF}을(를) 출처 없이 넣었습니다. 계수와 출처를 확인해 지도 5단계에서 바꾸세요.`);
        } else if (applied && !source) {
            note('warning', SHEET_INSTALLATION, '전력 배출계수의 출처가 비어 있습니다. 목록에서 골라 주세요(지도 5단계에서도 고를 수 있습니다).');
        }
    }

    // ── 7) 연료 ──────────────────────────────────────────────────────
    let streams: SourceStream[] = [...existingStreams];
    const touched = new Set<string>();
    // 같은 연료 이름으로 공정마다 한 줄씩 적은 「공정별 계량기 값」·「추정」 줄은 한 항목으로 묶는다(양 칸 = 그 공정의 값, 공장 전체는 「공장 전체 사용량」).
    type FuelItem = ActivityRow & { perProcess?: Array<{ where: string; value: number | undefined }>; splitBasis?: 'OUTPUT_MASS' | 'SUB_METER' | 'ESTIMATE' };
    const fuelItems: FuelItem[] = [];
    {
        const groupedAt = new Map<string, number>();
        for (const row of data.fuels) {
            const nameKey = key(row.values.name);
            const basisValue = labelValue(SPLIT_BASIS_CHOICES, row.values.basis);
            const wheres = namesOf(row.values.where);
            const singleProcess = wheres.length === 1 && ![key(SHARED_PROCESS_LABEL), '공용', '공장 전체'].includes(key(wheres[0]));
            if (basisValue && basisValue !== 'OUTPUT_MASS' && singleProcess && nameKey) {
                const at = groupedAt.get(nameKey);
                const entry = { where: wheres[0], value: numberOf(row.values.amount) };
                if (at === undefined) {
                    groupedAt.set(nameKey, fuelItems.length);
                    fuelItems.push({ row: row.row, values: { ...row.values, amount: row.values.total ?? '', where: wheres[0] }, perProcess: [entry], splitBasis: basisValue });
                } else {
                    const item = fuelItems[at];
                    item.perProcess = [...(item.perProcess ?? []), entry];
                    item.values = { ...item.values, where: `${item.values.where}${LIST_SEPARATOR} ${wheres[0]}`, amount: item.values.amount || (row.values.total ?? '') };
                }
                continue;
            }
            fuelItems.push({ ...row, splitBasis: basisValue });
        }
    }
    /** 용도가 보일러·스팀인 연료 — 열을 받는 공정이 정해진 뒤(9_보일러열)에 한꺼번에 만든다 */
    const heatFuels: Array<{ system: string; draft: Omit<SourceStream, keyof LocalEntity>; row: number; name: string }> = [];
    const meterGroups = existingStreams.map((stream) => stream.shared_meter?.group?.trim()).filter((group): group is string => Boolean(group));
    for (const row of fuelItems) {
        const name = (row.values.name ?? '').trim();
        const tell = (level: ActivityImportIssue['level'], message: string) => note(level, SHEET_FUELS, `${name || '(이름 없음)'}: ${message}`, row.row);
        const choice = FUEL_KIND_CHOICES.find((item) => key(item.label) === key(row.values.kind) || key(item.label.split(' (')[0]) === key(row.values.kind));
        const kind = GUIDED_STREAM_KINDS.find((item) => item.key === choice?.key);
        const amount = numberOf(row.values.amount);
        const ncv = numberOf(row.values.ncv);
        const factor = numberOf(row.values.factor);
        if (!name) { tell('error', '연료 이름이 비어 있어 넣지 못했습니다.'); continue; }
        if (!kind || !choice) { tell('error', `연료 종류 「${row.values.kind ?? '빈 칸'}」을(를) 목록에서 찾지 못했습니다. 목록에서 골라 주세요.`); continue; }
        if (!(amount !== undefined && amount > 0)) { tell('error', `연간 사용량 「${row.values.amount ?? '빈 칸'}」을(를) 0보다 큰 숫자로 적어 주세요(단위 글자 없이).`); continue; }
        if (Number.isNaN(ncv) || Number.isNaN(factor)) { tell('error', '순발열량·배출계수는 숫자로 적거나 비워 주세요.'); continue; }
        const own = ncv !== undefined || factor !== undefined;
        const factorSource = labelValue(FUEL_FACTOR_SOURCE_CHOICES, row.values.factorSource);
        const isHeat = labelValue(FUEL_USE_CHOICES, row.values.use) === 'HEAT_SYSTEM';
        if (own && !factorSource) { tell('error', '순발열량·배출계수를 직접 적었으면 「계수 출처」도 목록에서 골라 주세요. 기본값을 쓰려면 두 칸을 비우세요.'); continue; }
        const where = (row.values.where ?? '').trim();
        const whereNames = namesOf(where);
        const shared = !isHeat && whereNames.some((item) => key(item) === key(SHARED_PROCESS_LABEL) || key(item) === '공용' || key(item) === '공장 전체');
        // 공정 이름을 ; 로 여럿 적으면 그 공정들끼리만 나눈다(열처리로처럼 일부 제품만 거치는 설비).
        const several = !isHeat && !shared && whereNames.length >= 2;
        if (several) {
            const unknown = whereNames.filter((item) => { const found = processByName.get(key(item)); return !found || !fresh.has(found.id); });
            if (unknown.length > 0) { tell('error', `쓰는 공정 ${unknown.map((item) => `「${item}」`).join(', ')}을(를) 찾지 못했습니다. 이름을 똑같이 적고 ${LIST_SEPARATOR} 로 구분해 주세요.${processHint()}`); continue; }
        }
        const process = shared || several || isHeat ? undefined : processByName.get(key(where));
        if (!shared && !where && !isHeat) { tell('error', `「쓰는 공정」이 비어 있습니다. 공정 이름을 적거나, 여러 공정이 같이 쓰면 「${SHARED_PROCESS_LABEL}」을 골라 주세요.`); continue; }
        if (!shared && !several && !isHeat && (!process || !fresh.has(process.id))) {
            tell('error', process ? `「${where}」은(는) 이미 있던 공정이라 연료를 새로 넣지 않았습니다.` : `쓰는 공정 「${where}」을(를) 찾지 못했습니다(그 공정이 위에서 만들어지지 못했을 수도 있습니다).${processHint()}`);
            continue;
        }
        const biomass = numberOf(row.values.biomass);
        const oxidation = numberOf(row.values.oxidation);
        if (biomass !== undefined && !(biomass >= 0 && biomass <= 100)) { tell('error', `바이오매스 비율 「${row.values.biomass}」을(를) 0~100 사이 숫자(%)로 적어 주세요.`); continue; }
        if (oxidation !== undefined && !(oxidation > 0 && oxidation <= 1)) { tell('error', `산화계수 「${row.values.oxidation}」을(를) 0보다 크고 1 이하인 숫자로 적어 주세요(예: 0.995).`); continue; }
        /** 연료 유형 기본값 위에 얹는 값 — 비운 칸은 건드리지 않는다 */
        const fractions = {
            ...(biomass !== undefined ? { biomass_fraction: biomass / 100, fossil_fraction: Math.round((1 - biomass / 100) * 1e6) / 1e6 } : {}),
            ...(oxidation !== undefined ? { oxidation_factor: oxidation } : {}),
        };
        const evidence = (row.values.evidence ?? '').trim();
        if (!evidence) tell('warning', '근거 자료가 비어 있습니다. 어느 고지서·전표의 숫자인지 적어 주세요.');
        if (looksLikeExcludedStepFuel(name)) {
            tell('warning', `이름으로 보아 도금·절단·용접·마무리 설비의 연료일 수 있습니다. 이 공정들의 배출은 철강 제품의 직접배출에 넣지 않습니다(${STEEL_BOUNDARY_ANCHOR}) — 그 설비 전용 연료라면 이 줄을 지우고 다시 올리세요(넣은 채로 두면 배출량이 실제보다 크게 나옵니다). 용융아연도금·코팅·열처리·단조·소둔의 연료는 넣는 것이 맞습니다.`);
        }
        if (!own && kind.key === 'fuel-mass') tell('warning', `순발열량·배출계수가 비어 「유류·기타」의 임시값(${kind.defaults.ncv_gj_per_unit} GJ/t · ${kind.defaults.emission_factor_tco2e_per_unit})이 들어갔습니다. 유종에 맞는 값을 적어 주세요(LPG 47.3 · 63.1 등).`);
        if (ncv === undefined && kind.key === 'fuel-gas') tell('info', `도시가스 순발열량은 기본 자리값 ${kind.defaults.ncv_gj_per_unit} GJ/Nm³로 넣었습니다. 도시가스사에 순발열량을 확인하면 더 정확합니다(고지서의 MJ는 총발열량이라 그대로 쓰면 안 됩니다).`);
        const ncvValue = ncv ?? kind.defaults.ncv_gj_per_unit;
        const factorValue = factor ?? kind.defaults.emission_factor_tco2e_per_unit;
        const sourceType = own && factorSource ? factorSource : kind.defaults.factor_source_type;
        const sourceText = evidence || MISSING_EVIDENCE_TEXT;
        // 재질 이름 둘이 같은 묶음 공정을 가리키면(SCM435;SWCH35K → 「SCM435·SWCH35K 공정」) 한 공정으로 본다.
        const targets = several ? whereNames.map((item) => processByName.get(key(item))).filter((item): item is ProductionProcess => Boolean(item)).map((item) => fresh.get(item.id) ?? item).filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index) : freshList();
        if (shared && targets.length >= 2 && PARTIAL_ROUTE_FUEL.test(name)) {
            tell('warning', `「${SHARED_PROCESS_LABEL}」로 적혀 모든 공정에 생산량 비율로 나눴습니다. 이름으로 보아 일부 제품만 거치는 설비의 연료일 수 있습니다 — 그렇다면 그 공정 이름만 적어 다시 올리세요(여러 공정이면 ${LIST_SEPARATOR} 로 이어서). 안 그러면 이 설비를 거치지 않는 제품에도 배출이 실립니다.`);
        }

        const drafts: Array<Omit<SourceStream, keyof LocalEntity>> = [];
        const updates: SourceStream[] = [];
        if ((shared || several) && targets.length >= 2) {
            // 지도 4단계 「연료 나누기」와 같은 계산·같은 행 — 계량기 이름은 연료 이름, 기준은 생산량 비율.
            const toStorage = (value: number) => (kind.litres ? litresToTonnes(value, kind.litres.densityKgPerL) : value);
            const wantsMeasured = row.splitBasis !== undefined && row.splitBasis !== 'OUTPUT_MASS';
            if (wantsMeasured && !row.perProcess) tell('warning', `나누는 기준이 「${SPLIT_BASIS_CHOICES.find((choice) => choice.value === row.splitBasis)?.label}」인데 같은 연료 이름으로 공정마다 한 줄씩 적지 않아 생산량 비율로 나눴습니다. 공정마다 한 줄에 그 공정의 값을 적어 주세요.`);
            const splitBasis = wantsMeasured && row.perProcess ? row.splitBasis ?? 'OUTPUT_MASS' : 'OUTPUT_MASS';
            const valueOf = (item: ProductionProcess) => (splitBasis === 'OUTPUT_MASS' ? item.output_mass_t : row.perProcess?.find((entry) => key(entry.where) === key(item.name))?.value ?? 0);
            const split: FuelSplitDraft = { group: name, total: amount, basis: splitBasis, rows: targets.map((item) => ({ processId: item.id, processName: item.name, value: valueOf(item) })), note: (row.values.basisNote ?? '').trim() };
            const error = validateFuelSplitDraft(split, meterGroups);
            if (error) { tell('error', error); continue; }
            const plan = computeFuelSplit(split, toStorage);
            const changes = buildFuelSplitStreams({
                streams,
                processes: targets,
                plan,
                template: { ...kind.defaults, ncv_gj_per_unit: ncvValue, emission_factor_tco2e_per_unit: factorValue, factor_source_type: sourceType, ...fractions },
                fuelName: choice.label.split(' (')[0],
                inputUnit: kind.litres ? 'L' : undefined,
                source: sourceText,
                storedTotal: toStorage(plan.total),
            });
            drafts.push(...changes.create);
            updates.push(...changes.update);
            meterGroups.push(name);
        } else {
            const target = isHeat ? freshList()[0] : shared || several ? targets[0] : process;
            if (!target) { tell('error', '넣을 공정이 없습니다 — 공정이 먼저 만들어져야 합니다.'); continue; }
            // 한 공정 안에서는 연료가 제품에 생산량 비율로 나뉜다 — 일부 제품만 거치는 설비라면 공정을 나눠 적어야 한다.
            if (!isHeat && distinctGoods(goodLines.get(target.id)) >= 2 && PARTIAL_ROUTE_FUEL.test(name)) {
                tell('warning', `공정 「${target.name}」에는 CN 코드가 ${distinctGoods(goodLines.get(target.id))}종 있어 이 연료가 모든 제품에 생산량 비율로 나뉩니다. 이름으로 보아 일부 제품만 거치는 설비의 연료일 수 있습니다 — 그렇다면 ${SHEET_PROCESSES} 시트에서 그 제품들을 별도 공정으로 적고 이 연료를 그 공정에 넣으세요.`);
            }
            if (streams.some((stream) => stream.process_id === target.id && key(stream.name) === key(name))) { tell('info', '같은 이름의 연료가 이 공정에 이미 있어 건너뛰었습니다.'); continue; }
            const answer: FuelAnswer = { kind, amount: String(amount), name, ncv: String(ncvValue), factor: String(factorValue), factorSource: sourceType, source: sourceText };
            const built = { ...buildFuelStreamDraft(answer, target), ...fractions };
            if (isHeat) {
                const invalidHeat = firstSourceStreamError(createSourceStreamValidationErrors(built));
                if (invalidHeat) { tell('error', invalidHeat); continue; }
                heatFuels.push({ system: (row.values.heatSystem ?? '').trim() || name, draft: built, row: row.row, name });
                continue;
            }
            drafts.push(built);
        }
        const invalid = [...drafts, ...updates].map((draft) => firstSourceStreamError(createSourceStreamValidationErrors(draft))).find(Boolean);
        if (invalid) { tell('error', invalid); continue; }
        // 측정 방식·자료 품질·계수의 출처 문서는 배출원마다 보고서 입력에 붙는다(산정보고서 제6장).
        const factorDoc = (row.values.factorDoc ?? '').trim();
        const measurement = { measurement_method: (row.values.method ?? '').trim() || undefined, data_quality: (row.values.quality ?? '').trim() || undefined, ...(own && factorDoc ? { ncv_source: ncv !== undefined ? factorDoc : undefined, ef_source: factor !== undefined ? factorDoc : undefined } : {}) };
        const remember = (id: string) => { if (Object.values(measurement).some(Boolean)) transpositionRows.push({ source_stream_id: id, ...measurement }); };
        for (const update of updates) {
            const saved = await store.update('source_streams', update);
            streams = streams.map((stream) => (stream.id === saved.id ? saved : stream));
            if (saved.process_id) touched.add(saved.process_id);
            remember(saved.id);
        }
        for (const draft of drafts) {
            const saved = await store.create('source_streams', draft);
            streams.push(saved);
            if (saved.process_id) touched.add(saved.process_id);
            remember(saved.id);
        }
        created.fuels += 1;
    }
    // ── 7b) 보일러·스팀 열 — 열을 받는 공정(9_보일러열)과 함께 열 공급원으로 만든다(지도 4단계 「보일러·스팀」과 같은 검증·같은 빌더) ──
    {
        const systems = Array.from(new Set(heatFuels.map((item) => item.system)));
        for (const system of systems) {
            const members = heatFuels.filter((item) => item.system === system);
            const heatRows = (data.boilerHeat ?? []).filter((row) => key(row.values.system) === key(system));
            const tellSystem = (message: string, row?: number) => note('error', SHEET_BOILER_HEAT, `${system}: ${message}`, row ?? members[0].row);
            const consumers: SharedHeatDraftConsumer[] = [];
            let outsideQuantity = 0;
            let outsideUnit: SharedHeatDraft['outsideUnit'] = 'Gcal';
            let outsideNote = '';
            let failed = false;
            const unquantified: ProductionProcess[] = [];
            for (const row of heatRows) {
                const where = (row.values.process ?? '').trim();
                const quantity = numberOf(row.values.quantity);
                const unit = labelValue(HEAT_UNIT_CHOICES, row.values.unit) ?? 'Gcal';
                const basis = labelValue(HEAT_BASIS_CHOICES, row.values.basis) ?? 'METERED';
                if (Number.isNaN(quantity)) { tellSystem(`쓴 열의 양 「${row.values.quantity}」을(를) 숫자로 적어 주세요.`, row.row); failed = true; continue; }
                if (where === OUTSIDE_PROCESS_LABEL || where.startsWith('(공정 밖')) {
                    if (quantity === undefined) { tellSystem('공정 밖의 열 사용량은 비울 수 없습니다 — 양을 적어 주세요.', row.row); failed = true; continue; }
                    outsideQuantity += quantity;
                    outsideUnit = unit;
                    outsideNote = (row.values.note ?? '').trim();
                    continue;
                }
                const found = processByName.get(key(where));
                if (!found || !fresh.has(found.id)) { tellSystem(`열을 받는 곳 「${where || '빈 칸'}」을(를) ${SHEET_PROCESSES} 시트에서 찾지 못했습니다.`, row.row); failed = true; continue; }
                if (quantity === undefined) { unquantified.push(fresh.get(found.id) ?? found); continue; }
                consumers.push({ processId: found.id, quantity, unit, basis, note: (row.values.note ?? '').trim() });
            }
            if (failed) { note('error', SHEET_BOILER_HEAT, `열 공급원 「${system}」을(를) 만들지 못해 그 연료(${members.map((item) => `「${item.name}」`).join(', ')})를 넣지 않았습니다 — 위 줄을 고쳐 다시 올려 주세요.`, members[0].row); continue; }
            // 열 사용량을 모르면 앱의 임시 계산(연료 에너지 × 기준효율 70%를 생산량 비율로)을 쓴다 — 「[임시]」로 표시되어 계속 확인을 요구한다.
            if (consumers.length === 0 || unquantified.length > 0) {
                const receivers = unquantified.length > 0 ? unquantified : freshList();
                const fuelEnergyTj = members.reduce((sum, item) => sum + calculateSourceStreamEnergyBreakdown({ ...item.draft, id: 'temp', created_at: '', updated_at: '' } as SourceStream).total, 0);
                const provisional = buildProvisionalHeatQuantities({ fuelEnergyTj, rows: receivers.map((process) => ({ processId: process.id, weight: process.output_mass_t })) });
                if (provisional.length === 0) { note('error', SHEET_BOILER_HEAT, `열 공급원 「${system}」: 쓴 열의 양이 없어 임시로도 채우지 못했습니다(공정의 생산량과 연료 사용량이 필요합니다). 그 연료를 넣지 않았습니다.`, members[0].row); continue; }
                for (const item of provisional) consumers.push({ processId: item.processId, quantity: item.quantityTj, unit: 'TJ', basis: 'EFFICIENCY_PROXY', note: item.note });
                note('warning', SHEET_BOILER_HEAT, `열 공급원 「${system}」: 공정별 열 사용량이 없어 임시 값(연료 에너지 × 70%를 생산량 비율로)을 넣었습니다. 규정은 쓴 열량 기준 귀속을 요구하므로 공정별 열 사용량을 받아 ${SHEET_BOILER_HEAT}에 적어 주세요.`, members[0].row);
            }
            const pending = members.map((item, index) => ({ ...item.draft, id: `pending_${index}`, created_at: '', updated_at: '' }) as SourceStream);
            const heatDraft: SharedHeatDraft = { name: system, streamIds: pending.map((item) => item.id), consumers, outsideQuantity, outsideUnit, outsideNote };
            const heatError = validateSharedHeatDraft(heatDraft, { processes: freshList(), sourceStreams: [...streams, ...pending] });
            if (heatError) { note('error', SHEET_BOILER_HEAT, `열 공급원 「${system}」을(를) 만들지 못해 그 연료를 넣지 않았습니다: ${heatError}`, members[0].row); continue; }
            const createdStreams: SourceStream[] = [];
            for (const item of members) createdStreams.push(await store.create('source_streams', { ...item.draft, process_id: consumers[0].processId }));
            streams.push(...createdStreams);
            const result = buildSharedHeatUpdates(freshList(), streams, { ...heatDraft, streamIds: createdStreams.map((item) => item.id) });
            for (const changed of result.sourceStreams) {
                const saved = await store.update('source_streams', changed);
                streams = streams.map((stream) => (stream.id === saved.id ? saved : stream));
            }
            for (const changed of result.processes) await saveProcess(changed);
            for (const consumer of consumers) touched.add(consumer.processId);
            created.fuels += createdStreams.length;
        }
    }

    // ── 7c) 공정배출·물질수지 ───────────────────────────────────────
    for (const row of data.processEmissions ?? []) {
        const name = (row.values.name ?? '').trim();
        const tell = (level: ActivityImportIssue['level'], message: string) => note(level, SHEET_PROCESS_EMISSIONS, `${name || '(이름 없음)'}: ${message}`, row.row);
        const choice = PROCESS_EMISSION_KIND_CHOICES.find((item) => key(item.label) === key(row.values.kind) || key(item.label.split(' — ')[0]) === key(row.values.kind));
        const kind = GUIDED_STREAM_KINDS.find((item) => item.key === choice?.key);
        const amount = numberOf(row.values.amount);
        const factor = numberOf(row.values.factor);
        const found = processByName.get(key(row.values.where));
        if (!name) { tell('error', '배출원 이름이 비어 있어 넣지 못했습니다.'); continue; }
        if (!kind) { tell('error', `종류 「${row.values.kind ?? '빈 칸'}」을(를) 목록에서 찾지 못했습니다. 목록에서 골라 주세요.`); continue; }
        if (!(amount !== undefined && amount > 0)) { tell('error', `연간 양 「${row.values.amount ?? '빈 칸'}」을(를) 0보다 큰 숫자로 적어 주세요(산출 차감도 양수로).`); continue; }
        if (Number.isNaN(factor)) { tell('error', '배출계수는 숫자로 적거나 비워 주세요.'); continue; }
        if (!found || !fresh.has(found.id)) { tell('error', `쓰는 공정 「${row.values.where ?? '빈 칸'}」을(를) ${SHEET_PROCESSES} 시트에서 찾지 못했습니다.`); continue; }
        const sourceChoice = labelValue(FUEL_FACTOR_SOURCE_CHOICES, row.values.factorSource);
        if (factor !== undefined && !sourceChoice) { tell('error', '배출계수를 적었으면 「계수 출처」도 목록에서 골라 주세요.'); continue; }
        if (factor === undefined) tell('warning', `배출계수가 비어 유형의 임시값(${kind.defaults.emission_factor_tco2e_per_unit})이 들어갔습니다. 성분분석표의 값으로 바꿔 주세요(탄소함량 × 3.664).`);
        const evidence = (row.values.evidence ?? '').trim();
        if (!evidence) tell('warning', '근거 자료가 비어 있습니다. 성분분석표·투입 대장 등을 적어 주세요.');
        const answer: FuelAnswer = { kind, amount: String(amount), name, ncv: '0', factor: String(factor ?? kind.defaults.emission_factor_tco2e_per_unit), factorSource: factor !== undefined && sourceChoice ? sourceChoice : kind.defaults.factor_source_type, source: evidence || MISSING_EVIDENCE_TEXT };
        const draft = { ...buildFuelStreamDraft(answer, fresh.get(found.id) ?? found), ...(kind.allowsNegative ? { activity_data: -amount } : {}) };
        const invalid = firstSourceStreamError(createSourceStreamValidationErrors(draft));
        if (invalid) { tell('error', invalid); continue; }
        const saved = await store.create('source_streams', draft);
        streams.push(saved);
        touched.add(found.id);
        created.fuels += 1;
    }

    // 연료를 넣은 공정의 직접배출을 「배출원 합계」로 맞춘다(지도 4단계·연료 나누기와 같다) — 안 맞추면 연료가 계산에 들어가지 않는다.
    for (const processId of touched) {
        const process = fresh.get(processId);
        if (process) {
            await saveProcess({ ...process, direct_attributable_emissions_tco2e: sumReconciledSourceStreamEmissions(process.id, streams), direct_emissions_input_mode: 'SOURCE_STREAM_SUM' });
        }
    }
    const fuelless = freshList().filter((process) => !touched.has(process.id));
    if (fuelless.length > 0) {
        note('info', SHEET_FUELS, `연료가 하나도 없는 공정: ${fuelless.map((process) => `「${process.name}」`).join(', ')}. 연료를 쓰지 않는 공정이 맞는지 확인하세요.`);
    }

    // ── 7d) 사내 이송 — 한 공정의 산출물을 다른 공정이 원료로 쓴 양(지도 3단계의 사내 이송과 같은 기록) ──
    {
        const sent = new Map<string, number>();
        const merged = new Map<string, { from: ProductionProcess; to: ProductionProcess; mass: number; product: string; note: string; row: number }>();
        for (const row of data.transfers ?? []) {
            const tell = (message: string) => note('error', SHEET_TRANSFERS, message, row.row);
            const from = processByName.get(key(row.values.from));
            const to = processByName.get(key(row.values.to));
            const mass = numberOf(row.values.mass);
            if (!from || !fresh.has(from.id)) { tell(`보내는 공정 「${row.values.from ?? '빈 칸'}」을(를) ${SHEET_PROCESSES} 시트에서 찾지 못했습니다.`); continue; }
            if (!to || !fresh.has(to.id)) { tell(`받는 공정 「${row.values.to ?? '빈 칸'}」을(를) ${SHEET_PROCESSES} 시트에서 찾지 못했습니다.`); continue; }
            if (from.id === to.id) { tell('보내는 공정과 받는 공정이 같습니다.'); continue; }
            if (!(mass !== undefined && mass > 0)) { tell(`넘긴 양 「${row.values.mass ?? '빈 칸'}」을(를) 0보다 큰 숫자로 적어 주세요.`); continue; }
            const mergeKey = `${from.id}|${to.id}|${key(row.values.product)}`;
            const existing = merged.get(mergeKey);
            if (existing) existing.mass += mass;
            else merged.set(mergeKey, { from, to, mass, product: (row.values.product ?? '').trim(), note: (row.values.note ?? '').trim(), row: row.row });
        }
        for (const item of merged.values()) {
            const sender = fresh.get(item.from.id) ?? item.from;
            const lines = goodLines.get(sender.id) ?? [];
            let sourceLineId: string | undefined;
            if (lines.length > 1) {
                const wanted = productByName.get(key(item.product));
                sourceLineId = lines.find((line) => line.product_id === wanted?.id)?.id;
                if (!sourceLineId) { note('error', SHEET_TRANSFERS, `보내는 공정 「${sender.name}」은 제품이 둘 이상입니다 — 「보내는 제품」에 어느 제품을 넘기는지 적어 주세요(그 공정의 제품 이름 그대로).`, item.row); continue; }
            }
            const total = (sent.get(sender.id) ?? 0) + item.mass;
            if (total > sender.output_mass_t + 1e-9) { note('error', SHEET_TRANSFERS, `보내는 공정 「${sender.name}」: 넘긴 양의 합(${fmt(total)} t)이 그 공정의 생산량(${fmt(sender.output_mass_t)} t)보다 많습니다.`, item.row); continue; }
            sent.set(sender.id, total);
            await store.create('internal_transfers', { period_id: sender.period_id, source_process_id: sender.id, source_output_line_id: sourceLineId, target_process_id: item.to.id, mass_t: item.mass, note: item.note || undefined });
            created.transfers += 1;
        }
        // 보내는 공정의 내부 소비량·시장 출하량(EU 문서 D_Processes)을 지도 3단계와 같이 맞춘다.
        for (const [processId, internal] of sent) {
            const process = fresh.get(processId);
            if (process) await saveProcess({ ...process, internal_consumption_mass_t: internal, market_output_mass_t: process.output_mass_t - internal });
        }
    }

    // ── 8) 구매 강재 ─────────────────────────────────────────────────
    const knownCountries = Array.from(new Set((deps.defaultValues?.rows ?? []).map((item) => item.country)));
    const withPrecursor = new Set<string>();
    /** 공정별로, 「쓰는 제품」을 적은 원료와 안 적은 원료 */
    const assigned = new Map<string, Array<{ name: string; heading: string }>>();
    const unassigned = new Map<string, Array<{ name: string; heading: string }>>();
    for (const row of data.precursors) {
        const name = (row.values.name ?? '').trim();
        const tell = (level: ActivityImportIssue['level'], message: string) => note(level, SHEET_PRECURSORS, `${name || '(이름 없음)'}: ${message}`, row.row);
        const process = processByName.get(key(row.values.where));
        if (!process || !fresh.has(process.id)) {
            tell('error', process ? `「${row.values.where}」은(는) 이미 있던 공정이라 구매 강재를 새로 넣지 않았습니다.` : `쓰는 공정 「${row.values.where ?? '빈 칸'}」을(를) 찾지 못했습니다.${processHint()}`);
            continue;
        }
        if (existingPrecursors.some((item) => item.process_id === process.id && key(item.name) === key(name))) { tell('info', '같은 이름의 구매 강재가 이 공정에 이미 있어 건너뛰었습니다.'); continue; }
        const numbers = { consumed: numberOf(row.values.consumed), purchased: numberOf(row.values.purchased), direct: numberOf(row.values.direct), indirect: numberOf(row.values.indirect), elecUse: numberOf(row.values.elecUse), elecFactor: numberOf(row.values.elecFactor), nonCbam: numberOf(row.values.nonCbam) };
        if (Object.values(numbers).some((value) => Number.isNaN(value))) { tell('error', '투입량·구매량·SEE·전력 칸은 숫자로 적어 주세요(단위 글자 없이).'); continue; }
        // 간접 SEE의 내역(전력사용량 × 전력계수) — 둘 다 있으면 EU 문서에 그대로 실린다. 간접 SEE를 비웠으면 곱해서 채운다.
        const hasBreakdown = (numbers.elecUse ?? 0) > 0 && (numbers.elecFactor ?? 0) > 0;
        if ((numbers.elecUse !== undefined) !== (numbers.elecFactor !== undefined)) tell('warning', '원료의 전력 사용량과 전력 계수는 둘 다 적어야 EU 문서에 실립니다. 하나만 있어 쓰지 않았습니다.');
        if (hasBreakdown) {
            const product = Math.round((numbers.elecUse ?? 0) * (numbers.elecFactor ?? 0) * 1e6) / 1e6;
            if (numbers.indirect === undefined) numbers.indirect = product;
            else if (Math.abs(numbers.indirect - product) > Math.max(0.001, product * 0.01)) tell('warning', `간접 SEE ${numbers.indirect}가 전력 사용량 × 전력 계수(${product})와 다릅니다. 공급사 자료를 다시 확인해 주세요 — 계산에는 간접 SEE 칸의 값을 썼습니다.`);
        }
        const cn = (row.values.cn ?? '').replace(/\D/g, '');
        const country = resolveSupplierCountry(row.values.country ?? '', knownCountries);
        const chosen = labelValue(SUPPLIER_VALUE_CHOICES, row.values.hasValue);
        const mode: 'ACTUAL' | 'DEFAULT' = chosen ?? (numbers.direct !== undefined ? 'ACTUAL' : 'DEFAULT');
        if (!chosen) tell('info', `「공급사 배출량 값이 있나요?」가 비어, 직접 SEE 칸이 ${mode === 'ACTUAL' ? '채워져 있어 「있음」' : '비어 있어 「없음(EU 기본값)」'}으로 보았습니다.`);
        const evidence = (row.values.evidence ?? '').trim();
        const supplier = (row.values.supplier ?? '').trim();
        let answer;
        if (mode === 'ACTUAL') {
            if (numbers.direct === undefined) { tell('error', '공급사 값이 「있음」인데 직접 SEE가 비어 있습니다. 값을 적거나 「없음」으로 바꿔 주세요.'); continue; }
            if (numbers.indirect === undefined) tell('warning', '간접 SEE가 비어 0으로 넣었습니다. 공급사 자료에 간접(전력) 값이 있는지 확인해 주세요.');
            if (!evidence) tell('warning', '근거 자료가 비어 있습니다. 공급사가 언제 어떤 문서로 준 값인지 적어 주세요.');
            answer = { mode, directSee: String(numbers.direct), indirectSee: String(numbers.indirect ?? 0), source: evidence || MISSING_EVIDENCE_TEXT, justification: '' };
        } else {
            if (numbers.direct !== undefined || numbers.indirect !== undefined) tell('warning', '공급사 값이 「없음」이라 적어 둔 직접·간접 SEE는 쓰지 않고 EU 기본값을 넣었습니다.');
            // 질문 화면의 「모르겠어요 — EU 기본값 채우기」와 같은 조회·같은 문구.
            const filled = fillEuDefault({ reference: deps.defaultValues, country, cnDigits: cn });
            if (!filled.ok) { tell('error', `EU 기본값을 넣지 못했습니다: ${filled.reason}`); continue; }
            answer = { mode, directSee: String(filled.direct), indirectSee: String(filled.indirect), source: filled.source, justification: evidence ? `${filled.justification} · ${evidence}` : filled.justification };
        }
        const draft = {
            ...buildPrecursorDraft({ name, cn, consumed: String(numbers.consumed ?? ''), purchased: String(numbers.purchased ?? numbers.consumed ?? ''), country, ...answer }),
            supplierInstallation: supplier,
            supplierPeriod: (row.values.period ?? '').trim(),
            supplierRoute: (row.values.route ?? '').trim(),
            bridgeUsage: hasBreakdown ? numbers.elecUse ?? 0 : 0,
            bridgeFactor: hasBreakdown ? numbers.elecFactor ?? 0 : 0,
        };
        if (numbers.nonCbam !== undefined && (numbers.nonCbam < 0 || numbers.nonCbam > (numbers.consumed ?? 0))) { tell('error', `CBAM 제품이 아닌 데 쓴 양 「${row.values.nonCbam}」은 0 이상이고 투입량보다 작아야 합니다.`); continue; }
        if (mode === 'ACTUAL' && !draft.supplierPeriod) tell('info', '공급사 값의 기준 기간이 비어 있습니다. 공급사 자료에 적힌 기간을 적으면 산정보고서에 실립니다.');
        // 「쓰는 제품」을 적었으면 그 제품 라인에만 귀속한다(지도 6단계의 제품별 배분과 같은 기록). 여러 제품이면 그 제품들의 생산량 비율.
        const wanted = namesOf(row.values.products);
        if (wanted.length > 0) {
            const lines = goodLines.get(process.id) ?? [];
            const chosen = wanted.map((item) => lines.find((line) => line.product_id === productByName.get(key(item))?.id));
            const missing = wanted.filter((_, index) => !chosen[index]);
            if (missing.length > 0) { tell('error', `쓰는 제품 ${missing.map((item) => `「${item}」`).join(', ')}이(가) 공정 「${process.name}」의 제품이 아닙니다. ${SHEET_PROCESSES} 시트에서 그 공정에 적은 제품 이름을 똑같이 적어 주세요.`); continue; }
            const picked = chosen.filter((line): line is ProductOutputLine => Boolean(line));
            const basis = picked.reduce((sum, line) => sum + line.output_mass_t, 0);
            let rest = draft.consumedMass;
            draft.outputAllocations = picked.map((line, index) => {
                const mass = index === picked.length - 1 ? rest : Math.round(draft.consumedMass * line.output_mass_t / basis * 1e6) / 1e6;
                rest = Math.round((rest - mass) * 1e6) / 1e6;
                return { product_output_line_id: line.id, product_id: line.product_id, allocated_mass_t: mass, allocation_percent: draft.consumedMass > 0 ? Math.round(mass / draft.consumedMass * 1e6) / 1e4 : undefined };
            });
            const allocationError = validatePrecursorAllocation(draft.outputAllocations.reduce((sum, item) => sum + item.allocated_mass_t, 0), draft.consumedMass);
            if (allocationError) { tell('error', allocationError); continue; }
        }
        const error = validatePrecursorDraft(draft);
        if (error) { tell('error', error); continue; }
        if (mode === 'ACTUAL' && knownCountries.length > 0 && !knownCountries.includes(country)) tell('warning', `원료를 만든 나라 「${country}」이(가) EU 기본값표의 이름과 다릅니다. 목록에서 골라 주세요(EU 문서의 국가 코드가 이 값으로 정해집니다).`);
        const status = labelValue(VERIFICATION_CHOICES, row.values.verification);
        if (row.values.verification && !status) tell('warning', `검증 여부 「${row.values.verification}」을(를) 읽지 못해 「미검증」으로 넣었습니다.`);
        const payload: Omit<PurchasedPrecursor, keyof LocalEntity> = {
            ...buildPrecursorCreate(draft, { period_id: process.period_id, process_id: process.id, product_id: process.product_id }),
            ...(status ? { verification_status: status } : {}),
            ...(numbers.nonCbam !== undefined ? { consumed_for_non_cbam_mass_t: numbers.nonCbam } : {}),
        };
        await store.create('precursors', payload);
        withPrecursor.add(process.id);
        (wanted.length > 0 ? assigned : unassigned).set(process.id, [...((wanted.length > 0 ? assigned : unassigned).get(process.id) ?? []), { name, heading: headingOf(cn) }]);
        created.precursors += 1;
    }
    // 조용히 섞이지 않게: 한 공정에 제품이 여럿인데 「쓰는 제품」 없이 넣은 원료는 생산량 비율로 모든 제품에 나뉜다.
    //  · 그 원료의 종류(CN 4자리)가 둘 이상이면 제품마다 원료가 다를 가능성이 크다 → 되묻는다.
    //  · 철강이 아닌 제품이 그 공정에 있으면 그 제품이 강재 배출의 몫을 가져간다 → 되묻는다.
    const productById = new Map(Array.from(productByName.values()).map((product) => [product.id, product]));
    for (const process of freshList()) {
        const lines = goodLines.get(process.id) ?? [];
        const loose = unassigned.get(process.id) ?? [];
        if (distinctGoods(lines) < 2 || loose.length === 0) continue;
        const headings = [...new Set(loose.map((item) => item.heading))];
        if (headings.length >= 2) {
            note('warning', SHEET_PRECURSORS, `공정 「${process.name}」에는 CN 코드가 ${distinctGoods(lines)}종 있고, 종류가 다른 원료 ${loose.map((item) => `「${item.name}」`).join(', ')}을(를) 「쓰는 제품」 없이 넣었습니다. 이대로면 모든 원료가 모든 제품에 생산량 비율로 섞입니다 — 제품마다 쓰는 원료(강종)가 다르면 「쓰는 제품」을 적어 다시 올리세요. 틀리면 제품별 배출량이 크게 달라집니다.`);
        }
        const foreign = lines.filter((line) => !/^7[23]/.test((productById.get(line.product_id ?? '')?.cn_code ?? '').replace(/\D/g, '')));
        if (foreign.length > 0) {
            note('warning', SHEET_PRECURSORS, `공정 「${process.name}」에 철강이 아닌 제품 ${foreign.map((line) => `「${line.name}」`).join(', ')}이(가) 같이 있습니다. 「쓰는 제품」 없이 넣은 강재의 배출이 이 제품에도 나뉘어 철강 제품의 값이 낮아집니다 — 강재마다 「쓰는 제품」을 적거나 이 제품을 다른 공정으로 적어 주세요.`);
        }
    }

    // 신고 대상 제품을 만드는 공정만 본다 — EU로 안 나가는 제품의 공정은 구매 강재가 없어도 계산에 영향이 없다.
    const reportable = new Set(Array.from(productByName.values()).filter((product) => product.reporting_scope !== 'NON_CBAM_COPRODUCT').map((product) => product.id));
    const bare = freshList().filter((process) => !withPrecursor.has(process.id) && reportable.has(process.product_id ?? ''));
    if (bare.length > 0) {
        note('info', SHEET_PRECURSORS, `구매 강재가 없는 공정: ${bare.map((process) => `「${process.name}」`).join(', ')}. 사 온 강재를 쓰는 공정이면 적어 주세요 — 정말 없으면 지도 6단계에서 「쓰지 않음」을 확인하면 됩니다.`);
    }

    // ── 9) 보고서 입력 — 산정보고서(8단계)에 실리는 것. 이미 적어 둔 값은 덮어쓰지 않고, 비어 있는 자리만 채운다. ──
    if (deps.reportInputs) {
        const current = (await deps.reportInputs.get()) ?? {};
        const next: ReportInputs = { ...current };
        const fill = <T extends object>(existing: T | undefined, incoming: Partial<T>): T | undefined => {
            const cleaned = Object.fromEntries(Object.entries(incoming).filter(([, value]) => value !== undefined && value !== '')) as Partial<T>;
            return Object.keys(cleaned).length === 0 ? existing : ({ ...cleaned, ...(existing ?? {}) } as T);
        };
        next.monitoring_plan = fill(current.monitoring_plan, { doc_no: text('monitoring_doc_no'), version: text('monitoring_version'), approved_at: parseWorkbookDate(text('monitoring_approved_at')) ?? text('monitoring_approved_at') });
        next.declaration = fill(current.declaration, { name: text('declaration_name'), position: text('declaration_position'), date: parseWorkbookDate(text('declaration_date')) ?? text('declaration_date') });
        if (sectorRows.length > 0) next.sector_parameters = [...(current.sector_parameters ?? []), ...sectorRows];
        if (transpositionRows.length > 0) next.transpositions = [...(current.transpositions ?? []).filter((item) => !transpositionRows.some((row) => row.source_stream_id === item.source_stream_id)), ...transpositionRows];
        // 전력 계수의 출처(공표기관·문서·연도)는 공장 값이라 이번에 만든 공정 모두에 붙인다. 산정근거 유형은 5단계에서 고른 출처가 이어진다.
        const meta = { publisher: text('electricity_ef_publisher') || undefined, document: text('electricity_ef_document') || undefined, vintage: text('electricity_ef_vintage') || undefined };
        if (Object.values(meta).some(Boolean) && fresh.size > 0) {
            const others = (current.electricity_ef_meta ?? []).filter((item) => !fresh.has(item.process_id));
            next.electricity_ef_meta = [...others, ...freshList().filter((process) => process.electricity_mwh > 0).map((process) => ({ process_id: process.id, ...meta }))];
        }
        const applicable = labelValue(CARBON_PRICE_CHOICES, text('carbon_price_applicable'));
        if (text('carbon_price_applicable') && !applicable) note('warning', SHEET_INSTALLATION, `탄소가격 칸의 「${text('carbon_price_applicable')}」을(를) 읽지 못했습니다. 목록에서 골라 주세요.`);
        if (applicable && (current.carbon_price ?? []).length === 0) {
            next.carbon_price = [{ target: installation?.name ?? '본 사업장', applicable, note: text('carbon_price_note'), amount: text('carbon_price_amount') || undefined, evidence_status: 'pending' }];
            if (applicable === 'YES' && !text('carbon_price_amount')) note('warning', SHEET_INSTALLATION, '탄소가격을 냈다고 적었는데 금액이 비어 있습니다. 수입업자가 인증서 차감에 쓰는 값이니 금액과 증빙을 받아 주세요.');
        }
        const rnr = data.rnr.map((row) => ({ data: (row.values.data ?? '').trim(), collector: (row.values.collector ?? '').trim(), transposer: (row.values.transposer ?? '').trim(), approver: (row.values.approver ?? '').trim(), system: (row.values.system ?? '').trim() })).filter((row) => row.data);
        if (rnr.length > 0) next.rnr = [...(current.rnr ?? []), ...rnr.filter((row) => !(current.rnr ?? []).some((item) => key(item.data) === key(row.data)))];
        const evidenceRows = data.evidence.map((row) => ({ item: (row.values.item ?? '').trim(), proves: (row.values.proves ?? '').trim(), custodian: (row.values.custodian ?? '').trim(), status: (row.values.status ?? '').trim() || '확보' })).filter((row) => row.item);
        if (evidenceRows.length > 0) next.evidence = [...(current.evidence ?? []), ...evidenceRows.filter((row) => !(current.evidence ?? []).some((item) => key(item.item) === key(row.item)))];
        await deps.reportInputs.set(next);

        // 산정보고서에 「기재 필요」로 남을 것 — 서식을 채운 사람에게 돌려보낼 수 있게 알린다.
        if (!next.monitoring_plan?.doc_no) note('info', SHEET_INSTALLATION, '모니터링 계획 문서번호가 비어 있습니다. 사내 방법론 문서가 있으면 번호·판·승인일을 적어 주세요(산정보고서 제12장).');
        if (!next.declaration?.name) note('info', SHEET_INSTALLATION, '보고서 서명자가 비어 있습니다. 산정 결과에 책임지는 사람의 이름·직위를 적어 주세요.');
        if (!applicable && (current.carbon_price ?? []).length === 0) note('info', SHEET_INSTALLATION, '「배출권거래제·탄소세를 냈나요?」가 비어 있습니다. 수입업자가 묻는 항목입니다 — 모르면 「아직 모름」을 골라 주세요.');
        if (fresh.size > 0 && !meta.publisher && !meta.document) note('info', SHEET_INSTALLATION, '전력 계수를 공표한 기관·문서가 비어 있습니다. 계수를 어디서 가져왔는지 적어 주세요(산정보고서 제7장).');
        if ((next.rnr ?? []).length === 0) note('info', SHEET_RNR, '역할·책임이 비어 있습니다. 자료를 누가 모으고 확인하는지 아는 만큼 적어 주세요(산정보고서 제12장).');
    }

    // 품번 목록에서 합쳐 만든 제품·공정 줄의 문제는 품번 목록의 처음 줄을 가리키게 한다.
    for (const issue of issues) {
        if (issue.row !== undefined && issue.row >= PART_ROW_BASE) {
            issue.sheet = SHEET_PARTS;
            issue.row = expansion.origin.get(issue.row);
        }
    }

    const order = { error: 0, warning: 1, info: 2 };
    return { created, issues: issues.map((issue, index) => ({ issue, index })).sort((a, b) => order[a.issue.level] - order[b.issue.level] || a.index - b.index).map((item) => item.issue) };
}

/** 「확인할 것」을 서식을 채운 사람에게 그대로 보낼 수 있는 글로 만든다. */
export function describeActivityImportIssues(issues: ActivityImportIssue[]): string {
    if (issues.length === 0) return '확인할 것이 없습니다.';
    return issues.map((issue) => `[${ISSUE_LEVEL_LABEL[issue.level]}] ${issue.sheet}${issue.row ? ` ${issue.row}번째 줄` : ''} — ${issue.message}`).join('\n');
}
