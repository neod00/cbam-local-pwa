# run13 usage-log draft
## 0 기준선 (01:54)
- 도구: Playwright chrome이 3회 기동 실패(exit 0xC0000005) 후 4번째에 정상. 고아 프로세스 없음.
- 지도: 6/6 · ①71.7 · ②1,632.1 · ③직접 12,122.6 간접 2,735.4 · ÷3,240 · 기준 3.764 · 확인 3건 · 공정 2개
- IDB: installations1 periods1 precursors2 processes2 lines4 products2 settings4 source_streams5
- 백업 00-baseline.cbam (.playwright-mcp/cbam-local-backup-20260918165453.cbam)
## A (01:55~)
- A1 /installations 무변경 저장: IDB diff 0. PASS
- A2 지도1 기간 수정 저장 + 패널 사업장 수정 저장: diff 0. PASS
- A3b 지도2 STS 수정 저장: diff 0 (product_type_enum HS73_FASTENER 유지, 문구 "CN을 그대로 두면 상세 입력에서 고른 제품군 설정이 유지됩니다."). 패널에는 탄소강 제품(비CBAM)이 목록에 없음.
- A4b 지도3: 탄소강 공정 수정 → 제품 칸에 STS만(값 빈칸), 1,860 t 라인 안 보임, 저장 시 "이 공정에서 만든 제품의 생산량을 1개 이상 입력하세요." 로 차단(데이터 손실 없음, 편집 불가). STS 공정 무변경 저장 → 라인 id 유지·숫자 유지, 그러나 라인명 "STS 나사 완제품 (전량 판매)"→제품명, 스크랩 라인명 "절단 스크랩·불량품 → 고철상 매각 (CN 7204)"→"활동수준 제외분 (불량·부산물·스크랩)", reporting_scope CBAM_GOOD→WASTE_RECYCLE, note ""→"지도 3단계 입력 …", manual_allocation_percent 100→0. 지도 3.764 유지.
- A3 /products 두 제품 무변경 저장: diff 0 PASS
- A4 /processes 두 공정 무변경 저장: 라인 id·배분·allocation_note·input_mode 유지. 변화: 탄소강 direct 1049.9665725→1049.9665725000002(부동소수, 화면 칸에도 꼬리 표시), direct_emissions_input_note 없음→"", 스크랩 라인 reporting_scope WASTE_RECYCLE→CBAM_GOOD(지도3 저장이 바꾼 것을 상세가 되돌림). 지도 불변.
- A5 /source-streams 5행: source_streams diff 0(shared_meter 유지). 지도4 패널 2행(보일러 탄소강 몫·경유 탄소강 몫) 저장: diff 0 PASS
- A6 지도5 두 공정 전력 저장: note 유지, 공정 전환 시 값 섞임 없음 PASS
- A7 /precursors 두 건: diff 0 PASS
- A7b 지도6 대만 와이어 무변경 저장(제품라인 1개 상태 — 배분 UI 안 나옴): output_allocations 통째로 사라짐(<absent>). 지도 3.764 유지(라인 1개라 자동=100%).
  → 이어서 /processes에서 STS 공정에 라인 추가(탄소강 제품 10 t, 포함) 저장: 지도 ①71.5 ②1,627.1 ③직접 12,102 기준 3.757. 배분이 남아 있던 국내 와이어는 2,910 그대로, 배분이 지워진 대만 와이어만 생산량 비율로 쪼개짐.
  → 제품 2개 상태에서 지도6 국내 와이어 수정: 「제품별 직접 입력」 0/2910 채워져 열림(run12의 빈칸 아님), 저장 후 output_allocations 유지. 대만 와이어는 「생산량 비율로 자동」 선택 상태로 열림.
