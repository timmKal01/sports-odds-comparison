// Monitor mode: remember every line from the previous run and output only what moved.
// The snapshot lives in a NAMED key-value store: Apify gives each run a fresh default
// store, so a snapshot saved there would be gone by the next run.
import { Actor } from 'apify';
import { americanToDecimal, impliedProb, round } from './odds.js';

const SNAPSHOT_KEY = 'LAST_SNAPSHOT';
const lineKey = (r) => `${r.eventId}|${r.book}|${r.market}|${r.outcome}`;

export async function diffAgainstLastRun(lineRowsNow, storeName) {
    const store = await Actor.openKeyValueStore(storeName);
    const previous = (await store.getValue(SNAPSHOT_KEY)) ?? {};
    const isFirstRun = Object.keys(previous).length === 0;

    const next = {};
    const changed = [];
    for (const r of lineRowsNow) {
        if (r.oddsStatus !== 'priced') continue;
        const key = lineKey(r);
        next[key] = { line: r.line, american: r.priceAmerican ?? null, decimal: r.priceDecimal ?? null, prob: r.impliedProb };
        const prev = previous[key];
        const moved = !prev || prev.line !== r.line || prev.prob !== r.impliedProb;
        if (!moved) continue;
        const prevProb = prev?.prob ?? (prev?.american != null ? impliedProb(americanToDecimal(prev.american)) : null);
        changed.push({
            ...r,
            changeType: !prev ? 'new' : prev.line !== r.line ? 'line_moved' : 'price_moved',
            previousLine: prev?.line ?? null,
            previousPriceAmerican: prev?.american ?? null,
            previousPriceDecimal: prev?.decimal ?? null,
            // Positive = the outcome got more likely (shorter price) since the last run.
            deltaProbPts: prevProb != null && r.impliedProb != null ? round((r.impliedProb - prevProb) * 100, 2) : null,
        });
    }
    await store.setValue(SNAPSHOT_KEY, next);
    return { changed, isFirstRun, trackedLines: Object.keys(next).length };
}
