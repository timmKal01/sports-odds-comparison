// Parser, matching and summary tests on real NFL responses captured from both books
// on 2026-09-25 (trimmed to the fields the parsers read).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePinnacle } from '../src/books/pinnacle.js';
import { parseBovada } from '../src/books/bovada.js';
import { matchEvents, sameTeam } from '../src/match.js';
import { lineRows, summaryRows } from '../src/normalize.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const pin = parsePinnacle(fixture('pinnacle-nfl-matchups.json'), fixture('pinnacle-nfl-markets.json'), 'nfl');
const bov = parseBovada(fixture('bovada-nfl.json'), 'nfl');
const games = matchEvents([...pin, ...bov]);
const opts = { markets: new Set(['moneyline', 'spread', 'total']), oddsFormat: 'both', scrapedAt: '2026-09-25T00:00:00.000Z' };

test('Pinnacle parser keeps full games only and reads three markets', () => {
    assert.equal(pin.length, 15, 'child matchups (halves etc.) must be dropped');
    for (const ev of pin) {
        assert.ok(ev.homeTeam && ev.awayTeam && ev.startTime.endsWith('Z'));
        assert.ok(ev.markets.length <= 3);
    }
    const ml = pin.flatMap((e) => e.markets).find((m) => m.market === 'moneyline');
    assert.deepEqual(ml.outcomes.map((o) => o.side).sort(), ['away', 'home']);
});

test('Bovada parser handles string prices, EVEN and string handicaps', () => {
    assert.equal(bov.length, 17);
    const outcomes = bov.flatMap((e) => e.markets.flatMap((m) => m.outcomes));
    assert.ok(outcomes.every((o) => Number.isInteger(o.american) && Math.abs(o.american) >= 100));
    assert.ok(outcomes.some((o) => o.american === 100), 'EVEN should parse to +100');
    const spread = bov.flatMap((e) => e.markets).find((m) => m.market === 'spread');
    const [a, b] = spread.outcomes.map((o) => o.line);
    assert.equal(a, -b, 'spread lines should be mirror images');
    const total = bov.flatMap((e) => e.markets).find((m) => m.market === 'total');
    assert.deepEqual(total.outcomes.map((o) => o.side).sort(), ['over', 'under']);
});

test('sameTeam matches spelling variants but not different clubs', () => {
    assert.equal(sameTeam('Tottenham Hotspur', 'Tottenham'), true);
    assert.equal(sameTeam('Manchester United FC', 'Manchester United'), true);
    assert.equal(sameTeam('New England Patriots', 'New England Patriots'), true);
    assert.equal(sameTeam('Manchester United', 'Manchester City'), false);
    assert.equal(sameTeam('New York Jets', 'New York Giants'), false);
});

test('games listed by both books are merged into one', () => {
    const both = games.filter((g) => g.byBook.pinnacle && g.byBook.bovada);
    assert.ok(both.length >= 12, `expected most games matched across books, got ${both.length}`);
    for (const g of both) {
        assert.ok(sameTeam(g.byBook.pinnacle.homeTeam, g.byBook.bovada.homeTeam));
        assert.ok(Math.abs(Date.parse(g.byBook.pinnacle.startTime) - Date.parse(g.byBook.bovada.startTime)) <= 3 * 3600e3);
    }
});

test('summary rows pick the best price per outcome across books', () => {
    const both = games.find((g) => g.byBook.pinnacle && g.byBook.bovada);
    const summaries = summaryRows(both, opts);
    const ml = summaries.find((s) => s.market === 'moneyline');
    assert.deepEqual(ml.booksCompared.sort(), ['bovada', 'pinnacle']);
    for (const o of ml.outcomes) {
        const prices = ['pinnacle', 'bovada'].map((b) => both.byBook[b].markets.find((m) => m.market === 'moneyline').outcomes.find((x) => x.side === o.outcome).american);
        const bestDecimal = Math.max(...prices.map((a) => (a > 0 ? 1 + a / 100 : 1 + 100 / -a)));
        assert.ok(Math.abs(o.bestPriceDecimal - bestDecimal) < 1e-3);
    }
    const fairSum = ml.outcomes.reduce((s, o) => s + o.fairProb, 0);
    assert.ok(Math.abs(fairSum - 1) < 1e-3);
    assert.equal(ml.fairSource, 'pinnacle');
    assert.equal(typeof ml.isArbitrage, 'boolean');
});

test('line rows carry every required field', () => {
    const rows = games.flatMap((g) => lineRows(g, opts));
    assert.ok(rows.length > 100);
    for (const r of rows.filter((x) => x.oddsStatus === 'priced')) {
        for (const k of ['eventId', 'league', 'startTime', 'homeTeam', 'awayTeam', 'book', 'market', 'outcome', 'priceAmerican', 'priceDecimal', 'impliedProb', 'scrapedAt']) {
            assert.ok(r[k] != null, `missing ${k}`);
        }
        if (r.market === 'moneyline') assert.equal(r.line, null);
        else assert.equal(typeof r.line, 'number');
    }
});
