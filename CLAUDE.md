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
| `pwa-install.js` | Shared PWA install banner — included in all 6 HTML files |
| `manifest_auditor.json` | PWA manifest for Site_Auditor_App (`start_url: /Site_Auditor_App.html`) |
| `manifest_installer.json` | PWA manifest for Site_Installer_App (`start_url: /Site_Installer_App.html`) |
| `manifest_sm_audit.json` | PWA manifest for SM_Audit_Dashboard (`start_url: /SM_Audit_Dashboard.html`) |
| `manifest_sm_install.json` | PWA manifest for SM_Install_Dashboard (`start_url: /SM_Install_Dashboard.html`) |
| `manifest_admin.json` | PWA manifest for Admin (`start_url: /Admin.html`) |
| `Store_Team_App.html` | Store team slot booking app for experience centre walk-ins (max-width 520px) |
| `manifest_store_team.json` | PWA manifest for Store_Team_App (`start_url: /Store_Team_App.html`) |

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
- Columns: `id` (uuid), `name`, `email`, `role`, `passcode`, `installer_type`, `created_at`, `active_from` (text, nullable)
- Roles: `admin`, `service_mgr`, `site_auditor`, `installer`, `auditor_installer`, `store_staff`
- `installer_type`: `'flooring'` or `'wallpaper'` (required for installer + auditor_installer)
- `passcode`: 4-digit string, null until first login
- `active_from`: ISO date string (`YYYY-MM-DD`) for site_auditor/auditor_installer — null = active always; a date = not available before that date. Set from SM Audit Dashboard → Auditors & Caps → Save. Read by Store_Team_App to count active auditors per date.
- **DB constraint**: `profiles_role_check` — update via SQL Editor when adding roles

**Pending SQL** (must be run in Supabase SQL Editor if not yet done):
```sql
-- Allow store_staff role:
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin','service_mgr','site_auditor','installer','auditor_installer','store_staff'));

-- Add active_from column for auditor availability management:
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_from text;
```

### Table: `audit_orders`
- Columns: `id`, `created_at`, `pi`, `po` (text, comma-joined), `skus` (jsonb), `audit_ticked` (jsonb), `bm`, `customer_name`, `phone`, `addr`, `status`, `service` (jsonb), `slot`, `date`, `auditor_id`, `auditor_name`, `auditor_email`, `log` (jsonb array), `created_by_email`
- Status flow: `pending → created → scheduled → assigned → onway → atsite → completed / reschedule`
- Special statuses: `deleted` (soft delete), `call_na`, `slot_reserved` (pre-booking via Store Team app — no PI required at time of booking)
- `audit_ticked` shape (new format): `{auditor, date, sign: {img, name, ratings: {q1, q2, q3, comments}}, rooms: [{name, type, sku, calc, notes, photos: [], sketchStrokes: []}]}`
- `audit_ticked` old format (legacy): array of strings like `["Wooden Flooring"]`
- `service` shape: `{flooring: [{sku, name, link}], wallpaper: [{sku, name, link}], audit_by: 'material_depot'|'customer', follow_up_date?: "YYYY-MM-DD"}`
- `service` extended for rectification: adds `rectification_raised: true`, `rectification_pi`, `rectification_type`
- **SM displays `assigned` as "Site Auditor Assigned"; auditor app maps DB `assigned` → local `scheduled`**
- **⚠️ POLL NOTE**: SM_Audit_Dashboard polls `audit_orders` with explicit column select (NO `audit_ticked`) to avoid downloading photos. `audit_ticked` is fetched on-demand for PDF and job card screen.

