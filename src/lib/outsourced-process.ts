import { outsourcedElectricityMwh, ownElectricityMwh } from './electricity-own-share';
import type { OutsourcedBasis, OutsourcedElectricityShare, OutsourcedEquipment, OutsourcedProcessInfo, OutsourcedTechnique, ProductionProcess, SourceStream } from './local-db';
import { STEEL_BOUNDARY_ANCHOR } from './steel-boundary';

/**
 * 외주 임가공 공정의 연료 몫 — EC CBAM Q&A 2026-05-27 4.31: 철강제품 경계 안의 공정(열처리·코팅·용융아연도금 등)을 외주사에서 하고
 * 물건이 돌아오면 「우리 사업장에서 일어난 것처럼」 다룬다. 외주처가 우리 부품에 쓴 연료는 우리 공정의 직접배출에 그대로 더한다.
 * 돌아온 부품은 전구물질이 아니다(구매 강재 칸에 넣으면 이중계산).
 * 설계: docs/harness/outsourced-process-input-design.md · 규정 근거: docs/harness/outsourced-processes-regulation-check.md
 *
 * 이 파일은 순수 계산·검사다(저장하지 않는다). 엔진은 건드리지 않는다 — 몫은 보통 연료 배출원(SourceStream)의 activity_data로 들어가고,
 * `outsourced` 필드는 출처·근거 기록일 뿐이다.
 */

export const OUTSOURCED_TECHNIQUE_LABEL: Record<OutsourcedTechnique, string> = {
    HEAT_TREATMENT: '열처리·소둔',
    ZINC_FLAKE_COATING: '아연 플레이크 코팅(다크로·지오메트 등, 비전해)',
    HOT_DIP_GALVANIZING: '용융아연도금',
    OTHER_COATING: '그 밖의 코팅',
    ELECTROPLATING: '전기도금',
};

export const OUTSOURCED_BASIS_LABEL: Record<OutsourcedBasis, string> = {
    METERED_LINE: '그 공정 설비의 계량값',
    RECONSTRUCTED: '설비 소비율 × 가동시간으로 재구성 (고지서 총량에 맞춤)',
    OUTPUT_MASS: '같은 설비의 처리 중량 비율',
    CONSERVATIVE_ESTIMATE: '보수적 추정',
};

export const OUTSOURCED_BASIS_ANCHOR: Record<OutsourcedBasis, string> = {
    METERED_LINE: '2025/2547 부속서 II A.3(1) · 부속서 III A.2',
    RECONSTRUCTED: '2025/2547 부속서 II A.3(2)(b) · 부속서 III A.1 식 41·42',
    OUTPUT_MASS: '2025/2547 부속서 III A.2',
    CONSERVATIVE_ESTIMATE: '2025/2547 부속서 II A.1 5항',
};

/** 코팅은 전해 여부로 coating(경계 안)과 plating(경계 밖)이 갈려 분류 근거를 남겨야 한다. */
const NEEDS_TECHNIQUE_EVIDENCE: OutsourcedTechnique[] = ['ZINC_FLAKE_COATING', 'OTHER_COATING'];

/** 재구성 합계가 고지서 총량과 이만큼 이상 어긋나면 설비 목록을 점검하라고 알린다(임시 기준 — 사례가 쌓이면 조정). */
export const RECONSTRUCTION_TOLERANCE = 0.2;

const isFiniteOut = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const roundOut = (value: number, digits = 6) => Math.round(value * 10 ** digits) / 10 ** digits;
const fmtOut = (value: number) => roundOut(value, 3).toLocaleString('ko-KR', { maximumFractionDigits: 3 });

export type OutsourcedShareResult =
    | { ok: true; share: number; formula: string; reconciliationFactor?: number; warnings: string[] }
    | { ok: false; reason: string };

