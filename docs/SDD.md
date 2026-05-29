# SDD — 시스템 설계(HS72/73 중소·중견 철강 산정 목적, 단순 구조)

## 1. 아키텍처(최소)
- Next.js(Web + API Routes) @ Vercel
- Supabase(Postgres/Auth/Storage/RLS)

## 2. 데이터 흐름(시퀀스)
1) 사용자가 기간 생성 + 제품(HS코드/제품군) 등록
2) precursor 입력(외부 SEE + 질량비)
3) 활동자료 업로드(전력/연료/출하량/투입량/스크랩)
4) API가 스냅샷(activity_snapshot) 생성
5) 계산 실행 → results 저장
6) Export 생성 → Storage 저장 → exports 메타 저장

## 3. 핵심 설계 포인트
### 3.1 재현성(버전 고정)
- results는 반드시 아래를 참조:
  - snapshot_id
  - ef_version_id
  - rules_version
  - engine_version
- 과거 규칙/계수 삭제 금지(비활성/아카이브)

### 3.2 Precursor 모델(단순 그래프)
- product ↔ precursor (share_by_mass)
- MVP는 depth 1~2만 허용(복잡도 폭증 방지)
- INTERNAL precursor 참조는 “동일 period 결과”만 허용

### 3.3 수율/스크랩(중소·중견 핵심)
- 제품 가공이 많아 수율이 결과에 크게 영향:
  - input_mass_t가 있으면 yield_ratio = input/output
  - 공정 배출(전력/연료)을 output 기준으로 환산(수율 반영)
- 스크랩은:
  - (A) 투입 스크랩(원재료) vs
  - (B) 공정에서 발생한 스크랩(손실/재사용)
  를 최소한 구분할 수 있게 key를 분리(선택)

## 4. API 설계(최소)
- POST /installations
- POST /products
- POST /periods
- POST /precursors
- POST /upload (excel/csv) -> 저장 + 파싱 + 검증 결과 반환(단순)
- POST /calculate?periodId=
- GET /results?periodId=
- POST /export?periodId= (엑셀/CSV)

## 5. RLS(테넌트 격리)
- 모든 테이블에 org_id(또는 installation→org 조인) 기반 정책
- Storage bucket도 org 단위 prefix로 구분

## 6. Export(내부 보고용)
- 결과표(제품별 SEE) + precursor 요약 + 주요 입력값 요약
- 파일 해시 저장(무결성)
- Export는 생성 시점 스냅샷/버전 메타를 포함(재현 링크)

## 7. 운영/확장(나중에)
- 업로드/계산이 무거워지면:
  - 비동기 큐(예: QStash)로 “업로드 파싱/Export” 분리 가능
- 공정 템플릿을 단계적으로 추가:
  - 도금/열처리/절삭/용접 등 공정별 key 세분화
