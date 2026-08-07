import { dayOf, isoOf } from './timescale.ts';
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

/**
 * 可視範囲の「局所」イベント密度（件/日）。
 *
 * LODの閾値は密度で決まるが、実際の密度は十年ごとに1870年代0.14〜2020年代1.67と
 * 12倍違う。全期間平均を使うと明治期はスカスカ・2000年代以降は詰まりすぎになるため、
 * index.json が既に持っているチャンクごとの件数から、いま見ている範囲の密度を出す。
 *
 * 収録範囲の外へはみ出した部分は分母に数えない（データの無い側で薄まると
 * 閾値が下がりすぎるため）。データが1件も無い範囲では0を返す。
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
