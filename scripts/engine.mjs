#!/usr/bin/env node
/**
 * TROVEK ENGINE — Action/Observation Agent Runner
 *
 * Inspired by OpenHands: every agent call follows the pattern:
 *   Action → Execution → Observation
 *
 * Every interaction is an immutable event logged for replay.
 * Agents produce structured results, not raw text.
 *
 * Usage: source .env && node scripts/engine.mjs [max-rounds]
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── Config ─────────────────────────────────────────────

const LLM_API_KEY = process.env.LLM_API_KEY || process.env.TENSORIX_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.tensorix.ai/v1';
const DEFAULT_MODEL = process.env.AGENT_MODEL || 'deepseek/deepseek-v3.2';
const MAX_ROUNDS = parseInt(process.argv[2] || '10');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WORKSPACE = process.env.WORKSPACE || join(ROOT, 'workspace');
const COMPANY_ID = process.env.COMPANY_ID || 'bb18cce2-25b1-4304-a046-47b113052ec4';
const useSupabase = !!process.env.SUPABASE_URL;

if (!LLM_API_KEY) { console.error('Set LLM_API_KEY'); process.exit(1); }

// ─── Helpers ────────────────────────────────────────────

const json = (f) => { const p = join(ROOT, f); if (!existsSync(p)) return null; try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; } };
const save = (f, d) => writeFileSync(join(ROOT, f), JSON.stringify(d, null, 2), 'utf-8');
const text = (f) => { const p = join(ROOT, f); return existsSync(p) ? readFileSync(p, 'utf-8') : ''; };

// ─── Event Log ──────────────────────────────────────────

async function logEvent(type, agentId, data) {
  const msg = `[${new Date().toISOString()}] [${agentId||'system'}] ${type}: ${JSON.stringify(data).substring(0, 120)}`;
  console.log(msg);
  try { appendFileSync(join(ROOT, 'workspace', 'activity.log'), msg + '\n'); } catch {}

  if (useSupabase) {
    try { await db.logEvent(COMPANY_ID, agentId, type, data); } catch {}
  }
  // Also log to local for dashboard fallback
  try { await db.log(COMPANY_ID, agentId, `${type}: ${JSON.stringify(data).substring(0, 200)}`); } catch {}
}

// ─── Company Registry ───────────────────────────────────

let _agents = null; // cache

async function loadAgents() {
  if (useSupabase) {
    _agents = await db.getAgents(COMPANY_ID);
  } else {
    const c = json('company.json') || { agents: [] };
    _agents = c.agents || [];
  }
  return _agents;
}

function getAgentCached(id) { return (_agents || []).find(a => a.id === id); }

async function updateAgent(id, updates) {
  if (useSupabase) {
    await db.updateAgent(id, COMPANY_ID, updates);
    // Update cache
    const a = (_agents || []).find(x => x.id === id);
    if (a) Object.assign(a, updates);
  } else {
    const c = json('company.json') || { agents: [] };
    const a = c.agents.find(x => x.id === id);
    if (a) { Object.assign(a, updates); save('company.json', c); }
  }
}

// ─── Sessions ───────────────────────────────────────────

async function getSession(agentId, taskKey) {
  if (useSupabase) {
    return await db.getSession(agentId, taskKey || 'default', COMPANY_ID);
  }
  const s = json('data/sessions.json') || {};
  return s[`${agentId}:${taskKey || 'default'}`] || [];
}

async function saveSession(agentId, taskKey, history) {
  if (useSupabase) {
    await db.saveSession(agentId, taskKey || 'default', COMPANY_ID, history);
    return;
  }
  const s = json('data/sessions.json') || {};
  s[`${agentId}:${taskKey || 'default'}`] = history.slice(-6);
  save('data/sessions.json', s);
}

// ─── Knowledge Injection ────────────────────────────────

function getRelevantKnowledge(task) {
  const kbDir = join(ROOT, 'knowledge');
  const docs = [];
  const categories = ['company', 'product', 'domain', 'customers', 'competitors'];
  for (const cat of categories) {
    const dir = join(kbDir, cat);
    if (!existsSync(dir)) continue;
    try {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.md') && !file.endsWith('.txt')) continue;
        const content = readFileSync(join(dir, file), 'utf-8');
        // Simple keyword matching — upgrade to embeddings later
        const taskLower = task.toLowerCase();
        const contentLower = content.toLowerCase();
        const keywords = taskLower.split(/\s+/).filter(w => w.length > 4);
        const matches = keywords.filter(k => contentLower.includes(k));
        if (matches.length >= 2) docs.push({ file: `${cat}/${file}`, content: content.substring(0, 500) });
      }
    } catch {}
  }
  return docs.slice(0, 3); // Max 3 relevant docs
}

// ─── LLM Call ───────────────────────────────────────────

async function callLLM(messages, model) {
  const r = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LLM_API_KEY}` },
    body: JSON.stringify({ model: model || DEFAULT_MODEL, messages, max_tokens: 4096, temperature: 0.3 })
  });
  if (!r.ok) throw new Error(`LLM API error: ${r.status} ${await r.text()}`);
  return await r.json();
}

// ─── Telegram ───────────────────────────────────────────

async function telegram(msg) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try { await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg }) }); } catch {}
}

let lastUpdateId = 0;
const founderGoals = [];

async function checkTelegram() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=0`);
    const d = await r.json();
    if (!d.ok || !d.result.length) return;
    for (const u of d.result) {
      lastUpdateId = u.update_id;
      const msg = u.message;
      if (!msg?.text || String(msg.chat.id) !== String(TELEGRAM_CHAT_ID)) continue;
      const t = msg.text.trim();
      const lower = t.toLowerCase();
      logEvent('telegram_received', 'founder', { text: t });

      if (lower === 'status') {
        const bl = json('backlog.json') || [];
        const c = {}; bl.forEach(x => { c[x.status] = (c[x.status] || 0) + 1; });
        const co = getCompany();
        const spent = co.agents.reduce((s, a) => s + (a.budget?.spentCents || 0), 0);
        await telegram(`TROVEK — STATUS\n\nPipeline: ${c['todo'] || 0} todo | ${c['in-progress'] || 0} building | ${c['review'] || 0} review | ${c['ready'] || 0} ready\nTeam: ${co.agents.length} agents | $${(spent / 100).toFixed(2)} spent`);
      } else if (lower.startsWith('merge ')) {
        const id = t.split(' ')[1]?.toUpperCase();
        const bl = json('backlog.json') || [];
        const task = bl.find(x => x.id === id);
        if (task?.status === 'ready') { task.status = 'merged'; save('backlog.json', bl); await telegram(`${id} merged.`); logEvent('task_merged', 'founder', { taskId: id }); }
      } else {
        founderGoals.push(t);
        await telegram(`Got it. PM will break that into tasks.`);
        logEvent('goal_set', 'founder', { goal: t });
      }
    }
  } catch {}
}

// ─── ACTION/OBSERVATION PATTERN ─────────────────────────

/**
 * Run an agent using the Action/Observation pattern.
 * Returns a structured Observation.
 */
