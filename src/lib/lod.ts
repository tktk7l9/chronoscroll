/**
 * Semantic-zoom LOD (level of detail).
 * importance is a within-decade percentile (0-100, nearly uniform), so
 * the threshold that keeps "the on-screen event density constant" can be computed continuously.
 */
import { MAX_PX_PER_DAY, MIN_PX_PER_DAY } from './timescale.ts';

/** Vertical px to reserve per displayed event (smaller shows more densely) */
const MIN_PX_PER_EVENT = 110;

/**
 * Minimum importance included in overview.json.
 * The single value that both the pipeline (generating overview.json) and the front end (deciding to suppress
 * chunk prefetch until the threshold drops below it) refer to and must agree on.
 */
export const OVERVIEW_MIN_IMPORTANCE = 97;

/**
 * Minimum importance to show at this zoom (px/day).
 * fraction = share of events to show = (pxPerDay / minPxPerEvent) / eventsPerDay
 *
 * eventsPerDay is capped at the level where "fraction reaches 1 at maximum zoom".
 * After switching to passing the local density of the visible range, in the 2020s (about 1.67 events/day) the threshold
 * only dropped to about 48 even at maximum zoom, and roughly the lower half was never shown at any zoom or
 * scroll position. Thinning of dense stretches is handled by capDensity;
 * this guarantees that "zooming in far enough always shows it".
 */
export function importanceThreshold(
	pxPerDay: number,
	eventsPerDay: number,
	minPxPerEvent = MIN_PX_PER_EVENT,
): number {
	if (eventsPerDay <= 0) return 0;
	const density = Math.min(eventsPerDay, MAX_PX_PER_DAY / minPxPerEvent);
	const fraction = pxPerDay / minPxPerEvent / density;
	const threshold = 100 * (1 - fraction);
	return Math.min(100, Math.max(0, threshold));
}

export type ZoomLevel = '概観' | '十年' | '年' | '月' | '日';

/** Display name of the zoom level (judged by px/day band) */
export function zoomLevelLabel(pxPerDay: number): ZoomLevel {
	if (pxPerDay < 0.15) return '概観';
	if (pxPerDay < 1.2) return '十年';
	if (pxPerDay < 8) return '年';
	if (pxPerDay < 40) return '月';
	return '日';
}

/** For the zoom gauge: pxPerDay → 0..1 (log scale, 0 = min zoom/overview, 1 = max zoom/day) */
export function zoomToT(pxPerDay: number): number {
	const lo = Math.log(MIN_PX_PER_DAY);
	const hi = Math.log(MAX_PX_PER_DAY);
	return Math.min(1, Math.max(0, (Math.log(pxPerDay) - lo) / (hi - lo)));
}

/** For the zoom gauge: 0..1 → pxPerDay */
export function tToZoom(t: number): number {
	const lo = Math.log(MIN_PX_PER_DAY);
	const hi = Math.log(MAX_PX_PER_DAY);
	return Math.exp(lo + Math.min(1, Math.max(0, t)) * (hi - lo));
}

/** Gauge ticks: a representative value per zoom level (log center of the level band) */
export const ZOOM_STOPS: readonly { label: ZoomLevel; pxPerDay: number }[] = [
	{ label: '概観', pxPerDay: 0.077 },
	{ label: '十年', pxPerDay: 0.42 },
	{ label: '年', pxPerDay: 3.1 },
	{ label: '月', pxPerDay: 17.9 },
	{ label: '日', pxPerDay: 62 },
] as const;

/** Tick step (years). 50 → 10 → 5 → 1 years depending on zoom */
export function tickStepYears(pxPerDay: number): number {
	const pxPerYear = pxPerDay * 365.25;
	if (pxPerYear >= 180) return 1;
	if (pxPerYear >= 40) return 5;
	if (pxPerYear >= 18) return 10;
	return 50;
}

/** Average month length in days, for the month tick spacing */
const DAYS_PER_MONTH = 365.25 / 12;

/**
 * Month tick step (months). 0 = no month ticks (year ticks only), 3 = quarters, 1 = every month.
 * At month/day zoom a single year spans several screens, so without these the only
 * orientation cue on screen is the date printed on each card (SHIG 59, 76, 12).
 */
export function tickStepMonths(pxPerDay: number): 0 | 1 | 3 {
	const pxPerMonth = pxPerDay * DAYS_PER_MONTH;
	if (pxPerMonth >= 180) return 1;
	if (pxPerMonth >= 60) return 3;
	return 0;
}

/**
 * Whether the detailed data of decade/5-year chunks actually contributes to the screen at this zoom.
 * overview.json shows nothing additional until importanceThreshold drops below OVERVIEW_MIN_IMPORTANCE,
 * so until then fetching chunks is pure waste
 * (this covers the whole overview-to-decade zoom range; measured at 8 chunks, about 2.5 MB of wasted fetches).
 */
export function needsChunkData(
	pxPerDay: number,
	eventsPerDay: number,
	overviewMinImportance = OVERVIEW_MIN_IMPORTANCE,
): boolean {
	return importanceThreshold(pxPerDay, eventsPerDay) < overviewMinImportance;
}
