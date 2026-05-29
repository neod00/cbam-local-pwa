-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Orgs & Users
create table orgs (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz default now()
);

create table user_profiles (
  id uuid primary key references auth.users(id),
  org_id uuid references orgs(id),
  role text check (role in ('ADMIN', 'EDITOR', 'VIEWER')),
  created_at timestamptz default now()
);

-- 2. Master Data
create table installations (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references orgs(id),
  name text not null,
  country text,
  boundary_json jsonb,
  created_at timestamptz default now()
);

create table products (
  id uuid primary key default uuid_generate_v4(),
  installation_id uuid references installations(id),
  hs_code text not null,
  hs_group text check (hs_group in ('72', '73')),
  product_type_enum text, -- HS72_PLATE_SHEET, etc.
  name text,
  unit text default 'tonne',
  created_at timestamptz default now()
);

-- 3. Periods & Precursors
create table periods (
  id uuid primary key default uuid_generate_v4(),
  installation_id uuid references installations(id),
  name text, -- e.g., "2024 Base"
  start_date date,
  end_date date,
  status text default 'DRAFT', -- DRAFT, READY, CALCULATED
  created_at timestamptz default now()
);

create table precursors (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id),
  precursor_name text,
  source_type text check (source_type in ('INTERNAL', 'EXTERNAL')),
  precursor_see numeric, -- tCO2e/t (if external)
  share_by_mass numeric, -- 0.0 ~ 1.0
  created_at timestamptz default now()
);

-- 4. Activity Data
create table activity_snapshots (
  id uuid primary key default uuid_generate_v4(),
  period_id uuid references periods(id),
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table activity_records (
  id uuid primary key default uuid_generate_v4(),
  snapshot_id uuid references activity_snapshots(id),
  product_id uuid references products(id),
  key text not null, -- output_mass_t, electricity_mwh, fuel_lng_tj
  value numeric,
  unit text,
  is_estimated boolean default false,
  reason text
);

-- 5. Calculation Engine
create table ef_versions (
  id uuid primary key default uuid_generate_v4(),
  name text,
  valid_from date,
  valid_to date,
  created_at timestamptz default now()
);

create table ef_factors (
  id uuid primary key default uuid_generate_v4(),
  ef_version_id uuid references ef_versions(id),
  ef_type text check (ef_type in ('ELECTRICITY', 'FUEL')),
  key text, -- e.g., KR_GRID_2023, LNG, LPG
  value numeric, -- tCO2e/unit
  unit text,
  region text,
  source text
);

create table calc_runs (
  id uuid primary key default uuid_generate_v4(),
  period_id uuid references periods(id),
  snapshot_id uuid references activity_snapshots(id),
  ef_version_id uuid references ef_versions(id),
  engine_version text,
  status text, -- PENDING, COMPLETED, FAILED
  created_at timestamptz default now()
);

create table results (
  id uuid primary key default uuid_generate_v4(),
  calc_run_id uuid references calc_runs(id),
  product_id uuid references products(id),
  direct_see numeric,
  indirect_see numeric,
  precursor_see numeric,
  total_see numeric,
  yield_ratio numeric,
  breakdown_json jsonb,
  warnings_json jsonb
);

-- 6. RLS (Simplified)
alter table orgs enable row level security;
alter table user_profiles enable row level security;
alter table installations enable row level security;
alter table products enable row level security;
alter table periods enable row level security;
alter table precursors enable row level security;
-- ... enable RLS for all others as needed

-- Policy example: Users can view their own org's installations
create policy "Users can view own org data" on installations
  for select using (
    org_id in (select org_id from user_profiles where id = auth.uid())
  );
