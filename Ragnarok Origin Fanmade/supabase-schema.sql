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

create table if not exists public.marketplace_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_servers_public_idx
  on public.marketplace_servers (active, sort_order, name);

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

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  listing_type text not null default 'sell' check (listing_type in ('sell', 'buy', 'service')),
  category text not null check (category in ('mvp', 'accessories', 'fashion', 'account', 'dungeon')),
  item_name text not null,
  title text not null,
  character_name text not null default '',
  seller_name text not null default '',
  seller_avatar_url text not null default '',
  seller_discord_id text not null default '',
  seller_is_premium boolean not null default false,
  seller_profile_frame_id uuid,
  image_url text not null,
  image_path text,
  image_urls jsonb not null default '[]'::jsonb,
  image_paths jsonb not null default '[]'::jsonb,
  price_text text not null default '',
  server_name text not null default 'ทั้งหมด',
  contact text not null default '',
  description text not null default '',
  middleman boolean not null default true,
  offers_enabled boolean not null default false,
  verified_seller boolean not null default false,
  ready_today boolean not null default false,
  active boolean not null default true,
  sale_status text not null default 'active' check (sale_status in ('active', 'closed', 'sold', 'deleted')),
  card_background text not null default 'default',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_listings_public_idx
  on public.marketplace_listings (active, sale_status, listing_type, category, created_at desc);

