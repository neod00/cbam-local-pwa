# EU CBAM SEE 검증 레퍼런스 지식 베이스
**작성**: 씨밤이 (CBAMY) | **작성일**: 2026-06-13
**목적**: CBAM Platform이 산정한 SEE(Specific Embedded Emissions) 결과·Export 워크북이 **EU Communication Template 검증·통신 기준 및 2026 확정기간(definitive period) 법령 요건을 충족하는지** 1차 평가하기 위한 레퍼런스.
**근거 자료**: Reg (EU) 2023/956, Impl. (EU) 2025/2547·2620·2621·2548, EU Communication Template for installations(설비 운영자용), CBAM Guidance(231121, **개념 한정**), CBAM Q&A, 프로젝트 harness 정책 문서, 앱 calculation-engine. 확정기간 정밀 산식·한도·markup %·CBAM factor·CSCF 연도값은 2025/2547·2620·2621 **원문 확인 필요**.

> ⚠️ 사용 원칙: 이 문서는 "EU 템플릿/검증이 실제로 무엇을 보는가"를 정리한 것이다. CBAM Platform 평가 시 §10 자가진단 체크리스트를 1차 PASS/FAIL 기준으로 사용한다. 불확실 항목은 단정하지 않고 "확인 필요"로 명시한다. 본 KB의 개념 정의 일부는 전환기 Guidance에서 도출했으므로, **전환기간 수치·한도를 확정기간 로직에 섞으면 결함**이다.

---

## 0. 근거 자료 목록 (무엇을 역추출했는가)

| # | 자료 | 근거 법령/도구 | 역할 | 비고 |
|---|------|--------------|------|------|
| 1 | Reg (EU) 2023/956 | 기본 규정 | 범위·신고declarant 의무·내재배출·인증서 반납·carbon price·free allocation·Annex I/II/IV | 최상위 법령 ★ |
| 2 | Impl. (EU) 2025/2547 | SEE 산정방법 | 시스템경계·생산공정·기능단위·actual·전구물질 | 확정기간 산정 핵심 ★ |
| 3 | Impl. (EU) 2025/2620 | Free allocation 조정 | SEFA·Benchmark(Column A/B)·CSCF | 인증서 수량에 직접 영향 |
| 4 | Impl. (EU) 2025/2621 | Default values | CN별 direct/indirect/total + 연도별 markup(2026/2027/2028+) | `DVs as adopted_v20260204.xlsx` |
| 5 | Impl. (EU) 2025/2548 | 인증서 가격 | 2026 분기별 / 2027~ 주별 | 추정가 라벨 필요 |
| 6 | EU Communication Template for installations | 통신 도구(비법령) | 설비운영자↔신고declarant 데이터 전달 골격 | `..._en_20241213.xlsx` — 철강 예제 V2.1과 동일 구조 ★★ |
| 7 | CBAM Benchmarks_20260206.xlsx | 2025/2620 | Column A(actual)/Column B(default) BMg·production route | SEFA 산정용 |
| 8 | CBAM Guidance 231121 | 전환기(Reg 2023/1773) | direct/indirect 정의·embedded emissions·precursor **개념** | **수치·한도 확정기간 적용 금지** ⚠️ |
| 9 | Impl. (EU) 2023/1773 | 전환기 전용 | 전환기 보고 규칙 | **라이브 산정 기준으로 사용 금지** ⚠️ |

★ = SEE 산정 앱(CBAM Platform)에 가장 직접적인 벤치마크.
★★ = Export 워크북 구조 보존의 기준이 되는 통신 도구.

---

## 1. 검증·통신 기준 체계 (무엇이 무엇을 검증하는가)

| 산정 대상 | 절차/도구 기준 | 적용 상황 |
|---|---|---|
| 설비 운영자 SEE 산정·통신 | **EU Communication Template for installations** + 2025/2547 | 운영자→신고declarant 내재배출 통신 |
| 신고declarant 인증서 의무 | Reg 2023/956 + 2025/2620(SEFA)·2548(가격) | 인증서 수량·비용 산정·반납 |
| 확정기간 데이터 신뢰성 | 제3자 검증(확정기간) | actual data 사용 시 (정확 요건 **확인 필요**) |

