'use client';

// ─────────────────────────────────────────────────────────────────────────────
// 씨밤이 UX 개선 "점검용" 프리뷰 — 쉬운 입력 모드
//
// ⚠️ 이 파일은 점검(평가) 전용 프로토타입입니다.
//   - 실제 기능/저장 없음(로컬 state만). 산정값은 데모용 간이 계산.
//   - 기존(원문) 화면·컴포넌트는 일절 수정하지 않았습니다. 새 파일 1개만 추가.
//   - /cockpit-preview/* 만 라이선스 게이트 없이 렌더되므로 이 경로에 둡니다(내용은 cockpit과 무관).
//
// 담은 개선안 3가지:
//   ① 위저드 입력 모드(한 번에 하나씩, 진행바, 필수 먼저)
//   ② "이 값 어디서 구하나" 도우미(칸마다 ? → 출처 안내 + 예시값 원클릭)
//   ③ 전문용어 툴팁 + 용어집
// ─────────────────────────────────────────────────────────────────────────────

import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    CheckCircle2,
    HelpCircle,
    Lightbulb,
    RotateCcw,
} from 'lucide-react';
import { useMemo, useState } from 'react';

// ── 용어집(③) ────────────────────────────────────────────────────────────────
const GLOSSARY: Record<string, string> = {
    SEE: '내재배출량(Specific Embedded Emissions). 제품 1톤을 만들며 나온 온실가스량(tCO₂e/t). CBAM 신고의 핵심 숫자입니다.',
    'CN 코드': 'EU가 쓰는 8자리 품목 분류 코드. 우리 관세 HS코드와 앞 6자리가 같고 뒤 2자리가 더 붙습니다.',
    전구물질: '제품을 만들 때 투입한 CBAM 대상 원료(예: 선철·합금철·조강). 그 원료에 딸린 배출도 최종 제품에 더해집니다.',
    배출원: '연료·전기처럼 배출을 일으키는 항목. 각 배출원의 활동량 × 배출계수로 배출량을 구합니다.',
    'direct-only': '철강 등 일부(Annex II) 품목은 CBAM 인증서 계산에 직접배출만 넣습니다. 제품 자체의 전기 간접배출은 제외(보고용으로만 보존).',
    NCV: '순발열량(Net Calorific Value). 연료 1단위가 내는 에너지(GJ/단위). 활동량과 단위 기준이 같아야 합니다.',
    '전력 배출계수': '전기 1MWh당 배출량(tCO₂e/MWh). CBAM은 출처 위계가 있어 아무 값이나 못 씁니다.',
    인증서: 'CBAM 의무를 정산하는 단위. 대략 (제품 SEE − 무상기준) × 수입량으로 산정됩니다(검토용 지표).',
};

function Term({ k, children }: { k: string; children?: React.ReactNode }) {
    const desc = GLOSSARY[k];
    return (
        <span className="group relative inline-flex cursor-help items-center gap-0.5 border-b border-dashed border-teal-400 text-teal-800">
            {children ?? k}
            <HelpCircle className="h-3 w-3 text-teal-500" />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-xs leading-5 text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                <span className="font-semibold">{k}</span>
                <br />
                {desc}
            </span>
        </span>
    );
}

// ── 필드 도우미(②) ───────────────────────────────────────────────────────────
type HelperProps = {
    open: boolean;
    onToggle: () => void;
    title: string;
    sources: string[];
    exampleLabel?: string;
    onExample?: () => void;
};

function FieldHelp({ open, onToggle, title, sources, exampleLabel, onExample }: HelperProps) {
    return (
        <span className="relative inline-block align-middle">
            <button
                type="button"
                onClick={onToggle}
                className="inline-flex h-6 items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 text-xs font-medium text-teal-700 hover:bg-teal-100"
            >
                <HelpCircle className="h-3.5 w-3.5" /> 이 값 어디서?
            </button>
            {open && (
                <div className="absolute left-0 top-8 z-30 w-72 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700 shadow-xl">
                    <p className="mb-1 font-semibold text-slate-900">{title}</p>
                    <ul className="list-disc space-y-1 pl-4">
                        {sources.map((s, i) => (
                            <li key={i}>{s}</li>
                        ))}
                    </ul>
                    {exampleLabel && onExample && (
                        <button
                            type="button"
                            onClick={onExample}
                            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-700"
                        >
                            <Lightbulb className="h-3.5 w-3.5" /> {exampleLabel}
                        </button>
                    )}
                </div>
            )}
        </span>
    );
}

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

