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
| `Admin.html` | Admin console — overview, users, role viewer, job overview (with job cards), performance, analytics |
| `SM_Audit_Dashboard.html` | Service Manager — site audit order lifecycle |
| `SM_Install_Dashboard.html` | Service Manager — installation order lifecycle |
| `Site_Auditor_App.html` | Field auditor mobile app (max-width 520px) |
| `Site_Installer_App.html` | Field installer mobile app (max-width 480px) |
| `vercel.json` | Cache-Control: no-cache for all HTML files |
| `docs/supabase_slim_views.sql` | SQL to create `install_orders_slim` view (strips photos from subjobs for bandwidth) |

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
- No RLS — anon key has full read+write access

### Table: `profiles`
- Columns: `id` (uuid), `name`, `email`, `role`, `passcode`, `installer_type`, `created_at`
- Roles: `admin`, `service_mgr`, `site_auditor`, `installer`, `auditor_installer`
- `installer_type`: `'flooring'` or `'wallpaper'` (required for installer + auditor_installer)
- `passcode`: 4-digit string, null until first login
- **DB constraint**: `profiles_role_check` — update via SQL Editor when adding roles

### Table: `audit_orders`
- Columns: `id`, `created_at`, `pi`, `po` (text, comma-joined), `skus` (jsonb), `audit_ticked` (jsonb), `bm`, `customer_name`, `phone`, `addr`, `status`, `service` (jsonb), `slot`, `date`, `auditor_id`, `auditor_name`, `auditor_email`, `log` (jsonb array), `created_by_email`
- Status flow: `pending → created → scheduled → assigned → onway → atsite → completed / reschedule`
- Special statuses: `deleted` (soft delete), `call_na`
- `audit_ticked` shape (new format): `{auditor, date, sign: {img, name, ratings: {q1, q2, q3, comments}}, rooms: [{name, type, sku, calc, notes, photos: [], sketchStrokes: []}]}`
- `audit_ticked` old format (legacy): array of strings like `["Wooden Flooring"]`
- `service` shape: `{flooring: [{sku, name, link}], wallpaper: [{sku, name, link}], audit_by: 'material_depot'|'customer', follow_up_date?: "YYYY-MM-DD"}`
- `service` extended for rectification: adds `rectification_raised: true`, `rectification_pi`, `rectification_type`
- **SM displays `assigned` as "Site Auditor Assigned"; auditor app maps DB `assigned` → local `scheduled`**
- **⚠️ POLL NOTE**: SM_Audit_Dashboard polls `audit_orders` with explicit column select (NO `audit_ticked`) to avoid downloading photos. `audit_ticked` is fetched on-demand for PDF and job card screen.

### Table: `install_orders`
- Columns: `id`, `created_at`, `pi`, `po`, `skus` (jsonb), `bm`, `customer_name`, `phone`, `addr`, `matched_audit` (bool), `delivery_date`, `custom_wp` (bool), `status`, `subjobs` (jsonb array), `service` (jsonb), `log` (jsonb), `created_by_email`
- Status flow: `pending → deliv_ontime / deliv_delayed → created → scheduled → assigned → onway → atsite → completed / partial / reschedule`
- Special status: `deleted` (soft delete)
- `subjobs` shape (current multi-installer format):
  ```json
  [{
    "id": "sj_fl",
    "type": "flooring",
    "assignments": [{
      "installer_id": "uuid", "installer_email": "email", "installer_name": "Name",
      "mode": "standard|custom", "date": "YYYY-MM-DD", "slots": ["sf1","sf2"],
      "dates": ["YYYY-MM-DD"], "status": "assigned|onway|atsite|completed|reschedule", "primary": true
    }],
    "status": "created|assigned|onway|atsite|completed|reschedule|partial",
    "items": [{"sku": "WF-OAK-12MM", "name": "...", "link": "...", "qty": "12 boxes", "rolls": "5"}],
    "jobcard": {"rooms": [...], "sign": {"img": "...", "name": "...", "ratings": {"q1": 8, "q2": 9, "q3": 7, "comments": "..."}}}
  }]
  ```
