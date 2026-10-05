import type { PurchasedPrecursor } from './local-db';

/**
 * 공급사 회신 파일(EU Communication Template) 읽기와 우리 전구물질과의 대조 — 전구물질 고리(UX 컨셉 v4 §12)의 「회신」 쪽.
 *
 * 앱은 요청서를 내보내고(supplier-request.ts), 공급사가 채워 보낸 EU 템플릿의 Summary_Products(제품별 SEE 직접·간접)를 읽어
 * 같은 CN의 전구물질 값을 실측으로 바꿀 **제안**을 만든다. 이 파일은 읽고 판단만 한다 — 저장은 화면이 사람의 확인 뒤에 한다.
 *
 * 원칙:
 *  · 숫자를 지어내지 않는다. 계산값이 비어 있거나 단위가 다르면 그 행은 적용할 수 없다고 말한다.
 *  · 같은 CN의 후보가 둘 이상이면 앱이 고르지 않는다(생산경로가 다를 수 있다) — 사람이 고른다.
 *  · 공급사 자료는 「공급사 확인」까지다. 제3자 검증보고서가 있다는 증거가 못 되므로 검증됨(VERIFIED)으로 올리지 않는다.
 *  · 회신의 보고기간이 우리 기간과 다르면 기본 선택을 끄고 경고한다.
 */

export type SheetRows = Array<{ rowNumber: number; valuesByColumn: Map<string, string> }>;

export interface SupplierReplyRow {
    /** 회신 시트의 행 번호(사람이 열어 확인할 수 있게) */
    sheetRow: number;
    cnCode: string;
    productName: string;
    processName: string;
    directSee?: number;
    indirectSee?: number;
    unit: string;
    /** 기본값으로 채운 배출의 몫(템플릿 M열). 0보다 크면 일부만 실측이다. */
    defaultShare?: number;
    embeddedElectricityMwhPerT?: number;
    /** 이 행을 그대로 쓸 수 없는 이유 */
    problem?: string;
}

export interface SupplierReply {
    filename: string;
    installationName: string;
    country: string;
    periodStart?: string;
    periodEnd?: string;
    verifierName: string;
    rows: SupplierReplyRow[];
    /** 파일 전체의 문제(시트 없음·헤더 없음 등). 있으면 rows가 비어 있다. */
    fileProblem?: string;
}

const norm = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
const digitsOf = (value: string) => value.replace(/\D/g, '');

function columnIndex(column: string): number {
    let result = 0;
    for (const char of column) {
        result = result * 26 + (char.charCodeAt(0) - 64);
    }
    return result;
}

const sortedCells = (row: { valuesByColumn: Map<string, string> }) =>
    Array.from(row.valuesByColumn.entries()).sort((a, b) => columnIndex(a[0]) - columnIndex(b[0]));

function toNumber(value: string | undefined): number | undefined {
    if (value === undefined || value.trim() === '') {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

/** 엑셀 날짜(일련번호 또는 ISO 문자열) → YYYY-MM-DD */
export function excelDateToIso(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
        return `${iso[1]}-${iso[2]}-${iso[3]}`;
    }
    const serial = Number(value);
    if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) {
        return undefined;
    }
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
}

/** 라벨 칸(왼쪽) 뒤에서 처음 나오는 값 칸을 읽는다. 라벨은 E열, 값은 I열처럼 떨어져 있어도 된다. */
function valueAfterLabel(rows: SheetRows, matchesLabel: (label: string) => boolean, startAfterRow = 0): string {
    for (const row of rows) {
        if (row.rowNumber <= startAfterRow) continue;
        const cells = sortedCells(row);
        const labelAt = cells.findIndex(([, value]) => matchesLabel(norm(value)));
        if (labelAt >= 0) {
            const found = cells.slice(labelAt + 1).find(([, value]) => value.trim() !== '');
            if (found) return found[1].trim();
        }
    }
    return '';
}

