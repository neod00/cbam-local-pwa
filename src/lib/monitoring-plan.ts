import { describeProcessGrouping } from './allocation-rules';
import { createDocx, paragraph, table } from './docx-builder';
import { D43_EVIDENCE, ELECTRICITY_EF_BASIS_LABEL, resolveElectricityEfBasis } from './electricity-ef-basis';
import type {
    Installation,
    InternalTransfer,
    Product,
    ProductOutputLine,
    ProductionProcess,
    PurchasedPrecursor,
    ReportInputs,
    ReportingPeriod,
    SourceStream,
} from './local-db';
import { findBenchmarkReference, type ImportedBenchmarkReference } from './reference-workbooks';
import { STEEL_BOUNDARY_NOTE } from './steel-boundary';
import { groupOutsourcedStreams, OUTSOURCED_BASIS_ANCHOR, OUTSOURCED_BASIS_LABEL, OUTSOURCED_TECHNIQUE_LABEL } from './outsourced-process';

/**
 * 모니터링 계획 초안 — 2025/2547 부속서 II A.5가 정한 22개 항목의 틀에, 앱에 이미 입력된 자료를 옮겨 적는다.
 *
 * 원칙:
 *  · **새 판단·새 계산을 하지 않는다.** 입력된 값을 항목 자리에 옮길 뿐이다. 자료가 없으면 지어내지 않고 「작성 필요」로 둔다.
 *  · 회사의 운영 방식(측정기 검교정·위험 평가·IT 시스템 품질 등)은 앱이 알 수 없다 — 자리와 물음만 남긴다.
 *  · 규정 서식의 완성본이 아니라 **초안**이다. 회사가 확인·승인해야 하며, 문서 첫머리에 그렇게 적는다.
 *  · 읽기만 한다 — 저장소에 아무것도 쓰지 않는다.
 *
 * 항목 상태: AUTO = 입력된 자료로 채움 · PARTIAL = 일부만 채움(나머지는 작성 필요) · TODO = 작성 필요 · NA = 이 사업장에는 해당 없음으로 보이는 항목(확인 필요).
 */

export type PlanItemStatus = 'AUTO' | 'PARTIAL' | 'TODO' | 'NA';

export interface PlanTable {
    headers: string[];
    rows: string[][];
}

export interface PlanSection {
    /** 부속서 II A.5 항목 번호(1~22) */
    no: number;
    title: string;
    status: PlanItemStatus;
    /** 본문 문장들(작성 필요 문장 포함) */
    paragraphs: string[];
    tables: PlanTable[];
    /** 회사가 직접 써야 하는 물음 — 「작성 필요」 자리에 붙는다 */
    questions: string[];
}

export interface MonitoringPlanInput {
    installations: Installation[];
    periods: ReportingPeriod[];
    products: Product[];
    processes: ProductionProcess[];
    productOutputLines: ProductOutputLine[];
    sourceStreams: SourceStream[];
    precursors: PurchasedPrecursor[];
    internalTransfers?: InternalTransfer[];
    reportInputs?: ReportInputs;
    benchmarks?: ImportedBenchmarkReference;
    generatedAt: Date;
}

export interface MonitoringPlan {
    sections: PlanSection[];
    counts: Record<PlanItemStatus, number>;
}

/** 값이 없을 때 쓰는 말 — 빈 칸을 0이나 「없음」으로 오해하지 않게 한다. */
export const PLAN_TODO = '작성 필요';
/** 외주 공정 몫이 있으면 모니터링 계획 제9항에 방법·근거와 통제(부속서 II A.5 22(g))를 적는다 — 없으면 아무것도 더하지 않는다. */
function outsourcedPlanParagraphs(streams: SourceStream[]): string[] {
    const groups = groupOutsourcedStreams(streams);
    if (groups.length === 0) return [];
    return [
        '외주 공정: 철강제품 경계 안의 공정을 외주사에서 하고 물건이 돌아오면 우리 사업장에서 일어난 것으로 다루며(EC CBAM Q&A 2026-05-27, 4.31), 외주처가 우리 부품에 쓴 연료의 몫을 해당 생산공정의 연료 배출원으로 넣습니다. 돌아온 부품은 구매 전구물질로 넣지 않습니다.',
        ...groups.map((group) => `· ${group.subcontractor} — ${OUTSOURCED_TECHNIQUE_LABEL[group.technique]}: 우리 몫 ${fmt(group.total)} ${group.unit}, 방법 「${OUTSOURCED_BASIS_LABEL[group.basis]}」(${OUTSOURCED_BASIS_ANCHOR[group.basis]}). 근거: ${group.info.note?.trim() || PLAN_TODO}. 증빙: ${group.info.evidence?.trim() || PLAN_TODO}.`),
        '외주 공정의 통제(2025/2547 부속서 II A.5 22(g)): 외주처에서 받은 연료·가동 자료의 출처와 계산(재구성·처리 중량 비율·추정)을 산정 근거와 함께 보관하고, 외주처 고지서와 우리 몫의 합계가 맞는지 해마다 대사합니다.',
    ];
}

