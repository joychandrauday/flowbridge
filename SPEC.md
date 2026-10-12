# 01 · FlowBridge — Lead-to-Action Workflow Automation

> A lightweight automation platform that turns "a lead arrived" into "saved → assigned → notified → follow-up scheduled" without anyone touching a spreadsheet.

---

## 1. Why this product exists (value)

Small businesses lose leads because the process is manual: someone copies a form submission into a sheet, forgets to tell the salesperson, and nobody follows up. Zapier/Make solve this but are expensive per task and generic. FlowBridge is a **focused, self-hostable lead-handling automation tool** with a built-in mini-CRM, so the whole loop lives in one place.

**Portfolio message:** "I can replace a business's manual lead handling with a reliable, observable automation pipeline."

**Real-life users**
- Agencies, real-estate brokers, coaching centers, clinics, education consultancies, local service businesses.
- Freelancer use: deploy it for a client in a day, customize workflows.

## 2. Scope

### MVP (must ship)
1. Auth, workspaces, team members (roles: Owner, Admin, Agent).
2. **Lead intake**: public form endpoint (+ embeddable HTML snippet), generic webhook endpoint, CSV import.
3. **Leads (mini-CRM)**: list, filters, detail page, status pipeline (New → Contacted → Qualified → Won/Lost), notes, activity timeline.
4. **Workflow builder (form-based, not drag-drop canvas)**: Trigger → optional conditions → ordered actions.
5. **Actions**: assign owner (round-robin / by rule), send email, send Telegram/Slack/Discord notification, create task with due date, wait (delay), update lead field, HTTP request (outgoing webhook).
6. **Follow-up automation**: "If lead still `New` after 24h → notify + create task + escalate to Admin".
7. **Tasks** page: my tasks, due/overdue, complete.
8. **Run history**: every workflow run with per-step status, logs, retry button.
9. **Dashboard**: leads by source, avg first-response time, workflow success rate, overdue tasks.
10. Seed data + demo workspace.

### Stretch
- Google Sheets append action, WhatsApp link action, duplicate-lead detection, lead scoring rules, SLA breach alerts, workflow templates gallery, audit log export, i18n (English/Bangla).

### Non-goals
- Drag-and-drop canvas builder, 100s of integrations, billing, marketing email campaigns.

## 3. Personas & user stories

| Persona | Story | Acceptance criteria |
|---|---|---|
| Owner (Rafi, agency owner) | I want every new lead assigned and acted on within a minute | Submitting a form results in a lead, an assignee, a notification, and a task within 60s; visible in run history |
| Agent (Nila) | I want to see only my leads and tasks | Agent role sees assigned leads only; tasks list sorted by due date |
| Admin | I want to change assignment rules without code | Edit workflow in UI; new version applies to new runs; old runs keep their version |
| Owner | I want to know if automation silently fails | Failed run shows red badge, error message, retry button; dashboard shows failure rate; failure email to Owner |

## 4. Functional requirements

### 4.1 Intake
- `POST /api/intake/:formKey` — accepts JSON or form-encoded. Validates against form field config (Zod generated from config). Honeypot field + rate limit (per IP, per form).
- `POST /api/webhooks/:workspaceKey/:sourceKey` — generic JSON; header `X-FlowBridge-Signature` (HMAC) optional but supported.
- Embeddable snippet: `<script src=".../embed.js" data-form="KEY">` renders a styled form in an iframe. Stretch: pure HTML copy-paste.
- CSV import: column mapping UI, preview first 10 rows, dedupe by email/phone, import report.
- Every intake creates an immutable `IntakeEvent` (raw payload) → creates/updates `Lead` → emits `lead.created` event.

