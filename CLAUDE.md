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
| `Login.html` | Passcode login, writes `md_user` to **localStorage** |
| `Admin.html` | Admin console — user management, role viewer, jobs overview, performance, job cards |
| `SM_Audit_Dashboard.html` | Service Manager — site audit order lifecycle |
| `SM_Install_Dashboard.html` | Service Manager — installation order lifecycle |
| `Site_Auditor_App.html` | Field auditor mobile app (max-width 520px) |
| `Site_Installer_App.html` | Field installer mobile app (max-width 480px) |
| `vercel.json` | Cache-Control: no-cache for all HTML files |

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
- Roles: `admin`, `service_mgr`, `site_auditor`, `installer`, `auditor_installer`
- All emails end in `@materialdepot.com`
- `installer_type`: `'flooring'` or `'wallpaper'` (required for both `installer` and `auditor_installer` roles)
- `passcode`: 4-digit string, null until first login (triggers passcode creation screen)
- **DB constraint**: `profiles_role_check` CHECK on `role` column — must include all valid role values. When adding a new role, update via Supabase SQL Editor: `ALTER TABLE profiles DROP CONSTRAINT profiles_role_check; ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin','service_mgr','site_auditor','installer','auditor_installer'));`

### Table: `audit_orders`
Created by Service Manager, worked by site auditors.
- Columns: `id`, `created_at`, `pi`, `po` (text, comma-joined), `skus` (jsonb), `audit_ticked` (jsonb), `bm`, `customer_name`, `phone`, `addr`, `status`, `service` (jsonb), `slot`, `date`, `auditor_id`, `auditor_name`, `auditor_email`, `log` (jsonb array), `created_by_email`
- Status flow: `pending → created → scheduled → assigned → onway → atsite → completed / reschedule`
- Special statuses: `deleted` (soft delete), `call_na`
- `audit_ticked` shape (new format): `{auditor, date, sign: {img, name, ratings: {q1, q2, comments}}, rooms: [{name, type, sku, calc, notes, photos: [], sketchStrokes: []}]}`
- `audit_ticked` old format (legacy): array of strings like `["Wooden Flooring"]`
- `service` shape: `{flooring: [{sku, name, link}], wallpaper: [{sku, name, link}], follow_up_date?: "YYYY-MM-DD"}`
- `service` extended for rectification: adds `rectification_raised: true`, `rectification_pi: "PI-...-R"`, `rectification_type: "audit"|"install"`
- `service` for rectification orders: `{rectification_of: "original_pi", issue: "complaint text"}`
- **SM displays `assigned` as "Site Auditor Assigned"; auditor app maps DB `assigned` → local `scheduled`**

### Table: `install_orders`
Created by Service Manager, worked by installers.
- Columns: `id`, `created_at`, `pi`, `po`, `skus` (jsonb), `bm`, `customer_name`, `phone`, `addr`, `matched_audit` (bool), `delivery_date`, `custom_wp` (bool), `status`, `subjobs` (jsonb array), `service` (jsonb), `log` (jsonb), `created_by_email`
- Status flow: `pending → deliv_ontime / deliv_delayed → created → scheduled → assigned → onway → atsite → completed / partial / reschedule`
- Special status: `deleted` (soft delete)
- `subjobs` shape (current multi-installer format):
  ```json
  [{
    "id": "sj_fl",
    "type": "flooring",
    "installer": "uuid",
    "installer_email": "email",
    "date": "YYYY-MM-DD",
    "slot": "sf1",
    "assignments": [
      {
        "installer_id": "uuid",
        "installer_email": "email",
        "installer_name": "Name",
        "mode": "standard|custom",
        "date": "YYYY-MM-DD",
        "slots": ["sf1","sf2"],
        "dates": ["YYYY-MM-DD", ...],
        "status": "assigned|onway|atsite|completed|reschedule",
        "primary": true
      }
    ],
    "status": "created|assigned|onway|atsite|completed|reschedule|partial",
    "items": [{"sku": "WF-OAK-12MM", "name": "...", "link": "...", "qty": "12 boxes", "rolls": "5"}],
    "jobcard": {"rooms": [...], "sign": {"img": "...", "name": "...", "ratings": {"q1": 8, "q2": 9, "comments": "..."}}}
  }]
  ```
