/**
 * Preload the app's JavaScript at low priority (applied to every prerendered page by src/hooks.server.ts).
 *
 * The first paint needs only the HTML and the stylesheet; the bundle is needed later, for the first cards, which
 * also wait for the overview data. With `fetchpriority="low"` the browser still requests the bundle at once, in
 * parallel with that data, but gives the stylesheet the bandwidth first. Lighthouse's simulation treats a
 * high-priority script that finishes before the first paint as render-blocking, which this also avoids
 * (mobile FCP of the timeline page 1.65 s → 1.2 s in a local Lighthouse 13.5 run).
 */
const MODULEPRELOAD = /<link\b[^>]*\brel="modulepreload"[^>]*>/g;

export function lowerModulePreloadPriority(html: string): string {
	return html.replace(MODULEPRELOAD, (tag) =>
		/\bfetchpriority=/.test(tag) ? tag : tag.replace(/\s*\/?>$/, ' fetchpriority="low">'),
	);
}
