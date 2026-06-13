# CBAM 참고문서 인덱스 + SEE 산정 핵심 방법론 요약
**작성**: 씨밤이 (CBAMY) | **작성일**: 2026-06-13 | **상태**: 정확성 우선, 불확실 항목은 "확인 필요" 명시
**목적**: 씨밤이가 CBAM 내재배출량(SEE) 산정·앱(CBAM_Platform) 평가·EU 통신 템플릿 export 검증을 수행할 때, **어떤 참고문서를 언제 펼쳐보면 되는지**를 한눈에 잡아주는 인덱스 + 매 세션 반복되는 SEE 산정 방법론의 핵심 요약.

> ⚠️ **사용 원칙 (가장 중요)**: 이 문서는 **암기 대상이 아니다.** 씨밤이는 CBAM 12년차 컨설턴트지만 규정 조문·셀 위치·벤치마크 컬럼 구조를 전부 외우지 않는다. **필요할 때 아래 표에서 해당 문서를 찾아 펼쳐본다.** 본 요약은 "어디를 펼치면 답이 있는지"를 가리키는 지도이지, 법령 원문을 대체하지 않는다.
>
> ⚠️ **법령 우선순위 (프로젝트 기준)**: ① Regulation (EU) 2023/956 → ② Implementing Reg (EU) 2025/2547(SEE 산정방법·시스템경계·전구물질) → ③ 2025/2620(Free allocation/SEFA·Benchmark) → ④ 2025/2621(Default values) → ⑤ 2025/2548(인증서 가격). EU Communication Template·Q&A·Guidance·벤치마크/DV 워크북은 **운영 가이드**이며 법령을 대체하지 않는다.
>
> ⚠️ **전환기간 ≠ 확정기간**: 본 인덱스의 일부 개념 정의는 전환기간 Guidance(231121)에서 도출했다. **수치·한도·단계별 규칙은 전환기간용**이므로 2026 확정기간 라이브 로직에 그대로 쓰면 결함이다. (§B-9 비교표 참조)

---

## A. 참고문서 인덱스 — 씨밤이 펼쳐보기 가이드

> 경로: `D:/OneDrive/Business/ai automation/CBAM_Platform/CBAM_documents/`
> ⚠️ 공식 EU 워크북 원본은 git/앱에 번들 금지. 사용자 업로드본을 사용한다. 아래는 로컬 참조 사본.

### A-1. 핵심 법령·가이드 문서

| 파일 | 무엇인지 | 씨밤이가 언제 펼쳐보는지 |
|---|---|---|
| `CBAM.pdf` (3.9MB) | CBAM 종합 문서(법령/규정 본문성 자료) | 범위·의무·Annex 개념의 근거가 필요할 때(법령 우선순위 ① Reg 2023/956 확인) |
| `CBAM Guidance_EU 231121 for web_0.pdf` (98p) | **전환기간** EU 공식 Guidance — embedded emissions, direct/indirect 정의, precursor 추가, 섹터별 goods/production route, carbon price | direct/indirect·SEE·전구물질 **개념 정의**가 필요할 때. ⚠️ 수치·한도는 전환기용 → 확정기간 적용 금지 |
| `CBAM Questions and Answers.pdf` (45p, 2024-02 기준) | 전환기 Q&A(범위·통신템플릿 의무·보고책임·carbon price 등) | 운영/절차 개념 질문 시 보조 참조. ⚠️ 전환기 기준 |
| `CN CBAM codes.pdf` (9p, 3rd-party "CBAM Reports & Consulting" 편집본) | HS/CN코드 × Family(섹터) × Aggregated goods category × direct/indirect default × production route(P01~P48) 매핑. 철강 다수 indirect=N/A(Annex II direct-only) 표기 | CN→섹터·aggregated category·production route **매핑 개념** 잡을 때. ⚠️ 비공식 편집본이라 값은 공식 DV/Annex로 교차확인 |

### A-2. 확정기간(2026) 참조 워크북

