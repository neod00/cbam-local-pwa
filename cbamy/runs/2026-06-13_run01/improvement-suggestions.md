# 앱 개선 제안서 — run01 신규 발견 결함
**세션**: 2026-06-13 run01 | **담당**: 씨밤이 (CBAMY)
**대상 앱**: CBAM_Platform (products → processes → source-streams → precursors → periods → results → export)
**범위**: run01(동성특수강 EAF 스테인리스, 보고기간 2025, 단일 installation) 탐색 모드에서 새로 발견된 결함만 기재. 회귀 검증 결과는 usage-log.md 참조.
**기준 규정**: EU CBAM 규정 (EU)2023/956 및 이행규정(Implementing Regulation), 2026 확정기간(definitive period) 기준. 공식 기본값(Default Values)·벤치마크(Benchmarks)는 cbamy/data/cbam-defaults.json, 검증 KB는 cbamy/knowledge/cbam-verification-reference.md 참조.
**근거 수준**: 본 제안의 수치는 실제 앱 계산엔진(calculation-engine.ts)을 실입력으로 실행(engine-crosscheck.mjs)한 결과이며, EU 공식 'EAF alloys' 예제 워크북과의 대조로 입증됨(추측 아님). 앱 자체 검증 스위트 6종(verify:calculation/source-streams/scenarios/export/routes/dashboard) PASS + 프로덕션 빌드 PASS 상태에서 발견.

---

## 검증된 산정 일치 사실 (결함 판단의 전제)

엔진 크로스체크 결과 see_informational_total은 EU 공식 정답과 일치한다:

| 공정 | CN | output(t) | direct_see(자체) | own_indirect_see | precursor_see(d+i) | see_informational_total | EU 정답 | 판정 | see_cbam_basis |
|------|----|----------:|------:|------:|------:|------:|------:|:--:|------:|
| P1 (EAF 제강+연주) | 72189911 | 2,234,000 | 0.07655 | 0.58310 | 1.72034 | 2.37999 | 2.37991 | ✅ | 1.79689 |
| P2 (압연+정정 시트) | 72191310 | 1,133,000 | 0.35503 | 0.23872 | 2.57736 | 3.17111 | 3.17109 | ✅ | 2.93239 |

> 즉 **정보성 총량(total) SEE 산정 자체는 정확**하다. 결함은 (1) 인증서 기준 SEE(see_cbam_basis)의 규정 정합성, (2) declarant 보고용 direct/indirect 분해, (3) 데이터 입력·추적성 보조 기능에 집중된다.

---

## 신규 발견 결함

### P0 — 결정적 결함 (즉시 수정 필요)

> 기준: 내재배출량(SEE) 산정 차단 / CBAM 규정 위반 / 데이터 무결성 위반

#### P0-run01-01 | direct-only 품목의 인증서 기준 SEE(see_cbam_basis)에 전구물질 **간접(indirect)** 배출이 포함되어 인증서 의무 과대계상

**문제**:
철강(CN 72/73)은 Annex II상 **direct-only** 품목이다. 즉 인증서 산정 기준(see_cbam_basis)에는 자체+전구물질의 **직접(direct)** 배출만 들어가야 한다. 그러나 앱은 최종제품 자체의 전력 간접배출만 제외할 뿐, **전구물질(PP1~PP4 = 탄소강 강괴/FeNi/FeCr/FeMn)의 indirect 기여분은 그대로 see_cbam_basis에 합산**한다. precursor_see가 direct+indirect를 합친 단일 버킷(scalar)으로만 존재하기 때문이다(calculation-engine.ts 157-159 `for (const p of precursors){ precursor_see += p.see * p.share }`).

**영향**:
- 정량적: 규정상 direct-only 인증서 기준 SEE = 자체 direct + 전구물질 direct = EU 공식 SEE(direct) **P1 1.00149 / P2 1.43961**. 그러나 앱의 see_cbam_basis는 **P1 1.79689 / P2 2.93239** → 인증서 기준 SEE가 **P1 +79.4%, P2 +103.7% 과대계상**. 수입자가 이 값으로 CBAM 인증서를 산정하면 의무량이 약 1.8~2.0배로 부풀려진다.
- 정성적: EU Communication Template은 제품 SEE를 SEE(direct, 전구물질 포함) / SEE(indirect, 전구물질 포함) **두 축**으로 보고하나, 앱은 declarant 보고용 이 두 축을 산출하지 못함(precursor를 합쳐버려 컨설턴트가 손으로 역산해야 함). actual 기반 SEE 산정의 핵심 산출물 제공이 막힘. 결과 표(results/page.tsx 201-205)의 "직접 SEE / 간접 SEE / 전구물질 SEE" 컬럼에서 앞 두 칸은 자사 공정분만, 전구물질의 direct·indirect는 한 칸에 뒤섞임.

