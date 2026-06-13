# 앱 능력 검증표 — 철강 HRC(열연코일) CBAM SEE 시나리오 (운영자 전용)

> ⛔ **이 파일은 씨밤이(CBAMY)에게 절대 노출하지 마세요.**
>
> **본 문서의 목적**: 철강 EAF 합금강(stainless/alloy) 시나리오(`cbamy/scenarios/steel-hrc.md`)의 각 도전 과제에 대해 **CBAM 산정 앱(CBAM_Platform — 씨밤이가 Mode 1/2로 사용하는 도구)이 컨설턴트를 얼마나 잘 지원하는지** 평가하는 체크리스트입니다. 씨밤이의 실력을 시험하는 문서가 아닙니다 — 씨밤이는 진짜 컨설턴트의 대체 도구일 뿐이며, 평가 대상은 항상 앱입니다.
>
> 참고: 씨밤이는 직접 클릭이 불가하므로(Mode 1 텍스트 시뮬레이션 + Mode 2 스크린샷 대화) "앱이 지원한다"의 판정은 *현재 코드가 기능을 제공하는가* 기준으로 합니다. 앱의 알려진 한계는 본 검증표 곳곳에 "현재 코드 기준"으로 표기합니다.

---

## 평가 원칙

> **질문은 항상 "앱이 무엇을 지원하는가"여야 합니다.**

| ❌ 잘못된 평가 | ✅ 올바른 평가 |
|---------------|---------------|
| "씨밤이가 Nm³→t 환산했는가?" | "앱이 연료 단위(Nm³/t/GJ) 입력·환산을 제공하는가?" |
| "씨밤이가 default markup을 적용했는가?" | "앱이 default 값 선택 시 markup을 자동 안내·적용하는가?" |
| "씨밤이가 precursor SEE를 전가했는가?" | "앱이 매입 precursor SEE를 소비 공정으로 자동 합산하는가?" |
| "씨밤이가 철강 indirect를 제외했는가?" | "앱이 Annex II direct-only 품목에 인증서 기준 indirect 제외 규칙을 자동 적용하는가?" |

## 평가 등급
- 🟢 **양호**: 앱이 컨설턴트가 필요한 기능/안내를 충분히 제공
- 🟡 **부분 지원**: 기능은 있으나 UX 개선 필요 (실수 유발 가능 — 결함등급 P1 수준)
- 🔴 **결함**: 기능 부재 또는 CBAM 컴플라이언스 위반 가능성 (결함등급 P0 수준)

> 결함등급 매핑(씨밤이 산출물과 동일 체계): **P0** = 산정 차단/컴플라이언스 위반(🔴), **P1** = 실수 유발/추적성 약화(🟡), **P2** = 개선 권고.

---

## 검증 항목 (10개)

### Check #1. 매입 전구물질(precursor) SEE 전가
- **시나리오 트리거**: `steel-hrc.md` §3.2 — PP1~PP4(탄소강 강괴·FeNi·FeCr·FeMn)의 SEE가 P1 attributed emission에 합산되어야 함
- **CBAM 실무 맥락**: 매입 precursor의 내재배출(direct+indirect)은 그것을 소비하는 production process로 전가되어 최종 재화 SEE에 포함된다. CBAM 철강 산정의 핵심 메커니즘이며, 누락 시 SEE가 크게 과소산정된다(합금철 비중이 커서 영향 큼).
- **앱 평가 질문**:
  - 매입 precursor를 등록하고 그 SEE(direct/indirect, tCO2e/t)를 입력할 수 있는가? → `/precursors` 화면이 `direct_see_tco2e_per_t` / `indirect_see_tco2e_per_t`, 구매량/소비량/비CBAM소비량 필드를 제공.
  - 입력한 precursor SEE × 소비량이 소비 공정의 배출에 **자동 합산**되는가? → 계산엔진 `precursor_see = Σ(consumed_mass_t × (direct_see + indirect_see)) / output`으로 합산(`calculation-engine.ts`).
  - precursor가 여러 공정에 분배될 때(P1/P2) 비율대로 배분·추적되는가?
