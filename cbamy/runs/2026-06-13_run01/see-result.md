# SEE 산정 결과 — 동성특수강 EAF 스테인리스 (P1 슬래브 / P2 시트·봉강)
**산정일**: 2026-06-13 | **Run ID**: 2026-06-13_run01 (탐색 모드 / exploratory) | **담당**: 씨밤이 (CBAMY)
**도구**: CBAM_Platform (products → processes → source-streams → precursors → periods → results → export)
**기준 체계**: 2026 확정기간(definitive period) — 전환기간(transitional) 자료와 혼용하지 않음

---

## 1. 기본 정보

| 항목 | 내용 |
|------|------|
| **제품 (goods)** | 304계 스테인리스: ① P1 반제품 슬래브, ② P2 열연/냉연 평판재(시트) 및 봉강(long products) |
| **CN 코드** | P1 72189911 / P2 시트 72191310 / P2 봉강 72210010 (Annex II 여부: 철강 = Annex II direct-only ✔, CN-제품설명 일치 검토 필요) |
| **기능단위 / 산정 기준** | 제품 1톤 (t goods) · SEE 단위 tCO₂e/t (전력은 tCO₂e/MWh) |
| **시스템 경계** | EU ETS 포괄 범위 = cradle-to-gate 부분집합 (상류 채굴·사이트 간 운송·사용·폐기 제외) |
| **생산공정 / 생산경로 (production route)** | P1: 전기로 제강 + 연속주조 (EAF incl. continuous casting) / P2: 압연 및 정정 (rolling & finishing) — scrap-EAF route |
| **보고 기간 (reporting period)** | 2025년 1~12월 (확정기간 첫 보고분, 12개월) |
| **데이터 모드** | 혼합(SAD) — 자체 EAF·전구물질 PP1~PP3는 actual(AD), PP4 FeMn(중국)은 공급사 미회신 → default(DV) 검토 |
| **법적 근거** | Reg (EU) 2023/956 + Impl. Reg 2025/2547·2620·2621·2548 |
| **설비 (installation)** | 단일 installation으로 보고 (경북 포항 제강·연주 + 경남 창원 압연·정정) |
| **의뢰사 / 신고자(declarant)** | 동성특수강(주) (가상 한국사, EU 'EAF alloys' 공식 예제 기반) — 산출물은 EU 수입자(declarant)에게 전달되는 공급자 SEE 자료 |

> 참고: SEE(Specific Embedded Emissions, 비내재배출량)는 CFP와 달리 EU ETS 포괄 범위로 한정됩니다. 상류·사용·폐기 단계는 경계 밖이므로 CFP보다 좁습니다(Guidance §6.1.3 — system boundaries narrower than a CFP).

---

## 2. SEE 산정 결과

> 본 산정은 앱 계산엔진(calculation-engine.ts)을 실제 입력으로 직접 실행(engine-crosscheck.mjs)하여 얻은 값입니다. 추측값이 아니며, EU 공식 예제 워크북 정답과 대조했습니다.

### 2-1. 최종 SEE (분해)

#### P1 — 스테인리스 슬래브 (CN 72189911, EAF 제강+연주, output 2,234,000 t)

| 구성 | SEE (tCO₂e/t) | 비율 | 데이터 출처 |
|------|---------------|------|-------------|
| 직접 (`see_direct`) | 0.07655 | 3.2% | EAF source streams (연소·물질수지·공정) |
| 자체 간접 (`see_own_indirect`) | 0.58310 | 24.5% | 전력 1,563,800 MWh × EF 0.833 ÷ 2,234,000 t (= 0.7 MWh/t × 0.833 검증) |
| 전구물질 기여 (`see_precursor_contribution`, d+i 합산) | 1.72034 | 72.3% | PP1~PP4 매입 SEE (탄소강괴/FeNi/FeCr/FeMn, direct+indirect 합산) |
| **CBAM 기준 SEE (`see_cbam_basis`)** | **1.79689** | — | 인증서 산정 기준 ⚠️ 과대계상 (§5 한계 참조) |
| 참고용 총 SEE (`see_informational_total`) | 2.37999 | — | 운영/검토용 — **EU 공식 정답 2.37991 과 ✅ 일치** |