/** 입력만 보고 우리 몫(활동량)을 계산한다. 단위는 입력과 같다. */
export function computeOutsourcedShare(info: Pick<OutsourcedProcessInfo,
    'basis' | 'company_total' | 'line_quantity' | 'our_throughput_t' | 'line_throughput_t' | 'equipment' | 'estimate_quantity'>, energy: 'fuel' | 'electricity' = 'fuel'): OutsourcedShareResult {
    const warnings: string[] = [];
    // 문구만 다르다 — 계산은 같다(활동량 단위는 입력과 같다: 연료는 Nm³·t, 전력은 MWh).
    const amount = energy === 'electricity' ? '전력량' : '연료량';
    const user = energy === 'electricity' ? '전기 사용처' : '가스 사용처';
    const isPositiveOut = (value: number | undefined) => isFiniteOut(value) && value > 0;

    if (info.basis === 'CONSERVATIVE_ESTIMATE') {
        if (!isPositiveOut(info.estimate_quantity)) return { ok: false, reason: '보수적 추정은 추정한 활동량(0보다 큰 값)을 적어야 합니다.' };
        return { ok: true, share: roundOut(info.estimate_quantity!), formula: `보수적 추정 ${fmtOut(info.estimate_quantity!)}`, warnings };
    }

    if (info.basis === 'METERED_LINE' || info.basis === 'OUTPUT_MASS') {
        if (!isPositiveOut(info.line_quantity)) return { ok: false, reason: `그 공정 설비의 ${amount}(0보다 큰 값)을 적어야 합니다.` };
        const hasThroughput = isFiniteOut(info.our_throughput_t) || isFiniteOut(info.line_throughput_t);
        if (info.basis === 'OUTPUT_MASS' && !hasThroughput) return { ok: false, reason: '처리 중량 비율로 나누려면 우리 처리량과 설비 전체 처리량을 적어야 합니다.' };
        if (!hasThroughput) {
            // 우리만 쓰는 전용 설비·전용 계량 — 설비 연료량이 곧 우리 몫이다.
            return { ok: true, share: roundOut(info.line_quantity!), formula: `우리 전용 설비의 ${amount} ${fmtOut(info.line_quantity!)}`, warnings };
        }
        if (!isPositiveOut(info.our_throughput_t) || !isPositiveOut(info.line_throughput_t)) return { ok: false, reason: '우리 처리량과 설비 전체 처리량을 모두 0보다 큰 값으로 적어야 합니다.' };
        if (info.our_throughput_t! > info.line_throughput_t!) return { ok: false, reason: '우리 처리량이 설비 전체 처리량보다 클 수 없습니다.' };
        const share = info.line_quantity! * (info.our_throughput_t! / info.line_throughput_t!);
        return { ok: true, share: roundOut(share), formula: `${fmtOut(info.line_quantity!)} × (${fmtOut(info.our_throughput_t!)} ÷ ${fmtOut(info.line_throughput_t!)} t) = ${fmtOut(share)}`, warnings };
    }

    // RECONSTRUCTED
    const equipment = info.equipment ?? [];
    if (equipment.length === 0) return { ok: false, reason: '재구성하려면 설비 목록(이름·가동시간·소비율)을 적어야 합니다.' };
    if (!isPositiveOut(info.company_total)) return { ok: false, reason: `재구성한 값을 고지서 총량에 맞추려면 외주처 전체 ${amount}(0보다 큰 값)이 필요합니다.` };
    for (const item of equipment) {
        if (!isFiniteOut(item.hours) || item.hours < 0 || !isFiniteOut(item.rate_per_h) || item.rate_per_h < 0) return { ok: false, reason: `설비 「${item.name}」의 가동시간·소비율은 0 이상의 숫자여야 합니다.` };
    }
    const ours = equipment.filter((item) => item.ours);
    if (ours.length === 0) return { ok: false, reason: '우리 부품을 처리하는 설비를 하나 이상 표시해 주세요.' };
    const reconstructed = equipment.reduce((sum, item) => sum + item.hours * item.rate_per_h, 0);
    if (!(reconstructed > 0)) return { ok: false, reason: `재구성한 ${amount}이 0입니다 — 가동시간과 ${energy === 'electricity' ? '정격 전력' : '소비율'}을 확인해 주세요.` };
    const ourReconstructed = ours.reduce((sum, item) => sum + item.hours * item.rate_per_h, 0);
    const factor = info.company_total! / reconstructed;
    const share = ourReconstructed * factor;
    if (Math.abs(factor - 1) > RECONSTRUCTION_TOLERANCE) {
        warnings.push(`재구성 합계 ${fmtOut(reconstructed)}가 고지서 총량 ${fmtOut(info.company_total!)}과 ${roundOut(Math.abs(factor - 1) * 100, 1)}% 어긋납니다 — 설비 목록에 빠진 ${user}가 없는지, ${energy === 'electricity' ? '정격 전력' : '소비율'}·가동시간이 맞는지 확인하세요.`);
    }
    return {
        ok: true,
        share: roundOut(share),
        formula: `재구성 합계 ${fmtOut(reconstructed)} → 보정계수 ${roundOut(factor, 4)} (= 총량 ${fmtOut(info.company_total!)} ÷ 합계), 우리 설비 ${fmtOut(ourReconstructed)} × ${roundOut(factor, 4)} = ${fmtOut(share)}`,
        reconciliationFactor: roundOut(factor, 6),
        warnings,
    };
}