| 파일 | 무엇인지 | 씨밤이가 언제 펼쳐보는지 |
|---|---|---|
| `CBAM Benchmarks_20260206.xlsx` (근거 2025/2620) | 시트 `Benchmarks`: CN code · CN Description · **Column A BMg[tCO2e/t] + route** · **Column B BMg + route**. Column A=actual SEFA용, Column B=default 시나리오용 | SEFA·free allocation 산정, 벤치마크 lookup 검증 시 |
| `DVs as adopted_v20260204 .xlsx` (근거 2025/2621) | 국가별 시트(예 `South Korea`): CN코드·설명·direct/indirect/total DV·**2026/2027/2028+ markup-inclusive 값**·production route | default value lookup(국가×CN×연도), markup 분리 보존 검증 시 |
| `carboneer-20251217-cbam-defaults-benchmarks.xlsx` | (자체/카보니어 가공) default·benchmark 통합본 | 빠른 참조용. ⚠️ 공식본(위 2개)과 값 교차확인 후 사용 |

### A-3. EU Communication Template & 예제

| 파일 | 무엇인지 | 씨밤이가 언제 펼쳐보는지 |
|---|---|---|
| `CBAM Communication template for installations_en_20241213.xlsx` (+ `.zip`, 동명 폴더) | **EU 공식 설비용 통신 템플릿**. 시트: `A_InstData·B_EmInst·C_Emissions&Energy·D_Processes·E_PurchPrec·Summary_Processes·Summary_Products·Summary_Communication` 등 19개. SEE는 `Summary_Products!I:J:K`(direct/indirect/total, 공식셀)에서 산출 | Export 매핑·셀 위치 확인, 워크북 구조/수식 보존 검증, 앱 SEE↔워크북 비교 시 (항상 펼침) |
| `2 CBAM SEE V2.1_Example Steel 1 Blast furnace_final.xlsx` | 철강 예제 ①: **고로(BF/BOF)** 경로 worked example(템플릿 V2.1 동일구조) | BF/BOF 경로 SEE·전구물질·배분 산정 흐름 검증, 회귀 케이스 |
| `3 CBAM SEE V2.1_Example Steel 2 EAF alloys_final.xlsx` | 철강 예제 ②: **EAF 합금강** worked example | EAF/scrap 경로·합금 추가 파라미터 검증 |
| `4 CBAM SEE V2.1_Example Steel 3 Screws and nuts_final.xlsx` | 철강 예제 ③: **나사·너트(다운스트림 complex good)** worked example | 전구물질 재귀·complex good 가산·Annex II direct-only 처리 검증 |
| `CBAM Self Assessment Tool Version 1.1.xlsx` | EU 자가진단 툴. 시트: `CBAM Self Assessment Tool·CN Codes·Country Codes·Value of goods` | CN/국가코드·goods 가치 기준 스코프 자가진단, de minimis/threshold 개념 참조 |
| `Communication-template-examples.zip` (8.1MB) | 통신 템플릿 작성 예제 모음 | 템플릿 입력 패턴·예시가 필요할 때 |

### A-4. additional_documents_20260530/ (확정기간 보강자료)

| 파일 | 무엇인지 | 씨밤이가 언제 펼쳐보는지 |
|---|---|---|
| `EUCBAM배산인수.pdf` (62MB) | EU CBAM 확정기간 실무 매뉴얼 — supply-chain worked examples(SEE·SEFA·인증서 시나리오) | SEE→SEFA→인증서 end-to-end 시나리오·예제 산정 검증 시 |
| `CBAMBenchmarks_20260206.xlsx` (+ 동명 폴더) | 위 Benchmarks와 동일(근거 2025/2620). 폴더는 워크북 내부 추출본(추가 요건 없음) | 벤치마크 참조(중복본) |
| `DVsasadopted_v20260204.xlsx` (+ 동명 폴더) | 위 DV와 동일(근거 2025/2621). 폴더는 내부 추출본 | default value 참조(중복본) |
| `20261차설명회발표자료집.pdf` (30MB) | 2026 확정기간 1차 설명회 발표자료 — defaults·benchmarks·검증·업무프로세스 이슈 | 확정기간 업무흐름/검증 실무 쟁점 파악 시 |
| `260204_EUCBAM_TranslationKorean_v5.pdf` (13MB) | EU CBAM 법령 한국어 번역/참조 v5 — 제품 범위, 보고필드, carbon price due, 첨부/증빙, 확정기간 데이터 요건 | 보고 필수필드·carbon price 증빙·데이터모델 한글 대조 시 |

