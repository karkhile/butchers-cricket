// Usage: node fun_facts.js [minInnings]
// Generates league-wide fun facts and records. Default minInnings = 15.
const { apiGet, getAllMatchesAllSeries } = require('./config');

const MIN_INNINGS = parseInt(process.argv[2]) || 15;

(async () => {
  const matches = await getAllMatchesAllSeries();
  const batters = {}, bowlers = {}, matchScores = [];

  for (let i = 0; i < matches.length; i++) {
    const m       = matches[i];
    const matchId = m.scoreSummary?.matchId || m.fixtureId;
    const date    = (m.matchDateTime || '').slice(0, 10);
    const result  = m.scoreSummary?.result || '';
    const teams   = (m.teamOne?.name || '') + ' vs ' + (m.teamTwo?.name || '');
    try {
      const root = (await apiGet('series/match/' + matchId + '/scorecard')).data || {};
      let inn1total = 0, inn2total = 0;

      for (const key of ['innings1', 'innings2', 'innings3', 'innings4']) {
        const inn = root[key];
        if (!inn) continue;
        let innTotal = 0;
        for (const b of (inn.batting || [])) {
          const name = (b.playerName || '').trim();
          if (!name) continue;
          const howOut = (b.howOut || '').toLowerCase();
          const outStr = (b.outStringNoLink || '').toLowerCase();
          if (howOut === 'ab') continue;
          if (outStr === 'dnb' || outStr === 'did not bat') continue;
          if ((parseInt(b.ballsFaced) || 0) === 0 && (parseInt(b.runsScored) || 0) === 0) continue;
          const notOut = ((!b.isOut || b.isOut === '0') && (outStr === 'not out' || outStr === '')) || ['rtno','rt','rto'].includes(howOut);
          const runs = parseInt(b.runsScored) || 0, balls = parseInt(b.ballsFaced) || 0;
          if (!batters[name]) batters[name] = { runs:0, balls:0, innings:0, outs:0, ducks:0, highScore:0, highScoreBalls:0, highScoreDate:'', highScoreMatch:'', highScoreNotOut:false, fifties:0 };
          batters[name].runs += runs; batters[name].balls += balls; batters[name].innings++;
          if (!notOut) { batters[name].outs++; if (runs === 0) batters[name].ducks++; }
          if (runs > batters[name].highScore) { batters[name].highScore = runs; batters[name].highScoreBalls = balls; batters[name].highScoreDate = date; batters[name].highScoreMatch = teams; batters[name].highScoreNotOut = notOut; }
          if (runs >= 50) batters[name].fifties++;
          innTotal += runs;
        }
        for (const b of (inn.bowling || [])) {
          const name = ((b.firstName || '') + ' ' + (b.lastName || '')).trim();
          if (!name) continue;
          const wkts = parseInt(b.wickets) || 0, runs = parseInt(b.runs) || 0, balls = parseInt(b.balls) || 0;
          if (!bowlers[name]) bowlers[name] = { wkts:0, runs:0, balls:0, bestWkts:0, bestRuns:999, fiveWickets:0, matchBest:'' };
          bowlers[name].wkts += wkts; bowlers[name].runs += runs; bowlers[name].balls += balls;
          if (wkts >= 5) bowlers[name].fiveWickets++;
          if (wkts > bowlers[name].bestWkts || (wkts === bowlers[name].bestWkts && runs < bowlers[name].bestRuns)) { bowlers[name].bestWkts = wkts; bowlers[name].bestRuns = runs; bowlers[name].matchBest = date + ' ' + teams; }
        }
        if (key === 'innings1') inn1total = innTotal;
        if (key === 'innings2') inn2total = innTotal;
      }

      const marginMatch = result.match(/won by (\d+) (wicket|run)/i);
      const margin = marginMatch ? parseInt(marginMatch[1]) : null;
      const marginType = marginMatch ? marginMatch[2].toLowerCase() : null;
      matchScores.push({ matchId, date, teams, inn1total, inn2total, result, margin, marginType });
    } catch (e) {}
    if ((i + 1) % 20 === 0) process.stdout.write((i + 1) + '/' + matches.length + '\n');
  }

  const clean = ([n]) => !n.includes('Guest') && !n.includes('Dummy');

  console.log('\n🏏 TOP 5 HIGHEST INDIVIDUAL SCORES');
  Object.entries(batters).filter(clean).sort((a,b) => b[1].highScore - a[1].highScore).slice(0,5)
    .forEach(([name, s]) => console.log('  ' + s.highScore + (s.highScoreNotOut?'*':'') + (s.highScoreBalls>0?' off '+s.highScoreBalls+'b':'') + ' — ' + name + ' (' + s.highScoreDate + ')'));

  console.log('\n🦆 MOST DUCKS');
  Object.entries(batters).filter(([n,s]) => clean([n]) && s.ducks > 0).sort((a,b)=>b[1].ducks-a[1].ducks).slice(0,8)
    .forEach(([name,s]) => console.log('  ' + name + ': ' + s.ducks + ' ducks in ' + s.innings + ' innings'));

  console.log('\n50+ MOST FIFTIES');
  Object.entries(batters).filter(([n,s]) => clean([n]) && s.fifties > 0).sort((a,b)=>b[1].fifties-a[1].fifties).slice(0,8)
    .forEach(([name,s]) => console.log('  ' + name + ': ' + s.fifties + 'x fifty'));

  console.log('\n🎳 BEST BOWLING SPELLS');
  Object.entries(bowlers).filter(clean).sort((a,b) => b[1].bestWkts-a[1].bestWkts || a[1].bestRuns-b[1].bestRuns).slice(0,8)
    .forEach(([name,s]) => console.log('  ' + s.bestWkts + '/' + s.bestRuns + ' — ' + name + ' (' + s.matchBest + ')'));

  const fifers = Object.entries(bowlers).filter(([n,s]) => clean([n]) && s.fiveWickets > 0);
  console.log('\n⭐ 5-WICKET HAULS');
  if (fifers.length === 0) console.log('  None recorded');
  else fifers.sort((a,b) => b[1].fiveWickets-a[1].fiveWickets).forEach(([name,s]) => console.log('  ' + name + ': ' + s.fiveWickets + 'x'));

  console.log('\n🔥 CLOSEST WINS (by runs)');
  matchScores.filter(x => x.marginType==='run' && x.margin!==null).sort((a,b)=>a.margin-b.margin).slice(0,5)
    .forEach(x => console.log('  ' + x.result + ' — ' + x.teams + ' (' + x.date + ')'));

  console.log('\n🔥 CLOSEST WINS (by wickets)');
  matchScores.filter(x => x.marginType==='wicket' && x.margin!==null).sort((a,b)=>a.margin-b.margin).slice(0,5)
    .forEach(x => console.log('  ' + x.result + ' — ' + x.teams + ' (' + x.date + ')'));

  console.log('\n📈 HIGHEST TEAM TOTALS IN AN INNINGS');
  matchScores.sort((a,b) => Math.max(b.inn1total,b.inn2total)-Math.max(a.inn1total,a.inn2total)).slice(0,5)
    .forEach(x => console.log('  ' + Math.max(x.inn1total,x.inn2total) + ' — ' + x.teams + ' (' + x.date + ')'));

  console.log('\n📉 LOWEST TEAM TOTALS (2nd innings, min 5 runs)');
  matchScores.filter(x => x.inn2total > 5).sort((a,b)=>a.inn2total-b.inn2total).slice(0,5)
    .forEach(x => console.log('  ' + x.inn2total + ' — ' + x.teams + ' (' + x.date + ')'));

  console.log('\n🎭 HIGHEST DUCK RATE (min ' + MIN_INNINGS + ' innings)');
  Object.entries(batters).filter(([n,s]) => clean([n]) && s.innings >= MIN_INNINGS)
    .map(([name,s]) => ({ name, pct: s.ducks/s.innings*100, ducks: s.ducks, innings: s.innings }))
    .sort((a,b) => b.pct-a.pct).slice(0,8)
    .forEach(x => console.log('  ' + x.name + ': ' + x.pct.toFixed(1) + '% (' + x.ducks + '/' + x.innings + ')'));

  console.log('\n⚡ MOST AGGRESSIVE BATTERS (SR > 110%, min ' + MIN_INNINGS + ' innings)');
  Object.entries(batters).filter(([n,s]) => clean([n]) && s.innings >= MIN_INNINGS && s.balls > 0)
    .map(([name,s]) => ({ name, sr: s.runs/s.balls*100, runs: s.runs, innings: s.innings }))
    .filter(x => x.sr > 110).sort((a,b) => b.sr-a.sr)
    .forEach(x => console.log('  ' + x.name + ': SR ' + x.sr.toFixed(1) + '% — ' + x.runs + ' runs in ' + x.innings + ' innings'));

  console.log('\n💪 IRON MAN — MOST INNINGS PLAYED');
  Object.entries(batters).filter(clean).sort((a,b)=>b[1].innings-a[1].innings).slice(0,5)
    .forEach(([name,s]) => console.log('  ' + name + ': ' + s.innings + ' innings, ' + s.runs + ' runs'));

  console.log('\n🎯 ALL-TIME WICKET TAKERS');
  Object.entries(bowlers).filter(clean).sort((a,b)=>b[1].wkts-a[1].wkts).slice(0,8)
    .forEach(([name,s]) => console.log('  ' + name + ': ' + s.wkts + ' wkts @ avg ' + (s.runs/s.wkts).toFixed(1)));
})();