export function parseSupplierReply(input: { filename: string; summaryProducts?: SheetRows; instData?: SheetRows }): SupplierReply {
    const empty: SupplierReply = { filename: input.filename, installationName: '', country: '', verifierName: '', rows: [] };

    if (!input.summaryProducts) {
        return { ...empty, fileProblem: 'Summary_Products 시트가 없습니다. 공급사가 EU Communication Template(CBAM 배출량 통신 양식)을 채워 보낸 파일인지 확인하세요.' };
    }

    // 헤더 행을 글자로 찾는다 — 양식 판이 바뀌어 열이 밀려도 읽히게(고정 열 번호에 기대지 않는다).
    const headerRow = input.summaryProducts.find((row) => {
        const texts = sortedCells(row).map(([, value]) => norm(value));
        return texts.includes('cn codes') && texts.some((text) => text.startsWith('see (direct)'));
    });
    if (!headerRow) {
        return { ...empty, fileProblem: 'Summary_Products 시트에서 「CN Codes」·「SEE (direct)」 머리글을 찾지 못했습니다. 양식이 다른 파일일 수 있습니다.' };
    }
    const columnOf = (matches: (text: string) => boolean) => sortedCells(headerRow).find(([, value]) => matches(norm(value)))?.[0];
    const columns = {
        cn: columnOf((text) => text === 'cn codes')!,
        process: columnOf((text) => text.startsWith('production process')),
        productName: columnOf((text) => text.startsWith('product name')),
        direct: columnOf((text) => text.startsWith('see (direct)'))!,
        indirect: columnOf((text) => text.startsWith('see (indirect)')),
        unit: columnOf((text) => text === 'unit'),
        defaultShare: columnOf((text) => text.startsWith('share of emissions by default value')),
        electricity: columnOf((text) => text.startsWith('embedded electricity')),
    };

    const rows: SupplierReplyRow[] = [];
    for (const row of input.summaryProducts) {
        if (row.rowNumber <= headerRow.rowNumber) continue;
        const get = (column: string | undefined) => (column ? row.valuesByColumn.get(column) ?? '' : '');
        const cnCode = digitsOf(get(columns.cn));
        // 양식의 예시 행(번호 칸이 「Ex.」)과 CN 없는 빈 행은 건너뛴다.
        if (cnCode.length < 6 || norm(row.valuesByColumn.get('C') ?? '') === 'ex.') continue;

        const directSee = toNumber(get(columns.direct));
        const indirectRaw = get(columns.indirect);
        const indirectSee = toNumber(indirectRaw);
        const unit = get(columns.unit).trim();
        let problem: string | undefined;
        if (directSee === undefined) {
            problem = 'SEE(직접) 계산값이 비어 있습니다 — 공급사가 엑셀에서 열어 저장한 파일이 아니거나 아직 입력하지 않았습니다.';
        } else if (directSee < 0) {
            problem = 'SEE(직접)가 음수입니다.';
        } else if (indirectRaw.trim() !== '' && indirectSee === undefined) {
            problem = 'SEE(간접)를 숫자로 읽을 수 없습니다.';
        } else if (unit && norm(unit).replace(/\s/g, '') !== 'tco2e/t') {
            problem = `단위가 tCO2e/t가 아닙니다(「${unit}」) — 값을 옮기지 않습니다.`;
        }
        rows.push({
            sheetRow: row.rowNumber,
            cnCode,
            productName: get(columns.productName).trim(),
            processName: get(columns.process).trim(),
            directSee,
            indirectSee,
            unit,
            defaultShare: toNumber(get(columns.defaultShare)),
            embeddedElectricityMwhPerT: toNumber(get(columns.electricity)),
            problem,
        });
    }

    const inst = input.instData ?? [];
    const periodRow = inst.find((row) => {
        const texts = sortedCells(row).map(([, value]) => norm(value));
        return texts.includes('start:') && texts.includes('end:');
    });
    const afterLabel = (row: SheetRows[number] | undefined, label: string) => {
        if (!row) return undefined;
        const cells = sortedCells(row);
        const at = cells.findIndex(([, value]) => norm(value) === label);
        return at >= 0 ? cells.slice(at + 1).find(([, value]) => value.trim() !== '')?.[1] : undefined;
    };
    const verifierBlockRow = inst.find((row) => sortedCells(row).some(([, value]) => norm(value).startsWith('name and address of the verifier')))?.rowNumber ?? 0;

    return {
        filename: input.filename,
        installationName: valueAfterLabel(inst, (label) => label.startsWith('name of the installation (english name)')),
        country: valueAfterLabel(inst, (label) => label === 'country:', 0),
        periodStart: excelDateToIso(afterLabel(periodRow, 'start:')),
        periodEnd: excelDateToIso(afterLabel(periodRow, 'end:')),
        verifierName: verifierBlockRow > 0 ? valueAfterLabel(inst, (label) => label === 'company name:', verifierBlockRow) : '',
        rows,
        fileProblem: rows.length === 0 ? 'Summary_Products 시트에 읽을 수 있는 제품 행이 없습니다(예시 행 제외).' : undefined,
    };
}