### A-5. 동반 정책 문서 (CBAM_documents 외부, 씨밤이가 먼저 읽는 자료)

| 파일 | 무엇인지 |
|---|---|
| `docs/harness/cbam-domain-map.md` | EU 템플릿 시트↔앱 개념 매핑, 도메인 로드맵 |
| `docs/harness/cbam-2026-definitive-basis.md` | **확정기간 규제 베이스라인** — 법령 우선순위, Annex I/II, SEE 분리, SEFA·인증서, 전환기/확정기간 분리 (가장 중요한 정책 기준) |
| `docs/harness/eu-template-export-map.md` | EU 워크북 Export 셀 매핑(A_InstData·B_EmInst·C·D_Processes·E_PurchPrec·Summary_Products) + 제출 리뷰 절차 |
| `docs/harness/cbam-additional-documents-20260530.md` | 위 additional_documents의 설계 시사점(시스템경계·배분·AD/SAD/DV·SEFA) |
| `src/lib/cbam-product-rules.ts` | Annex II direct-only·indirect 적용 규칙·섹터 분류(현 구현, CN master 교체 예정) |
| `src/lib/calculation-engine.ts` | direct/indirect/precursor/total SEE 계산 흐름·배분·경고 |
| `src/lib/source-stream-calculation.ts` | source stream 배출·에너지(활동량×NCV×EF×OF×CF) 산식 |

### A-6. 씨밤이 자체 자산 (캐논 경로)

| 자산 | 경로 | 용도 |
|---|---|---|
| 데이터셋 (공식 DV·벤치마크) | `cbamy/data/cbam-defaults.json` | **모든 기본값(DV)·벤치마크 수치는 이 파일에서만 조회**. 임의 산정·웹검색 금지. (공식 EU 자료, 가상 아님) |
| 검증 레퍼런스 KB | `cbamy/knowledge/cbam-verification-reference.md` | 확정기간 제3자 검증 기준·자가진단 체크리스트. 앱 평가 시 1차 PASS/FAIL 기준 |
| 시나리오 | `cbamy/scenarios/steel-hrc.md` | 철강(열연코일 HRC) 산정 시나리오 |
| 앱 체크리스트 | `cbamy/scenarios/steel-hrc-app-checks.md` | ⚠️ **운영자 전용 — 씨밤이에게 노출 금지** |
| 산출물 보관 | `cbamy/runs/<YYYY-MM-DD>_runNN/` | 세션별 산출물 4종 |

> 데이터 원칙: DV·벤치마크 숫자는 절대 지어내지 않는다. 반드시 `cbamy/data/cbam-defaults.json`에서 CN코드·국가·연도로 조회한다. 참조 워크북 자체는 앱에 번들하지 않고, 사용자가 최신 공식본을 업로드/임포트하며 버전 메타데이터를 저장한다(harness 정책).

---

## B. SEE 산정 핵심 방법론 요약 (2026 확정기간 기준)

> 본 요약은 매 세션 반복되는 SEE 산정 골격을 압축한 것이다. **세부 산식·한도·셀 위치가 필요하면 §A의 해당 문서를 펼쳐본다.** 불확실한 항목은 "확인 필요"로 표기했으며, 단정하지 않는다.

### B-1. SEE 정의 — 총배출 vs 비배출량

- **Embedded emissions(내재배출량)**: CBAM 목적상 제품에 내재된 GHG 배출. CFP와 유사하나 **EU ETS가 포괄하는 범위로 한정**(상류 채굴·운송·사용·폐기 단계 제외 — CFP보다 좁은 cradle-to-gate 부분집합). 근거: Guidance §6.1.3.
- **SEE (Specific Embedded Emissions, 비내재배출량)** = 제품 단위당 내재배출량 = **direct + indirect**, 단위 **tCO2e / t of goods**(전력은 tCO2e/MWh). 산출 절차(Guidance §6.1.3):
  1. 설비(installation) 총배출 → 생산공정(production process)에 **귀속(attribute)**
  2. 관련 **전구물질 내재배출 가산**
  3. 각 생산공정의 **활동수준(activity level, 생산량)으로 나눔** → 제품의 SEE
