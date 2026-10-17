// run42 — 전형 가상 업체: 인천의 직원 20명급 냉간압조 체결부품 공장(너트·볼트). 실제 업체가 아니다 — 업종의 전형이다.
// 이 업종의 특징(시험하려는 것): 냉간압조·전조·탭핑은 직접 하지만 열처리(QT)·도금·코팅은 외주에 맡긴다 → 자체 연료가 거의 없고 외주 몫이 SEE의 핵심이다.
//   node cbamy/runs/2026-10-17_run42-small-coldforging/make-fill.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ASK = '모름 — 공급사 문의 중';
const sector = (alloy) => ({ alloy_mn_cr_ni: alloy, reducing_agent: ASK, scrap_per_t: '0', preconsumer_scrap_pct: '0' });
const part = (id, pname, cn, grade, mass, exported, scrap, extra = {}) => ({ part: id, pname, cn, grade, mass: String(mass), exported, scrap: String(scrap), ...extra });

const parts = [
  part('HN-1001', '육각 너트 M10', '73181692', 'SWCH10A', 480, '예', 60, sector('0.4')),
  part('HN-1601', '육각 너트 M16', '73181699', 'SWCH10A', 520, '예', 65),
  part('FN-1001', '플랜지 너트 M10 (자동차)', '73181692', 'SWCH10A', 380, '예', 45),
  part('LN-0801', '락 너트 M8', '73181660', 'SWCH10A', 150, '예', 18),
  part('WB-1401', '휠 볼트 M14 (10.9)', '73181588', 'SCM435', 260, '예', 30, sector('1.1')),
  part('FB-1001', '플랜지 볼트 M10 (10.9, 내수)', '73181588', 'SCM435', 310, '아니오', 36),
  part('HB-0801', '육각 볼트 M8 (4.8)', '73181582', 'SWCH18A', 210, '예', 25),
  part('SS-0601', 'STS 너트 M6', '73181639', 'STS304', 40, '예', 5, sector('9.5')),
];
const input = {};
for (const p of parts) input[p.grade] = (input[p.grade] ?? 0) + Number(p.mass) + Number(p.scrap);
const line = (name, cn, grade, share, country, supplier, extra = {}) => {
  const consumed = Math.round(input[grade] * share);
  return { name, cn, consumed: String(consumed), purchased: String(Math.round(consumed * 1.012)), country, where: grade, hasValue: '없음 (EU 기본값 사용)', supplier, evidence: '매입 원장 2025', ...extra };
};