#### P2 — 스테인리스 시트 (CN 72191310, 압연+정정, output 1,133,000 t) / 봉강(72210010)은 동일 공정 산출

| 구성 | SEE (tCO₂e/t) | 비율 | 데이터 출처 |
|------|---------------|------|-------------|
| 직접 (`see_direct`) | 0.35503 | 11.2% | 압연·정정 source streams |
| 자체 간접 (`see_own_indirect`) | 0.23872 | 7.5% | 전력 324,700 MWh × EF 0.833 ÷ 1,133,000 t |
| 전구물질 기여 (`see_precursor_contribution`, d+i 합산) | 2.57736 | 81.3% | 사내 P1 조강(1,227,000 t) 전가 + 매입 precursor 전가 |
| **CBAM 기준 SEE (`see_cbam_basis`)** | **2.93239** | — | 인증서 산정 기준 ⚠️ 과대계상 (§5 한계 참조) |
| 참고용 총 SEE (`see_informational_total`) | 3.17111 | — | 운영/검토용 — **EU 공식 정답 3.17109 와 ✅ 일치** |

> 봉강(CN 72210010)은 시트와 동일한 P2 공정에서 산출되므로 동일 공정 SEE를 공유합니다. 단, 시트/봉강 제품별 생산량 분할이 미정리(§4.3 시나리오) — 제품라인 분할 정리 전까지는 공정 단위 SEE를 공유 적용하며, **분할 정리 후 CN별 재배분 필요(확인 필요)**.

**기준 SEE 산식 적용**
- 비Annex II: `see_cbam_basis = see_direct + see_own_indirect + eligible_precursor`
- Annex II direct-only: `see_cbam_basis = see_direct + eligible_precursor` (own_indirect는 보고·공급사검토용으로 보존, 인증서 기준에서 제외)
- 적용 규칙: 철강(CN 72) = Annex II direct-only → 앱이 **최종재 자체 전력 간접(own_indirect)은 인증서 기준에서 정상 제외**(calculation-engine.ts:298-301). 그러나 **전구물질의 indirect 분까지는 인증서 기준에 그대로 포함되어 과대계상 발생** (아래 ⚠️ 한계 참조).

> ⚠️ `see_cbam_basis`(인증서 기준)와 `see_informational_total`(참고용 총합)은 **별개 개념**입니다. 워크북 `Summary_Products!K`(total SEE)는 모든 전구물질 매핑 시 `see_informational_total`에 가장 근접하며(P1 2.37999 ≈ EU 2.37991, P2 3.17111 ≈ EU 3.17109), `see_cbam_basis`와 동일시하지 않습니다.

**⚠️⚠️ 핵심 한계 — see_cbam_basis 과대계상 (확인 필요, IR 원문 대조 권고)**

철강은 Annex II direct-only 품목이므로 인증서 기준 SEE에는 **direct 만** 들어가야 합니다(자체 direct + 전구물질 direct). 앱은 최종재 자체 전력 간접은 제외하나, **전구물질의 indirect까지 인증서 기준에 포함**시켜 다음과 같이 과대계상됩니다:

| 제품 | 앱 see_cbam_basis | 규정상 declarant 인증서 기준 = EU SEE(direct) | 과대계상 |
|------|-------------------|-----------------------------------------------|----------|
| P1 | 1.79689 | **1.00149** | **+79.4%** |
| P2 | 2.93239 | **1.43961** | **+103.7%** |

- declarant 인증서 기준으로는 **EU SEE(direct)** (P1 1.00149 / P2 1.43961)를 사용해야 합니다 — **확인 필요**(IR (EU) 2025 확정기간 원문 대조 권고).
- 참고: EU SEE(indirect)는 P1 1.37842 / P2 1.73148 (보고·검토용 별도 축).
- 근거: 앱은 declarant용 SEE(direct)/SEE(indirect) 분해(전구물질 포함)를 직접 산출하지 않고, precursor를 direct+indirect 합산 단일 버킷(`precursor_see`)으로만 보유(calculation-engine.ts:157-159 `precursor_see += p.see * p.share`). EU Communication Template은 제품 SEE를 SEE(direct, 전구물질 포함)·SEE(indirect, 전구물질 포함) 두 축으로 보고하므로, declarant는 현재 이 분해를 **수기 역산**해야 합니다.

