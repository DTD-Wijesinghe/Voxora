# Voxora Team Workflow and Contribution Guide

Version 1.0 | 9 November 2026

This guide is the working standard for all Voxora contributors. It explains where code belongs, how to create branches, how to commit and open pull requests, and how to keep the shared project safe and easy to integrate.

## 1. Non-negotiable rules

1. Never push directly to `main` or `develop`.
2. Start every task from the latest `develop` branch.
3. One task, one feature branch, one focused pull request.
4. Put files only in the folder owned by the relevant module.
5. Do not commit passwords, API keys, service-account files, audio recordings, private transcripts, or `.env` files.
6. Do not change a shared contract without informing every affected owner and updating mocks/tests.
7. Every pull request must pass CI and receive at least one teammate review.

## 2. Standard repository structure

```text
Voxora/
├─ apps/
│  ├─ web/                         # React frontend
│  │  └─ src/
│  │     ├─ features/conversation/ # Member 1: screens and UI state
│  │     ├─ features/audio/        # Member 2: microphone and playback
│  │     ├─ components/            # Shared UI components
│  │     └─ lib/                   # Frontend API client and utilities
│  └─ api/                         # Fastify backend
│     └─ src/
│        ├─ modules/sessions/      # Member 4: session lifecycle
│        ├─ providers/             # Member 3: Gemini adapter and mock
│        ├─ security/              # Member 5: auth and security controls
│        └─ config/                # Safe environment configuration
├─ packages/
│  └─ contracts/                   # Shared TypeScript types and events
├─ infra/                          # Member 6: AWS CDK infrastructure
├─ tests/e2e/                      # Member 6: Playwright acceptance tests
├─ docs/contracts/                 # API, audio, event, and error contracts
├─ .github/workflows/              # CI/CD workflows
├─ README.md
└─ package.json
```

## 3. Member ownership

| Member | Primary folders | Responsibility |
| --- | --- | --- |
| 1 | `apps/web/src/features/conversation`, `components` | Pages, conversation layout, language selection, captions, responsive UI |
| 2 | `apps/web/src/features/audio` | Microphone permission, capture, PCM conversion, buffering, playback, mute |
| 3 | `apps/api/src/providers` | Provider-neutral interface, mock provider, Gemini Live adapter, provider errors |
| 4 | `apps/api/src/modules/sessions` | Create, join, leave, end, participant preferences, session validation |
| 5 | `apps/api/src/security`, `apps/api/src/config` | Authentication, authorization, validation, CORS, rate limiting, secrets, privacy |
| 6 | `infra`, `tests/e2e`, `.github`, `docs` | AWS deployment, CI, end-to-end tests, release checklist, test evidence |

If a change crosses ownership boundaries, the pull request must request review from every affected owner.

## 4. Branch workflow

The branch model is:

```text
main       = stable releases only
develop    = shared integration branch
feature/*  = individual task branches
```

Create a branch:

```bash
git fetch origin
git checkout develop
git pull origin develop
git checkout -b feature/member-1-conversation-screen
```

Recommended branch names:

```text
feature/member-1-conversation-ui
feature/member-2-audio-capture
feature/member-3-gemini-adapter
feature/member-4-session-api
feature/member-5-auth-security
feature/member-6-ci-e2e
fix/reconnect-after-network-loss
docs/update-team-guide
```

Push only your feature branch:

```bash
git push -u origin feature/member-1-conversation-screen
```

Open a pull request with `base: develop` and `compare: feature/your-branch-name`. After `develop` is tested, the team lead opens `base: main` and `compare: develop`.

## 5. Commit and code standards

Use small, meaningful Conventional Commits:

```text
feat(ui): add conversation language selector
feat(audio): add microphone permission handling
fix(api): reject expired session codes
test(e2e): cover two-user conversation flow
docs(workflow): clarify branch rules
chore(ci): add typecheck job
```

Before committing:

```bash
pnpm typecheck
pnpm test
pnpm build
git diff --check
git status
```

Coding standards:

- TypeScript strict mode is required.
- Prefer small functions and explicit types at module boundaries.
- Keep UI, business rules, provider logic, and infrastructure separate.
- Use the existing formatter and linter; do not add a second toolchain without agreement.
- Use clear names such as `targetLanguage`, `sessionId`, and `sequenceNumber`.
- Add tests for new behavior and failure cases, not only the happy path.

## 6. Shared contracts

Shared contracts live in `packages/contracts/src/index.ts` and are documented in `docs/contracts/`.

Agree before implementation on REST routes, JSON schemas, session roles and expiry, participant limits, audio format, translation events, stable error codes, and safe user-facing messages.

When a contract changes: open a focused contract pull request, update `packages/contracts`, update mocks and tests, and notify all affected owners before merging.

## 7. Testing requirements

Every module owner writes unit or component tests. Member 6 coordinates integration and end-to-end testing.

- Session lifecycle: create, join, leave, end, duplicate join, expiry, invalid payloads.
- Audio: permission denied, missing device, mute, interruption, chunk ordering.
- Provider: disconnects, timeouts, unsupported languages, rate limits, invalid configuration.
- Security: unauthorized access, role violations, oversized requests, CORS, rate limiting.
- End-to-end: two browsers/devices, both directions, reconnect, network loss, and 10-20 minute sessions.

Test evidence should record test ID, tester, date, browser/device, language pair, network condition, expected result, actual result, and pass/fail status.

## 8. Security and privacy

- Keep Gemini credentials on the backend only.
- Store secrets in AWS Secrets Manager in deployed environments.
- Commit only `.env.example` with placeholder values.
- Use HTTPS and WSS in staging and production.
- Do not log raw audio, private transcripts, access tokens, or secret values.
- Do not store audio or transcripts by default.
- Validate all input and authorize every session action.
- A session join code must not grant host or administrative privileges.

## 9. Pull request checklist

Every pull request must include a linked GitHub Issue, summary and rationale, module owner and affected folders, test commands and results, useful screenshots or logs, confirmation that no secrets/private data are included, confirmation that shared contracts remain compatible, and documentation updates when required.

Do not merge when CI is failing, required reviewers have not approved, or a contract change has not been communicated.

## 10. Release flow

1. Feature branch passes local checks.
2. Pull request targets `develop`.
3. Reviewer checks scope, tests, security, and compatibility.
4. CI passes and the pull request merges into `develop`.
5. Team runs the integrated staging smoke test.
6. Team lead opens a release pull request from `develop` to `main`.
7. After approval, `main` is deployed and release notes are recorded.

## 11. Quick command reference

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
git status
git add <your-files>
git commit -m "feat(scope): short description"
git push -u origin <your-feature-branch>
```

Never use `git push origin main` for ordinary feature work.

