# Material Depot — Project Context for Claude

## Project Overview
Role-based web app for Material Depot's field operations. Plain HTML/CSS/JS, no framework, no build step.
- **Live URL**: https://material-depot-site.vercel.app
- **GitHub**: https://github.com/daaku-daddy/material-depot-site (branch: `master`)
- **Vercel project**: `material-depot1/material-depot-site`
- **Local clone**: `/Users/dhruv/Projects/material-depot-site/`
- **Deploy command**: `vercel --prod` from the local clone directory

## Files
| File | Role |
|---|---|
| `index.html` | Meta-refresh redirect to `Login.html` |
| `Login.html` | Passcode login, writes `md_user` to sessionStorage |
| `Admin.html` | Admin console — user management, role viewer, jobs overview, performance, job cards |
| `SM_Audit_Dashboard.html` | Service Manager — site audit order lifecycle |
| `SM_Install_Dashboard.html` | Service Manager — installation order lifecycle |
| `Site_Auditor_App.html` | Field auditor mobile app (max-width 520px) |
| `Site_Installer_App.html` | Field installer mobile app (max-width 480px) |

## Stack
- Plain HTML/CSS/JS — no framework, no build step
- Supabase REST API (raw fetch, no JS client library)
- Vercel static hosting
- jsPDF + jspdf-autotable for PDF generation (CDN, loaded in all files)

