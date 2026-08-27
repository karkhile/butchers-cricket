#!/usr/bin/env node
// Computes upcoming batting/bowling/fielding milestones and writes milestones.json
const { getAllMatchesAllSeries, apiGet } = require('./config');
const fs = require('fs');

const RUN_MILESTONES    = [100,150,200,250,300,350,400,450,500,550,600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1600,1700,1800,1900,2000];
const WKTS_MILESTONES   = [10,15,20,25,30,40,50,60,70,75,80,90,100];
const CATCH_MILESTONES  = [5,10,15,20,25,30,40,50];
const KEEPER_MILESTONES = [5,10,15,20,25,30,40,50];
const RUNOUT_MILESTONES = [3,5,10,15,20];

const RUN_WINDOW    = 50;
const WKT_WINDOW    = 5;
const CATCH_WINDOW  = 2;
const KEEPER_WINDOW = 2;
const RUNOUT_WINDOW = 1;

const isJunk = name =>
  !name || name.includes('Dummy') || name.includes('Guest') ||
  name.includes('Substitute') || name.includes('Sub)') || name.startsWith('&#');

(async () => {
  const matches = await getAllMatchesAllSeries();
  console.log('Total matches:', matches.length);
  const batters = {}, bowlers = {}, catches = {}, keeper = {}, runouts = {};

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

          const raw = b.outStringNoLink || '';

          if (howOut === 'ct') {
            // "c Srinath S b Akashdeep B"
            const mx = raw.match(/^c\s+(.+?)\s+b\s+/i);
            const fielder = mx ? mx[1].trim() : '';
            if (!isJunk(fielder)) catches[fielder] = (catches[fielder] || 0) + 1;
          }

          if (howOut === 'ctw') {
            // "c &#8224;Yash M b Akashdeep B" — keeper is Player1
            // parse same pattern; keeper is the catcher
            const mx = raw.match(/^c\s+(.+?)\s+b\s+/i);
            const k = mx ? mx[1].replace(/&#\d+;/g, '').trim() : '';
            if (!isJunk(k)) keeper[k] = (keeper[k] || 0) + 1;
          }

          if (howOut === 'st') {
            // "St Eshwar Chaitanya S b Gaurav M"
            const mx = raw.match(/^st\s+(.+?)\s+b\s+/i);
            const k = mx ? mx[1].trim() : '';
            if (!isJunk(k)) keeper[k] = (keeper[k] || 0) + 1;
          }

          if (howOut === 'ro') {
            // "run out (Yash M)" or "run out (A/B)"
            const mx = raw.match(/run\s+out\s*\((.+?)\)/i);
            const fielder = mx ? mx[1].trim() : '';
            if (!isJunk(fielder)) runouts[fielder] = (runouts[fielder] || 0) + 1;
          }
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

  const output = {
    updatedAt: new Date().toISOString(),
    batting:  toList(batters,  RUN_MILESTONES,    RUN_WINDOW),
    bowling:  toList(bowlers,  WKTS_MILESTONES,   WKT_WINDOW),
    catches:  toList(catches,  CATCH_MILESTONES,  CATCH_WINDOW),
    keeper:   toList(keeper,   KEEPER_MILESTONES, KEEPER_WINDOW),
    runOuts:  toList(runouts,  RUNOUT_MILESTONES, RUNOUT_WINDOW),
  };

  fs.writeFileSync('milestones.json', JSON.stringify(output, null, 2));
  console.log('milestones.json written —',
    output.batting.length, 'batting,',
    output.bowling.length, 'bowling,',
    output.catches.length, 'catches,',
    output.keeper.length,  'keeper,',
    output.runOuts.length, 'run-outs'
  );
})();