- Legacy subjobs (pre-multi-installer): use `sj.installer`, `sj.installer_email`, `sj.date`, `sj.slot` directly
- Backward compat: if `sj.assignments` exists use it; else fall back to old fields
- **`primary` flag**: each assignment has `primary: true|false`. First installer defaults to primary if none set. `sj.status` only follows the primary installer's status; additional installers' completions don't drive `sj.status`.
- **`items[].qty`**: quantity required for each SKU — displayed to installer on job detail and pre-fills room qty field in the installation card
- `service` shape: `{flooring: [{sku, name, link, qty}], wallpaper: [{sku, name, link, qty, rolls}], audit_by: 'material_depot' | 'customer', follow_up_date?: "YYYY-MM-DD"}`
- `service` extended for rectification: same flags as audit_orders
- Parent status rolled up from sub-job statuses via `syncParent()`

### Table: `ratings`
Written after every completed audit or installation job. Used for NPS and staff performance assessment.
- Columns: `id` (uuid), `created_at`, `order_type` ('audit'|'install'), `pi`, `order_id` (uuid), `staff_email`, `staff_name`, `q1_score` (1-10), `q2_score` (1-10), `comments`, `customer_name`, `customer_phone`
- Create SQL: `CREATE TABLE ratings (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, created_at timestamptz DEFAULT now(), order_type text CHECK (order_type IN ('audit','install')), pi text NOT NULL, order_id uuid, staff_email text, staff_name text, q1_score int CHECK (q1_score BETWEEN 1 AND 10), q2_score int CHECK (q2_score BETWEEN 1 AND 10), comments text DEFAULT '', customer_name text, customer_phone text);`
- q1 = overall experience, q2 = person (auditor/installer) rating
- Ratings also stored in `audit_ticked.sign.ratings` / `subjobs[i].jobcard.sign.ratings` (both copies exist)

## Auth / Session
- `localStorage` key: `md_user` → `{name, email, role}` — **persistent across browser sessions**
- Every page reads session on load via `getSession()` and role-guards; redirects to `Login.html` on failure
- Login flow: email → check profiles → if no passcode: create passcode screen; else: enter passcode screen
- Role → file routing on login: `admin→Admin.html`, `service_mgr→SM_Audit_Dashboard.html`, `site_auditor→Site_Auditor_App.html`, `installer→Site_Installer_App.html`, `auditor_installer→Site_Auditor_App.html` (default; can switch)
- **SM dashboards accept both `service_mgr` and `admin` roles** — guard is `!['service_mgr','admin'].includes(SESSION.role)`. Admins can navigate directly to SM dashboards even though login routes them to Admin.html first.
- **`auditor_installer` role**: accepted by both `Site_Auditor_App.html` (guard: `['site_auditor','auditor_installer']`) and `Site_Installer_App.html` (guard: `['installer','auditor_installer']`). A **"⇄ Installer"** / **"⇄ Auditor"** button appears in the header; tapping navigates between the two apps. Implemented via `#switchRole` button shown/wired in JS after session check.
- Logout: clears `localStorage.removeItem('md_user')` then redirects to Login.html
- Admin.html role viewer iframe trick also uses localStorage (not sessionStorage)

## Polling Intervals
- `SM_Audit_Dashboard.html`: `setInterval(loadOrders, 10000)` — every 10 seconds
- `SM_Install_Dashboard.html`: `setInterval(loadOrders, 30000)` — every 30 seconds
- `Site_Auditor_App.html`: `setInterval(loadJobs, 10000)` — every 10 seconds
- `Site_Installer_App.html`: `setInterval(loadJobs, 10000)` — every 10 seconds

## Architecture Patterns

