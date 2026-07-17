# 산정보고서(Word) 출력 기능 — 구현 설계

> 상태: **설계 초안 (구현 전)** · 근거: 검토용 샘플 v0.3 + 씨밤이 1·2차 감사
> 승인 기준 문서: `CBAM_documents/CBAM_산정보고서_샘플_v0.3_한빛스틸_2026.docx`

## 1. 목표와 범위

EU 기관·제3자 검증인 제출을 대비해, 앱의 산정 데이터로 **CBAM 내재배출량 산정보고서(.docx)** 를 생성한다. 5원칙(완전성·정확성·일관성·투명성·적절성) 기반이며, 샘플 v0.3의 16장 + 부속서 A~D 구조를 따른다.

**범위 밖**: SEFA·CBAM factor·인증서 수량·기지불 탄소가격 차감의 최종 산정(= 신고인/수입자 영역), 법률 자문, 공식 검증 대체.

## 2. 아키텍처

```
src/lib/calculation-report.ts   (신규) — 보고서 모델 생성 + 발행 게이트
src/lib/docx-builder.ts         (신규) — delivery-package.ts의 OOXML 헬퍼를 추출·확장
src/lib/delivery-package.ts     (수정) — 04_Calculation_Report.docx 포함
src/app/export/page.tsx         (수정) — "산정보고서(Word) 다운로드" 버튼
src/components/guided/panels.tsx(수정) — ExportPanel 동일 진입점
src/app/report-inputs/          (신규) — 보고서 전용 사용자 입력 화면
```

### 2.1 docx 생성 방식 — **(A) 기존 방식 확장으로 확정** (2026-07-16)

`delivery-package.ts`의 손수 만든 OOXML 문자열 빌더를 `docx-builder.ts`로 추출해 확장한다. **신규 의존성 0.**

- **채택 이유**: 앱이 이미 Word 문서 2종(`02_Calculation_Basis_Summary`, `03_Evidence_Checklist`)을 이 방식으로 생성 중이며 제목·문단 스타일·표·테두리·스타일시트를 이미 보유. 로컬 우선·오프라인 PWA라 라이브러리가 사용자 기기로 내려가므로 번들 부담을 피한다(현 최대 의존성 fflate 837KB 대비 `docx` npm은 4.5MB. 오프라인 캐시 대상이라 lazy-load로도 회피 불가).
- **기각**: (B) `docx` npm 도입 — 구현은 빠르나 번들 부담이 앱의 핵심 가치와 충돌. (샘플 v0.1~v0.3은 검토 속도를 위해 (B)로 제작했으나 앱 코드에는 반입하지 않는다.)

**P1에서 메울 격차 (현 빌더에 없는 것)**
| 항목 | OOXML |
|---|---|
| 표 헤더 음영 | `<w:shd w:val="clear" w:fill="F5F5F7"/>` (⚠️ `clear` 사용 — `solid`는 검게 렌더됨) |
| 셀 너비 가변 | 현 `cell()`은 `w:tcW w:w="2400"` 하드코딩 → 파라미터화 + `<w:tblGrid>` |
| 머리글/바닥글 | `word/header1.xml` / `footer1.xml` + rels + content-types + `<w:sectPr>` 참조 |
| 페이지 번호 | `PAGE` / `NUMPAGES` 필드 (`<w:fldSimple w:instr=" PAGE ">`) |
| 글자 색·크기 | `<w:color w:val="1D1D1F"/>`, `<w:sz w:val="21"/>` (rPr) |

## 3. 데이터 소스 매핑 (샘플 부속서 C 기준)

| 장 | 방식 | 원천 |
|---|---|---|
| 표지, 2–4 사업장·기간·제품·공정 | 자동 | `installations` / `periods` / `products` / `processes` / `product_output_lines` |
| 3.1 간접배출 취급 근거 | **자동 (조건 분기)** | `getIndirectEmissionsApplicability()` — 제품·전구물질별 분류로 문안 분기. **고정 문안 금지** |
| 5 방법론 | 자동 + 사용자 확인 | 고정 문안 + 산정 파라미터 |
| 6.1 전치 / 6.3 측정 방식 | **사용자 입력 (신규)** | 원천 단위·환산계수·계량 방식 |
| 6.2·7 계수·전력 | 자동 + **메타 입력(신규)** | `source_streams` / `processes.electricity_ef_*` + EF 공표 메타 |
| 8 전구물질 | 자동 | `precursors` (vintage=`supplier_reporting_period`, 경로=`production_route` 재사용) |
| **9 DV 대조·민감도** | **자동** | `reference:default-values` (§4 참조) |
| 10 산정 결과 | 자동 (+자가검사) | `calculateLocalResults()` |
| 11 기지불 탄소가격 | **사용자 입력 (신규)** | 해당 여부·지불액·증빙 상태 |
| 12 모니터링 관리체계 | **사용자 입력 (신규, 양식 제공)** | 계획 문서번호·R&R·QA/QC |
| 13 5원칙 자체평가 | 자동 초안 + 사용자 확인 | 앱 검사 결과(준비도·정합·자가검사) 기반 서술 |
| 14 개선계획 | 자동 초안 + 사용자 보완 | 경고·data_mode·DV 민감도 |
| 15 증빙 목록 | 자동 초안 + **보관처·상태 입력(신규)** | 각 데이터의 `source` 필드 |
| 16 운영자 선언 | 사용자 서명 | — |

