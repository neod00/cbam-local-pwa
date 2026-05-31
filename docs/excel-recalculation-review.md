# Excel Recalculation Review

이 문서는 EU 제출용 Excel 복사본을 생성한 뒤 Microsoft Excel에서 공식 수식 재계산 결과를 확인하는 절차다. 앱은 공식 템플릿의 입력 셀에 값을 넣고 수식 셀은 보존하지만, 최종 제출 전에는 Excel에서 열린 결과를 사람이 확인해야 한다.

## 언제 수행하나

- 공식 EU 템플릿을 업로드하고 Export 복사본을 생성한 직후
- 회사 내부 승인 또는 외부 검증기관 전달 전
- EU 템플릿 버전이 바뀐 뒤 첫 Export를 수행할 때

## 준비물

- 앱에서 생성한 EU 제출용 Excel 복사본
- 앱 Export 화면의 `Summary_Products 반영 검토` 표
- `artifacts/local-eu-template-verification.json` 파일이 있다면 그 안의 `localSummaryProductReview` 값
- Microsoft Excel 데스크톱 앱

## 검토 순서

1. 생성된 Excel 복사본을 Microsoft Excel에서 연다.
2. 보안 경고 또는 외부 연결 경고가 표시되면 회사 보안정책에 따라 처리한다.
3. 통합문서 계산이 자동이 아니면 `수식 > 계산 옵션 > 자동` 또는 `지금 계산`을 실행한다.
4. 공식 시트명이 유지되는지 확인한다.
   - `A_InstData`
   - `B_EmInst`
   - `C_Emissions&Energy`
   - `D_Processes`
   - `E_PurchPrec`
   - `Summary_Products`
5. `Summary_Products`에서 앱이 쓴 제품 식별값을 확인한다.
   - `D10`: 생산공정명
   - `F10`: CN 코드
   - `H10`: 제품명
6. `Summary_Products`의 공식 SEE 수식 셀이 값으로 덮어써지지 않았는지 확인한다.
   - `I10`: direct SEE 공식 수식 결과
   - `J10`: indirect SEE 공식 수식 결과
   - `K10`: total SEE 공식 수식 결과
7. 앱 Export 화면의 SEE 검토값과 Excel의 `I10:K10` 결과를 비교한다.
8. 차이가 있으면 제출 전 검토 메모에 원인을 기록한다.
   - 공식 템플릿 수식 기준과 앱의 로컬 검토 계산 기준 차이
   - 전구물질 간접 SEE가 공식 템플릿에서 별도 전력 입력값을 요구하는 경우
   - 생산공정 배분 또는 CN 코드 선택 차이
   - EU 템플릿 버전 변경
9. 검토가 끝나면 `.cbam` 백업을 별도로 생성해 같은 검토 시점의 로컬 입력값을 보존한다.

## 가상 데이터 기준 기대값

`docs/mvp-fictional-dataset.md`의 기본 단일 제품 리허설에서는 앱의 로컬 SEE 검토값이 다음 수준으로 표시된다.

| 항목 | 앱 검토값 |
| --- | ---: |
| Direct SEE | 0.12 tCO2e/t |
| Indirect SEE | 0 tCO2e/t |
| Precursor SEE | 1.45 tCO2e/t |
| Total local SEE review | 1.57 tCO2e/t |

이 값은 앱의 로컬 검토 기준이다. 공식 Excel의 `Summary_Products!I10:K10` 결과와 다르면 앱이 틀렸다고 즉시 결론내리지 말고, 공식 템플릿 수식이 참조하는 입력 셀과 앱이 현재 쓰는 MVP Export 범위를 함께 검토한다.

## 기록 양식

| 검토 항목 | 결과 | 메모 |
| --- | --- | --- |
| 최신 EU 원본 템플릿을 사용했다 | 미확인 / 통과 / 보류 |  |
| 공식 시트명이 유지된다 | 미확인 / 통과 / 보류 |  |
| `Summary_Products!D10/F10/H10` 값이 앱 검토표와 일치한다 | 미확인 / 통과 / 보류 |  |
| `Summary_Products!I10/J10/K10` 수식이 유지된다 | 미확인 / 통과 / 보류 |  |
| Excel 재계산 후 `I10:K10` 값을 확인했다 | 미확인 / 통과 / 보류 |  |
| 앱 SEE 검토값과 Excel SEE 결과 차이를 검토했다 | 미확인 / 통과 / 보류 |  |
| Export 경고와 보류 항목을 검토했다 | 미확인 / 통과 / 보류 |  |
| 같은 시점의 `.cbam` 백업을 생성했다 | 미확인 / 통과 / 보류 |  |

## MVP 한계

- 이 절차는 공식 제출 검증을 대체하지 않는다.
- 앱은 현재 확인된 입력 셀만 쓴다.
- 공식 SEE 수식 셀은 앱이 직접 덮어쓰지 않는다.
- EU 템플릿 버전이 바뀌면 첫 Export는 반드시 이 절차로 재확인한다.
