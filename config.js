const crypto = require('crypto');

const PUB_KEY_B64 = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCNokj65NYc9LdYZshBi6I1BUVu8NdhcafSkzSugFVwUydw7t2DPaZcewxkko3G2R/0OS8s7ceSV/p4zljtgCNtls5A6TT2Ehsoxhqh6PHRRuK4gvhPn8gYtBXjQHkj0VWkr9VoPdEt3NQIr0MkBmwAgt5YkTCV1EZPOAnsLSnQrwIDAQAB';
const PUB_KEY_PEM = '-----BEGIN PUBLIC KEY-----\n' + PUB_KEY_B64.match(/.{1,64}/g).join('\n') + '\n-----END PUBLIC KEY-----';

const TOKEN    = process.env.CC_TOKEN || '1d1f95e3-4b54-4a9b-b388-6472e0c5516a';
const LEAGUE_ID = 'kroq2QrfcoPEe4neEeXrVA';
const SERIES_ID = 'wynmKh98CCp9qybL-NjEyQ';
const TEAM_A   = '8LZsXms8mkRjsz07r42o5g'; // Butchers-A
const TEAM_B   = 'aznlJuFfzhxhMjImILNBwA'; // Butchers-B
const BASE_URL = 'https://core-prod-origin.cricclubs.com/core';

function makeToken() {
  return crypto.publicEncrypt(
    { key: PUB_KEY_PEM, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from('core-' + Date.now())
  ).toString('base64');
}

function apiGet(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = BASE_URL + '/' + path + sep + 'token=' + TOKEN + '&leagueId=' + LEAGUE_ID;
  return fetch(url, { headers: { accept: 'application/json', 'x-content-token': makeToken() } }).then(r => r.json());
}

function apiPut(path, body) {
  return fetch(BASE_URL + '/' + path, {
    method: 'PUT',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'x-content-token': makeToken(), origin: 'https://admin.cricclubs.com' },
    body: JSON.stringify({ token: TOKEN, leagueId: LEAGUE_ID, ...body }),
  }).then(r => r.json());
}

function apiPost(path, body) {
  return fetch(BASE_URL + '/' + path, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'x-content-token': makeToken(), origin: 'https://admin.cricclubs.com' },
    body: JSON.stringify({ token: TOKEN, leagueId: LEAGUE_ID, ...body }),
  }).then(r => r.json());
}

async function getAllMatches() {
  const matches = [];
  for (let page = 1; page <= 20; page++) {
    const d = await apiGet('series/' + SERIES_ID + '/matches?page=' + page + '&size=50');
    const completed = (d.data || d).completed || [];
    matches.push(...completed);
    if (completed.length === 0) break;
  }
  return matches;
}

const ALL_SERIES_IDS = [
  'wynmKh98CCp9qybL-NjEyQ', // BPL 2025
  'n1RCeF4j79mSKr64Rbz8Cg', // W4-June
  '06aN7UwAjDayeVuc3WHScQ', // W3-June
  'YL5qVXl5UzTJ9e6vFfDgmg', // June-2025
];

async function getAllMatchesAllSeries() {
  const matches = [];
  for (const sid of ALL_SERIES_IDS) {
    let page = 1;
    while (true) {
      const d = await apiGet('series/' + sid + '/matches?status=completed&lang=en&page=' + page);
      const completed = d.data?.completed || [];
      matches.push(...completed);
      if (completed.length < 30) break;
      page++;
    }
  }
  return matches;
}

// Returns ball-by-ball data for a match: { innings1Balls, innings2Balls, ... }
// Each inningsXBalls has an oversMap with balls[], each ball has:
//   bowlerName, strikerName, runs, isSix (1/0), isFour (1/0), ballType, outMethod, etc.
async function getCommentary(matchId) {
  const d = await apiGet('series/match/' + matchId + '/scorecard/commentary');
  return d.data || {};
}

// Iterates all balls across all innings in a commentary object.
// Calls cb(ball, inningsIndex) for every real delivery (skips Auto Comment Balls).
function eachBall(commentary, cb) {
  for (let i = 1; i <= 4; i++) {
    const inn = commentary['innings' + i + 'Balls'];
    if (!inn?.oversMap) continue;
    for (const over of Object.values(inn.oversMap)) {
      for (const ball of (over.balls || [])) {
        if (ball.ballType === 'Auto Comment Ball') continue;
        cb(ball, i);
      }
    }
  }
}

module.exports = { TOKEN, LEAGUE_ID, SERIES_ID, TEAM_A, TEAM_B, BASE_URL, ALL_SERIES_IDS, makeToken, apiGet, apiPut, apiPost, getAllMatches, getAllMatchesAllSeries, getCommentary, eachBall };
