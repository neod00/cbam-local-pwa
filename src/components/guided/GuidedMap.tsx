'use client';

import type { GuidedStepId, GuidedStepStatus, GuidedStepState } from '@/lib/guided-map';
import type { GuidedMapFlow, MapEdge, NodeProvenance } from '@/lib/guided-map-flow';
import { useEffect, useRef, type ReactNode } from 'react';

// 단계 상태별 지도 색상. 완료=에메랄드, 지금 여기=블루, 대기=점선, 잠김=흐림.
const STATUS_STYLE = {
    done: { fill: '#ecfdf5', stroke: '#059669', title: '#065f46', sub: '#047857', dash: undefined as string | undefined, width: 1.25 },
    current: { fill: '#eff6ff', stroke: '#2563eb', title: '#1e3a8a', sub: '#1d4ed8', dash: undefined as string | undefined, width: 2.25 },
    todo: { fill: '#ffffff', stroke: '#94a3b8', title: '#334155', sub: '#64748b', dash: '5 4' as string | undefined, width: 1 },
    optional: { fill: '#ffffff', stroke: '#94a3b8', title: '#334155', sub: '#64748b', dash: '5 4' as string | undefined, width: 1 },
    locked: { fill: '#f8fafc', stroke: '#e2e8f0', title: '#94a3b8', sub: '#cbd5e1', dash: '5 4' as string | undefined, width: 1 },
} as const;

const ARROW = '#94a3b8';

// flow가 없을 때(종전 호출부) 쓰는 가는 실선 — 지도가 종전과 똑같이 그려진다.
const NEUTRAL_EDGE: MapEdge = { width: 1.5, reportOnly: false, flowing: false, description: '' };
const NEUTRAL_EDGES: GuidedMapFlow['edges'] = { fuel: NEUTRAL_EDGE, electricity: NEUTRAL_EDGE, precursors: NEUTRAL_EDGE };

interface NodeGeometry {
    x: number;
    y: number;
    w: number;
    h: number;
}

const NODE_GEOMETRY: Record<GuidedStepId, NodeGeometry> = {
    setup: { x: 120, y: 28, w: 210, h: 54 },
    products: { x: 350, y: 28, w: 210, h: 54 },
    process: { x: 190, y: 112, w: 300, h: 54 },
    fuel: { x: 40, y: 204, w: 185, h: 58 },
    electricity: { x: 250, y: 204, w: 180, h: 58 },
    precursors: { x: 455, y: 204, w: 185, h: 58 },
    results: { x: 200, y: 358, w: 280, h: 58 },
    export: { x: 190, y: 448, w: 300, h: 58 },
};

// 값 출처 표시(막대의 범례와 같은 규칙): EU 기본값 = 빗금 + 점선 테두리, 그 밖은 실색.
const PROVENANCE_TAG_COLOR: Record<NodeProvenance['kind'], { fill: string; stroke: string; text: string }> = {
    OWN: { fill: '#f0fdfa', stroke: '#0f766e', text: '#115e59' },
    ACTUAL: { fill: '#fffbeb', stroke: '#d97706', text: '#92400e' },
    MIXED: { fill: '#fffbeb', stroke: '#f59e0b', text: '#92400e' },
    DEFAULT: { fill: '#f1f5f9', stroke: '#64748b', text: '#334155' },
};

