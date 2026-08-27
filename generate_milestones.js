#!/usr/bin/env node
// Computes upcoming batting/bowling/fielding milestones and writes milestones.json
const { getAllMatchesAllSeries, apiGet } = require('./config');
const fs = require('fs');

// Fine-grained milestones (all view)
const RUN_MILESTONES    = [100,150,200,250,300,350,400,450,500,550,600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1600,1700,1800,1900,2000];
const WKTS_MILESTONES   = [10,15,20,25,30,40,50,60,70,75,80,90,100];
const CATCH_MILESTONES   = [5,10,15,20,25,30,40,50];
const KEEPERCT_MILESTONES = [5,10,15,20,25,30,40,50];
const STUMPING_MILESTONES = [3,5,10,15,20];
const RUNOUT_MILESTONES  = [3,5,10,15,20];

// Big milestones only (default view)
const RUN_BIG    = [250,500,750,1000,1250,1500,2000];
const WKTS_BIG   = [25,50,75,100];
const CATCH_BIG    = [10,20,30,50];
const KEEPERCT_BIG  = [10,20,30,50];
const STUMPING_BIG  = [3,5,10,20];
const RUNOUT_BIG   = [5,10,20];

// Windows for fine-grained
const RUN_WINDOW    = 50;
const WKT_WINDOW    = 5;
const CATCH_WINDOW    = 2;
const KEEPERCT_WINDOW  = 2;
const STUMPING_WINDOW  = 1;
const RUNOUT_WINDOW   = 1;

// Windows for big milestones (looser — show who's approaching)
const RUN_BIG_WINDOW      = 100;
const WKTS_BIG_WINDOW     = 10;
const CATCH_BIG_WINDOW    = 5;
const KEEPERCT_BIG_WINDOW  = 5;
const STUMPING_BIG_WINDOW  = 2;
const RUNOUT_BIG_WINDOW   = 3;

const isJunk = name =>
  !name || name === 'null' || name.includes('Dummy') || name.includes('Guest') ||
  name.includes('Substitute') || name.includes('Sub)') || name.startsWith('&#');

