import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadLocalDbModule() {
  const localDbSource = readFileSync('src/lib/local-db.ts', 'utf8')
    .replace(/^export type .*;\r?\n(?:\s+\| .*;\r?\n)*/gm, '')
    .replace(/^export interface [\s\S]*?^}\r?\n/gm, '')
    .replace(/^type StoreEntityMap = [\s\S]*?^};\r?\n/gm, '')
    .replace(/^export /gm, '');

  const compiled = ts.transpileModule(
    `${localDbSource}

globalThis.localDb = {
  CBAM_LOCAL_APP_NAME,
  CBAM_LOCAL_APP_VERSION,
  createLocalBackup,
  getBackupCompatibilityMessage,
  getBackupStatus,
  parseBackupFile,
};`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;

  const context = vm.createContext({ JSON });
  vm.runInContext(compiled, context);
  return context.localDb;
}

const {
  CBAM_LOCAL_APP_NAME,
  CBAM_LOCAL_APP_VERSION,
  createLocalBackup,
  getBackupCompatibilityMessage,
  getBackupStatus,
  parseBackupFile,
} = loadLocalDbModule();

const scenarioAssumptions = {
  origin_country: 'South Korea',
  default_value_year: '2027',
  cbam_factor: 0.9,
  cscf: 0.95,
  certificate_price_eur: 105,
};

const generatedBackup = createLocalBackup({
  installations: [],
  products: [
    {
      id: 'product-1',
      name: 'Hot Rolled Coil',
      hs_code: '7208',
      cn_code: '72083900',
      hs_group: '72',
      product_type_enum: 'HS72_PLATE_SHEET',
      unit: 'tonne',
      reporting_scope: 'CBAM_GOOD',
      created_at: '2026-05-30T00:00:00.000Z',
      updated_at: '2026-05-30T00:00:00.000Z',
    },
  ],
  periods: [],
  processes: [],
  product_output_lines: [
    {
      id: 'output-line-1',
      process_id: 'process-1',
      product_id: 'product-1',
      name: 'Hot Rolled Coil output',
      output_mass_t: 1000,
      allocation_basis: 'MASS',
      manual_allocation_percent: 100,
      note: '',
      reporting_scope: 'CBAM_GOOD',
      created_at: '2026-05-30T00:00:00.000Z',
      updated_at: '2026-05-30T00:00:00.000Z',
    },
  ],
  source_streams: [],
  precursors: [
    {
      id: 'precursor-1',
      process_id: 'process-1',
      product_id: 'product-1',
      name: 'Purchased slab',
      aggregated_goods_category: 'Crude steel',
      production_route: 'Electric arc furnace',
      supplier_country: 'South Korea',
      purchased_mass_t: 1100,
      consumed_mass_t: 1000,
      consumed_for_non_cbam_mass_t: 0,
      direct_see_tco2e_per_t: 0.55,
      indirect_see_tco2e_per_t: 0.35,
      source: 'Supplier communication template',
      default_value_justification: '',
      output_allocations: [{
        product_output_line_id: 'output-line-1',
        product_id: 'product-1',
        allocated_mass_t: 1000,
        allocation_percent: 100,
      }],
      created_at: '2026-05-30T00:00:00.000Z',
      updated_at: '2026-05-30T00:00:00.000Z',
    },
  ],
  settings: [
    {
      id: 'setting-1',
      key: 'scenario:assumptions',
      value: scenarioAssumptions,
      created_at: '2026-05-30T00:00:00.000Z',
      updated_at: '2026-05-30T00:00:00.000Z',
    },
  ],
}, '2026-05-30T00:00:00.000Z');

assert.equal(generatedBackup.manifest.exported_at, '2026-05-30T00:00:00.000Z');
assert.equal(generatedBackup.manifest.app_name, CBAM_LOCAL_APP_NAME);
assert.equal(generatedBackup.manifest.app_version, CBAM_LOCAL_APP_VERSION);
assert.equal(getBackupCompatibilityMessage(generatedBackup.manifest), '');
assert.equal(generatedBackup.manifest.counts.products, 1);
assert.equal(generatedBackup.manifest.counts.product_output_lines, 1);
assert.equal(generatedBackup.manifest.counts.precursors, 1);
assert.equal(generatedBackup.data.products[0].reporting_scope, 'CBAM_GOOD');
assert.equal(generatedBackup.data.product_output_lines[0].reporting_scope, 'CBAM_GOOD');
assert.equal(generatedBackup.data.precursors[0].production_route, 'Electric arc furnace');
assert.equal(generatedBackup.data.precursors[0].output_allocations?.[0].product_output_line_id, 'output-line-1');
assert.equal(generatedBackup.manifest.counts.settings, 1);
assert.equal(generatedBackup.data.settings[0].key, 'scenario:assumptions');
assert.equal(JSON.stringify(generatedBackup.data.settings[0].value), JSON.stringify(scenarioAssumptions));