**제안**:
- 전구물질을 소비 시점에 **direct 기여분 / indirect 기여분으로 분리 보관**하여, ① 인증서 기준 SEE(direct-only 품목) = 자체 direct + 전구물질 direct, ② declarant 보고용 SEE(direct, 전구물질 포함) / SEE(indirect, 전구물질 포함) 두 축을 각각 산출할 것.
- Annex II direct-only 판정은 이미 자동 적용되고 있으므로(cbam-product-rules.ts 42-78, processes getSee 385-395), 동일 규칙을 **전구물질 indirect에도 확장**하면 됨.
- direct-only 처리의 규정 근거(Annex II 분류·예외 품목 CN 2601 12 00 등)는 IR 원문 대조로 최종 확인 필요. 단, 본 결함은 EU 공식 'EAF alloys' 예제의 SEE(direct) 값(P1 1.00149 / P2 1.43961) 자체가 근거이므로 방향성은 확실.

**우선순위**: P0 (인증서 의무 +79~104% 과대계상 → 수입자 비용·컴플라이언스 직접 영향, 핵심 산출물 차단)

---

#### P0-run01-02 | 전력 EF가 **출처유형(위계) 분류 없는 자유숫자 단일 필드** → CBAM 허용 위계 미반영·정당성 근거 미보존

**문제**:
전력 배출계수가 순수 number 단일 필드(local-db.ts 63 `electricity_ef_tco2e_per_mwh:number`, 기본값 0.47 하드코딩 processes 37). 클라이언트 가정 "한전 0.4594"를 그대로 덮어쓰면 끝이고, CBAM 전력 EF 위계(actual 계약 EF → residual mix → 국가 grid mix; EU 예제는 'Mix' 0.833)를 구분하는 출처유형(enum) 필드가 없음(`ef_source`/`source_type` grep 0건). EF 출처를 적을 source 텍스트 칸조차 전력에는 없음(source는 source-stream에만 존재). export 준비검증(eu-template-export.ts evaluateEuExportReadiness 334-572)과 source-stream 검증(246-332) 어디에도 전력 EF 위계 적정성 점검이 없어, 0.4594를 넣어도 results/export 어디에도 경고가 뜨지 않고 조용히 산정·전사됨(createProcessCellWrites 1058-1066이 값을 D_Processes로 그대로 전사).

**영향**:
- 정량적: EF는 own_indirect_see에 직결(검증: P1 0.7 MWh/t × Mix 0.833 = 0.5831). 0.4594를 잘못 적용하면 간접 SEE가 약 0.833/0.4594 ≈ 1.81배 어긋남 → total SEE 왜곡.
- 정성적: 초보 담당자가 어떤 위계의 EF를 써야 하는지, 0.4594가 허용되는지 판단할 도움말·검증이 전무. SEE 직결 수치인데 추적성·정당성 근거(어떤 위계·출처의 EF인지)를 남길 칸이 없어 검증 가능성(verifiability) 미충족.

**제안**:
- 전력 EF에 **출처유형 enum**(예: 계약기반 actual / residual mix / 국가 grid mix / 기타) + **출처 텍스트** 필드를 추가하고, 선택 위계에 맞는 허용성 안내·확인 경고를 노출할 것.
- CBAM 전력 EF 위계의 정확한 우선순위·허용 조건은 IR 원문 대조로 확인 필요(전환기/확정기간 요건 비혼용).

**우선순위**: P0 (간접 SEE 직결 수치의 정당성 근거·위계 미반영 → 잘못된 EF가 침묵 속에 산정·export됨)

---

#### P0-run01-03 | 연료 단위(t↔Nm³)와 NCV·EF 분모 정합성 검증 부재 → LNG 약 2배 오차가 침묵으로 통과

