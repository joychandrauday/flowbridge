# FlowBridge — Agent Rules

Lead-to-action workflow automation. A lead arrives (form, webhook, CSV) → assigned → notified → follow-up scheduled, with a mini-CRM and a run history. Self-hosted, free-tier, no long-running worker.

**Before any task, read `SPEC.md` in this folder.** It is the contract: scope, personas, data model (§8), routes (§9), UX (§10), and the 4-week plan (§13). When code and `SPEC.md` disagree, `SPEC.md` wins — fix the code, or update the spec deliberately.

---

## 1. Stack (non-negotiable)

| Concern | Choice |
|---|---|
| Framework | Next.js App Router + TypeScript `strict` |
| UI | Tailwind CSS + shadcn/ui + lucide-react |
| Charts | Recharts |
| DB | Neon Postgres + Prisma |
| Jobs | Postgres `jobs` table + `/api/internal/tick` (cron-job.org every minute) |
| Validation | Zod (shared client/server) |
| Forms | react-hook-form |
| Tests | Vitest, Playwright |
| CI | GitHub Actions: lint, typecheck, test, `prisma validate` |

**No Redis. No always-on worker. No VPS.** The only job consumer is the tick route handler, triggered by an external cron with `Authorization: Bearer CRON_SECRET`. Queue work happens inside Next.js `after()` for the immediate first drain.

Repo layout:

```
flowbridge/
  apps/web/            # Next.js app, route handlers, server actions
  packages/db/         # prisma schema, client, seed
  packages/core/       # workflow zod schema, engine, step executors, templates  ← pure, no IO
  packages/ui/         # shared shadcn components (optional)
  docs/
```

pnpm workspaces. If the monorepo feels heavy, collapse to one repo with `src/worker` run via `tsx` — do not change the module boundaries.

---

## 2. Architecture invariants

These are the things that break silently if violated. Treat them as non-negotiable.

1. **No event loss.** Intake persists `IntakeEvent` + `Lead` + `jobs` rows in **one transaction**, then returns `202`. Never respond before the write commits. Never do outbound HTTP inline during intake.
2. **The queue lives in Postgres.** All queue access goes through the `JobQueue` interface (`enqueue`, `claim`, `complete`, `fail`, `reschedule`) in `packages/core` or `apps/web/queue`. The Postgres implementation is swappable for pg-boss/Inngest later — never leak `jobs`-table queries outside that module.
3. **Claim jobs with `FOR UPDATE SKIP LOCKED`**, respect `lockedUntil` for crash recovery, and reclaim expired locks on every tick. Run inside a **~25 second time budget**; anything not finished is re-queued by setting `runAfter`.
4. **~1-minute granularity is expected** for delay steps and retries (tick runs every minute). This is documented behavior, not a bug. Do not "fix" it by adding infrastructure.
5. **Idempotency:** `@@unique([workflowId, eventId])` on `WorkflowRun`. The same domain event must never produce two runs.
6. **Workflows are versioned.** `Workflow.version` + `WorkflowRun.workflowVersion`. Editing a workflow applies to **new runs only**; historical runs keep the version they executed.
7. **Steps are pure-ish functions** behind a `StepExecutor` interface: `(run, step, ctx) => Promise<StepResult>`. Executors must not reach into Next.js request context — pass everything needed through `ctx`.
8. **Template variables use an allowlist** (`{{lead.name}}`, `{{lead.email}}`, `{{assignee.name}}`, `{{workspace.name}}`, …). No `eval`, no `new Function`, no arbitrary property walking.

---

## 3. Security rules

- **Every DB query on tenant data goes through the scoped helper** (`scoped(prisma, workspaceId)`). Never trust a `workspaceId` that arrived from the client. This helper needs its own unit test proving cross-tenant access is impossible — write it when you build the helper, not later.
- **Zod-validate every public endpoint** (`/api/intake/:formKey`, `/api/webhooks/:workspaceKey/:source`). Generate the schema from the `Form.fields` config so the API and the builder cannot drift.
- **Honeypot field + per-IP and per-form rate limiting** on all public intake routes. Cap payload size.
- **Encrypt integration secrets** with AES-256-GCM, key from env. Never return decrypted config to the client — expose a `configured: boolean` flag instead.
- **Redact secrets in run history.** Step input/output snapshots are visible to agents; mask `configEnc`, API keys, and any `Authorization` value before persisting.
- **SSRF guard on the HTTP-request action**: resolve DNS, block loopback / link-local / private ranges / cloud metadata IPs, re-check after redirect, cap response size.
- **Webhook intake:** verify `X-FlowBridge-Signature` HMAC over the **raw request body** with a constant-time compare. Never parse before verifying.
- Secrets never appear in logs, error reports, or toasts.

---

## 4. Testing rules

Write or extend tests with every feature. No exceptions.

