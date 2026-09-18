# run11 — 대일기업 기업 담당자 페르소나 실사용 평가 (탐색 모드)

- **일시**: 2026-09-16
- **대상**: 브랜치 `feat/allocation-logic` @ `f2117e3` (할당로직 화면·내보내기·보고서 커밋까지), 개발 서버 `npm run dev`, `.next` 삭제 후 재기동
- **앱 주소**: `http://127.0.0.1:3000` (localhost와 저장소가 분리되어 빈 상태에서 시작. `localhost:3000`의 run09 원장은 건드리지 않음)
- **페르소나**: 김도현 과장 — 대일기업(주) 품질환경팀, 8년차, CBAM 세미나 3회 수준. **컨설턴트(씨밤이)가 아니라 기업 담당자.**
- **시나리오**: `cbamy/scenarios/sts-fastener-daeil.md` (STS 십자홈 나사 CN 7318 15 52, 탄소강 나사 병행 생산, 공용 전력 계량기, 대만 공급사 미회신)
- **운영자 전용 정답표**: `cbamy/scenarios/sts-fastener-daeil-app-checks.md` (페르소나 노출 금지)

## 진행 구조
1. 코드·규정 독해 6갈래(panels/engine/reference/streams/guide/export) → 스크래치패드 다이제스트
2. 정답표(기대 SEE 변형별) → app-checks 파일
3. 페르소나 실사용 W1(시작~3단계) → W2(4~6단계) → W3(결과~백업·복원) — Playwright MCP, 실제 조작만
4. 발견 항목 반박 검증(코드 관점·규정 관점) → 확정
5. 산출물 5종: usage-log.md / see-result.md / improvement-suggestions.md / client-questions.md / **pros-cons-review.md(주 산출물)**

## 폴더
- `screenshots/` — 실사용 스크린샷 (W1: 10~39, W2: 40~69, W3: 70~99)
- `downloads/` — 앱에서 받은 EU 템플릿 복사본·산정보고서·.cbam
- `usage-log-W*.draft.md` — 스테이지별 1인칭 일지 초안(크래시 대비 누적 기록)