// ── 우리 전구물질과의 대조 ────────────────────────────────────────────

export type ReplyMatchStatus = 'READY' | 'CHOOSE' | 'NO_MATCH' | 'NO_CN';

export interface ReplyProposal {
    precursorId: string;
    precursorName: string;
    status: ReplyMatchStatus;
    /** 후보 행 — READY는 하나, CHOOSE는 둘 이상 */
    candidates: Array<{ row: SupplierReplyRow; cnMatch: 'EXACT' | 'PARTIAL' }>;
    /** 이 제안을 적용하기 전에 사람이 알아야 할 것 */
    warnings: string[];
    /** 기본으로 체크해 둘 것인가 — 경고가 있는 것은 사람이 켜게 한다 */
    defaultSelected: boolean;
}

const periodOverlaps = (aStart?: string, aEnd?: string, bStart?: string, bEnd?: string) =>
    !aStart || !aEnd || !bStart || !bEnd || (aStart <= bEnd && bStart <= aEnd);

export function matchReplyToPrecursors(input: {
    reply: SupplierReply;
    precursors: Array<Pick<PurchasedPrecursor, 'id' | 'name' | 'precursor_cn_code' | 'period_id'>>;
    /** 보고기간 id → 시작·종료일 */
    periods: Map<string, { start: string; end: string }>;
}): { proposals: ReplyProposal[]; unmatchedRows: SupplierReplyRow[] } {
    const usedRows = new Set<number>();
    const proposals: ReplyProposal[] = input.precursors.map((precursor) => {
        const cn = digitsOf(precursor.precursor_cn_code ?? '');
        if (cn.length < 6) {
            return { precursorId: precursor.id, precursorName: precursor.name, status: 'NO_CN', candidates: [], warnings: ['이 전구물질에 CN 코드가 없어 회신과 맞춰 볼 수 없습니다.'], defaultSelected: false };
        }
        const candidates = input.reply.rows
            .map((row) => ({ row, cnMatch: (row.cnCode === cn ? 'EXACT' : row.cnCode.startsWith(cn) || cn.startsWith(row.cnCode) ? 'PARTIAL' : undefined) as 'EXACT' | 'PARTIAL' | undefined }))
            .filter((candidate): candidate is { row: SupplierReplyRow; cnMatch: 'EXACT' | 'PARTIAL' } => candidate.cnMatch !== undefined);
        // 정확히 같은 CN이 있으면 부분 일치는 후보에서 뺀다.
        const exact = candidates.filter((candidate) => candidate.cnMatch === 'EXACT');
        const picked = exact.length > 0 ? exact : candidates;
        picked.forEach((candidate) => usedRows.add(candidate.row.sheetRow));

        const warnings: string[] = [];
        if (picked.length === 0) {
            return { precursorId: precursor.id, precursorName: precursor.name, status: 'NO_MATCH', candidates: [], warnings: ['이 회신에는 같은 CN의 제품이 없습니다.'], defaultSelected: false };
        }
        if (picked.length > 1) {
            warnings.push('같은 CN의 행이 여러 개입니다(생산경로·제품이 다를 수 있습니다) — 어느 행이 이 전구물질인지 고르세요.');
        }
        if (picked.every((candidate) => candidate.cnMatch === 'PARTIAL')) {
            warnings.push('CN이 앞자리만 일치합니다 — 같은 제품인지 확인하세요.');
        }
        const own = precursor.period_id ? input.periods.get(precursor.period_id) : undefined;
        if (own && !periodOverlaps(input.reply.periodStart, input.reply.periodEnd, own.start, own.end)) {
            warnings.push(`회신의 보고기간(${input.reply.periodStart} ~ ${input.reply.periodEnd})이 우리 보고기간(${own.start} ~ ${own.end})과 겹치지 않습니다.`);
        }
        const status: ReplyMatchStatus = picked.length === 1 ? 'READY' : 'CHOOSE';
        if (picked.length === 1 && picked[0].row.problem) {
            warnings.push(picked[0].row.problem);
        }
        return {
            precursorId: precursor.id,
            precursorName: precursor.name,
            status,
            candidates: picked,
            warnings,
            defaultSelected: status === 'READY' && warnings.length === 0,
        };
    });

    return { proposals, unmatchedRows: input.reply.rows.filter((row) => !usedRows.has(row.sheetRow)) };
}