**문제**:
source stream 활동단위 드롭다운이 `t`, `Nm3`만 제공하고(source-streams/page.tsx 42, calc lib 31-43), 연료별 기본 NCV·NCV 참조표·자동환산이 전혀 없음(NCV/Nm3 도우미 코드 grep 0건). 계산식은 activity × NCV × EF / 1000인데, 단위↔NCV(GJ/단위)↔EF(tCO2e/단위) 분모 정합성을 점검하는 경고가 0건. export 검증(validateSourceStreamForEuExport eu-template-export.ts 295-302)도 활동단위가 t 또는 Nm3인지만 확인(둘 다 통과)할 뿐 표기-검침 불일치, NCV 단위(GJ/t vs GJ/Nm³) 정합성은 검증하지 않음.

**영향**:
- 정량적: 의뢰서 LNG는 "t"(약 164,000), 현장은 Nm³로 검침 → 둘은 약 2배 차이. 둘 중 무엇을 넣든 앱이 동일하게 받아 직접배출이 통째로 어긋남. seed 데이터(local-db.ts 579-586)부터 "Natural gas, 250 t, NCV 45, EF 73 tCO2e/단위"인데, EF 73이 GJ당이 아니라 단위(t)당으로 들어가면 73×45배가 곱해져 비정상값이 됨 — 초보가 EF tCO2e/GJ(예 0.0561)와 tCO2e/t를 구분할 단서가 없음.
- 정성적: 라벨 "배출계수(tCO2e/단위)"의 "단위"가 활동단위인지 에너지단위인지 모호. 씨밤이가 가장 경계하는 2배 오차를 앱이 잡지 못함 → 직접배출 산정 신뢰성 위반.

**제안**:
- 활동단위에 `GJ`(에너지 단위) 옵션을 추가하고, 연료별 기본 NCV·EF 참조표(IR Annex 기본값)를 제공할 것.
- **단위 ↔ NCV 분모 ↔ EF 분모 정합성 경고**(예: 활동단위 t인데 EF가 tCO2e/GJ면 NCV 곱셈 필요 여부 안내)를 추가. Nm³↔t 환산은 NCV·밀도 기반 도우미로 보조.
- LNG의 표준 NCV·밀도(t↔Nm³) 값은 임의 추정 금지, 공식 데이터셋/원본 워크북 참조로 처리(확인 필요).

**우선순위**: P0 (직접배출 약 2배 오차를 앱이 침묵으로 통과시킴 → 데이터 무결성)

---

#### P0-run01-04 | K-ETS 탄소가격(carbon price paid) 입력·차감·통화·환율·실효CP 지원 전무

**문제**:
src 전체에서 carbon_price/KRW/exchange_rate/실효 관련 입력 필드·계산이 0건. SEE 산정 화면(periods/products/processes/source-streams/precursors) 어디에도 K-ETS로 이미 낸 탄소가격을 입력할 칸이 없음. ScenarioAssumptions(scenario-calculation.ts 10-24)는 origin_country, default_value_year, cbam_factor, cscf, certificate_price_eur(EUR)만 보유하고, 인증서 비용 지표(196-204)는 `certificateQuantity * certificate_price_eur`로만 산출 — carbon-price-paid 차감 항이 없음. 안내문(scenarios/page.tsx 337, CERTIFICATE_INDICATOR_NOTICE 28행)은 "최종 declaration에서 별도 확인" 텍스트만 있음.

**영향**:
- 정량적: 클라이언트가 직접 물은 "K-ETS 낸 게 CBAM에 반영되나"에 앱이 구조적으로 답을 못 줌. KRW 단가·환율·정산비율을 입력해 실효 탄소부담을 추정할 자리가 없음.
- 정성적: 첫 담당자가 "탄소가격 차감을 어디 넣지?"에서 막힘 — 입력 동선 부재. (담당 영역 밖일 수 있으나 의뢰 핵심 질문에 직결.)

**제안**:
- 보고기간 또는 공정 단위에 **이미 납부한 탄소가격(통화·단가·환율 적용시점·증빙·무상할당 대비 유상부담 비율)** 입력 필드를 추가하고, 인증서 비용 지표에 차감 경로를 연결할 것.
- 무상할당분 vs 실제 유상부담분 구분, 증빙·환율 시점 규정은 IR 원문 대조로 확인 필요. 증빙 없으면 0으로 가정(시나리오 주석과 일치).

**우선순위**: P0 (의뢰 핵심 질문에 구조적으로 답 불가 — 컴플라이언스 산출물 차단)

