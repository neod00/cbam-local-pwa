// 설명 수준 토글 · 시작 안내 · 옛 셸 동결 (UX 컨셉 v4 §9·§11·§14-5, 2026-10-05).
//
// 잠그는 것:
//  1) 설명 수준은 「설명량」만 바꾼다 — 단계마다 일상어 설명·구하는 곳·근거가 있고, 근거는 앱의 규칙 표(allocation-rules)에서 온다. 설명 상자에는 입력 칸이 없다.
//  2) 자동 감지 없음 — 값은 담당자가 고르고(localStorage 하나) 모르는 값은 기본(실무자 = 종전 화면)이다.
//  3) 시작 안내는 비어 있는 프로젝트에서만 자동으로 뜨고, 없는 기능(대화형·AI)을 말하지 않는다.
//  4) 옛 셸은 숨김·동결: 지도에서 옛 화면으로 나가는 버튼은 없고, 옛 화면에서 지도로 돌아오는 길은 남아 있다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const strip = (path, all = true) => readFileSync(path, 'utf8')
  .replace(all ? /^import [\s\S]*?;\r?\n/gm : /^import type [\s\S]*?;\r?\n/gm, '')
  .replace(/^export /gm, '');
const source = [
  strip('src/lib/source-stream-calculation.ts', false),
  strip('src/lib/allocation-rules.ts'),
  strip('src/lib/step-explainers.ts'),
  'globalThis.app = { ALLOCATION_RULES, STEP_EXPLAINERS, parseExplainLevel, DEFAULT_EXPLAIN_LEVEL, EXPLAIN_LEVEL_STORAGE_KEY };',
].join('\n');
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { ALLOCATION_RULES, STEP_EXPLAINERS, parseExplainLevel, DEFAULT_EXPLAIN_LEVEL, EXPLAIN_LEVEL_STORAGE_KEY } = context.app;

// ── 1) 설명 내용 ─────────────────────────────────────────────────────
const STEPS = ['setup', 'products', 'process', 'fuel', 'electricity', 'precursors', 'results', 'export'];
assert.deepEqual(Object.keys(STEP_EXPLAINERS), STEPS, '8단계 모두에 설명이 있다');
for (const id of STEPS) {
  const item = STEP_EXPLAINERS[id];
  assert.ok(item.plain.length > 20 && item.where.length > 3 && item.basis.length >= 1, `${id}: 일상어 설명·구하는 곳·근거`);
}
assert.ok(STEP_EXPLAINERS.process.basis.some((line) => line.includes(ALLOCATION_RULES.ACTIVITY_LEVEL.id) && line.includes(ALLOCATION_RULES.ACTIVITY_LEVEL.anchor)), '근거 문구는 규칙 표에서 온다(두 곳에 쓰지 않는다)');
assert.ok(STEP_EXPLAINERS.electricity.basis[0].includes(ALLOCATION_RULES.ELECTRICITY_SHARED_METER.id));
assert.ok(STEP_EXPLAINERS.fuel.basis.length === 2 && STEP_EXPLAINERS.fuel.basis.every((line) => line.includes('CBAM-ALLOC-')));
assert.ok(!/(철강은|철강 제품은) .*(제외|빠진다)/.test(STEP_EXPLAINERS.electricity.plain), '전력 설명이 판정 없이 「철강은 제외」를 단정하지 않는다(간접배출 관련성은 결과 단계 판정)');
assert.match(STEP_EXPLAINERS.electricity.plain, /간접배출 비관련/, '조건부로 말한다');
assert.match(STEP_EXPLAINERS.precursors.basis.join(' '), /제3자 검증/, '공급사 실측값 사용에는 검증이 필요하다는 안내');