- Legacy subjobs: use `sj.installer`, `sj.installer_email`, `sj.date`, `sj.slot` directly
- `primary` flag: first installer defaults to primary. `sj.status` only follows primary's status.
- `service.audit_by`: `'material_depot'` = MD did pre-audit; `'customer'` = customer-provided measurement
- **⚠️ POLL NOTE**: SM_Install_Dashboard polls with `status=neq.deleted`. Site_Installer_App polls with `status=not.in.(pending,deliv_ontime,deliv_delayed,deleted)` to reduce rows. Both still fetch full `subjobs` including photos (see `docs/supabase_slim_views.sql` for photo-stripping view).

### Table: `ratings`
- Columns: `id` (uuid), `created_at`, `order_type` ('audit'|'install'), `pi`, `order_id` (uuid), `staff_email`, `staff_name`, `q1_score` (1-10), `q2_score` (1-10), `q3_score` (1-10, added 2026-06-19), `comments`, `customer_name`, `customer_phone`
- Written after every completed job (after client signs)
- `q1` = overall experience, `q2` = staff person rating, `q3` = site cleanliness after work
- Ratings also stored in `audit_ticked.sign.ratings` / `subjobs[i].jobcard.sign.ratings`
- **DB column to add**: `ALTER TABLE ratings ADD COLUMN IF NOT EXISTS q3_score int CHECK (q3_score BETWEEN 1 AND 10);`
- Create SQL: `CREATE TABLE ratings (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, created_at timestamptz DEFAULT now(), order_type text CHECK (order_type IN ('audit','install')), pi text NOT NULL, order_id uuid, staff_email text, staff_name text, q1_score int CHECK (q1_score BETWEEN 1 AND 10), q2_score int CHECK (q2_score BETWEEN 1 AND 10), q3_score int CHECK (q3_score BETWEEN 1 AND 10), comments text DEFAULT '', customer_name text, customer_phone text);`

## Auth / Session
- `localStorage` key: `md_user` → `{name, email, role}` — persistent, no expiry
- Role → file routing: `admin→Admin.html`, `service_mgr→SM_Audit_Dashboard.html`, `site_auditor→Site_Auditor_App.html`, `installer→Site_Installer_App.html`, `auditor_installer→Site_Auditor_App.html`
- SM dashboards accept both `service_mgr` and `admin` — guard: `!['service_mgr','admin'].includes(SESSION.role)`
- `auditor_installer` role: accepted by both field apps; "⇄" switch button navigates between them
- **Any valid email accepted** (as of 2026-06-23): Login.html and Admin "Add New User" form no longer restrict to `@materialdepot.com`. Access is still gated by whether the email exists in `profiles`.

## Polling Intervals & Bandwidth Strategy
All polls skip when `document.hidden` (page visibility API). Resume + immediate fetch on tab visible.

| File | Interval | Query strategy |
|---|---|---|
| `SM_Audit_Dashboard` | 30s | Explicit cols, NO `audit_ticked`, `status=neq.deleted` |
| `SM_Install_Dashboard` | 60s | `select=*`, `status=neq.deleted` |
| `Site_Auditor_App` | 30s | Explicit cols, NO `audit_ticked`, `status=neq.deleted` |
| `Site_Installer_App` | 30s | `select=*`, `status=not.in.(pending,deliv_ontime,deliv_delayed,deleted)` |

Deleted orders are loaded **on demand** in both SM dashboards when the "Deleted Orders" tab is clicked (`loadDeletedOrders()`). They are NOT included in the poll.

## Slot System (both SM dashboards)
`SLOTS_FL` and `SLOTS_WP` are now **persisted to localStorage** (no longer lost on reload).

| File | localStorage keys |
|---|---|
| SM_Audit_Dashboard | `md_audit_slots_fl`, `md_audit_slots_wp`, `md_audit_caps` |
| SM_Install_Dashboard | `md_install_slots_fl`, `md_install_slots_wp` |

- `SLOTS_FL`: flooring audit/install windows. IDs prefixed `sf` (`sf1`, `sf2`, `sf3`)
- `SLOTS_WP`: wallpaper audit/install windows. IDs prefixed `sw` (`sw1`, `sw2`, `sw3`)
- `slotLabel(id)` searches `[...SLOTS_FL, ...SLOTS_WP]`
- Install: `autoWpSlots(n)` = `SLOTS_WP.slice(0,n).map(s=>s.id)`
- `slotsForOrder(o)` in SM_Audit falls back to `service.flooring/wallpaper` when `auditTicked` is null

