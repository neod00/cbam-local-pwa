# TRD — (Vercel + Supabase) 기반 최소 기술 요구사항 (HS72/73 철강 산정 중심)

## 1. 목표 기술 원칙
- 단순 운영: 템플릿 업로드 중심(중소·중견 환경)
- 재현성: 결과는 입력/EF/규칙 버전으로 재현 가능
- 확장성: 제품군(HS)과 공정 템플릿 추가가 쉬워야 함

## 2. 권장 스택(최소)
- GitHub: 소스/버전관리
- Vercel(Free): Next.js(웹 + API Routes)
- Supabase(Free):
  - Postgres(DB)
  - Auth(로그인)
  - Storage(업로드 원본/Export 파일)
  - RLS(org_id 기반 격리)

## 3. 데이터 모델(최소 ERD 개념)
### 3.1 테이블(핵심만)
- orgs(id, name)
- users(id, org_id, role)
- installations(id, org_id, name, country, boundary_json)
- products(id, installation_id, hs_code, hs_group(72|73), product_type_enum, name, unit)
- periods(id, installation_id, start_date, end_date, status)
- precursors(id, product_id, precursor_name, source_type(INTERNAL|EXTERNAL), precursor_see, share_by_mass)
- activity_snapshots(id, period_id, created_at, created_by)
- activity_records(id, snapshot_id, product_id, key, value, unit, is_estimated, reason)
- ef_versions(id, name, valid_from, valid_to)
- ef_factors(id, ef_version_id, ef_type(ELECTRICITY|FUEL), key, value, unit, region, source)
- calc_runs(id, period_id, snapshot_id, ef_version_id, rules_version, engine_version, status)
- results(id, calc_run_id, product_id, direct_see, indirect_see, precursor_see, total_see, yield_ratio, breakdown_json, warnings_json)
- exports(id, period_id, calc_run_id, file_uri, file_hash, created_at)

## 4. 입력/템플릿 처리
- 업로드: Excel/CSV 1~2개 템플릿으로 시작
- 파싱/검증:
  - 필수값: 생산량, 전력, (해당 시) 스크랩/투입량, precursor 질량비
  - 단위검증: t, MWh, GJ 등
  - 수율검증: 투입량 대비 출하량(비정상치 경고)

## 5. 산정 엔진(최소 구현 요구)
- Direct = Σ(연료 사용량 × 연료 EF) / 출하량
- Indirect = (전력 MWh × 전력 EF) / 출하량
- Precursor = Σ(precursor SEE × 질량비)
- Total SEE = Direct + Indirect + Precursor
- yield_ratio(선택): 투입량/출하량이 있으면, 공정 배출을 출하량 기준으로 환산 시 수율 반영

## 6. 제품군(HS) 템플릿 확장 방식
- product_type_enum 기반으로 “필수 입력 키 목록”을 결정:
  - HS72 판재/봉형강/선재
  - HS73 파이프/구조물/탱크/철도/체결부품/기타가공
- 템플릿 추가 시: (1) 필수키 정의 (2) 검증룰 정의 (3) 결과 breakdown 라벨 정의

## 7. 보안/권한(최소)
- RBAC: ADMIN/EDITOR/VIEWER
- RLS: org_id로 완전 격리
- Storage 접근도 org_id 범위로 제한
