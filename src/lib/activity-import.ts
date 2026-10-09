import {
    ELECTRICITY_SOURCE_CHOICES,
    FUEL_FACTOR_SOURCE_CHOICES,
    FUEL_KIND_CHOICES,
    NO,
    SHARED_PROCESS_LABEL,
    SHEET_FUELS,
    SHEET_INSTALLATION,
    SHEET_PRECURSORS,
    SHEET_PROCESSES,
    SHEET_PRODUCTS,
    SUPPLIER_VALUE_CHOICES,
    VERIFICATION_CHOICES,
    YES,
    type ActivityRow,
    type ActivityWorkbookData,
} from './activity-workbook';
import { sumReconciledSourceStreamEmissions } from './allocation-rules';
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
    validatePrecursorDraft,
    validateProductDraft,
} from './guided-edit';
import type { LocalEntity, Product, ProductionProcess, PurchasedPrecursor, SourceStream, StoreEntityMap, StoreName } from './local-db';
import { buildImportedHeatUpdate, validateImportedHeatDraft } from './measurable-heat';
import type { ImportedDefaultValueReference } from './reference-workbooks';
import { createSourceStreamValidationErrors, firstSourceStreamError, GUIDED_STREAM_KINDS } from './source-stream-input';

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

export interface ActivityImportIssue {
    level: 'error' | 'warning' | 'info';
    sheet: string;
    /** 엑셀의 줄 번호(표 시트) */
    row?: number;
    message: string;
}

export interface ActivityImportResult {
    created: { installation: number; period: number; products: number; processes: number; fuels: number; precursors: number };
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

const fmt = (value: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 }).format(value);

