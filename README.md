# Sports Odds Comparison: Best Price & Arbitrage

Compare pre-game betting odds across **Pinnacle** and **Bovada** in one run. For every upcoming game you get each book's moneyline, spread and total, the best available price per outcome, no-vig fair odds, and an arbitrage flag. Monitor mode tracks line movement between runs.

Covers the NFL, NCAA football, NBA, WNBA, NCAA basketball, MLB, NHL, English Premier League and Serie A on both books. La Liga, Bundesliga, MLS, the Champions League and UFC currently come from Pinnacle only.

It reads the books' public odds feeds over plain HTTP. No login, no browser, no proxies, and a run takes seconds.

## What you get

**One `line` row per book, market and outcome:**

```json
{
  "rowType": "line",
  "eventId": "nfl-2026-09-27-new-england-patriots-at-jacksonville-jaguars",
  "league": "nfl",
  "startTime": "2026-09-27T17:00:00.000Z",
  "homeTeam": "Jacksonville Jaguars",
  "awayTeam": "New England Patriots",
  "book": "pinnacle",
  "oddsStatus": "priced",
  "market": "spread",
  "outcome": "home",
  "outcomeName": "Jacksonville Jaguars",
  "line": -2.5,
  "priceAmerican": -121,
  "priceDecimal": 1.8264,
  "impliedProb": 0.5475,
  "scrapedAt": "2026-09-25T18:39:56.021Z"
}
```

**One `summary` row per game, market and line**, comparing the books. Here's a real one, where the best price on each side sits at a different book:

```json
{
  "rowType": "summary",
  "eventId": "nfl-2026-09-27-new-york-jets-at-detroit-lions",
  "market": "moneyline",
  "line": null,
  "booksCompared": ["pinnacle", "bovada"],
  "outcomes": [
    {
      "outcome": "home",
      "outcomeName": "Detroit Lions",
      "bestBook": "pinnacle",
      "bestPriceAmerican": -294,
      "bestPriceDecimal": 1.3401,
      "fairProb": 0.7208,
      "fairPriceAmerican": -258
    },
    {
      "outcome": "away",
      "outcomeName": "New York Jets",
      "bestBook": "bovada",
      "bestPriceAmerican": 250,
      "bestPriceDecimal": 3.5,
      "fairProb": 0.2792,
      "fairPriceAmerican": 258
    }
  ],
  "fairSource": "pinnacle",
  "isArbitrage": false,
  "arbMarginPct": -3.092,
  "arbStakes": null
}
```

- **Best price:** the highest payout for each outcome across the books, and which book has it.
- **Fair odds:** the book's margin removed, so the outcome probabilities sum to 100%. They come from Pinnacle when it prices the market, because it's the sharpest, lowest-margin book; otherwise from the best prices.
- **Arbitrage:** `isArbitrage` is true when backing every outcome at its best price guarantees a profit. `arbMarginPct` is that guaranteed return (negative means no arb, and how far away it is), and `arbStakes` says what share of your stake to put on each outcome.

Spreads and totals are only compared when the books offer the **same line**: -2.5 at one book and -3 at another are different bets.

## Input

| Field | What it does |
|---|---|
| `leagues` | Any of `nfl`, `ncaaf`, `nba`, `wnba`, `ncaab`, `mlb`, `nhl`, `epl`, `serie-a`, `la-liga`, `bundesliga`, `mls`, `ucl`, `ufc`. Default `nfl`, `nba`, `epl`. |
| `books` | `pinnacle`, `bovada`, or both (default). |
| `markets` | `moneyline`, `spread`, `total`. All by default. Full-game main lines only. |
| `dateFrom`, `dateTo` | Optional UTC dates, `YYYY-MM-DD`. |
| `oddsFormat` | `both` (default), `american` or `decimal`. Implied probability is always included. |
| `includeSummary` | Add the best-price, fair-odds and arbitrage rows. Default `true`. |
| `arbitrageOnly` | Return only summary rows where an arbitrage exists. |
| `mode` | `snapshot` (default) or `monitor` (see below). |
| `monitorStoreName` | Where monitor mode keeps its memory. Use a different name per scheduled monitor. |
| `maxEvents` | Max games, soonest first. Default 200. |

Tonight's NBA and NHL moneylines, decimal odds:

```json
{ "leagues": ["nba", "nhl"], "markets": ["moneyline"], "oddsFormat": "decimal" }
```

Arbitrage scan across every league:

```json
{ "leagues": ["nfl", "ncaaf", "nba", "mlb", "nhl", "epl", "serie-a"], "arbitrageOnly": true }
```

## Monitor mode: line movement

Set `mode` to `monitor` and schedule the actor, for example every 15 minutes. Each run compares against the previous one and returns only lines that moved, with what they moved from. For example (illustrative prices):

```json
{
  "rowType": "line",
  "eventId": "nfl-2026-09-27-new-england-patriots-at-jacksonville-jaguars",
  "book": "pinnacle",
  "market": "moneyline",
  "outcome": "home",
  "changeType": "price_moved",
  "previousPriceAmerican": -140,
  "priceAmerican": -154,
  "deltaProbPts": 2.3
}
```

`deltaProbPts` is the move in implied probability, in percentage points; positive means the outcome got more likely. `changeType` is `price_moved`, `line_moved` (the spread or total itself changed), or `new`. The first monitor run has nothing to compare against, so it saves a baseline and reports every line as `new`.

## Pricing

Charged **per game returned**, not per row. A game costs the same whether you ask for one market or three, and with or without the summary rows. In monitor mode only games with movement count.

## Good to know

- **Pre-game only.** Live in-play lines are excluded.
- **Arbitrage is rare and brief.** Most runs find none, and one that exists may close within minutes. Books also limit stakes and can void mispriced bets, so treat the flag as a lead to check, not a guaranteed profit.
- **Unmatched games.** A game is merged across books only when both team names and the start time agree. If the books spell a team differently in a way the matcher can't be sure of, the game appears once per book rather than risk pairing prices from different games.
- **Not priced yet.** Games a book lists without odds come back as a row with `oddsStatus: "not_priced_yet"` rather than disappearing.
- **When a book is unavailable.** The actor identifies itself honestly and spaces its requests. If a book rate-limits or refuses it, that book is skipped for the run with a note in the log, and the other book's odds are still returned. It does not use proxies or disguise itself to get around a refusal.
- **Bovada doesn't always serve every league.** When tested from Apify's servers, Bovada returned NBA, NHL and Premier League odds but declined NFL, MLB and NCAA football. Those leagues then come from Pinnacle only, and the log says so. Coverage can change either way.
- **Feeds can change.** These are the books' public web feeds, not documented APIs, so a book can change or restrict them at any time.

## Disclaimer

This actor is unofficial and is not affiliated with, endorsed by, or connected to Pinnacle, Bovada, or any sportsbook. Odds are provided for information and research, and can change at any moment; always confirm a price with the book before acting on it. Betting laws vary by country and state, and some of these books do not accept customers in every location. You are responsible for complying with the laws where you live and with each book's own terms.