**핵심 결론**: SEE를 산정하는 앱(=CBAM Platform)은 **그 자체가 "EU 템플릿 구조·법령 요건을 보존·재현하는지"로 평가된다.** 즉 ① 확정기간 법령이 요구하는 산정 활동을 기능으로 내장, ② EU 워크북 구조·수식·라벨을 훼손 없이 Export, ③ actual/default 모드와 추적성을 보존해야 한다. ISO 검증에서 산정 SW가 "표준이 요구하는 활동을 facilitate하는지"로 검증받듯, CBAM Platform은 "확정기간 법령이 요구하는 산정·통신 활동을 보존·재현하는지"로 평가된다.

---

## 2. 데이터 모드 & 보수성 (Actual / Semi-actual / Default)

- **우선순위**: actual > default. default는 보수적(높게) 설정 — actual이 유리한 경우가 많음.
- **모드**:
  - `AD`(actual data) — 자체 + 전구물질 모두 검증 실측.
  - `SAD`(semi-actual) — 자체는 실측, 일부 전구물질은 default·semi.
  - `DV`(default value) — 최종재 default 사용.
- ⚠️ **SAD가 DV보다 불리할 수 있음**: 전구물질 default는 markup 포함이라 총합을 지배할 수 있음 → 앱은 3모드 시나리오를 **비교**할 수 있어야 함.
- **앱 시사점**: 각 입력값의 데이터 모드(actual/semi/default)와 검증상태를 필드로 보존하고, 모드 변경이 SEE·SEFA·인증서 수량에 미치는 영향을 비교 출력한다.

> 시사점: 단순히 "actual을 넣었다"가 곧 유리한 결과를 보장하지 않는다. AD/SAD/DV를 나란히 재현해 어느 모드가 인증서 수량 측면에서 유불리한지 보여줄 수 있어야 한다.

---

## 3. SEE 분리 표기 원칙 (단일 total 금지)

확정기간 앱은 다음을 **분리 산출·표기**해야 한다(없으면 결함):

| 값 | 의미 |
|---|---|
| `see_direct` | 직접 SEE |
| `see_own_indirect` | 최종재 자체 전력 간접 SEE |
| `see_precursor_contribution` | 전구물질 내재배출 기여 |
| `see_cbam_basis` | **인증서 산정 기준 SEE** (Annex II 처리 반영) |
| `see_informational_total` | 운영/검토용 총 SEE |

- 비Annex II: `see_cbam_basis = direct + own_indirect + eligible_precursor`.
- Annex II direct-only: `see_cbam_basis = direct + eligible_precursor`. `own_indirect`는 보고/공급사검토/워크북 통신용으로 **보존**하되 인증서 기준에서 제외.
- ⚠️ 앱이 `see_cbam_basis`와 `see_informational_total`을 같은 값으로 합치면(현 코드 일부 단순화) **Annex II 처리 누락 위험** → §10 점검.

> 카보니의 "GWP 판 단일 강제"가 CFP의 핵심 정합 조건이듯, CBAM에서는 "**cbam_basis ≠ informational_total** 분리 보존"이 인증서 정확성의 핵심 조건이다.

---

## 4. SEE 산정 필수 요소 (워크북 "Summary_Products" 골격)

모든 제품 SEE 산출은 다음을 **명시**해야 한다 (없으면 결함):

