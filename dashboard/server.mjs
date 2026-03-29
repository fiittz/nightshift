#!/usr/bin/env node
/**
 * TROVEK — Dashboard Server (Supabase backend)
 */
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from '../scripts/db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const PORT = process.env.PORT || 3000;
const COMPANY_ID = process.env.COMPANY_ID || 'bb18cce2-25b1-4304-a046-47b113052ec4';

// Fallback to JSON files if Supabase isn't configured
const useSupabase = !!process.env.SUPABASE_URL;
function readJSON(f) { const p = join(PROJECT_ROOT, f); if (!existsSync(p)) return null; try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; } }
function writeJSON(f, d) { writeFileSync(join(PROJECT_ROOT, f), JSON.stringify(d, null, 2), 'utf-8'); }

function getAgentLogs() {
  const logs = {};
  const dir = join(PROJECT_ROOT, 'workspace');
  if (!existsSync(dir)) return logs;
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('-output.log')) continue;
      const id = f.replace('-output.log', '');
      logs[id] = readFileSync(join(dir, f), 'utf-8').split('\n').slice(-50).join('\n');
    }
  } catch {}
  return logs;
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
  });
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  try {
    // ─── GET /api/state ─────────────────────────────
    if (req.url === '/api/state' && req.method === 'GET') {
      let state;
      if (useSupabase) {
        const [company, agents, tasks, runs, events, connections, schedules, knowledge, activity] = await Promise.all([
          db.getCompany(COMPANY_ID),
          db.getAgents(COMPANY_ID),
          db.getTasks(COMPANY_ID),
          db.getRuns(COMPANY_ID, 100),
          db.getEvents(COMPANY_ID, 200),
          db.getConnections(COMPANY_ID),
          db.getSchedules(COMPANY_ID),
          db.getKnowledge(COMPANY_ID),
          db.getActivity(COMPANY_ID, 100)
        ]);
        state = {
          backlog: tasks,
          prospects: readJSON('prospects.json') || [],
          activity: activity.map(a => `[${a.created_at}] [${a.agent_id || 'system'}] ${a.message}`).reverse(),
          agentLogs: getAgentLogs(),
          registry: { company: company || {}, agents: agents || [] },
          runs: runs || [],
          connections: readJSON('connections.json') || {},
          schedules: schedules || [],
          knowledge: knowledge || [],
          marketplace: readJSON('marketplace.json') || [],
          timestamp: new Date().toISOString()
        };
      } else {
        state = {
          backlog: readJSON('backlog.json') || [],
          prospects: readJSON('prospects.json') || [],
          activity: (existsSync(join(PROJECT_ROOT, 'workspace', 'activity.log')) ? readFileSync(join(PROJECT_ROOT, 'workspace', 'activity.log'), 'utf-8') : '').split('\n').filter(l => l.trim()),
          agentLogs: getAgentLogs(),
          registry: readJSON('company.json') || { agents: [] },
          runs: readJSON('data/runs.json') || [],
          connections: readJSON('connections.json') || {},
          schedules: readJSON('schedules.json') || [],
          knowledge: [],
          marketplace: readJSON('marketplace.json') || [],
          timestamp: new Date().toISOString()
        };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state));
    }

    // ─── Tasks ──────────────────────────────────────
    else if (req.url === '/api/tasks' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body?.title) { res.writeHead(400); res.end('{"error":"title required"}'); return; }
      if (useSupabase) {
        const tasks = await db.getTasks(COMPANY_ID);
        const maxId = tasks.reduce((m, t) => { const n = parseInt((t.id || '').replace('TASK-', '')); return n > m ? n : m; }, 0);
        const task = await db.createTask({ id: `TASK-${String(maxId + 1).padStart(3, '0')}`, company_id: COMPANY_ID, title: body.title, description: body.description, type: body.type || 'backend', domain: body.domain || 'general', priority: body.priority || 'medium' });
        res.writeHead(200); res.end(JSON.stringify({ ok: true, task }));
      } else {
        const backlog = readJSON('backlog.json') || [];
        const maxId = backlog.reduce((m, t) => { const n = parseInt((t.id || '').replace('TASK-', '')); return n > m ? n : m; }, 0);
        backlog.push({ id: `TASK-${String(maxId + 1).padStart(3, '0')}`, title: body.title, description: body.description || '', type: body.type || 'backend', domain: body.domain || 'general', priority: body.priority || 'medium', status: 'todo', assignee: null, branch: null });
        writeJSON('backlog.json', backlog);
        res.writeHead(200); res.end(JSON.stringify({ ok: true }));
      }
    }

    // ─── Agents ─────────────────────────────────────
    else if (req.url === '/api/agents' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body?.id || !body?.name || !body?.role) { res.writeHead(400); res.end('{"error":"id, name, role required"}'); return; }
      if (useSupabase) {
        await db.createAgent({ id: body.id, company_id: COMPANY_ID, name: body.name, role: body.role, department: body.department || 'Other', reports_to: body.reportsTo || null, adapter_config: { model: body.model || 'deepseek/deepseek-v3.2' } });
      } else {
        const reg = readJSON('company.json') || { agents: [] };
        reg.agents.push({ id: body.id, name: body.name, role: body.role, department: body.department || 'Other', status: 'idle', reportsTo: body.reportsTo || null, adapterConfig: { model: body.model || 'deepseek/deepseek-v3.2' }, budget: { monthlyCentsLimit: 3000, spentCents: 0, totalTokens: 0 }, stats: { totalRuns: 0 } });
        writeJSON('company.json', reg);
      }
      if (body.instructions) {
        writeFileSync(join(PROJECT_ROOT, 'agents', `${body.id}.md`), `# ${body.name} — ${body.role}\n\n## Role\n${body.instructions}\n`);
      }
      res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    }

    // ─── Agent settings ─────────────────────────────
    else if (req.url.match(/^\/api\/settings\/agent\/[\w-]+$/) && req.method === 'PUT') {
      const id = req.url.split('/').pop();
      const body = await parseBody(req);
      if (useSupabase) {
        const updates = {};
        if (body?.model) updates.adapter_config = { model: body.model };
        if (body?.budget) updates.budget_limit_cents = body.budget;
        await db.updateAgent(id, COMPANY_ID, updates);
      } else {
        const reg = readJSON('company.json') || {};
        const agent = (reg.agents || []).find(a => a.id === id);
        if (agent) {
          if (body?.model) agent.adapterConfig = { ...agent.adapterConfig, model: body.model };
          writeJSON('company.json', reg);
        }
      }
      res.writeHead(200); res.end('{"ok":true}');
    }

    // ─── Knowledge ──────────────────────────────────
    else if (req.url === '/api/knowledge' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body?.title || !body?.content) { res.writeHead(400); res.end('{"error":"title and content required"}'); return; }
      if (useSupabase) {
        await db.addKnowledge({ company_id: COMPANY_ID, title: body.title, category: body.category || 'general', content: body.content });
      } else {
        const dir = join(PROJECT_ROOT, 'knowledge', body.category || 'general');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const filename = body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.md';
        writeFileSync(join(dir, filename), `# ${body.title}\n\n${body.content}`);
      }
      res.writeHead(200); res.end('{"ok":true}');
    }
    else if (req.url.startsWith('/api/knowledge/') && req.method === 'DELETE') {
      const id = decodeURIComponent(req.url.replace('/api/knowledge/', ''));
      if (useSupabase) { await db.deleteKnowledge(id); }
      else { try { unlinkSync(join(PROJECT_ROOT, 'knowledge', id)); } catch {} }
      res.writeHead(200); res.end('{"ok":true}');
    }

    // ─── Schedules ──────────────────────────────────
    else if (req.url === '/api/schedules' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body?.name) { res.writeHead(400); res.end('{"error":"name required"}'); return; }
      if (useSupabase) {
        await db.createSchedule({ company_id: COMPANY_ID, name: body.name, agent_id: body.agent || 'ceo', cron: body.cron || '0 9 * * *', task: body.task || '' });
      } else {
        const schedules = readJSON('schedules.json') || [];
        schedules.push({ id: `sched-${Date.now()}`, name: body.name, agent: body.agent, cron: body.cron, task: body.task, enabled: true });
        writeJSON('schedules.json', schedules);
      }
      res.writeHead(200); res.end('{"ok":true}');
    }
    else if (req.url.match(/^\/api\/schedules\/[\w-]+\/toggle$/) && req.method === 'POST') {
      const id = req.url.split('/')[3];
      if (useSupabase) {
        const scheds = await db.getSchedules(COMPANY_ID);
        const s = scheds.find(x => x.id === id);
        if (s) await db.updateSchedule(id, { enabled: !s.enabled });
      } else {
        const schedules = readJSON('schedules.json') || [];
        const s = schedules.find(x => x.id === id);
        if (s) { s.enabled = !s.enabled; writeJSON('schedules.json', schedules); }
      }
      res.writeHead(200); res.end('{"ok":true}');
    }
    else if (req.url.match(/^\/api\/schedules\/[\w-]+$/) && req.method === 'DELETE') {
      const id = req.url.split('/')[3];
      if (useSupabase) { await db.deleteSchedule(id); }
      else { let s = readJSON('schedules.json') || []; s = s.filter(x => x.id !== id); writeJSON('schedules.json', s); }
      res.writeHead(200); res.end('{"ok":true}');
    }

    // ─── Connections ────────────────────────────────
    else if (req.url === '/api/connections/compute' && req.method === 'PUT') {
      const body = await parseBody(req);
      const conn = readJSON('connections.json') || {};
      if (body?.active) conn.compute.active = body.active;
      writeJSON('connections.json', conn);
      res.writeHead(200); res.end('{"ok":true}');
    }
    else if (req.url === '/api/connections/llm' && req.method === 'PUT') {
      const body = await parseBody(req);
      const conn = readJSON('connections.json') || {};
      if (body?.active) conn.llm.active = body.active;
      writeJSON('connections.json', conn);
      res.writeHead(200); res.end('{"ok":true}');
    }
    else if (req.url.match(/^\/api\/connections\/integration\/\w+\/toggle$/) && req.method === 'POST') {
      const id = req.url.split('/')[4];
      const conn = readJSON('connections.json') || {};
      if (conn.integrations?.[id]) {
        conn.integrations[id].status = conn.integrations[id].status === 'connected' ? 'disconnected' : 'connected';
        writeJSON('connections.json', conn);
      }
      res.writeHead(200); res.end('{"ok":true}');
    }
    else if (req.url === '/api/connections/config' && req.method === 'PUT') {
      const body = await parseBody(req);
      if (!body) { res.writeHead(400); res.end('{"error":"body required"}'); return; }
      const conn = readJSON('connections.json') || {};
      const { category, provider, field, value } = body;
      if (category === 'compute' && conn.compute?.providers?.[provider]) {
        conn.compute.providers[provider].config = conn.compute.providers[provider].config || {};
        conn.compute.providers[provider].config[field] = value;
      } else if (category === 'llm' && conn.llm?.providers?.[provider]) {
        conn.llm.providers[provider].config = conn.llm.providers[provider].config || {};
        conn.llm.providers[provider].config[field] = value;
      } else if (category === 'integrations' && conn.integrations?.[provider]) {
        conn.integrations[provider].config = conn.integrations[provider].config || {};
        conn.integrations[provider].config[field] = value;
      }
      writeJSON('connections.json', conn);
      res.writeHead(200); res.end('{"ok":true}');
    }
    else if (req.url.match(/^\/api\/connections\/test\//) && req.method === 'POST') {
      res.writeHead(200); res.end('{"ok":true}');
    }

    // ─── Marketplace ────────────────────────────────
    else if (req.url.match(/^\/api\/marketplace\/[\w-]+\/install$/) && req.method === 'POST') {
      const id = req.url.split('/')[3];
      const templates = readJSON('marketplace.json') || [];
      const template = templates.find(t => t.id === id);
      if (!template) { res.writeHead(404); res.end('{"error":"not found"}'); return; }

      // Actually create agents from template
      const ROLE_MAP = { ceo:'Chief Executive Officer', coo:'Chief Operating Officer', cfo:'Chief Financial Officer', cro:'Chief Revenue Officer', pm:'Product Manager', backend:'Backend Engineer', frontend:'Frontend Engineer', qa:'QA Engineer', compliance:'Compliance Specialist', security:'Security & DevOps', sdr:'Sales Development Rep', marketing:'Content & Marketing', cs:'Customer Success', 'finance-ops':'Finance Operations', data:'Data & Analytics' };
      const DEPT_MAP = { ceo:'Leadership', coo:'Leadership', cfo:'Finance', cro:'Revenue', pm:'Product', backend:'Engineering', frontend:'Engineering', qa:'Quality', compliance:'Quality', security:'Quality', sdr:'Sales', marketing:'Marketing', cs:'Support', 'finance-ops':'Finance', data:'Product' };

      let created = 0;
      for (const agentId of template.agents) {
        if (useSupabase) {
          const existing = await db.getAgent(agentId, COMPANY_ID);
          if (!existing) {
            await db.createAgent({ id: agentId, company_id: COMPANY_ID, name: ROLE_MAP[agentId]?.split(' ')[0] || agentId, role: ROLE_MAP[agentId] || agentId, department: DEPT_MAP[agentId] || 'Other', reports_to: agentId === 'ceo' ? null : 'coo' });
            created++;
          }
        } else {
          const reg = readJSON('company.json') || { agents: [] };
          if (!reg.agents.find(a => a.id === agentId)) {
            reg.agents.push({ id: agentId, name: ROLE_MAP[agentId]?.split(' ')[0] || agentId, role: ROLE_MAP[agentId] || agentId, department: DEPT_MAP[agentId] || 'Other', status: 'idle', reportsTo: agentId === 'ceo' ? null : 'coo', budget: { monthlyCentsLimit: 3000, spentCents: 0, totalTokens: 0 }, stats: { totalRuns: 0 } });
            writeJSON('company.json', reg);
            created++;
          }
        }
      }
      res.writeHead(200); res.end(JSON.stringify({ ok: true, created, total: template.agents.length }));
    }

    // ─── Onboarding ─────────────────────────────────
    else if (req.url === '/api/onboard' && req.method === 'POST') {
      const body = await parseBody(req);
      if (useSupabase) {
        await db.updateCompany(COMPANY_ID, { name: body.name || 'My Company', description: body.description, website: body.website });
      } else {
        const reg = readJSON('company.json') || { company: {}, agents: [] };
        reg.company.name = body.name || reg.company.name;
        if (body.repo) reg.company.repos = [{ id: 'main', url: body.repo, branch: 'main', type: 'product' }];
        if (body.website) reg.company.website = body.website;
        writeJSON('company.json', reg);
      }
      res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    }

    // ─── Company settings ───────────────────────────
    else if (req.url === '/api/settings/company' && req.method === 'PUT') {
      const body = await parseBody(req);
      if (useSupabase) {
        await db.updateCompany(COMPANY_ID, { settings: body });
      } else {
        const reg = readJSON('company.json') || {};
        reg.company = reg.company || {};
        reg.company.settings = { ...reg.company.settings, ...body };
        writeJSON('company.json', reg);
      }
      res.writeHead(200); res.end('{"ok":true}');
    }
    else if (req.url === '/api/settings/repos' && req.method === 'POST') {
      const body = await parseBody(req);
      const reg = readJSON('company.json') || {};
      reg.company = reg.company || {};
      reg.company.repos = reg.company.repos || [];
      reg.company.repos.push({ id: body.id || body.url?.split('/').pop()?.replace('.git', ''), url: body.url, branch: body.branch || 'main', description: body.description });
      writeJSON('company.json', reg);
      res.writeHead(200); res.end('{"ok":true}');
    }
    else if (req.url.startsWith('/api/settings/repos/') && req.method === 'DELETE') {
      const id = req.url.split('/').pop();
      const reg = readJSON('company.json') || {};
      if (reg.company?.repos) { reg.company.repos = reg.company.repos.filter(r => r.id !== id); writeJSON('company.json', reg); }
      res.writeHead(200); res.end('{"ok":true}');
    }

    // ─── Chat ───────────────────────────────────────
    else if (req.url === '/api/chat' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body?.message) { res.writeHead(400); res.end('{"error":"message required"}'); return; }
      const msg = body.message.trim();
      const lower = msg.toLowerCase();

      let reply;

      // Status command
      if (lower === 'status' || lower === 'update') {
        let tasks, agents;
        if (useSupabase) {
          tasks = await db.getTasks(COMPANY_ID);
          agents = await db.getAgents(COMPANY_ID);
        } else {
          tasks = readJSON('backlog.json') || [];
          agents = (readJSON('company.json') || {}).agents || [];
        }
        const c = {}; tasks.forEach(t => { c[t.status] = (c[t.status] || 0) + 1; });
        const spent = agents.reduce((s, a) => s + (a.budget_spent_cents ?? a.budget?.spentCents ?? 0), 0);
        const running = agents.filter(a => a.status === 'running').length;
        reply = `Pipeline: ${c['todo'] || 0} todo, ${c['in-progress'] || 0} building, ${c['review'] || 0} review, ${c['ready'] || 0} ready\n\nAgents: ${running} running / ${agents.length} total\nBudget: $${(spent / 100).toFixed(2)} spent`;
      }
      // Merge command
      else if (lower.startsWith('merge ')) {
        const id = msg.split(' ')[1]?.toUpperCase();
        if (useSupabase) {
          await db.updateTask(id, COMPANY_ID, { status: 'merged' });
        } else {
          const bl = readJSON('backlog.json') || [];
          const t = bl.find(x => x.id === id);
          if (t) { t.status = 'merged'; writeJSON('backlog.json', bl); }
        }
        reply = `${id} merged.`;
      }
      // Help
      else if (lower === 'help') {
        reply = `Commands:\n- status — pipeline report\n- merge TASK-XXX — merge a ready task\n- Any text — sets it as a goal for the PM\n\nYou can also use Telegram (@Balnce_COO_Bot) for the same commands on mobile.`;
      }
      // Anything else = goal
      else {
        // Save as a goal for next engine round
        if (useSupabase) {
          await db.log(COMPANY_ID, 'founder', `Goal: ${msg}`);
        }
        const goalsFile = join(PROJECT_ROOT, 'data', 'goals.json');
        const goals = existsSync(goalsFile) ? JSON.parse(readFileSync(goalsFile, 'utf-8')) : [];
        goals.push({ text: msg, timestamp: new Date().toISOString() });
        writeFileSync(goalsFile, JSON.stringify(goals, null, 2));
        reply = `Got it. PM will break "${msg.substring(0, 50)}" into tasks on the next round.`;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reply }));
    }

    // ─── Pages ──────────────────────────────────────
    else if (req.url === '/setup' || req.url === '/onboarding') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(readFileSync(join(__dirname, 'onboarding.html'), 'utf-8'));
    }
    else if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(readFileSync(join(__dirname, 'index.html'), 'utf-8'));
    }
    else { res.writeHead(404); res.end('Not found'); }

  } catch (e) {
    console.error('Server error:', e.message);
    res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n  TROVEK — Dashboard`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Backend: ${useSupabase ? 'Supabase' : 'JSON files'}\n`);
});
