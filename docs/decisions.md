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