| Rolls | Slots needed | Duration |
|---|---|---|
| 1-3 | 1 slot | 3 hours |
| 4-6 | 2 slots | 6 hours |
| 7+ | 3 slots | 9 hours (full day) |

## Field App SLOTS (Site_Auditor_App.html and Site_Installer_App.html)
Both field apps build their `SLOTS` lookup dynamically at startup (as of 2026-06-22):
```js
const SLOTS=(function(){
  const defFL=[{id:"sf1",label:"9 AM – 12 PM"},{id:"sf2",label:"12 PM – 3 PM"},{id:"sf3",label:"3 PM – 6 PM"}];
  const defWP=[{id:"sw1",label:"9 AM – 12 PM"},{id:"sw2",label:"12 PM – 3 PM"},{id:"sw3",label:"3 PM – 6 PM"}];
  let fl=defFL,wp=defWP;
  try{const sf=localStorage.getItem('md_XXX_slots_fl');const sw=localStorage.getItem('md_XXX_slots_wp');if(sf)fl=JSON.parse(sf);if(sw)wp=JSON.parse(sw);}catch(e){}
  const st=[9,12,15];
  const m={s1:{label:"9 AM – 12 PM",start:9},s2:{label:"12 PM – 3 PM",start:12},s3:{label:"3 PM – 6 PM",start:15}};
  fl.forEach((s,i)=>{m[s.id]={label:s.label,start:st[i]||9};});
  wp.forEach((s,i)=>{m[s.id]={label:s.label,start:st[i]||9};});
  return m;
})();
```
- Auditor app reads `md_audit_slots_fl` / `md_audit_slots_wp`; installer app reads `md_install_slots_fl` / `md_install_slots_wp`
- If the SM device and field worker device share the same browser, live-configured labels are used; otherwise hardcoded defaults apply
- `s1/s2/s3` retained for backward compat; `sf1/sf2/sf3` and `sw1/sw2/sw3` are the current standard IDs
- `start` hour is inferred from array position (index 0→9, 1→12, 2→15); custom slots beyond 3 default to `start:9`
- `autoFlip()` has a null guard: `const slotInfo=SLOTS[o.slot];if(!slotInfo)return;`
- **Installer app only**: `slotsLabel(j)` helper returns `'Full day'` for flooring, joined labels for wallpaper multi-slot jobs (e.g. `'9 AM – 12 PM · 12 PM – 3 PM'`), or `slotLabel(j.slot)` fallback. Used in list card, detail subtitle, detail panel, and job card summary.

## Architecture Patterns

### SM Audit Dashboard (`SM_Audit_Dashboard.html`)
- Nav views: Orders, Today's schedule, To reschedule, Follow-ups, **📅 Schedule**, Slots & timings, Auditors & caps, Deleted Orders, Rectifications
- **Schedule tab** (replaced Availability calendar): 10-day view T−3 to T+6. Day columns show order count + up to 3 mini cards. Click a day → full detail list below. `calSelDay` state var. Wire handlers in `wire()`.
- **Poll query**: `audit_orders?select=id,pi,po,skus,bm,customer_name,phone,addr,status,service,slot,date,auditor_id,auditor_name,auditor_email,log,created_by_email&status=neq.deleted`
- `auditTicked` in mapRow is always `null` (not fetched in poll); `slotsForOrder(o)` falls back to `service`
- `CAPS[auditorId][date]` now saved to localStorage key `md_audit_caps`
- **📋 Pending POs import**: "Pending POs" button in Orders view header opens `kylasOverlay`. Fetches `POS_API?type=site_audit&page_size=100`. Deduplicates by `po_number` against `ORDERS[].po`. "Use this" pre-fills all Add Order fields (PI, PO, name, phone, address, BM) and shows `ao-kylas-note` banner.
- **Orders view state**: `filterStatus`, `filterDate` (YYYY-MM-DD or ""), `searchQ`. `setDateFilter(d)` sets `filterDate` and re-renders. Date picker in toolbar; resets to "" on nav switch. Filter: `if(filterDate && o.date !== filterDate) return false`.

