/**
 * 時間↔ピクセルの変換。上=現在・下=過去の縦タイムライン。
 * 時間は「エポックからの日数」(day number) で扱う。
 */

const MS_PER_DAY = 86_400_000;

/** ズーム下限/上限 (px/日)。下限=全期間の概観、上限=日レベル */
export const MIN_PX_PER_DAY = 0.04;
export const MAX_PX_PER_DAY = 96;

export interface TimeScale {
	/** 表示範囲の最古日 (day number) */
	minDay: number;
	/** 表示範囲の最新日 (day number) */
	maxDay: number;
	pxPerDay: number;
	padTop: number;
	padBottom: number;
}

/** ISO日付 → day number */
export function dayOf(iso: string): number {
	const [y, m, d] = iso.split('-').map(Number);
	return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/** day number → ISO日付 */
export function isoOf(day: number): string {
	return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function clampPxPerDay(v: number): number {
	return Math.min(MAX_PX_PER_DAY, Math.max(MIN_PX_PER_DAY, v));
}

/** day → コンテンツ座標y（新しいほど上） */
export function dayToY(scale: TimeScale, day: number): number {
	return scale.padTop + (scale.maxDay - day) * scale.pxPerDay;
}

/** コンテンツ座標y → day（小数点以下も保持） */
export function yToDay(scale: TimeScale, y: number): number {
	return scale.maxDay - (y - scale.padTop) / scale.pxPerDay;
}

export function totalHeight(scale: TimeScale): number {
	return scale.padTop + (scale.maxDay - scale.minDay) * scale.pxPerDay + scale.padBottom;
}

export interface ZoomResult {
	scale: TimeScale;
	scrollTop: number;
}

/**
 * ビューポート内の1点（anchorViewportY）が指す日時を保ったままズームする。
 * ネイティブスクロールと併用するため、新しい scrollTop も返す。
 */
export function zoomAt(
	scale: TimeScale,
	scrollTop: number,
	anchorViewportY: number,
	newPxPerDay: number,
): ZoomResult {
	const clamped = clampPxPerDay(newPxPerDay);
	const anchorDay = yToDay(scale, scrollTop + anchorViewportY);
	const next = { ...scale, pxPerDay: clamped };
	const newScrollTop = dayToY(next, anchorDay) - anchorViewportY;
	return { scale: next, scrollTop: Math.max(0, newScrollTop) };
}

/** スクロール位置とビューポート高から、可視のday範囲を返す（新しい順: fromDay > toDay） */
export function visibleDayRange(
	scale: TimeScale,
	scrollTop: number,
	viewportHeight: number,
): { fromDay: number; toDay: number } {
	return {
		fromDay: yToDay(scale, scrollTop),
		toDay: yToDay(scale, scrollTop + viewportHeight),
	};
}
