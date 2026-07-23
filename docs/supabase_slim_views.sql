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
-- Strips jobcard.rooms[].photos[] from each subjob.
-- All other data (assignments, items, sign, measurements) is preserved.
-- ============================================================
CREATE OR REPLACE VIEW install_orders_slim AS
SELECT
  id, created_at, pi, po, skus, bm, customer_name, phone, addr,
  matched_audit, delivery_date, custom_wp, custom_wp_stage, custom_wp_meta,
  status, service, log, created_by_email,
  CASE
    WHEN subjobs IS NULL THEN NULL::jsonb
    ELSE (
      SELECT jsonb_agg(
        CASE
          WHEN (sj->'jobcard') IS NOT NULL AND (sj->'jobcard')::text <> 'null'
          THEN sj - 'jobcard' || jsonb_build_object('jobcard',
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
          )
          ELSE sj
        END
      )
      FROM jsonb_array_elements(subjobs) AS sj
    )
  END AS subjobs
FROM install_orders;

GRANT SELECT ON install_orders_slim TO anon;
GRANT SELECT ON install_orders_slim TO authenticated;
