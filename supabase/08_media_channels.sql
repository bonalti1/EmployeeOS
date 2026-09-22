-- ============================================================================
-- MEDIA HUB — one Drive folder per channel
-- ============================================================================
-- Run this AFTER supabase/assistant_workspace.sql. Safe to re-run.
--
-- The media hub reorganized from brand × raw/finished boxes to one Google
-- Drive slot per publishing channel (YouTube / STB TikTok / Personal Brand),
-- so every link's home is the channel it feeds. The table itself only needs
-- its allowed values widened; existing rows keep working and surface under
-- "Other links".

alter table public.ws_media_links drop constraint if exists ws_media_links_brand_check;
alter table public.ws_media_links
  add constraint ws_media_links_brand_check
  check (brand in ('STB','ALTO','General','YouTube','Personal'));

alter table public.ws_media_links drop constraint if exists ws_media_links_kind_check;
alter table public.ws_media_links
  add constraint ws_media_links_kind_check
  check (kind in ('raw','finished','other','channel'));
