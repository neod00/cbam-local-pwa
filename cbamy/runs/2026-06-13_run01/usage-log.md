# 사용 일지 — 동성특수강(주) 단일 installation / EAF 스테인리스 304계 내재배출량(SEE) 산정
**세션**: 2026-06-13 run01 | **담당**: 씨밤이 (CBAMY)
**앱**: CBAM_Platform | **모드**: 탐색(explore) (실제 입력으로 앱 계산엔진을 처음부터 끝까지 따라가며 결함·사용성 검증)
**규정 기준**: EU CBAM 규정 (EU)2023/956 + 이행규정(Implementing Regulation), 2026 확정기간(definitive period)

> 작성 원칙: 본 일지의 수치는 실제 앱 계산엔진(calculation-engine.ts)을 실제 입력으로 실행(engine-crosscheck.mjs)한 결과만 사용했습니다. 규정 인용이 원문 대조로 확정되지 않은 부분은 "확인 필요(IR 원문 대조)"로 명시했습니다.

---

## 세션 시작 전 — 1차 검토 메모

(시나리오를 받은 직후 1차 검토)

- **시나리오 핵심 이해**: 동성특수강 EAF 스테인리스(304계). EU 공식 'EAF alloys' 예제를 가상 한국사로 각색. 보고기간 2025년 1~12월, 단일 installation(포항 제강·연주 + 창원 압연·정정). 생산공정 2단계 — P1(전기로 제강+연주, CN 72189911, 조강 2,234,000 t) → P2(압연+정정 시트, CN 72191310, 1,133,000 t). P1 조강 일부(1,227,000 t)는 사내 precursor로 P2에 전가.
- **시스템 경계 핵심 지점**: ①사내 직접배출(연소 LNG·물질수지·공정배출), ②자체 전력 간접배출(P1 1,563,800 MWh / P2 324,700 MWh), ③매입 precursor PP1~PP4(탄소강 강괴/FeNi/FeCr/FeMn)의 SEE 전가, ④사내 P1→P2 조강 전가. 두 경로(물질수지 투입측 합금철 C함량 vs 상류 precursor SEE) 혼동 금지 — 이중계상·누락 주의.
- **Annex II direct-only 사전 확인**: 철강(CN 72/73)은 Annex II direct-only 품목 → 최종재 *자체* 전력 간접배출은 인증서 산정 기준 SEE(see_cbam_basis)에서 제외, 보고/검토용(see_informational_total)으로만 보존하는 것이 원칙. **단, "전구물질의 indirect를 인증서 기준에 포함하느냐"는 별개 쟁점 — IR 원문 대조 확인 필요.** (이번 run의 핵심 결함 후보)
- **의사결정 핵심 지점**: source stream 정의(연소/물질수지/공정), 측정 기반 vs 계산 기반, 전구물질 귀속, 전력 EF 위계.
- **사전 rough estimate**: EU 공식 예제 기준 P1 SEE(direct) 1.00149 / SEE(indirect) 1.37842, P2 SEE(direct) 1.43961 / SEE(indirect) 1.73148 수준. 정보성 총 SEE는 P1 약 2.38, P2 약 3.17 예상.
- **기본값/벤치마크 사용 여부**: FeMn(PP4, 중국) 공급사 미회신 → default 사용 검토. 나머지 PP1~PP3 및 사내 데이터는 actual. 전력 EF는 EU 예제 'Mix' 0.833 tCO2e/MWh 적용(클라이언트 가정 한전 0.4594는 위계 확인 필요).
- **회귀 모드 아님**: 이번은 탐색(explore) 모드 — 사전 수정 항목 없음. 따라서 아래 "수정 사항 검증" 표는 N/A.

---

## (회귀 모드 한정) 검증 체크리스트 최종 결과

### 수정 사항 검증

| # | ID | 내용 | 판정 | 비고 |
|---|----|------|------|------|
| — | — | **N/A — 본 run은 탐색(explore) 모드. 사전 적용된 수정 사항 없음.** 신규 발견 결함은 improvement-suggestions.md 참조. | — | — |

