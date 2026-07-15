# SEE 산정 결과 — 공급사 5종 필드 회귀 (2026-07-15_run06)

**산정일**: 2026-07-15 | **Run ID**: 2026-07-15_run06 (회귀) | **담당**: 씨밤이 (CBAMY)
**도구**: CBAM_Platform 지도형 작업 공간 (공급사 상세 필드 반영본)
**기준 체계**: 2026 확정기간

> 공급사 상세 5종 필드 추가가 SEE·export에 영향을 주지 않는지 확인.

---

## 1. SEE 결과 — 런 간 비교 (강선 시나리오)

| 구성 | run04 | run06 | 변동 |
|------|-------|-------|------|
| see_direct | 0.2665 | 0.2665 | 0 |
| see_own_indirect | 0.235 | 0.235 | 0 |
| see_precursor_contribution | 2.205 | 2.205 | 0 |
| **see_cbam_basis** | **2.1565** | **2.1565** | 0 |
| see_informational_total | 2.7065 | 2.7065 | 0 |

- 항등식·Annex II direct-only 유지 ✅
- **회귀 없음** — 공급사 상세 필드(설비명·경로·보고기간)는 계산 엔진에서 쓰이지 않음.

## 2. 공급사 상세 필드 (추적성)
Guidance Step 2가 요구하는 설비별 항목 대비 앱 캡처:
| Guidance 요구 | 앱 필드 | 상태 |
|---|---|---|
| 설비 식별정보 | supplier_installation | ✅ 저장 (export 셀 미매핑, P2-run06-01) |
| direct/indirect SEE | direct/indirect_see | ✅ (기존) + export 기재 |
| 생산경로 | production_route | ✅ 저장 + **export 경로 집계로 흐름** |
| 보고기간 | supplier_reporting_period(신규) | ✅ 저장 (export 셀 미매핑) |
| 탄소가격 | — | 신고인 몫, 범위 밖(설계상 제외) |

- 믹스 시 출처에 공급사별 내역(각 소비량·SEE) 기록 → 설비별 추적성 보강(run05 P2 해소).

## 3. EU export 무손상
- 생산경로("BF-BOF")가 채워진 상태로 export → **입력 셀 43개 반영, 오류 0**(생성기 검증 통과). 스키마 변경(선택 필드)·채워진 경로가 공식셀·수식을 훼손하지 않음.

---

**최종 판정**: see_cbam_basis = **2.1565** tCO₂e/t (총 2.7065) — **PASS**
(SEE·export 회귀 없음 + 5종 필드 정확 저장 + 신규 P0/P1 없음. supplier_installation/보고기간의 export 셀 매핑은 P2.)