const backup = parseBackupFile(JSON.stringify({
  manifest: {
    format: 'cbam-local-backup',
    format_version: 1,
    app_name: 'CBAM Local',
    exported_at: '2026-05-30T00:00:00.000Z',
    stores: ['settings'],
    counts: {
      settings: 1,
    },
  },
  data: {
    settings: [
      {
        id: 'setting-1',
        key: 'scenario:assumptions',
        value: scenarioAssumptions,
        created_at: '2026-05-30T00:00:00.000Z',
        updated_at: '2026-05-30T00:00:00.000Z',
      },
    ],
  },
}));

assert.equal(backup.manifest.format, 'cbam-local-backup');
assert.equal(backup.manifest.app_version, 'unknown');
assert.match(getBackupCompatibilityMessage(backup.manifest), /앱 버전 정보가 없는 이전 형식/);
assert.equal(backup.manifest.counts.settings, 1);
assert.equal(backup.manifest.counts.products, 0);
assert.equal(Array.isArray(backup.data.products), true);
assert.equal(backup.data.products.length, 0);

const restoredSetting = backup.data.settings.find((item) => item.key === 'scenario:assumptions');
assert.deepEqual(restoredSetting?.value, scenarioAssumptions);

assert.match(
  getBackupCompatibilityMessage({ ...generatedBackup.manifest, app_name: 'Other App' }),
  /CBAM Local이 아닌 앱/
);

assert.match(
  getBackupCompatibilityMessage({ ...generatedBackup.manifest, app_version: '9.9.9' }),
  /현재 앱 버전/
);

const now = new Date('2026-05-30T00:00:00.000Z').getTime();
assert.equal(getBackupStatus(undefined, now).label, '백업 필요');
assert.equal(getBackupStatus('not-a-date', now).label, '백업 점검');
assert.equal(getBackupStatus('2026-05-20T00:00:00.000Z', now).label, '백업 점검');
assert.equal(getBackupStatus('2026-05-29T00:00:00.000Z', now).label, '백업 완료');

assert.throws(
  () => parseBackupFile(JSON.stringify({ manifest: { format: 'unknown', format_version: 1 }, data: {} })),
  /유효하지 않거나 지원하지 않는 \.cbam 백업 파일입니다\./
);

assert.throws(
  () => parseBackupFile(JSON.stringify({
    manifest: {
      format: 'cbam-local-backup',
      format_version: 1,
      app_name: 'CBAM Local',
      exported_at: '2026-05-30T00:00:00.000Z',
      stores: [],
      counts: {},
    },
    data: {
      settings: {},
    },
  })),
  /백업 파일의 settings 데이터 저장소 형식이 올바르지 않습니다\./
);

