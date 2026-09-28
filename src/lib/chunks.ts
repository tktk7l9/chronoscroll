import { dayOf, isoOf } from './timescale.ts';
import type { ChunkMeta } from './types.ts';

/**
 * Return the keys of chunks that intersect the day range (fromDay = the newer side), newest first.
 * The chunk granularity (decade / 5 years) is determined by the metadata in index.json.
 */
export function chunkKeysInRange(
	chunks: readonly ChunkMeta[],
	fromDay: number,
	toDay: number,
): string[] {
	const newestYear = Number(isoOf(Math.floor(fromDay)).slice(0, 4));
	const oldestYear = Number(isoOf(Math.floor(toDay)).slice(0, 4));
	return chunks
		.filter((c) => c.fromYear <= newestYear && c.toYear >= oldestYear)
		.sort((a, b) => b.fromYear - a.fromYear)
		.map((c) => c.key);
}

/**
 * The "local" event density (events/day) in the visible range.
 *
 * The LOD threshold is driven by density, but the actual density varies 12x by decade, from 0.14 in the 1870s to 1.67 in the 2020s.
 * Using the all-time average makes the Meiji era sparse and the 2000s onward overcrowded, so
 * derive the density of the range currently in view from the per-chunk counts index.json already has.
 *
 * Parts that extend beyond the covered range are not counted in the denominator (diluting it with the side that has no data
 * would push the threshold too low). Returns 0 for a range with no data at all.
 */
export function eventsPerDayInRange(
	chunks: readonly ChunkMeta[],
	fromDay: number,
	toDay: number,
): number {
	let events = 0;
	let coveredDays = 0;
	for (const c of chunks) {
		const chunkFrom = dayOf(`${c.fromYear}-01-01`);
		const chunkTo = dayOf(`${c.toYear + 1}-01-01`);
		const overlap = Math.min(chunkTo, fromDay) - Math.max(chunkFrom, toDay);
		if (overlap <= 0) continue;
		events += c.count * (overlap / (chunkTo - chunkFrom));
		coveredDays += overlap;
	}
	return coveredDays > 0 ? events / coveredDays : 0;
}
