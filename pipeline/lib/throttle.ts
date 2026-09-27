/** 前回実行時刻から最低間隔を守るために必要な待機ミリ秒を返す（IOはrun側） */
export function nextDelay(lastAt: number, now: number, minIntervalMs: number): number {
	const elapsed = now - lastAt;
	return elapsed >= minIntervalMs ? 0 : minIntervalMs - elapsed;
}

const RETRY_MAX_ATTEMPTS = 6;
const RETRY_BASE_MS = 2000;
const RETRY_CAP_MS = 60_000;
const RETRY_AFTER_CAP_MS = 120_000;

/**
 * 429/503/maxlag 後の待機ミリ秒。attempt は 0 始まり。
 * 指数バックオフ（2秒×3^n・上限60秒）で 6 回まで。サーバーが Retry-After（秒）を返したら
 * そちらを優先する（上限120秒）。諦めるときは null。
 * 2026-09-01 の月次更新が「1/3/9秒の3回」で ja.wikipedia の 429 に負けて落ちたため、
 * IO を持たない純関数として切り出した。
 */
export function retryDelayMs(attempt: number, retryAfterSec?: number): number | null {
	if (attempt >= RETRY_MAX_ATTEMPTS) return null;
	const backoff = Math.min(RETRY_BASE_MS * 3 ** attempt, RETRY_CAP_MS);
	if (retryAfterSec !== undefined && Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
		return Math.max(backoff, Math.min(retryAfterSec * 1000, RETRY_AFTER_CAP_MS));
	}
	return backoff;
}
