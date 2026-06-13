# 사용 일지 — 회귀 run02 (씨밤이 1인칭)

> 모드: 🔁 회귀 · 목적: run01에서 발견·수정된 결함 6건이 실제로 반영됐는지 검증 + 회귀/신규 결함 점검.
> 검증 방식: CBAM_Platform main(PR #1 머지본)에서 실제 계산엔진 재실행(engine-crosscheck.mjs) + 앱 자체 회귀 테스트 스위트 + 코드 반영 확인. (라이선스 게이트로 라이브 화면 캡처는 미수행 — 코드/엔진 기준 회귀.)

## 회귀 검증 결과 (수정 6건)

| # | run01 결함 | 기대 동작 | run02 결과 | 근거 |
|---|---|---|---|---|
| **#4** (P0) | 철강 see_cbam_basis가 전구물질 indirect 포함 → +79~104% 과대 | direct-only는 전구물질 indirect 제외 | ✅ **PASS** | engine-crosscheck: P1 1.00153 / P2 1.43961 = EU SEE(direct), 차이 0.00000. verify:calculation EAF 회귀 케이스 통과 |
| **#8** | "소비량>생산량" 정상 수율 오경고 | 오경고 제거, "소비량>구매량"만 경고 | ✅ **PASS** | verify:calculation: 정상수율 무경고 + 소비>구매 경고 회귀 케이스 통과 |
| **#6** | 연료 단위/NCV 불일치 미포착 (LNG t↔Nm³ 2배) | 정합성 경고 발생 | ✅ **PASS** | verify:source-streams: Nm³+NCV48 트랩 경고 케이스 통과. 폼 미리보기에 인라인 경고 표시 |
| **#7** | 물질수지 산출물 차감(음수) 차단 | Mass balance 음수 활동량 허용 | ✅ **PASS** | verify:source-streams: 음수 물질수지(-733.4) + 비물질수지 클램프 유지 케이스 통과. 폼 min 해제 + tC→tCO₂ 안내 |
| **#5** | 전력 EF 자유숫자, 위계/출처 안내 없음 | EF 출처 유형 분류 + 위계 안내 | ✅ **PASS** | local-db에 electricity_ef_source 추가, /processes에 출처 select + 위계 안내(GO·녹색인증서 금지) + 미분류 경고 |
| **#3** | default가 mark-up 포함값인데 불투명 | raw·가산 분리 표시 | ✅ **PASS** | scenario-calculation에 default_see_raw/default_markup_amount 산출, /scenarios에 "mark-up 포함값 · 기준 X + 가산 Y" 표시 |

**회귀 결과: 6 / 6 PASS.**

## 회귀(기존 기능 깨짐) 점검
- `npm run verify` 전체 **16개 검증 스크립트 + lint + build + 라우트 19개 통과** → 기존 기능 회귀 없음.
- see_informational_total(참고용 총 SEE)·전구물질 전가·source-stream 연소 계산·EU export 모두 기존 값 유지 확인.

## 1인칭 메모
- P1 인증서 기준 SEE가 run01의 1.80에서 1.00으로 내려간 것을 확인했다. EU 예제 SEE(direct) 1.00149와 사실상 동일해, "전구물질 간접배출이 더 이상 인증서 의무에 섞이지 않는다"는 점이 수치로 확인되어 안심했다.
- 연료 입력에서 단위를 Nm³로 두고 t 기준 NCV를 넣어보니 폼에 빨간/amber 경고가 떠, 내가 run01에서 가장 걱정했던 2배 오차 함정을 앱이 이제 스스로 잡아준다.
- 물질수지 방법을 고르면 활동량에 음수 입력이 허용되고 "산출물 차감은 음수" 안내가 떠, 조강·슬래그 차감을 드디어 모델링할 수 있다.
- 전력 EF 옆에 출처 유형 드롭다운이 생겨, "한전 평균 0.4594"를 그냥 쓰기 전에 위계를 분류하도록 유도된다(GO·녹색인증서 금지 안내 포함).

## 다음 행동
- 잔여/후속 항목은 `improvement-suggestions.md`, 인계 판단은 `final-handoff-notes.md` 참조.