| 요소 | 위치/근거 | 확인 포인트 |
|---|---|---|
| 제품 CN코드 + 제품명 | `Summary_Products` F / H | CN master 기반(접두 휴리스틱 금지) |
| 생산공정명(process) | `Summary_Products` D = `A_InstData!L83:L92` | 공정명 정합 |
| 보고기간 | `A_InstData` I9/L9 | 기간 명시 |
| direct SEE / indirect SEE / total SEE | `Summary_Products!I:J:K` | **공식셀(읽기전용) 보존** |
| 단위 | tCO2e/t (전력 tCO2e/MWh) | 단위 일관성 |
| 생산경로(production route) | A_InstData / DV·Benchmark route | BF/BOF · DRI/EAF · scrap/EAF 등 구분 |
| 활동수준(생산량, SEE 분모) | `D_Processes` 생산수준 | 0 이하 금지 |
| GHG 종류 | CO2 (+N2O 비료, +PFC 알루미늄) | 섹터별 적용, tCO2e 환산 |

> 시사점: 산출물에 위 요소를 **고정 포맷**으로 출력해야 한다(값 + 단위 + functional unit(t goods) + 생산경로 + 기간 + GHG 종류). 워크북 `Summary_Products!I:K`는 수식셀이므로 앱은 제품식별 입력(D/F/H)만 기재하고 SEE 셀은 덮어쓰지 않는다.

---

## 5. 검증자/통신 점검 체크리스트 (입력 → 귀속 → 배분 → 집계)

### 5-1. Source stream 추적성 5종 (`B_EmInst`)
각 source stream(연료·공정재·물질수지)마다:
1. **Raw data** — 원천 활동데이터 확인.
2. **Transposition** — 공급사/측정 → 입력 전치 정확성.
3. **Aggregation** — source stream 합계 정확성 (vs 공정 직접배출 입력값).
4. **Assumption** — NCV · EF · oxidation/conversion factor · biomass fraction 가정값 출처.
5. **Calculation** — `활동량 × NCV × EF × OF × CF`(연소) / `활동량 × EF × OF × CF`(공정) 식 검증.
+ 단위(t/Nm³/MWh) + EF단위(tCO2/TJ vs tCO2/단위) 정합.

### 5-2. 귀속·배분 점검
- 설비 총배출 → 생산공정 귀속(attribution) 근거(측정데이터 우선).
- 공유 배출 배분: mass-ratio / molar-ratio / output subtraction 선택 근거.
- 한 공정 내 배분기준 혼용 여부, 제품라인 합계 = 공정 총생산량(±1%) 정합.

### 5-3. 전구물질 점검 (`E_PurchPrec`)
- 전구물질 CN 분류·원산지·actual/default·direct/indirect 적용 여부 개별 확인.
- 소비량(consumed_mass) ≤ 공정 생산량 합리성.
- direct/indirect SEE 출처(source) 기재.
- complex good 재귀 처리(전구물질이 또 complex good).

### 5-4. 간접배출·전력 EF 점검 (`C_Emissions&Energy`)
- EF_el 출처: default(IEA 국가/지역) vs actual(direct technical link / PPA)만 허용.
- **market-based 도구(Guarantees of Origin · 녹색인증서) 사용 금지** 확인.
- Annex II direct-only 품목의 `own_indirect`가 `cbam_basis`에서 제외되었는지.

### 5-5. 데이터 품질·버전
- 참조 워크북(DV · Benchmark · CBAM factor · CSCF · 국가 EF) **버전 메타데이터** 보존.
- DV: direct/indirect/total과 **연도별 markup-inclusive(2026/2027/2028+) 분리** 보존.
- Benchmark: Column A(actual) · Column B(default) 구분 + production route 지시자.

> 시사점: 입력 lineage(원본 활동데이터 → source stream → 공정 귀속 → 배분 → 제품 SEE)를 보존하고 각 단계를 자동 검증할 수 있어야 한다. 수동 입력점은 오타 리스크이므로 자동 정합 검사·경고로 보완한다.

---

## 6. Findings 등급 체계 (씨밤이 P0/P1/P2 매핑)

