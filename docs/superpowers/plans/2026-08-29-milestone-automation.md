# Milestone Auto-Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a GitHub Actions workflow that automatically regenerates `milestones.json` and commits it back to `main` at 9:30 AM and 12:00 PM PT every Saturday and Sunday, plus on-demand via manual trigger.

**Architecture:** A single workflow YAML file under `.github/workflows/` handles all triggers. It checks out the repo, runs `node generate_milestones.js` (which calls the CricClubs API using `CC_TOKEN` from GitHub Secrets), then commits and pushes `milestones.json` only if it changed. No application code changes are needed.

**Tech Stack:** GitHub Actions, Node.js 20, existing `generate_milestones.js`

---

### Task 1: Add `CC_TOKEN` to GitHub Secrets

**Files:**
- No files — this is a GitHub UI step

- [ ] **Step 1: Open repo secrets page**

Go to your GitHub repo → Settings → Secrets and variables → Actions → New repository secret.

- [ ] **Step 2: Add the secret**

Name: `CC_TOKEN`
Value: `1d1f95e3-4b54-4a9b-b388-6472e0c5516a`

Click "Add secret".

- [ ] **Step 3: Verify**

The secret should appear in the list as `CC_TOKEN`. No value is shown — that's expected.

---

### Task 2: Create the GitHub Actions workflow

**Files:**
- Create: `.github/workflows/update-milestones.yml`

- [ ] **Step 1: Create the workflows directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create `.github/workflows/update-milestones.yml`**

```yaml
name: Update Milestones

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
```

- [ ] **Step 3: Commit the workflow**

```bash
git add .github/workflows/update-milestones.yml
git commit -m "feat: auto-refresh milestones.json via GitHub Actions"
git push
```

---

### Task 3: Verify the workflow runs correctly

**Files:**
- No file changes — verification only

- [ ] **Step 1: Trigger manually**

Go to GitHub repo → Actions → "Update Milestones" → Run workflow → Run workflow.

- [ ] **Step 2: Check the run succeeds**

Click into the run. All steps should be green. In the "Commit and push if changed" step, you should see either:
- `"No changes to milestones.json — skipping commit"` (if nothing changed), or
- A push with commit `"chore: refresh milestones.json"`

- [ ] **Step 3: Confirm milestones page still works**

Open `milestones.html` in a browser. Verify it loads data correctly from `milestones.json`.
