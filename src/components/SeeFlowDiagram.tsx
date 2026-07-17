'use client';

import { glossaryText } from '@/lib/cbam-glossary';
import { buildSeeFlowBinding, EXAMPLE_SEE_FLOW, type SeeFlowBinding } from '@/lib/see-flow';
import type { LocalCalculationResult } from '@/lib/calculation-engine';
import { useRouter } from 'next/navigation';
import { type ReactNode, useMemo } from 'react';

const fmtT = (value: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(value);
const fmtSee = (value: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(value);

const COLORS = {
    amber: { fill: '#fef3c7', stroke: '#d97706', title: '#92400e', sub: '#b45309' },
    indigo: { fill: '#e0e7ff', stroke: '#4f46e5', title: '#3730a3', sub: '#4338ca' },
    teal: { fill: '#ccfbf1', stroke: '#0d9488', title: '#115e59', sub: '#0f766e' },
    emerald: { fill: '#d1fae5', stroke: '#059669', title: '#065f46', sub: '#047857' },
    slate: { fill: '#f1f5f9', stroke: '#94a3b8', title: '#334155', sub: '#475569' },
    plain: { fill: '#ffffff', stroke: '#cbd5e1', title: '#0f172a', sub: '#475569' },
} as const;

const ARROW = '#94a3b8';

// 클릭 가능한 노드(상자). 키보드(Enter/Space)로도 이동 가능하도록 한다.
// 모듈 스코프에 선언해야 렌더마다 재생성되지 않는다(react-hooks/static-components).
function SeeNode({
    href,
    label,
    term,
    push,
    children,
}: {
    href: string;
    label: string;
    term?: string;
    push: (href: string) => void;
    children: ReactNode;
}) {
    return (
        <g
            className="see-node"
            role="link"
            tabIndex={0}
            aria-label={label}
            onClick={() => push(href)}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    push(href);
                }
            }}
        >
            <title>{term ? glossaryText(term) ?? label : label}</title>
            {children}
        </g>
    );
}

