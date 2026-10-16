# 외주·관계사 공정의 규정 근거 (2026-10-16)

체결부품 업체(풍강·진합·S&W·KPF형)는 열처리·코팅·도금 일부를 외주·관계사·소사장에 맡긴다. 앱과 서식에는 이 공정을 받을 자리가 없다. 이 문서는 그 처리를 정하기 전에 규정 원문에서 확인한 근거를 모은 것이다.

읽은 원문: Implementing Regulation (EU) 2025/2547(산정 방법, OJ L 22.12.2025), CBAM Guidance for installation operators(2023-11-21, 전환기간판 — 개념만 참고), CBAM Q&A, Delegated Regulation 2025/2551(검증).

## 1. 결론 요약

| 질문 | 근거 | 답 |
|---|---|---|
| 외주로 보낸 공정이 철강제품의 경계 안인가 | 2547 부속서 I 3.16.2 | 공정 종류로 정한다. **열처리(재가열·소둔)·코팅·용융아연도금·선재 인발은 경계 안**, **전기도금(plating)·절단·용접·마무리는 경계 밖**. 누가 하든 같다. |
| 경계 안 공정을 다른 사업장이 하면 그 배출을 우리 직접배출에 더하나 | 2547 제4조 1항 | **아니다.** 생산공정은 「사업장의 시스템 경계 안에서」 정한다. 다른 사업장의 연료·전력은 우리 직접·간접배출이 아니다. |
| 그러면 그 배출은 어디로 들어가나 | 2547 제2조 (7) · 부속서 II E(2) · 제14조 · Q&A 91 | **전구물질로 들어간다.** 외주처에서 돌아온 부품(예: 열처리된 볼트, CN 7318)은 부속서 I 품목이라 「전구물질」이고, 「다른 사업장에서 받은 전구물질」의 자료(나라·사업장·내재배출)를 갖춰야 한다. Q&A 91: 사업장을 나눠도 최종 내재배출은 달라지지 않아야 한다 — 전구물질이 빠짐없이 반영되기 때문. |
| 일부는 자체, 일부는 외주로 처리하면 | 2547 제14조 2·3항 | 같은 CN 전구물질을 여러 사업장에서 받으면 기본은 가중평균. 어느 공정에 어느 사업장 것만 썼는지 증빙하면 그것만 쓴다. |
| 같은 부지 안 협력업체(소사장) | 2547 제4조 7항 · 2023/956의 「사업장」 정의(고정된 기술 단위) | 판단이 필요하다. 사업장을 나누는 것은 상업적 이유가 있을 때만 허용된다(우회 목적 금지). 우리 부지·우리 설비에서 하는 공정이면 같은 사업장으로 보고 연료·전력을 포함하는 쪽이 안전하다. |
| 부속서 II A.5 22(g) 「control of outsourced processes」 | 2547 부속서 II A.5 point 22 | **생산 외주가 아니다.** 자료 품질 관리 체계(측정기 관리·위험평가·IT·직무 분리…) 중 「외주로 맡긴 자료 처리·관리 활동」의 통제다. 근거로 잘못 쓰지 않는다. |

명시된 답이 없는 것: 소유권이 넘어가지 않는 임가공(toll processing)을 다른 사업장의 「생산」으로 보는지, 그때 돌아온 부품의 기본값을 무엇으로 하는지는 원문·가이던스·Q&A 어디에도 직접 나오지 않는다. 아래 3장의 해석은 일반 규칙에서 끌어낸 것이다.

## 2. 원문

**부속서 I 3.16.2 (Iron or steel products — System boundary)**
> direct emissions monitoring shall take into account: all processes directly or indirectly linked to the production processes emitting CO2 emissions from combustion of fuels and process emissions from flue gas treatment, including re-heating, re-melting, casting, hot rolling, cold rolling, forging, annealing, coating, galvanizing, wire drawing, pickling and excluding the following processes: plating, cutting, welding and finishing of iron or steel products.

**제4조 1항**: Operators of an installation shall identify, within the system boundaries of an installation, the production process of goods to which the same functional unit applies.

**제4조 7항**: Splitting an installation into different installations … shall only be allowed where the operators demonstrate valid commercial reasons for this split … where circumventing Regulation (EU) 2023/956 is not their main purpose.

**제2조 (7)**: 'precursor' means any input material into a production process included in the list of goods set out in Annex I to Regulation (EU) 2023/956.

**부속서 II E(2)**: Where the precursor is obtained from another installation, data sets to be determined shall include: (a) the country of origin … (b) the installation where it was produced (identifier, UN/LOCODE, address, coordinates) … (d) the production routes … (e) the values of applicable specific parameters required for determining the embedded emissions …

**제14조 2·3항**: precursors under a given CN code from multiple installations → weighted average by default; with evidence that a production process used only precursors from a single installation (or subset), use those.