불확실성/검토 범위: ① LNG 단위 t/Nm³ 미확정(최대 2배 직접배출 오차) ② 전력 EF 위계(클라이언트 0.4594 vs EU 예제 Mix 0.833) ③ FeMn default+markup 적용 여부 ④ K-ETS 탄소가격 증빙 미입수(현재 0 가정) ⑤ CN-제품설명 일치 ⑥ 시트/봉강 생산량 분할 미정리. 상세는 §5·§6.

> 이번 run은 회귀(regression) 비교 기준선(baseline) run01 — 직전 run 없음. informational_total 두 값 모두 EU 공식 정답과 ✅ 일치(P1 Δ +0.00008, P2 Δ +0.00002, 반올림 수준).

---

### 2-2. 상세 계산 내역

#### 직접배출 (Direct — source streams)

활동데이터 × EF × oxidation/conversion factor. 연소 source stream은 NCV 적용.

| Source stream | 유형 (연소/공정/물질수지) | 활동량 | 단위 | NCV | EF | EF 단위 | 비고 |
|---------------|---------------------------|--------|------|-----|----|---------|------|
| 천연가스(LNG) | 연소 | 164,000 | t **또는 Nm³?** | 48 GJ/t | 56.1 | tCO₂/TJ | ⚠️ **단위·NCV 분모 정합성 미확인 (2배 오차 위험)** |
| 스테인리스 고철 | 물질수지 | 1,345,000 | t | — | C 0.0008 tC/t | — | tC→tCO₂(×44/12) 환산 수기 필요 |
| 흑연전극 | 물질수지 | 4,470 | t | — | C 0.819 tC/t | — | |
| 부원료(석회석 등) | 공정배출 | 89,000 | t | — | 0.45 | tCO₂/t | 가소 여부 불명확 |
| 매입 탄소강 강괴(투입분) | 물질수지 | 80,500 | t | — | C 0.0015 tC/t | — | |
| (산출 측 차감) 조강 | 물질수지 | 산출량 차감 | t | — | C 0.0018 tC/t | — | ⚠️ **앱이 음수 활동량 차단 → 산출측 차감 입력 불가** |
| (산출 측 차감) 슬래그 | 물질수지 | 발생량 차감 | t | — | C 0.0003 tC/t | — | ⚠️ 동일 한계 |
| **P1 공정 직접배출 → 직접 SEE** | | | | | | | **0.07655 tCO₂e/t** |
| **P2 공정 직접배출 → 직접 SEE** | | | | | | | **0.35503 tCO₂e/t** |

- 직접 SEE = 공정 직접배출 총량 ÷ 생산량(output_mass_t): P1 = 0.07655 / P2 = 0.35503 (engine 산출, EU informational_total과의 일치로 간접 검증됨)
- ⚠️ source stream 합계와 공정 직접배출 입력값 불일치 시 추적성 경고 발생: 앱의 source stream 합계는 직접배출량(`direct_attributable_emissions_tco2e`)을 **자동 갱신하지 않고** '델타 불일치 경고'에만 사용(processes:679-724) → 컨설턴트가 직접 수기 동기화 필요. "배출원 합계를 직접배출량에 적용" 버튼으로 반영 가능.
- ⚠️ 물질수지 '산출측 차감(조강·슬래그 C함량)'은 음수 활동량(`Math.max(activity_data,0)`)으로 차단되어 입력 불가, tC→tCO₂(×44/12) 자동환산도 없음. **본 산정에서는 산출측 차감을 수기 반영한 순(net) 직접배출량을 공정 직접배출량 칸에 직접 입력했습니다 — 확인 필요.**
- 확정기간 정밀 산식(2025/2547)과의 정합: 확인 필요.

#### 간접배출 (Indirect — 소비전력)

