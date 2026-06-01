# Free PWA Release Announcement Draft

Status: OPERATOR_REVIEW_REQUIRED

이 문서는 CBAM Local PWA 무료 베타 배포 시 사용할 공지문 초안이다. 실제 공개 전에는 서비스명, 운영자 정보, 약관 링크, 개인정보 처리 안내, 배포 URL을 최종 확정해야 한다. 문의 채널은 `openbrain.main@gmail.com`으로 둔다.

현재 검토용 배포 URL은 `https://cbam-local-pwa.vercel.app/`이고, 공개 배포 안내 URL은 `https://cbam-local-pwa.vercel.app/announcement`, 약관/고지 초안 URL은 `https://cbam-local-pwa.vercel.app/terms`, 개인정보/데이터 처리 안내 URL은 `https://cbam-local-pwa.vercel.app/privacy`이다.

## 짧은 공지문

CBAM Local PWA 무료 베타 버전을 공개합니다.

CBAM Local은 CBAM 대상 기업 담당자가 브라우저에서 로컬로 품목, 생산공정, 배출원, 전구물질 자료를 정리하고 EU 제출용 Excel 복사본 생성을 준비할 수 있도록 만든 업무 보조 도구입니다.

입력 데이터는 기본적으로 사용자의 브라우저 로컬 저장소에 보관되며, 운영 서버로 업로드하지 않는 구조를 원칙으로 합니다. 사용자는 최신 EU 원본 Communication template과 기준자료를 직접 업로드해 검토해야 하며, Export 후 Microsoft Excel에서 공식 수식 재계산 결과를 반드시 확인해야 합니다.

이 도구는 법률 자문, 공식 검증, 회사 내부 승인, 최종 EU 제출 책임을 대체하지 않습니다. 중요한 입력 후에는 `.cbam` 백업 파일을 내려받아 회사 보안정책에 맞게 보관해 주세요.

문의: `openbrain.main@gmail.com`

## 긴 공지문

CBAM Local PWA 무료 베타 버전을 공개합니다.

이 앱은 CBAM 대상 기업 실무자가 다음 업무를 한 곳에서 정리할 수 있도록 만든 로컬 우선 PWA입니다.

- 사업장과 보고기간 정리
- CBAM 대상 품목 및 CN 코드 관리
- 생산공정과 제품 생산라인 배분 검토
- 직접배출량, 간접배출량, 전구물질 SEE 검토
- SEFA 및 CBAM 인증서 비용 시나리오 검토
- 최신 EU 원본 템플릿 기반 제출용 Excel 복사본 생성 준비
- `.cbam` 프로젝트 백업 내보내기와 가져오기

### 데이터 보관 방식

CBAM Local은 민감한 회사 자료가 외부 서버로 전송되는 것을 최소화하기 위해 로컬 우선 구조로 설계했습니다.

입력한 생산량, 연료 사용량, 전력 사용량, 전구물질 자료, 산정 결과는 기본적으로 브라우저 로컬 저장소에 보관됩니다. 다만 브라우저 데이터 삭제, 기기 교체, 보안 프로그램 정리, 프로필 초기화가 발생하면 로컬 데이터가 사라질 수 있습니다.

중요한 입력 후에는 반드시 `.cbam` 백업 파일을 내려받아 회사 보안정책에 맞는 위치에 보관해 주세요.

### EU 원본 템플릿

앱은 EU 원본 Excel 템플릿을 내장하지 않습니다. 사용자가 보유한 최신 공식 `CBAM Communication template for installations` 파일을 직접 업로드하면, 앱은 해당 파일의 복사본에 확인된 입력값을 반영합니다.

공식 시트명, 영어 라벨, 보호된 영역, 공식 수식 셀은 원본 구조를 유지하는 것이 원칙입니다. Export 후에는 Microsoft Excel에서 복사본을 열고 공식 수식 재계산 결과를 반드시 확인해야 합니다.

### 무료 베타 버전의 한계

무료 PWA는 CBAM 업무를 정리하고 제출 준비를 돕는 도구입니다. 아래 업무를 대체하지 않습니다.

- 법률 자문
- 관세 또는 세무 자문
- 검증기관 검증
- 회사 내부 승인
- EU 또는 관계기관에 대한 최종 제출 책임

SEFA와 CBAM 인증서 관련 화면은 현재 검토용 시나리오입니다. 실제 비용, 차감, 제출 판단에는 최신 EU 규정과 공식 계산 기준 확인이 필요합니다.

### 소스와 배포 방식

소스 저장소는 비공개로 유지하며, 사용자는 배포된 PWA URL로 앱을 사용합니다.

PWA 특성상 브라우저로 전달되는 JavaScript 번들은 사용자가 확인할 수 있습니다. 고급 보호가 필요한 기능, 다중 사용자 관리, 관리자 콘솔, Docker/on-premise 배포는 향후 별도 버전으로 분리할 수 있습니다.

### 사용자 주의사항

- 실제 회사자료를 공개 이슈, 이메일, 메신저에 첨부하지 마세요.
- `.cbam` 백업 파일은 회사 보안정책에 맞게 보관하세요.
- 최신 EU 원본 템플릿과 기준자료는 사용자가 직접 확인해 업로드하세요.
- Export 후 Microsoft Excel에서 공식 수식 재계산 결과를 확인하세요.
- 앱의 산정값과 공식 Excel 결과가 다르면 제출 전 원인을 검토하세요.
- 무료 PWA는 공식 검증과 최종 제출 책임을 대체하지 않습니다.

## 배포 전 확정해야 할 항목

- 서비스명
- 운영자명 또는 회사명
- 배포 URL: `https://cbam-local-pwa.vercel.app/`
- 배포 안내 URL: `https://cbam-local-pwa.vercel.app/announcement`
- 약관 URL: `https://cbam-local-pwa.vercel.app/terms`
- 개인정보 처리 안내 URL: `https://cbam-local-pwa.vercel.app/privacy`
- 문의 채널: `openbrain.main@gmail.com`
- 보안 문의 채널: `openbrain.main@gmail.com`
- 릴리즈 노트 URL

## 첫 공지 전 보류 조건

아래 항목 중 하나라도 남아 있으면 공지를 보류한다.

- 무료 약관/고지 문구가 운영자 또는 법무 검토를 받지 않았다.
- 개인정보 처리 안내 필요 여부가 검토되지 않았다.
- Export 후 Excel 재계산 확인 절차가 공지문에 포함되지 않았다.
- 사용자가 실제 회사 데이터를 서버로 전송한다고 오해할 수 있는 문구가 남아 있다.
- 저장소 또는 배포 산출물에 `CBAM_documents/`, EU 원본 템플릿, `.cbam`, 실제 회사자료가 포함되어 있다.