// Fielding stats from CricClubs (updated manually — parsing out-strings misses ~15% of entries)
// Source: CricClubs league fielding page — last updated 2026-08-27
const FIELDING = {
  'Abhishek Kumar Singh':          { ct: 43, ctw: 35, directRO: 2,  indirectRO: 7,  st: 4  },
  'Yash Mehta':                    { ct:  8, ctw: 52, directRO: 7,  indirectRO: 8,  st: 0  },
  'Sylvestor George':              { ct: 59, ctw:  1, directRO: 1,  indirectRO: 8,  st: 2  },
  'Anil Mallapur':                 { ct:  9, ctw: 39, directRO: 6,  indirectRO: 5,  st: 3  },
  'Anjan Kumar':                   { ct: 31, ctw:  9, directRO: 15, indirectRO: 5,  st: 0  },
  'Arjun Shukla':                  { ct: 17, ctw: 21, directRO: 5,  indirectRO: 10, st: 3  },
  'Hari Vangipuram':               { ct: 17, ctw: 12, directRO: 3,  indirectRO: 8,  st: 2  },
  'Praveen Karkhile':              { ct: 34, ctw:  0, directRO: 3,  indirectRO: 4,  st: 0  },
  'Prashant Kumar':                { ct: 17, ctw:  6, directRO: 7,  indirectRO: 9,  st: 0  },
  'Arpan Dey':                     { ct: 24, ctw:  3, directRO: 4,  indirectRO: 5,  st: 1  },
  'Gaurav Mehta':                  { ct: 23, ctw:  5, directRO: 4,  indirectRO: 3,  st: 0  },
  'Gaurav Kumar':                  { ct: 27, ctw:  0, directRO: 2,  indirectRO: 3,  st: 0  },
  'Kaushal Karkera':               { ct: 19, ctw:  2, directRO: 4,  indirectRO: 1,  st: 0  },
  'Vinay Bharbhari':               { ct: 18, ctw:  1, directRO: 3,  indirectRO: 3,  st: 0  },
  'Soumya Smruti Mishra':          { ct: 13, ctw:  6, directRO: 3,  indirectRO: 2,  st: 0  },
  'Jay Shah':                      { ct: 14, ctw:  0, directRO: 2,  indirectRO: 2,  st: 0  },
  'Abhishek Lingwal':              { ct: 13, ctw:  1, directRO: 0,  indirectRO: 4,  st: 0  },
  'Venkata Krishna Ravi':          { ct: 15, ctw:  0, directRO: 1,  indirectRO: 1,  st: 0  },
  'Rijwan Rana':                   { ct: 13, ctw:  1, directRO: 1,  indirectRO: 1,  st: 0  },
  'Eshwar Chaitanya Sarampati':    { ct:  1, ctw:  5, directRO: 0,  indirectRO: 1,  st: 2  },
  'Lokesh Bala':                   { ct:  6, ctw:  0, directRO: 1,  indirectRO: 1,  st: 1  },
  'Akashdeep Balu':                { ct:  5, ctw:  0, directRO: 1,  indirectRO: 2,  st: 0  },
  'Arjun Deb':                     { ct:  7, ctw:  0, directRO: 0,  indirectRO: 1,  st: 0  },
  'Rajeev Tirumala':               { ct:  3, ctw:  0, directRO: 1,  indirectRO: 4,  st: 0  },
  'Rohit Sharma':                  { ct:  7, ctw:  0, directRO: 0,  indirectRO: 0,  st: 0  },
  'Kunal Kokate':                  { ct:  5, ctw:  0, directRO: 0,  indirectRO: 2,  st: 0  },
  'Piyush Jha':                    { ct:  4, ctw:  0, directRO: 2,  indirectRO: 0,  st: 0  },
  'Meet Dhabalia':                 { ct:  3, ctw:  1, directRO: 2,  indirectRO: 0,  st: 0  },
  'Srinath Shah':                  { ct:  5, ctw:  0, directRO: 0,  indirectRO: 1,  st: 0  },
  'Harsha Vardhan Reddy Vndavally':{ ct:  3, ctw:  0, directRO: 2,  indirectRO: 0,  st: 0  },
  'Jimit Majmudar':                { ct:  1, ctw:  0, directRO: 2,  indirectRO: 1,  st: 0  },
  'Subham Satapathy':              { ct:  3, ctw:  0, directRO: 1,  indirectRO: 0,  st: 0  },
  'Santosh Ghosh':                 { ct:  2, ctw:  0, directRO: 1,  indirectRO: 0,  st: 0  },
  'Ajay Joy':                      { ct:  3, ctw:  0, directRO: 0,  indirectRO: 0,  st: 0  },
  'tarun JOSHI':                   { ct:  2, ctw:  0, directRO: 0,  indirectRO: 1,  st: 0  },
  'Shriganesh Shintre':            { ct:  1, ctw:  0, directRO: 1,  indirectRO: 0,  st: 0  },
  'Mithal Kothari':                { ct:  2, ctw:  0, directRO: 0,  indirectRO: 0,  st: 0  },
  'Mohan Challa':                  { ct:  0, ctw:  0, directRO: 1,  indirectRO: 0,  st: 0  },
  'Ashish Chanchalani':            { ct:  1, ctw:  0, directRO: 0,  indirectRO: 0,  st: 0  },
  'Shashank Dube':                 { ct:  0, ctw:  0, directRO: 0,  indirectRO: 1,  st: 0  },
  'Chaitanya Teja Golla':          { ct:  0, ctw:  0, directRO: 0,  indirectRO: 1,  st: 0  },
};