### SM Audit Dashboard (`SM_Audit_Dashboard.html`)
- Nav views: Orders, Today's schedule, To reschedule, Follow-ups, Availability calendar, Slots & timings, Auditors & caps, Deleted Orders, Rectifications
- **Categories column**: orders table shows Flooring / Wallpaper / Custom WP pills derived via `orderCategoriesAudit(o)` — checks `audit_ticked` (array or rooms), then `service`, then SKU types
- **Slot system**: split into `SLOTS_FL` (flooring, IDs `sf1/sf2/sf3`) and `SLOTS_WP` (wallpaper, IDs `sw1/sw2/sw3`). Both in-memory, reset on reload. `slotLabel()` searches both arrays. `slotsForOrder(o)` returns the appropriate set based on `audit_ticked` categories (flooring-only → `SLOTS_FL`, wallpaper-only → `SLOTS_WP`, both → combined deduped). Slot booking in drawer uses `slotsForOrder(o)`.
- **Slots & timings setup**: two side-by-side panels (Wooden Flooring / Wallpapers), each with independent Add/Save/Delete. CRUD uses `data-delslot-fl` / `data-delslot-wp` attributes.
- **Follow-up date**: SM can set `service.follow_up_date` (YYYY-MM-DD) on any created/call_na order to defer slot booking. Shown as amber badge in orders table and dedicated Follow-ups view.
- **Reschedule remarks**: when an order is in `reschedule` status, the drawer shows an optional Remarks textarea above the "Rebook slot" button. The remark is appended to the log entry as `"Slot rebooked: <date> · <slot> — <remark>"`.
- **Add Staff**: SM can add site auditors, installers, and auditor+installers from the Auditors & caps view. Options: `site_auditor`, `installer_flooring`, `installer_wallpaper`, `auditor_installer_flooring`, `auditor_installer_wallpaper`. Passcode not set by SM — user creates it on first login.
- **Auditor pool query**: `profiles?role=in.(site_auditor,auditor_installer)` — `auditor_installer` users appear as assignable auditors.
- Order detail opens in right-side drawer
- `CAPS[auditorId][date]` per-auditor daily caps (in-memory)
- `AUTO_STATUSES = ["onway", "atsite", "completed"]` — set by auditor app
- PDF download on completed orders: always fetches fresh `audit_ticked` from DB (photos may not be in memory)

### SM Install Dashboard (`SM_Install_Dashboard.html`)
- Nav views: Orders, **Need Action**, Call Operations today, Today's installs, To reschedule, Follow-ups, Installer calendar, Slots & timings, Installers, Deleted Orders, Rectifications
- **Categories column**: orders table shows Flooring / Wallpaper / Custom WP pills via `orderCategoriesInstall(o)` — checks `service`, then SKU types
- **Need Action tab**: aggregates ops calls due today + follow-ups due/overdue + to-reschedule sub-jobs into one actionable view. Count badge in rail nav. Computed by `needActionCount()`.
- **Sort by delivery date**: "Delivery date ↑/↓" toggle button in orders toolbar. State in `sortDelivery` variable (`"asc"|"desc"`). Applied after filtering.
- **Slot system**: `SLOTS_FL` (flooring windows, IDs `sf1...`) and `SLOTS_WP` (wallpaper windows, IDs `sw1/sw2/sw3`, replaces old hardcoded `WP_TIME_SLOTS`). `slotLabel()` searches both. `autoWpSlots(n)` uses `SLOTS_WP`. **Slots & timings setup**: two side-by-side panels with independent CRUD.
- **Follow-up date**: SM can set `service.follow_up_date` on any order. Shown as badge in orders table and dedicated Follow-ups view. Count badge in rail nav when due.
- **Ops call due logic**: `opsCallDue(o)` fires for both `pending` AND `deliv_delayed` status. Custom WP → 3 days before delivery; standard → 1 day. Enables reminders after SM marks order delayed with a new delivery date.
- **Reschedule remarks**: when a sub-job is in `reschedule` status, `renderAssignSection` shows optional Remarks textarea. Remark written to log.
- **Add Staff**: SM can add installers, auditors, and auditor+installers from the Installers view.
- **Installer pool query**: `profiles?role=in.(installer,auditor_installer)`
- **Multi-installer assignment UI with primary**: Each sub-job (sj_fl, sj_wp) shows Standard/Custom toggle + installer cards. First installer defaults to primary (★ badge). SM can click "Make primary" on others. `primary: true/false` saved in each assignment. `sj.status` only tracks primary's progress.
- **Assignment validation**: Save button requires date for each installer. Wallpaper also requires `a.slots.length > 0`.
- **Wallpaper slot logic**:
  - Configurable windows in `SLOTS_WP` (was `WP_TIME_SLOTS`)
  - `slotsForWp(rolls)`: 1-3 rolls = 1 slot (3h), 4-6 rolls = 2 slots (6h), 7+ rolls = 3 slots (9h)
  - `WP_DAY_SLOTS = 3` (max slots/installer/day — const, not the array)
  - Standard mode slot chips have `data-slot`/`data-idx` and are interactive. `draw()` initialises `a.slots` from `autoWpSlots` if empty.
