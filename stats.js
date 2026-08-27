// Usage: node stats.js [minInnings] [minBalls]
// Comprehensive batting averages, bowling stats, catches leaderboard.
// Default minInnings=10, minBalls=120 (20 overs).
const { apiGet, getAllMatchesAllSeries, getCommentary, eachBall } = require('./config');

const MIN_INNINGS = parseInt(process.argv[2]) || 10;
const MIN_BALLS   = parseInt(process.argv[3]) || 120;

(async () => {
  const matches = await getAllMatchesAllSeries();
  console.log('Total matches:', matches.length);
  const batters = {}, bowlers = {}, fielders = {};

  for (let i = 0; i < matches.length; i++) {
    const matchId = matches[i].scoreSummary?.matchId || matches[i].fixtureId;
    if (!matchId) continue;
    try {
      // Scorecard: batting/bowling aggregates + fielding
      const root = (await apiGet('series/match/' + matchId + '/scorecard')).data || {};
      for (const key of ['innings1', 'innings2', 'innings3', 'innings4']) {
        const inn = root[key];
        if (!inn) continue;
        for (const b of (inn.batting || [])) {
          const name = (b.playerName || '').trim();
          if (!name || name.includes('Guest') || name.includes('Dummy')) continue;
          const howOut = (b.howOut || '').toLowerCase();
          const outStr = (b.outStringNoLink || '').toLowerCase();
          // Skip DNB (did not bat), absent, and 0-ball 0-run entries
          if (howOut === 'ab') continue;
          if (outStr === 'dnb' || outStr === 'did not bat') continue;
          if ((parseInt(b.ballsFaced) || 0) === 0 && (parseInt(b.runsScored) || 0) === 0) continue;
          const notOut = ((!b.isOut || b.isOut === '0') && (outStr === 'not out' || outStr === '')) || ['rtno','rt','rto'].includes(howOut);
          const runs = parseInt(b.runsScored) || 0, balls = parseInt(b.ballsFaced) || 0;
          if (!batters[name]) batters[name] = { runs:0, balls:0, innings:0, outs:0, highScore:0, notOuts:0, fours:0, sixes:0 };
          batters[name].runs += runs; batters[name].balls += balls; batters[name].innings++;
          batters[name].fours += parseInt(b.fours) || 0;
          batters[name].sixes += parseInt(b.sixers) || 0;
          if (!notOut) batters[name].outs++; else batters[name].notOuts++;
          if (runs > batters[name].highScore) batters[name].highScore = runs;

          if (howOut === 'ct' || howOut === 'ctw') {
            const fielder = (b.fielder || b.catchBy || '').trim();
            if (fielder) { if (!fielders[fielder]) fielders[fielder] = 0; fielders[fielder]++; }
          }
        }
        for (const b of (inn.bowling || [])) {
          const name = ((b.firstName || '') + ' ' + (b.lastName || '')).trim();
          if (!name || name.includes('Guest') || name.includes('Dummy')) continue;
          const wkts = parseInt(b.wickets) || 0, runs = parseInt(b.runs) || 0, balls = parseInt(b.balls) || 0;
          if (!bowlers[name]) bowlers[name] = { wkts:0, runs:0, balls:0, sixes:0, fours:0, dots:0 };
          bowlers[name].wkts += wkts; bowlers[name].runs += runs; bowlers[name].balls += balls;
        }
      }

      // Ball-by-ball: exact sixes/fours/dots per bowler
      const commentary = await getCommentary(matchId);
      eachBall(commentary, (ball) => {
        const bowler = ball.bowlerName;
        if (!bowler || bowler.includes('Dummy') || bowler.includes('Guest')) return;
        // Find matching bowler key (names are abbreviated in commentary e.g. "Arpan D")
        const key = Object.keys(bowlers).find(k => {
          const parts = k.split(' ');
          return ball.bowlerName === parts[0] + ' ' + (parts[1] || '')[0] ||
                 ball.bowlerName === k ||
                 k.startsWith(ball.bowlerName.split(' ')[0]) && k.includes(ball.bowlerName.split(' ')[1]?.[0] || '');
        });
        if (!key) return;
        if (ball.isSix)  bowlers[key].sixes++;
        if (ball.isFour) bowlers[key].fours++;
        if (ball.ballType !== 'Wide' && ball.ballType !== 'No Ball' && ball.runs === 0 && !ball.isSix && !ball.isFour)
          bowlers[key].dots++;
      });

    } catch (e) {}
    if ((i + 1) % 20 === 0) process.stdout.write((i + 1) + '/' + matches.length + '\n');
  }

  console.log('\n=== BATTING AVERAGES (min ' + MIN_INNINGS + ' innings) ===');
  console.log('Player                   Inn  Runs   HS    Avg    SR    4s   6s');
  console.log('-'.repeat(68));
  Object.entries(batters)
    .filter(([, s]) => s.innings >= MIN_INNINGS && s.outs > 0)
    .map(([name, s]) => ({ name, ...s, avg: s.runs / s.outs, sr: s.balls > 0 ? s.runs / s.balls * 100 : 0 }))
    .sort((a, b) => b.avg - a.avg)
    .forEach(r => console.log(
      r.name.padEnd(25) + String(r.innings).padStart(4) + String(r.runs).padStart(6) +
      String(r.highScore).padStart(5) + r.avg.toFixed(1).padStart(7) + r.sr.toFixed(0).padStart(6) + '%' +
      String(r.fours).padStart(5) + String(r.sixes).padStart(5)
    ));

  console.log('\n=== BOWLING (min ' + MIN_BALLS + ' balls = ' + (MIN_BALLS/6).toFixed(0) + ' overs) ===');
  console.log('Player                   Wkts   Avg    SR    Econ   6s   4s   Dots');
  console.log('-'.repeat(68));
  Object.entries(bowlers)
    .filter(([, s]) => s.balls >= MIN_BALLS && s.wkts > 0)
    .map(([name, s]) => ({ name, ...s, avg: s.runs / s.wkts, sr: s.balls / s.wkts, econ: s.runs / s.balls * 6 }))
    .sort((a, b) => b.wkts - a.wkts)
    .forEach(r => console.log(
      r.name.padEnd(25) + String(r.wkts).padStart(5) + r.avg.toFixed(1).padStart(7) +
      r.sr.toFixed(1).padStart(7) + r.econ.toFixed(1).padStart(7) +
      String(r.sixes).padStart(5) + String(r.fours).padStart(5) + String(r.dots).padStart(7)
    ));

  console.log('\n=== TOP CATCHERS ===');
  Object.entries(fielders)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .forEach(([name, n]) => console.log('  ' + name + ': ' + n + ' catches'));
})();