## Supabase
- **URL**: `https://jqrdfnjfxqxrazfkaofm.supabase.co`
- **Anon key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxcmRmbmpmeHF4cmF6Zmthb2ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTU5NTcsImV4cCI6MjA5NjY3MTk1N30.2mvCPc0E_vDn2WaID5sEjwU4Dyj53rhevGrSPBa3__g`
- All pages use the anon key with REST API
- Standard helpers present in every file: `sbGet(query)`, `sbPost(table, body)`, `sbPatch(table, id, body)`, `sbDel(table, id)`

### Table: `profiles`
All users.
- Columns: `id` (uuid), `name`, `email`, `role`, `passcode`, `installer_type`, `created_at`
- Roles: `admin`, `service_mgr`, `site_auditor`, `installer`
- All emails end in `@materialdepot.com`
- `installer_type`: `'flooring'` or `'wallpaper'` (only relevant for installer role)
- `passcode`: 4-digit string, null until first login (triggers passcode creation screen)

### Table: `audit_orders`
Created by Service Manager, worked by site auditors.
- Columns: `id`, `created_at`, `pi`, `po` (text, comma-joined), `skus` (jsonb), `audit_ticked` (jsonb), `bm`, `customer_name`, `phone`, `addr`, `status`, `service` (jsonb), `slot`, `date`, `auditor_id`, `auditor_name`, `auditor_email`, `log` (jsonb array), `created_by_email`
- Status flow: `pending → created → scheduled → assigned → onway → atsite → completed / reschedule`
- Special status: `deleted` (soft delete, stored in Deleted Orders view)
- `audit_ticked` shape (new format): `{auditor, date, sign: {img, name}, rooms: [{name, type, sku, calc, notes, photos: [], sketchStrokes: []}]}`
- `audit_ticked` old format (legacy): array of strings like `["Wooden Flooring"]`
- `service` shape: `{flooring: [{sku, name, link}], wallpaper: [{sku, name, link}]}`
- **SM displays `assigned` as "Site Auditor Assigned"; auditor app maps DB `assigned` → local `scheduled`**

### Table: `install_orders`
Created by Service Manager, worked by installers.
- Columns: `id`, `created_at`, `pi`, `po`, `skus` (jsonb), `bm`, `customer_name`, `phone`, `addr`, `matched_audit` (bool), `delivery_date`, `custom_wp` (bool), `status`, `subjobs` (jsonb array), `service` (jsonb), `log` (jsonb), `created_by_email`
- Status flow: `pending → deliv_ontime / deliv_delayed → created → scheduled → assigned → onway → atsite → completed / partial / reschedule`
- Special status: `deleted` (soft delete)
- `subjobs` shape: `[{id, type, installer, installer_email, date, slot, status, items: [{sku, name, link, rolls}], jobcard}]`
  - `type`: `'flooring'` or `'wallpaper'`
  - `jobcard` shape: `{rooms: [{name, sku, photos: [], comments}], sign: {img, name}}`
  - Sub-job IDs: `'sj_fl'` and `'sj_wp'` (created during service creation)
- `service` shape: `{flooring: [...], wallpaper: [...], audit_by: 'material_depot' | 'customer'}`
- Parent status is rolled up from sub-job statuses via `syncParent()` / `rollupStatus()`

## Auth / Session
- `sessionStorage` key: `md_user` → `{name, email, role}`
- Every page reads session on load via `getSession()` and role-guards; redirects to `Login.html` on failure
- Login flow: email → check profiles → if no passcode: create passcode screen; else: enter passcode screen
- Role → file routing: `admin→Admin.html`, `service_mgr→SM_Audit_Dashboard.html`, `site_auditor→Site_Auditor_App.html`, `installer→Site_Installer_App.html`

## Polling Intervals
- `SM_Audit_Dashboard.html`: `setInterval(loadOrders, 10000)` — every 10 seconds
- `SM_Install_Dashboard.html`: `setInterval(loadOrders, 30000)` — every 30 seconds
- `Site_Auditor_App.html`: `setInterval(loadJobs, 10000)` — every 10 seconds
- `Site_Installer_App.html`: `setInterval(loadJobs, 10000)` — every 10 seconds

## Architecture Patterns

### SM Audit Dashboard (`SM_Audit_Dashboard.html`)
- Nav views: Orders, Today's schedule, To reschedule, Availability calendar, Slots & timings, Auditors & caps, Deleted Orders
- Order detail opens in a right-side drawer (`#drawer`) with scrim overlay
- Drawer contains: stepper (backward navigation allowed via `FLOW` array), service creation panel (toggle switches per SKU group), slot booking (capacity-aware), auditor assignment (load-aware), manual status override menu, activity timeline
- `SLOTS` (array of `{id, label}`) and `CAPS` (per-auditor per-date object) are **in-memory only** — not persisted to DB
- Auditor daily cap default: `DEFAULT_CAP = 3`; `capFor(auditorId, dateStr)` reads from `CAPS` or returns default
- Slot capacity = number of auditors with cap ≥ 1 on that date
- `AUTO_STATUSES = ["onway", "atsite", "completed"]` — shown with AUTO badge, set by auditor app
- Delete = sets `status='deleted'`, not a hard delete; restored from Deleted Orders view
- PDF download on completed orders: `genAuditPDFSM(o, ticked)` — generates full job card PDF

### SM Install Dashboard (`SM_Install_Dashboard.html`)
- Nav views: Orders, Call Operations today, Today's installs, To reschedule, Installer calendar, Slots & timings, Installers, Deleted Orders
- Ops call due logic: custom WP → 3 days before delivery; standard → 1 day before delivery
- Installer capacity rules (in-memory):
  - Flooring: `FLOOR_DAY_CAP = 1` job per installer per day
  - Wallpaper: `WP_DAY_SLOTS = 2` slots per installer per day; ≥5 rolls = 2 slots, <5 rolls = 1 slot (`slotsForWp(rolls)`)
- Service creation spawns sub-jobs `sj_fl` and/or `sj_wp` based on SKU toggles
- `syncParent(o)` rolls up parent order status from sub-job statuses (same logic as `rollupStatus()` in installer app)
- PDF download on completed sub-jobs: `genInstallPDFSM(o, sj, jobcard)` — generates installation job card PDF