/**
 * 서식의 설비 칸 「이름:가동시간:소비율; 이름:가동시간:소비율」을 읽는다. 이름에는 : 와 ; 를 쓰지 않는다.
 * 빈 칸은 설비 없음. 형식이 틀린 항목이 있으면 error를 돌려준다(일부만 읽지 않는다).
 */
export function parseOutsourcedEquipment(text: string | undefined, ours: boolean): { items: OutsourcedEquipment[]; error?: string } {
    const items: OutsourcedEquipment[] = [];
    for (const part of (text ?? '').split(';').map((item) => item.trim()).filter(Boolean)) {
        const pieces = part.split(':').map((item) => item.trim());
        const hours = Number(pieces[1]?.replace(/,/g, ''));
        const rate = Number(pieces[2]?.replace(/,/g, ''));
        if (pieces.length !== 3 || !pieces[0] || pieces[1] === '' || pieces[2] === '' || !Number.isFinite(hours) || !Number.isFinite(rate) || hours < 0 || rate < 0) {
            return { items: [], error: `설비 「${part}」는 「이름:가동시간:소비율」 모양으로 적어 주세요(예: 코팅라인1:600:50; 이름에는 : 와 ; 를 쓰지 않습니다).` };
        }
        items.push({ name: pieces[0], hours, rate_per_h: rate, ...(ours ? { ours: true } : {}) });
    }
    return { items };
}

export interface OutsourcedValidation {
    errors: string[];
    /** 저장은 되지만 「확인 필요」로 남길 것 */
    reviews: string[];
}

/** 저장 전 검사. errors가 있으면 저장하지 않는다. */
export function validateOutsourcedInfo(info: OutsourcedProcessInfo): OutsourcedValidation {
    const errors: string[] = [];
    const reviews: string[] = [];
    if (!info.subcontractor?.trim()) errors.push('외주처 이름을 적어 주세요.');
    if (info.technique === 'ELECTROPLATING') {
        errors.push(`전기도금(plating)은 철강 제품의 시스템 경계 밖이라 넣지 않습니다(${STEEL_BOUNDARY_ANCHOR}). 전류 없이 피막을 입히는 코팅이라면 공정 종류를 바꾸고 근거를 적으세요.`);
    }
    if (info.basis === 'CONSERVATIVE_ESTIMATE' && !info.note?.trim()) errors.push('보수적 추정은 근거(설비 정격·가동시간·부하율 등 계산)를 적어야 합니다.');
    if (info.basis === 'CONSERVATIVE_ESTIMATE') reviews.push('보수적 추정입니다 — 설비 사양·가동기록으로 확인하고 가능하면 외주처 실제 자료로 바꾸세요.');
    if (NEEDS_TECHNIQUE_EVIDENCE.includes(info.technique) && !info.technique_evidence?.trim()) {
        reviews.push('코팅은 전해(plating, 경계 밖)와 비전해(coating, 경계 안)로 갈립니다 — 비전해 방식이라는 분류 근거(공정 설명서·ISO 10683 등)를 적어 두세요.');
    }
    if (!info.evidence?.trim()) reviews.push('외주처 고지서·가동기록·계약서 등 증빙이 비어 있습니다.');
    return { errors, reviews };
}

/** 외주처 전력 몫 저장 전 검사 — 연료 몫과 같은 검사에 우리 몫(MWh)과 같은 계통 확인을 더한다. */
export function validateOutsourcedElectricityShare(share: OutsourcedElectricityShare): OutsourcedValidation {
    const result = validateOutsourcedInfo(share);
    if (!isFiniteOut(share.mwh) || !(share.mwh > 0)) result.errors.push('외주처 전력의 우리 몫(MWh)은 0보다 커야 합니다.');
    if (share.same_grid !== true) {
        result.errors.push('외주처가 이 공정과 같은 나라의 계통 전력을 쓰는지 확인해 주세요 — 전력 배출계수가 하나라서 다른 나라 외주처의 전력은 아직 받지 않습니다(검증인과 처리 방식을 따로 정하세요).');
    }
    return result;
}

