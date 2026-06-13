# 씨밤이 (CBAMY) — 컨설턴트 키트

> **이 폴더는 무엇인가**: CBAM 내재배출량(SEE) 산정 컨설턴트 AI 페르소나 **씨밤이(CBAMY)** 와, 씨밤이가 일하는 데 필요한 데이터·지식·시나리오·산출물을 한곳에 모은 키트입니다.
> **씨밤이는 카보니(Carbony)의 CBAM 버전입니다.** 카보니가 ISO 14067 제품 탄소발자국(CFP)을 다룬다면, 씨밤이는 EU CBAM 규정에 따른 내재배출량(SEE)을 다룹니다.
> **홈 경로**: `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/`

---

## 씨밤이가 무엇인가

씨밤이는 두 가지 역할을 동시에 수행하는 AI 페르소나입니다.

1. **SEE 산정 컨설턴트** — 주어진 시나리오(예: 철강 열연코일)에 대해 EU CBAM 규정 기준의 내재배출량(Specific Embedded Emissions, **SEE** / tCO2e per t goods)을 산정합니다. direct + indirect + precursor(전구물질) 배출을 분리·합산하고, EU 공식 통신 템플릿(EU Communication Template)으로 export하는 흐름까지 따라갑니다.
2. **앱 평가자** — 같은 작업을 하면서 **CBAM_Platform**(Next.js PWA) 앱의 UX·기능·컴플라이언스 결함을 발견하고 기록합니다. "실제 컨설턴트가 이 앱으로 CBAM 신고를 처음 준비할 때 어디서 막힐까?"의 관점을 유지합니다.

순수 페르소나 시뮬레이션이 아니라 **"메타 인식이 있는 컨설턴트"** 입니다 — 일을 하면서 동시에 앱의 부족한 점을 짚어냅니다.

> ⚠️ **기준 시점**: 씨밤이는 **2026 확정기간(definitive period)** 기준으로 작업합니다. 전환기간(transitional period) 가이드의 수치·한도를 확정기간에 그대로 적용하지 않습니다. 전환기/확정기간 자료를 섞지 않는 것이 핵심 규칙입니다.

### 자매 페르소나 — 디자이너 씨밤이

시각·UX/UI 감사는 별도 페르소나 **디자이너 씨밤이**(`designer-persona.md`, D0/D1/D2 등급)가 담당합니다. 본 페르소나(`persona.md`)는 **계산·컴플라이언스**(P0/P1/P2)에 집중하며 디자인 결함은 다루지 않습니다.

| 페르소나 | 담당 | 결함 등급 |
|---|---|---|
| 씨밤이 (`persona.md`) | SEE 산정·CBAM 컴플라이언스·앱 기능 | P0 / P1 / P2 |
| 디자이너 씨밤이 (`designer-persona.md`) | 시각·UX/UI 감사 | D0 / D1 / D2 |

---

## 폴더 구조

```
cbamy/
├── README.md                         # (이 파일) 키트 안내
├── persona.md                        # 씨밤이 컨설턴트 페르소나 — 시스템 프롬프트 포함
├── designer-persona.md               # 디자이너 씨밤이 (UI 감사, D0/D1/D2)
├── data/
│   └── cbam-defaults.json            # CBAM 공식 기본값(DV)·벤치마크 참조 데이터셋
├── knowledge/
│   ├── cbam-reference-index.md       # 참고문서 색인 (../CBAM_documents 안내)
│   └── cbam-verification-reference.md# 검증 레퍼런스 KB (검증기관 점검 기준)
├── scenarios/
│   ├── steel-hrc.md                  # 시나리오: 철강 열연코일(HRC)
│   └── steel-hrc-app-checks.md       # ⚠️ 운영자 전용 — 씨밤이에 노출 금지
└── runs/
    └── <YYYY-MM-DD>_runNN/           # 산출물 보관 (run 단위)
```

### 데이터 상태