### 이전 통과 항목 재확인 (회귀 방어)

| ID | 내용 | 판정 |
|----|------|------|
| — | N/A (이전 run 없음 — 본 run이 baseline) | — |

> 참고: 본 run에서 앱 자체 검증 스위트 6종(verify:calculation / source-streams / scenarios / export / routes / dashboard) PASS + 프로덕션 빌드 PASS 확인. 향후 회귀 방어 baseline으로 사용 가능.

---

## 세션 진행 기록 (시간순)

> 화면 순서는 워크플로 순(periods → products → processes → source-streams → precursors → results → export)을 따른다. 시작 전 라이선스 게이트 통과 단계를 먼저 기록한다.

### 0/8 첫 진입 — 라이선스 게이트
**[09:05]** 앱 첫 실행. 대시보드(/)로 진입하려는데 라이선스 게이트에 막힘.
- 관찰: LICENSE_GATE_OPEN_ROUTES(free-license-client.ts:38-46)에 `/`(대시보드)가 미포함. open route(/guide,/license,/settings…)가 아니고 승인 라이선스가 없으면 LockedLicensePanel 표시(LicenseGate.tsx:24-46). 신규 사용자는 "무엇부터 하면 되나요?" 3단계 카드(page.tsx:182-224)를 보기도 전에 잠김 화면을 만남. 게이트는 등록만으로 안 열리고 status가 FREE_ACTIVE/OFFLINE_ALLOWED/RECHECK_REQUIRED여야 함(canUseCoreApp 61-67).
- 막힘: 동성특수강 환경안전팀 담당자가 처음 켜면 "무료 사용 등록→관리자 승인" 대기 벽부터 만남. 마감(2026-07 중순)이 급한 컨설팅 상황에서 산정 착수 자체가 지연.
- ❌ 판정: **FAIL (P0, 온보딩 차단)** — 온보딩 카드보다 게이트가 우선 노출. 첫 담당자 진입 동선 단절.
- [09:12] (테스트 환경은 라이선스 승인 상태로 진행하여 이후 검증 계속)

### 1/8 보고기간(Periods)
**[09:15]** /periods 진입. 보고기간 2025-01-01~2025-12-31 단일 설정.
- 입력: 확정기간(definitive period) 첫 보고분 12개월. 활동수준·배출량 기간 정합성은 단일 기간이라 단순.
- 관찰: 확정기간 기준으로 무리 없이 설정. 단, 화면에 ActionItemCard("다음 단계") 안내가 없어(periods/page.tsx 전체) 첫 담당자가 period→product→process 순서를 스스로 파악해야 함. status(DRAFT/READY/CALCULATED) 변경 UI도 없음(edit에 status 필드 미노출, periods:55-65).
- 헤더 PeriodBadge가 하드코딩 단일 상수(PeriodBadge.tsx:1,8-11)라 등록한 실제 기간(2025)과 연동 안 됨. 좁은 화면(md 미만)에선 배지 자체가 hidden(PeriodBadge.tsx:6).
- ⚠️ 판정: **CONDITIONAL PASS** — 확정기간 설정 자체는 정상. 다음 단계 안내 부재·status 수동변경 불가·배지 미연동(P2).

### 2/8 제품(Products)
**[09:28]** /products 진입. 슬래브(P1, CN 72189911)·시트(P2, CN 72191310) 등록. (봉강 CN 72210010은 4.3 생산량 분할 미정리로 보류.)
- 입력: 품목명, CN 8자리, 집계품목범주, 생산국(KR), 생산량.
- 관찰(강점): CN 8자리 정규식 강제(products:266-272). EU 템플릿 xlsx에서 CN목록 로컬 import → 키워드/코드 검색 후 클릭으로 CN·HS·그룹·품목군 일괄 채움(311-337). 형식 오류·HS4 우선 실수 예방에 효과적. 연결 공정/전구물질/배출원 있으면 삭제 차단(handleDeleteProduct:227-256)으로 연쇄 파손 방지.
- 막힘(마찰): CN과 "제품설명/품목군 일치" 자동매칭 부재. applyCnOption(329-337)이 product_type_enum을 option.goodsCategory로 덮어쓰지만(336), 입력한 제품명과 CN description(C열, parseCnCodeOptions 767-815가 읽어오나 미노출) 실제 일치 여부 대조·경고 없음. CN만 맞으면 "산정 준비" 녹색(products:580) → 의뢰서 CN(72189911/72191310/72210010)을 잘못 받아써도 화면에서 검증할 단서가 없음. 봉강 제품설명↔CN 일치 검토 신호 부재.
- ⚠️ 판정: **CONDITIONAL PASS** — 형식 검증·import는 우수. CN-제품설명 의미 일치(분류 적정성) 미지원(P1).

