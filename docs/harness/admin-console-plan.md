# Admin Console Plan

관리자 콘솔은 무료 PWA 배포, 무료 라이선스, 공지, 업데이트 정책을 관리하기 위한 별도 운영 화면이다. 사용자 PWA의 CBAM 계산 데이터 저장소가 아니다.

## Data Boundary

관리자/라이선스 서버로 보낼 수 있는 정보는 배포 관리 정보로 제한한다.

Allowed:

- `email`
- `company_name`
- `contact_name`
- `contact_phone`
- `country`
- `industry`
- `accepted_terms_version`
- `license_key`
- `license_status`
- `app_version`
- `last_license_check_at`

Forbidden:

- 제품, 공정, 생산량, 배출량, 전구물질, 공급업체 증빙자료
- EU Communication Template 파일
- Export 생성 엑셀 파일
- `.cbam` 백업 파일
- SEE, SEFA, CBAM 인증서 시나리오 입력값 또는 결과

사용자 안내 문구:

`무료 라이선스와 업데이트 확인에는 이메일, 회사명, 담당자명, 연락처, 앱 버전 같은 배포 관리 정보만 사용됩니다. 생산량, 배출량, 전구물질, EU 템플릿, .cbam 백업 파일은 서버로 전송하지 않습니다.`

## Recommended Structure

- `cbam-local`: 사용자용 local-first PWA
- `cbam-admin`: 관리자 콘솔
- `license-api`: 라이선스, 공지, 업데이트 정책 API

MVP에서는 기존 Next.js 앱 안의 `/admin`과 `/api/*`로 시작하되, 계산 데이터 저장소와 import 경계를 분리한다.

## Admin Authentication

- Provider: Google OAuth through Auth.js
- Operator account: `openbrain.main@gmail.com`
- Environment variables:
  - `AUTH_SECRET`
  - `AUTH_GOOGLE_ID`
  - `AUTH_GOOGLE_SECRET`
  - `AUTH_TRUST_HOST=true`
  - `ADMIN_ALLOWED_EMAILS`
- `/admin` and `/api/admin/*` must require an allowed admin email.
- `/admin/login` is the only public admin page.

Google OAuth callback URL:

- Local: `http://localhost:3000/api/auth/callback/google`
- Vercel: `https://cbam-local-pwa.vercel.app/api/auth/callback/google`

## Neon Setup

Neon project console:

- `https://console.neon.tech/app/org-round-lake-37357959/projects`

The app does not need Neon credentials in source code. Add the Neon connection string only as a Vercel environment variable:

- `DATABASE_URL`

Run the SQL migration in `db/admin/001_init.sql` from the Neon SQL Editor before enabling license registration.

## Minimal Data Model

### `license_users`

- `id`
- `email`
- `company_name`
- `contact_name`
- `contact_phone`
- `country`
- `industry`
- `license_key`
- `license_status`: `UNREGISTERED`, `FREE_ACTIVE`, `OFFLINE_ALLOWED`, `RECHECK_REQUIRED`, `BLOCKED`
- `accepted_terms_version`
- `accepted_terms_at`
- `app_version`
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

### `terms_versions`

- `id`
- `version`
- `title`
- `body`
- `effective_from`
- `created_at`
- `updated_at`

## Minimal API Routes

### Public license API

- `POST /api/license/register`
- `GET /api/license/status`
- `GET /api/update-manifest`
- `GET /api/announcements`

### Admin-only API

- `GET /api/admin/license-users`
- `POST /api/admin/license/:id/status`
- `POST /api/admin/update-manifest`
- `POST /api/admin/announcements`
- `POST /api/admin/terms`

모든 admin-only API는 Google OAuth 세션과 `ADMIN_ALLOWED_EMAILS`를 확인한다.

## Client API Contracts

### `POST /api/license/register`

Request:

- `email`
- `company_name`
- `contact_name`
- `contact_phone`
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

Forbidden request/response fields:

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

- 사용자 PWA는 로컬 mock license/update 상태와 정적 `public/update-manifest.json`을 사용한다.
- 라이선스가 없어도 계산, 백업, Export 준비 기능을 막지 않는다.
- 서버로 CBAM 업무 데이터를 전송하지 않는 문구를 설정 화면과 관리자 로그인 화면에 표시한다.

### Phase 1: Admin Authentication

- Auth.js + Google OAuth를 설치한다.
- `/admin`과 `/api/admin/*`를 보호한다.
- `openbrain.main@gmail.com`을 기본 관리자 허용 이메일로 둔다.

### Phase 2: Hosted License API

- Next.js Route Handler와 Neon Postgres로 license-api를 만든다.
- 무료 라이선스 등록, 상태 확인, update manifest 조회, 공지 조회만 제공한다.
- PWA는 `NEXT_PUBLIC_LICENSE_API_URL`이 있을 때만 원격 확인을 켠다.
- 원격 확인 실패 또는 오프라인 상태에서는 마지막 확인 결과로 계속 사용할 수 있게 한다.

### Phase 3: Admin Console Data

- 관리자 화면의 mock data를 Neon 조회 결과로 대체한다.
- 사용자/라이선스, 업데이트 정책, 공지, 약관 버전 CRUD를 연결한다.
- 관리자 API에는 역할 기반 인증과 기본 rate limit을 둔다.

### Phase 4: Paid/On-Prem Preparation

- 유료 라이선스, 조직별 계약, Docker/on-prem 배포 관리는 무료 PWA와 별도 테이블 및 별도 약관으로 분리한다.

## Update Control Flow

1. PWA 시작 시 정적 `public/update-manifest.json` 또는 `GET /api/update-manifest`를 확인한다.
2. `none` 또는 `optional`이면 계속 사용할 수 있다.
3. `recommended`이면 상단 배너와 설정 화면에서 업데이트를 권장한다.
4. `required`이면 주요 기능 진입 전에 업데이트 안내를 먼저 보여준다.
5. 강제 업데이트여도 `.cbam` 백업 안내와 복구 경로는 막지 않는다.
