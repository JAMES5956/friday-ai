# FRIDAY AI — Architecture and security boundaries

## Current implementation boundary

FRIDAY is a pre-deployment, owner-only web application. It contains a central conversational assistant, encrypted conversation and memory storage, an initial NEXUS security gate, and an owner-controlled specialist task workflow.

The application is not deployed. Voice is browser-based and foreground-only; telephony, native background wake-word detection, device control, emergency protocols, autonomous services and virtual headquarters integrations are not operational.

## Architecture

- **Web client:** Next.js responsive owner workspace with conversation history, browser speech controls, specialist task center and conceptual corporate headquarters preview.
- **Identity boundary:** Supabase Auth, server-side owner email allowlist and protected private routes.
- **Application APIs:** server routes for assistant conversations, specialist tasks and memory sharing, plus security and health endpoints.
- **FRIDAY orchestrator:** central assistant identity, conversation context construction, model routing and response synthesis.
- **Model adapter:** OpenAI-compatible chat-completions interface using server-only provider configuration and bounded request timeouts.
- **NEXUS policy boundary:** independent deterministic policy gate for sensitive or potentially irreversible requests, approval checks and security audit events. This is an initial security control, not yet a fully independent always-on security service.
- **Project continuity service:** owner-scoped `project_records` with AES-256-GCM encrypted payloads for project title, purpose, status, priority, agent owner, dates, milestones, tasks, progress updates and blockers. The workspace supports project creation, progress tracking, status changes and milestone/task updates. Project records are not injected into FRIDAY context automatically. The owner may explicitly select up to three active project records for one FRIDAY message; the API verifies owner scope, rejects archived or unavailable records, decrypts them server-side, caps context size, and labels the data as untrusted context. Selection clears after a successful reply.
- **NEXUS backup and recovery:** owner-authenticated export of RLS-scoped encrypted application records and required metadata into a portable JSON snapshot. A keyed HMAC signature binds the manifest and all included rows; dry-run verification checks owner binding, row counts, ciphertext AEAD, per-record memory signatures and legacy unsigned records. Recovery verification never writes to the database. Actual restore, merge and overwrite are deliberately disabled until a separately tested, owner-approved recovery workflow exists.
- **NEXUS memory integrity:** personal `memories` records written after migration 0009 carry a versioned HMAC-SHA256 digest derived from the application encryption key using domain separation. The digest binds owner ID, memory ID and ciphertext, and is compared in constant time before content is decrypted. AES-256-GCM authenticated encryption remains mandatory. Existing records without a digest are marked legacy-unsealed; they are not silently trusted or auto-sealed, and are excluded from model context until reviewed. The assistant verifies the keyed digest before using any signed saved memory. The owner reviews legacy records and explicitly requests sealing, which decrypts, re-encrypts with a fresh nonce, and writes a digest. Tampered or unreadable records are never auto-repaired. The integrity centre dashboard currently scans owner personal memories. Specialist memories, knowledge archive records and project records are also signed on write with separate domain identifiers and verified before any model-context use or cross-agent sharing. Legacy unsigned records remain visible to the owner but are excluded from model context and sharing until the owner reviews and seals them. Conversation-history messages and task/result event payloads are not yet covered by this signature scheme.
- **Memory and knowledge service:** owner-scoped PostgreSQL records for conversations, messages, memories, agent workspaces, specialist tasks, sharing grants, append-only task events, and an encrypted knowledge/decision archive. Owner memories support routine, internal and restricted sensitivity, optional expiry and provenance references; restricted and expired memories are excluded from AI model context. Knowledge and decision payloads (including titles, rationale, tags and source references) are encrypted as one application-layer payload. The archive currently supports owner-managed capture, listing, superseding, archiving, deletion and owner-only search. Search decrypts records server-side after owner authentication and never exposes plaintext archive fields to database search indexes. Model context is opt-in per message: the owner may explicitly select up to five active routine/internal records for the next FRIDAY message. Restricted, expired and archived records are never eligible, and selected records are not reused automatically.
- **Data encryption:** AES-256-GCM application-layer encryption for stored private conversation, memory, task and result content. The encryption key is separate from the database.
- **Specialist workflow:** registered specialist roles, per-agent model configuration, owner-created tasks, NEXUS approval checks, explicit owner-triggered execution, isolated agent memory and owner-approved expiring cross-agent memory grants. Specialist workers return text only and have no tools or external-action capability.
- **Quality controls:** automated lint, TypeScript, test and production-build checks in GitHub Actions.

