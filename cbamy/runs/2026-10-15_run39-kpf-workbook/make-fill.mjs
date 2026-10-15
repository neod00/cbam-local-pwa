// run39 — 씨밤이(컨설턴트)가 (주)케이피에프(KPF) 충주공장 방문을 가정해 서식에 적은 값(1차: 「안내」와 설명 줄만 보고 채운 그대로).
// 공개 자료(홈페이지 kpf-global.com)에서 온 것: 회사명·창립(1963)·본사(성남 분당)·충주공장 주소·해외 법인(베트남 KPF VINA 연 52,000 t, 중국 지난, 미국, 독일 영업소)·
//   국내 연 생산능력 127,000 t·임직원 466명·제품군(건설용 H/T·T/C·구조용 볼트/너트/와셔, 플랜트, 중장비, 풍력 타워 플랜지 볼트, 자동차 단조부품: 베어링 링·기어 블랭크·캠 로브·허브)·
//   공정(열간 볼트: 인발-절단-가열-성형-군살제거-끝가공-압출-전조-열처리-포장 / 냉간 볼트 / 열간 너트 / 부품)·인증(EN 14399 CE-CPR, DASt 021, EN 10204 3.1, ISO 9001·45001)·소사장·외주생산 확대 방침.
//   그 밖의 품번·생산량·연료·원료·공급사·담당자·전력량은 모두 가상이다(실제 KPF의 자료가 아님).
//   node cbamy/runs/2026-10-15_run39-kpf-workbook/make-fill.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ASK = '모름 — 공급사 문의 중';
const sector = (alloy) => ({ alloy_mn_cr_ni: alloy, reducing_agent: ASK, scrap_per_t: '0', preconsumer_scrap_pct: '0' });
// [품번, 품명, CN, 강종, 생산량 t, EU 수출, 스크랩(t)]
const rows = [
  ['TC-1001', 'T/C 볼트 M20 (EN 14399-10)', '73181595', 'SCM435', 2400, '예', 260],
  ['TC-1002', 'T/C 볼트 M22 (EN 14399-10)', '73181595', 'SCM435', 1900, '예', 205],
  ['TC-1003', 'T/C 볼트 M24 (EN 14399-10)', '73181595', 'SCM435', 1300, '예', 140],
  ['ST-2001', '구조용 육각 볼트 A325 M24', '73181588', 'S45C', 3100, '아니오', 330],
  ['ST-2002', '구조용 육각 볼트 A490 M27', '73181588', 'SCM440', 1500, '아니오', 170],
  ['ST-2003', '구조용 육각 너트 A563', '73181699', 'S45C', 2800, '아니오', 300],
  ['ST-2004', '구조용 와셔 F436', '73182200', 'S45C', 900, '아니오', 85],
  ['WP-3001', '풍력 타워 플랜지 볼트 M36 (DASt 021)', '73181588', 'SCM440', 1700, '예', 190],
  ['WP-3002', '풍력 타워 플랜지 볼트 M42 (DASt 021)', '73181588', 'SCM440', 1200, '예', 135],
  ['WP-3003', '풍력용 육각 너트 M36', '73181699', 'S45C', 900, '예', 95],
  ['HV-4001', '중장비용 고강도 볼트 13.9T', '73181588', 'SCM440', 2600, '아니오', 290],
  ['HV-4002', '중장비 휠 볼트', '73181595', 'SCM435', 1100, '아니오', 120],
  ['CD-5001', '냉간 육각 볼트 M10 (10.9)', '73181588', 'SCM435', 4200, '아니오', 380],
  ['CD-5002', '냉간 플랜지 볼트 M8 (자동차)', '73181588', 'SCM435', 2400, '아니오', 215],
  ['CD-5003', '냉간 육각 너트 M12 (내수)', '73181692', 'SWCH35K', 3000, '아니오', 260],
  ['AP-6001', '베어링 내륜 단조품', '73261990', 'SUJ2', 4600, '예', 640],
  ['AP-6002', '베어링 외륜 단조품', '73261990', 'SUJ2', 5200, '예', 720],
  ['AP-6003', '기어 블랭크', '73261990', 'SCM420H', 3800, '예', 520],
  ['AP-6004', '캠 로브 단조품', '73261990', 'SCM440', 1100, '아니오', 150],
  ['AP-6005', '허브 단조품', '73261990', 'S45C', 2900, '아니오', 380],
  ['AP-6006', '가공 완료 베어링 레이스', '84829900', 'SUJ2', 1000, '아니오', 140],
];
const parts = rows.map(([part, pname, cn, grade, mass, exported, scrap], index) => ({
  part, pname, cn, grade, mass: String(mass), exported, scrap: String(scrap),
  ...(index % 7 === 0 ? sector('1.1') : {}),
}));

