import type { NewsEvent } from './types.ts';
import { dayOf } from './timescale.ts';
import type { FilterState } from './filters.ts';
import { matchesFilter } from './filters.ts';

/** Event with a precomputed day number. Kept in descending day order (newest → oldest) */
export interface EventPoint {
	ev: NewsEvent;
	day: number;
}

/** Turn the event list into EventPoint[] in descending day order (newest first) */
export function toPoints(events: readonly NewsEvent[]): EventPoint[] {
	return events
		.map((ev) => ({ ev, day: dayOf(ev.date) }))
		.sort((a, b) => (a.day === b.day ? (a.ev.id < b.ev.id ? -1 : 1) : b.day - a.day));
}

/** In the descending-day array, the first index with day <= fromDay */
export function firstIndexAtOrBelow(points: readonly EventPoint[], fromDay: number): number {
	let lo = 0;
	let hi = points.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (points[mid].day > fromDay) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/**
 * Thin further by a cap on pixel density.
 * The LOD threshold is based on the overall average density, so in stretches where events cluster in time
 * cards get pushed far from their ideal positions. Accept in order of importance and
 * do not exceed maxPerBand events within minPx vertically.
 */
export function capDensity(
	points: readonly EventPoint[],
	pxPerDay: number,
	minPx: number,
	maxPerBand: number,
	pinnedId?: string,
): EventPoint[] {
	const prio = (p: EventPoint): number => (p.ev.id === pinnedId ? Infinity : p.ev.importance);
	const byImportance = [...points].sort((a, b) => prio(b) - prio(a));
	const acceptedYs: number[] = [];
	const accepted = new Set<EventPoint>();
	for (const p of byImportance) {
		const y = -p.day * pxPerDay;
		let near = 0;
		for (const ay of acceptedYs) {
			if (Math.abs(ay - y) < minPx) near++;
		}
		if (near >= maxPerBand) continue;
		acceptedYs.push(y);
		accepted.add(p);
	}
	return points.filter((p) => accepted.has(p));
}

/**
 * Return events within the visible range [toDay, fromDay] (fromDay is the newer side) with importance >= threshold
 * that match the filter.
 * The pinnedId event is included if within range regardless of threshold and filter (guarantees the search jump target).
 */
export function queryVisible(
	points: readonly EventPoint[],
	fromDay: number,
	toDay: number,
	threshold: number,
	filter: FilterState,
	pinnedId?: string,
): EventPoint[] {
	const out: EventPoint[] = [];
	for (let i = firstIndexAtOrBelow(points, fromDay); i < points.length; i++) {
		const p = points[i];
		if (p.day < toDay) break;
		if (
			p.ev.id === pinnedId ||
			(p.ev.importance >= threshold && matchesFilter(p.ev, filter))
		) {
			out.push(p);
		}
	}
	return out;
}