| 자료 | 상태 |
|---|---|
| `data/cbam-defaults.json` | **공식 EU 기본값(Default Values, DVs)·벤치마크(Benchmarks)** 를 참조한 데이터셋입니다. 카보니의 `emission-factors.json`이 가상 계수였던 것과 달리, 씨밤이의 데이터는 **공식 EU 자료 기반(가상 아님)** 입니다. 근거 원본은 `../CBAM_documents`의 `DVs as adopted_v20260204 .xlsx`(근거 2025/2621), `CBAM Benchmarks_20260206.xlsx`(근거 2025/2620). |

> **Anti-Hallucination**: 씨밤이는 CBAM 기본값·벤치마크 숫자를 임의로 지어내지 않습니다. 모든 값은 `data/cbam-defaults.json`(또는 위 공식 원본)에서 조회합니다. 규정 인용이 불확실하면 "확인 필요"로 표기하고 단정하지 않습니다.

### ⚠️ 씨밤이에 노출 금지

- 운영자 전용 함정 평가표 (`scenarios/steel-hrc-app-checks.md` 등 `*-app-checks.md`)
- 이전 run의 `improvement-suggestions.md` (탐색 모드 시 — 결함 정답 누출)

---

## 참고문서는 상위 `../CBAM_documents` 에 있음

씨밤이가 펼쳐보는 EU 법령·가이드·확정기간 워크북·통신 템플릿·예제는 이 폴더가 아니라 **상위 디렉터리**에 있습니다.

> 경로: `D:/OneDrive/Business/ai automation/CBAM_Platform/CBAM_documents/`

색인과 "언제 무엇을 펼쳐보는지"는 `knowledge/cbam-reference-index.md`에 정리되어 있습니다. 핵심 묶음만 요약:

| 분류 | 핵심 파일 | 씨밤이가 언제 펼치나 |
|---|---|---|
| 법령·가이드 | `CBAM.pdf`, `CBAM Guidance_EU 231121 for web_0.pdf`, `CBAM Questions and Answers.pdf`, `CN CBAM codes.pdf` | 범위·의무·direct/indirect·precursor **개념 정의**, CN→섹터 매핑 (가이드/Q&A는 ⚠️ 전환기 기준이므로 수치 적용 금지) |
| 확정기간 워크북 | `DVs as adopted_v20260204 .xlsx`, `CBAM Benchmarks_20260206.xlsx` | default value / 벤치마크 lookup·검증 (국가×CN×연도, markup 분리 보존) |
| 통신 템플릿·예제 | `CBAM Communication template for installations_en_20241213.xlsx`, `2~4 CBAM SEE V2.1_Example Steel ...xlsx` | Export 셀 매핑, BF/BOF·EAF·나사너트 worked example로 SEE·배분 산정 검증 |
| 확정기간 보강자료 | `additional_documents_20260530/` (실무 매뉴얼·설명회·한국어 번역) | SEE→SEFA→인증서 end-to-end 시나리오, 보고 필수필드 한글 대조 |

> ⚠️ 공식 EU 워크북 원본은 git/앱에 번들 금지입니다. 위 표의 사본은 로컬 참조용이며, 비공식 편집본(`CN CBAM codes.pdf`, `carboneer-...xlsx`)의 값은 항상 공식 DV/Annex로 교차확인합니다.

> 정책 베이스라인(법령 우선순위, Annex I/II, SEE 분리, SEFA·인증서, 전환기/확정기간 분리)은 `../docs/harness/cbam-2026-definitive-basis.md`가 가장 중요한 기준입니다. EU 템플릿↔앱 개념 매핑은 `../docs/harness/cbam-domain-map.md`, Export 셀 매핑은 `../docs/harness/eu-template-export-map.md`를 참조합니다.

---

## 어떻게 실행하는가

씨밤이를 한 번 돌리는 방법은 두 가지입니다.

### 방법 1 (권장): 전용 스킬 `cbamy-regression-run`

탐색·회귀 1회 실행에 필요한 절차(모드 판별 → 자료 로드 → 앱 사용 → 4종 산출물 생성 → run 폴더 보관)를 표준화한 스킬입니다.

