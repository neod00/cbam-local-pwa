# User-Guided Workflow

CBAM Local의 다음 UI 개편은 “계산 화면”이 아니라 “CBAM 신고 지원자료 작업실”을 목표로 한다.

## Target Users

- CBAM 대상 중소·중견기업 담당자
- 환경/생산/구매/무역 부서 실무자
- CBAM 컨설턴트

기본 UX는 기업 담당자 기준이다. 컨설턴트도 같은 앱을 쓰되, 상세 수치와 검토 테이블을 통해 전문가 업무를 수행한다.

## Core Promise

사용자가 앱을 열면 다음을 즉시 알아야 한다.

- 지금 어느 단계인지
- 수입자 전달용 Communication Template 복사본 생성까지 무엇이 남았는지
- 어떤 자료가 부족한지
- 어떤 오류를 먼저 고쳐야 하는지
- 다음에 누를 버튼이 무엇인지

## Guided Workflow

P3 implementation note: the app now exposes this flow as an in-app `/guide` page and a compact dashboard `WorkflowGuideCard`. The topbar help icon also opens `/guide`, so first-time users do not need to infer the workflow only from the sidebar.

| Step | Name | Completion condition | Required data | Main CTA |
| --- | --- | --- | --- | --- |
| 1 | 사업장 등록 | 사업장명과 국가 코드가 입력됨 | 사업장명, 국가, 주소, 담당자 | 사업장 추가 |
| 2 | 보고기간 설정 | 기간명, 시작일, 종료일이 입력됨 | 기간명, 시작일, 종료일 | 기간 추가 |
| 3 | 품목 등록 | CBAM 대상 제품과 CN 8자리 코드가 입력됨 | 제품명, CN 8자리, 품목군 | 품목 추가 |
| 4 | 생산공정과 제품 배분 | 제품과 연결된 생산공정, 생산량, 제품 생산라인이 입력됨 | 공정명, 생산경로, 총 생산량, 제품 생산라인 | 생산공정 입력 |
| 5 | 배출원 자료 연결 | 직접배출량 근거 자료가 공정에 연결됨 | 연료/공정 원료, 활동자료, 배출계수, 증빙 출처 | 배출원 자료 추가 |
| 6 | 전구물질 확인 | 전구물질 소비량, SEE 출처, 검증 상태가 입력됨 | 구매량, 소비량, 공급사 SEE, 기본값 사유 | 전구물질 확인 |
| 7 | 공식 기준자료 가져오기 | 벤치마크와 국가/CN 기본값이 로컬에 저장됨 | CBAMBenchmarks, DVsasadopted | 기준자료 업로드 |
| 8 | 산정 결과 검토 | 제품별 SEE와 경고가 검토됨 | 산정 결과, 배분 기준, 경고 | 산정 결과 검토 |
| 9 | 인증서 비용 시나리오 | SEFA/인증서 지표가 검토됨 | 기준값, 벤치마크, 인증서 가격 가정 | 시나리오 검토 |
| 10 | EU Communication Export | 최신 EU 원본 템플릿 검증과 Export 체크리스트 통과 | 공식 템플릿, 준비 상태, 백업 | 수입자 전달용 복사본 생성 |
| 11 | Excel 공식 수식 재계산 | Summary_Products 공식 수식 결과가 수동 검토됨 | Export 복사본, Microsoft Excel | Excel 검토 |
| 12 | `.cbam` 백업 보관 | `.cbam` 백업 파일이 내려받아짐 | 로컬 데이터, 시나리오 가정값 | 백업 다운로드 |

## Dashboard Direction

대시보드는 KPI 나열보다 다음 구조를 우선한다.

- 현재 신고 지원자료 준비 상태
- 다음 작업 계속하기
- WorkflowStepper
- 가장 중요한 FixCard
- 제출 전 위험 요약
- 백업 상태
- 로컬 데이터 안내

## Warning To Action Rules

경고 문구는 사용자가 바로 행동할 수 있어야 한다.

Bad:

- 전구물질 SEE 출처가 비어 있습니다.

Good:

- 공급사 SEE 자료의 출처를 입력해야 합니다. 공급사 Communication Template, 이메일 회신, 내부 검증자료 중 하나를 입력하세요.

## Beginner And Consultant Balance

- 기본 화면은 “다음 작업”과 “필요 자료” 중심이다.
- 상세 테이블과 계산 수치는 접거나 하단에 둔다.
- 컨설턴트가 필요한 검토 근거는 Export, Results, Scenarios에서 제공한다.

## Export UX

Export는 다운로드 버튼이 먼저 보이면 안 된다. 제출 전 점검 게이트로 보여야 한다.

- 오류 0건인지
- 경고가 무엇인지
- EU 원본 템플릿이 최신인지
- 공식 수식이 보존되는지
- Excel에서 수식 재계산 결과를 대조해야 하는지
- `.cbam` 백업이 있는지