// SEE(제품 1톤당 배출량)가 어떻게 계산되는지 한 장으로 보여주는 클릭형 흐름도.
// 상자를 누르면 해당 입력/결과 화면으로 이동한다. 실데이터가 없으면 예시 수치를 흐리게 보여준다.
export function SeeFlowDiagram({
    results,
    binding: bindingProp,
    className,
}: {
    results?: LocalCalculationResult[];
    binding?: SeeFlowBinding;
    className?: string;
}) {
    const router = useRouter();
    const binding = useMemo(
        () => bindingProp ?? (results ? buildSeeFlowBinding(results) : EXAMPLE_SEE_FLOW),
        [bindingProp, results]
    );

    const {
        isExample,
        productName,
        cnCode,
        indirectRelevance,
        outputMassT,
        directEmissions,
        ownIndirectEmissions,
        precursorDirectEmissions,
        precursorIndirectEmissions,
        seeCbamBasis,
        seeIndirect,
        seeTotal,
    } = binding;

    const push = (href: string) => router.push(href);

    const indirectIncluded = indirectRelevance === 'INCLUDED';
    const indirectUndetermined = indirectRelevance === 'UNDETERMINED';

    const basisSub = indirectUndetermined ? '판정 전이라 산출하지 않음' : indirectIncluded ? '= ① + ② + ③ 전부' : '= ① 전부 + ③의 태운 몫';
    // 「철강(CN 72/73) 규칙 기준」은 접두 규칙 진술이다. 판정은 공식 CN 목록 조회로 한다.
    const basisNote = indirectUndetermined
        ? '간접배출 관련성 판정 불가 — 확인 필요'
        : indirectIncluded
            ? '간접 포함 품목 기준'
            : 'EU 공식 CN 목록상 간접배출 비관련';
    const indirectLabel = indirectIncluded ? '간접 SEE (기준에 포함)' : '간접 SEE (보고용)';
    const indirectNote = indirectUndetermined
        ? '인증서 기준 반영 여부 확인 필요'
        : indirectIncluded
            ? '인증서 계산에도 포함'
            : '인증서 계산에서만 제외 · 입력 필수';
    // seeCbamBasis가 null인 이유는 ①범위 밖 ②판정 불가 둘이다. 둘을 뭉개면 판정 못 한 제품에
    // 「신고 대상 아님」을 단정하게 된다 — CN 목록은 포함 목록이라 부재가 곧 배제가 아니다(씨밤이 P1).
    const basisValue = seeCbamBasis !== null
        ? `${fmtSee(seeCbamBasis)} tCO₂e/t`
        : indirectUndetermined
            ? '판정 불가 — 산출 안 함'
            : '신고 대상 아님';
    const showTotalIdentity = !indirectIncluded && !indirectUndetermined && seeCbamBasis !== null;
    const totalText = showTotalIdentity
        ? `총 SEE (내부 검토용) ${fmtSee(seeTotal)} tCO₂e/t = ${fmtSee(seeCbamBasis!)} + ${fmtSee(seeIndirect)}`
        : `총 SEE (내부 검토용) ${fmtSee(seeTotal)} tCO₂e/t`;
    const caption = isExample
        ? '수치는 이해용 가상 예시입니다 — 입력하면 우리 회사 값으로 바뀝니다'
        : `${productName ?? '대표 품목'}${cnCode ? ` · CN ${cnCode}` : ''} 기준 · 신고 대상 생산량 합계`;

    return (
        <div className={className}>
            <svg
                width="100%"
                viewBox="0 0 680 646"
                role="img"
                aria-label="철강 제품 CBAM 배출량 산정 흐름도"
                style={{ maxWidth: '100%', height: 'auto', opacity: isExample ? 0.92 : 1 }}
                xmlns="http://www.w3.org/2000/svg"
            >
                <title>철강 제품 CBAM 배출량(SEE) 산정 흐름</title>
                <desc>
                    연료 직접배출, 전력 간접배출, 전구물질 배출이 생산공정에 모여 생산량으로 나뉘어 SEE가 됩니다. 철강은 간접
                    SEE가 인증서 계산에서만 제외되고 보고에는 포함됩니다. 각 상자를 누르면 입력·결과 화면으로 이동합니다.
                </desc>
                <style>{`
                    .see-node { cursor: pointer; }
                    .see-node:hover .see-rect { stroke-width: 2.5; }
                    .see-node:focus { outline: none; }
                    .see-node:focus .see-rect { stroke-width: 2.5; stroke-dasharray: 0; }
                `}</style>
                <defs>
                    <marker id="see-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </marker>
                </defs>

                {/* 기간 태그 + 예시 배지 */}
                <g>
                    <rect x="40" y="48" width="152" height="26" rx="6" fill={COLORS.slate.fill} stroke={COLORS.slate.stroke} strokeWidth="0.5" />
                    <text x="116" y="65" textAnchor="middle" fontSize="12" fill={COLORS.slate.title}>2026 확정기간 기준</text>
                </g>
                {isExample && (
                    <g>
                        <rect x="566" y="48" width="74" height="26" rx="13" fill="#fee2e2" stroke="#dc2626" strokeWidth="0.5" />
                        <text x="603" y="65" textAnchor="middle" fontSize="12" fill="#991b1b">예시 데이터</text>
                    </g>
                )}

                {/* 경계 밖 투입: 전력 / 구매한 원료 */}
                <SeeNode push={push} href="/processes" label="전력 사용량 입력으로 이동" term="간접배출">
                    <rect className="see-rect" x="230" y="82" width="190" height="52" rx="8" fill={COLORS.indigo.fill} stroke={COLORS.indigo.stroke} strokeWidth="1" />
                    <text x="325" y="104" textAnchor="middle" fontSize="14" fontWeight="600" fill={COLORS.indigo.title}>전력</text>
                    <text x="325" y="122" textAnchor="middle" fontSize="12" fill={COLORS.indigo.sub}>발전소에서 만들어 옴</text>
                </SeeNode>
                <SeeNode push={push} href="/precursors" label="전구물질(구매한 원료) 입력으로 이동" term="전구물질">
                    <rect className="see-rect" x="450" y="82" width="190" height="52" rx="8" fill={COLORS.teal.fill} stroke={COLORS.teal.stroke} strokeWidth="1" />
                    <text x="545" y="104" textAnchor="middle" fontSize="14" fontWeight="600" fill={COLORS.teal.title}>구매한 원료 강재</text>
                    <text x="545" y="122" textAnchor="middle" fontSize="12" fill={COLORS.teal.sub}>규정 용어: 전구물질</text>
                </SeeNode>
                <line x1="325" y1="134" x2="325" y2="176" stroke={COLORS.indigo.stroke} strokeWidth="1.5" markerEnd="url(#see-arrow)" />
                <line x1="545" y1="134" x2="545" y2="176" stroke={COLORS.teal.stroke} strokeWidth="1.5" markerEnd="url(#see-arrow)" />

                {/* 산정 경계 */}
                <rect x="40" y="150" width="600" height="128" rx="10" fill="none" stroke={COLORS.slate.stroke} strokeWidth="1" strokeDasharray="6 4" />
                <text x="56" y="170" fontSize="12" fill={COLORS.slate.sub}>산정 경계 — 우리 공장(사업장 1곳)</text>

                <SeeNode push={push} href="/source-streams" label="연료 배출원 입력으로 이동" term="직접배출">
                    <rect className="see-rect" x="58" y="188" width="164" height="52" rx="8" fill={COLORS.amber.fill} stroke={COLORS.amber.stroke} strokeWidth="1" />
                    <text x="140" y="210" textAnchor="middle" fontSize="14" fontWeight="600" fill={COLORS.amber.title}>연료 연소</text>
                    <text x="140" y="228" textAnchor="middle" fontSize="12" fill={COLORS.amber.sub}>LNG·경유 등</text>
                </SeeNode>
                <line x1="222" y1="214" x2="286" y2="214" stroke={COLORS.amber.stroke} strokeWidth="1.5" markerEnd="url(#see-arrow)" />
                <SeeNode push={push} href="/processes" label="생산공정 입력으로 이동" term="생산경로">
                    <rect className="see-rect" x="290" y="184" width="300" height="80" rx="8" fill={COLORS.plain.fill} stroke={COLORS.plain.stroke} strokeWidth="1" />
                    <text x="440" y="208" textAnchor="middle" fontSize="14" fontWeight="600" fill={COLORS.plain.title}>생산공정</text>
                    <text x="440" y="228" textAnchor="middle" fontSize="12" fill={COLORS.plain.sub}>예: 신선 → 소둔(열처리)</text>
                    <text x="440" y="246" textAnchor="middle" fontSize="12" fill={COLORS.plain.sub}>생산량 {fmtT(outputMassT)} t</text>
                </SeeNode>

                {/* 경계 → 집계 화살표 */}
                <line x1="330" y1="264" x2="150" y2="306" stroke={COLORS.amber.stroke} strokeWidth="1.5" markerEnd="url(#see-arrow)" />
                <line x1="440" y1="264" x2="345" y2="306" stroke={COLORS.indigo.stroke} strokeWidth="1.5" markerEnd="url(#see-arrow)" />
                <line x1="545" y1="264" x2="545" y2="306" stroke={COLORS.teal.stroke} strokeWidth="1.5" markerEnd="url(#see-arrow)" />

                {/* 집계 상자 ①②③ */}
                <SeeNode push={push} href="/source-streams" label="① 직접배출 — 배출원 화면으로 이동" term="직접배출">
                    <rect className="see-rect" x="40" y="310" width="185" height="70" rx="8" fill={COLORS.amber.fill} stroke={COLORS.amber.stroke} strokeWidth="1" />
                    <text x="132" y="332" textAnchor="middle" fontSize="14" fontWeight="600" fill={COLORS.amber.title}>① 직접배출</text>
                    <text x="132" y="350" textAnchor="middle" fontSize="12" fill={COLORS.amber.sub}>연료×발열량×배출계수</text>
                    <text x="132" y="368" textAnchor="middle" fontSize="12" fill={COLORS.amber.sub}>{fmtT(directEmissions)} tCO₂e</text>
                </SeeNode>
                <SeeNode push={push} href="/processes" label="② 간접배출 — 공정 전력 칸으로 이동" term="간접배출">
                    <rect className="see-rect" x="247" y="310" width="186" height="70" rx="8" fill={COLORS.indigo.fill} stroke={COLORS.indigo.stroke} strokeWidth="1" />
                    <text x="340" y="332" textAnchor="middle" fontSize="14" fontWeight="600" fill={COLORS.indigo.title}>② 간접배출</text>
                    <text x="340" y="350" textAnchor="middle" fontSize="12" fill={COLORS.indigo.sub}>MWh × 전력 배출계수</text>
                    <text x="340" y="368" textAnchor="middle" fontSize="12" fill={COLORS.indigo.sub}>{fmtT(ownIndirectEmissions)} tCO₂e</text>
                </SeeNode>
                <SeeNode push={push} href="/precursors" label="③ 전구물질 배출 — 전구물질 화면으로 이동" term="전구물질">
                    <rect className="see-rect" x="455" y="310" width="185" height="70" rx="8" fill={COLORS.teal.fill} stroke={COLORS.teal.stroke} strokeWidth="1" />
                    <text x="547" y="332" textAnchor="middle" fontSize="14" fontWeight="600" fill={COLORS.teal.title}>③ 전구물질 배출</text>
                    <text x="547" y="350" textAnchor="middle" fontSize="12" fill={COLORS.teal.sub}>소비량 × 원료 SEE</text>
                    <text x="547" y="368" textAnchor="middle" fontSize="12" fill={COLORS.teal.sub}>직접 {fmtT(precursorDirectEmissions)} · 간접 {fmtT(precursorIndirectEmissions)}</text>
                </SeeNode>

                <line x1="132" y1="380" x2="300" y2="404" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#see-arrow)" />
                <line x1="340" y1="380" x2="340" y2="404" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#see-arrow)" />
                <line x1="547" y1="380" x2="380" y2="404" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#see-arrow)" />

                {/* ÷ 생산량 */}
                <rect x="255" y="408" width="170" height="32" rx="16" fill={COLORS.slate.fill} stroke={COLORS.slate.stroke} strokeWidth="0.5" />
                <text x="340" y="429" textAnchor="middle" fontSize="14" fontWeight="600" fill={COLORS.slate.title}>÷ 생산량 {fmtT(outputMassT)} t</text>

                <line x1="320" y1="440" x2="220" y2="460" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#see-arrow)" />
                <line x1="360" y1="440" x2="470" y2="460" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#see-arrow)" />

                {/* 결과 상자 */}
                <SeeNode push={push} href="/results" label="CBAM 산정 기준 SEE — 결과 화면으로 이동" term="CBAM 산정 기준 SEE">
                    <rect className="see-rect" x="100" y="464" width="232" height="86" rx="8" fill={COLORS.emerald.fill} stroke={COLORS.emerald.stroke} strokeWidth="1" />
                    <text x="216" y="487" textAnchor="middle" fontSize="14" fontWeight="600" fill={COLORS.emerald.title}>CBAM 산정 기준 SEE</text>
                    <text x="216" y="506" textAnchor="middle" fontSize="12" fill={COLORS.emerald.sub}>{basisSub}</text>
                    <text x="216" y="525" textAnchor="middle" fontSize="14" fontWeight="600" fill={COLORS.emerald.title}>{basisValue}</text>
                    <text x="216" y="542" textAnchor="middle" fontSize="12" fill={COLORS.emerald.sub}>{basisNote}</text>
                </SeeNode>
                <SeeNode push={push} href="/results" label={`${indirectLabel} — 결과 화면으로 이동`} term="간접배출">
                    <rect className="see-rect" x="360" y="464" width="232" height="86" rx="8" fill={COLORS.indigo.fill} stroke={COLORS.indigo.stroke} strokeWidth="1" />
                    <text x="476" y="487" textAnchor="middle" fontSize="14" fontWeight="600" fill={COLORS.indigo.title}>{indirectLabel}</text>
                    <text x="476" y="506" textAnchor="middle" fontSize="12" fill={COLORS.indigo.sub}>= ② 전부 + ③의 전기 몫</text>
                    <text x="476" y="525" textAnchor="middle" fontSize="14" fontWeight="600" fill={COLORS.indigo.title}>{fmtSee(seeIndirect)} tCO₂e/t</text>
                    <text x="476" y="542" textAnchor="middle" fontSize="12" fill={COLORS.indigo.sub}>{indirectNote}</text>
                </SeeNode>

                <line x1="216" y1="550" x2="250" y2="566" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#see-arrow)" />
                <line x1="476" y1="550" x2="440" y2="566" stroke={ARROW} strokeWidth="1.5" markerEnd="url(#see-arrow)" />

                {/* 총 SEE */}
                <SeeNode push={push} href="/results" label="총 SEE(내부 검토용) — 결과 화면으로 이동" term="총 SEE">
                    <rect className="see-rect" x="100" y="570" width="492" height="40" rx="8" fill={COLORS.slate.fill} stroke={COLORS.slate.stroke} strokeWidth="1" />
                    <text x="346" y="595" textAnchor="middle" fontSize="14" fontWeight="600" fill={COLORS.slate.title}>{totalText}</text>
                </SeeNode>

                <text x="340" y="634" textAnchor="middle" fontSize="12" fill={COLORS.slate.sub}>{caption}</text>
            </svg>
        </div>
    );
}