## Identity and permissions

1. Public registration is not provided.
2. Owner access requires a valid Supabase session and an exact match with the server-only FRIDAY_OWNER_EMAIL setting.
3. Private routes fail closed if authentication configuration is missing.
4. Database records are scoped to the authenticated owner through row-level security.
5. The Supabase service-role key must never be exposed to the browser.
6. Owner approval is required before financial commitments, external publication, sharing private information or irreversible changes.
7. Specialist execution is initiated by the owner. Sensitive tasks must also satisfy the recorded approval workflow.
8. Approval to execute a specialist task does not authorise a separate external action.

## Data protection

1. Conversation, memory, task, result and knowledge/decision payloads are encrypted in the application before database writes.
2. AES-256-GCM uses a fresh 12-byte random nonce and authentication tag for each encrypted value.
3. FRIDAY_DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.
4. Losing the encryption key makes encrypted content unrecoverable. Keep a secure offline backup; never commit it or store it in the database.
5. Encrypted values use a versioned friday:v1: envelope. Unsupported formats, malformed Base64 and unencrypted legacy plaintext are rejected; there is no automatic plaintext fallback.
6. Key rotation requires an explicit, tested owner-authorised migration with verified backups. Never silently rewrite stored ciphertext.
7. Database and model-provider transport must use HTTPS outside localhost development.
8. Retention and deletion remain owner-controlled. No automatic deletion policy is enabled.

## NEXUS and sensitive-action boundary

NEXUS currently applies a conservative deterministic gate to request categories associated with messaging, publishing, financial transactions, deletion, permission changes and other high-impact actions. Sensitive specialist tasks can be held for explicit owner approval. The approval event is audited; it does not itself perform the requested action.

The assistant chat route does not have external action tools attached. The current gate is not a substitute for contextual intent analysis, comprehensive tool-level permissions, continuous monitoring or an independently running security service.

## Specialist-agent boundaries

1. Each specialist has a distinct agent_id namespace and owner-scoped workspace.
2. Agent memories, task payloads, results and task-event details are encrypted before storage and decrypted only in authorised server-side paths.
3. A specialist cannot read another specialist's memory by default. Cross-agent handoff requires an explicit owner-managed grant with source agent, recipient, expiry and revocation fields.
4. FRIDAY and NEXUS are excluded from ordinary specialist memory-sharing grants. Restricted memories cannot be shared.
5. Specialist model configuration is separate per agent. There is no silent fallback to FRIDAY's model when a specialist model is not configured.
6. Specialist workers receive their own permitted working memory and only explicitly granted, non-restricted cross-agent context.
7. Specialist workers return text results only. They cannot call tools, send communications, publish, make purchases, control devices or deploy code.
8. Task creation, approval, execution and memory-sharing changes are owner-scoped and audited. Failed execution attempts must not be reported as completed work.
9. FRIDAY can review completed specialist output and synthesise it into the owner conversation. Model output remains untrusted data and cannot override system policy.
10. NEXUS remains outside the ordinary specialist reporting and memory-sharing hierarchy and reports security matters directly to the owner.

## Voice boundary

Browser speech recognition and synthesis are optional client capabilities. Speech recognition availability and processing depend on the browser and its speech service. The foreground wake phrase is only available while the workspace is open; it does not provide a native background wake word. Voice input is not automatically submitted when wake phrase detection occurs; the user can review the captured draft.

## Deployment gate

Do not deploy until:
- A private Supabase project and owner identity are configured.
- All migrations have been applied in order and row-level security has passed negative cross-owner tests.
- Encryption-key backup and recovery have been tested.
- The AI provider, pricing and data-retention terms have been explicitly approved.
- Rate limiting, audit review and security tests are complete.
- Browser, mobile and accessibility checks have passed.
- An independent security review is complete.
- Production secrets are configured through the selected host's secret manager.

Deployment and activation of paid services are outside the current authorised work stage.
