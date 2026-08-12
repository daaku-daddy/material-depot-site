-- ============================================================================
-- Category Operations Executive (COE) Dashboard — one-time schema setup
-- Run this in the Supabase SQL Editor.
--
-- Everything in the app is probe-gated: COE_Dashboard.html, SM_Install_Dashboard.html,
-- BM_Dashboard.html and Admin.html all stay byte-behaviourally identical to before
-- until these statements have run. Safe to re-run (all statements are idempotent).
-- ============================================================================

-- 1. New role: 'coe'. profiles_role_check is a CHECK constraint, so it has to be
--    dropped and recreated (there is no ALTER ... ADD VALUE for a CHECK list).
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN (
  'admin','service_mgr','site_auditor','installer','auditor_installer','store_staff','bm','coe'
));

-- 2. Site audit -> order conversion follow-up state. 1:1 with an audit order, so it
--    rides the existing row rather than getting its own table (same call as bm_journey).
--    Shape: {calls:[{id,ts,stage,who,outcome,note,by}], order_placed:{...}|null,
--            result:'converted'|'lost'|null, lost_reason:'', snooze_until:'YYYY-MM-DD'|null}
ALTER TABLE audit_orders ADD COLUMN IF NOT EXISTS coe_track jsonb DEFAULT '{}'::jsonb;

-- 3. Custom wallpaper production tracking — one row per PO (MD ID), NOT per order.
--    One enquiry legitimately has several POs, and a PO can exist before the install
--    order is ever created in this app, so this cannot hang off install_orders.
CREATE TABLE IF NOT EXISTS wp_production (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz DEFAULT now(),
  pi               text,                        -- ENQ ID
  md_id            text,                        -- MD ID / PO number
  vendor           text,                        -- key from MD_WP_VENDORS in md-wp-track.js
  city             text,
  customer_name    text,
  phone            text,
  bm               text,
  bm_email         text,
  order_placed_at  timestamptz,                 -- "Order Placed Date/Time" from the sheet
  stages           jsonb DEFAULT '{}'::jsonb,   -- linear stages: {key:{at,by,note}}
  rounds           jsonb DEFAULT '[]'::jsonb,   -- render/approval revision loop, one entry per round
  state            text DEFAULT 'active',       -- active | done | cancelled | on_hold
  notes            text DEFAULT '',             -- free-text "Details / Product / Issue"
  install_order_id uuid,
  audit_order_id   uuid,
  log              jsonb DEFAULT '[]'::jsonb    -- {t,d,by,who} — same shape as order logs (note 39)
);

-- One production row per (enquiry, PO). Protects the historical import and any
-- double-submit of the add form from creating duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wp_production_pi_md ON wp_production(pi, md_id);
CREATE INDEX IF NOT EXISTS idx_wp_production_state  ON wp_production(state);
CREATE INDEX IF NOT EXISTS idx_wp_production_vendor ON wp_production(vendor);
CREATE INDEX IF NOT EXISTS idx_wp_production_phone  ON wp_production(phone);

-- NOTE: do NOT enable RLS on wp_production. This app has no server-side auth — every
-- page uses the public anon key — so RLS silently returns empty arrays for every read.
-- See the 2026-08-08 incident in CLAUDE.md.
