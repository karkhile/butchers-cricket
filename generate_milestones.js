#!/usr/bin/env node
// Computes upcoming batting/bowling/fielding milestones and writes milestones.json
const { getAllMatchesAllSeries, apiGet } = require('./config');
const fs = require('fs');

// Fine-grained milestones (all view)
const RUN_MILESTONES      = [100,150,200,250,300,350,400,450,500,550,600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1600,1700,1800,1900,2000];
const WKTS_MILESTONES     = [10,15,20,25,30,40,50,60,70,75,80,90,100];
const CATCH_MILESTONES    = [5,10,15,20,25,30,40,50];
const KEEPERCT_MILESTONES = [5,10,15,20,25,30,40,50];
const STUMPING_MILESTONES = [1,5,10,15,20];
const RUNOUT_MILESTONES   = [3,5,10,15,20];
const FOURS_MILESTONES    = [25,50,75,100,125,150,200,250,300];
const SIXES_MILESTONES    = [10,20,30,40,50,75,100];

// Fastest milestone thresholds
const FAST_RUN      = [100,500,1000,1500,2000];
const FAST_WKTS     = [25,50,100,150,200,250];
const FAST_CATCH    = [10,20,30,50];
const FAST_STUMPING = [1,5,10,15,20];
const FAST_RUNOUT   = [5,10,15,20];
const FAST_FOURS    = [50,100,150,200];
const FAST_SIXES    = [10,25,50];

const RUN_BIG      = [250,500,750,1000,1250,1500,2000];
const WKTS_BIG     = [25,50,75,100];
const CATCH_BIG    = [10,20,30,50];
const KEEPERCT_BIG = [10,20,30,50];
const STUMPING_BIG = [1,5,10,20];
const FOURS_BIG    = [50,100,150,200,300];
const SIXES_BIG    = [10,25,50,100];
const RUNOUT_BIG   = [5,10,20];

// Windows for fine-grained
const RUN_WINDOW      = 50;
const WKT_WINDOW      = 5;
const CATCH_WINDOW    = 2;
const KEEPERCT_WINDOW = 2;
const STUMPING_WINDOW = 1;
const RUNOUT_WINDOW   = 1;
const FOURS_WINDOW    = 10;
const SIXES_WINDOW    = 5;

// Windows for big milestones
const RUN_BIG_WINDOW      = 100;
const WKTS_BIG_WINDOW     = 10;
const CATCH_BIG_WINDOW    = 5;
const KEEPERCT_BIG_WINDOW = 5;
const STUMPING_BIG_WINDOW = 1;
const RUNOUT_BIG_WINDOW   = 3;
const FOURS_BIG_WINDOW    = 20;
const SIXES_BIG_WINDOW    = 5;

const isJunk = name =>
  !name || name === 'null' || name.includes('Dummy') || name.includes('Guest') ||
  name.includes('Substitute') || name.includes('Sub)') || name.startsWith('&#');

