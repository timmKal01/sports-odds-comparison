// Turns matched games into output rows: one "line" row per book x market x outcome,
// plus one "summary" row per game x market x line comparing books.
import { americanToDecimal, arbitrage, decimalToAmerican, impliedProb, noVig, round } from './odds.js';

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function gameId(game) {
    const p = game.primary;
    return `${p.league}-${p.startTime.slice(0, 10)}-${slug(p.awayTeam)}-at-${slug(p.homeTeam)}`;
}

function base(game) {
    const p = game.primary;
    return { eventId: gameId(game), league: p.league, startTime: p.startTime, homeTeam: p.homeTeam, awayTeam: p.awayTeam };
}

function priceFields(american, oddsFormat) {
    const decimal = americanToDecimal(american);
    return {
        priceAmerican: oddsFormat === 'decimal' ? null : american,
        priceDecimal: oddsFormat === 'american' ? null : round(decimal, 4),
        impliedProb: round(impliedProb(decimal), 4),
    };
}

export function lineRows(game, { markets, oddsFormat, scrapedAt }) {
    const rows = [];
    for (const ev of Object.values(game.byBook)) {
        const wanted = ev.markets.filter((m) => markets.has(m.market));
        if (!wanted.length) {
            // Listed but not priced yet: say so instead of silently dropping the game.
            rows.push({ rowType: 'line', ...base(game), book: ev.book, oddsStatus: 'not_priced_yet', market: null, outcome: null, outcomeName: null, line: null, priceAmerican: null, priceDecimal: null, impliedProb: null, scrapedAt });
            continue;
        }
        for (const m of wanted) {
            for (const o of m.outcomes) {
                rows.push({
                    rowType: 'line',
                    ...base(game),
                    book: ev.book,
                    oddsStatus: 'priced',
                    market: m.market,
                    outcome: o.side,
                    outcomeName: o.label,
                    line: o.line,
                    ...priceFields(o.american, oddsFormat),
                    scrapedAt,
                });
            }
        }
    }
    return rows;
}

/** Key that makes prices comparable: same market and same line. Spreads key on the home line. */
function lineKey(market, outcomes) {
    if (market === 'moneyline') return 'ml';
    if (market === 'spread') return String(outcomes.find((o) => o.side === 'home')?.line ?? '');
    return String(outcomes.find((o) => o.side === 'over')?.line ?? outcomes[0]?.line ?? '');
}

export function summaryRows(game, { markets, oddsFormat, scrapedAt }) {
    const groups = new Map(); // `${market}|${lineKey}` -> { market, line, books: Map(book -> outcomes) }
    for (const ev of Object.values(game.byBook)) {
        for (const m of ev.markets) {
            if (!markets.has(m.market)) continue;
            const key = `${m.market}|${lineKey(m.market, m.outcomes)}`;
            if (!groups.has(key)) {
                const line = m.market === 'moneyline' ? null : Number(key.split('|')[1]);
                groups.set(key, { market: m.market, line: Number.isFinite(line) ? line : null, books: new Map() });
            }
            groups.get(key).books.set(ev.book, m.outcomes);
        }
    }

    const rows = [];
    for (const g of groups.values()) {
        const sides = [...new Set([...g.books.values()].flat().map((o) => o.side))];
        const best = sides.map((side) => {
            let top = null;
            for (const [book, outcomes] of g.books) {
                const o = outcomes.find((x) => x.side === side);
                const decimal = o && americanToDecimal(o.american);
                if (decimal && (!top || decimal > top.decimal)) top = { side, name: o.label, book, american: o.american, decimal };
            }
            return top;
        });
        if (best.some((b) => !b)) continue;

        // Fair odds come from Pinnacle when it prices every side (it's the sharp, low-margin
        // book); otherwise from the best available prices.
        const pin = g.books.get('pinnacle');
        const pinDecimals = pin && sides.map((s) => americanToDecimal(pin.find((o) => o.side === s)?.american));
        const fairSource = pinDecimals?.every(Boolean) ? 'pinnacle' : 'best-prices';
        const fair = noVig(fairSource === 'pinnacle' ? pinDecimals : best.map((b) => b.decimal));
        const arb = g.books.size >= 2 ? arbitrage(best.map((b) => b.decimal)) : null;

        rows.push({
            rowType: 'summary',
            ...base(game),
            market: g.market,
            line: g.line,
            booksCompared: [...g.books.keys()],
            outcomes: best.map((b, i) => ({
                outcome: b.side,
                outcomeName: b.name,
                bestBook: b.book,
                bestPriceAmerican: oddsFormat === 'decimal' ? null : b.american,
                bestPriceDecimal: oddsFormat === 'american' ? null : round(b.decimal, 4),
                fairProb: round(fair?.fair[i], 4),
                fairPriceAmerican: fair ? decimalToAmerican(1 / fair.fair[i]) : null,
            })),
            fairSource,
            isArbitrage: arb?.isArbitrage ?? false,
            arbMarginPct: arb ? round(arb.marginPct, 3) : null,
            arbStakes: arb?.isArbitrage ? arb.stakes.map((s) => round(s, 4)) : null,
            scrapedAt,
        });
    }
    return rows;
}
