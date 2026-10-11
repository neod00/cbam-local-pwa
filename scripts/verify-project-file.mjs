// 프로젝트 파일(.cbam) — 저장 / 다른 이름으로 저장 / 열기 / 새로 만들기.
//
// 잠그는 것:
//  1) 저장: 처음에는 이름을 고르고, 이후에는 같은 파일에 덮어쓰며, 다른 이름으로 저장은 늘 고른다.
//  2) 덮어쓸 수 없으면(권한 거부·파일 이동) 조용히 실패하지 않고 이름을 다시 고르게 한다. 선택 창을 취소하면 아무것도 바뀌지 않는다.
//  3) 파일 접근 기능이 없는 브라우저는 같은 이름으로 내려받는다.
//  4) 열기: 파일을 읽어 내용을 보여 줄 뿐 아직 아무것도 바꾸지 않는다. 틀린 파일은 읽다가 멈춘다.
//  5) 파일 내용은 종전 백업과 같다(새 형식 없음). 핸들은 프로젝트 저장소·백업에 섞이지 않는다. 서버로 보내지 않는다.
//  6) 배선: 지도 머리글의 파일 메뉴, Ctrl+S, 설정 화면의 백업 복원과 같은 복원 순서.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync('src/lib/project-file.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
vm.runInNewContext(`(function (exports, module) {${code}\n})`, { Blob, File, Date, Intl, Error })(loaded.exports, loaded);
const P = loaded.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

// ── 1) 이름 제안 ─────────────────────────────────────────────────
assert.equal(P.suggestProjectFilename({ local_name: '대일기업 안산공장', name: 'Daeil' }, { start_date: '2025-01-01' }), '대일기업 안산공장_2025.cbam', '한글 이름이 있으면 그것 + 보고연도');
assert.equal(P.suggestProjectFilename({ name: 'Daeil Industrial / Ansan: Plant?' }, { start_date: '2025-01-01' }), 'Daeil Industrial Ansan Plant_2025.cbam', '파일 이름에 못 쓰는 글자는 뺀다');
assert.equal(P.suggestProjectFilename(undefined, undefined), 'CBAM_프로젝트.cbam');
assert.equal(P.suggestProjectFilename({ name: 'A' }, { start_date: '' }), 'A.cbam', '연도를 모르면 이름만');
assert.ok(P.suggestProjectFilename({ name: 'x'.repeat(200) }, { start_date: '2025-01-01' }).length <= 80 + 6, '너무 긴 이름은 자른다');
assert.equal(P.withProjectExtension('a'), 'a.cbam');
assert.equal(P.withProjectExtension('a.CBAM'), 'a.CBAM');

// ── 가짜 브라우저 ─────────────────────────────────────────────────
const manifest = { exported_at: '2026-10-12T05:30:00.000Z', counts: { products: 3, processes: 2, source_streams: 5, precursors: 4 } };
const backup = { manifest, data: { products: [{ id: 'p' }] } };
function fakeHandle(name, options = {}) {
  const handle = {
    name,
    content: undefined,
    writes: 0,
    async createWritable() {
      if (options.failWrite) throw new Error('파일이 없습니다');
      return { write: async (data) => { handle.content = data; handle.writes += 1; }, close: async () => {} };
    },
    async getFile() { return new File([handle.content ?? ''], name); },
  };
  if (options.permission) {
    handle.queryPermission = async () => options.permission;
    handle.requestPermission = async () => options.requestResult ?? options.permission;
  }
  return handle;
}
function makeDeps({ fs = true, picks = [] } = {}) {
  const state = { picker: [], downloads: [], saved: [], current: undefined, cleared: 0, queue: [...picks] };
  const deps = {
    exportBackup: async () => backup,
    download: (blob, name) => state.downloads.push({ blob, name }),
    markSaved: (time) => state.saved.push(time),
    handles: { get: async () => state.current, set: async (handle) => { state.current = handle; }, clear: async () => { state.current = undefined; state.cleared += 1; } },
    pickFileFallback: async () => state.fallbackFile,
  };
  if (fs) {
    deps.showSaveFilePicker = async (options) => {
      state.picker.push(options);
      const next = state.queue.shift();
      if (next === 'abort') { const error = new Error('cancel'); error.name = 'AbortError'; throw error; }
      return next ?? fakeHandle(options.suggestedName);
    };
    deps.showOpenFilePicker = async (options) => {
      state.picker.push(options);
      const next = state.queue.shift();
      if (next === 'abort') { const error = new Error('cancel'); error.name = 'AbortError'; throw error; }
      return [next];
    };
  }
  return { deps, state };
}

