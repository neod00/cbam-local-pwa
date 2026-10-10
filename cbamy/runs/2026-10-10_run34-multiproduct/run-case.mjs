// run34 — 다품종 체결부품 업체(가상 「한성화스너」)를 지금 서식(v2)에 넣어 본다.
// 풍강·진합 같은 업체를 본떴다: 제품 7종(CN 6개 + 알루미늄 1), 강종 4가지, 열처리·열간단조는 일부 제품만.
// 서식을 채우는 방법 세 가지를 같은 자료로 돌려, 손계산 기준값과 견준다.
// 저장소 루트에서: node cbamy/runs/2026-10-10_run34-multiproduct/run-case.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const fflate = createRequire(import.meta.url)('fflate');
const cache = new Map();
function load(file) {
  const full = path.resolve(file);
  if (cache.has(full)) return cache.get(full).exports;
  const loaded = { exports: {} };
  cache.set(full, loaded);
  const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requireFrom = (request) => (request === 'fflate' ? fflate : load(`${request.startsWith('@/') ? path.resolve('src', request.slice(2)) : path.resolve(path.dirname(full), request)}.ts`));
  vm.runInNewContext(`(function (exports, require, module) {${code}\n})`, { Blob, Intl, Uint8Array, console, Date, navigator: undefined, DOMParser: undefined })(loaded.exports, requireFrom, loaded);
  return loaded.exports;
}
const W = load('src/lib/activity-workbook.ts');
const I = load('src/lib/activity-import.ts');
const engine = load('src/lib/calculation-engine.ts');
const attributionLib = load('src/lib/attribution-status.ts');
const exportLib = load('src/lib/eu-template-export.ts');
const defaultValues = load('src/lib/bundled-references.ts').expandBundledDefaultValues(JSON.parse(readFileSync('public/reference/cbam-default-values.json', 'utf8')), '2026-10-10T00:00:00.000Z');
const countries = [...new Set(defaultValues.rows.map((row) => row.country))];

// ── 가상 업체의 사실 ──────────────────────────────────────────────────
const PRODUCTS = [
  { id: 'P1', name: '합금강 고강도 볼트 (SCM435, 열처리)', cn: '73181582', mass: 2400, scrap: 100, eu: true, steel: 'alloyWire' },
  { id: 'P2', name: '탄소강 일반 볼트', cn: '73181575', mass: 1800, scrap: 70, eu: false, steel: 'carbonWire' },
  { id: 'P3', name: 'STS 볼트', cn: '73181535', mass: 300, scrap: 12, eu: true, steel: 'stsWire' },
  { id: 'P4', name: '탄소강 육각너트 (냉간단조)', cn: '73181699', mass: 3000, scrap: 120, eu: true, steel: 'carbonWire' },
  { id: 'P5', name: '대형 휠너트 (열간단조·열처리)', cn: '73181692', mass: 1200, scrap: 60, eu: true, steel: 'alloyBar' },
  { id: 'P6', name: '평와셔', cn: '73182200', mass: 400, scrap: 20, eu: false, steel: 'carbonWire' },
  { id: 'P7', name: '알루미늄 캡 (비철)', cn: '76169990', mass: 150, scrap: 5, eu: false, steel: null },
];
const STEELS = {
  alloyWire: { name: '합금강 선재 SCM435', cn: '72279050', country: 'South Korea', supplier: '세아베스틸 군산공장', direct: 1.95, indirect: 0.35, users: { P1: 2500 } },
  alloyBar: { name: '합금강 봉강 (열간단조용)', cn: '72283069', country: 'South Korea', supplier: '공급사 자료 미회신', users: { P5: 1260 } },
  carbonWire: { name: '탄소강 선재 SWRCH', cn: '72139110', country: 'South Korea', supplier: '포스코 포항제철소', direct: 2.05, indirect: 0.12, users: { P2: 1870, P4: 3120, P6: 420 } },
  stsWire: { name: 'STS 304 와이어', cn: '72230019', country: 'South Korea', supplier: '(주)대한스테인리스선재 포항공장', direct: 1.86, indirect: 0.94, users: { P3: 312 } },
};
const FUELS = [
  { name: '열처리로(QT) 도시가스', kind: '도시가스 (Nm³)', amount: 620000, users: ['P1', 'P5'] },
  { name: '열간단조 가열로 도시가스', kind: '도시가스 (Nm³)', amount: 180000, users: ['P5'] },
  { name: '세척·탈유 온수 보일러 도시가스', kind: '도시가스 (Nm³)', amount: 60000, users: 'ALL' },
  { name: '지게차 경유', kind: '경유 (L)', amount: 18000, users: 'ALL' },
];
const ELECTRICITY = { total: 9800, ef: 0.4747 };
const emissionsOf = (fuel) => (fuel.kind.startsWith('도시가스') ? fuel.amount * 0.037 * 56.1 / 1000 : fuel.amount * 0.835 / 1000 * 43 * 74.1 / 1000);
const massOf = (ids) => PRODUCTS.filter((product) => ids.includes(product.id)).reduce((sum, product) => sum + product.mass, 0);
const ALL = PRODUCTS.map((product) => product.id);

