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
- Roles: `admin`, `service_mgr`, `site_auditor`, `installer`
- All emails end in `@materialdepot.com`
- `installer_type`: `'flooring'` or `'wallpaper'` (only relevant for installer role)
- `passcode`: 4-digit string, null until first login (triggers passcode creation screen)

### Table: `audit_orders`
Created by Service Manager, worked by site auditors.
- Columns: `id`, `created_at`, `pi`, `po` (text, comma-joined), `skus` (jsonb), `audit_ticked` (jsonb), `bm`, `customer_name`, `phone`, `addr`, `status`, `service` (jsonb), `slot`, `date`, `auditor_id`, `auditor_name`, `auditor_email`, `log` (jsonb array), `created_by_email`
- Status flow: `pending → created → scheduled → assigned → onway → atsite → completed / reschedule`
- Special statuses: `deleted` (soft delete), `call_na`
- `audit_ticked` shape (new format): `{auditor, date, sign: {img, name}, rooms: [{name, type, sku, calc, notes, photos: [], sketchStrokes: []}]}`
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
- `subjobs` shape (new multi-installer format):
  ```json
  [{
    "id": "sj_fl",
    "type": "flooring",
    "installer": "uuid",
    "installer_email": "email",
    "date": "YYYY-MM-DD",
    "slot": "s1",
    "assignments": [
      {
        "installer_id": "uuid",
        "installer_email": "email",
        "installer_name": "Name",
        "mode": "standard|custom",
        "date": "YYYY-MM-DD",
        "slots": ["s1","s2"],
        "dates": ["YYYY-MM-DD", ...],
        "status": "assigned|onway|atsite|completed|reschedule"
      }
    ],
    "status": "created|assigned|onway|atsite|completed|reschedule|partial",
    "items": [{sku, name, link, rolls}],
    "jobcard": {rooms: [...], sign: {img, name}}
  }]
  ```
- Legacy subjobs (pre-multi-installer): use `sj.installer`, `sj.installer_email`, `sj.date`, `sj.slot` directly
- Backward compat: if `sj.assignments` exists use it; else fall back to old fields
- `service` shape: `{flooring: [...], wallpaper: [...], audit_by: 'material_depot' | 'customer', follow_up_date?: "YYYY-MM-DD"}`
- `service` extended for rectification: same flags as audit_orders
- Parent status is rolled up from sub-job statuses via `syncParent()`

## Auth / Session
- `localStorage` key: `md_user` → `{name, email, role}` — **persistent across browser sessions**
- Every page reads session on load via `getSession()` and role-guards; redirects to `Login.html` on failure
- Login flow: email → check profiles → if no passcode: create passcode screen; else: enter passcode screen
- Role → file routing: `admin→Admin.html`, `service_mgr→SM_Audit_Dashboard.html`, `site_auditor→Site_Auditor_App.html`, `installer→Site_Installer_App.html`
- Logout: clears `localStorage.removeItem('md_user')` then redirects to Login.html
- Admin.html role viewer iframe trick also uses localStorage (not sessionStorage)

## Polling Intervals
- `SM_Audit_Dashboard.html`: `setInterval(loadOrders, 10000)` — every 10 seconds
- `SM_Install_Dashboard.html`: `setInterval(loadOrders, 30000)` — every 30 seconds
- `Site_Auditor_App.html`: `setInterval(loadJobs, 10000)` — every 10 seconds
- `Site_Installer_App.html`: `setInterval(loadJobs, 10000)` — every 10 seconds

## Architecture Patterns

### SM Audit Dashboard (`SM_Audit_Dashboard.html`)
- Nav views: Orders, Today's schedule, To reschedule, **Follow-ups**, Availability calendar, Slots & timings, Auditors & caps, Deleted Orders, Rectifications
- **Follow-up date**: SM can set `service.follow_up_date` (YYYY-MM-DD) on any created/call_na order to defer slot booking. Shown as badge in orders table and dedicated Follow-ups view.
- **Add Staff**: SM can add site auditors and installers (name, email, role) from the Auditors & caps view. Passcode not set by SM — user creates it on first login.
- Order detail opens in right-side drawer
- Slot system: in-memory `SLOTS` array with labels; `CAPS[auditorId][date]` per-auditor daily caps
- `AUTO_STATUSES = ["onway", "atsite", "completed"]` — set by auditor app
- PDF download on completed orders: always fetches fresh `audit_ticked` from DB (photos may not be in memory)