`AttrEm_indir = E_el × EF_el`, `SEE_indirect = (E_el × EF_el) / 생산량`

| 항목 | P1 값 | P2 값 | 단위 | 비고 |
|------|-------|-------|------|------|
| 소비전력 E_el | 1,563,800 | 324,700 | MWh | |
| 전력 EF (EF_el) | 0.833 | 0.833 | tCO₂/MWh | EU 예제 'Mix' 채택 (§5 가정 참조) |
| EF 출처 | EU 예제 Mix | EU 예제 Mix | | ⚠️ 클라이언트 가정 "한전 0.4594"과 상이 — 위계 검토 필요 |
| 자체 간접 SEE | **0.58310** | **0.23872** | tCO₂e/t | (P1: 0.7 MWh/t × 0.833 = 0.5831 검증) |

- EF_el actual 허용 조건: ① 발전원-설비 간 직접 기술적 연결, 또는 ② PPA 체결분 (Annex IV §6). Guarantees of Origin·녹색인증서 등 market-based instrument 사용 금지.
- ⚠️ 앱의 전력 EF는 순수 number 단일 필드로, CBAM 전력 EF 위계(actual 계약 → residual mix → 국가 grid mix)를 구분하는 출처유형(enum)·정당성 근거 입력 칸이 없음(local-db.ts:63). 0.4594를 입력해도 경고 없음 — 추적성 약함(확인 필요).
- Annex II direct-only 적용 시 자체 간접은 `see_cbam_basis`에서 제외(보고용 보존): 앱이 정상 적용(자체 간접만 제외, 전구물질 indirect는 미제외 — §5 한계).
- 철강 예외: 응결 철광석·정광 CN 2601 12 00은 간접배출 포함. ⚠️ 현 코드의 CN 72/73 접두 제외 규칙은 임시이며 CN master(Annex II 실제목록) 기반 분류로 교체 필요.

#### 전구물질 (Precursors — complex good)

`precursor_emissions = Σ(소비량 × (precursor.direct_see + precursor.indirect_see))`, `precursor_see = precursor_emissions / output`

| 전구물질 | CN | 원산지 | 매입량 (t) | direct SEE | indirect (elec) | actual/default | 비고 |
|----------|-----|--------|------------|------------|-----------------|----------------|------|
| PP1 탄소강 강괴 (BOF) | — | 인도네시아 | 80,500 | 1.48 | 0.245 MWh/t | actual | 공급사 measured 자료 있음 |
| PP2 페로니켈 FeNi (Ni 28%) | — | 일본 | 347,000 | 3.0 | 3.001 MWh/t | actual | direct·indirect 명확 분리 입수 |
| PP3 페로크롬 FeCr (Cr 52%) | — | 인도 | 331,000 | 2.5 | 2.821 MWh/t | actual | 공급사 measured 자료 있음 |
| PP4 페로망간 FeMn (Mn 31%) | — | 중국 | 60,600 | default | default | **default(미회신)** | ⚠️ markup 적용 여부 확인 필요 |
| 사내 P1 조강(P2용 전가) | 72189911 | 사내 | 1,227,000 | (P1 전가) | (P1 전가) | actual | P2 precursor_see에 합산 |
| **P1 전구물질 기여 합계** | | | | | | | **1.72034 tCO₂e/t** |
| **P2 전구물질 기여 합계** | | | | | | | **2.57736 tCO₂e/t** |