/** 우리 몫을 공정별로 나눈다(합계 = total). fractions는 합이 1이어야 하고 마지막 공정이 반올림 차이를 받는다. */
export function splitOutsourcedShare(total: number, fractions: number[]): number[] | undefined {
    if (fractions.length === 0 || fractions.some((value) => !isFiniteOut(value) || value < 0)) return undefined;
    const sum = fractions.reduce((acc, value) => acc + value, 0);
    if (Math.abs(sum - 1) > 1e-6) return undefined;
    const parts = fractions.map((value) => roundOut(total * value));
    const rest = roundOut(total - parts.slice(0, -1).reduce((acc, value) => acc + value, 0));
    return [...parts.slice(0, -1), rest];
}

export type OutsourcedStreamTemplate = Omit<SourceStream, 'id' | 'created_at' | 'updated_at' | 'name' | 'activity_data' | 'process_id' | 'period_id' | 'source' | 'outsourced' | 'shared_meter' | 'heat_system'>;

/** 외주 몫을 우리 공정별 연료 배출원 초안으로 만든다(저장은 호출한 쪽). */
export function buildOutsourcedStreamDrafts(input: {
    info: OutsourcedProcessInfo;
    total: number;
    processes: Array<{ id: string; name: string; period_id?: string; fraction: number }>;
    template: OutsourcedStreamTemplate;
    fuelName: string;
    source: string;
}): { ok: true; drafts: Array<Omit<SourceStream, 'id' | 'created_at' | 'updated_at'>> } | { ok: false; reason: string } {
    const validation = validateOutsourcedInfo(input.info);
    if (validation.errors.length > 0) return { ok: false, reason: validation.errors[0] };
    const parts = splitOutsourcedShare(input.total, input.processes.map((process) => process.fraction));
    if (!parts) return { ok: false, reason: '공정별 비율의 합이 1(100%)이어야 합니다.' };
    return {
        ok: true,
        drafts: input.processes.map((process, index) => ({
            ...input.template,
            period_id: process.period_id,
            process_id: process.id,
            name: `(외주) ${input.info.subcontractor.trim()} — ${OUTSOURCED_TECHNIQUE_LABEL[input.info.technique]} · ${input.fuelName}${input.processes.length > 1 ? ` · ${process.name}` : ''}`,
            activity_data: parts[index],
            source: `${input.source.trim()} · 외주 공정 몫(EC Q&A 4.31, ${OUTSOURCED_BASIS_ANCHOR[input.info.basis]})`,
            outsourced: { ...input.info, total_share: input.total },
        })),
    };
}

export interface OutsourcedIssue {
    code: 'OUT01' | 'OUT02' | 'OUT03' | 'OUT04' | 'OUT05';
    level: 'fix' | 'review';
    streamId: string;
    message: string;
}

/**
 * 외주 몫 행들의 점검(귀속·할당 점검 V10).
 *  OUT01 추정이거나 근거(note)가 비었다 · OUT02 우리 몫이 설비·외주처 총량보다 크다 · OUT03 코팅인데 분류 근거가 비었다 ·
 *  OUT04 같은 외주처가 구매 강재에도 있다(이중계산 가능) · OUT05 같은 총량에서 나눈 행들의 합이 총량보다 크다.
 */