### 3/8 생산공정(Processes)
**[09:50]** /processes 진입. P1(전기로 제강+연주)·P2(압연+정정) 정의. P1 조강 1,227,000 t를 P2 사내 precursor로 연결.
- 입력: production process 정의, 생산경로(EAF→연주→압연), 활동수준(조강 2,234,000 t / 제품 1,133,000 t), 전력 소비·전력 EF.
- 관찰(강점): 직접배출량 ↔ 배출원 자료 합계 교차검증이 견고(processes:679-724) — delta 실시간 표시, 1% 허용오차 초과 시 needsReview 플래그(63-86) + "배출원 합계를 직접배출량에 적용" 버튼. 직접배출량 입력했는데 source-stream 0건이면 명시 경고 + 이동 링크(711-724). 철강 Annex II direct-only 규칙 자동판정(cbam-product-rules.ts:42-78, getSee:385-395) — CN 72/73이면 최종제품 자체 간접배출을 인증서 SEE에서 자동 제외하고 라벨로 이유 표시.
- **막힘 1 (전력 EF 위계)**: 전력 EF가 순수 number 단일 필드(processes:731, local-db.ts:63). 기본값 0.47 하드코딩(processes:37). 클라이언트 가정 "한전 0.4594"를 그냥 덮어쓰면 끝. CBAM 전력 EF 위계(actual 계약 → residual mix → 국가 grid mix, EU 예제 0.833)를 구분하는 출처유형(enum) 필드가 없음(`ef_source`/`source_type` grep 0건). 어떤 위계를 써야 하는지·0.4594가 허용되는지 판단할 도움말·검증 전무. EF 출처를 적을 source 필드조차 전력엔 없음(source는 source-stream에만 존재). → 본 검증에선 EU 예제 'Mix' 0.833 적용(0.7 MWh/t × 0.833 = 0.5831 검증).
- **막힘 2 (제품라인 분할)**: 라인 추가/제품 선택/질량·수동비율 배분 UI는 존재(556-657). 라인 합계·차이·수동비율 합계 실시간 표시(630-644)·혼합배분 경고(645-649)도 양호. 그러나 "공정 총 생산량과 라인 합계 불일치"가 hard error가 아니라 "저장 가능하지만 확인 필요"(651-653) — 시트/봉강 분할 미정리(4.3) 상태에서 경고 무시 저장 가능. 수동비율 100% 검증도 강제 아님.
- ⚠️ 판정: **CONDITIONAL PASS** — 교차검증·Annex II 자동판정 우수. 전력 EF 위계 미반영(P0)·제품라인 분할 soft-warning(P1).

### 4/8 소스스트림(Source Streams)
**[10:20]** /source-streams 진입. P1 직접배출 source stream 입력(LNG 연소, 물질수지: 고철·흑연전극·탄소강 강괴 투입, 공정: 부원료). P2 직접배출.

