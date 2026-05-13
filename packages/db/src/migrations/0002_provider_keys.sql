create table provider_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,
  name text not null,
  key_preview text not null,
  encrypted_key text not null,
  base_url text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index provider_keys_workspace_provider_idx on provider_keys(workspace_id, provider);
create unique index provider_keys_active_provider_idx on provider_keys(workspace_id, provider) where revoked_at is null;
