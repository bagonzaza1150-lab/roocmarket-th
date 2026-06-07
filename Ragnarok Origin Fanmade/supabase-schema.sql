create extension if not exists "pgcrypto";

create table if not exists public.marketplace_items (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('mvp', 'accessories', 'fashion')),
  name text not null,
  image_url text not null,
  image_path text,
  price_hint text default '',
  description text default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_items_public_idx
  on public.marketplace_items (active, category, sort_order, name);

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('mvp', 'accessories', 'fashion', 'account')),
  item_name text not null,
  title text not null,
  character_name text not null default '',
  seller_name text not null default '',
  seller_avatar_url text not null default '',
  seller_discord_id text not null default '',
  seller_is_premium boolean not null default false,
  image_url text not null,
  image_path text,
  price_text text not null default '',
  server_name text not null default 'ทั้งหมด',
  contact text not null default '',
  description text not null default '',
  middleman boolean not null default true,
  verified_seller boolean not null default false,
  ready_today boolean not null default false,
  active boolean not null default true,
  sale_status text not null default 'active' check (sale_status in ('active', 'closed', 'sold', 'deleted')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_listings_public_idx
  on public.marketplace_listings (active, sale_status, category, created_at desc);

create table if not exists public.marketplace_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discord_id text not null default '',
  display_name text not null default '',
  avatar_url text not null default '',
  email text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists marketplace_profiles_search_idx
  on public.marketplace_profiles (display_name, discord_id);

create table if not exists public.marketplace_premium_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discord_id text not null default '',
  display_name text not null default '',
  avatar_url text not null default '',
  active boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_premium_users_active_idx
  on public.marketplace_premium_users (active, display_name);

create table if not exists public.marketplace_site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.marketplace_admins (user_id)
select id from auth.users
where lower(email) = 'bagonzaza1150@gmail.com'
on conflict (user_id) do nothing;

-- Optional one-time repair for old listings created before Discord login was required.
-- Run this if an old listing appears in "ประกาศของฉัน" but cannot be deleted.
-- update public.marketplace_listings
-- set user_id = (
--   select id from auth.users
--   where lower(email) = 'bagonzaza1150@gmail.com'
--   order by created_at desc
--   limit 1
-- )
-- where user_id is null;

alter table public.marketplace_listings
add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.marketplace_listings
add column if not exists character_name text not null default '';

alter table public.marketplace_listings
add column if not exists seller_name text not null default '';

alter table public.marketplace_listings
add column if not exists seller_avatar_url text not null default '';

alter table public.marketplace_listings
add column if not exists seller_discord_id text not null default '';

alter table public.marketplace_listings
add column if not exists seller_is_premium boolean not null default false;

update public.marketplace_listings as listings
set seller_discord_id = profiles.discord_id
from public.marketplace_profiles as profiles
where listings.user_id = profiles.user_id
  and listings.seller_discord_id = ''
  and profiles.discord_id <> '';

alter table public.marketplace_listings
add column if not exists sale_status text not null default 'active';

alter table public.marketplace_listings
add column if not exists expires_at timestamptz;

update public.marketplace_listings
set sale_status = case
  when active = true then 'active'
  when active = false and sale_status = 'active' then 'closed'
  else sale_status
end;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'marketplace_listings_sale_status_check'
  ) then
    alter table public.marketplace_listings
    drop constraint marketplace_listings_sale_status_check;
  end if;

  alter table public.marketplace_listings
  add constraint marketplace_listings_sale_status_check
  check (sale_status in ('active', 'closed', 'sold', 'deleted'));
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists marketplace_items_set_updated_at on public.marketplace_items;
create trigger marketplace_items_set_updated_at
before update on public.marketplace_items
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_listings_set_updated_at on public.marketplace_listings;
create trigger marketplace_listings_set_updated_at
before update on public.marketplace_listings
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_profiles_set_updated_at on public.marketplace_profiles;
create trigger marketplace_profiles_set_updated_at
before update on public.marketplace_profiles
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_premium_users_set_updated_at on public.marketplace_premium_users;
create trigger marketplace_premium_users_set_updated_at
before update on public.marketplace_premium_users
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_site_settings_set_updated_at on public.marketplace_site_settings;
create trigger marketplace_site_settings_set_updated_at
before update on public.marketplace_site_settings
for each row execute function public.set_updated_at();

alter table public.marketplace_items enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_admins enable row level security;
alter table public.marketplace_profiles enable row level security;
alter table public.marketplace_premium_users enable row level security;
alter table public.marketplace_site_settings enable row level security;

create or replace function public.is_market_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.marketplace_admins
    where user_id = auth.uid()
  );
$$;

create or replace function public.is_market_premium(target_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.marketplace_premium_users
    where user_id = target_user_id
      and active = true
  );
$$;

grant usage on schema public to anon, authenticated;
grant select on table public.marketplace_items to anon;
grant all privileges on table public.marketplace_items to authenticated;
grant select on table public.marketplace_listings to anon;
grant all privileges on table public.marketplace_listings to authenticated;
grant select on table public.marketplace_admins to authenticated;
grant all privileges on table public.marketplace_profiles to authenticated;
grant all privileges on table public.marketplace_premium_users to authenticated;
grant select on table public.marketplace_site_settings to anon;
grant all privileges on table public.marketplace_site_settings to authenticated;
grant execute on function public.is_market_admin() to anon, authenticated;
grant execute on function public.is_market_premium(uuid) to anon, authenticated;

grant usage on schema storage to anon, authenticated;
grant select on table storage.objects to anon;
grant select, insert, update, delete on table storage.objects to authenticated;