#### 직접배출(Direct emissions) / 연소 탭
- **막힘 1 (LNG 단위·NCV 2배 오차 함정)**: 단위 드롭다운에 `t`와 `Nm3`만 있고 `GJ` 옵션이 없음(source-streams:42 `activityUnits = ['t','Nm3']`, calc lib:31-43). NCV는 활동자료 1단위당 GJ로 직접 입력(필드 470 "순발열량(GJ/단위)")하는데 NCV 참조표·연료별 기본 NCV·자동환산이 전무(NCV/Nm3 도우미 코드 grep 0건). 의뢰서 LNG t 기준 NCV(약 45~50 GJ/t)를 넣어놓고 현장이 Nm³ 활동량을 넣으면 단위·NCV가 어긋나도 앱이 침묵. seed(local-db.ts:579-586)부터 "Natural gas, 250 t, NCV 45, EF 73 tCO2e/단위"인데 EF 73이 GJ당이 아니라 단위(t)당으로 들어가면 계산식(activity×NCV×EF/1000)상 73×45배가 곱해져 비정상값. EF tCO2e/GJ(예 0.0561)와 tCO2e/t를 구분할 단서 없음. 라벨 "배출계수(tCO2e/단위)"의 "단위"가 활동단위인지 에너지단위인지 모호. **단위↔NCV↔EF 분모 정합성 경고 0건** — 씨밤이가 가장 경계하는 2배 오차를 앱이 못 잡음.
- **막힘 2 (물질수지 산출측 차감 차단)**: source-stream 활동량이 Math.max(activity_data,0)으로 음수 차단 → 물질수지 '산출측 차감(조강·슬래그 C함량)' 입력 불가. tC→tCO2(×44/12) 자동환산도 없음. source stream 합계는 직접배출량(direct_attributable_emissions_tco2e)을 자동 갱신하지 않고 '델타 불일치 경고'에만 사용 → 컨설턴트가 직접 수기 동기화 필요.
- 관찰(강점): 산화/전환/화석/바이오 계수 4종 입력 존재(486-505). seed 기본 1/1/1/0은 합리적. 출처(source) 미입력 시 저장 차단. eyebrow에 B_EmInst 등 EU 시트명 매핑 — 템플릿 대응 파악 쉬움.
- 막힘(마찰): oxidation/conversion/fossil/biomass 4계수가 0~1 숫자칸으로만, "연소연료는 보통 산화 1, 화석 1" 같은 초보 가이드·기본값 근거 부재(P2).

#### 간접배출(Indirect emissions) 탭
- 자체 전력 간접배출은 processes 화면의 전력 EF로 처리(위 3/8). actual EF 허용 조건(직접 기술적 연결/PPA, market-based 금지)을 확인할 EF 출처유형 필드가 없어 적용 EF의 정당성 추적 불가 — **확인 필요(IR 원문 대조)**.

#### 폐가스/공정 배출(Process / waste gas) 탭
- 부원료(석회석 등) 공정배출 입력. EF 0.45 tCO2/t 적용. 특이사항 없음.

- ❌/⚠️ 판정: **FAIL (직접배출 입력 핵심)** — ①LNG 단위/NCV/EF 분모 정합성 경고 부재(P0), ②물질수지 산출측 차감 불가·tC→tCO2 미환산·합계 자동 미갱신(P1). 본 검증에선 직접배출량을 수기로 동기화하여 진행.