### Table: `install_orders`
- Columns: `id`, `created_at`, `pi`, `po`, `skus` (jsonb), `bm`, `customer_name`, `phone`, `addr`, `matched_audit` (bool), `delivery_date`, `original_delivery_date` (text — set at creation, never overwritten on delays), `custom_wp` (bool), `status`, `subjobs` (jsonb array), `service` (jsonb), `log` (jsonb), `created_by_email`
- Status flow: `pending → deliv_ontime / deliv_delayed → created → scheduled → assigned → onway → atsite → completed / partial / reschedule`
- Special status: `deleted` (soft delete)
- `subjobs` shape (current multi-installer format):
  ```json
  [{
    "id": "sj_fl",
    "type": "flooring",
    "assignments": [{
      "installer_id": "uuid", "installer_email": "email", "installer_name": "Name",
      "mode": "standard|custom", "date": "YYYY-MM-DD", "slots": ["HH:MM"],
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
- **⚠️ POLL NOTE**: SM_Install_Dashboard polls `install_orders_slim` with `status=neq.deleted`. Site_Installer_App polls `install_orders_slim` with `status=not.in.(pending,deliv_ontime,deliv_delayed,deleted)`. The slim view strips `photos` from all `rooms[]` inside each `subjob.jobcard` — this dramatically reduces poll payload. On-demand fetches (PDF download, opening order detail drawer) use the full `install_orders` table directly. SQL for the slim view: `docs/supabase_slim_views.sql`.

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
| `SM_Install_Dashboard` | 60s | `install_orders_slim` view, `status=neq.deleted` (strips photos from poll) |
| `Site_Auditor_App` | 30s | Explicit cols, NO `audit_ticked`, `status=neq.deleted` |
| `Site_Installer_App` | 30s | `install_orders_slim` view, `status=not.in.(pending,deliv_ontime,deliv_delayed,deleted)` |

Deleted orders are loaded **on demand** in both SM dashboards when the "Deleted Orders" tab is clicked (`loadDeletedOrders()`). They are NOT included in the poll.

## Photo Storage (added 2026-07-01)

New photos taken in both field apps are uploaded to Supabase Storage instead of stored as base64 in JSONB columns.

### `job-photos` bucket
- Public bucket: `{SB_URL}/storage/v1/object/public/job-photos/{filename}`
- Upload: `POST /storage/v1/object/job-photos/{filename}` with `Content-Type: image/jpeg`, `x-upsert: true`
- Policies: anon INSERT + anon SELECT (no auth required)

### `_uploadPhoto(dataURL)` helper (both field apps)
```js
async function _uploadPhoto(dataURL){
  const blob=await(await fetch(dataURL)).blob();
  const fname=Date.now()+'_'+Math.random().toString(36).slice(2,8)+'.jpg';
  const r=await fetch(SB_URL+'/storage/v1/object/job-photos/'+fname,{
    method:'POST',
    headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'image/jpeg','x-upsert':'true'},
    body:blob
  });
  if(!r.ok)throw new Error('upload failed');
  return SB_URL+'/storage/v1/object/public/job-photos/'+fname;
}
```
`_resizeAndStore` calls `_uploadPhoto(out).then(push).catch(()=>push(out))` — falls back to base64 if upload fails.
Arrival photo (`arrivalOverlay`) also uploads via `_uploadPhoto` before calling the confirm callback.

### Backward compatibility
Existing photos remain as base64 data URLs in DB — `<img src="...">` handles both data URLs and https:// URLs transparently. No migration of old photos needed.

### Supabase SQL required (one-time)
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('job-photos', 'job-photos', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "anon upload" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'job-photos');
CREATE POLICY "anon read"   ON storage.objects FOR SELECT TO anon USING (bucket_id = 'job-photos');
```

### Why slim view matters
Base64 photos in JSONB were downloaded on every 30–60s poll → 5GB/month free tier egress was exhausted within weeks. The `install_orders_slim` view strips `photos` from rooms in the poll response. Supabase Pro plan is now required (project upgraded 2026-07-01).

## Doc Scanner (added 2026-07-01)

CamScanner-style perspective-correcting document scanner, present in both `Site_Auditor_App.html` and `Site_Installer_App.html`. Activated by "📄 Scan" button in `addRoom()`.

### UX flow
1. Opens full-screen overlay with rear camera video feed
2. User taps "Capture" → freeze frame
3. 4 draggable corner handles appear over the captured image (auto-placed at 15% inset)
4. User drags handles to document corners
5. "⚡ B&W" toggle: grayscale + contrast enhance (optional)
6. "Apply" → homographic warp → output 800×(proportional) JPEG → saved to room photos

### Implementation
**Overlay HTML**: full-screen `#docScanOverlay` (z-index 300). Contains:
- `#dsCamState`: video `#dsVideo` + "Capture" button `#dsCaptureBtn`
- `#dsReviewState`: `#dsImgContainer` with `<img id="dsImg">` + SVG `#dsPolygon` + 4 `.ds-handle` divs (`#dsH0`–`#dsH3`) + footer with Retake/B&W/Apply buttons
- Hidden `#dsSrcCanvas` for capture

**Perspective math**: 8-parameter homography H solved via Gaussian elimination with partial pivoting. Applied as inverse mapping (output pixel → source pixel) with bilinear interpolation. `_dsComputeHomography(fromPts, toPts)` builds the 8×8 linear system.

**Handle drag**: pointer events on each `.ds-handle`. Each handle updates its corner in `_dsCorners[]`. SVG polygon redraws on each move.

**B&W enhance**: after warp, draws output canvas with `filter:'contrast(1.5) grayscale(1)'` and re-reads pixels via ImageData for pure B&W.

### CRITICAL: Lazy init pattern — NEVER use IIFE
```js
let _dsReady=false;
function _dsInit(){
  if(_dsReady)return; _dsReady=true;
  document.getElementById('dsCancelBtn').onclick=()=>_dsClose();
  // ... attach all overlay handlers ...
}
function openDocScanner(cb){
  _dsInit(); // safe: DOM is fully parsed by the time user taps Scan
  _dsCb=cb; ...
}
```
The overlay HTML appears **after** `</script>` in the document. If `_dsInit()` runs as an IIFE at script parse time, `getElementById('dsCancelBtn')` returns `null` → `.onclick` throws TypeError → the rest of the script (including `renderList()`) never runs → **entire app is dead on load**. Always use the lazy init pattern with the `_dsReady` guard. Do NOT convert to IIFE.

### Camera facing modes (both field apps)
| Context | Mode |
|---|---|
| Arrival confirmation photo | `facingMode:'user'` (front camera) |
| Job card room photos (`fileCam` input) | `capture='environment'` (rear camera) |
| Doc scanner | `facingMode:'environment'` (rear camera) |

