#!/usr/bin/env node
// Clears current week's votes and opens poll for next Saturday.
// Run automatically by GitHub Actions after each match day.

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function nextSaturday() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 6=Sat
  const daysUntil = day === 6 ? 7 : (6 - day) || 7;
  const sat = new Date(now);
  sat.setDate(now.getDate() + daysUntil);
  return sat.toISOString().slice(0, 10);
}

(async () => {
  console.log('\n🏏  Butchers Cricket — Auto Reset Poll');
  console.log('='.repeat(50));

  const pollSnap = await db.collection('config').doc('poll').get();
  const currentWeek = pollSnap.exists ? pollSnap.data().satDate : null;
  console.log('Current week:', currentWeek || 'none');

  if (currentWeek) {
    const votesSnap = await db.collection('votes').get();
    const stale = votesSnap.docs.filter(d => d.data().week === currentWeek);
    await Promise.all(stale.map(d => d.ref.delete()));
    console.log(`Deleted ${stale.length} votes for week ${currentWeek}`);
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
