-- ============================================================================
-- Installer Payouts + Foam Roll Balance  (2026-08-05)
-- Run once in the Supabase SQL Editor. Idempotent (safe to re-run).
-- Consistent with the app's existing model: no RLS, anon key has full access.
-- ============================================================================

-- 1) Per-installer pay-rate OVERRIDE (nullable; blank/absent = use the global rate).
--    Shape: {"fl_sqft":<num>, "wp_std_roll":<num>, "wp_custom_sqft":<num>} (any subset).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pay_rates jsonb;

-- 2) Global settings — one row per key, jsonb value. Holds:
--      key 'payout_rates' -> {"fl_sqft":..,"wp_std_roll":..,"wp_custom_sqft":..}
--      key 'foam'         -> {"threshold":..,"tracking_start":"YYYY-MM-DD"}
CREATE TABLE IF NOT EXISTS app_settings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text UNIQUE NOT NULL,
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);
GRANT ALL ON app_settings TO anon, authenticated;

-- 3) Foam issuance ledger — one row per hand-out to a flooring installer.
--    Consumption is DERIVED live from completed/partial flooring jobs (never stored here).
CREATE TABLE IF NOT EXISTS foam_ledger (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installer_id   uuid,
  installer_email text,
  installer_name text,
  sqft           numeric NOT NULL,
  note           text,
  created_by     text,
  created_at     timestamptz DEFAULT now()
);
GRANT ALL ON foam_ledger TO anon, authenticated;