---

### P1 — 중요 결함 (컨설턴트 실수 유발 가능)

> 기준: 실수 유발 / 컨설턴트 답답함 / 추적성·검증 가능성(traceability) 약화

#### P1-run01-01 | 물질수지 **산출측 차감**(음수) 미지원 + tC→tCO2(×44/12) 자동환산 없음 + source stream↔직접배출 미동기화

**문제**:
source-stream 활동량이 `Math.max(activity_data, 0)`로 음수를 차단 → 물질수지(mass balance)의 "산출측 차감"(조강·슬래그 C함량 등) 입력이 불가능(시나리오 §4.1의 산출측 차감 항목 입력 불가). 또한 탄소함량(tC) → CO2(tCO2, ×44/12) 자동환산이 없음. 게다가 source stream 합계는 직접배출량(direct_attributable_emissions_tco2e)을 **자동 갱신하지 않고** '델타 불일치 경고'에만 사용(processes 679-724) → 컨설턴트가 직접 수기 동기화해야 함.

**영향**:
- 정량적: 물질수지 방식의 산출측 차감(투입 C − 산출 C)을 반영 못 해 직접배출 과대. tC를 그대로 넣으면 44/12배 누락. (다만 합계↔직접배출 교차검증·"적용" 버튼은 제공되어 수기 동기화 자체는 가능 — processes 679-724.)
- 정성적: 컨설턴트가 물질수지를 손으로 풀어 단일 값으로 수기 입력해야 함 → 추적성·재현성 저하.

**제안**:
- source stream에 **산출측 차감(음수/차감 플래그)** 지원, **tC 입력 시 ×44/12 자동환산** 옵션, source stream 합계를 직접배출량에 **자동 동기화**(또는 명시적 1클릭 반영 + 미반영 경고 강화)를 도입할 것.

**우선순위**: P1 (물질수지 정식 입력 차단 → 직접배출 산정의 수기 의존·추적성 저하)

---

#### P1-run01-02 | "전구물질 소비량이 공정 생산량보다 큽니다" 경고가 정상 수율(yield<100%)에도 오발생

**문제**:
사내 조강(P1→P2 이송분) 1,227,000 t > P2 제품 1,133,000 t는 **정상 수율(yield<100%)**인데, 앱이 "전구물질 소비량이 공정 생산량보다 큽니다" 경고를 띄움. 압연 손실 등으로 투입 precursor가 산출 제품보다 많은 것은 당연한데 경고가 오발생.

**영향**:
- 정성적: 불필요한 혼란 유발, 정상 데이터에 경고가 떠 컨설턴트가 진짜 이상치 경고를 무시하게 만듦(경고 피로) → 추적성·신뢰성 저하.

**제안**:
- 경고 조건을 "소비량 > 생산량" 단순 비교에서 **수율을 감안한 임계**로 조정하거나, 정상 수율 범위(yield<100%)는 경고에서 제외할 것. 비정상으로 의심되는 극단치(예: 소비량 ≫ 생산량)만 경고.

**우선순위**: P1 (오발생 경고 → 경고 피로·추적성 저하)

---

#### P1-run01-03 | 매입 precursor 간접 SEE를 tCO2e/t로만 받고 MWh/t → tCO2e/t 환산 도우미 없음

**문제**:
전구물질 direct/indirect SEE 둘 다 tCO2e/t 자유숫자(precursors/page.tsx 652-654, local-db.ts 109-110 `indirect_see_tco2e_per_t`). 그러나 공급사가 흔히 제공하는 형식은 "전력 MWh/t"(시나리오 §3.2: PP2 FeNi elec 3.001 MWh·t 등). 이를 전력 EF로 곱해 tCO2e/t로 환산하는 도우미가 없고, 변환 안내·예시도 없음.

**영향**:
- 정량적: 초보가 MWh/t 값을 그대로 indirect SEE 칸(tCO2e/t)에 넣으면 전력 EF(예 0.833) 배만큼 어긋남.
- 정성적: 단위 라벨만 있고 변환 동선 부재 → 공급사 자료 형식과 입력 칸 간 불일치로 실수 유발.

**제안**:
- precursor indirect SEE에 **"MWh/t 입력 → 전력 EF 곱셈 → tCO2e/t" 환산 도우미**와 단위 안내를 추가할 것.

