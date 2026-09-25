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

export async function fetchBovada(leagueKey, path) {
    const groups = await fetchJson(`${BASE}/${path}?marketFilterId=def&preMatchOnly=true&lang=en`);
    if (!Array.isArray(groups)) {
        // Bovada answers "200 {}" once it has throttled a client. That's a refusal:
        // report it and skip Bovada for this run rather than trying to get around it.
        if (groups && typeof groups === 'object' && Object.keys(groups).length === 0) {
            throw new BlockedError('Bovada returned an empty response, which it does while rate-limiting this client');
        }
        throw new Error('Bovada response was not a list');
    }
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
                                const line = o.price?.handicap != null && o.price.handicap !== '' ? Number(o.price.handicap) : null;
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
