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

## Minimal Data Model

관리자 DB는 배포 관리 데이터만 저장한다.

### `license_users`

- `id`
- `email`
- `company_name`
- `contact_name`
- `country`
- `industry`
- `license_status`: `UNREGISTERED`, `FREE_ACTIVE`, `OFFLINE_ALLOWED`, `RECHECK_REQUIRED`, `BLOCKED`
- `accepted_terms_version`
- `last_license_check_at`
- `created_at`
- `updated_at`

### `update_manifests`

- `id`
- `latest_version`
- `minimum_supported_version`
- `update_policy`: `none`, `optional`, `recommended`, `required`
- `notice_title`
- `notice_body`
- `release_notes_url`
- `effective_from`
- `target_audience`
- `created_at`
- `updated_at`

### `announcements`

- `id`
- `title`
- `body`
- `severity`: `info`, `warning`, `critical`
- `target_audience`
- `starts_at`
- `ends_at`
- `created_at`
- `updated_at`

## Minimal API Routes

- `POST /api/license/register`: 이메일, 회사명, 담당자명, 국가, 업종, 약관 버전만 받는다.
- `GET /api/license/status`: 라이선스 상태, 약관 버전, 공지 수신 상태만 반환한다.
- `GET /api/update-manifest`: 최신 버전, 최소 지원 버전, 업데이트 정책, 공지 문구를 반환한다.
- `GET /api/announcements`: 현재 표시할 공지만 반환한다.
- `POST /api/admin/license/:id/status`: 관리자만 라이선스 상태를 변경한다.
- `POST /api/admin/update-manifest`: 관리자만 선택/권장/강제 업데이트 정책을 게시한다.

모든 API는 CBAM 입력자료, 산정 결과, EU 템플릿, `.cbam` 백업 파일을 요청 본문이나 응답에 포함하지 않는다.

## Client API Contracts

사용자 PWA가 서버와 통신할 때의 최소 계약은 아래 범위로 제한한다.

### `POST /api/license/register`

Request:

- `email`
- `company_name`
- `contact_name`
- `country`
- `industry`
- `accepted_terms_version`
- `app_version`

Response:

- `license_status`
- `license_key`
- `accepted_terms_version`
- `next_check_after`
- `message`

### `GET /api/license/status`

Request query:

- `license_key`
- `app_version`

Response:

- `license_status`
- `minimum_supported_version`
- `terms_version`
- `notice_count`
- `next_check_after`

### `GET /api/update-manifest`

Response:

- `latest_version`
- `minimum_supported_version`
- `update_policy`
- `notice_title`
- `notice_body`
- `release_notes_url`
- `effective_from`

Forbidden fields:

- `installation`
- `period`
- `product`
- `process`
- `source_stream`
- `precursor`
- `result`
- `scenario`
- `template_file`
- `backup_file`

## Implementation Phases

### Phase 0: Current MVP

- 사용자 PWA는 로컬 mock 등록과 정적 `public/update-manifest.json`만 사용한다.
- 라이선스가 없어도 계산, 백업, Export 준비 기능을 막지 않는다.
- 서버로 CBAM 업무 데이터를 전송하지 않는 문구를 설정 화면에 표시한다.

### Phase 1: Hosted License API

- `license-api`를 별도 서비스로 만든다.
- 무료 라이선스 등록, 상태 확인, update manifest 조회만 제공한다.
- PWA에는 `NEXT_PUBLIC_LICENSE_API_URL`이 있을 때만 원격 확인을 켠다.
- 원격 확인 실패 또는 오프라인 상태에서는 마지막 확인 결과와 로컬 mock 상태로 계속 동작한다.

### Phase 2: Admin Console MVP

- 관리자 로그인, 사용자 목록, 라이선스 상태 변경, 업데이트 정책 게시, 공지 게시를 만든다.
- 관리자 화면에는 allowed data만 표시한다.
- 관리자 API에는 역할 기반 인증과 기본 rate limit을 둔다.

### Phase 3: Paid/On-Prem 준비

- 유료 라이선스, 조직별 계약, Docker/on-prem 배포 관리는 별도 테이블과 별도 약관으로 분리한다.
- 무료 PWA의 로컬 데이터 경계는 유지한다.

## Update Control Flow

1. PWA는 시작 시 정적 `public/update-manifest.json` 또는 향후 `GET /api/update-manifest`를 확인한다.
2. `update_policy`가 `none` 또는 `optional`이면 사용자가 계속 사용할 수 있다.
3. `recommended`이면 상단 배너와 설정 화면에서 업데이트를 권장한다.
4. `required`이면 계산, Export 같은 주요 기능 진입 전에 업데이트 안내를 먼저 보여준다.
5. 오프라인이면 마지막으로 확인한 manifest와 service worker 캐시 기준으로 계속 동작하되, CBAM 데이터는 서버로 전송하지 않는다.

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
