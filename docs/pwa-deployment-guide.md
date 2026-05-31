# PWA Deployment Guide

CBAM Local PWA를 무료 배포할 때의 기본 방향입니다. 저장소는 비공개로 유지하고, 사용자는 배포된 PWA URL로만 접근하는 구조를 전제로 합니다.

## 권장 MVP 배포 방식

MVP 단계에서는 Vercel 같은 Next.js 지원 호스팅을 우선 검토합니다.

- GitHub 저장소는 Private 상태로 유지합니다.
- 호스팅 서비스에는 Private 저장소 접근 권한만 연결합니다.
- 배포 산출물에는 `CBAM_documents/`, 공식 EU 템플릿, 실제 기업자료, `.cbam` 백업 파일을 포함하지 않습니다.
- 배포 전에는 반드시 `npm run verify`를 통과시킵니다.
- 무료 PWA 약관/고지와 보안 안내를 README 또는 앱 내 안내에서 확인 가능하게 유지합니다.

## Vercel 기준 설정

- Framework Preset: `Next.js`
- Build Command: `npm run build`
- Install Command: `npm install`
- Output Directory: 기본값 사용
- Environment Variables: MVP 기준 필수값 없음

Vercel은 Private GitHub 저장소에서 빌드하더라도 배포된 JavaScript 번들은 브라우저 사용자에게 전달됩니다. 따라서 소스 저장소 비공개와 프론트엔드 번들 비공개는 다른 문제입니다.

## Cloudflare Pages 또는 Netlify

Cloudflare Pages와 Netlify도 사용할 수 있지만, Next.js App Router 지원 방식과 빌드 어댑터가 바뀔 수 있습니다. MVP에서는 배포 난이도와 디버깅 비용을 줄이기 위해 Vercel을 1순위로 보고, 이후 비용·도메인·국내 접속 품질을 비교합니다.

## 배포 전 금지 항목

- `CBAM_documents/` 폴더를 저장소나 배포 산출물에 포함하지 않습니다.
- 공식 EU 템플릿 원본 파일을 앱에 내장하지 않습니다.
- 샘플이 아닌 실제 기업자료를 데모 데이터로 넣지 않습니다.
- `.env` 파일이나 서비스 토큰을 커밋하지 않습니다.
- 유료 또는 보호 대상 계산 로직을 프론트엔드 번들에 넣기 전에 별도 보호 전략을 검토합니다.

## 배포 후 확인

- 설치 가능한 PWA로 표시되는지 확인합니다.
- 새 브라우저 프로필에서 데이터가 비어 있는 상태로 시작하는지 확인합니다.
- `.cbam` 백업 내보내기/가져오기가 동작하는지 확인합니다.
- EU 원본 템플릿 업로드 후 Export 복사본이 생성되는지 확인합니다.
- 브라우저 개발자도구 Network 탭에서 기업 입력자료가 외부 서버로 전송되지 않는지 확인합니다.
