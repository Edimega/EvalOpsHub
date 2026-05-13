create extension if not exists pgcrypto;

create type member_role as enum ('owner', 'admin', 'member', 'viewer');
create type evaluation_type as enum ('exact_match', 'json_schema', 'rubric', 'security', 'tool_call', 'manual');
create type run_status as enum ('queued', 'running', 'completed', 'failed');
create type alert_status as enum ('open', 'acknowledged', 'resolved');
create type api_scope as enum ('evaluations:run', 'results:read', 'traces:write');

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_idx on users (lower(email));

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions(user_id);
create index sessions_token_idx on sessions(token_hash);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  regression_threshold numeric(5, 2) not null default 0.05,
  latency_budget_ms integer not null default 5000,
  daily_cost_budget_cents integer not null default 10000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on workspace_members(user_id);

create table datasets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index datasets_workspace_slug_idx on datasets(workspace_id, slug);
create index datasets_workspace_idx on datasets(workspace_id);

create table test_cases (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  input text not null,
  context text not null default '',
  expected_output text not null,
  evaluation_type evaluation_type not null default 'exact_match',
  criteria jsonb not null default '{}'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  difficulty text not null default 'medium',
  category text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index test_cases_dataset_idx on test_cases(dataset_id);

create table prompt_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  author_id uuid not null references users(id),
  name text not null,
  version integer not null,
  template text not null,
  variables jsonb not null default '[]'::jsonb,
  model_provider text not null default 'openai',
  model text not null,
  temperature numeric(3, 2) not null default 0.20,
  tools jsonb not null default '[]'::jsonb,
  notes text not null default '',
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index prompt_versions_workspace_name_version_idx on prompt_versions(workspace_id, name, version);
create index prompt_versions_workspace_idx on prompt_versions(workspace_id);

create table evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  dataset_id uuid not null references datasets(id),
  prompt_version_id uuid not null references prompt_versions(id),
  baseline_run_id uuid,
  status run_status not null default 'queued',
  score numeric(6, 4),
  baseline_score numeric(6, 4),
  regression_detected boolean not null default false,
  cost_cents integer not null default 0,
  latency_ms integer not null default 0,
  error_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index evaluation_runs_workspace_idx on evaluation_runs(workspace_id);
create index evaluation_runs_dataset_idx on evaluation_runs(dataset_id);

create table evaluation_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references evaluation_runs(id) on delete cascade,
  test_case_id uuid not null references test_cases(id),
  actual_output text not null,
  passed boolean not null,
  score numeric(6, 4) not null,
  latency_ms integer not null default 0,
  cost_cents integer not null default 0,
  error text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index evaluation_results_run_idx on evaluation_results(run_id);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  run_id uuid references evaluation_runs(id) on delete cascade,
  type text not null,
  severity text not null default 'medium',
  status alert_status not null default 'open',
  title text not null,
  description text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index alerts_workspace_idx on alerts(workspace_id);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  prefix text not null,
  scopes api_scope[] not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_keys_workspace_idx on api_keys(workspace_id);

create table llm_traces (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  request_id text not null,
  prompt_version_id uuid references prompt_versions(id),
  model text not null,
  tokens_input integer not null default 0,
  tokens_output integer not null default 0,
  cost_cents integer not null default 0,
  latency_ms integer not null default 0,
  error text,
  tool_calls jsonb not null default '[]'::jsonb,
  output text not null default '',
  feedback text,
  created_at timestamptz not null default now()
);
create index llm_traces_workspace_idx on llm_traces(workspace_id);
create index llm_traces_request_idx on llm_traces(request_id);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
