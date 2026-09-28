/**
 * Summary of the covered data (total count, covered period) and a formatter for event dates.
 * The period comes from static/data/index.json and is fixed at build time and baked into the SSR HTML.
 */
import type { Precision } from './types.ts';

/**
 * 27014 → "27,014".
 * Intl/toLocaleString is not used because differences in ICU data between SSR (Node) and the client (browser)
 * could shift the digit grouping and cause a hydration mismatch.
 */
export function formatCount(n: number): string {
	return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** ISO yyyy-mm-dd → 「1868年1月1日」 (zero padding of month and day removed) */
export function formatJpDate(iso: string): string {
	const [y, m, d] = iso.split('-');
	return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}

/**
 * Date label of an event. Events with coarse precision do not show the padded 01
 * (month → 「1963年1月」, year → 「1963年」).
 */
export function formatEventDate(iso: string, precision: Precision): string {
	const [y, m, d] = iso.split('-');
	if (precision === 'year') return `${Number(y)}年`;
	if (precision === 'month') return `${Number(y)}年${Number(m)}月`;
	return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}
