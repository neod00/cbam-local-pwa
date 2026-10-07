import { calculateLocalResults } from '@/lib/calculation-engine';
import { buildEmissionTrace, type EmissionTrace } from '@/lib/emission-trace';
import { listLocalItems } from '@/lib/local-db';

/**
 * SEE 추적 화면의 자료 읽기 — **읽기만 한다**. 지도·막대·할 일 화면과 같은 엔진으로 결과를 얻고, 신고 대상 제품 라인마다 추적을 만든다.
 */
export interface TraceData {
    traces: EmissionTrace[];
    periodName?: string;
}

export async function loadTraceData(): Promise<TraceData> {
    const [periods, products, processes, productOutputLines, sourceStreams, precursors, internalTransfers] = await Promise.all([
        listLocalItems('periods'),
        listLocalItems('products'),
        listLocalItems('processes'),
        listLocalItems('product_output_lines'),
        listLocalItems('source_streams'),
        listLocalItems('precursors'),
        listLocalItems('internal_transfers'),
    ]);
    // 지도·막대와 같은 기간만 본다(기간이 하나면 전부, 둘 이상이면 첫 기간 — 질문·할 일 화면과 같은 규칙).
    const periodId = periods.length <= 1 ? undefined : periods[0]?.id;
    const results = calculateLocalResults({ internalTransfers, products, periods, processes, productOutputLines, sourceStreams, precursors })
        .filter((result) => result.is_cbam_reportable && (!periodId || result.period_id === periodId));
    const processById = new Map(processes.map((process) => [process.id, process]));
    const traces: EmissionTrace[] = [];
    for (const result of results) {
        const process = processById.get(result.process_id);
        if (!process) continue;
        const trace = buildEmissionTrace({ result, process, sourceStreams, precursors });
        if (trace) traces.push(trace);
    }
    return { traces, periodName: results[0]?.period_name };
}