### Site Auditor App (`Site_Auditor_App.html`)
- 3 screens: list view, detail screen, job card screen (all `position:fixed`, toggled via `.hide` class)
- `ME = {name, email, zone}` — fetches only orders where `auditor_email = ME.email`
- Status mapping: DB `assigned` ↔ local `scheduled` (mapped on read in `loadJobs`, mapped back on write in `adv()`)
- Auto-flip: `scheduled → callpending` happens 3 hours before slot start time (client-side, in `autoFlip()`)
- **Job Card**: multi-room form with type toggle (flooring/wallpaper), calculation fields (type-adaptive), 2D sketch canvas (`Sketch` class), multi-photo grid with crop modal, notes
- **Crop modal** (`cropModal` IIFE): 340×255 frame, drag to pan, pinch or slider to zoom, "Use Photo" crops; tap thumbnail to re-crop
- **Autosave**: saves to `localStorage` immediately + debounced `sbPatch` to DB after 3s (saves draft rooms without photos to avoid JSONB size issues)
- On completion: saves full `audit_ticked` with photos array to DB, generates PDF via `genPDF(o)`
- PDF download available on completed orders from detail screen

### Site Installer App (`Site_Installer_App.html`)
- 4 screens: list view, detail screen, audit report screen (read-only), installation card screen
- Fetches ALL `install_orders`, filters client-side: `sj.installer_email === ME.email`
- On init: fetches own `installer_type` from `profiles` to show "Flooring Installer" / "Wallpaper Installer"
- Job composite key: `pi + '|' + sjId` — used in `data-key` and parsed with `key.indexOf('|')` (NOT split on `_`)
- Status mapping: DB `assigned` ↔ local `scheduled`
- Auto-flip: same `callpending` logic as auditor app
- Status update pattern: fetch parent order → find subjob in array → update subjob status → `rollupStatus()` for parent → `sbPatch` entire order
- Audit report screen: fetches by matching `phone` number against `audit_orders?status=eq.completed` (most recent)
- **Installation Card**: per-room form with room name★, SKU★, multi-photo grid with crop modal★, comments; requires at least 1 photo per room
- **Crop modal**: same implementation as auditor app
- **Autosave**: localStorage + debounced draft save to `sj.jobcard` in subjobs array
- On completion: saves `sj.jobcard` with photos to subjobs, computes `rollupStatus`, patches parent order

### Admin Console (`Admin.html`)
- Desktop layout with sidebar nav (`#rail`)
- Nav views: Overview, Users, Role Viewer, Jobs Overview, Performance, Job Cards
- **Users**: full CRUD — add user, edit role (with installer domain toggle), reset passcode (sets to null), delete
- **Role Viewer**: iframe injection trick — writes selected person's `md_user` to sessionStorage, loads their page in iframe, restores admin session in `iframe.onload`. SM role has Audit/Install tab toggle
- **Jobs Overview**: merges `audit_orders` + `install_orders` into unified jobs list with type/status filters
- **Performance**: per-user stats computed from live DB — auditors by `auditor_email`, installers by `sj.installer_email`, SMs by `created_by_email`
- **Job Cards**: table of all signed+completed job cards (audit: `audit_ticked.sign` exists; install: `sj.jobcard.sign` exists). "Download PDF" regenerates via `genAuditPDF` or `genInstallPDF`
- Both PDF generators handle both old single `photo` field and new `photos[]` array (backward compatible)

## Job Card Data Shapes

### Audit job card (stored in `audit_ticked` column)
```json
{
  "auditor": "Auditor Name",
  "date": "2026-06-12",
  "sign": { "img": "<base64 jpeg>", "name": "Client Name" },
  "rooms": [
    {
      "name": "Master Bedroom",
      "type": "flooring",
      "sku": "WF-OAK-12MM",
      "calc": { "area": "180", "boxes": "12", "skirt": "40", ... },
      "notes": "Parquet pattern",
      "photos": ["<base64>", "<base64>"],
      "sketchStrokes": [[{x,y}, ...], ...]
    }
  ]
}
```
Flooring calc fields: `area, boxes, skirt, skirtH, lprof, rprof, tprof, corner`
Wallpaper calc fields: `warea, rolls, repeat, match, adh, primer`

### Install job card (stored in `subjobs[i].jobcard`)
```json
{
  "draft": true,
  "rooms": [
    {
      "name": "Living Room",
      "sku": "WF-OAK-12MM",
      "photos": ["<base64>", "<base64>"],
      "comments": "Minor scratch on skirting noted"
    }
  ],
  "sign": { "img": "<base64 jpeg>", "name": "Client Name" }
}
```

