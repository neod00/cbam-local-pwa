# 외주·관계사 공정의 규정 근거 (2026-10-16)

체결부품 업체(풍강·진합·S&W·KPF형)는 열처리·코팅·도금 일부를 외주·관계사·소사장에 맡긴다. 앱과 서식에는 이 공정을 받을 자리가 없다. 이 문서는 그 처리를 정하기 전에 확인한 근거를 모은 것이다.

읽은 자료: Implementing Regulation (EU) 2025/2547(산정 방법, OJ L 22.12.2025 — `EU Verification/OJ_L_202502547_EN_TXT.pdf`, `CBAM이행규정(EU) 2025_2547.pdf`와 같은 파일), **European Commission CBAM Questions and Answers, 2026-05-27 갱신판**(확정기간판), CBAM Guidance(2023-11-21, 전환기간판 — 개념만 참고), 예전 Q&A(전환기간판).

> **정정 (같은 날)**: 처음 판에서는 「외주처 배출은 돌아온 부품을 통해 전구물질로 들어간다」고 결론 냈다. 2026-05-27 Q&A 4.31이 이 경우를 직접 다루며 **「1차 사업장에서 일어난 것처럼 다룬다」**고 답한다. 전구물질 경로는 틀렸다. 이 판은 그 답을 기준으로 다시 썼다. (사용자가 준 검토 메모가 이 Q&A를 근거로 들어 확인하게 되었다.)

## 1. 결론 요약

| 질문 | 근거 | 답 |
|---|---|---|
| 1. 외주로 맡겼다가 돌려받은 공정(임가공) | **Q&A 4.31** | 경계 안 공정(열처리·코팅·용융아연도금 등)을 다른 사업장·다른 회사에서 하고 물건이 1차 사업장으로 돌아오면 **1차 사업장에서 일어난 것처럼 다룬다.** 돌아온 부품을 전구물질로 보지 않고, 외주처의 그 공정 배출을 우리 공정의 배출로 넣는다. 소유권 이전 여부는 기준이 아니다. |
| 2. 외주처가 자료를 안 줄 때 | 2547 부속서 II A.1 5항(정확성 원칙) · 부속서 II A.1 2항 · Q&A 4.31 | 우리 공정의 자료 결측과 같다 — **보수적 추정값으로 대체**한다(설비 정격·가동시간 같은 객관적 근거). 돌아온 부품이 전구물질이 아니므로 **완제품 CN 기본값을 쓰고 우리 몫을 빼는 계산은 근거가 없다.** 실측 산정을 포기하면 제품 전체에 공식 기본값을 쓰는 길은 따로 있다(A.1 2항: 실측·기본값·혼용 중 선택). |
| 3. 같은 부지 협력업체(소사장) | **Q&A 4.3** · 2547 제4조 7항 · Q&A 4.31 | 사업장은 법인이 아니라 「생산공정이 이뤄지는 고정된 기술 단위」이고, 같은 CN 제품으로 이어지는 모든 공정을 포함하는 장소다. 우리 제품을 만드는 공정이면 **우리 사업장에 포함**한다. 설령 따로 본다 해도 Q&A 4.31에 따라 우리 사업장에서 일어난 것처럼 다룬다 — 결과는 같다. |
| 4. 다크로 코팅과 전기아연도금 | 2547 부속서 I 3.16.2 · Q&A 4.31 | 원문은 coating·galvanizing **포함**, plating **제외**만 말하고 정의는 없다. 다크로·아연 플레이크(비전해 코팅)는 coating, 전기아연도금(전해)은 plating으로 보는 것이 기술적으로 맞는 해석이다. 실제 공정 기술(전해 여부)을 공정 설명서로 남겨 검증인에게 보인다. **이 부분만 원문에 정의가 없다.** |

## 2. 원문