// ── 2) 저장 ──────────────────────────────────────────────────────
{
  const { deps, state } = makeDeps();
  const first = await P.saveProject(deps, { suggestedName: '대일기업_2025.cbam' });
  assert.deepEqual(plain(first), { status: 'saved', name: '대일기업_2025.cbam', how: 'picked', savedAt: manifest.exported_at }, '처음에는 이름을 고른다');
  assert.equal(state.picker.length, 1);
  assert.equal(state.picker[0].suggestedName, '대일기업_2025.cbam');
  assert.deepEqual(plain(state.picker[0].types[0].accept), { 'application/json': ['.cbam'] }, '.cbam 파일만 고르게 한다');
  assert.deepEqual(JSON.parse(state.current.content), plain(backup), '파일 내용은 백업과 같다(새 형식 없음)');
  assert.deepEqual(state.saved, [manifest.exported_at], '저장한 시각이 「마지막 백업」으로 기록된다');
  const second = await P.saveProject(deps, { suggestedName: 'ignored.cbam' });
  assert.equal(second.how, 'overwrite', '이후 저장은 같은 파일에 덮어쓴다');
  assert.equal(state.picker.length, 1, '이름을 다시 묻지 않는다');
  assert.equal(state.current.writes, 2);
  const asNew = await P.saveProject(deps, { saveAs: true, suggestedName: '다른이름.cbam' });
  assert.equal(asNew.how, 'picked', '다른 이름으로 저장은 늘 고른다');
  assert.equal(state.picker.length, 2);
  assert.equal(state.current.name, '다른이름.cbam', '이후 저장은 새 파일에 이어진다');
}

// ── 3) 덮어쓸 수 없을 때 · 취소 ──────────────────────────────────
{
  const denied = fakeHandle('a.cbam', { permission: 'prompt', requestResult: 'denied' });
  const { deps, state } = makeDeps();
  state.current = denied;
  const result = await P.saveProject(deps, { suggestedName: 's.cbam' });
  assert.equal(result.how, 'picked', '쓰기 권한을 못 받으면 이름을 다시 고르게 한다');
  assert.equal(denied.content, undefined, '권한 없는 파일에는 쓰지 않는다');
  const granted = fakeHandle('b.cbam', { permission: 'prompt', requestResult: 'granted' });
  state.current = granted;
  assert.equal((await P.saveProject(deps, { suggestedName: 's.cbam' })).how, 'overwrite', '권한을 다시 물어 받으면 덮어쓴다');
}
{
  const { deps, state } = makeDeps();
  state.current = fakeHandle('moved.cbam', { failWrite: true });
  const result = await P.saveProject(deps, { suggestedName: 's.cbam' });
  assert.equal(result.how, 'picked', '파일이 옮겨졌거나 지워졌으면 이름을 다시 고르게 한다');
}
{
  const { deps, state } = makeDeps({ picks: ['abort'] });
  const existing = fakeHandle('keep.cbam');
  state.current = existing;
  const cancelled = await P.saveProject(deps, { saveAs: true, suggestedName: 'x.cbam' });
  assert.deepEqual(plain(cancelled), { status: 'cancelled' }, '선택 창을 취소하면 취소다');
  assert.equal(state.current, existing, '연결된 파일을 바꾸지 않는다');
  assert.equal(state.saved.length, 0, '저장한 것으로 기록하지 않는다');
}

// ── 4) 파일 접근 기능이 없는 브라우저 ────────────────────────────
{
  const { deps, state } = makeDeps({ fs: false });
  const result = await P.saveProject(deps, { suggestedName: 'plan' });
  assert.deepEqual(plain(result), { status: 'saved', name: 'plan.cbam', how: 'download', savedAt: manifest.exported_at }, '같은 이름으로 내려받는다(확장자를 붙인다)');
  assert.equal(state.downloads.length, 1);
  assert.deepEqual(JSON.parse(await state.downloads[0].blob.text()), plain(backup));
  assert.equal(state.current, undefined, '핸들은 없다');
}