| 코드 | 의미 | 미해소 시 | 씨밤이 등급 |
|---|---|---|---|
| **MMIS** | Material Misstatement (인증서 수량/비용에 영향) | PASS 불가 | **P0** |
| **MIS** | Misstatement (영향 적음) | 조건부 PASS | P1/P2 |
| **MNCN** | Material Non-conformity (법령/템플릿 위반, 영향 가능) | PASS 불가 | **P0** |
| **NCN** | Non-conformity (위반, 영향 적음) | 조건부 | P1 |
| **OFI** | 개선 기회 | — | **P2** |

**Findings Log 컬럼**: `등급 · 상태(New/Open/Closed) · 설명 · 정정/근본원인/시정조치 · 대상(공정/전구물질/제품/워크북) · 일자 · Reference · 적용 법령/템플릿 조항`.

> 시사점: 산정 로그를 위 5등급 + **법령/템플릿 조항 매핑**으로 남기면 검증 효율이 올라간다. 씨밤이의 improvement-suggestions.md P0/P1/P2 분류와 직접 연결된다 (P0 = 산정차단/컴플라이언스위반, P1 = 실수유발/추적성약화, P2 = 개선권고).

---

## 7. 빈발 결함 유형 — 앱이 사전 검출해야 할 것

| 유형 | 사례 | 우선순위 |
|---|---|---|
| **전환기/확정기간 혼용** | 전환기 default 한도·수치를 2026 로직에 사용 | P0 (MNCN) |
| **Annex II 처리 오류** | direct-only 품목 own_indirect를 cbam_basis에 포함 / 전구물질 indirect 전부 0 처리 | P0 |
| **CN 접두 휴리스틱** | `72/73 → 전부 direct-only` 식 prefix 분류(현 코드) | P0 — CN master 교체 필요 |
| **단위 환산 오류** | tCO2/TJ vs tCO2/단위, GJ↔TJ, t↔Nm³, MWh | P0/P1 |
| **SEE 분모 오류** | 생산량 0/음수, activity level 누락 | P0 |
| **EF 출처 부적격** | market-based(GO·녹색인증) 전력 EF 사용 | P1 (NCN) |
| **전구물질 누락/미연결** | 소비 전구물질 SEE 미가산, source 공란 | P1 |
| **배분 누락/혼용** | 한 공정 내 배분기준 혼용, 라인 합계 불일치 | P1 |
| **워크북 공식셀 훼손** | `Summary_Products!I:K`·수식·시트명·라벨 덮어쓰기 | P0 (MNCN) |
| **추적성 단절** | source stream 합계 ≠ 공정 직접배출 입력값, 버전 메타 누락 | P1 |
| **SEFA 표시값 취급** | SEFA를 인증서 수량에 반영 안 함 | P1 |
| **carbon price 하드코딩** | 증빙 없이 기지불 탄소가격 차감 | P1 |

> ★ CBAM Platform의 "**CN 접두 휴리스틱**"(현 코드의 72/73 일괄 direct-only 규칙)과 "**cbam_basis 단순화**"(direct+indirect+precursor 합산)는 위 표의 P0 유형의 전형이다. 카보니의 "이중 환산 함정"이 단위 결함의 전형이었듯, 씨밤이는 이 두 결함을 매 평가에서 우선 점검한다.

---

## 8. SEE 산정 앱 검증 특례 (씨밤이 직접 벤치마크) ★★

| 항목 | 요구사항 |
|---|---|
| **워크북 구조 보존** | EU 템플릿 시트명·영문라벨·수식·검증·보호영역 무손상, 확인된 입력셀만 작성 |
| **앱↔워크북 교차검증** | Excel 재계산 `Summary_Products!K`(total SEE) vs 앱 `informational_total` 비교, 차이 리포트(단 `cbam_basis`≠`K`임을 명시) |
| **버전 고정** | 앱 버전 + 참조워크북(DV/Benchmark) 버전 + 템플릿 버전 메타 출력 |
| **시나리오 재현** | AD/SAD/DV 3모드 SEE·SEFA·인증서 수량 비교 재현 |
| **추적성(화이트박스)** | 원본 활동데이터 → source stream → 공정 귀속 → 배분 → 제품 SEE 경로 추적 |
| **완전성 게이트** | Export readiness 블로킹 에러 없을 때만 Export 허용 |
| **참조워크북 비번들** | 사용자 업로드 최신 공식 워크북 사용, 앱에 원본 번들 금지 |
| **증빙 메타** | source stream · 전구물질 · DV 정당화 · carbon price 증빙을 구조화 레코드로 |

