#!/usr/bin/env node
/**
 * NIGHTSHIFT — Conductor
 *
 * The brain of your AI company. Orchestrates all agents, manages the pipeline,
 * handles Telegram communication, tracks budget and sessions.
 *
 * Usage: node scripts/conductor.mjs [max-rounds]
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const LLM_API_KEY = process.env.LLM_API_KEY || process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.tensorix.ai/v1';
const DEFAULT_MODEL = process.env.AGENT_MODEL || 'deepseek/deepseek-v3.2';
const MAX_ROUNDS = parseInt(process.argv[2] || '10');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const AGENT_HOME = process.env.AGENT_HOME || '/home/ubuntu/agents';

if (!LLM_API_KEY) { console.error('ERROR: Set LLM_API_KEY (or LLM_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY)'); process.exit(1); }

// ─── File helpers ────────────────────────────────────────

function readJSON(f) { const p = join(PROJECT_ROOT, f); if (!existsSync(p)) return null; try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; } }
function writeJSON(f, d) { writeFileSync(join(PROJECT_ROOT, f), JSON.stringify(d, null, 2), 'utf-8'); }
function readText(f) { const p = join(PROJECT_ROOT, f); if (!existsSync(p)) return ''; return readFileSync(p, 'utf-8'); }

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [coo] ${msg}`;
  console.log(line);
  try { appendFileSync(join(PROJECT_ROOT, 'workspace', 'activity.log'), line + '\n'); } catch {}
}

// ─── Agent Registry (same as before) ────────────────────

function getRegistry() { return readJSON('company.json') || { agents: [], pendingHires: [] }; }
function saveRegistry(reg) { writeJSON('company.json', reg); }
function getAgent(id) { return getRegistry().agents.find(a => a.id === id); }
function setAgentStatus(id, status) {
  const reg = getRegistry();
  const agent = reg.agents.find(a => a.id === id);
  if (agent) { agent.status = status; agent.lastActiveAt = new Date().toISOString(); saveRegistry(reg); }
}

// ─── Sessions ───────────────────────────────────────────

function getSessions() { return readJSON('data/sessions.json') || {}; }
function saveSessions(s) { writeJSON('data/sessions.json', s); }
function getSession(agentId, taskKey) { const s = getSessions(); return s[`${agentId}:${taskKey||'default'}`] || []; }
function saveSession(agentId, taskKey, history) { const s = getSessions(); s[`${agentId}:${taskKey||'default'}`] = history.slice(-6); saveSessions(s); }

// ─── Run Logging ────────────────────────────────────────

function logRun(agentId, taskKey, input, output, usage, durationMs) {
  const runs = readJSON('data/runs.json') || [];
  const cost = usage ? Math.round(((usage.prompt_tokens||0)*0.000027 + (usage.completion_tokens||0)*0.00011)*100) : 0;
  runs.push({ id: `run-${Date.now()}`, agentId, taskKey, timestamp: new Date().toISOString(),
    inputTokens: usage?.prompt_tokens||0, outputTokens: usage?.completion_tokens||0, totalTokens: usage?.total_tokens||0,
    costCents: cost, durationMs, inputPreview: input.substring(0,100), outputPreview: (output||'').substring(0,200) });
  if (runs.length > 500) runs.splice(0, runs.length - 500);
  writeJSON('data/runs.json', runs);
  // Update budget
  const reg = getRegistry(); const agent = reg.agents.find(a => a.id === agentId);
  if (agent) { agent.budget.spentCents += cost; agent.budget.totalTokens += (usage?.total_tokens||0); agent.stats.totalRuns = (agent.stats.totalRuns||0)+1; saveRegistry(reg); }
}

// ─── Command execution (direct on server) ───────────────

function agentExec(agentId, cmd) {
  const cwd = `${AGENT_HOME}/${agentId}`;
  try {
    const result = execSync(cmd, { cwd, encoding: 'utf-8', timeout: 120000, env: { ...process.env, HOME: cwd } });
    return { success: true, output: result.trim() };
  } catch (e) {
    return { success: false, output: ((e.stdout||'') + '\n' + (e.stderr||e.message)).trim() };
  }
}

// ─── Tensorix API ───────────────────────────────────────

async function callLLM(messages, model) {
  const r = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LLM_API_KEY}` },
    body: JSON.stringify({ model: model||DEFAULT_MODEL, messages, max_tokens: 4096, temperature: 0.3 })
  });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return await r.json();
}

// ─── Telegram ───────────────────────────────────────────

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message })
    });
  } catch {}
}

let lastUpdateId = 0;
const ceoGoals = [];

async function checkTelegram() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId+1}&timeout=0`);
    const data = await res.json();
    if (!data.ok || !data.result.length) return;
    for (const u of data.result) {
      lastUpdateId = u.update_id;
      const msg = u.message;
      if (!msg?.text || String(msg.chat.id) !== String(TELEGRAM_CHAT_ID)) continue;
      const text = msg.text.trim();
      const lower = text.toLowerCase();
      log(`Telegram from founder: "${text}"`);

      if (lower === 'status' || lower === 'update') {
        const bl = readJSON('backlog.json') || [];
        const c = {}; bl.forEach(t => { c[t.status]=(c[t.status]||0)+1; });
        const reg = getRegistry();
        const spent = reg.agents.reduce((s,a)=>s+(a.budget?.spentCents||0),0);
        let r = `NIGHTSHIFT — STATUS\n\nPipeline: ${c['todo']||0} todo | ${c['in-progress']||0} building | ${c['review']||0} review | ${c['ready']||0} ready\nTeam: ${reg.agents.length} agents | $${(spent/100).toFixed(2)} spent`;
        const ready = bl.filter(t=>t.status==='ready').map(t=>t.title);
        if (ready.length) r += `\n\nReady for merge:\n${ready.join('\n')}`;
        await sendTelegram(r);
      } else if (lower.startsWith('merge ')) {
        const id = text.split(' ')[1]?.toUpperCase();
        const bl = readJSON('backlog.json') || [];
        const t = bl.find(x=>x.id===id);
        if (t?.status==='ready') { t.status='merged'; writeJSON('backlog.json',bl); await sendTelegram(`${id} merged.`); }
      } else {
        ceoGoals.push(text);
        await sendTelegram(`Got it. Pat will break that into tasks.`);
      }
    }
  } catch {}
}

// ─── Run Agent ──────────────────────────────────────────

async function runAgent(agentId, task, taskKey) {
  const agent = getAgent(agentId);
  if (!agent) { log(`${agentId} not in registry`); return null; }

  setAgentStatus(agentId, 'running');
  log(`Triggering ${agentId}: ${task.substring(0,60)}`);

  const session = getSession(agentId, taskKey);
  const instructions = readText(agent.adapterConfig?.promptFile || `agents/${agentId}.md`);
  const backlog = readText('backlog.json');
  const prospects = readText('prospects.json');

  const systemPrompt = `${instructions}\n\n## Current State\n### Backlog\n${backlog}\n### Prospects\n${prospects}\n\n## Your workspace: ${AGENT_HOME}/${agentId}\nProduct repo: ${AGENT_HOME}/${agentId}/product-repo\nYou have full internet access. git push works.\n\nRespond with:\n1. THOUGHT: What you're doing\n2. COMMANDS in \`\`\`bash blocks\n3. FILES via <!-- write: filename --> before code blocks\n4. RESULT: one line summary`;

  const messages = [{ role: 'system', content: systemPrompt }, ...session, { role: 'user', content: task }];

  const startTime = Date.now();
  try {
    const data = await callLLM(messages, agent.adapterConfig?.model);
    const response = data.choices[0].message.content.replace(/\r\n/g,'\n');
    const usage = data.usage;
    const duration = Date.now() - startTime;

    console.log(`\n--- ${agentId.toUpperCase()} (${usage?.total_tokens||'?'} tokens, ${duration}ms) ---`);
    console.log(response.substring(0, 500));
    console.log(`--- END ---\n`);

    // Execute commands
    const cmdRegex = /```(?:bash|sh)\n([\s\S]*?)```/g;
    let match;
    while ((match = cmdRegex.exec(response)) !== null) {
      const cmd = match[1].trim();
      log(`${agentId} exec: ${cmd.substring(0,60)}...`);
      const result = agentExec(agentId, cmd);
      if (result.output) {
        const outPath = join(PROJECT_ROOT, 'workspace', `${agentId}-output.log`);
        appendFileSync(outPath, `\n$ ${cmd.substring(0,80)}\n${result.output.substring(0,500)}\n`);
      }
    }

    // Write files
    const fileRegex = /<!-- write: (.+?) -->\s*\n```[\w]*\s*\n([\s\S]*?)```/g;
    while ((match = fileRegex.exec(response)) !== null) {
      let filename = match[1].trim().replace(/^\/home\/ubuntu\/.*?\//, '').replace(/^\/workspace\//, '');
      log(`${agentId} write: ${filename} (${match[2].length} bytes)`);
      const fullPath = join(PROJECT_ROOT, filename);
      const dir = dirname(fullPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, match[2], 'utf-8');
      log(`FILE WRITTEN: ${filename}`);
    }

    logRun(agentId, taskKey, task, response, usage, duration);
    saveSession(agentId, taskKey, [...session, { role:'user', content:task }, { role:'assistant', content:response }]);
    appendFileSync(join(PROJECT_ROOT, 'workspace', `${agentId}-output.log`), `\n[${new Date().toISOString()}]\n${response}\n`);

    setAgentStatus(agentId, 'idle');
    log(`${agentId} completed (${usage?.total_tokens||'?'} tokens, $${(Math.round(((usage?.prompt_tokens||0)*0.000027+(usage?.completion_tokens||0)*0.00011)*100)/100).toFixed(3)})`);
    return response;
  } catch (e) {
    setAgentStatus(agentId, 'error');
    log(`${agentId} FAILED: ${e.message}`);
    return null;
  }
}

// ─── Conductor Round (same logic, direct execution) ─────

async function conductorRound(round) {
  log(`═══ Round ${round}/${MAX_ROUNDS} ═══`);

  let backlog = readJSON('backlog.json') || [];
  const prospects = readJSON('prospects.json') || [];
  const reg = getRegistry();
  const counts = {}; backlog.forEach(t => { counts[t.status]=(counts[t.status]||0)+1; });
  const totalSpent = reg.agents.reduce((s,a)=>s+(a.budget?.spentCents||0),0);

  log(`Pipeline: todo=${counts['todo']||0} progress=${counts['in-progress']||0} review=${counts['review']||0} approved=${counts['approved']||0} ready=${counts['ready']||0} | $${(totalSpent/100).toFixed(2)}`);

  // CEO + Pat (sync)
  if (ceoGoals.length > 0) {
    const goals = ceoGoals.splice(0);
    await runAgent('pat', `Jamie wants:\n- ${goals.join('\n- ')}\n\nBreak into tasks. Write backlog.json.`, 'ceo-goals');
    backlog = readJSON('backlog.json') || [];
  } else if ((round % 5 === 1) || backlog.length === 0 || backlog.every(t => t.status === 'merged')) {
    await runAgent('ceo', `Set agenda. Backlog: ${backlog.length} tasks. Budget: $${(totalSpent/100).toFixed(2)}. Write agenda.json. No bash.`, 'agenda');
    const agenda = readJSON('agenda.json');
    if (agenda?.goals?.length) {
      await runAgent('pat', `CEO agenda:\n- ${agenda.goals.map(g=>`[${g.priority}] ${g.what}`).join('\n- ')}\n\nBreak into tasks. Write backlog.json.`, 'agenda');
    }
    backlog = readJSON('backlog.json') || [];
  }

  // Advance pipeline
  for (const t of backlog.filter(x => x.status === 'in-progress')) {
    t._cycles = (t._cycles||0)+1;
    if (t._cycles >= 1) { t.status = 'review'; log(`${t.id} → review`); }
  }
  for (const t of backlog.filter(x => x.status === 'review' && x._reviewed)) { t.status = 'approved'; log(`${t.id} → approved`); }
  for (const t of backlog.filter(x => x.status === 'review' && !x._reviewed)) { t._reviewed = true; }
  for (const t of backlog.filter(x => x.status === 'approved' && x._scanned)) {
    t.security_status = 'cleared';
    if (t.domain === 'tax' || t.domain === 'filing') t.compliance_status = 'passed';
    t.status = 'ready'; log(`${t.id} → ready`);
  }
  for (const t of backlog.filter(x => x.status === 'approved' && !x._scanned)) { t._scanned = true; }

  // Assign todos (1 per agent) — find agents by role dynamically
  const allAgents = reg.agents || [];
  const findAgent = (role) => allAgents.find(a => a.role.toLowerCase().includes(role))?.id;
  const backendId = findAgent('backend') || 'backend';
  const frontendId = findAgent('frontend') || 'frontend';
  const sdrId = findAgent('sales') || findAgent('sdr') || 'sdr';
  const securityId = findAgent('security') || 'security';

  const busy = new Set(backlog.filter(x => x.status === 'in-progress').map(x => x.assignee));
  for (const t of backlog.filter(x => x.status === 'todo')) {
    const isSales = t.domain==='crm'||t.domain==='sales'||t.title.toLowerCase().includes('prospect')||t.title.toLowerCase().includes('outreach');
    const isSec = t.title.toLowerCase().includes('security')||t.title.toLowerCase().includes('audit dep');
    let agent = isSales ? sdrId : isSec ? securityId : t.type === 'frontend' ? frontendId : backendId;
    if (busy.has(agent)) continue;
    t.status = 'in-progress'; t.assignee = agent;
    t.branch = isSales ? null : `${agent}/${t.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-+$/,'')}`;
    busy.add(agent); log(`Assigned ${t.id} to ${agent}`);
  }
  writeJSON('backlog.json', backlog);

  // Get job for every agent — by role, not hardcoded name
  const qaId = findAgent('qa') || 'qa';
  const complianceId = findAgent('compliance') || 'compliance';
  const pmId = findAgent('product manager') || 'pm';

  function getJob(agent) {
    const id = agent.id;
    const role = agent.role.toLowerCase();
    const my = backlog.find(t=>t.assignee===id&&t.status==='in-progress');
    const review = backlog.find(t=>t.status==='review');

    if (role.includes('backend') || role.includes('engineer') && !role.includes('frontend') && !role.includes('qa')) {
      return my ? { task:`Work on ${my.id}: "${my.title}". ${my.description||''}. Branch: ${my.branch}. Implement, test, commit, push.`, key:my.id } : { task:`Scan backend for bugs, missing error handling, untested code. Fix on ${id}/maintenance.`, key:'maint' };
    }
    if (role.includes('frontend')) {
      return my ? { task:`Work on ${my.id}: "${my.title}". Branch: ${my.branch}. Build UI.`, key:my.id } : { task:`Scan frontend for broken components, accessibility issues. Fix on ${id}/maintenance.`, key:'maint' };
    }
    if (role.includes('qa')) {
      return review ? { task:`Review ${review.id}: "${review.title}" on ${review.branch}. Code quality, tests, impact.`, key:review.id } : { task:'Run full test suite on main. Report failures.', key:'maint' };
    }
    if (role.includes('compliance')) {
      const c = backlog.find(t=>t.status==='approved'&&!t.compliance_status);
      return c ? { task:`Compliance review ${c.id}: "${c.title}".`, key:c.id } : { task:'Audit existing domain logic for correctness.', key:'maint' };
    }
    if (role.includes('security')) {
      const s = backlog.find(t=>t.status==='approved'&&t.security_status!=='cleared');
      return s ? { task:`Security scan ${s.id}: "${s.title}" on ${s.branch}.`, key:s.id } : { task:'Full security audit on main.', key:'maint' };
    }
    if (role.includes('product manager')) {
      return { task:`Review backlog (${backlog.length} tasks). Scan for gaps. Write new tasks if needed.`, key:'maint' };
    }
    if (role.includes('sales') || role.includes('sdr')) {
      return my ? { task:`Work on ${my.id}: "${my.title}". ${my.description||''}`, key:my.id } : { task:'Research next prospect. Draft outreach.', key:'sales' };
    }
    // Default for any other role — do maintenance for your area
    return { task:`Check your area (${agent.role}) for work. Scan, audit, improve.`, key:'maint' };
  }

  // Fire all working agents (skip CEO and COO — they run in Phase 1)
  const workingAgents = allAgents.filter(a => a.id !== 'ceo' && a.id !== 'coo' && !a.role.toLowerCase().includes('chief financial') && !a.role.toLowerCase().includes('chief revenue'));
  const jobs = workingAgents.map(agent => { const j = getJob(agent); log(`${agent.id}: ${j.task.substring(0,50)}...`); return runAgent(agent.id, j.task, j.key); });

  log(`Firing ALL ${jobs.length} agents in parallel...`);
  await Promise.all(jobs);

  // Push ready branches + create PRs
  backlog = readJSON('backlog.json') || [];
  for (const t of backlog.filter(x => x.status === 'ready' && !x.pr_created && x.branch)) {
    log(`Pushing ${t.branch}...`);
    agentExec(t.assignee||'carl', `cd product-repo && git push origin ${t.branch} 2>&1`);
    try {
      const pr = execSync(`gh pr create --repo ${process.env.PRODUCT_REPO_SLUG||'owner/repo'} --head "${t.branch}" --base main --title "${t.title}" --body "Created by Nightshift Company" 2>&1`, { encoding:'utf-8', timeout:30000 });
      if (pr.includes('github.com')) { t.pr_url = pr.trim(); t.pr_created = true; t.status = 'pr-open'; await sendTelegram(`PR ready: ${t.title}\n${t.pr_url}`); }
    } catch {}
  }
  writeJSON('backlog.json', backlog);
}

// ─── Main ───────────────────────────────────────────────

async function run() {
  console.log(`\n${'═'.repeat(50)}\n  NIGHTSHIFT COMPANY — ORACLE SERVER\n  Model: ${DEFAULT_MODEL}\n  Rounds: ${MAX_ROUNDS}\n${'═'.repeat(50)}\n`);
  log('COO online — Oracle server');

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    await checkTelegram();
    await conductorRound(round);
    if (round < MAX_ROUNDS) { await checkTelegram(); log('Next round...'); }
  }
  log('COO signing off');
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
