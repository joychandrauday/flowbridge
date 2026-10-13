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

### `scoped()` / scoped-client gaps

`createScopedClient(workspaceId)` injects `workspaceId` into `where` clauses for
tenant models. Two known gaps, handled by convention + the guard patterns in
server actions:

1. **No `job` model** on the scoped client — queue access goes through
   `JobQueue` (which uses the raw client) and is never tenant-scoped by design
   (jobs carry a `workflowRunId` that is already scoped).
2. **`findUnique`/`update` by unique key** cannot have `workspaceId` injected
   (the unique key isn't `workspaceId`). Server actions therefore always use the
   global client and **explicitly** filter by both the id *and*
   `workspaceId: session.user.workspaceId` (see `updateLeadStatus`,
   `deleteIntegration`, `runWorkflowManually`). A dedicated `scoped()` unit test
   proves cross-tenant read/update is impossible (Phase 8/9).

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