- 전구물질 내재배출은 direct + indirect **모두** 가산. 전구물질이 또 complex good이면 재귀 반복(P2는 사내 P1 조강을 precursor로 받아 전가).
- ⚠️ MWh/t로 제공된 indirect는 전력 EF를 곱해 indirect SEE(tCO₂e/t)로 환산해야 하나, 앱은 indirect SEE를 tCO₂e/t로만 받고 **MWh/t→tCO₂e/t 환산 도우미가 없음**(precursors:652-654) — 초보가 MWh/t 값을 그대로 넣을 위험. 본 산정은 EU 예제 전력 EF로 사전 환산해 입력.
- Annex II 최종재라도 비Annex II 전구물질에 내재된 간접배출은 흘러들어갈 수 있음 — 그러나 declarant 인증서 기준에선 전구물질 **direct 만** 반영하는 것이 원칙이므로, 현 앱이 전구물질 indirect를 인증서 기준에 포함시키는 점이 과대계상 원인(§2-1 ⚠️, 확인 필요).
- ⚠️ "전구물질 소비량이 공정 생산량보다 큽니다" 경고가 정상 수율(사내 조강 1.227M > 제품 1.133M, yield<100%)에도 오발생 → 불필요한 혼란/추적성 저하(앱 결함).
- ⚠️ SAD(semi-actual)가 DV보다 불리할 수 있음 — 전구물질 default는 markup 포함이라 총합을 지배할 수 있음. §6 민감도에서 시나리오 비교.

#### Default values 사용 시 (actual 미입수분 — PP4 FeMn)

| CN 코드 | 국가 | 보고연도 | direct DV | indirect DV | total DV | markup 포함값(2026) | 출처 워크북·버전 |
|---------|------|----------|-----------|-------------|----------|---------------------|-------------------|
| (FeMn) | 중국 | 2026 | 확인 필요 | 확인 필요 | 확인 필요 | 확인 필요 | DVs as adopted_v20260204 (2025/2621) |

- 우선순위: **actual > default**. DV는 actual 미입수 시 대체값(보수적 설정).
- ⚠️ 앱 "기본값" 라벨이 실제로는 markup 적용값을 반환할 수 있음(`getDefaultValueTotalForYear`가 `markup_2026 ?? total_default`) — default와 markup이 별도 컬럼·툴팁 없이 "기본값"에 흡수됨. **순수 default vs markup 포함값을 분리 보존 권고, 정확한 markup % 및 전구물질 default 적용 규칙은 2025/2621 원문 확인 필요.**
- DV 수치는 임의 생성 금지 — `cbamy/data/cbam-defaults.json` 및 사용자가 업로드한 공식 워크북 참조. 본 run의 P1/P2 일치값은 PP4를 actual 가정한 경우의 정답이며, FeMn default 채택 시 §6 민감도대로 값이 변동됨.

---

## 3. 런 간 SEE 비교 (회귀 모드 시)

> 이번 run01은 기준선(baseline) — 직전 run 없음. 향후 회귀 시 아래 표로 비교.

| 구성 | 이전 run(들) | 이번 run (P1 / P2) | 변동 |
|------|--------------|--------------------|------|
| see_direct | — | 0.07655 / 0.35503 | baseline |
| see_own_indirect | — | 0.58310 / 0.23872 | baseline |
| see_precursor_contribution | — | 1.72034 / 2.57736 | baseline |
| **see_cbam_basis** | — | 1.79689 / 2.93239 | baseline |
| see_informational_total | — | 2.37999 / 3.17111 | baseline (EU 정답 일치 ✅) |

---

## 4. 귀속(Attribution) · 배분(Allocation) 결정

| 공유 항목 / source stream | 결정 (방법) | 근거 |
|---------------------------|-------------|------|
| P1 조강 → 시장 출하분(1,007,000 t) vs P2 이송분(1,227,000 t) | mass-ratio (생산량 비례) | Guidance §6.1.3 / 2025/2547 |
| P2 → 시트 vs 봉강 분할 | **미정리(pending)** — 분할 정리 후 manual/mass-ratio 결정 필요 | 시나리오 §4.3, 환경팀 확인 중 |

- 자동 질량 배분: `share = line.output_mass / Σ output_mass`. 수동: `share = manual_percent / Σ manual_percent`.
- 한 공정 내 배분기준 혼용 금지(경고), 라인 합계 ≠ 공정 총생산량 시 허용오차(1%) 검증.
- ⚠️ molar-ratio 배분 미구현(백로그). 제품라인 배분 결과는 워크북 SEE 셀에 직접 쓰지 않고 readiness 경고로 처리.

