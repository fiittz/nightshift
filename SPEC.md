# Trovek — Technical Spec

## Architecture (from Dify + OpenHands + n8n research)

### Agent Execution (from OpenHands)
- Action → Execution → Observation pattern
- Every agent call produces structured result with exit code, output, errors
- Event-sourced: immutable event log, replay capability
- Workspace abstraction: local/Docker/SSH all use same interface

### Workflow Engine (from Dify)
- BaseAgentRunner class manages execution, tools, callbacks, memory
- Graph-based DAG execution with task queue
- Up to 10 parallel branches
- Node types: LLM, Tool, Code, HTTP, Agent

### LLM Providers (from Dify)
- YAML-configured providers, not hardcoded
- Unified abstraction: credentials, token counting, streaming, retries
- Provider interface: list models, authenticate, execute

### Knowledge Base (from Dify)
- Pipeline: parse → chunk → embed → store
- pgvector for embeddings in Supabase
- Hybrid search: vector + keyword
- Metadata filtering

### Flow Editor (from n8n)
- Canvas with grid snapping
- Drag output→input connections
- Double-click node = config modal
- Status icons during execution
- Composable: separate mutations, transforms, rendering

## Database Schema (Supabase)

```sql
-- Companies
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  founder text,
  settings jsonb default '{}',
  created_at timestamptz default now()
);

-- Agents
create table agents (
  id text primary key,
  company_id uuid references companies(id),
  name text not null,
  role text not null,
  department text,
  status text default 'idle',
  reports_to text references agents(id),
  permissions jsonb default '{}',
  adapter_config jsonb default '{}',
  runtime_config jsonb default '{}',
  budget_limit_cents int default 5000,
  budget_spent_cents int default 0,
  total_tokens int default 0,
  total_runs int default 0,
  prompt_file text,
  created_at timestamptz default now(),
  last_active_at timestamptz
);

-- Tasks (backlog)
create table tasks (
  id text primary key,
  company_id uuid references companies(id),
  title text not null,
  description text,
  type text default 'backend',
  domain text default 'general',
  priority text default 'medium',
  status text default 'todo',
  assignee text references agents(id),
  branch text,
  review_file text,
  compliance_status text,
  security_status text,
  pr_url text,
  cycles int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Runs (execution history)
create table runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  agent_id text references agents(id),
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
  company_id uuid references companies(id),
  agent_id text references agents(id),
  task_key text,
  messages jsonb default '[]',
  updated_at timestamptz default now(),
  unique(agent_id, task_key)
);

-- Events (immutable event log)
create table events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  agent_id text,
  type text not null,
  data jsonb default '{}',
  created_at timestamptz default now()
);

-- Connections
create table connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  category text not null,
  provider text not null,
  status text default 'disconnected',
  config jsonb default '{}',
  is_active boolean default false,
  created_at timestamptz default now()
);

-- Knowledge
create table knowledge (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
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
  company_id uuid references companies(id),
  name text not null,
  agent_id text references agents(id),
  cron text not null,
  task text not null,
  enabled boolean default true,
  last_run_at timestamptz,
  created_at timestamptz default now()
);

-- Activity log
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  agent_id text,
  message text not null,
  created_at timestamptz default now()
);
```

## Stack
- Frontend: React or vanilla (current) → migrate to React later
- Backend: Supabase (Postgres + Edge Functions + Realtime)
- Execution: Node.js conductor with Action/Observation pattern
- LLM: OpenAI-compatible API (any provider via config)
- Vector: Supabase pgvector
- Auth: Supabase Auth (when multi-user)
- Realtime: Supabase Realtime subscriptions for live dashboard
