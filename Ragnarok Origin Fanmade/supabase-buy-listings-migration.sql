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
  check (listing_type in ('sell', 'buy'));
end $$;

drop index if exists public.marketplace_listings_public_idx;
create index if not exists marketplace_listings_public_idx
  on public.marketplace_listings (active, sale_status, listing_type, category, created_at desc);

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
  and listing_type in ('sell', 'buy')
  and (listing_type = 'sell' or category <> 'account')
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

drop policy if exists "Authenticated users can update own marketplace_listings" on public.marketplace_listings;
create policy "Authenticated users can update own marketplace_listings"
on public.marketplace_listings
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and (
    active = false
    or sale_status <> 'active'
    or public.market_active_listing_count(auth.uid(), id, listing_type) < public.market_listing_limit(auth.uid())
  )
);
