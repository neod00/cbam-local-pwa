alter table license_users
add column if not exists archived_at timestamptz;

create index if not exists license_users_archived_idx on license_users (archived_at);
