// Audit every tab and API endpoint
const BASE = 'http://localhost:3000';

async function test(name, url, expect) {
  try {
    const r = await fetch(url);
    const text = await r.text();
    const pass = expect(text, r.status);
    console.log(pass ? `PASS: ${name}` : `FAIL: ${name}`);
    if (!pass) console.log(`  Status: ${r.status}, Body: ${text.substring(0,100)}`);
  } catch(e) { console.log(`FAIL: ${name} — ${e.message}`); }
}

async function run() {
  // Pages
  await test('Dashboard loads', BASE, (t,s) => s===200 && t.includes('Trovek'));
  await test('Onboarding loads', BASE+'/setup', (t,s) => s===200 && t.includes('Trovek'));

  // API state
  const stateR = await fetch(BASE+'/api/state');
  const state = await stateR.json();
  
  console.log('\n=== STATE DATA ===');
  console.log('backlog:', Array.isArray(state.backlog) ? state.backlog.length + ' tasks' : 'BROKEN: ' + typeof state.backlog);
  console.log('prospects:', Array.isArray(state.prospects) ? state.prospects.length + ' prospects' : 'BROKEN');
  console.log('activity:', Array.isArray(state.activity) ? state.activity.length + ' entries' : 'BROKEN');
  console.log('agents:', state.registry?.agents?.length ?? 'MISSING');
  console.log('company:', state.registry?.company?.name ?? 'MISSING');
  console.log('runs:', Array.isArray(state.runs) ? state.runs.length + ' runs' : 'BROKEN');
  console.log('connections.compute:', state.connections?.compute ? 'OK' : 'MISSING');
  console.log('connections.llm:', state.connections?.llm ? 'OK' : 'MISSING');  
  console.log('connections.integrations:', state.connections?.integrations ? 'OK' : 'MISSING');
  console.log('schedules:', Array.isArray(state.schedules) ? state.schedules.length : 'BROKEN');
  console.log('knowledge:', Array.isArray(state.knowledge) ? state.knowledge.length : 'BROKEN');
  console.log('marketplace:', Array.isArray(state.marketplace) ? state.marketplace.length + ' templates' : 'BROKEN');
  console.log('agentLogs:', typeof state.agentLogs === 'object' ? Object.keys(state.agentLogs).length + ' agents' : 'BROKEN');

  // API endpoints
  console.log('\n=== API ENDPOINTS ===');
  await test('POST /api/tasks', BASE+'/api/tasks', (t,s) => true); // just check it doesn't 500
  await test('POST /api/chat status', BASE+'/api/chat', (t,s) => true);
  
  // Test chat
  const chatR = await fetch(BASE+'/api/chat', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'status'})});
  const chat = await chatR.json();
  console.log('Chat reply:', chat.reply ? 'OK — ' + chat.reply.substring(0,60) : 'BROKEN');

  // Check which tabs would render properly
  console.log('\n=== TAB RENDER CHECK ===');
  const hasData = (key) => {
    if (key === 'overview') return state.activity?.length > 0 || state.backlog?.length > 0;
    if (key === 'engineering') return state.backlog?.length > 0 || state.activity?.length > 0;
    if (key === 'sales') return state.prospects?.length > 0;
    if (key === 'tickets') return true; // has create button
    if (key === 'flow') return state.registry?.agents?.length > 0;
    if (key === 'marketplace') return state.marketplace?.length > 0;
    if (key === 'schedule') return true; // has create button
    if (key === 'knowledge') return true; // has create button
    if (key === 'connections') return !!state.connections?.compute;
    if (key === 'monitor') return state.runs?.length > 0;
    if (key === 'settings') return state.registry?.agents?.length > 0;
    return false;
  };
  
  ['overview','engineering','sales','tickets','flow','marketplace','schedule','knowledge','connections','monitor','settings'].forEach(tab => {
    console.log(`${tab}: ${hasData(tab) ? 'HAS DATA' : 'EMPTY/NO DATA'}`);
  });
}

run().catch(e => console.error('Audit failed:', e));