### 4.2 Workflow engine
- Workflow = `{ trigger, conditions[], steps[] }`, stored as JSON with a Zod schema, versioned.
- Triggers: `lead.created`, `lead.status_changed`, `lead.no_activity_for(duration)`, `schedule(cron)`, `manual`.
- Conditions: field/operator/value with AND/OR groups (equals, contains, in, gt/lt, is empty).
- Steps execute sequentially; each step has: `id`, `type`, `config`, `retry` policy (default 3 attempts, exponential backoff), `onFailure` (stop | continue).
- Template variables: `{{lead.name}}`, `{{lead.email}}`, `{{assignee.name}}`, `{{workspace.name}}` with preview/test.
- Idempotency: `(workflowId, eventId)` unique so the same event never runs twice.
- Delay step: schedules continuation job (`runAfter`), survives restarts.
- Engine implemented on a **Postgres-backed job queue** (`jobs` table + `/api/internal/tick` endpoint) — no Redis, no always-on worker, no VPS. Keep it behind a `JobQueue` interface so Inngest or pg-boss can replace it later.

### 4.3 Assignment
- Strategies: round-robin (persisted pointer), least-open-leads, rule-based (e.g., `source = "facebook"` → Nila), fixed user.
- Respect agent "availability" toggle.

### 4.4 Notifications
- Email via Resend (or SMTP/Brevo fallback), Telegram Bot API, Slack incoming webhook, Discord webhook.
- Integration credentials encrypted at rest (AES-256-GCM, key from env).

### 4.5 Observability
- `WorkflowRun` + `RunStep` rows with input/output snapshots (secrets redacted), duration, attempts, error.
- Run list with filters (status, workflow, date). One-click "retry from failed step".
- Dashboard widgets computed with SQL aggregates.

## 5. Non-functional requirements
- p95 intake response < 300 ms (enqueue and return).
- No lost events: intake persists before responding 202.
- All outbound calls have timeouts (10s) and are retried safely.
- WCAG AA contrast, keyboard navigable, mobile-friendly.
- Secrets never logged. Rate limiting on public endpoints.

## 6. Architecture

```
Browser / Embed form / External webhook
            │
   Next.js on Vercel (Route Handlers, Server Actions)
            │  one transaction: write IntakeEvent + Lead + enqueue `jobs` rows
            ▼
   Neon Postgres (Prisma)   ← jobs(type, payload, runAfter, attempts, lockedUntil, status)
            ▲
            │  every minute: GET /api/internal/tick   (Authorization: Bearer CRON_SECRET)
   cron-job.org (free)   [backup: GitHub Actions schedule]
            │
   Tick handler: claim due jobs with FOR UPDATE SKIP LOCKED, run workflow steps inside a
   ~25s time budget, schedule retries/delays by setting runAfter, reclaim expired locks
```
After intake, also drain the queue immediately with Next.js `after()` so the first steps run in seconds, not minutes. Delay steps and retries have ~1-minute granularity because the tick runs each minute — fine for lead handling; state it in the README. If you later get a VPS, swap the `queue/` module for pg-boss behind the same interface.

### Repo layout (single Next.js app + worker package)
```
flowbridge/
  apps/web/            # Next.js
  # (no worker app: jobs are processed by /api/internal/tick, see §6)
  packages/db/         # prisma schema, client, seed
  packages/core/       # workflow schema (zod), engine, step executors, templates
  packages/ui/         # shared shadcn components (optional)
  AGENTS.md
  docs/
```
(pnpm workspaces. If monorepo feels heavy, use one repo with `/src/worker` and run via `tsx`.)

## 7. Tech stack (all free tier — verify current limits before relying on them)
| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js (latest stable) + TypeScript | App Router |
| UI | Tailwind CSS + shadcn/ui + lucide icons | Radix primitives |
| Charts | Recharts | |
| DB | Neon Postgres (free) + Prisma | Use pooled URL for web, direct URL for migrations/worker |
| Auth | Better Auth (or Auth.js) | Email+password + Google OAuth |
| Jobs/scheduler | Postgres `jobs` table + tick endpoint | Triggered every minute by cron-job.org (free) or GitHub Actions; Inngest free tier is an optional upgrade |
| Email | Resend free (daily cap) | Use Mailpit locally |
| Notifications | Telegram Bot API, Slack/Discord webhooks | Free |
| Hosting | Vercel Hobby (web + tick) + Neon | Hobby is non-commercial: for real client deployments use the client's own hosting or a paid plan |
| Validation | Zod | Shared client/server |
| Forms | react-hook-form | |
| Tests | Vitest, Playwright | |
| CI | GitHub Actions | lint, typecheck, test, prisma validate |
| Errors | Sentry free (optional) | |

