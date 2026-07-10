import { isoOf } from './timescale.ts';

export function decadeKeyOfYear(year: number): string {
	return `${Math.floor(year / 10) * 10}s`;
}

/**
 * day範囲（fromDay=新しい側）に交差する十年チャンクのキーを新しい順に返す。
 * available が与えられたら実在するチャンクに絞る。
 */
export function decadeKeysInRange(
	fromDay: number,
	toDay: number,
	available?: ReadonlySet<string>,
): string[] {
	const newestYear = Number(isoOf(Math.floor(fromDay)).slice(0, 4));
	const oldestYear = Number(isoOf(Math.floor(toDay)).slice(0, 4));
	const keys: string[] = [];
	for (let d = Math.floor(newestYear / 10) * 10; d >= Math.floor(oldestYear / 10) * 10; d -= 10) {
		const key = `${d}s`;
		if (available === undefined || available.has(key)) keys.push(key);
	}
	return keys;
}
