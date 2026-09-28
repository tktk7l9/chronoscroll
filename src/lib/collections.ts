/**
 * Front-end helpers for collections (themed reading lists that group events).
 * The actual data is assembled at build time (pipeline/lib/collections.ts), so
 * this only holds pure computations around URLs and link generation.
 */
import { clampPxPerDay, dayOf } from './timescale.ts';

/** The slug used in URLs. Used for both /c/<slug> and ?k=<slug> */
const SLUG_RE = /^[a-z0-9-]+$/;

/** Slug validation with a length limit. URL parameters can be anything, so always run it */
export function isCollectionSlug(value: string): boolean {
	return value.length > 0 && value.length <= 64 && SLUG_RE.test(value);
}

export function collectionDetailPath(slug: string): string {
	return `/data/collections/${slug}.json`;
}

export function collectionPath(slug: string): string {
	return `/c/${slug}`;
}

/** Height (px) we want the whole collection period to fit in, roughly 3 screens. Numerator of fitZoom */
export const TARGET_SPAN_PX = 2600;

/**
 * Compute the initial zoom (px/day) at which the collection period fits on screen.
 * The viewport height is unknown during SSR, so derive it from a fixed target height and clamp.
 */
export function fitZoom(fromDate: string, toDate: string): number {
	const spanDays = dayOf(toDate) - dayOf(fromDate);
	if (spanDays <= 0) return clampPxPerDay(TARGET_SPAN_PX);
	return clampPxPerDay(TARGET_SPAN_PX / spanDays);
}

/**
 * URL opened from the collection page via 「年表で通して見る」 (view it on the timeline).
 * Land on the latest event rather than the middle of the period (collections skip across eras, so the middle
 * can fall in an empty band. Matching the top = present, scroll-down-into-the-past motion reliably shows content).
 */
export function timelineHref(slug: string, fromDate: string, toDate: string): string {
	const z = Math.round(fitZoom(fromDate, toDate) * 10000) / 10000;
	return `/?k=${slug}&t=${toDate}&z=${z}`;
}
