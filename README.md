# FRIDAY AI — Foundation

FRIDAY AI is being developed as a private, voice-first personal intelligence and agent workspace.

## Current stage

This repository currently contains the **web foundation and visual interface preview**. The page is not yet a functioning voice assistant, AI orchestrator, memory service, or device-control system.

## Design principles

- FRIDAY is the central intelligence coordinating specialist agents.
- NEXUS provides independent security and privacy oversight.
- The owner remains in control of sensitive actions.
- Keep credentials out of source control.
- Build in verified stages rather than pretending unfinished capabilities are live.
- Prefer modular integrations and free-first infrastructure; do not incur paid services without explicit approval.

## Requirements

- Node.js 20 or later
- npm

## Run locally

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

## Environment

Copy `.env.example` to `.env.local` when local configuration is introduced. Never commit real API keys, passwords, tokens, private keys, or recovery codes.

## Planned implementation stages

1. Secure application foundation and authentication.
2. Central FRIDAY orchestration, voice interface, initial memory, and NEXUS security layer.
3. Personal assistant capabilities and approved integrations.
4. Specialist agents, controlled shared memory, and company workspaces.
5. Virtual headquarters and advanced modules.

Each stage must be implemented and tested before it is represented as operational.