- **Flooring slot logic**: Full day, `FLOOR_DAY_CAP = 1` job/installer/day
- **Custom/Multi-day mode**: SM picks date range per installer; no capacity enforcement
- `syncParent(o)` rolls up parent order status from sub-job statuses
- PDF download on completed sub-jobs: always fetches fresh `subjobs` from DB

### Service Creation — SKU Auto-fill
Both dashboards pre-populate the service creation `draft` from `o.skus` when `o.service` is null.
- Install service SKU rows have fields: `sku`, `name`, `link`, `qty` (both flooring and wallpaper), `rolls` (wallpaper only)
- `qty` flows from service → `sj.items[].qty` → installer app job detail → pre-fills room qty in installation card
- Edit sections (`editInstallServiceSection`, `editAuditServiceSection`) **pre-render input values** in HTML at render time.

### Site Auditor App (`Site_Auditor_App.html`)
- 3 screens: list view, detail screen, job card screen
- `ME = {name, email, zone}` — fetches only orders where `auditor_email = ME.email`
- Status mapping: DB `assigned` ↔ local `scheduled`
- Auto-flip: `scheduled → callpending` 3 hours before slot start time (client-side, in `autoFlip()`)
- **Day strip**: spans **30 days back → today → 6 days ahead** (37 chips total). After each render, `wireList()` auto-scrolls the strip so the selected day is centred.
- **Reschedule at any stage**: every active stage (`scheduled`, `callpending`, `onway`, `atsite`) has a "Can't proceed — Reschedule" button. Tapping shows `showRescheduleForm()` — a full-detail-body replacement with a mandatory reason textarea. On confirm calls `adv("reschedule", msg, logOverride)`. The "Customer declined" button in `callpending` also goes through this form. Reason saved in log as `"Reschedule requested: <reason>"`.
- `adv(st, msg, logOverride)` — optional third param overrides the default log message
- **Job Card flow**: review → **ratings screen** → signature → complete
- **Ratings screen** (before signature): two 1-10 star questions + optional comments. Q1 = overall audit experience, Q2 = auditor behaviour. Stored in `jcSign.ratings`. On completion, also written to `ratings` table.
- **Ratings write**: `sbPost('ratings', {order_type:'audit', pi, order_id, staff_email, staff_name, q1_score, q2_score, comments, customer_name, customer_phone})` — inside `try/catch` to not block completion if table missing.
- **Job Card**: multi-room form with type toggle, calculation fields, 2D sketch canvas, multi-photo grid with crop modal, notes
- **Photo capture**: `📷 Camera` → crop modal → 1020×765 JPEG @ 0.92. `🖼 Gallery` → compressed to max 1500px JPEG @ 0.88
- **Autosave**: saves to `localStorage` immediately + debounced `sbPatch` after 3s (draft strips photos)
- On completion: saves full `audit_ticked` with photos + ratings to DB, generates PDF via `genPDF(o)`
- PDF includes "Client Feedback" table with q1/q2 scores and comments when ratings present

