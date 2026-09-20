#!/usr/bin/env node
// Clears current week's votes and opens poll for next Saturday.
// Only runs on Saturdays and Sundays — skips all other days.
// Detects US long weekends and adds Friday/Monday to extraDates.

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
  sat.setUTCHours(0, 0, 0, 0);
  return sat;
}

// Returns YYYY-MM-DD string for a Date
function ymd(d) { return d.toISOString().slice(0, 10); }

// US Federal holidays that can create a long weekend adjacent to Sat/Sun.
// Returns a Set of YYYY-MM-DD strings for the given year.
function usFederalHolidays(year) {
  const holidays = new Set();
  const add = (m, d) => holidays.add(`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);

  // Fixed-date holidays (observed Mon if Sun, Fri if Sat)
  const fixed = [
    [1, 1],   // New Year's Day
    [6, 19],  // Juneteenth
    [7, 4],   // Independence Day
    [11, 11], // Veterans Day
    [12, 25], // Christmas
  ];
  for (const [m, d] of fixed) {
    const date = new Date(Date.UTC(year, m - 1, d));
    const dow = date.getUTCDay();
    if (dow === 0) { // Sunday → observed Monday
      add(m, d + 1);
    } else if (dow === 6) { // Saturday → observed Friday
      add(m, d - 1);
    } else {
      add(m, d);
    }
  }

  // Monday-based floating holidays
  function nthMonday(month, n) {
    const d = new Date(Date.UTC(year, month - 1, 1));
    const dow = d.getUTCDay();
    const first = dow <= 1 ? 1 + (1 - dow + 7) % 7 : 1 + (8 - dow);
    return first + (n - 1) * 7;
  }
  function lastMonday(month) {
    const last = new Date(Date.UTC(year, month, 0)); // last day of month
    const dow = last.getUTCDay();
    return last.getUTCDate() - ((dow + 6) % 7);
  }

  add(1,  nthMonday(1, 3));   // MLK Day — 3rd Mon Jan
  add(2,  nthMonday(2, 3));   // Presidents Day — 3rd Mon Feb
  add(5,  lastMonday(5));     // Memorial Day — last Mon May
  add(9,  nthMonday(9, 1));   // Labor Day — 1st Mon Sep
  add(10, nthMonday(10, 2));  // Columbus Day — 2nd Mon Oct
  add(11, nthMonday(11, 4));  // Thanksgiving Thursday — 4th Thu Nov (not Mon but many take Fri)

  return holidays;
}

// Returns array of extra day keys ('friday', 'monday') for a long weekend
function getExtraDays(sat) {
  const year = sat.getUTCFullYear();
  const holidays = usFederalHolidays(year);

  const fri = new Date(sat); fri.setUTCDate(sat.getUTCDate() - 1);
  const mon = new Date(sat); mon.setUTCDate(sat.getUTCDate() + 2);

  const extra = [];
  if (holidays.has(ymd(fri))) extra.push('friday');
  if (holidays.has(ymd(mon))) extra.push('monday');
  return extra;
}

(async () => {
  console.log('\n🏏  Butchers Cricket — Auto Reset Poll');
  console.log('='.repeat(50));

  const todayUTCDay = new Date().getUTCDay();
  // Run on Sunday (0) always, or Monday (1) only if it's a long weekend holiday
  if (todayUTCDay === 1) {
    // Monday — only proceed if today is a US federal holiday (long weekend)
    const todayStr = ymd(new Date());
    const holidays = usFederalHolidays(new Date().getUTCFullYear());
    if (!holidays.has(todayStr)) {
      console.log('Monday but not a holiday — skipping poll reset.');
      console.log('='.repeat(50));
      process.exit(0);
    }
  } else if (todayUTCDay !== 0) {
    console.log('Not a match day end (Sunday/Monday holiday) — skipping poll reset.');
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

  const sat = nextSaturday();
  const nextSat = ymd(sat);
  const extraDays = getExtraDays(sat);

  await db.collection('config').doc('poll').set({
    open: true,
    satDate: nextSat,
    extraDates: extraDays,
    updatedAt: new Date().toISOString(),
    autoOpened: true,
  });

  if (extraDays.length) {
    console.log(`✅  Poll reset for long weekend ${nextSat} — extra days: ${extraDays.join(', ')}`);
  } else {
    console.log(`✅  Poll reset and opened for next Saturday: ${nextSat}`);
  }
  console.log('='.repeat(50));
})();