- **총배출(total/absolute emissions, tCO2e)** vs **비배출량(specific emissions, SEE, tCO2e/t)** 구분이 핵심. 인증서 수량은 `수입량(t) × SEE_cbam_basis`로 산출되므로 둘을 혼동하면 안 됨.
- **GHG 종류**: CO2(전 섹터), 일부 비료에 N2O, 일부 알루미늄에 PFC 추가. N2O·PFC는 tCO2e로 환산(Guidance §6.2.3/§6.2.4).
- **앱 내부 분리(확정기간 필수)** — 단일 `total_see`는 불충분:
  - `see_direct`: 직접 SEE
  - `see_own_indirect`: 최종제품 자체 전력 간접 SEE
  - `see_precursor_contribution`: 전구물질 내재배출 기여
  - `see_cbam_basis`: 인증서 산정 기준 SEE (Annex II 처리 반영)
  - `see_informational_total`: 운영/검토용 총 SEE
  - 비Annex II: `see_cbam_basis = direct + own_indirect + eligible_precursor`
  - Annex II direct-only: `see_cbam_basis = direct + eligible_precursor` (own_indirect는 보고/검토용으로 보존, 인증서 기준에서 제외)

### B-2. Direct emissions (직접배출)

- **정의**(Guidance 각주): 제품 생산공정에서 발생하는 배출 — 생산 중 소비된 열/냉방 생산 배출 포함(위치 무관). 즉 **연소·공정·열/냉방·폐가스(waste gas)** 포함, 운송·사용·폐기 제외.
- **산정 방식 2종(+물질수지)**:
  - **Calculation-based(계산기반)**: source stream별 `배출 = 활동데이터 × EF × oxidation factor`(연소) 또는 `× conversion factor`(공정). 연소 source stream은 **NCV(순발열량) 적용**.
  - **Measurement-based(측정기반)**: CEMS 등 연속측정. (확정기간 허용조건은 2025/2547 **확인 필요**)
  - **Mass balance(물질수지)**: 탄소함량 기반 투입-산출 차감.
- **앱 source-stream 산식**(`src/lib/source-stream-calculation.ts`):
  - 연소(FUEL/Combustion): `활동량 × NCV × EF × oxidation × conversion × fossil_fraction / 1000` (GJ→TJ 변환 위해 ÷1000, EF 단위 tCO2/TJ 가정)
  - 공정(Process): `활동량 × EF × oxidation × conversion × fossil_fraction`
  - 바이오매스 분율은 별도 에너지 분해로 추적(fossil/biomass 분리).
- **EU 템플릿 매핑**: `B_EmInst`에 source stream명·활동데이터(F)·단위(G)·NCV(H)·EF(J)·EF단위(K)·oxidation factor(N, %)·conversion factor(P, %)·biomass fraction(R, %). 계산된 CO2e/에너지/완전성 셀은 **공식 셀이라 덮어쓰지 않음**.
- ⚠️ 코드 단순화: `direct_see = direct_attributable_emissions_tco2e / output_mass_t`. source stream 합계와 공정 직접배출 입력값 불일치 시 경고(추적성 검증). 확정기간 정밀 산식과의 정합은 **확인 필요**.

### B-3. Indirect emissions (간접배출) + Annex II direct-only 제외 규칙

- **정의**(Guidance 각주): 제품 생산공정에서 소비된 **전력 생산에 기인한 배출**.
- **산식**(Guidance §6.1.4, Eq. 49/44): `AttrEm_indir = E_el × EF_el`
  - E_el = 소비전력(MWh 또는 TJ), EF_el = 전력 배출계수(tCO2/MWh). SEE_indirect = (E_el × EF_el) / 생산량.
- **EF_el 출처 규칙**(Guidance §6.1.4/§6.1.6):
  - 원칙: Commission 제공 **국가·지역별 default**(IEA 기반).
  - actual 허용 조건(Annex IV §6): ① 발전원과 설비 간 **직접 기술적 연결(direct technical link)**, 또는 ② **PPA(전력구매계약)** 체결분.
  - **Guarantees of Origin·녹색인증서 등 market-based instrument 사용 금지**.
