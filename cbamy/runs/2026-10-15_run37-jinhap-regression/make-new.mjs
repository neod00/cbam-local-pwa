// run37 — 진합형 재시험의 「현실판」 채움값. run35의 1차 파일(결함을 일부러 담은 것)에서 출발해, 이번에 시험할 장면을 더한다.
// 모든 수치·품번·공급사는 가상이다(진합의 실제 자료가 아님). 공개 사이트의 제품군만 참고: 엔진·섀시 볼트, 탭타이트 스크류, STS 볼트, 블라인드 리벳 너트,
// 샤프트, 알루미늄·플라스틱 체결품. 도금은 관계사(별도 법인·별도 주소)가 한다.
//   node cbamy/runs/2026-10-15_run37-jinhap-regression/make-new.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const clone = (value) => JSON.parse(JSON.stringify(value));
const base = JSON.parse(readFileSync(path.join(dir, 'fill-reg1.json'), 'utf8'));

// ── 1차(안내만 보고 채운 그대로) — 이번에 시험하는 장면 ──
const fill = clone(base);
fill._note = 'run37 1차 — run35 1차 파일에 이번 시험 장면을 더한 현실판(가상 수치). 안내만 보고 채웠다.';
const inst = fill.installation;
inst.electricity_total_mwh = '21500';                // run35의 kWh 실수는 회귀 시험(fill-reg1)에서 이미 봤다 — 여기서는 바르게 적는다
inst.electricity_ef_source = '국가 전력망 평균';
fill.fuels = fill.fuels.filter((fuel) => !fuel.name.includes('포장동'));   // 마무리동 난방은 경계 밖 — 서식 안내대로 뺀다

// 장면 1) 같은 CN(73181582)이 두 강종, 다른 CN(73181588)은 한 강종만 → 재질 구성이 다른 CN이 한 재질로 이어진다(합침/나눔 카드)
fill.parts.push({ part: 'HB-2201', pname: '고강도 볼트 M12 (10.9)', cn: '73181588', grade: 'SCM435', mass: '1500', exported: '예', scrap: '20' });
fill.parts.push({ part: 'HB-2301', pname: '고강도 볼트 (내수)', cn: '73181588', grade: 'SCM435', mass: '800', exported: '아니오', scrap: '10' });
// 장면 2) 철강이 아닌 CBAM 품목(알루미늄 캡)과 CBAM 목록에 없는 플라스틱 체결품 — 같은 설비의 연료·전력을 나눠 가진다
fill.parts.push({ part: 'AL-8001', pname: '알루미늄 캡(엔진용)', cn: '76169990', grade: 'A6061', mass: '120', exported: '아니오' });
fill.parts.push({ part: 'PL-9001', pname: '플라스틱 클립', cn: '39269097', grade: 'PA66', mass: '40', exported: '아니오' });
// 장면 3) 보일러 열: 사무동 몫을 모르니 「공정 밖」 줄의 양을 비운다(안내: 「모르면 비우세요」)
fill.boilerHeat = [{ system: '세척기 온수 보일러 도시가스', process: '(공정 밖 — 사무동 난방 등)', note: '사무동 몫 모름' }];
// 장면 4) 구매 강재: SCM435 와이어는 새 품번만큼 늘고, STS 와이어는 CN을 4자리만 안다
for (const precursor of fill.precursors) {
  if (precursor.name.startsWith('SCM435')) { precursor.consumed = '6100'; precursor.purchased = '6180'; }
  if (precursor.name.startsWith('STS304')) precursor.cn = '7223';
}
writeFileSync(path.join(dir, 'fill-new1.json'), JSON.stringify(fill, null, 2));
console.log('fill-new1.json — 품번', fill.parts.length, '· 연료', fill.fuels.length, '· 구매 강재', fill.precursors.length);

// ── 2차(「확인할 것」을 보고 고침) — 고친 파일을 같은 프로젝트에 다시 올려 「바꿔 넣기」를 시험한다 ──
const second = clone(fill);
second._note = 'run37 2차 — 1차의 「확인할 것」을 보고 고침: STS 와이어 CN을 8자리로, 사무동 몫을 추정해 적음.';
for (const precursor of second.precursors) if (precursor.name.startsWith('STS304')) precursor.cn = '72230019';
second.boilerHeat = [{ system: '세척기 온수 보일러 도시가스', process: '(공정 밖 — 사무동 난방 등)', quantity: '60', unit: 'Gcal', basis: '간접 추정 (사유 필요)', note: '사무동·식당 몫을 연면적 비율로 추정(별도 열량계 없음)' }];
second.installation.operator_reg_number = '000-00-00000';
writeFileSync(path.join(dir, 'fill-new2.json'), JSON.stringify(second, null, 2));
console.log('fill-new2.json');