### SM Install Dashboard (`SM_Install_Dashboard.html`)
- Nav views: Orders, Call Operations today, Today's installs, To reschedule, **Follow-ups**, Installer calendar, Slots & timings, Installers, Deleted Orders, Rectifications
- **Follow-up date**: SM can set `service.follow_up_date` on any order to defer installer scheduling. Shown as badge in orders table and dedicated Follow-ups view. Count badge in rail nav when follow-ups are due.
- **Add Staff**: SM can add installers/auditors from the Installers view. Passcode not set by SM.
- **Multi-installer assignment UI**: Each sub-job (sj_fl, sj_wp) shows Standard/Custom toggle + installer cards. SM adds installers one by one with date/slots. Saved to `sj.assignments` array. No capacity limits enforced in Custom mode.
- **Wallpaper slot logic (new)**:
  - Fixed 3-hour windows: `WP_TIME_SLOTS = [{id:'s1',label:'8:00 AM – 11:00 AM'}, {id:'s2',label:'11:00 AM – 2:00 PM'}, {id:'s3',label:'2:00 PM – 5:00 PM'}]`
  - `slotsForWp(rolls)`: 1-3 rolls = 1 slot (3h), 4-6 rolls = 2 slots (6h), 7+ rolls = 3 slots (9h)
  - `WP_DAY_SLOTS = 3` (max slots/installer/day)
  - Duration auto-shown as badge in sub-job card
- **Flooring slot logic**: Full day (8 AM – 5 PM), `FLOOR_DAY_CAP = 1` job/installer/day
- **Custom/Multi-day mode**: SM picks date range per installer; no capacity enforcement
- `syncParent(o)` rolls up parent order status from sub-job statuses
- PDF download on completed sub-jobs: always fetches fresh `subjobs` from DB
- Ops call due logic: custom WP → 3 days before delivery; standard → 1 day before delivery

### Service Creation — SKU Auto-fill
Both dashboards pre-populate the service creation `draft` from `o.skus` when `o.service` is null.
- Edit sections (`editInstallServiceSection`, `editAuditServiceSection`) **pre-render input values** in HTML at render time — inputs are populated immediately without waiting for `wireDrawer` to call `renderSkuRows`.

### Site Auditor App (`Site_Auditor_App.html`)
- 3 screens: list view, detail screen, job card screen
- `ME = {name, email, zone}` — fetches only orders where `auditor_email = ME.email`
- Status mapping: DB `assigned` ↔ local `scheduled`
- Auto-flip: `scheduled → callpending` 3 hours before slot start time (client-side, in `autoFlip()`)
- **Job Card**: multi-room form with type toggle, calculation fields, 2D sketch canvas, multi-photo grid with crop modal, notes
- **Photo capture**:
  - `📷 Camera` button → `capture="environment"` input → crop modal → stored at **1020×765 JPEG @ 0.92** (3× canvas output)
  - `🖼 Gallery` button → file input (no crop) → immediately compressed to **1500px max JPEG @ 0.88** before storage
- **Crop modal**: 340×255 display canvas; outputs at 1020×765 (3× scale from original image), JPEG 0.92 quality
- **Autosave**: saves to `localStorage` immediately + debounced `sbPatch` after 3s (draft strips photos to save size)
- On completion: saves full `audit_ticked` with photos to DB, generates PDF via `genPDF(o)`
- `compressImg(dataUrl)`: resizes to max 1600×1200 at JPEG 0.88 before `addImage` in PDF
- `compress(dataUrl, maxDim, q)`: always outputs JPEG (no WebP fallback — jsPDF compatibility)

### Site Installer App (`Site_Installer_App.html`)
- 4 screens: list view, detail screen, audit report screen, installation card screen
- Fetches ALL `install_orders`, filters client-side: `sj.assignments.some(a => a.installer_email === ME.email)` with fallback to `sj.installer_email === ME.email` (legacy)
- On init: fetches own `installer_type` from `profiles`
- Job composite key: `pi + '|' + sjId` — parsed with `key.indexOf('|')` (NOT split on `_`)
- Status mapping: DB `assigned` ↔ local `scheduled`
- Status update pattern (multi-installer aware): fetch parent order → find subjob → update the specific `sj.assignments[i].status` for this installer → recompute `sj.status` from all assignment statuses → `rollupStatus()` for parent → `sbPatch`
- Date/slot from own assignment: `myAssign.date` and `myAssign.slots` (not top-level `sj.date`)
- Audit report screen: fetches by matching `phone` against completed audit orders
- **Installation Card**: per-room form with room name★, SKU★, Quantity★, multi-photo grid with crop modal★, comments
- **Photo capture**: same as auditor app — camera with crop, gallery compressed at capture
- **PDF generation** (`genPDF`): uses `for...of` loop with `await compress(photo, 1600, 0.88)` before every `doc.addImage` call (prevents silent failures from large images)
- `compress(dataURL, maxDim, q)`: always JPEG (no WebP fallback)

### Admin Console (`Admin.html`)
- Desktop layout with sidebar nav
- Nav views: Overview, Users, Role Viewer, Jobs Overview, Performance, Job Cards
- **Users**: full CRUD — add user, edit role, reset passcode (sets to null), delete
- **Role Viewer**: iframe injection trick — uses localStorage (not sessionStorage) to set impersonated user session
- **Job Cards**: all signed+completed job cards with PDF download
- Both PDF generators handle both old `photo` field and new `photos[]` array

