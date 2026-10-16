# 사용 일지 — KPF형 + 외주 공정(13_외주공정) 시험

- run: 2026-10-17_run40-kpf-outsourced · 앱 main `aa4f220` (외주 공정 입력 1~4단계 PR #155~#158 반영)
- 바탕: run39 2차 채움값(`fill-kpf2.json`, KPF형 충주공장, 가상)에 **외주 공정 시트**를 더했다(`fill-kpf3.json`, 413칸). 모든 수치는 가상이다.
- 목적: 외주 열처리·코팅 기능이 실제 업체 규모의 서식에서 끝까지 이어지는지(서식 → 가져오기 → 화면 → 제출 문서 → EU 엑셀 재계산)와, 일부러 섞은 틀린 줄을 앱이 걸러내는지.
- 방법: 진짜 Excel로 입력(`excel-type.ps1`), 앱 코드로 읽기(`workbook-tools.mjs read`), 화면은 따로 띄운 Chrome(`cdp.mjs`), EU 엑셀은 Excel로 전체 재계산.

## 외주 줄(5줄)과 결과

| 줄 | 내용 | 결과 |
|---|---|---|
| B사 | 다크로형 코팅, 재구성(고지서 총량 120,000 Nm³) | **36,000 Nm³** 넣음(사례 A와 같은 값), 분류 근거 있음 → 확인 필요 없음 |
| C사 | 열처리, 처리 중량 비율(220,000 × 800 ÷ 2,000 t) | **88,000 Nm³** 넣음 |
| D사 | 전기도금 | **넣지 못함** — 「전기도금(plating)은 철강 제품의 시스템 경계 밖」(부속서 I 3.16.2) |
| E사 | 보수적 추정인데 근거 없음 | **넣지 못함** — 「보수적 추정은 근거를 적어야 합니다」 |
| F사 | 없는 공정 이름 | **넣지 못함** — 공정 목록을 보여 주며 이름을 똑같이 적으라고 안내 |

- 넣은 것: 연료 7건(자체 5 + 외주 2), 직접배출 9,187.0 → **9,444.4 tCO₂e**(+257.4 = 124,000 Nm³ × 0.037 GJ × 56.1 kg/GJ).
- 화면: 귀속 점검 표에 V10 「규정 충족」. 할 일에는 외주 항목이 없다(근거가 모두 갖춰짐).
- 산정보고서: 6.6 「외주 공정 몫」 소절이 나오고 Q&A 4.31 근거, 두 외주처, 방법과 조항, 우리 몫이 들어 있다. 모니터링 계획 9번에 외주 처리 문단이 나온다.
- EU 엑셀(Excel 전체 재계산): 오류 셀 0. 합침 모드 공정의 직접 SEE 4.5002, 총 5.1268.

## 새로 나온 것 → improvement-suggestions.md 참조

## 재현
```
node cbamy/runs/2026-10-17_run40-kpf-outsourced/workbook-tools.mjs make <fill.json> <outDir>
powershell -File cbamy/runs/2026-10-17_run40-kpf-outsourced/excel-type.ps1 <outDir>/blank.xlsx <outDir>/cells.json <outDir>/filled.xlsx
node cbamy/runs/2026-10-17_run40-kpf-outsourced/workbook-tools.mjs read <outDir>/filled.xlsx
```
