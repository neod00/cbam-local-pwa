# 전구물질(Precursor) 데이터 수집·적용 — 리서치 & 앱 로드맵

**작성**: 2026-07-15 (씨밤이 리서치) · **기준**: 2026 확정기간
**근거**: CBAM Guidance(231121, 개념), CBAM Q&A, EU Communication Template `E_PurchPrec`, 공식 예제 `4 CBAM SEE V2.1 Screws and nuts`, DVs as adopted v20260204, 앱 코드(calculation-engine·local-db·eu-template-export·precursors)
**용도**: 전구물질 처리의 규정 근거·앱 갭·구현 우선순위를 한 곳에 고정. 향후 구현·씨밤이 회귀의 참조.

> ⚠️ Guidance/Q&A는 전환기(2023/1773) 문서 — 개념 정의는 유효하나 **수치·한도(20% 등)는 확정기간에 적용 금지**. 확정기간 정밀 규칙은 2025/2547·2621 원문 확인 필요.

---

## 1. 전구물질이란 / 무엇이 아닌가 (Q&A #58, #89, #90)
- **전구물질(relevant precursor)** = complex CBAM good 생산에 투입·소비되는 **그 자체가 CBAM good인 원료**. (예: 시멘트 클링커, 나사의 선재/강재)
- **부자재는 전구물질 아님**: lime·coke는 CBAM good이 아니므로 전구물질에서 제외. 정수·압축공기는 경계 포함. → 앱의 "윤활유·소모품 제외" 안내와 정확히 일치.
- **정상 투입재 vs 전구물질**(Guidance 각주10): 정상 투입재는 그 탄소가 CO₂로 산화되는 몫만 직접배출로 반영. 전구물질은 **추가로 그 원료가 이미 지니고 온 내재배출(direct+indirect)을 가산**.
- 예외: 응결 철광석·정광 CN 2601 12 00("sintered ore") = pig iron/DRI의 전구물질이며 **간접 포함**.

## 2. 데이터 수집 절차 (Guidance Step 2)
- **자가생산 전구물질**(같은 설비): 요청 없이 자체 내재배출을 직접 합산.
- **구매 전구물질**: 공급사·설비별로 다음 5종 요청 —
  1. 생산 설비 식별정보
  2. **direct + indirect 특정내재배출(SEE)** (분리)
  3. 생산경로(production route) + Annex IV §2 추가변수
  4. 공급사의 보고기간
  5. (해당 시) 지불 탄소가격 — **무응답 시 0으로 가정**
