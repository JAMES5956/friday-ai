# FRIDAY AI

FRIDAY is being built as Victor's private, voice-first personal assistant and the central intelligence coordinating a modular AI-agent company environment. NEXUS is the independent security and privacy guardian.

## Current implementation stage

The repository now contains:
- Responsive public landing page and private owner workspace.
- Supabase Auth integration with a server-enforced owner email allowlist.
- Middleware protection for the private workspace and assistant API.
- Supabase database schema with row-level security for profiles, conversations, messages, memories and security audit events.
- AES-256-GCM application-layer encryption for stored conversation and memory content.
- OpenAI-compatible model-provider adapter, configurable through server-only environment variables.
- FRIDAY system prompt and central conversation orchestrator.
- Initial NEXUS request gate that blocks classes of sensitive external or irreversible requests until an approval workflow exists.
- Specialist-agent registry and owner-controlled memory API.
- Automated lint, TypeScript and production-build checks.

This is a pre-deployment build. No public deployment has been performed. The application still requires private infrastructure configuration before authentication, database-backed memory and model responses can run.

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
6. Run both SQL migrations in order: `0001_friday_core.sql`, then `0002_nexus_rate_limits.sql`.
7. Generate an application encryption key locally with `openssl rand -base64 32` and set `FRIDAY_DATA_ENCRYPTION_KEY`. Keep a secure offline backup of this key. Losing it makes encrypted stored data unrecoverable.
8. Configure `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY` only after choosing and approving a model provider. The API key is server-only and must never use a `NEXT_PUBLIC_` prefix.
9. Install and run:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
```

GitHub Actions runs the same checks for commits to `main` and `foundation/**` branches.

## Security boundaries

- Never commit real keys, passwords, tokens, private keys or recovery codes.
- The owner email allowlist is enforced server-side; public registration is not part of the application.
- Database tables use row-level security so authenticated users can only access rows belonging to their own auth user ID.
- Conversation and memory content is encrypted before it is written to PostgreSQL. Keep the encryption key separate from the database and back it up securely.
- If the encryption key is missing or invalid, private storage endpoints fail closed.
- The assistant route does not execute external actions. Sensitive or potentially irreversible requests are blocked until a separate approval workflow is implemented.
- A model provider must be configured before FRIDAY can generate responses.
- The agent registry is a design and orchestration foundation; specialist agents are not yet independent running services.
- Voice, telephony, device control, emergency protocols and the virtual headquarters are not yet operational.
- No paid service is activated automatically.

## Pre-deployment checklist

- [ ] Create and configure the private Supabase project.
- [ ] Verify the owner account and sign-in flow against the live Supabase project.
- [ ] Run the SQL migration and verify row-level security with negative cross-user tests.
- [ ] Securely store and back up the encryption key; test encryption/decryption and recovery.
- [ ] Select and approve the AI provider and its cost/retention terms.
- [ ] Add request rate limiting, audit review and security tests.
- [ ] Complete browser, mobile and accessibility testing.
- [ ] Complete independent security review.
- [ ] Configure deployment secrets only after owner approval.

Deployment is intentionally not performed as part of this stage.