// ── 5) 열기 ──────────────────────────────────────────────────────
{
  const parse = (content) => { const parsed = JSON.parse(content); if (parsed.manifest?.format !== 'ok') throw new Error('유효하지 않은 .cbam 파일입니다'); return parsed; };
  const good = fakeHandle('A.cbam');
  good.content = JSON.stringify({ manifest: { format: 'ok', ...manifest } });
  const { deps, state } = makeDeps({ picks: [good] });
  const opened = await P.readProjectFile(deps, parse);
  assert.equal(opened.status, 'opened');
  assert.equal(opened.name, 'A.cbam');
  assert.equal(opened.handle, good, '핸들을 돌려줘 이후 저장이 그 파일에 이어지게 한다');
  assert.equal(state.queue.length, 0);
  assert.equal(state.saved.length, 0, '열기는 아무것도 바꾸지 않는다');
  const { deps: cancelDeps } = makeDeps({ picks: ['abort'] });
  assert.deepEqual(plain(await P.readProjectFile(cancelDeps, parse)), { status: 'cancelled' });
  const bad = fakeHandle('B.cbam');
  bad.content = JSON.stringify({ manifest: { format: 'other' } });
  const { deps: badDeps } = makeDeps({ picks: [bad] });
  await assert.rejects(() => P.readProjectFile(badDeps, parse), /유효하지 않은/, '틀린 파일은 읽다가 멈춘다');
  const { deps: fbDeps, state: fbState } = makeDeps({ fs: false });
  fbState.fallbackFile = new File([good.content], 'C.cbam');
  const viaFallback = await P.readProjectFile(fbDeps, parse);
  assert.deepEqual([viaFallback.status, viaFallback.name, viaFallback.handle], ['opened', 'C.cbam', undefined], '파일 접근 기능이 없으면 파일 고르기로 연다(핸들 없음)');
  fbState.fallbackFile = undefined;
  assert.deepEqual(plain(await P.readProjectFile(fbDeps, parse)), { status: 'cancelled' });
}
assert.match(P.describeBackupContent(manifest), /제품 3개 · 공정 2개 · 배출원 5개 · 구매 강재 4개 · \d{4}-\d{2}-\d{2} \d{2}:\d{2} 저장/);
assert.match(P.describeBackupContent(undefined), /제품 0개.*저장 시각 모름/);

// ── 6) 배선·원칙 ─────────────────────────────────────────────────
const read = (file) => readFileSync(file, 'utf8');
const menu = read('src/components/FileMenu.tsx');
const browser = read('src/lib/project-file-browser.ts');
const shell = read('src/components/AppShell.tsx');
assert.ok(shell.includes("import { FileMenu } from '@/components/FileMenu';") && /<FileMenu \/>\s*<TodoNavLink \/>/.test(shell), '지도 머리글에 파일 메뉴');
for (const testid of ['file-new', 'file-open', 'file-save', 'file-save-as']) assert.ok(menu.includes(`data-testid="${testid}"`), `${testid} 항목`);
assert.ok(/event\.key\.toLowerCase\(\) === 's'/.test(menu) && /ctrlKey \|\| event\.metaKey/.test(menu), 'Ctrl+S / ⌘S');
assert.ok(menu.includes("window.location.assign('/')"), '열기·새로 만들기 뒤에는 화면들이 저장소를 새로 읽도록 지도로 돌아간다');
assert.ok(/saveFirst && !\(await save\(false\)\)/.test(menu), '저장하고 새로 만들기/열기에서 저장을 취소하면 그대로 둔다');
// 핸들은 프로젝트 저장소가 아니라 별도 저장소 — 백업에 섞이지 않고 새 프로젝트가 지우지 않는다(그래서 새 프로젝트는 연결을 따로 끊는다)
assert.ok(/const HANDLE_DB = 'cbam-file-handles'/.test(browser) && !/'cbam-local'/.test(browser), '핸들은 별도 저장소');
assert.ok(/await deps\.handles\.clear\(\)/.test(browser), '새 프로젝트는 연결된 파일을 끊는다');
// 설정 화면의 복원과 같은 순서: 복원 → 내장 EU 기준값 다시 → 라이선스 유지
assert.ok(/await importLocalBackup\(parsed\);\s*await ensureBundledReferences\(true\);/.test(browser) && /FREE_LICENSE_SETTING_KEY/.test(browser), '복원 순서와 라이선스 유지');
// 서버로 보내지 않는다
for (const [name, text] of [['project-file.ts', source], ['project-file-browser.ts', browser], ['FileMenu.tsx', menu]]) {
  assert.ok(!/\bfetch\(|XMLHttpRequest|sendBeacon/.test(text), `${name}: 네트워크 호출 없음`);
}
assert.ok(read('package.json').includes('"verify:project-file"'));
void path;

console.log('Project file verified (저장 · 다른 이름으로 저장 · 덮어쓰기 실패 시 다시 고름 · 취소 · 내려받기 대체 · 열기는 읽기만 · 별도 핸들 저장소 · 서버 전송 없음 · 배선).');
