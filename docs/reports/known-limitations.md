# Voxora Known Limitations

Date: 2026-11-11

- The current app is an integrated development/demo baseline, not a production release.
- Translation defaults to the mock provider unless the API is configured for Gemini.
- Gemini live behavior, supported languages, quotas, and audio semantics still require a current staging smoke test with approved credentials.
- The UI does not yet render provider transcripts or translated audio from a live session.
- The backend has no registered audio WebSocket route.
- Sessions are process-local and disappear on restart.
- Admin routes are not protected.
- CORS is permissive for local development.
- AWS infrastructure is not implemented; `infra/README.md` is a plan only.
- No end-to-end browser test suite is present.
- The repository's `develop` branch is stale relative to `main`; reconcile it before using it as the integration base.