// ── 기준값(손계산) ───────────────────────────────────────────────────
// 원료가 같은 제품끼리 한 공정(부속서 II A.4), 연료는 그 연료를 쓰는 제품끼리 생산량 비율로(부속서 III A.2), 구매 강재는 쓴 제품에.
const defaultSee = (steel) => {
  const filled = load('src/lib/conversation-precursor.ts').fillEuDefault({ reference: defaultValues, country: steel.country, cnDigits: steel.cn });
  return { direct: filled.direct, indirect: filled.indirect };
};
const reference = {};
for (const product of PRODUCTS) {
  let direct = 0;
  for (const fuel of FUELS) {
    const users = fuel.users === 'ALL' ? ALL : fuel.users;
    if (users.includes(product.id)) direct += emissionsOf(fuel) * product.mass / massOf(users);
  }
  let precursorDirect = 0;
  let precursorIndirect = 0;
  if (product.steel) {
    const steel = STEELS[product.steel];
    const see = steel.direct !== undefined ? steel : defaultSee(steel);
    // 탄소강 선재처럼 여러 제품이 한 공정(같은 원료)이면 그 공정의 원료 배출을 생산량 비율로 나눈다.
    const group = Object.keys(steel.users);
    const consumed = Object.values(steel.users).reduce((sum, value) => sum + value, 0);
    precursorDirect = consumed * see.direct * product.mass / massOf(group);
    precursorIndirect = consumed * see.indirect * product.mass / massOf(group);
  }
  const electricity = ELECTRICITY.total * ELECTRICITY.ef * product.mass / massOf(ALL);
  reference[product.id] = { basis: (direct + precursorDirect) / product.mass, total: (direct + precursorDirect + precursorIndirect + electricity) / product.mass };
}

// ── 서식을 채우는 세 가지 방법 ───────────────────────────────────────
const installation = {
  name: 'Hansung Fastener Co., Ltd. Hwaseong Plant', local_name: '한성화스너 화성공장 (가상)', country: 'KR',
  operator_name: 'Hansung Fastener Co., Ltd.', operator_reg_number: '000-00-00000', operator_address: 'Hwaseong-si, Gyeonggi-do, Republic of Korea',
  latitude: '37.08', longitude: '126.82', period_start: '2025-01-01', period_end: '2025-12-31',
  electricity_total_mwh: ELECTRICITY.total, electricity_ef: ELECTRICITY.ef, electricity_ef_source: '국가 전력망 평균', imported_heat: '아니오', waste_gases: '아니오',
};
const productRows = PRODUCTS.map((product) => ({ name: product.name, cn: product.cn, exported: product.eu ? '예' : '아니오' }));
const precursorRow = (steel, where, consumed, products = '') => ({
  name: steel.name, cn: steel.cn, consumed, purchased: consumed, country: steel.country, where, products, supplier: steel.supplier,
  ...(steel.direct !== undefined
    ? { hasValue: '있음 (공급사가 준 값)', direct: steel.direct, indirect: steel.indirect, verification: '공급사 확인', evidence: '공급사 CBAM 데이터 시트' }
    : { hasValue: '없음 (EU 기본값 사용)', evidence: '공급사 자료 미회신' }),
});
const fuelRow = (fuel, where, amount = fuel.amount, name = fuel.name) => ({ name, kind: fuel.kind, amount, where, evidence: '고지서·전표 2025' });
const totalOf = (steel) => Object.values(steel.users).reduce((sum, value) => sum + value, 0);

