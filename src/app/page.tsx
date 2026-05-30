'use client';

import { PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import { calculateLocalResults, type LocalCalculationResult } from '@/lib/calculation-engine';
import { listLocalItems, seedLocalData } from '@/lib/local-db';
import { AlertTriangle, CheckCircle2, Factory, FileSpreadsheet, Package, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
}

type DashboardTask = {
  label: string;
  href: string;
  tone: 'success' | 'warning';
};

export default function Home() {
  const [results, setResults] = useState<LocalCalculationResult[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [processCount, setProcessCount] = useState(0);
  const [precursorCount, setPrecursorCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      await seedLocalData();
      const [processes, precursors, products, periods, sourceStreams, productOutputLines] = await Promise.all([
        listLocalItems('processes'),
        listLocalItems('precursors'),
        listLocalItems('products'),
        listLocalItems('periods'),
        listLocalItems('source_streams'),
        listLocalItems('product_output_lines'),
      ]);

      setProductCount(products.length);
      setProcessCount(processes.length);
      setPrecursorCount(precursors.length);
      setResults(calculateLocalResults({ processes, precursors, products, periods, sourceStreams, productOutputLines }));
      setLoading(false);
    }

    loadDashboard();
  }, []);

  const dashboard = useMemo(() => {
    const totalOutput = results.reduce((sum, result) => sum + result.output_mass_t, 0);
    const warningTasks: DashboardTask[] = results.flatMap((result) =>
      result.warningDetails.map((warning) => ({
        label: `${result.process_name}: ${warning.message}`,
        href: warning.target.type === 'precursor'
          ? `/precursors?edit=${encodeURIComponent(warning.target.id)}`
          : `/processes?edit=${encodeURIComponent(warning.target.id)}`,
        tone: 'warning' as const,
      }))
    );
    const warningCount = warningTasks.length;
    const sourceStreamWarningCount = results.filter(
      (result) => result.source_stream_count > 0 && Math.abs(result.source_stream_delta_tco2e) > 0.01
    ).length;
    const completedSteps = [
      productCount > 0,
      processCount > 0,
      sourceStreamWarningCount === 0 && results.some((result) => result.source_stream_count > 0),
      results.some((result) => result.indirect_see > 0),
      precursorCount > 0,
    ].filter(Boolean).length;
    const readinessRate = Math.round((completedSteps / 6) * 100);

    const steps = [
      { name: '품목 식별', status: productCount > 0 ? '완료' : '미완료', tone: productCount > 0 ? 'success' as const : 'neutral' as const },
      { name: '생산공정 설정', status: processCount > 0 ? '완료' : '미완료', tone: processCount > 0 ? 'success' as const : 'neutral' as const },
      {
        name: '직접배출량 입력',
        status: sourceStreamWarningCount > 0 ? '확인필요' : results.some((result) => result.source_stream_count > 0) ? '완료' : '진행중',
        tone: sourceStreamWarningCount > 0 ? 'warning' as const : results.some((result) => result.source_stream_count > 0) ? 'success' as const : 'info' as const,
      },
      { name: '간접배출량 입력', status: results.some((result) => result.indirect_see > 0) ? '완료' : '미완료', tone: results.some((result) => result.indirect_see > 0) ? 'success' as const : 'neutral' as const },
      { name: '전구물질 입력', status: precursorCount > 0 ? '완료' : '미완료', tone: precursorCount > 0 ? 'success' as const : 'neutral' as const },
      { name: 'EU Export', status: warningCount > 0 ? '검토중' : '대기', tone: warningCount > 0 ? 'warning' as const : 'pending' as const },
    ];

    const recentTasks: DashboardTask[] = warningTasks.length > 0
      ? warningTasks.slice(0, 4)
      : [
        { label: 'EU 템플릿 Parameters_CNCodes 기준으로 제품 CN 코드 확인', href: '/products', tone: 'success' as const },
        { label: '생산공정별 전력 사용량 입력', href: '/processes', tone: 'success' as const },
        { label: '구매 전구물질 공급업체 자료 출처 확인', href: '/precursors', tone: 'success' as const },
        { label: '.cbam 백업 파일 최신화', href: '/settings', tone: 'success' as const },
      ];

    return {
      totalOutput,
      warningCount,
      readinessRate,
      steps,
      recentTasks,
    };
  }, [precursorCount, processCount, productCount, results]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Local-first CBAM 산정"
        title="2025년 4분기 CBAM 산정 현황"
        description="사업장, 제품, 생산공정, 전구물질 데이터를 로컬에서 관리하고 EU 원본 템플릿으로 제출용 파일을 준비합니다."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="CBAM 대상 품목" value={loading ? '-' : `${productCount}개`} helper="CN 8자리 기준 관리" icon={Package} tone="pending" />
        <StatCard label="총 생산량" value={loading ? '-' : `${formatNumber(dashboard.totalOutput)}t`} helper={`${processCount}개 공정 기준`} icon={Factory} tone="info" />
        <StatCard label="보고 준비율" value={loading ? '-' : `${dashboard.readinessRate}%`} helper="로컬 입력 데이터 기준" icon={TrendingUp} tone="success" />
        <StatCard label="확인 필요 항목" value={loading ? '-' : `${dashboard.warningCount}건`} helper="입력 누락과 경고 포함" icon={AlertTriangle} tone="warning" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <SectionCard
          title="산정 진행 단계"
          description="EU 제출용 파일을 만들기 전 필요한 업무 흐름을 단계별로 확인합니다."
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {dashboard.steps.map((step, index) => (
              <div key={step.name} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                    {index + 1}
                  </div>
                  <div className="font-semibold text-slate-900">{step.name}</div>
                </div>
                <StatusBadge tone={step.tone}>{step.status}</StatusBadge>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="최근 작업 항목" description="다음 작업을 우선 처리하면 Export 준비율이 올라갑니다.">
          <ul className="space-y-3">
            {dashboard.recentTasks.map((task) => (
              <li key={`${task.href}-${task.label}`}>
                <Link href={task.href} className="flex gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 transition hover:bg-teal-50">
                  {task.tone === 'warning' ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-700" />
                  )}
                  <span>{task.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="데이터 보관 원칙" description="무료 PWA 버전은 기업 데이터를 서버로 전송하지 않는 구조를 우선합니다.">
          <div className="rounded-2xl bg-teal-50 p-4 text-sm leading-6 text-teal-900">
            입력 데이터는 브라우저 로컬 DB에 저장됩니다. PC 교체나 브라우저 데이터 삭제에 대비해 중요한 입력 후에는
            `.cbam` 백업을 내려받아 회사의 안전한 폴더에 보관하세요.
          </div>
        </SectionCard>

        <SectionCard title="EU 제출 준비" description="원본 EU 템플릿을 업로드한 뒤 앱의 산정 데이터를 복사본에 반영합니다.">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <FileSpreadsheet className="mt-1 h-5 w-5 text-teal-700" />
            <div>
              <div className="font-semibold text-slate-950">원본 템플릿 유지</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                공식 시트명, 영문 라벨, 수식은 변경하지 않고 `D_Processes`, `E_PurchPrec` 입력 영역에만 데이터를 반영합니다.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
