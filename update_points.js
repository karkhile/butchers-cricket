#!/usr/bin/env node
// Usage: node update_points.js
//
// Fetches all CricClubs match scorecards, computes per-player strength scores,
// and saves them to Firestore at config/strength so admin.html picks them up.
//
// Run this every Sunday after games finish (e.g. 1:00 PM).

const { makeToken, apiGet, getAllMatchesAllSeries, TOKEN, LEAGUE_ID } = require('./config');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialise firebase-admin — use env var in CI, fall back to local key file
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function firestoreSet(docPath, data) {
  const parts = docPath.split('/');
  await db.collection(parts[0]).doc(parts[1]).set(data);
}

// ── Strength computation (same algorithm as game_day.js) ─────────────────────

async function buildStrengthMap(matches) {
  const bat = {}, bowl = {};
  let done = 0;
  for (const m of matches) {
    const matchId = m.scoreSummary?.matchId || m.fixtureId;
    try {
      const root = (await apiGet('series/match/' + matchId + '/scorecard')).data || {};
      for (const key of ['innings1', 'innings2', 'innings3', 'innings4']) {
        const inn = root[key];
        if (!inn) continue;
        for (const b of (inn.batting || [])) {
          const name = (b.playerName || '').trim();
          if (!name || name.includes('Guest') || name.includes('Dummy')) continue;
          const howOut = (b.howOut || '').toLowerCase();
          if (['ab', ''].includes(howOut)) continue;
          const outStr = (b.outStringNoLink || '').toLowerCase();
          const notOut = ((!b.isOut || b.isOut === '0') && outStr === 'not out') || ['rtno','rt','rto'].includes(howOut);
          const runs = parseInt(b.runsScored) || 0, balls = parseInt(b.ballsFaced) || 0;
          if (!bat[name]) bat[name] = { runs:0, balls:0, outs:0, innings:0 };
          bat[name].runs += runs; bat[name].balls += balls; bat[name].innings++;
          if (!notOut) bat[name].outs++;
        }
        for (const b of (inn.bowling || [])) {
          const name = ((b.firstName || '') + ' ' + (b.lastName || '')).trim();
          if (!name || name.includes('Guest') || name.includes('Dummy')) continue;
          const wkts = parseInt(b.wickets) || 0, runs = parseInt(b.runs) || 0, balls = parseInt(b.balls) || 0;
          if (!bowl[name]) bowl[name] = { wkts:0, runs:0, balls:0 };
          bowl[name].wkts += wkts; bowl[name].runs += runs; bowl[name].balls += balls;
        }
      }
    } catch(e) {}
    done++;
    process.stdout.write(`\r  Processed ${done}/${matches.length} matches...`);
  }
  process.stdout.write('\n');

  const batAvgs    = Object.values(bat).filter(s => s.outs >= 5).map(s => s.runs / s.outs);
  const leagueBat  = batAvgs.length ? batAvgs.reduce((a, b) => a + b) / batAvgs.length : 15;
  const bowlAvgs   = Object.values(bowl).filter(s => s.wkts >= 5).map(s => s.runs / s.wkts);
  const leagueBowl = bowlAvgs.length ? bowlAvgs.reduce((a, b) => a + b) / bowlAvgs.length : 20;

  const strength = {};
  for (const name of new Set([...Object.keys(bat), ...Object.keys(bowl)])) {
    let score = 50;
    const b = bat[name], bw = bowl[name];
    if (b && b.outs >= 3) {
      score += (b.runs / b.outs / leagueBat - 1) * 25;
      score += (b.balls > 0 ? b.runs / b.balls * 100 : 80) / 100 * 10 - 10;
    }
    if (bw && bw.wkts >= 3) score += (leagueBowl / (bw.runs / bw.wkts) - 1) * 20;
    strength[name] = Math.max(1, Math.round(score));
  }
  return strength;
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n🏏  Butchers Cricket — Points Updater');
  console.log('='.repeat(50));

  console.log('\nFetching all matches...');
  const matches = await getAllMatchesAllSeries();
  console.log(`Found ${matches.length} matches.`);

  console.log('\nComputing strength scores from scorecards...');
  const strength = await buildStrengthMap(matches);

  const sorted = Object.entries(strength).sort((a, b) => b[1] - a[1]);
  console.log('\nTop 10 players:');
  sorted.slice(0, 10).forEach(([name, pts], i) =>
    console.log(`  ${String(i+1).padStart(2)}. ${name.padEnd(30)} ${pts}`)
  );

  console.log('\nWriting to Firestore config/strength...');
  await firestoreSet('config/strength', {
    scores: strength,
    updatedAt: new Date().toISOString(),
    matchCount: matches.length,
  });

  console.log('✅  Done! Admin panel will use updated scores on next load.');
  console.log('='.repeat(50));
})();