### 확정기간 필수 요건 = "결여하면 안 되는 요건 목록"
SEE 산정 앱이 확정기간 평가를 통과하려면 다음을 결여해선 안 된다:
- 기능단위(t goods)·생산경로·보고기간 정의·문서화 (2025/2547, **확인 필요**)
- 시스템 경계 = EU ETS 포괄범위(cradle-to-gate 부분집합), 상류·운송·사용·폐기 제외
- direct/indirect SEE 분리 + Annex II direct-only 분기
- 전구물질 내재배출(direct+indirect) 소비량 기반 가산 + complex good 재귀
- default value 연도별 markup 분리 + 국가×CN×연도 lookup
- 배분 방법(mass/molar/output subtraction) 선택 근거 + 혼용 금지
- SEFA(인증서 1급 입력) + Benchmark Column A/B + carbon price paid 상태관리
- 워크북 공식셀 무손상 + 버전 메타 + AD/SAD/DV 재현

> 시사점: 위 목록은 ISO 검증의 "RHI Magnesita 실패 사례 = 필수 요건 체크리스트"와 같은 역할이다. 하나라도 미구현·미보존이면 1차 평가에서 FAIL 위험.

---

## 9. 근거 문서/법령 빠른 인덱스

| 참조 | 내용 |
|---|---|
| Reg (EU) 2023/956 | 범위, 신고declarant 의무, 내재배출, 인증서 반납, carbon price, free allocation, Annex I/II/IV |
| Impl. (EU) 2025/2547 | 확정기간 SEE 산정방법·시스템경계·생산공정·기능단위·actual·전구물질 |
| Impl. (EU) 2025/2620 | Free allocation 조정·SEFA·Benchmark(Column A/B)·CSCF |
| Impl. (EU) 2025/2621 | 확정기간 default values(연도별 markup) |
| Impl. (EU) 2025/2548 | 인증서 가격(2026 분기별 / 2027~ 주별) |
| Guidance 231121 | **전환기** 개념(direct/indirect 정의, embedded emissions, precursor) — 수치/한도 확정기간 적용 금지 |
| Impl. (EU) 2023/1773 | **전환기 전용** — 라이브 산정 기준으로 사용 금지 |
| EU Communication Template | 설비운영자↔신고declarant 통신 도구(비법령) — 시트명·라벨·수식·보호영역 보존 대상 |

> ⚠️ Guidance 231121의 개념 정의(direct/indirect, embedded emissions, precursor)는 인용 가능하나, "complex goods default 20% 한도", "2024-07-31 무제한 사용" 등 **전환기 수치·한도는 확정기간에 적용 금지**.

---

## 10. 씨밤이 자가진단 체크리스트 (앱 평가 1차 PASS/FAIL 기준) ★★★

씨밤이가 매 평가에서 CBAM Platform 앱을 평가할 때 이 표를 기준으로 PASS/FAIL을 판정한다. **A·B·C·D 항목에 미해소 FAIL이 있으면 1차 FAIL.**

### A. 시스템 경계 & 분류 (FAIL = 즉시 1차 FAIL)
- [ ] 시스템 경계가 EU ETS 포괄범위(cradle-to-gate 부분집합)로 한정 — 상류 채굴·운송·사용·폐기 자동 제외
- [ ] 생산공정 경계·중간재 처리(별도 수출 시만 별도 SEE) 정의
- [ ] **전환기 ≠ 확정기간**: 전환기 수치·한도·default 규칙이 2026 라이브 로직에 섞이지 않음
- [ ] CN 분류가 **CN master 기반** (`72/73 전부 direct-only` 같은 접두 휴리스틱 금지)
- [ ] Annex I 범위 / Annex II direct-only / 제외 goods 상태를 reference data로 보유