- **Annex II direct-only 제외 규칙(확정기간 핵심)**:
  - Annex II는 **scope 제외 목록이 아님**. Art. 7(1)에 따라 **직접배출만 고려**하는 품목 목록.
  - Annex II 최종재의 **자체 전력 간접배출은 CBAM 인증서 산정 기준 SEE에서 제외**. 단 보고·공급사검토·LCA식 검토·워크북 통신용으로는 **보존**.
  - **철강(iron&steel)**: 일반적으로 전력 제외. 단 **응결 철광석·정광 CN 2601 12 00은 간접배출 포함**(예외)(additional-docs 노트·코드 규칙 일치).
  - ⚠️ 코드 현 구현(`src/lib/cbam-product-rules.ts`): `cn 72/73 → 간접 제외(IRON_STEEL_CERTIFICATE_BASIS_EXCLUDED)`, `2601 12 00 → 포함`. 단 harness 정책은 **prefix 휴리스틱 금지, CN master 기반 분류 권고** → 72/73 접두 규칙은 임시이며 CN별 Annex II 실제목록으로 교체 **필요**.
  - **Annex II ≠ 모든 전구물질 간접 무시**: 비Annex II 전구물질에 내재된 간접배출은 Annex II 최종재로 **흘러들어갈 수 있음**(전구물질별 자체 분류로 평가).

### B-4. Precursors (전구물질) 내재배출 반영

- **개념**(Guidance §6.1.5/§6.2.3): 전구물질(CBAM good)을 투입·소비해 다른 CBAM good을 만들면 그 최종재는 **complex good**. 전구물질의 내재배출(**direct + indirect 모두**)을 최종재 내재배출에 **가산**. 전구물질이 또 complex good이면 **재귀적으로 반복**.
- **앱 산식**: `precursor_emissions = Σ(소비량 consumed_mass_t × (precursor.direct_see + precursor.indirect_see))`, `precursor_see = precursor_emissions / output`. (질량비 기반 — 소비 전구물질 SEE를 제품으로 전가)
- **데이터 모드**: actual 우선, 미입수 시 전구물질 **default value** 사용 가능(§B-7). 모드 조합:
  - `AD`(actual data): 자체+전구물질 모두 검증 실측
  - `SAD`(semi-actual): 자체는 실측, 일부 전구물질은 default/semi
  - `DV`: 최종재 default 사용
  - ⚠️ **SAD가 DV보다 불리할 수 있음**: 전구물질 default는 markup 포함이라 총합을 지배할 수 있음 → 시나리오 비교 필요.
- **분류별 처리**: 전구물질마다 자체 CN 분류·원산지·actual/default·direct/indirect 적용 여부로 기여를 산정. Annex II 최종재라도 전구물질 indirect를 자동 0으로 만들지 않음.
- **EU 템플릿 매핑**: `A_InstData`에 전구물질 등록(E102:F102:L102), `E_PurchPrec`에 구매량/소비량/비CBAM소비/direct SEE/indirect SEE. (현 앱은 indirect SEE를 단일값으로 저장 → 워크북의 "전력소비×EF" 구조에 맞추려 임시 bridge: 전력소비=1, EF=indirect SEE. 추후 두 입력 분리 **필요**)

### B-5. System boundary / production process / attribution(귀속) / 다단계 공정