## Slot System → Exact Time (updated 2026-07-01)
`o.slot` now stores `"HH:MM"` (24h) for new bookings. Legacy `sf1`/`sw1` IDs on existing orders still display correctly.

`SLOTS_FL` and `SLOTS_WP` arrays are still persisted to localStorage (used for backward-compat display and the "Slots & timings" config view).

| File | localStorage keys |
|---|---|
| SM_Audit_Dashboard | `md_audit_slots_fl`, `md_audit_slots_wp`, `md_audit_caps` |
| SM_Install_Dashboard | `md_install_slots_fl`, `md_install_slots_wp` |

### slotLabel(id) — all 4 files (function, not arrow)
- Legacy ID (`sf1`, `sw1`…): looks up `SLOTS_FL`/`SLOTS_WP` label
- `"HH:MM"` string: renders as `"10:30 AM"` (12h format)
- null/undefined: returns `"—"`

### SM Audit — booking
- `<input type="time" id="bookTime">` replaces old slot grid. `updateBookBtn()` syncs `draft.date`+`draft.slot` and enables "Book slot" button.
- **2-hour auditor buffer**: `auditorConflictOrder(aid, date, slotTime)` blocks assignment if the same auditor has a HH:MM booking within 120 min on that date. Buffer is **per-auditor** — other auditors are unaffected. Shows "has X:XX AM booking" in the auditor card.
- Legacy slot IDs bypass the conflict check (only HH:MM slots are compared).