### B. Direct·Indirect 분리 & Annex II 처리
- [ ] direct/indirect SEE **분리 산출·표기**
- [ ] indirect = 전력소비 × 전력 EF, EF 출처가 default(IEA) 또는 actual(direct link/PPA)만 — **market-based 도구 금지**
- [ ] **Annex II direct-only**: 최종재 own_indirect를 `cbam_basis`에서 제외, 보고/검토용 보존
- [ ] CN 2601 12 00(응결 철광석·정광) 등 indirect 포함 예외 정확 처리
- [ ] `see_cbam_basis` ≠ `see_informational_total` 분리 (Annex II 케이스에서 값 분기 확인)

### C. 단위·계산·추적성 (빈발 결함 방지)
- [ ] SEE 단위 tCO2e/t (전력 tCO2e/MWh) 고정, EF단위(tCO2/TJ vs tCO2/단위) 일관성 검사
- [ ] source stream 산식(`활동량×NCV×EF×OF×CF` 연소 / `활동량×EF×OF×CF` 공정) 검증, GJ→TJ(÷1000) 등 환산 검증
- [ ] SEE 분모(생산량/활동수준) 0·음수 차단
- [ ] source stream 합계 vs 공정 직접배출 입력값 정합(±1%) 검증·경고
- [ ] 입력 lineage 보존(원본 활동데이터 → source stream → 귀속 → 배분 → 제품 SEE)

### D. 전구물질 & 배분 & default
- [ ] 전구물질 SEE(direct+indirect) **소비량 기반 가산**, complex good 재귀
- [ ] 전구물질별 CN 분류·actual/default·direct/indirect 개별 처리 (Annex II 최종재라도 전구물질 indirect 자동 0 금지)
- [ ] actual > default 우선, default는 국가×CN×연도 lookup + **연도별 markup(2026/2027/2028+) 분리** 보존
- [ ] 배분: mass-ratio/molar-ratio/output subtraction, 한 공정 내 기준 혼용 금지, 라인 합계 정합

### E. SEFA·인증서·carbon price (확정기간)
- [ ] Benchmark Column A(actual)·Column B(default) 구분 + production route 지시자 사용
- [ ] **SEFA를 표시값이 아닌 인증서 수량 1급 입력으로 반영**
- [ ] 인증서 수량 = `수입량×cbam_basis − 무상할당조정 − 적격 기지불탄소가격` 골격
- [ ] carbon price paid를 pending/estimated/confirmed로 관리(증빙 없이 하드코딩 차감 금지)
- [ ] 인증서 가격 2026 분기/2027~ 주별 버전 관리, 추정가 라벨

### F. EU 템플릿 보존 & 검증 친화성
- [ ] EU 워크북 시트명·영문라벨·**수식·검증·보호영역 무손상**, 확인된 입력셀만 작성
- [ ] `Summary_Products!I:K`(direct/indirect/total SEE) **공식셀 읽기전용 보존**
- [ ] Excel 재계산값 vs 앱 SEE 비교 리포트(단 워크북 `K`≈`informational_total`, `cbam_basis`는 별개 명시)
- [ ] 참조워크북 비번들(사용자 업로드) + 앱/템플릿/DV/Benchmark **버전 메타 출력**
- [ ] finding을 법령/템플릿 조항에 매핑, AD/SAD/DV 시나리오 재현 가능

---

## 11. 철강(iron & steel) 시나리오 적용 메모 (씨밤이 전용)

철강 HRC run에 이 KB를 적용할 때 특히 확인할 것 (시나리오: `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/scenarios/steel-hrc.md`):