create table if not exists public.marketplace_listing_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  buyer_display_name text not null default '',
  buyer_avatar_url text not null default '',
  offer_price_text text not null default '',
  message text not null default '',
  status text not null default 'new' check (status in ('new', 'read', 'accepted', 'declined', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_listing_offers_listing_idx
  on public.marketplace_listing_offers (listing_id, created_at desc);

create index if not exists marketplace_listing_offers_buyer_idx
  on public.marketplace_listing_offers (buyer_user_id, created_at desc);

create table if not exists public.marketplace_chat_rooms (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  listing_title text not null default '',
  buyer_name text not null default '',
  seller_name text not null default '',
  last_message text not null default '',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, buyer_user_id)
);

create table if not exists public.marketplace_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.marketplace_chat_rooms(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists marketplace_chat_rooms_buyer_idx
  on public.marketplace_chat_rooms (buyer_user_id, last_message_at desc);

create index if not exists marketplace_chat_rooms_seller_idx
  on public.marketplace_chat_rooms (seller_user_id, last_message_at desc);

create index if not exists marketplace_chat_messages_room_idx
  on public.marketplace_chat_messages (room_id, created_at);

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
  profile_frame_id uuid,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists marketplace_profiles_search_idx
  on public.marketplace_profiles (display_name, discord_id);

create table if not exists public.marketplace_profile_frames (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null default '',
  image_path text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'marketplace_profiles_profile_frame_fk'
  ) then
    alter table public.marketplace_profiles
    add constraint marketplace_profiles_profile_frame_fk
    foreign key (profile_frame_id)
    references public.marketplace_profile_frames(id)
    on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'marketplace_listings_seller_profile_frame_fk'
  ) then
    alter table public.marketplace_listings
    add constraint marketplace_listings_seller_profile_frame_fk
    foreign key (seller_profile_frame_id)
    references public.marketplace_profile_frames(id)
    on delete set null;
  end if;
end $$;

create index if not exists marketplace_profile_frames_active_idx
  on public.marketplace_profile_frames (active, sort_order, name);

create index if not exists marketplace_listings_seller_profile_frame_idx
  on public.marketplace_listings (seller_profile_frame_id);

update public.marketplace_listings as listings
set seller_profile_frame_id = profiles.profile_frame_id
from public.marketplace_profiles as profiles
where listings.user_id = profiles.user_id
  and listings.seller_profile_frame_id is distinct from profiles.profile_frame_id;

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

create table if not exists public.marketplace_banned_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discord_id text not null default '',
  display_name text not null default '',
  reason text not null default '',
  active boolean not null default true,
  banned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_banned_users_active_idx
  on public.marketplace_banned_users (active, display_name);

create table if not exists public.marketplace_site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.marketplace_servers (name, sort_order)
select 'Prontera ' || number, number
from generate_series(1, 10) as number
on conflict (name) do nothing;

insert into public.marketplace_servers (name, sort_order)
select 'Geffen ' || number, 100 + number
from generate_series(1, 10) as number
on conflict (name) do nothing;

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
add column if not exists listing_type text not null default 'sell';

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

alter table public.marketplace_listings
add column if not exists seller_profile_frame_id uuid;

alter table public.marketplace_listings
add column if not exists offers_enabled boolean not null default false;

alter table public.marketplace_listings
add column if not exists image_urls jsonb not null default '[]'::jsonb;

alter table public.marketplace_listings
add column if not exists image_paths jsonb not null default '[]'::jsonb;

update public.marketplace_listings
set image_urls = jsonb_build_array(image_url)
where image_urls = '[]'::jsonb
  and image_url <> '';

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

alter table public.marketplace_listings
add column if not exists card_background text not null default 'default';

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

drop trigger if exists marketplace_servers_set_updated_at on public.marketplace_servers;
create trigger marketplace_servers_set_updated_at
before update on public.marketplace_servers
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_dungeons_set_updated_at on public.marketplace_dungeons;
create trigger marketplace_dungeons_set_updated_at
before update on public.marketplace_dungeons
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_listings_set_updated_at on public.marketplace_listings;
create trigger marketplace_listings_set_updated_at
before update on public.marketplace_listings
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_listing_offers_set_updated_at on public.marketplace_listing_offers;
create trigger marketplace_listing_offers_set_updated_at
before update on public.marketplace_listing_offers
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_chat_rooms_set_updated_at on public.marketplace_chat_rooms;
create trigger marketplace_chat_rooms_set_updated_at
before update on public.marketplace_chat_rooms
for each row execute function public.set_updated_at();

create or replace function public.marketplace_chat_message_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.marketplace_chat_rooms
  set last_message = new.message,
      last_message_at = new.created_at,
      updated_at = now()
  where id = new.room_id;
  return new;
end;
$$;

drop trigger if exists marketplace_chat_message_sync_room on public.marketplace_chat_messages;
create trigger marketplace_chat_message_sync_room
after insert on public.marketplace_chat_messages
for each row execute function public.marketplace_chat_message_after_insert();

drop trigger if exists marketplace_profiles_set_updated_at on public.marketplace_profiles;
create trigger marketplace_profiles_set_updated_at
before update on public.marketplace_profiles
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_profile_frames_set_updated_at on public.marketplace_profile_frames;
create trigger marketplace_profile_frames_set_updated_at
before update on public.marketplace_profile_frames
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_premium_users_set_updated_at on public.marketplace_premium_users;
create trigger marketplace_premium_users_set_updated_at
before update on public.marketplace_premium_users
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_banned_users_set_updated_at on public.marketplace_banned_users;
create trigger marketplace_banned_users_set_updated_at
before update on public.marketplace_banned_users
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_site_settings_set_updated_at on public.marketplace_site_settings;
create trigger marketplace_site_settings_set_updated_at
before update on public.marketplace_site_settings
for each row execute function public.set_updated_at();

alter table public.marketplace_items enable row level security;
alter table public.marketplace_servers enable row level security;
alter table public.marketplace_dungeons enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_listing_offers enable row level security;
alter table public.marketplace_chat_rooms enable row level security;
alter table public.marketplace_chat_messages enable row level security;
alter table public.marketplace_admins enable row level security;
alter table public.marketplace_profiles enable row level security;
alter table public.marketplace_profile_frames enable row level security;
alter table public.marketplace_premium_users enable row level security;
alter table public.marketplace_banned_users enable row level security;
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

create or replace function public.market_listing_limit(target_user_id uuid default auth.uid())
returns integer
language sql
security definer
set search_path = public
as $$
  select case when public.is_market_premium(target_user_id) then 5 else 2 end;
$$;

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

grant usage on schema public to anon, authenticated;
grant select on table public.marketplace_items to anon;
grant all privileges on table public.marketplace_items to authenticated;
grant select on table public.marketplace_servers to anon;
grant all privileges on table public.marketplace_servers to authenticated;
grant select on table public.marketplace_dungeons to anon;
grant all privileges on table public.marketplace_dungeons to authenticated;
grant select on table public.marketplace_listings to anon;
grant all privileges on table public.marketplace_listings to authenticated;
grant all privileges on table public.marketplace_listing_offers to authenticated;
grant select, insert on table public.marketplace_chat_rooms to authenticated;
grant select, insert on table public.marketplace_chat_messages to authenticated;
revoke update, delete on table public.marketplace_chat_rooms from authenticated;
revoke update, delete on table public.marketplace_chat_messages from authenticated;
grant select on table public.marketplace_admins to authenticated;
grant all privileges on table public.marketplace_profiles to authenticated;
grant select on table public.marketplace_profile_frames to anon, authenticated;
grant all privileges on table public.marketplace_profile_frames to authenticated;
grant all privileges on table public.marketplace_premium_users to authenticated;
grant all privileges on table public.marketplace_banned_users to authenticated;
grant select on table public.marketplace_site_settings to anon;
grant all privileges on table public.marketplace_site_settings to authenticated;
grant execute on function public.is_market_admin() to anon, authenticated;
grant execute on function public.is_market_premium(uuid) to anon, authenticated;
grant execute on function public.market_listing_limit(uuid) to anon, authenticated;
grant execute on function public.market_hourly_listing_count(uuid, text) to anon, authenticated;
grant execute on function public.market_active_listing_count(uuid, uuid, text) to anon, authenticated;

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

drop policy if exists "Public can read active marketplace servers" on public.marketplace_servers;
create policy "Public can read active marketplace servers"
on public.marketplace_servers
for select
to anon, authenticated
using (active = true);

drop policy if exists "Authenticated admins can read all marketplace servers" on public.marketplace_servers;
create policy "Authenticated admins can read all marketplace servers"
on public.marketplace_servers
for select
to authenticated
using (public.is_market_admin());

drop policy if exists "Authenticated admins can insert marketplace servers" on public.marketplace_servers;
create policy "Authenticated admins can insert marketplace servers"
on public.marketplace_servers
for insert
to authenticated
with check (public.is_market_admin());

drop policy if exists "Authenticated admins can update marketplace servers" on public.marketplace_servers;
create policy "Authenticated admins can update marketplace servers"
on public.marketplace_servers
for update
to authenticated
using (public.is_market_admin())
with check (public.is_market_admin());

drop policy if exists "Authenticated admins can delete marketplace servers" on public.marketplace_servers;
create policy "Authenticated admins can delete marketplace servers"
on public.marketplace_servers
for delete
to authenticated
using (public.is_market_admin());

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

drop policy if exists "Public can read active profile frames" on public.marketplace_profile_frames;
create policy "Public can read active profile frames"
on public.marketplace_profile_frames
for select
to anon, authenticated
using (active = true or public.is_market_admin());

drop policy if exists "Authenticated admins can insert profile frames" on public.marketplace_profile_frames;
create policy "Authenticated admins can insert profile frames"
on public.marketplace_profile_frames
for insert
to authenticated
with check (public.is_market_admin());

drop policy if exists "Authenticated admins can update profile frames" on public.marketplace_profile_frames;
create policy "Authenticated admins can update profile frames"
on public.marketplace_profile_frames
for update
to authenticated
using (public.is_market_admin())
with check (public.is_market_admin());

drop policy if exists "Authenticated admins can delete profile frames" on public.marketplace_profile_frames;
create policy "Authenticated admins can delete profile frames"
on public.marketplace_profile_frames
for delete
to authenticated
using (public.is_market_admin());

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

drop policy if exists "Authenticated users can read own ban status" on public.marketplace_banned_users;
create policy "Authenticated users can read own ban status"
on public.marketplace_banned_users
for select
to authenticated
using (auth.uid() = user_id or public.is_market_admin());

drop policy if exists "Authenticated admins can insert banned users" on public.marketplace_banned_users;
create policy "Authenticated admins can insert banned users"
on public.marketplace_banned_users
for insert
to authenticated
with check (public.is_market_admin());

drop policy if exists "Authenticated admins can update banned users" on public.marketplace_banned_users;
create policy "Authenticated admins can update banned users"
on public.marketplace_banned_users
for update
to authenticated
using (public.is_market_admin())
with check (public.is_market_admin());

drop policy if exists "Authenticated admins can delete banned users" on public.marketplace_banned_users;
create policy "Authenticated admins can delete banned users"
on public.marketplace_banned_users
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

drop policy if exists "Authenticated admins can update marketplace listings" on public.marketplace_listings;
create policy "Authenticated admins can update marketplace listings"
on public.marketplace_listings
for update
to authenticated
using (public.is_market_admin() or auth.uid() = user_id)
with check (
  public.is_market_admin()
  or (
    auth.uid() = user_id
    and not exists (
      select 1
      from public.marketplace_banned_users banned
      where banned.user_id = auth.uid()
        and banned.active = true
    )
    and (
      active = false
      or sale_status <> 'active'
      or public.market_active_listing_count(auth.uid(), id, listing_type) < public.market_listing_limit(auth.uid())
    )
  )
);

drop policy if exists "Authenticated admins can delete marketplace listings" on public.marketplace_listings;
create policy "Authenticated admins can delete marketplace listings"
on public.marketplace_listings
for delete
to authenticated
using (public.is_market_admin() or auth.uid() = user_id);

drop policy if exists "Offer members can read listing offers" on public.marketplace_listing_offers;
create policy "Offer members can read listing offers"
on public.marketplace_listing_offers
for select
to authenticated
using (
  buyer_user_id = auth.uid()
  or public.is_market_admin()
  or exists (
    select 1
    from public.marketplace_listings listings
    where listings.id = marketplace_listing_offers.listing_id
      and listings.user_id = auth.uid()
  )
);

drop policy if exists "Authenticated users can create listing offers" on public.marketplace_listing_offers;
create policy "Authenticated users can create listing offers"
on public.marketplace_listing_offers
for insert
to authenticated
with check (
  buyer_user_id = auth.uid()
  and offer_price_text <> ''
  and exists (
    select 1
    from public.marketplace_listings listings
    where listings.id = marketplace_listing_offers.listing_id
      and listings.offers_enabled = true
      and listings.active = true
      and listings.sale_status = 'active'
      and (listings.expires_at is null or listings.expires_at > now())
      and listings.user_id is distinct from auth.uid()
  )
);

drop policy if exists "Offer participants can update own offer status" on public.marketplace_listing_offers;
create policy "Offer participants can update own offer status"
on public.marketplace_listing_offers
for update
to authenticated
using (
  buyer_user_id = auth.uid()
  or public.is_market_admin()
  or exists (
    select 1
    from public.marketplace_listings listings
    where listings.id = marketplace_listing_offers.listing_id
      and listings.user_id = auth.uid()
  )
)
with check (
  buyer_user_id = auth.uid()
  or public.is_market_admin()
  or exists (
    select 1
    from public.marketplace_listings listings
    where listings.id = marketplace_listing_offers.listing_id
      and listings.user_id = auth.uid()
  )
);

drop policy if exists "Chat participants can read rooms" on public.marketplace_chat_rooms;
create policy "Chat participants can read rooms"
on public.marketplace_chat_rooms
for select
to authenticated
using (
  auth.uid() = buyer_user_id
  or auth.uid() = seller_user_id
  or public.is_market_admin()
);

drop policy if exists "Buyers can create listing chat rooms" on public.marketplace_chat_rooms;
create policy "Buyers can create listing chat rooms"
on public.marketplace_chat_rooms
for insert
to authenticated
with check (
  auth.uid() = buyer_user_id
  and buyer_user_id <> seller_user_id
  and exists (
    select 1
    from public.marketplace_listings listings
    where listings.id = listing_id
      and listings.user_id = seller_user_id
      and listings.sale_status <> 'deleted'
  )
);

drop policy if exists "Chat participants can update rooms" on public.marketplace_chat_rooms;

drop policy if exists "Chat participants can read messages" on public.marketplace_chat_messages;
create policy "Chat participants can read messages"
on public.marketplace_chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.marketplace_chat_rooms rooms
    where rooms.id = marketplace_chat_messages.room_id
      and (
        auth.uid() = rooms.buyer_user_id
        or auth.uid() = rooms.seller_user_id
        or public.is_market_admin()
      )
  )
);