const fill = {
  _note: 'run42 — 전형 가상 업체(인천 소형 냉간압조 공장). 모든 수치는 가상. 열처리·도금·코팅은 외주.',
  installation: {
    name: 'Typical Cold Heading Fasteners Co., Ltd. Incheon Plant (virtual)',
    local_name: '전형 냉간압조 체결부품 인천공장(가상)',
    country: 'KR',
    street: '00 Namdong-daero (virtual)',
    city: 'Incheon',
    postcode: '21500',
    unlocode: 'KRINC',
    latitude: '37.40',
    longitude: '126.70',
    economic_activity: 'Cold heading of nuts and bolts',
    operator_name: 'Typical Cold Heading Fasteners Co., Ltd. (virtual)',
    operator_reg_number: '000-00-00000',
    operator_address: '00 Namdong-daero, Incheon, Republic of Korea (virtual)',
    authorized_representative_name: 'Jung Min-ho (virtual)',
    email: 'cbam@example.invalid',
    telephone: '+82-32-000-0000',
    period_start: '2025-01-01',
    period_end: '2025-12-31',
    electricity_total_mwh: '1350',
    electricity_ef: '0.475',
    electricity_ef_source: '국가 전력망 평균',
    electricity_ef_publisher: 'European Commission',
    electricity_ef_document: 'Implementing Regulation (EU) 2025/2621 Annex II',
    electricity_ef_vintage: '2025',
    imported_heat: '아니오',
    waste_gases: '아니오',
    purchased_steel: '예',
    carbon_price_applicable: '아니오 (대상 아님)',
    declaration_name: 'Jung Min-ho (virtual)',
    declaration_position: '대표',
  },
  parts,
  fuels: [
    { name: '지게차 경유', kind: '경유 (L)', amount: '18000', where: '공장 전체(공용)', evidence: '주유 전표 2025', method: '주유 전표 합산' },
  ],
  precursors: [
    line('SWCH10A CHQ 와이어 (가상 신선 제조사 A사)', '72171039', 'SWCH10A', 0.85, 'South Korea', '가상 신선 제조사 A사'),
    line('SWCH10A CHQ 와이어 (가상 신선 제조사 B사)', '72171039', 'SWCH10A', 0.15, 'South Korea', '가상 신선 제조사 B사'),
    line('SCM435 CHQ 와이어 (가상 일본 무역상 T사 경유)', '72299090', 'SCM435', 1, 'Japan', '가상 일본 무역상 T사 (제조 공장 미확인)'),
    line('SWCH18A 와이어 (가상 신선 제조사 A사)', '72171039', 'SWCH18A', 1, 'South Korea', '가상 신선 제조사 A사'),
    line('STS304 와이어 (가상 대만 신선사)', '72230019', 'STS304', 1, 'Taiwan', '가상 대만 신선사'),
  ],
  rnr: [{ data: '생산량 (품번별)', collector: '생산팀', transposer: '대표', approver: '대표', system: '엑셀 집계표' }],
  evidence: [{ item: '주유 전표 2025', proves: '지게차 경유', custodian: '총무', status: '확보' }, { item: '한전 전기요금 고지서 2025', proves: '공장 전체 전력', custodian: '총무', status: '확보' }],
  // 외주 공정: 열처리(QT)·코팅·도금은 외주. 서식 13번 시트.
  outsourced: [
    // ── 연료 줄(run42과 같은 방법) ──
    { subcontractor: '가상 열처리 G사', technique: '열처리·소둔', energy: '연료', where: 'SCM435 공정', fuelKind: '도시가스 (Nm³)', basis: '같은 설비의 처리 중량 비율', lineQuantity: '310000', ourThroughput: '566', lineThroughput: '4100', note: '연속 소입로 설비 계량기 값', evidence: '외주처 설비별 계량 기록 2025' },
    { subcontractor: '가상 코팅 H사', technique: '아연 플레이크 코팅(다크로·지오메트 등, 비전해)', energy: '연료', where: 'SWCH10A 공정', fuelKind: '도시가스 (Nm³)', basis: '설비 소비율 × 가동시간으로 재구성 (고지서 총량에 맞춤)', companyTotal: '90000', ourEquipment: '지오메트라인:500:40', otherEquipment: '타사 코팅라인:1200:40; 건조로:2000:10', note: '설비 사양서의 정격 소비율', evidence: '외주처 가스 고지서 2025' },
    { subcontractor: '가상 열처리 J사', technique: '열처리·소둔', where: 'SWCH18A 공정', fuelKind: '도시가스 (Nm³)', basis: '보수적 추정', estimate: '4000', note: '정격 120 kW × 800 h × 부하율 60% ÷ 14 kWh/Nm³ 환산', evidence: '' },
    // ── 전기 줄(새 기능) ──
    // G사 전기: 연속 소입로 전기 계량값을 처리 중량 비율로 → 420 × 566 ÷ 4,100 = 57.98 MWh
    { subcontractor: '가상 열처리 G사', technique: '열처리·소둔', energy: '전기', where: 'SCM435 공정', basis: '같은 설비의 처리 중량 비율', lineQuantity: '420', ourThroughput: '566', lineThroughput: '4100', sameGrid: '예', note: '연속 소입로 전력 계량기 값', evidence: '외주처 전력 계량 기록 2025' },
    // H사 전기: 총량 260 MWh, 설비 재구성(kW) — 재구성 합계가 총량과 20% 넘게 어긋나게 일부러 잡았다. 분류 근거는 아직 못 받음
    { subcontractor: '가상 코팅 H사', technique: '아연 플레이크 코팅(다크로·지오메트 등, 비전해)', energy: '전기', where: 'SWCH10A 공정', basis: '설비 소비율 × 가동시간으로 재구성 (고지서 총량에 맞춤)', companyTotal: '260', ourEquipment: '지오메트라인:500:30', otherEquipment: '타사 코팅라인:1200:30; 건조로:2000:15', sameGrid: '예', note: '설비 명판 정격 kW', evidence: '외주처 한전 고지서 2025' },
    // I사: 전기도금 전기 — 경계 밖이라 넣지 않는다(오류가 아니라 참고)
    { subcontractor: '가상 도금 I사', technique: '전기도금', energy: '전기', where: 'SWCH10A 공정', basis: '같은 설비의 처리 중량 비율', lineQuantity: '300', ourThroughput: '80', lineThroughput: '400', sameGrid: '예', note: '전기아연도금 정류기', evidence: '고지서' },
    // K사: 해외 외주처 — 계수가 달라 받지 않는다
    { subcontractor: '가상 베트남 열처리 K사', technique: '열처리·소둔', energy: '전기', where: 'SCM435 공정', basis: '보수적 추정', estimate: '30', sameGrid: '아니오', note: '정격×시간', evidence: '' },
    // L사: 같은 나라 확인을 비웠다 — 넣지 않는다
    { subcontractor: '가상 코팅 L사', technique: '용융아연도금', energy: '전기', where: 'SWCH10A 공정', basis: '보수적 추정', estimate: '20', note: '정격×시간', evidence: '' },
    // M사: 전기만(연료 줄 없음) — 보수적 추정, 증빙 없음 → 확인 필요 + 외주처에게 받을 것
    { subcontractor: '가상 아연도금 M사', technique: '용융아연도금', energy: '전기', where: 'SWCH18A 공정', basis: '보수적 추정', estimate: '25', sameGrid: '예', note: '펌프·크레인 정격 55 kW × 600 h × 부하율 75%', evidence: '' },
  ],
};
writeFileSync(path.join(dir, 'fill-small2.json'), JSON.stringify(fill, null, 2));
console.log('fill-small2.json —', parts.length, 'parts,', fill.precursors.length, 'precursor lines,', fill.outsourced.length, 'outsourced rows');