1. **Annex II direct-only 처리** → 철강(iron & steel)은 일반적으로 자체 전력 간접배출을 인증서 기준에서 제외. 단 **응결 철광석·정광 CN 2601 12 00은 간접배출 포함(예외)**. 현 코드의 `72/73 → 제외` 접두 규칙은 임시이며 CN master 교체 필요 → 분류 정확성 FAIL 위험.
2. **생산경로 구분** → 같은 CN이 BF/BOF · DRI/EAF · scrap/EAF로 생산되면 경로별 별도 산정·보고. DV/Benchmark의 production route 지시자와 정합 확인.
3. **전구물질 흐름** → 철강 complex good(예: screws & nuts)은 선재·강재 등 전구물질을 소비. **Annex II 최종재라도 비Annex II 전구물질에 내재된 indirect는 흘러들어갈 수 있음** → 전구물질별 자체 분류로 평가, 자동 0 처리 금지.
4. **단위 환산** → source stream의 GJ↔TJ, t↔Nm³, EF단위(tCO2/TJ vs tCO2/단위) 정합. 빈발 결함 "단위 환산 오류" 유형의 전형.
5. **전력 EF 출처** → default(IEA 국가값) vs actual(direct link/PPA)만 허용, market-based(GO·녹색인증) 금지. EF 출처·연도 추적 요구.
6. **워크북 교차검증** → BF/EAF/Screws&nuts 예제 워크북 재계산값(`Summary_Products!K`) vs 앱 `informational_total` 비교. `cbam_basis`는 별개임을 명시.

> 운영자 점검표(`cbamy/scenarios/steel-hrc-app-checks.md`)는 운영자 전용이며 씨밤이에게 노출하지 않는다. 씨밤이는 본 KB §10 자가진단 체크리스트만을 1차 PASS/FAIL 근거로 사용한다.

---

## 부록. 출처·한계

- 본 KB의 개념 정의 일부(direct/indirect 정의, embedded emissions 개념, precursor 추가)는 **전환기 Guidance(231121, 근거 Reg 2023/1773)에서 도출**했으나, 수치·한도·단계별 규칙은 전환기용이므로 확정기간 라이브 로직에 그대로 쓰면 안 된다. → **확정기간 정밀 산식·한도·markup % · CBAM factor · CSCF 연도값은 2025/2547·2620·2621 원문 확인 필요.**
- 현 앱 코드(`calculation-engine.ts`)는 `cbam_basis = direct + indirect + precursor`로 단순화된 부분이 있어, **Annex II 분기·전구물질 indirect 흐름**이 harness 정책대로 완전 구현되었는지 평가 시 별도 검증 필요.
- CN 분류 현 구현은 **72/73 접두 휴리스틱(임시)** → 공식 Annex II 목록/CN master 교체 전까지 분류 정확성 FAIL 위험.
- **CBAM 공식 기본값·벤치마크 수치는 본 KB에 하드코딩하지 않는다.** SEE/SEFA/DV/Benchmark 수치는 데이터셋 `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/data/cbam-defaults.json`(및 사용자 업로드 최신 공식 워크북)만을 출처로 사용한다 — 씨밤이 원칙은 변함없다.
- 참조워크북(DV/Benchmark/Communication Template)은 **앱에 번들 금지**, 사용자가 최신 공식본을 업로드/임포트하고 버전 메타데이터를 저장한다(harness 정책).

---

### 크로스레퍼런스 (캐논 경로)
- 페르소나: `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/persona.md`, `.../designer-persona.md`, `.../README.md`
- 데이터셋: `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/data/cbam-defaults.json`
- 인덱스: `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/knowledge/cbam-reference-index.md`
- 본 검증 KB: `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/knowledge/cbam-verification-reference.md`
- 시나리오: `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/scenarios/steel-hrc.md`
- 산출물 보관: `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/runs/<YYYY-MM-DD>_runNN/`
- 전용 스킬: `C:/Users/NT940XHA/.claude/skills/cbamy-regression-run/` (SKILL.md, scoring-rubric.md, templates/)