**우선순위**: P1 (공급사 자료 형식 불일치로 간접 SEE 오입력 위험)

---

#### P1-run01-04 | default 자동로드는 양호하나 **markup(보수적 가산)**이 "기본값"에 숨어 가시화 부재

**문제**:
"기본값 적용" 버튼이 국가/CN/연도 기준 direct/total default를 자동 로드(precursors applyDefaultValueFromReference 379-406)하고, data_mode 토글·사유 강제(303-305)·미검증 경고(539-554)도 양호. 그러나 `getDefaultValueTotalForYear`(reference-workbooks.ts 373-386)는 `markup_2026 ?? total_default`를 반환 — 즉 **markup이 있으면 markup 적용값을 주는데 화면 라벨은 그냥 "기본값 SEE"**로만 표기(scenarios/page.tsx 470·502·537). markup 개념·연도별 위계 안내가 0건이며, 기본값 미import 시 메시지(388)만 뜨고 어떤 공식 파일을 어디서 가져오는지 화면 내 직접 링크가 없음.

**영향**:
- 정량적: FeMn(중국, 공급사 미회신) default 사용 시 적용되는 연도별 markup 불이익을 담당자가 얼마인지·별개 개념인지 화면에서 알 수 없음 → markup 누락 또는 default와 혼동.
- 정성적: 클라이언트가 직접 물은 "default 쓰면 markup 불이익 있나요"에 화면이 답을 가시화하지 못함.

**제안**:
- default 적용 시 **순수 default와 markup을 별도 컬럼/툴팁으로 분리 표기**(예: "기본값 X + markup Y = 적용값 Z")하고, markup 개념·연도(2026/2027/2028) 위계 설명과 공식 파일 import 직접 링크를 추가할 것.
- markup 조항·적용 조건의 정확한 규정 근거는 IR 원문/웹 검색(markup 조항)으로 확인 필요. 수치는 cbamy/data/cbam-defaults.json 참조로만 인용.

**우선순위**: P1 (default+markup 혼동 → SEE 과소/과대 가산 위험, 추적성 저하)

---

#### P1-run01-05 | 제품별(시트/봉강) 생산라인 분할 미정리 시 산정을 막지 못함(soft warning) → 공정 단위 fallback export 위험

**문제**:
제품 생산라인(output line) 추가·질량/수동비율 배분 UI는 존재(processes 556-657)하고 라인 합계·차이·혼합배분 경고도 실시간 표시(630-649)하나, "공정 총생산량과 라인 합계 불일치"는 hard error가 아니라 "저장 가능하지만 확인 필요로 표시"(651-653). export readiness도 needsOutputReview·hasMixedAllocationBasis를 'warning'(error 아님)으로만 처리(eu-template-export.ts 463-479)하고 canExportDraft=errorCount===0(569)이라 분할 미정리여도 복사본 생성이 차단되지 않음. 수동비율 합계 100% 검증도 강제 아님.

**영향**:
- 정량적: 시나리오 §4.3처럼 P2 1,133,000 t를 시트/봉강(CN 72191310/72210010)으로 못 쪼갠 상태에서 라인을 안 만들면, createSummaryProductRows(1236-1266)가 **공정 단위로 fallback**해 CN별 분리 SEE 없이 한 줄로 export될 수 있음.
- 정성적: 초보가 경고를 무시하고 저장하면 제품별 SEE 배분이 어긋난 채 Export로 흘러감. "검토용" 배지는 있으나 분할 필요성을 능동적으로 끌어주는 흐름이 약함.

**제안**:
- 라인 합계 ≠ 공정 총생산량, 수동비율 합계 ≠ 100%인 경우를 **export 차단 error로 승격**(또는 최소한 CN이 둘 이상으로 갈리는 제품군에서는 분할을 강제)할 것.

**우선순위**: P1 (제품별 SEE 배분 오류가 export까지 그대로 전파)

---

#### P1-run01-06 | CN코드 ↔ 제품설명(분류 적정성) 의미 검증 부재 — 형식(8자리/목록존재)만 점검

