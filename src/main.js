import { Actor, log } from 'apify';
import { LEAGUES } from './leagues.js';
import { BlockedError } from './http.js';
import { fetchPinnacle } from './books/pinnacle.js';
import { fetchBovada } from './books/bovada.js';
import { matchEvents } from './match.js';
import { lineRows, summaryRows } from './normalize.js';
import { diffAgainstLastRun } from './monitor.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
    leagues: leaguesInput,
    books: booksInput,
    markets: marketsInput,
    dateFrom,
    dateTo,
    oddsFormat = 'both',
    mode = 'snapshot',
    includeSummary = true,
    arbitrageOnly = false,
    monitorStoreName = 'sports-odds-monitor',
    maxEvents = 200,
    saveRawResponses = false,
} = input;

/** Must match the event name configured in this Actor's pay-per-event pricing on Apify. */
const GAME_EVENT = 'game-odds';

// An empty form (first click, Apify's daily health check) runs a working default.
const leagues = (leaguesInput?.length ? leaguesInput : ['nfl', 'nba', 'epl']).filter((l) => {
    if (LEAGUES[l]) return true;
    log.warning(`Unknown league "${l}", skipping. Valid: ${Object.keys(LEAGUES).join(', ')}`);
    return false;
});
const books = new Set((booksInput?.length ? booksInput : ['pinnacle', 'bovada']).map((b) => b.toLowerCase()));
const markets = new Set((marketsInput?.length ? marketsInput : ['moneyline', 'spread', 'total']).map((m) => m.toLowerCase()));
const fromMs = dateFrom ? Date.parse(`${dateFrom}T00:00:00Z`) : -Infinity;
const toMs = dateTo ? Date.parse(`${dateTo}T23:59:59Z`) : Infinity;
if (Number.isNaN(fromMs) || Number.isNaN(toMs)) throw new Error('dateFrom and dateTo must be YYYY-MM-DD.');

// Troubleshooting: keep the books' raw responses in this run's key-value store.
const saveRaw = saveRawResponses ? (key, value) => Actor.setValue(key, value) : null;

// Pinnacle calls run in parallel; Bovada calls queue behind its own rate limiter in http.js.
const jobs = [];
for (const key of leagues) {
    const lg = LEAGUES[key];
    if (books.has('pinnacle') && lg.pinnacle) jobs.push({ book: 'pinnacle', key, run: () => fetchPinnacle(key, lg.pinnacle) });
    if (books.has('bovada')) {
        if (lg.bovada) jobs.push({ book: 'bovada', key, run: () => fetchBovada(key, lg.bovada, { saveRaw }) });
        else log.info(`${lg.name} isn't available from Bovada in this actor yet; using Pinnacle only.`);
    }
}

const results = await Promise.allSettled(jobs.map((j) => j.run()));
const events = [];
const problems = [];
results.forEach((r, i) => {
    const { book, key } = jobs[i];
    if (r.status === 'fulfilled') {
        events.push(...r.value);
        log.info(`${book} ${key}: ${r.value.length} upcoming game(s)`);
    } else {
        const blocked = r.reason instanceof BlockedError;
        problems.push({ book, league: key, error: r.reason?.message, blocked });
        log.warning(`${book} ${key} ${blocked ? 'refused access' : 'failed'}; continuing without it`, { error: r.reason?.message });
    }
});
if (jobs.length && problems.length === jobs.length) {
    throw new Error(`No book returned data (${problems.map((p) => `${p.book}/${p.league}: ${p.error}`).join('; ')}).`);
}

const inWindow = events.filter((e) => {
    const t = Date.parse(e.startTime);
    return t >= fromMs && t <= toMs && t > Date.now();
});
const games = matchEvents(inWindow)
    .sort((a, b) => a.primary.startTime.localeCompare(b.primary.startTime))
    .slice(0, Math.max(1, maxEvents));

const scrapedAt = new Date().toISOString();
const opts = { markets, oddsFormat, scrapedAt };
let output = [];
for (const game of games) {
    const lines = lineRows(game, opts);
    const summaries = includeSummary || arbitrageOnly ? summaryRows(game, opts) : [];
    if (arbitrageOnly) output.push(...summaries.filter((s) => s.isArbitrage));
    else output.push(...lines, ...summaries);
}

if (mode === 'monitor') {
    const allLines = games.flatMap((g) => lineRows(g, opts));
    const { changed, isFirstRun, trackedLines } = await diffAgainstLastRun(allLines, monitorStoreName);
    log.info(isFirstRun
        ? `Monitor: first run, saved a baseline of ${trackedLines} lines. Every line is reported as "new" this time.`
        : `Monitor: ${changed.length} of ${trackedLines} lines moved since the last run.`);
    const keepSummaries = output.filter((r) => r.rowType === 'summary' && changed.some((c) => c.eventId === r.eventId && c.market === r.market));
    output = arbitrageOnly ? keepSummaries.filter((s) => s.isArbitrage) : [...changed, ...keepSummaries];
}

await Actor.pushData(output);
const gamesReturned = new Set(output.map((r) => r.eventId)).size;
const arbs = output.filter((r) => r.rowType === 'summary' && r.isArbitrage).length;
log.info(`Returned ${output.length} row(s) across ${gamesReturned} game(s); ${arbs} arbitrage opportunit${arbs === 1 ? 'y' : 'ies'}.`, {
    matchedAcrossBothBooks: games.filter((g) => Object.keys(g.byBook).length > 1).length,
    problems,
});

// Charged per game returned, not per row, so markets and summaries don't multiply the cost.
if (gamesReturned > 0) await Actor.charge({ eventName: GAME_EVENT, count: gamesReturned });

await Actor.exit();