## 8. Data model (Prisma, abbreviated)

```prisma
enum Role { OWNER ADMIN AGENT }
enum LeadStatus { NEW CONTACTED QUALIFIED WON LOST }
enum RunStatus { QUEUED RUNNING WAITING SUCCEEDED FAILED CANCELED }
enum StepStatus { PENDING RUNNING SUCCEEDED FAILED SKIPPED }
enum TaskStatus { OPEN DONE }

model Workspace {
  id String @id @default(cuid())
  name String
  slug String @unique
  createdAt DateTime @default(now())
  members Member[]; forms Form[]; leads Lead[]; workflows Workflow[]
  integrations Integration[]; tasks Task[]
}
model User { id String @id @default(cuid()); email String @unique; name String; image String?; members Member[] }
model Member {
  id String @id @default(cuid())
  workspaceId String; userId String
  role Role @default(AGENT)
  available Boolean @default(true)
  workspace Workspace @relation(fields: [workspaceId], references: [id])
  user User @relation(fields: [userId], references: [id])
  @@unique([workspaceId, userId])
}
model Form {
  id String @id @default(cuid()); workspaceId String
  key String @unique; name String
  fields Json            // [{name,label,type,required}]
  successMessage String?; redirectUrl String?; active Boolean @default(true)
  workspace Workspace @relation(fields: [workspaceId], references: [id])
}
model IntakeEvent {
  id String @id @default(cuid()); workspaceId String
  source String; payload Json; ip String?; receivedAt DateTime @default(now())
  leadId String?
  @@index([workspaceId, receivedAt])
}
model Lead {
  id String @id @default(cuid()); workspaceId String
  name String; email String?; phone String?; source String
  status LeadStatus @default(NEW)
  assigneeId String?; data Json?     // extra custom fields
  firstContactedAt DateTime?; lastActivityAt DateTime @default(now())
  createdAt DateTime @default(now())
  activities Activity[]; tasks Task[]
  @@index([workspaceId, status]); @@index([workspaceId, assigneeId])
}
model Activity { id String @id @default(cuid()); leadId String; type String; body String?; meta Json?; actorId String?; createdAt DateTime @default(now()); lead Lead @relation(fields: [leadId], references: [id]) }
model Task { id String @id @default(cuid()); workspaceId String; leadId String?; title String; dueAt DateTime?; status TaskStatus @default(OPEN); assigneeId String?; createdByRunId String?; createdAt DateTime @default(now()); lead Lead? @relation(fields: [leadId], references: [id]) }
model Workflow {
  id String @id @default(cuid()); workspaceId String
  name String; enabled Boolean @default(true)
  version Int @default(1); definition Json     // zod-validated
  updatedAt DateTime @updatedAt
  runs WorkflowRun[]
}
model WorkflowRun {
  id String @id @default(cuid()); workflowId String; workflowVersion Int
  eventId String; leadId String?
  status RunStatus @default(QUEUED)
  startedAt DateTime?; finishedAt DateTime?; error String?
  steps RunStep[]
  workflow Workflow @relation(fields: [workflowId], references: [id])
  @@unique([workflowId, eventId])
}
model RunStep {
  id String @id @default(cuid()); runId String; stepKey String; type String
  status StepStatus @default(PENDING); attempts Int @default(0)
  input Json?; output Json?; error String?; startedAt DateTime?; finishedAt DateTime?
  run WorkflowRun @relation(fields: [runId], references: [id])
}
model Integration { id String @id @default(cuid()); workspaceId String; type String; name String; configEnc String; createdAt DateTime @default(now()) }
```

## 9. API / route surface
| Route | Purpose |
|---|---|
| `POST /api/intake/:formKey` | Public form submission |
| `POST /api/webhooks/:workspaceKey/:source` | Generic webhook intake |
| `GET/POST /api/leads`, `GET/PATCH /api/leads/:id` | CRUD (server actions acceptable internally) |
| `POST /api/leads/import` | CSV import |
| `GET/POST/PATCH /api/workflows` | Workflow CRUD + enable/disable |
| `POST /api/workflows/:id/test` | Dry-run with sample lead |
| `GET /api/runs`, `POST /api/runs/:id/retry` | Run history & retry |
| `GET /api/dashboard/summary` | KPI aggregates |

