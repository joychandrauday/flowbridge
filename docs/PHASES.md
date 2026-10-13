# FlowBridge — Phase To-Do Tracker

Contract: `SPEC.md`. Rules: `AGENTS.md`. Commits are one concern per commit, and per the user's instruction the whole phase is pushed once its pipeline (`pnpm typecheck && pnpm lint && pnpm test`) is green.

Legend: `[x]` done · `[~]` in progress · `[ ]` not started

---

## Phase 0 — Foundation repair ✅ (pushed: `6f0d111`, `bd1c627`)

- [x] Repair mangled App Router dirs (`(auth)`, `(dashboard)`, `api/auth/[...nextauth]`, `api/forms/[id]`, `api/intake/[formKey]`) via fs rename
- [x] `packages/core/src/crypto.ts` — AES-256-GCM secret box (deriveEncryptionKey, encrypt/decryptSecretWithKey, encrypt/decryptJsonWithKey) + tests
- [x] `apps/web/src/lib/crypto.ts` — env wrapper (getKey, encryptSecret, decryptSecret, …) + tests
- [x] `apps/web/src/lib/integrations.ts` — decrypted integration resolver + public shape (`configured: boolean`, never plaintext secrets)
- [x] Dashboard charts/recent-runs: async `'use client'` → presentational client components; server page fetches
- [x] Executor TS fixes (createTask, sendTelegram), dashboard fetch rewrite
- [x] Seed: `sealConfig()` (encrypted integration config via `@flowbridge/core`), follow-up condition `lead.status`, demo workflows
- [x] `packages/db/tsconfig.json` — remove `rootDir` so `@flowbridge/core` imports typecheck
- [x] Commit + push Phase 0
- [x] `pnpm db:seed` re-run against the demo DB (verified idempotent: counts unchanged on the second run) with encrypted integration config

## Phase 1 — Engine loop ✅ (pushed: `0b85e53`)

- [x] `WorkflowStepSchema` → proper discriminated union (was: assign-only config for all steps) + `send_slack` union member; step-type tests (`workflow.test.ts`, 13 tests)
- [x] `packages/core/src/redact.ts` — secret masking for run-history snapshots + tests
- [x] `JobQueue.enqueueTx(tx, …)` — transactional enqueue (SPEC §2.1: no event loss)
- [x] `apps/web/src/lib/engine.ts`:
  - `createRunsForLeadEvent` — run + job created inside intake transaction, idempotent via `@@unique([workflowId, eventId])`
  - `executeRun` — step snapshots (all rows at start), skip SUCCEEDED, per-step retry/backoff, delay → WAITING + resume job
  - `processRetryJob` — retried step then resume run
  - `runTick` — reclaim expired locks → claim → process within ~25s budget
  - `drainNow` — best-effort first drain after intake (cron tick is durable fallback; `after()` unavailable on Next 14.0.4 — deviation noted)
- [x] Intake route: runs + jobs in one `$transaction`, `202`, fire-and-forget drain
- [x] Tick route: thin `runTick` wrapper (fixes broken delay/resume — resume used to enqueue a bare step)
- [x] Middleware matcher: exclude all `/api` (tick uses CRON_SECRET, intake form-scoped; middleware must not hijack them)
- [x] `{{lead.url}}` everywhere: `template-context.ts` + executors use `leadTemplate()`
- [x] `createTask` renders `title`/`description` templates (was raw `{{lead.name}}`)
- [x] `sendEmail` SMTP provider: real nodemailer transport (host/port/auth/secure/from)
- [x] `engine.test.ts` — pure backoff/time-budget unit tests
- [x] `pnpm typecheck && pnpm lint && pnpm test` green; committed + pushed Phase 1
- [x] Integration test: intake → lead → run → steps (`tests/integration/webhook-intake.integration.test.ts`: signed webhook → lead → `lead.created` run → `SUCCEEDED` with the step applied)
- [x] Failure-path verification: a permanently failing step → `FAILED` + `run_failed` activity + Owner notification (`failure-notification.integration.test.ts`); retry-from-failed-step re-enqueues through the same `JobQueue` covered by `queue.integration.test.ts`

## Phase 8a — Registration & onboarding ✅ (pushed: `34933df`)

## Phase 2 — Integrations ✅ (pushed: `3d08664`)

- [x] `apps/web/src/app/(dashboard)/settings/page.tsx` — Integrations / Members / API keys tabs (configured flag, never plaintext)
- [x] Encrypted-write path: `settings/actions.ts` `saveIntegration` encrypts via `@flowbridge/core` crypto → `configEnc`; delete scoped to workspace
- [x] `sendTestEmail` — SMTP (nodemailer) / Resend / log-only providers, decrypted via resolver
- [x] Client `integration-cards.tsx` per-type forms (email/telegram/slack/http), connect/update/disconnect/test
- [x] Telegram default chat / member `telegramChatId` support (schema column on `User` + db push + executor reads the real field)
- [x] Tests: round-trip encrypt/configured flag (`crypto.test.ts`), decrypted resolver for the engine incl. legacy plaintext + malformed-ciphertext degradation (`integrations.test.ts`)