### 5/8 전구물질(Precursors)
**[11:00]** /precursors 진입. PP1(탄소강 강괴/인니)·PP2(FeNi/일본)·PP3(FeCr/인도)는 actual, PP4(FeMn/중국)는 공급사 미회신 → default 검토. 사내 P1→P2 조강도 전가.
- 입력: precursor 식별·귀속, SEE(direct + indirect) 입력, data_mode(실측/혼합/공식기본값), verification_status.
- 관찰(강점): data_mode 3단(525-529)·verification_status 3단(534-537), DEFAULT 선택 시 사유 미입력이면 저장 차단(handleSubmit 303-305) + 실시간 amber 경고(539-554). getPrecursorEvidenceIssues(85-101)가 증빙 누락을 항목/요약/상단 카드로 다층 노출 → 추적성 우수. "기본값 적용" 버튼(applyDefaultValueFromReference 379-406)이 국가+CN+연도로 default를 찾아 direct_see/indirect_see/출처/사유 일괄 입력. 적용연도(2026/2027/2028) 선택 존재.
- **막힘 1 (MWh/t 환산 도우미 부재)**: direct/indirect SEE 둘 다 tCO2e/t 자유숫자(precursors:652-654, local-db.ts:109-110). 그런데 공급사가 흔히 주는 형식은 "전력 MWh/t"(PP2 FeNi elec 3.001 MWh·t, PP3 FeCr 2.821, PP1 0.245 — §3.2). 이 MWh/t에 전력 EF를 곱해 indirect SEE로 환산하는 도우미가 없음. 초보가 MWh/t 값을 그대로 간접 SEE 칸에 넣을 위험. 단위 라벨만 있고 변환 안내·예시 없음. → 본 검증에선 MWh/t × 전력EF를 수기 환산하여 입력.
- **막힘 2 (FeMn default markup 안내 부재)**: "기본값 적용"으로 국가/CN 기준 direct/total default 자동 로드는 양호하나, 공급사 미회신 시 적용하는 default의 markup(보수적 가산) 개념·안내가 0건. 적용연도 선택은 있으나 "2026 default엔 mark-up 포함" 같은 위계 설명 없음. 더 큰 문제: getDefaultValueTotalForYear(reference-workbooks.ts:373-386)가 `markup_2026 ?? total_default`를 반환(markup 있으면 markup값을 줌)인데 scenarios/page.tsx:470·502·537이 이를 "기본값 SEE"로만 표기 → markup이 "기본값"에 흡수돼 담당자는 markup이 얼마 붙는지·default와 다른 개념인지 화면에서 알 수 없음. 클라이언트가 직접 물은 "default 쓰면 markup 불이익 있나요"에 대한 가시화 부재.
- **막힘 3 (오발생 경고)**: "전구물질 소비량이 공정 생산량보다 큽니다" 경고가 정상 수율(yield<100%, 사내 조강 1,227,000 t > 제품 1,133,000 t)에도 오발생 → 불필요한 혼란/추적성 저하.
- 이중계상 확인: 합금철 자체 C함량(물질수지 투입측)과 상류 precursor SEE(별도 전가) 두 경로 분리 입력 — 혼동 없이 처리.
- ⚠️ 판정: **CONDITIONAL PASS** — data_mode·증빙강제·default 자동로드는 우수. MWh/t 환산 부재(P1)·markup 가시화 부재(P1)·소비량 경고 오발생(P1).

### 6/8 결과(Results) — 엔진 교차검증 핵심
**[11:45]** /results 진입. 실제 입력으로 calculation-engine.ts 실행(engine-crosscheck.mjs)하여 EU 공식 정답과 대조.

#### P1 (CN 72189911, EAF 제강+연주, output 2,234,000 t)
| 항목 | 앱 산정값 | 비고 |
|------|----------|------|
| direct_see (자체) | 0.07655 | |
| own_indirect_see | 0.58310 | 0.7 MWh/t × 0.833 = 0.5831 검증 일치 |
| precursor_see (d+i 합산) | 1.72034 | PP1~PP4 매입 + 사내 |
| **see_informational_total** | **2.37999** | EU 공식 정답 **2.37991** ✅ **일치** |
| see_cbam_basis | 1.79689 | ⚠️ 과대 (아래) |

#### P2 (CN 72191310, 압연+정정 시트, output 1,133,000 t)
| 항목 | 앱 산정값 | 비고 |
|------|----------|------|
| direct_see | 0.35503 | |
| own_indirect_see | 0.23872 | |
| precursor_see (d+i 합산) | 2.57736 | |
| **see_informational_total** | **3.17111** | EU 공식 정답 **3.17109** ✅ **일치** |
| see_cbam_basis | 2.93239 | ⚠️ 과대 (아래) |

