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

## Auditor App SLOTS (Site_Auditor_App.html)
The auditor app has its own `SLOTS` constant (used for `autoFlip` timing):
```js
const SLOTS = {
  s1:{label:"9 AM – 12 PM",start:9}, s2:{label:"12 PM – 3 PM",start:12}, s3:{label:"3 PM – 6 PM",start:15},
  sf1:{label:"9 AM – 12 PM",start:9}, sf2:{label:"12 PM – 3 PM",start:12}, sf3:{label:"3 PM – 6 PM",start:15},
  sw1:{label:"9 AM – 12 PM",start:9}, sw2:{label:"12 PM – 3 PM",start:12}, sw3:{label:"3 PM – 6 PM",start:15}
};
```
- Old `s1/s2/s3` retained for backward compat
- New `sf1/sf2/sf3` and `sw1/sw2/sw3` added when SM slot system was updated
- `autoFlip()` has a null guard: `const slotInfo=SLOTS[o.slot];if(!slotInfo)return;`

## Architecture Patterns

### SM Audit Dashboard (`SM_Audit_Dashboard.html`)
- Nav views: Orders, Today's schedule, To reschedule, Follow-ups, **📅 Schedule**, Slots & timings, Auditors & caps, Deleted Orders, Rectifications
- **Schedule tab** (replaced Availability calendar): 10-day view T−3 to T+6. Day columns show order count + up to 3 mini cards. Click a day → full detail list below. `calSelDay` state var. Wire handlers in `wire()`.
- **Poll query**: `audit_orders?select=id,pi,po,skus,bm,customer_name,phone,addr,status,service,slot,date,auditor_id,auditor_name,auditor_email,log,created_by_email&status=neq.deleted`
- `auditTicked` in mapRow is always `null` (not fetched in poll); `slotsForOrder(o)` falls back to `service`
- `CAPS[auditorId][date]` now saved to localStorage key `md_audit_caps`

### SM Install Dashboard (`SM_Install_Dashboard.html`)
- Nav views: Orders, **Need Action**, Call Operations today, Today's installs, To reschedule, Follow-ups, **📅 Schedule**, Slots & timings, Installers, Deleted Orders, Rectifications
- **Schedule tab**: Same 10-day format. Uses `sjsForDay(ds)` which scans `sj.assignments[].date` (standard) or `sj.assignments[].dates[]` (custom) or legacy `sj.date`.
- **Poll query**: `install_orders?select=*&status=neq.deleted`
- `loadDeletedOrders()` called on-demand; `loadOrders` + `loadDeletedOrders` both called after delete/restore actions

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

#### Critical: autosave race condition fix
`clearTimeout(_autosaveTimer); _autosaveTimer=null;` at the top of `finishAudit` onclick.
The autosave debounce (3s) was overwriting completed `audit_ticked` with draft data (no sign/photos). This is now fixed for all future completions.

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

#### Critical: autosave race condition fix
`clearTimeout(_autosaveTimer); _autosaveTimer=null;` at top of `reallyDone` onclick AND `markAdditionalComplete`.

### Admin Console (`Admin.html`)
- Nav views: Overview, Users, Role Viewer, **Job Overview**, Performance, **📉 Analytics**
- **Job Overview** (merged Jobs + Job Cards): clickable table rows open a wide detail modal (`openJobDetail(pi, type)`). Modal fetches full order data on demand (including `audit_ticked`/`subjobs`). Shows rooms, measurements, photos (click to open full size), ratings, signature. Download Job Card PDF button in modal. `genAuditPDF` and `genInstallPDF` now include Q3 in client feedback table.
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

2. **Autosave draft excludes photos**: `collectRooms().map(({photos, ...rest}) => rest)` — photos stripped from draft saves; full photos only saved on final completion. `clearTimeout(_autosaveTimer)` MUST be called at start of every completion handler.

3. **audit_ticked never in poll**: SM_Audit_Dashboard and Site_Auditor_App use explicit `select=` without `audit_ticked`. It is fetched on-demand for job card screen and PDF. `o.auditTicked` is always `null` in the SM poll mapRow.

