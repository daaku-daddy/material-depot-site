# Material Depot — Project Context for Claude

## Project Overview
Role-based web app for Material Depot's field operations. Plain HTML/CSS/JS, no framework.
- **Live URL**: https://material-depot-site.vercel.app
- **GitHub**: https://github.com/daaku-daddy/material-depot-site (branch: `master`)
- **Vercel project**: `material-depot1/material-depot-site`
- **Deploy command**: `vercel --prod` from `/Users/dhruv/Projects/material-depot-site/`

## Files
| File | Role |
|---|---|
| `Login.html` | OTP login, writes `md_user` to sessionStorage |
| `Admin.html` | Admin console — user management, role viewer, jobs overview, performance |
| `SM_Audit_Dashboard.html` | Service Manager — audit order lifecycle |
| `SM_Install_Dashboard.html` | Service Manager — install order lifecycle |
| `Site_Auditor_App.html` | Field auditor mobile app |
| `Site_Installer_App.html` | Field installer mobile app |

## Supabase
- **URL**: `https://jqrdfnjfxqxrazfkaofm.supabase.co`
- **Anon key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxcmRmbmpmeHF4cmF6Zmthb2ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTU5NTcsImV4cCI6MjA5NjY3MTk1N30.2mvCPc0E_vDn2WaID5sEjwU4Dyj53rhevGrSPBa3__g`
- All pages use the anon key with REST API (no Supabase JS client)
- Standard helpers in every file: `sbGet(query)`, `sbPost(table, body)`, `sbPatch(table, id, body)`

### Tables
**`profiles`** — all users
- `id` (uuid), `name` (text), `email` (text), `role` (text), `created_at`
- Roles: `admin`, `service_mgr`, `site_auditor`, `installer`
- All emails end in `@materialdepot.com`

**`audit_orders`** — created by SM, worked by site_auditors
- `id`, `created_at`, `pi`, `po` (text, comma-joined array), `skus` (jsonb), `audit_ticked` (jsonb)
- `bm`, `customer_name`, `phone`, `addr`, `status`, `service` (jsonb)
- `slot`, `date`, `auditor_id`, `auditor_name`, `auditor_email`
- `log` (jsonb array), `created_by_email`
- Status flow: `pending` → `assigned` → `onway` → `atsite` → `completed` / `reschedule`
- Note: SM calls it `assigned`; Site_Auditor_App maps `assigned` → local `scheduled` for display

**`install_orders`** — created by SM, worked by installers
- `id`, `created_at`, `pi`, `po`, `skus` (jsonb), `bm`, `customer_name`, `phone`, `addr`
- `matched_audit` (bool), `delivery_date`, `custom_wp` (bool), `status`
- `subjobs` (jsonb array: `[{id, type, installer_email, status, ...}]`)
- `service` (jsonb), `log` (jsonb), `created_by_email`
- Status flow: `pending` → `scheduled` → `onway` → `atsite` → `completed` / `reschedule`

## Auth / Session
- `sessionStorage` key: `md_user` → `{name, email, role}`
- Every page reads session on load via `getSession()` and guards by role
- Redirect on failure: `window.location.href = 'Login.html'`
- Role → page mapping: `admin→Admin.html`, `service_mgr→SM_Audit/Install_Dashboard.html`, `site_auditor→Site_Auditor_App.html`, `installer→Site_Installer_App.html`

## Architecture Patterns

### Real-time sync
- 30-second `setInterval(loadOrders, 30000)` polling on all pages (no Supabase JS client / websockets)

### SM dashboards
- `loadAuditors()` / `loadInstallers()` fetch from `profiles` by role
- `loadOrders()` fetches from respective Supabase table, maps snake_case DB columns to camelCase JS
- All mutations call `sbPatch()` immediately after local state update
- Init: `Promise.all([loadAuditors(), loadOrders()]).then(() => { setInterval(loadOrders, 30000); })`

### Site_Auditor_App
- `ME = {name: SESSION.name, email: SESSION.email, zone: ''}`
- Filters server-side: `audit_orders?auditor_email=eq.${encodeURIComponent(ME.email)}`
- Status mapping: DB `assigned` → local `scheduled` (on read); local `scheduled` → DB `assigned` (on write)

### Site_Installer_App
- Fetches all `install_orders`, filters client-side: `sj.installer_email === ME.email`
- Job identifier: composite key `pi + '_' + sjId` (since one order can have multiple subjobs)
- Cards use `data-key="${j.pi}_${j.sjId}"`, openDetail parses with `key.split('_')`

### Admin — Role Viewer
- Loads profiles by role from Supabase
- Shows person-selector buttons per role
- Session injection before iframe load: writes selected person's `md_user`, sets `iframe.src`, restores admin session in `iframe.onload`
- Service Manager role: extra tab toggle for Audit vs Install dashboard

### Admin — Jobs Overview
- Fetches live from `audit_orders` + `install_orders`
- Installer assignees resolved via email→name map from `profiles`
- Install order assignees: flattened from `subjobs[].installer_email`

### Admin — Performance
- Auditors: counted by `auditor_email` in `audit_orders`
- Installers: counted by `installer_email` in `subjobs` across all `install_orders`
- Service Managers: counted by `created_by_email` in both tables
- Metric shown: Completion Rate (completed ÷ total × 100%)

## CSS Design System (CSS variables)
```
--navy:#1F3A5F  --navy2:#16294a  --blue:#2E6CA8  --yellow:#F4C20D
--ink:#1b2230   --muted:#67748a  --line:#dde3ec  --bg:#eef1f6  --card:#fff
--green:#1f7a3f --red:#b3261e    --amber:#9a6200 --purple:#5b3aa6
```

## Status Chips (all pages)
| Status | Class | Label |
|---|---|---|
| pending | c-pending | Pending |
| assigned | c-scheduled | Assigned |
| callpending | c-scheduled | Call Pending |
| scheduled | c-scheduled | Scheduled |
| onway | c-onway | On the Way |
| atsite | c-atsite | At Site |
| completed | c-completed | Completed |
| reschedule | c-reschedule | Reschedule |

## Key JS Field ↔ DB Column Mappings
| JS (audit) | DB column |
|---|---|
| `o.name` | `customer_name` |
| `o.po` (array) | `po` (text, comma-joined) |
| `o.auditTicked` | `audit_ticked` |
| `o.auditor` | `auditor_id` |

| JS (install) | DB column |
|---|---|
| `o.name` | `customer_name` |
| `o.matchedAudit` | `matched_audit` |
| `o.deliveryDate` | `delivery_date` |
| `o.customWp` | `custom_wp` |

## Deployment Workflow
```bash
git add <files>
git commit -m "message"
git push origin master
vercel --prod
```
