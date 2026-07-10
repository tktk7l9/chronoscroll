/** 前回実行時刻から最低間隔を守るために必要な待機ミリ秒を返す（IOはrun側） */
export function nextDelay(lastAt: number, now: number, minIntervalMs: number): number {
	const elapsed = now - lastAt;
	return elapsed >= minIntervalMs ? 0 : minIntervalMs - elapsed;
}
