# SEE 산정 결과 — 동성특수강 EAF 스테인리스 (회귀 run02)

> 모드: 🔁 회귀(Regression) · 대상 앱: CBAM_Platform (main, PR #1 머지 후) · 기준: EU CBAM 2026 확정기간
> run01 대비 **인증서 기준 SEE(see_cbam_basis) 교정**이 핵심 변경. 참고용 총 SEE는 불변.

## 1. 제품별 SEE (수정 후)

| 제품 (CN) | 공정 | direct(자체) | own-indirect | precursor | **see_cbam_basis** (인증서 기준) | see_informational_total (검토용) |
|---|---|---|---|---|---|---|
| 합금강 슬래브 (72189911) | P1 EAF | 0.07655 | 0.58310 | 1.72034 | **1.00153** | 2.37999 |
| 스테인리스 시트 (72191310) | P2 압연 | 0.35503 | 0.23872 | 2.57736 | **1.43961** | 3.17111 |
| 스테인리스 봉강 (72210010) | P2 압연 | 0.35503 | 0.23872 | 2.57736 | **1.43961** | 3.17111 |

단위: tCO₂e/t. 전력 EF 0.833(EU 'Mix') 전제, 전구물질 PP1~PP4 + 사내 P1→P2 전가.

## 2. EU 공식 예제 대비 검증 (회귀 핵심)

| 값 | 앱 (run02) | EU 정답 | 판정 |
|---|---|---|---|
| P1 see_cbam_basis (= SEE direct, direct-only) | 1.00153 | 1.00149 | ✅ 일치 (run01 1.79689 → 교정) |
| P2 see_cbam_basis | 1.43961 | 1.43961 | ✅ 일치 (run01 2.93239 → 교정) |
| P1 informational_total (= SEE total) | 2.37999 | 2.37991 | ✅ 일치 (불변) |
| P2 informational_total | 3.17111 | 3.17109 | ✅ 일치 (불변) |

→ `engine-crosscheck.mjs` 재실행 결과 인증서 기준과 규정 direct-only 기준 **차이 0.00000**.

## 3. declarant 보고용 분해 (신규 산출, #4 후속)

| 제품 | SEE(direct) 전구물질 포함 | SEE(indirect) 전구물질 포함 |
|---|---|---|
| P1 (72189911) | 1.00153 | 1.37844 |
| P2 (72191310) | 1.43961 | 1.73239 |

EU Communication Template의 SEE(direct)/SEE(indirect) 컬럼과 정합. `/results`·`/export`에 표시됨.

## 4. 가정·한계 (run01 대비 변동 없음)
- 전력 EF: EU 예제 'Mix' 0.833 채택 — 동성특수강 실제 위계(직접연결/PPA/계통)는 **확인 필요** (단 #5로 출처 분류 필드는 마련됨)
- LNG 단위(t/Nm³), FeMn default+markup, K-ETS 증빙(0 가정), CN-제품설명 일치, 시트/봉강 분할 — run01 client-questions 유효
- see_cbam_basis ↔ see_informational_total 분리 표기 유지

## 결론
**계산 정확성: 회귀 PASS.** P0 #4 교정으로 인증서 기준 SEE가 EU 공식 정답과 일치. informational_total 불변. declarant 보고용 분해 신규 제공.