drop policy if exists "Chat participants can send messages" on public.marketplace_chat_messages;
create policy "Chat participants can send messages"
on public.marketplace_chat_messages
for insert
to authenticated
with check (
  auth.uid() = sender_user_id
  and exists (
    select 1
    from public.marketplace_chat_rooms rooms
    where rooms.id = marketplace_chat_messages.room_id
      and (auth.uid() = rooms.buyer_user_id or auth.uid() = rooms.seller_user_id)
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'marketplace_chat_messages'
  ) then
    alter publication supabase_realtime add table public.marketplace_chat_messages;
  end if;
end $$;

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
drop policy if exists "Authenticated users can update own listing images" on storage.objects;
drop policy if exists "Authenticated users can delete own listing images" on storage.objects;
create policy "Authenticated users can upload listing images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'listing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Authenticated users can update own listing images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'listing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'listing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Authenticated users can delete own listing images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'listing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Authenticated admins can upload item images" on storage.objects;
create policy "Authenticated admins can upload item images"
on storage.objects
for insert
to authenticated
with check (
  public.is_market_admin()
  and bucket_id in ('item-images', 'listing-images')
);

drop policy if exists "Authenticated admins can update item images" on storage.objects;
create policy "Authenticated admins can update item images"
on storage.objects
for update
to authenticated
using (
  public.is_market_admin()
  and bucket_id in ('item-images', 'listing-images')
)
with check (
  public.is_market_admin()
  and bucket_id in ('item-images', 'listing-images')
);

drop policy if exists "Authenticated admins can delete item images" on storage.objects;
create policy "Authenticated admins can delete item images"
on storage.objects
for delete
to authenticated
using (
  public.is_market_admin()
  and bucket_id in ('item-images', 'listing-images')
);
