#!/usr/bin/env node
// Computes upcoming batting/bowling/fielding milestones and writes milestones.json
const { getAllMatchesAllSeries, apiGet, getCommentary } = require('./config');
const fs = require('fs');

// Fine-grained milestones (all view)
const RUN_MILESTONES      = [100,150,200,250,300,350,400,450,500,550,600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1600,1700,1800,1900,2000];
const WKTS_MILESTONES     = [10,15,20,25,30,40,50,60,70,75,80,90,100];
const CATCH_MILESTONES    = [5,10,15,20,25,30,40,50];
const KEEPERCT_MILESTONES = [5,10,15,20,25,30,40,50];
const STUMPING_MILESTONES = [1,5,10,15,20];
const RUNOUT_MILESTONES   = [3,5,10,15,20];
const MOM_MILESTONES      = [1,5,10,15,20,25,30];
const FOURS_MILESTONES    = [25,50,75,100,125,150,200,250,300];
const SIXES_MILESTONES    = [10,20,30,40,50,75,100];

// Fastest milestone thresholds
const FAST_RUN      = [100,500,1000,1500,2000];
const FAST_WKTS     = [25,50,100,150,200,250];
const FAST_CATCH    = [10,20,30,50];
const FAST_STUMPING = [1,5,10,15,20];
const FAST_RUNOUT   = [5,10,15,20];
const FAST_FOURS    = [10,25,50,100,150,200];
const FAST_SIXES    = [10,25,50];
const FAST_MOM      = [1,5,10,15,20];

const RUN_BIG      = [250,500,750,1000,1250,1500,2000];
const WKTS_BIG     = [25,50,75,100];
const CATCH_BIG    = [10,20,30,50];
const KEEPERCT_BIG = [10,20,30,50];
const STUMPING_BIG = [1,5,10,20];
const FOURS_BIG    = [10,25,50,100,150,200,300];
const SIXES_BIG    = [10,25,50,100];
const MOM_BIG      = [1,5,10,15,20,25];
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
const MOM_WINDOW      = 1;

