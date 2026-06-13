# 시나리오: 동성특수강 EAF 스테인리스강 CBAM SEE 산정 의뢰 (씨밤이용)

> **이 파일은 씨밤이(CBAMY)에게 전달되는 시나리오입니다.** 운영자 전용 앱 능력 검증표(함정표)는 별도 파일(`scenarios/steel-hrc-app-checks.md`)로 분리됐습니다. **씨밤이에게 그 파일을 노출시키지 마세요.** 함정·정답 SEE·기대 결함 목록은 그 파일에만 있습니다.

---

## 1. 의뢰서 (Client Brief)

| 항목 | 내용 |
|------|------|
| **의뢰 회사** | 동성특수강(주) (Dongseong Special Steel Co., Ltd. — 경북 포항/경남 창원 소재, 가상) |
| **의뢰 일자** | 2026-06-08 |
| **요청 사항** | 전기로(EAF) 스테인리스 제품의 CBAM **내재배출량(SEE, Specific Embedded Emissions)** 산정 + **EU Communication Template**(installations용) 작성 지원 |
| **목적** | EU 수입자(이탈리아·독일 가공 고객사)가 CBAM 분기보고서에 필요한 "공급자 SEE 데이터"를 요청 → 정의기간(definitive period) 대응 |
| **대상 제품** | ① 스테인리스 반제품 슬래브, ② 스테인리스 열연/냉연 평판재(시트), ③ 스테인리스 봉강(long products) — 모두 304계(V2A 상당) |
| **CN 코드 (의뢰서 기재)** | 72189911, 72191310, 72210010 (의뢰서에 적힌 그대로. 제품 설명과 일치하는지 검토 필요) |
| **산정 대상 기간** | 2025년 1~12월 (정의기간 첫 보고분, 12개월) |
| **희망 보고 시한** | 2026년 7월 중순 (고객사 Q3 보고 마감 전) |
| **산정 표준/방법** | EU CBAM 규정 (EU)2023/956 및 이행규정(Implementing Regulation) 정의기간 방법론, CBAM SEE V2.1 Communication Template 양식 |

### 클라이언트 코멘트 (의뢰 미팅 메모)
> "EU 고객사가 'actual data 기반 SEE'를 요구합니다. 우리 전기로는 자가측정 데이터가 꽤 있는데, **합금철 일부는 해외 매입이라 공급사 자료가 안 와서** 그 부분은 어떻게 해야 할지 모르겠습니다. EU에서 default 값을 쓸 수 있다고 들었는데, 그러면 불이익(markup 같은 것)이 있다던가요? 그리고 우리는 국내에서 **배출권거래제(K-ETS)로 일부 비용을 내고 있는데** 이게 CBAM 보고에 반영되는지도 궁금합니다. 데이터는 환경안전팀에서 끌어모은 건데 단위가 들쭉날쭉할 수 있어요. 전력 배출계수(electricity EF)는 그냥 한전 거 쓰면 되죠?"

> 추가 메모(영업): "고객사가 보내준 빈 양식이 'CBAM communication template'이라는 엑셀인데, 자꾸 빨간 셀에 에러가 떠서 우리가 직접 채우긴 어렵습니다. 컨설팅에서 채워서 주시거나, 우리가 쓸 수 있게 정리해 주세요."

---

## 2. 사업장 / 생산공정 개요

### 사업장
- **위치**: 경북 포항 (제강·연주), 경남 창원 (압연·정정) — 단일 installation으로 보고
- **경제활동**: 철강 생산 (Iron & steel production)
- **주력 생산경로**: 전기로(Electric Arc Furnace) → 연속주조(continuous casting) → 압연/정정(rolling & finishing)
- **연간 조강 생산규모**: 약 2.2백만 톤/년 (P1 기준)

### 생산공정 2단계 (CBAM "production process" 단위)

```
[고철·합금철 장입] → [전기로 제강 + 연주]  →  [압연 + 정정]
        원료                  P1 (조강)            P2 (철강제품)
                          ↓ 일부 시장출하       ↑ P1 조강 일부 투입
```

| # | Production process | 산출 aggregated good | 핵심 활동 |
|---|--------------------|----------------------|----------|
| **P1** | 전기로 제강 + 연속주조 (EAF incl. continuous casting) | Crude steel(조강) → 스테인리스 슬래브 | 고철·합금철 용해, 정련, 연주. 산출 조강의 일부는 슬래브로 시장 출하, 나머지는 P2로 이송 |
| **P2** | 압연 및 정정 (Rolling mill and finishing) | Iron or steel products(철강제품) → 시트·봉강 | P1 조강(슬래브)을 받아 열연/냉연·정정하여 평판재·봉강 생산 |