⚠️ 재검토 필요 사항: 시트/봉강 생산량 분할 미정리 상태에서 제품라인을 만들지 않으면 export가 공정 단위로 fallback해 CN별(72191310/72210010) 분리 SEE 없이 한 줄로 나갈 수 있음. 앱은 "라인 합계 ≠ 공정 총생산량"을 hard error가 아닌 soft warning으로만 처리(저장·export 차단 안 함) → 분할 정리 후 CN별 라인 생성·검증 권고(확인 필요).

---

## 5. 핵심 가정 및 한계점

1. **전력 EF = EU 예제 'Mix' 0.833 tCO₂e/MWh 채택.** 클라이언트 가정값 "한전 0.4594"는 CBAM 전력 EF 위계 적정성이 미확인되어 채택하지 않음. EU 'EAF alloys' 예제 워크북이 Mix 0.833을 사용하며, 본 검증의 informational_total이 EU 정답과 일치하는 것은 이 EF 전제 하에서임. actual(계약 기반)·residual mix·국가 grid mix 중 어느 위계가 동성특수강에 적용 가능한지 **확인 필요**.
2. **LNG 활동량 단위 = t로 가정(의뢰서 기재)하되 위험.** 현장은 Nm³로 검침되어 t↔Nm³ 환산 시 약 2배 오차 가능. NCV(48 GJ/t)와 활동단위·EF 분모의 정합성을 앱이 검증하지 못함. **Nm³ 원검침값·NCV 단위(GJ/t vs GJ/Nm³) 재확인 필요** — 미확정 시 직접배출이 통째로 어긋날 수 있음.
3. **PP4 FeMn(중국) = 본 baseline에선 actual 가정으로 산정.** 실제는 공급사 미회신 → default 사용 검토 중. default 채택 시 markup(보수적 가산) 포함값이 적용되어 SEE 상승 가능(§6 민감도). markup % 및 적용 규칙 **확인 필요(2025/2621)**.
4. **K-ETS 탄소가격(carbon price paid) = 증빙 미입수 → 0으로 가정.** 무상할당분/유상부담분 구분, KRW 단가·환율·정산비율·증빙이 미정. 앱에는 carbon price paid 입력·차감·통화·환율 지원이 전무(grep 0건)하여 구조적으로 반영 불가 — 인증서 차감 효과는 본 산정에 미반영. **재무팀 증빙 입수 후 별도 산정 필요.**
5. **시트/봉강 생산량 분할 미정리** → P2 SEE를 시트/봉강 공통 적용. CN별 분리 SEE는 분할 정리 후 재배분 필요.
6. **CN-제품설명 일치 미검증.** 의뢰서 CN(72189911/72191310/72210010)과 304계 슬래브/시트/봉강 설명의 실제 일치 여부 검토 필요 — 앱은 CN 8자리 형식만 검증, 의미 대조 없음.

대표적 한계 후보:
- ⚠️ **[P0 후보] see_cbam_basis 과대계상**: 철강 Annex II direct-only인데 앱이 전구물질 INDIRECT까지 인증서 기준에 포함 → P1 +79.4%, P2 +103.7% 과대. declarant 인증서 기준 = direct-only = EU SEE(direct) P1 1.00149 / P2 1.43961 사용 권고(확인 필요, IR 원문 대조).
- ⚠️ 앱은 declarant용 SEE(direct)/SEE(indirect)[전구물질 포함] 2축 분해를 직접 산출하지 못함 — precursor를 단일 합산 스칼라로 보유. declarant가 수입자 제출용 분해를 수기 역산해야 함.
- ⚠️ 코드 단순화: `direct_see = direct_attributable_emissions_tco2e / output_mass_t` — 확정기간 정밀 산식 정합 확인 필요.
- ⚠️ CN 72/73 간접 제외는 prefix 휴리스틱(임시) — CN master 분류로 교체 필요.
- ⚠️ 전구물질 indirect SEE 단일값 저장 → 워크북 "전력소비×EF" 구조와의 bridge는 임시(추후 두 입력 분리 필요).
- 규정 인용 불확실 항목은 "확인 필요"로 표기, 단정 금지.

---

## 6. 민감도 분석

기준값: P1 see_cbam_basis 1.79689 / informational_total 2.37999 · P2 see_cbam_basis 2.93239 / informational_total 3.17111 (PP4 actual, 전력 EF 0.833 전제).