## 4. DV 대조 자동화 (씨밤이 필수조건 2)

**앱의 기존 기준자료를 그대로 재사용한다** — 새 데이터 소스 불필요.

- 소스: 설정 키 `reference:default-values` → `ImportedDefaultValueReference.rows: DefaultValueReferenceRow[]`
- 행 구조가 필요한 필드를 이미 전부 보유: `country` / `cn_code` / `direct_default` / `indirect_default` / `markup_2026..2028` / `production_route`
- 조회: 전구물질의 `supplier_country` × `precursor_cn_code` (CN 8자리 → 미스 시 4자리 heading 상속)

**보고서에 반드시 자동 출력할 메타** (v0.2 P1 지적):
- 조회 키 (국가 · CN 자릿수 · heading 상속 여부)
- 워크북 판본·일자 (`ReferenceWorkbookSummary`)
- DV 행의 `production_route` ↔ 전구물질 실측 경로의 **대응 여부** — 불일치·미확인 시 「확인 필요(자료)」 자동 태깅
- `indirect_default == null` → "N/A (미공표) · 대조 불가" 자동 표기
- 민감도: 실측 → DV(해당 연도) 대체 시 `see_cbam_basis` 변화량·%

**기준자료 미연결 시**: 제9장을 생략하지 말고 "기준자료 미연결 — DV 대조 불가. `/upload`에서 연결 필요" 로 출력하고 발행 게이트에서 **경고**.

## 5. 발행 게이트 (씨밤이 필수조건 1)

기존 `assertDisplaySum` 개념을 확장해 **생성 시점에 검사하고, 실패 시 발행 차단 또는 자동 라벨**.

| 게이트 | 검사 | 실패 시 |
|---|---|---|
| G1 표시값 정합 | 구성 항목 표시값 합 = 소계 표시값 (모든 계층) | **차단** |
| G2 날짜–기간 정합 | 발행일 ≥ 보고기간 종료일 | **자동 「기중 잠정(interim)」 라벨** + 증빙 커버리지 기재 요구 |
| G2b 모니터링 계획 승인일 | 계획 승인일 ≤ 보고기간 시작일 | 경고 |
| G3 경계 정합 | `internal_consumption > 0` 인데 CBAM 공정 1개 | 경계 서술(비CBAM 공정 존재 여부) **입력 요구** |
| G4 교차참조 | 본문의 장 번호 참조가 실재하는 장을 가리키는지 | **차단** (v0.2의 dangling 참조 재발 방지) |
| G5 필수 입력 | 11·12장 사용자 입력 미기재 | 「기재 필요」 자동 표기 + 경고 |
| G6 기준자료 | DV 기준자료 미연결 | 경고 (§4) |
| G7 단위 정합 | 표 헤더 단위 ↔ 셀 값 종류 | **차단** (v0.2의 %/tCO2e 혼재 재발 방지) |

## 6. 표기·반올림 유틸 (씨밤이 필수조건 3)

```ts
// 부동소수점 이진오차 제거 후 사사오입(절댓값 기준 half-away-from-zero)
export function roundForReport(value: number, digits: number): number
```
- **음수 처리**: `Math.round`는 half를 +∞ 방향으로 올려 음수에서 절댓값이 줄어든다(`Math.round(-79.5) === -79`). 차감·델타 항이 늘어나기 전에 `sign × round(abs)` 로 구현.
- 규칙: 배출량·SEE 4자리 / 계수·원단위 **원천 자릿수 유지** / **산식 피연산자는 반올림 금지** / 소계는 미반올림 원천값에서 산출 후 반올림.
- 공표 기본값(DV)은 단일 문자열로 포맷해 전 섹션 재사용 → 자릿수 비일관 원천 차단.