- **System boundary(시스템 경계)**: EU ETS 포괄 범위 = cradle-to-gate 부분집합. 상류 채굴·사이트 간 운송·사용·폐기 **제외**(Guidance §6.1.3, Fig 6-1).
- **Production process 정의**: 설비 내 배출을 귀속받는 단위. **하나의 경계가 여러 내부 step을 포함 가능**. 같은 경계 내 중간재(intermediate product)는 **별도 판매/수출되지 않으면 별도 제품 SEE 불필요**(additional-docs 노트).
- **Attribution(귀속) 규칙**: 설비 총배출 → production process로 귀속(Guidance §6.1.3 "attributed"). 근거: 2025/2547 / 전환기 Annex III §F(installation→goods 귀속 규칙). 측정 가능한 공정데이터 우선.
- **CN 동일재 통합**: 한 설비 내 같은 CN코드 goods는 정당한 상업적 사유 없으면 **하나의 production process로 통합**(additional-docs 노트).
- **복수 생산경로(production route)**: 같은 CN이 서로 다른 경로(BF/BOF, DRI/EAF, scrap/EAF 등)로 생산되고 다른 process에 배정되면 **경로별 별도 산정·보고**(Guidance §6.2.3).
- **외주(outsourced) 공정**: 경계 내이고 직접배출 있으면 actual/검증가능 데이터 존재 여부 확인, 없으면 default 처리.

### B-6. Allocation (배분) — 공유 source stream / material flow

- **원칙**: 공유 배출은 가능한 한 **측정된 공정데이터**로 goods에 귀속. 직접 계량 불가 시 **mass-ratio(질량비)** 또는 **molar-ratio(몰비)** 적용. 물질수지에서는 **output subtraction(산출물 차감)** 사용(additional-docs 노트).
- **앱 product-line 배분**(`src/lib/calculation-engine.ts`): 공정 총배출을 제품 생산라인별로 `allocation_share`로 배분.
  - 자동: `share = line.output_mass / Σ output_mass`(질량 배분)
  - 수동: `share = manual_percent / Σ manual_percent`
  - **한 공정 내 배분기준 혼용 금지(경고)**, 라인 합계 ≠ 공정 총생산량 시 허용오차(1%) 검증 경고.
- ⚠️ molar-ratio 배분은 아직 미구현, mass·정당화된 manual 우선(harness 백로그). EU 템플릿 `D_Processes`는 공정 총량 입력 중심이라 제품라인 배분 결과는 **워크북 SEE 셀에 직접 쓰지 않고 readiness 경고로 처리**.

### B-7. Default values(DV) 사용 규칙

- **우선순위: actual > default**. DV는 actual 미입수 시 대체값(Guidance §6.1.5/§6.1.6). DV는 보수적(높게) 설정되어 actual이 유리한 경우가 많음.
- **DV 단위·구조**: CN코드별 direct/indirect/total **SEE(tCO2e/t good)**. CN 4·6·8자리 단계 적용(8자리는 주로 철강, 경로·합금 차이 반영).
- **확정기간 DV 워크북(`DVs as adopted_v20260204.xlsx`, 근거 2025/2621) 구조 확인됨**:
  - 국가별 시트(예: `South Korea`).
  - 컬럼: `Product CN Code | Description | Default Value(direct) | (indirect) | (total) | 2026 Default Value(incl. markup) | 2027 (incl. markup) | 2028 and onwards (incl. markup) | Underlying production route`.
  - 즉 **연도별 markup 포함값 별도 컬럼**(2026 / 2027 / 2028+). markup-inclusive 값과 raw direct/indirect/total을 **분리 보존**해야 함.
- **lookup 규칙**: 국가 × CN코드 × 보고/생산연도로 해석. 누락 국가/CN fallback은 적용 가능한 공식 규칙 확인 후에만 추가(harness 정책).
- ⚠️ markup의 정확한 % 및 적용 대상(전구물질 default markup 규칙)은 **2025/2621 원문 확인 필요**. 전환기 Guidance의 "complex goods default 20% 한도", "2024-07-31 무제한 사용" 등은 **전환기 규칙이므로 확정기간 적용 금지**.
- **수치는 `cbamy/data/cbam-defaults.json`에서만 조회.** 참조 워크북은 앱 번들 금지, 사용자 업로드 + 버전 메타데이터 저장(harness 정책).

### B-8. Benchmarks + SEFA/CSCF + free allocation + carbon price paid + certificate

- **Benchmark 워크북(`CBAM Benchmarks_20260206.xlsx`, 근거 2025/2620) 구조 확인됨**:
  - 시트 `Benchmarks`, 컬럼: `CN code | CN Description | Column A BMg [tCO2e/t] | Column A Production route | Column B BMg [tCO2e/t] | Column B Production route`.
  - **Column A = actual data 시나리오 SEFA 산정용**, **Column B = default-value 시나리오용**(harness 노트). production route 지시자로 경로 구분.