4. **Deleted orders on-demand**: SM dashboards no longer fetch deleted orders in the main poll. `loadDeletedOrders()` is called only when the "Deleted" tab is opened OR after a delete/restore action.

5. **Slot persistence**: SLOTS_FL, SLOTS_WP, CAPS are now saved to localStorage on every change (add/delete/save). Read on page init. Keys: `md_audit_slots_fl`, `md_audit_slots_wp`, `md_audit_caps`, `md_install_slots_fl`, `md_install_slots_wp`.

6. **Auditor app slot IDs**: The auditor app `SLOTS` constant must include `sf1/sf2/sf3/sw1/sw2/sw3` (new format) plus legacy `s1/s2/s3`. `autoFlip()` null-guards `SLOTS[o.slot]` before accessing `.start`.

7. **Client flow is 3 mandatory steps**: T&C (checkbox required) → 3 ratings Q1+Q2+Q3 all required → signature. The field worker never sees these screens — they hand the phone to the client at the "Proceed to client" screen.

8. **T&C text as constants**: `MD_TC` in auditor app, `MD_TC_INSTALL` in installer app. Update these constants when MD provides final T&C text.

9. **NPS formula**: Promoters = Q1 ≥ 9, Detractors = Q1 ≤ 7 (not ≤6). Range: −100 to +100. Implemented in Admin.html `drawAnalytics`.

10. **Q3 DB column**: `ALTER TABLE ratings ADD COLUMN IF NOT EXISTS q3_score int CHECK (q3_score BETWEEN 1 AND 10);` — must be run in Supabase SQL Editor. Ratings write is non-blocking (`try/catch`) so the app won't break if the column is missing, but Q3 won't persist to the table.

11. **PDF client feedback table**: All PDF generators (both field apps and Admin genAuditPDF/genInstallPDF) include 3 rows: Q1, Q2, Q3 scores + comments when ratings are present.

12. **Admin job detail modal**: `openJobDetail(pi, type)` fetches full order on demand. Modal uses `.modal.wide` class (`max-width:720px`). Cleanup: `document.getElementById('modal').className='modal'` on close to reset width.

13. **Analytics proxy metrics**: Job Card Filling % and Signature % are calculated as unique PIs with ratings / completed orders — ratings are only written after the client signs, so a rating entry confirms both.

14. **Schedule calendar state**: `calSelDay` is a module-level `let` in both SM dashboards. It defaults to `dstr(today)` and persists during the session. Clicking a `.daycol` updates `calSelDay` and calls `render()`. Clicking `.calmini` mini-card stops propagation and opens the order drawer directly.

15. **Smart quotes in JS**: Never use typographic quotes (`"`, `"`, `'`, `'`) — only ASCII. The Edit tool can introduce smart quotes from markdown rendering.

16. **Backward compat for photos**: `r.photos || (r.photo ? [r.photo] : [])` handles both old single-photo and new photos-array formats in all PDF generators.

17. **Job composite key in installer app**: `pi + '|' + sjId` — use `indexOf('|')` to parse. Never use `split('_')` because underscores appear in PI numbers.

18. **Primary installer drives sj.status**: in `adv()`, `sj.status` is only updated when `amPrimary === true`. Non-primary: update own `assignment.status` only. In `showInstallSignature` (primary completion), `sj.status = 'completed'` unconditionally.

19. **opsCallDue covers deliv_delayed**: `opsCallDue(o)` checks `['pending','deliv_delayed'].includes(o.status)`.

20. **SM_Audit slotsForOrder fallback**: When `o.auditTicked` is null (not fetched in poll), `slotsForOrder(o)` falls back to `o.service.flooring/wallpaper` to determine FL vs WP slots correctly. Do NOT revert this fallback.

## Deployment Workflow
```bash
git add <specific files>
git commit -m "description"
git push origin master
vercel --prod
```
Always add specific files, not `git add .`.
