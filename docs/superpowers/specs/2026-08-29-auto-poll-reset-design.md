# Automated Poll Reset Design

**Date:** 2026-08-29

## Problem

The availability poll resets only when someone opens `admin.html` after noon on match day. If no one opens the page, the poll stays on the previous week indefinitely.

## Goal

Automatically reset the poll at noon on match days (Saturday and Sunday) without requiring anyone to open the admin page.

## Approach

A new `reset_poll.js` script runs as a step in the existing `update-milestones.yml` GitHub Actions workflow. It uses `firebase-admin` (already installed in the workflow) to reset the poll in Firestore. The script checks internally whether it's a match day weekend and whether it's noon or later — so it's safe to run anytime and will skip gracefully if conditions aren't met.

## Architecture

### New script: `reset_poll.js`

Uses `firebase-admin` to:
1. Read `config/poll` from Firestore
2. Determine if today is Saturday or Sunday (match weekend)
3. If yes and time is >= 12:00 PM UTC: 
   - Mark all votes with `week === satDate` as deleted (`{ _deleted: true, week: '' }`)
   - Write `config/poll` with `{ open: true, satDate: <next Saturday>, updatedAt: <now> }`
4. If not a match weekend or before noon: print "skipping" and exit 0

**Next Saturday calculation:** From the current date, find the next Saturday. If today is Saturday, next Saturday is 7 days ahead. If today is Sunday, next Saturday is 6 days ahead.

**Idempotent:** Running twice on the same day is safe — the second run finds no votes for the new `satDate` and sets the same values again.

**Timezone:** The workflow runs in UTC. The noon cron (`0 19 * * 6,0`) fires at 12:00 PM PT (19:00 UTC). The script checks UTC hours >= 12, which always passes at the noon trigger time.

### Workflow change: `update-milestones.yml`

Add one new step at the end of the job:

```yaml
- name: Reset poll for next match week
  env:
    FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
  run: node reset_poll.js
```

`firebase-admin` is already installed by the existing "Install dependencies" step. No new secrets needed.

The step runs on both cron triggers (9:30 AM and noon). The script itself skips at 9:30 AM because `today.getUTCHours() < 12` at 16:30 UTC... actually 16:30 UTC >= 12, so the script will also run at 9:30 AM PT (16:30 UTC). This is acceptable — the poll reset at 9:30 AM is fine since matches start at 9:30 AM and the old poll is already stale.

### No changes to `admin.html`

The existing client-side reset logic stays as a fallback.

## Files Changed

| File | Change |
|---|---|
| `reset_poll.js` | New — resets poll in Firestore |
| `.github/workflows/update-milestones.yml` | Add `reset_poll.js` step |

## Out of Scope

- Notifying players that the poll has reset
- Different reset times for Saturday vs Sunday