drop policy if exists "Public can read active marketplace items" on public.marketplace_items;
create policy "Public can read active marketplace items"
on public.marketplace_items
for select
using (active = true);

drop policy if exists "Authenticated admins can read all marketplace items" on public.marketplace_items;
create policy "Authenticated admins can read all marketplace items"
on public.marketplace_items
for select
to authenticated
using (public.is_market_admin());

drop policy if exists "Authenticated admins can insert marketplace items" on public.marketplace_items;
create policy "Authenticated admins can insert marketplace items"
on public.marketplace_items
for insert
to authenticated
with check (public.is_market_admin());

drop policy if exists "Authenticated admins can update marketplace items" on public.marketplace_items;
create policy "Authenticated admins can update marketplace items"
on public.marketplace_items
for update
to authenticated
using (public.is_market_admin())
with check (public.is_market_admin());

drop policy if exists "Authenticated admins can delete marketplace items" on public.marketplace_items;
create policy "Authenticated admins can delete marketplace items"
on public.marketplace_items
for delete
to authenticated
using (public.is_market_admin());

drop policy if exists "Authenticated users can read own admin status" on public.marketplace_admins;
create policy "Authenticated users can read own admin status"
on public.marketplace_admins
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Authenticated users can read own profile" on public.marketplace_profiles;
create policy "Authenticated users can read own profile"
on public.marketplace_profiles
for select
to authenticated
using (auth.uid() = user_id or public.is_market_admin());

drop policy if exists "Authenticated users can insert own profile" on public.marketplace_profiles;
create policy "Authenticated users can insert own profile"
on public.marketplace_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can update own profile" on public.marketplace_profiles;
create policy "Authenticated users can update own profile"
on public.marketplace_profiles
for update
to authenticated
using (auth.uid() = user_id or public.is_market_admin())
with check (auth.uid() = user_id or public.is_market_admin());

drop policy if exists "Authenticated users can read own premium status" on public.marketplace_premium_users;
create policy "Authenticated users can read own premium status"
on public.marketplace_premium_users
for select
to authenticated
using (auth.uid() = user_id or public.is_market_admin());

drop policy if exists "Authenticated admins can insert premium users" on public.marketplace_premium_users;
create policy "Authenticated admins can insert premium users"
on public.marketplace_premium_users
for insert
to authenticated
with check (public.is_market_admin());

drop policy if exists "Authenticated admins can update premium users" on public.marketplace_premium_users;
create policy "Authenticated admins can update premium users"
on public.marketplace_premium_users
for update
to authenticated
using (public.is_market_admin())
with check (public.is_market_admin());

drop policy if exists "Authenticated admins can delete premium users" on public.marketplace_premium_users;
create policy "Authenticated admins can delete premium users"
on public.marketplace_premium_users
for delete
to authenticated
using (public.is_market_admin());

drop policy if exists "Public can read site settings" on public.marketplace_site_settings;
create policy "Public can read site settings"
on public.marketplace_site_settings
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated admins can insert site settings" on public.marketplace_site_settings;
create policy "Authenticated admins can insert site settings"
on public.marketplace_site_settings
for insert
to authenticated
with check (public.is_market_admin());

drop policy if exists "Authenticated admins can update site settings" on public.marketplace_site_settings;
create policy "Authenticated admins can update site settings"
on public.marketplace_site_settings
for update
to authenticated
using (public.is_market_admin())
with check (public.is_market_admin());

drop policy if exists "Public can read active marketplace listings" on public.marketplace_listings;
drop policy if exists "Public can read marketplace listings" on public.marketplace_listings;
create policy "Public can read marketplace listings"
on public.marketplace_listings
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated users can read own marketplace listings" on public.marketplace_listings;
create policy "Authenticated users can read own marketplace listings"
on public.marketplace_listings
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Public can insert marketplace listings" on public.marketplace_listings;
drop policy if exists "Authenticated users can insert marketplace listings" on public.marketplace_listings;
create policy "Authenticated users can insert marketplace listings"
on public.marketplace_listings
for insert
to authenticated
with check (active = true and sale_status = 'active' and expires_at is not null and auth.uid() = user_id);

drop policy if exists "Authenticated admins can update marketplace listings" on public.marketplace_listings;
create policy "Authenticated admins can update marketplace listings"
on public.marketplace_listings
for update
to authenticated
using (public.is_market_admin() or auth.uid() = user_id)
with check (public.is_market_admin() or auth.uid() = user_id);

drop policy if exists "Authenticated admins can delete marketplace listings" on public.marketplace_listings;
create policy "Authenticated admins can delete marketplace listings"
on public.marketplace_listings
for delete
to authenticated
using (public.is_market_admin() or auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public can read item images" on storage.objects;
create policy "Public can read item images"
on storage.objects
for select
using (bucket_id in ('item-images', 'listing-images'));

drop policy if exists "Public can upload listing images" on storage.objects;
drop policy if exists "Authenticated users can upload listing images" on storage.objects;
create policy "Authenticated users can upload listing images"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'listing-images');

drop policy if exists "Authenticated admins can upload item images" on storage.objects;
create policy "Authenticated admins can upload item images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'listing-images'
  or (bucket_id = 'item-images' and public.is_market_admin())
);

drop policy if exists "Authenticated admins can update item images" on storage.objects;
create policy "Authenticated admins can update item images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'listing-images'
  or (bucket_id = 'item-images' and public.is_market_admin())
)
with check (
  bucket_id = 'listing-images'
  or (bucket_id = 'item-images' and public.is_market_admin())
);

drop policy if exists "Authenticated admins can delete item images" on storage.objects;
create policy "Authenticated admins can delete item images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'listing-images'
  or (bucket_id = 'item-images' and public.is_market_admin())
);
