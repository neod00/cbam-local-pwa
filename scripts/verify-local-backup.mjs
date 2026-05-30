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
      created_at: '2026-05-30T00:00:00.000Z',
      updated_at: '2026-05-30T00:00:00.000Z',
    },
  ],
  periods: [],
  processes: [],
  product_output_lines: [],
  source_streams: [],
  precursors: [],
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

console.log('Local backup verification passed.');
