# Refresh Stats Button Design

**Date:** 2026-08-29

## Problem

Milestones and player strength points both need manual regeneration after each match. The existing "Refresh Points" button only reads from Firestore (data must have been pushed there separately). There is no way to trigger a full refresh from any device without running scripts locally.

## Goal

A single "Refresh Stats" button on `admin.html` that triggers a GitHub Actions workflow from any device. The workflow regenerates `milestones.json` (committed to repo) and recalculates player strength scores (written to Firestore). A GitHub PAT stored in Firestore authorises the trigger.

## Architecture

### Part 1: Update `update-milestones.yml` workflow

**File:** `.github/workflows/update-milestones.yml`

- Rename workflow to `Refresh Stats`
- Add a new step after `generate_milestones.js` that runs `node update_points.js`
- Pass `FIREBASE_SERVICE_ACCOUNT` secret as env var (already supported by `update_points.js` via `process.env.FIREBASE_SERVICE_ACCOUNT`)
- Existing cron schedule (9:30 AM + 12:00 PM PT, Sat/Sun) and `workflow_dispatch` trigger unchanged

New GitHub secret required:
| Secret | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | JSON contents of `serviceAccountKey.json` |

### Part 2: Store PAT in Firestore

Firestore path: `config/github`
Field: `pat` — a GitHub Personal Access Token with `actions:write` scope for repo `karkhile/butchers-cricket`.

Added once manually (via Firebase console or a one-off script). Never committed to the repo.

### Part 3: Update `admin.html`

- Remove existing "Refresh Points" button (`#refreshPtsBtn`) and `refreshPoints()` function
- Add a single **"🔄 Refresh Stats"** button in its place
- On click:
  1. Fetch PAT from Firestore at `config/github` (field `pat`)
  2. Call GitHub API: `POST https://api.github.com/repos/karkhile/butchers-cricket/actions/workflows/update-milestones.yml/dispatches` with `{ ref: "main" }`
  3. Show spinner while waiting, then success/error status message
- Button is disabled while running to prevent double-triggers
- Success message: `✓ Refresh triggered — check back in ~2 minutes`
- Error message: `✗ <error detail>`

## Files Changed

| File | Change |
|---|---|
| `.github/workflows/update-milestones.yml` | Add `update_points.js` step + `FIREBASE_SERVICE_ACCOUNT` secret |
| `admin.html` | Replace Refresh Points button/function with Refresh Stats button |

## Out of Scope

- Showing live workflow run status in the UI (would require polling the GitHub API)
- Workflow failure notifications
- Separate workflows for milestones vs points
