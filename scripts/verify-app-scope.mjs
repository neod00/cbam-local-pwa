// 앱 지원 범위 — 철강만, 고로 일관제철은 아직 미지원.
//
// 범위 밖 입력을 만나면 앱은 그럴듯한 숫자를 내지 않고 「지원하지 않는다」고 말해야 한다. 종전에는 안내문이
// 「산정/Export 대상으로 처리하지 않습니다」라고 하면서 실제로는 계산에 그대로 넣었고(말과 동작이 달랐다),
// 선철·소결광(고로 일관제철)에는 아무 말도 하지 않았다(씨밤이 run17).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const strip = (path, all = true) => readFileSync(path, 'utf8')
  .replace(all ? /^import .*;\r?\n/gm : /^import type .*;\r?\n/gm, '')
  .replace(/^export /gm, '');
const source = [
  strip('src/lib/source-stream-calculation.ts', false),
  readFileSync('src/lib/cn-master.generated.ts', 'utf8').replace(/^export /gm, ''),
  strip('src/lib/cbam-product-rules.ts'),
  strip('src/lib/reporting-scope.ts', false),
  strip('src/lib/allocation-rules.ts'),
  strip('src/lib/calculation-engine.ts'),
  'globalThis.app = { calculateLocalResults, getAppScopeExclusion, getCbamCoverage, isIntegratedSteelRoute };',
].join('\n');
const context = vm.createContext({});
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { calculateLocalResults, getAppScopeExclusion, getCbamCoverage, isIntegratedSteelRoute } = context.app;

const product = (id, name, cn) => ({ id, name, cn_code: cn, hs_code: cn.slice(0, 4), hs_group: cn.slice(0, 2), product_type_enum: `HS${cn.slice(0, 2)}_OTHER`, unit: 'tonne', reporting_scope: 'CBAM_GOOD', created_at: '', updated_at: '' });

// ── 판정 ────────────────────────────────────────────────────────────
const inScope = ['73181552', '72061000', '72189911', '72191310', '72031000', '72021120', '26011200'];   // 나사·강괴·STS 반제품·평판재·DRI·페로망간·소결광/펠릿
for (const cn of inScope) assert.equal(getAppScopeExclusion(product('p', 'x', cn)), undefined, `CN ${cn}은 지원 범위다`);
const otherSector = ['76061191', '25231000', '31021010', '28041000', '27160000'];             // 알루미늄·시멘트·비료·수소·전기
for (const cn of otherSector) assert.equal(getAppScopeExclusion(product('p', 'x', cn)), 'OTHER_SECTOR', `CN ${cn}은 다른 분야다`);
assert.equal(getAppScopeExclusion(product('p', 'x', '72011011')), 'INTEGRATED_STEEL', '선철은 고로 일관제철 품목이다');
// 소결광·펠릿은 막지 않는다 — 단독 펠릿 공장이 있고, 철강에서 간접배출이 인증서 기준에 포함되는 유일한 품목이다.
assert.equal(getCbamCoverage(product('p', '펠릿', '26011200')).status, 'COVERED');
assert.equal(getAppScopeExclusion(undefined), undefined);
assert.equal(getAppScopeExclusion(product('p', 'x', '84818099')), undefined, 'CBAM 목록에 없는 CN은 범위 판정 대상이 아니다(기존 「확인 필요」가 말한다)');

// 안내: 말과 판정이 같아야 한다. 시험 페르소나 이름이 사용자 화면에 나오면 안 된다.
const aluminium = getCbamCoverage(product('p', '알루미늄 판', '76061191'));
assert.equal(aluminium.status, 'NOT_COVERED');
assert.match(aluminium.reason, /철강 전용/);
assert.doesNotMatch(aluminium.reason, /씨밤이/, '시험 페르소나 이름이 사용자 화면에 나온다');
const pigIron = getCbamCoverage(product('p', '선철', '72011011'));
assert.equal(pigIron.status, 'NOT_COVERED', '선철이 아무 말 없이 「CBAM 대상」으로 나온다');
assert.match(pigIron.label, /고로 일관제철/);
assert.match(pigIron.reason, /폐가스·열/);
assert.equal(getCbamCoverage(product('p', '나사', '73181552')).status, 'COVERED');