function GuidedNode({
    step,
    selected,
    onSelect,
    provenance,
    children,
}: {
    step: GuidedStepState;
    selected: boolean;
    onSelect: (id: GuidedStepId) => void;
    provenance?: NodeProvenance;
    children?: ReactNode;
}) {
    const geo = NODE_GEOMETRY[step.id];
    const style = STATUS_STYLE[step.status];
    const cx = geo.x + geo.w / 2;
    const label = `${step.order}단계 ${step.title} — ${step.summary}${provenance ? ` · 값 출처: ${provenance.label}` : ''}`;
    const hatched = provenance?.kind === 'DEFAULT';
    const tagColor = provenance ? PROVENANCE_TAG_COLOR[provenance.kind] : undefined;
    const tagWidth = provenance ? provenance.label.length * 9 + 14 : 0;

    return (
        <g
            className={`guided-node guided-node--${step.status}`}
            data-step={step.id}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={selected}
            aria-disabled={step.status === 'locked'}
            onClick={() => onSelect(step.id)}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(step.id);
                }
            }}
        >
            <title>{label}</title>
            {selected && (
                <rect
                    x={geo.x - 4}
                    y={geo.y - 4}
                    width={geo.w + 8}
                    height={geo.h + 8}
                    rx={12}
                    fill="none"
                    stroke="#0d9488"
                    strokeWidth={2}
                />
            )}
            <rect
                className="guided-rect"
                x={geo.x}
                y={geo.y}
                width={geo.w}
                height={geo.h}
                rx={8}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth={style.width}
                strokeDasharray={hatched ? '4 3' : style.dash}
            />
            {hatched && <rect x={geo.x} y={geo.y} width={geo.w} height={geo.h} rx={8} fill="url(#guided-hatch)" pointerEvents="none" />}
            <text x={cx} y={geo.y + 23} textAnchor="middle" fontSize="14" fontWeight="600" fill={style.title}>
                {step.status === 'done' ? '✓ ' : ''}
                {step.order} {step.title}
            </text>
            <text x={cx} y={geo.y + 43} textAnchor="middle" fontSize="12" fill={style.sub}>
                {step.status === 'current' ? '← 지금 여기 · ' : ''}
                {step.summary}
            </text>
            {step.status === 'locked' && (
                <g transform={`translate(${geo.x + geo.w - 21}, ${geo.y + 7})`} aria-hidden="true">
                    <path d="M3 5 v-1.5 a3 3 0 0 1 6 0 V5" fill="none" stroke="#94a3b8" strokeWidth="1.4" />
                    <rect x="1.5" y="5" width="9" height="7" rx="1.5" fill="#cbd5e1" />
                </g>
            )}
            {provenance && tagColor && (
                <g aria-hidden="true" data-provenance={provenance.kind}>
                    <rect x={geo.x + geo.w - tagWidth - 8} y={geo.y - 9} width={tagWidth} height={17} rx={8.5} fill={tagColor.fill} stroke={tagColor.stroke} strokeWidth={1} strokeDasharray={hatched ? '3 2' : undefined} />
                    <text x={geo.x + geo.w - 8 - tagWidth / 2} y={geo.y + 3} textAnchor="middle" fontSize="10.5" fontWeight="600" fill={tagColor.text}>
                        {provenance.label}
                    </text>
                </g>
            )}
            {children}
        </g>
    );
}

// 입력 상자 → 「÷ 생산량」으로 가는 선. 굵기는 인증서 기준 부분의 비중(지도 흐름 lib이 정함), 점선은 보고용 흐름, 흐르는 점은 값이 들어온 선만.
function FlowEdge({ edge, x1, y1, x2, y2 }: { edge: MapEdge; x1: number; y1: number; x2: number; y2: number }) {
    return (
        <g data-edge-width={edge.width.toFixed(2)} data-edge-report-only={edge.reportOnly}>
            <title>{edge.description}</title>
            <line
                className={edge.flowing ? 'guided-edge guided-edge--flow' : 'guided-edge'}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={ARROW}
                strokeWidth={edge.width}
                strokeDasharray={edge.reportOnly ? '3 4' : edge.flowing ? '7 5' : undefined}
                markerEnd="url(#guided-arrow)"
            />
        </g>
    );
}

