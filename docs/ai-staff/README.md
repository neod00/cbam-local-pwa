# CBAM Local AI Staff

CBAM Local은 배포 전 단계에서 AI 직원을 자동 실행하지 않는다. 대표가 필요할 때 직원별 프롬프트를 선택해 ChatGPT, Deep Research, Codex 같은 외부 AI 작업 공간에서 수동 실행한다.

나중에 사용자가 늘어나면 같은 직원 정의를 기반으로 관리자 서버에서 API 실행, 반자동 승인 큐, 정기 규정 모니터링으로 확장할 수 있다.

## Operating Model

- 대표가 최종 승인권자다.
- AI Chief of Staff는 업무를 정리하고 직원별 작업을 배정하는 총괄운영실장 역할이다.
- 역할별 AI 직원은 조사, 분류, 초안, 검토, 체크리스트를 만든다.
- 고객 회신, 견적, 규정 최종 해석, 계산 확정, 앱 배포는 대표 승인 후 진행한다.

## Data Boundary

서버와 AI 도구에는 배포·문의·운영 메타데이터만 전달한다.

허용:

- 문의 유형과 문의 내용
- 회사명, 담당자명, 연락처, 이메일
- 앱 버전, 공지, 업데이트 정책
- 공개 규정 링크와 문서명
- 가상 예시와 테스트 결과 요약

금지:

- 생산량
- 배출량
- 전구물질 수량
- CN별 산정값
- EU 템플릿 작성본
- `.cbam` 백업 파일
- 고객 증빙자료

## Staff

1. AI Chief of Staff
2. CBAM Regulation Researcher
3. CBAM Product Impact Analyst
4. Calculation QA Agent
5. Customer Onboarding Agent
6. Sales / Discovery Agent
7. Content / Trust Agent
8. Product / Developer Agent
9. Release QA Agent

## Automation Plan

현재:

- 실행 방식: 수동
- API key: 불필요
- 실행 위치: 관리자 콘솔에서 프롬프트 복사 후 외부 AI에서 직접 실행

나중:

- `OPENAI_API_KEY`는 서버 환경변수로만 저장
- 브라우저 PWA 코드에 API key를 노출하지 않음
- 관리자 승인 큐와 실행 로그를 먼저 만든 뒤 자동화
- 문의 자동 분류, 주간 규정 점검, 일일 운영 요약부터 단계적으로 자동화
