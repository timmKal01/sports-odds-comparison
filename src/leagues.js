// League ids and paths, verified against each book's live listing on 2026-09-25.
// A null means that book's path isn't verified yet; the league still runs on the other book.
export const LEAGUES = {
    nfl: { name: 'NFL', sport: 'football', pinnacle: 889, bovada: 'football/nfl' },
    ncaaf: { name: 'NCAA Football', sport: 'football', pinnacle: 880, bovada: 'football/college-football' },
    nba: { name: 'NBA', sport: 'basketball', pinnacle: 487, bovada: 'basketball/nba' },
    wnba: { name: 'WNBA', sport: 'basketball', pinnacle: 578, bovada: 'basketball/wnba' },
    ncaab: { name: 'NCAA Basketball', sport: 'basketball', pinnacle: 493, bovada: 'basketball/college-basketball' },
    mlb: { name: 'MLB', sport: 'baseball', pinnacle: 246, bovada: 'baseball/mlb' },
    nhl: { name: 'NHL', sport: 'hockey', pinnacle: 1456, bovada: 'hockey/nhl' },
    epl: { name: 'English Premier League', sport: 'soccer', pinnacle: 1980, bovada: 'soccer/europe/england/premier-league' },
    'serie-a': { name: 'Italy Serie A', sport: 'soccer', pinnacle: 2436, bovada: 'soccer/europe/italy/serie-a' },
    'la-liga': { name: 'Spain La Liga', sport: 'soccer', pinnacle: 2196, bovada: null },
    bundesliga: { name: 'Germany Bundesliga', sport: 'soccer', pinnacle: 1842, bovada: null },
    mls: { name: 'MLS', sport: 'soccer', pinnacle: 2663, bovada: null },
    ucl: { name: 'UEFA Champions League', sport: 'soccer', pinnacle: 2627, bovada: null },
    ufc: { name: 'UFC', sport: 'mma', pinnacle: 1624, bovada: null },
};