**Q&A 4.31** (2026-05-27) — Which transformation processes of iron and steel and aluminium products need to be taken into account?
> … Section 3.16.2 of Annex I to Implementing Regulation (EU) 2025/2547 … include … re-heating, re-melting, casting, hot rolling, cold rolling, forging, pickling, annealing, coating, galvanising, wire drawing, and exclude plating, cutting, welding, and finishing …
> **If these processes occur in secondary installations or are outsourced to other companies and the goods are subsequently returned to the primary installation, they should be treated as if they happen in the primary installation.**

**Q&A 4.3** — What is the definition of an installation? Is it determined by the legal entities on site?
> 'Installation' means a stationary technical unit where a production process is carried out … an installation must be understood as a site or a place where the production process of goods in Annex I is occurring … the installation is the site which encompasses all the chemical and physical processes that lead to the production of goods under the same CN code.

**Q&A 4.7**: 같은 CN에는 생산공정이 하나뿐이다. **Q&A 4.8**: 수출 여부로 생산공정을 나눌 수 없다.

**Q&A 5.21**: 다른 사업장이 만든 전구물질은 기본값을 쓰거나, 그 사업장의 검증보고서에 있는 실측값만 쓴다. (외주 후 돌아온 부품에는 4.31이 우선한다.)

**2547 부속서 I 3.16.2**: … including re-heating, re-melting, casting, hot rolling, cold rolling, forging, annealing, coating, galvanizing, wire drawing, pickling and excluding the following processes: plating, cutting, welding and finishing of iron or steel products.

**2547 부속서 II A.1 5항 (Accuracy)**: Where data gaps have occurred or are expected to be unavoidable, substitute data shall consist of conservative estimates.

**2547 부속서 II A.1 2항**: An operator can either determine actual values of embedded emissions, or make use of the default values …, or combine actual values and default values.

**2547 제4조 7항**: 사업장 나누기는 상업적 이유가 있을 때만(우회 목적 금지).

**2547 부속서 II A.5 point 22(g) 「control of outsourced processes」**: 자료 품질 관리 체계 안의 항목이다 — 외주로 맡긴 **자료 처리·관리 활동**의 통제이지 생산 외주 규정이 아니다.

## 3. 외주 열처리의 흐름 (Q&A 4.31 기준)

우리 공장(성형) → 외주처(열처리·코팅) → 우리 공장(전조·포장) → 수출:

- 외주처의 그 공정 배출(우리 부품에 쓴 연료·전력 몫)을 우리 공정의 배출원으로 넣는다. 돌아온 부품은 전구물질이 아니다.
- 최종 SEE = 우리 공정 배출 + 외주 공정 배출(우리 부품 몫) + 사 온 강재의 내재배출. 이중계산이 생기지 않는다.
- 외주처가 그 회사 전체 연료만 줄 수 있으면 우리 부품 몫을 나눠야 한다 — 처리량(t) 비율 같은 근거를 남긴다(우리 공정의 공용 계량기 나누기와 같은 문제).
- 자료가 없으면 보수적 추정(정격 열용량 × 가동시간 × 부하율 등)과 그 근거. 근거조차 없으면 실측 산정이 어렵다 — 제품 전체를 기본값으로 가는 선택지가 남는다.
- 전기도금·절단·용접·마무리는 외주든 자체든 경계 밖이다.

## 4. 남는 확인 (헬프데스크 또는 검증인)

1. 다크로·지오메트(아연 플레이크) 코팅이 3.16.2의 coating이고 전기아연도금이 plating이라는 구분 — 원문 정의 없음.
2. 외주처가 그 회사 전체 연료만 줄 때 우리 몫을 나누는 기준(처리량 비율 등)이 검증에서 받아들여지는지.

### 4-1. 두 확인의 진전 (2026-10-16, 사용자 제공 검토 메모 「외주 표면처리 공정 분류 및 공통 연료사용량 배분 검토」 대조)