- **🔴 결함 신호 (P0)**: precursor SEE 입력 필드 없음, 또는 입력해도 최종 SEE에 반영 안 됨
- **🟡 부분 신호 (P1)**: 합산은 되나 공정별 배분/추적이 불투명 — *현재 코드는 precursor를 소비 공정 단위로 합산하나, 단일 precursor를 복수 공정에 분배하는 추적 UI는 확인 필요*
- **🟢 양호**: precursor SEE 입력 → 소비 공정 자동 합산 + 배분 추적 가능

---

### Check #2. default 값 vs actual 데이터 전환
- **시나리오 트리거**: `steel-hrc.md` §3.2 — FeNi/FeCr/탄소강은 measured(actual), FeMn은 공급사 미회신 → default
- **CBAM 실무 맥락**: 2026 확정기간(definitive period)에는 actual이 원칙이나 일부 항목은 default 허용. 항목마다 actual/default를 개별 선택할 수 있어야 하고, 보고서에 "default로 산정된 비율(Share of emissions determined by default values)"이 집계되어야 한다.
- **앱 평가 질문**:
  - precursor·source stream별로 actual / default를 **개별** 토글할 수 있는가? → `/precursors`의 `data_mode`(ACTUAL/SEMI_ACTUAL/DEFAULT) 필드.
  - default 선택 시 EU 공식 default 값을 자동 불러오는가? → `/upload`로 DVs as adopted(국가/CN 기본값) 엑셀을 로컬 파싱해 연동(`cbamy/data/cbam-defaults.json` 미러). 미연결이면 자동 로드 불가.
  - default 사용 시 사유(기본값 사용사유)·미검증 실측 경고가 작동하는가?
  - 보고서에 "default 산정 비율"이 자동 계산되는가? → **현재 코드 기준 확인 필요** (집계 필드 노출 여부 미확정).
- **🔴 결함 신호 (P0)**: 전체 일괄 actual/default만 가능, 또는 default 값을 사용자가 직접 찾아 입력해야 함
- **🟡 부분 신호 (P1)**: 개별 토글은 되나 default 라이브러리 미연동(`/upload` 2/2 미충족) — 시나리오/벤치마크 비교 불가
- **🟢 양호**: 항목별 토글 + default 자동 로드 + default 비율 자동 집계

---

### Check #3. default 값 markup(가산) 적용
- **시나리오 트리거**: `steel-hrc.md` §3.2 FeMn default 사용. EAF 예제 워크북(`3 CBAM SEE V2.1_Example Steel 2 EAF alloys_final.xlsx`)에서 default 사용 시 markup이 반영됨
- **CBAM 실무 맥락**: 확정기간 default 값(2025/2621 기반 DV 워크북)에는 연도별 markup 포함 컬럼(2026 / 2027 / 2028+)이 별도로 존재한다. 컨설턴트가 default를 고르면 앱이 markup 포함 여부와 적용 연도를 명확히 하고 자동 적용해야 한다. 수동 적용은 누락·중복 위험. (정확한 markup 배율·적용 대상[전구물질 default 포함 여부]은 임의로 지어내지 말고 `cbamy/data/cbam-defaults.json` 및 EU DVs 원본[2025/2621]을 참조 — 불확실하면 "확인 필요". 전환기 Guidance의 "complex goods 20% 한도" 등 전환기 규칙은 확정기간에 적용 금지.)
- **앱 평가 질문**:
  - default 선택 시 markup이 자동 적용되는가, 아니면 raw default가 적용되는가? (raw direct/indirect/total과 markup 포함 연도값을 분리 보존하는가?)
  - markup 적용 여부/배율/적용 연도가 화면·보고서에 명시되는가?
  - actual로 전환 시 markup이 자동 해제되는가?
- **🔴 결함 신호 (P0)**: markup 개념 자체 미지원 (default를 actual처럼 그대로 사용 → 과소/과대산정, 컴플라이언스 위반)
- **🟡 부분 신호 (P1)**: markup은 있으나 적용 사실이 불투명 (감사 추적 곤란)
- **🟢 양호**: default 선택 시 markup 자동 적용 + 명시 + 전환 시 자동 해제

---