- 02:03 00-baseline 복원
- A8 /report-inputs 문서번호 RUN13-MP-001 저장 → /scenarios·/processes 저장 후 재방문: 유지 (settings report:inputs) PASS
- A9 /scenarios 인증서 가격 75.36→80 (자동 저장) → STS 공정 수정 저장 → 80 유지 PASS
- C1 백업(01-C1-roundtrip.cbam) → 새 프로젝트(확인창 2개) → settings 5→3: reference:benchmarks 와 report:inputs 삭제됨. 확인창 문구는 "라이선스·EU 기본값(DV)·비용 가정은 유지"만 언급 — 벤치마크 삭제는 알리지 않음.
- C1 복원 후 IDB diff 0 (settings 5건 key 중복 없음, 라인 id·output_allocations·allocation_note 동일) PASS
- C2 복원 직후 STS 공정 수정 저장(diff 0) + 지도6 국내 와이어 수정 저장: 3.764 유지, 단 output_allocations 삭제(A7b와 동일 결함)
- 02:07 기준선 복원 → B1: /processes STS 공정에서 "STS 나사 완제품" 라인(3,240 t) 휴지통 → 수정 저장. 경고·확인 없음. 지도: 공정 2개 · 1,860 t, ①1,050 ②937 ③직접 0 · 간접 0, 7단계 기준 "—", 8단계 잠김. 7단계 문구 "구매 전구물질이 없습니다…"(실제로는 2건 존재).
  → 같은 공정에 라인 재입력(STS 3,240 t 포함) 저장: ①71.7 ②1,632.1 ③직접 0 · 간접 0 · 기준 0.022 · "확인 항목 3건" · 8단계 열림. run12 P0와 같은 증상이 '라인 삭제 후 재입력' 경로로 재현.
- 02:09 기준선 복원 → B2 /products 삭제: STS "연결된 생산공정: 1건 / 연결된 전구물질: 2건", 탄소강 "생산공정 1건 / 전구물질 0건" alert로 차단 PASS
- B4 /processes STS 공정 삭제: "연결된 전구물질: 2건 / 연결된 배출원 자료: 2건" 차단 PASS
- B3 지도1에서 2026년 연간 추가: 숫자 불변(3.764), 지도 7단계 "해결할 오류 1건", 8단계 "잠김". 7단계 문구 "보고기간이 2개입니다. 이 사본이 다룰 기간을 먼저 고르세요" — 어디서 고르는지 안 알려줌(실제 위치: 1단계 패널 「EU 문서에 나갈 기간」). /export에는 같은 오류만 있고 고르는 곳 없음.
  1단계에서 2026년 연간(자료 0건) 선택 → 지도 즉시 "기준 3.764 · 확인 항목 3건 · 8단계 열림", 머리글은 여전히 "2025년 연간". 8단계 패널 "2026년 연간 … 이 사본에는 위 기간만 담기며, 밖의 자료는 제외됩니다." 빈 기간 경고 없음.
  그 상태에서 /export: 여전히 "보고기간이 2개입니다 … 먼저 고르세요" 오류 1건, 패키지·복사본 버튼 disabled → /export는 1단계 선택을 읽지 않음.
  2026 삭제(confirm) 후 원상.
  2026 삭제 후(재로드 포함): 지도 7단계 "해결할 오류 1건", 8단계 "잠김". 7단계 문구 "고른 보고기간을 찾지 못했습니다. 1단계에서 보고기간을 다시 확인하세요." 1단계 패널에는 기간이 1개라 「EU 문서에 나갈 기간」 선택칸이 없음 → UI로 풀 방법 없음. settings export:reporting-period 가 삭제된 period id를 가리킨 채 남음.
## 중단 (02:14 이후)
- 세션 종료로 에이전트가 여기서 멈췄다. 수출 파일 점검(02-eu-copy.xlsx, 03-report.docx 열람)과 옛 run11 백업 가져오기는 하지 못했다.
- 이후 Playwright Chrome이 기동 직후 죽어(0xC0000005, 5회) 브라우저 재확인을 못 했다. 원장이 기준선으로 복원됐는지도 미확인이다. 마지막 로그 상태는 「2026 기간 삭제 후 8단계 잠김」이다.
- 수정 후 확인은 기준선 백업(00-baseline.cbam)을 엔진에 직접 넣어 했다: 기준선 3.7637 유지, 라인 삭제 후 재입력 시 0.0221 + 「지워진 생산라인」 경고 4건(종전 0건).
