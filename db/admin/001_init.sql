create extension if not exists pgcrypto;

create table if not exists license_users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    company_name text not null,
    contact_name text,
    contact_phone text,
    country text,
    industry text,
    license_key text not null unique default encode(gen_random_bytes(24), 'hex'),
    license_status text not null default 'UNREGISTERED'
        check (license_status in ('UNREGISTERED', 'FREE_ACTIVE', 'OFFLINE_ALLOWED', 'RECHECK_REQUIRED', 'BLOCKED')),
    expires_at timestamptz,
    accepted_terms_version text,
    accepted_terms_at timestamptz,
    last_license_check_at timestamptz,
    last_app_version text,
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists update_manifests (
    id uuid primary key default gen_random_uuid(),
    latest_version text not null,
    minimum_supported_version text not null,
    update_policy text not null default 'none'
        check (update_policy in ('none', 'optional', 'recommended', 'required')),
    notice_title text,
    notice_body text,
    release_notes_url text,
    effective_from timestamptz,
    target_audience text not null default 'all',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists announcements (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    body text not null,
    severity text not null default 'info'
        check (severity in ('info', 'warning', 'critical')),
    target_audience text not null default 'all',
    starts_at timestamptz,
    ends_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists terms_versions (
    id uuid primary key default gen_random_uuid(),
    version text not null unique,
    title text not null,
    body_url text,
    effective_from timestamptz,
    is_required boolean not null default true,
    created_at timestamptz not null default now()
);

create index if not exists license_users_status_idx on license_users (license_status);
create index if not exists license_users_expires_idx on license_users (expires_at);
create index if not exists license_users_archived_idx on license_users (archived_at);
create index if not exists update_manifests_effective_idx on update_manifests (effective_from desc);
create index if not exists announcements_window_idx on announcements (starts_at, ends_at);
create index if not exists terms_versions_effective_idx on terms_versions (effective_from desc);
