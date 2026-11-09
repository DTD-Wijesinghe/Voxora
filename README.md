# Voxora

Live voice-to-voice translation web application.

## Repository structure

```text
apps/
  web/                 React UI, microphone capture, playback, captions
  api/                 Fastify API, sessions, WebSocket, provider adapter
packages/
  contracts/           Shared API, session, audio, and translation event types
  config/               Shared TypeScript and lint configuration
infra/                 AWS CDK application (S3/CloudFront, ECS/Fargate, DynamoDB)
tests/
  e2e/                 Cross-browser and two-user acceptance tests
docs/
  contracts/           Versioned API/audio/event contract documentation
```

## Team ownership

| Member | Area |
| --- | --- |
| 1 | `apps/web/src/features/conversation` and UI components |
| 2 | `apps/web/src/features/audio` |
| 3 | `apps/api/src/providers` |
| 4 | `apps/api/src/modules/sessions` |
| 5 | `apps/api/src/security` and configuration |
| 6 | `.github/`, `tests/e2e/`, and release documentation |

## Quick start

Requirements: Node.js 20+, pnpm 10+.

```bash
pnpm install
Copy-Item .env.example .env
pnpm dev
```

The web app runs on `http://localhost:5173`; the API runs on `http://localhost:3000`.

## Branch workflow

- `main`: stable releases only.
- `develop`: shared integration branch.
- `feature/member-N-short-description`: individual work.

Open pull requests into `develop`. Protect both `main` and `develop`; require review and passing CI.

## Initial implementation rules

- Keep Gemini credentials on the backend only.
- Keep provider-specific logic behind `TranslationProvider`.
- Change shared contracts through a focused pull request and update mocks with the contract.
- Do not store raw audio or transcripts by default.