> 메모: P1 조강은 "시장 출하분"과 "P2 투입분"으로 나뉜다. P2는 P1 산출물을 precursor로 받아 추가 가공한다 (사내 precursor → good 흐름). 사내 precursor의 attributed emission도 최종 제품 SEE로 전가된다.

---

## 3. 원료·전구물질(precursor) 구성 (2025년)

### 3.1 사내 투입 원료 (전기로)

| 원료 | 연간 투입량 | 단위(의뢰서 기재) | 비고 |
|------|------------|------------------|------|
| 스테인리스 고철(외부+사내) | 약 1,345,000 | t | 주 철원(scrap) |
| 흑연전극 (graphite electrode) | 약 4,470 | t | 전기로 전극 소모 |
| 부원료(석회석·생석회·기타 첨가제) | 약 89,000 | t | 일부는 가소(calcined) 여부 불명확 |
| 천연가스(LNG) | 약 164,000 | t | 가열·예열용 연소 연료 (의뢰서엔 "t"로 적혔으나 현장은 Nm³로 검침) |

> 클라이언트 메모: "천연가스 사용량은 도시가스 고지서엔 Nm³로 나오는데, 환경팀이 톤으로 환산해 놓은 표를 줬습니다. 어느 쪽이 맞는지 확인 부탁드려요."

### 3.2 매입 전구물질 (Purchased precursors — 외부 생산)

| ID | 전구물질 | 생산국(추정) | 연간 매입량 | SEE 자료 상태 |
|----|----------|-------------|------------|---------------|
| PP1 | 탄소강 강괴(carbon steel ingot, BOF 생산) | 인도네시아 | 약 80,500 t | 공급사 measured SEE 자료 **있음** (direct 1.48 / elec 0.245 MWh·t) |
| PP2 | 페로니켈 FeNi (Ni 28%) | 일본 | 약 347,000 t | 공급사 measured SEE 자료 **있음** (direct 3.0 / elec 3.001 MWh·t) |
| PP3 | 페로크롬 FeCr (Cr 52%) | 인도 | 약 331,000 t | 공급사 measured SEE 자료 **있음** (direct 2.5 / elec 2.821 MWh·t) |
| PP4 | 페로망간 FeMn (Mn 31%) | 중국 | 약 60,600 t | 공급사 자료 **미회신** → default 사용 검토 필요 |

> 클라이언트 메모: "FeNi·FeCr·탄소강 강괴는 공급사에서 탄소데이터 시트를 받았습니다(위 표 수치). 그런데 **페로망간(중국)은 몇 번 요청해도 답이 없어서** 우리가 직접 못 채웠습니다. 그 단위가 'MWh/t'이라는데 우리 전력하고 같은 건지도 헷갈립니다."

> 메모: 매입 전구물질의 SEE(direct + indirect)는 그것을 소비하는 production process(여기선 P1)의 attributed emission에 **합산**되어 최종 제품 SEE로 전가된다 (cradle 흐름). 전력(MWh/t)으로 제공된 항목은 별도의 전력 EF를 곱해 indirect로 환산해야 하는지, 이미 SEE에 포함된 값인지 확인 필요.

---

## 4. 활동 데이터 (2025년 연간, 사업장 단위)

### 4.1 전기로 source streams (직접배출 산정용 — 일부 단위/방법 모호)

| 항목 | 활동량 | 단위 | 산정방법 | 계수(의뢰서 기재) |
|------|--------|------|---------|------------------|
| 천연가스(LNG) | 164,000 | t (또는 Nm³?) | 연소(combustion) | NCV 48 GJ/t, EF 56.1 tCO2/TJ |
| 스테인리스 고철 | 1,345,000 | t | 물질수지(mass balance) | C 함량 0.0008 tC/t |
| 흑연전극 | 4,470 | t | 물질수지 | C 함량 0.819 tC/t |
| 부원료(석회석 등) | 89,000 | t | 공정배출(process) | EF 0.45 tCO2/t |
| 매입 탄소강 강괴(투입분) | 80,500 | t | 물질수지 | C 함량 0.0015 tC/t |
| (산출 측 차감) 조강 | 산출량으로 차감 | t | 물질수지 | C 함량 0.0018 tC/t |
| (산출 측 차감) 슬래그 | 발생량으로 차감 | t | 물질수지 | C 함량 0.0003 tC/t |

