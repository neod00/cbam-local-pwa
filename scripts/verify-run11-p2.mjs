// 씨밤이 run11 P2 회귀 게이트 — 백업 가져오기의 설정 중복 정리와 화면 문안.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(path, 'utf8');

// ── P2-34: settings는 key당 한 건 — 가장 최근에 고친 것만 남긴다 ─────────
const localDb = read('src/lib/local-db.ts');
const start = localDb.indexOf('export function dedupeBackupRows');
assert.ok(start >= 0, 'dedupeBackupRows가 없다');
const fnSource = localDb.slice(start, localDb.indexOf('\n}\n', start) + 3).replace(/^export /, '');
const context = vm.createContext({ Map, Array });
vm.runInContext(
  ts.transpileModule(`${fnSource}\nglobalThis.dedupe = dedupeBackupRows;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
  context
);
const rows = [
  { id: 'sl', key: 'license:free-registration', updated_at: '2026-07-15T00:00:00Z', value: { email: 'c@e.com' } },
  { id: 'setting_1', key: 'license:free-registration', updated_at: '2026-09-16T00:00:00Z', value: { email: 'me@daeil.example' } },
  { id: 'sc', key: 'scenario:assumptions', updated_at: '2026-07-15T00:00:00Z', value: { eu_import_share_percent: 35 } },
];
const deduped = JSON.parse(JSON.stringify(context.dedupe('settings', rows)));
assert.equal(deduped.length, 2, 'settings key 중복이 남는다');
assert.equal(deduped.find((row) => row.key === 'license:free-registration').value.email, 'me@daeil.example', '최근에 고친 설정이 남아야 한다');
assert.equal(context.dedupe('products', rows).length, 3, '다른 스토어는 건드리지 않는다');
assert.match(localDb, /dedupeBackupRows<unknown>\(storeName, backup\.data\[storeName\]/, '가져오기가 중복 정리를 거치지 않는다');

// ── 화면 문안 ────────────────────────────────────────────────────────
assert.match(read('src/components/guided/GuidedWorkspace.tsx'), /activeStepRef\.current = null;\s*\n\s*setSelectedStep\(null\);/, '새 프로젝트 직후 패널이 옛 단계에 남는다 (P2-25)');
assert.doesNotMatch(read('src/app/products/page.tsx'), /CBAM 대상 가능 품목\n/, '보고범위와 다른 기준의 집계를 「대상 가능」이라 부른다 (P2-24)');
assert.match(read('src/app/results/page.tsx'), /산정 경고만/, '/results의 「확인 필요」가 무엇을 세는지 말하지 않는다 (P2-30)');
assert.match(read('src/lib/see-flow.ts'), /구매 원료가 지니고 온 간접분/, '전구물질 간접도 기준에서 빠진다는 설명이 없다 (P2-31)');
const scenarios = read('src/app/scenarios/page.tsx');
assert.match(scenarios, /또는 EU 수입 예정량\(t\)/, 'EU 수입량을 톤으로 넣을 수 없다 (P2-32)');
assert.match(scenarios, /앱이 시세를 가져오지 않습니다/, '인증서 가격 가정의 출처 안내가 없다 (P2-32)');
assert.match(read('src/app/precursors/page.tsx'), /회신 메일만 받은 상태는 「미검증」입니다/, '「공급사 확인」의 뜻이 없다 (P2-27)');
assert.match(read('src/app/guide/page.tsx'), /8칸으로 풀어 놓은 것/, '가이드 3단계와 지도 8단계의 관계 설명이 없다 (P2-26)');
const glossary = read('src/lib/cbam-glossary.ts');
for (const term of ["'mark-up'", '벤치마크', 'SEFA', "'Annex II'", "'활동수준'", '검증']) {
  assert.ok(glossary.includes(`    ${term}:`), `용어집에 ${term} 풀이가 없다 (P2-28)`);
}
assert.match(read('src/app/upload/page.tsx'), /function DefaultValueLookup\(/, '가져온 기본값을 앱 안에서 조회할 수 없다 (P2-33)');
assert.match(read('src/app/source-streams/page.tsx'), /합계 일치 \(보정 없음\)/, '공용 계량기 검사 통과 표시가 없다 (P2-29)');

console.log('run11 P2 verification passed (설정 중복 정리 · 화면 문안 10종).');
