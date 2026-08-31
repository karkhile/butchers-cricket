# Auto Poll Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically reset the availability poll at the start of match day (Saturday and Sunday) via GitHub Actions, without anyone needing to open `admin.html`.

**Architecture:** `reset_poll.js` already exists but runs unconditionally and uses hard deletes. Fix it to: only run on Saturdays and Sundays, and mark votes as `{ _deleted: true, week: '' }` (soft delete, consistent with `admin.html`). Then add it as a step in the existing `update-milestones.yml` workflow.

**Tech Stack:** Node.js, firebase-admin, GitHub Actions

---

### Task 1: Fix `reset_poll.js`

**Files:**
- Modify: `reset_poll.js`

The current script runs unconditionally and hard-deletes votes. Fix it to:
- Only run on Saturday (UTC day 6) or Sunday (UTC day 0)
- Soft-delete votes using `{ _deleted: true, week: '' }` instead of `d.ref.delete()`
- Skip gracefully on other days

- [ ] **Step 1: Replace `reset_poll.js` with the corrected version**

```js
#!/usr/bin/env node
// Clears current week's votes and opens poll for next Saturday.
// Only runs on Saturdays and Sundays — skips all other days.
// Run automatically by GitHub Actions on match days.

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function nextSaturday() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  const daysUntil = day === 6 ? 7 : (6 - day) || 7;
  const sat = new Date(now);
  sat.setUTCDate(now.getUTCDate() + daysUntil);
  return sat.toISOString().slice(0, 10);
}

(async () => {
  console.log('\n🏏  Butchers Cricket — Auto Reset Poll');
  console.log('='.repeat(50));

  const todayUTCDay = new Date().getUTCDay();
  if (todayUTCDay !== 6 && todayUTCDay !== 0) {
    console.log('Not a match day (Saturday/Sunday) — skipping poll reset.');
    console.log('='.repeat(50));
    process.exit(0);
  }

  const pollSnap = await db.collection('config').doc('poll').get();
  const currentWeek = pollSnap.exists ? pollSnap.data().satDate : null;
  console.log('Current week:', currentWeek || 'none');

  if (currentWeek) {
    const votesSnap = await db.collection('votes').get();
    const stale = votesSnap.docs.filter(d => d.data().week === currentWeek);
    await Promise.all(stale.map(d => d.ref.set({ _deleted: true, week: '' })));
    console.log(`Soft-deleted ${stale.length} votes for week ${currentWeek}`);
  }

  const nextSat = nextSaturday();
  await db.collection('config').doc('poll').set({
    open: true,
    satDate: nextSat,
    updatedAt: new Date().toISOString(),
    autoOpened: true,
  });

  console.log(`✅  Poll reset and opened for next Saturday: ${nextSat}`);
  console.log('='.repeat(50));
})();
```

- [ ] **Step 2: Test locally (dry run)**

```bash
node reset_poll.js
```

Run on a weekday — expected output:
```
🏏  Butchers Cricket — Auto Reset Poll
==================================================
Not a match day (Saturday/Sunday) — skipping poll reset.
==================================================
```

- [ ] **Step 3: Commit**

```bash
git add reset_poll.js
git commit -m "fix: only reset poll on match days, use soft delete for votes"
git push
```

---

### Task 2: Wire `reset_poll.js` into the workflow

**Files:**
- Modify: `.github/workflows/update-milestones.yml`

Add `reset_poll.js` as the final step in the job, after "Update strength scores".

- [ ] **Step 1: Add the reset poll step to the workflow**

Open `.github/workflows/update-milestones.yml` and append this step at the end of the `steps` list:

```yaml
      - name: Reset poll for next match week
        env:
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        run: node reset_poll.js
```

The full file should look like:

```yaml
name: Refresh Stats

on:
  schedule:
    # 9:30 AM PT (UTC-7) = 16:30 UTC, Sat & Sun
    - cron: '30 16 * * 6,0'
    # 12:00 PM PT (UTC-7) = 19:00 UTC, Sat & Sun
    - cron: '0 19 * * 6,0'
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install firebase-admin@13

      - name: Generate milestones
        env:
          CC_TOKEN: ${{ secrets.CC_TOKEN }}
        run: node generate_milestones.js

      - name: Commit and push if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add milestones.json
          if git diff --cached --quiet; then
            echo "No changes to milestones.json — skipping commit"
          else
            git commit -m "chore: refresh milestones.json"
            git push
          fi

      - name: Update strength scores
        env:
          CC_TOKEN: ${{ secrets.CC_TOKEN }}
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        run: node update_points.js

      - name: Reset poll for next match week
        env:
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        run: node reset_poll.js
```

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/update-milestones.yml
git commit -m "feat: auto-reset poll on match days via GitHub Actions"
git push
```

- [ ] **Step 3: Verify via manual trigger**

Go to `https://github.com/karkhile/butchers-cricket` → Actions → "Refresh Stats" → Run workflow → Run workflow.

Watch the run. The "Reset poll for next match week" step should appear. Since today is not Saturday or Sunday, expected output in the step logs:
```
Not a match day (Saturday/Sunday) — skipping poll reset.
```

All steps should be green.
