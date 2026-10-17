# 외주처 전력(간접배출) 입력 설계 (2026-10-17)

외주 공정 입력(설계 `outsourced-process-input-design.md`, 1~4단계 구현 완료)은 외주처의 **연료**만 받는다. 열처리·코팅 외주처는 전기도 쓴다(코팅 건조로·송풍기·컨베이어, 전기로 열처리 등). 이 문서는 외주처 전력의 우리 몫을 받는 5단계의 설계다. 규정 근거는 연료와 같다 — EC CBAM Q&A 2026-05-27 4.31(경계 안 공정은 외주여도 우리 사업장에서 한 것으로 센다)이 직접배출과 간접배출을 가리지 않는다.

## 1. 왜 연료처럼 `SourceStream`으로 못 넣나

연료는 공정 직접배출을 만드는 배출원 행이라 새 행을 더하면 엔진·EU 엑셀·보고서가 그대로 읽는다. 전력은 다르다.

- 공정 레코드의 `electricity_mwh` **한 칸**에 들어 있고, 배출은 `electricity_mwh × electricity_ef_tco2e_per_mwh`로 계산된다(엔진 748행). EU 엑셀 D_Processes·산정 보고서 7장·모니터링 계획·전달 패키지·SEE 추적이 모두 이 칸을 읽는다.
- 공용 전력 계량기를 나누면 그 결과를 `electricity_mwh`에 **덮어쓴다**(`buildElectricitySplitUpdates`). 외주 몫을 거기 얹어 두면 다시 나눌 때 사라진다.
- 공용 계량기 합계 검사(`checkElectricitySharedMeters`)는 공정들의 `electricity_mwh` 합이 사업장 전체 값과 같은지 본다. 외주 몫이 섞이면 「합계가 다르다」고 거짓 경고를 낸다.

## 2. 결정: 합계는 `electricity_mwh`에 그대로 두고, 외주 몫을 별도 기록으로 알아본다

`ProductionProcess`에 선택 필드 하나를 더한다.

```ts
export interface OutsourcedElectricityShare {
  subcontractor: string;
  technique: OutsourcedTechnique;     // 외주 연료와 같은 종류(전기도금 거부 규칙도 같다)
  basis: OutsourcedBasis;             // 같은 네 방법. 활동량 단위만 MWh
  mwh: number;                        // 우리 몫 — electricity_mwh에 이미 들어 있다
  company_total?: number;             // 외주처 전체 전력 (MWh) — 재구성 방법
  line_quantity?: number;             // 그 공정 설비의 전력 (MWh)
  our_throughput_t?: number;
  line_throughput_t?: number;
  equipment?: OutsourcedEquipment[];  // hours × rate_per_h (kW → MWh 환산은 입력 단위가 kW면 rate를 MWh/h로)
  estimate_quantity?: number;
  note: string;
  evidence?: string;
}
// ProductionProcess: outsourced_electricity?: OutsourcedElectricityShare[];
```

규칙(불변식):
1. `process.electricity_mwh` = 자체 몫 + Σ `outsourced_electricity[].mwh`. 모든 읽는 쪽(엔진·EU 엑셀·보고서·추적)은 **바뀌지 않는다**.
2. 자체 몫 = `electricity_mwh − Σ outsourced mwh`. 이것이 필요한 곳 세 군데만 고친다: ① 공용 전력 계량기 합계 검사, ② 전력 나누기(`buildElectricitySplitUpdates`: `electricity_mwh = share.mwh + 외주 합`), ③ 공정 전력을 직접 고치는 입력(지도 5단계 패널·대화 모드의 `guided-edit`)은 화면에 자체 몫을 보여 주고 저장할 때 외주 합을 더한다.
3. **옛 앱·옛 백업 호환**: 합계가 이미 `electricity_mwh`에 있으므로 이 필드를 모르는 옛 앱도 같은 숫자를 낸다 — 백업 `format_version`을 올리지 않는다(전력 공용 계량기 `electricity_shared_meter`와 같은 방식). 옛 앱이 외주 몫이 있는 파일을 열어 전력 나누기를 다시 하면 외주 몫이 지워질 수 있다 — 이 필드를 아는 앱이 계량기 합계 검사에서 잡는다(§4 OUTE02).
4. **배출계수는 하나다.** 외주 몫은 그 공정의 `electricity_ef_tco2e_per_mwh`로 계산한다. 외주처가 한국 안에 있으면(대부분) 같은 국가 계통 계수(2025/2621 부속서 II)이므로 맞다. 외주처가 해외이면 이 입력은 받지 않고 「계수가 다른 외주처 전력은 아직 받지 않습니다 — 검증인과 정하세요」로 안내한다. 입력 화면에 「외주처가 같은 나라에 있나요?」 한 칸.