export function checkOutsourcedStreams(streams: SourceStream[], precursors: Array<{ name?: string; supplier_installation?: string }> = []): OutsourcedIssue[] {
    const rows = streams.filter((stream) => stream.outsourced);
    const issues: OutsourcedIssue[] = [];
    const label = (stream: SourceStream) => `「${stream.name}」`;
    for (const stream of rows) {
        const info = stream.outsourced!;
        if (info.basis === 'CONSERVATIVE_ESTIMATE' || !info.note?.trim()) {
            issues.push({ code: 'OUT01', level: 'review', streamId: stream.id, message: `${label(stream)}: ${info.basis === 'CONSERVATIVE_ESTIMATE' ? '보수적 추정입니다' : '근거(note)가 비어 있습니다'} — 설비 사양·가동기록·외주처 자료로 확인하세요(${OUTSOURCED_BASIS_ANCHOR.CONSERVATIVE_ESTIMATE}).` });
        }
        const limit = isFiniteOut(info.line_quantity) ? info.line_quantity : info.company_total;
        if (isFiniteOut(limit) && stream.activity_data > limit + 1e-9) {
            issues.push({ code: 'OUT02', level: 'fix', streamId: stream.id, message: `${label(stream)}: 우리 몫 ${fmtOut(stream.activity_data)}이(가) 외주처 ${isFiniteOut(info.line_quantity) ? '설비' : '전체'} 연료량 ${fmtOut(limit)}보다 큽니다.` });
        }
        if (isFiniteOut(info.our_throughput_t) && isFiniteOut(info.line_throughput_t) && info.our_throughput_t > info.line_throughput_t) {
            issues.push({ code: 'OUT02', level: 'fix', streamId: stream.id, message: `${label(stream)}: 우리 처리량 ${fmtOut(info.our_throughput_t)} t이(가) 설비 전체 처리량 ${fmtOut(info.line_throughput_t)} t보다 큽니다.` });
        }
        if (NEEDS_TECHNIQUE_EVIDENCE.includes(info.technique) && !info.technique_evidence?.trim()) {
            issues.push({ code: 'OUT03', level: 'review', streamId: stream.id, message: `${label(stream)}: 코팅의 분류 근거(비전해 방식)가 비어 있습니다 — 전해식이면 plating이라 경계 밖입니다.` });
        }
        const name = info.subcontractor.trim().toLowerCase();
        const doubled = precursors.find((precursor) => name && `${precursor.name ?? ''} ${precursor.supplier_installation ?? ''}`.toLowerCase().includes(name));
        if (doubled) {
            issues.push({ code: 'OUT04', level: 'review', streamId: stream.id, message: `${label(stream)}: 같은 외주처 「${info.subcontractor.trim()}」가 구매 강재에도 적혀 있습니다 — 외주 임가공으로 돌아온 부품은 구매 강재가 아니라 이 외주 몫으로만 넣습니다(이중계산).` });
        }
    }
    // OUT05: 같은 외주 몫(외주처·공정 종류·방법·총 몫·기간)에서 나온 행들의 합이 total_share와 다르다
    const groups = new Map<string, SourceStream[]>();
    for (const stream of rows) {
        const info = stream.outsourced!;
        if (!isFiniteOut(info.total_share)) continue;
        const key = [info.subcontractor.trim(), info.technique, info.basis, stream.activity_unit, stream.period_id ?? '', info.total_share].join('|');
        groups.set(key, [...(groups.get(key) ?? []), stream]);
    }
    for (const group of groups.values()) {
        const total = group[0].outsourced!.total_share!;
        const sum = group.reduce((acc, stream) => acc + stream.activity_data, 0);
        if (sum > total + 1e-6) {
            issues.push({ code: 'OUT05', level: 'fix', streamId: group[0].id, message: `「${group[0].outsourced!.subcontractor.trim()}」 외주 몫의 공정별 합계 ${fmtOut(sum)}이(가) 총 몫 ${fmtOut(total)}보다 큽니다 — 같은 연료가 둘 이상의 공정에 겹쳐 들어갔을 수 있습니다.` });
        }
    }
    return issues;
}

export interface OutsourcedGroup {
    key: string;
    subcontractor: string;
    technique: OutsourcedTechnique;
    basis: OutsourcedBasis;
    unit: string;
    periodId?: string;
    /** 이 외주 몫의 우리 공정별 행들의 합 */
    total: number;
    members: SourceStream[];
    info: OutsourcedProcessInfo;
}