### Check #4. 간접배출(indirect) 포함/제외 처리
- **시나리오 트리거**: `steel-hrc.md` §4.2 전력 소비. 철강은 Annex II에 따라 인증서 의무 산정에서 **직접배출만 고려(direct-only)**되는 품목이므로, 자체 전력 간접배출은 인증서 산정 기준 SEE에서 제외하되 보고·검토용으로는 보존한다.
- **CBAM 실무 맥락**: "보고/검토용 총 SEE(direct+indirect)"와 "인증서 산정 기준 SEE(Annex II direct-only 품목은 자체 indirect 제외)"를 구분해야 한다. 앱이 이를 혼동하면 수입자에게 잘못된 의무량을 전달한다. ⚠️ 단 Annex II는 scope 제외 목록이 아니며, 비Annex II 전구물질에 내재된 간접배출은 Annex II 최종재로 흘러들어갈 수 있으므로 전구물질 indirect를 자동 0으로 만들면 안 된다.
- **앱 평가 질문**:
  - 제품(CN코드)별로 indirect 포함 여부 규칙을 안내/적용하는가? → `getIndirectEmissionsApplicability()`/`cbam-product-rules.ts`가 CN/HS **72·73(철강)** → `applicable:false`로 처리. ⚠️ 단 **응결 철광석·정광 CN 2601 12 00은 간접배출 포함(예외)** — 코드는 `2601 12 00 → 포함`으로 처리.
  - direct-only / direct+indirect를 분리해 산출·표시하는가? → `see_cbam_basis`(인증서 기준, Annex II direct-only는 자체 indirect 제외)와 `see_informational_total`(=`total_see`, own_indirect 보존)을 **분리 보존**.
  - Annex II direct-only 대상 품목을 자동 식별하는가? → CN 72/73 자동 식별. **단 한계: `cbam-product-rules.ts`는 대표 prefix(72/73)만 다루는 임시 휴리스틱이며, CN master 기반 Annex II 실제목록으로 교체 필요. CN 없으면 UNKNOWN으로 임시 포함** → §1 CN 미입력 시 오적용 위험.
- **🔴 결함 신호 (P0)**: indirect를 항상 합산만 하고 제외 시나리오를 지원하지 않음
- **🟡 부분 신호 (P1)**: 분리 표시는 되나 품목별 규칙 안내 없음 / CN 미입력 시 임시 포함으로 잘못 산정
- **🟢 양호**: 품목별 규칙 인지(2601 12 00 예외 포함) + direct/indirect 분리(`see_cbam_basis` vs `total_see`) + 제외 대상 자동 안내
- **운영 팁(씨밤이)**: `/results`에서 `see_cbam_basis`와 `total_see`를 **반드시 구분**해 받을 것. 두 값을 혼동해 수입자에게 전달하면 의무량 오류.

---

### Check #5. 전력 배출계수(EF) 선택 안내
- **시나리오 트리거**: `steel-hrc.md` §4.2 — 클라이언트가 "한전 평균 0.4594" 사용 가정. EU 예제는 'Mix' 값(예: 0.833) 사용. 어떤 EF·근거가 CBAM에서 인정되는지 모호.
- **CBAM 실무 맥락**: CBAM은 전력 EF 출처에 위계·조건이 있다. 원칙은 Commission 제공 국가·지역별 default(IEA 기반)이며, actual EF는 ① 발전원-설비 간 직접 기술적 연결 또는 ② PPA 체결분에 한해 허용되고, Guarantees of Origin·녹색인증서 등 market-based instrument는 금지된다. 컨설턴트가 임의값을 넣으면 검증 실패. (정확한 위계·조건은 `cbamy/knowledge/cbam-verification-reference.md` 참조; 불확실하면 "확인 필요".)
- **앱 평가 질문**:
  - 전력 EF 입력 시 출처 유형(국가/지역 grid default / 실측 PPA·직접연결 / 기타)을 선택·기록하게 하는가? → `/processes`는 `electricity_mwh`·`electricity_ef_tco2e_per_mwh`를 받으나, **출처 유형 분류 필드는 현재 코드 기준 확인 필요**(자유 숫자 입력 위험).
  - 선택한 출처가 CBAM에서 허용되는지 안내/경고하는가? (예: GO·녹색인증서 불가)
  - EF 출처가 보고서에 자동 기록되는가? (Communication Template C_Emissions&Energy 매핑)
- **🔴 결함 신호 (P0)**: EF를 자유 숫자로만 입력, 출처·허용성 안내 없음
- **🟡 부분 신호 (P1)**: 값 입력·반영은 되나 출처 유형/허용성 안내 부재 → 검증 단계에서 반려 위험
- **🟢 양호**: 출처 유형 선택 + 허용성 안내 + 보고서 자동 기록

