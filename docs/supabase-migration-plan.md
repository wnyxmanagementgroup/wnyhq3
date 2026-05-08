# Supabase Migration Plan

## Summary

This project is a good candidate for moving off Firebase now because:

- The business data already exists in tabular form in Google Sheets / exported workbook:
  - `Users`
  - `Requests`
  - `Attendees`
  - `Memos`
  - `Trash`
- `GAS + Google Drive + Cloud Run` can stay exactly where they are strong today.
- `Firebase Storage` is no longer a required core service.
- Real user login is already validated through `GAS verifyCredentials`, not only through Firebase Auth.

That means the migration can focus on replacing the Firestore data layer first, instead of rewriting the whole platform at once.

## Recommended Target Architecture

Use this split:

- `Supabase Postgres`
  - primary app database
  - replaces Firestore collections
  - stores requests, memos, users, settings, approval links, counters
- `Google Apps Script`
  - keep existing login verification
  - keep Google Sheets backup / export
  - keep Google Drive upload / file proxy
  - keep helper endpoints already used by the app
- `Cloud Run PDF Engine`
  - unchanged
- `Google Drive`
  - unchanged

## Important Design Choice

There are 2 migration paths.

### Path A: Fastest and Lowest Risk

Keep `GAS` as the authenticated backend facade for now.

- Frontend still calls `apiCall(...)`
- `GAS` reads/writes Supabase instead of Firestore for migrated endpoints
- Login can stay on `verifyCredentials`
- No need to solve Supabase Auth and RLS on day 1

This is the easiest path for this codebase.

### Path B: Better Long-Term Architecture

Move frontend reads/writes directly to Supabase client APIs with RLS.

- stronger long-term architecture
- fewer moving parts after completion
- but requires auth redesign and broader frontend refactor

For this project, start with **Path A**, then evaluate Path B after the data migration is stable.

## Why This Is Easier Than Before

The current app already uses Firebase mainly as a data layer and sync layer.

Examples:

- Login still checks `GAS verifyCredentials` in [js/auth.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/auth.js)
- The project explicitly states Firestore is the main database in [js/firebaseService.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/firebaseService.js)
- Existing workbook data already mirrors the main Firestore-backed entities

So the migration is now mostly:

1. move app data storage from Firestore to Supabase
2. remove Firebase-specific client logic
3. keep document and Google integrations in place

## Tables To Create In Supabase

The base schema is in [supabase/schema.sql](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/supabase/schema.sql)

Core tables:

- `app_users`
- `requests`
- `attendees`
- `memos`
- `trash_requests`
- `request_counters`
- `approval_links`
- `app_settings`
- `system_config`

## Import Source Mapping

Import from the workbook as follows:

| Workbook sheet | Supabase table |
| --- | --- |
| `Users` | `app_users` |
| `Requests` | `requests` |
| `Attendees` | `attendees` |
| `Memos` | `memos` |
| `Trash` | `trash_requests` |

Manual seed or export separately:

- `approval_links`
- `app_settings`
- `system_config`
- `request_counters`

## Current Firebase-Backed Areas In Code

These files are the main migration surface:

| File | Current Firebase role | Migration direction |
| --- | --- | --- |
| [js/config.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/config.js) | Firebase init | replace with Supabase config or remove direct client DB init |
| [js/utils.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/utils.js) | Firebase ID token injection | stop attaching Firebase token; use GAS session or Supabase token |
| [js/firebaseService.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/firebaseService.js) | Firestore-first save/update/counter/backup | replace with Supabase service or GAS-to-Supabase facade |
| [js/auth.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/auth.js) | hybrid login + anonymous Firebase auth | keep `verifyCredentials`; remove Firebase auth dependency later |
| [js/requests.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/requests.js) | user request CRUD in Firestore | move reads/writes to Supabase-backed endpoints |
| [js/admin.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/admin.js) | admin CRUD and memo updates | move reads/writes to Supabase-backed endpoints |
| [js/main.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/main.js) | dashboard, settings, workflow config | move requests/users/settings queries to Supabase |
| [js/tokenSign.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/tokenSign.js) | approval links and request fetches | move approval link storage to Supabase |
| [js/signature.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/signature.js) | request final updates | move request update path to Supabase |
| [js/sarabun.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/sarabun.js) | request doc status writes | move request update path to Supabase |

