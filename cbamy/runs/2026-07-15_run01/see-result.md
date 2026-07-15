# SEE 산정 결과 — 솔리드 와이어 ER70S 1.2mm (강선)

**산정일**: 2026-07-15 | **Run ID**: 2026-07-15_run01 (탐색+회귀 하이브리드) | **담당**: 씨밤이 (CBAMY)
**도구**: CBAM_Platform — **신규 지도형 작업 공간(GuidedWorkspace)** 경유 (사업장→제품/CN→생산공정→①연료→②전력→③전구물질→검증→EU문서)
**기준 체계**: 2026 확정기간(definitive period) — 전환기간 자료와 혼용하지 않음
**대상 커밋**: `feat/guided-map-workspace` a7913c1

---

## 1. 기본 정보

| 항목 | 내용 |
|------|------|
| **제품 (goods)** | 솔리드 와이어 ER70S 1.2mm (강선) + 아연도금 강선 (같은 공정 다제품) |
| **CN 코드** | 72171010 / 72172010 (Annex II 여부: **Annex II direct-only** — 72류 iron & steel) |
| **기능단위 / 산정 기준** | 제품 1톤 (t goods) · SEE 단위 tCO₂e/t (전력 tCO₂e/MWh) |
| **시스템 경계** | EU ETS 포괄 범위 = cradle-to-gate 부분집합 (상류 채굴·사이트 간 운송·사용·폐기 제외) |
| **생산공정 / 생산경로** | 신선·소둔 라인 (가공 route) — 쇳물 미생산 가공사. DV route 지시자 "(C)" 대조 필요 |
| **보고 기간** | 2026년 연간 (2026-01-01 ~ 2026-12-31) |
| **데이터 모드** | SAD (자체 연료·전력 = 사업장 값, 전구물질 선재 = 공급사 실측 가정) |
| **법적 근거** | Reg (EU) 2023/956 + Impl. Reg 2025/2547·2620·2621·2548 |
| **설비 (installation)** | 한국강선 김포공장 (KR) |
| **의뢰사 / 신고자** | (가상 시나리오) |

> SEE는 CFP와 달리 EU ETS 포괄 범위로 한정 — 상류·사이트 간 운송·사용·폐기는 경계 밖.

---

## 2. SEE 산정 결과

### 2-1. 최종 SEE (분해) — 공정 전체(다제품 합계) 기준

| 구성 | SEE (tCO₂e/t) | 데이터 출처 |
|------|---------------|-------------|
| 직접 (`see_direct`) | 0.267 | 도시가스 128,400 Nm³ (국가 인벤토리 계수) |
| 자체 간접 (`see_own_indirect`) | 0.235 | 전력 500 MWh × 0.47 tCO₂/MWh |
| 전구물질 기여 (`see_precursor_contribution`) | 2.205 | 선재 CN 7213 소비 1,050 t (공급사 실측 가정) |
| **CBAM 기준 SEE (`see_cbam_basis`)** | **2.157** | 인증서 산정 기준 |
| 참고용 총 SEE (`see_informational_total`) | 2.707 | 운영/검토용 |

**기준 SEE 산식 적용**
- Annex II direct-only: `see_cbam_basis = see_direct + eligible_precursor_direct` = 0.267 + 1.890 = **2.157**
- 자체 간접(0.235) + 전구물질 간접(0.315) = **간접 SEE 0.55** → 인증서 기준에서 제외, 보고·통신용 보존
- 항등식 확인: `cbam_basis(2.157) + 간접(0.55) = informational_total(2.707)` ✅

> ⚠️ **회귀 핵심**: 지도형 UI로 입력해도 엔진의 Annex II direct-only 분기(전구물질 **간접분까지** 인증서 기준에서 제외)가 그대로 유지됨. 2026-06 run에서 수정한 P0(전구물질 indirect 과다계상)가 신규 UI에서도 **보존됨** — 회귀 없음.

불확실성/검토 범위: 전력 EF 0.47과 전구물질 SEE 1.80/0.30의 **출처·검증상태 미확정** (§5, client-questions 참조).

> 비교: 이전 run(2026-06-13 HRC)과는 제품·공정이 달라 직접 수치 비교 불가. 회귀 판정은 "엔진 산식·Annex II 처리 재현"으로 수행(usage-log 참조).

---

### 2-2. 상세 계산 내역

#### 직접배출 (Direct — source stream)

| Source stream | 유형 | 활동량 | 단위 | NCV(GJ/단위) | EF | EF 단위 | 산식 | 배출 (tCO₂e) |
|---|---|---|---|---|---|---|---|---|
| 도시가스 (LNG) | 연소(Combustion) | 128,400 | Nm³ | 0.037 | 56.1 | tCO₂/TJ | 활동×NCV×EF÷1000 | **266.52** |
| **공정 직접배출 합계** | | | | | | | | **266.52** |

- 직접 SEE = 266.52 ÷ 1,000 t = **0.267** tCO₂e/t
- 추적성: 배출원 저장 시 `process.direct_attributable_emissions_tco2e`가 **자동 266.52로 동기화**됨 → source stream 합계 ↔ 공정 직접배출 델타 = 0 (KB §5-1 Aggregation PASS). *(기존 앱은 수동 "배출원 합계 적용" 버튼; 지도형은 자동 — 개선)*

#### 간접배출 (Indirect — 소비전력)

