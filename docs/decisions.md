# Decision log

Assumptions and deliberate deviations from `SPEC.md` / `AGENTS.md`, recorded per
AGENTS §7 ("if a requirement is ambiguous, write the assumption here and
continue"). Newest entries at the bottom of each section.

---

## Platform

### `after()` is unavailable on Next 14.0.4 → `drainNow()` + cron tick

`SPEC.md`/`AGENTS.md` describe queue work happening inside Next.js `after()`.
Next 14.0.4 (the pinned version) has no stable `after()` and no
`unstable_after`. **Decision:** after an intake/webhook/import transaction
commits, we call `drainNow(prisma, queue)` as a best-effort *first* drain and
return `202` immediately. The durable path is the external cron hitting
`/api/internal/tick` every minute. No work is lost if the in-process drain
fails, because the `jobs` rows are already committed (SPEC §2.1).

### Engine and queue live in `apps/web/src/lib`, not `packages/core`

`AGENTS.md` allows either. `packages/core` is kept **pure** (no Prisma, no IO,
no Next.js imports) so its unit tests stay fast and its boundary stays clean.
The `JobQueue` implementation and the engine therefore live in
`apps/web/src/lib/{queue,engine}.ts`; the swappable `JobQueue` interface is the
only thing the rest of the app depends on (SPEC §2.2).

### `pnpm test` runs serialized

`turbo` parallelising vitest across workspaces is flaky on the maintainer's
Windows machine (intermittent worker crashes). The root `test` script uses
`pnpm -r --workspace-concurrency=1 run test`. Slower, deterministic.

### Middleware matcher deliberately excludes `/api` and public prefixes

The middleware protects dashboard pages only. The matcher excludes `api/`,
`_next`, `favicon`, and the public surfaces (`embed`, `login`, `register`,
`onboarding`). Each API route owns its own auth: NextAuth handlers, the intake
route (form-scoped/public + rate limited + honeypot), `/api/internal/tick`
(`Authorization: Bearer CRON_SECRET`), and the webhook route (HMAC). The
`/f/` public form path is **not** in the matcher exclusion list — it *is* on the
`publicRoutes` allow-list inside the handler, so middleware still sees it and
lets it pass without a session.

### Rate limiting is in-process (swap for KV later)

Public intake and webhook routes share one small fixed-window limiter
(`apps/web/src/lib/rate-limit.ts`), keyed by `formKey`/`workspace` + client IP.
It is process-local — correct for a single Next.js instance (the deployment we
target), but a horizontally-scaled deployment would let each instance count
independently. `KV_REST_API_*` env vars are reserved for a Vercel KV / Upstash
swap; the interface (`check(key, max, windowMs)`) is the seam. The limiter is
unit-tested with an injectable clock rather than a real timer.

---

## Data model

### `scoped()` behaviour and the one deliberate gap

`createScopedClient(workspaceId)` injects `workspaceId` into every tenant-model
query. After the hardening pass:

- `findUnique`/`findUniqueOrThrow` are **rewritten to `findFirst`/
  `findFirstOrThrow`** with `workspaceId` merged into `where`, so isolation no
  longer depends on Prisma's `extendedWhereUnique` semantics.
- `create`/`createMany` and `upsert.create` are stamped with the scoped
  `workspaceId`, overriding any value the caller supplied.
- `packages/db/src/scoped.test.ts` drives a fake delegate that actually applies
  `where`/`data`, proving cross-tenant read, update, delete and upsert are
  impossible — not merely that the helper was *called* with certain arguments.

One model stays out of the scoped client on purpose: **`job`**. Queue access
goes through `JobQueue` (raw client); jobs carry a `workflowRunId` that is
already tenant-scoped, and the claim query needs `FOR UPDATE SKIP LOCKED` across
the whole table.

### `Lead.email` is globally unique

The schema uses `@unique` on `Lead.email` (not `@@unique([workspaceId, email])`).
Consequence: dedupe is install-wide, so the same email cannot exist in two
workspaces. Acceptable for a single-tenant self-hosted deploy; flagged here in
case multi-tenant hosting is ever needed (would be a migration).

### Manual runs create an `IntakeEvent` (source `manual`)

`WorkflowRun.eventId` is required (SPEC §8). A "Run on lead" from the workflow
editor has no inbound event, so we create an `IntakeEvent` with
`source: 'manual'` and `leadId` set inside the same transaction. This satisfies
the constraint, keeps the lead timeline honest ("Captured via manual"), and
preserves the `@@unique([workflowId, eventId])` idempotency shape.

### `RunStep` unique index — candidate, not yet applied

`@@unique([runId, stepKey])` would make step snapshots race-proof, but the
engine currently creates all step rows at run start and guards re-entry by
reading existing rows. Applying the index requires a migration and an idempotent
upsert in the engine; deferred rather than risking existing runs. Recorded as a
candidate for the hardening phase.

### Executor context is typed; lead-optional steps guard the lead

`ExecutorContext` (`apps/web/src/lib/executors/types.ts`) uses Prisma payload
types (`ContextLead`, `ContextWorkflowRun`, `ContextAssignee`,
`ContextWorkspace`) instead of `any`. Time triggers produce runs with **no
lead**, so the notification executors (`send_email`, `send_slack`,
`send_telegram`) guard their `Activity` writes behind `if (lead)`, and the
`assign`/`create_task` executors already return a clear error when no lead is
present. `leadTemplate(undefined)` now returns `{}`, so `{{lead.*}}` renders
empty rather than throwing. Typing the boundary surfaced several latent
null-derefs that `any` had hidden — fixed in place rather than re-suppressed.

---

## Intake & integrations

### Real SMTP via nodemailer, Resend fallback, log-only mode

The email executor supports three providers selected by integration config:
`resend` (HTTP API), `smtp` (real nodemailer transport with host/port/auth/
secure/from, falling back to `SMTP_*` env), and `log` (writes the message to the
console and sends nothing — for demos with no provider). Integration config
**field shapes must match exactly** what the executor reads, so the settings
form schema is the contract: `{ provider, apiKey, host, port, secure, user,
password, from }`.

### CSV import uses per-row transactions, not one big transaction

A single wrapping `$transaction` is tempting but wrong on Postgres: any failed
statement (e.g. a duplicate-email `P2002`) aborts the whole transaction, so a
caught error cannot be followed by more writes. **Decision:** each CSV row gets
its own transaction (`IntakeEvent` + `Lead` + runs + jobs), with an email
pre-check and a `P2002` catch for races. A bad row is reported in the summary
and skipped; good rows commit. Caps: 500KB file, 2000 rows, 20 reported errors.

The client now parses the file, shows a **column-mapping UI** and a preview of
the first 10 rows, then posts `{ csvText, mapping }`. Mapping is done by pure
`applyMapping`/`guessMapping` helpers (unit-tested) so the lead fields and the
CSV columns cannot drift.

### Dedupe is by email then phone, with no per-workspace toggle

The SPEC stretch list mentions a "dedupe by email setting". **Decision:** dedupe
is always on — email first (`Lead.email` is globally unique), then phone when no
email matched — and is *not* configurable yet. A toggle would need a settings UI
and a "force import anyway" escape hatch, which is follow-up scope. Recorded here
so the behaviour is deliberate rather than accidental.

### `pnpm db:seed` is idempotent

Re-seeding must be safe because the schema/seed change over time and the tracker
says to re-run it. The seed upserts workspace/users/members/form/workflow/leads/
integration, and now guards the two non-upsertable writes: the `lead_created`
activity (skip if one exists) and demo tasks (only create when the workspace has
none). Re-running adds nothing.

### Webhook HMAC is optional-but-enforced-when-configured

`SPEC.md` §9 calls the signature "optional but supported". **Decision:** if
`Workspace.webhookSecret` is set, the `X-FlowBridge-Signature` header is
**required and verified over the raw body before parsing** (constant-time
compare, `sha256=<hex>` or bare hex). If no secret is configured, the endpoint
still works but is unauthenticated — the workspace must opt in by setting a
secret. Workspace resolution is by `slug` (public identifier); the secret is
never placed in the URL.

---

## UI

### Status/note/assignee/task/workflow mutations are form-action server actions

These pages are server components with native `<form action={serverAction}>`
mutations rather than client `useSearchParams`/`fetch`. Fewer hydration
surprises, works without client JS for the core actions, and keeps tenant guards
in one place. Rich client components are reserved where they earn their keep
(the workflow editor, the integrations form, CSV upload, the public form).

### The workflow editor is a vertical stepper

Per SPEC §5/AGENTS §5: Trigger card → Conditions card → Action cards with `+`
between, plus a JSON preview drawer and a "Run on lead" test action. No
drag-and-drop canvas (explicit non-goal).

### Agents are scoped to their own leads and tasks

SPEC §3 says an Agent "sees assigned leads only". Enforced on **both** the list
and the detail pages of `/leads` and `/tasks` (an agent's `where` gains
`assigneeId = <their member id>`; unknown → a sentinel that matches nothing), and
in the lead server actions (`updateLeadStatus`, `addLeadNote`). Reassigning a
lead is an Owner/Admin action, so `updateLeadAssignee` rejects agents outright.
Owners/Admins are unrestricted. (Previously only the assignee dropdown was
role-aware; the queries were not.)

---

## Engine / data

### `JobQueue.claim()` must quote `"runAfter"`

The claim query is a hand-written `FOR UPDATE SKIP LOCKED` statement. It referred
to `runAfter` **unquoted**, so Postgres folded it to `runafter` and the column did
not exist — meaning *claiming a job never worked against Postgres at all* (the
unit tests only exercised a mocked client, so it went unnoticed). Found by the
new database integration test (`apps/web/tests/integration/queue.integration.test.ts`).
Fixed to `"runAfter"`. Prisma maps camel-case columns to quoted identifiers, so
**every raw SQL fragment must quote camel-case columns**.

### Pooled Postgres needs `pgbouncer=true` (or the claim query breaks)

The queue's raw `FOR UPDATE SKIP LOCKED` statement uses a **prepared statement**.
Behind a transaction-mode pooler (Neon's `-pooler` host, Supabase, PgBouncer,
RDS Proxy) a cached plan can be re-executed on a backend whose `Job` row type
differs, and Postgres aborts with
`ERROR: cached plan must not change result type (0A000)`. The failure is
intermittent and *only* hits the raw claim query — Prisma's normal queries use a
different path — so the tick would silently fail to process anything.

Fix: append `pgbouncer=true` to `DATABASE_URL`, which tells Prisma to stop using
prepared statements. Recorded in `.env.example`. Diagnosed by the integration
suite: the queue tests pass in isolation but fail with `0A000` once another test
file has run first in the same process; adding `pgbouncer=true` makes the whole
suite green regardless of order.

### Database integration tests are opt-in and refuse a non-empty DB

`pnpm test` stays pure/fast. Integration tests live in
`apps/web/tests/integration/*.test.ts` and run via `test:integration` against
`TEST_DATABASE_URL` (a dedicated scratch database; apply the schema with
`prisma db push`). The suite throws if the target database already contains
workflows, so pointing it at seeded demo data fails loudly rather than mutating
it. CI runs them against a `postgres:16` service container.

### API requests authenticate with a session *or* an API key

`GET /api/leads` accepts either the dashboard session or
`Authorization: Bearer fb_…`. Keys are stored as SHA-256 hashes; the helper
compares constant-time, rejects expired keys, bumps `lastUsedAt`, and requires the
`read:leads` scope. The key's `workspaceId` — never a client value — scopes the
query. Other endpoints remain session-only for now.

### Discord is a first-class notification channel, host-locked

SPEC §2.5/§4.4 list Discord alongside Telegram and Slack, so `send_discord` was
added as a proper step type (Zod config → executor → settings integration →
workflow-editor step → run-history icon → unit test), not left out. The
integration stores a `webhookUrl` in its encrypted config. Because that URL is
user-supplied, it is a potential SSRF vector, so the **host is allow-listed**
(`discord.com` / `discordapp.com`, HTTPS only) both when saving the integration
and again in the executor before the request fires — a stored URL can never be
pointed at an internal address. Discord `content` is capped at 2000 chars and
truncated client-side. Success is `204 No Content`.

### A failed run is never silent

`markRunFailed` is the single choke point for the `FAILED` transition, so the
notification lives there: it writes a `run_failed` **activity** on the lead
(durable, shows in the timeline) and then best-effort messages every `OWNER`
member over whatever `email`/`telegram` integrations the workspace has. The
message body is built by a pure `buildRunFailureNotification` in
`packages/core` (unit-tested); the send is wrapped in `try/catch` so a broken
notifier can never change the run's outcome. Owners without a configured
integration still get the activity. This closes the Phase 5 gap and SPEC §13.10.

### `User.telegramChatId` is a real column

`send_telegram` with `sendToRole` read `telegramChatId` off a cast because the
column did not exist, so role/assignee targeting always fell through to the
integration default. Added `User.telegramChatId String?` (nullable, additive) and
the executor now reads the typed field. Fallback order is explicit `chatId` →
role/assignee lookup → integration `defaultChatId`.

---

## Post-audit feature completion

### Leads bulk actions are per-lead transactions, agents can't reassign

SPEC §10.2 asks for saved filters, quick-assign, and bulk actions on the Leads
table. Bulk status/assignee changes run as **one transaction per lead** (same
pattern as CSV import) rather than one giant transaction — a single bad row
can't roll back the whole selection. A `lead.status_changed` bulk change fires
the same `createRunsForLeadStatusChange` helper as the single-lead action, so
workflow triggers behave identically. Per SPEC §3, **agents may only change the
status of their own leads and can never reassign** (the assignee control is
hidden, and the action re-checks the role and re-scopes the `where` clause).
Selections are capped at 100 ids per submit.

### Saved lead filters live in `localStorage`, not the database

SPEC §8's data model has no `SavedFilter` table, and adding one would be a
schema change outside the spec. Saved filters are therefore stored per browser
in `localStorage` under `flowbridge:savedLeadFilters` — a deliberate, documented
compromise. If per-user/per-workspace saved filters are wanted later, promote
this to a real model.

### Command palette is hand-rolled (no `cmdk` dependency)

The ⌘K/Ctrl-K palette (SPEC §10 micro-interactions) is built on the existing
Radix `Dialog` plus a filtered command list. Adding `cmdk` for one dialog wasn't
worth the dependency; the hand-rolled version keeps ⌘K registration, keyboard
navigation, and listing in ~40 lines and stays inside the design system.

### `/api/health` is public and secret-free

SPEC §13 Week 4 asks for a health endpoint. `GET /api/health` runs `SELECT 1`
and returns `{ status, db, latencyMs, timestamp }` with `200`, or a bare
`503 { status: 'error', db: 'down' }`. It never echoes env values. The
middleware matcher already excludes `/api`, so no auth is required to probe it.

### Workflow templates live in `packages/core`, validated by a test

The three-template gallery (SPEC §2 stretch / §13 Week 4) is pure data in
`packages/core/src/templates.ts`. `templates.test.ts` runs every definition
through `WorkflowDefinitionSchema`, so a renamed step field fails CI instead of
failing for the user the moment they click "Use template". The create action
re-validates server-side before writing. Seeded demo workflows are left
untouched — the gallery only affects new workspaces.