### SM Install Dashboard (`SM_Install_Dashboard.html`)
- Nav views: Orders, **Need Action**, Call Operations today, Today's installs, To reschedule, Follow-ups, **📅 Schedule**, Slots & timings, Installers, Deleted Orders, Rectifications
- **Schedule tab**: Same 10-day format. Uses `sjsForDay(ds)` which scans `sj.assignments[].date` (standard) or `sj.assignments[].dates[]` (custom) or legacy `sj.date`.
- **Poll query**: `install_orders?select=*&status=neq.deleted`
- `loadDeletedOrders()` called on-demand; `loadOrders` + `loadDeletedOrders` both called after delete/restore actions
- **📋 Pending POs import**: identical structure to SM Audit Dashboard — same overlay (`kylasOverlay`/`kylasBody`), same dedup logic. Uses `type=installation`. Also pre-fills `ao-delivery` (delivery date) and SKU rows (`variant_handle` → code, product_name contains 'wallpaper' → type).
- **Orders view state**: `filterStatus`, `filterDate` (YYYY-MM-DD or ""), `searchQ`. `setDateFilter(d)` sets `filterDate` and re-renders. `installOrderHasDate(o, ds)` checks any subjob's assignments (standard `date`, custom `dates[]`, legacy `sj.date`). Date picker in toolbar; resets to "" on nav switch.

### Site Auditor App (`Site_Auditor_App.html`)
- 3 screens: list view, detail screen, job card screen
- `ME = {name, email}` — polls `audit_orders` filtered by `auditor_email=eq.ME.email`
- **Poll query**: explicit column list without `audit_ticked`; `audit_ticked` fetched on-demand in `openJobCard` and PDF download
- `autoFlip()` flips `scheduled → callpending` 3 hours before slot start; guards against unknown slot IDs

#### Job Card Completion Flow (auditor app, new as of 2026-06-19):
1. Auditor fills room cards (photos, measurements, sketches)
2. Auditor clicks **"Proceed to client →"** → `showPassToClientAudit(o)`
3. **Handover screen**: "Please hand the phone to the client" with step list. Back = return to review.
4. **Terms & Conditions screen** (`showTCsAudit(o)`): T&C text (constant `MD_TC`) + mandatory checkbox. Agree → `signAndComplete(o)`.
5. **Ratings screen** (`signAndComplete(o)`): 3 mandatory questions (Q1 overall, Q2 auditor, Q3 cleanliness) + optional comments. All 3 required before proceeding.
6. **Signature screen** (`showAuditSignature(o, ratings)`): sign canvas + client name. "Generate PDF & complete".

#### Critical: autosave race condition fix (2026-06-23 — two-layer defence)
The seq counter alone is insufficient. The seq check runs before `await sbPatch(draft)`, but once the fetch is in-flight it cannot be cancelled. If the completion write resolves first and THEN the draft fetch resolves, the draft silently overwrites photos, sign, and ratings. Confirmed on ENQ2026062175756 (June 23): completion log entry at 07:14:21Z but DB still had `draft:true, photos:[]`.

**Layer 1 — early cancel**: `showPassToClientAudit(o)` immediately does `clearTimeout(_autosaveTimer);_autosaveTimer=null;_autosaveSeq++;` when the auditor hands the phone to the client. This prevents the 3s timer from ever firing during T&C/ratings/signature in the common case.

**Layer 2 — `_completionWrite` re-issue**: `let _completionWrite=null` declared at module level. In `finishAudit`, BEFORE the completion `sbPatch`, set `_completionWrite = completionPatch`. In autosave, AFTER `await sbPatch(draft)` resolves, check `if(_completionWrite)` — if set, immediately re-issue `sbPatch(jcOrder.id, _completionWrite)`. This repairs any overwrite regardless of network ordering.

**Do not remove either layer.** `clearTimeout` alone is broken. Seq counter alone is broken. Both layers are required.