- **SEFA (Specific Embedded Free Allocation)**: 단위당 무상할당 상당량. **표시값이 아니라 인증서 수량을 바꾸는 1급 값**. 전구물질 actual 사용 시 전구물질별 SEFA 반영.
- **CSCF (Cross-Sectoral Correction Factor)** 및 **CBAM factor**: 연도/기간별 적용. (정확한 연도값은 **확인 필요**)
- **인증서 시나리오 흐름(harness 권고, 산식 골격)**:
  ```
  gross_embedded               = imported_mass × see_cbam_basis
  free_allocation_adjustment   = imported_mass × sefa
  certificate_quantity         = gross_embedded − free_allocation_adjustment − eligible_carbon_price_paid_reduction
  certificate_cost             = certificate_quantity × applicable_certificate_price
  ```
- **Carbon price paid(기지불 탄소가격)**: 원산지국에서 이미 지불한 유효 탄소가격은 인증서 의무 경감 가능. ETS/세·부과금 유형별로 가격·적용범위(direct/indirect)·rebate를 분리 추적. 증빙 없으면 0으로 가정(Guidance §6.2.5). **pending/estimated/confirmed** 상태로 관리(하드코딩 차감 금지).
- **인증서 가격(2025/2548)**: 2026년 **분기별**, 2027년부터 **주별**. 추정가격은 명확히 라벨.
- ⚠️ 워크북 예제는 carbon price paid = 0 가정 → 정확한 공식·보고처리 검증 전까지 라벨된 입력 이상으로 차감 구현 금지.

### B-9. 전환기간(~2025) vs 2026 확정기간 — 절대 혼용 금지

| 구분 | 전환기간 (2023-10-01 ~ 2025-12-31) | 2026 확정기간 (definitive) |
|---|---|---|
| 근거 | Reg 2023/956 + Impl. 2023/1773 | Reg 2023/956(개정) + Impl. 2025/2547·2620·2621·2548 |
| 의무 | 데이터 보고만(재정의무 없음) | **CBAM 인증서 구매·반납(재정의무)** |
| 검증 | 의무 검증 없음(또는 제한적) | 제3자 검증 강화(확인 필요) |
| Default 한도 | 2024-07-31까지 무제한, complex good 20% 한도 등 | **전환기 한도 적용 안 됨** — 확정기간 DV 규칙(2025/2621) |
| Free allocation/SEFA | 미적용(보고만) | **SEFA/CSCF/벤치마크 적용** |
| 인증서 가격 | 해당 없음 | 2026 분기별 / 2027~ 주별 |
| 데이터 출처 | 전환기 워크북·Guidance(231121) | 확정기간 워크북(Benchmarks_20260206, DV_v20260204) |

- **프로젝트 원칙**: 전환기 자료는 **historical/reference only**. 라이브 산정은 확정기간 법령 기반. 전환기 수치·한도를 확정기간 로직에 섞으면 결함.

### B-10. EU Communication Template 시트 구조와 SEE 산출 위치

> 워크북: `CBAM Communication template for installations_en_20241213.xlsx` (= 철강 예제 V2.1과 동일 구조). 이 워크북은 **법령이 아니라 설비운영자↔신고declarant 간 데이터 통신·전달 도구**. 원본 sheet명·라벨·수식·검증·보호영역 **보존**, 확인된 입력셀만 작성.

**전체 시트(확인됨)**: `0_Versions · a_Contents · b_Guidelines&Conditions · c_CodeLists · A_InstData · B_EmInst · C_Emissions&Energy · D_Processes · E_PurchPrec · F_Tools · G_FurtherGuidance · Summary_Processes · Summary_Products · Summary_Communication · InputOutput · Parameters_Constants · Parameters_CNCodes · Translations · VersionDocumentation`