- ✅ **정보성 총 SEE 엔진 정확도 PASS**: P1 2.37999 vs EU 2.37991, P2 3.17111 vs EU 3.17109 — 소수 5자리에서 일치. 전력 EF 'Mix' 0.833, 전구물질 PP1~PP4(탄소강괴/FeNi/FeCr/FeMn) 매입 SEE + 사내 P1→P2(조강 1,227,000 t) 전가가 모두 정확히 반영됨. 계산엔진의 정보성 총량 산정 로직은 신뢰 가능.
- ⚠️ **see_cbam_basis 과대계상 (P0 후보 — "확인 필요(IR 원문 대조)" 톤이되 EU 예제 자체가 근거)**: 철강은 Annex II direct-only인데 앱의 see_cbam_basis가 전구물질 INDIRECT까지 포함 → 인증서 기준 SEE가 **P1 +79.4%, P2 +103.7% 과대**. 규정상 direct-only 인증서 기준 = 자체 direct + 전구물질 direct(= EU SEE(direct) P1 1.00149 / P2 1.43961). 앱은 declarant용 SEE(direct)/SEE(indirect) 분해(전구물질 포함)를 직접 산출하지 않고 precursor를 direct+indirect 합산 단일 버킷(calculation-engine.ts 157-159 `precursor_see += p.see * p.share`)으로만 보유. 결과 표(results:201-205)의 "직접 SEE / 간접 SEE / 전구물질 SEE" 중 직접·간접은 *자사 공정분만*, 전구물질분(PP1~PP4 direct+elec)은 precursor_see 한 칸에 섞임. EU Communication Template은 SEE(direct, 전구물질 포함)·SEE(indirect, 전구물질 포함) 두 축 보고를 요구하는데 앱이 못 쪼갬 → declarant가 수입자에게 줄 direct/indirect 분해를 손으로 역산해야 함. actual 기반 SEE 산정의 핵심 산출물을 막음.
- 관찰(강점): results/page.tsx 132-159가 see_cbam_basis("CBAM 산정 기준")와 see_informational_total("내부 검토용 total")을 별도 카드 + 설명문(143-144 "철강 Annex II 품목은 최종제품 자체의 간접배출을 여기서 제외")으로 구분 → 두 SEE 혼동 위험을 상당히 낮춤. 다만 두 값의 *차액 = 인증서 산정에서 빠진 자사 전력 간접배출*이라는 연결고리는 명시 안 됨(P2). 또 calculateEmission(168)에서는 own_indirect_see=indirect_see라 코드 경로별 의미가 갈리는 잠재 혼동 존재.
- ❌ 판정: **정보성 총 SEE = PASS ✅ / 인증서 기준 SEE = FAIL ⚠️ (P0 — direct-only 기준에 전구물질 indirect 혼입, declarant용 direct/indirect 분해 부재)**

### 7/8 탄소가격(K-ETS) — 입력 동선 부재
**[12:30]** K-ETS 탄소가격 차감 입력처 탐색.
- 막힘: 시나리오의 K-ETS KRW 일부 지불·환율·증빙은 SEE 산정 화면(period/product/process/source-stream/precursor) 어디서도 입력 불가(carbon_price/KRW/exchange_rate grep 0건). ScenarioAssumptions(scenario-calculation.ts 10-24)는 certificate_price_eur(EUR)만 보유, 이미 납부한 탄소가격을 인증서 수량/비용에서 차감하는 경로 없음. 인증서비용 지표(196-204)는 `certificateQuantity * certificate_price_eur`로만 산출, carbon-price-paid 항 없음. 의뢰 핵심 질문("K-ETS 낸 게 CBAM에 반영되나")에 앱이 구조적으로 답을 못 줌(안내문에 "최종 declaration에서 별도 확인" 텍스트만 — scenarios:337, CERTIFICATE_INDICATOR_NOTICE:28).
- ❌ 판정: **FAIL (P0/P1) — 탄소가격 입력·차감·통화·환율·실효CP 지원 전무.** 담당 영역 밖일 수 있으나 첫 담당자가 "어디에 넣지"에서 막힘.

