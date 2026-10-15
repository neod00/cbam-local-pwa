// run38 — 씨밤이(컨설턴트)가 S&W(주) 본사공장(부산 사하구 다대동) 방문을 가정해 서식에 적은 값(1차: 「안내」와 설명 줄만 보고 채운 그대로).
// 공개 자료(홈페이지 snwcorp.com)에서 온 것: 회사명·주소·설립연도(1967)·사업장 4곳(본사·진례·구평·녹산)·사업분야(디젤엔진 부품 / 산업용 볼트 / 단조부품)·
//   공정 흐름(원소재 절단 → 열처리 QT/Normalizing(PIT로·연속로) → 재료시험 → 가공 → 전조 → 마킹 → 표면처리 → 비파괴검사 → 최종검사 → 세척 → 포장)·
//   단조설비(2톤·6톤 에어드롭 해머, 10톤 유압 해머)·인증(ISO 9001/14001, KEPIC, ASME).
//   그 밖의 품번·생산량·연료·원료·공급사·담당자·전력량은 모두 가상이다(실제 S&W의 자료가 아님).
//   node cbamy/runs/2026-10-15_run38-snw-workbook/make-fill.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ASK = '모름 — 공급사 문의 중';
const sector = (alloy) => ({ alloy_mn_cr_ni: alloy, reducing_agent: ASK, scrap_per_t: '0', preconsumer_scrap_pct: '0' });
const part = (id, pname, cn, grade, mass, exported, scrap, extra = {}) => ({ part: id, pname, cn, grade, mass: String(mass), exported, scrap: String(scrap), ...extra });
const ALL = 'SNB7;SCM440;SNB16;SCM435;S45C;STS304;SNCM439';
const HOT = 'SNB7;SCM440;SNB16;S45C;SNCM439';
const supplied = (name, cn, consumed, purchased, country, where, supplier, extra = {}) => ({
  name, cn, consumed: String(consumed), purchased: String(purchased), country, where,
  hasValue: '없음 (EU 기본값 사용)', supplier, evidence: '원자재 수불부 2025', ...extra,
});

