create table if not exists public.marketplace_dungeons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_dungeons_public_idx
  on public.marketplace_dungeons (active, sort_order, name);

drop trigger if exists marketplace_dungeons_set_updated_at on public.marketplace_dungeons;
create trigger marketplace_dungeons_set_updated_at
before update on public.marketplace_dungeons
for each row execute function public.set_updated_at();

alter table public.marketplace_dungeons enable row level security;

grant select on table public.marketplace_dungeons to anon;
grant all privileges on table public.marketplace_dungeons to authenticated;

drop policy if exists "Public can read active marketplace dungeons" on public.marketplace_dungeons;
create policy "Public can read active marketplace dungeons"
on public.marketplace_dungeons
for select
to anon, authenticated
using (active = true);

drop policy if exists "Authenticated admins can read all marketplace dungeons" on public.marketplace_dungeons;
create policy "Authenticated admins can read all marketplace dungeons"
on public.marketplace_dungeons
for select
to authenticated
using (public.is_market_admin());

drop policy if exists "Authenticated admins can insert marketplace dungeons" on public.marketplace_dungeons;
create policy "Authenticated admins can insert marketplace dungeons"
on public.marketplace_dungeons
for insert
to authenticated
with check (public.is_market_admin());

drop policy if exists "Authenticated admins can update marketplace dungeons" on public.marketplace_dungeons;
create policy "Authenticated admins can update marketplace dungeons"
on public.marketplace_dungeons
for update
to authenticated
using (public.is_market_admin())
with check (public.is_market_admin());

drop policy if exists "Authenticated admins can delete marketplace dungeons" on public.marketplace_dungeons;
create policy "Authenticated admins can delete marketplace dungeons"
on public.marketplace_dungeons
for delete
to authenticated
using (public.is_market_admin());
