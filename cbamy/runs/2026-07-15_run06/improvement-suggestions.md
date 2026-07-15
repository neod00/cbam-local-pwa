# 앱 개선 제안서 — 2026-07-15_run06 (회귀 · 공급사 5종 필드)

**세션**: 2026-07-15 run06 | **담당**: 씨밤이 (CBAMY)
**대상**: CBAM_Platform — 공급사 상세 5종 필드 (커밋 9aea391)
**기준**: Reg 2023/956 + 이행규정, 2026 확정기간. 근거 Guidance Step 2·4.

---

## 회귀 검증 결과 요약

| 항목 | 판정 |
|------|------|
| 5종 필드(설비명·생산경로·보고기간) 저장 | ✅ |
| 믹스 출처에 공급사별 내역 (P2-run05-01 해소) | ✅ |
| 엔진 회귀 없음 (2.1565/0.55/2.7065) | ✅ |
| EU export 무손상 (생산경로 채움 상태, 43셀) | ✅ |

**총평**: 공급사 상세 필드가 정확히 저장되고, 스키마 변경(선택 필드)이 계산·export를 깨지 않음. run05의 설비별 상세 손실(P2-run05-01) 해소. 신규 P0/P1 없음. 부분 export 매핑 P2 1건.

---

## 신규 발견 결함

### P0 / P1 — 없음

### P2 — 개선 권고

#### P2-run06-01 | supplier_installation·보고기간이 E_PurchPrec 전용 셀로 미기재
**문제**: `production_route`는 export의 경로 집계(`getPrecursorRoutesForEuExport`, A_InstData 경로 등록)로 흐르지만, `supplier_installation`·`supplier_reporting_period`는 앱 레코드엔 저장되나 **E_PurchPrec 전용 셀로 기재되지 않는다**(export는 direct SEE 출처 M35 + 경로만 기재). Guidance Step 2는 설비ID를 전구물질 통신 항목으로 명시한다.
**영향**: 낮음. 담당자 기록·추적용으로는 보존되나, EU Communication Template의 해당 셀(있다면)로 자동 전달되지 않아 통신 시 수동 보완이 필요할 수 있다.
**제안**: EU 템플릿의 E_PurchPrec에 설비ID·보고기간에 대응하는 입력 셀이 있는지 확인 후(있다면) `createPrecursorCellWrites`에 매핑 추가. 셀이 없으면 현행(레코드 보존)이 최선. **확인 필요**(템플릿 셀 존재 여부).
**우선순위**: P2

> **✅ 해소 (2026-07-15 조사, 공식 템플릿 `CBAM Communication template for installations_en_20241213.xlsx` 직접 확인)**
> 결론: **템플릿에 설비ID·공급사 보고기간에 대응하는 입력 셀이 없다** → 결함 아님(설계상 레코드 보존이 최선).
> - **A_InstData 전구물질 등록(행 102+)** 컬럼은 정확히: `ID · 품목군(E) · Country code(F) · Route 1–5(G–K) · Name(L)`. export가 이 전부(E=품목군, F=supplier_country, L=name, G–K=production_route)를 **이미 채운다**. 설비ID·보고기간 컬럼은 존재하지 않음.
> - **E_PurchPrec 상세 블록(44행/전구물질)**: 이름·소비량 표(a/b/c/d)·SEE 파라미터(직접 SEE, 전력사용량, 전력계수, 간접 SEE, Source, 기본값 근거)뿐. 설비ID·보고기간 행 없음. (Source(M48)는 SEE 값의 출처이지 설비ID 칸이 아님.)
> - Guidance Step 2가 요구하는 설비ID·보고기간은 **담당자가 자체 기록·검증용으로 수집**하는 항목이며 이 통신 템플릿으로 전송되지 않는다. → `supplier_installation`·`supplier_reporting_period`를 앱 추적성 메타데이터로 보존하는 현행이 정확·완전. **코드 변경 불필요.**

---

## 기존 미수정 이슈 (이관 유지)

| 항목 | 상태 |
|------|------|
| 탄소가격(무응답=0) | 신고인(EU 수입자) 몫 — 가공사 앱 범위 밖(설계상 제외) |
| CN 72/73 접두 휴리스틱(엔진) | ❌ 별도 과제 |
| bridge(간접 2입력), ③ SAD 비교, ⑥ 재귀 | ○ 백로그(트리거 대기) |

---

## 작성 원칙
- 보고기간 기본(역년)은 Guidance Step 4 인용.
- export 무손상은 실측(43셀 반영·오류 0)으로 확인.
- 미확인 항목(템플릿 셀 존재)은 "확인 필요"로 표기.
