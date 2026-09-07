#!/usr/bin/env node
// Removes votes from Firestore where the player name is not in the ROSTER.
// Run with: node clean_votes.js
// Pass --dry-run to preview without deleting.

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore }        = require('firebase-admin/firestore');

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const ROSTER = new Set([
  'Aakash Agnihotri',
  'Abhishek Kumar Singh',
  'Abhishek Lingwal',
  'Ajay Joy',
  'Akashdeep Balu',
  'Akshay Garg',
  'Aman Kohli',
  'Anil Mallapur',
  'Anjan Kumar',
  'Ankit Agarwal',
  'Arpan Dey',
  'Arjun Deb',
  'Arjun Shukla',
  'Ashish Chanchalani',
  'Chaitanya Teja Golla',
  'Eshwar Chaitanya Sarampati',
  'Gaurav Kumar',
  'Gaurav Mehta',
  'Hari Vangipuram',
  'Harsha Vardhan Reddy Vndavally',
  'Jay Shah',
  'Jimit Majmudar',
  'Kaushal Karkera',
  'Kunal Kokate',
  'Lokesh Bala',
  'Meet Dhabalia',
  'Mithal Kothari',
  'Mohan Challa',
  'Piyush Jha',
  'Prashant Kumar',
  'Praveen Karkhile',
  'Rajeev Tirumala',
  'Rijwan Rana',
  'Rohit Sharma',
  'Samir Savla',
  'Santosh Ghosh',
  'Shashank Dube',
  'Shivang Sharma',
  'Shriganesh Shintre',
  'Smit Paul',
  'Soumya Smruti Mishra',
  'Srinath Shah',
  'Subham Satapathy',
  'Sylvestor George',
  'Tarang Thapa',
  'Tarun Joshi',
  'Venkata Krishna Ravi',
  'Vignesh Ganguly',
  'Vinay Bharbhari',
  'Vivek Garg',
  'Yash Mehta',
]);

const dryRun = process.argv.includes('--dry-run');

(async () => {
  const snap = await db.collection('votes').get();
  const invalid = [];

  snap.forEach(doc => {
    const name = doc.data().player || doc.id;
    if (!ROSTER.has(name)) invalid.push({ id: doc.id, name });
  });

  if (!invalid.length) {
    console.log('No invalid votes found.');
    return;
  }

  console.log(`Found ${invalid.length} invalid vote(s):`);
  invalid.forEach(v => console.log(`  [${v.id}] player: "${v.name}"`));

  if (dryRun) {
    console.log('\nDry run — nothing deleted. Remove --dry-run to delete.');
    return;
  }

  for (const v of invalid) {
    await db.collection('votes').doc(v.id).delete();
    console.log(`Deleted: ${v.id}`);
  }
  console.log('Done.');
})();