/** 외주 몫 행들을 한 건(같은 외주처·공정 종류·방법·총 몫·기간)으로 묶는다 — 산정보고서·모니터링 계획·할 일이 같은 묶음을 쓴다. */
export function groupOutsourcedStreams(streams: SourceStream[]): OutsourcedGroup[] {
    const groups = new Map<string, OutsourcedGroup>();
    // 저장소는 키(UUID) 순으로 돌려준다 — 입력한 순서(만든 순)로 정렬해 문서의 표가 입력 순서를 따르게 한다.
    const ordered = [...streams].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));
    for (const stream of ordered) {
        const info = stream.outsourced;
        if (!info) continue;
        const key = [info.subcontractor.trim(), info.technique, info.basis, info.total_share ?? '', stream.period_id ?? ''].join('|');
        const found = groups.get(key);
        if (found) {
            found.members.push(stream);
            found.total += stream.activity_data;
        } else {
            groups.set(key, { key, subcontractor: info.subcontractor.trim(), technique: info.technique, basis: info.basis, unit: stream.activity_unit, periodId: stream.period_id, total: stream.activity_data, members: [stream], info });
        }
    }
    return Array.from(groups.values());
}

/**
 * 외주처의 연료 몫은 입력했는데 그 외주처의 전기(간접배출)는 입력하지 않았을 때 보고서·모니터링 계획에 남기는 문장(씨밤이 run40 P2-02).
 * 전기를 아예 안 쓰는 외주처도 있으므로 「빠졌다」고 단정하지 않고, 입력 위치와 확인할 일을 알린다. 전기 몫이 이미 있는 외주처는 이름에서 뺀다.
 */
export function outsourcedElectricityMissingNotice(subcontractors: string[]): string {
    if (subcontractors.length === 0) return '';
    return `외주처 ${subcontractors.map((name) => `「${name}」`).join('·')}의 전기(간접배출)는 입력되지 않았습니다. 외주처가 우리 부품에 전기도 썼다면 지도 4단계 「외주사가 우리 부품에 쓴 전기」(또는 서식 13_외주공정 시트의 에너지 칸 「전기」)에 입력하세요. 쓰지 않았거나 무시할 만하다면 그 이유를 검증인에게 설명할 수 있게 남기세요.`;
}

/** 연료 몫은 있는데 같은 외주처의 전기 몫이 없는 외주처 이름(입력 순서). 같은 보고기간끼리 비교한다. */
export function fuelSubcontractorsWithoutElectricity(streams: SourceStream[], processes: Array<Pick<ProductionProcess, 'period_id'> & Partial<Pick<ProductionProcess, 'outsourced_electricity'>>>): string[] {
    const electric = new Set<string>();
    for (const process of processes) {
        for (const share of process.outsourced_electricity ?? []) electric.add(`${share.subcontractor.trim().toLowerCase()}|${process.period_id ?? ''}`);
    }
    const names: string[] = [];
    for (const group of groupOutsourcedStreams(streams)) {
        if (electric.has(`${group.subcontractor.toLowerCase()}|${group.periodId ?? ''}`)) continue;
        if (!names.includes(group.subcontractor)) names.push(group.subcontractor);
    }
    return names;
}

/** 외주처에 요청할 최소 증빙자료(검증에서 근거로 쓴다) */
export const OUTSOURCED_DATA_REQUEST = [
    '연간·월별 가스(연료) 고지서',
    '연료 사용 설비 목록과 계량기 계통도',
    '설비별 정격 연료소비율·설비 사양서',
    '설비별 월별·배치별 가동시간',
    '우리 제품과 타사 제품의 처리량',
    '소성·경화 온도, 체류시간, 코팅 횟수',
    '설비 시험자료 또는 일시적 실측자료',
    '배분 계산서와 총량 대사표',
];

/** 외주처에 요청할 전기 자료(외주처 전력 몫) */
export const OUTSOURCED_ELECTRICITY_DATA_REQUEST = [
    '연간·월별 전력 고지서',
    '전기 사용 설비 목록과 계량기 계통도',
    '설비별 정격 전력(kW)·설비 사양서',
    '설비별 월별·배치별 가동시간',
    '우리 제품과 타사 제품의 처리량',
    '설비 시험자료 또는 일시적 실측자료',
    '배분 계산서와 총량 대사표',
];

/** 이 외주 몫에 외주처에서 더 받아야 할 자료가 있는가(추정이거나 근거·증빙·분류 근거가 비었다) */
export function outsourcedGroupNeedsData(group: OutsourcedGroup): boolean {
    const info = group.info;
    return info.basis === 'CONSERVATIVE_ESTIMATE'
        || !info.note?.trim()
        || !info.evidence?.trim()
        || (NEEDS_TECHNIQUE_EVIDENCE.includes(info.technique) && !info.technique_evidence?.trim());
}

