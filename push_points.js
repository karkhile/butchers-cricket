#!/usr/bin/env node
// Usage: node push_points.js
//
// Pushes the official CricClubs ranking points to Firestore so the admin
// panel's "Refresh Points" button can reload them without redeploying.
//
// Update the POINTS map below whenever CricClubs rankings change, then run:
//   node push_points.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const POINTS = {
  'Anjan Kumar':                    4075,
  'Yash Mehta':                     3442,
  'Gaurav Mehta':                   3060,
  'Prashant Kumar':                 2889,
  'Arpan Dey':                      2835,
  'Abhishek Kumar Singh':           2530,
  'Praveen Karkhile':               2365,
  'Hari Vangipuram':                2235,
  'Arjun Shukla':                   2177,
  'Gaurav Kumar':                   2176,
  'Sylvestor George':               1933,
  'Anil Mallapur':                  1731,
  'Kaushal Karkera':                1725,
  'Vinay Bharbhari':                1627,
  'Soumya Smruti Mishra':           1286,
  'Rijwan Rana':                    1215,
  'Akashdeep Balu':                 1068,
  'Jay Shah':                       1065,
  'Abhishek Lingwal':               1047,
  'Venkata Krishna Ravi':            867,
  'Guest Player-One':                702,
  'Kunal Kokate':                    506,
  'Rohit Sharma':                    437,
  'Lokesh Bala':                     396,
  'Srinath Shah':                    352,
  'Santosh Ghosh':                   345,
  'Rajeev Tirumala':                 339,
  'Guest Player-Two':                330,
  'Arjun Deb':                       321,
  'Harsha Vardhan Reddy Vndavally':  266,
  'Eshwar Chaitanya Sarampati':      241,
  'Mithal Kothari':                  224,
  'Jimit Majmudar':                  146,
  'Piyush Jha':                      143,
  'Shashank Dube':                   139,
  'tarun JOSHI':                     124,
  'Meet Dhabalia':                   112,
  'Ajay Joy':                        108,
  'Ashish Chanchalani':               50,
  'Akshay Garg':                      50,
  'Smit Paul':                        49,
  'Subham Satapathy':                 41,
  'Aman Kohli':                       36,
  'Tarang Thapa':                     27,
  'Mohan Challa':                     27,
  'Ankit Agarwal':                    25,
  'Shivang Sharma':                   16,
  'Shriganesh Shintre':               16,
  'Vignesh Ganguly':                   9,
  'Vivek Garg':                        0,
  'Aakash Agnihotri':                 -2,
};

(async () => {
  console.log('\n🏏  Butchers Cricket — Push Official Points to Firestore');
  console.log('='.repeat(50));
  console.log(`Pushing ${Object.keys(POINTS).length} players...`);
  await db.collection('config').doc('strength').set({
    scores: POINTS,
    updatedAt: new Date().toISOString(),
    source: 'official-cricclubs-rankings',
  });
  console.log('✅  Done! Admin panel Refresh Points will now load these values.');
  console.log('='.repeat(50));
})();

