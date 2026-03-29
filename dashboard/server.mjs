#!/usr/bin/env node
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const PORT = 3000;

function readJSON(f) { const p = join(PROJECT_ROOT, f); if (!existsSync(p)) return null; try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; } }
function writeJSON(f, d) { writeFileSync(join(PROJECT_ROOT, f), JSON.stringify(d, null, 2), 'utf-8'); }
function readText(f) { const p = join(PROJECT_ROOT, f); if (!existsSync(p)) return ''; return readFileSync(p, 'utf-8'); }

function getKnowledge() {
  const kbDir = join(PROJECT_ROOT, 'knowledge');
  const docs = [];
  const categories = ['company', 'product', 'domain', 'customers', 'competitors'];
  for (const cat of categories) {
    const dir = join(kbDir, cat);
    if (!existsSync(dir)) continue;
    try {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.md') && !file.endsWith('.txt') && !file.endsWith('.json')) continue;
        const content = readFileSync(join(dir, file), 'utf-8');
        const title = content.split('\n')[0]?.replace(/^#+\s*/, '') || file;
        docs.push({ title, category: cat, filename: `${cat}/${file}`, content });
      }
    } catch {}
  }
  return docs;
}

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

  // GET /api/state
  if (req.url === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      backlog: readJSON('backlog.json') || [],
      prospects: readJSON('prospects.json') || [],
      activity: (readText('workspace/activity.log') || '').split('\n').filter(l => l.trim()),
      agentLogs: getAgentLogs(),
      registry: readJSON('company.json') || { agents: [] },
      runs: readJSON('data/runs.json') || [],
      connections: readJSON('connections.json') || {},
      knowledge: getKnowledge(),
      agenda: readJSON('agenda.json'),
      timestamp: new Date().toISOString()
    }));
  }
  // PUT /api/connections/compute
  else if (req.url === '/api/connections/compute' && req.method === 'PUT') {
    const body = await parseBody(req);
    const conn = readJSON('connections.json') || {};
    if (body?.active) conn.compute.active = body.active;
    writeJSON('connections.json', conn);
    res.writeHead(200); res.end('{"ok":true}');
  }
  // PUT /api/connections/llm
  else if (req.url === '/api/connections/llm' && req.method === 'PUT') {
    const body = await parseBody(req);
    const conn = readJSON('connections.json') || {};
    if (body?.active) conn.llm.active = body.active;
    writeJSON('connections.json', conn);
    res.writeHead(200); res.end('{"ok":true}');
  }
  // POST /api/connections/integration/:id/toggle
  else if (req.url.match(/^\/api\/connections\/integration\/\w+\/toggle$/) && req.method === 'POST') {
    const id = req.url.split('/')[4];
    const conn = readJSON('connections.json') || {};
    if (conn.integrations?.[id]) {
      conn.integrations[id].status = conn.integrations[id].status === 'connected' ? 'disconnected' : 'connected';
      writeJSON('connections.json', conn);
    }
    res.writeHead(200); res.end('{"ok":true}');
  }
  // POST /api/connections/test/:type/:id
  else if (req.url.match(/^\/api\/connections\/test\//) && req.method === 'POST') {
    // Placeholder — would actually test the connection
    res.writeHead(200); res.end('{"ok":true}');
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
  // GET knowledge files for state
  // (injected into /api/state response above)

  // POST /api/knowledge — add a document
  else if (req.url === '/api/knowledge' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body?.title || !body?.content) { res.writeHead(400); res.end('{"error":"title and content required"}'); return; }
    const filename = body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '') + '.md';
    const category = body.category || 'company';
    const dir = join(PROJECT_ROOT, 'knowledge', category);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), `# ${body.title}\n\n${body.content}`);
    res.writeHead(200); res.end(JSON.stringify({ ok: true, filename: `${category}/${filename}` }));
  }
  // DELETE /api/knowledge/:filename
  else if (req.url.startsWith('/api/knowledge/') && req.method === 'DELETE') {
    const filename = decodeURIComponent(req.url.replace('/api/knowledge/', ''));
    const filepath = join(PROJECT_ROOT, 'knowledge', filename);
    try { unlinkSync(filepath); } catch {}
    res.writeHead(200); res.end('{"ok":true}');
  }
  // POST /api/agents — create a new agent
  else if (req.url === '/api/agents' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body?.id || !body?.name || !body?.role) { res.writeHead(400); res.end('{"error":"id, name, role required"}'); return; }
    const reg = readJSON('company.json') || { agents: [] };
    if (reg.agents.find(a => a.id === body.id)) { res.writeHead(400); res.end('{"error":"agent ID already exists"}'); return; }
    reg.agents.push({
      id: body.id, name: body.name, role: body.role,
      department: body.department || 'Other',
      status: 'idle', reportsTo: body.reportsTo || null,
      permissions: {},
      adapterConfig: { model: body.model || 'deepseek/deepseek-v3.2', promptFile: `agents/${body.id}.md` },
      budget: { monthlyCentsLimit: 3000, spentCents: 0, totalTokens: 0 },
      stats: { totalRuns: 0 }
    });
    writeJSON('company.json', reg);
    // Write agent instructions file if provided
    if (body.instructions) {
      const agentPath = join(PROJECT_ROOT, 'agents', `${body.id}.md`);
      writeFileSync(agentPath, `# ${body.name} — ${body.role}\n\n## Role\n${body.instructions}\n`);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, id: body.id }));
  }
  // Serve dashboard
  else if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(readFileSync(join(__dirname, 'index.html'), 'utf-8'));
  }
  else { res.writeHead(404); res.end('Not found'); }
});

server.listen(PORT, () => { console.log(`\n  NIGHTSHIFT AI COMPANY — Dashboard\n  http://localhost:${PORT}\n`); });
