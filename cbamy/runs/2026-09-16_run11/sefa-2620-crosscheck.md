# 2025/2620 원문 대조 — 비용 시나리오의 「기본값이 유리」 결론

- **대조일**: 2026-09-18
- **대상**: run11 P0 후보 — /scenarios가 실측 SEE 3.5754 < 기본값 3.8214인데도 「기본값이 유리 −€39,355」라고 권한 건
- **결론**: **앱 결함 확정(P0).** 규정은 복합제품의 무상할당량에 전구물질 몫을 더하라고 하는데, 앱은 공정 몫만 뺐다. 고친 뒤 결론이 「실측이 유리」로 뒤집힌다.

## 읽은 자료

| 자료 | 위치 | 성격 |
|---|---|---|
| Implementing Regulation (EU) 2025/2620 국문 번역 (전문·제1~5조·부속서) | `CBAM_documents/additional_documents_20260530/260204_EUCBAM_TranslationKorean_v5.pdf` 552~566쪽 | **비공식 번역본** |
| 제6차 EU CBAM 대응 정부합동 설명회 자료 — 철강 공급망 SEFA 예제 | 같은 폴더 `20261차설명회발표자료집.pdf` 96~98쪽 | 정부 설명자료 |
| CBAM 벤치마크 워크북 | `CBAM_documents/CBAM Benchmarks_20260206.xlsx` | EU 공식(비구속) |

> **2026-09-18 추가 — 영문 원문 대조 완료.** EUR-Lex는 스크립트 접근을 막지만 실제 브라우저로는 열린다. 원문(OJ L, 2025/2620, 22.12.2025)을 `CBAM_documents/EU Verification/OJ_L_202502620_EN_TXT.txt`로 받아 부속서 제1~5항을 대조했다. 번역본과 내용이 같다. 식 자체는 원문에서 이미지라 텍스트에는 변수 정의만 남는다.
>
> | 항 | 영문 원문 |
> |---|---|
> | 3.1 | "BMg* is the **process-related** CBAM benchmark for the production process which yields good g … as set out in point 5, **Column A**" |
> | 3.3 | "For a complex good, the calculation of the SEFA shall take into account the production process **as well as the SEFA of each precursor**" (Equation 4) |
> | 3.3 | "mi is the specific mass of precursor i consumed for the production of one tonne of good g" · Equation 5: Mi,y ÷ ALi,y |
> | 3.3(2) | "where the value for the precursor i is **not provided by the producer** … is determined by selecting the appropriate BMg value from point 5, **Column B**" — 원산지·CN·추가 매개변수·기본 생산경로를 고려 |
> | 4 | "BMg is the default CBAM benchmark set out in point 5, **Column B**" (Equation 6) |
> | 5.1 | "Where different alloy grades for steel are given in the table for the same CN code, the **highest benchmark value** given for the relevant production year is used." |

## 규정이 말하는 것

**제2조·부속서 제3항 — 실제값을 쓰는 경우**

- 식 (2)·(3): 단순제품 `SEFA = CBAM_y · CSCF_y · BM*_g`. `BM*_g`는 "부속서 제5항 **A열**에 명시되어 있으며, 상품 g를 생산하는 **생산 공정에 대한 공정 관련** CBAM 벤치마크 값".
- 식 (4): 복합제품 `SEFA_g = SFAProc_g + Σ mᵢ · SEFAᵢ`. "복합제품의 경우 … 생산공정 뿐만 아니라 **각 전구물질의 고유한 내재 무상배출량을 모두 고려해야** 하며".
- 식 (5): `mᵢ = Mᵢ / AL` — 제품 1 t당 전구물질 투입량.
- 3.3(1): 전구물질 SEFAᵢ를 생산자가 주고 검증됐으면 그 값.
- 3.3(2): "생산자가 전구물질 i에 대한 SEFAᵢ 값을 제공하지 않은 경우 … 부속서 5항 **B열**에 명시된 적정 BM 값을 선정하여 SEFAᵢ 값을 결정한다."

**제3조·부속서 제4항 — 기본값을 쓰는 경우**

