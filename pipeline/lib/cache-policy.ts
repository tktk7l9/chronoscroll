/**
 * Caching policy for year-page wikitext.
 *
 * Year pages keep being edited even for past years, but their content settles around two years later.
 * On the other hand, events are appended to the current year's page daily, so using the cache
 * leads to "events after the fetch date never show up" (this actually happened).
 * The previous year gets the same treatment, since December events are appended after New Year.
 */

/** Whether this year's wikitext should ignore the cache and be refetched (today is an ISO date) */
export function isVolatileYear(year: number, today: string): boolean {
	return year >= Number(today.slice(0, 4)) - 1;
}
