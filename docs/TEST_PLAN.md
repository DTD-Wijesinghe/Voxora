# Voxora Test Plan

**Owner:** Member 6 (QA, CI/CD and release)
**Last updated:** 10 November 2026

## 1. Purpose

This document lists what the team will check to confirm Voxora works.
Every member tests their own module. Member 6 coordinates the overall
test cycle, and all members join the final end-to-end acceptance test.

## 2. How to record a result

Each test records: Test ID, tester, date, browser/device, language pair,
network condition, expected result, actual result, and pass/fail.

Status values: **Pass**, **Fail**, **Not started**, **Blocked**

## 3. Test environment

| Item | Value |
|---|---|
| Operating system | Windows |
| Node.js | v22.17.0 |
| Browser | Chrome or Edge (latest) |
| Frontend address | http://localhost:5173 |
| Backend address | http://localhost:3000 |

## 4. Baseline tests (project setup)

| ID | Test | Steps | Expected result | Actual result | Status | Tester | Date |
|---|---|---|---|---|---|---|---|
| TC-001 | Clean install | Clone the repo, run `pnpm install` | Finishes with no errors | Finished in 2m 46s | Pass | Gimhani | 10 Nov 2026 |
| TC-002 | App starts | Run `pnpm dev` | Frontend and backend both start | Both started | Pass | Gimhani | 10 Nov 2026 |
| TC-003 | Typecheck | Run `pnpm typecheck` | No errors | No errors | Pass | Gimhani | 10 Nov 2026 |
| TC-004 | Build | Run `pnpm build` | Build completes | Build completed | Pass | Gimhani | 10 Nov 2026 |
| TC-005 | Website opens | Open http://localhost:5173 | Page loads | Page loaded | Pass | Gimhani | 10 Nov 2026 |
| TC-006 | Backend responds | Open http://localhost:3000/health | Backend returns a response | Response shown | Pass | Gimhani | 10 Nov 2026 |

## 5. Feature tests (to be completed as modules are merged)

| ID | Area | Test | Expected result | Status |
|---|---|---|---|---|
| TC-101 | Sessions | Create a new session | A session code or link is created | Not started |
| TC-102 | Sessions | Join a session with a valid code | Participant joins the session | Not started |
| TC-103 | Sessions | Join with an invalid code | A clear error message is shown | Not started |
| TC-104 | Sessions | End a session | Session ends and participants are told | Not started |
| TC-105 | Language | Choose a listening language | The choice is saved and shown | Not started |
| TC-201 | Audio | Allow microphone permission | Microphone starts capturing | Not started |
| TC-202 | Audio | Deny microphone permission | A clear message is shown, no crash | Not started |
| TC-203 | Audio | Mute and unmute | Audio stops and resumes | Not started |
| TC-301 | Security | Access a session without permission | Access is refused | Not started |
| TC-302 | Security | Check that no secrets are in the repository | No keys or .env files found | Not started |
| TC-401 | End-to-end | Two browsers, user A speaks | User B hears the translation | Not started |
| TC-402 | End-to-end | Reverse direction (B speaks) | User A hears the translation | Not started |
| TC-403 | Reliability | Lose and restore network | App reconnects | Not started |
| TC-404 | Reliability | Run a 10 to 20 minute session | No crash or major delay | Not started |

## 6. Acceptance criteria (MVP is "done" when)

- Two people can join the same session from two different browsers.
- Each person hears the other in their chosen language.
- Captions are shown where available.
- Mute, reconnect and leave all work.
- No credentials appear in the code, logs or browser.
- CI passes on the release pull request.

## 7. Bug report format

- **Title:** short description
- **Module owner:** who should fix it (Member 1 to 5)
- **Steps to reproduce:** numbered list
- **Expected result:**
- **Actual result:**
- **Environment:** browser, device, branch and commit
- **Screenshot or log:** 

## 8. Regression run log

### Run 1: 11 November 2026

| Item | Value |
|---|---|
| Code tested | `main` at 59703c9 plus the Playwright branch (now merged into `main` at 9e85355) |
| Tester | Gimhani (Member 6) |
| Environment | Windows, Node v22.17.0, Chromium |
| Network | Normal |
| Language pair | Not applicable (no translation tested yet) |

| ID | Test | Expected result | Actual result | Status |
|---|---|---|---|---|
| TC-007 | `pnpm install --frozen-lockfile` | Finishes with no lockfile error | Finished with no errors | Pass |
| TC-008 | `pnpm typecheck` | No errors | No errors | Pass |
| TC-009 | `pnpm build` | Contracts, API and web all build | All three built | Pass |
| TC-010 | `pnpm test` (unit tests) | All tests pass | API: 27 passed, web: 3 passed, contracts: no tests | Pass |
| TC-011 | `pnpm exec playwright test` (home page) | 3 tests pass | 3 passed | Pass |
| TC-012 | CI on GitHub (Playwright PR #12, main run #24) | Green tick | Green tick | Pass |

### Coverage gaps found

| # | Gap | Module owner |
|---|---|---|
| G-1 | No automated tests for session features (create, join, leave, end, invalid code, expiry, duplicate join) | Member 4 |
| G-2 | `packages/contracts` test script is only a placeholder message | Shared |
| G-3 | End-to-end tests cover only the home page. Join flow, admin dashboard and QR join are not covered yet. | Member 6 |
| G-4 | No tests yet for security rules (unauthorized access, rate limiting) | Member 5 |