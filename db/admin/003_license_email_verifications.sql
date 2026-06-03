create table if not exists license_email_verifications (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    code_hash text not null,
    purpose text not null default 'license_recovery'
        check (purpose in ('license_recovery', 'license_registration')),
    expires_at timestamptz not null,
    consumed_at timestamptz,
    attempt_count integer not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists license_email_verifications_email_idx
    on license_email_verifications (email);

create index if not exists license_email_verifications_active_idx
    on license_email_verifications (email, purpose, expires_at)
    where consumed_at is null;