async function runAgent(agentId, task, taskKey) {
  const agent = getAgentCached(agentId);
  if (!agent) { await logEvent('agent_not_found', agentId, {}); return null; }

  // Budget check — handle both Supabase (snake_case) and JSON (camelCase) formats
  const spent = agent.budget_spent_cents ?? agent.budget?.spentCents ?? 0;
  const limit = agent.budget_limit_cents ?? agent.budget?.monthlyCentsLimit ?? 5000;
  if (spent >= limit) {
    await logEvent('budget_exceeded', agentId, { spent, limit });
    return null;
  }

  // ACTION: Log the action
  const action = logEvent('action', agentId, { task: task.substring(0, 100), taskKey });
  await updateAgent(agentId, useSupabase ? { status: 'running', last_active_at: new Date().toISOString() } : { status: 'running', lastActiveAt: new Date().toISOString() });

  // Build prompt
  const instructions = text(agent.adapterConfig?.promptFile || `agents/${agentId}.md`);
  const backlog = text('backlog.json');
  const prospects = text('prospects.json');
  const session = (await getSession(agentId, taskKey)) || [];
  const knowledge = getRelevantKnowledge(task);
  const knowledgeContext = knowledge.length ? `\n\n## Relevant Knowledge\n${knowledge.map(d => `### ${d.file}\n${d.content}`).join('\n\n')}` : '';

  const agentWorkspace = join(WORKSPACE, agentId);
  if (!existsSync(agentWorkspace)) mkdirSync(agentWorkspace, { recursive: true });

  const systemPrompt = `${instructions}\n\n## Current State\n### Backlog\n${backlog}\n### Prospects\n${prospects}${knowledgeContext}\n\n## Your Workspace\nYour working directory is: ${agentWorkspace}\nAll commands run in this directory. All files you create go here unless writing to backlog.json or workspace/.\n\n## IMPORTANT RULES\n- Do NOT overwrite README.md, .gitignore, package.json, or any root config files\n- Write task output files to workspace/ directory\n- Write backlog changes to backlog.json only\n- Do NOT include bash comments (lines starting with #) — they break on Windows\n\n## Response Format\nRespond with:\n1. THOUGHT: What you're doing (1 sentence)\n2. COMMANDS: Shell commands in \`\`\`bash blocks (NO comment lines starting with #)\n3. FILES: Write files via <!-- write: filename --> before code blocks\n4. RESULT: One line summary of what you did`;

  const messages = [{ role: 'system', content: systemPrompt }, ...session, { role: 'user', content: task }];

  // EXECUTION
  const startTime = Date.now();
  try {
    const data = await callLLM(messages, agent.adapterConfig?.model);
    const response = data.choices[0].message.content.replace(/\r\n/g, '\n');
    const usage = data.usage || {};
    const duration = Date.now() - startTime;

    // Parse and execute commands — strip comments, run in agent workspace
    const cmdResults = [];
    const cmdRegex = /```(?:bash|sh)\n([\s\S]*?)```/g;
    let match;
    while ((match = cmdRegex.exec(response)) !== null) {
      // Strip comment-only lines and blank lines (Windows can't handle #)
      const rawCmd = match[1].trim();
      const cleanCmd = rawCmd.split('\n')
        .filter(line => line.trim() && !line.trim().startsWith('#'))
        .join('\n')
        .trim();
      if (!cleanCmd) continue; // Skip empty command blocks

      logEvent('exec', agentId, { cmd: cleanCmd.substring(0, 80) });
      try {
        const cwd = join(WORKSPACE, agentId);
        if (!existsSync(cwd)) mkdirSync(cwd, { recursive: true });
        const output = execSync(cleanCmd, { cwd, encoding: 'utf-8', timeout: 60000, shell: true });
        cmdResults.push({ cmd: cleanCmd.substring(0, 80), success: true, output: output.substring(0, 300) });
      } catch (e) {
        cmdResults.push({ cmd: cleanCmd.substring(0, 80), success: false, error: (e.stderr || e.message).substring(0, 200) });
      }
    }

    // Parse and write files — scoped to workspace, protected root files
    const PROTECTED_FILES = ['README.md', '.gitignore', '.env', '.env.example', 'COMPANY.md', 'SPEC.md', 'company.json', 'connections.json', 'marketplace.json', 'schedules.json', 'dashboard/index.html', 'dashboard/server.mjs', 'scripts/engine.mjs', 'scripts/conductor.mjs'];
    const filesWritten = [];
    const fileRegex = /<!-- write: (.+?) -->\s*\n```[\w]*\s*\n([\s\S]*?)```/g;
    while ((match = fileRegex.exec(response)) !== null) {
      let filename = match[1].trim().replace(/^\/home\/\w+\//, '').replace(/^\/workspace\//, '').replace(/^\/c\/Users\/\w+\/nightshift\//, '');

      // Only allow writes to: backlog.json, prospects.json, agenda.json, workspace/*, agents/*
      const allowedPrefixes = ['backlog.json', 'prospects.json', 'agenda.json', 'workspace/', 'agents/', 'knowledge/', 'data/'];
      const isAllowed = allowedPrefixes.some(p => filename === p || filename.startsWith(p));
      const isProtected = PROTECTED_FILES.includes(filename);

      if (isProtected) {
        logEvent('file_blocked', agentId, { filename, reason: 'protected' });
        continue;
      }

      // If not in allowed list, redirect to workspace/<agentId>/
      const targetPath = isAllowed ? join(ROOT, filename) : join(WORKSPACE, agentId, filename);
      const actualFilename = isAllowed ? filename : `workspace/${agentId}/${filename}`;

      const content = match[2];
      const dir = dirname(targetPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(targetPath, content, 'utf-8');
      filesWritten.push(actualFilename);
      logEvent('file_written', agentId, { filename: actualFilename, bytes: content.length });
    }

    // OBSERVATION: structured result
    const observation = {
      agentId,
      taskKey,
      success: true,
      response: response.substring(0, 500),
      commands: cmdResults,
      filesWritten,
      tokens: { input: usage.prompt_tokens || 0, output: usage.completion_tokens || 0, total: usage.total_tokens || 0 },
      costCents: Math.round(((usage.prompt_tokens || 0) * 0.000027 + (usage.completion_tokens || 0) * 0.00011) * 100),
      durationMs: duration
    };

    await logEvent('observation', agentId, { tokens: observation.tokens.total, cost: observation.costCents, files: filesWritten.length, cmds: cmdResults.length });

    // Update budget
    if (useSupabase) {
      await updateAgent(agentId, {
        budget_spent_cents: spent + observation.costCents,
        total_tokens: (agent.total_tokens || 0) + observation.tokens.total,
        total_runs: (agent.total_runs || 0) + 1,
        status: 'idle',
        last_active_at: new Date().toISOString()
      });
    } else {
      const c = json('company.json') || { agents: [] };
      const a = c.agents.find(x => x.id === agentId);
      if (a) {
        a.budget = a.budget || {};
        a.budget.spentCents = (a.budget.spentCents || 0) + observation.costCents;
        a.budget.totalTokens = (a.budget.totalTokens || 0) + observation.tokens.total;
        a.stats = a.stats || {};
        a.stats.totalRuns = (a.stats.totalRuns || 0) + 1;
        a.status = 'idle';
        a.lastActiveAt = new Date().toISOString();
        save('company.json', c);
      }
    }

    // Save session
    await saveSession(agentId, taskKey, [...session, { role: 'user', content: task }, { role: 'assistant', content: response }]);

    // Save run
    if (useSupabase) {
      try { await db.createRun({ company_id: COMPANY_ID, agent_id: agentId, task_key: taskKey, input_preview: task.substring(0, 100), output_preview: response.substring(0, 200), input_tokens: observation.tokens.input, output_tokens: observation.tokens.output, total_tokens: observation.tokens.total, cost_cents: observation.costCents, duration_ms: duration }); } catch {}
    } else {
      const runs = json('data/runs.json') || [];
      runs.push({ id: `run-${Date.now()}`, agentId, taskKey, timestamp: new Date().toISOString(), ...observation.tokens, costCents: observation.costCents, durationMs: duration, inputPreview: task.substring(0, 100), outputPreview: response.substring(0, 200) });
      if (runs.length > 500) runs.splice(0, runs.length - 500);
      save('data/runs.json', runs);
    }

    // Save agent output log
    appendFileSync(join(ROOT, 'workspace', `${agentId}-output.log`), `\n[${new Date().toISOString()}] (${observation.tokens.total} tokens, $${(observation.costCents / 100).toFixed(3)})\n${response.substring(0, 1000)}\n`);

    console.log(`  ${agentId}: ${observation.tokens.total} tokens, $${(observation.costCents / 100).toFixed(3)}, ${filesWritten.length} files, ${cmdResults.length} cmds`);

    return observation;
  } catch (e) {
    const observation = { agentId, taskKey, success: false, error: e.message, durationMs: Date.now() - startTime };
    logEvent('error', agentId, { error: e.message });
    updateAgent(agentId, { status: 'error' });
    return observation;
  }
}

// ─── PIPELINE LOGIC ─────────────────────────────────────

function advancePipeline() {
  const backlog = json('backlog.json') || [];
  let changed = false;

  // in-progress (1+ cycles) → review
  for (const t of backlog.filter(x => x.status === 'in-progress')) {
    t.cycles = (t.cycles || 0) + 1;
    if (t.cycles >= 1) { t.status = 'review'; logEvent('pipeline', t.assignee, { taskId: t.id, from: 'in-progress', to: 'review' }); changed = true; }
  }
  // review (reviewed) → approved
  for (const t of backlog.filter(x => x.status === 'review' && x._reviewed)) { t.status = 'approved'; logEvent('pipeline', 'system', { taskId: t.id, to: 'approved' }); changed = true; }
  for (const t of backlog.filter(x => x.status === 'review' && !x._reviewed)) { t._reviewed = true; }
  // approved (scanned) → ready
  for (const t of backlog.filter(x => x.status === 'approved' && x._scanned)) {
    t.security_status = 'cleared'; t.status = 'ready';
    logEvent('pipeline', 'system', { taskId: t.id, to: 'ready' });
    changed = true;
  }
  for (const t of backlog.filter(x => x.status === 'approved' && !x._scanned)) { t._scanned = true; }

  if (changed) save('backlog.json', backlog);
  return json('backlog.json') || [];
}

function assignTasks(backlog) {
  const agents = _agents || [];
  const findByRole = (role) => agents.find(a => a.role.toLowerCase().includes(role))?.id;
  const backendId = findByRole('backend') || 'backend';
  const frontendId = findByRole('frontend') || 'frontend';
  const sdrId = findByRole('sales') || findByRole('sdr') || 'sdr';
  const secId = findByRole('security') || 'security';

  const busy = new Set(backlog.filter(x => x.status === 'in-progress').map(x => x.assignee));

  for (const t of backlog.filter(x => x.status === 'todo')) {
    const isSales = t.domain === 'crm' || t.domain === 'sales' || t.title?.toLowerCase().includes('prospect');
    const isSec = t.title?.toLowerCase().includes('security');
    const agent = isSales ? sdrId : isSec ? secId : t.type === 'frontend' ? frontendId : backendId;
    if (busy.has(agent)) continue;
    t.status = 'in-progress'; t.assignee = agent;
    t.branch = isSales ? null : `${agent}/${(t.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;
    busy.add(agent);
    logEvent('assigned', 'coo', { taskId: t.id, agent });
  }
  save('backlog.json', backlog);
}

function getAgentJob(agent, backlog) {
  const id = agent.id;
  const role = (agent.role || '').toLowerCase();
  const my = backlog.find(t => t.assignee === id && t.status === 'in-progress');
  const review = backlog.find(t => t.status === 'review');

  if (role.includes('executive')) return null; // CEO handled separately
  if (role.includes('operating')) return null; // COO is the conductor
  if (role.includes('financial')) return null; // CFO — skip for now
  if (role.includes('revenue')) return null; // CRO — skip for now

  if (role.includes('backend') && !role.includes('frontend'))
    return my ? { task: `Work on ${my.id}: "${my.title}". ${my.description || ''}. Branch: ${my.branch}. Implement, test, commit.`, key: my.id } : { task: `Scan backend for bugs, untested code. Fix on ${id}/maintenance.`, key: 'maint' };
  if (role.includes('frontend'))
    return my ? { task: `Work on ${my.id}: "${my.title}". Branch: ${my.branch}. Build UI.`, key: my.id } : { task: `Scan frontend for issues. Fix on ${id}/maintenance.`, key: 'maint' };
  if (role.includes('qa'))
    return review ? { task: `Review ${review.id}: "${review.title}" on ${review.branch}. Code quality, tests, impact.`, key: review.id } : { task: 'Run full test suite. Report failures.', key: 'maint' };
  if (role.includes('compliance'))
    return { task: 'Audit domain logic for correctness.', key: 'maint' };
  if (role.includes('security'))
    return my ? { task: `Work on ${my.id}: "${my.title}". ${my.description || ''}.`, key: my.id } : { task: 'Full security audit: secrets, deps, lint.', key: 'maint' };
  if (role.includes('product manager'))
    return { task: `Review backlog (${backlog.length} tasks). Scan for gaps. Write new tasks.`, key: 'maint' };
  if (role.includes('sales') || role.includes('sdr'))
    return my ? { task: `Work on ${my.id}: "${my.title}". ${my.description || ''}`, key: my.id } : { task: 'Research next prospect. Draft outreach.', key: 'sales' };
  if (role.includes('marketing'))
    return { task: 'Create content: blog post, social media, or case study.', key: 'maint' };
  if (role.includes('customer success'))
    return { task: 'Check customer health. Draft onboarding guides.', key: 'maint' };
  if (role.includes('data') || role.includes('analytics'))
    return { task: 'Analyze usage metrics. Build dashboard insights.', key: 'maint' };
  if (role.includes('finance'))
    return { task: 'Review budget. Track expenses. Generate report.', key: 'maint' };

  return { task: `Check your area (${agent.role}) for work.`, key: 'maint' };
}

// ─── CONDUCTOR ROUND ────────────────────────────────────

async function round(num) {
  await logEvent('round_start', 'coo', { round: num, maxRounds: MAX_ROUNDS });
  console.log(`\n${'═'.repeat(40)} Round ${num}/${MAX_ROUNDS} ${'═'.repeat(40)}`);

  // Reload agents from Supabase each round
  await loadAgents();

  let backlog = json('backlog.json') || [];
  const agents = _agents || [];
  const counts = {}; backlog.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
  const spent = agents.reduce((s, a) => s + (a.budget_spent_cents ?? a.budget?.spentCents ?? 0), 0);

  console.log(`Pipeline: ${counts['todo'] || 0} todo | ${counts['in-progress'] || 0} building | ${counts['review'] || 0} review | ${counts['approved'] || 0} approved | ${counts['ready'] || 0} ready | $${(spent / 100).toFixed(2)} spent`);

  // Phase 1: CEO + PM (synchronous — sets up work)
  if (founderGoals.length > 0) {
    const goals = founderGoals.splice(0);
    await runAgent('pm', `Founder wants:\n- ${goals.join('\n- ')}\n\nBreak into tasks. Write backlog.json.`, 'goals');
    backlog = json('backlog.json') || [];
  } else if ((num % 5 === 1) || backlog.length === 0 || backlog.every(t => t.status === 'merged')) {
    await runAgent('ceo', `Set agenda. Backlog: ${backlog.length} tasks. Budget: $${(spent / 100).toFixed(2)}. Write agenda.json. No bash.`, 'agenda');
    const agenda = json('agenda.json');
    if (agenda?.goals?.length) {
      const goalText = agenda.goals.map(g => `[${g.priority}] ${g.what}`).join('\n- ');
      await runAgent('pm', `CEO agenda:\n- ${goalText}\n\nBreak into tasks. Write backlog.json.`, 'agenda');
    }
    backlog = json('backlog.json') || [];
  }

  // Phase 2: Advance pipeline + assign tasks
  backlog = advancePipeline();
  assignTasks(backlog);
  backlog = json('backlog.json') || [];

  // Phase 3: Fire ALL working agents in parallel
  const workingAgents = (_agents || []).filter(a => {
    const role = (a.role || '').toLowerCase();
    return !role.includes('chief executive') && !role.includes('chief operating') && !role.includes('chief financial') && !role.includes('chief revenue');
  });

  const jobs = [];
  for (const agent of workingAgents) {
    const job = getAgentJob(agent, backlog);
    if (!job) continue;
    jobs.push(runAgent(agent.id, job.task, job.key));
  }

  if (jobs.length > 0) {
    console.log(`Firing ${jobs.length} agents...`);
    await Promise.all(jobs);
  }

  // Phase 4: Daily digest only — no spam
  // Only send Telegram at 9am OR if explicitly asked via "status"
  // Ready tasks accumulate silently — founder checks dashboard or texts "status"
  backlog = json('backlog.json') || [];
  const ready = backlog.filter(t => t.status === 'ready' && !t.pr_created && !t._notified);

  if (ready.length) {
    const hour = new Date().getHours();
    const isDigestTime = (hour === 9 && num <= 3); // Only send at ~9am

    if (isDigestTime) {
      const agents = _agents || [];
      const spent = agents.reduce((s, a) => s + (a.budget_spent_cents ?? a.budget?.spentCents ?? 0), 0);
      const totalRuns = agents.reduce((s, a) => s + (a.total_runs ?? a.stats?.totalRuns ?? 0), 0);
      const allTasks = backlog.length;
      const merged = backlog.filter(t => t.status === 'merged').length;

      await telegram(
        `TROVEK — Daily Update\n\n` +
        `Ready for merge: ${ready.length}\n${ready.map(t => `  ${t.id}: ${t.title}`).join('\n')}\n\n` +
        `Pipeline: ${allTasks} tasks, ${merged} merged\n` +
        `Budget: $${(spent / 100).toFixed(2)} | ${totalRuns} runs\n\n` +
        `Reply "merge TASK-XXX" or "status" for details`
      );
      ready.forEach(t => t._notified = true);
      save('backlog.json', backlog);
    }
  }

  logEvent('round_end', 'coo', { round: num, agentsFired: jobs.length });
}

// ─── MAIN ───────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  TROVEK ENGINE v2.0`);
  console.log(`  Model: ${DEFAULT_MODEL}`);
  console.log(`  Rounds: ${MAX_ROUNDS}`);
  // Init data files
  if (!existsSync(join(ROOT, 'data'))) mkdirSync(join(ROOT, 'data'), { recursive: true });
  if (!json('data/events.json')) save('data/events.json', []);
  if (!json('data/sessions.json')) save('data/sessions.json', {});
  if (!json('data/runs.json')) save('data/runs.json', []);

  await loadAgents();
  console.log(`  Agents: ${(_agents || []).length}`);
  console.log(`  Backend: ${useSupabase ? 'Supabase' : 'JSON files'}`);
  console.log(`${'═'.repeat(50)}\n`);

  await logEvent('engine_start', 'system', { model: DEFAULT_MODEL, rounds: MAX_ROUNDS });

  for (let i = 1; i <= MAX_ROUNDS; i++) {
    await checkTelegram();
    await round(i);
    if (i < MAX_ROUNDS) await checkTelegram();
  }

  await loadAgents();
  const totalSpent = (_agents || []).reduce((s, a) => s + (a.budget_spent_cents ?? a.budget?.spentCents ?? 0), 0);
  const totalRuns = (_agents || []).reduce((s, a) => s + (a.total_runs ?? a.stats?.totalRuns ?? 0), 0);
  await logEvent('engine_stop', 'system', { totalRuns, totalSpent });
  console.log(`\nDone. ${totalRuns} runs, $${(totalSpent / 100).toFixed(2)} spent.`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
