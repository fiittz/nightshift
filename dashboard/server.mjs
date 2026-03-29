#!/usr/bin/env node
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const PORT = 3000;

function readJSON(f) { const p = join(PROJECT_ROOT, f); if (!existsSync(p)) return null; try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; } }
function writeJSON(f, d) { writeFileSync(join(PROJECT_ROOT, f), JSON.stringify(d, null, 2), 'utf-8'); }
function readText(f) { const p = join(PROJECT_ROOT, f); if (!existsSync(p)) return ''; return readFileSync(p, 'utf-8'); }

function getAgentLogs() {
  const reg = readJSON('company.json') || { agents: [] };
  const ids = reg.agents.map(a => a.id);
  const logs = {};
  for (const a of ids) {
    const p = join(PROJECT_ROOT, 'workspace', `${a}-output.log`);
    logs[a] = existsSync(p) ? readFileSync(p, 'utf-8').split('\n').slice(-50).join('\n') : 'No output yet';
  }
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

  // GET /api/state — full dashboard state
  if (req.url === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      backlog: readJSON('backlog.json') || [],
      prospects: readJSON('prospects.json') || [],
      activity: (readText('workspace/activity.log') || '').split('\n').filter(l => l.trim()),
      agentLogs: getAgentLogs(),
      registry: readJSON('company.json') || { agents: [] },
      runs: readJSON('data/runs.json') || [],
      agenda: readJSON('agenda.json'),
      timestamp: new Date().toISOString()
    }));
  }
  // POST /api/settings/repos — add a repo
  else if (req.url === '/api/settings/repos' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body || !body.url) { res.writeHead(400); res.end('{"error":"url required"}'); return; }
    const reg = readJSON('company.json') || {};
    reg.company = reg.company || {};
    reg.company.repos = reg.company.repos || [];
    reg.company.repos.push({
      id: body.id || body.url.split('/').pop().replace('.git', ''),
      url: body.url,
      branch: body.branch || 'main',
      path: body.path || `/home/daytona/${body.url.split('/').pop().replace('.git', '')}`,
      type: body.type || 'product',
      description: body.description || ''
    });
    writeJSON('company.json', reg);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }
  // DELETE /api/settings/repos/:id
  else if (req.url.startsWith('/api/settings/repos/') && req.method === 'DELETE') {
    const id = req.url.split('/').pop();
    const reg = readJSON('company.json') || {};
    if (reg.company?.repos) {
      reg.company.repos = reg.company.repos.filter(r => r.id !== id);
      writeJSON('company.json', reg);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }
  // PUT /api/settings/company — update company settings
  else if (req.url === '/api/settings/company' && req.method === 'PUT') {
    const body = await parseBody(req);
    if (!body) { res.writeHead(400); res.end('{"error":"body required"}'); return; }
    const reg = readJSON('company.json') || {};
    reg.company = reg.company || {};
    reg.company.settings = { ...reg.company.settings, ...body };
    writeJSON('company.json', reg);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }
  // PUT /api/settings/agent/:id — update an agent
  else if (req.url.startsWith('/api/settings/agent/') && req.method === 'PUT') {
    const id = req.url.split('/').pop();
    const body = await parseBody(req);
    if (!body) { res.writeHead(400); res.end('{"error":"body required"}'); return; }
    const reg = readJSON('company.json') || {};
    const agent = (reg.agents || []).find(a => a.id === id);
    if (!agent) { res.writeHead(404); res.end('{"error":"agent not found"}'); return; }
    if (body.model) agent.adapterConfig.model = body.model;
    if (body.budget) agent.budget.monthlyCentsLimit = body.budget;
    if (body.status) agent.status = body.status;
    writeJSON('company.json', reg);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }
  // POST /api/tasks — create a new task
  else if (req.url === '/api/tasks' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body || !body.title) { res.writeHead(400); res.end('{"error":"title required"}'); return; }
    const backlog = readJSON('backlog.json') || [];
    const maxId = backlog.reduce((m, t) => { const n = parseInt(t.id.replace('TASK-', '')); return n > m ? n : m; }, 0);
    backlog.push({
      id: `TASK-${String(maxId + 1).padStart(3, '0')}`,
      title: body.title,
      description: body.description || '',
      type: body.type || 'backend',
      domain: body.domain || 'general',
      priority: body.priority || 'medium',
      status: 'todo',
      assignee: null,
      branch: null,
      review_file: null,
      compliance_status: null,
      compliance_file: null,
      security_status: null,
      security_file: null
    });
    writeJSON('backlog.json', backlog);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, id: backlog[backlog.length - 1].id }));
  }
  // Serve dashboard
  else if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(readFileSync(join(__dirname, 'index.html'), 'utf-8'));
  }
  else { res.writeHead(404); res.end('Not found'); }
});

server.listen(PORT, () => { console.log(`\n  NIGHTSHIFT AI COMPANY — Dashboard\n  http://localhost:${PORT}\n`); });
