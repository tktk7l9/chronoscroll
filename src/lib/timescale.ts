/**
 * Time ↔ pixel conversion. A vertical timeline with top = present and bottom = past.
 * Time is handled as "days since the epoch" (day number).
 */

const MS_PER_DAY = 86_400_000;

/** Min/max zoom (px/day). Min = overview of the whole period, max = day level */
export const MIN_PX_PER_DAY = 0.04;
export const MAX_PX_PER_DAY = 96;

export interface TimeScale {
	/** Oldest day of the display range (day number) */
	minDay: number;
	/** Newest day of the display range (day number) */
	maxDay: number;
	pxPerDay: number;
	padTop: number;
	padBottom: number;
}

/** ISO date → day number */
export function dayOf(iso: string): number {
	const [y, m, d] = iso.split('-').map(Number);
	return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/** day number → ISO date */
export function isoOf(day: number): string {
	return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function clampPxPerDay(v: number): number {
	return Math.min(MAX_PX_PER_DAY, Math.max(MIN_PX_PER_DAY, v));
}

/** day → content y coordinate (newer is higher) */
export function dayToY(scale: TimeScale, day: number): number {
	return scale.padTop + (scale.maxDay - day) * scale.pxPerDay;
}

/** Content y coordinate → day (keeps the fractional part) */
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
 * Zoom while keeping the date pointed to by one point in the viewport (anchorViewportY).
 * Used together with native scrolling, so it also returns the new scrollTop.
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

/** Return the visible day range from the scroll position and viewport height (newest first: fromDay > toDay) */
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
