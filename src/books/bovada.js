// Bovada's public sports coupon feed. Prices are strings ("-120", "EVEN"),
// handicaps are strings, and start times are epoch milliseconds.
import { log } from 'apify';
import { BlockedError, fetchJson } from '../http.js';
import { parseAmerican } from '../odds.js';

const BASE = 'https://www.bovada.lv/services/sports/event/coupon/events/A/description';

function marketType(description) {
    const d = description.trim();
    if (/^(3-Way )?Moneyline$|^Match Result$|^Fight Winner$/i.test(d)) return 'moneyline';
    if (/^(Point|Goal) Spread$|^Run ?line$|^Puck Line$|^Spread$/i.test(d)) return 'spread';
    if (/^Total( (Points|Goals|Runs))?$/i.test(d)) return 'total';
    return null;
}

const SIDE_BY_TYPE = { H: 'home', A: 'away', D: 'draw', O: 'over', U: 'under' };

// Soccer uses split ("quarter") lines: -0.75 is half the stake on -0.5 and half on -1.
// Bovada sends those as two handicaps; reading only the first compared a -0.75 line
// against another book's -0.5 and produced false arbitrage flags.
export function parseLine(price) {
    const parts = [price?.handicap, price?.handicap2]
        .filter((h) => h != null && h !== '')
        .map(Number)
        .filter(Number.isFinite);
    if (!parts.length) return null;
    return parts.reduce((a, c) => a + c, 0) / parts.length;
}

export async function fetchBovada(leagueKey, path, { saveRaw } = {}) {
    const groups = await fetchJson(`${BASE}/${path}?marketFilterId=def&preMatchOnly=true&lang=en`);
    if (!Array.isArray(groups)) {
        // Bovada answers "200 {}" when it declines to serve a request: after a burst from
        // one client, and for some leagues (NFL, MLB, NCAAF when tested) to cloud servers.
        // Either way it's a refusal: report it and skip, never try to get around it.
        if (groups && typeof groups === 'object' && Object.keys(groups).length === 0) {
            throw new BlockedError('Bovada returned no data for this league (an empty response, which it sends when it declines a request)');
        }
        throw new Error('Bovada response was not a list');
    }
    if (saveRaw) await saveRaw(`RAW_BOVADA_${leagueKey}`, groups);
    return parseBovada(groups, leagueKey);
}

/** Pure parser, separate from fetching so it can be tested on saved responses. */
export function parseBovada(groups, leagueKey) {

    const events = [];
    for (const group of groups) {
        for (const ev of group?.events ?? []) {
            try {
                if (ev.live) continue;
                const home = ev.competitors?.find((c) => c.home === true);
                const away = ev.competitors?.find((c) => c.home === false);
                if (!home?.name || !away?.name || !Number.isFinite(ev.startTime)) continue;

                const eventMarkets = [];
                for (const dg of ev.displayGroups ?? []) {
                    for (const m of dg.markets ?? []) {
                        const type = marketType(m.description ?? '');
                        // Full game only ("Game"/"Match" period flagged main); one line per market.
                        if (!type || m.period?.main !== true || eventMarkets.some((x) => x.market === type)) continue;
                        const outcomes = (m.outcomes ?? [])
                            .filter((o) => o.status === 'O')
                            .map((o) => {
                                const side = SIDE_BY_TYPE[o.type]
                                    ?? (o.competitorId === home.id ? 'home' : o.competitorId === away.id ? 'away' : /^(draw|tie)$/i.test(o.description ?? '') ? 'draw' : null);
                                const line = parseLine(o.price);
                                return {
                                    side,
                                    label: o.description ?? side,
                                    line: Number.isFinite(line) ? line : null,
                                    american: parseAmerican(o.price?.american),
                                };
                            })
                            .filter((o) => o.side && o.american != null);
                        if (outcomes.length >= 2) eventMarkets.push({ market: type, outcomes });
                    }
                }
                events.push({
                    book: 'bovada',
                    bookEventId: String(ev.id),
                    league: leagueKey,
                    startTime: new Date(ev.startTime).toISOString(),
                    homeTeam: home.name,
                    awayTeam: away.name,
                    markets: eventMarkets,
                });
            } catch (err) {
                log.warning('Skipping malformed Bovada event', { id: ev?.id, error: err.message });
            }
        }
    }
    return events;
}