### SM Install — booking (2-step flow as of 2026-07-01)
`renderAssignSection(o, sj, container)` uses a **2-step UX in standard mode**:
- **Step 1 — Book a slot**: date + start time → "Book slot" saves `sj.date`, `sj.slot`, `sj.status='scheduled'` to DB immediately. No installer required. `container._editingSlot` tracks edit state across re-renders. Auto-opens in edit mode when `sj.status==='reschedule'` or no date set.
- **Step 2 — Assign installer**: OPTIONAL — SM can close the drawer after Step 1 and return later to assign. Picker(s) show with no date fields (slot already locked from Step 1). "Save assignment" stamps `sj.date`/`sj.slot` onto each assignment and sets `sj.status='assigned'`.
- **Edit slot**: "Edit" button in Step 1 summary sets `container._editingSlot=true` and re-draws Step 1 form. Rescheduling auto-opens Step 1 in edit mode.
- **Status flow**: slot booked → `sj.status='scheduled'`; installer assigned → `sj.status='assigned'`. Parent order synced via `syncParent(o)`.
- **Custom / Multi-day mode**: keeps the old combined form (date per installer — 2-step doesn't apply here).
- `[data-time]` oninput still used in custom mode. Standard mode time captured at "Book slot" click from `#stepTime_{sjId}`.

### Field apps — autoFlip (both)
Parses HH:MM: `startH = h + m/60`. Legacy slot IDs still use `SLOTS[id].start`. "callpending" flip still 3h before start.

### Installer App — slotsLabel
No longer hardcodes `'Full day'` for flooring — reads `slots[]` so start time set by SM displays correctly.

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
- `autoFlip()` now handles both legacy slot IDs and `"HH:MM"` format (see note 6)
- **Installer app only**: `slotsLabel(j)` reads `j.slots[0]` via `slotLabel()` — returns e.g. `"10:30 AM"` for new bookings, joined labels for legacy multi-slot wallpaper (e.g. `'9 AM – 12 PM · 12 PM – 3 PM'`), or `slotLabel(j.slot)` fallback. **No longer hardcodes `'Full day'` for flooring.** Used in list card, detail subtitle, detail panel, and job card summary.

## Architecture Patterns

### SM Audit Dashboard (`SM_Audit_Dashboard.html`)
- Nav views: Orders, Today's schedule, To reschedule, Follow-ups, **📅 Schedule**, Slots & timings, Auditors & caps, Deleted Orders, Rectifications
- **Schedule tab** (replaced Availability calendar): 10-day view T−3 to T+6. Day columns show order count + up to 3 mini cards. Click a day → full detail list below. `calSelDay` state var. Wire handlers in `wire()`.
- **Poll query**: `audit_orders?select=id,pi,po,skus,bm,customer_name,phone,addr,status,service,slot,date,auditor_id,auditor_name,auditor_email,log,created_by_email&status=neq.deleted`
- `auditTicked` in mapRow is always `null` (not fetched in poll); `slotsForOrder(o)` falls back to `service`
- `CAPS[auditorId][date]` now saved to localStorage key `md_audit_caps`
- **📋 Pending POs import**: "Pending POs" button in Orders view header opens `kylasOverlay`. Fetches `POS_API?type=site_audit&page_size=100`. Deduplicates by `po_number` against `ORDERS[].po`. "Use this" pre-fills all Add Order fields (PI, PO, name, phone, address, BM) and shows `ao-kylas-note` banner.
- **Orders view state**: `filterStatus`, `filterDate` (YYYY-MM-DD or ""), `searchQ`. `setDateFilter(d)` sets `filterDate` and re-renders. Date picker in toolbar; resets to "" on nav switch. Filter: `if(filterDate && o.date !== filterDate) return false`.

#### slot_reserved orders in SM Audit (added 2026-07-06)
- CSS: `.c-slotres{background:#e8f0fb;color:#1a4a8a;}` — "Pre-booked (Store)" chip
- `STATUS` dict entry: `slot_reserved:{l:"Pre-booked (Store)",c:"c-slotres"}`
- `slotReservedDrawerBody(o)` renders a simplified drawer (no stepper, no auditor assignment) for pre-bookings from Store_Team_App
- Early return in drawer body: `if(o.status==='slot_reserved')return slotReservedDrawerBody(o);`
- Drawer footer: only Delete + Close buttons for slot_reserved (no scheduling controls)
- **"All" filter excludes `slot_reserved`**: these appear only in the "Pre-booked (Store)" filter tab
- Today's pre-booking banner shows count of today's `slot_reserved` orders across all stores

#### Auditor active_from management (added 2026-07-06)
- `loadAuditors()` fetches `active_from` from profiles: `profiles?role=in.(site_auditor,auditor_installer)&select=id,name,email,active_from`
- `capFor(aid, ds)` returns `0` if `ds < auditor.activeFrom` — auditor's daily cap is 0 before their start date
- Auditors & Caps view shows: green "Active" or amber "From [date]" chip per auditor; `data-activefrom` date input per auditor (blank = active now, date = available from that date)
- Cap cells before `active_from` are greyed out/disabled (auditor doesn't work those days)
- "Save" PATCHes `active_from` to Supabase profiles table — cross-device persistence (SM sets once, Store Team reads from DB)

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

### Store Team App (`Store_Team_App.html`)
- Standalone slot-booking app for in-store staff at Material Depot's 3 experience centres: JP Nagar, Whitefield, Yelahanka
- **Open access** — no login required. Any visitor with the URL can use it. Store selection persisted in `localStorage` key `md_store` per device; first visit shows store picker overlay.
- **No `ME` session** — booking log uses `who:MYSTORE` and `created_by_email:'store-team'`. No sign-out button.
- **6 fixed slots**: 10:00, 11:00, 13:00, 14:00, 16:00, 17:00 (each 1 hour)
- **2-hour gap rule**: `slotsConflict(slotA,slotB)` — two slots conflict if gap between their start times is < 120 minutes in either direction
- **Availability**: AUDITOR_COUNT × cap per date, minus conflicting bookings. Active auditors filtered by `active_from ≤ date` (or null). Fetched from `profiles?select=id,active_from&role=in.(site_auditor,auditor_installer)`
- **Date selection**: 14-day strip (today + next 13). `dstr(d)` uses local date parts (`getFullYear/getMonth/getDate`) — **NOT `toISOString()`** which returns UTC and causes off-by-one at midnight IST
- **Pre-booking creates** `audit_orders` row: `{pi:'SRES-{storeCode6}-{timestamp9}', bm:MYSTORE, date, slot:slotId, status:'slot_reserved', skus:[{c:'AUDIT',n:'Site Audit',audit:true}], log:[{who:MYSTORE, ...}], created_by_email:'store-team'}`
- **Confirmed bookings section**: shows ALL non-deleted, non-slot_reserved audit orders for the selected date (all stores, all auditors). This is intentional — shows store staff total auditor workload for the day, which determines slot availability across all stores.
- **Poll**: no background poll — data re-fetched each time the date changes or booking is made
- `STORES` constant: `['JP Nagar','Whitefield','Yelahanka']`

### Admin Console (`Admin.html`)
- Nav views: Overview, Users, Role Viewer, **Job Overview**, Performance, **📉 Analytics**
- **`store_staff` role** present in Admin UI (ROLES dict, ROLE_ICONS 🏪, ROLE_DESCS, overview stats tile, Add/Edit User modals, Role Viewer). CSS: `.rb-store_staff{background:var(--amberbg);color:var(--amber);}`. Routes to `Store_Team_App.html`. **Note**: Store_Team_App is now open-access — no login required — so creating `store_staff` profiles is no longer necessary for the app to work.
- **Job Overview**: `_loadJobsData(m)` + `renderJobs(m)` split — initial load shows spinner; thereafter a `_jobsPollTid` interval polls every 30s while the Jobs view is active (same cadence as SM Dashboard). Clears on nav away. Queries: `audit_orders?status=not.in.(deleted,slot_reserved)`, `install_orders?status=neq.deleted`. Installer email extraction reads `sj.assignments[].installer_email` (new format) with legacy `sj.installer_email` fallback.
- **Job Overview status labels**: `JOB_STATUS` dict includes `created`, `follow_up`, `call_na` in addition to the original set. Previously unknown statuses rendered with wrong chip style.
- **Job Overview** (merged Jobs + Job Cards): clickable table rows open a wide detail modal (`openJobDetail(pi, type)`). Modal fetches full order data on demand (including `audit_ticked`/`subjobs`). Shows rooms, measurements, photos (click to open full size), ratings (Q1+Q2+Q3 for both audit and install), signature. Download Job Card PDF button in modal. `genAuditPDF` and `genInstallPDF` now include Q3 in client feedback table.
- **Date filter**: `jobsDateFilter` (YYYY-MM-DD or "") + `setJobDateFilter(d)`. For audit jobs filters by `j.date`; for install jobs filters by `j.installDates[]` (all unique assignment dates collected at load from `sj.assignments[].date`, `sj.assignments[].dates[]`, legacy `sj.date`). Date picker in toolbar alongside type/status filter pills.
- **Analytics tab V2** (`renderAnalytics`, `drawAnalytics` + helpers `_anDstr`, `_anToIST`, `_anDateIST`, `_anMinsIST`, `_anParseDateText`, `_anInstallAttempts`, `_anArrivalStats`, `_anInstallerMap`, `_anAuditorMap`):
  - **Date range picker**: from/to date inputs + "Last 7/30/90 days" shortcuts. Defaults to last 7 days. `analyticsFrom`/`analyticsTo` module vars, applied via `drawAnalytics(m)`.
  - **Install section** — counted per *scheduling attempt* (subjob × date): a rescheduled order counts twice if both dates fall in the range. Log parsing extracts historical dates from "slot booked/rescheduled" log entries.
    - Metrics: Delivery Delay % (log-based), External Audit % (audit_by=customer), Job Card & Signature % (proxy: `ratings` table — rating written after signing), Installer Arrival On Time % (from 2026-07-02, scoped to date range), NPS, Q1/Q2/Q3 (all-time, NOT date-filtered).
    - Live SM Need Action banner: ops calls due + overdue follow-ups + reschedule subjobs (live, NOT date-filtered).
    - Delivery tracking sub-row: log-based delay count vs. confirmed delayed (`original_delivery_date` ≠ `delivery_date`).
    - Per-installer table: orders, completed, on-time arrival %, Q1/Q2/Q3 (all-time ratings by `staff_email`), quantity (WF boxes / WP rolls from `sj.items`).
  - **Audit section** — filtered by `o.date` in range.
    - Metrics: Job Card & Signature %, Completion %, Auditor Arrival On Time %, Reschedule Rate %, NPS, Q1/Q2/Q3 (all-time).
    - Per-auditor table: orders, completed, on-time arrival %, Q1/Q2/Q3.
  - **Arrival on time**: from `log` entries where `l.t` contains `"arrived at site"` AND `l.who` is set (added 2026-07-01). IST conversion: `+19800000 ms`. >3 min past scheduled slot = late. Only counted from 2026-07-02 and within the selected date range.
  - **NPS**: Promoters Q1 ≥ 9, Detractors Q1 ≤ 7. Range −100 to +100. Ratings are ALL-TIME (not date-range-filtered).
  - **Data queries**: `install_orders?select=pi,status,subjobs,service,delivery_date,original_delivery_date,log,created_at`, `audit_orders?select=pi,status,date,slot,log,auditor_name,auditor_email,created_at`, `ratings?select=order_type,pi,q1_score,q2_score,q3_score,created_at,staff_name,staff_email`

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
Admin analytics: `.an-section`, `.an-grid`, `.an-grid4` (4-col), `.an-card`, `.an-val`, `.an-bar`, `.an-stars`, `.an-nps-row`, `.an-sub-head`, `.an-inst-table`, `.an-deliv-row`, `.an-date-row`, `.an-date-inp`, `.an-apply-btn`, `.an-footer`
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

6. **Slot format is now HH:MM** (updated 2026-07-01): `o.slot` stores `"HH:MM"` (24h) for new bookings (e.g. `"10:30"`). Legacy IDs (`sf1`, `sw1`) on existing orders still display correctly. `slotLabel(id)` in all 4 files handles both formats — it is a function, not an arrow, and must remain a function. `autoFlip()` in both field apps parses HH:MM (`startH = h + m/60`) in addition to legacy SLOTS lookup. Do NOT revert `slotLabel` to a one-liner arrow or remove the HH:MM branch from `autoFlip`.

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

20. **Repeated delivery date updates**: A `deliv_delayed` order can be delayed again any number of times. The drawer shows a date picker pre-filled with the current delivery date and a "Further delayed" button. The `#markDelayed` handler checks `wasDelayed = o.status === "deliv_delayed"` before updating status, and logs "Delivery further delayed. New date: …" vs "Delivery delayed — BM asked to inform client. New date: …" accordingly. `delivery_date` in the DB is overwritten each time.

21. **SM_Audit slotsForOrder fallback**: When `o.auditTicked` is null (not fetched in poll), `slotsForOrder(o)` falls back to `o.service.flooring/wallpaper` to determine FL vs WP slots correctly. Do NOT revert this fallback.

22. **SM Install PDF installer name**: `genInstallPDFSM` resolves the installer name via `sj.assignments` (new multi-installer format) first, falling back to legacy `sj.installer` UUID lookup and `sj.installer_email`. Never use `sj.installer` alone — it is not set in the current format.

23. **Field app slot labels are dynamic, not hardcoded**: Both field apps build `SLOTS` at startup by reading from the SM dashboard's localStorage keys. Do NOT revert to a static `const SLOTS = {...}` object. The installer app uses `slotsLabel(j)` (not `slotLabel(j.slot)`) everywhere time is displayed — with the new HH:MM format, `slotsLabel` reads `j.slots[0]` and returns e.g. `"10:30 AM"`. The installer app no longer hardcodes `'Full day'` for flooring; it reads the start time from `slots[]`. If you add new time-display locations: use `slotsLabel(j)` in the installer app and `slotLabel(o.slot)` in the auditor app.

24. **Swipe-back navigation blocked on all authenticated pages**: All four pages (SM_Audit_Dashboard, SM_Install_Dashboard, Site_Auditor_App, Site_Installer_App) run these two lines immediately after the session guard:
    ```js
    history.replaceState(null,'',location.href);
    window.addEventListener('popstate',()=>history.pushState(null,'',location.href));
    ```
    `replaceState` removes Login.html from the browser history stack. The `popstate` listener catches any back navigation attempt (two-finger swipe, browser back button) and immediately re-pushes the current page, keeping the user on the dashboard. Sign-out still works because it uses `window.location.href='Login.html'` directly. Do not remove these lines — without them, swiping back on a Mac touchpad navigates to the login page.

25. **Email restriction removed** (as of 2026-06-23): Login.html accepts any valid email format. Admin "Add New User" and both SM "Add Staff Member" forms validate format only. Access gated by `profiles` table. **Do not add back any domain restriction.**

26. **Login.html Supabase error vs. user-not-found** (fixed 2026-06-26): `trySend()` checks `!Array.isArray(rows)` and `rows.length===0` as separate conditions. Non-array → "Network error — please try again." Empty array → "This email isn't approved for access yet." Previously both showed the not-approved message, hiding real downtime from users.

27. **SM dashboards always render on load failure** (fixed 2026-06-25): `loadOrders()` calls `render()` in ALL paths — success, non-array response, and exception. `if(!Array.isArray(rows)){render();return;}` and `catch(e){if(!$("#main").innerHTML.trim())render();}`.

28. **Fetch timeout + connection banner + fast retry** (fixed 2026-06-29): `sbGet` uses `AbortController` with 12s timeout. SM dashboards have `_connErr`/`_retryTid`/`_setConnErr(v)` vars. On failure: red sticky banner (`#connBanner`, between `</header>` and `<div class="layout">`), 8s fast retry via `_retryTid`. Early `render()` before `Promise.all(...)`. **Do NOT remove `_setConnErr` or `_retryTid` guard** — prevents stacking timers on consecutive failures.

29. **Doc scanner `_dsInit()` must be lazy** (fixed 2026-07-01): `_dsInit()` must be called from inside `openDocScanner()` (with `_dsReady` guard), NEVER as an IIFE at script parse time. The overlay HTML is injected AFTER `</script>` — `getElementById` returns null at parse time → `.onclick = ...` throws TypeError → `renderList()` never runs → entire app dead on load. The `_dsReady` flag ensures init runs once on first scanner open, when DOM is guaranteed to be ready.

30. **ALL compress functions require crossOrigin + try-catch** (fully fixed 2026-07-04): Every compress function in every file must set `im.crossOrigin='anonymous'` BEFORE `im.src` for any https:// URL, AND wrap the entire `onload` body in `try { ... } catch(e) { resolve(null); }`. Without this, canvas is CORS-tainted → `toDataURL()` throws SecurityError inside the async handler → Promise never resolves → PDF hangs forever. File-by-function inventory:
    - `Site_Auditor_App.html`: `compressImg()` (used in genPDF) ✅, `compress()` (dead code) ✅
    - `Site_Installer_App.html`: `compress()` ✅
    - `SM_Audit_Dashboard.html`: `_compressSM()` ✅ (was missing — caused SM PDF hang on Storage URLs)
    - `SM_Install_Dashboard.html`: `_compressInst()` ✅ (was missing — same)
    - `Admin.html`: `_compressAdmin()` async helper ✅; `genAuditPDF` and `genInstallPDF` are now `async`, use `await _compressAdmin(url)` for all images, and use `for` loops instead of `forEach` to support `await`. Pattern: `if(dataUrl && dataUrl.startsWith('http')) im.crossOrigin='anonymous';` before `im.src=dataUrl`.

31. **Installer PDF always refetches from `install_orders`** (fixed 2026-07-01): The PDF `dlPdf` handler in `Site_Installer_App.html` must always fetch from the full `install_orders` table before calling `genPDF(j)`. The poll uses `install_orders_slim` which strips `photos` from rooms — `j.jobcard` is truthy (the jobcard object exists) but `j.jobcard.rooms[].photos` are all empty. The old `if(!j.jobcard)` guard is NOT sufficient; always refetch: `const rows=await sbGet('install_orders?id=eq.'+j.id+'&select=subjobs')` and splice in the fresh jobcard before generating PDF.

32. **Login reads DOM directly for Android autofill** (fixed 2026-07-01): `trySend()` in `Login.html` reads `const _ei=$("#email"); const email=((_ei&&_ei.value)||state.email||"").trim().toLowerCase()`. Android autofill fills the input's DOM `.value` property but does NOT fire `oninput` → `state.email` stays empty → the email regex fails → "Enter a valid email address." is shown even though the field looks filled. Reading `element.value` directly in the submit handler bypasses this.

33. **Supabase Pro plan required** (upgraded 2026-07-01): The project exceeded Supabase free tier (5GB/month egress) because base64 photos were stored in JSONB columns and downloaded on every poll. Supabase project `material-depot1/material-depot-site` has been upgraded to Pro. If egress concerns arise again, verify slim views are in use for polls and new photos are going to Storage (not base64).

34. **Status sync: order-level vs. subjob-level** (one-time repair 2026-07-01): `install_orders.status` (parent) must always be ≥ the subjob and assignment statuses. After a direct DB edit caused 3 orders (Abhijith, ravi, Srikant) to have `status=atsite` at order level but `assigned`/`scheduled` at subjob level, a one-time SQL repair was run to advance all lagging subjob/assignment statuses to match their parent. If this discrepancy recurs, diagnose with: `SELECT id,customer_name,status,subjobs FROM install_orders WHERE status IN ('callpending','onway','atsite') AND EXISTS (SELECT 1 FROM jsonb_array_elements(subjobs) s WHERE (s->>'status') NOT IN (status::text,'completed','partial','reschedule'));`

35. **Auditor app unscheduled section** (added 2026-06-26): `listView()` in `Site_Auditor_App.html` shows an amber "Awaiting schedule — no date set yet" section for `o.date===null` orders that aren't completed/reschedule. Mirrors `Site_Installer_App.html`.

36. **Date filter in orders views**: SM Audit: `filterDate` vs `o.date`. SM Install: `filterDate` via `installOrderHasDate(o, ds)` (checks all subjob assignment dates). Admin Job Overview: `jobsDateFilter` vs `j.installDates[]`. All reset on nav switch.

37. **Search by Enquiry ID / customer** (added 2026-06-30):
    - **Admin Job Overview**: `jobsSearch` filters `realJobs` by `j.id` (PI) or `j.customer`. Input `#jobsSearchInput` first in toolbar. Focus/cursor restored after re-render. `navigate()` resets `jobsSearch=''`.
    - **SM dashboards**: `searchQ` already searches PI, customer, phone, BM, SKU in `ordersView()` — no change needed.

38. **Exact time slot system + 2-hour auditor buffer** (2026-07-01): `o.slot` stores `"HH:MM"` for new bookings.
    - **SM Audit**: `<input type="time" id="bookTime">`. `updateBookBtn()` syncs `draft.date`+`draft.slot`. `auditorConflictOrder(aid, date, slotTime)` blocks auditor if same auditor has HH:MM booking within 120 min on same date. Per-auditor only — Auditor B never blocked by Auditor A.
    - **SM Install**: `<input type="time" data-time="idx">` for standard wallpaper, standard flooring, custom wallpaper. `[data-time]` oninput sets `assigns[idx].slots=["HH:MM"]`. Custom flooring stays "Full day".
    - **Field apps**: `slotLabel` (function, not arrow) handles both HH:MM and legacy IDs. `autoFlip` parses HH:MM as `startH=h+m/60`. Legacy `sf1`/`sw1` orders unaffected.

39. **Activity log format + actor attribution** (finalised 2026-07-01): Log entries are `{t, d, by, who}` objects.
    - `t`: action text. `d`: ISO timestamp. `by`: `"manual"` or `"auto"`. `who`: actor name.
    - SM dashboards: every `o.log.push(...)` includes `who:SESSION.name`.
    - Auditor app: `o.log.push(...)` includes `who:ME.name`. Installer app: `j.parentLog.push(...)` includes `who:ME.name`.
    - **Display**: title line = `[Name in navy bold] · [action text]`. Sub-line = `[D Mon YYYY · HH:MM] · SM/installer/auditor`.
    - `fmtLog(d)` always returns `"D Mon YYYY · HH:MM"` — **NO "Today"/"Yesterday" labels ever**. Do not re-add those branches — was the recurring date-display bug.
    - Old entries without `who` render gracefully (actor prefix omitted).

40. **Photo handling in field apps — no crop, preserve aspect ratio** (fixed 2026-07-02): Both `Site_Auditor_App.html` and `Site_Installer_App.html` now use a shared `_resizeAndStore(dataURL, push)` helper for all photo additions. It resizes to max 1600px on the longest edge (preserving original aspect ratio, `image/jpeg` quality 0.88). Used for both camera (`addPhFromCam`) and gallery (`addPhFromGal`) — neither path goes through `cropModal`. The `cropModal` code is retained but no longer invoked during photo add. Thumbnail click (80×80 preview) now opens a full-size view-only overlay (dark backdrop, tap to dismiss) instead of the crop modal. **Do not reinstate `cropModal.open` in the photo add paths** — portrait photos were being cropped to a 340×255 landscape frame, losing top/bottom content.

41. **original_delivery_date field** (added 2026-07-02): `install_orders` table has a new `original_delivery_date` (text) column. Set to `delivery||null` at order creation in `addOrder()` (`SM_Install_Dashboard.html`). **Never updated when delivery is delayed** — `delivery_date` is overwritten on each delay, but `original_delivery_date` is immutable. Used in Admin analytics to confirm actual delivery delays: `confirmedDelayed = attempts where originalDelivery ≠ currentDelivery`. Supabase SQL to add: `ALTER TABLE install_orders ADD COLUMN IF NOT EXISTS original_delivery_date text;`

42. **PWA install banner — `pwa-install.js`** (added 2026-07-04): All 6 HTML files include `<script src="/pwa-install.js"></script>` before `</body>`. The shared script shows a fixed bottom banner prompting mobile users to install the app. Never shows if already running as standalone PWA (`display-mode: standalone` or `navigator.standalone`). ✕ button dismisses for the browser session (`sessionStorage._pwaDismissed`) — reappears on next tab/session if not installed. `appinstalled` event removes the banner automatically. Android: intercepts `beforeinstallprompt`, shows "Install" button → calls `event.prompt()`. iOS: shows immediately with "Tap Share → Add to Home Screen" text (no install API on iOS). Desktop: never shows (detects Android/iOS via user agent). Each page has its own `<link rel="manifest">` pointing to its role-specific manifest (e.g. `manifest_sm_audit.json`, `start_url: /SM_Audit_Dashboard.html`). All pages register the service worker (`sw.js`) for offline support.

43. **`dstr(d)` must use local date parts** (IST timezone fix — 2026-07-07): Any function that converts a JS `Date` to a `YYYY-MM-DD` string for DB queries must use `d.getFullYear()`, `d.getMonth()+1`, `d.getDate()` — **never `d.toISOString().slice(0,10)`**. At midnight IST (UTC+5:30), `toISOString()` returns the previous UTC day — so July 7 at 12:00 AM IST becomes `2026-07-06` in the query. SM Dashboard already used local parts; `Store_Team_App.html` had the bug and was fixed. **Pattern**: `function dstr(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return \`${y}-${m}-${day}\`;}`.

44. **Store Team auditor count must filter active_from** (2026-07-07): `Store_Team_App.html loadDay()` fetches auditor profiles with `active_from` and counts only those where `a.active_from <= date` or `a.active_from === null`. Using `.length` of all profiles gave inflated availability counts (showed "4 of 4 auditors" when only 1 was active).

45. **Admin Job Overview 30s auto-poll** (2026-07-07): `_loadJobsData(m)` / `renderJobs(m)` split. `_jobsPollTid` interval polls every 30s while `currentView==='jobs'` and `!document.hidden`. Cleared in `navigate()` when leaving. Queries exclude `deleted` and `slot_reserved` (`status=not.in.(deleted,slot_reserved)` for audit, `status=neq.deleted` for install). `JOB_STATUS` dict includes `created`, `follow_up`, `call_na`. Installer emails read from `sj.assignments[].installer_email` (new format) with `sj.installer_email` legacy fallback.

46. **`submitAddUser()` / `submitEditRole()` in Admin require try/catch** (2026-07-06): Both functions are wrapped in try/catch to surface DB errors (e.g. role constraint violations). Without this, the button stays in "Adding…" / disabled state with no user feedback when `sbPost`/`sbPatch` throws.

47. **PWA — Store Team has its own manifest** (2026-07-06): `Store_Team_App.html` has `<link rel="manifest" href="/manifest_store_team.json">`. `manifest_store_team.json` exists at project root with `start_url: /Store_Team_App.html`. The Store Team app also includes `pwa-install.js` before `</body>`.

48. **Store Team slot IDs are exact times** (2026-07-06): Store Team uses `{id:'10:00', startMin:600, endMin:660}` etc. — the `id` field IS the slot value stored in DB as `o.slot`. `slotsConflict(slotA, slotB)` checks `|slotA.startMin - slotB.startMin| < 120`. Pre-booking PI format: `'SRES-' + storeCode.toUpperCase().slice(0,6) + '-' + Date.now().toString().slice(-9)`.

49. **`pwa-install.js` included in all 7 HTML files** (updated 2026-07-06): Store_Team_App.html was added as the 7th file — it also includes `<script src="/pwa-install.js"></script>`.

50. **`active_from` is cross-device via Supabase** (2026-07-06): SM sets auditor `active_from` in Auditors & Caps view → Save PATCHes it to `profiles` table. Store_Team_App fetches `profiles?select=id,active_from&role=in.(site_auditor,auditor_installer)` each time a date is selected. This ensures Store Team on any device sees the current SM-configured auditor availability.

51. **Store Team App is open access — no login** (2026-07-07): `Store_Team_App.html` has no authentication. `ME` session variable removed. `doLogin()`, `showLogin()`, `getSession()` functions removed. Login screen HTML removed. `startApp()` skips session check — shows store picker if no `md_store` in localStorage, otherwise loads day view directly. Header shows only store picker button (no sign-out). Booking log uses `who:MYSTORE` and `created_by_email:'store-team'`. The anon Supabase key already had write access to `audit_orders`, so no backend changes were required. Share URL: `https://material-depot-site.vercel.app/Store_Team_App.html`.

## Pending POs Import (replaces Kylas Sheet as of 2026-06-22)

**Constant**: `POS_API='/api/pos'` in both SM dashboards (Vercel rewrite proxies to `https://api-dev2.materialdepot.in/apiV1/site-audit-installation-pos/` — avoids CORS)  
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
