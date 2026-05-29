# FSD — 기능 명세서(HS72/73 철강 제품군 반영, 개발 착수 수준)

## 1. 사용자/권한
- ADMIN: 마스터/EF 버전/사용자
- EDITOR: 데이터 업로드/precursor 입력/계산 실행
- VIEWER: 결과 조회/Export 다운로드

## 2. 화면 IA(최소 7개)
1) Dashboard
2) Installations
3) Products(HS72/73 분류 + 제품군 템플릿)
4) Precursors(BOM/질량비)
5) Periods(기간)
6) Data Upload(템플릿 업로드/검증)
7) Compute & Results(결과/Export)

## 3. 기능 상세

### 3.1 Products — HS72/HS73 제품군 템플릿
#### 3.1.1 제품 생성 필드
- hs_group: 72 or 73 (필수)
- hs_code: 예) 7208, 7306, 7318 등 (필수)
- product_type_enum(필수):
  - HS72_PLATE_SHEET (7208/7209/7210/7211)
  - HS72_BAR_SECTION (7213/7214/7215)
  - HS72_WIRE (7217)
  - HS73_PIPE_TUBE (7303/7304/7305/7306)
  - HS73_STRUCTURE (7308)
  - HS73_TANK (7309/7310)
  - HS73_RAIL (7302)
  - HS73_FASTENER (7318)
  - HS73_OTHER (7326)
- name, unit(tonne)

#### 3.1.2 템플릿 매핑 규칙(필수 입력 키)
- 공통 필수:
  - output_mass_t (출하량/생산량)
  - electricity_mwh
- 조건부 필수:
  - fuel_* (연료 사용이 있는 경우)
  - input_mass_t (투입량/수율 관리 시)
  - scrap_t (EAF/재용해/가공 스크랩이 중요한 경우)
  - process_steps (선택: 도금/열처리/용접 등 공정 구분 라벨)

### 3.2 Precursors — 복합재/구매재 SEE 합산
- precursor 추가 방식 2가지:
  1) EXTERNAL: precursor_name + precursor_see + share_by_mass 입력
  2) INTERNAL(선택): 내부 제품 result를 precursor로 선택(같은 기간 결과 참조)
- 검증:
  - share_by_mass 합계 > 1.0이면 경고(설정에 따라 차단 가능)
  - precursor_see 미입력 시 계산 불가(또는 추정치로 표시)

### 3.3 Periods — 기간 관리
- 기본: 12개월 기간 생성(start/end)
- 상태: DRAFT → READY(데이터완료) → CALCULATED
- 동일 기간의 재계산은 snapshot/version으로 구분

### 3.4 Data Upload — 엑셀 업로드/검증
#### 3.4.1 업로드 템플릿(권장 1개)
- Sheet CONFIG: installation, period, product list(HS코드 포함)
- Sheet ACTIVITY: key/value/unit 형태(제품별)
- Sheet PRECURSOR: product_id, precursor_name, precursor_see, share_by_mass
- Sheet FACTORS(선택): electricity_ef, fuel_ef override

#### 3.4.2 검증 리포트 항목
- 필수값 누락(출하량/전력)
- 단위 오류/음수
- 수율 이상치(투입/출하가 입력된 경우)
- precursor 질량비 합계 경고
- 전력 과다/과소(출하량 대비 MWh/t 이상치)

### 3.5 Compute & Results — 산정/결과
#### 3.5.1 계산 버튼 동작
- activity_snapshot 생성 → calc_run 생성 → 결과 저장
- 결과 필드:
  - direct_see, indirect_see, precursor_see, total_see (tCO2e/t)
  - yield_ratio(있으면)
  - breakdown_json(기여도 Top N)
  - warnings_json

#### 3.5.2 결과 화면
- 제품별 표(HS코드/제품군/SEE)
- 기여도(전력/연료/precursor 상위 항목)
- 경고 리스트(데이터 품질/이상치)
- Export 다운로드(엑셀/CSV)

## 4. 수용 기준(Definition of Done)
- HS72/HS73 제품군으로 제품 등록 가능
- precursor 합산 포함 Total SEE 산정 가능
- 업로드 검증 리포트 제공(최소 5종 경고)
- 결과가 스냅샷/EF/룰 버전으로 재현 가능
