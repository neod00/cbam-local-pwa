# Admin Console Plan

관리자 콘솔은 무료 PWA의 배포, 라이선스, 공지, 업데이트 정책을 관리하기 위한 별도 시스템이다. 사용자 PWA와 같은 계산 데이터 저장소가 아니다.

## Recommended Structure

- `cbam-local`: 사용자용 로컬 우선 PWA
- `cbam-admin`: 관리자 콘솔
- `license-api`: 라이선스, 공지, 업데이트 정책 API

## Admin MVP Scope

- 사용자 목록
- 무료 라이선스 발급
- 라이선스 상태 변경
- 공지 등록
- 최신 버전 등록
- 최소 지원 버전 등록
- 선택/권장/강제 업데이트 정책 등록
- 약관 버전 관리

## Post-MVP Scope

- 이메일 발송
- 다운로드/접속 통계
- 유료 라이선스
- Docker/on-prem 고객 관리
- 조직별 계약 상태
- 지원 티켓
- 관리자 감사 로그

## Data Boundary

관리자 콘솔은 다음을 저장하지 않는다.

- 생산량
- 배출량
- 전구물질
- 공급업체 자료
- EU 템플릿 파일
- `.cbam` 백업 파일
- 산정 결과 원자료

## Initial Technical Option

- Next.js admin app
- Postgres 계열 DB
- Vercel 또는 별도 서버 배포
- Magic link 또는 Google OAuth 관리자 인증
- 이메일 발송은 추후 Resend/Postmark 등으로 분리

사용자 PWA의 CBAM 업무 데이터 저장소로 Supabase나 외부 DB를 쓰지 않는다. 관리자/라이선스 DB로만 쓰는 것은 허용한다.