## 10. UX & design

**Visual direction:** calm, "operations cockpit" — neutral zinc background, one vivid accent (indigo or emerald), generous spacing, subtle borders, soft shadows, dark mode first-class. Inter or Geist font.

Screens:
1. **Dashboard** — 4 KPI cards, leads-by-source donut, response-time line, live "recent runs" feed.
2. **Leads** — table with saved filters, status chips, quick-assign, bulk actions; kanban toggle (stretch).
3. **Lead detail** — header with status stepper, timeline (activities + workflow runs interleaved), side panel with fields/tasks.
4. **Workflows** — list with enabled toggle, last run status; editor as a vertical stepper: Trigger card → Conditions card → Action cards with "+" between; live JSON preview drawer; Test button.
5. **Runs** — table + detail drawer showing step timeline with durations, inputs/outputs (redacted), retry.
6. **Forms** — builder (add fields), copy embed snippet, live preview.
7. **Settings** — team, integrations (connect Telegram/Slack/Resend with "Send test"), API keys.
8. Empty states with templates ("Start with: Instant lead assignment").

Micro-interactions: optimistic updates, skeleton loaders, toast confirmations, command palette (⌘K).

## 11. Security checklist
- Zod validation on every public endpoint; honeypot + rate limit; max payload size.
- Row-level scoping: every query includes `workspaceId` from session (write a `scoped(prisma, workspaceId)` helper and test it).
- Encrypt integration secrets; never return them to client.
- CSRF safe (SameSite cookies, server actions), secure headers, HMAC verification for webhooks.
- Template rendering uses an allowlist of variables (no `eval`).
- SSRF guard on HTTP-request action (block private IP ranges, localhost).

## 12. Testing strategy
- **Unit:** condition evaluator, template renderer, round-robin, workflow schema validation, SSRF guard.
- **Integration:** intake → lead → run → steps (use a test DB and call the tick handler directly).
- **E2E (Playwright):** sign up → create form → submit → see lead → see run succeeded.
- **Failure tests:** Resend returns 500 → retries → marked failed → retry button works. Tick interrupted mid-run → job reclaimed after lock expiry.

## 13. Development plan (4 weeks @ ~15–20 h/week)

### Week 1 — Foundation & intake
- [ ] Repo, pnpm workspace, lint/format, CI, Neon DB, Prisma schema + migrations, seed script.
- [ ] Auth, workspace creation, member roles, scoped Prisma helper.
- [ ] Design system setup (tokens, shadcn components, layout shell, dark mode).
- [ ] Forms CRUD + public intake endpoint + IntakeEvent + Lead creation.
- [ ] Leads list + detail (basic) + activity timeline.
**Exit:** submit a form on a public URL and see the lead in the dashboard.

### Week 2 — Engine
- [ ] Workflow Zod schema + editor UI (trigger, conditions, steps).
- [ ] `jobs` table + `JobQueue` interface + tick endpoint (SKIP LOCKED claim, lock expiry), `lead.created` event → run creation.
- [ ] Step executors: assign, create_task, update_field, send_email, send_telegram/slack.
- [ ] Run + RunStep persistence, retry/backoff, run history UI.
**Exit:** new lead → assigned → Telegram message + task created, visible in runs.

### Week 3 — Time-based & hardening
- [ ] Delay step + no-activity trigger + schedule trigger.
- [ ] HTTP request action with SSRF guard; generic webhook intake with HMAC.
- [ ] CSV import with mapping.
- [ ] Tasks page, dashboard aggregates, failure notification to Owner.
- [ ] Rate limiting, encryption of integration secrets.
**Exit:** 24h follow-up escalation works (test with 1-minute delay).

