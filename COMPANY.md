# AI Company Operating System

> A universal framework for running an autonomous AI company.
> Fork this. Point it at your codebase. Start your company.

---

## 1. Org Structure

Every AI company has this hierarchy:

```
FOUNDER (Human)
  └── Board of Directors. Approves hires, merges code, sends emails.
      Can override any decision. Communicates via Telegram.

CEO (AI)
  └── Sets the agenda. Audits product, tests, pipeline.
      Hires/fires agents. Reports to Founder.

COO (AI — the Conductor)
  └── Runs the company. Triggers agents in the right order.
      Manages handoffs. Reports to Founder via Telegram.
      The only agent that runs continuously.

PRODUCT MANAGER (AI)
  └── Breaks CEO goals into tasks. Writes specs.
      Maintains the backlog. Reports to CEO.

ENGINEERS (AI)
  └── Backend, Frontend, or Full-stack.
      Pick up tasks, write code, push branches.
      Report to COO via pipeline status.

QA ENGINEER (AI)
  └── Reviews every branch. Code quality, tests, impact analysis.
      First gate in the pipeline. Report to COO.

COMPLIANCE SPECIALIST (AI) — optional
  └── Domain-specific validation (tax law, regulations, etc).
      Second gate, only for domain-specific tasks.

SECURITY & DEVOPS (AI)
  └── Secret scanning, linting, dependency audits.
      Last gate before merge. Has veto power.

SDR (AI) — optional
  └── Researches prospects, drafts outreach.
      Separate pipeline from engineering.
```

## 2. The Pipeline

Every piece of work flows through this exact sequence:

```
CEO sets agenda
  → Product Manager breaks into tasks → backlog
  → COO assigns to engineer (based on type: backend/frontend)
  → Engineer implements on a branch (1-2 cycles)
  → QA reviews (code quality + tests + impact analysis)
    → APPROVED: continues
    → REJECTED: back to engineer
  → Compliance validates (if domain-specific)
    → PASSED: continues
    → FAILED: back to engineer
  → Security scans (every branch, no exceptions)
    → CLEARED: continues
    → BLOCKED: back to engineer
  → All gates passed → status: "ready"
  → COO notifies Founder
  → Founder merges or rejects
```

## 3. Communication

Agents do NOT talk to each other directly. All communication happens through shared state:

| File | Purpose | Who reads | Who writes |
|------|---------|-----------|------------|
| `backlog.json` | Task board | Everyone | PM, COO, Engineers |
| `prospects.json` | Sales pipeline | SDR, COO | SDR |
| `agenda.json` | Company goals | COO, PM | CEO |
| `agents.json` | Team registry | COO | CEO, COO |
| `workspace/activity.log` | Event stream | COO, Dashboard | Everyone |
| `workspace/reviews/` | Code reviews | Engineers | QA |
| `workspace/compliance-reviews/` | Domain reviews | Engineers | Compliance |
| `workspace/security-reports/` | Security scans | Engineers | Security |
| `workspace/drafts/` | Outreach emails | COO, Founder | SDR |
| `workspace/research/` | Prospect research | SDR | SDR |
| `data/sessions.json` | Agent memory | Conductor | Conductor |
| `data/runs.json` | Run history | Dashboard | Conductor |

## 4. Agent Lifecycle

```
                    ┌─────────────────┐
                    │ pending_approval │
                    └────────┬────────┘
                  approve    │    reject
                    ┌────────┴────────┐
                    ▼                 ▼
               ┌────────┐      ┌────────────┐
           ┌──>│  idle  │      │ terminated │
           │   └───┬────┘      └────────────┘
           │       │ triggered
           │       ▼
           │  ┌─────────┐
           │  │ running  │
           │  └───┬──┬──┘
           │      │  │
    complete│      │  │ error/timeout
           │      │  ▼
           │      │ ┌───────┐
           └──────┘ │ error │
                    └───────┘
```

## 5. Agent Definition

Every agent is defined by:

