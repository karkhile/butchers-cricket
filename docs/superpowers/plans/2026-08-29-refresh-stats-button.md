# Refresh Stats Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single "Refresh Stats" button to `admin.html` that triggers a GitHub Actions workflow to regenerate `milestones.json` and update player strength scores in Firestore, using a PAT stored in Firestore.

**Architecture:** The existing `update-milestones.yml` workflow is extended to also run `update_points.js`. A PAT is stored in Firestore at `config/github.pat`. The `admin.html` button fetches the PAT from Firestore, then POSTs to the GitHub Actions `workflow_dispatch` API. The existing "Refresh Points" button and function are removed.

**Tech Stack:** GitHub Actions, Node.js 20, Firebase Firestore (firebase-admin for workflow, browser Firebase SDK in admin.html), GitHub REST API

---

### Task 1: Add `FIREBASE_SERVICE_ACCOUNT` to GitHub Secrets

**Files:**
- No files — GitHub UI step

- [ ] **Step 1: Get the service account JSON**

Open `/Users/i859332/IdeaProjects/Personal/butchers-cricket/serviceAccountKey.json` and copy its entire contents (the raw JSON string).

- [ ] **Step 2: Add secret to GitHub**

Go to: `https://github.com/karkhile/butchers-cricket` → Settings → Secrets and variables → Actions → New repository secret.

Name: `FIREBASE_SERVICE_ACCOUNT`
Value: paste the full JSON contents of `serviceAccountKey.json`

Click "Add secret".

- [ ] **Step 3: Verify**

The secret should appear in the list as `FIREBASE_SERVICE_ACCOUNT`.

---

### Task 2: Update the workflow to also run `update_points.js`

**Files:**
- Modify: `.github/workflows/update-milestones.yml`

- [ ] **Step 1: Replace the entire workflow file contents**

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
        run: npm install firebase-admin

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
```

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/update-milestones.yml
git commit -m "feat: extend workflow to also run update_points.js"
git push
```

- [ ] **Step 3: Verify workflow runs both scripts**

Go to `https://github.com/karkhile/butchers-cricket` → Actions → "Refresh Stats" → Run workflow → Run workflow.

Watch the run. Confirm both "Generate milestones" and "Update strength scores" steps complete green.

---

### Task 3: Store GitHub PAT in Firestore

**Files:**
- No code files — Firestore data entry

- [ ] **Step 1: Create a GitHub PAT**

Go to: `https://github.com/settings/tokens` → Generate new token (classic).

Settings:
- Note: `butchers-cricket-refresh`
- Expiration: No expiration (or 1 year)
- Scope: check `workflow` (this includes `actions:write`)

Click "Generate token" and copy the token value (starts with `ghp_`).

- [ ] **Step 2: Save PAT to Firestore**