// ── 2) 자동 감지 없음 ────────────────────────────────────────────────
assert.equal(DEFAULT_EXPLAIN_LEVEL, 'EXPERT', '모르면 종전 화면(실무자)');
assert.equal(parseExplainLevel(null), 'EXPERT');
assert.equal(parseExplainLevel('이상한값'), 'EXPERT', '알 수 없는 저장값은 기본으로');
assert.equal(parseExplainLevel('BEGINNER'), 'BEGINNER');
assert.equal(EXPLAIN_LEVEL_STORAGE_KEY, 'cbam-local-explain-level');
const level = readFileSync('src/components/guided/ExplainLevel.tsx', 'utf8');
assert.ok(!/navigator\.|userAgent|history|results|data\./.test(level.replace(/navigator\.locks/g, '')), '입력 이력·기기 등으로 수준을 추측하지 않는다');
assert.ok(!/<input|<select|<textarea|onChange|createLocalItem|updateLocalItem/.test(level), '설명 상자에는 입력 칸·저장이 없다 — 계산에 영향 없음');
assert.match(level, /aria-pressed=\{level === item\}/, '토글은 누른 상태를 알린다');
const pref = readFileSync('src/components/guided/useLocalPref.ts', 'utf8');
assert.match(pref, /useSyncExternalStore/);
assert.ok(!/indexedDB|local-db/.test(pref), '화면 취향은 업무 데이터(IndexedDB·백업)에 들어가지 않는다');

// ── 3) 시작 안내 ─────────────────────────────────────────────────────
const guide = readFileSync('src/components/guided/StartGuide.tsx', 'utf8');
assert.equal((guide.match(/level: '(BEGINNER|EXPERT)'/g) ?? []).length, 2, '프리셋 카드는 두 장');
assert.ok(!/대화형|\bAI\b|챗봇/.test(guide), '아직 없는 기능(대화형·AI)을 말하지 않는다');
assert.match(guide, /입력한 내용은 그대로 유지됩니다/, '선택이 부담이 되지 않게 한 줄');
assert.match(guide, /EU 수입업자에게 줄 커뮤니케이션 파일\(엑셀\)과 산정보고서/, '산출물 명시');
const workspace = readFileSync('src/components/guided/GuidedWorkspace.tsx', 'utf8');
assert.match(workspace, /startGuideForced \|\| \(!startGuideDismissed && data\.installations\.length === 0\)/, '비어 있는 프로젝트에서만 자동으로 뜬다');
assert.match(workspace, /<ExplainLevelToggle \/>/, '설명 토글은 머리글에 상시 노출');
assert.match(workspace, /useLocalPref\(START_GUIDE_DISMISSED_KEY, '1'\)/, '저장값을 읽기 전에는 닫힘(번쩍임 없음)');
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
assert.match(panels, /<StepExplainerBox step=\{step\} \/>/, '단계 패널 맨 위에 설명 상자');

// ── 4) 옛 셸 동결 ────────────────────────────────────────────────────
const shell = readFileSync('src/components/AppShell.tsx', 'utf8');
const guidedShell = shell.slice(shell.indexOf('function GuidedShell'), shell.indexOf('function LegacyShell'));
assert.ok(guidedShell.length > 200 && guidedShell.includes('PeriodBadge'), '지도 셸 구간을 제대로 잘랐다');
assert.ok(!guidedShell.includes("setUiMode('modern')") && !guidedShell.includes('이전 화면'), '지도에서 옛 화면으로 나가는 버튼이 없다');
assert.ok((shell.match(/setUiMode\('guided'\)/g) ?? []).length >= 2, '옛 화면에서 지도로 돌아오는 버튼은 남아 있다(옛 모드 값이 저장된 사용자가 갇히지 않게)');
assert.match(shell, /storedMode === 'legacy' \|\| storedMode === 'previous' \|\| storedMode === 'modern'/, '옛 모드 저장값으로 들어온 사용자는 종전처럼 옛 셸이 열린다(삭제하지 않고 동결)');
assert.match(shell, /<BeginnerAppShell onUsePrevious=\{\(\) => setUiMode\('previous'\)\} onUseGuided=\{\(\) => setUiMode\('guided'\)\}>/);

console.log('Explain level / start guide / shell freeze verified (8단계 설명 · 근거는 규칙 표에서 · 자동 감지 없음 · 없는 기능 안 말함 · 옛 화면에서 지도로 돌아오는 길 유지).');