/**
 * 회신 한 행을 전구물질에 옮길 때 바뀌는 필드. 값은 파일의 숫자 그대로다(반올림·환산 없음).
 * 공급사 확인(SUPPLIER_CONFIRMED)까지만 올린다 — 제3자 검증보고서는 사람이 확인해 직접 올린다.
 */
export function buildReplyUpdate(row: SupplierReplyRow, reply: SupplierReply): Partial<PurchasedPrecursor> {
    if (row.problem || row.directSee === undefined) {
        throw new Error(`회신 ${row.sheetRow}행은 적용할 수 없습니다: ${row.problem ?? '직접 SEE가 없습니다.'}`);
    }
    const indirect = row.indirectSee ?? 0;
    const partial = (row.defaultShare ?? 0) > 0;
    const period = reply.periodStart && reply.periodEnd ? `${reply.periodStart} ~ ${reply.periodEnd}` : undefined;
    const update: Partial<PurchasedPrecursor> = {
        data_mode: partial ? 'SEMI_ACTUAL' : 'ACTUAL',
        verification_status: 'SUPPLIER_CONFIRMED',
        direct_see_tco2e_per_t: row.directSee,
        indirect_see_tco2e_per_t: indirect,
        source: `공급사 회신: ${reply.filename}${reply.installationName ? ` (${reply.installationName})` : ''} · Summary_Products ${row.sheetRow}행`,
        // 기본값을 쓰던 근거 문구는 더 이상 이 값의 근거가 아니다.
        default_value_justification: '',
    };
    if (reply.installationName) update.supplier_installation = reply.installationName;
    if (period) update.supplier_reporting_period = period;
    if ((row.embeddedElectricityMwhPerT ?? 0) > 0 && indirect > 0) {
        // 간접 SEE = 전력량 × 계수. 계수는 파일의 두 값에서 거꾸로 구한다 — 권위 있는 값은 indirect_see_tco2e_per_t 하나다.
        update.indirect_electricity_mwh_per_t = row.embeddedElectricityMwhPerT;
        update.indirect_electricity_factor_tco2e_per_mwh = indirect / row.embeddedElectricityMwhPerT!;
    }
    return update;
}
