# MVP Fictional Dataset

이 문서는 MVP 브라우저 리허설에 사용할 가상 회사 입력값이다. 실제 기업명, 실제 거래처명, 실제 배출량 자료를 사용하지 않고도 Dashboard부터 EU Export, Excel 재계산 확인, `.cbam` 백업까지 흐름을 검토하기 위한 기준 데이터다.

## 사용 원칙

- 실제 회사, 거래처, 담당자, 설비명, 계약번호를 입력하지 않는다.
- 수치는 계산 흐름과 UI 검토를 위한 임의값이다.
- EU 공식 템플릿, benchmark, default-value workbook은 사용자가 가진 최신 원본 파일을 로컬에서 업로드한다.
- 리허설 후 `.cbam` 백업 파일은 Git에 넣지 않고 로컬 테스트 폴더에만 보관한다.

## 사업장

| 항목 | 입력값 |
| --- | --- |
| 사업장명 | Main Factory A |
| 한글 사업장명 | 인천 제1공장 |
| 국가코드 | KR |
| 경제활동 | Steel processing |
| 주소 | 1 Steel Road |
| 우편번호 | 21990 |
| 도시 | Incheon |
| 담당자 | Local CBAM Manager |
| 이메일 | cbam@example.com |
| 전화 | +82-32-000-0000 |

## 보고기간

| 항목 | 입력값 |
| --- | --- |
| 보고기간명 | 2024 Annual |
| 시작일 | 2024-01-01 |
| 종료일 | 2024-12-31 |
| 상태 | 초안 |

## 제품

| 제품명 | HS | CN 8자리 | 품목군 | 단위 |
| --- | --- | --- | --- | --- |
| Hot Rolled Coil | 7208 | 72083900 | HS72_PLATE_SHEET | tonne |
| Steel Pipe | 7306 | 73063000 | HS73_PIPE_TUBE | tonne |

## 생산공정과 배분

| 항목 | 입력값 |
| --- | --- |
| 공정명 | Rolling and finishing |
| 생산경로 | Flat steel processing |
| 총 생산량 | 1,000 t |
| 시장 출하량 | 950 t |
| 내부소비량 | 50 t |
| 직접 귀속 배출량 | 120 tCO2e |
| 전력 사용량 | 500 MWh |
| 전력 배출계수 | 0.47 tCO2e/MWh |

제품 라인 배분은 MVP 기본 리허설에서는 `Hot Rolled Coil output` 1개 라인에 1,000 t, 질량 기준 100%로 입력한다. 다제품 배분 UI를 확인할 때는 `Steel Pipe output` 300 t를 추가하고 Hot Rolled Coil 700 t, Steel Pipe 300 t로 조정한 뒤 배분 합계 경고가 사라지는지 확인한다.

## 배출원 자료

| 항목 | 입력값 |
| --- | --- |
| 배출원명 | Natural gas combustion |
| 연결 공정 | Rolling and finishing |
| 배출원 유형 | FUEL |
| 산정 방법 | Combustion |
| 활동자료 | 250 t |
| 순발열량 | 45 GJ/t |
| 배출계수 | 73 tCO2e/TJ |
| 산화계수 | 1 |
| 전환계수 | 1 |
| 화석탄소 비율 | 1 |
| 바이오매스 비율 | 0 |
| 증빙 출처 | Monthly fuel invoice |

예상 직접배출량은 대략 `250 * 45 / 1000 * 73 = 821.25 tCO2e` 수준으로 표시된다. 생산공정의 직접 귀속 배출량 120 tCO2e와 의도적으로 차이가 있으므로, Results와 Dashboard에서 불일치 경고가 표시되는지 확인한다. 이후 생산공정 화면에서 배출원 합계를 적용하면 경고가 줄어드는지도 확인한다.

## 구매 전구물질

| 항목 | 입력값 |
| --- | --- |
| 전구물질명 | Purchased hot rolled coil |
| 연결 제품 | Hot Rolled Coil |
| 연결 공정 | Rolling and finishing |
| CN 8자리 | 72083900 |
| Aggregated goods category | Iron or steel products |
| Production route | External precursor |
| 공급국 | South Korea |
| 공급 사업장 | Supplier steel mill |
| 데이터 모드 | 실제값 |
| 검증 상태 | 공급사 확인 |
| 기본값 연도 | 2026 |
| 구매량 | 1,100 t |
| 투입량 | 1,000 t |
| 비CBAM 사용량 | 0 t |
| 직접 SEE | 1.2 tCO2e/t |
| 간접 SEE | 0.25 tCO2e/t |
| 출처 | Supplier communication template |

기본값 시나리오를 확인할 때는 같은 전구물질을 기본값 모드로 바꾸고 기본값 사용 사유를 입력하지 않은 상태에서 저장을 시도한다. 앱이 기본값 사유 누락 경고를 보여야 한다.

## 리허설 판정 기준

- Dashboard에서 다음 작업 카드가 실제 누락 또는 경고 항목으로 연결된다.
- 필수 입력, 선택 입력, 검토용 입력이 화면에서 구분된다.
- Results에서 제품별 SEE와 경고가 표시된다.
- Scenarios에서 실제값/기본값 SEE 및 인증서 비용 지표를 비교할 수 있다.
- Export에서 차단 오류가 없을 때만 제출용 복사본 생성 CTA가 신뢰 가능하게 보인다.
- 생성된 Excel 복사본은 Microsoft Excel에서 열어 공식 수식 재계산 결과를 확인한다.
- Settings에서 `.cbam` 백업을 만들고 다시 가져올 수 있다.
