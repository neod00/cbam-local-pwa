import type { OutsourcedBasis, OutsourcedEquipment, OutsourcedProcessInfo, OutsourcedTechnique, SourceStream } from './local-db';
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
    'basis' | 'company_total' | 'line_quantity' | 'our_throughput_t' | 'line_throughput_t' | 'equipment' | 'estimate_quantity'>): OutsourcedShareResult {
    const warnings: string[] = [];
    const isPositiveOut = (value: number | undefined) => isFiniteOut(value) && value > 0;

    if (info.basis === 'CONSERVATIVE_ESTIMATE') {
        if (!isPositiveOut(info.estimate_quantity)) return { ok: false, reason: '보수적 추정은 추정한 활동량(0보다 큰 값)을 적어야 합니다.' };
        return { ok: true, share: roundOut(info.estimate_quantity!), formula: `보수적 추정 ${fmtOut(info.estimate_quantity!)}`, warnings };
    }

    if (info.basis === 'METERED_LINE' || info.basis === 'OUTPUT_MASS') {
        if (!isPositiveOut(info.line_quantity)) return { ok: false, reason: '그 공정 설비의 연료량(0보다 큰 값)을 적어야 합니다.' };
        const hasThroughput = isFiniteOut(info.our_throughput_t) || isFiniteOut(info.line_throughput_t);
        if (info.basis === 'OUTPUT_MASS' && !hasThroughput) return { ok: false, reason: '처리 중량 비율로 나누려면 우리 처리량과 설비 전체 처리량을 적어야 합니다.' };
        if (!hasThroughput) {
            // 우리만 쓰는 전용 설비·전용 계량 — 설비 연료량이 곧 우리 몫이다.
            return { ok: true, share: roundOut(info.line_quantity!), formula: `우리 전용 설비의 연료량 ${fmtOut(info.line_quantity!)}`, warnings };
        }
        if (!isPositiveOut(info.our_throughput_t) || !isPositiveOut(info.line_throughput_t)) return { ok: false, reason: '우리 처리량과 설비 전체 처리량을 모두 0보다 큰 값으로 적어야 합니다.' };
        if (info.our_throughput_t! > info.line_throughput_t!) return { ok: false, reason: '우리 처리량이 설비 전체 처리량보다 클 수 없습니다.' };
        const share = info.line_quantity! * (info.our_throughput_t! / info.line_throughput_t!);
        return { ok: true, share: roundOut(share), formula: `${fmtOut(info.line_quantity!)} × (${fmtOut(info.our_throughput_t!)} ÷ ${fmtOut(info.line_throughput_t!)} t) = ${fmtOut(share)}`, warnings };
    }

    // RECONSTRUCTED
    const equipment = info.equipment ?? [];
    if (equipment.length === 0) return { ok: false, reason: '재구성하려면 설비 목록(이름·가동시간·소비율)을 적어야 합니다.' };
    if (!isPositiveOut(info.company_total)) return { ok: false, reason: '재구성한 값을 고지서 총량에 맞추려면 외주처 전체 연료량(0보다 큰 값)이 필요합니다.' };
    for (const item of equipment) {
        if (!isFiniteOut(item.hours) || item.hours < 0 || !isFiniteOut(item.rate_per_h) || item.rate_per_h < 0) return { ok: false, reason: `설비 「${item.name}」의 가동시간·소비율은 0 이상의 숫자여야 합니다.` };
    }
    const ours = equipment.filter((item) => item.ours);
    if (ours.length === 0) return { ok: false, reason: '우리 부품을 처리하는 설비를 하나 이상 표시해 주세요.' };
    const reconstructed = equipment.reduce((sum, item) => sum + item.hours * item.rate_per_h, 0);
    if (!(reconstructed > 0)) return { ok: false, reason: '재구성한 연료량이 0입니다 — 가동시간과 소비율을 확인해 주세요.' };
    const ourReconstructed = ours.reduce((sum, item) => sum + item.hours * item.rate_per_h, 0);
    const factor = info.company_total! / reconstructed;
    const share = ourReconstructed * factor;
    if (Math.abs(factor - 1) > RECONSTRUCTION_TOLERANCE) {
        warnings.push(`재구성 합계 ${fmtOut(reconstructed)}가 고지서 총량 ${fmtOut(info.company_total!)}과 ${roundOut(Math.abs(factor - 1) * 100, 1)}% 어긋납니다 — 설비 목록에 빠진 가스 사용처가 없는지, 소비율·가동시간이 맞는지 확인하세요.`);
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
    for (const stream of streams) {
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

/** 이 외주 몫에 외주처에서 더 받아야 할 자료가 있는가(추정이거나 근거·증빙·분류 근거가 비었다) */
export function outsourcedGroupNeedsData(group: OutsourcedGroup): boolean {
    const info = group.info;
    return info.basis === 'CONSERVATIVE_ESTIMATE'
        || !info.note?.trim()
        || !info.evidence?.trim()
        || (NEEDS_TECHNIQUE_EVIDENCE.includes(info.technique) && !info.technique_evidence?.trim());
}
