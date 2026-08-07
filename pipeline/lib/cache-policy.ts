/**
 * 年ページ wikitext のキャッシュ方針。
 *
 * 年ページは過去の年でも編集され続けるが、内容が実質固まるのは翌々年あたり。
 * 一方、当年のページは日々できごとが追記されるため、キャッシュを使うと
 * 「取得した日以降のできごとが永久に載らない」状態になる（実際に起きた）。
 * 前年も、12月のできごとが年明けに追記されるので同じ扱いにする。
 */

/** この年の wikitext はキャッシュを無視して取り直すべきか（today は ISO 日付） */
export function isVolatileYear(year: number, today: string): boolean {
	return year >= Number(today.slice(0, 4)) - 1;
}
