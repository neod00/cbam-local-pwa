'use client';

import type { GuidedStepId, GuidedStepState } from '@/lib/guided-map';
import type { ReactNode } from 'react';

// 단계 상태별 지도 색상. 완료=에메랄드, 지금 여기=블루, 대기=점선, 잠김=흐림.
const STATUS_STYLE = {
    done: { fill: '#ecfdf5', stroke: '#059669', title: '#065f46', sub: '#047857', dash: undefined as string | undefined, width: 1.25 },
    current: { fill: '#eff6ff', stroke: '#2563eb', title: '#1e3a8a', sub: '#1d4ed8', dash: undefined as string | undefined, width: 2.25 },
    todo: { fill: '#ffffff', stroke: '#94a3b8', title: '#334155', sub: '#64748b', dash: '5 4' as string | undefined, width: 1 },
    optional: { fill: '#ffffff', stroke: '#94a3b8', title: '#334155', sub: '#64748b', dash: '5 4' as string | undefined, width: 1 },
    locked: { fill: '#f8fafc', stroke: '#e2e8f0', title: '#94a3b8', sub: '#cbd5e1', dash: '5 4' as string | undefined, width: 1 },
} as const;

const ARROW = '#94a3b8';

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

function GuidedNode({
    step,
    selected,
    onSelect,
    children,
}: {
    step: GuidedStepState;
    selected: boolean;
    onSelect: (id: GuidedStepId) => void;
    children?: ReactNode;
}) {
    const geo = NODE_GEOMETRY[step.id];
    const style = STATUS_STYLE[step.status];
    const cx = geo.x + geo.w / 2;
    const label = `${step.order}단계 ${step.title} — ${step.summary}`;

    return (
        <g
            className="guided-node"
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={selected}
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
                strokeDasharray={style.dash}
            />
            <text x={cx} y={geo.y + 23} textAnchor="middle" fontSize="14" fontWeight="600" fill={style.title}>
                {step.status === 'done' ? '✓ ' : ''}
                {step.order} {step.title}
            </text>
            <text x={cx} y={geo.y + 43} textAnchor="middle" fontSize="12" fill={style.sub}>
                {step.status === 'current' ? '← 지금 여기 · ' : ''}
                {step.summary}
            </text>
            {children}
        </g>
    );
}

// 지도형 작업 공간의 본체 — 8단계 산정 지도. 상자를 누르면 해당 단계 패널이 열린다.
export function GuidedMap({
    steps,
    selected,
    onSelect,
    outputLabel,
}: {
    steps: GuidedStepState[];
    selected: GuidedStepId | null;
    onSelect: (id: GuidedStepId) => void;
    outputLabel: string;
}) {
    const byId = new Map(steps.map((step) => [step.id, step]));
    const node = (id: GuidedStepId) => {
        const step = byId.get(id);
        if (!step) {
            return null;
        }
        return <GuidedNode step={step} selected={selected === id} onSelect={onSelect} />;
    };

    return (
        <svg
            width="100%"
            viewBox="0 0 680 556"
            role="img"
            aria-label="CBAM 산정 지도 — 8단계 진행 상태"
            style={{ maxWidth: '100%', height: 'auto' }}
            xmlns="http://www.w3.org/2000/svg"
        >
            <title>CBAM 산정 지도</title>
            <desc>사업장 등록부터 EU 문서 생성까지 8단계의 진행 상태를 지도로 보여줍니다. 각 상자를 누르면 해당 단계의 입력 패널이 열립니다.</desc>
            <style>{`
                .guided-node { cursor: pointer; }
                .guided-node:hover .guided-rect { stroke-width: 2.5; }
                .guided-node:focus { outline: none; }
                .guided-node:focus .guided-rect { stroke-width: 2.5; }
            `}</style>
            <defs>
                <marker id="guided-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
            </defs>

            <line x1="225" y1="82" x2="298" y2="108" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#guided-arrow)" />
            <line x1="455" y1="82" x2="382" y2="108" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#guided-arrow)" />
            <line x1="340" y1="166" x2="135" y2="200" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#guided-arrow)" />
            <line x1="340" y1="166" x2="340" y2="200" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#guided-arrow)" />
            <line x1="340" y1="166" x2="545" y2="200" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#guided-arrow)" />
            <line x1="132" y1="262" x2="300" y2="290" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#guided-arrow)" />
            <line x1="340" y1="262" x2="340" y2="290" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#guided-arrow)" />
            <line x1="547" y1="262" x2="380" y2="290" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#guided-arrow)" />

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
