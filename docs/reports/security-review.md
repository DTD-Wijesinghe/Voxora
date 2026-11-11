# Voxora Security Review

Date: 2026-11-11
Revision: `main` at `7d201fa`

## Findings

### Critical - live audio path is not production-connected

The repository contains a frontend audio protocol that explicitly states authentication is required, but no backend WebSocket route is registered to authenticate, authorize, and forward audio. Do not expose the current audio demo as a production endpoint.

### High - admin endpoints are unauthenticated

`/api/admin/sessions` and its mutation routes are publicly reachable in the current Fastify application. Any caller who can reach the API can list, create, modify, or delete admin sessions.

### High - CORS is permissive

The API registers CORS with `origin: true`, reflecting arbitrary origins. Production deployments must use an explicit allowlist from protected configuration.

### High - in-memory session store

Sessions and participant data are held in process memory. Restarting the service loses state, and multiple instances do not share session ownership or limits.

### Medium - request validation is incomplete

The session/admin handlers trust body fields and do not consistently enforce length, allowed language, participant-limit, expiry, or status-transition rules.

### Positive controls verified

- `.env` and credential filename patterns are ignored.
- No credential-like literals were found in tracked source files.
- Gemini configuration is server-side and provider errors are mapped before browser delivery.
- Production dependency audit reported zero known vulnerabilities.

## Required remediation before production

1. Add authentication/authorization for admin and session actions.
2. Add schema validation and rate limiting.
3. Replace reflected CORS with an explicit HTTPS origin allowlist.
4. Use a shared store such as DynamoDB with TTL and conditional writes.
5. Implement authenticated WSS audio routing and verify that secrets never reach the browser.
6. Add security integration tests and staging evidence.