### Site Installer App (`Site_Installer_App.html`)
- 4 screens: list view, detail screen, audit report, installation card
- **Poll query**: `install_orders?select=*&status=not.in.(pending,deliv_ontime,deliv_delayed,deleted)`
- `isPrimary` field: from `myAssign.primary === true`, or first assignment if no flag set

#### Job Card Completion Flow (installer app, new as of 2026-06-19):
Primary installer flow:
1. Fill room cards → **"Proceed to client →"** → `showPassToClientInst(j)`
2. **Handover screen** → **T&C screen** (`showTCsInst(j)`, constant `MD_TC_INSTALL`) → `signAndFinish(j)`
3. **Ratings screen** (`signAndFinish(j)`): Q1 overall, Q2 installer, Q3 cleanliness — all mandatory
4. **Signature screen** (`showInstallSignature(j, ratings)`) → save + PDF

Additional installer: marks own assignment complete via `markAdditionalComplete(j)` — no ratings/signature.

#### Critical: autosave race condition fix (2026-06-23 — same two-layer defence)
Same fix as auditor app. `showPassToClientInst(j)` does the early cancel. `_completionWrite` is set before `sbPatch` in `reallyDone`, storing `{subjobs, status:parentStatus, log:j.parentLog}`. Autosave re-issues after draft write. `markAdditionalComplete` also does early cancel. Installer autosave is more dangerous (read-modify-write: `sbGet` → mutate → `sbPatch`) — seq checks placed after `sbGet` and before `sbPatch`, plus `_completionWrite` catches the post-write race.

### Admin Console (`Admin.html`)
- Nav views: Overview, Users, Role Viewer, **Job Overview**, Performance, **📉 Analytics**
- **Job Overview** (merged Jobs + Job Cards): clickable table rows open a wide detail modal (`openJobDetail(pi, type)`). Modal fetches full order data on demand (including `audit_ticked`/`subjobs`). Shows rooms, measurements, photos (click to open full size), ratings (Q1+Q2+Q3 for both audit and install), signature. Download Job Card PDF button in modal. `genAuditPDF` and `genInstallPDF` now include Q3 in client feedback table.
- **Date filter**: `jobsDateFilter` (YYYY-MM-DD or "") + `setJobDateFilter(d)`. For audit jobs filters by `j.date`; for install jobs filters by `j.installDates[]` (all unique assignment dates collected at load from `sj.assignments[].date`, `sj.assignments[].dates[]`, legacy `sj.date`). Date picker in toolbar alongside type/status filter pills.
- **Analytics tab** (`renderAnalytics`, `drawAnalytics`): period filter (7/30/90/All days). Fetches lightweight queries — no photos.
  - Audit metrics: SM Slot Booking %, Reschedule Rate, Visit Success %, Job Card %, Signature %, NPS, Q1 rating, Q2 rating, Q3 cleanliness rating
  - Install metrics: External Audit %, SM Follow-Up %, Delivery Delay %, Visit Success %, Job Card %, Signature %, NPS, Q1 rating, Q2 rating, Q3 cleanliness rating
  - **NPS formula**: Promoters = Q1 ≥ 9, Detractors = Q1 ≤ 7, Neutrals = Q1 = 8. Range −100 to +100.
  - Job Card % and Signature % use unique PIs in `ratings` table as proxy (rating written at completion after signing)
  - Analytics data queries: `audit_orders?select=pi,status,date,log,created_at`, `install_orders?select=pi,status,matched_audit,delivery_date,created_at,log,service`, `ratings?select=order_type,pi,q1_score,q2_score,q3_score,created_at`

## Ratings — Q1/Q2/Q3 Questions
| Question | Auditor app | Installer app |
|---|---|---|
| Q1 | Overall Site Audit experience | Overall site installation experience |
| Q2 | Site auditor and their behaviour | Site installer rating |
| Q3 | How clean did the auditor leave the site after the audit? | How clean did the installer leave the site after the installation? |

All 3 are mandatory (1–10 scale). Comments optional. Stored in `sign.ratings` and `ratings` table.

## Job Card Data Shapes

