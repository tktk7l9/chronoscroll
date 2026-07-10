import { isoOf } from './timescale.ts';
import type { ChunkMeta } from './types.ts';

/**
 * day範囲（fromDay=新しい側）に交差するチャンクのキーを新しい順に返す。
 * チャンクの粒度（十年/5年）は index.json のメタが決める。
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
