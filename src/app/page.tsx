'use client';

import { ScenarioAssumptionSummary } from '@/components/ScenarioAssumptionSummary';
import { WorkflowGuideCard } from '@/components/WorkflowGuideCard';
import { ActionItemCard, Button, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import { calculateLocalResults, type LocalCalculationResult } from '@/lib/calculation-engine';
import { createDashboardSummary } from '@/lib/dashboard-summary';
import { evaluateEuExportReadiness } from '@/lib/eu-template-export';
import { CBAM_LAST_BACKUP_AT_KEY, getBackupStatus, getLocalSetting, listLocalItems, seedLocalData } from '@/lib/local-db';
import type { ImportedBenchmarkReference, ImportedDefaultValueReference } from '@/lib/reference-workbooks';
import {
  calculateProductScenarios,
  normalizeScenarioAssumptions,
  SCENARIO_ASSUMPTIONS_SETTING_KEY,
  summarizeScenarioRisks,
  type ScenarioAssumptions,
  type ScenarioRiskSummary,
} from '@/lib/scenario-calculation';
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Factory, FileSpreadsheet, Flame, Package, ShieldCheck, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 }).format(value);
}

function formatDateTime(value?: string) {
  if (!value) {
    return '아직 백업하지 않음';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

const EMPTY_SCENARIO_RISK_SUMMARY: ScenarioRiskSummary = {
  missing_cn_count: 0,
  missing_official_reference_count: 0,
  missing_reference_count: 0,
  above_default_count: 0,
  certificate_exposure_count: 0,
  default_certificate_exposure_count: 0,
  actual_lower_certificate_count: 0,
  default_lower_certificate_count: 0,
  equal_certificate_count: 0,
  total_certificate_quantity_indicator: 0,
  total_certificate_cost_indicator_eur: 0,
  total_default_certificate_quantity_indicator: 0,
  total_default_certificate_cost_indicator_eur: 0,
  is_ready_for_review: false,
};

export default function Home() {
  const [results, setResults] = useState<LocalCalculationResult[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [installationCount, setInstallationCount] = useState(0);
  const [processCount, setProcessCount] = useState(0);
  const [sourceStreamCount, setSourceStreamCount] = useState(0);
  const [precursorCount, setPrecursorCount] = useState(0);
  const [scenarioRiskSummary, setScenarioRiskSummary] = useState<ScenarioRiskSummary>(EMPTY_SCENARIO_RISK_SUMMARY);
  const [exportIssueCount, setExportIssueCount] = useState(0);
  const [exportErrorCount, setExportErrorCount] = useState(0);
  const [hasBenchmarkReference, setHasBenchmarkReference] = useState(false);
  const [hasDefaultValueReference, setHasDefaultValueReference] = useState(false);
  const [scenarioAssumptions, setScenarioAssumptions] = useState<ScenarioAssumptions>();
  const [lastBackupAt, setLastBackupAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      await seedLocalData();
      setLastBackupAt(window.localStorage.getItem(CBAM_LAST_BACKUP_AT_KEY) ?? undefined);
      const [
        processes,
        precursors,
        products,
        periods,
        sourceStreams,
        productOutputLines,
        installations,
        benchmarks,
        defaultValues,
        savedScenarioAssumptions,
      ] = await Promise.all([
        listLocalItems('processes'),
        listLocalItems('precursors'),
        listLocalItems('products'),
        listLocalItems('periods'),
        listLocalItems('source_streams'),
        listLocalItems('product_output_lines'),
        listLocalItems('installations'),
        getLocalSetting<ImportedBenchmarkReference>('reference:benchmarks'),
        getLocalSetting<ImportedDefaultValueReference>('reference:default-values'),
        getLocalSetting<ScenarioAssumptions>(SCENARIO_ASSUMPTIONS_SETTING_KEY),
      ]);
      const normalizedAssumptions = normalizeScenarioAssumptions(savedScenarioAssumptions);
      const localResults = calculateLocalResults({ processes, precursors, products, periods, sourceStreams, productOutputLines });
      const scenarios = calculateProductScenarios(localResults, normalizedAssumptions, {
        benchmarks,
        defaultValues,
      });
      const exportReadiness = evaluateEuExportReadiness({ processes, sourceStreams, precursors, products });

      setProductCount(products.length);
      setInstallationCount(installations.length);
      setProcessCount(processes.length);
      setSourceStreamCount(sourceStreams.length);
      setPrecursorCount(precursors.length);
      setResults(localResults);
      setScenarioRiskSummary(summarizeScenarioRisks(scenarios));
      setExportIssueCount(exportReadiness.issues.length);
      setExportErrorCount(exportReadiness.errorCount);
      setHasBenchmarkReference(Boolean(benchmarks));
      setHasDefaultValueReference(Boolean(defaultValues));
      setScenarioAssumptions(normalizedAssumptions);
      setLoading(false);
    }

    loadDashboard();
  }, []);

  const dashboard = useMemo(() => createDashboardSummary({
    exportErrorCount,
    exportIssueCount,
    hasBenchmarkReference,
    hasDefaultValueReference,
    precursorCount,
    processCount,
    productCount,
    results,
    scenarioRiskSummary,
  }), [
    exportErrorCount,
    exportIssueCount,
    hasBenchmarkReference,
    hasDefaultValueReference,
    precursorCount,
    processCount,
    productCount,
    results,
    scenarioRiskSummary,
  ]);
  const backupStatus = useMemo(() => getBackupStatus(lastBackupAt), [lastBackupAt]);
  const currentStatus = exportErrorCount > 0
    ? 'Export 오류를 먼저 해결해야 합니다.'
    : dashboard.warningCount > 0
      ? `${dashboard.warningCount}개 항목을 확인하면 신고 지원자료 준비율이 올라갑니다.`
      : '수입자 전달용 Communication Template 복사본 생성 전 최종 검토 단계입니다.';
  const weightedCbamBasisSee = dashboard.totalOutput > 0
    ? results.reduce((sum, result) => sum + result.see_cbam_basis * result.output_mass_t, 0) / dashboard.totalOutput
    : 0;
  const primaryProduct = results[0];
  const beginnerSteps = [
    {
      title: '사업장 등록',
      description: '회사와 공장 정보를 입력합니다.',
      href: '/installations',
      icon: Building2,
      status: installationCount > 0 ? '완료' : '시작',
      tone: installationCount > 0 ? 'success' as const : 'pending' as const,
    },
    {
      title: '품목 추가',
      description: 'EU에 수출하는 제품의 CN 코드를 입력합니다.',
      href: '/products',
      icon: Package,
      status: productCount > 0 ? '완료' : '입력',
      tone: productCount > 0 ? 'success' as const : 'warning' as const,
    },
    {
      title: '배출량 입력',
      description: '생산량, 연료, 전력 사용량 자료를 입력합니다.',
      href: processCount > 0 ? '/source-streams' : '/processes',
      icon: Flame,
      status: processCount > 0 && sourceStreamCount > 0 ? '진행중' : '다음',
      tone: processCount > 0 && sourceStreamCount > 0 ? 'info' as const : 'neutral' as const,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Guided Compliance Workspace"
        title="CBAM 신고 지원자료 작업실"
        description="사업장, 제품, 생산공정, 전구물질 데이터를 로컬에서 관리하고 EU Communication Template 기반 수입자 전달용 파일을 준비합니다."
      />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded-3xl border border-teal-100 bg-white p-5 shadow-[var(--shadow-card)]">
          <StatusBadge tone="pending">처음이라면 여기서 시작</StatusBadge>
          <h2 className="mt-4 break-words text-2xl font-semibold tracking-tight text-slate-950">무엇부터 하면 되나요?</h2>
          <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-slate-600">
            CBAM 용어를 몰라도 아래 3단계부터 진행하면 됩니다. 기준자료, 시나리오, Export 검토는 품목과 배출량 입력 후 자동으로 안내됩니다.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            {beginnerSteps.map((step, index) => {
              const Icon = step.icon;

              return (
                <Link
                  key={step.title}
                  href={step.href}
                  className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-teal-200 hover:bg-white hover:shadow-[var(--shadow-card-hover)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-sm font-semibold text-teal-800 ring-1 ring-inset ring-teal-100">
                      {index + 1}
                    </div>
                    <StatusBadge tone={step.tone}>{step.status}</StatusBadge>
                  </div>
                  <Icon className="mt-4 h-5 w-5 text-teal-700" />
                  <h3 className="mt-3 break-words text-base font-semibold text-slate-950">{step.title}</h3>
                  <p className="mt-2 break-words text-sm leading-6 text-slate-600">{step.description}</p>
                  <div className="mt-4 inline-flex items-center text-sm font-semibold text-teal-800">
                    시작하기
                    <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-50 p-2 text-blue-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">준비 상태</p>
              <p className="text-xs text-slate-500">전달 전 핵심 점검</p>
            </div>
          </div>
          <p className="mt-4 break-words text-sm leading-6 text-slate-600">{currentStatus}</p>
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
              <span>준비율</span>
              <span>{loading ? '-' : `${dashboard.readinessRate}%`}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-teal-700 transition-all"
                style={{ width: `${loading ? 0 : dashboard.readinessRate}%` }}
              />
            </div>
          </div>
          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            {[
              ['사업장 등록', installationCount > 0 ? '확인' : '시작 필요', installationCount > 0 ? 'success' : 'warning'],
              ['CN 코드 품목', productCount > 0 ? `${productCount}개` : '입력 필요', productCount > 0 ? 'success' : 'warning'],
              ['전구물질', precursorCount > 0 ? `${precursorCount}개` : '해당 없거나 입력 전', precursorCount > 0 ? 'success' : 'pending'],
              ['Export 오류', `${exportErrorCount}건`, exportErrorCount > 0 ? 'danger' : 'success'],
            ].map(([label, value, tone]) => (
              <div key={label} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <dt className="text-slate-500">{label}</dt>
                <dd><StatusBadge tone={tone as 'success' | 'warning' | 'pending' | 'danger'}>{value}</StatusBadge></dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="CBAM 대상 품목" value={loading ? '-' : `${productCount}개`} helper="CN 8자리 기준 관리" icon={Package} tone="pending" />
        <StatCard label="총 생산량" value={loading ? '-' : `${formatNumber(dashboard.totalOutput)}t`} helper={`${processCount}개 공정 기준`} icon={Factory} tone="info" />
        <StatCard label="CBAM 산정 기준 SEE" value={loading ? '-' : `${formatNumber(weightedCbamBasisSee)}`} helper="생산량 가중 평균 tCO₂e/t" icon={TrendingUp} tone="success" />
        <StatCard label="확인 필요 항목" value={loading ? '-' : `${dashboard.warningCount}건`} helper="시나리오와 Export 경고 포함" icon={AlertTriangle} tone="warning" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SectionCard title="품목 관리 요약" description="대표 품목과 CN 코드 기준 처리 상태를 먼저 확인합니다.">
          {primaryProduct ? (
            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    CN {primaryProduct.cn_code || primaryProduct.hs_code || '미입력'}
                  </div>
                  <h3 className="mt-1 break-words text-xl font-semibold text-slate-950">{primaryProduct.product_name}</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge tone="info">Annex I 대상 검토</StatusBadge>
                    <StatusBadge tone={primaryProduct.indirect_emissions_applicable ? 'success' : 'warning'}>
                      {primaryProduct.indirect_emissions_applicable ? '간접배출 포함' : 'Annex II direct-only'}
                    </StatusBadge>
                    <StatusBadge tone="pending">공급망 자료 확인</StatusBadge>
                  </div>
                </div>
                <Link href="/products">
                  <Button type="button" variant="secondary" className="w-full md:w-auto">
                    품목 관리 보기
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              아직 대표 품목이 없습니다. 품목을 등록하면 CN 코드와 Annex 처리 상태를 여기에서 확인할 수 있습니다.
            </div>
          )}
        </SectionCard>

        <SectionCard title="CBAM 산정 기준 SEE" description="인증서 산정 기준 값과 내부 검토용 값을 구분해 봅니다.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
            <div className="rounded-2xl bg-teal-50 p-4">
              <p className="text-xs font-semibold text-teal-800">생산량 가중 평균</p>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-teal-800">
                {loading ? '-' : formatNumber(weightedCbamBasisSee)}
                <span className="ml-1 text-base font-medium">tCO₂e/t</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-teal-900">
                Annex II direct-only 품목은 최종제품 자체 간접배출을 인증서 산정 기준에서 제외하고, 내부 검토용 total SEE로 별도 비교합니다.
              </p>
            </div>
            <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-4 text-sm">
              <div className="flex justify-between gap-3 py-3">
                <dt className="text-slate-500">직접 SEE 합계</dt>
                <dd className="font-semibold text-slate-950">{formatNumber(results.reduce((sum, result) => sum + result.direct_see * result.output_mass_t, 0))}</dd>
              </div>
              <div className="flex justify-between gap-3 py-3">
                <dt className="text-slate-500">전구물질 SEE 기여분</dt>
                <dd className="font-semibold text-slate-950">{formatNumber(results.reduce((sum, result) => sum + result.precursor_see * result.output_mass_t, 0))}</dd>
              </div>
              <div className="flex justify-between gap-3 py-3">
                <dt className="text-slate-500">간접배출 검토</dt>
                <dd><StatusBadge tone={results.some((result) => !result.indirect_emissions_applicable) ? 'warning' : 'success'}>
                  {results.some((result) => !result.indirect_emissions_applicable) ? '제외 항목 있음' : '포함 기준'}
                </StatusBadge></dd>
              </div>
            </dl>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="수입자 전달용 파일 만들기" description="EU 원본 Communication Template을 선택해 수입자에게 전달할 복사본을 준비합니다.">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-blue-50 p-2 text-blue-700">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-950">공식 수식은 Excel에서 계산</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  앱은 입력 셀에만 값을 반영하고, Summary_Products의 SEE 수식 셀은 원본 템플릿이 계산하도록 둡니다.
                </p>
              </div>
            </div>
            <Link href="/export">
              <Button type="button" className="w-full md:w-auto">
                Export 준비
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </SectionCard>

        <SectionCard title="데이터 백업" description="현재 브라우저에 저장된 입력자료를 `.cbam` 파일로 보관합니다.">
          <Link href="/settings" className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition hover:bg-slate-50">
            <span>
              <span className="block font-semibold text-slate-900">마지막 백업</span>
              <span className="mt-1 block text-xs text-slate-500">{backupStatus.helper}</span>
            </span>
            <span className="flex flex-col items-end gap-2 text-right text-slate-600">
              <StatusBadge tone={backupStatus.tone}>{backupStatus.label}</StatusBadge>
              <span>{formatDateTime(lastBackupAt)}</span>
            </span>
          </Link>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            PC 교체나 브라우저 데이터 삭제에 대비해 주요 입력 후에는 회사의 안전한 폴더에 백업 파일을 보관하세요.
          </p>
        </SectionCard>
      </div>

      <details className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-card)]">
        <summary className="cursor-pointer list-none text-base font-semibold text-slate-950 marker:hidden">
          상세 가이드와 검토 정보 펼치기
          <span className="ml-2 text-sm font-medium text-slate-500">체크리스트, 규정 상세, 책임 안내</span>
        </summary>
        <div className="mt-5 space-y-6">
          <WorkflowGuideCard currentRoute="/" compact />

      <SectionCard
        title="신고 지원자료 준비 단계"
        description="수입자 전달용 Communication Template 복사본을 만들기 전에 필요한 업무 흐름을 단계별로 확인합니다."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {dashboard.steps.map((step, index) => (
            <div key={step.name} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 transition hover:border-slate-300 hover:bg-white">
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,1fr)]">
        <SectionCard title="해결할 작업" description="위에서부터 처리하면 Communication Template 전달 준비 흐름이 가장 빨리 정리됩니다.">
          <ul className="space-y-3">
            {dashboard.recentTasks.map((task) => (
              <li key={`${task.href}-${task.label}`}>
                <ActionItemCard
                  title={task.label}
                  description={task.tone === 'success' ? '현재 단계는 신고 지원자료 준비 흐름상 완료된 상태입니다.' : '해당 화면으로 이동해 누락되거나 확인이 필요한 입력을 정리하세요.'}
                  badge={
                    task.tone === 'warning' || task.tone === 'danger' ? (
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-teal-700" />
                    )
                  }
                  action={
                    <Link href={task.href}>
                      <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5">
                        이동
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  }
                />
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="자료 준비 체크리스트" description="계산 화면에 들어가기 전 준비해야 할 기본 자료입니다.">
          <ul className="space-y-2 text-sm text-slate-700">
            {['CN 코드', '생산량과 판매/내부소비 수량', '연료·공정 원료 사용량', '전력 사용량과 배출계수', '전구물질 구매량과 공급사 SEE 자료', '최신 EU 원본 템플릿', '.cbam 백업'].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-700" />
                {item}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="로컬 데이터 보관 원칙" description="무료 PWA 버전은 기업 데이터를 서버로 전송하지 않는 구조를 우선합니다.">
          <div className="space-y-3">
            <div className="rounded-2xl bg-teal-50 p-4 text-sm leading-6 text-teal-900">
              입력 데이터는 브라우저 로컬 DB에 저장됩니다. PC 교체나 브라우저 데이터 삭제에 대비해 중요한 입력 후에는 `.cbam` 백업을 내려받아 회사의 안전한 폴더에 보관하세요.
            </div>
            <Link href="/settings" className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition hover:bg-slate-50">
              <span>
                <span className="block font-semibold text-slate-900">마지막 백업</span>
                <span className="mt-1 block text-xs text-slate-500">{backupStatus.helper}</span>
              </span>
              <span className="flex flex-col items-end gap-2 text-right text-slate-600">
                <StatusBadge tone={backupStatus.tone}>{backupStatus.label}</StatusBadge>
                <span>{formatDateTime(lastBackupAt)}</span>
              </span>
            </Link>
          </div>
        </SectionCard>

        <ScenarioAssumptionSummary assumptions={scenarioAssumptions} />

        <SectionCard title="EU Communication 준비" description="원본 EU Communication Template을 업로드한 뒤 앱의 산정 데이터를 복사본에 반영합니다.">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <FileSpreadsheet className="mt-1 h-5 w-5 text-teal-700" />
            <div>
              <div className="font-semibold text-slate-950">원본 템플릿 유지</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                공식 시트명, 영어 라벨, 수식은 변경하지 않고 확인된 입력 셀에만 데이터를 반영합니다. Export 후 Excel에서 공식 수식 재계산 결과를 검토하세요.
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="전달 및 신고 책임 안내" description="앱은 신고 지원자료 준비를 돕지만 최종 신고 판단을 대신하지 않습니다.">
          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-none" />
            <p>
              수입자 또는 authorised CBAM declarant에게 전달하기 전에는 회사 내부 검토와 필요한 경우 전문기관 검증을 진행하세요. SEFA 및 인증서 지표는 현재 검토용 시나리오입니다.
            </p>
          </div>
        </SectionCard>
      </div>
        </div>
      </details>
    </div>
  );
}