### Audit job card (`audit_ticked`)
```json
{
  "auditor": "Auditor Name",
  "date": "2026-06-19",
  "sign": {
    "img": "<base64 jpeg>",
    "name": "Client Name",
    "ratings": {"q1": 8, "q2": 9, "q3": 7, "comments": "Great service"}
  },
  "rooms": [{
    "name": "Master Bedroom", "type": "flooring", "sku": "WF-OAK-12MM",
    "calc": {"area": "180", "boxes": "12", "skirt": "40", ...},
    "notes": "Parquet pattern", "photos": ["<base64>", ...], "sketchStrokes": [[{x,y}, ...], ...]
  }]
}
```
Flooring calc: `area, boxes, skirt, skirtH, lprof, rprof, tprof, corner`
Wallpaper calc: `warea, rolls, repeat, match, adh, primer`

### Install job card (`subjobs[i].jobcard`)
```json
{
  "rooms": [{"name": "Living Room", "sku": "WF-OAK-12MM", "qty": "12 boxes", "height": "10 ft", "width": "12 ft", "photos": ["<base64>"], "comments": "..."}],
  "sign": {"img": "<base64>", "name": "Client Name", "ratings": {"q1": 9, "q2": 8, "q3": 7, "comments": ""}}
}
```

## JS Field ↔ DB Column Mappings

| JS (audit orders) | DB column |
|---|---|
| `o.name` | `customer_name` |
| `o.po` (array) | `po` (text, comma-joined) |
| `o.auditTicked` | `audit_ticked` (always null in poll, fetched on-demand) |
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

| JS (subjob / assignment) | field |
|---|---|
| `sj.assignments` | `assignments[]` |
| `sj.jobcard` | `jobcard` |
| `a.primary` | `primary` (bool — drives sj.status) |
| `a.installer_name` | `installer_name` |
| `j.isPrimary` | computed at loadJobs from `myAssign.primary` |

## CSS Design System
```css
--navy:#1F3A5F   --navy2:#16294a  --blue:#2E6CA8   --yellow:#F4C20D
--ink:#1b2230    --muted:#67748a  --line:#dde3ec   --bg:#eef1f6   --card:#fff
--green:#1f7a3f  --red:#b3261e    --amber:#9a6200  --purple:#5b3aa6
--teal:#0f6e74   (install dashboard + auditor_installer role colour)
```

Auditor app buttons: `.btn.green`, `.btn.navy`, `.btn.blue`, `.btn.ghost`, `.btn.warn`
Installer app buttons: `.bigbtn.green`, `.bigbtn.navy`, `.bigbtn.blue`, `.bigbtn.amber`, `.bigbtn.red`, `.bigbtn.ghost`
Admin analytics: `.an-section`, `.an-grid`, `.an-card`, `.an-val`, `.an-bar`, `.an-stars`, `.an-nps-row`
SM schedule calendar: `.calschedwrap`, `.caldays`, `.daycol`, `.daycol.sel`, `.daycol.today`, `.daycol.past`, `.calmini`, `.caldetail`, `.caldet-card`

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

1. **Job key format in installer app**: composite key is `pi + '|' + sjId` — parsed with `key.indexOf('|')`, NOT `split('_')`

2. **Autosave draft excludes photos**: `collectRooms().map(({photos, ...rest}) => rest)` — photos stripped from draft saves; full photos only saved on final completion. The completion race fix uses TWO layers: (a) `showPassToClient*` cancels the timer early (`clearTimeout+seq++`) before the client flow; (b) `_completionWrite` module var stores the completion patch before `sbPatch` — autosave checks it after its own draft write and re-issues completion if set. Both `_autosaveSeq` AND `_completionWrite` are required. Do NOT remove either.

3. **audit_ticked never in poll**: SM_Audit_Dashboard and Site_Auditor_App use explicit `select=` without `audit_ticked`. It is fetched on-demand for job card screen and PDF. `o.auditTicked` is always `null` in the SM poll mapRow.

4. **Deleted orders on-demand**: SM dashboards no longer fetch deleted orders in the main poll. `loadDeletedOrders()` is called only when the "Deleted" tab is opened OR after a delete/restore action.

5. **Slot persistence**: SLOTS_FL, SLOTS_WP, CAPS are now saved to localStorage on every change (add/delete/save). Read on page init. Keys: `md_audit_slots_fl`, `md_audit_slots_wp`, `md_audit_caps`, `md_install_slots_fl`, `md_install_slots_wp`.

