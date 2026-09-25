// Pinnacle's guest odds feed: matchups (teams, start time) and straight markets (prices),
// joined on matchupId. Prices are American integers.
import { log } from 'apify';
import { fetchJson } from '../http.js';

const BASE = 'https://guest.api.arcadia.pinnacle.com/0.1';
const MARKETS = new Set(['moneyline', 'spread', 'total']);

export async function fetchPinnacle(leagueKey, leagueId) {
    const [matchups, markets] = await Promise.all([
        fetchJson(`${BASE}/leagues/${leagueId}/matchups`),
        fetchJson(`${BASE}/leagues/${leagueId}/markets/straight`),
    ]);
    return parsePinnacle(matchups, markets, leagueKey);
}

/** Pure parser, separate from fetching so it can be tested on saved responses. */
export function parsePinnacle(matchups, markets, leagueKey) {
    if (!Array.isArray(matchups) || !Array.isArray(markets)) throw new Error('Pinnacle response was not a list');

    // Full-game lines only: period 0, main (not alternate) lines, open for betting.
    const byMatchup = new Map();
    for (const m of markets) {
        if (m?.period !== 0 || m.isAlternate || m.status !== 'open' || !MARKETS.has(m.type)) continue;
        if (!byMatchup.has(m.matchupId)) byMatchup.set(m.matchupId, []);
        byMatchup.get(m.matchupId).push(m);
    }

    const events = [];
    for (const mu of matchups) {
        try {
            // Child matchups (halves, corners, bookings) and futures/specials are skipped.
            if (mu?.type !== 'matchup' || mu.parent || mu.isLive) continue;
            if (mu.units && mu.units !== 'Regular') continue;
            const home = mu.participants?.find((p) => p.alignment === 'home');
            const away = mu.participants?.find((p) => p.alignment === 'away');
            if (!home?.name || !away?.name || !mu.startTime) continue;

            const eventMarkets = [];
            for (const m of byMatchup.get(mu.id) ?? []) {
                if (eventMarkets.some((x) => x.market === m.type)) continue; // one main line per market
                const outcomes = (m.prices ?? [])
                    .filter((p) => Number.isFinite(p?.price))
                    .map((p) => ({
                        side: p.designation,
                        label: { home: home.name, away: away.name, draw: 'Draw', over: 'Over', under: 'Under' }[p.designation] ?? p.designation,
                        line: Number.isFinite(p.points) ? p.points : null,
                        american: p.price,
                    }));
                if (outcomes.length >= 2) eventMarkets.push({ market: m.type, outcomes });
            }
            events.push({
                book: 'pinnacle',
                bookEventId: String(mu.id),
                league: leagueKey,
                startTime: new Date(mu.startTime).toISOString(),
                homeTeam: home.name,
                awayTeam: away.name,
                markets: eventMarkets,
            });
        } catch (err) {
            log.warning('Skipping malformed Pinnacle matchup', { id: mu?.id, error: err.message });
        }
    }
    return events;
}