/** 외주 전력 몫에 외주처에서 더 받아야 할 자료가 있는가(연료 몫과 같은 기준) */
export function outsourcedElectricityGroupNeedsData(group: OutsourcedElectricityGroup): boolean {
    const info = group.first;
    return info.basis === 'CONSERVATIVE_ESTIMATE'
        || !info.note?.trim()
        || !info.evidence?.trim()
        || (NEEDS_TECHNIQUE_EVIDENCE.includes(info.technique) && !info.technique_evidence?.trim());
}

export interface OutsourcedElectricityIssue {
    code: 'OUTE01' | 'OUTE02' | 'OUTE03' | 'OUTE04' | 'OUTE05';
    level: 'fix' | 'review';
    processId: string;
    message: string;
}

/**
 * 외주처 전력 몫의 점검(귀속·할당 점검 V10).
 *  OUTE01 추정이거나 근거(note)가 비었다 · OUTE02 공정 전력 합계가 외주 몫 합보다 작다(다시 나누거나 직접 고치며 외주 몫이 지워졌다) ·
 *  OUTE03 같은 나라 계통 전력이라는 확인이 없다 · OUTE04 우리 몫이 외주처 설비·전체 전력보다 크다 ·
 *  OUTE05 공정의 전력 배출계수가 비어 있다(계수가 0이면 외주 전력도 0 배출로 계산된다).
 */
export function checkOutsourcedElectricity(processes: Array<Pick<ProductionProcess, 'id' | 'name' | 'electricity_mwh'> & Partial<Pick<ProductionProcess, 'electricity_ef_tco2e_per_mwh'>> & Partial<Pick<ProductionProcess, 'outsourced_electricity'>>>): OutsourcedElectricityIssue[] {
    const issues: OutsourcedElectricityIssue[] = [];
    for (const process of processes) {
        const shares = process.outsourced_electricity ?? [];
        if (shares.length === 0) continue;
        const label = `「${process.name}」`;
        const outsourced = outsourcedElectricityMwh(process);
        if (process.electricity_mwh + 1e-6 < outsourced) {
            issues.push({ code: 'OUTE02', level: 'fix', processId: process.id, message: `${label}: 전력 사용량 ${fmtOut(process.electricity_mwh)} MWh가 외주처 전력 몫 합 ${fmtOut(outsourced)} MWh보다 작습니다 — 전력을 다시 나누거나 직접 고치면서 외주 몫이 빠졌을 수 있습니다. 외주 몫을 다시 입력하세요.` });
        }
        if (!((process.electricity_ef_tco2e_per_mwh ?? 0) > 0)) {
            issues.push({ code: 'OUTE05', level: 'fix', processId: process.id, message: `${label}: 전력 배출계수가 비어 있어 외주처 전력이 0 배출로 계산됩니다 — 지도 5단계에서 전력 배출계수를 넣으세요.` });
        }
        for (const share of shares) {
            const who = `${label} 외주처 「${share.subcontractor.trim()}」`;
            if (share.basis === 'CONSERVATIVE_ESTIMATE' || !share.note?.trim()) {
                issues.push({ code: 'OUTE01', level: 'review', processId: process.id, message: `${who} 전력: ${share.basis === 'CONSERVATIVE_ESTIMATE' ? '보수적 추정입니다' : '근거(note)가 비어 있습니다'} — 설비 사양·가동기록·외주처 자료로 확인하세요(${OUTSOURCED_BASIS_ANCHOR.CONSERVATIVE_ESTIMATE}).` });
            }
            if (share.same_grid !== true) {
                issues.push({ code: 'OUTE03', level: 'fix', processId: process.id, message: `${who} 전력: 같은 나라 계통 전력이라는 확인이 없습니다 — 공정의 전력 배출계수 하나로 계산하므로 검증인과 처리 방식을 정하세요.` });
            }
            const limit = isFiniteOut(share.line_quantity) ? share.line_quantity : share.company_total;
            if (isFiniteOut(limit) && share.mwh > limit + 1e-9) {
                issues.push({ code: 'OUTE04', level: 'fix', processId: process.id, message: `${who} 전력: 우리 몫 ${fmtOut(share.mwh)} MWh가 외주처 ${isFiniteOut(share.line_quantity) ? '설비' : '전체'} 전력 ${fmtOut(limit)} MWh보다 큽니다.` });
            }
        }
    }
    return issues;
}