6. **Auditor app slot IDs**: The auditor app `SLOTS` constant must include `sf1/sf2/sf3/sw1/sw2/sw3` (new format) plus legacy `s1/s2/s3`. `autoFlip()` null-guards `SLOTS[o.slot]` before accessing `.start`.

7. **Client flow is 3 mandatory steps**: T&C (checkbox required) → 3 ratings Q1+Q2+Q3 all required → signature. The field worker never sees these screens — they hand the phone to the client at the "Proceed to client" screen.

8. **T&C text as constants**: `MD_TC` in auditor app, `MD_TC_INSTALL` in installer app. Update these constants when MD provides final T&C text.

9. **NPS formula**: Promoters = Q1 ≥ 9, Detractors = Q1 ≤ 7 (not ≤6). Range: −100 to +100. Implemented in Admin.html `drawAnalytics`.

10. **Q3 DB column**: `ALTER TABLE ratings ADD COLUMN IF NOT EXISTS q3_score int CHECK (q3_score BETWEEN 1 AND 10);` — must be run in Supabase SQL Editor. Ratings write is non-blocking (`try/catch`) so the app won't break if the column is missing, but Q3 won't persist to the table.

11. **PDF client feedback table**: All PDF generators include 3 rows (Q1, Q2, Q3 scores + comments) when ratings are present. This covers: field apps (`genPDF` in both), Admin (`genAuditPDF`, `genInstallPDF`), and SM dashboards (`genAuditPDFSM`, `genInstallPDFSM`). The SM dashboard versions were missing this section and were fixed 2026-06-19.

12. **Admin job detail modal**: `openJobDetail(pi, type)` fetches full order on demand. Modal uses `.modal.wide` class (`max-width:720px`). Cleanup: `document.getElementById('modal').className='modal'` on close to reset width.

13. **Analytics proxy metrics**: Job Card Filling % and Signature % are calculated as unique PIs with ratings / completed orders — ratings are only written after the client signs, so a rating entry confirms both.

14. **Schedule calendar state**: `calSelDay` is a module-level `let` in both SM dashboards. It defaults to `dstr(today)` and persists during the session. Clicking a `.daycol` updates `calSelDay` and calls `render()`. Clicking `.calmini` mini-card stops propagation and opens the order drawer directly.

15. **Smart quotes in JS**: Never use typographic quotes (`"`, `"`, `'`, `'`) — only ASCII. The Edit tool can introduce smart quotes from markdown rendering.

16. **Backward compat for photos**: `r.photos || (r.photo ? [r.photo] : [])` handles both old single-photo and new photos-array formats in all PDF generators.

17. **Job composite key in installer app**: `pi + '|' + sjId` — use `indexOf('|')` to parse. Never use `split('_')` because underscores appear in PI numbers.

18. **Primary installer drives sj.status**: in `adv()`, `sj.status` is only updated when `amPrimary === true`. Non-primary: update own `assignment.status` only. In `showInstallSignature` (primary completion), `sj.status = 'completed'` unconditionally.

19. **opsCallDue covers deliv_delayed**: `opsCallDue(o)` checks `['pending','deliv_delayed'].includes(o.status)`.

22. **Repeated delivery date updates**: A `deliv_delayed` order can be delayed again any number of times. The drawer shows a date picker pre-filled with the current delivery date and a "Further delayed" button. The `#markDelayed` handler checks `wasDelayed = o.status === "deliv_delayed"` before updating status, and logs "Delivery further delayed. New date: …" vs "Delivery delayed — BM asked to inform client. New date: …" accordingly. `delivery_date` in the DB is overwritten each time.

20. **SM_Audit slotsForOrder fallback**: When `o.auditTicked` is null (not fetched in poll), `slotsForOrder(o)` falls back to `o.service.flooring/wallpaper` to determine FL vs WP slots correctly. Do NOT revert this fallback.

21. **SM Install PDF installer name**: `genInstallPDFSM` resolves the installer name via `sj.assignments` (new multi-installer format) first, falling back to legacy `sj.installer` UUID lookup and `sj.installer_email`. Never use `sj.installer` alone — it is not set in the current format.