## 3. 계산 (`outsourced-process.ts` 재사용)

연료의 네 방법을 그대로 쓴다. 단위만 MWh다(설비 소비율은 MWh/h 또는 kW × 부하율). `computeOutsourcedShare`는 단위를 모르는 순수 함수라 **그대로 재사용**하고, 화면·서식이 단위(MWh)와 환산(kW → MWh)을 안내한다. 설비 정격 kW를 받는 경우 「이름:가동시간:소비율」의 소비율을 kW로 적고 앱이 ÷1000해 MWh/h로 환산하는 칸 옵션을 둘지는 열린 질문이다(§6).

사례(가상): 외주처 총 전력 400 MWh, 설비 재구성 — 우리 코팅라인 600 h × 20 kW = 12 MWh, 타사 라인 900 h × 20 kW = 18 MWh, 기타 1,000 h × 10 kW = 10 MWh → 합 40 MWh, 보정계수 10, 우리 몫 12 × 10 = **120 MWh**. 처리 중량 비율: 설비 전력 90 MWh × 300 ÷ 1,000 t = **27 MWh**.

## 4. 점검 (V10 확장)

| 코드 | 내용 | 수준 |
|---|---|---|
| OUTE01 | 추정이거나 근거(note)가 비었다 | 확인 필요 |
| OUTE02 | 공정의 `electricity_mwh`가 외주 몫 합보다 작다(전력을 다시 나누며 외주 몫이 지워졌거나 직접 고쳤다) | 수정 필요 |
| OUTE03 | 같은 나라 계통 전력이라는 확인(`same_grid`)이 없다 (구현 시 이 항목으로 바꿨다 — 계수가 하나라서 가장 중요한 전제) | 수정 필요 |
| OUTE04 | 우리 몫이 외주처 전체 전력(`company_total`)보다 크다 | 수정 필요 |

## 5. 화면·서식·문서

- **입력**: 지도 4단계의 외주 공정 영역에 「이 외주처가 전기도 쓰나요?」(연료 입력과 같은 방법 선택, 단위 MWh). 외주 연료와 한 건(같은 외주처)으로 묶어 보여 준다.
- **서식**: 13_외주공정 시트에 「전기 몫」 칸 몇 개를 더하는 대신 **같은 시트에 에너지 종류 칸**(연료/전력)을 두고, 전력이면 연료 종류 칸은 비운다. 열 수가 늘지 않는다.
- **산정 보고서 6.6**: 표에 「에너지」 열(연료/전력)을 더하고, 현재의 「외주처 전력은 포함되지 않습니다」 안내 문장은 전력 몫이 입력된 외주처에서는 빼고 입력이 없는 곳에서만 남긴다. 7장(전력 근거)은 변하지 않는다(합계가 이미 들어 있다). 모니터링 계획 9번도 같다.
- **할 일**: 연료 몫과 같은 「외주처 자료 받기」 항목에 전력 요청(전력 고지서, 설비별 정격 kW, 가동시간)을 더한다.

## 6. 단계와 열린 질문