### Site Installer App (`Site_Installer_App.html`)
- 4 screens: list view, detail screen, audit report screen, installation card screen
- Fetches ALL `install_orders`, filters client-side: `sj.assignments.some(a => a.installer_email === ME.email)` with fallback to `sj.installer_email === ME.email` (legacy)
- On init: fetches own `installer_type` from `profiles`
- Job composite key: `pi + '|' + sjId` — parsed with `key.indexOf('|')` (NOT split on `_`)
- Status mapping: DB `assigned` ↔ local `scheduled`
- **`isPrimary` field**: set at `loadJobs()` time — `myAssign.primary === true`, or first assignment if no `primary` flag set. Stored on local job object. Controls UI and completion flow.
- **Primary installer flow**: full flow → ratings screen → customer signature → job card PDF → `sj.status = 'completed'`
- **Additional installer flow**: fills room card → "Mark my part complete" via `markAdditionalComplete()` — saves rooms + marks own assignment done, does NOT change `sj.status`, does NOT trigger ratings/signature
- `sj.status` driven ONLY by the primary installer's status in `adv()` (`amPrimary` check before setting `sj.status`)
- **Reschedule at any stage**: every active stage has "Can't proceed — Reschedule" button. Shows `showRescheduleForm()` — mandatory reason textarea. On confirm calls `adv("reschedule", msg, logOverride)`. Reason saved as `"Reschedule requested: <reason>"`. The `callpending` "They said NO" button also goes through this form.
- `adv(st, msg, logOverride)` — optional third param overrides default log message
- **Ratings screen** (before signature, primary only): two 1-10 star questions + optional comments. Q1 = overall installation experience, Q2 = installer rating. On completion, written to `ratings` table.
- **Ratings write**: `sbPost('ratings', {order_type:'install', ...})` — inside `try/catch`
- Anti-double-submit: `_advBusy` flag + disable all `#detBody .bigbtn` at start of `adv()`
- Date/slot from own assignment: `myAssign.date` and `myAssign.slots` (not top-level `sj.date`)
- **Day strip**: 37-chip strip, auto-scrolls to active chip
- **Unscheduled / Overdue alert sections**: amber "Unscheduled" section + red "Overdue" section on today's view
- **Installation Card**: per-room form with room name★, SKU★, Quantity★ (pre-filled from `sj.items[0].qty`), Height, Width, photos★, comments
- **Photo capture**: same as auditor app — camera with crop, gallery compressed at capture
- PDF includes "Client Feedback" table when ratings present

### Admin Console (`Admin.html`)
- Desktop layout with sidebar nav
- Nav views: Overview, Users, Role Viewer, Jobs Overview, Performance, Job Cards
- **Users**: full CRUD — add user, edit role, reset passcode (sets to null), delete
- **Role Viewer**: iframe injection trick — uses localStorage. `auditor_installer` role shows tab switcher.
- **Job Cards**: all signed+completed job cards with PDF download
- Both PDF generators handle both old `photo` field and new `photos[]` array
- **`submitEditRole` error handling**: checks that `sbPatch` returns a non-empty array.

## Slot System (both dashboards)
Both dashboards use two separate in-memory slot arrays (reset on page reload):
- `SLOTS_FL`: flooring audit/install windows. IDs prefixed `sf` (e.g. `sf1`, `sf2`, `sf3`)
- `SLOTS_WP`: wallpaper audit/install windows. IDs prefixed `sw` (e.g. `sw1`, `sw2`, `sw3`)
- `slotLabel(id)` searches `[...SLOTS_FL, ...SLOTS_WP]`
- Install: `autoWpSlots(n)` = `SLOTS_WP.slice(0,n).map(s=>s.id)`
- Audit: `slotsForOrder(o)` picks FL, WP, or combined set based on order's `audit_ticked` categories

| Rolls | Slots needed | Duration |
|---|---|---|
| 1-3 | 1 slot | 3 hours |
| 4-6 | 2 slots | 6 hours |
| 7+ | 3 slots | 9 hours (full day) |

`slotsForWp(rolls)` in SM_Install_Dashboard: `const r=Number(rolls)||0; return r<=3?1:r<=6?2:3;`

## Follow-up Date Feature
- Stored in `service.follow_up_date` (string, YYYY-MM-DD) in both `audit_orders` and `install_orders`
- No DB schema change — stored in existing `service` JSONB column
- SM sets/clears from the order drawer (available when `o.service` exists)
- Shown as amber badge in orders table when due today or overdue
- Dedicated "Follow-ups" nav view in both SM dashboards sorted by date
- Count badge in rail nav turns red when any follow-ups are due/overdue today

## Reschedule Remarks Feature (SM side)
- When `o.status === 'reschedule'` (audit) or `sj.status === 'reschedule'` (install sub-job), an optional **Remarks** textarea appears in the SM drawer
- Remark is optional — if blank, log entry is identical to non-reschedule saves
- Audit log format: `"Slot rebooked: Mon 16 Jun · 9 AM–12 PM — <remark>"`
- Install log format: `"flooring rescheduled — <remark>: Installer Name"`
- No DB schema change — remark lives only in the `log` jsonb array entry

## Job Card Data Shapes

