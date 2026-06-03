alter table license_users
    add column if not exists expires_at timestamptz;

alter table license_users
    alter column license_status set default 'UNREGISTERED';

create index if not exists license_users_expires_idx on license_users (expires_at);
