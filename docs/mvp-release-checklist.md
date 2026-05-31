# MVP Release Checklist

CBAM Local PWA를 무료 배포하기 전에 확인할 항목입니다. 소스 저장소는 비공개로 유지하고, 사용자는 배포된 PWA URL로 접근하는 방식을 기본 전제로 합니다.

## 필수 확인

- `npm run verify`가 통과한다.
- `npm run verify:deployment`가 통과한다.
- `npm run verify:routes`가 production build 기준 주요 화면을 통과한다.
- `CBAM_documents/`와 공식 EU 템플릿 원본 파일이 Git에 포함되지 않는다.
- README의 실행 방법과 데이터 보안 안내가 최신 상태다.
- [docs/pwa-deployment-guide.md](pwa-deployment-guide.md)의 배포 금지 항목을 확인했다.
- 첫 배포는 [docs/first-deployment-runbook.md](first-deployment-runbook.md)의 순서로 진행한다.
- PWA manifest와 service worker가 현재 주요 라우트를 포함한다.
- 설정 화면에서 `.cbam` 백업 내보내기/가져오기가 동작한다.
- Export 화면에서 오류와 경고가 수정 화면으로 연결된다.
- [docs/mvp-rehearsal-plan.md](mvp-rehearsal-plan.md)의 흐름대로 사업장부터 `.cbam` 백업까지 실제 리허설을 완료한다.
- 리허설에는 [docs/mvp-fictional-dataset.md](mvp-fictional-dataset.md)의 가상 입력값을 사용하고 실제 회사 자료를 입력하지 않는다.
- [docs/mvp-rehearsal-report.md](mvp-rehearsal-report.md)에 자동 검증, 로컬 EU 템플릿 검증, 기준자료 검증, 남은 수동 확인 항목을 기록한다.
- [docs/excel-recalculation-review.md](excel-recalculation-review.md)에 따라 생성된 Excel 복사본의 공식 수식 재계산 결과를 확인한다.
- 저장소는 Private 상태를 유지한다.
- 배포된 PWA의 JavaScript 번들은 사용자가 확인할 수 있다는 한계를 사용자/운영자 문서에 반영한다.

## 사용자 안내

- 앱은 법률 자문이나 공식 검증을 대체하지 않는다는 점을 명시한다.
- 업무 데이터는 브라우저 로컬 저장소에 저장되며, 브라우저 데이터 삭제 시 사라질 수 있음을 안내한다.
- 사용자는 중요한 입력 후 `.cbam` 백업 파일을 별도 보관해야 한다.
- EU 제출용 Excel은 사용자가 최신 원본 템플릿을 직접 업로드해야 한다.
- 앱은 원본 템플릿을 수정하지 않고 복사본을 생성한다.
- 무료 PWA는 사용 편의를 위한 배포이며, 소스 공개나 재배포 허가를 의미하지 않는다고 안내한다.

## 배포 전 결정 필요

- 무료 사용 약관: [docs/free-pwa-terms-draft.md](free-pwa-terms-draft.md) 초안을 기준으로 무료 사용 범위, 재배포 금지, 상업적 이용 제한, 책임 제한을 법률 검토 후 확정해야 한다.
- 배포 채널: MVP 기본 채널은 [docs/pwa-deployment-guide.md](pwa-deployment-guide.md) 기준으로 Vercel + Private GitHub 저장소로 둔다. Cloudflare Pages, Netlify, 자체 정적 호스팅은 비용, 접속 품질, 보안 정책상 필요가 생길 때 전환 후보로 검토한다.
- 소스 보호 범위: PWA 번들 노출을 감안해 고급 계산 로직을 어느 시점에 서버/API 또는 Docker/on-premise 버전으로 분리할지 결정해야 한다.

## MVP 이후로 미루는 항목

- 컨설턴트용 고객사/프로젝트 다중 관리
- 서버 기반 공동작업 또는 공급업체 포털
- Docker/on-premise 유료 배포
- 유상 탄소가격 차감 공식 반영
- 공식 셀 확인 전 제품라인 배분 결과의 EU 템플릿 직접 기입 확대