| 단계 | 내용 |
|---|---|
| 1 (**구현됨 2026-10-17**) | `outsourced_electricity` 필드, 자체 몫 계산 함수(`ownElectricityMwh`), 전력 나누기·계량기 합계 검사·`guided-edit` 세 곳 보정, 점검 OUTE01~04, 시험(전력 나누기를 다시 해도 외주 몫이 유지됨 · 합계 검사가 거짓 경고를 내지 않음 · 엔진 결과가 `electricity_mwh` 합과 같음) |
| 2 (**구현됨 2026-10-17**) | 지도 4단계 · 대화 모드 입력 |
| 3 (**구현됨 2026-10-17**) | 서식 에너지 종류 칸과 가져오기 |
| 4 (**구현됨 2026-10-17**) | 보고서 6.6·모니터링 계획·할 일 갱신, 「포함되지 않습니다」 안내를 조건부로 |

열린 질문(사용자·검증인 판단):
1. 외주처 전력은 철강제품에서 **인증서 기준 SEE에 들지 않고 보고(간접 SEE)에만** 들어간다. 그래도 입력을 받는 것이 맞는가? (받는다 — 같은 EU 엑셀 칸에 실려 검증인이 외주처 전력 누락을 지적할 수 있다. 우선순위는 낮다.)
2. kW(정격)로 받을 때 앱이 MWh/h로 환산하는 옵션을 둘지, 입력자가 환산해 적게 할지.
3. 해외 외주처 전력(계수가 다른 경우)은 이번에 받지 않는다 — 필요해지면 공정 전력 계수를 가중평균으로 바꾸는 별도 설계가 필요하다(다출처 계수 `electricity_sources` 규칙 재사용 가능).

## 7. 1단계 구현 메모 (2026-10-17)

- 필드: `ProductionProcess.outsourced_electricity?: OutsourcedElectricityShare[]` (`OutsourcedProcessInfo` + `mwh` + `same_grid`). 백업 `format_version` 불변.
- 자체 몫 함수: `src/lib/electricity-own-share.ts` (의존성 없음) — `outsourcedElectricityMwh`, `ownElectricityMwh`, `electricityTotalFromOwn`.
- 보정한 곳: `checkElectricitySharedMeters`(allocation-rules) · `buildElectricitySplitUpdates` · `buildElectricityUpdate`(지도 5단계·대화 모드·가져오기 공통) · 전력 나누기 미리 채움 · 공정 상세 화면(`processes/page.tsx`) · 지도 5단계 저장값 표시(자체 + 외주 풀이).
- 검사/점검: `validateOutsourcedElectricityShare`, `checkOutsourcedElectricity`(OUTE01~04), 귀속 점검 V10 한 줄에 합산(외주 연료·외주 전력 어느 쪽이든 있으면 표시).
- 아직 없는 것: 입력 화면(2단계), 엑셀 서식·가져오기(3단계), 보고서 6.6·모니터링 계획·할 일(4단계). 그때까지 `OUTSOURCED_ELECTRICITY_NOTICE` 안내가 그대로 남는다.
- 시험: `scripts/verify-outsourced-electricity.mjs`.

## 8. 2단계 구현 메모 (2026-10-17)

- 화면: `src/components/guided/OutsourcedElectricity.tsx` — 지도 4단계의 외주 임가공 연료 입력 바로 아래와 대화 모드 에너지 도구에 같은 컴포넌트. 같은 네 방법·같은 분류 근거·전기도금 거부, 활동량 단위만 MWh. 같은 나라 계통 확인 칸(체크 안 하면 저장 거부).
- 열린 질문 2(kW 환산) 결정: **설비 정격은 kW로 받고 앱이 ÷1,000으로 MWh/h로 저장한다**(고지서는 MWh, 설비 명판은 kW). 고치기 화면은 다시 kW로 보여 준다.
- 저장 규칙은 순수 함수: `buildOutsourcedElectricityUpdates`(고치기는 옛 몫을 걷어내고 새로 — 합계가 불어나지 않는다) · `buildOutsourcedElectricityRemoval` · `groupOutsourcedElectricity`(공정마다 흩어진 몫을 한 건으로 묶기). 배출원 행은 만들지 않는다 — 공정 레코드만 바꾼다.
- 점검 OUTE05 추가: 공정의 전력 배출계수가 비어 있으면(0 배출로 계산됨) 수정 필요. 입력 화면도 같은 경고를 미리 보여 준다.
- `computeOutsourcedShare(info, 'electricity')` — 계산은 같고 안내 문구만 「전력량·전기 사용처」.
- 연료 입력 화면의 「전기는 이 입력에 포함되지 않습니다」 안내는 「아래 외주사 전기 입력에서 따로 입력」으로 바꿨다. 보고서 6.6·모니터링 계획 9번·서식 시트의 기존 안내(상수 `OUTSOURCED_ELECTRICITY_NOTICE`)는 3·4단계에서 조건부로 바꾼다.
- 화면 확인: 진합형 시험 프로젝트에 외주 전기 120 MWh(재구성)를 두 공정에 저장 → 5단계 「자체 56 + 외주처 0.4 MWh」, 공용 계량기 「공정별 합계 21,500 MWh — 고지서 값과 같습니다」 유지, 지우기 후 몫 사라짐.