| 항목 | 값 | 단위 | 비고 |
|------|----|------|------|
| 소비전력 E_el | 500 | MWh | 전기요금 고지서 가정 |
| 전력 EF | 0.47 | tCO₂/MWh | source=COUNTRY_GRID_DEFAULT (⚠️ 출처·버전 미표기, P1) |
| 자체 간접 SEE | **0.235** | tCO₂e/t | Annex II direct-only → cbam_basis 제외, 보고용 보존 |

- EF 0.47은 앱 하드코딩 기본값(process form default). 공식 국가계수(IEA/2025 워크북) 출처·버전 대조 필요 — **확인 필요**.
- market-based(GO·녹색인증) 미사용 확인됨(패널 문구가 명시).

#### 전구물질 (Precursor)

| 전구물질 | CN | 원산지 | 소비량(t) | direct SEE | indirect SEE | 모드 | 기여(tCO₂e/t) |
|---|---|---|---|---|---|---|---|
| 선재(와이어로드) | 7213 | KR | 1,050 | 1.80 | 0.30 | ACTUAL(가정) | 2.205 |
| **합계** | | | | | | | **2.205** |

- 전구물질 direct(1,890) + indirect(315) = 2,205 tCO₂e → ÷1,000 = 2.205. direct/indirect **분리 보존** 확인(KB §D PASS).
- ⚠️ **공식 DV 대조**(`cbam-defaults.json`, KR CN 7213): `direct_default=2.11847619`, **`indirect_default=null`**, `markup_2026=2.330323809`. 즉 입력한 **간접 0.30은 철강 DV 체계에 존재하지 않는 값**이며, direct 1.80은 DV(2.118)보다 낮음 → **공급사 실측(actual)일 때만 성립**. 실측 미입수 시 이 값은 사용 불가.

---

## 4. 귀속 · 배분 결정

| 공유 항목 | 결정 | 근거 |
|---|---|---|
| 강선 vs 아연도금 강선 (같은 공정) | mass-ratio 자동 배분 (600 t : 400 t) | 지도 3단계에서 제품별 생산량 입력 → `allocation_basis=MASS` |

- 라인 합계 600+400 = 1,000 t = 공정 output_mass_t → 정합(±1% PASS). 한 공정 내 배분기준 혼용 없음(전부 MASS).

---

## 5. 핵심 가정 및 한계점

1. 전력 EF 0.47 = 앱 기본값(국가계수 추정). 공식 출처·버전 미확정 → 보수적 검토 필요.
2. 전구물질 선재 SEE 1.80/0.30 = 공급사 실측 가정. 실제로는 DV(direct 2.118, indirect 없음)와 대비 필요 — 실측 미입수 시 DV 적용 시 basis 상승.
3. CN 분류는 앱의 72/73 접두 휴리스틱 기반(pre-existing) — Annex II 실제목록/CN master 교체 전까지 분류 정확성 **확인 필요**(KB §7 P0 latent, 신규 UI가 도입한 결함 아님).
4. 생산경로("가공") DV route 지시자 "(C)"와의 정합은 확인 필요.

---

## 6. 민감도 분석

| 시나리오 | see_cbam_basis | 변화 | 비고 |
|---|---|---|---|
| 전구물질 actual(1.80) | 2.157 | 기준 | 현재 |
| 전구물질 DV 적용(2026 markup 2.330) | ≈ 2.597 | +0.44 (+20%) | DV direct=2.118, "기본값 채우기"가 간접 ≈0.212 인위 생성(P1-03) |
| 전력 EF 0 (오입력) | 2.157 | 불변 | direct-only라 basis 불변, informational_total만 −0.235 |

> SAD(현재) vs DV 비교: DV가 basis를 +20% 끌어올림 → actual 확보가 인증서 수량에 유리. 실측 출처 확정이 관건.

---

## 7. 확정기간 컴플라이언스 확인

| 항목 | 내용 | 상태 |
|------|------|------|
| 시스템 경계 | cradle-to-gate 부분집합 | ✅ |
| Direct/Indirect 분리 | source stream·전력 분리 | ✅ |
| **Annex II direct-only** | 자체+전구물질 간접을 cbam_basis에서 제외, 보존 | ✅ (회귀 없음) |
| 전구물질 가산 | direct+indirect 소비량 기반 | ✅ |
| actual > default | 전구물질 actual 우선 | ✅ (단 출처 미확정) |
| 전환기/확정기간 분리 | 2026 태그, 전환기 한도 미혼용 | ✅ |
| 추적성 | 배출원 합계 ↔ 공정 직접배출 자동 동기 | ✅ (개선) |
| CN 분류 | 72/73 접두 휴리스틱 | ⚠️ (pre-existing, KB §7) |

---

## 9. EU Communication Template export

- 첨부: `..._cbam-local-copy_20260714.xlsx` — **입력 셀 43개** 반영, `createEuTemplateExportCopyResult` 셀 검증 통과(불일치 0).
- `Summary_Products!I:K`(direct/indirect/total SEE) 공식셀 **덮어쓰기 없음** 확인(KB §10-F PASS). 앱은 D/F/H 식별 입력만 기재.
- Excel 재계산 `K`(total) ↔ 앱 `see_informational_total`(2.707) 비교는 운영자 후속 검토 슬롯.

---

**최종 판정**: see_cbam_basis = **2.157** tCO₂e/t (참고용 총 SEE 2.707) — **CONDITIONAL PASS**
(엔진 산식·Annex II 처리 회귀 없음 + EU 템플릿 보존 → PASS. 단 전력 EF·전구물질 SEE **출처/검증상태 미확정** 및 신규 UI P1 4건 → 조건부.)