## Phase 3 — Leads CRM ✅ (pushed: `37f6c0b`)

- [x] Leads page: table (server-side pagination/sort/filter), saved filters
- [x] Lead detail view: timeline (intake, activity, status changes), data JSON, tasks
- [x] Lead update field/status actions + activity logging (server actions: `updateLeadStatus`, `updateLeadAssignee`, `addLeadNote`)
- [x] CSV import (`POST /api/leads/import`) → reused intake pipeline (IntakeEvent + Lead + runs; per-row transactions, dedupe by email/phone, 500KB/2000-row caps), **column-mapping UI + first-10-row preview + import report** (`parseCsv`/`rowsToRecords`/`applyMapping`/`guessMapping` are pure and unit-tested)
- [x] Scoped-query audit: every dashboard/route tenant query is either `scoped()` or carries `workspaceId`; by-id mutations are always preceded by a scoped read (audited all `update`/`delete`/`findUnique` sites)
- [x] Tests: cross-tenant isolation on tenant tables (the `scoped()` suite in Phase 8 proves read/write isolation); duplicate-email idempotency on the webhook intake path (integration)

## Phase 4 — Workflows UI ✅ (pushed: `9a2a031`)

- [x] Workflows list page (enable/disable toggle, version badge, run counts, per-workflow run filter)
- [x] Workflow editor: vertical stepper (Trigger → Conditions → Actions with `+` between), live JSON preview drawer
- [x] Create/update workflow via zod-validation (`WorkflowDefinitionSchema.parse` server-side); version bump on edit (new runs only)
- [x] Step config forms per step type (assign, create_task, update_field, email, telegram, slack, http, delay)
- [x] Test button → `runWorkflowManually` (creates IntakeEvent source `manual` + run, enqueues job)
- [x] Tests: editor schema round-trip — `packages/core/src/schema/workflow.test.ts` (13 tests) validates every step type's config through `WorkflowDefinitionSchema`, which is the exact schema the editor form and the server use

## Phase 5 — Runs & Tasks ✅

- [x] Runs page: list with status, workflow, lead, duration, filters
- [x] Run detail: step timeline (PENDING/RUNNING/SUCCEEDED/FAILED), redacted input/output, error banners
- [x] Retry-from-failed-step: enqueue retry job for that step (`/runs/actions.ts`)
- [x] Tasks page: queue (due, assignee, lead), complete/dismiss, filter
- [x] Failure notification to the Owner when a run fails: durable `run_failed` activity on the lead + best-effort email/Telegram via the configured integrations (pure message builder unit-tested; engine integration test)
- [~] Tests: run-history rendering (E2E golden path asserts the run succeeded); retry-replay correctness is covered at the queue level, not yet end-to-end through the retry button

## Phase 6 — Intake breadth (in progress)

- [x] Webhook intake (`/api/webhooks/[workspaceKey]/[source]`) + HMAC verify over raw body first (`packages/core/src/hmac.ts` + tests)
- [x] Public hosted form page `/f/[formKey]` (was a broken link — FormsTable copied a nonexistent URL) + shared `PublicForm`
- [x] Embeddable form: `/embed/[formKey]` iframe page + `/embed.js` loader + "Copy Embed Code" in the forms table (SPEC §2/§3)
- [x] Middleware: `/f/` public; `/embed`, `/api/webhooks` already public
- [x] Webhook: workspace-by-slug, per-IP rate limit, 100KB cap, zod payload (passthrough), P2002 → dedupe 200
- [x] Multi-form support (each `Form` has a unique `key` → `/f/[formKey]`) and field-to-lead mapping (CSV import column mapper; unmapped columns kept in `Lead.data`). Dedupe is always on by email (global unique) then phone — no toggle (see `docs/decisions.md`).
- [x] Honeypot + per-IP/per-form rate limiting on intake (extracted to testable `lib/rate-limit.ts`, shared with the webhook route; unit-tested)
- [x] Tests: HMAC failure/success (core), webhook route integration (valid signature creates a lead; bad signature 401), embed render (E2E golden path covers `/f/`)

## Phase 7 — Time triggers ✅

