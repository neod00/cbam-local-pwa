// run36 — 3차 결과 손 검산: 제품별 기준 SEE = (공정 직접배출의 몫 + 그 CN에 넣은 구매 강재 × 직접 SEE) ÷ 그 CN 생산량(수출+비수출)
import { readFileSync } from 'node:fs';
const s = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const p of s.precursors) console.log(String(p.consumed_mass_t).padStart(8), String(p.direct_see_tco2e_per_t).padStart(7), String(p.indirect_see_tco2e_per_t).padStart(7), p.data_mode.padEnd(11), p.precursor_cn_code, p.supplier_country, '|', p.name);
// 연료: 도시가스 100,200 Nm³ × 0.037 GJ/Nm³ × 56.1 tCO2/TJ, 공정 몫 = 2,595/(2,595+500). 경유 19,000 L
const gas = 100200 * 0.037 / 1000 * 56.1; const inProcess = gas * (100200 * 0.037 * 0.7) / (100200 * 0.037 * 0.7 + 500);
console.log('도시가스 전체', gas.toFixed(1), 'tCO2 · 공정 몫', inProcess.toFixed(1));
const diesel = s.source_streams.filter((x) => /경유/.test(x.name)); console.log('경유 줄', diesel.length);
const cn = (code) => { const rows = s.precursors.filter((p) => p.name.includes(`→ CN ${code}`)); return rows.reduce((sum, p) => sum + p.consumed_mass_t * p.direct_see_tco2e_per_t, 0); };
const by = (re) => s.precursors.filter((p) => re.test(p.name)).reduce((sum, p) => sum + p.consumed_mass_t * p.direct_see_tco2e_per_t, 0);
const own = 0.0102;
console.log('CN 73181660 손 검산', (cn('73181660') / 2760 + own).toFixed(4));
console.log('CN 73181595 손 검산', (cn('73181595') / 90 + own).toFixed(4));
console.log('CN 73181699 손 검산', ((cn('73181699') + by(/^S45C/)) / 5260 + own).toFixed(4));
console.log('CN 73181692 손 검산', ((cn('73181692') + by(/^SWCH10A|^STS430/)) / 12976 + own).toFixed(4));
console.log('CN 73269098 손 검산', (by(/^SCM435/) / 850 + own).toFixed(4));