/** 외주 전력 몫 한 건(같은 외주처·공정 종류·방법·총 몫·기간)을 알아보는 열쇠. */
export const outsourcedElectricityKey = (share: OutsourcedElectricityShare, periodId: string | undefined) =>
    [share.subcontractor.trim(), share.technique, share.basis, share.total_share ?? '', periodId ?? ''].join('|');

export interface OutsourcedElectricityGroup {
    key: string;
    first: OutsourcedElectricityShare;
    members: Array<{ process: ProductionProcess; share: OutsourcedElectricityShare }>;
    /** 공정별 몫의 합 (MWh) */
    total: number;
}

/** 공정들에 흩어진 외주 전력 몫을 한 건씩 묶는다(입력 순서 유지). */
export function groupOutsourcedElectricity(processes: ProductionProcess[]): OutsourcedElectricityGroup[] {
    const groups = new Map<string, OutsourcedElectricityGroup>();
    for (const process of processes) {
        for (const share of process.outsourced_electricity ?? []) {
            const key = outsourcedElectricityKey(share, process.period_id);
            const group = groups.get(key) ?? { key, first: share, members: [], total: 0 };
            group.members.push({ process, share });
            group.total = roundOut(group.total + share.mwh);
            groups.set(key, group);
        }
    }
    return [...groups.values()];
}

const withElectricityShares = <T extends ProductionProcess>(process: T, shares: OutsourcedElectricityShare[]): T => {
    // 자체 몫은 그대로 두고 외주 몫만 바꾼다 — 합계(electricity_mwh)는 자체 몫 + 새 외주 몫 합.
    const base: T = { ...process, outsourced_electricity: shares.length > 0 ? shares : undefined };
    return { ...base, electricity_mwh: roundOut(ownElectricityMwh(process) + outsourcedElectricityMwh(base)) };
};

/**
 * 외주 전력 몫을 저장한 뒤의 공정들을 만든다(바뀐 공정만 돌려준다). editKey가 있으면 그 건의 옛 몫을 먼저 걷어낸다.
 * 우리 몫(total, MWh)은 고른 공정에 fraction 비율로 나눈다.
 */
export function buildOutsourcedElectricityUpdates<T extends ProductionProcess>(processes: T[], input: {
    editKey?: string;
    info: OutsourcedProcessInfo;
    sameGrid: boolean;
    total: number;
    targets: Array<{ processId: string; fraction: number }>;
}): { ok: true; updates: T[] } | { ok: false; reason: string } {
    const parts = splitOutsourcedShare(input.total, input.targets.map((target) => target.fraction));
    if (!parts) return { ok: false, reason: '공정별 비율의 합이 1(100%)이어야 합니다.' };
    const record = (mwh: number): OutsourcedElectricityShare => ({ ...input.info, mwh, same_grid: input.sameGrid, total_share: input.total });
    const validation = validateOutsourcedElectricityShare(record(input.total));
    if (validation.errors.length > 0) return { ok: false, reason: validation.errors[0] };
    const updates: T[] = [];
    for (const process of processes) {
        const kept = (process.outsourced_electricity ?? []).filter((share) => !input.editKey || outsourcedElectricityKey(share, process.period_id) !== input.editKey);
        const index = input.targets.findIndex((target) => target.processId === process.id);
        const next = index >= 0 ? [...kept, record(parts[index])] : kept;
        if (index >= 0 || kept.length !== (process.outsourced_electricity ?? []).length) updates.push(withElectricityShares(process, next));
    }
    return { ok: true, updates };
}

/** 외주 전력 몫 한 건을 지운 뒤의 공정들(바뀐 공정만). 합계에서 그 몫만 빠지고 자체 몫은 그대로다. */
export function buildOutsourcedElectricityRemoval<T extends ProductionProcess>(processes: T[], key: string): T[] {
    const updates: T[] = [];
    for (const process of processes) {
        const shares = process.outsourced_electricity ?? [];
        const kept = shares.filter((share) => outsourcedElectricityKey(share, process.period_id) !== key);
        if (kept.length !== shares.length) updates.push(withElectricityShares(process, kept));
    }
    return updates;
}
