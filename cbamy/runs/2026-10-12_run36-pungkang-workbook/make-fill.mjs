// run36 — 씨밤이(컨설턴트)가 풍강 본사(화성) 방문을 가정해 서식에 적은 값(1차: 「안내」와 설명 줄만 보고 채운 그대로).
// 공개 자료에서 온 것: 회사명·주소·설립연도·제품군·설비(냉간포머 약 70대, 열간포머 약 1200℃, 태핑 약 210대)·
//   2025년 온실가스(본사 Scope 1 299 / Scope 2 4,179 tCO2e, LRQA 제한적 보증). 그 밖의 품번·생산량·연료·원료·공급사·담당자는 모두 가상이다.
//   node cbamy/runs/2026-10-12_run36-pungkang-workbook/make-fill.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ASK = '모름 — 공급사 문의 중';
const sector = (alloy) => ({ alloy_mn_cr_ni: alloy, reducing_agent: ASK, scrap_per_t: '0', preconsumer_scrap_pct: '0' });
const part = (id, pname, cn, grade, mass, exported, scrap, extra = {}) => ({ part: id, pname, cn, grade, ...(typeof mass === 'object' ? mass : { mass: String(mass) }), exported, ...(scrap ? { scrap: String(scrap) } : {}), ...extra });

const fill = {
  _note: 'run36 1차 — 풍강 본사(화성) 가정. 공개 자료(주소·설비·2025 온실가스 총량) 외의 수치·품번·공급사는 모두 가상.',
  installation: {
    name: 'PUNGKANG Co., Ltd. Hwaseong Head Office Plant',
    local_name: '(주)풍강 본사(화성공장)',
    country: 'KR',
    street: '745 Namyangman-ro, Ujeong-eup',
    city: 'Hwaseong-si, Gyeonggi-do',
    latitude: '37.06',
    longitude: '126.80',
    economic_activity: 'Manufacture of automotive nuts and cold/hot forged steel parts',
    operator_name: 'PUNGKANG Co., Ltd.',
    operator_address: '745 Namyangman-ro, Ujeong-eup, Hwaseong-si, Gyeonggi-do, Republic of Korea',
    authorized_representative_name: 'Park Ji-ho (virtual)',
    email: 'cbam@example.invalid',
    telephone: '+82-31-000-0000',
    period_start: '2025-01-01',
    period_end: '2025-12-31',
    electricity_total_mwh: '9096.4',
    electricity_ef_source: '국가 전력망 평균',
    imported_heat: '아니오',
    waste_gases: '아니오',
    purchased_steel: '예',
    carbon_price_applicable: '아니오 (대상 아님)',
    carbon_price_note: '배출권거래제 할당대상 아님(법인 합계 약 6,700 tCO2e). 온실가스 인벤토리는 자발적으로 제3자 검증(2025년분).',
    declaration_name: 'Park Ji-ho (virtual)',
    declaration_position: 'ESG·품질경영팀장',
  },
  parts: [
    // CN 7318 16 92 — 너트, 안지름 12 mm 이하
    part('WN-1201', '휠 너트 M12×1.5', '73181692', 'SWCH35K', 2400, '예', 310, sector('0.9')),
    part('WN-1202', '휠 너트 M12 캡 타입(STS 캡 용접)', '73181692', 'SWCH35K', 1100, '예', 150),
    part('WN-1291', '휠 너트 M12 (내수)', '73181692', 'SWCH35K', 3000, '아니오', 390),
    part('WD-0601', '웰드 너트 M6', '73181692', 'SWCH10A', { qty: '180000000', unitWeight: '5.2' }, '예', 0, sector('0.45')),
    part('WD-0801', '웰드 너트 M8 (내수)', '73181692', 'SWCH10A', 1400, '아니오', 170),
    part('FN-1001', '플랜지 너트 M10', '73181692', 'SWCH35K', 1250, '예', 160),
    part('FN-1091', '플랜지 너트 M10 (내수)', '73181692', 'SWCH35K', 2100, '아니오', 270),
    part('HN-0801', '육각 너트 M8 (내수)', '73181692', 'SWCH10A', 650, '아니오', 80),
    part('RF-4002', '피어스 너트 M8 (기계식 접합)', '73181692', 'SWCH35K', 140, '예', 18),
    // CN 7318 16 60 — 풀림방지(셀프 로킹) 너트
    part('LN-1001', '락 너트 M10', '73181660', 'SWCH35K', 820, '예', 105, sector('0.9')),
    part('LN-1201', '락 너트 M12', '73181660', 'SWCH45K', 640, '예', 85, sector('0.85')),
    part('LN-1291', '락 너트 (내수)', '73181660', 'SWCH45K', 1300, '아니오', 170),
    // CN 7318 16 99 — 너트, 안지름 12 mm 초과
    part('WN-1401', '휠 너트 M14×1.5', '73181699', 'SWCH45K', 1500, '예', 200, sector('0.85')),
    part('WN-1491', '휠 너트 M14 (내수)', '73181699', 'SWCH45K', 1800, '아니오', 240),
    part('CN-1401', '코니컬 너트 M14', '73181699', 'SWCH45K', 420, '예', 55),
    part('CA-1601', '캐슬 너트 M16 (내수)', '73181699', 'SWCH45K', 260, '아니오', 40),
    part('HF-2201', '열간단조 휠 너트 M22 (상용차)', '73181699', 'S45C', 380, '예', 70, sector('0.9')),
    part('HF-2291', '열간단조 너트 M24~M32 (내수)', '73181699', 'S45C', 900, '아니오', 170),
    // 그 밖
    part('BU-3001', '부시 (냉간단조·가공)', '73269098', 'SCM435', 310, '예', 50, sector('1.9')),
    part('BU-3091', '부시 (내수)', '73269098', 'SCM435', 540, '아니오', 90),
    part('RF-4001', '클린치 스터드 M6 (기계식 접합)', '73181595', 'SWCH35K', 90, '예', 8, sector('0.9')),
    part('AL-5001', '알루미늄 배터리 케이스 체결 부품 (내수)', '76169990', 'A6061', 60, '아니오', 9),
  ],
  fuels: [
    { name: '도시가스 (탈유·세척 온수 보일러 + 사무동·식당, 계량기 1개)', kind: '도시가스 (Nm³)', amount: '100200', where: '공장 전체(공용)', evidence: '도시가스 고지서 2025년 12장 (계량기 1개)', use: '보일러·스팀·온수 (여러 공정이 나눠 씀)', heatSystem: '탈유·세척 온수 보일러', method: '도시가스사 정산용 계량기', quality: '사무동·식당 몫이 섞여 있음(별도 계량기 없음)' },
    { name: '지게차 경유', kind: '경유 (L)', amount: '18400', where: '공장 전체(공용)', evidence: '주유 전표 2025 합계', method: '주유 전표 합산' },
    { name: '비상발전기 경유', kind: '경유 (L)', amount: '600', where: '공장 전체(공용)', evidence: '비상발전기 시운전 일지·주유 전표', method: '주유 전표 합산' },
  ],
  boilerHeat: [
    { system: '탈유·세척 온수 보일러', process: '(공정 밖 — 사무동 난방 등)', basis: '간접 추정 (사유 필요)', note: '사무동·식당 몫 약 15%로 추정 — 별도 가스 계량기·열량계 없음' },
  ],
  precursors: [
    { name: 'SWCH35K CHQ 와이어 (가상 선재가공 A사)', cn: '72171050', consumed: '8200', purchased: '8350', country: 'South Korea', where: 'SWCH35K', hasValue: '있음 (공급사가 준 값)', direct: '2.08', indirect: '0.22', supplier: '가상 선재가공 A사 포항공장', verification: '공급사 확인', period: '2025-01-01 ~ 2025-12-31', evidence: 'A사 CBAM 데이터 시트(가상), 2026-08 회신', supplierOperator: '가상 선재가공 A사' },
    { name: 'SWCH35K CHQ 와이어 (가상 신선 B사)', cn: '72171050', consumed: '3050', country: 'South Korea', where: 'SWCH35K', hasValue: '없음 (EU 기본값 사용)', supplier: '가상 신선 B사 인천공장', evidence: '원자재 수불부 2025' },
    { name: 'SWCH35K 와이어 (중국산, 가상 무역상 D사 경유)', cn: '72171050', consumed: '1100', country: 'China', where: 'SWCH35K', hasValue: '없음 (EU 기본값 사용)', supplier: '가상 무역상 D사 경유 (제조공장 미확인)', evidence: '수입신고필증 2025' },
    { name: 'SWCH10A 와이어 (가상 신선 B사)', cn: '72171039', consumed: '3380', country: 'South Korea', where: 'SWCH10A', hasValue: '없음 (EU 기본값 사용)', supplier: '가상 신선 B사 인천공장', evidence: '원자재 수불부 2025' },
    { name: 'SWCH45K CHQ 와이어 (가상 선재가공 A사)', cn: '72171050', consumed: '6700', purchased: '6780', country: 'South Korea', where: 'SWCH45K', hasValue: '일부만 있음 (실측과 기본값이 섞인 값)', direct: '2.15', indirect: '0.3', supplier: '가상 선재가공 A사 포항공장', evidence: '직접은 A사 실측, 간접은 EU 기본값 — A사 회신 2026-08' },
    { name: 'S45C 봉강 (열간단조용, 가상 특수강 E사)', cn: '72149971', consumed: '1520', country: 'South Korea', where: 'S45C', hasValue: '없음 (EU 기본값 사용)', supplier: '가상 특수강 E사', evidence: '원자재 수불부 2025' },
    { name: 'SCM435 와이어 (부시용, 가상 선재가공 A사)', cn: '72299090', consumed: '990', country: 'South Korea', where: 'SCM435', hasValue: '없음 (EU 기본값 사용)', supplier: '가상 선재가공 A사 포항공장', evidence: '원자재 수불부 2025' },
    { name: 'STS430 스트립 (휠 너트 캡용)', cn: '7220', consumed: '46', country: 'South Korea', where: 'SWCH35K', hasValue: '없음 (EU 기본값 사용)', supplier: '가상 STS 코일센터 F사', evidence: '원자재 수불부 2025 — 캡 타입 휠 너트(WN-1202)에만 씀' },
  ],
  rnr: [
    { data: '생산량 (품번별)', collector: '생산관리팀', transposer: 'ESG·품질경영팀 박OO', approver: 'ESG·품질경영팀장', system: 'ERP 생산실적' },
    { data: '도시가스·전력·경유 사용량', collector: '총무팀', transposer: 'ESG·품질경영팀 박OO', approver: 'ESG·품질경영팀장', system: '고지서 철 + 온실가스 인벤토리 집계표' },
    { data: '구매 강재 투입량', collector: '자재팀', transposer: 'ESG·품질경영팀 박OO', approver: 'ESG·품질경영팀장', system: 'ERP 원자재 수불부' },
  ],
  evidence: [
    { item: '한전 고지서 2025년 12장', proves: '1_사업장의 공장 전체 전력', custodian: '총무팀 문서고', status: '확보' },
    { item: '도시가스 고지서 2025년 12장', proves: '4_연료의 도시가스 사용량', custodian: '총무팀 문서고', status: '확보' },
    { item: 'ERP 생산실적 (품번별 중량)', proves: '2b_품번목록의 생산량', custodian: '생산관리팀', status: '확보' },
    { item: '2025년 온실가스 인벤토리 검증의견서', proves: '연료·전력 합계의 교차 확인 (본사 Scope 1 299 · Scope 2 4,179 tCO2e)', custodian: 'ESG·품질경영팀', status: '확보 (홈페이지 공개)' },
    { item: '공급사 CBAM 데이터 시트 (A사)', proves: '5_구매강재의 공급사 값', custodian: '자재팀', status: 'B·E·F사는 요청 중' },
  ],
};
writeFileSync(path.join(dir, 'fill-pass1.json'), JSON.stringify(fill, null, 2));
console.log('fill-pass1.json — 품번', fill.parts.length, '· 연료', fill.fuels.length, '· 구매 강재', fill.precursors.length);