const dash = (value: string | undefined | null) => (value && value.trim() ? value.trim() : PLAN_TODO);
const fmt = (value: number, digits = 3) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);

const STREAM_TYPE_LABEL: Record<SourceStream['stream_type'], string> = {
    FUEL: '연료 연소',
    PROCESS_MATERIAL: '공정배출·물질수지',
    OTHER: '기타',
};

const FACTOR_SOURCE_LABEL: Record<NonNullable<SourceStream['factor_source_type']>, string> = {
    EU_OR_IPCC_DEFAULT: 'IPCC·EU 기본값',
    NATIONAL_INVENTORY: '국가 인벤토리 값',
    SUPPLIER_OR_LAB: '공급사·분석 성적서 값',
    UNCLASSIFIED: '미분류',
};

const ROLE_EXCLUDED = 'EXCLUDED';

export function buildMonitoringPlan(input: MonitoringPlanInput): MonitoringPlan {
    const installation = input.installations[0];
    const period = input.periods[0];
    const plan = input.reportInputs?.monitoring_plan;
    const processById = new Map(input.processes.map((process) => [process.id, process]));
    const productById = new Map(input.products.map((product) => [product.id, product]));
    const linesOf = (processId: string) => input.productOutputLines.filter((line) => line.process_id === processId);
    const goodLines = input.productOutputLines.filter((line) => line.activity_level_role !== ROLE_EXCLUDED);
    const transpositionOf = (streamId: string) => input.reportInputs?.transpositions?.find((row) => row.source_stream_id === streamId);
    const processName = (id: string | undefined) => (id ? processById.get(id)?.name : undefined) ?? '(공정 밖·공용)';
    const sections: PlanSection[] = [];
    const add = (section: Omit<PlanSection, 'tables' | 'questions'> & Partial<Pick<PlanSection, 'tables' | 'questions'>>) => {
        sections.push({ tables: [], questions: [], ...section });
    };

    // 1. 문서의 날짜와 판
    {
        const missing = [!plan?.doc_no && '문서번호', !plan?.version && '판(버전)', !plan?.approved_at && '승인일'].filter(Boolean) as string[];
        add({
            no: 1,
            title: '모니터링 계획의 날짜와 판 번호',
            status: missing.length === 0 ? 'AUTO' : 'PARTIAL',
            paragraphs: [
                `이 초안을 만든 날: ${input.generatedAt.toISOString().slice(0, 10)}`,
                ...(missing.length === 0 ? [] : [`${missing.join(' · ')}: ${PLAN_TODO} — 지도 8단계의 보고서 입력(모니터링 계획)에 적으면 여기 실립니다.`]),
            ],
            tables: [{ headers: ['항목', '내용'], rows: [['문서번호', dash(plan?.doc_no)], ['판(버전)', dash(plan?.version)], ['승인일', dash(plan?.approved_at)]] }],
        });
    }

    // 2. 사업장과 생산공정의 설명
    add({
        no: 2,
        title: '사업장과 생산공정의 설명',
        status: installation ? (installation.operator_name && installation.economic_activity ? 'AUTO' : 'PARTIAL') : 'TODO',
        paragraphs: installation ? [] : [`사업장 정보가 입력되지 않았습니다. ${PLAN_TODO}`],
        tables: installation ? [
            { headers: ['항목', '내용'], rows: [
                ['사업장명', dash(installation.name)],
                ['한글명', dash(installation.local_name)],
                ['운영자(법인)', dash(installation.operator_name)],
                ['주소', [installation.street, installation.city, installation.country].filter(Boolean).join(', ') || PLAN_TODO],
                ['주요 경제활동', dash(installation.economic_activity)],
                ['CBAM Registry 식별자', dash(installation.cbam_registry_id)],
                ['담당자', dash(installation.authorized_representative_name)],
                ['보고기간', period ? `${period.name} (${period.start_date} ~ ${period.end_date})` : PLAN_TODO],
            ] },
            { headers: ['생산공정', '생산 방식', '생산량 (t)'], rows: input.processes.map((process) => [process.name, process.production_route || PLAN_TODO, fmt(process.output_mass_t)]) },
        ] : [],
    });

    // 3. CN 코드별 재화와 기능단위
    add({
        no: 3,
        title: '생산하는 재화의 목록 — CN 코드와 기능단위',
        status: input.products.length > 0 ? 'AUTO' : 'TODO',
        paragraphs: [
            '기능단위는 같은 CN 코드로 분류되는 재화의 톤입니다(2025/2547 제4조 2항).',
            ...(input.internalTransfers && input.internalTransfers.length > 0
                ? [`별도 생산공정의 산출물을 다른 공정이 전구물질로 쓰는 사내 이송이 ${input.internalTransfers.length}건 있습니다(11번 항목).`]
                : ['별도 생산공정으로 정의하지 않은 사내 전구물질: 입력된 것이 없습니다 — 있으면 여기에 적어야 합니다(확인 필요).']),
        ],
        tables: [{ headers: ['재화(제품)', 'CN 코드', '기능단위', 'EU 신고 대상'], rows: input.products.map((product) => [
            product.name,
            product.cn_code ?? PLAN_TODO,
            't (같은 CN 코드의 톤)',
            product.reporting_scope === 'NON_CBAM_COPRODUCT' ? '아니오(비신고 — 같은 설비를 쓰는 제품)' : '예',
        ]) }],
    });

    // 4. CBAM 생산공정·경로·공정별 재화
    add({
        no: 4,
        title: 'CBAM 생산공정과 생산 경로, 공정별 산출 재화',
        status: input.processes.length > 0 ? 'AUTO' : 'TODO',
        paragraphs: ['같은 CN 코드를 여러 경로로 만들어도 하나의 생산공정으로 정의합니다(2025/2547 제4조 6항).', ...describeProcessGrouping(input.reportInputs?.process_grouping)],
        tables: [{ headers: ['생산공정', '생산 경로', '산출 재화', '양 (t)'], rows: input.processes.flatMap((process) => {
            const lines = linesOf(process.id).filter((line) => line.activity_level_role !== ROLE_EXCLUDED);
            if (lines.length === 0) return [[process.name, process.production_route || PLAN_TODO, PLAN_TODO, fmt(process.output_mass_t)]];
            return lines.map((line, index) => [index === 0 ? process.name : '〃', index === 0 ? process.production_route || PLAN_TODO : '〃', line.name, fmt(line.output_mass_t)]);
        }) }],
    });

    // 5. 비CBAM 재화
    {
        const nonCbam = goodLines.filter((line) => line.reporting_scope === 'NON_CBAM_COPRODUCT' || productById.get(line.product_id ?? '')?.reporting_scope === 'NON_CBAM_COPRODUCT');
        add({
            no: 5,
            title: '공정별 비CBAM 재화와 생산량',
            status: 'AUTO',
            paragraphs: nonCbam.length === 0 ? ['입력된 비CBAM 재화가 없습니다(같은 설비에서 EU 비신고 제품을 만들지 않는 것으로 입력됨 — 확인 필요).'] : [],
            tables: nonCbam.length === 0 ? [] : [{ headers: ['생산공정', '재화', '양 (t)'], rows: nonCbam.map((line) => [processName(line.process_id), line.name, fmt(line.output_mass_t)]) }],
        });
    }

    // 6. 벤치마크
    {
        const cns = Array.from(new Set(input.products.filter((product) => product.reporting_scope !== 'NON_CBAM_COPRODUCT').map((product) => (product.cn_code ?? '').replace(/\D/g, '')).filter(Boolean)));
        if (!input.benchmarks) {
            add({ no: 6, title: '무상할당 조정에 쓰는 CBAM 벤치마크', status: 'TODO', paragraphs: [`EU 벤치마크 파일이 앱에 연결되어 있지 않습니다. ${PLAN_TODO} — 자료 올리기에서 벤치마크 파일을 연결하면 CN별로 채워집니다.`] });
        } else {
            const rows = cns.map((cn) => {
                const row = findBenchmarkReference(input.benchmarks, cn);
                return [cn, row ? `${row.column_a_route || '-'}: ${row.column_a_benchmark ?? 'N/A'}` : PLAN_TODO, row ? `${row.column_b_route || '-'}: ${row.column_b_benchmark ?? 'N/A'}` : PLAN_TODO];
            });
            add({
                no: 6,
                title: '무상할당 조정에 쓰는 CBAM 벤치마크',
                status: rows.every((row) => row[1] !== PLAN_TODO) ? 'AUTO' : 'PARTIAL',
                paragraphs: ['연결된 EU 벤치마크 파일에서 조회한 값입니다(tCO₂e/t).'],
                tables: [{ headers: ['CN 코드', '벤치마크 A열', '벤치마크 B열'], rows }],
            });
        }
    }

    // 7. 데이터 모니터링 방법: 계산 기반 방법 · 측정 시스템
    {
        const rows = input.sourceStreams.map((stream) => {
            const trans = transpositionOf(stream.id);
            return [
                processName(stream.process_id),
                stream.name,
                `활동자료(${stream.activity_unit}) × ${stream.emission_factor_basis === 'PER_ACTIVITY_UNIT' ? '배출계수' : '순발열량 × 배출계수'} × 산화계수`,
                trans?.measurement_method?.trim() || PLAN_TODO,
            ];
        });
        add({
            no: 7,
            title: '공정별 자료 모니터링 방법 — 계산 기반 방법의 설명과 측정 시스템',
            // 측정기의 정확한 위치는 앱이 알 수 없으므로 배출원이 있어도 일부만 채운 것이다.
            status: input.sourceStreams.length === 0 ? 'TODO' : 'PARTIAL',
            paragraphs: [
                '배출량은 연료·부원료의 활동자료에 순발열량과 배출계수, 산화계수를 곱해 계산합니다(계산 기반 방법). 입력 자료: 활동자료, 순발열량, 배출계수, 산화계수, 바이오매스 비율.',
                `(a) 계산식은 위와 같습니다. (b) 측정 시스템과 측정기의 정확한 위치는 앱이 알 수 없습니다 — 아래 표의 「측정 방식」 칸은 입력된 값이고, 측정기 위치는 ${PLAN_TODO}입니다.`,
            ],
            tables: [{ headers: ['공정', '배출원', '계산식', '측정 방식(입력된 값)'], rows }],
            questions: ['각 배출원의 계량기·측정기가 설비의 어디에 있는지(설비명·라인·위치)와 계량기 종류(예: 도시가스사 정산용 계량기, 주유 전표)를 적으세요.'],
        });
    }

    // 8. 계산계수 결정 방법과 시료 채취 계획
    {
        const lab = input.sourceStreams.filter((stream) => stream.factor_source_type === 'SUPPLIER_OR_LAB');
        const rows = input.sourceStreams.map((stream) => {
            const trans = transpositionOf(stream.id);
            return [
                stream.name,
                FACTOR_SOURCE_LABEL[stream.factor_source_type ?? 'UNCLASSIFIED'],
                `${fmt(stream.ncv_gj_per_unit, 4)} / ${fmt(stream.emission_factor_tco2e_per_unit, 4)}`,
                [trans?.ncv_source, trans?.ef_source].filter(Boolean).join(' · ') || PLAN_TODO,
            ];
        });
        add({
            no: 8,
            title: '계산계수의 결정 방법과 시료 채취 계획',
            status: input.sourceStreams.length === 0 ? 'TODO' : 'PARTIAL',
            paragraphs: lab.length === 0
                ? ['성적서·분석값을 쓰는 배출원이 없어(IPCC·EU 기본값 또는 국가 인벤토리 값) 시료 채취 계획은 필요하지 않은 것으로 보입니다 — 확인 필요.']
                : [`성적서·분석 값을 쓰는 배출원이 ${lab.length}개(${lab.map((stream) => stream.name).join(', ')}) 있습니다. 시료 채취 계획과 분석 방법: ${PLAN_TODO}.`],
            tables: [{ headers: ['배출원', '계수 출처 유형', '순발열량 / 배출계수', '계수의 출처 문서'], rows }],
            questions: lab.length === 0 ? [] : ['성적서 값을 쓰는 연료의 시료 채취 주기·방법과 분석 기관(공인 여부)을 적으세요.'],
        });
    }

    // 9. 배출원 목록
    add({
        no: 9,
        title: '공정별 배출원(source stream)·배출시설의 목록',
        status: input.sourceStreams.length > 0 ? 'AUTO' : 'TODO',
        paragraphs: [
            '전기도금(plating)·절단·용접·마무리 설비는 철강 제품의 시스템 경계 밖이라 배출원에 넣지 않습니다. 용융아연도금(galvanizing)·코팅·열처리·단조는 경계 안입니다.',
            ...outsourcedPlanParagraphs(input.sourceStreams),
        ],
        tables: [{ headers: ['공정', '배출원', '유형', '활동자료', '근거 자료'], rows: input.sourceStreams.map((stream) => [
            processName(stream.process_id) + (stream.heat_system ? ` (열 공급원 「${stream.heat_system.name}」)` : ''),
            stream.name,
            STREAM_TYPE_LABEL[stream.stream_type],
            `${fmt(stream.activity_data, 6)} ${stream.activity_unit}`,
            stream.source || PLAN_TODO,
        ]) }],
    });

    // 10. 계산 기반 표준 방법·물질수지를 쓰는 배출원과 매개변수
    add({
        no: 10,
        title: '계산 기반 표준 방법 또는 물질수지법을 쓰는 배출원과 매개변수',
        status: input.sourceStreams.length > 0 ? 'AUTO' : 'TODO',
        paragraphs: [],
        tables: [{ headers: ['배출원', '방법', '산화계수', '전환계수', '화석 분율', '바이오 분율'], rows: input.sourceStreams.map((stream) => [
            stream.name,
            stream.method || PLAN_TODO,
            fmt(stream.oxidation_factor, 4),
            fmt(stream.conversion_factor, 4),
            fmt(stream.fossil_fraction, 4),
            fmt(stream.biomass_fraction, 4),
        ]) }],
    });

    // 11. 측정 기반 방법을 쓰는 배출원
    {
        const manual = input.processes.filter((process) => process.direct_emissions_input_mode === 'MANUAL_TOTAL');
        add({
            no: 11,
            title: '측정 기반 방법(연속측정 등)을 쓰는 배출원',
            status: manual.length > 0 ? 'PARTIAL' : 'NA',
            paragraphs: manual.length === 0
                ? ['앱에 연속측정(CEMS) 등 측정 기반 방법을 쓰는 배출원이 입력되어 있지 않습니다. 해당 없음이 맞는지 확인하세요.']
                : ['직접배출을 합계로 직접 입력한 공정이 있습니다. 측정 기반 방법이라면 B.6이 요구하는 요소(측정기·불확도·보정)를 설명해야 합니다.'],
            tables: manual.length === 0 ? [] : [{ headers: ['공정', '직접배출 합계 (tCO₂e)', '입력된 근거'], rows: manual.map((process) => [process.name, fmt(process.direct_attributable_emissions_tco2e), process.direct_emissions_input_note || PLAN_TODO]) }],
            questions: manual.length === 0 ? [] : ['위 합계가 연속측정이라면 측정기 종류·측정 위치·불확도·보정 방법을 적으세요.'],
        });
    }

    // 12. PFC(1차 알루미늄)
    add({
        no: 12,
        title: '과불화탄소(PFC) 모니터링 방법 — 1차 알루미늄',
        status: 'NA',
        paragraphs: ['철강 제품만 다루는 사업장이라 해당하지 않습니다.'],
    });

    // 13. 도식과 시스템 경계
    {
        const shared = input.processes.filter((process) => process.electricity_shared_meter);
        const heatSystems = Array.from(new Set(input.sourceStreams.map((stream) => stream.heat_system?.name).filter(Boolean) as string[]));
        add({
            no: 13,
            title: '시스템 경계와 공정 설명 — 이중계산·자료 누락이 없다는 근거',
            status: 'PARTIAL',
            paragraphs: [
                `시스템 경계: ${STEEL_BOUNDARY_NOTE}`,
                ...(input.internalTransfers && input.internalTransfers.length > 0
                    ? [`사내 이송 ${input.internalTransfers.length}건: ${input.internalTransfers.map((transfer) => `${processName(transfer.source_process_id)} → ${processName(transfer.target_process_id)} ${fmt(transfer.mass_t)} t`).join(' · ')}. 받는 공정은 보내는 공정의 기간 평균 SEE를 쓰며 구매 전구물질로 중복 입력하지 않습니다.`]
                    : []),
                ...(shared.length > 0 ? [`공용 전력 계량기를 나눈 공정: ${shared.map((process) => `${process.name}(${process.electricity_shared_meter?.group})`).join(', ')}. 나눈 합계는 고지서 합계와 맞춥니다.`] : []),
                ...(heatSystems.length > 0 ? [`공용 열 공급원: ${heatSystems.join(', ')} — 공정이 쓴 열량 비율로 귀속합니다.`] : []),
                `공정 흐름도와 설비 배치도(그림): ${PLAN_TODO}`,
            ],
            questions: ['설비 배치와 공정 흐름을 그린 도식(원료 입고 → 공정 → 출하)을 첨부하세요. 이중계산이 없다는 설명은 위 경계·이송·나누기 기록을 인용해 적을 수 있습니다.'],
        });
    }

    // 14. 전구물질과 공급사
    add({
        no: 14,
        title: '공정별 투입 전구물질과 다른 사업장에서 만든 전구물질의 공급사(이름·국가)',
        status: input.precursors.length === 0 ? 'TODO' : input.precursors.every((precursor) => (precursor.supplier_installation || precursor.supplier_operator_name) && precursor.supplier_country) ? 'AUTO' : 'PARTIAL',
        paragraphs: input.precursors.length === 0 ? [`입력된 구매 전구물질이 없습니다. 사 온 철강 원료가 없다면 그렇게 적고, 있다면 ${PLAN_TODO}.`] : [],
        tables: input.precursors.length === 0 ? [] : [{ headers: ['공정', '전구물질', 'CN', '공급사(운영자 / 사업장)', '원산국', 'Registry 식별자'], rows: input.precursors.map((precursor) => [
            processName(precursor.process_id),
            precursor.name,
            precursor.precursor_cn_code ?? PLAN_TODO,
            [precursor.supplier_operator_name, precursor.supplier_installation].filter(Boolean).join(' / ') || PLAN_TODO,
            precursor.supplier_country || PLAN_TODO,
            precursor.supplier_registry_id || PLAN_TODO,
        ]) }],
    });

    // 15. 제로 배출계수 연료
    {
        const biomass = input.sourceStreams.filter((stream) => stream.biomass_fraction > 0);
        add({
            no: 15,
            title: '제로 배출계수를 적용하는 연료(바이오매스 등)',
            status: 'AUTO',
            paragraphs: biomass.length === 0
                ? ['입력된 연료 중 바이오매스 분율이 있는 것이 없습니다 — 제로 배출계수를 적용하는 연료는 없는 것으로 봅니다(확인 필요).']
                : ['바이오매스 분율을 입력한 연료가 있습니다. 그 분율이 제로 배출계수 적용 요건을 충족한다는 입증 방법은 작성이 필요합니다.'],
            tables: biomass.length === 0 ? [] : [{ headers: ['배출원', '바이오 분율', '입증 방법'], rows: biomass.map((stream) => [stream.name, fmt(stream.biomass_fraction, 4), PLAN_TODO]) }],
        });
    }

    // 16. 측정가능열
    {
        const imported = input.processes.filter((process) => process.measurable_heat_import === 'YES');
        const answered = input.processes.filter((process) => process.measurable_heat_import);
        const consumers = input.processes.filter((process) => (process.heat_consumption ?? []).length > 0);
        add({
            no: 16,
            title: '다른 사업장과 주고받는 측정가능열(스팀·온수)',
            status: input.processes.length === 0 ? 'TODO' : answered.length < input.processes.length ? 'PARTIAL' : imported.length > 0 ? 'PARTIAL' : 'AUTO',
            paragraphs: [
                imported.length === 0 && answered.length === input.processes.length
                    ? '모든 공정에서 사업장 밖에서 산 열이 없다고 확인했습니다. 밖으로 내보내는 열은 공정 밖 사용량(사무동 난방 등)으로만 입력됩니다.'
                    : `밖에서 산 열을 쓰는 공정: ${imported.map((process) => process.name).join(', ') || '없음'}. 아직 답하지 않은 공정: ${input.processes.filter((process) => !process.measurable_heat_import).map((process) => process.name).join(', ') || '없음'}.`,
                ...(consumers.length > 0 ? [`자체 보일러·스팀을 여러 공정이 나눠 씁니다: ${consumers.map((process) => process.name).join(', ')} — 열량 기준으로 귀속합니다.`] : []),
            ],
            tables: imported.length === 0 ? [] : [{ headers: ['공정', '사 온 열', '계수 기준', '열을 준 사업장·근거'], rows: imported.map((process) => [
                process.name,
                process.imported_heat_amount !== undefined ? `${fmt(process.imported_heat_amount)} ${process.imported_heat_unit ?? ''}` : PLAN_TODO,
                process.imported_heat_ef_basis === 'SUPPLIER' ? '공급사 계수' : process.imported_heat_ef_basis === 'STANDARD_FUEL_BOILER' ? '표준 연료 계수 ÷ 0.9' : PLAN_TODO,
                process.imported_heat_source || PLAN_TODO,
            ]) }],
            questions: imported.length === 0 ? [] : ['열을 공급하는 사업장의 이름과 위치, 열량 측정 방법을 적으세요.'],
        });
    }

    // 17. 사업장 안 발전
    {
        const own = input.processes.some((process) => process.electricity_ef_source === 'INSTALLATION_OWN' || process.electricity_ef_source === 'MIX');
        add({
            no: 17,
            title: '사업장 안에서 전력을 만드는지(열병합·별도 발전·화석/재생·시스템 경계 밖 반출)',
            status: own ? 'PARTIAL' : 'AUTO',
            paragraphs: own
                ? [`전력 계수 출처에 「설비 내 자가발전」 또는 「혼합」을 고른 공정이 있습니다. 열병합 여부, 별도 발전 여부, 화석·재생 구분, 시스템 경계 밖으로 내보내는 전력: ${PLAN_TODO}.`]
                : ['입력된 전력은 모두 외부(계통·계약)에서 받는 것으로 입력되어 있어, 사업장 안 발전은 없는 것으로 봅니다 — 확인 필요.'],
            questions: own ? ['자가발전 설비의 종류(열병합/별도), 연료(화석/재생), 시스템 경계 밖으로 내보내는 전력량을 적으세요.'] : [],
        });
    }

    // 18. 실측 전력계수의 증빙(D.4.3)
    {
        const meta = input.reportInputs?.electricity_ef_meta ?? [];
        const rows = input.processes.filter((process) => process.electricity_mwh > 0).map((process) => {
            const entry = meta.find((item) => item.process_id === process.id);
            const basis = resolveElectricityEfBasis(entry?.basis, process);
            const needsEvidence = basis === 'DIRECT_LINK' || basis === 'PPA';
            return [
                process.name,
                ELECTRICITY_EF_BASIS_LABEL[basis],
                needsEvidence ? (entry?.evidence_confirmed ? '증빙 제출 확인함' : `${PLAN_TODO} — D.4.3 증빙 ${D43_EVIDENCE[basis as 'DIRECT_LINK' | 'PPA'].length}종`) : '해당 없음(계통 평균 등)',
            ];
        });
        add({
            no: 18,
            title: '실측 전력 배출계수를 쓸 때 제출할 증빙(D.4.3)',
            status: rows.length === 0 ? 'NA' : rows.some((row) => row[2].startsWith(PLAN_TODO)) ? 'PARTIAL' : 'AUTO',
            paragraphs: rows.length === 0 ? ['전력 사용이 입력된 공정이 없습니다.'] : [],
            tables: rows.length === 0 ? [] : [{ headers: ['공정', '전력 계수 산정근거', '증빙'], rows }],
        });
    }

    // 19. 전력 수입
    add({
        no: 19,
        title: 'EU 관세영역으로 수입하는 전력의 배출량(실측 사용 시)',
        status: 'NA',
        paragraphs: ['전력을 EU로 수출하는 사업장이 아니라 해당하지 않습니다.'],
    });

    // 20. 폐가스
    add({
        no: 20,
        title: '폐가스의 발생·사용·주고받음',
        status: installation?.waste_gases ? 'AUTO' : 'TODO',
        paragraphs: installation?.waste_gases === 'YES'
            ? [`폐가스가 발생합니다: ${installation.waste_gases_note || PLAN_TODO}. 다른 사업장과 주고받는다면 그 사업장의 식별: ${PLAN_TODO}.`]
            : installation?.waste_gases === 'NO'
                ? ['폐가스가 발생하지 않는다고 입력되어 있습니다.']
                : [`폐가스 발생 여부가 입력되지 않았습니다. ${PLAN_TODO}`],
    });

    // 21. CO2 포집·저장·이용
    add({
        no: 21,
        title: 'CO₂ 포집·저장·이용',
        status: 'TODO',
        paragraphs: [`앱은 CO₂ 포집·저장·이용을 다루지 않습니다. 해당이 없다면 그렇게 적고, 있다면 받는 시설·운송 기반의 책임자와 모니터링 방법을 적어야 합니다. ${PLAN_TODO}`],
        questions: ['CO₂ 포집·저장·이용이 없으면 「해당 없음」이라고 적으세요.'],
    });

    // 22. 자료 품질 관리 체계
    {
        const rnr = input.reportInputs?.rnr ?? [];
        const evidence = input.reportInputs?.evidence ?? [];
        add({
            no: 22,
            title: '자료 품질을 보장하는 관리 체계',
            status: rnr.length > 0 || evidence.length > 0 ? 'PARTIAL' : 'TODO',
            paragraphs: [
                '(a) 측정 장비의 검·교정 등 품질 보증, (b) 자료 흐름의 오류 위험 평가, (c) 정보 시스템의 품질 보증은 회사의 운영 방식이라 앱이 알 수 없습니다. ' + PLAN_TODO,
            ],
            tables: [
                ...(rnr.length > 0 ? [{ headers: ['자료', '수집', '옮겨 적기', '확인·승인', '자료가 있는 곳'], rows: rnr.map((row) => [row.data, row.collector || PLAN_TODO, row.transposer || PLAN_TODO, row.approver || PLAN_TODO, row.system || PLAN_TODO]) }] : []),
                ...(evidence.length > 0 ? [{ headers: ['증빙 자료', '입증 내용', '보관', '상태'], rows: evidence.map((row) => [row.item, row.proves || PLAN_TODO, row.custodian || PLAN_TODO, row.status || PLAN_TODO]) }] : []),
            ],
            questions: [
                '(a) 계량기·측정 장비를 언제, 누가, 어떤 기준으로 검·교정하는지 적으세요.',
                '(b) 자료가 현장 → 집계표 → 보고서로 옮겨지는 과정에서 오류가 생길 수 있는 곳과 막는 방법을 적으세요.',
                '(c) 자료를 다루는 엑셀·ERP 등 시스템의 접근 권한·변경 관리·백업 방법을 적으세요.',
            ],
        });
    }

    const counts: Record<PlanItemStatus, number> = { AUTO: 0, PARTIAL: 0, TODO: 0, NA: 0 };
    for (const section of sections) counts[section.status] += 1;
    return { sections, counts };
}

