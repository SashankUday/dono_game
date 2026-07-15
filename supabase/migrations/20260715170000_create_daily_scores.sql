-- Daily Challenge leaderboard scores.
-- This migration is intentionally not applied by this change.

create table public.daily_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  challenge_date date not null,
  score integer not null check (score >= 0),
  best_streak integer not null check (best_streak >= 0),
  created_at timestamp with time zone not null default now(),
  constraint daily_scores_display_name_length
    check (char_length(btrim(display_name)) between 2 and 24),
  constraint daily_scores_display_name_trimmed
    check (display_name = btrim(display_name)),
  constraint daily_scores_one_score_per_user_date
    unique (user_id, challenge_date)
);

create index daily_scores_leaderboard_sort_idx
  on public.daily_scores (
    challenge_date,
    score desc,
    best_streak desc,
    created_at asc
  );

alter table public.daily_scores enable row level security;

revoke all on table public.daily_scores from anon;
revoke all on table public.daily_scores from authenticated;

grant select, insert on table public.daily_scores to authenticated;

create policy "Authenticated users can read daily leaderboard scores"
  on public.daily_scores
  for select
  to authenticated
  using (true);

create policy "Authenticated users can submit their own daily score"
  on public.daily_scores
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