- **Unit (pure, in `packages/core`):** condition evaluator, template renderer, round-robin pointer, workflow Zod schema, SSRF guard. Target **≥70% coverage in `packages/core`** — this is a definition-of-done item, not a nice-to-have.
- **Integration:** intake → lead → run → steps, against a real test DB, calling the tick handler directly (no cron needed).
- **Failure tests (required):** email provider returns 500 → retries with backoff → marked `FAILED` → retry button replays from the failed step. Tick interrupted mid-run → job reclaimed after `lockedUntil` expires.
- **E2E (Playwright):** sign up → create form → submit on public URL → lead appears → run succeeded → agent sees only assigned leads.

---

## 5. UI conventions

- Follow the tokens in `docs/design.md`: neutral zinc base, **one** vivid accent (indigo or emerald — pick one and stick to it), generous spacing, subtle borders, soft shadows.
- Dark mode is first-class, not an afterthought.
- **Every** screen has loading, empty, and error states. Empty states ship a template ("Start with: Instant lead assignment").
- Tables: server-side pagination, sorting, and filtering. Saved filters on the Leads page.
- Accessibility: WCAG AA contrast, keyboard navigable, visible focus rings.
- Micro-interactions: optimistic updates where safe, skeleton loaders, toast confirmations for destructive actions.
- Workflow editor is a **vertical stepper** (Trigger card → Conditions card → Action cards with `+` between) with a live JSON preview drawer and a Test button. No drag-and-drop canvas.

---

## 6. Commands

```bash
pnpm typecheck && pnpm lint && pnpm test     # required after every task
pnpm prisma:generate && pnpm db:migrate && pnpm db:seed
pnpm test:e2e                                # Playwright, golden path
```

Fix all three before moving on. Do not start the next task with a red pipeline.

---

## 7. How to work

- **Small, PR-sized tasks.** One concern per commit, conventional commits (`feat(engine): add delay step with runAfter`).
- **Do not refactor unrelated code.** If you spot an issue elsewhere, note it in `docs/decisions.md` and keep moving.
- **Plan first, then build.** Show the diff shape before writing implementation code for anything touching the schema, the queue, or the engine.
- **If a requirement is ambiguous**, write the assumption in `docs/decisions.md` and continue. Do not stall.
- **Every new step type needs:** a Zod config schema, an executor, a unit test, and an entry in the run-history UI.
- **Scope discipline.** The MVP list in `SPEC.md` §2 is the contract. Stretch items (§2) only after Week 4. Non-goals (drag-drop canvas, 100s of integrations, billing, marketing email) are **not** in scope — do not start them.

---

## 8. Definition of done

- [ ] Golden path demoable in **under 2 minutes** from the seeded workspace.
- [ ] No cross-tenant data leak, proven by test. Integration secrets encrypted.
- [ ] CI green; **≥70% coverage in `packages/core`**.
- [ ] Follow-up escalation works end to end (verified with a 1-minute delay standing in for 24h).
- [ ] Deployed URL + demo credentials + README with mermaid architecture diagram + demo video.
- [ ] Lighthouse ≥90 performance/accessibility on main pages.

---

## 9. Prompt sequence (build in this order)

1. Scaffold pnpm monorepo, Next.js app, `packages/db` with the §8 schema, CI. No features.
2. Auth + workspace + roles + `scoped()` helper, with cross-tenant tests.
3. App shell + design system per §10 (sidebar, topbar, dark mode, KPI card, data table, empty state, toast).
4. Forms CRUD + public intake endpoint (Zod-generated validation, honeypot, rate limit, `IntakeEvent` + `Lead`), with tests.
5. Workflow definition Zod schema, condition evaluator, template renderer — pure functions in `packages/core`, exhaustive unit tests.
6. Postgres job queue + `/api/internal/tick` (SKIP LOCKED, lock expiry, time budget) + `lead.created` → run creation.
7. Step executors (assign, task, update field, email, telegram, slack, http) behind `StepExecutor`; mock providers in tests.
8. Workflow editor UI (stepper) + run history UI (step timeline, retry from failed step).
9. Delay / no-activity / schedule triggers, verified by integration test with short delays.
10. Dashboard aggregates + charts, CSV import, failure notification to Owner.
11. Playwright E2E for the golden path and one failure path; fix flakiness.
12. README, mermaid architecture diagram, deployment docs, seed demo workspace.

---

## 10. Known trade-offs (state these honestly in the README)

- Delay steps and retries have **~1 minute granularity** because the tick runs every minute. Fine for lead handling; document it.
- Vercel Hobby is **non-commercial**. Real client deployments must use the client's own hosting or a paid plan.
- Resend's free tier has a daily cap — provide an SMTP fallback and a log-only mode for demos.
- Never silently swallow a failed automation. Silence is the failure mode this product exists to eliminate.