- 식 (6): `SEFA = CBAM_y · CSCF_y · BM_g`, `BM_g`는 "부속서 제5항 **B열**에 설정된 기본 CBAM 벤치마크".

**전문 (7)·(8)**: 실제 무상할당 조정량에는 "해당 설비에서 사용되는 투입 원료(원료물질)를 생산하는 공정도 고려되어야 한다". 기본 벤치마크(B열)는 "배출량 기본값 산정에 사용되는 것과 동일한 조건 … 을 반영".

즉 **A열은 그 공정 한 단계 몫, B열은 상류까지 쌓인 몫**이다. 워크북 숫자도 그렇게 읽힌다(나사 7318 15 52: A 0.038 / B 1.154, STS 와이어 7223 00 19: A 0.109 / B 1.225).

**정부 설명회 예제(98쪽)** 도 같은 구조다: "SEFA_FeMn,DV와 SFA_BOF를 사용해 계산 — SEFA_FeMn,DV = 0.975 × 1 × 1.361 = 1.32698". 전구물질 SEFA(B열 × CBAM factor × CSCF)를 공정 SFA에 더한다.

## 앱이 하던 것

`src/lib/scenario-calculation.ts` — 실측 쪽은 `A열 × CBAM factor × CSCF`만 뺐다(식 (2)·(3)만 구현, 식 (4)의 Σ 항 없음). 기본값 쪽은 식 (6)대로 B열을 뺐다. 전구물질이 SEE의 대부분인 가공품에서는 실측 쪽 차감이 30배 작아져, 실측 SEE가 더 낮아도 인증서가 더 많이 나왔다.

## 고친 것

- 엔진 결과에 제품라인별 전구물질 투입량(`precursor_inputs`)을 싣는다.
- 실측 SEFA = 공정 몫(A열) + Σ (투입 원단위 × 전구물질 B열) × CBAM factor × CSCF. 앱은 공급사의 검증된 SEFA를 받지 않으므로 3.3(2)의 B열 경로만 쓴다.
- 전구물질 벤치마크를 못 찾으면 그 몫을 0으로 두고 화면에 알린다(값을 지어내지 않는다).
- /scenarios 상세 표의 「CBAM 기준 SEFA」에 「공정 + 전구물질」 내역을 표시한다.

## run11 숫자 (EU 수출 620 t, 인증서 €75.36 가정, P0 수정 후 SEE 3.7637 기준)

| | 수정 전 | 수정 후 |
|---|---|---|
| 실측 SEFA (tCO₂e/t) | 0.0371 | **1.3346** (공정 0.0371 + 전구물질 1.2976) |
| 실측 인증서 (장) | 2,311 | **1,506** |
| 기본값 인증서 (장) | 1,672 | 1,672 |
| 결론 | 기본값이 유리 | **실측이 유리** (약 166장, €12,500) |

전구물질 몫 = (3,520 ÷ 3,240) × 1.225 × 0.975. run11 당시 화면의 2,194장은 P0 수정 전 SEE(3.5754) 기준이었다.

## 남은 확인 사항

1. ~~영문 원문 대조~~ — 완료(위 표).
2. **3.3(2)(a)~(d)의 B열 선택** — 전구물질의 원산지·생산경로·합금 등급에 따라 B열 값이 갈리는 CN이 있다(같은 CN에 값이 둘 이상이면 5.1은 "가장 높은 값"). 앱은 CN과 생산경로 문자열로만 찾는다.
3. ~~**공급사가 검증된 SEFAᵢ를 준 경우(3.3(1))** — 입력 칸이 없다. 실측 공급사 자료가 있으면 B열보다 정확하다.~~ 2026-09-19 입력칸 추가. /precursors의 "공급사 제공 SEFA"에 넣고 검증 상태가 "검증완료"일 때만 B열 대신 쓴다. 값은 CBAM factor·CSCF가 반영된 최종값으로 받는다.
4. **전구물질의 보고기간(2025/2547 제13조)** — (1)·(2) 시기 구분에 따라 벤치마크가 달라지는 품목이 있다.
5. 이 지표는 여전히 **사전 검토용**이다. 실제 조정량은 신고인이 검증자료로 산정한다.