### 8/8 내보내기(Export)
**[12:50]** /export — EU Communication Template 내보내기 확인.
- 최종 정보성 총 SEE: P1 2.37999 / P2 3.17111 tCO2e/t goods 확인.
- 관찰(강점): 원본을 서버 전송 없이 브라우저에서만 처리(export:548·774-775). 공식 시트 구조·CN목록 검증(validateEuTemplateFile 843-867), 셀 반영 후 재검증(verifyExportCellWrites 1558-1588, 불일치 throw 1642-1647). **Summary_Products의 SEE 수식셀(I:J:K)은 덮어쓰지 않고 D/F/H 식별셀만 입력**(createSummaryProductCellWrites 1507-1541)해 공식 수식 보존 — I:J:K 덮어쓰기 카운트를 화면 노출(359-362·641-647). errorCount>0이면 다운로드 차단(canExportDraft 569, 게이트 297-331). default 사용 사유 공란·미검증 실측 경고(evaluateEuExportReadiness 543-559). B_EmInst 합계 vs D_Processes 직접배출 1% tolerance 교차검증(eu-template-export.ts 499-515).
- 막힘 1 (제품 분할 통과): outputLineSummary.needsOutputReview(463-470)·hasMixedAllocationBasis(472-479)를 'warning'(error 아님)으로만 처리 → canExportDraft=errorCount===0이라 분할 미정리(시트/봉강, 봉강 CN 72210010)여도 복사본 생성 차단 안 됨. 제품라인 미생성 시 createSummaryProductRows(1236-1266)가 공정 단위 fallback → CN별 분리 SEE 없이 한 줄로 export될 수 있음.
- 막힘 2 (전력 EF 위계 미점검): createProcessCellWrites(1058-1066)가 electricity_ef를 그대로 D_Processes로 전사. 0.4594를 넣어도 readiness/results 어디에도 "전력 EF 출처·위계 확인" 경고 없음 → 잘못된 EF가 조용히 산정·export.
- 막힘 3 (Excel 대조 허용오차 기준 부재): "Summary_Products I:J:K 공식 수식 결과를 Excel에서 재확인·차이 기록"(854-913·1061-1064, guide 88-90)은 양호하나 정상/이상 임계(tolerance) 제시가 없어 소수점 차이를 오류로 오인하거나 큰 차이를 넘길 위험(P2).
- ⚠️ 판정: **CONDITIONAL PASS** — Excel 위생(공식 수식 보존·재검증·서버 미전송)은 견고. 제품 분할 soft-warning(P1)·전력 EF 위계 미점검(P1)·대조 허용오차 기준 부재(P2). 단, declarant용 SEE(direct)/SEE(indirect) 분해 부재(6/8 P0)로 Communication Template의 핵심 보고축을 앱이 자동으로 채우지 못함.

---

## 세션 총평

이번 탐색 run에서 **앱 계산엔진의 정보성 총 SEE 산정 정확도는 신뢰 가능**함을 실제 입력 실행으로 확인했다. P1 2.37999 vs EU 공식 2.37991, P2 3.17111 vs EU 공식 3.17109로 소수 5자리 일치했고, 전력 EF 'Mix' 0.833 적용·전구물질 4종 매입 SEE 전가·사내 P1→P2 조강 전가가 모두 정확히 반영됐다. 앱 자체 검증 스위트 6종 PASS + 프로덕션 빌드 PASS도 확인했다. 추적성·증빙 강제·Annex II direct-only 자동판정·Excel 공식 수식 보존 등 사용성 강점도 분명하다.

다만 **인증서 기준 SEE(see_cbam_basis)는 그대로 신뢰하면 안 된다.** 철강은 Annex II direct-only인데 앱이 전구물질의 indirect까지 인증서 기준에 포함시켜 P1 +79.4%, P2 +103.7% 과대계상한다. 규정상 direct-only 인증서 기준은 자체 direct + 전구물질 direct(= EU SEE(direct) P1 1.00149 / P2 1.43961)여야 한다. 더 근본적으로, 앱은 EU Communication Template이 요구하는 **declarant용 SEE(direct)/SEE(indirect) [전구물질 포함] 두 축 분해를 직접 산출하지 못하고** precursor를 단일 합산 버킷으로 뭉갠다. 이는 "actual 기반 SEE를 EU 수입자에게 제출"하는 이번 의뢰의 핵심 산출물을 가로막는다. (이 두 항목은 EU 예제 자체가 근거이나, 최종 단정 전 IR 원문 대조 "확인 필요".)

