alter table public.marketplace_listings
add column if not exists offers_enabled boolean not null default false;

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

drop trigger if exists marketplace_listing_offers_set_updated_at on public.marketplace_listing_offers;
create trigger marketplace_listing_offers_set_updated_at
before update on public.marketplace_listing_offers
for each row execute function public.set_updated_at();

alter table public.marketplace_listing_offers enable row level security;

grant all privileges on table public.marketplace_listing_offers to authenticated;

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
