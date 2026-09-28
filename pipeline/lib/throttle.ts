/** Return the wait in milliseconds needed to keep the minimum interval since the last run (IO lives on the run side) */
export function nextDelay(lastAt: number, now: number, minIntervalMs: number): number {
	const elapsed = now - lastAt;
	return elapsed >= minIntervalMs ? 0 : minIntervalMs - elapsed;
}

const RETRY_MAX_ATTEMPTS = 6;
const RETRY_BASE_MS = 2000;
const RETRY_CAP_MS = 60_000;
const RETRY_AFTER_CAP_MS = 120_000;

/**
 * Wait in milliseconds after 429/503/maxlag. attempt starts at 0.
 * Exponential backoff (2s × 3^n, max 60s) up to 6 times. If the server returns Retry-After (seconds),
 * prefer that (max 120s). Returns null when giving up.
 * Extracted as a pure function with no IO because the 2026-09-01 monthly update failed,
 * losing to ja.wikipedia's 429 with "3 retries of 1/3/9 seconds".
 */
export function retryDelayMs(attempt: number, retryAfterSec?: number): number | null {
	if (attempt >= RETRY_MAX_ATTEMPTS) return null;
	const backoff = Math.min(RETRY_BASE_MS * 3 ** attempt, RETRY_CAP_MS);
	if (retryAfterSec !== undefined && Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
		return Math.max(backoff, Math.min(retryAfterSec * 1000, RETRY_AFTER_CAP_MS));
	}
	return backoff;
}

/**
 * Whether retrying the error makes sense. Rate limits (429), overload (503/maxlag), and network drops
 * go through if we wait, so retry them. API errors such as missing pages (missingtitle) and 4xx
 * are the same no matter how often they are sent, so give up immediately (the 2026-09-27 monthly update
 * burned 2 hours retrying 36 missing year pages 6 times each with up to 60s waits).
 */
export function isRetryableError(message: string): boolean {
	if (/^HTTP (429|503)\b/.test(message)) return true;
	if (/^HTTP \d{3}\b/.test(message)) return false;
	if (message.startsWith('API error:')) return false;
	if (message === 'maxlag') return true;
	// fetch failures (fetch failed / ECONNRESET / timeout / aborted, etc.) are all treated as network errors
	return true;
}
