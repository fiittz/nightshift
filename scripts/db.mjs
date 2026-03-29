/**
 * TROVEK — Supabase Database Layer
 * Replaces JSON file reads/writes with Supabase queries.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('WARNING: SUPABASE_URL or key not set — falling back to JSON files');
}

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

async function query(table, params = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, { headers });
  if (!r.ok) throw new Error(`DB error: ${r.status} ${await r.text()}`);
  return await r.json();
}

async function insert(table, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers, body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(`DB insert error: ${r.status} ${await r.text()}`);
  return await r.json();
}

async function update(table, match, data) {
  const params = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join('&');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'PATCH', headers, body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(`DB update error: ${r.status} ${await r.text()}`);
  return await r.json();
}

async function upsert(table, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(`DB upsert error: ${r.status} ${await r.text()}`);
  return await r.json();
}

async function del(table, match) {
  const params = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join('&');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'DELETE', headers
  });
  if (!r.ok) throw new Error(`DB delete error: ${r.status} ${await r.text()}`);
}

// ─── High-level API ─────────────────────────────────────

export const db = {
  // Company
  async getCompany(id) { const r = await query('companies', `?id=eq.${id}`); return r[0]; },
  async createCompany(data) { return (await insert('companies', data))[0]; },
  async updateCompany(id, data) { return (await update('companies', { id }, data))[0]; },

  // Agents
  async getAgents(companyId) { return query('agents', `?company_id=eq.${companyId}&order=created_at`); },
  async getAgent(id, companyId) { const r = await query('agents', `?id=eq.${id}&company_id=eq.${companyId}`); return r[0]; },
  async createAgent(data) { return (await insert('agents', data))[0]; },
  async updateAgent(id, companyId, data) { return update('agents', { id, company_id: companyId }, data); },
  async deleteAgent(id, companyId) { return del('agents', { id, company_id: companyId }); },

  // Tasks
  async getTasks(companyId) { return query('tasks', `?company_id=eq.${companyId}&order=created_at`); },
  async createTask(data) { return (await insert('tasks', data))[0]; },
  async updateTask(id, companyId, data) { return update('tasks', { id, company_id: companyId }, { ...data, updated_at: new Date().toISOString() }); },

  // Runs
  async getRuns(companyId, limit = 100) { return query('runs', `?company_id=eq.${companyId}&order=created_at.desc&limit=${limit}`); },
  async createRun(data) { return (await insert('runs', data))[0]; },

  // Sessions
  async getSession(agentId, taskKey, companyId) {
    const r = await query('sessions', `?agent_id=eq.${agentId}&task_key=eq.${taskKey}&company_id=eq.${companyId}`);
    return r[0]?.messages || [];
  },
  async saveSession(agentId, taskKey, companyId, messages) {
    return upsert('sessions', { agent_id: agentId, task_key: taskKey, company_id: companyId, messages: messages.slice(-6), updated_at: new Date().toISOString() });
  },

  // Events
  async logEvent(companyId, agentId, type, data) {
    return insert('events', { company_id: companyId, agent_id: agentId, type, data });
  },
  async getEvents(companyId, limit = 200) { return query('events', `?company_id=eq.${companyId}&order=created_at.desc&limit=${limit}`); },

  // Connections
  async getConnections(companyId) { return query('connections', `?company_id=eq.${companyId}`); },
  async upsertConnection(data) { return upsert('connections', data); },

  // Knowledge
  async getKnowledge(companyId) { return query('knowledge', `?company_id=eq.${companyId}&order=created_at.desc`); },
  async addKnowledge(data) { return insert('knowledge', data); },
  async deleteKnowledge(id) { return del('knowledge', { id }); },

  // Schedules
  async getSchedules(companyId) { return query('schedules', `?company_id=eq.${companyId}`); },
  async createSchedule(data) { return insert('schedules', data); },
  async updateSchedule(id, data) { return update('schedules', { id }, data); },
  async deleteSchedule(id) { return del('schedules', { id }); },

  // Activity
  async log(companyId, agentId, message) { return insert('activity_log', { company_id: companyId, agent_id: agentId, message }); },
  async getActivity(companyId, limit = 100) { return query('activity_log', `?company_id=eq.${companyId}&order=created_at.desc&limit=${limit}`); },

  // Raw
  query, insert, update, upsert, del
};
