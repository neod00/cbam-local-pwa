# First Private PWA Deployment Runbook

이 문서는 CBAM Local PWA를 처음 무료 배포 URL로 올릴 때의 실행 순서다. 기본 전제는 Private GitHub 저장소와 Vercel 배포다. 다른 호스팅을 쓰더라도 금지 파일, 소스 노출 한계, 로컬 데이터 원칙은 동일하다.

## 배포 전 의사결정

- 저장소는 Private 상태를 유지한다.
- 배포 URL은 무료 PWA 사용자를 위한 접근 채널이고, 소스 공개 채널이 아니다.
- 사용자는 PWA JavaScript 번들을 볼 수 있으므로 고급 보호 로직은 MVP 프론트엔드 번들에 넣지 않는다.
- CBAM 계산 입력값, EU 원본 템플릿, `.cbam` 백업은 서버로 업로드하지 않는 구조를 유지한다.
- Docker/on-premise와 관리자 콘솔은 MVP 이후 별도 제품화 단계로 둔다.

## 1. 로컬 사전 확인

배포 전 로컬에서 다음 명령을 실행한다.

```bash
npm run verify
npm run release:status
```

`verify` 안에는 다음 검사가 포함된다.

- 계산 엔진 검증
- EU Export synthetic workbook 검증
- `.cbam` 백업 검증
- PWA 릴리스 문서 검증
- 디자인 시스템 검증
- 업데이트 정책 검증
- private-source 배포 준비성 검증
- lint
- production build
- production route HTTP 200 검증

공식 EU 템플릿과 기준자료는 Git에 넣지 않고 로컬 경로로만 별도 확인한다.

```bash
npm run verify:local-eu-template -- "<path-to-CBAM-Communication-template.xlsx>"
npm run verify:local-references -- "<path-to-CBAMBenchmarks.xlsx>" "<path-to-DVsasadopted.xlsx>"
```

## 2. Git 상태 확인

```bash
git status --short
git ls-files
```

확인할 사항:

- `CBAM_documents/`가 추적되지 않는다.
- `artifacts/`가 추적되지 않는다.
- `.env*`가 추적되지 않는다.
- `.vercel/`이 추적되지 않는다.
- `.cbam`, `.xlsx`, `.xls`, `.xlsm`, `.pdf`, `.zip` 파일이 추적되지 않는다.
- `package.json`은 `"private": true`를 유지한다.

## 3. Vercel 프로젝트 생성

Vercel에서 새 프로젝트를 만들 때 다음 기준을 사용한다.

| 항목 | 설정 |
| --- | --- |
| Repository | Private GitHub 저장소 |
| Framework Preset | Next.js |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | 기본값 |
| Environment Variables | MVP 기준 없음 |

Vercel에 연결되는 것은 소스 저장소 접근 권한이다. 사용자 CBAM 데이터가 Vercel로 올라가는 구조가 아니다.

## 4. 첫 배포 후 확인

배포 URL에서 다음을 확인한다.

- Dashboard가 열린다.
- 새 브라우저 프로필 또는 시크릿 창에서 로컬 데이터가 비어 있는 상태로 시작한다.
- 주요 메뉴가 열린다.
  - 사업장
  - 보고기간
  - 품목
  - 생산공정
  - 배출원 자료
  - 구매 전구물질
  - 산정 결과
  - SEFA/인증서 시나리오
  - 자료 업로드
  - EU Export
  - 설정
- PWA 설치 프롬프트 또는 브라우저 설치 메뉴가 표시된다.
- 설정 화면에서 `.cbam` 백업 내보내기와 가져오기 안내가 보인다.
- Export 화면에서 최신 EU 템플릿 업로드 방식과 Excel 재계산 안내가 보인다.

## 5. 네트워크 데이터 경계 확인

브라우저 개발자도구 Network 탭에서 다음을 확인한다.

- 앱 shell, JavaScript, CSS, manifest, service worker 요청만 발생한다.
- 회사 입력값을 저장할 때 별도 API 요청이 발생하지 않는다.
- `.cbam` 백업 파일이 서버로 업로드되지 않는다.
- EU 원본 템플릿과 reference workbook이 서버로 업로드되지 않는다.

## 6. 가상 데이터 리허설

`docs/mvp-fictional-dataset.md`의 값으로 `docs/mvp-rehearsal-plan.md`를 따라간다.

완료 후 다음을 기록한다.

- 막히는 화면
- 한국어 문구가 모호한 화면
- 모바일에서 표가 읽기 어려운 화면
- Export readiness 경고가 수정 화면으로 잘 연결되는지
- Excel 재계산 검토 결과
- `.cbam` 백업 복원 결과

## 7. 배포 공지 전 확인

- `docs/free-pwa-terms-draft.md`의 문구가 법무 검토를 받았다.
- `docs/free-pwa-release-announcement-draft.md`의 공지문에서 로컬 우선, 최신 EU 원본 템플릿 직접 업로드, `.cbam` 백업, 공식 검증 대체 아님을 명확히 안내한다.
- 사용자가 실제 회사 데이터를 입력하기 전 로컬 저장과 백업 책임을 이해할 수 있다.
- 공지문에 “무료 PWA”, “로컬 우선”, “공식 검증 대체 아님”, “최신 EU 원본 템플릿 직접 업로드”가 포함된다.
- 문의와 보안 제보 채널은 `openbrain.main@gmail.com`으로 안내한다.
- 공개 이슈나 문의 채널에서 회사 자료, `.cbam`, EU 템플릿 파일을 올리지 말라는 안내가 포함된다.

## 롤백 기준

다음 중 하나라도 확인되면 배포 공지를 보류한다.

- private-source 검증 실패
- production route 검증 실패
- 공식 EU 템플릿 verification 실패
- 브라우저 입력값이 서버 API로 전송되는 정황 발견
- Export 복사본에서 공식 수식 셀이 덮어써진 정황 발견
- 약관/책임 제한 문구 미확정
