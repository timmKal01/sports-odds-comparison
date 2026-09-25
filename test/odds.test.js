import { test } from 'node:test';
import assert from 'node:assert/strict';
import { americanToDecimal, arbitrage, decimalToAmerican, impliedProb, noVig, parseAmerican } from '../src/odds.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('americanToDecimal converts favourites, underdogs and even money', () => {
    close(americanToDecimal(-150), 1 + 100 / 150);
    close(americanToDecimal(130), 2.3);
    close(americanToDecimal(100), 2);
    close(americanToDecimal(-100), 2);
    close(americanToDecimal(-110), 1.9090909);
});

test('americanToDecimal rejects impossible American odds', () => {
    assert.equal(americanToDecimal(0), null);
    assert.equal(americanToDecimal(50), null);
    assert.equal(americanToDecimal(-99), null);
    assert.equal(americanToDecimal('abc'), null);
});

test('decimalToAmerican round-trips and handles the even-money boundary', () => {
    assert.equal(decimalToAmerican(2.3), 130);
    assert.equal(decimalToAmerican(2), 100);
    assert.equal(decimalToAmerican(1.5), -200);
    assert.equal(decimalToAmerican(1.9090909), -110);
    for (const a of [-400, -154, -110, 100, 136, 487]) assert.equal(decimalToAmerican(americanToDecimal(a)), a);
    assert.equal(decimalToAmerican(1), null);
    assert.equal(decimalToAmerican(0.5), null);
});

test('impliedProb is 1 / decimal', () => {
    close(impliedProb(2), 0.5);
    close(impliedProb(4), 0.25);
    assert.equal(impliedProb(1), null);
});

test('noVig removes the margin from a standard -110/-110 market', () => {
    const d = americanToDecimal(-110);
    const r = noVig([d, d]);
    close(r.fair[0], 0.5);
    close(r.fair[1], 0.5);
    close(r.overround, 2 / d - 1);
    assert.ok(r.overround > 0.04 && r.overround < 0.05);
});

test('noVig handles a three-way soccer market and sums to 1', () => {
    const r = noVig([americanToDecimal(-200), americanToDecimal(487), americanToDecimal(356)]);
    close(r.fair.reduce((a, b) => a + b, 0), 1);
    assert.ok(r.fair[0] > r.fair[2] && r.fair[2] > r.fair[1]);
    assert.equal(noVig([2]), null);
    assert.equal(noVig([2, 0]), null);
});

test('arbitrage detects a real arb and computes margin and stakes', () => {
    // +110 at one book and +105 at another on opposite sides of a coin flip.
    const r = arbitrage([2.1, 2.05]);
    assert.equal(r.isArbitrage, true);
    close(r.impliedSum, 1 / 2.1 + 1 / 2.05);
    close(r.marginPct, (1 / r.impliedSum - 1) * 100);
    assert.ok(r.marginPct > 3.5 && r.marginPct < 3.9);
    close(r.stakes[0] + r.stakes[1], 1);
    // Equal payout on either outcome is what makes it an arb.
    close(r.stakes[0] * 2.1, r.stakes[1] * 2.05);
});

test('arbitrage reports no arb on a normal market', () => {
    const d = americanToDecimal(-110);
    const r = arbitrage([d, d]);
    assert.equal(r.isArbitrage, false);
    assert.ok(r.marginPct < 0);
});

test('parseAmerican handles bookmaker formats', () => {
    assert.equal(parseAmerican('EVEN'), 100);
    assert.equal(parseAmerican('+130'), 130);
    assert.equal(parseAmerican('-110'), -110);
    assert.equal(parseAmerican(-154), -154);
    assert.equal(parseAmerican(''), null);
    assert.equal(parseAmerican(null), null);
    assert.equal(parseAmerican('50'), null);
});
