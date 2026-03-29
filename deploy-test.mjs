const BASE = 'http://localhost:3000';
const R = { pass: 0, fail: 0, issues: [] };
function chk(n, p, d) { if(p){R.pass++;console.log('  PASS:',n)}else{R.fail++;R.issues.push({n,d});console.log('  FAIL:',n,d||'')} }
async function fj(u, o) { const r=await fetch(u,o); return {status:r.status,data:await r.json().catch(()=>null),ok:r.ok} }

async function run() {
  console.log('=== TROVEK DEPLOYMENT TEST ===\n');

  console.log('--- 1. ONBOARDING ---');
  const s1 = await fetch(BASE+'/setup');
  chk('Setup page', s1.ok);
  const ob = await fj(BASE+'/api/onboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Deploy Test',description:'Testing',website:'https://example.com'})});
  chk('Onboard API', ob.ok);

  console.log('\n--- 2. STATE ---');
  const st = await fj(BASE+'/api/state');
  chk('State loads', st.ok);
  chk('Has agents', (st.data?.registry?.agents?.length||0)>0);
  chk('Has company', !!st.data?.registry?.company);
  chk('Has runs', Array.isArray(st.data?.runs));
  chk('Has activity', Array.isArray(st.data?.activity));
  chk('Has connections', !!st.data?.connections?.compute);
  chk('Has marketplace', (st.data?.marketplace?.length||0)>0);

  console.log('\n--- 3. CONNECTIONS ---');
  chk('Set LLM', (await fj(BASE+'/api/connections/llm',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:'tensorix'})})).ok);
  chk('Set compute', (await fj(BASE+'/api/connections/compute',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:'oracle'})})).ok);
  chk('Config host', (await fj(BASE+'/api/connections/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:'compute',provider:'oracle',field:'host',value:'145.241.243.171'})})).ok);
  chk('Toggle telegram', (await fj(BASE+'/api/connections/integration/telegram/toggle',{method:'POST'})).ok);

  console.log('\n--- 4. TASKS ---');
  chk('Create task', (await fj(BASE+'/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Deploy test task',type:'backend',priority:'high'})})).ok);

  console.log('\n--- 5. CHAT ---');
  const c1 = await fj(BASE+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'status'})});
  chk('Chat status', c1.ok && !!c1.data?.reply);
  const c2 = await fj(BASE+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'help'})});
  chk('Chat help', c2.ok && !!c2.data?.reply);
  const c3 = await fj(BASE+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Build a dashboard'})});
  chk('Chat goal', c3.ok && !!c3.data?.reply);

  console.log('\n--- 6. KNOWLEDGE ---');
  chk('Add doc', (await fj(BASE+'/api/knowledge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Test doc',category:'product',content:'Test content'})})).ok);

  console.log('\n--- 7. SCHEDULE ---');
  chk('Add schedule', (await fj(BASE+'/api/schedules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Test job',agent:'ceo',cron:'0 9 * * *',task:'Audit'})})).ok);

  console.log('\n--- 8. MARKETPLACE ---');
  chk('Install template', (await fj(BASE+'/api/marketplace/saas-starter/install',{method:'POST'})).ok);

  console.log('\n--- 9. AGENT CRUD ---');
  chk('Create agent', (await fj(BASE+'/api/agents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'deploy-test-agent',name:'Test',role:'Test Agent',department:'Quality'})})).ok);
  chk('Update agent model', (await fj(BASE+'/api/settings/agent/backend',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek/deepseek-r1-0528'})})).ok);

  console.log('\n--- 10. ENGINE (Oracle) ---');
  try {
    const {execSync} = await import('child_process');
    const status = execSync('ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -i ~/.ssh/oracle_opc ubuntu@145.241.243.171 "sudo systemctl is-active trovek" 2>/dev/null',{encoding:'utf-8'}).trim();
    chk('Engine running on Oracle', status==='active');
    const logs = execSync('ssh -o ConnectTimeout=5 -i ~/.ssh/oracle_opc ubuntu@145.241.243.171 "sudo journalctl -u trovek --no-pager -n 3" 2>/dev/null',{encoding:'utf-8'});
    chk('Engine producing output', logs.includes('Round') || logs.includes('agent') || logs.includes('Trovek'));
  } catch(e) { chk('Engine on Oracle', false, e.message.substring(0,60)); }

  console.log('\n--- 11. SUPABASE ---');
  const final = await fj(BASE+'/api/state');
  chk('Agents from Supabase', (final.data?.registry?.agents?.length||0)>=8);
  chk('Runs from Supabase', (final.data?.runs?.length||0)>0);

  console.log('\n--- 12. SECURITY ---');
  const html = await (await fetch(BASE)).text();
  chk('No secrets in HTML', !html.includes('sk--') && !html.includes('sb_secret') && !html.includes('8792157527'));

  console.log('\n================================');
  console.log('RESULT:', R.pass+'/'+(R.pass+R.fail), 'PASSED');
  if(R.fail) { console.log('FAILURES:'); R.issues.forEach(i=>console.log('  -',i.n,i.d||'')); }
  else console.log('STATUS: PRODUCTION READY');
}

run().catch(e=>console.error('CRASH:',e));