- [x] `lead.no_activity_for`: tick sweep creates runs for leads older than the threshold; `eventId` keys on `lastActivityAt` so new activity re-arms the window
- [x] `schedule`: pure 5-field cron matcher (`packages/core/src/cron.ts`, UTC) + tick sweep; `eventId` is the ISO minute (exactly-once per minute)
- [x] `lead.status_changed`: `updateLeadStatus` fires matching workflows in the status-update transaction (activity id as event id); bumps `lastActivityAt`
- [x] `runTick` runs the sweep first (failure non-fatal) and reports `stats.triggered`
- [x] Follow-up escalation demo workflow: fixed invalid `create_task` config (`assigneeRole` → `role`) that made it fail `.strict()` parsing; extracted to `demo-workflows.ts` + schema-drift test
- [x] Short-delay integration test (`tests/integration/delay-resume.integration.test.ts`): a 1-minute delay parks the run `WAITING`, schedules a resume job, and finishes `SUCCEEDED` with the post-delay step applied once the (fast-forwarded) job is ticked — the 24h escalation, verified end to end
- [x] Follow-up escalation integration test (`tests/integration/escalation.integration.test.ts`): a 1-minute `lead.no_activity_for` sweep finds the idle lead, runs create_task (role ADMIN) + update_field to `SUCCEEDED`, and a second tick does not double-escalate (event-id keyed on the activity window)

## Phase 8 — Settings & hardening (in progress)

- [x] `/register` page + `/api/register` (done: API + page) — onboarding flow
- [x] `/onboarding` page + `/api/onboarding` (done: API + page)
- [x] Workspace settings: name/slug edit, webhook endpoint + secret rotation (owners/admins only)
- [x] Members: role change (owners) + availability toggle (drives round-robin/`role` assignment)
- [x] API keys page: create (hashed at rest, shown once), revoke, scope picker, last-used column
- [x] API-key authentication on a real endpoint: `authenticateApiKey` (constant-time hash compare) + `GET /api/leads` gated on `read:leads`; unit-tested
- [x] Deep-clean: `packages/db` + `apps/web` lint to **0 warnings/0 errors** (executor/queue `any` → Prisma payload types; unused imports/vars and dead `createJobContext` removed)
- [x] SSRF guard: pure `packages/core/src/ssrf.ts` (v4/v6, CGNAT, IPv4-mapped, metadata, 6to4/NAT64) + 46 tests; executor resolves every redirect hop, caps body size
- [x] `scoped()` unit tests proving cross-tenant read/write is impossible (findUnique rewritten to findFirst; upsert create scoped)

## Phase 9 — Tests / CI / Docs

- [x] ≥70% coverage in `packages/core` — **81%** statements / 87% branch; thresholds (70%) enforced in `packages/core/vitest.config.ts`, run in CI via `test:coverage`
- [x] Integration tests against a real test DB (`apps/web/tests/integration`, opt-in via `TEST_DATABASE_URL`): claim-once (`SKIP LOCKED`), future jobs, **expired-lock reclaim**, failure backoff. Verified against Postgres; CI runs them with a `postgres:16` service. **Found + fixed a real bug: `JobQueue.claim()` used unquoted `runAfter` (Postgres folded it to `runafter`), so claiming never worked against Postgres.**
- [x] Playwright E2E (`apps/web/e2e`): golden path (submit public form → lead → run `SUCCEEDED`) + agent scoping (SPEC §3)
- [x] GitHub Actions CI (`.github/workflows/ci.yml`): lint, typecheck, test, `prisma validate`, core coverage gate, and a Postgres-backed integration job
- [x] **Found + fixed a second real production bug**: the queue's raw claim query needs `pgbouncer=true` on the connection string, or a transaction pooler (Neon's `-pooler` host) rejects the reused prepared plan with `0A000 cached plan must not change result type` — the tick would silently stop processing. Recorded in `.env.example`, README, and `docs/decisions.md`.
- [x] README (mermaid architecture diagram, deployment, demo credentials, intake reference, trade-offs per AGENTS §10) + `.env.example`
- [x] `docs/decisions.md` — deviations recorded: `after()` unavailable on Next 14 (drainNow), serialized `pnpm test`, middleware matcher, `scoped()` behaviour, real SMTP, registration/onboarding flow, executor typing, run-step index
- [x] Update AGENTS.md stale claims (correct `pnpm db:generate`, executor/core split, JobQueue location, `after()` note)

---

## Cross-cutting

- [x] `pnpm typecheck && pnpm lint && pnpm test` green after **every** phase (verified before each push)
- [x] One commit per concern; push after each phase completes
- [x] Demoable golden path from the seeded workspace — covered by `apps/web/e2e/golden-path.spec.ts` (sign up → form → lead → run succeeded → agent scope); the seed was re-verified here. Running Playwright itself needs browsers installed + `pnpm dev`.
- [x] `pnpm db:seed` is safe to re-run whenever schema/seed changes (all writes upsert or guarded)