## Wallpaper Installer Slot System (new)
| Rolls | Slots needed | Duration |
|---|---|---|
| 1-3 | 1 slot | 3 hours |
| 4-6 | 2 slots | 6 hours |
| 7+ | 3 slots | 9 hours (full day) |

Fixed time windows (WP_TIME_SLOTS):
- s1: 8:00 AM – 11:00 AM
- s2: 11:00 AM – 2:00 PM
- s3: 2:00 PM – 5:00 PM

`slotsForWp(rolls)` in SM_Install_Dashboard: `const r=Number(rolls)||0; return r<=3?1:r<=6?2:3;`

## Follow-up Date Feature
- Stored in `service.follow_up_date` (string, YYYY-MM-DD) in both `audit_orders` and `install_orders`
- No DB schema change — stored in existing `service` JSONB column
- SM sets/clears from the order drawer (available when `o.service` exists)
- Shown as amber badge in orders table when due today or overdue
- Dedicated "Follow-ups" nav view in both SM dashboards sorted by date
- Count badge in rail nav turns red when any follow-ups are due/overdue today

## Job Card Data Shapes

### Audit job card (stored in `audit_ticked` column)
```json
{
  "auditor": "Auditor Name",
  "date": "2026-06-13",
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
      "qty": "12 boxes",
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
| `sj.installer` | `installer` (profile uuid, legacy primary) |
| `sj.installer_email` | `installer_email` (legacy primary) |
| `sj.assignments` | `assignments` (new multi-installer array) |
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

2. **Autosave draft excludes photos**: `collectRooms().map(({photos, ...rest}) => rest)` — photos stripped from draft saves; full photos only saved on final submission

3. **Crop modal output size**: 340×255 display canvas but outputs at **1020×765 JPEG @ 0.92** by re-drawing the original image at 3× scale. Consistent crop position is preserved.

4. **Gallery photo storage**: Immediately compressed at capture to max 1500×1500 JPEG @ 0.88 (no raw storage). Ensures manageable DB size and consistent JPEG format for PDF generation.

5. **PDF image pipeline**: All photos go through `compress(photo, 1600, 0.88)` or equivalent before `doc.addImage`. Always outputs JPEG (no WebP fallback). Max 1600×1200, quality 0.88. Previously used 1200×900 @ 0.65 which caused visible blur.

6. **PDF addImage format**: All `doc.addImage` calls use `'JPEG'` format string since compress always outputs JPEG. Errors are caught silently with `try{}catch(e){}`.

7. **PDF fresh fetch**: SM dashboards always fetch `audit_ticked` / `subjobs` fresh from DB before generating PDFs (large photo payloads may not be in memory from initial load).

8. **Smart quotes in JS**: Never use typographic/curly quotes (`"`, `"`, `'`, `'`) in JavaScript code blocks — only ASCII `"` and `'`. The Edit tool can introduce smart quotes from markdown, breaking JS parsing.

9. **Backward compat for photos**: all PDF generators use `r.photos || (r.photo ? [r.photo] : [])` to handle both old single-photo and new photos-array formats

10. **Slot/caps config is in-memory**: `SLOTS`, `CAPS`, `WP_TIME_SLOTS` in SM dashboards are not persisted to DB — reset on page reload.

11. **Installer audit report lookup**: finds audit by matching `phone` number (not PI), fetches most recent completed audit order for that phone

12. **Admin role viewer iframe**: session injection uses localStorage for both admin and impersonated sessions; admin session is restored in `iframe.onload`

13. **SM install polling is 30s, audit is 10s**: do not change these without understanding load implications.

14. **Service creation SKU auto-fill**: `draft` is populated from `o.skus` when `o.service` is null. If `o.service` exists, `draft` populates from `o.service` for editing.

15. **Service edit section**: shown whenever `o.service !== null`. SKU rows pre-rendered in HTML at render time (not only via `renderSkuRows` in wireDrawer) to ensure values show on all screen sizes.

16. **Rectification flow**: "↩ Raise Rectification" on completed orders. Creates new pending order with `service.rectification_of = original_pi`. RECT badge on original orders. Once raised, shows "↩ Rectified" chip.

17. **Multi-installer status rollup**: when an installer updates their status, only their assignment's `status` field is updated. `sj.status` is recomputed from all `sj.assignments[i].status` values (completed only when ALL are completed).

18. **SM Add Staff**: both SM dashboards can create `site_auditor` and `installer` profiles via `sbPost('profiles', {name, email, role, installer_type, passcode: null})`. Passcode is always null on creation.

19. **vercel.json**: sets `Cache-Control: no-cache` for all `*.html` files to prevent mobile browsers serving stale JS.

20. **localStorage persistence**: All pages use `localStorage` (not `sessionStorage`) for `md_user`. Login writes to localStorage; logout clears it. No auto-expiry — each user has their own device.

## Deployment Workflow
```bash
git add <specific files>
git commit -m "description"
git push origin master
vercel --prod
```
Always add specific files, not `git add .` — avoid accidentally staging unintended changes.