**CBAM Q&A 91** (사업장 나누기): "a division of installations should not lead to different results of the final embedded emissions of steel products, as precursors are taken fully into account by the CBAM methodology."

**가이던스(2023-11-21) 5.2절, 27쪽**: 같은 사업장에서 하는 상류(전구물질 생산)와 하류 활동(압연·주조, 철강제품의 세척·코팅)을 분명히 하라 — 별도 생산공정이 필요할 수 있다.

## 3. 해석 — 외주 열처리의 흐름

우리 공장(성형) → 외주처(열처리) → 우리 공장(전조·포장) → 수출, 의 경우:

1. 우리 공장의 성형 공정이 만든 반제품(CN 7318)은 외주처로 나간다 — 우리 사업장 밖으로 나간 산출물이다.
2. 외주처는 그 반제품을 전구물질로 써서 열처리된 볼트(CN 7318)를 만든다. 그 내재배출 = 반제품의 내재배출 + 외주처 열처리 배출(그 사업장의 연료·전력을 처리량으로 나눈 것).
3. 돌아온 볼트는 우리 공장 후공정의 구매 전구물질이다. 최종 제품의 SEE = 후공정 직접배출 + 돌아온 볼트의 내재배출.

두 갈래가 생긴다.
- **외주처가 값을 주는 경우**: 외주처가 자기 열처리 배출(톤당)을 알려 주고, 반제품의 내재배출은 우리가 계산해 넘긴다(또는 함께 합친다). 결과는 「우리 전 공정 + 외주 열처리」와 같다 — Q&A 91의 취지와 맞는다. 검증: 외주처 값은 제3국 전구물질 실측값이라 검증보고서 요건(부속서 II A.1 4·5항, 앱이 이미 적용하는 규칙)이 걸린다.
- **값을 못 받는 경우**: 돌아온 볼트를 다른 사업장 전구물질로 보면 기본값은 그 CN(7318)의 기본값 — 완제품 기준값이라 우리 반제품까지 포함한 값이다. 이때 우리 성형 공정의 배출과 우리가 산 선재는 반제품과 함께 「나간 것」이 되어 최종 제품에 다시 더하면 이중계산이 된다. 이 처리가 맞는지는 원문에 없다 → 헬프데스크 확인 대상.

## 4. 헬프데스크에 물을 것

1. 소유권이 넘어가지 않는 임가공(열처리·코팅)을 외주처 사업장의 생산으로 보고, 돌아온 부품을 우리 사업장의 「다른 사업장에서 받은 전구물질」(부속서 II E(2))로 다루는 것이 맞는가?
2. 외주처가 자료를 주지 않을 때, 돌아온 부품에 그 CN의 기본값을 쓰고 우리 전공정 배출·투입 강재는 빼는 것이 맞는가? 아니면 외주 공정 배출만 추정·기본값으로 더하는 방식이 허용되는가?
3. 같은 부지에서 우리 설비로 일하는 협력업체(소사장)의 연료·전력은 우리 사업장(제4조 7항)으로 보아야 하는가?
4. 아연 플레이크 코팅(다크로·지오메트)과 전기아연도금의 구분 — 3.16.2의 「coating」(안)과 「plating」(밖)의 경계.

## 5. 앱에 미치는 것 (지금 확인된 것)

- **도금 경계 (정정, 2026-10-16)**: 처음에는 「앱이 도금을 통째로 경계 밖으로 본다」고 적었으나 틀렸다. 코드를 다시 보니 앱은 이미 전기도금(plating)만 되묻고, 용융아연도금·코팅·지오메트·다크로는 되묻지 않으며(`steel-boundary.ts`의 `INCLUDED_COATING`), `cbam-product-rules.ts`·제품군 안내·서식 안내 문단도 둘을 나눠 적고 있었다. 실제로 어긋난 것은 문구뿐이었다 — 연료 안내·되묻기 문장·서식 4_연료 제목·모니터링 계획 9번 문단이 「도금」만 적어 둘을 구분하지 않았다. 이 문구를 「전기도금(plating)」으로 고치고 「용융아연도금·코팅은 경계 안」을 덧붙였다(`verify-2547-alignment.mjs`가 잠근다). 「아연도금」만 적힌 이름은 전기아연도금일 수도 있어 계속 되묻는다.
- **외주 공정 입력**: 규정 경로는 「다른 사업장에서 받은 전구물질」이다. 앱의 구매 강재(5_구매강재)가 이미 그 자료(나라·사업장·SEE·검증)를 받는다. 남은 설계 결정은 (a) 반제품이 나갔다 돌아오는 흐름을 어떻게 적게 할지, (b) 값이 없을 때 무엇을 쓸지(4장 2번) — 헬프데스크 답을 받은 뒤 정한다.