## Recommended Migration Sequence

### Phase 0: Freeze and Audit

- Export the latest workbook from the current system
- Export Firestore-only data that is not present in the workbook:
  - `approvalLinks`
  - `settings`
  - `systemConfig`
  - request counters
- List every Firestore-only field that must survive the migration

### Phase 1: Provision Supabase

- Create a new Supabase project
- Run [supabase/schema.sql](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/supabase/schema.sql)
- Create a service-role based integration for GAS
- Store Supabase URL and service key in GAS Script Properties

### Phase 2: Import Workbook Data

- Import `Users` into `app_users`
- Import `Requests` into `requests`
- Import `Attendees` into `attendees`
- Import `Memos` into `memos`
- Import `Trash` into `trash_requests`
- Seed missing app tables manually:
  - `approval_links`
  - `app_settings`
  - `system_config`
  - `request_counters`

### Phase 3: Let GAS Talk To Supabase

Add new GAS helper functions that call Supabase using the service key.

Suggested endpoint replacements:

- `verifyCredentials`
- `getAllRequests`
- `getDraftRequest`
- `submitRequest`
- `saveGeneratedCommand`
- `getAllMemos`
- `updateMemoStatus`
- `deleteRequest`
- `sendCompletionEmail`
- `getPendingApprovalRequests`
- `getArchiveRequests`

In this phase:

- frontend still uses the current `apiCall(...)`
- GAS becomes the compatibility layer
- Firestore can be bypassed without a full UI rewrite

### Phase 4: Replace Firestore Reads/Writes In Frontend

Do this file by file:

1. [js/firebaseService.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/firebaseService.js)
2. [js/requests.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/requests.js)
3. [js/admin.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/admin.js)
4. [js/main.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/main.js)
5. [js/tokenSign.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/tokenSign.js)
6. [js/signature.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/signature.js)
7. [js/sarabun.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/sarabun.js)

### Phase 5: Remove Firebase

After all reads/writes are confirmed on Supabase:

- remove Firebase SDK imports from [app/index.html](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/app/index.html)
- remove Firebase init from [js/config.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/config.js)
- remove Firebase token handling from [js/utils.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/utils.js)
- retire [js/firebaseService.js](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/js/firebaseService.js) or rename it to `dataService.js`

## Special Notes

### Authentication

Current human login is not fully dependent on Firebase.

- The app already verifies credentials through `GAS verifyCredentials`
- Firebase is also used for anonymous auth and Firestore access

So the fastest migration does **not** require moving login first.

Recommended:

- keep current GAS login in phase 1
- migrate data access first
- decide later whether to adopt Supabase Auth

### Request Number Generation

Current Firestore transaction counter should move to Supabase.

Included in schema:

- `request_counters`
- `generate_request_id(p_doc_date date)` function

### File Storage

No need to migrate files into Supabase Storage now.

Keep:

- GAS upload logic
- Google Drive as file store
- Cloud Run PDF engine

### Missing Data Outside Workbook

The workbook does not fully cover:

- `approvalLinks`
- `settings/announcement`
- `systemConfig/workflowSettings`
- `systemConfig/signerPositions`
- some Firestore-only transient fields

These must be exported separately before cutover.

## Cutover Strategy

Use a dual-run window:

1. write new records to Supabase
2. keep Sheets backup through GAS
3. verify admin pages, memo flow, approval flow, archive flow
4. disable Firestore writes only after verification

## Recommendation

For this project, the best next move is:

1. create Supabase project
2. run the schema
3. import workbook data
4. add GAS-to-Supabase helper endpoints
5. migrate the frontend off Firestore gradually

That is the highest-confidence path with the least disruption.