**문제**:
products 검증(products 266-272, eu-template-export.ts 397-426)은 ① CN 8자리 길이 ② Parameters_CNCodes에 코드 존재 ③ EU goods 매핑 가능 여부만 확인. applyCnOption(329-337)은 적용 시 product_type_enum을 option.goodsCategory로 덮어쓰는데(336), 사용자가 입력한 제품명과 CN description이 실제 일치하는지 대조·경고가 없음. parseCnCodeOptions(767-815)는 description(C열)을 읽으면서도 results/scenarios 어디에도 노출하지 않음. CN만 맞으면 "산정 준비"(products 580)로 녹색 표시.

**영향**:
- 정량적: 시나리오 의뢰서 CN(72189911/72191310/72210010)이 304계 슬래브/시트/봉강 제품 설명과 실제 일치하는지 화면에서 검증 불가 → 잘못 받아쓴 CN이 그대로 통과.
- 정성적: 코드는 맞췄으나 제품 실체와 불일치해도 녹색 통과 → 분류 적정성 검토 신호 부재.

**제안**:
- CN 적용 시 **CN description(C열)을 화면에 노출**하고, 사용자 입력 제품명과 불일치 가능성이 있으면 "분류 적정성 확인" 경고를 표시할 것.

**우선순위**: P1 (CN-제품 불일치가 형식 검증을 통과 → 잘못된 분류로 SEE·인증서 산정)

---

### P2 — 개선 권고 (있으면 좋음)

> 기준: 결함은 아니나 처음 쓰는 신고자·컨설턴트의 경험 향상

#### P2-run01-01 | see_cbam_basis vs see_informational_total의 "차이=자사 전력 간접분"이 화면에서 약하게 설명됨
results/page.tsx 132-159가 두 값을 카드로 분리 비교(143-144행 설명 양호)하나, 두 값의 **차액이 곧 인증서 산정에서 빠진 자사 전력 간접배출**이라는 핵심 연결고리는 명시 안 됨 → 초보가 "왜 두 값이 다른가"를 숫자로 추적하기 어려움. 또한 calculateEmission(168행) 경로에서는 own_indirect_see=indirect_see라 두 값이 같아져 코드 경로별 의미가 갈리는 점이 잠재 혼동. → 차액의 의미를 한 줄로 명시 권고.

#### P2-run01-02 | K-ETS·source-stream 계수 라벨에 초보용 기본 가이드·근거 부족
source-stream의 oxidation/conversion/fossil/biomass fraction 4개가 0~1 숫자칸으로만 노출(source-streams 486-505). "연소연료는 보통 산화계수 1, 화석연료 화석비율 1" 같은 기본 가이드가 없어 초보가 언제 1 미만인지 모름(seed 기본 1/1/1/0은 합리적이나 화면 도움말엔 근거 없음). → 각 계수에 기본값 근거·예시 툴팁 권고.

#### P2-run01-03 | 보고기간 화면(periods)에 "다음 단계" 안내·상태(status) 변경 UI 부재
다른 화면은 ActionItemCard로 다음 작업을 안내하나 시작점 periods에는 없어 첫 담당자가 period→product→process 순서를 스스로 파악해야 함. status(DRAFT/READY/CALCULATED) 변경 UI도 없음(periods 55-65). → periods에 다음 단계 카드와 상태 진행 UI 추가 권고.

#### P2-run01-04 | 전문용어(SEE/precursor/source stream/Annex II/CSCF/SEFA) 풀이 장치가 앱 전체에 0개
용어집·툴팁(`abbr`/`title=`)이 없어 SEE가 Specific Embedded Emissions임을 풀어주는 곳이 없음. 핵심 워크플로 화면에서 호버/클릭으로 용어 해독 불가(AI 직원 정의 agent-definitions.ts 250·259는 admin 영역으로 분리). → 핵심 화면에 용어 툴팁/용어집 권고.

#### P2-run01-05 | EU 템플릿 수동 대조 시 허용 차이(tolerance) 기준 미제시
export/page.tsx 854-913·1061-1064, guide 88-90이 "Summary_Products I:J:K 공식 수식 결과를 Excel에서 재확인"하라 반복 안내(양호)하나, 어느 정도 차이를 정상/이상으로 볼지 임계가 없어 초보가 소수점 차이를 오류로 오인하거나 큰 차이를 넘길 수 있음. → 허용 tolerance(예: 내부 교차검증의 1%와 정합) 명시 권고.

---

## 디자인 결함 (D 태그)

> 기준: 시각·내비게이션·반응형·온보딩 UI. SEE 산정 자체와 별개의 사용성/디자인 마찰점.

