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

const { parseBackupFile } = loadLocalDbModule();

const scenarioAssumptions = {
  origin_country: 'South Korea',
  default_value_year: '2027',
  cbam_factor: 0.9,
  cscf: 0.95,
  certificate_price_eur: 105,
};

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
assert.equal(backup.manifest.counts.settings, 1);
assert.equal(backup.manifest.counts.products, 0);
assert.equal(Array.isArray(backup.data.products), true);
assert.equal(backup.data.products.length, 0);

const restoredSetting = backup.data.settings.find((item) => item.key === 'scenario:assumptions');
assert.deepEqual(restoredSetting?.value, scenarioAssumptions);

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