## 7. 신규 데이터 모델

```ts
// local-db.ts — 신규 스토어 또는 settings 키
interface ReportInputs {
  monitoring_plan: { doc_no: string; version: string; approved_at: string };
  rnr: Array<{ data: string; collector: string; transposer: string; approver: string; system: string }>;
  carbon_price: Array<{ target: string; applicable: 'YES'|'NO'|'TO_CONFIRM'; note: string; amount?: number; evidence_status: 'pending'|'estimated'|'confirmed' }>;
  evidence: Array<{ item: string; proves: string; custodian: string; status: string }>;
  declaration: { name: string; position: string; date: string };
}
// SourceStream 확장
source_unit?: string;            // 청구서 원천 단위 (MJ, m³ …)
source_quantity?: number;        // 원천 수치
conversion_note?: string;        // 환산 근거
measurement_method?: string;     // 계량 방식
// ProductionProcess 확장
electricity_ef_publisher?: string;
electricity_ef_document?: string;
electricity_ef_vintage?: string;
```
> 모두 **선택 필드**로 추가해 기존 `.cbam` 백업과 하위호환 유지 (기존 패턴과 동일).

## 8. UI 흐름

1. `/export` (및 지도형 ExportPanel)에 **"산정보고서(Word) 다운로드"** 버튼 추가
2. 미입력 항목이 있으면 → `/report-inputs` 로 유도 (11·12·15장 + 6.1·6.3·7 메타)
3. 생성 시 게이트 실행 → 차단 항목은 해당 화면 딥링크로 안내 (기존 `getEuExportIssueEditHref` 패턴 재사용)
4. 전달 패키지에 `04_Calculation_Report.docx` 포함 (기존 6개 → 7개 파일)

## 9. 구현 단계

| Phase | 내용 | 산출 |
|---|---|---|
| P1 | `docx-builder.ts` 추출 + 표/머리글/페이지번호 지원, `roundForReport` | 유틸 + 단위 테스트 |
| P2 | 자동 섹션(표지·2–10·13·14) + 게이트 G1/G4/G7 | 데이터만으로 생성되는 초안 |
| P3 | DV 대조 장(9) + 민감도, 게이트 G6 | 기준자료 연동 |
| P4 | 사용자 입력 모델 + `/report-inputs` 화면 + 11·12·15장, 게이트 G2/G3/G5 | 완성본 |
| P5 | 전달 패키지 통합 + `verify:calculation-report` 스크립트 | 회귀 검증 |

## 10. 검증 계획

- `scripts/verify-calculation-report.mjs` 신설 — 기존 `verify-eu-export.mjs` 로더 패턴 재사용
  - 게이트 G1~G7 각각의 실패 케이스가 실제로 차단/라벨되는지
  - 반올림: `roundForReport(-0.795, 2) === -0.8`, `1.025×1.95 → 1.9988`, 구성합=소계
  - DV 조회: 국가×CN 히트/미스/heading 상속/`indirect_default=null` 분기
  - 조건 분기: 비Annex II 전구물질 시 3.1장 문안이 바뀌는지 (**고정 문안 회귀 방지**)
- 실제 시나리오 5종(용접강관·조강·형강·DRI·합금철)으로 생성 → 씨밤이 재감사

## 11. 미해결 (문서·기능 공통, 규정 원문 대조 필요)

조항 단위 인용(Art. 7(1) 등) · 확정기간 이행규정 번호·적용범위 · markup의 전구물질 적용 방식 · 계수 위계 적격성 · 불확도 요구 수준 · Communication Template 유효 판본.
→ 기능은 이들을 **「확인 필요(규정)」 자동 표기**로 처리하고, 확정 시 문안 상수만 교체할 수 있도록 분리 보관한다.

## 12. 씨밤이 잔여 지적의 귀착

| 씨밤이 지적 | 귀착 |
|---|---|
| DV 판본·경로 대조 | §4 자동 메타 출력 |
| 교차참조·단위 헤더·날짜 모순 | §5 게이트 G2/G4/G7 |
| `dround` 음수 | §6 `roundForReport` |
| K-ETS 법인 단위 판단 | §7 `carbon_price.applicable = TO_CONFIRM` 기본값 + 증빙 상태 |
| 「확인 필요」 태그 정의 | 3종 분리(`규정`/`자료`/`기재 필요`)를 상수로 고정 |
| 전구물질 미검증(98.5%) | **기능으로 해결 불가** — 공급사 검증보고서 수령이 유일. 14장 최우선 항목으로 자동 노출 |