## JS Field ↔ DB Column Mappings

| JS (audit orders) | DB column |
|---|---|
| `o.name` | `customer_name` |
| `o.po` (array) | `po` (text, comma-joined) |
| `o.auditTicked` | `audit_ticked` |
| `o.auditor` | `auditor_id` |
| `o.auditorName` | `auditor_name` |
| `o.auditorEmail` | `auditor_email` |

| JS (install orders) | DB column |
|---|---|
| `o.name` | `customer_name` |
| `o.matchedAudit` | `matched_audit` |
| `o.deliveryDate` | `delivery_date` |
| `o.customWp` | `custom_wp` |
| `o.auditBy` | `service.audit_by` |

| JS (subjob) | field in `subjobs[]` |
|---|---|
| `sj.installer` | `installer` (profile uuid) |
| `sj.installer_email` | `installer_email` |
| `sj.jobcard` | `jobcard` (full object) |

## CSS Design System
```css
--navy:#1F3A5F   --navy2:#16294a  --blue:#2E6CA8   --yellow:#F4C20D
--ink:#1b2230    --muted:#67748a  --line:#dde3ec   --bg:#eef1f6   --card:#fff
--green:#1f7a3f  --red:#b3261e    --amber:#9a6200  --purple:#5b3aa6
--teal:#0f6e74   (install dashboard only)
```

## Status Chips
| Status key | CSS class | Display label |
|---|---|---|
| `pending` | `c-pending` | Pending |
| `created` | `c-created` | Service Created |
| `call_na` | `c-call_na` | Call not picked |
| `scheduled` | `c-scheduled` | Scheduled |
| `assigned` | `c-assigned` | Assigned |
| `callpending` | `c-assigned` | Call Pending |
| `reschedule` | `c-reschedule` | Reschedule |
| `onway` | `c-onway` | On the Way |
| `atsite` | `c-atsite` | At Site |
| `completed` | `c-completed` | Completed |
| `partial` | `c-partial` | Partially Completed |
| `deliv_ontime` | `c-deliv_ontime` | Delivery on time |
| `deliv_delayed` | `c-deliv_delayed` | Delivery Delayed |

## Important Implementation Notes

1. **Job key format in installer app**: composite key is `pi + '|' + sjId` — parsed with `key.indexOf('|')`, NOT `split('_')` (underscore is used inside PI numbers)

2. **Autosave draft excludes photos**: `collectRooms().map(({photos, ...rest}) => rest)` — photos are stripped from draft saves to keep JSONB size manageable; full photos only saved on final submission

3. **Crop modal output size**: fixed 340×255px JPEG at 0.82 quality — consistent size regardless of input

4. **Backward compat for photos**: all PDF generators use `r.photos || (r.photo ? [r.photo] : [])` to handle both old single-photo and new photos-array formats

5. **Slot/caps config is in-memory**: `SLOTS` and `CAPS` objects in SM Audit Dashboard are not persisted to DB — they reset on page reload. This is intentional (current design).

6. **Installer audit report lookup**: finds audit by matching `phone` number (not PI), fetches most recent completed audit order for that phone

7. **Admin role viewer iframe**: session injection happens synchronously before `iframe.src` is set; admin session is restored in `iframe.onload` callback

8. **PDF generation is fully client-side**: uses jsPDF from CDN, generates blob URLs, triggers browser download. No server involvement.

9. **Audit ticked backward compat**: old completed orders have `audit_ticked` as an array (e.g. `["Wooden Flooring"]`). Check `!Array.isArray(ticked)` before accessing `ticked.rooms`.

10. **SM install polling is 30s, audit is 10s**: do not change these without understanding the load implications.

## Deployment Workflow
```bash
git add <specific files>
git commit -m "description"
git push origin master
vercel --prod
```
Always add specific files, not `git add .` — avoid accidentally staging unintended changes.
