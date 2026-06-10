-- SQL Migration: Add Facebook URL column to marketplace_listings
-- Run this in your Supabase SQL Editor

ALTER TABLE marketplace_listings 
ADD COLUMN IF NOT EXISTS facebook_url TEXT;

-- Optional: Add a comment to the column
COMMENT ON COLUMN marketplace_listings.facebook_url IS 'URL to the seller''s Facebook profile';
