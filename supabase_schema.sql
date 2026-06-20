create table if not exists public.question_progress (
  profile text primary key,
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.question_progress enable row level security;

drop policy if exists "public read question progress" on public.question_progress;
create policy "public read question progress"
on public.question_progress
for select
using (true);

drop policy if exists "public insert question progress" on public.question_progress;
create policy "public insert question progress"
on public.question_progress
for insert
with check (true);

drop policy if exists "public update question progress" on public.question_progress;
create policy "public update question progress"
on public.question_progress
for update
using (true)
with check (true);