- 각 전구물질의 **공정별 소비량**을 보고기간 동안 모니터링.
- **공통 템플릿**(voluntary)으로 다국·다언어 공급사 통신 표준화 권장.
- **EU산 전구물질도 가산 대상**(Q&A #61) — 단 EU에서 지불한 탄소가격은 반영 가능.

> ⚠️ **위 5종 중 ①설비 식별정보·④보고기간은 EU Communication Template에 전송 셀이 없다**(2026-07-15 공식 템플릿 `..._en_20241213.xlsx` 직접 확인, P2-run06-01 해소). 템플릿의 전구물질 등록(A_InstData 102+)은 `품목군·Country code·Route 1–5·Name`만, E_PurchPrec 상세는 `소비량 표 + SEE(직접·전력사용량·전력계수·간접·Source·기본값 근거)`만 받는다. → ①④는 **담당자 자체 기록·검증용**이며 앱은 `supplier_installation`·`supplier_reporting_period`를 추적성 메타데이터로만 보존(전송 매핑 불필요). ②③⑤는 각각 SEE 셀·경로 셀·(탄소가격은 신고인 몫)로 처리.

## 3. 기본값(DV) 규칙 (Guidance 6.1.5–6.1.6)
- actual 미입수 시에만 DV 사용. DV는 **CN 4/6/8자리 + 생산경로 + 품목군**별, **direct/indirect 분리** SEE(tCO₂e/t).
- 8자리는 대개 철강(경로·합금 반영). DV는 보수적(높게) → 실측이 유리한 경우 많음.
- ⚠️ **"complex good 20% 한도"는 전환기 전용**(Table 4-1 Transitional). 확정기간엔 적용 금지.
- 공식 DV(KR): 예 CN 7213 `direct=2.118, indirect=null, markup_2026=2.330` → **철강 DV는 간접값 미제공**.

## 4. 공식 예제 — 나사·너트 (`E_PurchPrec`, `Summary_Products`)
전구물질이 최종재로 흐르는 실제 숫자:

| 전구물질 | 구매/소비 | 직접 SEE | 간접 SEE | 모드 |
|---|---|---|---|---|
| Carbon steel | 20,000 t → 탄소강나사 20,000 t | 1.539 | **0.204 = 0.346 MWh/t × 0.590 tCO₂/MWh** | Measured |
| High alloy steel | 10,000 t → STS나사 10,000 t | 1.44 | 2.279 (2.08 MWh/t × 0.833) | Measured |

→ 최종재(Summary_Products): 탄소강나사 CN 73181542 **직접 2.007**(자체+전구물질 1.539)·간접 0.407·**총 2.414**. STS나사 CN 73181535 총 4.231.

**두 가지 구조적 확인:**
1. **간접 SEE = 전력사용량(MWh/t) × 전력계수(tCO₂/MWh)** — 템플릿 `E_PurchPrec (e)`는 사용량·계수 **2개 입력**을 받음. 앱은 간접을 **단일 SEE 1개**로 저장하고 `사용량1×계수=간접`으로 우겨넣는 임시 bridge(eu-template-export.ts L36/L37).
2. **다제품 배분 = `E_PurchPrec (b)` "제품별 소비량 표"** — 한 전구물질을 최종제품별 소비량으로 나눔(Carbon steel 20,000 t → 탄소강나사 20,000 / STS나사 0). 앱의 `output_allocations` 모델과 일치.

## 5. 상황 유형표 (여러 상황 × 앱 상태)

| # | 상황 | 수집 | 적용 | 앱 현재 |
|---|---|---|---|---|
| ① | 공급사 실측 회신 | 회신값 | direct+indirect 그대로 | ✅ 완전 |
| ② | 공급사 무응답 → DV | 국가×CN×연도 | markup 포함(철강 간접0) | ✅ (run02) |
| ③ | 반쪽 실측(SAD) | 자체 실측+일부 DV | 혼합 | △ 필드만 |
| ④ | 다수 공급사 믹스 | 여러 출처 | 소비량 가중 SEE | ✅ 가중 헬퍼 |
| ⑤ | 한 원료 → 여러 제품 | 동일 | 제품별 배분 | △→✅ (본 작업으로 UI 추가) |
| ⑥ | 전구물질의 전구물질 | 공급사 합산 제출 | 재귀 | △ "합산 포함" 전제 |
| ⑦ | 스크랩/재활용 | SEE 특례 | 특례(≈0) | ✅ 안내 + CN 7204 경고 |
| ⑧ | 비CBAM 소비·재고이월 | 구매 vs 소비 | 분리 차감 | ✅ consumed_for_non_cbam |
| ⑨ | 국내산 vs 수입산 | supplier_country | DV 국가 매칭 | ✅ |

## 6. 구현 로드맵 (트리거 기반)

> **원칙**: 아래 백로그 중 "지금 안 하면 숫자가 틀리는" 항목은 없다(코어 흐름은 정확). 달력이 아니라 **실제로 그 상황이 터질 때**(demand-driven) 구현한다. PR #5 머지 → 파일럿 사용자 → 실제로 부딪히는 상황부터.

| 항목 | 근거 | 상태 | 언제(트리거) |
|---|---|---|---|
| **다제품 배분 UI (⑤)** | E_PurchPrec (b), 엔진 지원 | ✅ 완료 (95315ab) | — |
| **스크랩 안내 (⑦)** | Guidance §5.6, Q&A(zero embedded) | ✅ 완료 | CN 7204(고철)·720246 제외 페로알로이를 `getCbamCoverage` NOT_COVERED로 명시 + 전구물질 패널 안내·실시간 CN 경고 |
| **다수 공급사 믹스 (④)** | 실무, E_PurchPrec 1블록/원료 | ✅ 완료 | 전구물질 패널 "여러 공급사에서 사왔어요(가중 계산)" 헬퍼 — 공급사별 소비량·SEE → **소비량 가중평균 SEE**를 한 줄에 채움 |
| **간접 SEE 2입력 분리(bridge)** | E_PurchPrec (e) 실구조 | ✅ 완료 | 전구물질 패널 "간접분을 전력사용량×계수로 입력" — 공급사가 사용량(MWh/t)·계수(tCO₂e/MWh)를 따로 주면 그 실제 분해를 저장(`indirect_electricity_mwh_per_t`·`_factor_tco2e_per_mwh`)해 E_PurchPrec L+36/L+37에 그대로 기재(synthetic 1×값 대체). 미입력 시 현행 fallback. **엔진은 단일 간접 SEE만 사용**(분해값 무시) |
| **SAD 비교 (③, 전구물질 단위)** | KB §2 | ✅ 완료 | 전구물질 패널 "실측 vs 기본값 비교(비용 판단)" — 현재 CN의 공식 DV를 조회해 실측 총 SEE와 나란히 비교, t당·소비량 기준 차이와 유리/불리 판정(읽기전용). 제품 단위 비교는 기존 /scenarios가 담당 |
| **공급사 5종 필드(생산경로·보고기간·설비ID)** | Guidance Step 2 | ✅ 완료 | 전구물질 패널 "공급사 상세(검증용, 선택)" — 설비명·생산경로·보고기간(신규 `supplier_reporting_period`). 믹스 출처에 공급사별 내역 기록(P2-run05-01 해소). direct/indirect SEE는 기존. **탄소가격은 신고인 몫→범위 밖** |
| DV 매칭에 생산경로 축 (⑨ 정밀화) | 6.1.6 | 백로그 | 같은 CN이 **생산경로별로 DV가 다른** 케이스 등장 시 |
| 전구물질의 전구물질/재귀 (⑥) | Q&A #61 | 보류·드롭 후보 | 공급사가 하위 전구물질 포함 **전체 SEE 제출** → 가공사엔 불필요. **제철사로 타겟 확장 전엔 안 함** |
| 탄소가격(무응답=0) | Guidance Step 3 | 후순위 | 신고인(EU 수입자) 몫 — 가공사 앱 범위 밖 |

> ④·⑤·⑦·5종필드·bridge·③ SAD비교 완료. 남은 ⑥ 재귀는 제철사 타겟 확장 전까지 보류(가공사엔 불필요).

## 7. 근거 위치
- Guidance: 공급사 요청 5종(Step 2, 문서 §), DV 규칙(6.1.5/6.1.6), 20% 전환기 한도(Table 4-1).
- Q&A: 전구물질 정의(#58), bubble approach(#60), EU 전구물질(#61), lime/coke 제외(#89), sintered ore(#90).
- 앱: calculation-engine.ts(getPrecursorAllocatedMassForLine), local-db.ts(PurchasedPrecursor·PrecursorOutputAllocation), eu-template-export.ts(E_PurchPrec 매핑), reference-workbooks.ts(findDefaultValueReference).