> 스킬 위치: `C:/Users/NT940XHA/.claude/skills/cbamy-regression-run/`
> - `SKILL.md` — 실행 프로토콜
> - `scoring-rubric.md` — 운영자 채점 기준
> - `templates/first-message-explore.md`, `templates/first-message-regression.md` — 첫 메시지
> - `templates/output-formats/see-result.md.template`, `usage-log.md.template`, `improvement-suggestions.md.template`, `client-questions.md.template`

발동 트리거 예: "씨밤이 회귀 돌려줘", "씨밤이 실행", "run0X 시작", "회귀 검증 / 탐색 모드".

### 방법 2: 시스템 프롬프트 수동 주입

스킬을 쓰지 않을 때는 `persona.md`의 `## 시스템 프롬프트` 블록을 새 대화의 첫 메시지로 직접 붙여넣습니다. 함께 첨부할 것:

- 시나리오 파일 (`scenarios/steel-hrc.md`) — ⚠️ 운영자 전용 `*-app-checks.md`는 첨부 금지
- 데이터셋 (`data/cbam-defaults.json`)
- 필요 시 `../CBAM_documents`의 해당 법령/워크북/예제

### 운영 모드

씨밤이는 LLM이라 직접 마우스 조작을 하지 못합니다. **Mode 1+2 하이브리드**(텍스트 시뮬레이션 + 스크린샷 대화)로 운영하며, 사람이 대신 앱을 클릭합니다. 화면 흐름은 다음과 같습니다.

```
products → processes → source-streams → precursors → periods → results → export(EU Communication Template)
```

### 탐색 모드 vs 회귀 모드

| 모드 | 언제 | 목적 |
|---|---|---|
| 🔍 탐색 (Explore) | 새 시나리오로 처음 실행 | 신규 결함 발견 |
| 🔁 회귀 (Regression) | 이전 run의 결함이 수정된 후 | 수정 검증 + 회귀·신규 결함 발견 |

---

## 산출물 (한 세션당 4종)

세션 종료 시 `runs/<YYYY-MM-DD>_runNN/` 폴더에 다음 4개 파일을 생성합니다. 표준 형식은 스킬의 `templates/output-formats/` 참조.

| 파일 | 용도 |
|---|---|
| `see-result.md` | SEE 산정 결과 (direct/indirect/precursor/total) + 단계별 분해 + 한계점 + 민감도 |
| `usage-log.md` | 1인칭 사용 일지 + 각 검증 항목 PASS/FAIL |
| `improvement-suggestions.md` | 신규 발견 결함 P0/P1/P2 분류 |
| `client-questions.md` | 클라이언트 추가 질의 (긴급/일반 우선) |

### 결함 등급

| 등급 | 기준 |
|---|---|
| **P0** | 산정 차단 / CBAM 컴플라이언스 위반 / 데이터 무결성 위반 |
| **P1** | 실수 유발 / 컨설턴트 답답함 / 추적성 약화 |
| **P2** | 개선 권고 (있으면 좋음) |

---

## 카보니 → 씨밤이 도메인 매핑

키트 구조는 카보니와 동일하고, 도메인만 CBAM으로 각색했습니다.

| 항목 | 카보니 (Carbony) | 씨밤이 (CBAMY) |
|---|---|---|
| 표준 | ISO 14067/14040/14044/14064-3 | EU CBAM 규정 (EU)2023/956, 이행규정, 2026 확정기간 |
| 산정 대상 | 제품 탄소발자국 CFP (kg CO2eq/FU) | 내재배출량 SEE (tCO2e/t goods) — direct + indirect + precursor |
| 데이터 | 가상 배출계수(`emission-factors.json`) | CBAM 공식 기본값·벤치마크(`cbam-defaults.json`) — 공식 EU, 가상 아님 |
| 앱 | CarbonMate | CBAM_Platform (Next.js PWA) |
| 시나리오 | 황산니켈 | 철강(iron & steel; BF/EAF/Screws&nuts 예제) |
| 산출물 | cfp-result 외 4종 | see-result 외 4종 |
| 자매 페르소나 | 디자이너 카보니 | 디자이너 씨밤이 |

---