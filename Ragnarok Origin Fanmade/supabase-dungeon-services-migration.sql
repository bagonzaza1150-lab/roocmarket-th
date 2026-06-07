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

alter table public.marketplace_listings
add column if not exists listing_type text not null default 'sell';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'marketplace_listings_listing_type_check'
  ) then
    alter table public.marketplace_listings
    drop constraint marketplace_listings_listing_type_check;
  end if;

  alter table public.marketplace_listings
  add constraint marketplace_listings_listing_type_check
  check (listing_type in ('sell', 'buy', 'service'));
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'marketplace_listings_category_check'
  ) then
    alter table public.marketplace_listings
    drop constraint marketplace_listings_category_check;
  end if;

  alter table public.marketplace_listings
  add constraint marketplace_listings_category_check
  check (category in ('mvp', 'accessories', 'fashion', 'account', 'dungeon'));
end $$;

create or replace function public.market_hourly_listing_count(
  target_user_id uuid default auth.uid(),
  target_listing_type text default 'sell'
)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.marketplace_listings
  where user_id = target_user_id
    and listing_type = target_listing_type
    and created_at >= now() - interval '1 hour';
$$;

create or replace function public.market_active_listing_count(
  target_user_id uuid default auth.uid(),
  excluded_listing_id uuid default null,
  target_listing_type text default 'sell'
)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.marketplace_listings
  where user_id = target_user_id
    and listing_type = target_listing_type
    and active = true
    and sale_status = 'active'
    and (expires_at is null or expires_at > now())
    and (excluded_listing_id is null or id <> excluded_listing_id);
$$;

grant execute on function public.market_hourly_listing_count(uuid, text) to anon, authenticated;
grant execute on function public.market_active_listing_count(uuid, uuid, text) to anon, authenticated;

drop policy if exists "Authenticated users can insert marketplace_listings" on public.marketplace_listings;
create policy "Authenticated users can insert marketplace_listings"
on public.marketplace_listings
for insert
to authenticated
with check (
  active = true
  and sale_status = 'active'
  and listing_type in ('sell', 'buy', 'service')
  and (listing_type = 'sell' or category <> 'account')
  and (listing_type <> 'service' or category = 'dungeon')
  and expires_at is not null
  and auth.uid() = user_id
  and public.market_hourly_listing_count(auth.uid(), listing_type) < public.market_listing_limit(auth.uid())
  and public.market_active_listing_count(auth.uid(), null, listing_type) < public.market_listing_limit(auth.uid())
  and not exists (
    select 1
    from public.marketplace_banned_users banned
    where banned.user_id = auth.uid()
      and banned.active = true
  )
);