const fill = {
  _note: 'run38 1차 — S&W(주) 본사공장(부산 사하구) 가정. 공개 자료(주소·설비·공정 흐름) 외의 수치·품번·공급사는 모두 가상.',
  installation: {
    name: 'S&W Corporation Dadae Head Plant',
    local_name: '(주)에스 앤 더블류 본사공장(다대동)',
    country: 'KR',
    street: '29, Dadae-ro 170beon-gil, Saha-gu',
    city: 'Busan',
    postcode: '49444',
    latitude: '35.05',
    longitude: '128.97',
    economic_activity: 'Manufacture of industrial bolts, nuts and studs, and forged steel parts',
    operator_name: 'S&W Corporation',
    operator_reg_number: '000-00-00000',
    operator_address: '29, Dadae-ro 170beon-gil, Saha-gu, Busan 49444, Republic of Korea',
    authorized_representative_name: 'Kim Min-jun (virtual)',
    email: 'cbam@example.invalid',
    telephone: '+82-51-000-0000',
    period_start: '2025-01-01',
    period_end: '2025-12-31',
    electricity_total_mwh: '5840',
    electricity_ef: '0.475',
    electricity_ef_source: '국가 전력망 평균',
    electricity_ef_publisher: 'European Commission',
    electricity_ef_document: 'Implementing Regulation (EU) 2025/2621 Annex II',
    electricity_ef_vintage: '2025',
    imported_heat: '아니오',
    waste_gases: '아니오',
    purchased_steel: '예',
    carbon_price_applicable: '아니오 (대상 아님)',
    declaration_name: 'Kim Min-jun (virtual)',
    declaration_position: '품질환경팀장',
  },
  parts: [
    // 산업용 스터드 볼트 — 머리 없음. 인장강도 800 MPa 이상(7318 15 48) / 미만(7318 15 42)
    part('SB-7001', '스터드 볼트 A193 B7 M24~M48', '73181548', 'SNB7', 380, '예', 55, sector('1.2')),
    part('SB-7002', '스터드 볼트 A320 L7 저온용', '73181548', 'SCM440', 150, '예', 24),
    part('SB-7003', '스터드 볼트 A193 B16 고온용', '73181548', 'SNB16', 90, '예', 18),
    part('SB-7101', '스터드 볼트 A193 B7M', '73181542', 'SNB7', 60, '예', 9),
    part('SB-8001', '스터드 볼트 A193 B8 (STS304)', '73181535', 'STS304', 85, '예', 12, sector('9.5')),
    part('HB-1001', '육각 볼트 강도구분 8.8', '73181582', 'SCM435', 210, '예', 25),
    part('HB-1002', '육각 볼트 강도구분 10.9', '73181588', 'SCM435', 140, '예', 17),
    part('NT-2001', '중육각 너트 A194 2H', '73181699', 'S45C', 310, '예', 38),
    part('NT-2002', '중육각 너트 A194 7', '73181699', 'SCM440', 120, '예', 15),
    part('NT-2003', '중육각 너트 STS304', '73181639', 'STS304', 40, '예', 5),
    // 선박 디젤엔진용 — 국내 엔진사·중국·일본 공급(EU 수출 아님)
    part('EB-3001', '엔진 유압 텐션 볼트', '73181595', 'SNCM439', 130, '아니오', 20),
    part('EB-3002', '엔진 헤드 스터드', '73181548', 'SNCM439', 110, '아니오', 15),
    // 단조부품 — 형단조(7326 19 90) · 자유단조(7326 19 10)
    part('FG-4001', '단조 블랭크(형단조)', '73261990', 'S45C', 520, '예', 120),
    part('FG-4002', '단조 블랭크(자유단조)', '73261910', 'SCM440', 260, '예', 70),
    // 엔진 캠샤프트 — CBAM 대상 아님(8483)
    part('CS-5001', '대형 엔진 캠샤프트', '84831095', 'SNCM439', 80, '아니오', 10),
  ],
  fuels: [
    { name: '열간단조 가열로 도시가스', kind: '도시가스 (Nm³)', amount: '215000', where: HOT, evidence: '도시가스 고지서 2025년 12장 (단조동 계량기)', method: '도시가스사 정산용 계량기' },
    { name: '열처리로(PIT·연속로) 도시가스', kind: '도시가스 (Nm³)', amount: '178000', where: ALL, evidence: '도시가스 고지서 2025년 12장 (열처리동 계량기)', method: '도시가스사 정산용 계량기' },
    { name: '열처리 분위기가스용 LPG', kind: 'LPG·프로판 (t)', amount: '34', where: ALL, evidence: 'LPG 납품 전표 2025 합계', method: '납품 전표 합산' },
    { name: '세척기 온수 보일러 도시가스', kind: '도시가스 (Nm³)', amount: '26000', where: '공장 전체(공용)', evidence: '도시가스 고지서 2025년 12장 (본동 계량기)', use: '보일러·스팀·온수 (여러 공정이 나눠 씀)', method: '도시가스사 정산용 계량기' },
  ],
  boilerHeat: [{ system: '세척기 온수 보일러 도시가스', process: '(공정 밖 — 사무동 난방 등)', note: '사무동 몫 모름' }],
  precursors: [
    supplied('SNB7 합금강 봉강 φ80 미만 (가상 봉강 제조사 K사)', '72283069', 300, 308, 'South Korea', 'SNB7', '가상 봉강 제조사 K사 (원소재: 국내 고로사)'),
    supplied('SNB7 합금강 봉강 φ80 이상 (가상 봉강 제조사 K사)', '72283061', 215, 221, 'South Korea', 'SNB7', '가상 봉강 제조사 K사'),
    supplied('SCM440 합금강 봉강 (가상 일본 특수강 J사)', '72283069', 645, 660, 'Japan', 'SCM440', '가상 일본 특수강 J사', {
      hasValue: '있음 (공급사가 준 값)', direct: '1.85', indirect: '0.52', verification: '공급사 확인', period: '2025-01-01 ~ 2025-12-31', evidence: '공급사 CBAM 데이터 시트(가상), 2026-08 회신',
    }),
    supplied('SNB16 합금강 봉강 (가상 일본 특수강 J사)', '72283069', 110, 114, 'Japan', 'SNB16', '가상 일본 특수강 J사'),
    supplied('SCM435 합금강 봉강 (가상 봉강 제조사 K사)', '72283069', 395, 405, 'South Korea', 'SCM435', '가상 봉강 제조사 K사'),
    supplied('S45C 환봉 φ80 미만 (가상 봉강 유통사 H사)', '72149979', 380, 388, 'South Korea', 'S45C', '가상 봉강 유통사 H사'),
    supplied('S45C 환봉 φ80 이상 (단조 소재, 가상 봉강 유통사 H사)', '72149971', 610, 622, 'South Korea', 'S45C', '가상 봉강 유통사 H사'),
    supplied('STS304 환봉 (가상 무역상 T사 경유)', '72221181', 144, 148, 'China', 'STS304', '가상 무역상 T사 (제조 공장 미확인)'),
    supplied('SNCM439 합금강 봉강 (가상 일본 특수강 J사)', '72283069', 367, 374, 'Japan', 'SNCM439', '가상 일본 특수강 J사'),
  ],
  rnr: [
    { data: '생산량 (품번별)', collector: '생산관리팀', transposer: '품질환경팀 이OO', approver: '품질환경팀장', system: 'ERP 생산실적' },
    { data: '연료·전력 사용량', collector: '총무팀', transposer: '품질환경팀 이OO', approver: '품질환경팀장', system: '고지서 수기 집계' },
    { data: '원재료 투입량', collector: '자재팀', transposer: '품질환경팀 이OO', approver: '품질환경팀장', system: 'ERP 수불부' },
  ],
  evidence: [
    { item: '도시가스 고지서 2025년 (계량기 3개 × 12장)', proves: '4_연료의 도시가스 사용량', custodian: '총무팀 문서고', status: '확보' },
    { item: '한전 전기요금 고지서 2025년 12장', proves: '1_사업장의 공장 전체 전력', custodian: '총무팀 문서고', status: '확보' },
    { item: 'LPG 납품 전표 2025', proves: '열처리 분위기가스 LPG', custodian: '자재팀', status: '확보' },
    { item: '일본 특수강 J사 CBAM 데이터 시트', proves: 'SCM440 봉강의 공급사 실측 SEE', custodian: '자재팀', status: '확보' },
  ],
};
writeFileSync(path.join(dir, 'fill-snw1.json'), JSON.stringify(fill, null, 2));
console.log('fill-snw1.json written');