### Audit job card (stored in `audit_ticked` column)
```json
{
  "auditor": "Auditor Name",
  "date": "2026-06-13",
  "sign": {
    "img": "<base64 jpeg>",
    "name": "Client Name",
    "ratings": {"q1": 8, "q2": 9, "comments": "Great service"}
  },
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
  "rooms": [
    {
      "name": "Living Room",
      "sku": "WF-OAK-12MM",
      "qty": "12 boxes",
      "height": "10 ft",
      "width": "12 ft",
      "photos": ["<base64>", "<base64>"],
      "comments": "Minor scratch on skirting noted"
    }
  ],
  "sign": {
    "img": "<base64 jpeg>",
    "name": "Client Name",
    "ratings": {"q1": 9, "q2": 8, "comments": ""}
  }
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
| `sj.installer` | `installer` (profile uuid, legacy primary) |
| `sj.installer_email` | `installer_email` (legacy primary) |
| `sj.assignments` | `assignments` (new multi-installer array) |
| `sj.jobcard` | `jobcard` (full object) |
| `sj.items[].qty` | `items[i].qty` (quantity required per SKU) |

| JS (assignment) | field in `assignments[]` |
|---|---|
| `a.primary` | `primary` (bool — drives sj.status) |
| `a.installer_id` | `installer_id` |
| `a.installer_email` | `installer_email` |
| `a.slots` | `slots` (array of slot IDs) |

| JS (installer job) | source |
|---|---|
| `j.isPrimary` | computed at loadJobs from `myAssign.primary` |
| `j.sku[].qty` | from `sj.items[i].qty` |

## CSS Design System
```css
--navy:#1F3A5F   --navy2:#16294a  --blue:#2E6CA8   --yellow:#F4C20D
--ink:#1b2230    --muted:#67748a  --line:#dde3ec   --bg:#eef1f6   --card:#fff
--green:#1f7a3f  --red:#b3261e    --amber:#9a6200  --purple:#5b3aa6
--teal:#0f6e74   (install dashboard + auditor_installer role colour)
```
Role badge CSS in Admin.html: `.rb-site_auditor` (blue), `.rb-installer` (green), `.rb-auditor_installer` (teal `#e0f4f4 / #0f6e74`).

Auditor app buttons: `.btn.green`, `.btn.navy`, `.btn.blue`, `.btn.ghost`, `.btn.warn` (red outline)
Installer app buttons: `.bigbtn.green`, `.bigbtn.navy`, `.bigbtn.blue`, `.bigbtn.amber`, `.bigbtn.red` (red outline), `.bigbtn.ghost`

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

2. **Autosave draft excludes photos**: `collectRooms().map(({photos, ...rest}) => rest)` — photos stripped from draft saves; full photos only saved on final submission

3. **Crop modal output size**: 340×255 display canvas but outputs at **1020×765 JPEG @ 0.92** by re-drawing the original image at 3× scale. Consistent crop position is preserved.

4. **Gallery photo storage**: Immediately compressed at capture to max 1500×1500 JPEG @ 0.88 (no raw storage).

5. **PDF image pipeline**: All photos go through `compress(photo, 1600, 0.88)` or equivalent before `doc.addImage`. Always outputs JPEG (no WebP fallback).

6. **PDF addImage format**: All `doc.addImage` calls use `'JPEG'` format string. Errors are caught silently with `try{}catch(e){}`.

7. **PDF fresh fetch**: SM dashboards always fetch `audit_ticked` / `subjobs` fresh from DB before generating PDFs.

8. **Smart quotes in JS**: Never use typographic/curly quotes (`"`, `"`, `'`, `'`) in JavaScript code blocks — only ASCII `"` and `'`. The Edit tool can introduce smart quotes from markdown, breaking JS parsing.

9. **Backward compat for photos**: all PDF generators use `r.photos || (r.photo ? [r.photo] : [])` to handle both old single-photo and new photos-array formats.

10. **Slot/caps config is in-memory**: `SLOTS_FL`, `SLOTS_WP`, `CAPS` in SM dashboards are not persisted to DB — reset on page reload. Old `SLOTS` and `WP_TIME_SLOTS` names are gone; do not re-introduce them.

11. **Installer audit report lookup**: finds audit by matching `phone` number (not PI), fetches most recent completed audit order for that phone.

12. **Admin role viewer iframe**: session injection uses localStorage for both admin and impersonated sessions; admin session is restored in `iframe.onload`.

13. **SM install polling is 30s, audit is 10s**: do not change these without understanding load implications.

14. **Service creation SKU auto-fill**: `draft` is populated from `o.skus` when `o.service` is null. If `o.service` exists, `draft` populates from `o.service` for editing. Draft items include `qty` field for both flooring and wallpaper.

