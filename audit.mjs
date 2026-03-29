const BASE = 'http://localhost:3000';
const R = { pass: 0, fail: 0, issues: [] };

async function fj(url, opts) { const r = await fetch(url, opts); return { status: r.status, data: await r.json().catch(() => null), ok: r.ok }; }
async function fh(url) { const r = await fetch(url); return { status: r.status, html: await r.text(), ok: r.ok }; }

function chk(name, pass, detail) {
  if (pass) { R.pass++; console.log('  PASS:', name); }
  else { R.fail++; R.issues.push({ name, detail }); console.log('  FAIL:', name, detail || ''); }
}

async function run() {
  console.log('=== TROVEK FULL AUDIT ===\n');

  console.log('--- PAGES ---');
  const d = await fh(BASE);
  chk('Dashboard loads', d.ok && d.html.includes('Trovek'));
  chk('All 11 tabs exist', ['overview','engineering','sales','tickets','flow','marketplace','schedule','knowledge','connections','monitor','settings'].every(t => d.html.includes("switchTab('" + t + "')")));
  chk('Chat panel', d.html.includes('chat-panel'));
  chk('Sidebar', d.html.includes('sidebar-nav'));
  chk('Logo SVG', d.html.includes('<svg') && d.html.includes('Trovek'));
  chk('Pure black theme', d.html.includes('--bg:#000'));
  const s = await fh(BASE + '/setup');
  chk('Onboarding loads', s.ok && s.html.includes('step-5'));

  console.log('\n--- API STATE ---');
  const st = await fj(BASE + '/api/state');
  chk('/api/state 200', st.ok);
  chk('Agents exist', (st.data?.registry?.agents?.length || 0) > 0, st.data?.registry?.agents?.length + ' agents');
  chk('Company name', !!st.data?.registry?.company?.name, st.data?.registry?.company?.name);
  chk('Runs exist', (st.data?.runs?.length || 0) > 0, st.data?.runs?.length + ' runs');
  chk('Activity exists', (st.data?.activity?.length || 0) > 0, st.data?.activity?.length + ' entries');
  chk('Connections.compute', !!st.data?.connections?.compute);
  chk('Connections.llm', !!st.data?.connections?.llm);
  chk('Connections.integrations', !!st.data?.connections?.integrations);
  chk('Marketplace templates', (st.data?.marketplace?.length || 0) > 0, st.data?.marketplace?.length + ' templates');
  chk('Backlog is array', Array.isArray(st.data?.backlog));
  chk('Prospects is array', Array.isArray(st.data?.prospects));

  console.log('\n--- API CRUD ---');
  const c1 = await fj(BASE + '/api/chat', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({message:'status'}) });
  chk('Chat status', c1.ok && c1.data?.reply?.includes('Pipeline'));
  const c2 = await fj(BASE + '/api/chat', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({message:'help'}) });
  chk('Chat help', c2.ok && c2.data?.reply?.includes('Commands'));
  const c3 = await fj(BASE + '/api/chat', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({message:'Build login page'}) });
  chk('Chat goal', c3.ok && c3.data?.reply?.includes('PM'));
  const t1 = await fj(BASE + '/api/tasks', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({title:'Audit task',type:'backend'}) });
  chk('Create task', t1.ok);
  const k1 = await fj(BASE + '/api/knowledge', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({title:'Audit doc',category:'company',content:'Test'}) });
  chk('Create knowledge', k1.ok);
  const sc1 = await fj(BASE + '/api/schedules', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name:'Audit sched',agent:'ceo',cron:'0 9 * * *',task:'Test'}) });
  chk('Create schedule', sc1.ok);
  const se1 = await fj(BASE + '/api/settings/company', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({defaultModel:'deepseek/deepseek-v3.2'}) });
  chk('Update settings', se1.ok);
  const co1 = await fj(BASE + '/api/connections/compute', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({active:'local'}) });
  chk('Set compute', co1.ok);
  const co2 = await fj(BASE + '/api/connections/llm', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({active:'tensorix'}) });
  chk('Set LLM', co2.ok);
  const co3 = await fj(BASE + '/api/connections/integration/telegram/toggle', { method: 'POST' });
  chk('Toggle integration', co3.ok);
  const co4 = await fj(BASE + '/api/connections/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category:'compute',provider:'oracle',field:'host',value:'test'}) });
  chk('Update conn config', co4.ok);
  const ob1 = await fj(BASE + '/api/onboard', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name:'Test'}) });
  chk('Onboarding API', ob1.ok);

  console.log('\n--- FRONTEND FUNCTIONS ---');
  const fns = ['rSB','rP','rTK','rAC','rAD','rT','rF','rMP','rSched','rKB','rConn','rMon','rS','updateControls','toggleSidebar','toggleChat','sendChat','selectAgent','switchTab','filterTickets','createTask','connRow','showFlowDetail','toggleFlowFullscreen','showAddAgent','addAgent','installTemplate'];
  for (const fn of fns) {
    chk(fn + '()', d.html.includes('function ' + fn) || d.html.includes('async function ' + fn));
  }

  console.log('\n--- SECURITY ---');
  chk('No API keys in HTML', !d.html.includes('sk--') && !d.html.includes('sb_secret'));
  chk('No bot token in HTML', !d.html.includes('8792157527'));
  chk('No Supabase URL in HTML', !d.html.includes('twbpajktmj'));

  console.log('\n--- DATA QUALITY ---');
  const agents = st.data?.registry?.agents || [];
  chk('All agents have id', agents.every(a => a.id));
  chk('All agents have role', agents.every(a => a.role));
  chk('All agents have department', agents.every(a => a.department));
  const conns = st.data?.connections || {};
  chk('5+ compute providers', Object.keys(conns.compute?.providers || {}).length >= 5);
  chk('5+ LLM providers', Object.keys(conns.llm?.providers || {}).length >= 5);
  chk('8+ integrations', Object.keys(conns.integrations || {}).length >= 8);

  console.log('\n=============================');
  console.log('PASS:', R.pass, '/', R.pass + R.fail);
  console.log('FAIL:', R.fail);
  if (R.issues.length) { console.log('\nISSUES TO FIX:'); R.issues.forEach(i => console.log('  -', i.name, i.detail || '')); }
  else console.log('\nALL CLEAR');
}

run().catch(e => console.error('CRASH:', e));