// 자체 공정의 생산 방식 글자
for (const text of ['고로·전로 일관제철(BF/BOF)', 'BF-BOF', 'Blast furnace', '전로 제강', 'bof']) assert.equal(isIntegratedSteelRoute(text), true, `「${text}」는 일관제철이다`);
for (const text of ['스크랩 전기로(EAF)', 'DRI-EAF', '가공(압연·신선·열처리)', '', undefined, 'Bofors 열처리']) assert.equal(isIntegratedSteelRoute(text), false, `「${text}」를 일관제철로 읽으면 안 된다`);

// ── 엔진: 범위 밖 제품은 「CBAM 신고 대상」으로 저장돼 있어도 결과에 넣지 않는다 ─────
const period = { id: 'period', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'OPEN', created_at: '', updated_at: '' };
const processOf = (id, p, direct) => ({ id, period_id: period.id, product_id: p.id, name: `${p.name} 공정`, production_route: '', output_mass_t: 1000, market_output_mass_t: 1000, internal_consumption_mass_t: 0, direct_attributable_emissions_tco2e: direct, electricity_mwh: 100, electricity_ef_tco2e_per_mwh: 0.5, created_at: '', updated_at: '' });
const screw = product('screw', '나사', '73181552');
const plate = product('plate', '알루미늄 판', '76061191');
const iron = product('iron', '선철', '72011011');
const results = calculateLocalResults({ products: [screw, plate, iron], periods: [period], precursors: [], processes: [processOf('a', screw, 500), processOf('b', plate, 800), processOf('c', iron, 1500)] });
const of = (id) => results.find((result) => result.process_id === id);
assert.equal(of('a').is_cbam_reportable, true);
assert.equal(of('a').see_cbam_basis, 0.5);
for (const [id, pattern] of [['b', /철강 전용/], ['c', /고로 일관제철/]]) {
  assert.equal(of(id).is_cbam_reportable, false, `${of(id).product_name}이 신고 대상 결과로 계산된다`);
  assert.equal(of(id).see_cbam_basis, null, `${of(id).product_name}에 기준 SEE를 낸다 — 검증된 적 없는 숫자다`);
  assert.ok(of(id).warnings.some((message) => message.startsWith('범위 밖:') && pattern.test(message)), `${of(id).product_name}이 빠진 이유를 말하지 않는다`);
}
// 구매 전구물질로 들어온 고로 선철은 상관없다 — 공급사 SEE를 그대로 쓴다.
const withPurchasedPigIron = calculateLocalResults({
  products: [screw], periods: [period], processes: [processOf('a', screw, 500)],
  precursors: [{ id: 'pp', period_id: period.id, process_id: 'a', product_id: screw.id, name: '구매 선철', precursor_cn_code: '72011011', aggregated_goods_category: '', production_route: 'BF/BOF', supplier_country: 'China', supplier_installation: '', data_mode: 'ACTUAL', verification_status: 'VERIFIED', default_value_year: '2026', purchased_mass_t: 100, consumed_mass_t: 100, consumed_for_non_cbam_mass_t: 0, direct_see_tco2e_per_t: 1.5, indirect_see_tco2e_per_t: 0, source: '', default_value_justification: '', created_at: '', updated_at: '' }],
});
assert.equal(withPurchasedPigIron[0].is_cbam_reportable, true);
assert.ok(Math.abs(withPurchasedPigIron[0].see_cbam_basis - (0.5 + 0.15)) < 1e-12, '구매한 고로 선철의 SEE는 종전대로 전가된다');

// ── 화면 문구 ───────────────────────────────────────────────────────
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
assert.doesNotMatch(panels, /산정과 결과 확인은 됩니다/, '범위 밖 품목에 「산정은 된다」고 말한다 — 검증된 적 없는 숫자를 권하는 셈이다');
assert.match(panels, /이 앱의 지원 범위가 아닙니다/);

console.log('App scope verification passed (다른 분야 5종 · 선철 · 고로·전로 생산 방식 · 엔진 제외와 사유 · 구매 전구물질 무관 · 문구).');

// 결과 화면: 범위 밖 제품에 「CBAM 신고 대상」 라벨을 붙인 채 기준값만 「해당 없음」으로 두면 서로 어긋난다.
assert.equal((readFileSync('src/app/results/page.tsx', 'utf8').match(/앱 지원 범위 밖 \(산정 제외\)/g) ?? []).length, 2, '결과 화면이 범위 밖 제품을 「CBAM 신고 대상」이라 부른다');