(async () => {
  const matches = await getAllMatchesAllSeries();
  console.log('Total matches:', matches.length);
  const batters = {}, bowlers = {};

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const matchId = m.scoreSummary?.matchId || m.fixtureId;
    if (!matchId) continue;
    try {
      const root = (await apiGet('series/match/' + matchId + '/scorecard')).data || {};
      for (const key of ['innings1', 'innings2', 'innings3', 'innings4']) {
        const inn = root[key];
        if (!inn) continue;
        for (const b of (inn.batting || [])) {
          const name = (b.playerName || '').trim();
          if (!name || name.includes('Guest') || name.includes('Dummy')) continue;
          const howOut = (b.howOut || '').toLowerCase();
          const outStr = (b.outStringNoLink || '').toLowerCase();
          if (howOut === 'ab') continue;
          if (outStr === 'dnb' || outStr === 'did not bat') continue;
          if ((parseInt(b.ballsFaced) || 0) === 0 && (parseInt(b.runsScored) || 0) === 0) continue;
          if (!batters[name]) batters[name] = 0;
          batters[name] += parseInt(b.runsScored) || 0;
        }
        for (const b of (inn.bowling || [])) {
          const name = ((b.firstName || '') + ' ' + (b.lastName || '')).trim();
          if (!name || name.includes('Guest') || name.includes('Dummy')) continue;
          if (!bowlers[name]) bowlers[name] = 0;
          bowlers[name] += parseInt(b.wickets) || 0;
        }
      }
    } catch (e) {}
    if ((i + 1) % 20 === 0) process.stdout.write((i + 1) + '/' + matches.length + '\n');
  }

  const nearMilestone = (current, milestones, window) => {
    const next = milestones.find(ms => ms > current);
    if (!next) return null;
    const gap = next - current;
    return gap <= window ? { current, next, gap } : null;
  };

  const toList = (map, milestones, window) =>
    Object.entries(map)
      .map(([name, n]) => { const ms = nearMilestone(n, milestones, window); return ms ? { name, ...ms } : null; })
      .filter(Boolean).sort((a, b) => a.gap - b.gap);

  // Build fielding maps from authoritative FIELDING table
  const catches     = Object.fromEntries(Object.entries(FIELDING).map(([n, f]) => [n, f.ct]));
  const keeperCt    = Object.fromEntries(Object.entries(FIELDING).map(([n, f]) => [n, f.ctw]));
  const stumpings   = Object.fromEntries(Object.entries(FIELDING).map(([n, f]) => [n, f.st]));
  const runouts     = Object.fromEntries(Object.entries(FIELDING).map(([n, f]) => [n, f.directRO + f.indirectRO]));
  const totalCatches = Object.fromEntries(Object.entries(FIELDING).map(([n, f]) => [n, f.ct + f.ctw]));

  const output = {
    updatedAt: new Date().toISOString(),
    batting:      { big: toList(batters,      RUN_BIG,       RUN_BIG_WINDOW),      all: toList(batters,      RUN_MILESTONES,      RUN_WINDOW) },
    bowling:      { big: toList(bowlers,      WKTS_BIG,      WKTS_BIG_WINDOW),     all: toList(bowlers,      WKTS_MILESTONES,     WKT_WINDOW) },
    totalCatches: { big: toList(totalCatches, CATCH_BIG,     CATCH_BIG_WINDOW),    all: toList(totalCatches, CATCH_MILESTONES,    CATCH_WINDOW) },
    catches:      { big: toList(catches,      CATCH_BIG,     CATCH_BIG_WINDOW),    all: toList(catches,      CATCH_MILESTONES,    CATCH_WINDOW) },
    keeperCt:     { big: toList(keeperCt,     KEEPERCT_BIG,  KEEPERCT_BIG_WINDOW), all: toList(keeperCt,     KEEPERCT_MILESTONES, KEEPERCT_WINDOW) },
    stumpings:    { big: toList(stumpings,    STUMPING_BIG,  STUMPING_BIG_WINDOW), all: toList(stumpings,    STUMPING_MILESTONES, STUMPING_WINDOW) },
    runOuts:      { big: toList(runouts,      RUNOUT_BIG,    RUNOUT_BIG_WINDOW),   all: toList(runouts,      RUNOUT_MILESTONES,   RUNOUT_WINDOW) },
  };

  fs.writeFileSync('milestones.json', JSON.stringify(output, null, 2));
  console.log('milestones.json written —',
    output.batting.all.length, 'batting,',
    output.bowling.all.length, 'bowling,',
    output.catches.all.length, 'catches,',
    output.keeperCt.all.length, 'keeper catches,',
    output.stumpings.all.length, 'stumpings,',
    output.runOuts.all.length, 'run-outs'
  );
})();
