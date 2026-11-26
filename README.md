# FRIDAY AI

FRIDAY is being built as Victor's private, voice-first personal assistant and the central intelligence coordinating a modular AI-agent company environment. NEXUS is the independent security and privacy guardian.

## Current implementation stage

The repository now contains:
- Responsive public landing page and private owner workspace.
- Supabase Auth integration with a server-enforced owner email allowlist.
- Middleware protection for the private workspace and assistant API.
- Supabase database schema with row-level security for profiles, conversations, messages, memories, security audit events and isolated specialist-agent workspaces/tasks.
- AES-256-GCM application-layer encryption for stored conversation and memory content.
- OpenAI-compatible model-provider adapter, configurable through server-only environment variables.
- FRIDAY system prompt and central conversation orchestrator.
- NEXUS request gate plus an owner-controlled approval queue for sensitive delegated tasks.
- Central specialist recommendation and explicit owner-controlled task handoff.
- Owner-triggered specialist execution through dedicated per-agent model configuration, encrypted task results, task-event auditing and isolated private working memory.
- Owner-controlled specialist memory management, expiring cross-agent sharing grants, revocation, and restricted-memory exclusion.
- Owner memory sensitivity labels, optional retention expiry, provenance references and strict exclusion of restricted or expired memories from model context.
- NEXUS memory-integrity checks for owner memories: keyed HMAC-SHA256 signatures bind each ciphertext to its owner and record ID, AES-GCM remains the encryption/authentication layer, and legacy unsigned records are identified for owner review before sealing. Unsealed legacy records are excluded from model context until reviewed. Tampered or unreadable records are flagged and never auto-repaired.
- Encrypted owner-only knowledge archive and decision journal with workspace capture, server-side search, source citations, rationale, retention, status lifecycle and owner-controlled archival/deletion. Up to five active routine/internal records can be explicitly selected for one FRIDAY message; restricted, expired and archived records are excluded.
- Encrypted Project Continuity workspace for owner-managed project objectives, status, priority, specialist ownership, dated milestones and tasks, progress updates and blockers. Project records are owner-scoped and are not included in model context automatically; the owner may explicitly select up to three active projects for one message, after which the selection clears.
- FRIDAY can review completed specialist outputs, challenge assumptions and save its synthesis into the owner conversation history.
- Automated lint, TypeScript and production-build checks.

This is a pre-deployment build. No public deployment has been performed. The application still requires private infrastructure configuration before authentication, database-backed memory and model responses can run.

## Design documentation

- [Master Codex execution brief](docs/master-codex-execution.md) — one-run implementation instructions for all eight stages, with safety boundaries and verification requirements.

- [FRIDAY AI Corporation department structure](docs/organization-structure.md) — intended governance, department mandates, reporting relationships, meeting cadence and approval boundaries.
- [System architecture](docs/architecture.md) — current technical architecture.
- [Telephony design](docs/telephony.md) — telephony planning; phone calling remains paused and is not operational.
- [Department report template](docs/department-report-template.md) — standard progress, risk, dependency and decision reporting format.
- [Project management workflow](docs/project-management-workflow.md) — project lifecycle, ownership, task assignment, milestones, change control, reviews and closure.
- [Project brief template](docs/project-brief-template.md) — structured project proposal and approval request.
- [Meeting record template](docs/meeting-record-template.md) — agendas, attendance, decisions and follow-up actions.
- [Decision and risk register](docs/decision-and-risk-register.md) — traceable decisions, risk ownership and escalation rules.

## Technology

- Next.js 15.5.29 / React 19
- TypeScript
- Supabase Auth and PostgreSQL with row-level security
- AES-256-GCM for application-layer encryption of stored private content
- OpenAI-compatible model-provider interface
- GitHub Actions for quality checks

## Local development

Requirements: Node.js 20.9+ and npm.

1. Copy `.env.example` to `.env.local`.
2. Create a private Supabase project.
3. In Supabase Authentication, enable email/password sign-in and disable public sign-ups.
4. Create the owner account manually in the Supabase dashboard.
5. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `FRIDAY_OWNER_EMAIL`.
6. Run the SQL migrations in order: `0001_friday_core.sql`, `0002_nexus_rate_limits.sql`, `0003_agent_workspaces.sql`, `0004_task_approval_workflow.sql`, `0005_agent_memory_grant_guards.sql`, `0006_memory_lifecycle.sql`, `0007_knowledge_decision_archive.sql`, `0008_project_continuity.sql`, and `0009_memory_integrity.sql`.
7. Generate an application encryption key locally with `openssl rand -base64 32` and set `FRIDAY_DATA_ENCRYPTION_KEY`. Keep a secure offline backup of this key. Losing it makes encrypted stored data unrecoverable.
8. Configure `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY` only after choosing and approving a model provider. The API key is server-only and must never use a `NEXT_PUBLIC_` prefix.
9. To enable a specialist, also set its dedicated model variable (for example `AI_ORACLE_MODEL` or `AI_FORGE_MODEL`). Specialist execution deliberately has no fallback to `AI_MODEL`; each delegated agent must have its own configured model. All configured models use the shared server-side provider URL and key.

10. Install and run:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

GitHub Actions runs the same checks for commits to `main` and `foundation/**` branches.

## Security boundaries

- Never commit real keys, passwords, tokens, private keys or recovery codes.
- The owner email allowlist is enforced server-side; public registration is not part of the application.
- Database tables use row-level security so authenticated users can only access rows belonging to their own auth user ID.
- Conversation, memory, task, result, project and knowledge/decision payloads are encrypted before they are written to PostgreSQL. Keep the encryption key separate from the database and back it up securely.
- If the encryption key is missing or invalid, private storage endpoints fail closed.
- The assistant route does not execute external actions. Sensitive or potentially irreversible delegated tasks remain blocked until the owner records approval in the task workflow.
- A model provider must be configured before FRIDAY can generate responses.
- Specialist tasks run only after an explicit owner action. Sensitive tasks additionally require recorded owner approval. Specialist models receive their own working memories plus only the non-restricted memories the owner explicitly shares with them. Sharing grants expire and can be revoked; restricted memories are never shared.
- Specialist workers return text results only. They cannot call tools, send communications, publish, make purchases or control devices.
- Voice, telephony, device control, emergency protocols and the virtual headquarters are not yet operational.
- No paid service is activated automatically.

## Pre-deployment checklist

- [ ] Create and configure the private Supabase project.
- [ ] Verify the owner account and sign-in flow against the live Supabase project.
- [ ] Run the SQL migration and verify row-level security with negative cross-user tests.
- [ ] Securely store and back up the encryption key; test encryption/decryption and recovery.
- [ ] Select and approve the AI provider and its cost/retention terms.
- [ ] Add request rate limiting, audit review and security tests.
- [ ] Complete browser, mobile and accessibility testing, including device-specific voice support.
- [ ] Complete independent security review.
- [ ] Configure deployment secrets only after owner approval.

Deployment is intentionally not performed as part of this stage.
