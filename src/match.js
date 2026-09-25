// Joins the same game across books. Books spell teams differently, mostly in
// soccer ("Tottenham Hotspur" vs "Tottenham"), so names are compared on tokens,
// and both teams plus a close start time must agree before two events are merged.

const FILLER = new Set(['fc', 'afc', 'cf', 'sc', 'ac', 'the', 'club', 'de', 'of', 'and']);

export function nameTokens(name) {
    return new Set(
        name.normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')
            .split(/\s+/).filter((t) => t && !FILLER.has(t))
    );
}

export function sameTeam(a, b) {
    const ta = nameTokens(a);
    const tb = nameTokens(b);
    if (!ta.size || !tb.size) return false;
    const shared = [...ta].filter((t) => tb.has(t)).length;
    // Every token of the shorter name must appear in the longer one ("Tottenham" in
    // "Tottenham Hotspur"). A looser overlap score merged "New York Jets" with
    // "New York Giants"; a missed match is far safer than prices on the wrong game.
    return shared === Math.min(ta.size, tb.size);
}

const MAX_START_GAP_MS = 3 * 3600 * 1000;

/** Groups book events into games. Returns [{ primary, byBook: { pinnacle, bovada } }]. */
export function matchEvents(events) {
    const games = [];
    // Pinnacle first so its team names become the canonical ones.
    const ordered = [...events].sort((a, b) => (a.book === 'pinnacle' ? -1 : 0) - (b.book === 'pinnacle' ? -1 : 0));
    for (const ev of ordered) {
        const t = Date.parse(ev.startTime);
        const game = games.find((g) => g.primary.league === ev.league
            && !g.byBook[ev.book]
            && Math.abs(Date.parse(g.primary.startTime) - t) <= MAX_START_GAP_MS
            && sameTeam(g.primary.homeTeam, ev.homeTeam)
            && sameTeam(g.primary.awayTeam, ev.awayTeam));
        if (game) game.byBook[ev.book] = ev;
        else games.push({ primary: ev, byBook: { [ev.book]: ev } });
    }
    return games;
}