type Draft = {
    productName: string;
    cnCode: string;
    outputMassT: string;
    directTco2e: string;
    electricityMwh: string;
    electricityEf: string;
    electricityEfSource: string;
    precursorName: string;
    precursorConsumedT: string;
    precursorDirectSee: string;
    precursorIndirectSee: string;
};

const EMPTY: Draft = {
    productName: '',
    cnCode: '',
    outputMassT: '',
    directTco2e: '',
    electricityMwh: '',
    electricityEf: '',
    electricityEfSource: '',
    precursorName: '',
    precursorConsumedT: '',
    precursorDirectSee: '',
    precursorIndirectSee: '',
};

const EF_SOURCES = [
    { value: '', label: '— 전기를 어디서 받았나요? —' },
    { value: 'COUNTRY_GRID_DEFAULT', label: '한전 등 일반 계통 전기 (국가 기본값 사용)' },
    { value: 'DIRECT_TECHNICAL_LINK', label: '발전소와 직접 연결된 전용선' },
    { value: 'PPA', label: '전력구매계약(PPA)으로 받은 전기' },
    { value: 'INSTALLATION_OWN', label: '우리 공장 자가발전' },
    { value: 'MIX', label: '여러 경로 혼합' },
];

const STEPS = ['제품', '생산량', '직접배출', '전기', '원료', '결과'] as const;