function parseFielder(raw, howOut) {
  if (howOut === 'ct' || howOut === 'ctw') {
    // "c&b Kaushal K" — caught and bowled, bowler is the catcher
    if (/^c&b\s+/i.test(raw)) return raw.replace(/^c&b\s+/i, '').trim();
    // "c Srinath S b Akashdeep B" or "c &#8224;Yash M b Akashdeep B"
    const mx = raw.match(/^c\s+(.+?)\s+b\s+/i);
    return mx ? mx[1].replace(/&#\d+;/g, '').trim() : '';
  }
  if (howOut === 'st') {
    // "St Eshwar Chaitanya S b Gaurav M"
    const mx = raw.match(/^st\s+(.+?)\s+b\s+/i);
    return mx ? mx[1].trim() : '';
  }
  if (howOut === 'ro') {
    // "run out (Yash M)" or "run out (A/B)"
    const mx = raw.match(/run\s+out\s*\((.+?)\)/i);
    return mx ? mx[1].trim() : '';
  }
  return '';
}

(async () => {
  const matchesRaw = await getAllMatchesAllSeries();
  // Reverse to chronological order (oldest first) for fastest-milestone tracking
  const matches = [...matchesRaw].reverse();
  console.log('Total matches:', matches.length);
  const batters = {}, bowlers = {}, catches = {}, keeperCt = {}, stumpings = {}, runouts = {};
  const foursMap = {}, sixesMap = {};

  // Fastest milestone tracking: { playerName: { hits: { threshold: playerMatchCount } } }
  // playerMatchCount = number of matches the player personally appeared in (not global match number)
  const fastBat = {}, fastBowl = {}, fastFieldCt = {}, fastKeeperCt = {}, fastTotalCatch = {}, fastStumping = {}, fastRunOut = {}, fastFours = {}, fastSixes = {};
  // Per-player match appearance counters
  const playerMatchCount = {};

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const matchId = m.scoreSummary?.matchId || m.fixtureId;
    if (!matchId) continue;
    // Track which players appeared in this match so we increment their counter once
    const seenInMatch = new Set();
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
          foursMap[name] = (foursMap[name] || 0) + (parseInt(b.fours) || 0);
          sixesMap[name] = (sixesMap[name] || 0) + (parseInt(b.sixers) || 0);
          seenInMatch.add(name);

          // Fastest batting — use this player's own match count
          if (!fastBat[name]) fastBat[name] = { hits: {} };
          const batMatchNum = (playerMatchCount[name] || 0) + 1; // +1 because seenInMatch not yet flushed
          for (const t of FAST_RUN) {
            if (!fastBat[name].hits[t] && batters[name] >= t) fastBat[name].hits[t] = batMatchNum;
          }
          if (!fastFours[name]) fastFours[name] = { hits: {} };
          for (const t of FAST_FOURS) {
            if (!fastFours[name].hits[t] && foursMap[name] >= t) fastFours[name].hits[t] = batMatchNum;
          }
          if (!fastSixes[name]) fastSixes[name] = { hits: {} };
          for (const t of FAST_SIXES) {
            if (!fastSixes[name].hits[t] && sixesMap[name] >= t) fastSixes[name].hits[t] = batMatchNum;
          }

          if (['ct', 'ctw', 'st', 'ro'].includes(howOut)) {
            const fielder = parseFielder(b.outStringNoLink || '', howOut);
            if (!isJunk(fielder)) {
              if (howOut === 'ct')  catches[fielder]   = (catches[fielder]   || 0) + 1;
              if (howOut === 'ctw') keeperCt[fielder]  = (keeperCt[fielder]  || 0) + 1;
              if (howOut === 'st')  stumpings[fielder] = (stumpings[fielder] || 0) + 1;
              if (howOut === 'ro')  runouts[fielder]   = (runouts[fielder]   || 0) + 1;
              seenInMatch.add(fielder);

              const fMatchNum = (playerMatchCount[fielder] || 0) + 1;
              if (howOut === 'ct') {
                if (!fastFieldCt[fielder]) fastFieldCt[fielder] = { hits: {} };
                for (const t of FAST_CATCH)
                  if (!fastFieldCt[fielder].hits[t] && catches[fielder] >= t) fastFieldCt[fielder].hits[t] = fMatchNum;
              }
              if (howOut === 'ctw') {
                if (!fastKeeperCt[fielder]) fastKeeperCt[fielder] = { hits: {} };
                for (const t of FAST_CATCH)
                  if (!fastKeeperCt[fielder].hits[t] && keeperCt[fielder] >= t) fastKeeperCt[fielder].hits[t] = fMatchNum;
              }
              if (howOut === 'ct' || howOut === 'ctw') {
                if (!fastTotalCatch[fielder]) fastTotalCatch[fielder] = { hits: {} };
                const total = (catches[fielder] || 0) + (keeperCt[fielder] || 0);
                for (const t of FAST_CATCH)
                  if (!fastTotalCatch[fielder].hits[t] && total >= t) fastTotalCatch[fielder].hits[t] = fMatchNum;
              }
              if (howOut === 'st') {
                if (!fastStumping[fielder]) fastStumping[fielder] = { hits: {} };
                for (const t of FAST_STUMPING)
                  if (!fastStumping[fielder].hits[t] && stumpings[fielder] >= t) fastStumping[fielder].hits[t] = fMatchNum;
              }
              if (howOut === 'ro') {
                if (!fastRunOut[fielder]) fastRunOut[fielder] = { hits: {} };
                for (const t of FAST_RUNOUT)
                  if (!fastRunOut[fielder].hits[t] && runouts[fielder] >= t) fastRunOut[fielder].hits[t] = fMatchNum;
              }
            }
          }
        }
        for (const b of (inn.bowling || [])) {
          const name = ((b.firstName || '') + ' ' + (b.lastName || '')).trim();
          if (!name || name.includes('Guest') || name.includes('Dummy')) continue;
          if (!bowlers[name]) bowlers[name] = 0;
          bowlers[name] += parseInt(b.wickets) || 0;
          seenInMatch.add(name);

          // Fastest bowling — use this player's own match count
          if (!fastBowl[name]) fastBowl[name] = { hits: {} };
          const bowlMatchNum = (playerMatchCount[name] || 0) + 1;
          for (const t of FAST_WKTS) {
            if (!fastBowl[name].hits[t] && bowlers[name] >= t) fastBowl[name].hits[t] = bowlMatchNum;
          }
        }
      }
      // After processing all innings, increment match count for every player who appeared
      for (const name of seenInMatch) playerMatchCount[name] = (playerMatchCount[name] || 0) + 1;
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

  // Fastest: for each threshold, rank players by fewest matches to reach it
  const toFastest = (fastMap, thresholds) => {
    return thresholds.map(t => {
      const entries = Object.entries(fastMap)
        .filter(([, v]) => v.hits[t])
        .map(([name, v]) => ({ name, matches: v.hits[t] }))
        .sort((a, b) => a.matches - b.matches)
        .slice(0, 10);
      return { threshold: t, entries };
    }).filter(t => t.entries.length > 0);
  };


  // (i.e. smallest surplus above the last milestone crossed = crossed it most recently)
  const toAchieved = (map, milestones) =>
    Object.entries(map)
      .map(([name, n]) => {
        const crossed = [...milestones].reverse().find(ms => ms <= n);
        if (!crossed) return null;
        return { name, current: n, achieved: crossed, surplus: n - crossed };
      })
      .filter(Boolean)
      .sort((a, b) => a.surplus - b.surplus);

  const totalCatches = {};
  for (const [name, n] of Object.entries(catches))  totalCatches[name] = (totalCatches[name] || 0) + n;
  for (const [name, n] of Object.entries(keeperCt)) totalCatches[name] = (totalCatches[name] || 0) + n;

  const output = {
    updatedAt: new Date().toISOString(),
    batting:      { big: toList(batters,      RUN_BIG,       RUN_BIG_WINDOW),      all: toList(batters,      RUN_MILESTONES,      RUN_WINDOW),      achieved: toAchieved(batters,      RUN_BIG) },
    bowling:      { big: toList(bowlers,      WKTS_BIG,      WKTS_BIG_WINDOW),     all: toList(bowlers,      WKTS_MILESTONES,     WKT_WINDOW),      achieved: toAchieved(bowlers,      WKTS_BIG) },
    fours:        { big: toList(foursMap,     FOURS_BIG,     FOURS_BIG_WINDOW),    all: toList(foursMap,     FOURS_MILESTONES,    FOURS_WINDOW),    achieved: toAchieved(foursMap,     FOURS_BIG) },
    sixes:        { big: toList(sixesMap,     SIXES_BIG,     SIXES_BIG_WINDOW),    all: toList(sixesMap,     SIXES_MILESTONES,    SIXES_WINDOW),    achieved: toAchieved(sixesMap,     SIXES_BIG) },
    totalCatches: { big: toList(totalCatches, CATCH_BIG,     CATCH_BIG_WINDOW),    all: toList(totalCatches, CATCH_MILESTONES,    CATCH_WINDOW),    achieved: toAchieved(totalCatches, CATCH_BIG) },
    catches:      { big: toList(catches,      CATCH_BIG,     CATCH_BIG_WINDOW),    all: toList(catches,      CATCH_MILESTONES,    CATCH_WINDOW),    achieved: toAchieved(catches,      CATCH_BIG) },
    keeperCt:     { big: toList(keeperCt,     KEEPERCT_BIG,  KEEPERCT_BIG_WINDOW), all: toList(keeperCt,     KEEPERCT_MILESTONES, KEEPERCT_WINDOW), achieved: toAchieved(keeperCt,     KEEPERCT_BIG) },
    stumpings:    { big: toList(stumpings,    STUMPING_BIG,  STUMPING_BIG_WINDOW), all: toList(stumpings,    STUMPING_MILESTONES, STUMPING_WINDOW), achieved: toAchieved(stumpings,    STUMPING_BIG) },
    runOuts:      { big: toList(runouts,      RUNOUT_BIG,    RUNOUT_BIG_WINDOW),   all: toList(runouts,      RUNOUT_MILESTONES,   RUNOUT_WINDOW),   achieved: toAchieved(runouts,      RUNOUT_BIG) },
    fastest: {
      batting:     toFastest(fastBat,        FAST_RUN),
      bowling:     toFastest(fastBowl,       FAST_WKTS),
      fours:       toFastest(fastFours,      FAST_FOURS),
      sixes:       toFastest(fastSixes,      FAST_SIXES),
      fieldCatch:  toFastest(fastFieldCt,    FAST_CATCH),
      keeperCatch: toFastest(fastKeeperCt,   FAST_CATCH),
      totalCatch:  toFastest(fastTotalCatch, FAST_CATCH),
      stumpings:   toFastest(fastStumping,   FAST_STUMPING),
      runOuts:     toFastest(fastRunOut,     FAST_RUNOUT),
    },
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
