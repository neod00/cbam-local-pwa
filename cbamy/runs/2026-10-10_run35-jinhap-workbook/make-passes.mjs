// run35 — 1차 파일에서 씨밤이가 「확인할 것」을 보고 고친 2차·3차 채움값을 만든다.
//   node cbamy/runs/2026-10-10_run35-jinhap-workbook/make-passes.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pass1 = JSON.parse(readFileSync(path.join(dir, 'fill-pass1.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

// 2차 — 앱이 알려 준 것만 고친다: 공정 이름(「<재질> 공정」), 전력 단위(kWh → MWh), 재질 표기, 마무리동 등유 삭제, 탭타이트의 부문 파라미터
const pass2 = clone(pass1);
pass2._note = 'run35 2차 — 1차의 「확인할 것」을 보고 고친 것. 재질은 사실대로 둠(같은 CN 73181582가 SCM435·SWCH35K 두 공정으로 갈림). 모두 가상 수치.';
pass2.installation.electricity_total_mwh = '21500';
for (const part of pass2.parts) if (part.grade === 'SCM 435') part.grade = 'SCM435';
const sectorOf18A = pass2.parts.find((part) => part.part === 'GB-3001');
Object.assign(pass2.parts.find((part) => part.part === 'TS-4001'), { alloy_mn_cr_ni: sectorOf18A.alloy_mn_cr_ni, reducing_agent: sectorOf18A.reducing_agent, scrap_per_t: '0', preconsumer_scrap_pct: '0' });
pass2.fuels = pass2.fuels.filter((fuel) => !fuel.name.includes('포장동'));
for (const fuel of pass2.fuels) if (fuel.where.includes(';')) fuel.where = fuel.where.split(';').map((name) => `${name} 공정`).join(';');
for (const precursor of pass2.precursors) precursor.where = `${precursor.where} 공정`;
writeFileSync(path.join(dir, 'fill-pass2.json'), JSON.stringify(pass2, null, 2));

// 3차 — CN 73181582(고강도 볼트)를 한 제품·한 공정으로: 재질 칸을 같은 이름으로 적는다(Article 4(2)·4(6): CN별 기능단위, 단일 생산공정)
const pass3 = clone(pass2);
pass3._note = 'run35 3차 — 2차에서 남은 V02·V03(같은 CN이 두 공정) 경고를 보고 CN 73181582를 한 제품·한 공정으로 합친 것. 모두 가상 수치.';
const MERGED = '고강도강(SCM435·SWCH35K)';
for (const part of pass3.parts) if (part.cn === '73181582') part.grade = MERGED;
for (const part of pass3.parts.filter((entry) => entry.part === 'EB-1001' || entry.part === 'CB-2001')) part.alloy_mn_cr_ni = part.part === 'EB-1001' ? '1.4' : '';
for (const fuel of pass3.fuels) if (fuel.where.includes(';')) fuel.where = `${MERGED} 공정`;
for (const precursor of pass3.precursors) if (/SCM435|SWCH35K/.test(precursor.where)) precursor.where = `${MERGED} 공정`;
writeFileSync(path.join(dir, 'fill-pass3.json'), JSON.stringify(pass3, null, 2));
console.log('fill-pass2.json, fill-pass3.json');