const STATUS_LABEL: Record<PlanItemStatus, string> = {
    AUTO: '자동으로 채움',
    PARTIAL: '일부 채움 — 나머지 작성 필요',
    TODO: '작성 필요',
    NA: '해당 없음으로 보임(확인 필요)',
};

const STATUS_COLOR: Record<PlanItemStatus, string> = { AUTO: '0F766E', PARTIAL: 'B45309', TODO: 'B91C1C', NA: '64748B' };

export function createMonitoringPlanFilename(generatedAt: Date) {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `CBAM_Monitoring_Plan_Draft_${generatedAt.getFullYear()}${pad(generatedAt.getMonth() + 1)}${pad(generatedAt.getDate())}.docx`;
}

export function createMonitoringPlanDocument(input: MonitoringPlanInput) {
    const plan = buildMonitoringPlan(input);
    const installation = input.installations[0];
    const body: string[] = [
        paragraph('모니터링 계획 초안', 'Title'),
        paragraph(`${installation?.local_name || installation?.name || '사업장'} — CBAM 확정기간 (Regulation (EU) 2025/2547 부속서 II A.5)`, 'Note'),
        paragraph(
            '이 문서는 앱에 입력된 자료를 부속서 II A.5가 정한 22개 항목의 틀에 옮겨 적은 초안입니다. 규정이 요구하는 모니터링 계획의 완성본이 아니며, '
            + '「작성 필요」로 표시된 부분은 회사가 직접 써야 합니다. 회사가 내용을 확인하고 승인해야 모니터링 계획이 됩니다.',
            'Note',
        ),
        paragraph(
            `항목 상태: 자동으로 채움 ${plan.counts.AUTO} · 일부 채움 ${plan.counts.PARTIAL} · 작성 필요 ${plan.counts.TODO} · 해당 없음으로 보임 ${plan.counts.NA} (총 ${plan.sections.length}개 항목)`,
            'Legend',
        ),
    ];
    for (const section of plan.sections) {
        body.push(paragraph(`${section.no}. ${section.title}`, 'Heading1'));
        body.push(paragraph(`상태: ${STATUS_LABEL[section.status]}`, undefined, { bold: true, color: STATUS_COLOR[section.status] }));
        for (const text of section.paragraphs) body.push(paragraph(text));
        for (const item of section.tables) {
            if (item.rows.length === 0) continue;
            const widths = item.headers.map(() => Math.floor(9000 / item.headers.length));
            body.push(table(item.headers, item.rows, { widths, headerShade: 'F1F5F9', headerBold: true, repeatHeader: true }));
        }
        if (section.questions.length > 0) {
            body.push(paragraph('회사가 직접 적을 것', undefined, { bold: true }));
            for (const question of section.questions) body.push(paragraph(`· ${question}`));
            body.push(paragraph(`[ ${PLAN_TODO}: 여기에 적으세요 ]`, 'Note'));
        }
    }
    const bytes = createDocx('CBAM 모니터링 계획 초안', body.join('\n'), input.generatedAt, {
        header: { text: '모니터링 계획 초안 — 회사 확인·승인 전', align: 'right', color: '64748B', size: 14 },
        footer: { text: 'CBAM Local', pageNumber: true, align: 'center', color: '64748B', size: 14 },
    });
    return {
        blob: new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
        filename: createMonitoringPlanFilename(input.generatedAt),
        plan,
    };
}
