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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_listings_public_idx
  on public.marketplace_listings (active, category, created_at desc);

create table if not exists public.marketplace_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
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

alter table public.marketplace_items enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_admins enable row level security;

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

grant usage on schema public to anon, authenticated;
grant select on table public.marketplace_items to anon;
grant all privileges on table public.marketplace_items to authenticated;
grant select on table public.marketplace_listings to anon;
grant all privileges on table public.marketplace_listings to authenticated;
grant select on table public.marketplace_admins to authenticated;
grant execute on function public.is_market_admin() to anon, authenticated;

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
with check (active = true and auth.uid() = user_id);

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
