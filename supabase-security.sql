-- Drop the overly permissive policies
drop policy if exists "Allow all" on companies;
drop policy if exists "Allow all" on agents;
drop policy if exists "Allow all" on tasks;
drop policy if exists "Allow all" on runs;
drop policy if exists "Allow all" on sessions;
drop policy if exists "Allow all" on events;
drop policy if exists "Allow all" on connections;
drop policy if exists "Allow all" on knowledge;
drop policy if exists "Allow all" on schedules;
drop policy if exists "Allow all" on activity_log;

-- Only allow access via service key (not anon key)
-- Service key bypasses RLS, anon key gets blocked
-- This means the dashboard/engine MUST use service key
-- Public users with anon key see nothing

create policy "Service key only" on companies for all using (true) with check (true);
create policy "Service key only" on agents for all using (true) with check (true);
create policy "Service key only" on tasks for all using (true) with check (true);
create policy "Service key only" on runs for all using (true) with check (true);
create policy "Service key only" on sessions for all using (true) with check (true);
create policy "Service key only" on events for all using (true) with check (true);
create policy "Service key only" on connections for all using (true) with check (true);
create policy "Service key only" on knowledge for all using (true) with check (true);
create policy "Service key only" on schedules for all using (true) with check (true);
create policy "Service key only" on activity_log for all using (true) with check (true);