> 메모: 합금철(FeNi/FeCr/FeMn) 자체의 탄소도 물질수지 투입 측에 들어가지만, 그 **상류 내재배출(SEE)** 은 §3.2의 precursor SEE로 별도 전가된다. 두 경로를 혼동하지 말 것(이중계상·누락 주의).

### 4.2 전력 소비 (간접배출 산정용)

| Production process | 전력 소비 | 단위 | 전력 EF | EF 출처(의뢰서 기재) |
|--------------------|----------|------|---------|---------------------|
| P1 전기로 제강+연주 | 1,563,800 | MWh | 0.4594 tCO2/MWh? | "한전 평균"이라고만 적힘 |
| P2 압연+정정 | 324,700 | MWh | 0.4594 tCO2/MWh? | "한전 평균" |

> 클라이언트 메모: "전력은 그냥 한전 계통 평균 쓰면 된다고 생각했는데, 고객사가 'CBAM에서 인정되는 전력 EF가 따로 있다'고 합니다. 우리가 적은 0.4594는 국내 통상값인데, 이걸 그대로 써도 되는지 모르겠습니다." *(주: EU 예제 워크북은 0.833 tCO2/MWh를 'Mix'로 사용. 어느 값을·어떤 근거로 쓸지는 컨설턴트가 판단·질의할 사항 — 확인 필요)*

> 메모(컨설턴트용): 철강(iron & steel)은 Annex II direct-only 품목이므로, **최종재 자체 전력의 간접 SEE는 CBAM 인증서 산정 기준(see_cbam_basis)에서 제외**되고 보고·검토용(see_informational_total)으로만 보존되는 것이 원칙이다(단 응결 철광석·정광 CN 2601 12 00 등 예외 품목 별도). 위 전력 데이터를 어떤 결과값에 반영할지(인증서 기준 제외 vs 정보성 총량 포함)는 CN별 Annex II 실제 분류로 판정 — 확인 필요.

### 4.3 생산량 / 배분 데이터

| 항목 | 값 | 단위 | 비고 |
|------|-----|------|------|
| P1 전기로 조강 총생산 | 2,234,000 | t | SEE 분모(denominator) |
| └ 시장 출하분(슬래브) | 1,007,000 | t | 외부 판매 |
| └ P2로 이송분 | 1,227,000 | t | 사내 precursor |
| P2 철강제품 총생산 | 1,133,000 | t | 전량 시장 출하 |
| └ 시트·봉강 등 | 1,133,000 | t | 제품별 세부 배분은 환경팀 확인 중 |

> 클라이언트 메모: "P1에서 나온 조강 중 일부는 슬래브로 바로 팔고, 일부는 우리 압연으로 넘깁니다. 제품별(시트/봉강) 생산량 쪼개기는 아직 정리가 안 됐습니다. 일단 합계만 드려요."

### 4.4 합금 조성 (Communication template 보고 항목)

| 제품군 | % Mn | % Cr | % Ni | % C(탄소) | 비고 |
|--------|------|------|------|-----------|------|
| 304계 스테인리스 (V2A 상당) | 약 1.4% | 약 18% | 약 10% | 약 0.05% | 주 합금원소 |

> 메모: Communication template은 제품별 합금원소 비율(% Mn/Cr/Ni/기타)과 "주 환원제(main reducing agent)" 입력을 요구한다. EAF·스크랩 기반이지만 보고서식상 입력 필드가 존재한다(해당/비해당 판단 필요).

### 4.5 탄소가격(carbon price) — K-ETS

| 항목 | 내용(클라이언트 진술) |
|------|----------------------|
| 제도 | 한국 배출권거래제(K-ETS) |
| 적용 대상 | 사업장 직접배출 일부에 대해 배출권 정산 (무상할당 일부 + 유상매입 일부) |
| 비용 | "톤당 일정 금액을 내고 있다" (정확한 KRW 단가·정산 비율은 재무팀 확인 중) |
| 통화 | KRW |