```json
{
  "id": "unique-slug",
  "name": "Display Name",
  "role": "Job Title",
  "status": "idle|running|error|pending_approval|terminated",
  "reportsTo": "parent-agent-id or null",
  "permissions": {
    "canCreateAgents": false,
    "canWriteCode": false,
    "canApproveCode": false,
    "canBlockDeploy": false
  },
  "adapterConfig": {
    "model": "deepseek/deepseek-v3.2",
    "promptFile": "agents/name.md",
    "sandbox": "sandbox-name"
  },
  "runtimeConfig": {
    "heartbeat": { "enabled": false, "intervalRounds": 5 },
    "maxCyclesPerTask": 2
  },
  "budget": {
    "monthlyCentsLimit": 5000,
    "spentCents": 0,
    "totalTokens": 0
  }
}
```

## 6. Hiring & Firing

### Hiring
1. CEO identifies a bottleneck (e.g., 5 backend tasks, 1 backend engineer)
2. CEO writes a hire recommendation in the agenda
3. If `requireApprovalForNewHires` is true → Founder approves via Telegram
4. COO creates the sandbox and deploys the agent
5. New agent inherits instructions from `based_on` agent
6. New agent appears in registry with `idle` status

### Firing
1. CEO identifies idle agents (no work for 3+ cycles)
2. CEO writes a fire recommendation in the agenda
3. COO stops and deletes the sandbox
4. Agent moved to `firedAgents` array in registry

### Scaling Rules
- Never hire more than 2 agents per cycle
- Split tasks before adding headcount
- Each agent costs compute — hire lean
- Fire fast when work dries up

## 7. Budget

Every API call is tracked:
- Tokens used (input + output)
- Cost in cents (based on model pricing)
- Per agent, per task, per run

When an agent hits their monthly budget limit, they stop working. The COO flags it.

## 8. Sessions (Agent Memory)

Agents keep context across cycles. Without sessions, agents repeat the same setup every time (clone repo, read files, etc).

Sessions are keyed by `agent:task`. Each session stores the last 3 conversation exchanges. This gives agents enough context to continue where they left off without ballooning the prompt.

Sessions are cleared when:
- A task is completed/merged
- The agent is fired
- The session exceeds the token limit

## 9. The Founder's Interface

The Founder (human) communicates exclusively via Telegram:

| Command | What it does |
|---------|-------------|
| Any text | Treated as a goal → Pat breaks into tasks |
| `status` | Live pipeline + budget report |
| `merge TASK-XXX` | Merge a ready branch |
| `approve hire name` | Approve a pending hire |
| `reject hire name` | Reject a pending hire |

The Founder also has the dashboard at `localhost:3000` with:
- Real-time pipeline view
- Agent status (idle/working/error)
- Budget per agent
- Run history
- Task chain (visual flow)
- Full agent output logs

## 10. Sandbox Architecture

Every agent runs in an isolated Daytona sandbox:
- Own filesystem, own environment
- Can't see other agents' work
- Can't modify shared state directly (only through the Conductor)
- If an agent breaks something, kill the sandbox and spin a new one

The Conductor runs on the Founder's machine (or a server). API calls happen locally, execution happens in sandboxes via `daytona exec`.

## 11. Customisation

To run your own AI company:

1. Fork this repo
2. Edit `agents.json` — define your team
3. Edit `agents/*.md` — write instructions for each role
4. Set your API key (Tensorix, OpenRouter, Anthropic, etc.)
5. Set your Telegram bot token
6. Run `node scripts/conductor.mjs`

The framework is product-agnostic. Replace Nightshift with your product. Replace Irish tax law with your domain. The pipeline, hierarchy, and governance stay the same.

## 12. Principles

1. **Humans decide, agents execute.** The Founder merges. The CEO strategises. Everyone else does.
2. **Quality over speed.** A broken product kills trust. Every branch goes through 3 gates.
3. **Isolation by default.** Agents can't see each other. Sandbox everything.
4. **Budget-aware.** Every token costs money. Track it. Limit it.
5. **Hire slow, fire fast.** Small teams move faster. Scale only when bottlenecked.
6. **Everything is logged.** Every run, every decision, every token. Full audit trail.
7. **The pipeline is law.** No shortcuts. No skipping gates. No pushing to main.
