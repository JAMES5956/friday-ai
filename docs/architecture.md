# FRIDAY AI — Architecture and Security Boundaries

## Current system boundary

The current branch contains a private workspace foundation, Supabase authentication and data access, a model-provider adapter, encrypted memory/conversation storage, and an initial NEXUS request gate. It is not deployed. Voice, telephony, device control, emergency features and autonomous specialist agents are not operational.

## Architecture

- **Web client:** Next.js responsive interface for the owner.
- **Identity boundary:** Supabase Auth with server-side owner email allowlist and protected middleware.
- **Application API:** server routes for chat and owner memory operations.
- **FRIDAY orchestrator:** central system prompt and conversation-history builder; model execution is provider-adapter based.
- **Model adapter:** OpenAI-compatible chat-completions endpoint configured only through server-side secrets.
- **NEXUS policy boundary:** deterministic approval gate for sensitive or irreversible request categories. This is an initial guard, not a complete independent security agent.
- **Memory service:** PostgreSQL tables for conversations, messages and memories, protected by row-level security.
- **Data encryption:** AES-256-GCM application-layer encryption for stored conversation and memory content. Encryption key is independent of the database.
- **Specialist agents:** explicit registry of domains and planned roles. Migration `0003_agent_workspaces.sql` adds owner-scoped workspaces, per-agent encrypted-memory storage, explicit owner-managed memory-sharing grants, task queues and append-only task events. These are storage foundations only: agents do not yet execute independently, have separate model credentials, or access these tables through runtime services.

## Identity and permissions

1. Public registration is not provided.
2. Owner access requires a valid Supabase session and an exact match with the server-only `FRIDAY_OWNER_EMAIL` setting.
3. Private routes fail closed if auth configuration is missing.
4. Every database row is scoped to `auth.uid()` through row-level security.
5. Never expose the Supabase service-role key to the browser; this implementation does not require it.
6. Owner approval is required before financial commitments, external publication, sharing private information or irreversible changes.

## Data protection

1. Conversation and memory text is encrypted in the application before database writes.
2. AES-256-GCM uses a 12-byte random nonce and authentication tag for each value.
3. `FRIDAY_DATA_ENCRYPTION_KEY` must be a base64-encoded 32-byte key.
4. Losing the encryption key makes encrypted content unrecoverable. Store a secure offline backup and do not store the key in the database or GitHub.
5. Encrypted values use the versioned `friday:v1:` envelope. Unsupported formats, malformed Base64 and unencrypted legacy plaintext are rejected; there is no automatic plaintext fallback.
6. Before introducing key rotation or a new envelope version, implement and test an explicit owner-authorised migration with verified backups. Never silently rewrite stored ciphertext.
5. Database transport and provider transport must use HTTPS.
6. Data retention and deletion must remain owner-controlled. No automatic deletion policy is enabled.

## Current sensitive-action boundary

NEXUS currently blocks a conservative set of requests associated with messaging, publishing, financial transactions, deletion, permission changes and other high-impact actions. This is not a substitute for a contextual approval workflow, tool-level permissions or a dedicated security model. The chat route has no external action tools attached.

## Specialist-agent data boundaries

1. Each specialist has a distinct `agent_id` namespace and owner-scoped workspace.
2. Agent memory, task payloads, results and task-event details are stored as ciphertext; application code must encrypt/decrypt them using the existing encryption service before any database write/read.
3. A specialist must not read another specialist's memory by default. Cross-agent handoff requires an explicit owner-managed row in `agent_memory_grants`, with source agent, recipient agent, expiry and revocation fields.
4. Task records identify the assigned specialist and creator. Task events are append-only for authenticated clients.
5. These tables do not grant model/API access or enable autonomous execution. Runtime services must enforce agent identity, allowed tools, task scope, approval gates and audit logging before agents are activated.
6. Do not put provider API keys, OAuth tokens or other secrets in agent tables; keep them in server-side secret storage.

## Deployment gate

Do not deploy until:
- Supabase project, owner identity and RLS have been configured and tested.
- Encryption-key backup and recovery have been tested.
- AI provider and data-retention terms have been approved.
- Rate limiting, audit monitoring and security tests are complete.
- Independent security review and mobile/browser checks have passed.
- Production secrets are configured through the selected host's secret manager.

Deployment is outside the current authorised work stage.