#### D0-run01-01 | 첫 진입 화면(대시보드 `/`)이 라이선스 게이트에 막혀 온보딩 카드를 보기 전 잠김 화면을 만남
LICENSE_GATE_OPEN_ROUTES(free-license-client.ts 38-46)에 `/`(대시보드)가 미포함 → 승인 라이선스가 없으면 LicenseGate(24-46)가 locked로 판정해 page.tsx 182-224의 "무엇부터 하면 되나요?" 3단계 온보딩 카드를 못 보고 곧장 LockedLicensePanel을 본다. 게이트는 등록만으로 안 열리고 status가 FREE_ACTIVE/OFFLINE_ALLOWED/RECHECK_REQUIRED여야 함(canUseCoreApp 61-67) → 관리자 승인 전까지 사업장·품목·산정·Export 전부 차단(LicenseGate 87). 의뢰 마감이 급한 컨설팅 상황에서 "승인 대기"가 산정 착수를 차단.
- **제안**: 최소한 온보딩/가이드 카드는 게이트 전에 노출하거나, 잠김 화면에서도 다음 행동을 명확히 안내할 것.

#### D1-run01-01 | 모바일 하단탭(4개)에 핵심 입력 화면 진입로가 없어 모바일 워크플로 단절
mobileNavigation(Sidebar.tsx 72-77)이 홈/품목/결과/설정 4개뿐. 생산공정·배출원 자료·구매 전구물질·자료 업로드·시나리오·Export 직접 탭이 모바일엔 없고, lg 미만에선 좌측 aside가 hidden(84행). 모바일 사용자는 이 화면들에 하단탭으로 못 감(WorkflowRouteBanner "다음"으로 우회는 가능하나 임의 점프 불가).
- **제안**: 모바일 내비게이션에 핵심 입력 화면 진입로를 추가하거나 더보기 메뉴 제공.

#### D1-run01-02 | 대시보드 핵심 안내(12단계·자료 체크리스트·책임 고지)가 `<details>` 접힘 안에 숨음
page.tsx 377-488 "상세 가이드 펼치기" details 내부에 WorkflowGuideCard, 자료 준비 체크리스트(CN/생산량/연료/전력EF/전구물질 등 435행), 책임 고지("SEFA·인증서 지표는 검토용" 478-485)가 전부 들어 있어 기본 접힘 상태로는 능동적으로 펼치지 않으면 못 봄.
- **제안**: 첫 담당자에게 필수인 체크리스트·책임 고지는 기본 노출하거나 펼침 유도 신호를 강화.

#### D1-run01-03 | 진행상태 가시성이 "개수>0" 이분법이라 값 정합성(단위·EF·markup)을 못 잡음
beginnerSteps(page.tsx 160-180)가 레코드 존재 여부만 봄(installationCount>0 ? '완료'). LNG t/Nm³, 전력EF 0.4594 허용 여부, FeMn markup 적용 여부 같은 "값의 정합성"은 진행률에 미반영 → 잘못된 값으로도 "완료" 배지가 떠 진척 오인.
- **제안**: 진행상태에 값 정합성 경고 건수(Export 오류·scenarioRiskSummary)를 상단 배지에 반영.

#### D1-run01-04 | 사이드바 IA(22항목·5그룹)에 단계 완료/순서 신호 없음
navigationGroups(Sidebar.tsx 28-70)는 활성 링크 하이라이트만 있고 단계 완료·번호·순서 표시가 없음. 워크플로 순서는 workflow-guide.ts에만 존재. 처음 담당자가 "구매 전구물질"·"배출원 자료"가 순서상 어디인지 사이드바만으로 판단 곤란.
- **제안**: 사이드바에 단계 번호/완료 표시 또는 권장 순서 그룹핑.

#### D2-run01-01 | 알림(Bell) 버튼이 onClick 없는 장식 버튼
AppShell.tsx 71-77 `<button aria-label="알림">`에 핸들러 없음 → 클릭해도 반응 없어 "고장났나" 인상. → 기능 연결 또는 제거.

#### D2-run01-02 | 헤더 PeriodBadge가 하드코딩 단일 상수 + md/xl 이상에서만 표시
PeriodBadge.tsx 1·8-11 CURRENT_CBAM_PERIOD 상수를 그대로 표시 → `/periods`에서 등록한 실제 기간과 미연동. `hidden md:flex`(6)·`xl:inline`(9), "로컬 사업장" 칩도 `hidden md:flex`(AppShell 60) → 좁은 화면에서 보고기간 컨텍스트 소실. → 등록 기간과 연동 + 반응형 노출 개선.