23. **Field app slot labels are dynamic, not hardcoded**: Both field apps build `SLOTS` at startup by reading from the SM dashboard's localStorage keys. Do NOT revert to a static `const SLOTS = {...}` object — any custom slot IDs (timestamp-based, e.g. `sf1687234567890`) added by the SM would then show as "—". The installer app uses `slotsLabel(j)` (not `slotLabel(j.slot)`) everywhere time is displayed, so multi-slot wallpaper jobs show all windows. If you add new time-display locations in either field app, use `slotsLabel(j)` in the installer app and `slotLabel(o.slot)` in the auditor app.

25. **Activity log timestamps are ISO strings** (as of 2026-06-23): All log entries store `d: new Date().toISOString()`. The SM dashboards and Admin have a `fmtLog(d)` function that formats dynamically: "Just now", "Xm ago", "Xh ago · HH:MM", "Yesterday · HH:MM", "D Mon · HH:MM". Legacy entries with "Just now" or "Today HH:MM" strings pass through `fmtLog` unchanged (not parseable as ISO → returned as-is).

26. **Email restriction removed** (as of 2026-06-23): Login.html accepts any valid email format (previously required `@materialdepot.com`). Admin "Add New User" form validates only that the email is a valid format. Access is still gated by `profiles` table membership.

27. **Date filter in orders views**: SM Audit uses `filterDate` (string YYYY-MM-DD or "") matched against `o.date`. SM Install uses `filterDate` matched via `installOrderHasDate(o, ds)` which checks all subjob assignment dates. Admin Job Overview uses `jobsDateFilter` with `j.installDates[]` for install jobs. All date filters combine with status filters and search. Reset to "" on nav view switch.

24. **Swipe-back navigation blocked on all authenticated pages**: All four pages (SM_Audit_Dashboard, SM_Install_Dashboard, Site_Auditor_App, Site_Installer_App) run these two lines immediately after the session guard:
    ```js
    history.replaceState(null,'',location.href);
    window.addEventListener('popstate',()=>history.pushState(null,'',location.href));
    ```
    `replaceState` removes Login.html from the browser history stack. The `popstate` listener catches any back navigation attempt (two-finger swipe, browser back button) and immediately re-pushes the current page, keeping the user on the dashboard. Sign-out still works because it uses `window.location.href='Login.html'` directly. Do not remove these lines — without them, swiping back on a Mac touchpad navigates to the login page.

## Pending POs Import (replaces Kylas Sheet as of 2026-06-22)

**Constant**: `POS_API='https://api-dev2.materialdepot.in/apiV1/site-audit-installation-pos/'` in both SM dashboards  
**SM Audit** fetches `?type=site_audit&page_size=100`; **SM Install** fetches `?type=installation&page_size=100`  
**Search**: `?search=<term>` — server-side filter by PO number, customer contact, or lead ID. Debounced 400ms via `debouncePOSearch()`.

### API → Form field mapping
| API field | Form field | Notes |
|---|---|---|
| `estimate_lead_id` | `ao-pi` | ENQ... format — fully auto-filled now |
| `po_number` | `ao-po` | |
| `customer.name` | `ao-name` | |
| `customer.contact` | `ao-phone` | integer → String |
| `bm.name` | `ao-bm` | |
| `shipping_address.address` | `ao-addr` | fully auto-filled now |
| `delivery_date` | `ao-delivery` | install only |
| `skus[].variant_handle` | `ao-sku-code` rows | install only; type from product_name contains 'wallpaper' |

**Deduplication**: `existingPOs = new Set(ORDERS.flatMap(o => o.po || []))` — checks `r.po_number`. Imported rows shown collapsed under "already imported" `<details>`.  
**Card display**: customer name+phone, PI+PO+BM+date+po_status chip, address snippet + 📍 map link, SKU product names (first 2).  
**po_status colours**: `dispatch_pending`/`pickup_attempted` → amber; `delivered` → green; `cancelled` → red.

## Deployment Workflow
```bash
git add <specific files>
git commit -m "description"
git push origin master
vercel --prod
```
Always add specific files, not `git add .`.