// (가) 생각 없이: 공장을 한 공정으로, 제품을 그 공정의 줄로. 연료·원료는 전부 그 공정에.
const naive = {
  installation, products: productRows,
  processes: PRODUCTS.map((product) => ({ name: '체결부품 생산라인', product: product.name, mass: product.mass, scrap: product.scrap })),
  fuels: FUELS.map((fuel) => fuelRow(fuel, W.SHARED_PROCESS_LABEL)),
  precursors: Object.values(STEELS).map((steel) => precursorRow(steel, '체결부품 생산라인', totalOf(steel))),
};
// (가2) 한 공정이지만 구매 강재마다 「쓰는 제품」을 적는다(새 칸).
const nameOf = (id) => PRODUCTS.find((product) => product.id === id).name;
const naiveAssigned = { ...naive, precursors: Object.values(STEELS).map((steel) => precursorRow(steel, '체결부품 생산라인', totalOf(steel), Object.keys(steel.users).map(nameOf).join('; '))) };
// (나) CN마다 공정 하나: 제품 = 공정. 일부 공정만 쓰는 연료는 그 공정 이름들을 ; 로 이어 적는다(새 표기).
const perCn = {
  installation, products: productRows,
  processes: PRODUCTS.map((product) => ({ name: `${product.id} 공정`, product: product.name, mass: product.mass, scrap: product.scrap })),
  fuels: FUELS.map((fuel) => fuelRow(fuel, Array.isArray(fuel.users) ? fuel.users.map((id) => `${id} 공정`).join('; ') : W.SHARED_PROCESS_LABEL)),
  precursors: Object.values(STEELS).flatMap((steel) => Object.entries(steel.users).map(([id, consumed]) => precursorRow(steel, `${id} 공정`, consumed))),
};
// (다) 원료가 같은 제품끼리 한 공정, 일부 공정만 쓰는 연료는 그 공정 이름들을 ; 로 이어 적는다(손으로 나누지 않는다).
const GROUPS = [['합금강 볼트 공정', ['P1']], ['탄소강 공정', ['P2', 'P4', 'P6']], ['STS 볼트 공정', ['P3']], ['휠너트 공정', ['P5']], ['알루미늄 공정', ['P7']]];
const groupOf = (id) => GROUPS.find(([, ids]) => ids.includes(id))[0];
const careful = {
  installation, products: productRows,
  processes: GROUPS.flatMap(([name, ids]) => PRODUCTS.filter((product) => ids.includes(product.id)).map((product) => ({ name, product: product.name, mass: product.mass, scrap: product.scrap }))),
  fuels: FUELS.flatMap((fuel) => (fuel.users === 'ALL'
    ? [fuelRow(fuel, W.SHARED_PROCESS_LABEL)]
    : [fuelRow(fuel, fuel.users.map(groupOf).join('; '))])),
  precursors: Object.values(STEELS).map((steel) => precursorRow(steel, groupOf(Object.keys(steel.users)[0]), totalOf(steel))),
};

// (라) 품번 목록(2b)만 채운다: 생산실적을 CN·재질로 합치고, 공정은 재질별로 앱이 만든다(공정 이름은 「<재질> 공정」).
const GRADE = { P1: 'SCM435', P2: 'SWCH', P3: 'STS304', P4: 'SWCH', P5: 'SCM440-봉강', P6: 'SWCH', P7: 'AL6061' };
const gradeProcess = (id) => `${GRADE[id]} 공정`;
const partsOnly = {
  installation,
  parts: PRODUCTS.flatMap((product) => [
    // 같은 제품을 품번 둘로 나눠 적는다(합이 제품 생산량) — 앱이 다시 합친다.
    { part: `${product.id}-a`, cn: product.cn, grade: GRADE[product.id], mass: String(product.mass * 0.6), exported: product.eu ? '예' : '아니오', scrap: String(product.scrap) },
    { part: `${product.id}-b`, cn: product.cn, grade: GRADE[product.id], mass: String(product.mass * 0.4), exported: product.eu ? '예' : '아니오' },
  ]),
  fuels: FUELS.map((fuel) => fuelRow(fuel, Array.isArray(fuel.users) ? fuel.users.map(gradeProcess).join('; ') : W.SHARED_PROCESS_LABEL)),
  precursors: Object.values(STEELS).map((steel) => {
    const first = Object.keys(steel.users)[0];
    return precursorRow(steel, gradeProcess(first), totalOf(steel));
  }),
};

