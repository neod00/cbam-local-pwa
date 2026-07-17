// SEE 흐름도 집계 검증.
//
// 이 모듈에는 테스트가 없었다. 그래서 씨밤이 감사가 아니면 못 잡을 결함이 넷이나 살아 있었다:
//   · 「신고 대상 아님」 단정 (판정 불가를 범위 밖과 뭉갬)
//   · 「철강(CN 72/73) 규칙 기준」 접두 규칙 문안
//   · 총 SEE 항등식이 혼재에서 산술적으로 틀림
//   · 판정 불가가 「보고용」(=제외 확정)으로 표시
// 특히 뒤 둘은 **제품이 둘 이상일 때만** 나타난다 — 단일 픽스처로는 영영 못 잡는다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadSeeFlowModule() {
  const source = readFileSync('src/lib/see-flow.ts', 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  const compiled = ts.transpileModule(
    `${source}\nglobalThis.seeFlow = { buildSeeFlowBinding, EXAMPLE_SEE_FLOW };`,
    { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const context = vm.createContext({});
  vm.runInContext(compiled, context);
  return context.seeFlow;
}

const { buildSeeFlowBinding, EXAMPLE_SEE_FLOW } = loadSeeFlowModule();

/** 결과 하나. see_cbam_basis는 relevance에 맞춰 호출부가 정한다(엔진과 같은 규칙). */
function makeResult(overrides) {
  const base = {
    id: 'r1',
    process_id: 'proc1',
    process_name: '공정',
    product_name: '용접강관',
    cn_code: '73063077',
    is_cbam_reportable: true,
    output_mass_t: 1000,
    direct_emissions_tco2e: 200,
    indirect_emissions_gross_tco2e: 225,
    indirect_emissions_relevance: 'NOT_RELEVANT',
    precursor_direct_see: 1.89,
    precursor_indirect_see: 0.315,
    see_cbam_basis: 2.09,
    see_indirect_incl_precursor: 0.54,
    see_informational_total: 2.63,
  };

  return { ...base, ...overrides };
}

// --- 대상이 없으면 예시로 대체 ---
assert.equal(buildSeeFlowBinding([]).isExample, true);
assert.equal(buildSeeFlowBinding([makeResult({ output_mass_t: 0 })]).isExample, true, '생산량 0이면 예시');
// 예시가 앱 자신의 판정과 어긋나면 안 된다. CN 7217은 공식 목록상 간접배출 비관련이다.
assert.equal(EXAMPLE_SEE_FLOW.indirectRelevance, 'NOT_RELEVANT');
assert.equal(EXAMPLE_SEE_FLOW.basisExcludesUndetermined, false);
// 예시 산술 자기정합: 2.09 + 0.54 = 2.63
assert.ok(Math.abs(EXAMPLE_SEE_FLOW.seeCbamBasis + EXAMPLE_SEE_FLOW.seeIndirect - EXAMPLE_SEE_FLOW.seeTotal) < 1e-9);

// --- 단일 제품 집계 ---
assert.equal(buildSeeFlowBinding([makeResult()]).indirectRelevance, 'NOT_RELEVANT');
assert.equal(
  buildSeeFlowBinding([makeResult({ indirect_emissions_relevance: 'INCLUDED', see_cbam_basis: 2.63 })]).indirectRelevance,
  'INCLUDED'
);

// --- [D5] 총 SEE 항등식은 「전부 비관련」일 때만 성립한다 ---
// 포함·비관련이 섞이면 포함 제품의 기준 SEE에 이미 간접이 들어 있어 우변이 이중계상된다.
// 종전 집계는 이 조합을 'NOT_RELEVANT'라 불러서 화면이 산술적으로 틀린 등식을 인쇄했다.
const mixed = buildSeeFlowBinding([
  makeResult({ id: 'a', indirect_emissions_relevance: 'INCLUDED', see_cbam_basis: 2.63 }),
  makeResult({ id: 'b', indirect_emissions_relevance: 'NOT_RELEVANT', see_cbam_basis: 2.09 }),
]);
assert.equal(mixed.indirectRelevance, 'MIXED', '포함·비관련 혼재를 「비관련」이라 부르면 안 된다');
// MIXED에서는 항등식이 성립하지 않는다 — 화면이 항등식을 쓰지 않는 근거.
assert.ok(
  Math.abs(mixed.seeCbamBasis + mixed.seeIndirect - mixed.seeTotal) > 1e-6,
  '전제: 혼재에서는 총 = 기준 + 간접이 성립하지 않는다'
);

// 전부 비관련이면 항등식이 성립한다.
const allNotRelevant = buildSeeFlowBinding([makeResult({ id: 'a' }), makeResult({ id: 'b' })]);
assert.equal(allNotRelevant.indirectRelevance, 'NOT_RELEVANT');
assert.ok(
  Math.abs(allNotRelevant.seeCbamBasis + allNotRelevant.seeIndirect - allNotRelevant.seeTotal) < 1e-9,
  '전부 비관련이면 총 = 기준 + 간접'
);

// --- [D3] 판정 불가가 섞이면 기준 SEE가 그 제품을 빼고 계산된다 — 화면이 그 사실을 알아야 한다 ---
const withUndetermined = buildSeeFlowBinding([
  makeResult({ id: 'a', indirect_emissions_relevance: 'NOT_RELEVANT', see_cbam_basis: 2.09 }),
  makeResult({ id: 'b', indirect_emissions_relevance: 'UNDETERMINED', see_cbam_basis: null }),
]);
assert.equal(withUndetermined.indirectRelevance, 'UNDETERMINED', '하나라도 판정 불가면 판정 불가');
assert.equal(withUndetermined.basisExcludesUndetermined, true, '기준 SEE가 판정 불가 제품을 빼고 계산됐음을 알린다');
assert.notEqual(withUndetermined.seeCbamBasis, null, '판정된 제품이 있으면 기준 SEE는 산출된다');

// 전부 판정 불가면 기준 SEE 자체가 없다 — 이때는 뺄 것도 없다.
const allUndetermined = buildSeeFlowBinding([
  makeResult({ id: 'a', indirect_emissions_relevance: 'UNDETERMINED', see_cbam_basis: null }),
]);
assert.equal(allUndetermined.indirectRelevance, 'UNDETERMINED');
assert.equal(allUndetermined.seeCbamBasis, null);
assert.equal(allUndetermined.basisExcludesUndetermined, false, '기준 SEE가 없으면 「일부 제외」가 아니다');

// --- 판정 불가 우선 — 모르는 것을 안전하게 가정하지 않는다 ---
assert.equal(
  buildSeeFlowBinding([
    makeResult({ id: 'a', indirect_emissions_relevance: 'INCLUDED', see_cbam_basis: 2.63 }),
    makeResult({ id: 'b', indirect_emissions_relevance: 'UNDETERMINED', see_cbam_basis: null }),
  ]).indirectRelevance,
  'UNDETERMINED',
  '포함이 섞여도 판정 불가가 있으면 판정 불가'
);

console.log('SEE flow verification passed (집계 4상태 · 항등식 성립 조건 · 판정 불가 우선).');