// 강종별 투입(생산+스크랩) → 구매 강재 줄로 나눈다
const input = {};
for (const [, , , grade, mass, , scrap] of rows) input[grade] = (input[grade] ?? 0) + mass + scrap;
const GRADES = Object.keys(input);
const line = (name, cn, grade, share, country, supplier, extra = {}) => {
  const consumed = Math.round(input[grade] * share);
  return {
    name, cn, consumed: String(consumed), purchased: String(Math.round(consumed * 1.012)), country, where: grade,
    hasValue: '없음 (EU 기본값 사용)', supplier, evidence: '원자재 수불부 2025', ...extra,
  };
};
const precursors = [
  line('SCM435 CHQ 선재 (가상 선재 제조사 P사)', '72279095', 'SCM435', 0.6, 'South Korea', '가상 선재 제조사 P사 (원소재: 국내 고로사)'),
  line('SCM435 CHQ 선재 (가상 일본 특수강 J사)', '72279095', 'SCM435', 0.25, 'Japan', '가상 일본 특수강 J사', {
    hasValue: '있음 (공급사가 준 값)', direct: '1.92', indirect: '0.48', verification: '공급사 확인', period: '2025-01-01 ~ 2025-12-31', evidence: '공급사 CBAM 데이터 시트(가상)',
  }),
  line('SCM435 선재 (가상 무역상 T사 경유)', '72279095', 'SCM435', 0.15, 'China', '가상 무역상 T사 (제조 공장 미확인)'),
  line('SCM440 합금강 봉강 (가상 봉강 제조사 K사)', '72283069', 'SCM440', 0.7, 'South Korea', '가상 봉강 제조사 K사'),
  line('SCM440 합금강 봉강 (가상 일본 특수강 J사)', '72283069', 'SCM440', 0.3, 'Japan', '가상 일본 특수강 J사'),
  line('SCM420H 선재 (가상 선재 제조사 P사)', '72279095', 'SCM420H', 1, 'South Korea', '가상 선재 제조사 P사'),
  line('S45C 선재 (가상 선재 제조사 P사)', '72139170', 'S45C', 0.7, 'South Korea', '가상 선재 제조사 P사'),
  line('S45C 선재 (가상 선재 유통사 H사)', '72139170', 'S45C', 0.3, 'South Korea', '가상 선재 유통사 H사'),
  line('SWCH35K 선재 (가상 선재 제조사 P사)', '72139170', 'SWCH35K', 1, 'South Korea', '가상 선재 제조사 P사'),
  line('SUJ2 베어링강 봉강 (가상 특수강 제조사 S사)', '72283049', 'SUJ2', 0.55, 'South Korea', '가상 특수강 제조사 S사'),
  line('SUJ2 베어링강 봉강 (가상 일본 특수강 J사)', '72283049', 'SUJ2', 0.45, 'Japan', '가상 일본 특수강 J사'),
];