---

### Check #6. 연료/원료 단위 환산 (Nm³ ↔ t ↔ GJ/TJ)
- **시나리오 트리거**: `steel-hrc.md` §3.1, §4.1 — LNG가 의뢰서엔 t, 현장은 Nm³. source stream EF는 tCO2/TJ(에너지 기준). *의뢰서가 의도적으로 충돌해 2배 오차를 유발*
- **CBAM 실무 맥락**: 연소 배출은 `활동량×NCV×EF(/TJ)` 또는 `활동량×EF(/t)`로 단위계가 갈린다. 단위 불일치는 흔한 2배·10배 오차 원인.
- **앱 평가 질문**:
  - 연료 입력 시 단위(Nm³/t/GJ)를 선택하고 NCV로 자동 환산하는가? → `/source-streams`는 활동자료·단위·순발열량(NCV)을 받고, FUEL/Combustion이면 `활동자료 × NCV × EF × 산화 × 전환 × 화석비율 / 1000`으로 계산.
  - 활동량 단위와 EF 단위의 정합성을 자동 검사/경고하는가? (예제 워크북 "AD+EF Units consistent?" 체크 대응) → **현재 코드 기준 정합성 자동검사 명시 확인 필요.**
  - 환산 중간값을 화면에 표시해 검증 가능한가?
  - **한계(현재 코드 기준)**: EU export는 단위 **t·Nm3만 허용**, FUEL은 Combustion+NCV>0 강제. GJ 등 기타 단위는 export 단계에서 막힐 수 있음.
- **🔴 결함 신호 (P0)**: 단위 환산·정합성 검사 없음 → 수기 환산 의존
- **🟡 부분 신호 (P1)**: 환산은 되나 단위 정합성 경고 없음 → §4.1 LNG t/Nm³ 충돌을 앱이 못 잡음
- **🟢 양호**: 단위 선택 + NCV 자동 환산 + 정합성 검사 + 중간값 표시

---

### Check #7. 물질수지(mass balance) 음수(차감) 처리
- **시나리오 트리거**: `steel-hrc.md` §4.1 — 조강·슬래그가 산출 측 차감(C 함량 기준 음수). 흑연전극·고철·합금철은 투입 측 양수.
- **CBAM 실무 맥락**: 전기로 직접배출은 종종 물질수지(투입 탄소 − 산출물 탄소)로 산정. 산출물(조강·슬래그·합금)을 음수로 반영하지 않으면 직접배출이 크게 과대산정된다.
- **앱 평가 질문**:
  - source stream에 mass balance 방법과 투입/산출(±) 부호를 지원하는가? → `/source-streams` method에 Mass balance 존재(EU export 허용 method). 산출물 차감(음수) 부호 지원은 **현재 코드 기준 확인 필요.**
  - 탄소함량(tC/t)→CO2 환산(×44/12)을 자동 처리하는가?
  - 물질수지 총합이 음수가 되지 않도록 검증/경고하는가?
  - **주의(현재 코드 기준)**: SEE 분자에는 사용자 입력 `direct_attributable_emissions_tco2e`를 쓰고, source stream 합계는 **델타 검증(불일치 경고)** 에만 사용. 즉 물질수지를 source stream에 정확히 넣어도 자동으로 direct_see를 갱신하지 않으므로, 컨설턴트가 직접귀속배출량 값을 별도로 맞춰야 함.
- **🔴 결함 신호 (P0)**: 양수 투입만 입력 가능, 산출물 차감 미지원
- **🟡 부분 신호 (P1)**: 부호는 되나 직접배출량과 자동 동기화 안 됨(델타 경고만)
- **🟢 양호**: 투입/산출 부호 + 자동 탄소→CO2 환산 + 균형 검증

---

