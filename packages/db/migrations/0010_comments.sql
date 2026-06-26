-- 0010 — Order comments (Epic 10): two-way customer ↔ UDTL thread per load.
-- Customer-visible (NOT private internal notes). Hand-authored + applied via psql.

create table if not exists public.comments (
  id         bigserial primary key,
  load_id    integer not null references public.loads(id) on delete cascade,
  author_id  uuid    references public.users(id) on delete set null,
  body       text    not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_load_idx on public.comments (load_id, created_at);

-- Per-user read state (for the unread indicator). Service-role managed.
create table if not exists public.comment_reads (
  user_id      uuid    not null references public.users(id) on delete cascade,
  load_id      integer not null references public.loads(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, load_id)
);

alter table public.comments      enable row level security;
alter table public.comments      force  row level security;
alter table public.comment_reads enable row level security;
alter table public.comment_reads force  row level security;

-- Comments are visible to anyone who can view the load — both UDTL staff and
-- the load's customers (can_view_load handles org + restricted scoping). This
-- is a shared thread, so there are NO private staff-only comments.
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated
  using (public.can_view_load(load_id));

-- Either side may post, as themselves, on a load they can see.
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_view_load(load_id));

-- comment_reads: written only by the service role (mark-read action), so RLS is
-- on with no policy = default-deny for direct client access.
