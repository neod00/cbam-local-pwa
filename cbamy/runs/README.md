# cbamy/runs/ — 실행 산출물 보관소

> **이 폴더의 용도**: 씨밤이(CBAMY) 1회 실행(run)마다 생성되는 산출물을 한 폴더에 모아 둡니다. CBAM 비내재배출량(SEE, Specific Embedded Emissions, 제품 단위당 내재배출량) 산정 앱(CBAM_Platform)의 결함을 사전 발견하거나, 수정 후 회귀 검증한 기록이 여기에 쌓입니다.
>
> **씨밤이란?** 카보니(Carbony)의 CBAM 버전입니다. ISO 14067 제품 탄소발자국 컨설턴트 카보니를, EU CBAM 규정 (EU)2023/956 및 이행규정(Implementing Regulation) 기반 내재배출량 컨설턴트로 각색한 자매 페르소나입니다.

---

## 폴더 규칙 (한 줄 요약)

**한 세션 = 한 폴더.** 세션마다 `cbamy/runs/<YYYY-MM-DD>_runNN/` 폴더를 만들고, 그 안에 산출물 4종을 보관합니다.

- `<YYYY-MM-DD>`: 실행 날짜 (예: `2026-06-13`)
- `runNN`: 같은 날 실행 순번. **그날 첫 실행이면 `run01`**, 두 번째면 `run02` …
- 예: `cbamy/runs/2026-06-13_run01/`

날짜가 같아도 별도 세션이면 번호를 올립니다. 날짜가 바뀌면 다시 `run01`부터 시작합니다.

---

## 산출물 4종 (표준 형식 강제)

세션 종료 시 폴더 안에 다음 4개 파일을 반드시 생성합니다. 각 파일의 표준 형식은 전용 스킬의 `templates/output-formats/` 를 따릅니다.

| 파일 | 용도 | 템플릿 |
|------|------|--------|
| `see-result.md` | SEE 산정 결과(tCO2e/t goods) + direct·indirect·precursor 분해 + 한계점 + 민감도 | `templates/output-formats/see-result.md.template` |
| `usage-log.md` | 1인칭 사용 일지 + 각 검증 항목 PASS/FAIL | `templates/output-formats/usage-log.md.template` |
| `improvement-suggestions.md` | 신규 발견 결함 P0/P1/P2 분류 | `templates/output-formats/improvement-suggestions.md.template` |
| `client-questions.md` | 클라이언트(설치자/공급사) 추가 질의 (긴급/일반 우선) | `templates/output-formats/client-questions.md.template` |

> **인계 직전 run 한정**: 회귀 모드 최종 run에서는 `client-questions.md` 대신 `final-handoff-notes.md`로 대체할 수 있습니다.

---

## 산출물이란 무엇인가 (간단 설명)

- **see-result.md** — 산정 본체. 제품(예: 철강 iron & steel — BF/EAF, 나사·너트 Screws & nuts)의 내재배출량을 **direct(직접) + indirect(간접, 전력) + precursor(전구물질)** 로 나눠 보여 줍니다. Annex II direct-only 품목(인증서 산정 기준에서 자체 간접배출 제외)은 그 처리를 명시합니다. 기본값(Default Values, DVs)·벤치마크(Benchmarks)를 쓴 부분은 출처와 함께 표기합니다. CBAM 공식 숫자는 데이터셋 `cbamy/data/cbam-defaults.json`을 근거로 인용하며, **임의로 지어내지 않습니다.**
- **usage-log.md** — 씨밤이가 앱(CBAM_Platform)을 화면 흐름(products → processes → source-streams → precursors → periods → results → export)대로 따라가며 입력·검증한 과정을 시간순으로 기록한 일지. 검증 항목마다 PASS/FAIL.
- **improvement-suggestions.md** — 이번 run에서 새로 발견한 결함을 등급별로 분류:
  - **P0** — 산정 차단 / 컴플라이언스 위반 (예: precursor 입력이 합계에 반영 안 됨, Annex II direct-only 인증서 기준 처리 오류, EU Communication Template export 누락)
  - **P1** — 실수 유발 / 추적성 약화 (예: 단위 미표시 tCO2e/t goods 누락, 기본값 출처 미표기)
  - **P2** — 개선 권고 (있으면 좋음)
  - 회귀 모드에서 발견된 신규 결함은 `P1-runNN-XX` / `P2-runNN-XX` 식별자 부여.
- **client-questions.md** — 산정을 마무리하려면 클라이언트에게 더 받아야 할 데이터·확인 사항(긴급/일반 우선순위).