15. **Service edit section**: shown whenever `o.service !== null`. SKU rows pre-rendered in HTML at render time.

16. **Rectification flow**: "↩ Raise Rectification" on completed orders. Creates new pending order with `service.rectification_of = original_pi`. RECT badge on original orders.

17. **Primary installer drives sj.status**: in `adv()` inside the installer app, `sj.status = dbSt` only executes when `amPrimary === true`. Non-primary installers update only their own `assignment.status`. In `showInstallSignature` (primary completion), `sj.status = 'completed'` unconditionally — do NOT revert this to the old "completed only when ALL done" logic.

18. **SM Add Staff**: both SM dashboards can create `site_auditor`, `installer`, and `auditor_installer` profiles via `sbPost('profiles', {name, email, role, installer_type, passcode: null})`. The add-staff form uses compound option values (`installer_flooring`, `auditor_installer_wallpaper`, etc.) decoded into `role` + `installer_type` before posting.

19. **vercel.json**: sets `Cache-Control: no-cache` for all `*.html` files to prevent mobile browsers serving stale JS.

20. **localStorage persistence**: All pages use `localStorage` (not `sessionStorage`) for `md_user`. Login writes to localStorage; logout clears it. No auto-expiry.

21. **Admin role in SM dashboards**: role guard is `!['service_mgr','admin'].includes(SESSION.role)` — both roles are allowed. Do NOT tighten back to `service_mgr` only.

22. **Day strip in field apps**: both apps generate 37-chip strips via `Array.from({length:37},(_,i)=>addDays(i-30))`. After `innerHTML` is set, `wireList()` scrolls the container so the active chip is centred. Today's chip always renders "Today" as its weekday label.

23. **Wallpaper slot chips**: in SM_Install_Dashboard, wallpaper slot chips use `data-slot` (slot ID from `SLOTS_WP`) and `data-idx` (assignment index). `draw()` initialises `a.slots` from `autoWpSlots(slotsN)` if empty. Slot IDs in `SLOTS_WP` are `sw1/sw2/sw3`; flooring `SLOTS_FL` are `sf1/sf2/sf3` — keep these prefixes consistent so `slotLabel()` can search both arrays.

24. **Reschedule remarks — SM side**: audit uses `id="reschedRemark"` (singleton per drawer open); install uses `id="reschedRemark_${sj.id}"` (one per sub-job). The `bookSlot` handler checks `if($("#reschedRemark"))` to distinguish reschedule from initial booking.

25. **Reschedule from field app**: `showRescheduleForm()` in both field apps replaces `#detBody` innerHTML with a reason textarea. On confirm, calls `adv("reschedule", msg, "Reschedule requested: " + reason)`. On cancel, calls `openDetail(pi)` or `openDetail(pi+'|'+sjId)` to restore the view. The `adv()` third parameter `logOverride` is used here — don't change `adv` signature without updating all callers.

26. **Ratings write is non-blocking**: both apps wrap `sbPost('ratings', ...)` in `try/catch` so a missing `ratings` table doesn't break job completion. The `ratings` table must be created manually in Supabase SQL Editor before ratings will actually persist.

27. **Unscheduled jobs in installer app**: jobs with `date: null` or `date: ""` are shown in amber "Unscheduled" section above the day strip. Overdue jobs appear in red "Overdue" section on today's view only.

28. **SM assignment date validation**: `renderAssignSection` save handler validates `a.date` (standard mode) or `a.dates.length` (custom mode) before saving. Wallpaper also validates `a.slots.length`. Blocks save and shows toast if missing.

29. **Install job card room fields**: rooms include `name`, `sku`, `qty`, `height`, `width` (optional), `photos[]`, `comments`. `qty` pre-filled from `jcJob.sku[0].qty` if available. Height/Width displayed in PDF as "H × W" column.

30. **opsCallDue covers deliv_delayed**: `opsCallDue(o)` checks `['pending','deliv_delayed'].includes(o.status)`. This means delayed orders with a new delivery date appear in "Call Operations today" when within the call window (3d for custom WP, 1d for standard). Do NOT revert to `o.status !== 'pending'` guard.

## Deployment Workflow
```bash
git add <specific files>
git commit -m "description"
git push origin master
vercel --prod
```
Always add specific files, not `git add .` — avoid accidentally staging unintended changes.