## 9. 3·4단계 구현 메모 (2026-10-17)

- **서식(13_외주공정)**: 새 칸 「외주처가 쓴 에너지」(연료/전기, 비우면 연료 = 예전 서식과 같다)를 공정 종류 뒤에, 「외주처도 국내(같은 나라) 전력망 전기를 쓰나요? (전기일 때)」를 맨 끝에 추가. 「외주처가 쓰는 연료」는 연료일 때만 필수. 한 외주처가 연료와 전기를 둘 다 썼으면 줄을 둘로 나눈다. 칸 이름은 바꾸지 않았다(머리글로 읽으므로 예전에 채운 서식이 그대로 읽힌다). 설비 소비율 자리에 전기는 정격 전력 kW를 적고 가져올 때 ÷1,000으로 MWh/h로 바꾼다.
- **가져오기**: 전기 줄은 연료 행을 만들지 않고 공정 레코드를 바꾼다(지도 입력과 같은 `buildOutsourcedElectricityUpdates`). 같은 나라 확인이 「예」가 아니면 이유와 함께 넣지 않는다. 외주 전기만 있는 공정의 전력 배출계수가 비어 있으면 같은 공장의 다른 공정 계수를 이어 주고, 그래도 없으면 경고(점검 OUTE05). 같은 줄을 두 번 올려도 한 번만.
- **산정 보고서 6.6**: 표에 「에너지」 열(연료/전기). 전기 몫만 있어도 6.6이 나온다. 문단은 연료·전기 중 있는 것만 말하고, 전기는 「전력 사용량(제7장)에 합산 · 같은 나라 계통 · 공정의 계수 하나」를 밝힌다. 인증서 기준 간접배출 포함 여부는 단정하지 않고 7장 판정으로 넘긴다. 외주 전기 점검(OUTE01~05)이 게이트 경고(G5)에 실린다.
- **「포함되지 않습니다」 안내**: 상수 `OUTSOURCED_ELECTRICITY_NOTICE`를 없애고 `outsourcedElectricityMissingNotice(이름들)`로 바꿨다 — **연료만 입력하고 전기는 입력하지 않은 외주처**에게만 「전기가 입력되지 않았습니다. 썼다면 여기에 입력하고, 쓰지 않았거나 무시할 만하면 그 이유를 남기세요」를 보인다(보고서 6.6·모니터링 계획 9번).
- **모니터링 계획 9번**: 외주처별로 연료·전기 줄을 따로, 통제 문장은 전력 자료도 포함.
- **할 일**: 외주 전기 몫의 근거 부족 → 외주처에게 받을 것(전력 고지서·설비 정격 kW·가동시간 …), 숫자 어긋남 → 우리가 고칠 것, 연료만 입력한 외주처 → 「전기도 썼는지 확인」(한 건, 알림).
- 시험: `verify-activity-workbook`(전기 줄 가져오기·잘못된 줄·왕복)·`verify-calculation-report`·`verify-monitoring-plan`·`verify-todo`·`verify-outsourced-process`.