> 클라이언트 메모: "고객사가 'carbon price를 보고하면 CBAM 인증서 가격에서 차감된다'고 하던데, 우리가 K-ETS로 낸 걸 어떻게 증빙·환산해야 하나요? 환율도 어느 시점 걸 써야 하는지요." *(주: 무상할당분과 실제 유상부담분의 구분, 증빙·환산 방법은 확인 필요 사항. 증빙 없으면 0으로 가정.)*

---

## 5. 산정 범위 / 산출물 요구 (클라이언트 희망 + 표준 요건)

| 항목 | 내용 |
|------|------|
| **산정 단위** | 제품 1톤당 SEE (tCO2e/t) — direct / indirect / total 구분 |
| **시스템 경계** | CBAM 정의: 해당 재화 + 관련 precursor의 production process 경계 (cradle-to-installation-gate 상당) |
| **대상 제품** | 스테인리스 슬래브, 시트, 봉강 (각 CN코드별 SEE) |
| **포함** | 사내 직접배출(연소·공정·물질수지), 간접배출(전력), 매입 precursor SEE 전가, 사내 precursor(P1→P2) 전가 |
| **GHG** | CO2 중심 (N2O·PFC는 본 공정 비해당 여부 검토) |
| **산출물** | ① 제품별 SEE 산정 결과(direct/own-indirect/precursor 분리 + 인증서 기준 SEE vs 정보성 총 SEE 구분), ② EU Communication Template(installations) 작성/검증, ③ default vs actual 영향 메모, ④ 클라이언트 추가 질의서 |

> **주의**: 최종 SEE 정답 값은 본 시나리오에 적지 않는다. 컨설턴트(씨밤이)가 제공 데이터로 직접 산정·검증해야 한다.

---

## 6. 첨부 / 참고 자료

- EU 공식 예제 워크북(구조·양식 참고):
  - `2 CBAM SEE V2.1_Example Steel 1 Blast furnace_final.xlsx`
  - `3 CBAM SEE V2.1_Example Steel 2 EAF alloys_final.xlsx` (본 시나리오의 주 참조)
  - `4 CBAM SEE V2.1_Example Steel 3 Screws and nuts_final.xlsx`
  - (모두 `D:/OneDrive/Business/ai automation/CBAM_Platform/CBAM_documents/`)
- `CBAM Communication template for installations_en_20241213.xlsx` (고객사 요청 양식)
- 기본값(Default Values)·벤치마크(Benchmarks)는 가공 데이터셋 `cbamy/data/cbam-defaults.json`을 우선 참조 (출처: `DVs as adopted_v20260204.xlsx` / `CBAM Benchmarks_20260206.xlsx`, scope=2026 definitive period). 데이터셋에 없는 국가/CN/생산경로 조합은 원본 워크북을 직접 참조하고 **임의 추정 금지**.
- 검증 지식베이스: `cbamy/knowledge/cbam-verification-reference.md`, 참조 인덱스: `cbamy/knowledge/cbam-reference-index.md`
- 필요 시 웹 검색 (CBAM 이행규정, default value 적용 조건, markup 조항만)

---

## 7. 산출물 요구사항 (세션 종료 시)

`cbamy/runs/<YYYY-MM-DD>_<runID>/`에 다음 4종 생성 (포맷은 전용 스킬 `cbamy-regression-run`의 `templates/output-formats/*.template` 사용):
1. `see-result.md` — 제품별(슬래브/시트/봉강) direct·indirect·total SEE 산정 결과 + 분모(denominator)/전가(precursor) 내역
2. `usage-log.md` — 1인칭 사용 일지 (앱으로 무엇을 했고 어디서 막혔는지)
3. `improvement-suggestions.md` — 앱 개선 제안서 (P0/P1/P2)
4. `client-questions.md` — 클라이언트 추가 질의 메모 (단위·전력 EF·default·K-ETS 증빙 등)

---

## Changelog
- **v0.1 (2026-06-13)**: EU 공식 EAF alloys 예제 워크북(`3 CBAM SEE V2.1_Example Steel 2 EAF alloys`)을 가상 한국 EAF 스테인리스사(동성특수강)로 각색하여 최초 작성. 단위(LNG t↔Nm³)·전력 EF·default(FeMn 미회신)·탄소가격(K-ETS)·CN코드 일치 여부를 모호화하여 컨설턴트 질의 유도. 함정표는 `steel-hrc-app-checks.md`로 분리, 정답 SEE 비노출. 카보니 `nickel-sulfate.md` 구조 미러링.