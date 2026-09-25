// Pure odds math: no I/O, fully unit-tested in test/odds.test.js.

/** American odds (e.g. -150, +130) to decimal odds (e.g. 1.667, 2.30). */
export function americanToDecimal(american) {
    const a = Number(american);
    if (!Number.isFinite(a) || a === 0 || (a > -100 && a < 100)) return null;
    return a > 0 ? 1 + a / 100 : 1 + 100 / -a;
}

/** Decimal odds to American odds, rounded to a whole number. Even money (2.0) is +100. */
export function decimalToAmerican(decimal) {
    const d = Number(decimal);
    if (!Number.isFinite(d) || d <= 1) return null;
    return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
}

/** Implied probability (0-1) of decimal odds, including the bookmaker's margin. */
export function impliedProb(decimal) {
    const d = Number(decimal);
    return Number.isFinite(d) && d > 1 ? 1 / d : null;
}

/**
 * Removes the bookmaker's margin by normalising implied probabilities to sum to 1
 * (the multiplicative method). Input: decimal odds for every outcome of one market.
 * Returns { fair: [probabilities], overround } or null if any price is unusable.
 */
export function noVig(decimals) {
    const implied = decimals.map(impliedProb);
    if (implied.length < 2 || implied.some((p) => p == null)) return null;
    const total = implied.reduce((a, b) => a + b, 0);
    return { fair: implied.map((p) => p / total), overround: total - 1 };
}

/**
 * Arbitrage check across books: given the best available decimal price for each
 * outcome, an arb exists when the implied probabilities sum to less than 1.
 * marginPct is the guaranteed return on total stake, e.g. 1.8 means +1.8%.
 * stakes are the share of bankroll per outcome that locks in that return.
 */
export function arbitrage(bestDecimals) {
    const implied = bestDecimals.map(impliedProb);
    if (implied.length < 2 || implied.some((p) => p == null)) return null;
    const sum = implied.reduce((a, b) => a + b, 0);
    return {
        isArbitrage: sum < 1,
        impliedSum: sum,
        marginPct: (1 / sum - 1) * 100,
        stakes: implied.map((p) => p / sum),
    };
}

/** Parses a bookmaker's American price, which may be a number, "+130", "-110" or "EVEN". */
export function parseAmerican(value) {
    if (value == null) return null;
    const s = String(value).trim().toUpperCase();
    if (s === 'EVEN' || s === 'EV') return 100;
    const n = Number(s.replace(/^\+/, ''));
    return Number.isFinite(n) && Math.abs(n) >= 100 ? n : null;
}

export const round = (n, digits = 4) => (n == null ? null : Math.round(n * 10 ** digits) / 10 ** digits);