### Check #8. 사내 precursor 흐름(P1→P2) 배분
- **시나리오 트리거**: `steel-hrc.md` §2, §4.3 — P1 조강 2,234,000 t 중 1,007,000 t 시장 출하 / 1,227,000 t P2 투입
- **CBAM 실무 맥락**: 한 공정의 산출물이 다른 공정의 precursor가 될 때, SEE는 "production process 단위"로 분모(총생산량)에 정규화된 뒤 다음 공정으로 전가된다. 시장 출하분과 내부 이송분을 정확히 나눠야 P2 제품 SEE가 맞다.
- **앱 평가 질문**:
  - 공정 산출물을 "시장 출하 / 타공정 투입 / 비CBAM 용도"로 분배 입력할 수 있는가? → `/processes`가 공정 총생산량·시장출하/내부소비량, 제품 생산라인(ProductOutputLine, 배분기준 MASS/MANUAL)을 받음.
  - 분배 합계가 총생산량과 일치하는지 control 검산을 하는가? (예제 워크북 (e) Control 행) → 생산라인 합계≠공정 총생산량이면 경고. 배분기준 혼용도 경고.
  - P1 SEE가 P2로 자동 전가되는가? → precursor 합산(Check #1) 경로로 연결되나, **공정→공정 자동 체이닝 범위는 현재 코드 기준 확인 필요**(MVP 단계적 확장).
- **🔴 결함 신호 (P0)**: 단일 제품·단일 공정만 가정, 공정 간 흐름 미지원
- **🟡 부분 신호 (P1)**: 흐름은 되나 control 검산/총량 일치 검증 미흡, P1→P2 전가 수동
- **🟢 양호**: 다공정 분배 + control 검산 + 자동 전가

---

### Check #9. 탄소가격(K-ETS) 보고 및 통화/환율 처리
- **시나리오 트리거**: `steel-hrc.md` §4.5 — K-ETS로 일부 직접배출에 KRW 탄소비용 지불. 예제 워크북은 carbon price + rebate를 보고.
- **CBAM 실무 맥락**: 원산지에서 실효적으로 지불한 탄소가격은 CBAM 인증서 의무에서 차감될 수 있다. 통화(KRW)·환율·정산비율(covered share)·환급(rebate)·적용범위(direct/indirect) 입력이 필요하다. 증빙 없으면 0으로 가정하며, 상태(pending/estimated/confirmed)로 관리하고 라벨된 입력 이상으로 하드코딩 차감하지 않는다.
- **앱 평가 질문**:
  - 탄소가격 제도 유형·통화·단가·적용비율(covered share)·rebate를 입력할 수 있는가? → `/scenarios`가 원산지·기본값 연도·CBAM factor·CSCF·인증서가격(EUR) 가정을 받음. **K-ETS 통화/단가/rebate 전용 입력은 현재 코드 기준 확인 필요.**
  - 통화 환산(KRW→EUR)과 적용 시점 환율을 처리·기록하는가?
  - "실효 carbon price due"가 자동 계산되는가? (예제 Summary_Products 'Effective CP due' 열)
  - **주의(현재 코드·README NOTICE 기준)**: `/scenarios` 인증서 지표는 **사전 검토용 지표**이며, 유상 탄소가격 차감 등 확정요소는 보수적으로 제한. 최종 declaration·Registry·검증자료는 별도 확인 필요.
- **🔴 결함 신호 (P0)**: 탄소가격 입력 자체 미지원
- **🟡 부분 신호 (P1)**: 입력은 되나 통화 환산·실효값 계산 없음 / 검토용 지표 한계 미고지
- **🟢 양호**: 제도/통화/비율/rebate 입력 + 환율 환산 + 실효 CP 자동 계산

---

### Check #10. EU Communication Template 출력 / 수식·양식 보존
- **시나리오 트리거**: `steel-hrc.md` §1, §5 — 고객사가 보낸 공식 'CBAM Communication template for installations' 엑셀을 채워야 하고, 빨간 에러 셀이 문제
- **CBAM 실무 맥락**: EU 양식은 잠긴 수식·드롭다운·조건부서식·완결성(completeness) 체크가 내장돼 있다. 앱이 export할 때 이 구조를 깨면 고객사가 못 쓰거나 검증에서 반려된다. (이 워크북은 법령이 아니라 설비운영자↔신고declarant 간 데이터 통신 도구이며, 원본 시트·라벨·수식·보호영역을 보존해야 한다.)
- **앱 평가 질문**:
  - 산정 결과를 EU 공식 Communication Template(installations) 양식에 매핑해 export하는가? → `/export` + `eu-template-export.ts`: 사용자가 보유한 **원본 .xlsx 복사본**에만 입력셀 기록(원본 불수정 원칙).
  - 양식의 수식/드롭다운/조건부서식/완결성 체크를 보존하는가? (값만 덮어쓰지 않고) → **공식 수식 셀은 절대 덮어쓰지 않음**(Summary_Products SEE는 Excel이 재계산). 필수 시트 19개 검증, 셀 스타일 속성 `s` 보존, `verifyExportCellWrites()` 대조.
  - CN코드·CN명·제품명·SEE(dir/indir/total)·default비율·합금조성·탄소가격 등 **필수 보고 필드**가 빠짐없이 채워지는가? → A_InstData/B_EmInst/C_Emissions&Energy/D_Processes/E_PurchPrec/Summary_Products 매핑. **단 Summary_Products는 공정명·CN·제품명만 채우고 SEE는 비워 Excel 공식에 위임** → 앱 검토값과 Excel 재계산값을 수동 대조해야 함(§11 단계).
  - "Missing entries?" 같은 미입력 경고를 사전 해소하는가? → 오류 0건이어야 다운로드 가능(`canExportDraft`), 경고는 다운로드 가능하되 전달 전 검토 권장.
- **🔴 결함 신호 (P0)**: 자체 양식 PDF만 출력, EU 템플릿 미지원 → 컨설턴트가 수기 전기(轉記)
- **🟡 부분 신호 (P1)**: 값은 채우나 수식/서식이 깨지거나 일부 필드 누락 / Summary_Products SEE 수동 대조 미고지
- **🟢 양호**: EU 템플릿 자동 매핑 + 수식·서식 보존 + 필수 필드 완결 + 미입력 사전 경고
- **한계(현재 코드 MVP 상한)**: 생산공정 10·구매 precursor 20·배출원 75·Summary_Products 행 100 초과 시 export 오류. 대형 철강소 데이터는 초과 가능 → 사전 분할 필요.

---

## 추가 평가 항목 (시나리오 외)

### App-1. CN코드 검증
- `steel-hrc.md` §1 — 의뢰서의 CN코드(예: 7218 99 11 / 7219 13 / 7221 00 등 슬래브·시트·봉강 류)가 제품 설명·CBAM 대상 범위와 일치하는지 앱이 검증/경고하는가? CN명 자동 매칭이 있는가?
- 앱 근거: `/products`가 CN **8자리** 입력·품목군(hs_group 72/73) 판정. export 시 업로드 템플릿의 Parameters_CNCodes로 CN→goods 매핑, 제품 CN이 거기 없으면 **export 오류**로 차단. (위 CN 숫자는 예시 — 실제 시나리오 코드는 `steel-hrc.md` 및 `CN CBAM codes.pdf`에서 확인.)

### App-2. 신규 프로젝트 진입 흐름 (CBAM 필수 메타)
- installation 정보, reporting period(`/periods`, Excel serial 변환), aggregated goods, production route, 국가코드/주소 등 CBAM 필수 메타데이터를 빠짐없이 안내·검증하는가? → `/installations`·`/periods`·`/products`·`/guide`(12단계 → 3묶음)로 안내. UNLOCODE 등 일부 필드 매핑은 현재 코드 기준 확인 필요.

### App-3. 완결성(completeness) / 에러 가시화
- 예제 워크북의 "Incomplete?"·"Error?"·조건부서식처럼, 미입력·논리오류·균형불일치를 실시간으로 표시하는가? → `/results`가 제품별 SEE·배출원 불일치(델타)·전구물질 경고를 수정 링크와 함께 정리. `/export` 체크리스트 8항목 배지(오류 0건이 다운로드 게이트).

### App-4. 보고서/Export 완결성
- Export 산출물에 CBAM 필수 보고 요건(FU=t goods, 경계, SEE 분해 dir/indir/precursor, default 비율, EF 출처, 데이터품질, 탄소가격)이 모두 포함되는가? XLSX/EU 템플릿 호환? → EU 템플릿 매핑은 양호하나, **default 비율·EF 출처 자동 기록·Summary_Products SEE 채움은 한계**(Check #2/#5/#10 참조).

### App-5. 한국어 / 단위 / 규제 적합성
- 한국어 UI 자연스러운가? t/Nm³/GJ/MWh/tCO2e 등 단위 지원? K-ETS·한전 EF 등 국내 맥락을 CBAM 양식으로 매핑 안내하는가? → 한국어 로컬-퍼스트 PWA. 단위는 t·Nm3가 export 1급(GJ 등은 환산/제약). 국내 EF·K-ETS의 CBAM 허용성 안내는 Check #5/#9 한계와 연동.

---

## Phase 2 실행 후 활용 방법

1. 씨밤이의 산출물 4종을 받음 — `cbamy/runs/<YYYY-MM-DD>_runNN/`의 `see-result.md` / `usage-log.md` / `improvement-suggestions.md` / `client-questions.md` (포맷: `cbamy-regression-run` 스킬 templates/output-formats/*)
2. 본 문서 Check #1~#10 + App-1~5를 순회하며:
   - 씨밤이가 해당 이슈를 만났는지 (`usage-log.md` 확인)
   - 앱이 어떻게 대응했는지 (양호/부분/결함 등급 부여)
   - 씨밤이의 개선 제안이 본 항목과 일치하는지 비교 (`improvement-suggestions.md`)
3. 결함(🔴/P0) 항목은 **진짜 컨설턴트 사용 전 우선 수정 대상**
4. 부분 지원(🟡/P1)은 진짜 컨설턴트 피드백을 추가로 받을 사항으로 분류
5. 채점 기준은 `cbamy-regression-run/scoring-rubric.md` 참조.

> **특히 주목할 고위험 함정** (이 시나리오 고유):
> - **Check #1 precursor SEE 전가** — 누락 시 SEE 과소산정 (합금철 비중이 커서 영향 큼)
> - **Check #3 markup** — default를 raw로 쓰면 컴플라이언스 위반
> - **Check #4 indirect 제외** — Annex II direct-only 인증서 의무에서 흔히 오적용(특히 CN 미입력 시 UNKNOWN 임시 포함, CN 2601 12 00은 간접 포함 예외)
> - **Check #6 LNG 단위(Nm³/t)** — 의뢰서가 의도적으로 충돌, 2배 오차 유발
> - **Check #10 EU 템플릿 수식 보존** — export가 양식을 깨면 고객사 반려 (앱은 복사본·수식 비훼손 원칙이나 Summary_Products SEE는 수동 대조 필요)

---

## 크로스레퍼런스
- 시나리오 본문: `cbamy/scenarios/steel-hrc.md`
- 페르소나/디자이너: `cbamy/persona.md`, `cbamy/designer-persona.md`
- 데이터셋(공식 기본값·벤치마크): `cbamy/data/cbam-defaults.json`
- 검증 KB: `cbamy/knowledge/cbam-verification-reference.md`, 참조 인덱스: `cbamy/knowledge/cbam-reference-index.md`
- 회귀 실행 스킬: `cbamy-regression-run/SKILL.md`, 채점: `cbamy-regression-run/scoring-rubric.md`
- 원본 EU 자료(운영자 보관): `CBAM_documents/3 CBAM SEE V2.1_Example Steel 2 EAF alloys_final.xlsx`, `CBAM Communication template for installations_en_20241213.xlsx`, `DVs as adopted_v20260204 .xlsx`, `CBAM Benchmarks_20260206.xlsx`

---

## Changelog
- **v0.1 (2026-06-13)**: EU EAF alloys 예제 워크북 기반 철강 HRC CBAM SEE 시나리오의 앱 검증표 최초 작성. 카보니 `nickel-sulfate-app-checks.md` 구조를 CBAM 도메인으로 미러링. CBAM 고유 함정(precursor 전가·default markup·indirect 제외·EU 템플릿 보존) 중심 10개 Check + App 5개 구성. 각 항목에 CBAM_Platform 현재 코드(`calculation-engine.ts`/`cbam-product-rules.ts`/`eu-template-export.ts`/화면 흐름) 근거·한계 주석 반영.
- **v0.1.1 (2026-06-13, 검증 교정)**: CBAM 규정 정합성 교정 — Check #4 용어를 "Annex 적용 품목"→"Annex II direct-only 품목"으로 정정하고 CN 2601 12 00 간접배출 포함 예외·Annex II≠scope제외·전구물질 indirect 보존 원칙 추가; Check #3 markup에 연도별(2026/27/28+) markup 포함 컬럼·raw값 분리 보존·전환기 20% 한도 비적용 명시; Check #5 EF에 default 원칙 및 actual 허용조건(직접 기술적 연결/PPA), GO·녹색인증서 금지 추가; Check #9 carbon price에 적용범위·상태관리·하드코딩 차감 금지 추가; Check #10에 통신도구 성격·보호영역 보존 보강.
