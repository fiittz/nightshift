-- ═══════════════════════════════════════════════
-- TROVEK — Supabase Schema Setup
-- Run this in the SQL Editor at supabase.com
-- ═══════════════════════════════════════════════

-- Enable pgvector for knowledge base embeddings
create extension if not exists vector;

-- Companies
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  founder text,
  description text,
  website text,
  settings jsonb default '{}',
  created_at timestamptz default now()
);

-- Agents
create table agents (
  id text not null,
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  role text not null,
  department text,
  status text default 'idle',
  reports_to text,
  permissions jsonb default '{}',
  adapter_config jsonb default '{}',
  runtime_config jsonb default '{}',
  budget_limit_cents int default 5000,
  budget_spent_cents int default 0,
  total_tokens int default 0,
  total_runs int default 0,
  prompt text,
  created_at timestamptz default now(),
  last_active_at timestamptz,
  primary key (id, company_id)
);

-- Tasks (backlog)
create table tasks (
  id text not null,
  company_id uuid references companies(id) on delete cascade,
  title text not null,
  description text,
  type text default 'backend',
  domain text default 'general',
  priority text default 'medium',
  status text default 'todo',
  assignee text,
  branch text,
  review_file text,
  compliance_status text,
  security_status text,
  pr_url text,
  cycles int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (id, company_id)
);

-- Runs (execution history)
create table runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  agent_id text not null,
  task_key text,
  input_preview text,
  output_preview text,
  input_tokens int default 0,
  output_tokens int default 0,
  total_tokens int default 0,
  cost_cents int default 0,
  duration_ms int default 0,
  status text default 'completed',
  error text,
  created_at timestamptz default now()
);

-- Sessions (agent memory)
create table sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  agent_id text not null,
  task_key text not null,
  messages jsonb default '[]',
  updated_at timestamptz default now(),
  unique(company_id, agent_id, task_key)
);

-- Events (immutable log)
create table events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  agent_id text,
  type text not null,
  data jsonb default '{}',
  created_at timestamptz default now()
);

-- Connections
create table connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  category text not null,
  provider text not null,
  status text default 'disconnected',
  config jsonb default '{}',
  is_active boolean default false,
  created_at timestamptz default now()
);

-- Knowledge base
create table knowledge (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  title text not null,
  category text default 'general',
  content text,
  embedding vector(1536),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Schedules
create table schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  agent_id text not null,
  cron text not null,
  task text not null,
  enabled boolean default true,
  last_run_at timestamptz,
  created_at timestamptz default now()
);

-- Activity log
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  agent_id text,
  message text not null,
  created_at timestamptz default now()
);

-- Indexes
create index idx_agents_company on agents(company_id);
create index idx_agents_status on agents(company_id, status);
create index idx_tasks_company on tasks(company_id);
create index idx_tasks_status on tasks(company_id, status);
create index idx_runs_company on runs(company_id);
create index idx_runs_agent on runs(company_id, agent_id);
create index idx_events_company on events(company_id);
create index idx_events_type on events(company_id, type);
create index idx_activity_company on activity_log(company_id);

-- Enable RLS on all tables
alter table companies enable row level security;
alter table agents enable row level security;
alter table tasks enable row level security;
alter table runs enable row level security;
alter table sessions enable row level security;
alter table events enable row level security;
alter table connections enable row level security;
alter table knowledge enable row level security;
alter table schedules enable row level security;
alter table activity_log enable row level security;

-- For now, allow all access via service key (tighten later with auth)
create policy "Allow all" on companies for all using (true);
create policy "Allow all" on agents for all using (true);
create policy "Allow all" on tasks for all using (true);
create policy "Allow all" on runs for all using (true);
create policy "Allow all" on sessions for all using (true);
create policy "Allow all" on events for all using (true);
create policy "Allow all" on connections for all using (true);
create policy "Allow all" on knowledge for all using (true);
create policy "Allow all" on schedules for all using (true);
create policy "Allow all" on activity_log for all using (true);
