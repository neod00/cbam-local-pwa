import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as fflate from 'fflate';

class TestFile extends Blob {
  constructor(parts, name, options) {
    super(parts, options);
    this.name = name;
  }
}

function loadActivityTemplateModule() {
  const source = readFileSync('src/lib/activity-data-template.ts', 'utf8')
    .replace(
      "import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';",
      'const { strFromU8, strToU8, unzipSync, zipSync } = fflate;'
    )
    .replace(/^import type [\s\S]*? from '@\/lib\/local-db';\r?\n/, '')
    .replace(/^export /gm, '');

  const compiled = ts.transpileModule(
    `${source}

globalThis.activityTemplate = {
  ACTIVITY_TEMPLATE_FILENAME,
  createActivityDataTemplateWorkbook,
  parseActivityDataTemplate,
};`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;

  const context = vm.createContext({ Blob, exports: {}, fflate, globalThis: {}, Map, Number, Set, String, Uint8Array });
  vm.runInContext(compiled, context);
  return context.globalThis.activityTemplate;
}

const activityTemplate = loadActivityTemplateModule();
const workbookBlob = activityTemplate.createActivityDataTemplateWorkbook();
const workbookBytes = new Uint8Array(await workbookBlob.arrayBuffer());
const workbookZip = fflate.unzipSync(workbookBytes);

assert.ok(workbookZip['xl/workbook.xml'], 'template workbook should contain xl/workbook.xml');
assert.ok(workbookZip['xl/worksheets/sheet2.xml'], 'template workbook should contain Products sheet');
assert.ok(workbookZip['xl/worksheets/sheet5.xml'], 'template workbook should contain Precursors sheet');

const file = new TestFile([workbookBytes], activityTemplate.ACTIVITY_TEMPLATE_FILENAME, {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});

const plan = await activityTemplate.parseActivityDataTemplate(file);

assert.equal(plan.products.length, 2);
assert.equal(plan.processes.length, 1);
assert.equal(plan.sourceStreams.length, 1);
assert.equal(plan.precursors.length, 1);
assert.equal(plan.products[0].product_name, 'Hot Rolled Coil');
assert.equal(plan.processes[0].product_name, 'Hot Rolled Coil');
assert.equal(plan.sourceStreams[0].process_name, 'Rolling Line A');
assert.equal(plan.precursors[0].data_mode, 'DEFAULT');
assert.equal(plan.warnings.length, 0);

await assert.rejects(
  () => activityTemplate.parseActivityDataTemplate(new TestFile(['x'], 'bad.csv', {})),
  /xlsx/
);

console.log('Activity template verification passed.');
