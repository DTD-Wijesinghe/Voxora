# Voxora Smoke Test Checklist

**Owner:** Member 6 (QA, CI/CD and release)
**Purpose:** A 5-minute check that answers one question: "Is the app basically alive?"
If any step fails, stop and report it before doing deeper testing.

## How to record a run

| Field | Value |
|---|---|
| Date | 11 November 2026 |
| Tester | Gimhani (Member 6) |
| Commit tested (`git log --oneline -1`) | 9e85355 |
| Environment | Local demo |
| Browser and device | Chrome, Windows laptop |

## Section A: Local demo (runnable today)

Start the app with `pnpm dev`, then open http://localhost:5173.

| # | Check | Expected result | Result | Notes |
|---|---|---|---|---|
| A1 | Open http://localhost:5173 | Home page loads with the heading "Conversations that cross every language" | Pass | |
| A2 | Open http://localhost:3000/health | The backend responds (no error page) | Pass | |
| A3 | Click "Join a session" | The join page opens | Pass | |
| A4 | Click the ← button at the top-left of the join page (not the browser's back button) | The home page returns | Pass | Use the in-app ← button. The browser back button leaves the site. |
| A5 | On the join page, submit with an empty display name | The message "Enter a display name to continue." appears | Pass | |
| A6 | Type a display name, leave the code empty, and click "Create conversation" | A session is created and the conversation page opens | Pass | |
| A7 | Open http://localhost:5173/?code=ABCD | The join page opens with the code ABCD filled in | Pass | |
| A8 | Open http://localhost:5173/admin | The admin dashboard page opens (known limitation: it is not protected yet) | Pass | Opens without login (known limitation: admin not protected). |
| A9 | Look at the terminal running `pnpm dev` | No red error messages while using the app | Pass | |

**Section A result: PASS (9 of 9)**

## Section B: Staging (blocked until AWS deployment exists)

**Status: BLOCKED.** AWS infrastructure is not implemented yet (see
`docs/reports/known-limitations.md`). Run these checks once a staging
address exists.

| # | Check | Expected result | Result | Notes |
|---|---|---|---|---|
| B1 | Open the staging address in a browser | The home page loads over HTTPS (padlock shown) | Blocked | No staging environment yet |
| B2 | Open the backend health address | The backend responds | Blocked | |
| B3 | Create a session and join it from a second browser or device | Both participants appear in the session | Blocked | |
| B4 | Allow microphone permission | The microphone starts and the status is shown | Blocked | |
| B5 | One person speaks, the other listens | Translated audio and captions arrive (needs live Gemini) | Blocked | |
| B6 | Check that the page does not expose secrets | No keys or tokens visible in the page source or browser network tab | Blocked | |
| B7 | Open the /admin address without signing in | Access is refused (needs Member 5's security work) | Blocked | |

## Result rules

- **Pass:** every check in the section passes.
- **Fail:** any check fails. Report each failure as a GitHub Issue with steps to reproduce, and assign the module owner.
- **Blocked:** the check cannot run yet. Write the reason in Notes.