export async function importActivityWorkbook(
    data: ActivityWorkbookData,
    deps: { store: ActivityImportStore; defaultValues?: ImportedDefaultValueReference },
): Promise<ActivityImportResult> {
    const { store } = deps;
    const issues: ActivityImportIssue[] = [];
    const created: ActivityImportResult['created'] = { installation: 0, period: 0, products: 0, processes: 0, fuels: 0, precursors: 0 };
    const note = (level: ActivityImportIssue['level'], sheet: string, message: string, row?: number) => issues.push({ level, sheet, row, message });
    for (const message of data.notes) note('error', '파일', message);

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
                authorized_representative_name: optional('authorized_representative_name'),
                email: optional('email'),
                telephone: optional('telephone'),
                waste_gases: yesNo(text('waste_gases')),
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
    for (const row of data.products) {
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
    const groups = new Map<string, ActivityRow[]>();
    for (const row of data.processes) {
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
        const lines: Array<{ product: Product; mass: number }> = [];
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
                lines.push({ product, mass });
                scrap += rowScrap;
            }
        }
        if (broken || lines.length === 0) {
            note('error', SHEET_PROCESSES, `공정 「${name}」을(를) 만들지 못했습니다 — 위 줄을 고쳐 다시 올려 주세요. 이 공정의 연료·구매 강재도 들어가지 않습니다.`, rows[0].row);
            continue;
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
            await store.create('product_output_lines', { process_id: process.id, ...buildProcessCreation(draftOf(line.product, line.mass, 0)).productLine, ...role });
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
    const freshList = () => Array.from(fresh.values());

    // ── 5) 밖에서 산 스팀·온수 ───────────────────────────────────────
    const heatAnswer = yesNo(text('imported_heat'));
    if (heatAnswer === 'NO') {
        for (const process of freshList()) {
            const draft = noImportedHeatDraft(process);
            if (!validateImportedHeatDraft(draft)) await saveProcess(buildImportedHeatUpdate(process, draft));
        }
    } else if (fresh.size > 0) {
        note(heatAnswer === 'YES' ? 'warning' : 'info', SHEET_INSTALLATION, heatAnswer === 'YES'
            ? '밖에서 사 오는 스팀·온수가 있다고 적혀 있습니다. 이 서식에는 그 양을 적는 칸이 없으니 지도 4단계에서 입력하세요(사 온 열량·공급사 계수).'
            : '「밖에서 사 오는 스팀·온수가 있나요?」가 비어 있습니다. 없으면 「아니오」로 적어 주세요 — 비워 두면 앱이 다시 묻습니다.');
    }

    // ── 6) 전력 ──────────────────────────────────────────────────────
    if (fresh.size > 0) {
        const total = numberOf(text('electricity_total_mwh'));
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
        const targets = freshList();
        const metered = targets.filter((process) => meteredMwh.has(process.id));
        let applied = false;
        if (total !== undefined && !(total > 0)) {
            note('error', SHEET_INSTALLATION, `공장 전체 전력 사용량 「${text('electricity_total_mwh')}」을(를) 0보다 큰 숫자로 적어 주세요.`);
        } else if (total !== undefined && targets.length === 1) {
            await applyFactor(targets[0], total);
            applied = true;
        } else if (total !== undefined && metered.length > 0 && metered.length < targets.length) {
            note('error', SHEET_PROCESSES, `전력을 넣지 못했습니다: 공장 전체 전력(${fmt(total)} MWh)이 있는데 공정별 전력은 ${metered.length}/${targets.length}개 공정에만 적혀 있습니다. 모든 공정에 적거나 모두 비워 주세요(비우면 생산량 비율로 나눕니다).`);
        } else if (total !== undefined) {
            // 공정별 값이 없으면 생산량 비율로, 모두 있으면 그 값을 고지서 합계에 맞춘다 — 지도 5단계 「전력 나누기」와 같은 계산·같은 기록.
            const bySubMeter = metered.length === targets.length;
            const draft: ElectricitySplitDraft = {
                group: ELECTRICITY_METER_GROUP,
                totalMwh: total,
                basis: bySubMeter ? 'SUB_METER' : 'OUTPUT_MASS',
                rows: targets.map((process) => ({ processId: process.id, processName: process.name, value: bySubMeter ? meteredMwh.get(process.id) ?? 0 : process.output_mass_t })),
                note: '',
            };
            const error = validateElectricitySplitDraft(draft);
            if (error) {
                note('error', SHEET_INSTALLATION, `전력을 나누지 못했습니다: ${error}`);
            } else {
                const plan = computeElectricitySplit(draft);
                if (plan.caution) note('warning', SHEET_PROCESSES, plan.caution);
                for (const updated of buildElectricitySplitUpdates(targets, plan)) await applyFactor(await saveProcess(updated), updated.electricity_mwh);
                applied = true;
            }
        } else if (metered.length > 0) {
            for (const process of metered) await applyFactor(process, meteredMwh.get(process.id) ?? 0);
            applied = true;
            const without = targets.filter((process) => !meteredMwh.has(process.id));
            if (without.length > 0) note('warning', SHEET_PROCESSES, `전력이 비어 있는 공정: ${without.map((process) => `「${process.name}」`).join(', ')}. 전기를 쓰지 않는 공정이 아니라면 적어 주세요.`);
        } else {
            note('warning', SHEET_INSTALLATION, '전력 사용량이 없습니다. 한전 고지서 12개월 합계(kWh ÷ 1,000)를 「공장 전체 전력 사용량」에 적어 주세요.');
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
    const meterGroups = existingStreams.map((stream) => stream.shared_meter?.group?.trim()).filter((group): group is string => Boolean(group));
    for (const row of data.fuels) {
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
        if (own && !factorSource) { tell('error', '순발열량·배출계수를 직접 적었으면 「계수 출처」도 목록에서 골라 주세요. 기본값을 쓰려면 두 칸을 비우세요.'); continue; }
        const where = (row.values.where ?? '').trim();
        const shared = key(where) === key(SHARED_PROCESS_LABEL) || key(where) === '공용' || key(where) === '공장 전체';
        const process = shared ? undefined : processByName.get(key(where));
        if (!shared && !where) { tell('error', `「쓰는 공정」이 비어 있습니다. 공정 이름을 적거나, 여러 공정이 같이 쓰면 「${SHARED_PROCESS_LABEL}」을 골라 주세요.`); continue; }
        if (!shared && (!process || !fresh.has(process.id))) {
            tell('error', process ? `「${where}」은(는) 이미 있던 공정이라 연료를 새로 넣지 않았습니다.` : `쓰는 공정 「${where}」을(를) ${SHEET_PROCESSES} 시트에서 찾지 못했습니다(그 공정이 위에서 만들어지지 못했을 수도 있습니다).`);
            continue;
        }
        const evidence = (row.values.evidence ?? '').trim();
        if (!evidence) tell('warning', '근거 자료가 비어 있습니다. 어느 고지서·전표의 숫자인지 적어 주세요.');
        if (!own && kind.key === 'fuel-mass') tell('warning', `순발열량·배출계수가 비어 「유류·기타」의 임시값(${kind.defaults.ncv_gj_per_unit} GJ/t · ${kind.defaults.emission_factor_tco2e_per_unit})이 들어갔습니다. 유종에 맞는 값을 적어 주세요(LPG 47.3 · 63.1 등).`);
        if (ncv === undefined && kind.key === 'fuel-gas') tell('info', `도시가스 순발열량은 기본 자리값 ${kind.defaults.ncv_gj_per_unit} GJ/Nm³로 넣었습니다. 도시가스사에 순발열량을 확인하면 더 정확합니다(고지서의 MJ는 총발열량이라 그대로 쓰면 안 됩니다).`);
        const ncvValue = ncv ?? kind.defaults.ncv_gj_per_unit;
        const factorValue = factor ?? kind.defaults.emission_factor_tco2e_per_unit;
        const sourceType = own && factorSource ? factorSource : kind.defaults.factor_source_type;
        const sourceText = evidence || MISSING_EVIDENCE_TEXT;
        const targets = freshList();

        const drafts: Array<Omit<SourceStream, keyof LocalEntity>> = [];
        const updates: SourceStream[] = [];
        if (shared && targets.length >= 2) {
            // 지도 4단계 「연료 나누기」와 같은 계산·같은 행 — 계량기 이름은 연료 이름, 기준은 생산량 비율.
            const toStorage = (value: number) => (kind.litres ? litresToTonnes(value, kind.litres.densityKgPerL) : value);
            const split: FuelSplitDraft = { group: name, total: amount, basis: 'OUTPUT_MASS', rows: targets.map((item) => ({ processId: item.id, processName: item.name, value: item.output_mass_t })), note: '' };
            const error = validateFuelSplitDraft(split, meterGroups);
            if (error) { tell('error', error); continue; }
            const plan = computeFuelSplit(split, toStorage);
            const changes = buildFuelSplitStreams({
                streams,
                processes: targets,
                plan,
                template: { ...kind.defaults, ncv_gj_per_unit: ncvValue, emission_factor_tco2e_per_unit: factorValue, factor_source_type: sourceType },
                fuelName: choice.label.split(' (')[0],
                inputUnit: kind.litres ? 'L' : undefined,
                source: sourceText,
                storedTotal: toStorage(plan.total),
            });
            drafts.push(...changes.create);
            updates.push(...changes.update);
            meterGroups.push(name);
        } else {
            const target = shared ? targets[0] : process;
            if (!target) { tell('error', '넣을 공정이 없습니다 — 공정이 먼저 만들어져야 합니다.'); continue; }
            if (streams.some((stream) => stream.process_id === target.id && key(stream.name) === key(name))) { tell('info', '같은 이름의 연료가 이 공정에 이미 있어 건너뛰었습니다.'); continue; }
            const answer: FuelAnswer = { kind, amount: String(amount), name, ncv: String(ncvValue), factor: String(factorValue), factorSource: sourceType, source: sourceText };
            drafts.push(buildFuelStreamDraft(answer, target));
        }
        const invalid = [...drafts, ...updates].map((draft) => firstSourceStreamError(createSourceStreamValidationErrors(draft))).find(Boolean);
        if (invalid) { tell('error', invalid); continue; }
        for (const update of updates) {
            const saved = await store.update('source_streams', update);
            streams = streams.map((stream) => (stream.id === saved.id ? saved : stream));
            if (saved.process_id) touched.add(saved.process_id);
        }
        for (const draft of drafts) {
            const saved = await store.create('source_streams', draft);
            streams.push(saved);
            if (saved.process_id) touched.add(saved.process_id);
        }
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

    // ── 8) 구매 강재 ─────────────────────────────────────────────────
    const knownCountries = Array.from(new Set((deps.defaultValues?.rows ?? []).map((item) => item.country)));
    const withPrecursor = new Set<string>();
    for (const row of data.precursors) {
        const name = (row.values.name ?? '').trim();
        const tell = (level: ActivityImportIssue['level'], message: string) => note(level, SHEET_PRECURSORS, `${name || '(이름 없음)'}: ${message}`, row.row);
        const process = processByName.get(key(row.values.where));
        if (!process || !fresh.has(process.id)) {
            tell('error', process ? `「${row.values.where}」은(는) 이미 있던 공정이라 구매 강재를 새로 넣지 않았습니다.` : `쓰는 공정 「${row.values.where ?? '빈 칸'}」을(를) ${SHEET_PROCESSES} 시트에서 찾지 못했습니다.`);
            continue;
        }
        if (existingPrecursors.some((item) => item.process_id === process.id && key(item.name) === key(name))) { tell('info', '같은 이름의 구매 강재가 이 공정에 이미 있어 건너뛰었습니다.'); continue; }
        const numbers = { consumed: numberOf(row.values.consumed), purchased: numberOf(row.values.purchased), direct: numberOf(row.values.direct), indirect: numberOf(row.values.indirect) };
        if (Object.values(numbers).some((value) => Number.isNaN(value))) { tell('error', '투입량·구매량·SEE는 숫자로 적어 주세요(단위 글자 없이).'); continue; }
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
        };
        const error = validatePrecursorDraft(draft);
        if (error) { tell('error', error); continue; }
        if (mode === 'ACTUAL' && knownCountries.length > 0 && !knownCountries.includes(country)) tell('warning', `원료를 만든 나라 「${country}」이(가) EU 기본값표의 이름과 다릅니다. 목록에서 골라 주세요(EU 문서의 국가 코드가 이 값으로 정해집니다).`);
        const status = labelValue(VERIFICATION_CHOICES, row.values.verification);
        if (row.values.verification && !status) tell('warning', `검증 여부 「${row.values.verification}」을(를) 읽지 못해 「미검증」으로 넣었습니다.`);
        const payload: Omit<PurchasedPrecursor, keyof LocalEntity> = {
            ...buildPrecursorCreate(draft, { period_id: process.period_id, process_id: process.id, product_id: process.product_id }),
            ...(status ? { verification_status: status } : {}),
        };
        await store.create('precursors', payload);
        withPrecursor.add(process.id);
        created.precursors += 1;
    }
    // 신고 대상 제품을 만드는 공정만 본다 — EU로 안 나가는 제품의 공정은 구매 강재가 없어도 계산에 영향이 없다.
    const reportable = new Set(Array.from(productByName.values()).filter((product) => product.reporting_scope !== 'NON_CBAM_COPRODUCT').map((product) => product.id));
    const bare = freshList().filter((process) => !withPrecursor.has(process.id) && reportable.has(process.product_id ?? ''));
    if (bare.length > 0) {
        note('info', SHEET_PRECURSORS, `구매 강재가 없는 공정: ${bare.map((process) => `「${process.name}」`).join(', ')}. 사 온 강재를 쓰는 공정이면 적어 주세요 — 정말 없으면 지도 6단계에서 「쓰지 않음」을 확인하면 됩니다.`);
    }

    const order = { error: 0, warning: 1, info: 2 };
    return { created, issues: issues.map((issue, index) => ({ issue, index })).sort((a, b) => order[a.issue.level] - order[b.issue.level] || a.index - b.index).map((item) => item.issue) };
}

/** 「확인할 것」을 서식을 채운 사람에게 그대로 보낼 수 있는 글로 만든다. */
export function describeActivityImportIssues(issues: ActivityImportIssue[]): string {
    if (issues.length === 0) return '확인할 것이 없습니다.';
    return issues.map((issue) => `[${ISSUE_LEVEL_LABEL[issue.level]}] ${issue.sheet}${issue.row ? ` ${issue.row}번째 줄` : ''} — ${issue.message}`).join('\n');
}
