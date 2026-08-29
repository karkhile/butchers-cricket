# Milestone Auto-Refresh via GitHub Actions

**Date:** 2026-08-29

## Problem

`milestones.json` is generated manually by running `node generate_milestones.js` after each match. The milestone page goes stale until someone remembers to run it.

## Goal

Automatically regenerate `milestones.json` and commit it back to the repo on match days, so the page is always up to date without any manual intervention.

## Approach

A GitHub Actions workflow triggers on a cron schedule (twice per match day) and on manual dispatch. It runs `generate_milestones.js`, and if `milestones.json` changed, commits and pushes it back to `main`.

## Workflow File

**Path:** `.github/workflows/update-milestones.yml`

### Triggers

| Trigger | Schedule |
|---|---|
| Cron (Saturday) | 9:30 AM PT and 12:00 PM PT |
| Cron (Sunday) | 9:30 AM PT and 12:00 PM PT |
| Manual | `workflow_dispatch` in GitHub UI |

UTC equivalents (PT = UTC-7 in summer):
- 9:30 AM PT = 16:30 UTC → `30 16 * * 6,0`
- 12:00 PM PT = 19:00 UTC → `0 19 * * 6,0`

### Steps

1. `actions/checkout@v4` — checkout `main`
2. `actions/setup-node@v4` — Node.js 20
3. `node generate_milestones.js` — regenerate milestones (uses `CC_TOKEN` env var)
4. Commit and push `milestones.json` if it changed (skip if no diff)

### Secrets

| Secret | Purpose |
|---|---|
| `CC_TOKEN` | CricClubs API token — add under repo Settings → Secrets and variables → Actions |

`config.js` already reads `process.env.CC_TOKEN` with the hardcoded value as fallback, so no code changes are needed.

## Files Changed

| File | Change |
|---|---|
| `.github/workflows/update-milestones.yml` | New — the workflow |

No changes to `config.js`, `generate_milestones.js`, or `milestones.html`.

## Out of Scope

- Notifications/alerts if the workflow fails
- Running on weekdays
- Deploying to a CDN instead of committing back to the repo
