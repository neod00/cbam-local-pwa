'use client';

import { PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import { ScenarioAssumptionSummary } from '@/components/ScenarioAssumptionSummary';
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
import { AlertTriangle, CheckCircle2, Factory, FileSpreadsheet, Package, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
}

function formatDateTime(value?: string) {
  if (!value) {
    return '아직 백업하지 않음';
  }

  return new Intl.DateTimeFormat(undefined, {
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
  const [processCount, setProcessCount] = useState(0);
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
      setProcessCount(processes.length);
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
        <StatCard label="보고 준비율" value={loading ? '-' : `${dashboard.readinessRate}%`} helper="산정·기준자료·Export 기준" icon={TrendingUp} tone="success" />
        <StatCard label="확인 필요 항목" value={loading ? '-' : `${dashboard.warningCount}건`} helper="시나리오와 Export 경고 포함" icon={AlertTriangle} tone="warning" />
      </div>

      <SectionCard
        title="제출 전 리스크 요약"
        description="SEE 산정 이후 SEFA·인증서 시나리오와 EU Export 준비 상태를 함께 확인합니다."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold text-slate-500">CN 코드 확인</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{scenarioRiskSummary.missing_cn_count}건</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold text-slate-500">기준자료 미연결</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{scenarioRiskSummary.missing_official_reference_count}건</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold text-slate-500">기본값 초과</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{scenarioRiskSummary.above_default_count}건</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold text-slate-500">Export 오류</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{exportErrorCount}건</p>
          </div>
        </div>
      </SectionCard>

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
                  {task.tone === 'warning' || task.tone === 'danger' ? (
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
          <div className="space-y-3">
            <div className="rounded-2xl bg-teal-50 p-4 text-sm leading-6 text-teal-900">
              입력 데이터는 브라우저 로컬 DB에 저장됩니다. PC 교체나 브라우저 데이터 삭제에 대비해 중요한 입력 후에는
              `.cbam` 백업을 내려받아 회사의 안전한 폴더에 보관하세요.
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

        <SectionCard title="EU 제출 준비" description="원본 EU 템플릿을 업로드한 뒤 앱의 산정 데이터를 복사본에 반영합니다.">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <FileSpreadsheet className="mt-1 h-5 w-5 text-teal-700" />
            <div>
              <div className="font-semibold text-slate-950">원본 템플릿 유지</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                공식 시트명, 영문 라벨, 수식은 변경하지 않고 확인된 입력 셀에만 데이터를 반영합니다.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
