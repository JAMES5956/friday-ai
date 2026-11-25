# FRIDAY AI — Initial Architecture

## System boundary

The current application is a web interface foundation. It does not yet contain a connected AI provider, persistent memory, authentication, voice processing, or device-control capability.

## Intended architecture

- **Web client:** Next.js interface for the owner.
- **Application API:** server-side routes for authenticated application operations.
- **FRIDAY orchestrator:** central coordinator for requests and specialist agents.
- **NEXUS security layer:** independent policy checks, audit events, and protective controls.
- **Memory service:** encrypted, access-controlled persistent memory with retention controls.
- **Specialist agents:** isolated domain workers with narrowly scoped permissions.

## Security rules

1. Secrets belong in server-side environment variables or a managed secret store, never in browser code or Git.
2. Every privileged operation must be authenticated and authorised on the server.
3. Financial commitments, external publication, and sensitive data sharing require owner approval.
4. Agent tools must use least-privilege permissions and auditable actions.
5. Security controls must fail closed when authorisation cannot be verified.
6. Never report a capability as operational until its implementation and tests demonstrate that it works.

## Current implementation

- Responsive landing interface.
- Server-rendered application shell.
- Basic health endpoint at /api/health.
- Validated assistant API boundary with explicit unavailable response until a provider is configured.
- Baseline browser security headers.
- GitHub Actions quality-check workflow.

## Next engineering milestone

Establish authentication and a server-side request boundary before connecting model providers or storing personal memory. The current assistant route is intentionally not exposed as a working chatbot until authentication and provider configuration are in place.