// Windows for big milestones
const RUN_BIG_WINDOW      = 100;
const WKTS_BIG_WINDOW     = 10;
const CATCH_BIG_WINDOW    = 5;
const KEEPERCT_BIG_WINDOW = 5;
const STUMPING_BIG_WINDOW = 1;
const RUNOUT_BIG_WINDOW   = 3;
const FOURS_BIG_WINDOW    = 20;
const SIXES_BIG_WINDOW    = 5;
const MOM_BIG_WINDOW      = 2;

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
  const foursMap = {}, sixesMap = {}, momMap = {};
  const widesMap = {}, noBallsMap = {}, bowlerBalls = {}, dotBallsMap = {}, bowlerMatchCount = {};
  // Rivalries: keyed "batter|bowler"
  const dismissalsByPair = {}, sixesByPair = {}, foursByPair = {};
  const sixesOff = {}, foursOff = {}, commBalls = {};

  // Fastest milestone tracking: { playerName: { hits: { threshold: playerMatchCount } } }
  // playerMatchCount = number of matches the player personally appeared in (not global match number)
  const fastBat = {}, fastBowl = {}, fastFieldCt = {}, fastKeeperCt = {}, fastTotalCatch = {}, fastStumping = {}, fastRunOut = {}, fastFours = {}, fastSixes = {}, fastMom = {};
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

      // Resolve Player of the Match ID to a name via batting/bowling rows
      const momId = root.playerOfTheMatch;
      if (momId) {
        let momName = '';
        outer: for (const key of ['innings1','innings2','innings3','innings4']) {
          for (const b of (root[key]?.batting || [])) {
            if (b.playerID === momId && b.playerName) { momName = b.playerName.trim(); break outer; }
          }
          for (const b of (root[key]?.bowling || [])) {
            if (b.playerID === momId && (b.firstName || b.lastName)) {
              momName = ((b.firstName || '') + ' ' + (b.lastName || '')).trim(); break outer;
            }
          }
        }
        if (momName && !isJunk(momName)) {
          momMap[momName] = (momMap[momName] || 0) + 1;
          seenInMatch.add(momName);
          const momMatchNum = (playerMatchCount[momName] || 0) + 1;
          if (!fastMom[momName]) fastMom[momName] = { hits: {} };
          for (const t of FAST_MOM)
            if (!fastMom[momName].hits[t] && momMap[momName] >= t) fastMom[momName].hits[t] = momMatchNum;
        }
      }

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

          // Dismissals rivalry: extract bowler from outStringNoLink for all bowler-credited dismissals
          if (['b', 'ct', 'ctw', 'st', 'lbw', 'ht'].includes(howOut)) {
            const outRaw = b.outStringNoLink || '';
            let bowlerName = '';
            if (/^c&b\s+/i.test(outRaw)) {
              bowlerName = outRaw.replace(/^c&b\s+/i, '').trim();
            } else if (/^b\s+/i.test(outRaw)) {
              bowlerName = outRaw.replace(/^b\s+/i, '').trim();
            } else if (/^hit\s+wicket\s+/i.test(outRaw)) {
              bowlerName = outRaw.replace(/^hit\s+wicket\s+/i, '').trim();
            } else {
              const bm = outRaw.match(/\sb\s+([^(]+?)(?:\s*$)/i);
              bowlerName = bm ? bm[1].replace(/&#\d+;/g, '').trim() : '';
            }
            if (bowlerName && !isJunk(bowlerName) && !isJunk(name)) {
              const pair = name + '|' + bowlerName;
              dismissalsByPair[pair] = (dismissalsByPair[pair] || 0) + 1;
            }
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
          widesMap[name]   = (widesMap[name]   || 0) + (parseInt(b.wides)    || 0);
          noBallsMap[name] = (noBallsMap[name] || 0) + (parseInt(b.noBalls)  || 0);
          bowlerBalls[name]      = (bowlerBalls[name]      || 0) + (parseInt(b.balls)    || 0);
          dotBallsMap[name]      = (dotBallsMap[name]      || 0) + (parseInt(b.dotBalls) || 0);
          bowlerMatchCount[name] = (bowlerMatchCount[name] || 0) + 1;
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

  // Convert a pair map ("batter|bowler" → count) to sorted top-N list
  const toTopPairs = (pairMap, n = 50) =>
    Object.entries(pairMap)
      .map(([pair, count]) => { const [batter, bowler] = pair.split('|'); return { batter, bowler, count }; })
      .sort((a, b) => b.count - a.count)
      .slice(0, n);

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

  // ── Top overs by runs ────────────────────────────────────────────────────────
  const allOvers = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const matchId = m.scoreSummary?.matchId || m.fixtureId;
    const date = (m.matchDateTime || '').slice(0, 10);
    const teams = (m.teamOne?.name || '') + ' vs ' + (m.teamTwo?.name || '');
    try {
      const commentary = await getCommentary(matchId);
      for (let inn = 1; inn <= 4; inn++) {
        const innData = commentary['innings' + inn + 'Balls'];
        if (!innData?.oversMap) continue;
        for (const [overKey, over] of Object.entries(innData.oversMap)) {
          const validBalls = (over.balls || []).filter(b => b.ballType !== 'Auto Comment Ball');
          if (!validBalls.length) continue;
          let overRuns = 0;
          for (const ball of validBalls) {
            overRuns += (parseInt(ball.runs) || 0);
            // Rivalry: sixes and fours per batter-bowler pair
            const batter = ball.strikerName;
            const bowler = ball.bowlerName;
            if (batter && bowler && !isJunk(batter) && !isJunk(bowler)) {
              const pair = batter + '|' + bowler;
              if (ball.isSix) sixesByPair[pair]  = (sixesByPair[pair]  || 0) + 1;
              if (ball.isFour) foursByPair[pair] = (foursByPair[pair] || 0) + 1;
            }
            // Bowler totals for % calculation
            if (bowler && !isJunk(bowler)) {
              commBalls[bowler] = (commBalls[bowler] || 0) + 1;
              if (ball.isSix)  sixesOff[bowler]  = (sixesOff[bowler]  || 0) + 1;
              if (ball.isFour) foursOff[bowler] = (foursOff[bowler] || 0) + 1;
            }
          }
          const bowler = validBalls[0]?.bowlerName || 'Unknown';
          const batterContribs = {};
          for (const ball of validBalls) {
            const name = ball.strikerName;
            if (name) batterContribs[name] = (batterContribs[name] || 0) + (parseInt(ball.runs) || 0);
          }
          const batters = Object.entries(batterContribs)
            .sort((a, b) => b[1] - a[1])
            .map(([name, runs]) => ({ name, runs }));
          allOvers.push({ runs: overRuns, over: overKey, innings: inn, date, teams, bowler, batters });
        }
      }
    } catch (e) {}
  }
  allOvers.sort((a, b) => b.runs - a.runs || b.date.localeCompare(a.date));
  // Include all tied entries at the cutoff rank
  const topN = 3;
  const cutoff = allOvers[topN - 1]?.runs;
  const topOvers = allOvers.filter(o => o.runs >= cutoff);

  // ── Game Changers ─────────────────────────────────────────────────────────────
  const rescuers = {};   // batters who scored 25+ when team was 3 down under 40
  const defenders = {};  // bowlers who took 3+ wkts when their team scored under 90

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const matchId = m.scoreSummary?.matchId || m.fixtureId;
    if (!matchId) continue;
    try {
      const root = (await apiGet('series/match/' + matchId + '/scorecard')).data || {};
      if (!root.winner) continue;
      const date = (m.matchDateTime || '').slice(0, 10);

      for (const innKey of ['innings1', 'innings2', 'innings3', 'innings4']) {
        const inn = root[innKey];
        if (!inn || !inn.batting?.length) continue;
        const isWinnerInn = inn.teamId === root.winner;

        // Rescuer: batter who scored 25+ at position 4+ when 3 wkts fell for < 40
        let wickets = 0, runsWhen3rdFell = null;
        for (const b of inn.batting) {
          const ho = (b.howOut || '').toLowerCase();
          const os = (b.outStringNoLink || '').toLowerCase();
          if (ho && !['ab','rtno','rt','rto',''].includes(ho) && os !== 'dnb' && os !== 'not out' && os !== 'did not bat') {
            wickets++;
            if (wickets === 3) {
              runsWhen3rdFell = inn.batting.slice(0, inn.batting.indexOf(b) + 1).reduce((s, x) => s + (parseInt(x.runsScored) || 0), 0);
            }
          }
        }
        if (runsWhen3rdFell !== null && runsWhen3rdFell <= 40) {
          let pos = 0;
          for (const b of inn.batting) {
            pos++;
            if (pos < 4) continue;
            const runs = parseInt(b.runsScored) || 0;
            const name = (b.playerName || '').trim();
            if (runs < 25 || isJunk(name)) continue;
            if (!rescuers[name]) rescuers[name] = { count: 0, wins: 0, instances: [] };
            rescuers[name].count++;
            if (isWinnerInn) rescuers[name].wins++;
            rescuers[name].instances.push({ runs, runsWhen3rdFell, won: isWinnerInn, date });
          }
        }

        // Defender: bowler who took 3+ wkts when winning team scored under 90
        const bowlingInnKey = { innings1:'innings2', innings2:'innings1', innings3:'innings4', innings4:'innings3' }[innKey];
        const bowlInn = root[bowlingInnKey];
        if (!bowlInn || bowlInn.teamId !== root.winner) continue;
        const teamTotal = inn.total || 0;
        if (teamTotal > 90) continue;
        for (const b of (bowlInn.bowling || [])) {
          const name = ((b.firstName || '') + ' ' + (b.lastName || '')).trim();
          if (isJunk(name)) continue;
          const wkts = parseInt(b.wickets) || 0;
          if (wkts < 3) continue;
          if (!defenders[name]) defenders[name] = { count: 0, instances: [] };
          defenders[name].count++;
          defenders[name].instances.push({ wkts, teamTotal, date });
        }
      }
    } catch (e) {}
  }

  const toGameChangers = (map) =>
    Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count);

  // ── Win Probability Added (WPA) ───────────────────────────────────────────────
  function winProb(runsScored, target, oversPlayed, totalOvers, wickets) {
    const oversLeft = totalOvers - oversPlayed;
    if (oversLeft <= 0) return runsScored >= target ? 1 : 0;
    if (wickets >= 10) return 0;
    const needed = target - runsScored;
    const rrr = needed / oversLeft;
    const crrAtStart = target / totalOvers;
    const wicketPenalty = wickets * 0.04;
    const rrrPressure = (rrr - crrAtStart) / crrAtStart;
    const prob = 1 / (1 + Math.exp(2.5 * (rrrPressure + wicketPenalty)));
    return Math.max(0.02, Math.min(0.98, prob));
  }

  const wpaMap = {};     // name -> { wpa, matchIds }
  const rescueMap = {};  // name -> { count, totalRescueWpa, instances[] }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const matchId = m.scoreSummary?.matchId || m.fixtureId;
    if (!matchId) continue;
    try {
      const root = (await apiGet('series/match/' + matchId + '/scorecard')).data || {};
      if (!root.winner || !root.innings1 || !root.innings2) continue;
      const totalOvers = parseInt(root.matchInfo?.overs || 14);
      const commentary = await getCommentary(matchId);

      // Process both innings: innings1 = first batting, innings2 = chase
      for (const innNum of [1, 2]) {
        const innKey = 'innings' + innNum;
        const inn = root[innKey];
        const innBalls = commentary[innKey + 'Balls'];
        if (!inn || !innBalls?.oversMap) continue;

        const isChase = innNum === 2;
        const target = isChase ? (root.innings1.total || 0) + 1 : (inn.total || 0) + 1;
        const battingTeamWon = inn.teamId === root.winner;

        // Collect all balls in order for rescue detection
        const allBalls = [];
        let cumRuns = 0, cumWkts = 0;
        for (const [overKey, over] of Object.entries(innBalls.oversMap)) {
          const overNum = parseInt(overKey.replace('Over', ''));
          const validBalls = (over.balls || []).filter(b => b.ballType !== 'Auto Comment Ball');
          let legalBallCount = 0; // only Good Ball advances the over fraction
          for (let bi = 0; bi < validBalls.length; bi++) {
            const ball = validBalls[bi];
            const isExtras = ball.ballType === 'Wide' || ball.ballType === 'No Ball';
            const ballRuns = parseInt(ball.runs) || 0;
            const isWkt = ball.outMethod && ball.outMethod !== 'Not Out';
            const wpBefore = winProb(cumRuns, target, Math.min(overNum + legalBallCount / 6, totalOvers - 0.01), totalOvers, cumWkts);
            cumRuns += ballRuns;
            if (isWkt) cumWkts++;
            if (!isExtras) legalBallCount++;
            const wpAfter = winProb(cumRuns, target, Math.min(overNum + legalBallCount / 6, totalOvers - 0.01), totalOvers, cumWkts);
            allBalls.push({ ball, overNum, legalBallCount, wpBefore, wpAfter, ballRuns, isWkt, bowlerName: validBalls[0]?.bowlerName || '' });
          }
        }

        // WPA accumulation (unchanged logic)
        for (const entry of allBalls) {
          const { ball, wpBefore, wpAfter, bowlerName } = entry;
          const swing = wpAfter - wpBefore;
          const batter = ball.strikerName;
          if (batter && !isJunk(batter)) {
            const batterWpa = battingTeamWon ? swing : -swing;
            if (!wpaMap[batter]) wpaMap[batter] = { wpa: 0, matchIds: new Set() };
            wpaMap[batter].wpa += batterWpa;
            wpaMap[batter].matchIds.add(matchId);
          }
        }
        // Over-level WPA for bowlers
        cumRuns = 0; cumWkts = 0;
        for (const [overKey, over] of Object.entries(innBalls.oversMap)) {
          const overNum = parseInt(overKey.replace('Over', ''));
          const validBalls = (over.balls || []).filter(b => b.ballType !== 'Auto Comment Ball');
          if (!validBalls.length) continue;
          const bowlerName = validBalls[0]?.bowlerName || '';
          const wpOverStart = winProb(cumRuns, target, overNum, totalOvers, cumWkts);
          for (const b of validBalls) { cumRuns += parseInt(b.runs) || 0; if (b.outMethod && b.outMethod !== 'Not Out') cumWkts++; }
          const wpOverEnd = winProb(cumRuns, target, overNum + 1, totalOvers, cumWkts);
          const overSwing = wpOverEnd - wpOverStart;
          if (bowlerName && !isJunk(bowlerName)) {
            const bowlerWpa = battingTeamWon ? -overSwing : overSwing;
            if (!wpaMap[bowlerName]) wpaMap[bowlerName] = { wpa: 0, matchIds: new Set() };
            wpaMap[bowlerName].wpa += bowlerWpa;
            wpaMap[bowlerName].matchIds.add(matchId);
          }
        }

        // ── Rescue detection ──────────────────────────────────────────────────
        // Batting rescue (chasing): batting team win% dropped below 50%, team won — credit top batter
        // Bowling rescue (defending): fielding team's win% (= 1 - batting wp) dropped below 50%
        //   i.e. batting team wp rose above 50% at some point, but fielding team still won — credit top bowler
        const date = (m.matchDateTime || '').slice(0, 10);

        if (battingTeamWon) {
          // Chasing rescue: win% from batting team perspective
          const lowestWp = Math.min(...allBalls.map(e => e.wpBefore));
          if (lowestWp < 0.30) {
            const lowestIdx = allBalls.findIndex(e => e.wpBefore === lowestWp);
            const rescueWpaByBatter = {};
            for (let ri = lowestIdx; ri < allBalls.length; ri++) {
              const { ball, wpBefore, wpAfter } = allBalls[ri];
              const swing = wpAfter - wpBefore;
              const batter = ball.strikerName;
              if (batter && !isJunk(batter) && swing > 0) {
                rescueWpaByBatter[batter] = (rescueWpaByBatter[batter] || 0) + swing;
              }
            }
            const entries = Object.entries(rescueWpaByBatter).sort((a, b) => b[1] - a[1]);
            if (entries.length) {
              const [topRescuer, rescueWpa] = entries[0];
              if (rescueWpa < 0.10) continue; // ignore trivial contributions
              if (!rescueMap[topRescuer]) rescueMap[topRescuer] = { count: 0, totalRescueWpa: 0, instances: [] };
              rescueMap[topRescuer].count++;
              rescueMap[topRescuer].totalRescueWpa += rescueWpa;
              rescueMap[topRescuer].instances.push({ type: 'bat', lowestWp: Math.round(lowestWp * 1000) / 10, rescueWpa: Math.round(rescueWpa * 100) / 100, date, matchId });
            }
          }
        } else if (isChase) {
          // Defending rescue: only applies to innings 2 (chase) where chasing team lost = defending team won
          // If chasing team lost, it means the team that batted first successfully defended
          const highestBattingWp = Math.max(...allBalls.map(e => e.wpBefore));
          if (highestBattingWp > 0.70) {
            // Find the ball where batting team wp was highest (fielding team's worst moment)
            const peakIdx = allBalls.findIndex(e => e.wpBefore === highestBattingWp);
            // Credit bowlers from that peak onwards (they turned it around)
            const rescueWpaByBowler = {};
            for (let ri = peakIdx; ri < allBalls.length; ri++) {
              const { bowlerName, wpBefore, wpAfter } = allBalls[ri];
              const swing = wpBefore - wpAfter; // drop in batting team wp = good for fielding team
              if (bowlerName && !isJunk(bowlerName) && swing > 0) {
                rescueWpaByBowler[bowlerName] = (rescueWpaByBowler[bowlerName] || 0) + swing;
              }
            }
            const entries = Object.entries(rescueWpaByBowler).sort((a, b) => b[1] - a[1]);
            if (entries.length) {
              const [topRescuer, rescueWpa] = entries[0];
              if (rescueWpa < 0.10) continue; // ignore trivial contributions
              if (!rescueMap[topRescuer]) rescueMap[topRescuer] = { count: 0, totalRescueWpa: 0, instances: [] };
              rescueMap[topRescuer].count++;
              rescueMap[topRescuer].totalRescueWpa += rescueWpa;
              rescueMap[topRescuer].instances.push({ type: 'bowl', lowestWp: Math.round((1 - highestBattingWp) * 1000) / 10, rescueWpa: Math.round(rescueWpa * 100) / 100, date, matchId });
            }
          }
        }
      }
    } catch (e) {}
  }

  const matchRescuers = Object.entries(rescueMap)
    .map(([name, v]) => ({
      name,
      count: v.count,
      totalRescueWpa: Math.round(v.totalRescueWpa * 100) / 100,
      instances: v.instances.sort((a, b) => a.lowestWp - b.lowestWp),
    }))
    .filter(r => r.count >= 1)
    .sort((a, b) => b.count - a.count || b.totalRescueWpa - a.totalRescueWpa);

  const wpa = Object.entries(wpaMap)
    .map(([name, v]) => ({ name, wpa: Math.round(v.wpa * 100) / 100, matches: v.matchIds.size }))
    .filter(r => r.matches >= 5)
    .sort((a, b) => b.wpa - a.wpa);

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
    mom:          { big: toList(momMap,       MOM_BIG,       MOM_BIG_WINDOW),      all: toList(momMap,       MOM_MILESTONES,      MOM_WINDOW),      achieved: toAchieved(momMap,       MOM_BIG) },
    fastest: {
      batting:     toFastest(fastBat,        FAST_RUN),
      bowling:     toFastest(fastBowl,       FAST_WKTS),
      fours:       toFastest(fastFours,      FAST_FOURS),
      sixes:       toFastest(fastSixes,      FAST_SIXES),
      mom:         toFastest(fastMom,        FAST_MOM),
      fieldCatch:  toFastest(fastFieldCt,    FAST_CATCH),
      keeperCatch: toFastest(fastKeeperCt,   FAST_CATCH),
      totalCatch:  toFastest(fastTotalCatch, FAST_CATCH),
      stumpings:   toFastest(fastStumping,   FAST_STUMPING),
      runOuts:     toFastest(fastRunOut,     FAST_RUNOUT),
    },
    topOvers,
    gameChangers: {
      rescuers:  toGameChangers(rescuers),
      defenders: toGameChangers(defenders),
    },
    matchRescuers,
    rivalries: {      dismissals: toTopPairs(dismissalsByPair),
      sixes:      toTopPairs(sixesByPair),
      fours:      toTopPairs(foursByPair),
    },
    leastWides:   Object.entries(widesMap)  .filter(([n]) => (bowlerMatchCount[n]||0) >= 5).map(([name,count])=>({name,count,matches:bowlerMatchCount[name]})).sort((a,b)=>a.count-b.count),
    leastNoBalls: Object.entries(noBallsMap).filter(([n]) => (bowlerMatchCount[n]||0) >= 5).map(([name,count])=>({name,count,matches:bowlerMatchCount[name]})).sort((a,b)=>a.count-b.count),
    disciplined: Object.entries(bowlerBalls)
      .filter(([n]) => (bowlerMatchCount[n]||0) >= 5 && bowlerBalls[n] >= 50)
      .map(([name, b]) => {
        const extras = (widesMap[name]||0) + (noBallsMap[name]||0);
        const pct = Math.round(extras / b * 1000) / 10;
        return { name, extras, balls: b, pct, wides: widesMap[name]||0, noBalls: noBallsMap[name]||0 };
      })
      .sort((a, b) => a.pct - b.pct),
    dotBalls: Object.entries(dotBallsMap)
      .filter(([n]) => (bowlerMatchCount[n]||0) >= 5 && bowlerBalls[n] >= 100)
      .map(([name, d]) => ({ name, dots: d, balls: bowlerBalls[name], pct: Math.round(d / bowlerBalls[name] * 1000) / 10 }))
      .sort((a, b) => b.pct - a.pct),
    sixesOffPct: Object.entries(sixesOff)
      .filter(([n]) => (commBalls[n]||0) >= 100)
      .map(([name, s]) => ({ name, sixes: s, balls: commBalls[name], pct: Math.round(s / commBalls[name] * 1000) / 10 }))
      .sort((a, b) => a.pct - b.pct),
    foursOffPct: Object.entries(foursOff)
      .filter(([n]) => (commBalls[n]||0) >= 100)
      .map(([name, f]) => ({ name, fours: f, balls: commBalls[name], pct: Math.round(f / commBalls[name] * 1000) / 10 }))
      .sort((a, b) => a.pct - b.pct),
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
