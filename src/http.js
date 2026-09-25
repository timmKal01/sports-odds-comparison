// Polite HTTP: an honest User-Agent, per-host request spacing, and bounded
// backoff on 429/5xx. A book that keeps refusing is skipped, never worked around.

export const USER_AGENT = 'sports-odds-comparison/0.1 (+https://apify.com/m_ctim/sports-odds-comparison)';

// Bovada rate-limits bursts (HTTP 429 after ~8 quick calls, with no Retry-After),
// so its calls are serialised and spaced out. Pinnacle tolerates normal pacing.
const MIN_GAP_MS = { 'www.bovada.lv': 3000, 'guest.api.arcadia.pinnacle.com': 400 };
const lastCallAt = new Map();
const hostQueues = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function throttle(host) {
    const gap = MIN_GAP_MS[host] ?? 500;
    const prev = hostQueues.get(host) ?? Promise.resolve();
    const next = prev.then(async () => {
        const wait = (lastCallAt.get(host) ?? 0) + gap - Date.now();
        if (wait > 0) await sleep(wait);
        lastCallAt.set(host, Date.now());
    });
    hostQueues.set(host, next.catch(() => {}));
    return next;
}

export class BlockedError extends Error {}

export async function fetchJson(url, { attempts = 3, timeoutMs = 25000 } = {}) {
    const host = new URL(url).host;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        await throttle(host);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let res;
        try {
            res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: controller.signal });
        } catch (err) {
            lastError = err.name === 'AbortError' ? new Error(`${host} timed out after ${timeoutMs}ms`) : err;
            if (attempt < attempts) await sleep(2000 * attempt);
            continue;
        } finally {
            clearTimeout(timer);
        }

        if (res.ok) return res.json();
        if (res.status === 401 || res.status === 403) {
            // A refusal, not a hiccup: stop rather than try another route in.
            throw new BlockedError(`${host} refused the request (HTTP ${res.status})`);
        }
        lastError = new Error(`${host} returned HTTP ${res.status}`);
        if (res.status !== 429 && res.status < 500) throw lastError;
        if (attempt < attempts) {
            const retryAfter = Number(res.headers.get('retry-after'));
            await sleep(retryAfter > 0 ? retryAfter * 1000 : 4000 * 2 ** (attempt - 1));
        }
    }
    throw lastError;
}
