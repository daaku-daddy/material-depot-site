-- ============================================================================
-- Adds the 'content_team' profile role.
--
-- Run this ONLY if you have already run docs/coe_dashboard.sql. If you haven't run
-- that yet, skip this file — coe_dashboard.sql already includes 'content_team' in its
-- role list, so running it covers both.
--
-- Safe to re-run.
--
-- Content Team is a real profile role with NO dashboard of its own yet: members can be
-- created in Admin, appear in the Users list and the Role Viewer, and can be picked as
-- site shadowers. Logging in tells them plainly that there's no dashboard for their role
-- rather than bouncing them somewhere they don't belong. When their screen is specced,
-- give the role a `file` in Login.html's ROLE_FILES and Admin.html's ROLES.
-- ============================================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN (
  'admin','service_mgr','site_auditor','installer','auditor_installer','store_staff','bm','coe',
  'content_team'
));
