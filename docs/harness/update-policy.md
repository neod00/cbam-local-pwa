# Update Policy

무료 PWA 배포 이후에는 선택 업데이트와 강제 업데이트 정책이 필요하다. 업데이트 관리는 사용자 데이터 수집과 분리한다.

## Update Modes

- `optional`: 사용자가 원하는 때 적용한다.
- `recommended`: 상단 배너와 설정 화면에서 업데이트를 권장한다.
- `required`: 주요 기능 진입 전에 업데이트 화면을 표시한다.

## Managed Fields

- `latest_version`
- `minimum_supported_version`
- `update_policy`
- `notice_title`
- `notice_body`
- `release_notes_url`
- `effective_from`
- `target_audience`

## PWA Behavior

- 앱 시작 시 버전 manifest 또는 라이선스 API에서 최신 버전을 확인한다.
- 새 버전이 있으면 업데이트 배너를 보여준다.
- 강제 업데이트면 계산, Export 같은 주요 기능 진입 전에 업데이트 화면을 표시한다.
- 사용자가 업데이트를 선택하면 service worker 업데이트를 확인하고 새로고침한다.
- 오프라인 상태에서는 마지막 정상 확인 이력을 기준으로 일정 기간 기존 버전을 허용한다.

## Data Safety

- 업데이트는 코드와 정적 리소스만 갱신한다.
- IndexedDB 데이터는 유지되어야 한다.
- `.cbam` 백업 파일은 사용자가 직접 보관한다.
- 강제 업데이트도 회사 CBAM 데이터를 서버로 전송하지 않는다.

## Admin Console Requirements

관리자는 다음을 설정할 수 있어야 한다.

- 최신 버전
- 최소 지원 버전
- 선택/권장/강제 업데이트
- 공지 메시지
- 릴리스 노트 링크
- 적용 시작일
- 대상 그룹

