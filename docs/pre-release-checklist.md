# 공개 전 확인 목록

앱을 외부에 공개하기 전에 끝내야 하는 일. 계산·기능이 아니라 **누가 운영하는가**와 **개인정보를 어떻게 다루는가**에 관한 것이다.

## 1. 운영자 정보 채우기 (사람이 정해야 함)

`src/lib/operator-info.ts`의 빈 문자열을 채운다. 채우면 약관·개인정보 화면의 빨간 「배포 전 확정 필요」 배너가 저절로 사라지고 배지가 「공개본」으로 바뀐다. `npm run verify`의 `verify:pre-release`가 같은 것을 확인한다.

| 항목 | 무엇을 적나 | 비고 |
|---|---|---|
| `operator_name` | 운영 주체 — 개인사업자면 상호, 법인이면 법인명 | 약관·개인정보 처리방침에 모두 나간다 |
| `business_registration_no` | 사업자등록번호 | 사업자가 아니면 「해당 없음」이라고 적는다. 빈칸으로 두지 않는다 |
| `address` | 주소 | 공개가 어려우면 「요청 시 제공」 |
| `privacy_officer` | 개인정보 보호책임자 이름 또는 직위 | **개인정보 보호법 제31조상 지정·공개 의무**. 1인 사업자면 본인 이름 |
| `jurisdiction` | 전속 관할 법원 | 예: 서울중앙지방법원. 본점 소재지 관할이 일반적이다 |
| `terms_effective_date` | 약관 시행일 | 공개일 이후 날짜 |
| `privacy_effective_date` | 개인정보 처리방침 시행일 | 보통 약관과 같은 날 |

이미 채워져 있는 것: `service_name`(CBAM Local), `contact_email`(openbrain.main@gmail.com), `governing_law`(대한민국 법). 바꾸려면 같은 파일에서 고친다.

## 2. 법무 검토 (사람이 해야 함)

운영자 정보를 채운 뒤 `/terms`와 `/privacy`를 인쇄해 검토받는다. 특히 볼 것:

- **개인정보 수집이 실제로 일어난다.** 무료 라이선스 등록이 **필수**이고, 이메일·회사명·담당자명·연락처·국가·업종을 서버(Neon, 미국)로 보낸다. 종전 안내는 「향후 … 검토합니다」라는 미래 시제였고 사실과 달랐다 — 이번에 현재 시제로 고쳤다.
- **국외 이전에 해당한다.** Vercel·Neon·Resend 모두 해외 사업자다. 처리방침에 수탁자·업무·위치를 표로 적었다(`PERSONAL_DATA_PROCESSORS`).
- 동의를 받는 시점과 방법(등록 화면의 약관 동의 체크)이 요건을 만족하는지.
- 책임 제한 문구가 한국 법에서 유효한 범위인지.

## 3. 수집 항목이 바뀌면

`/api/license/register`가 받는 항목을 늘리거나 줄이면 `src/lib/operator-info.ts`의 `COLLECTED_PERSONAL_DATA`도 같이 고친다. 처리방침이 사실과 달라지는 것을 막기 위해 `verify:pre-release`가 두 목록을 대조한다.

수탁자가 바뀌면 `PERSONAL_DATA_PROCESSORS`도 고친다(이건 자동 대조가 안 되므로 계약을 바꿀 때 같이 고쳐야 한다).

## 4. 배포 전 기술 점검 (이미 자동화됨)

```bash
npm run verify
```

`verify:deployment`가 저장소에 회사 자료(`CBAM_documents/`, `.env*`, `.cbam`, Excel·PDF·ZIP)가 딸려 들어가지 않았는지 확인한다. `verify:pwa-release`가 PWA 배포 요건을 본다.

배포 절차 자체는 `docs/pwa-deployment-guide.md`와 `docs/first-deployment-runbook.md`에 있다.

## 5. 남은 판단 (기능)

- **실제 담당자 시범 사용** — 지금까지의 검증은 모두 내가 만든 자료로 내가 눌러 본 것이다. 공개 전 한두 곳이라도 실제 자료로 써 보는 것이 가장 값진 확인이다.
- 3공정 이상 사슬, 범위 밖 제품과 철강 제품을 같은 공정에서 만드는 경우는 화면에서 확인하지 않았다(테스트로만).