| 시트 | 역할 | SEE 관련 |
|---|---|---|
| `A_InstData` | 설비 정보·보고기간·검증자·aggregated goods·생산경로·구매 전구물질 등록 | SEE 입력 전제(제품·공정·전구물질 식별) |
| `B_EmInst` | source stream·배출원·활동데이터·NCV·EF·oxidation/conversion factor | **direct 배출 계산 입력원**(연소/공정/물질수지) |
| `C_Emissions&Energy` | 연료수지·GHG수지·**간접배출**·데이터품질·QA | **indirect 배출**(M26에 전력×EF 총합 수동입력), fuel/GHG balance는 수식 |
| `D_Processes` | 생산공정 생산수준·시장산출·내부소비·**직접귀속배출**·열·폐가스·전력 | direct/indirect 배출의 공정 귀속·생산량(SEE 분모) |
| `E_PurchPrec` | 구매 전구물질 구매량·공정별 소비·**direct/indirect SEE** | **전구물질 SEE 기여** |
| `Summary_Processes` | 설비·공정 수준 결과 요약 | 공정 SEE 집계 |
| `Summary_Products` | 제품 CN코드·제품명·**direct SEE·indirect SEE·total SEE** | **제품 SEE 최종 산출 위치** — I:J:K 컬럼이 **공식셀(읽기전용)** |
| `Summary_Communication` | 신고declarant용 요약 | 통신 요약 |

- **SEE 최종 산출 위치**: 워크북은 `B_EmInst`(direct)·`C_Emissions&Energy`(indirect)·`E_PurchPrec`(precursor) 입력을 받아 **`Summary_Products!I:J:K`(direct/indirect/total SEE)를 수식으로 산출**. 앱은 **이 SEE 셀을 덮어쓰지 않고**(읽기전용), 제품식별 입력(D:공정명, F:CN코드, H:제품명)만 기재.
- **앱↔워크북 비교 원칙**: 워크북 `K`(total SEE)는 앱의 `see_informational_total`(참고용 총 SEE)에 가장 근접(모든 전구물질 매핑 시). 앱의 `see_cbam_basis`(CBAM 기준 SEE)는 **별개 개념**이므로 워크북 total과 동일시 금지. Excel 재계산 후 비교·차이 리뷰 리포트 생성.
- 셀 매핑 세부는 항상 `docs/harness/eu-template-export-map.md`를 펼쳐 확인.

---

## C. 빠른 참조 — "이 질문엔 이 문서를 펼친다"

| 씨밤이의 질문 | 펼쳐볼 곳 |
|---|---|
| direct/indirect/embedded emissions **개념 정의**가 헷갈린다 | `CBAM Guidance_EU 231121`(§6.1.3~6.1.6) — ⚠️ 개념만, 수치는 전환기 |
| 확정기간 **법적 골격·우선순위**가 필요하다 | `docs/harness/cbam-2026-definitive-basis.md` |
| 특정 CN코드의 **DV(국가×연도)** 값 | `cbamy/data/cbam-defaults.json` (출처: DV_v20260204, 2025/2621) |
| **벤치마크/SEFA** 산정 (Column A/B) | `cbamy/data/cbam-defaults.json` (출처: Benchmarks_20260206, 2025/2620) |
| Annex II **direct-only** 적용 여부 | `src/lib/cbam-product-rules.ts` + `CN CBAM codes.pdf`(교차확인) |
| Export **셀 위치**·워크북 구조 | `docs/harness/eu-template-export-map.md` + 통신 템플릿 워크북 |
| 철강 **worked example**(BF/EAF/Screws) | `2~4 CBAM SEE V2.1_Example Steel*.xlsx` |
| SEE→SEFA→**인증서 end-to-end** | `EUCBAM배산인수.pdf` + `docs/harness/cbam-2026-definitive-basis.md` |
| 보고 필수필드·carbon price 증빙 **한글 대조** | `260204_EUCBAM_TranslationKorean_v5.pdf` |
| 산출물이 **제3자 검증** 기준을 충족하는가 | `cbamy/knowledge/cbam-verification-reference.md` |

> 마지막으로 한 번 더: **이 인덱스는 외우는 게 아니라 펼쳐보라고 있는 것이다.** 확신이 서지 않으면 위 표에서 문서를 찾아 원문을 확인하고, 그래도 불확실하면 산출물에 "확인 필요"로 남긴다. 단정하지 않는 것이 씨밤이의 기본값이다.

---