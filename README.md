# Nightshift

> Deploy an AI company in 30 minutes. Every role filled. Running 24/7.

Nightshift is an open-source framework for running a fully autonomous AI company. Clone it, point it at your repo, configure your team, and let it work while you sleep.

One human. Every other role is AI. The human approves. The company runs.

## What You Get

- **10 pre-built agent roles** — CEO, COO, PM, Engineers, QA, Security, Compliance, Sales, Marketing
- **Live dashboard** — pipeline view, agent activity, tickets, budget tracking, settings
- **Telegram interface** — text goals, get status updates, approve merges
- **Full pipeline** — code gets written, reviewed, tested, scanned, then PR'd for your approval
- **Session memory** — agents remember context across cycles
- **Budget tracking** — token usage and cost per agent
- **Works anywhere** — your laptop, Oracle Cloud, any Linux server

## Quick Start

```bash
# Clone
git clone https://github.com/fiittz/nightshift.git
cd nightshift

# Configure
cp .env.example .env
# Edit .env with your API keys

# Set your repo
# Edit company.json → repos → url

# Run
node scripts/conductor.mjs 10

# Dashboard
node dashboard/server.mjs
# Open http://localhost:3000
```

## How It Works

```
You set a goal (Telegram or dashboard)
  → CEO writes the agenda
  → PM breaks it into tasks
  → Engineers code it (each in their own workspace)
  → QA reviews (code quality + tests + impact)
  → Compliance validates (domain-specific rules)
  → Security scans (secrets, deps, lint)
  → All gates pass → PR created on your repo
  → You merge when ready
```

Every agent works every round. No idle agents. Engineering and sales run in parallel.

## The Team

| Role | What They Do |
|------|-------------|
| **CEO** | Sets agenda, audits quality, hires/fires agents |
| **COO** | The conductor — orchestrates the pipeline, triggers agents |
| **PM** | Breaks goals into tasks, maintains backlog |
| **Backend Engineer** | Writes backend code, APIs, business logic |
| **Frontend Engineer** | Builds UI, watches backend branches for frontend needs |
| **QA** | Code review, test suite, impact analysis, conflict detection |
| **Compliance** | Domain-specific validation (tax, legal, medical, etc.) |
| **Security** | Secret scanning, dependency audits, lint, deploy readiness |
| **SDR** | Prospect research, personalised outreach, CRM management |
| **Marketing** | Content, SEO, social media (coming soon) |

## Configuration

Edit `company.json` to configure:

- **Company settings** — name, model, sandbox type
- **Repos** — which codebase(s) agents work on
- **Agents** — roles, models, budgets, permissions
- **Integrations** — Telegram, email, CRM

Edit `agents/*.md` to customise agent instructions for your domain.

## Supported LLM Providers

| Provider | Models | Config |
|----------|--------|--------|
| Tensorix | DeepSeek V3.2, Qwen 3, Llama 4 | `TENSORIX_API_KEY` |
| Anthropic | Claude Sonnet, Opus, Haiku | `ANTHROPIC_API_KEY` |
| OpenRouter | 100+ models | `OPENROUTER_API_KEY` |
| OpenAI | GPT-4o, o1 | `OPENAI_API_KEY` |
| Any OpenAI-compatible | Custom | `LLM_BASE_URL` + `LLM_API_KEY` |

## Requirements

- Node.js 20+
- A server (your laptop, Oracle Cloud free tier, any VPS)
- An LLM API key
- A GitHub account (for PRs)
- Optional: Telegram bot (for mobile interface)

## Architecture

See [COMPANY.md](COMPANY.md) for the full operating system — org structure, pipeline rules, communication patterns, hiring/firing, budget management.

## Built By

[Jamie Fitzgerald](https://linkedin.com/in/jamie-a-fitzgerald-22554327b/) — Built this to run [Balnce](https://balnce.ie), an Irish tax filing platform, with zero employees.

## License

MIT