// 지도형 작업 공간의 본체 — 8단계 산정 지도. 상자를 누르면 해당 단계 패널이 열린다.
export function GuidedMap({
    steps,
    selected,
    onSelect,
    outputLabel,
    flow,
}: {
    steps: GuidedStepState[];
    selected: GuidedStepId | null;
    onSelect: (id: GuidedStepId) => void;
    outputLabel: string;
    /** 선 굵기·흐름·값 출처 표시. 없으면 종전 지도 그대로 그린다. */
    flow?: GuidedMapFlow;
}) {
    const svgRef = useRef<SVGSVGElement>(null);
    const prevStatuses = useRef<Map<GuidedStepId, GuidedStepStatus>>(new Map());

    // 단계가 방금 '완료'로 바뀐 순간에만 팝 애니메이션을 건다(DOM 클래스 직접 조작 — 리렌더 불필요).
    useEffect(() => {
        const prev = prevStatuses.current;
        const timers: number[] = [];
        for (const step of steps) {
            const before = prev.get(step.id);
            if (before && before !== 'done' && step.status === 'done') {
                const node = svgRef.current?.querySelector(`[data-step="${step.id}"]`);
                if (node) {
                    node.classList.add('guided-node--pop');
                    timers.push(window.setTimeout(() => node.classList.remove('guided-node--pop'), 800));
                }
            }
        }
        prevStatuses.current = new Map(steps.map((step) => [step.id, step.status]));
        return () => {
            timers.forEach((timer) => window.clearTimeout(timer));
        };
    }, [steps]);

    const edges = flow?.edges ?? NEUTRAL_EDGES;
    const byId = new Map(steps.map((step) => [step.id, step]));
    const node = (id: GuidedStepId) => {
        const step = byId.get(id);
        if (!step) {
            return null;
        }
        return <GuidedNode step={step} selected={selected === id} onSelect={onSelect} provenance={flow?.provenance[id]} />;
    };

    return (
        <svg
            ref={svgRef}
            width="100%"
            viewBox="0 0 680 556"
            role="img"
            aria-label="CBAM 산정 지도 — 8단계 진행 상태"
            style={{ maxWidth: '100%', height: 'auto' }}
            xmlns="http://www.w3.org/2000/svg"
        >
            <title>CBAM 산정 지도</title>
            <desc>사업장 등록부터 EU 문서 생성까지 8단계의 진행 상태를 지도로 보여줍니다. 각 상자를 누르면 해당 단계의 입력 패널이 열립니다. 잠긴 단계는 앞 단계를 채우면 열립니다.</desc>
            <style>{`
                .guided-node { cursor: pointer; }
                .guided-node .guided-rect { transition: fill 0.4s ease, stroke 0.4s ease, stroke-width 0.15s ease; }
                .guided-node:hover .guided-rect { stroke-width: 2.5; }
                .guided-node:focus { outline: none; }
                .guided-node:focus .guided-rect { stroke-width: 2.5; }
                .guided-node--locked { cursor: default; opacity: 0.72; }
                .guided-node--locked:hover .guided-rect, .guided-node--locked:focus .guided-rect { stroke-width: 1; }
                .guided-node--current .guided-rect { animation: guided-pulse 2.4s ease-in-out infinite; }
                .guided-node--pop { transform-box: fill-box; transform-origin: center; animation: guided-pop 0.7s ease-out; }
                .guided-edge--flow { animation: guided-flow 1.1s linear infinite; }
                @keyframes guided-flow { to { stroke-dashoffset: -12; } }
                @keyframes guided-pulse { 0%, 100% { stroke-opacity: 1; } 50% { stroke-opacity: 0.4; } }
                @keyframes guided-pop { 0% { transform: scale(1); } 35% { transform: scale(1.06); } 100% { transform: scale(1); } }
                @media (prefers-reduced-motion: reduce) {
                    .guided-node .guided-rect { transition: none; }
                    .guided-node--current .guided-rect, .guided-node--pop { animation: none; }
                    .guided-edge--flow { animation: none; }
                }
            `}</style>
            <defs>
                <marker id="guided-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                    <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
                <pattern id="guided-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#94a3b8" strokeWidth="1.6" strokeOpacity="0.35" />
                </pattern>
            </defs>

            <line x1="225" y1="82" x2="298" y2="108" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#guided-arrow)" />
            <line x1="455" y1="82" x2="382" y2="108" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#guided-arrow)" />
            <line x1="340" y1="166" x2="135" y2="200" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#guided-arrow)" />
            <line x1="340" y1="166" x2="340" y2="200" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#guided-arrow)" />
            <line x1="340" y1="166" x2="545" y2="200" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#guided-arrow)" />
            <FlowEdge edge={edges.fuel} x1={132} y1={262} x2={300} y2={290} />
            <FlowEdge edge={edges.electricity} x1={340} y1={262} x2={340} y2={290} />
            <FlowEdge edge={edges.precursors} x1={547} y1={262} x2={380} y2={290} />

            {node('setup')}
            {node('products')}
            {node('process')}
            {node('fuel')}
            {node('electricity')}
            {node('precursors')}

            <rect x={265} y={294} width={150} height={30} rx={15} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={0.75} />
            <text x={340} y={314} textAnchor="middle" fontSize="13" fontWeight="600" fill="#475569">
                ÷ 생산량 {outputLabel}
            </text>

            <line x1="340" y1="324" x2="340" y2="354" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#guided-arrow)" />
            {node('results')}
            <line x1="340" y1="416" x2="340" y2="444" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#guided-arrow)" />
            {node('export')}

            <text x={340} y={538} textAnchor="middle" fontSize="12" fill="#94a3b8">
                상자를 누르면 옆에 그 단계의 입력 패널이 열립니다
            </text>
        </svg>
    );
}