이 외에 입력 단계의 P0/P1 함정이 다수 잔존한다: ①LNG 단위(t/Nm³)↔NCV↔EF 분모 정합성 경고 0건(2배 오차 미포착), ②물질수지 산출측 차감 입력 불가·tC→tCO2 미환산, ③전력 EF 위계(actual→residual→grid) 구분 출처필드 부재("한전 0.4594" 무경고 통과), ④precursor MWh/t→SEE 환산 도우미 부재, ⑤FeMn default markup이 "기본값"에 흡수돼 가시화 안 됨, ⑥K-ETS 탄소가격 입력·차감 동선 전무, ⑦제품(시트/봉강) 분할 미정리가 soft-warning으로 통과. 라이선스 게이트가 온보딩 카드보다 우선 노출되는 첫 진입 차단도 확인했다.

남는 우려: 클라이언트가 직접 물은 4대 질문(LNG 단위, 전력 EF 위계, FeMn default markup, K-ETS 차감)이 모두 앱에서 구조적으로 답이 막혀 있어, 컨설턴트의 수기 보정·별도 질의서(client-questions.md)가 필수다. 신규 발견 결함은 improvement-suggestions.md 참조.

### SEE 산출 요약 (P1 슬래브/조강 기준, EAF 제강+연주 CN 72189911)

| 항목 | 값 |
|------|-----|
| 직접배출(Direct, 자체) | 0.07655 tCO2e/t goods |
| 간접배출(Indirect, 자체 전력) | 0.58310 tCO2e/t goods |
| 전구물질(Precursor 기여, d+i 합산) | 1.72034 tCO2e/t goods |
| 인증서 산정 기준 SEE (see_cbam_basis) | 1.79689 tCO2e/t goods ⚠️ 과대(+79.4%, 전구물질 indirect 혼입) |
| 참고용 총 SEE (see_informational_total) | 2.37999 tCO2e/t goods (EU 공식 2.37991 ✅ 일치) |
| 기본값/벤치마크 대비 (해당 시) | EU SEE(direct) 1.00149 / SEE(indirect) 1.37842 — 앱은 이 declarant 분해 미산출 |
| 회귀 모드 합격 여부 (해당 시) | N/A (탐색 모드) |
| 신규 발견 결함 (improvement-suggestions.md 참조) | P0 다수 + P1/P2 다수 (입력·결과·Export·쉘 전 영역) |

### SEE 산출 요약 (P2 시트 기준, 압연+정정 CN 72191310)

| 항목 | 값 |
|------|-----|
| 직접배출(Direct, 자체) | 0.35503 tCO2e/t goods |
| 간접배출(Indirect, 자체 전력) | 0.23872 tCO2e/t goods |
| 전구물질(Precursor 기여, d+i 합산) | 2.57736 tCO2e/t goods |
| 인증서 산정 기준 SEE (see_cbam_basis) | 2.93239 tCO2e/t goods ⚠️ 과대(+103.7%, 전구물질 indirect 혼입) |
| 참고용 총 SEE (see_informational_total) | 3.17111 tCO2e/t goods (EU 공식 3.17109 ✅ 일치) |
| 기본값/벤치마크 대비 (해당 시) | EU SEE(direct) 1.43961 / SEE(indirect) 1.73148 — 앱은 이 declarant 분해 미산출 |
| 회귀 모드 합격 여부 (해당 시) | N/A (탐색 모드) |
| 신규 발견 결함 (improvement-suggestions.md 참조) | 상동 |

> 비Annex II: see_cbam_basis = direct + own indirect + eligible precursor.
> Annex II direct-only: see_cbam_basis = direct + eligible precursor (자체 전력 간접배출은 기준 SEE에서 제외, 보고/검토용으로 보존). **단, 본 앱은 전구물질 indirect까지 기준 SEE에 포함시켜 과대계상 — 확인 필요(IR 원문 대조) 후 수정 권고.**
> 참고용 총 SEE는 운영/워크북 비교용이며 인증서 기준 SEE와 동일시 금지.
---