// ── 할당로직 필드(전부 optional) — 있으면 그대로 왕복, 없으면(옛 .cbam) 그대로 통과 ──
const allocationBackup = createLocalBackup({
  installations: [],
  products: [],
  periods: [],
  processes: [{
    id: 'process-alloc', name: 'EAF', production_route: 'Electric arc furnace',
    output_mass_t: 950, market_output_mass_t: 950, internal_consumption_mass_t: 0,
    direct_attributable_emissions_tco2e: 95, electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0,
    direct_emissions_input_mode: 'SOURCE_STREAM_SUM', direct_emissions_input_note: '',
    created_at: '2026-05-30T00:00:00.000Z', updated_at: '2026-05-30T00:00:00.000Z',
  }],
  product_output_lines: [{
    id: 'line-offspec', process_id: 'process-alloc', name: '불량품', output_mass_t: 50,
    allocation_basis: 'MANUAL', manual_allocation_percent: 100, note: '', reporting_scope: 'WASTE_RECYCLE',
    activity_level_role: 'EXCLUDED', manual_allocation_reason: '체류시간', manual_allocation_evidence: '운전일지',
    created_at: '2026-05-30T00:00:00.000Z', updated_at: '2026-05-30T00:00:00.000Z',
  }],
  source_streams: [{
    id: 'ss-alloc', process_id: 'process-alloc', name: 'LNG', stream_type: 'FUEL', method: 'Combustion',
    activity_data: 5700, activity_unit: 'Nm3', ncv_gj_per_unit: 0.037, emission_factor_tco2e_per_unit: 56.1,
    oxidation_factor: 1, conversion_factor: 1, fossil_fraction: 1, biomass_fraction: 0, source: '고지서',
    shared_meter: { group: '공용 보일러', installation_total_activity_data: 10000, basis: 'SUB_METER', note: '' },
    created_at: '2026-05-30T00:00:00.000Z', updated_at: '2026-05-30T00:00:00.000Z',
  }],
  precursors: [],
  settings: [],
}, '2026-05-30T00:00:00.000Z');
const allocationRoundTrip = parseBackupFile(JSON.stringify(allocationBackup));
assert.equal(allocationRoundTrip.data.processes[0].direct_emissions_input_mode, 'SOURCE_STREAM_SUM');
assert.equal(allocationRoundTrip.data.product_output_lines[0].activity_level_role, 'EXCLUDED');
assert.equal(allocationRoundTrip.data.product_output_lines[0].manual_allocation_reason, '체류시간');
assert.equal(allocationRoundTrip.data.source_streams[0].shared_meter.group, '공용 보일러');
assert.equal(allocationRoundTrip.data.source_streams[0].shared_meter.installation_total_activity_data, 10000);
// 옛 백업(필드 없음)은 그대로 통과하고 필드는 undefined 로 남는다 — 엔진이 기존 숫자를 유지하는 전제.
const legacyAllocationBackup = parseBackupFile(JSON.stringify({
  manifest: { format: 'cbam-local-backup', format_version: 1, app_name: 'CBAM Local', app_version: '0.1.0', exported_at: '2026-05-30T00:00:00.000Z', stores: ['processes', 'product_output_lines', 'source_streams'], counts: { processes: 1, product_output_lines: 1, source_streams: 1 } },
  data: {
    processes: [{ id: 'p', name: 'P', production_route: '', output_mass_t: 1000, market_output_mass_t: 1000, internal_consumption_mass_t: 0, direct_attributable_emissions_tco2e: 1, electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0, created_at: '', updated_at: '' }],
    product_output_lines: [{ id: 'l', process_id: 'p', name: 'L', output_mass_t: 1000, allocation_basis: 'MASS', manual_allocation_percent: 100, note: '', created_at: '', updated_at: '' }],
    source_streams: [{ id: 's', process_id: 'p', name: 'S', stream_type: 'FUEL', method: 'Combustion', activity_data: 1, activity_unit: 't', ncv_gj_per_unit: 1, emission_factor_tco2e_per_unit: 1, oxidation_factor: 1, conversion_factor: 1, fossil_fraction: 1, biomass_fraction: 0, source: '', created_at: '', updated_at: '' }],
  },
}));
assert.equal(legacyAllocationBackup.data.processes[0].direct_emissions_input_mode, undefined);
assert.equal(legacyAllocationBackup.data.product_output_lines[0].activity_level_role, undefined);
assert.equal(legacyAllocationBackup.data.source_streams[0].shared_meter, undefined);
assert.equal(getBackupCompatibilityMessage(legacyAllocationBackup.manifest), '');

// ── internal_transfers (in-plant transfers) ──
// A backup without the store still opens (older backups). A backup that carries transfers is written as
// format_version 2 so that an older app refuses it instead of silently dropping the transfers.
const emptyStores = { installations: [], products: [], periods: [], processes: [], product_output_lines: [], source_streams: [], precursors: [], settings: [] };
const noTransferBackup = createLocalBackup({ ...emptyStores, internal_transfers: [] });
assert.equal(noTransferBackup.manifest.format_version, 1, 'a backup without transfers must stay readable by older apps');
assert.equal(createLocalBackup(emptyStores).manifest.format_version, 1, 'data built before the store existed must still produce a backup');
const transferRow = { id: 'internal_transfer_1', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', source_process_id: 'a', target_process_id: 'b', mass_t: 1227000 };
const transferBackup = createLocalBackup({ ...emptyStores, internal_transfers: [transferRow] });
assert.equal(transferBackup.manifest.format_version, 2, 'a backup with transfers must be version 2');
assert.equal(transferBackup.manifest.counts.internal_transfers, 1);
const transferRoundTrip = parseBackupFile(JSON.stringify(transferBackup));
assert.equal(transferRoundTrip.data.internal_transfers[0].mass_t, 1227000, 'transfers must survive a round trip');
const legacyNoStore = parseBackupFile(JSON.stringify({ manifest: { format: 'cbam-local-backup', format_version: 1 }, data: emptyStores }));
assert.deepEqual(JSON.parse(JSON.stringify(legacyNoStore.data.internal_transfers)), [], 'an older backup gets an empty transfer store');
assert.throws(() => parseBackupFile(JSON.stringify({ manifest: { format: 'cbam-local-backup', format_version: 3 }, data: emptyStores })), /지원하지 않는/, 'unknown future versions are refused');

console.log('Local backup verification passed (할당로직 optional 필드 왕복·옛 백업 호환 포함).');