**1번 — 법적 정의는 여전히 없고, 증빙 방법이 생겼다.** 피막 형성 원리로 나누고 체결부품 국제표준을 기술 근거로 붙인다: ISO 10683(비전해 아연 플레이크 코팅 → coating), ISO 4042(전해 코팅 → plating), 용융 침지(→ galvanizing). 표준은 공정 기술의 증빙이지 CBAM의 정의가 아니다. 주의: 전기아연도금은 영어로 electro-galvanizing이라고도 해 「galvanizing(포함)」과 낱말이 겹친다 — 「전기아연도금이니 무조건 제외」로 단정하지 말고 분류 판단서(전해 방식 근거·설비: 도금조·정류기)를 모니터링 계획에 남긴다. 앱이 「아연도금」만 적힌 이름을 계속 되묻는 것이 이 때문이다.

**2번 — 메모의 배분 순서가 2547의 일반 규칙과 그대로 맞는다(메모는 조항을 적지 않았다).** Q&A 4.31로 외주 공정이 우리 사업장 공정이 되므로, 우리 공정의 자료 규칙이 그대로 걸린다.
- 설비별 계량기가 있으면 그 값 — 부속서 II **A.3** 1항(직접 결정 방법이 우선).
- 계량기가 없으면 설비 소비율 × 가동시간으로 재구성 — 부속서 II **A.3** 2항 (b) 「설비 설계자료(단위 제품당 에너지 소비 등)」, (c) 「생산 기록에 기반한 경험적 상관관계」.
- 재구성한 설비별 합이 회사 고지서 총량과 다르면 같은 비율로 맞춘다 — 부속서 III **A.1 식 41·42(reconciliation factor RecF = D_Inst / D_PP)**. 메모의 사례 A(120,000 ÷ 100,000 → 우리 몫 30,000 → 36,000 Nm³)가 이 식이다.
- 같은 설비·같은 조건에서 여러 고객 제품을 처리하면 처리 중량으로 — 부속서 III **A.2**(관련 물리적 관계로 나누고, 따로 정한 규칙이 없으면 기능단위 = 질량). 운전조건(경화 온도·체류시간·코팅 횟수)이 다르면 질량만으로는 대표하지 못한다.
- 공용 보일러의 열은 열 귀속을 먼저 — 부속서 III **A.2**의 적용 순서(열 → 폐가스 → 기능단위).
- 경계 밖 공정(전기도금 등)과 같은 계량기를 쓰면 그 몫은 우리 제품에 넣지 않는다 — 부속서 I 3.16.2.
- 근거 자료가 없으면 보수적 추정 — 부속서 II A.1 5항. 회사 총량만 있고 다른 자료가 없으면 믿을 만한 배분이 어렵다 → 추가 자료 요청.

앱에는 이미 같은 구조가 있다(공용 계량기 나누기: 기준 3종 · 합계 = 고지서 · 추정은 근거 요구). 외주 공정은 이 나누기를 「외주처의 계량기」에 쓰는 것으로 설계할 수 있다.

## 5. 앱에 미치는 것

- **도금 경계 문구**: 앱은 이미 전기도금만 되묻고 용융아연도금·코팅은 통과시켰다. 사용자가 읽는 문장 다섯 곳이 「도금」만 적어 구분이 없던 것을 「전기도금(plating)」으로 고쳤다(PR #153, `verify-2547-alignment.mjs`가 잠근다). 「아연도금」만 적힌 이름은 전기아연도금일 수도 있어 계속 되묻는다.
- **외주 공정 입력 (설계 방향이 바뀜)**: 구매 강재 칸이 아니라 **연료·전력과 같은 배출원 칸**에서 받는다. 필요한 것: 외주처 이름, 어느 공정(제품)의 몫인지, 연료 종류·양 또는 배출량, 근거(외주처 자료 / 보수적 추정의 계산 근거), 나눈 기준. 앱은 이것을 우리 공정의 배출에 더하고, 보고서에는 「외주 공정(Q&A 4.31에 따라 1차 사업장 공정으로 처리)」으로 따로 보이게 한다. 추정값이면 「확인 필요」로 남긴다.