// ── 돌리기 ────────────────────────────────────────────────────────────
async function run(label, fill) {
  const bytes = new Uint8Array(await W.createActivityWorkbook({ countries, fill }).arrayBuffer());
  const data = W.parseActivityWorkbook(bytes);
  const store = { installations: [], periods: [], products: [], processes: [], product_output_lines: [], source_streams: [], precursors: [], internal_transfers: [] };
  let n = 0;
  const api = {
    list: async (name) => [...store[name]],
    create: async (name, item) => { const entity = { ...item, id: `${name}_${n += 1}`, created_at: 't', updated_at: 't' }; store[name].push(entity); return entity; },
    update: async (name, item) => { store[name] = store[name].map((entry) => (entry.id === item.id ? item : entry)); return item; },
  };
  const result = await I.importActivityWorkbook(data, { store: api, defaultValues });
  const records = { internalTransfers: [], products: store.products, periods: store.periods, processes: store.processes, productOutputLines: store.product_output_lines, sourceStreams: store.source_streams, precursors: store.precursors };
  const results = engine.calculateLocalResults(records);
  const see = {};
  for (const product of PRODUCTS) {
    const stored = store.products.find((item) => item.cn_code === product.cn);
    const item = results.find((entry) => entry.product_id === stored?.id && entry.output_mass_t > 0);
    see[product.id] = item ? { basis: item.see_direct_incl_precursor, total: item.total_see, reportable: item.is_cbam_reportable } : null;
  }
  const attribution = attributionLib.buildAttributionStatus({ processes: store.processes, productOutputLines: store.product_output_lines, sourceStreams: store.source_streams, precursorCount: store.precursors.length, results, installation: store.installations[0], hrefOf: engine.getLocalCalculationWarningHref });
  const readiness = exportLib.evaluateEuExportReadiness({ installations: store.installations, ...records, reportingPeriodId: undefined });
  return { label, created: result.created, issues: result.issues, see, attribution, readiness, counts: { processes: store.processes.length, streams: store.source_streams.length, precursors: store.precursors.length, lines: store.product_output_lines.length } };
}

const runs = [await run('(가) 한 공정에 전부', naive), await run('(가2) 한 공정 + 쓰는 제품', naiveAssigned), await run('(나) CN마다 공정', perCn), await run('(다) 원료별 공정', careful), await run('(라) 품번 목록만', partsOnly)];
const f = (value) => (value === null || value === undefined ? '   —  ' : value.toFixed(3).padStart(6));
const pct = (value, base) => (value === null || value === undefined ? '' : `(${((value / base - 1) * 100 >= 0 ? '+' : '')}${((value / base - 1) * 100).toFixed(0)}%)`.padStart(7));
console.log('기준 SEE (직접 + 구매 강재 직접, tCO2e/t)');
console.log(`${'제품'.padEnd(34)}  기준값   ${runs.map((item) => item.label.slice(0, 5).padEnd(15)).join('')}`);
for (const product of PRODUCTS) {
  console.log(`${`${product.id} ${product.name}`.padEnd(34)} ${f(reference[product.id].basis)}   ${runs.map((item) => `${f(item.see[product.id]?.basis)} ${pct(item.see[product.id]?.basis, reference[product.id].basis)}  `).join('')}${product.eu ? 'EU 수출' : ''}`);
}
for (const item of runs) {
  console.log(`\n== ${item.label}: 넣은 것 ${JSON.stringify(item.created)} · 저장된 공정 ${item.counts.processes} · 연료 행 ${item.counts.streams} · 구매 강재 ${item.counts.precursors}`);
  console.log(`   서식 「확인할 것」: 넣지 못함 ${item.issues.filter((issue) => issue.level === 'error').length} · 확인 필요 ${item.issues.filter((issue) => issue.level === 'warning').length} · 참고 ${item.issues.filter((issue) => issue.level === 'info').length}`);
  for (const issue of item.issues.filter((entry) => entry.level !== 'info').slice(0, 6)) console.log(`     [${issue.level}] ${issue.sheet}${issue.row ? ` ${issue.row}줄` : ''} — ${issue.message.slice(0, 150)}`);
  console.log(`   귀속·할당 점검: 수정 ${item.attribution.counts.fix} · 확인 ${item.attribution.counts.review} · 통과 ${item.attribution.counts.ok}`);
  for (const row of item.attribution.rows.filter((entry) => entry.status !== 'ok')) console.log(`     ${row.status} ${row.code} ${row.title.slice(0, 40)} — ${(row.items[0] ?? row.detail).slice(0, 150)}`);
  console.log(`   EU 문서 준비도: 오류 ${item.readiness.errorCount} · 경고 ${item.readiness.warningCount}`);
  for (const issue of item.readiness.issues.filter((entry) => entry.severity === 'error').slice(0, 4)) console.log(`     오류 — ${issue.message.slice(0, 170)}`);
}