#### D2-run01-03 | 라이선스 잠김 패널 1차 CTA 라벨이 상태별로 어긋남 + 갱신 2단계
LicenseGate.tsx 113 버튼 텍스트가 pending이면 "상태 확인하기"이나 링크는 모두 `/license`(110)로, license 페이지에서 다시 "상태 확인" 버튼을 눌러야 갱신됨(license/page.tsx 277, license_key 없으면 disabled) → 한 번에 갱신 안 되는 2단계. → 상태별 CTA를 갱신 액션과 직접 연결.

#### D2-run01-04 | 위험(빨강)/경고(주황)/대기(teal) 배지가 한 화면에 혼재해 우선순위 판단 어려움
ui.tsx 7-14 6톤 모두 연한 50계열 배경+ring. 대시보드 한 화면에 pending(teal)·warning(amber)·danger(red)·success(emerald)가 혼재(page.tsx 251-258·266-269). teal(pending)과 emerald(success)는 인접 색이라 색약·작은 화면에서 구분 약함. → 위계별 명도/형태 차별화.

#### D2-run01-05 | 라이선스 오프라인 폴백이 조용히 'OFFLINE_ALLOWED'로 전환 → 서버 접수 여부 불확실(추적성)
license/page.tsx 112-118 catch에서 서버 실패 시 createOfflineAllowedRegistration로 전환. license_key 미보유 시 빈 문자열 + status UNREGISTERED 유지(free-license-client.ts 223)면 게이트는 안 열림 → 담당자가 "등록했는데 왜 안 열리지"의 원인(서버 미접수)을 메시지로 구분 못 함. → 서버 미접수 상태를 명확히 구분 표기.

#### D2-run01-06 | "처음이라면 여기서 시작" 3단계가 가이드의 12단계와 라벨/순서가 달라 멘탈모델 분열
대시보드 beginnerSteps(page.tsx 155-180)는 3개("사업장/품목/배출량"), guide는 12단계 + 별도 3묶음("기본정보/배출자료/검토·전달", guide/page.tsx 16-37). 첫 화면·가이드·사이드바 세 곳의 단계 명칭이 제각각이라 동일 흐름임을 인지하기 어려움. → 단계 명칭·순서 통일.

---

## 분류 가이드 (작성 시 참고)

| 등급 | 본 run 적용 |
|------|------|
| **P0** | direct-only 품목 인증서 SEE에 전구물질 indirect 포함(+79~104% 과대), declarant SEE(direct)/SEE(indirect) 분해 미산출, 전력 EF 위계·정당성 미반영, 연료 단위↔NCV↔EF 정합성 부재(2배 오차), K-ETS 탄소가격 입력·차감 전무 |
| **P1** | 물질수지 산출측 차감·tC→tCO2 환산·source stream 동기화 부재, precursor 소비량>생산량 오경고, MWh/t→tCO2e/t 환산 도우미 부재, default+markup 가시화 부재, 제품별 분할 미강제, CN-제품설명 의미 검증 부재 |
| **P2** | see_cbam_basis 차액 설명 보강, 계수 라벨 가이드, periods 다음단계·상태 UI, 용어집, export tolerance 명시 |
| **D (디자인)** | D0: 온보딩 전 게이트 잠김 / D1: 모바일 내비·접힘 안내·진행상태 정합성·사이드바 순서 / D2: 장식 버튼·기간 배지·CTA·색위계·오프라인 폴백·단계 명칭 분열 |

**작성 원칙 준수**:
- 모든 SEE 수치는 엔진 크로스체크(engine-crosscheck.mjs) 실행 결과와 EU 공식 'EAF alloys' 예제 대조값만 사용. 새 SEE 값 임의 생성 없음.
- 규정 조항(Annex II direct-only 범위, 전력 EF 위계, markup 조항, K-ETS 차감 증빙)은 "IR 원문 대조로 확인 필요"로 표기, 단정하지 않음.
- 공식 기본값·벤치마크 수치는 cbamy/data/cbam-defaults.json 참조로만 처리.
- 전환기간(transitional period)과 2026 확정기간(definitive period) 요건 비혼용.