const fill = {
  _note: 'run39 1차 — (주)케이피에프 충주공장 가정. 공개 자료(주소·제품군·공정 흐름·인증·규모) 외의 수치·품번·공급사는 모두 가상.',
  installation: {
    name: 'KPF Co., Ltd. Chungju Plant',
    local_name: '(주)케이피에프 충주공장',
    country: 'KR',
    street: '50, Chungjusandan 5-ro',
    city: 'Chungju-si, Chungcheongbuk-do',
    postcode: '27327',
    unlocode: 'KRCJU',
    latitude: '36.99',
    longitude: '127.93',
    economic_activity: 'Manufacture of industrial fasteners and forged automotive parts',
    operator_name: 'KPF Co., Ltd.',
    operator_reg_number: '000-00-00000',
    operator_address: '136, Unjung-ro, Bundang-gu, Seongnam-si, Gyeonggi-do, Republic of Korea',
    authorized_representative_name: 'Park Seon-woo (virtual)',
    email: 'cbam@example.invalid',
    telephone: '+82-43-000-0000',
    period_start: '2025-01-01',
    period_end: '2025-12-31',
    electricity_total_mwh: '61500',
    electricity_ef: '0.475',
    electricity_ef_source: '국가 전력망 평균',
    electricity_ef_publisher: 'European Commission',
    electricity_ef_document: 'Implementing Regulation (EU) 2025/2621 Annex II',
    electricity_ef_vintage: '2025',
    imported_heat: '아니오',
    waste_gases: '아니오',
    purchased_steel: '예',
    carbon_price_applicable: '아직 모름',
    declaration_name: 'Park Seon-woo (virtual)',
    declaration_position: '환경안전팀장',
  },
  parts,
  fuels: [
    { name: '열간 성형 가열로 도시가스', kind: '도시가스 (Nm³)', amount: '2350000', where: GRADES.join(';'), evidence: '도시가스 고지서 2025년 12장 (단조동 계량기)', method: '도시가스사 정산용 계량기' },
    { name: '열처리로(연속 SA로·QT) 도시가스', kind: '도시가스 (Nm³)', amount: '1950000', where: GRADES.join(';'), evidence: '도시가스 고지서 2025년 12장 (열처리동 계량기)', method: '도시가스사 정산용 계량기' },
    { name: '열처리 분위기가스용 LPG', kind: 'LPG·프로판 (t)', amount: '210', where: GRADES.join(';'), evidence: 'LPG 납품 전표 2025 합계', method: '납품 전표 합산' },
    { name: '지게차·구내 운반 경유', kind: '경유 (L)', amount: '85000', where: '공장 전체(공용)', evidence: '주유 전표 2025', method: '주유 전표 합산' },
    { name: '세척·도금 라인 온수 보일러 도시가스', kind: '도시가스 (Nm³)', amount: '420000', where: '공장 전체(공용)', evidence: '도시가스 고지서 2025년 12장 (본동 계량기)', use: '보일러·스팀·온수 (여러 공정이 나눠 씀)', method: '도시가스사 정산용 계량기' },
  ],
  boilerHeat: [{ system: '세척·도금 라인 온수 보일러 도시가스', process: '(공정 밖 — 사무동 난방 등)', note: '도금 라인(관계사)·사무동 몫 모름' }],
  precursors,
  rnr: [
    { data: '생산량 (품번별)', collector: '생산관리팀', transposer: '환경안전팀 최OO', approver: '환경안전팀장', system: 'ERP 생산실적' },
    { data: '연료·전력 사용량', collector: '총무팀', transposer: '환경안전팀 최OO', approver: '환경안전팀장', system: '고지서 수기 집계' },
    { data: '원재료 투입량', collector: '자재팀', transposer: '환경안전팀 최OO', approver: '환경안전팀장', system: 'ERP 수불부' },
  ],
  evidence: [
    { item: '도시가스 고지서 2025년 (계량기 3개 × 12장)', proves: '4_연료의 도시가스 사용량', custodian: '총무팀 문서고', status: '확보' },
    { item: '한전 전기요금 고지서 2025년 12장', proves: '1_사업장의 공장 전체 전력', custodian: '총무팀 문서고', status: '확보' },
    { item: 'LPG 납품 전표 2025', proves: '열처리 분위기가스 LPG', custodian: '자재팀', status: '확보' },
    { item: '일본 특수강 J사 CBAM 데이터 시트', proves: 'SCM435 선재 일부의 공급사 실측 SEE', custodian: '자재팀', status: '확보' },
  ],
};
writeFileSync(path.join(dir, 'fill-kpf1.json'), JSON.stringify(fill, null, 2));
console.log('fill-kpf1.json written —', parts.length, 'parts,', precursors.length, 'precursor lines, grades:', GRADES.join(','));