export default function EasyModePreview() {
    const [step, setStep] = useState(0);
    const [d, setD] = useState<Draft>(EMPTY);
    const [help, setHelp] = useState<string | null>(null);
    const [showGlossary, setShowGlossary] = useState(false);

    const set = (k: keyof Draft, v: string) => setD((p) => ({ ...p, [k]: v }));
    const num = (v: string) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    };
    const toggleHelp = (id: string) => setHelp((cur) => (cur === id ? null : id));

    // ── 데모용 간이 산정 (실제 엔진 아님, 점검용) ─────────────────────────────
    const result = useMemo(() => {
        const output = num(d.outputMassT);
        if (output <= 0) return null;
        const directSee = num(d.directTco2e) / output;
        const ownIndirectSee = (num(d.electricityMwh) * num(d.electricityEf)) / output;
        const precDirect = (num(d.precursorConsumedT) * num(d.precursorDirectSee)) / output;
        const precIndirect = (num(d.precursorConsumedT) * num(d.precursorIndirectSee)) / output;
        // 철강 direct-only 가정: 인증서 기준 = 자체 직접 + 전구물질 직접 (자체·전구물질 간접 제외)
        const cbamBasis = directSee + precDirect;
        const informational = directSee + ownIndirectSee + precDirect + precIndirect;
        return {
            directSee,
            ownIndirectSee,
            precDirect,
            precIndirect,
            cbamBasis,
            informational,
        };
    }, [d]);

    const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
    const progress = Math.round((step / (STEPS.length - 1)) * 100);

    return (
        <div className="min-h-screen bg-[#F6F8F7] px-4 py-8 text-slate-950">
            <div className="mx-auto w-full max-w-2xl">
                {/* 점검용 안내 배너 */}
                <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-semibold">🔍 씨밤이 UX 개선 점검용 프리뷰 — 쉬운 입력 모드</p>
                    <p className="mt-1 text-xs leading-5">
                        평가 전용 프로토타입입니다. 실제 저장·산정 기능이 아니며(데모 계산), <strong>기존 화면 코드는 전혀 수정하지 않았습니다</strong>.
                        담은 개선안: ① 한 번에 하나씩 위저드 ② &quot;이 값 어디서?&quot; 도우미 ③ 전문용어 툴팁·용어집.
                    </p>
                </div>

                {/* 헤더 + 용어집 토글 */}
                <div className="mb-3 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-teal-700">쉬운 입력 모드 (시범)</p>
                        <h1 className="text-xl font-semibold tracking-tight">한 단계씩 채우면 CBAM 배출량이 나옵니다</h1>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowGlossary((s) => !s)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        <BookOpen className="h-4 w-4 text-teal-700" /> 용어집
                    </button>
                </div>

                {showGlossary && (
                    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="mb-2 text-sm font-semibold text-slate-900">CBAM 용어 한눈에</p>
                        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                            {Object.entries(GLOSSARY).map(([k, v]) => (
                                <div key={k} className="rounded-xl bg-slate-50 p-3">
                                    <dt className="font-semibold text-teal-800">{k}</dt>
                                    <dd className="mt-0.5 text-xs leading-5 text-slate-600">{v}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                )}

                {/* 진행바 */}
                <div className="mb-5">
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                        <span>
                            {step + 1} / {STEPS.length} · {STEPS[step]}
                        </span>
                        <span>{progress}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {STEPS.map((label, i) => (
                            <span
                                key={label}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                                    i < step
                                        ? 'bg-teal-100 text-teal-800'
                                        : i === step
                                          ? 'bg-teal-600 text-white'
                                          : 'bg-slate-100 text-slate-400'
                                }`}
                            >
                                {i < step && <CheckCircle2 className="h-3 w-3" />}
                                {label}
                            </span>
                        ))}
                    </div>
                </div>

                {/* 카드: 한 번에 하나(또는 두) 질문 */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    {step === 0 && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold">어떤 제품을 신고하나요?</h2>
                            <div>
                                <label className="text-sm font-semibold text-slate-700">제품명</label>
                                <input className={fieldClass} value={d.productName} placeholder="예: 스테인리스 열연강판" onChange={(e) => set('productName', e.target.value)} />
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-slate-700">
                                    <Term k="CN 코드" /> (8자리)
                                </label>{' '}
                                <FieldHelp
                                    open={help === 'cn'}
                                    onToggle={() => toggleHelp('cn')}
                                    title="CN 코드는 어디서 확인하나요?"
                                    sources={[
                                        '수출 인보이스·관세사에게 받은 HS코드 앞 6자리 + EU CN 뒤 2자리',
                                        'EU TARIC 또는 관세청 품목분류 조회',
                                        '품목 화면의 "EU 템플릿에서 가져오기"로 자동 검색',
                                    ]}
                                    exampleLabel="예시값 채우기 (72191310)"
                                    onExample={() => set('cnCode', '72191310')}
                                />
                                <input className={fieldClass} value={d.cnCode} placeholder="예: 72191310" onChange={(e) => set('cnCode', e.target.value)} />
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold">이 제품을 얼마나 만들었나요?</h2>
                            <p className="text-sm text-slate-500">보고기간(보통 1년) 동안의 총 생산량을 톤(t)으로 적어주세요.</p>
                            <div>
                                <label className="text-sm font-semibold text-slate-700">총 생산량 (t)</label>{' '}
                                <FieldHelp
                                    open={help === 'output'}
                                    onToggle={() => toggleHelp('output')}
                                    title="생산량은 어디서?"
                                    sources={['생산관리(MES)·ERP 출하/생산 실적', '연간 생산일보 합계']}
                                    exampleLabel="예시값 채우기 (1,133,000)"
                                    onExample={() => set('outputMassT', '1133000')}
                                />
                                <input type="number" className={fieldClass} value={d.outputMassT} placeholder="예: 1133000" onChange={(e) => set('outputMassT', e.target.value)} />
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold">공장에서 직접 나온 배출은 얼마인가요?</h2>
                            <p className="text-sm text-slate-500">
                                연료 연소·공정에서 직접 나온 <Term k="배출원" /> 배출량 합계입니다(tCO₂). 아직 모르면 예시로 둘러보세요.
                            </p>
                            <div>
                                <label className="text-sm font-semibold text-slate-700">직접배출량 (tCO₂)</label>{' '}
                                <FieldHelp
                                    open={help === 'direct'}
                                    onToggle={() => toggleHelp('direct')}
                                    title="직접배출량은 어디서?"
                                    sources={[
                                        '연료 사용량 × 배출계수(고지서·계측기 검침)',
                                        '단위 주의: 활동량(t/Nm³)과 ' + 'NCV(GJ/단위) 기준이 같아야 함',
                                        '물질수지면 산출물(조강·슬래그) 탄소는 차감(−)',
                                    ]}
                                    exampleLabel="예시값 채우기 (402,245)"
                                    onExample={() => set('directTco2e', '402245')}
                                />
                                <input type="number" className={fieldClass} value={d.directTco2e} placeholder="예: 402245" onChange={(e) => set('directTco2e', e.target.value)} />
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold">전기를 얼마나, 어떤 전기를 썼나요?</h2>
                            <div>
                                <label className="text-sm font-semibold text-slate-700">전력 사용량 (MWh)</label>{' '}
                                <FieldHelp
                                    open={help === 'mwh'}
                                    onToggle={() => toggleHelp('mwh')}
                                    title="전력 사용량은 어디서?"
                                    sources={['한전 전기요금 고지서 연간 합계(kWh ÷ 1000 = MWh)', '공장 계측기 합산']}
                                    exampleLabel="예시값 채우기 (324,700)"
                                    onExample={() => set('electricityMwh', '324700')}
                                />
                                <input type="number" className={fieldClass} value={d.electricityMwh} placeholder="예: 324700" onChange={(e) => set('electricityMwh', e.target.value)} />
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-slate-700">
                                    <Term k="전력 배출계수" /> (tCO₂e/MWh)
                                </label>{' '}
                                <FieldHelp
                                    open={help === 'ef'}
                                    onToggle={() => toggleHelp('ef')}
                                    title="전력 배출계수는 어디서? (CBAM 위계 주의)"
                                    sources={[
                                        '원칙: EU Commission 제공 국가/지역 계통 기본값(IEA 기반)',
                                        '실측 EF는 발전소 직접연결 또는 PPA에 한해 허용',
                                        '⛔ Guarantees of Origin·녹색인증서로 EF를 낮출 수 없음',
                                    ]}
                                    exampleLabel="EU 예제값 채우기 (0.833)"
                                    onExample={() => set('electricityEf', '0.833')}
                                />
                                <input type="number" className={fieldClass} value={d.electricityEf} placeholder="예: 0.833" onChange={(e) => set('electricityEf', e.target.value)} />
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-slate-700">이 전기는 어디서 받았나요? (EF 출처)</label>
                                <select className={fieldClass} value={d.electricityEfSource} onChange={(e) => set('electricityEfSource', e.target.value)}>
                                    {EF_SOURCES.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                                <p className="mt-1 text-xs text-slate-500">
                                    철강은 <Term k="direct-only" />이라 제품 자체 전기 간접배출은 인증서 기준에서 빠지고, 보고용으로만 남습니다.
                                </p>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold">
                                <Term k="전구물질" />(원료)를 사 왔나요?
                            </h2>
                            <p className="text-sm text-slate-500">선철·합금철·조강 등 CBAM 대상 원료를 매입했다면 그 원료의 내재배출도 제품에 더해집니다. 없으면 비워두고 넘어가세요.</p>
                            <div>
                                <label className="text-sm font-semibold text-slate-700">원료명 / 소비량 (t)</label>
                                <div className="mt-1 grid grid-cols-2 gap-2">
                                    <input className={fieldClass + ' mt-0'} value={d.precursorName} placeholder="예: 페로니켈" onChange={(e) => set('precursorName', e.target.value)} />
                                    <input type="number" className={fieldClass + ' mt-0'} value={d.precursorConsumedT} placeholder="예: 347000" onChange={(e) => set('precursorConsumedT', e.target.value)} />
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-slate-700">원료의 <Term k="SEE" /> — 직접 / 간접 (tCO₂e/t)</label>{' '}
                                <FieldHelp
                                    open={help === 'prec'}
                                    onToggle={() => toggleHelp('prec')}
                                    title="원료 SEE는 어디서?"
                                    sources={[
                                        '공급사가 준 탄소데이터시트(Communication Template)의 SEE(direct)/SEE(indirect)',
                                        '⚠️ 공급사가 "전력 MWh/t"로만 줬다면 전력 배출계수를 곱해 tCO₂e/t로 환산',
                                        '공급사 자료가 없으면 국가/CN 공식 기본값(연도 mark-up 포함) 사용',
                                    ]}
                                    exampleLabel="예시값 채우기 (3.0 / 2.5)"
                                    onExample={() => {
                                        set('precursorDirectSee', '3.0');
                                        set('precursorIndirectSee', '2.5');
                                    }}
                                />
                                <div className="mt-1 grid grid-cols-2 gap-2">
                                    <input type="number" className={fieldClass + ' mt-0'} value={d.precursorDirectSee} placeholder="직접 예: 3.0" onChange={(e) => set('precursorDirectSee', e.target.value)} />
                                    <input type="number" className={fieldClass + ' mt-0'} value={d.precursorIndirectSee} placeholder="간접 예: 2.5" onChange={(e) => set('precursorIndirectSee', e.target.value)} />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 5 && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold">결과 — 신고용 배출량</h2>
                            {!result ? (
                                <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">생산량을 입력하면 결과가 계산됩니다. (2단계로 돌아가세요)</p>
                            ) : (
                                <>
                                    <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5">
                                        <p className="text-sm text-teal-900">
                                            <strong>{d.productName || '이 제품'}</strong>
                                            {d.cnCode ? ` (CN ${d.cnCode})` : ''}의 CBAM 신고용 배출량은
                                        </p>
                                        <p className="mt-1 text-4xl font-semibold tracking-tight text-teal-800">
                                            {fmt(result.cbamBasis)} <span className="text-lg font-medium">tCO₂e/t</span>
                                        </p>
                                        <p className="mt-2 text-sm text-teal-900">수입자(고객사)에게 이 값을 전달하세요.</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                                        <p className="mb-2 font-semibold text-slate-900">어떻게 나온 값인가요?</p>
                                        <ul className="space-y-1 text-slate-600">
                                            <li>· 우리 공장 직접배출: <strong>{fmt(result.directSee)}</strong></li>
                                            <li>· 원료(전구물질) 직접배출 전가: <strong>{fmt(result.precDirect)}</strong></li>
                                            <li className="text-teal-800">= 인증서 기준 SEE: <strong>{fmt(result.cbamBasis)}</strong></li>
                                            <li className="mt-2 text-slate-400">
                                                (참고용 총 SEE = {fmt(result.informational)} — 전기 간접배출 포함. 철강은 인증서엔 안 들어감)
                                            </li>
                                        </ul>
                                    </div>
                                    <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                                        ※ 점검용 데모 계산입니다. 실제 산정·EU 템플릿 작성은 본 앱의 정식 기능으로 진행하세요. 규정 정밀 산식은 확인 필요.
                                    </p>
                                </>
                            )}
                        </div>
                    )}

                    {/* 내비게이션 */}
                    <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                        <button
                            type="button"
                            onClick={() => {
                                setHelp(null);
                                setStep((s) => Math.max(0, s - 1));
                            }}
                            disabled={step === 0}
                            className="inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                        >
                            <ArrowLeft className="h-4 w-4" /> 이전
                        </button>
                        {step < STEPS.length - 1 ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setHelp(null);
                                    setStep((s) => Math.min(STEPS.length - 1, s + 1));
                                }}
                                className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-teal-600 px-5 text-sm font-semibold text-white hover:bg-teal-700"
                            >
                                다음 <ArrowRight className="h-4 w-4" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    setD(EMPTY);
                                    setStep(0);
                                }}
                                className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                <RotateCcw className="h-4 w-4" /> 처음부터
                            </button>
                        )}
                    </div>
                </div>

                <p className="mt-4 text-center text-xs text-slate-400">씨밤이(CBAMY) UX 개선 점검용 · /cockpit-preview/easy-mode</p>
            </div>
        </div>
    );
}