> **시각·UX/UI 결함**은 본 페르소나가 아니라 자매 페르소나 **디자이너 씨밤이**(`cbamy/designer-persona.md`)가 D0/D1/D2 등급으로 별도 감사합니다. 디자인 감사 run은 폴더명에 `_design-audit-runNN`처럼 표시할 수 있습니다.

---

## 실행 모드 2종

- **탐색 모드 (Explore)** — 새 시나리오로 처음 실행. 결함 위치를 모를 때. 신규 결함 발견이 목적.
- **회귀 모드 (Regression)** — 이전 run에서 발견된 결함이 수정된 후. 수정이 잘 됐는지 확인 + 회귀/신규 결함 부수 발견이 목적.

이전 `runs/` 폴더가 있으면 회귀 모드를 기본값으로 봅니다. 모드별 첫 메시지는 전용 스킬의 `templates/first-message-explore.md` / `templates/first-message-regression.md`를 사용합니다.

---

## 크로스레퍼런스 (캐논 경로)

씨밤이 홈: `D:/OneDrive/Business/ai automation/CBAM_Platform/cbamy/`

| 자료 | 경로 |
|------|------|
| 페르소나 (계산·컴플라이언스) | `cbamy/persona.md` |
| 디자이너 페르소나 (UI 감사) | `cbamy/designer-persona.md` |
| 키트 개요 | `cbamy/README.md` |
| CBAM 공식 기본값·벤치마크 데이터셋 | `cbamy/data/cbam-defaults.json` |
| 규정 참조 인덱스 | `cbamy/knowledge/cbam-reference-index.md` |
| 검증 지식베이스(KB) | `cbamy/knowledge/cbam-verification-reference.md` |
| 시나리오 (철강 HRC) | `cbamy/scenarios/steel-hrc.md` |
| 산출물 보관소 (이 폴더) | `cbamy/runs/<YYYY-MM-DD>_runNN/` |

전용 스킬: `C:/Users/NT940XHA/.claude/skills/cbamy-regression-run/`

| 자료 | 경로 |
|------|------|
| 스킬 본문 | `SKILL.md` |
| 채점 루브릭 | `scoring-rubric.md` |
| 첫 메시지 (탐색) | `templates/first-message-explore.md` |
| 첫 메시지 (회귀) | `templates/first-message-regression.md` |
| 산출물 형식 | `templates/output-formats/see-result.md.template`, `usage-log.md.template`, `improvement-suggestions.md.template`, `client-questions.md.template` |

⚠️ **씨밤이에게 절대 노출 금지** (이 폴더에 함께 두지 말 것):
- 운영자 전용 함정 평가표 `cbamy/scenarios/steel-hrc-app-checks.md` — 결함 정답이 누출됨
- 탐색 모드 시 이전 run의 `improvement-suggestions.md` — 마찬가지로 정답 누출

---

## 주의 (CBAM 특유)

- **전환기간(transitional period)과 2026 확정기간(definitive period)을 섞지 마세요.** 본 키트의 산정 기준은 **2026 확정기간**입니다. 기본값·벤치마크·신고 양식 모두 확정기간 기준으로 다룹니다. 전환기 수치·한도(예: complex good default 20% 한도)는 확정기간 로직에 적용하지 않습니다.
- **SEE(비내재배출량, tCO2e/t goods)와 총배출(total/absolute emissions, tCO2e)을 혼동하지 마세요.** 인증서 수량은 `수입량(t) × SEE_cbam_basis`로 산출됩니다. 또한 **인증서 산정 기준 SEE(`see_cbam_basis`)**와 **참고용 총 SEE(`see_informational_total`)**는 별개 개념이며, Annex II direct-only 처리(자체 간접배출 제외)가 둘을 가릅니다.
- CBAM 공식 기본값(Default Values)·벤치마크(Benchmarks) **숫자는 임의로 지어내지 않습니다.** 항상 데이터셋 `cbamy/data/cbam-defaults.json`을 근거로 인용합니다. 연도별 markup 포함값(2026/2027/2028+)과 raw direct/indirect/total 값은 분리해 다룹니다.
- 규정 인용이 불확실하면 단정하지 말고 **"확인 필요"** 로 표기합니다. (근거: (EU)2023/956, 이행규정 2025/2547·2620·2621·2548, EU CBAM Guidance, Q&A)

---

## 예시 폴더 구조

```
cbamy/runs/
├── README.md                      ← 이 파일
├── 2026-06-13_run01/
│   ├── see-result.md
│   ├── usage-log.md
│   ├── improvement-suggestions.md
│   └── client-questions.md
└── 2026-06-13_run02/
    ├── see-result.md
    ├── usage-log.md
    ├── improvement-suggestions.md
    └── final-handoff-notes.md     ← 인계 직전 run (회귀 모드)
```

---