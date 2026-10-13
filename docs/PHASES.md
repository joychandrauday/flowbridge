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
- [ ] `pnpm db:seed` to refresh demo data with encrypted config

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
- [ ] Integration test: intake → lead → run → steps (needs test DB; Phase 9)
- [ ] Failure-path verification: mail 500 → backoff retry → FAILED → retry button (Phase 9)

## Phase 8a — Registration & onboarding ✅ (pushed: `34933df`)

## Phase 2 — Integrations ✅ (pushed: `3d08664`)

- [x] `apps/web/src/app/(dashboard)/settings/page.tsx` — Integrations / Members / API keys tabs (configured flag, never plaintext)
- [x] Encrypted-write path: `settings/actions.ts` `saveIntegration` encrypts via `@flowbridge/core` crypto → `configEnc`; delete scoped to workspace
- [x] `sendTestEmail` — SMTP (nodemailer) / Resend / log-only providers, decrypted via resolver
- [x] Client `integration-cards.tsx` per-type forms (email/telegram/slack/http), connect/update/disconnect/test
- [ ] Telegram default chat / member `telegramChatId` support (schema + db push + executor fallbacks)
- [ ] Tests: round-trip encrypt/configured flag, decrypted resolver for engine

## Phase 3 — Leads CRM ✅ (pushed: `37f6c0b`)

- [x] Leads page: table (server-side pagination/sort/filter), saved filters
- [x] Lead detail view: timeline (intake, activity, status changes), data JSON, tasks
- [x] Lead update field/status actions + activity logging (server actions: `updateLeadStatus`, `updateLeadAssignee`, `addLeadNote`)
- [x] CSV import (`POST /api/leads/import`) → reused intake pipeline (IntakeEvent + Lead + runs; per-row transactions, email dedupe, 500KB/2000-row caps) + `/leads/import` UI + pure `parseCsv` tests (8)
- [ ] Scoped-query audit: every tenant query via `scoped()` (note: `findUnique` injection needs a fix)
- [ ] Tests: cross-tenant isolation on leads, import idempotency

## Phase 4 — Workflows UI ✅ (pushed: `9a2a031`)

- [x] Workflows list page (enable/disable toggle, version badge, run counts, per-workflow run filter)
- [x] Workflow editor: vertical stepper (Trigger → Conditions → Actions with `+` between), live JSON preview drawer
- [x] Create/update workflow via zod-validation (`WorkflowDefinitionSchema.parse` server-side); version bump on edit (new runs only)
- [x] Step config forms per step type (assign, create_task, update_field, email, telegram, slack, http, delay)
- [x] Test button → `runWorkflowManually` (creates IntakeEvent source `manual` + run, enqueues job)
- [ ] Tests: editor schema round-trip

## Phase 5 — Runs & Tasks ✅ (core; failure-notification pending)

- [x] Runs page: list with status, workflow, lead, duration, filters
- [x] Run detail: step timeline (PENDING/RUNNING/SUCCEEDED/FAILED), redacted input/output, error banners
- [x] Retry-from-failed-step: enqueue retry job for that step (`/runs/actions.ts`)
- [x] Tasks page: queue (due, assignee, lead), complete/dismiss, filter
- [ ] Failure-notification to Owner when a run fails
- [ ] Tests: run history rendering, retry replay correctness

## Phase 6 — Intake breadth (in progress)

- [x] Webhook intake (`/api/webhooks/[workspaceKey]/[source]`) + HMAC verify over raw body first (`packages/core/src/hmac.ts` + tests)
- [x] Public hosted form page `/f/[formKey]` (was a broken link — FormsTable copied a nonexistent URL) + shared `PublicForm`
- [x] Embeddable form: `/embed/[formKey]` iframe page + `/embed.js` loader + "Copy Embed Code" in the forms table (SPEC §2/§3)
- [x] Middleware: `/f/` public; `/embed`, `/api/webhooks` already public
- [x] Webhook: workspace-by-slug, per-IP rate limit, 100KB cap, zod payload (passthrough), P2002 → dedupe 200
- [ ] Multi-form support / field-to-lead mapping, dedupe by email setting
- [ ] Honeypot + per-IP/per-form rate limiting on intake (verify present + test)
- [ ] Tests: HMAC failure/success (done), webhook route integration, embed render

## Phase 7 — Time triggers

- [ ] Delay / no-activity / schedule triggers in engine:
  - `lead.no_activity`: condition on last activity > threshold, via tick sweep
  - `schedule`: cron-expression trigger, runs created by tick sweep
- [ ] Short-delay integration test (1-minute delay standing in for 24h) — SPEC §8 follow-up escalation
- [ ] Follow-up escalation demo workflow verified end-to-end

## Phase 8 — Settings & hardening

- [x] `/register` page + `/api/register` (done: API + page) — onboarding flow
- [x] `/onboarding` page + `/api/onboarding` (done: API + page)
- [ ] Workspace settings: members, roles, availability, workspace slug/name
- [ ] API keys page (create/revoke, last used)
- [ ] Deep-clean: remove unused imports/lint warnings, `no-explicit-any` audit in app code
- [ ] SSRF guard: cap response size, re-check after redirect (partial exists — verify)
- [ ] `scoped()` unit test proving cross-tenant access impossible (exists — extend for findUnique fix)

## Phase 9 — Tests / CI / Docs

- [ ] ≥70% coverage in `packages/core` (current suites: crypt, evaluator, workflow schema, redact, engine backoff)
- [ ] Integration tests against real test DB (intake → run → steps; tick called directly)
- [ ] Playwright E2E: sign up → create form → submit public URL → lead → run succeeded → agent sees only assigned leads
- [ ] GitHub Actions CI: lint, typecheck, test, `prisma validate`
- [ ] README (mermaid architecture diagram, deployment, demo credentials, trade-offs per AGENTS §10)
- [ ] `docs/decisions.md` — record deviations: `after()` unavailable on Next 14 (drainNow instead), serialized `pnpm test`, middleware matcher, `scoped()` findUnique caveat, real SMTP, registration/onboarding flow
- [ ] Update AGENTS.md stale claims (correct `pnpm db:generate`, executor location, JobQueue class, `lockedBy`/`lockedAt`)

---

## Cross-cutting

- [ ] `pnpm typecheck && pnpm lint && pnpm test` green after **every** phase
- [ ] One commit per concern; push after each phase completes
- [ ] Demoable golden path in under 2 minutes from seeded workspace (cutoff: before Phase 1 push)
- [ ] `pnpm db:seed` re-run whenever schema/seed changes