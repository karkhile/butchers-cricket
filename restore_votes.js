#!/usr/bin/env node
// Restores votes from backup for a given week.
// Usage: node restore_votes.js 2026-09-20

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

(async () => {
  const week = process.argv[2];
  if (!week) {
    console.error('Usage: node restore_votes.js YYYY-MM-DD');
    process.exit(1);
  }

  const backupSnap = await db.collection('votes_backup').doc(week).get();
  if (!backupSnap.exists) {
    console.error(`No backup found for week ${week}`);
    // List available backups
    const all = await db.collection('votes_backup').get();
    if (all.empty) { console.log('No backups exist yet.'); }
    else { console.log('Available backups:', all.docs.map(d => d.id).join(', ')); }
    process.exit(1);
  }

  const { votes, backedUpAt } = backupSnap.data();
  console.log(`Restoring ${Object.keys(votes).length} votes for week ${week} (backed up ${backedUpAt})`);

  await Promise.all(Object.entries(votes).map(([name, data]) =>
    db.collection('votes').doc(name).set(data)
  ));

  // Also reset poll config to that week
  await db.collection('config').doc('poll').set({
    open: true,
    satDate: week,
    extraDates: [],
    updatedAt: new Date().toISOString(),
    autoOpened: false,
  });

  console.log(`✅  Restored ${Object.keys(votes).length} votes and set poll to ${week}`);
  console.log('Players:', Object.keys(votes).join(', '));
})();