| 시나리오 | 영향 대상 | 방향 | 비고 |
|----------|-----------|------|------|
| **PP4 FeMn actual → default(+markup)** | precursor_see ↑ (P1·P2 모두) | SEE 상승 | FeMn 매입량 60,600 t(전구물질 중 소량) → P1 절대영향 제한적이나 markup 폭에 따라 변동. **default·markup 수치 확인 필요로 정량 미산정.** SAD가 DV보다 불리할 수 있음 |
| **전력 EF 0.4594 vs 0.833 (Mix)** | own_indirect_see (informational_total) | EF 0.4594 채택 시 own_indirect 약 55%(=0.4594/0.833) 수준으로 감소 | ⚠️ informational_total은 변하나, Annex II direct-only이므로 **see_cbam_basis(인증서 기준)에는 자체 전력 간접이 애초 제외되어 직접 영향 없음**. 다만 잘못된 EF로 informational 비교가 왜곡됨. EU 정답 일치는 0.833 전제이므로 0.4594 채택 시 EU 예제와 비교 불가 — 위계 확인 필요 |
| **see_cbam_basis 산식 (앱 현행 vs 규정 direct-only)** | 인증서 기준 SEE | 규정 적용 시 대폭 하락 | P1 1.79689 → 1.00149 (−44%), P2 2.93239 → 1.43961 (−51%). 인증서 수량·비용에 직결되는 최대 민감 항목 (확인 필요) |
| **LNG 단위 t vs Nm³** | direct_see (P1) | 최대 약 2배 | 단위 오기 시 P1 직접배출 통째로 왜곡. 검침원본 재확인 필수 |

---

## 7. 확정기간 컴플라이언스 확인

| 항목 | 내용 | 상태 |
|------|------|------|
| 시스템 경계 | EU ETS 포괄 cradle-to-gate 부분집합 정의 | ✅ |
| Direct/Indirect 분리 | source stream·소비전력 분리 산정 | ✅ (자체 공정분), ⚠️ 전구물질 direct/indirect 분리 미산출 |
| Annex II direct-only | 인증서 기준 SEE에서 자체 간접 제외(보존) | ⚠️ 자체 간접은 제외 OK, **전구물질 간접 미제외 → 과대계상** |
| 전구물질 가산 | direct+indirect 재귀 반영 | ✅ (informational_total 정확), ⚠️ 인증서 기준엔 direct-only 필요 |
| actual > default 우선순위 | DV는 미입수분만 대체 | ✅ (PP1~3 actual, PP4만 default 검토) |
| 전환기/확정기간 분리 | 전환기 한도·수치 미혼용 | ✅ |
| 추적성 | source stream 합계 ↔ 공정 직접배출 정합 | ⚠️ 자동 동기화 없음, 수기 반영·산출측 차감 입력 제약 |

---

## 8. 인증서 영향 (참고 · 라벨된 입력 한정)

> ⚠️ SEFA/CSCF/CBAM factor·carbon price paid·인증서 가격은 1급 값이나, 라벨된 입력·검증된 공식 범위 내에서만 산출합니다. 하드코딩 차감 금지, 추정값은 명확히 라벨.

```
gross_embedded          = imported_mass × see_cbam_basis
free_allocation_adjust  = imported_mass × sefa            (SEFA, 2025/2620 벤치마크 기반)
certificate_quantity    = gross_embedded − free_allocation_adjust − eligible_carbon_price_paid_reduction
certificate_cost        = certificate_quantity × applicable_certificate_price
```

| 항목 | 값 | 상태 |
|------|----|------|
| imported_mass (t) | (수입자별, 미정) | pending |
| see_cbam_basis (tCO₂e/t) | 앱: P1 1.79689 / P2 2.93239 ⚠️ 과대 | ⚠️ 규정 direct-only 기준 P1 1.00149 / P2 1.43961 권고(확인 필요) |
| SEFA (tCO₂e/t) | — | pending |
| carbon price paid (K-ETS) | 0 (증빙 미입수) | estimated — 증빙 입수 시 재산정 |
| 인증서 가격 | — | pending (2026 분기별) |