Go to: Firebase console → Firestore → `config` collection → `github` document (create if it doesn't exist).

Add field:
- Field name: `pat`
- Type: string
- Value: paste the `ghp_...` token

Click Save.

- [ ] **Step 3: Verify**

In Firestore, confirm `config/github` document exists with a `pat` field containing the token.

---

### Task 4: Update `admin.html` — button and CSP

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Add `https://api.github.com` to the CSP `connect-src`**

Find line 6 in `admin.html`:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.gstatic.com https://*.firebaseio.com https://*.googleapis.com https://cdn.jsdelivr.net; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://firestore.googleapis.com https://core-prod-origin.cricclubs.com; style-src 'self' 'unsafe-inline';">
```

Replace with:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.gstatic.com https://*.firebaseio.com https://*.googleapis.com https://cdn.jsdelivr.net; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://firestore.googleapis.com https://core-prod-origin.cricclubs.com https://api.github.com; style-src 'self' 'unsafe-inline';">
```

- [ ] **Step 2: Replace the Refresh Points button HTML**

Find (lines 189-191):
```html
    <button class="btn btn-secondary" id="refreshPtsBtn" onclick="refreshPoints()" style="font-size:13px;padding:8px 14px;">🔄 Refresh Points</button>
    <span id="refreshPtsStatus" style="font-size:12px;color:#9ecfb0;margin-left:10px;"></span>
```

Replace with:
```html
    <button class="btn btn-secondary" id="refreshStatsBtn" onclick="refreshStats()" style="font-size:13px;padding:8px 14px;">🔄 Refresh Stats</button>
    <span id="refreshStatsStatus" style="font-size:12px;color:#9ecfb0;margin-left:10px;"></span>
```

- [ ] **Step 3: Replace the `refreshPoints` function with `refreshStats`**

Find the entire `refreshPoints` function (lines 884-908):
```js
  // ── REFRESH POINTS ────────────────────────────────────────────────────────────
  window.refreshPoints = async function() {
    const btn = document.getElementById('refreshPtsBtn');
    const status = document.getElementById('refreshPtsStatus');
    btn.disabled = true;
    btn.textContent = '⏳ Loading...';
    status.textContent = '';
    try {
      const strengthSnap = await getDoc(doc(db, 'config', 'strength'));
      if (strengthSnap.exists()) {
        const data = strengthSnap.data();
        const scores = data.scores || {};
        for (const [name, pts] of Object.entries(scores)) STRENGTH[name] = pts;
        // Re-render poll with updated points
        renderPoll(window._state.votes, window._state.roster);
        status.textContent = '✓ ' + Object.keys(scores).length + ' players updated (' + (data.updatedAt || '').slice(0, 10) + ')';
      } else {
        status.textContent = 'No updated points in Firestore — run update_points.js locally to push new data.';
      }
    } catch(e) {
      status.textContent = '✗ ' + e.message;
    }
    btn.textContent = '🔄 Refresh Points';
    btn.disabled = false;
  };
```

Replace with:
```js
  // ── REFRESH STATS ────────────────────────────────────────────────────────────
  window.refreshStats = async function() {
    const btn = document.getElementById('refreshStatsBtn');
    const status = document.getElementById('refreshStatsStatus');
    btn.disabled = true;
    btn.textContent = '⏳ Triggering...';
    status.textContent = '';
    try {
      const githubSnap = await getDoc(doc(db, 'config', 'github'));
      if (!githubSnap.exists() || !githubSnap.data().pat) {
        status.textContent = '✗ No GitHub PAT found in Firestore config/github.pat';
        btn.textContent = '🔄 Refresh Stats';
        btn.disabled = false;
        return;
      }
      const pat = githubSnap.data().pat;
      const res = await fetch(
        'https://api.github.com/repos/karkhile/butchers-cricket/actions/workflows/update-milestones.yml/dispatches',
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + pat,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ref: 'main' }),
        }
      );
      if (res.status === 204) {
        status.textContent = '✓ Refresh triggered — check back in ~2 minutes';
      } else {
        const body = await res.json().catch(() => ({}));
        status.textContent = '✗ GitHub API error ' + res.status + ': ' + (body.message || 'unknown');
      }
    } catch(e) {
      status.textContent = '✗ ' + e.message;
    }
    btn.textContent = '🔄 Refresh Stats';
    btn.disabled = false;
  };
```

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat: replace Refresh Points button with Refresh Stats (triggers GitHub Actions)"
git push
```

---

### Task 5: Verify end-to-end

**Files:**
- No file changes — verification only

- [ ] **Step 1: Open admin page**

Open `https://karkhile.github.io/butchers-cricket/admin.html` (or via `node proxy.js` locally at `http://localhost:3131/admin`).

Log in with admin credentials.

- [ ] **Step 2: Click "Refresh Stats"**

The button should show "⏳ Triggering..." briefly, then show "✓ Refresh triggered — check back in ~2 minutes".

- [ ] **Step 3: Verify workflow ran**

Go to `https://github.com/karkhile/butchers-cricket` → Actions → "Refresh Stats". A new run should appear triggered by `workflow_dispatch`.

- [ ] **Step 4: Confirm both scripts ran**

Click into the run. Confirm "Generate milestones" and "Update strength scores" steps both completed green.
