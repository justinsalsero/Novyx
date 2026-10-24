# Novyx 4.0.2

A personal planning workspace guided by Nyx. Version 4.0.2 adds a read-only Google Calendar authorization and sync workflow on top of the 4.0.1 reliability repairs. Activation requires the app owner’s Google OAuth client and a real-account pilot.

## Current architecture

- React 19, TypeScript and Vite 6 frontend.
- AppDeploy-injected client/server SDKs provide authentication, database, AI, push notifications and hosting. These packages are intentionally absent from npm dependencies.
- Existing records stay in their original per-user tables. New writes use safe, hashed per-user table names. Reads combine both stores through bounded pagination. No bulk migration or deletion is performed.
- Server endpoints require authentication except the health check. Account identity comes from verified server context, never request bodies.
- New item saves use stable request IDs. Assistant approvals and receipt-to-transaction saves use database transactions. Unknown outcomes are reconciled with the same request identity, not blindly repeated.
- Assistant context includes up to ten prior conversation messages and a bounded workspace snapshot. The UI explicitly flags partial AI snapshots. Dashboard totals and exports load all pages across separate requests.

## Changes in 4.0.2

- Authenticated OAuth completion with a fixed redirect URI, one-time state, PKCE and server-only encrypted tokens.
- Primary-calendar imports in resumable pages, explicit manual sync, token refresh, disconnect and provider revocation handling.
- Busy/free, cancelled, overnight and all-day event support in planning. Connected Google appointments are read-only; disconnected copies become inactive snapshots.
- [Owner setup and real-account acceptance checklist](docs/google-calendar-setup.md).

## Reliability fixes retained from 4.0.1

- Data-derived spending charts and consistent subscription totals.
- Calendar-month recurrence anchored to the original date, Vancouver date boundaries and explicit non-amortizing debt outcomes. Debt projections assume fixed total payments, with freed payments rolled forward.
- Calendar/planner compatibility across eventTime, startTime and time fields. New events use eventTime. Explicit all-day events block their date range; manual events without a usable time require review before planning.
- Reviewable assistant task/event proposals with Approve & save and Dismiss. No external messages or payments are executed.
- Full version-4 backups containing records, profile, explicit memories and pending connection requests. Temporary drafts, authentication tokens, notification subscriptions, per-device voice settings and session conversations are not exported. Version 2/3 record backups are accepted.
- Repeatable restore pages keep existing matching records. Imports do not overwrite existing records; the user explicitly confirms any profile replacement. A failed import may have confirmed partial progress, reported in the UI; replaying the same source records is safe.
- Visible save/refresh errors, private-state cleanup on sign-out, and honest reminder notifications that do not claim a report already exists.

## Development and verification

Use Node 22.6 or later; Node 24 is recommended. Run `npm ci`, then `npm test` for domain and backend regression tests. The backend tests use a test-only SDK double and do not prove cloud SDK behavior. Deployment builds and runtime checks use AppDeploy. Browser workflow definitions are supplied in tests/tests.json; Google-account acceptance remains pending until OAuth credentials are configured.

`tests/google-calendar.test.mjs` adds Calendar OAuth/sync regression tests. `tests/tests.json` defines five deployed browser workflows. `tests/domain.test.mjs` covers financial/date calculations and validation. `tests/backend.test.mjs` covers authentication boundaries, pagination including legacy records, idempotent saves, explicit approvals, event conflicts, imports and atomic receipts.

For a local Vite build the AppDeploy runtime modules must be supplied by the host. A compile-only check can externalize `@appdeploy/client`; that does not create a locally functioning app.

## Remaining external setup and limits

The Google Calendar connector is implemented but not activated until the owner configures credentials and a user grants access. It supports one account’s primary calendar with manual, read-only synchronization. Gmail, Outlook, bank linking and paid subscription billing remain unimplemented; their forms only record requests. Calendar webhook/background sync and write-back are not part of this release.

Voice input relies on browser speech recognition. Voice output uses installed device voices or an optional locally downloaded Kokoro model. The large model is dynamically loaded only when neural speech is enabled. iPhone neural playback and latency require real-device verification; text remains available.

Background notifications are opt-in reminder broadcasts, not personalized autonomous monitoring. The assistant cannot currently send emails, move money or operate outside Novyx.

The deployment address retains its original 3.0 slug so existing bookmarks and saved data continue to work. Product labels identify Novyx 4.0.

Binary Nyx assets remain attached to the existing AppDeploy deployment. If the archive does not include them, download the four current `/resources/nyx-*.png` assets from the live app before migrating hosts.

## Deployment and recovery

Live app: https://novyx-3-0-9o43mh.v2.appdeploy.ai/

Original deployed baseline: AppDeploy version `1792146260052`. Keep that version for historical recovery. Reverting to the old reader after new records are created would hide the new-format records; use a forward repair or export the complete dataset before any rollback. Source changes never include real user data or credentials. The source archive includes the preserved baseline separately from the fixed source.

GitHub repository: https://github.com/justinsalsero/Novyx. The initial authorization problem was resolved by installing the GitHub App and granting repository access.
