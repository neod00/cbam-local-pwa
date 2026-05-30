# CBAM Local PWA

국내 CBAM 대상 기업과 실무 컨설턴트가 브라우저 로컬 환경에서 CBAM 산정 자료를 정리하고, EU 원본 Communication template 복사본에 입력값을 반영하기 위한 로컬 우선 PWA입니다.

## 방향

- **로컬 우선**: 입력 데이터는 기본적으로 사용자의 브라우저 IndexedDB에 저장됩니다.
- **서버 전송 없음**: MVP PWA는 기업 입력자료와 EU 템플릿 파일을 서버로 업로드하지 않는 구조를 목표로 합니다.
- **한국어 UI**: 국내 중소·중견기업 실무자가 이해하기 쉬운 한국어 화면을 우선합니다.
- **EU 원본 템플릿 보존**: 앱에 EU 템플릿을 내장하지 않고, 사용자가 보유한 최신 원본 Excel 파일을 업로드한 뒤 복사본에만 값을 반영합니다.
- **무료 PWA 우선**: Docker/on-premise 등 고급 배포 방식은 향후 별도 버전에서 검토합니다.

## 현재 MVP 범위

- 품목, 보고기간, 사업장, 생산공정, 배출원 자료, 구매 전구물질 로컬 관리
- 공정 및 제품 생산라인 기준 SEE 산정
- 배출원 합계와 직접배출량 불일치 검토
- 전구물질 기본값 사유, SEE 출처, 검증 상태 검토
- 공식 기준자료 업로드 기반 SEFA 및 CBAM 인증서 지표 시나리오 검토
- EU Communication template 필수 시트 검증
- `A_InstData`, `B_EmInst`, `C_Emissions&Energy`, `D_Processes`, `E_PurchPrec` 일부 입력 셀 반영
- Export 전 오류/경고 체크리스트와 수정 화면 연결
- `.cbam` 백업 파일 내보내기/가져오기

## 실행 방법

필요 환경:

- Node.js 20 이상 권장
- npm

설치:

```bash
npm install
```

개발 서버 실행:

```bash
npm run dev
```

브라우저에서 다음 주소를 엽니다.

```text
http://localhost:3000
```

품질 검증:

```bash
npm run verify
```

개별 검증:

```bash
npm run verify:source-streams
npm run verify:calculation
npm run verify:scenarios
npm run verify:dashboard
npm run verify:export
npm run verify:backup
npm run verify:pwa
```

## 데이터 보안 및 백업

- PWA MVP의 업무 데이터는 브라우저 로컬 저장소에 저장됩니다.
- 브라우저 데이터 삭제, 프로필 변경, 기기 교체 시 데이터가 사라질 수 있습니다.
- 중요한 입력 후에는 앱의 `설정` 화면에서 `.cbam` 백업 파일을 내려받아 보관하세요.
- 백업 파일에는 업무 입력자료가 포함될 수 있으므로 회사 내부 보안정책에 맞게 관리해야 합니다.
- 보안 이슈를 제보할 때는 [SECURITY.md](SECURITY.md)의 민감자료 공유 금지 기준을 따르세요.

## EU 템플릿 사용 방식

1. EU에서 제공하는 최신 `CBAM Communication template for installations` Excel 파일을 사용자가 직접 준비합니다.
2. 앱의 Export 화면에서 해당 원본 파일을 선택합니다.
3. 앱은 브라우저 안에서 필수 시트와 CN 코드 목록을 검증합니다.
4. 입력 가능한 셀에 로컬 산정 데이터를 반영한 복사본을 생성합니다.
5. 원본 파일 자체는 수정하지 않습니다.

## 로컬 참고자료

`CBAM_documents/` 폴더는 개발 참고용 문서 보관 위치이며 Git 추적 대상에서 제외되어 있습니다. 공식 EU 템플릿, 법령 번역서, 벤치마크 파일, 기본값 파일 등 대용량 또는 저작권/보안 이슈가 있는 자료는 저장소에 커밋하지 않습니다.

## 한계

- 이 앱은 법률 자문 또는 공식 검증기관의 검증을 대체하지 않습니다.
- CBAM 인증서 비용 지표는 현재 시나리오 검토용이며, 유상 탄소가격 차감 등 확정이 필요한 요소는 보수적으로 제한하고 있습니다.
- 제품라인 배분 결과의 EU 템플릿 반영 범위는 공식 입력 셀 확인이 끝난 영역부터 단계적으로 확장합니다.

## 공개 배포 전 체크리스트

MVP 공개 전 확인 항목은 [docs/mvp-release-checklist.md](docs/mvp-release-checklist.md)를 기준으로 관리합니다.

## 라이선스

아직 라이선스가 지정되지 않았습니다. 공개 배포 전 무료 사용 범위와 재배포 조건을 별도로 확정해야 합니다.