- SEFA 벤치마크: Column A(actual 시나리오) / Column B(default 시나리오) — `CBAM Benchmarks_20260206.xlsx`. CSCF·CBAM factor 연도값: 확인 필요.
- ⚠️ 앱은 carbon price paid 입력·차감·통화·환율·실효CP 지원이 전무 → K-ETS 차감 효과를 앱 내에서 산출 불가. 의뢰 핵심 질문("K-ETS 낸 게 CBAM에 반영되나")은 별도 수기 검토 필요.

---

## 9. EU Communication Template export (첨부 슬롯)

워크북: `CBAM Communication template for installations_en_20241213.xlsx` (법령이 아닌 설비운영자↔신고자 통신 도구). 원본 sheet명·라벨·수식·검증·보호영역 보존, 확인된 입력셀만 작성.

| 시트 | 앱 기재 입력 | SEE 산출(읽기전용 수식셀) |
|------|--------------|---------------------------|
| `A_InstData` | 설비·기간·검증자·aggregated goods·생산경로·전구물질 등록 | — |
| `B_EmInst` | source stream·활동데이터(F)·단위(G)·NCV(H)·EF(J/K)·oxidation(N)·conversion(P)·biomass(R) | direct 계산 입력원 |
| `C_Emissions&Energy` | 간접배출 M26(전력×EF 총합 수동입력) | fuel/GHG balance 수식 |
| `D_Processes` | 생산수준·직접귀속배출·열·폐가스·전력 | 공정 귀속·생산량(SEE 분모) |
| `E_PurchPrec` | 구매량·소비량·direct/indirect SEE | 전구물질 SEE 기여 |
| `Summary_Products` | 제품식별만(D:공정명, F:CN코드, H:제품명) | **I:J:K = direct/indirect/total SEE (공식셀, 덮어쓰기 금지)** |

- 첨부 파일: (export 단계 산출 — 본 run01 미생성, export 위생 검증 PASS 확인됨)
- 비교 리포트: Excel 재계산 후 워크북 `K`(total) ↔ 앱 `see_informational_total`(P1 2.37999 / P2 3.17111) 비교 — EU 정답(2.37991 / 3.17109)과 일치 확인. ⚠️ **Excel 재계산 결과와 앱 SEE의 허용 차이 기준(tolerance)이 앱 안내에 없음** → 소수점 차이 오인/큰 차이 간과 위험.

---

## 크로스레퍼런스

- 페르소나: `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/persona.md`
- 데이터셋(기본값): `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/data/cbam-defaults.json`
- 검증 KB: `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/knowledge/cbam-verification-reference.md`
- 참조 인덱스: `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/knowledge/cbam-reference-index.md`
- 시나리오: `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/scenarios/steel-hrc.md`
- 산출물 보관: `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/runs/2026-06-13_run01/`

---

**최종 판정**:
- P1 슬래브: informational_total 2.37999 tCO₂e/t = EU 공식 정답 2.37991 ✅ 일치 → **계산엔진 PASS**. 단, see_cbam_basis 1.79689 (declarant direct-only 권고값 1.00149 대비 +79.4% 과대) → **인증서 기준은 CONDITIONAL — 확인 필요**.
- P2 시트/봉강: informational_total 3.17111 tCO₂e/t = EU 공식 정답 3.17109 ✅ 일치 → **계산엔진 PASS**. 단, see_cbam_basis 2.93239 (권고값 1.43961 대비 +103.7% 과대) → **인증서 기준은 CONDITIONAL — 확인 필요**.

**종합: CONDITIONAL PASS** — informational_total 정확도는 EU 공식 예제 대비 검증 완료(PASS), 그러나 인증서 기준 SEE(see_cbam_basis)의 전구물질 indirect 과대계상은 P0 후보 결함으로 수정 전까지 인증서·비용 산정에 그대로 쓰지 말 것. declarant 제출용은 EU SEE(direct) P1 1.00149 / P2 1.43961을 사용(확인 필요, IR 원문 대조).
