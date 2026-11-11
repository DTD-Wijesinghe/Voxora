# Voxora Release Status

Date: 2026-11-11
Release candidate: `main` at `7d201fa`

## Status: BLOCKED FOR PRODUCTION

The integrated code is suitable for continued development and a local/mock demonstration. It is not suitable for a public AWS production deployment yet.

## Green gates

- Repository installs from the committed lockfile.
- Typecheck, build, and current unit/component tests pass.
- Provider-specific code remains backend-only.
- No tracked credentials were found.
- Production dependency audit is clean.
- PR #9 integrated the substantive member work and its GitHub CI check passed.

## Blocking gates

- Authenticated backend audio WebSocket and real two-way event forwarding.
- Live UI captions/audio connected to provider events.
- Admin/session authorization and request validation.
- Durable shared session storage and expiry behavior.
- Deployable AWS infrastructure and secret-management configuration.
- E2E, security, reconnect, mobile, and long-session evidence.
- Reconciliation of the stale `develop` branch with the verified release baseline.

## Recommended next sequence

1. Reconcile `develop` from the verified `main` baseline through a reviewed PR.
2. Implement Member 5 security controls before exposing admin or audio routes.
3. Implement the authenticated WebSocket bridge and connect the conversation UI.
4. Add DynamoDB/TTL session storage and AWS infrastructure in a staging account.
5. Add Playwright two-browser acceptance tests and run the release checklist.
6. Open a release PR only after all blocking gates have evidence.
