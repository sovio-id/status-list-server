# PR: Add Bitstring Status List support with optimistic concurrency control

## Overview

This PR extends the status list server to support **W3C Bitstring Status List** credentials alongside the existing SD-JWT token format. It adds a `format` discriminator to the data model, version-based **optimistic concurrency control** via `ETag` / `If-Match`, and content-type-aware responses. Database migrations and a full test suite are included.

**Branch:** `feat/bitstring-status-list-implementation`
**Base:** `main`

## Commits

| Commit | Message |
| --- | --- |
| `80ce16b` | feat: implement bitstring status list functionality and update database schema |
| `2f510db` | feat: implement optimistic concurrency control for status lists with ETag support |
| `901fb26` | fix: update DATABASE_URL in .env.demo for correct file path |

## Changes

### API (`apps/server/src/routes/status-lists.ts`)

- **Dual payload support** — `POST` and `PATCH` now accept either:
  - `{ id, jwt }` for SD-JWT token status lists, or
  - `{ id, vc }` for a `BitstringStatusListCredential` VC.
- **Validation** — Zod schemas enforce:
  - `@context` includes `https://www.w3.org/ns/credentials/v2`
  - `type` includes `BitstringStatusListCredential` / `BitstringStatusList`
  - `encodedList` is a multibase `u` base64url gzip payload of at least **131,072 bits**
  - Strict objects reject mixing `jwt` and `vc`.
- **Format consistency** — updating a list with a payload whose format differs from the stored format returns `400`.
- **Immutability guards** — `bits` (token) and `statusSize` (bitstring) cannot change after creation.
- **Optimistic concurrency**:
  - Responses return an `ETag` derived from the row `version` (`"0"`, `"1"`, …).
  - `PATCH` honors `If-Match`; stale versions return `412 Precondition Failed`, malformed values return `400`.
  - The DB update is conditional on the expected version, preventing lost updates.
- **GET** returns the correct content type per stored format:
  - `application/statuslist+jwt` for token lists
  - `application/ld+json` for bitstring lists
  - Both set `Cache-Control: no-store` and expose the `ETag`.
- Exports `app` from `index.ts` to enable direct request testing.

### Database (`packages/db`)

- Added `format` column (`"token" | "bitstring"`, default `"token"`).
- Added `version` integer column (default `0`) for concurrency control.
- Changed timestamp defaults from JS `new Date()` to SQL `unixepoch()`.
- `updateStatusList` now increments `version`, supports an optional `expectedVersion`, and returns the new version via `RETURNING`.
- New migrations:
  - `0001_add_status_list_format.sql`
  - `0002_green_old_lace.sql` (rebuilds table with `unixepoch()` defaults)
  - `0003_add_status_list_version.sql`
- `drizzle.config.ts` resolves `.env` from multiple working-directory locations.

### Tests (`apps/server/tests`)

- New `bitstring-status-lists.test.ts` covering creation, validation failures, format mismatches, `statusSize` immutability, content types, and `ETag`/`If-Match` flows (200 / 400 / 412).
- Extended helpers with `createTestBitstringCredential` and `EMPTY_ENCODED_LIST`.
- Updated existing token tests for the new `app` export.

### Config / Ops

- `apps/server/.env.example` added (`DATABASE_URL`, `API_KEY`, `PORT`).
- `.env.demo` `DATABASE_URL` corrected to `file:/app/status-list.db`.
- Vitest config excludes `dist` and sets `PORT`.

## Testing

```bash
bun test
# or
bun run --filter @status-list-server/server test
```

## Breaking changes / Migration notes

- **Database migration required** before deploying: apply migrations `0001`–`0003`.
- Existing rows default to `format = 'token'` and `version = 0`, so existing SD-JWT lists keep working.
- `GET` responses now include `Cache-Control: no-store` and an `ETag` header.
- Clients performing `PATCH` are encouraged to send `If-Match` to benefit from concurrency protection (optional; omitting it preserves last-write-wins behavior).

## Checklist

- [x] Bitstring status list create / update / read
- [x] Input validation for VC and encoded list
- [x] Format consistency and immutability guards
- [x] Optimistic concurrency with `ETag` / `If-Match`
- [x] Database schema + migrations
- [x] Unit/integration tests
- [ ] Manual end-to-end verification against demo environment