### Week 4 — Polish, tests, ship
- [ ] Playwright E2E + failure tests, fix flakiness.
- [ ] Templates gallery (3 templates), empty states, ⌘K palette.
- [ ] Deploy to Vercel + Neon, configure cron-job.org to hit the tick endpoint, env docs, health endpoint.
- [ ] README with architecture diagram, GIF demo, seed demo workspace, loom/video script.
- [ ] Case-study write-up (see §16).

## 14. opencode agent playbook

**`AGENTS.md` (put in repo root)**
```md
# FlowBridge agent rules
- Stack: Next.js App Router + TS strict, Tailwind + shadcn/ui, Prisma + Postgres, Postgres-backed job queue (no long-running worker; Vercel + tick endpoint), Zod, Vitest, Playwright.
- Every DB query on tenant data MUST go through scoped helpers with workspaceId. Never trust client-sent workspaceId.
- Validate all external input with Zod. Never use eval/Function. No secrets in logs.
- Small PR-sized tasks. After each task: `pnpm typecheck && pnpm lint && pnpm test`. Fix before moving on.
- Write/extend tests with every feature. Prefer pure functions in packages/core.
- Commit per task with conventional commits. Do not refactor unrelated code.
- UI: follow docs/design.md tokens; support dark mode, loading/empty/error states, keyboard access.
- If a requirement is ambiguous, write the assumption in docs/decisions.md and continue.
```

**Prompt sequence (run one at a time, in plan mode first, review diff, then build)**
1. "Read docs/spec (this file). Scaffold the pnpm monorepo, Next.js app, packages/db with the Prisma schema from §8, CI workflow. No features yet."
2. "Implement auth + workspace + roles + `scoped()` Prisma helper with tests proving cross-tenant access is impossible."
3. "Build the app shell and design system per §10: sidebar, topbar, dark mode, KPI card, data table, empty state, toast."
4. "Implement Forms CRUD and the public intake endpoint with Zod-generated validation, honeypot, rate limit, IntakeEvent+Lead creation, and tests."
5. "Implement the workflow definition Zod schema, condition evaluator, template renderer — pure functions in packages/core with exhaustive unit tests."
6. "Implement the Postgres-backed job queue (jobs table, SKIP LOCKED claim, retry/backoff, runAfter, lock expiry) and the CRON_SECRET-protected `/api/internal/tick` endpoint with a time budget; consume `lead.created`, create WorkflowRun/RunStep, execute steps with retry/backoff and idempotency."
7. "Implement step executors (assign, task, update field, email, telegram, slack, http) behind a common `StepExecutor` interface; mock providers in tests."
8. "Build the workflow editor UI (stepper style) and run history UI with step timeline and retry."
9. "Implement delay/no-activity/schedule triggers and verify with an integration test using short delays."
10. "Build dashboard aggregates + charts; CSV import; failure notification."
11. "Write Playwright E2E for the golden path and one failure path; fix issues."
12. "Write README, architecture diagram (mermaid), deployment docs, seed demo data."

## 15. Definition of done
- [ ] Golden path demoable in < 2 minutes with seeded workspace.
- [ ] No cross-tenant data leak (tested). Secrets encrypted.
- [ ] CI green; ≥ 70% coverage in `packages/core`.
- [ ] Deployed URL + demo credentials + README + video.
- [ ] Lighthouse ≥ 90 performance/accessibility on main pages.

## 16. Portfolio & freelance packaging
- **Case study:** "Cutting lead response time from hours to seconds" — before/after flow diagram, architecture, failure handling decisions (idempotency, retries, delay persistence).
- **Demo script (90s):** submit form → watch lead appear → Telegram ping → open run timeline → break the email integration → show failure + retry.
- **Offer:** "Lead automation setup — fixed price, 1 week" using this as the base, customizing workflows and integrations.

## 17. Risks
| Risk | Mitigation |
|---|---|
| Free-tier email limits | Resend daily cap; add SMTP fallback; log-only mode for demos |
| No long-running worker on free hosting | Tick endpoint + DB jobs; ~1-min granularity (documented); Inngest as upgrade |
| Scope creep into a full CRM | Hold the MVP list; stretch only after Week 4 |
| Delay jobs lost on deploy | Jobs persist in Postgres; test interrupted tick |
