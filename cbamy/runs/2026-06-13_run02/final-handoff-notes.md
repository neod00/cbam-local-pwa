# 인계 노트 (final handoff) — 회귀 run02

> 회귀 모드 산출물. run01 결함 수정이 검증 완료되어, CBAM_Platform을 실제 컨설팅/declarant 지원에 쓸 수 있는 상태인지 판단하는 인계 메모.

## 인계 판정: 조건부 GO ✅
계산 정확성·핵심 사용성 결함이 모두 해소되어, **철강(EAF) SEE 산정 보조 도구로 사용 가능**. 단 아래 "사용 시 주의"를 컨설턴트가 인지한 상태에서.

## 무엇이 이제 신뢰 가능한가
- **인증서 기준 SEE(see_cbam_basis)**: 철강 direct-only에서 전구물질 indirect를 올바르게 제외 → EU 공식 SEE(direct)와 일치(P1 1.00153 / P2 1.43961). 인증서 수량·비용 지표가 더 이상 과대계상되지 않음.
- **참고용 총 SEE(see_informational_total)**: EU SEE(total)와 일치(2.37999 / 3.17111) — EU 템플릿 Excel 재계산 대조용.
- **declarant 보고용 SEE(direct)/SEE(indirect)**: 전구물질 포함 분해를 앱이 산출·표시.
- **입력 안전장치**: 연료 단위/NCV 정합성 경고, 물질수지 음수 차감, 전력 EF 출처 분류+위계 안내, default mark-up 가시화, 전구물질 소비량 경고 정상화.

## 어느 값을 어디에 쓰나
- **CBAM 인증서 의무량 산정** → `see_cbam_basis` (철강은 direct-only). `/scenarios`의 인증서 지표는 **사전 검토용** — 최종 declaration·Registry·기지불 탄소가격은 별도 확인.
- **EU Communication Template 수입자 전달** → SEE(direct)/SEE(indirect)[전구물질 포함]. export는 원본 복사본에 입력셀만 기록, Summary_Products SEE는 Excel 수식 재계산 → 앱 검토값과 수동 대조.

## 사용 시 주의 (declarant/컨설턴트)
1. **전력 EF 위계**: EF 출처 유형을 반드시 분류. 실측 EF는 직접 기술적 연결·PPA만, GO·녹색인증서 불가. (예제는 'Mix' 0.833.)
2. **물질수지 직접배출 반영**: source-stream 합계는 자동으로 직접배출량을 갱신하지 않음 → "배출원 합계 적용"으로 수동 반영(P1-run02-01).
3. **default vs actual**: default는 연도 mark-up 포함값. 실측이 가능하면 보통 유리.
4. **규정 최종 확인**: direct-only 전구물질 indirect 제외·markup 규칙은 IR 원문 대조 권장(EU 예제로 1차 검증됨).
5. **K-ETS 탄소가격**: 앱 미지원(보류). 최종 declaration 단계에서 증빙·환율과 함께 별도 처리.

## 미해결/후속 (인계 후 작업)
- 전력 EF 출처 → EU 템플릿 셀 매핑 (P1-run02-02)
- CN-제품설명 일치 검증 (P2-run02-03)
- IR 원문 대조, K-ETS 경로(수요 시)

## 회귀 요약
- 수정 6건 전부 PASS, 신규 결함 0, 기존 기능 회귀 0 (`npm run verify` 16/16 + build + 라우트 19).
