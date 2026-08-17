-- Run this in the Supabase SQL Editor to create slim views that strip
-- base64 photos from JSON columns. This eliminates photo data from
-- every poll request, reducing bandwidth from MBs to KBs per request.
--
-- After running this SQL, update the poll URLs in the app files:
--   SM_Install_Dashboard.html: change 'install_orders?' → 'install_orders_slim?'
--   Site_Installer_App.html:   change 'install_orders?' → 'install_orders_slim?'
-- (SM_Audit and Site_Auditor already use explicit column selection, no view needed.)

-- ============================================================
-- install_orders_slim
-- Strips jobcard.rooms[].photos[] AND jobcard_history[].rooms[].photos[]
-- from each subjob. All other data (assignments, items, sign, measurements,
-- archivedAt/archivedReason) is preserved. On-demand fetches (PDF download,
-- opening the Admin order detail modal) go straight to install_orders (the
-- full table, not this view), so historical-PDF generation is unaffected —
-- see docs note 105/72 in CLAUDE.md.
-- ============================================================
-- NOTE: DROP + CREATE (not CREATE OR REPLACE). `CREATE OR REPLACE VIEW` can only APPEND new
-- columns at the END — it errors if you insert a column before an existing one. `city` is added
-- as the LAST column below; the DROP makes the re-run bulletproof regardless of the old view's shape.
--
-- WHY THIS RE-RUN MATTERS (found 2026-08-17): note 72 (2026-07-28) added a permanent
-- `jobcard_history[]` archive array to each subjob, living in the SAME `subjobs` jsonb column
-- this view already strips photos from — but the view itself was never updated to also strip
-- `jobcard_history[].rooms[].photos[]`. Any subjob that was ever reopened/re-completed while a
-- room photo was still an un-uploaded base64 fallback (weak site connectivity, note 96) gets that
-- photo permanently duplicated into every history entry going forward — completely bypassing the
-- "strip photos from the poll" design this view exists for. Confirmed live: a handful of orders'
-- jobcard_history alone were 1-3MB EACH, inflating the installer app's single poll response (every
-- installer, no per-user filter, every 30s) to 10+MB total — easily enough to fail/timeout on a
-- weak mobile connection, i.e. exactly "site installation not working."
DROP VIEW IF EXISTS install_orders_slim;
CREATE VIEW install_orders_slim AS
SELECT
  id, created_at, pi, po, skus, bm, customer_name, phone, addr,
  matched_audit, delivery_date, custom_wp, custom_wp_stage, custom_wp_meta,
  status, service, log, created_by_email,
  CASE
    WHEN subjobs IS NULL THEN NULL::jsonb
    ELSE (
      SELECT jsonb_agg(
        (sj - 'jobcard' - 'jobcard_history') || jsonb_build_object(
          'jobcard',
          CASE
            WHEN (sj->'jobcard') IS NOT NULL AND (sj->'jobcard')::text <> 'null'
            THEN
              CASE
                WHEN sj->'jobcard'->'rooms' IS NOT NULL
                THEN jsonb_build_object(
                  'sign',  sj->'jobcard'->'sign',
                  'rooms', (
                    SELECT jsonb_agg(room - 'photos')
                    FROM jsonb_array_elements(sj->'jobcard'->'rooms') AS room
                  )
                )
                ELSE sj->'jobcard'
              END
            ELSE sj->'jobcard'
          END,
          'jobcard_history',
          CASE
            WHEN (sj->'jobcard_history') IS NOT NULL AND (sj->'jobcard_history')::text <> 'null'
            THEN (
              SELECT jsonb_agg(
                (hist - 'rooms') || jsonb_build_object(
                  'rooms', (
                    SELECT jsonb_agg(room - 'photos')
                    FROM jsonb_array_elements(COALESCE(hist->'rooms','[]'::jsonb)) AS room
                  )
                )
              )
              FROM jsonb_array_elements(sj->'jobcard_history') AS hist
            )
            ELSE sj->'jobcard_history'
          END
        )
      )
      FROM jsonb_array_elements(subjobs) AS sj
    )
  END AS subjobs,
  city
FROM install_orders;

GRANT SELECT ON install_orders_slim TO anon;
GRANT SELECT ON install_orders_slim TO authenticated;
